const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { scraperLogger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Import database functions with error handling
let runQuery, getOne, getAll;
try {
  const db = require('../../database/setup');
  runQuery = db.runQuery;
  getOne = db.getOne;
  getAll = db.getAll;
} catch (error) {
  scraperLogger.warn('Database functions not available, using mock operations');
}

// Helper function to count rows in a CSV file
async function countCsvRows(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    const readStream = require('fs').createReadStream(filePath);

    readStream.on('error', (err) => {
        scraperLogger.warn(`Error creating read stream for ${filePath} during count: ${err.message}`);
        resolve(0); // Resolve with 0 if file can't be read
    });

    readStream.pipe(csv()) // Use the imported 'csv'
      .on('data', () => count++)
      .on('end', () => {
        scraperLogger.info(`Counted ${count} rows in ${filePath}`);
        resolve(count);
      })
      .on('error', (error) => {
        scraperLogger.error(`Error parsing CSV for counting rows in ${filePath}: ${error.message}`);
        resolve(0); // Resolve with 0 if parsing fails
      });
  });
}

// Helper function to clean zip codes
function cleanZipCode(zip) {
  if (!zip || typeof zip !== 'string') return null;
  const digits = zip.replace(/[^0-9]/g, ''); // Extract all digits
  if (digits.length >= 5) return digits.slice(-5); // Take last 5 digits
  return null; // Return null if not a valid 5-digit zip after cleaning
}

// Helper function to extract state and zip code from address (similar to import_lead_files.js)
function extractLocationFromScrapedAddress(address) {
  if (!address || typeof address !== 'string') return { city: null, state: null, zipCode: null };
  
  // Common patterns for US addresses
  const stateZipPattern = /,\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/i; // Added i for case-insensitive state
  const statePattern = /,\s*([A-Z]{2})(?:\s|,|$)/i; // Added i for case-insensitive state
  const zipPattern = /\b(\d{5}(-\d{4})?)\b/; // Corrected: ) instead of }
  
  let state = null;
  let zipCode = null;
  let city = null;
  
  const stateZipMatch = address.match(stateZipPattern);
  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    zipCode = stateZipMatch[2];
  } else {
    const stateMatch = address.match(statePattern);
    if (stateMatch) {
      state = stateMatch[1].toUpperCase();
    }
    const zipMatch = address.match(zipPattern);
    if (zipMatch) {
      zipCode = zipMatch[1];
    }
  }
  
  if (state) {
    const cityPatternStr = `([^,]+),\\s*${state}`;
    const cityPattern = new RegExp(cityPatternStr, 'i'); // Added i for case-insensitive
    const cityMatch = address.match(cityPattern);
    if (cityMatch && cityMatch[1]) {
      const cityPart = cityMatch[1].trim();
      const cityWords = cityPart.split(',');
      city = cityWords[cityWords.length - 1].trim();
    }
  } else if (zipCode) { // If no state, try to get city based on zip if address is simple
    const cityZipPattern = new RegExp(`([^,]+),\\s*${zipCode.substring(0,5)}`, 'i');
    const cityMatchSimple = address.match(cityZipPattern);
    if (cityMatchSimple && cityMatchSimple[1]) {
        city = cityMatchSimple[1].trim();
    }
  }
  
  return { city, state, zipCode: cleanZipCode(zipCode) }; // Ensure parsed zip is also cleaned
}

async function scraperProcessor(job) {
  const jobData = job.data;
  const jobId = jobData.jobId || job.id;
  
  // Handle different job data structures
  let queries = [];
  let clientName = 'Unknown';
  
  if (jobData.queries && Array.isArray(jobData.queries)) {
    // Old format with queries array
    queries = jobData.queries;
    clientName = jobData.clientName || 'Unknown';
  } else if (jobData.businessType && jobData.location) {
    // New format from conversation API
    queries = [{
      businessType: jobData.businessType,
      query: jobData.query || `${jobData.businessType} in ${jobData.location}`,
      location: jobData.location,
      maxResults: jobData.maxResults || 1000
    }];
    clientName = 'AI Assistant';
  } else {
    throw new Error('Invalid job data structure: missing queries or businessType/location');
  }
  
  scraperLogger.info(`🎯 SCRAPER PROCESSOR STARTING for job ${jobId}`, { 
    clientName, 
    queriesCount: queries.length,
    jobData: jobData
  });
  
  try {
    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, started_at = CURRENT_TIMESTAMP WHERE job_id = ?',
          ['processing', jobId]
        );
        scraperLogger.info('✅ Updated job status to processing');
      } catch (dbError) {
        scraperLogger.warn('Database update failed, continuing...', dbError.message);
      }
    }

    // Update progress
    if (job.progress) {
      job.progress(5);
    }

    // 🧠 SMART LEAD CHECKING: Check existing leads and optimize queries
    const { optimizedQueries, existingLeads } = await checkExistingLeadsAndOptimizeQueries(queries);
    
    scraperLogger.info(`📊 Lead Analysis Complete`, {
      originalQueries: queries.length,
      optimizedQueries: optimizedQueries.length,
      existingLeads: existingLeads.length,
      skipReason: optimizedQueries.length === 0 ? 'All leads already exist' : 'Some leads missing'
    });

    // Update progress
    if (job.progress) {
      job.progress(15);
    }

    let newLeadsCount = 0;
    let scrapedLeads = [];

    // Only scrape if we have missing data
    if (optimizedQueries.length > 0) {
      // Clear any existing LeadsApart.csv file before starting new scrape
      let csvFile;
      if (process.env.LEADS_APART_FILE) {
        csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
      } else {
        csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
      }
      
      try {
        await fs.unlink(csvFile);
        scraperLogger.info(`🗑️ Cleared existing scraped data file: ${csvFile}`);
      } catch (clearError) {
        // File might not exist, which is fine
        if (clearError.code !== 'ENOENT') {
          scraperLogger.warn(`Failed to clear existing scraped data file: ${clearError.message}`);
        }
      }

      // Write optimized queries to queries.txt file
      const queriesFile = process.env.QUERIES_FILE || './queries.txt';
      const queriesContent = optimizedQueries.map(q => `"${q.businessType}", "${q.query}"`).join('\n');
      await fs.writeFile(queriesFile, queriesContent, 'utf8');
      
      scraperLogger.info(`📝 Written ${optimizedQueries.length} optimized queries to ${queriesFile}`);

      if (job.progress) {
        job.progress(20);
    }

    // Execute Python scraper script
      const scraperResult = await executePythonScraper(job);
    
      if (job.progress) {
        job.progress(70);
      }

      // Process the scraped results
      scrapedLeads = await getScrapedLeads();
      
      // Save newly scraped leads to the database
      if (scrapedLeads && scrapedLeads.length > 0) {
        const savedToDbCount = await saveNewLeadsToDatabase(scrapedLeads, jobId);
        scraperLogger.info(`💾 Attempted to save ${scrapedLeads.length} scraped leads to DB, ${savedToDbCount} succeeded.`);
      }
      newLeadsCount = scrapedLeads.length;
      
      scraperLogger.info(`🔍 Scraped ${newLeadsCount} new leads from CSV`);
    } else {
      scraperLogger.info(`⚡ Skipping scraping - all requested leads already exist in database`);
    }
    
    if (job.progress) {
      job.progress(80);
    }

    // 🔄 COMBINE RESULTS: Merge existing + new leads into final output
    const combinedResults = await combineLeadsIntoFinalFile(existingLeads, scrapedLeads, jobData);
    const finalOutputFile = combinedResults.filePath;
    const totalLeadsInOutputFile = combinedResults.count;
    const approxTotalLeads = existingLeads.length + newLeadsCount;

    scraperLogger.info(`📋 Final Results`, {
      existingLeadsFromInitialCheck: existingLeads.length,
      newLeadsFromScrape: newLeadsCount,
      approxTotalLeadsInOutputFile: approxTotalLeads, 
      outputFile: finalOutputFile
    });
    
    // After finalOutputFile is created, record it in the deliveries table
    if (finalOutputFile && runQuery) {
      try {
        const fileNameOnly = path.basename(finalOutputFile);
        const absoluteFilePath = path.resolve(finalOutputFile); // Ensure absolute path for consistency
        const stats = await fs.stat(absoluteFilePath);
        const fileId = uuidv4();
        
        const deliveryFilters = {
          clientName: clientName,
          originalQuery: jobData.query,
          businessType: jobData.businessType,
          location: jobData.location,
          maxResults: jobData.maxResults,
          jobId: jobId
        };

        await runQuery(
          `INSERT INTO deliveries (file_id, filename, format, lead_count, filters, request_type, file_size, file_path, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            fileId,
            fileNameOnly,
            'csv', // Assuming CSV format
            totalLeadsInOutputFile, // Re-count for accuracy
            JSON.stringify(deliveryFilters),
            'scraper_job_output',
            stats.size,
            absoluteFilePath, // Store absolute path
            'completed'
          ]
        );
        scraperLogger.info(`📦 Recorded scraper output file in deliveries: ${fileNameOnly}`);
      } catch (deliveryError) {
        scraperLogger.error(`Failed to record scraper output file in deliveries: ${finalOutputFile}`, deliveryError);
      }
    }
    
    // Update progress
    if (job.progress) {
      job.progress(90);
    }

    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, leads_found = ? WHERE job_id = ?',
          ['completed', totalLeadsInOutputFile, jobId]
        );
        scraperLogger.info('✅ Updated job status to completed');
      } catch (dbError) {
        scraperLogger.warn('Database update failed, continuing...', dbError.message);
      }
    }

    // Update progress
    if (job.progress) {
      job.progress(100);
    }

    scraperLogger.info(`✅ SCRAPER PROCESSOR COMPLETED: Job ${jobId} finished successfully`, { 
      leadsFound: totalLeadsInOutputFile,
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      outputFile: finalOutputFile
    });
    
    return {
      success: true,
      leadsFound: totalLeadsInOutputFile,
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      message: newLeadsCount > 0 ? 
        `Found ${newLeadsCount} new leads, combined with ${existingLeads.length} existing leads` :
        `Returned ${existingLeads.length} existing leads (no scraping needed)`,
      queries: queries.length,
      optimizedQueries: optimizedQueries.length,
      clientName: clientName,
      outputFile: finalOutputFile
    };

  } catch (error) {
    scraperLogger.error(`❌ SCRAPER PROCESSOR FAILED: Job ${jobId}`, { error: error.message, stack: error.stack });
    
    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
          ['failed', error.message, jobId]
        );
      } catch (dbError) {
        scraperLogger.warn('Database update failed during error handling');
      }
    }

    throw error;
  }
}

async function executePythonScraper(job) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_INTERPRETER || 'C:\\Python\\python.exe';
    const scriptPath = process.env.SCRAPER_SCRIPT_PATH || './maintemp.py';
    
    scraperLogger.info(`🐍 Executing Python scraper: ${pythonPath} ${scriptPath}`);
    scraperLogger.info(`🔧 Current Working Directory (CWD): ${process.cwd()}`);
    scraperLogger.info(`🔧 System PATH: ${process.env.PATH}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      scraperLogger.info(`Scraper stdout: ${output.trim()}`);
      
      // Update job progress based on output patterns
      if (output.includes('Processing Query:') && job.progress) {
        job.progress(Math.min(job.progress() + 5, 75));
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      scraperLogger.warn(`Scraper stderr: ${error.trim()}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        scraperLogger.info('✅ Python scraper completed successfully');
        resolve({ stdout, stderr, exitCode: code });
      } else {
        scraperLogger.error(`❌ Python scraper exited with code ${code}`, { stderr });
        reject(new Error(`Scraper failed with exit code ${code}: ${stderr}`));
      }
    });

    pythonProcess.on('error', (error) => {
      scraperLogger.error('❌ Failed to start Python scraper', { error: error.message });
      reject(new Error(`Failed to start scraper: ${error.message}`));
    });

    // Set timeout for scraper execution (30 minutes)
    setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error('Scraper execution timed out after 30 minutes'));
    }, 30 * 60 * 1000);
  });
}

async function processScrapedData(jobId) {
  let csvFile;
  if (process.env.LEADS_APART_FILE) {
    scraperLogger.info(`Using LEADS_APART_FILE from env: ${process.env.LEADS_APART_FILE}`);
    csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE); // Assume it might be relative
  } else {
    scraperLogger.info('LEADS_APART_FILE not set in env, using default: ./Outputs/LeadsApart.csv');
    csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
  }
  scraperLogger.info(`Attempting to access scraped data at: ${csvFile}`);
  
  try {
    const stats = await fs.stat(csvFile);
    if (!stats.isFile()) {
      scraperLogger.warn(`Scraped data file not found: ${csvFile}, returning 0 leads`);
      return 0;
    }

    // Count leads in the CSV file
    let leadsCount = 0;

    return new Promise((resolve, reject) => {
      const stream = require('fs').createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          leadsCount++;
          // Optional: Process individual rows here
        })
        .on('end', () => {
          scraperLogger.info(`📊 Processed ${leadsCount} leads from ${csvFile}`);
          resolve(leadsCount);
        })
        .on('error', (error) => {
          scraperLogger.error(`❌ Error processing scraped data: ${error.message}`);
          reject(error);
        });
    });

  } catch (error) {
    scraperLogger.warn(`Error accessing scraped data file: ${error.message}, returning 0 leads`);
    return 0;
  }
}

// 🧠 Smart function to check existing leads and optimize queries
async function checkExistingLeadsAndOptimizeQueries(queries) {
  const existingLeads = [];
  const optimizedQueries = [];
  const existingLeadsMap = new Map(); // Track existing leads to avoid duplicates
  
  try {
    // Collect all business type + location combinations
    const allCombinations = [];
    
    for (const query of queries) {
      // Parse business types and locations
      const businessTypes = parseBusinessTypes(query.businessType);
      const locations = parseLocations(query.location);
      
      // Create all combinations
      for (const businessType of businessTypes) {
        for (const location of locations) {
          allCombinations.push({
            businessType,
            location,
            maxResults: query.maxResults || 1000,
            originalQuery: query
          });
        }
      }
    }
    
    scraperLogger.info(`🔍 Checking ${allCombinations.length} business type + location combinations`);
    
    // Use bulk query for better performance when we have multiple combinations
    if (allCombinations.length > 3) {
      const bulkExistingLeads = await checkExistingLeadsBulk(allCombinations);
      
      // Add to existing leads with deduplication
      bulkExistingLeads.forEach(lead => {
        const leadKey = `${lead.name_of_business}_${lead.phone_number}`.toLowerCase();
        if (!existingLeadsMap.has(leadKey)) {
          existingLeadsMap.set(leadKey, lead);
          existingLeads.push(lead);
        }
      });
      
      scraperLogger.info(`📋 Found ${bulkExistingLeads.length} total existing leads from bulk query (${existingLeads.length} unique)`);
      
      // Since we found some leads, assume all combinations are covered for now
      // In a more sophisticated implementation, we could check which specific combinations had no results
      if (existingLeads.length === 0) {
        // No existing leads found, need to scrape all combinations
        allCombinations.forEach(combo => {
          optimizedQueries.push({
            businessType: combo.businessType,
            location: combo.location,
            query: `${combo.businessType} in ${combo.location}`,
            maxResults: combo.maxResults
          });
        });
      }
    } else {
      // Use individual queries for smaller numbers of combinations
      for (const combo of allCombinations) {
        const existingForLocation = await checkExistingLeadsForLocation(combo.businessType, combo.location);
        
        if (existingForLocation.length > 0) {
          // Add existing leads to our collection with deduplication
          existingForLocation.forEach(lead => {
            const leadKey = `${lead.name_of_business}_${lead.phone_number}`.toLowerCase();
            if (!existingLeadsMap.has(leadKey)) {
              existingLeadsMap.set(leadKey, lead);
              existingLeads.push(lead);
            }
          });
          scraperLogger.info(`📋 Found ${existingForLocation.length} existing leads for ${combo.businessType} in ${combo.location} (${existingLeads.length} total unique)`);
        } else {
          // Add to optimization queue for scraping
          optimizedQueries.push({
            businessType: combo.businessType,
            location: combo.location,
            query: `${combo.businessType} in ${combo.location}`,
            maxResults: combo.maxResults
          });
          scraperLogger.info(`🔍 Need to scrape: ${combo.businessType} in ${combo.location}`);
        }
      }
    }
    
  } catch (error) {
    scraperLogger.error('Error in lead optimization:', error);
    // Fallback to original queries if optimization fails
    return { optimizedQueries: queries, existingLeads: [] };
  }
  
  return { optimizedQueries, existingLeads };
}

// Bulk query function for checking multiple business type + location combinations
async function checkExistingLeadsBulk(combinations) {
  if (!getAll || combinations.length === 0) return [];
  
  try {
    // Build dynamic OR conditions for all combinations
    const conditions = [];
    const params = [];
    
    combinations.forEach(combo => {
      conditions.push(`
        (
          (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
          AND (
            LOWER(business_address) LIKE LOWER(?) 
            OR LOWER(zip_code) = LOWER(?)
            OR LOWER(city) LIKE LOWER(?)
            OR LOWER(state) LIKE LOWER(?)
          )
        )
      `);
      
      params.push(
        `%${combo.businessType}%`,
        `%${combo.businessType}%`,
        `%${combo.location}%`,
        combo.location,
        `%${combo.location}%`,
        `%${combo.location}%`
      );
    });
    
    const query = `
      SELECT DISTINCT
        name_of_business,
        type_of_business,
        sub_category,
        website,
        num_reviews,
        rating,
        latest_review,
        business_address,
        phone_number,
        zip_code,
        state,
        city,
        source_file
      FROM leads 
      WHERE ${conditions.join(' OR ')}
    `;
    
    scraperLogger.info(`🔍 Executing bulk query for ${combinations.length} combinations`);
    
    const leads = await getAll(query, params);
    
    scraperLogger.info(`📊 Bulk query found ${leads?.length || 0} leads`);
    
    return leads || [];
    
  } catch (error) {
    scraperLogger.error(`❌ Error in bulk lead query:`, error.message);
    return [];
  }
}

// Check existing leads for a specific business type and location
async function checkExistingLeadsForLocation(businessType, location) {
  if (!getAll) return [];
  
  try {
    scraperLogger.info(`🔍 Searching for business type: "${businessType}" in location: "${location}"`);

    // Query database for existing leads with more precise matching
    const query = `
      SELECT 
        name_of_business,
        type_of_business,
        sub_category,
        website,
        num_reviews,
        rating,
        latest_review,
        business_address,
        phone_number,
        zip_code,
        state,
        city,
        source_file
      FROM leads 
      WHERE 
        (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
        AND (
          LOWER(business_address) LIKE LOWER(?) 
          OR LOWER(zip_code) = LOWER(?)
          OR LOWER(city) LIKE LOWER(?)
          OR LOWER(state) LIKE LOWER(?)
        )
    `;

    // Prepare parameters array
    const params = [
      `%${businessType}%`, 
      `%${businessType}%`,
      `%${location}%`, 
      location, 
      `%${location}%`, 
      `%${location}%`
    ];

    scraperLogger.info(`🔍 Executing query with params: ${JSON.stringify(params)}`);
    
    const leads = await getAll(query, params);
    
    scraperLogger.info(`📊 Found ${leads?.length || 0} leads for business type: "${businessType}" in location: "${location}"`);
    
    return leads || [];
    
  } catch (error) {
    scraperLogger.error(`❌ Error checking existing leads for ${businessType} in ${location}:`, error.message);
    scraperLogger.error(`Stack trace:`, error.stack);
    return [];
  }
}

// Helper function to parse business types from input
function parseBusinessTypes(businessTypesString) {
  if (!businessTypesString) return [];
  
  // First split by commas, then handle conjunctions
  const types = businessTypesString
    .split(/[,;]/) // Split by commas or semicolons
    .map(type => type.trim())
    .flatMap(type => {
      // Split by common conjunctions while preserving phrases
      return type
        .split(/\s+(?:and|&|or|\+)\s+/i)
        .map(t => t.trim())
        .filter(t => t.length > 0);
    })
    .filter(type => type.length > 0)
    .map(type => type.replace(/['"]/g, '')) // Remove quotes
    .filter(type => type.length > 0); // Filter again after quote removal
    
  // Remove duplicates (case-insensitive)
  const uniqueTypes = [];
  const seenTypes = new Set();
  
  for (const type of types) {
    const lowerType = type.toLowerCase();
    if (!seenTypes.has(lowerType)) {
      seenTypes.add(lowerType);
      uniqueTypes.push(type);
    }
  }
    
  scraperLogger.info(`🔧 Parsed business types: ${JSON.stringify(uniqueTypes)}`);
  return uniqueTypes.length > 0 ? uniqueTypes : [businessTypesString];
}

// Helper function to parse locations from input
function parseLocations(locationString) {
  if (!locationString) return [];
  
  // Split by commas, semicolons, and handle common separators
  const locations = locationString
    .split(/[,;|]/) // Split by commas, semicolons, or pipes
    .map(loc => loc.trim())
    .filter(loc => loc.length > 0)
    .map(loc => loc.replace(/['"]/g, '')) // Remove quotes
    .filter(loc => loc.length > 0); // Filter again after quote removal
    
  // Remove duplicates (case-insensitive)
  const uniqueLocations = [];
  const seenLocations = new Set();
  
  for (const location of locations) {
    const lowerLocation = location.toLowerCase();
    if (!seenLocations.has(lowerLocation)) {
      seenLocations.add(lowerLocation);
      uniqueLocations.push(location);
    }
  }
    
  scraperLogger.info(`🔧 Parsed locations: ${JSON.stringify(uniqueLocations)}`);
  return uniqueLocations.length > 0 ? uniqueLocations : [locationString];
}

// Get scraped leads from the output file
async function getScrapedLeads() {
  let csvFile;
  if (process.env.LEADS_APART_FILE) {
    // Not logging here to avoid duplicate logs from processScrapedData
    csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
  } else {
    csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
  }
  const leads = [];
  
  try {
    const fileExists = await fs.access(csvFile).then(() => true).catch(() => false);
    if (!fileExists) {
      return leads;
    }

    return new Promise((resolve, reject) => {
      const stream = require('fs').createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          leads.push(row);
        })
        .on('end', () => {
          resolve(leads);
        })
        .on('error', (error) => {
          scraperLogger.error(`❌ Error reading scraped leads: ${error.message}`);
          resolve([]);
        });
    });

  } catch (error) {
    scraperLogger.warn(`Error accessing scraped leads file: ${error.message}`);
    return leads;
  }
}

// Combine existing and new leads into final output file
async function combineLeadsIntoFinalFile(existingLeads, newLeads, jobData) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `./Files/Deliveries/combined_leads_${timestamp}.csv`;
  
  try {
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    const allLeadsMap = new Map();

    // Process existing leads
    existingLeads.forEach(lead => {
      const key = `${lead.name_of_business || lead['Name of Business']}_${lead.phone_number || lead['Phone Number']}`.toLowerCase();
      const sourceFile = lead.source_file || lead['Source File'] || '';
      let isNamedFile = sourceFile && !sourceFile.toLowerCase().startsWith('default');
      
      if (!allLeadsMap.has(key)) {
        allLeadsMap.set(key, { 
          leadData: { ...lead }, 
          namedSources: isNamedFile ? [sourceFile] : [] // Initialize as array if named, else empty array
        });
      } else {
        const existingEntry = allLeadsMap.get(key);
        if (isNamedFile && !existingEntry.namedSources.includes(sourceFile)) {
          existingEntry.namedSources.push(sourceFile);
        }
      }
    });

    // Process new leads
    newLeads.forEach(lead => {
      const key = `${lead['Name of Business']}_${lead['Phone Number']}`.toLowerCase();
      if (!allLeadsMap.has(key)) {
        allLeadsMap.set(key, { 
          leadData: { ...lead }, 
          namedSources: [] // New leads don't have pre-existing named sources
        });
      }
      // If the lead was already in allLeadsMap, its namedSources list is preserved.
    });

    const finalLeadsArray = [];
    for (const [, { leadData, namedSources }] of allLeadsMap) {
      let finalSource;
      if (namedSources && namedSources.length > 0) {
        finalSource = namedSources.join(', '); // Join multiple named sources
      } else {
        finalSource = 'Not in any list';
      }
      
      const standardizedLead = {
        'Type of Business': leadData['Type of Business'] || leadData.type_of_business || '',
        'Sub-Category': leadData['Sub-Category'] || leadData.sub_category || '',
        'Name of Business': leadData['Name of Business'] || leadData.name_of_business || '',
        'Website': leadData['Website'] || leadData.website || '',
        '# of Reviews': leadData['# of Reviews'] || leadData.num_reviews || '',
        'Rating': leadData['Rating'] || leadData.rating || '',
        'Latest Review Date': leadData['Latest Review Date'] || leadData.latest_review || '',
        'Business Address': leadData['Business Address'] || leadData.business_address || '',
        'Phone Number': leadData['Phone Number'] || leadData.phone_number || '',
        'Source File': finalSource
      };
      finalLeadsArray.push(standardizedLead);
    }

    const csvWriterFactory = require('csv-writer');
    const csvWriter = csvWriterFactory.createObjectCsvWriter({
      path: outputFile,
      header: [
        { id: 'Type of Business', title: 'Type of Business' },
        { id: 'Sub-Category', title: 'Sub-Category' },
        { id: 'Name of Business', title: 'Name of Business' },
        { id: 'Website', title: 'Website' },
        { id: '# of Reviews', title: '# of Reviews' },
        { id: 'Rating', title: 'Rating' },
        { id: 'Latest Review Date', title: 'Latest Review Date' },
        { id: 'Business Address', title: 'Business Address' },
        { id: 'Phone Number', title: 'Phone Number' },
        { id: 'Source File', title: 'Source File' } // Added Source File to header
      ]
    });

    await csvWriter.writeRecords(finalLeadsArray);
    
    scraperLogger.info(`📄 Combined results written to ${outputFile}`, {
      totalLeads: finalLeadsArray.length,
      // Note: existingLeads.length and newLeads.length here are the input counts, not post-deduplication
      initialExistingLeads: existingLeads.length,
      initialNewLeads: newLeads.length,
    });

    return { filePath: outputFile, count: finalLeadsArray.length };

  } catch (error) {
    scraperLogger.error('Error combining leads into final file:', error);
    // Fallback logic for the original scraper output path
    let fallbackScraperOutputFile;
    if (process.env.LEADS_APART_FILE) {
        fallbackScraperOutputFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
    } else {
        fallbackScraperOutputFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
    }
    scraperLogger.info(`Fallback: returning original scraper output path: ${fallbackScraperOutputFile}`);
    
    let fallbackCount = 0;
    try {
      await fs.access(fallbackScraperOutputFile); // Check existence and permissions
      // If fs.access is successful, then try to count
      fallbackCount = await countCsvRows(fallbackScraperOutputFile);
    } catch (accessOrCountError) {
      scraperLogger.warn(`Could not access or count rows in fallback file ${fallbackScraperOutputFile}: ${accessOrCountError.message}. Using count 0.`);
      fallbackCount = 0; // Ensure it's 0 if any error in try block
    }
    return { filePath: fallbackScraperOutputFile, count: fallbackCount };
  }
}

async function saveNewLeadsToDatabase(leads, jobId) {
  if (!runQuery || !leads || leads.length === 0) {
    scraperLogger.info('No new leads to save to database or DB function not available.');
    return 0;
  }

  let savedCount = 0;
  const dbSourceFile = `Scraped by Job ${jobId} - ${new Date().toLocaleDateString()}`;

  for (const lead of leads) {
    const businessAddress = lead['Business Address'] || lead.business_address || '';
    const parsedLocation = extractLocationFromScrapedAddress(businessAddress);

    const leadDataForDb = {
      name_of_business: lead['Name of Business'] || lead.name_of_business,
      type_of_business: lead['Type of Business'] || lead.type_of_business,
      sub_category: lead['Sub-Category'] || lead.sub_category,
      website: lead['Website'] || lead.website,
      num_reviews: parseInt(lead['# of Reviews'] || lead.num_reviews, 10) || 0,
      rating: parseFloat(lead['Rating'] || lead.rating) || null,
      latest_review: lead['Latest Review Date'] || lead.latest_review,
      business_address: businessAddress,
      phone_number: lead['Phone Number'] || lead.phone_number,
      email: lead['Email'] || lead.email, 
      notes: lead['Notes'] || lead.notes,   
      source_file: dbSourceFile,
      // Prioritize direct columns from CSV, then parsed, then null
      city: lead['City'] || lead.city || parsedLocation.city,
      state: lead['State'] || lead.state || parsedLocation.state,
      zip_code: cleanZipCode(lead['Zip Code'] || lead.zip_code || parsedLocation.zipCode),
      updated_at: new Date().toISOString() // Explicitly set updated_at
    };

    if (!leadDataForDb.name_of_business || !leadDataForDb.phone_number) {
      scraperLogger.warn('Skipping lead due to missing name or phone for DB insert:', JSON.stringify(lead));
      continue;
    }

    const query = `
      INSERT OR REPLACE INTO leads (
        name_of_business, type_of_business, sub_category, website, num_reviews, rating,
        latest_review, business_address, phone_number, email, notes, source_file,
        zip_code, state, city, updated_at 
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `; 

    const params = [
      leadDataForDb.name_of_business, leadDataForDb.type_of_business, leadDataForDb.sub_category,
      leadDataForDb.website, leadDataForDb.num_reviews, leadDataForDb.rating,
      leadDataForDb.latest_review, leadDataForDb.business_address, leadDataForDb.phone_number,
      leadDataForDb.email, leadDataForDb.notes, leadDataForDb.source_file,
      leadDataForDb.zip_code, leadDataForDb.state, leadDataForDb.city, leadDataForDb.updated_at
    ];

    try {
      await runQuery(query, params);
      savedCount++;
    } catch (dbError) {
      scraperLogger.error(`Failed to save lead to database: ${leadDataForDb.name_of_business}`, { error: dbError.message, leadData: leadDataForDb });
    }
  }
  scraperLogger.info(`✅ Saved ${savedCount} out of ${leads.length} newly scraped leads to the database.`);
  return savedCount;
}

module.exports = scraperProcessor; 