const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const { scraperLogger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

const business_filters = {
    "rv park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home park":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "trailer park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "rv parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home parks":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "trailer parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "nursing homes": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
    "nursing home": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
    "apartment buildings": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
    "apartment building": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
    "high school": ['middle school', 'high school', 'charter school', 'senior high school'],
    "high schools": ['middle school', 'high school', 'charter school', 'senior high school'],
    "middle school": ['middle school', 'high school', 'charter school', 'senior high school'],
    "middle schools": ['middle school', 'high school', 'charter school', 'senior high school'],
    "laundromat": ['no category', 'laundry', 'laundromat', 'laundry service'],
    "laundromats": ['no category', 'laundry', 'laundromat', 'laundry service'],
    "auto repair shop": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
    "auto repair shops": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
    "motels": ['hotel', 'inn', 'motel', 'extended stay hotel'],
    "motel": ['hotel', 'inn', 'motel', 'extended stay hotel'],
    "gym": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
    "gyms": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
    "warehouse":["warehouse", "manufacturer", "logistics service"],
    "warehouses":["warehouse", "manufacturer","manufacturers", "logistics service"],
    "factories":["manufacturer","manufacturers"],
    "factory":["manufacturer"]
};

// Constants for lead filtering
const MIN_REVIEW_COUNT = 4;
const REQUIRED_REVIEW_TEXT = "ago";
const US_ADDRESS_MARKER = "United States";
const SCRAPED_NEW_SOURCE_NAME = "Scraped New"; // Source name for newly scraped leads
// const STATE_FILTER_ENABLED = false; // Set to true to enable state-specific filtering
// const TARGET_STATES = ['WA']; // Define target states if STATE_FILTER_ENABLED is true

const UNWANTED_PLACEHOLDERS = {
    '#_of_Reviews': 'No reviews', // Assuming keys are consistent with CSV/object properties
    'Rating': 'No ratings',
    'Latest_Review_Date': 'No review date', // Covers "Latest Review" and "Latest Review Date"
    'Latest_Review': 'No review date',
    'Phone_Number': 'No phone number',
    'Business_Address': 'No address'
};

const column_widths_excel = [
    { key: 'Type of Business', width: 20 },
    { key: 'Sub-Category', width: 18 },
    { key: 'Name of Business', width: 30 },
    { key: 'Website', width: 25 },
    { key: '# of Reviews', width: 12 },
    { key: 'Rating', width: 10 },
    { key: 'Latest Review Date', width: 20 },
    { key: 'Business Address', width: 50 },
    { key: 'Phone Number', width: 15 },
    { key: 'Source File', width: 15 }
];

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
      maxResults: jobData.maxResults || 15
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
        const savedToDbCount = await saveNewLeadsToDatabase(scrapedLeads, jobId, jobData);
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
    const maxResults = job.data.maxResults || 15; // Ensure a default if somehow undefined
    
    scraperLogger.info(`🐍 Executing Python scraper: ${pythonPath} ${scriptPath} --max_results ${maxResults}`);
    scraperLogger.info(`🔧 Current Working Directory (CWD): ${process.cwd()}`);
    scraperLogger.info(`🔧 System PATH: ${process.env.PATH}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath, '--max_results', maxResults.toString()], {
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
    /*
    setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error('Scraper execution timed out after 30 minutes'));
    }, 30 * 60 * 1000);
    */
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
  const existingLeadsOutput = []; // For the final combined output file
  const optimizedQueries = []; // For queries that need scraping
  const allFetchedLeadsMap = new Map(); // To store all unique leads fetched from DB for deduplication

  try {
    const allCombinations = [];
    for (const query of queries) {
      const businessTypes = parseBusinessTypes(query.businessType);
      const locations = parseLocations(query.location);
      for (const businessType of businessTypes) {
        for (const location of locations) {
          allCombinations.push({
            businessType,
            location,
            maxResults: query.maxResults || 15,
            originalQuery: query
          });
        }
      }
    }

    scraperLogger.info(`🔍 Initializing check for ${allCombinations.length} business type + location combinations.`);

    let fetchedLeadsFromDB = [];
    if (allCombinations.length > 0) {
      fetchedLeadsFromDB = await checkExistingLeadsBulk(allCombinations);
      scraperLogger.info(`📋 Bulk DB query returned ${fetchedLeadsFromDB.length} raw leads.`);

      fetchedLeadsFromDB.forEach(lead => {
        const leadKey = `${lead.name_of_business}_${lead.phone_number}`.toLowerCase();
        if (!allFetchedLeadsMap.has(leadKey)) {
          allFetchedLeadsMap.set(leadKey, lead);
          existingLeadsOutput.push(lead);
        }
      });
      scraperLogger.info(`📊 ${existingLeadsOutput.length} unique existing leads identified for potential output.`);
    }

    for (const combo of allCombinations) {
      const hasLeadsForThisSpecificCombo = fetchedLeadsFromDB.some(lead => {
        const leadBizType = (lead.type_of_business || '').toLowerCase();
        const leadSubCategory = (lead.sub_category || '').toLowerCase();
        const comboBizTypeLower = combo.businessType.toLowerCase();
        const bizTypeMatch = leadBizType.includes(comboBizTypeLower) || leadSubCategory.includes(comboBizTypeLower);

        const leadZip = (lead.zip_code || '').toLowerCase().trim();
        const leadCity = (lead.city || '').toLowerCase().trim();
        const comboLocationLower = combo.location.toLowerCase().trim();
        
        let locationMatch = false;
        if (leadZip === comboLocationLower || leadCity === comboLocationLower || (leadCity.includes(comboLocationLower) && comboLocationLower.length > 2)) {
            locationMatch = true;
        }
        return bizTypeMatch && locationMatch;
      });

      if (!hasLeadsForThisSpecificCombo) {
        optimizedQueries.push({
          businessType: combo.businessType,
          location: combo.location,
          query: `${combo.businessType} in ${combo.location}`,
          maxResults: combo.maxResults
        });
        scraperLogger.info(`🎯 To Scrape: ${combo.businessType} in ${combo.location} (0 leads found for this specific combo in DB).`);
      } else {
        scraperLogger.info(`✅ Leads exist in DB for: ${combo.businessType} in ${combo.location}. Skipping for scrape queue.`);
      }
    }

  } catch (error) {
    scraperLogger.error('Error in lead optimization:', error);
    const distinctCombinations = [];
    const seenCombos = new Set();
    for (const query of queries) {
        const businessTypes = parseBusinessTypes(query.businessType);
        const locations = parseLocations(query.location);
        for (const businessType of businessTypes) {
            for (const location of locations) {
                const comboKey = `${businessType}|${location}`.toLowerCase();
                if (!seenCombos.has(comboKey)) {
                    seenCombos.add(comboKey);
                    distinctCombinations.push({
                        businessType: businessType,
                        location: location,
                        query: `${businessType} in ${location}`,
                        maxResults: query.maxResults || 15
                    });
                }
            }
        }
    }
    scraperLogger.warn('Fallback: Due to error, will attempt to scrape all original distinct combinations.');
    return { optimizedQueries: distinctCombinations, existingLeads: [] };
  }
  
  return { optimizedQueries, existingLeads: existingLeadsOutput };
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

// Helper function to generate Excel file
async function generateExcelFile(leadsArray, outputPath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    const headers = column_widths_excel.map(cw => ({ header: cw.key, key: cw.key, width: cw.width }));
    worksheet.columns = headers;

    worksheet.addRows(leadsArray);

    await workbook.xlsx.writeFile(outputPath);
    scraperLogger.info(`📊 Excel file generated at ${outputPath} with ${leadsArray.length} leads.`);
}

// Combine existing and new leads into final output file
async function combineLeadsIntoFinalFile(existingLeads, newLeads, jobData) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const excelOutputFile = `./Files/Deliveries/combined_leads_${timestamp}.xlsx`;
  const primaryJobTypesLowerCase = parseBusinessTypes(jobData.businessType || '').map(type => type.toLowerCase());

  try {
    const outputDir = path.dirname(excelOutputFile);
    await fs.mkdir(outputDir, { recursive: true });

    let allProcessableLeads = [];

    // Process and filter existing leads, adding source file information
    existingLeads.forEach(lead => {
      if (applyLeadFilters(lead, primaryJobTypesLowerCase)) {
        const leadCopy = { ...lead };
        leadCopy._source_file_original = getLeadValue(lead, 'Source File', 'source_file') || 'Unknown Existing';
        leadCopy._source_priority = leadCopy._source_file_original.toLowerCase().startsWith('default') || leadCopy._source_file_original === SCRAPED_NEW_SOURCE_NAME ? 1 : 0;
        allProcessableLeads.push(leadCopy);
      }
    });
    scraperLogger.info(`Retained ${allProcessableLeads.length} existing leads after filtering.`);

    // Process and filter new leads
    let newLeadsPassedFilterCount = 0;
    newLeads.forEach(lead => {
      if (applyLeadFilters(lead, primaryJobTypesLowerCase)) {
        const leadCopy = { ...lead };
        leadCopy._source_file_original = SCRAPED_NEW_SOURCE_NAME;
        leadCopy._source_priority = 1; // Newly scraped leads get lower priority
        allProcessableLeads.push(leadCopy);
        newLeadsPassedFilterCount++;
      }
    });
    scraperLogger.info(`Retained ${newLeadsPassedFilterCount} newly scraped leads after filtering.`);

    // Deduplication based on Phone Number, prioritizing existing non-default sources
    const uniqueLeadsMap = new Map();
    allProcessableLeads.sort((a, b) => {
      const phoneA = String(getLeadValue(a, 'Phone Number', 'phone_number')).trim();
      const phoneB = String(getLeadValue(b, 'Phone Number', 'phone_number')).trim();
      if (phoneA < phoneB) return -1;
      if (phoneA > phoneB) return 1;
      return a._source_priority - b._source_priority; // Lower priority number (e.g., 0 for list files) comes first
    });

    for (const lead of allProcessableLeads) {
      const phoneNumber = String(getLeadValue(lead, 'Phone Number', 'phone_number')).trim();
      if (phoneNumber && !uniqueLeadsMap.has(phoneNumber)) {
        uniqueLeadsMap.set(phoneNumber, lead);
      }
    }
    
    let dedupedLeads = Array.from(uniqueLeadsMap.values());
    scraperLogger.info(`Reduced to ${dedupedLeads.length} leads after source-prioritized deduplication by Phone Number.`);

    // Prepare leads for final output: standardize fields, trim review date, title case
    const finalOutputLeads = dedupedLeads.map(lead => {
      let latestReview = getLeadValue(lead, 'Latest Review Date', 'latest_review', 'Latest Review');
      if (latestReview && typeof latestReview === 'string') {
        const agoIndex = latestReview.toLowerCase().indexOf(REQUIRED_REVIEW_TEXT);
        if (agoIndex !== -1) {
          latestReview = latestReview.substring(0, agoIndex + REQUIRED_REVIEW_TEXT.length).trim();
        }
        } else {
        latestReview = '';
      }

      return {
        'Type of Business': String(getLeadValue(lead, 'Type of Business', 'type_of_business')).trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        'Sub-Category': String(getLeadValue(lead, 'Sub-Category', 'sub_category')).trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        'Name of Business': String(getLeadValue(lead, 'Name of Business', 'name_of_business')).trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        'Website': getLeadValue(lead, 'Website', 'website'),
        '# of Reviews': getLeadValue(lead, '# of Reviews', 'num_reviews'), // Already int or placeholder checked by filter
        'Rating': getLeadValue(lead, 'Rating', 'rating'), // Already float or placeholder checked
        'Latest Review Date': latestReview,
        'Business Address': getLeadValue(lead, 'Business Address', 'business_address'),
        'Phone Number': getLeadValue(lead, 'Phone Number', 'phone_number'),
        'Source File': lead._source_file_original || 'Unknown' // Use the stored original source
      };
    });

    // Custom Sorting Logic
    finalOutputLeads.sort((a, b) => {
      const typeA = String(a['Type of Business']).toLowerCase();
      const typeB = String(b['Type of Business']).toLowerCase();
      const subTypeA = String(a['Sub-Category']).toLowerCase();
      const subTypeB = String(b['Sub-Category']).toLowerCase();

      let groupA = 0; // 0 for others
      if (typeA.includes('rv park') || typeA.includes('mobile home park') || typeA.includes('trailer park') || typeA.includes('campground')) groupA = 2;
      else if (typeA.includes('high school') || typeA.includes('middle school')) groupA = 1;

      let groupB = 0;
      if (typeB.includes('rv park') || typeB.includes('mobile home park') || typeB.includes('trailer park') || typeB.includes('campground')) groupB = 2;
      else if (typeB.includes('high school') || typeB.includes('middle school')) groupB = 1;

      if (groupA !== groupB) return groupB - groupA; // Higher group number comes first (2, then 1, then 0)
      if (typeA !== typeB) return typeA.localeCompare(typeB);
      return subTypeA.localeCompare(subTypeB);
    });

    // Generate Excel file
    await generateExcelFile(finalOutputLeads, excelOutputFile);
    
    scraperLogger.info(`📄 Combined results written to ${excelOutputFile}`, {
      totalLeads: finalOutputLeads.length,
      initialExistingLeads: existingLeads.length,
      initialNewLeads: newLeads.length,
    });

    return { filePath: excelOutputFile, count: finalOutputLeads.length, format: 'xlsx' };

  } catch (error) {
    scraperLogger.error('Error combining leads into final file:', error);
    // Fallback logic (currently points to CSV path, adjust if needed or remove if only Excel is desired)
    let fallbackScraperOutputFile = `./Outputs/LeadsApart.csv`; // Default fallback
    scraperLogger.info(`Fallback: In case of error, check for potential raw CSV: ${fallbackScraperOutputFile}`);
    
    let fallbackCount = 0;
    try {
      await fs.access(fallbackScraperOutputFile);
      fallbackCount = await countCsvRows(fallbackScraperOutputFile);
    } catch (accessOrCountError) {
      scraperLogger.warn(`Could not access or count rows in fallback file ${fallbackScraperOutputFile}: ${accessOrCountError.message}. Using count 0.`);
      fallbackCount = 0;
    }
    // Return type should indicate error or different handling for fallback
    return { filePath: fallbackScraperOutputFile, count: fallbackCount, format: 'csv', error: true }; 
  }
}

// Save newly scraped (and now filtered) leads to the database
async function saveNewLeadsToDatabase(leads, jobId, jobData) {
  if (!runQuery || !leads || leads.length === 0) return 0;

  const primaryJobTypesLowerCase = parseBusinessTypes((jobData && jobData.businessType) ? jobData.businessType : '').map(type => type.toLowerCase());
  let savedCount = 0;
  let filteredOutCount = 0;

  for (const lead of leads) {
    // Apply the comprehensive filters
    if (!applyLeadFilters(lead, primaryJobTypesLowerCase)) {
      filteredOutCount++;
      continue; // Skip this lead if it doesn't pass filters
    }

    // Standardize lead data for DB insertion, similar to import_lead_files.js
    const nameOfBusiness = getLeadValue(lead, 'Name of Business', 'name_of_business');
    const typeOfBusiness = getLeadValue(lead, 'Type of Business', 'type_of_business');
    const subCategory = getLeadValue(lead, 'Sub-Category', 'sub_category');
    const website = getLeadValue(lead, 'Website', 'website');
    const numReviewsRaw = getLeadValue(lead, '# of Reviews', 'num_reviews');
    const ratingRaw = getLeadValue(lead, 'Rating', 'rating');
    let latestReview = getLeadValue(lead, 'Latest Review Date', 'latest_review', 'Latest Review');
    const businessAddress = getLeadValue(lead, 'Business Address', 'business_address');
    const phoneNumber = getLeadValue(lead, 'Phone Number', 'phone_number');

    // Clean/transform data for DB
    const numReviews = numReviewsRaw ? parseInt(String(numReviewsRaw).replace(/,/g, ''), 10) : null;
    const rating = ratingRaw ? parseFloat(String(ratingRaw)) : null;
    
    // Trim "Latest Review" to only include text up to and including "ago"
    if (latestReview && typeof latestReview === 'string') {
        const agoIndex = latestReview.toLowerCase().indexOf(REQUIRED_REVIEW_TEXT); // REQUIRED_REVIEW_TEXT is 'ago'
        if (agoIndex !== -1) {
            latestReview = latestReview.substring(0, agoIndex + REQUIRED_REVIEW_TEXT.length).trim();
        }
    } else {
        latestReview = null;
    }

    const { city, state, zipCode } = extractLocationFromScrapedAddress(businessAddress);

    try {
      await runQuery(
        `INSERT INTO leads (job_id, name_of_business, type_of_business, sub_category, website, num_reviews, rating, latest_review, business_address, phone_number, city, state, zip_code, source_file, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(name_of_business, phone_number) DO UPDATE SET
           type_of_business = EXCLUDED.type_of_business,
           sub_category = EXCLUDED.sub_category,
           website = EXCLUDED.website,
           num_reviews = EXCLUDED.num_reviews,
           rating = EXCLUDED.rating,
           latest_review = EXCLUDED.latest_review,
           business_address = EXCLUDED.business_address,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           zip_code = EXCLUDED.zip_code,
           source_file = EXCLUDED.source_file, -- Prefer new source_file if conflict
           job_id = EXCLUDED.job_id, -- Update job_id to the current job if conflict
           updated_at = CURRENT_TIMESTAMP`, 
        [
          jobId,
          nameOfBusiness,
          typeOfBusiness,
          subCategory,
          website,
          isNaN(numReviews) ? null : numReviews,
          isNaN(rating) ? null : rating,
          latestReview,
          businessAddress,
          phoneNumber,
          city,
          state,
          zipCode,
          SCRAPED_NEW_SOURCE_NAME // Mark newly scraped leads with a specific source
        ]
      );
      savedCount++;
    } catch (error) {
      scraperLogger.error(`Error saving lead to DB: ${nameOfBusiness} - ${error.message}`);
    }
  }
  scraperLogger.info(`Filtered out ${filteredOutCount} leads before DB insertion. Saved ${savedCount} new leads to DB.`);
  return savedCount;
}

// Helper function to get a value from a lead object, checking multiple possible keys
function getLeadValue(lead, primaryKey, secondaryKey = null, tertiaryKey = null) {
    if (lead && typeof lead === 'object') {
        if (primaryKey in lead && lead[primaryKey] !== null && lead[primaryKey] !== undefined) return lead[primaryKey];
        if (secondaryKey && secondaryKey in lead && lead[secondaryKey] !== null && lead[secondaryKey] !== undefined) return lead[secondaryKey];
        if (tertiaryKey && tertiaryKey in lead && lead[tertiaryKey] !== null && lead[tertiaryKey] !== undefined) return lead[tertiaryKey];
    }
    return ''; // Return empty string for consistency if not found or lead is not an object
}

// Comprehensive lead filtering function
function applyLeadFilters(lead, primaryJobTypesLowerCase) {
    if (!lead || typeof lead !== 'object') return false;

    // Standardize access to lead fields using a helper
    const typeOfBusinessRaw = getLeadValue(lead, 'Type of Business', 'type_of_business');
    const subCategoryRaw = getLeadValue(lead, 'Sub-Category', 'sub_category');
    const reviewsRaw = getLeadValue(lead, '# of Reviews', 'num_reviews'); // Handles both '# of Reviews' and 'num_reviews'
    const ratingRaw = getLeadValue(lead, 'Rating', 'rating');
    const latestReviewRaw = getLeadValue(lead, 'Latest Review Date', 'latest_review', 'Latest Review');
    const phoneRaw = getLeadValue(lead, 'Phone Number', 'phone_number');
    const addressRaw = getLeadValue(lead, 'Business Address', 'business_address');

    const typeOfBusiness = String(typeOfBusinessRaw).toLowerCase();
    const subCategory = String(subCategoryRaw).toLowerCase();
    const reviewsStr = String(reviewsRaw);
    const ratingStr = String(ratingRaw);
    let latestReviewStr = String(latestReviewRaw);
    const phoneStr = String(phoneRaw);
    const addressStr = String(addressRaw);


    // 1. Placeholder Value Checks (case-insensitive for string placeholders)
    if (!phoneStr || phoneStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Phone_Number'].toLowerCase()) return false;
    if (!addressStr || addressStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Business_Address'].toLowerCase()) return false;
    if (reviewsStr.toLowerCase() === UNWANTED_PLACEHOLDERS['#_of_Reviews'].toLowerCase()) return false;
    if (ratingStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Rating'].toLowerCase()) return false;
    if (latestReviewStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Latest_Review'].toLowerCase()) return false;


    // 2. Address Format Filter (must contain a comma)
    if (!addressStr.includes(',')) {
        scraperLogger.debug(`Filtering out lead (no comma in address): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }

    // 3. Review Count Filter
    const numReviews = parseInt(reviewsStr.replace(/,/g, ''), 10);
    if (isNaN(numReviews) || numReviews < MIN_REVIEW_COUNT) {
        scraperLogger.debug(`Filtering out lead (review count < ${MIN_REVIEW_COUNT}): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }

    // 4. Review Date Filter ("ago")
    if (!latestReviewStr.toLowerCase().includes(REQUIRED_REVIEW_TEXT)) {
         scraperLogger.debug(`Filtering out lead (latest review missing '${REQUIRED_REVIEW_TEXT}'): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }
    // Trim text after "ago" - This modification should happen *after* filtering, before saving/outputting.
    // For filtering, we just check for presence.

    // 5. Location Filter (US_Filter)
    if (!addressStr.toLowerCase().includes(US_ADDRESS_MARKER.toLowerCase())) {
        scraperLogger.debug(`Filtering out lead (address not in ${US_ADDRESS_MARKER}): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }
    
    // Optional: State Filter (e.g., for 'WA')
    // if (STATE_FILTER_ENABLED) {
    //     let matchesState = false;
    //     for (const state of TARGET_STATES) {
    //         if (addressStr.toUpperCase().includes(`, ${state.toUpperCase()} `) || addressStr.toUpperCase().endsWith(` ${state.toUpperCase()}`)) {
    //             matchesState = true;
    //             break;
    //         }
    //     }
    //     if (!matchesState) {
    //         scraperLogger.debug(`Filtering out lead (address not in target states): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
    //         return false;
    //     }
    // }

    // 6. Business Type / Sub-Category Filter
    let matchesPrimaryJobTypeFilter = false;
    if (!primaryJobTypesLowerCase || primaryJobTypesLowerCase.length === 0) {
        matchesPrimaryJobTypeFilter = true; // No specific job type filter from jobData, pass all (should not happen if jobData is validated)
    } else {
        for (const primaryType of primaryJobTypesLowerCase) {
            // Check if this business type is one of the types that should have filtering applied
            const shouldApplyFilter = Object.keys(business_filters).some(filterKey => 
                filterKey.toLowerCase() === primaryType.toLowerCase()
            );
            
            if (shouldApplyFilter) {
                // This business type IS in the business_filters, so apply filtering
                const allowedSubcategories = business_filters[primaryType] || 
                    business_filters[Object.keys(business_filters).find(key => key.toLowerCase() === primaryType.toLowerCase())];
                
                if (allowedSubcategories && allowedSubcategories.length > 0) {
                    // A lead matches if its main type OR its sub-category is in the allowed list for the job's primary type
                    if (allowedSubcategories.some(allowed => 
                        typeOfBusiness.includes(allowed.toLowerCase()) || 
                        subCategory.includes(allowed.toLowerCase())
                    )) {
                        matchesPrimaryJobTypeFilter = true;
                        break;
                    }
                }
            } else {
                // This business type is NOT in business_filters, so no filtering - allow all leads that match the type
                if (typeOfBusiness.includes(primaryType) || primaryType.includes(typeOfBusiness) ||
                    subCategory.includes(primaryType) || primaryType.includes(subCategory)) {
                    matchesPrimaryJobTypeFilter = true;
                    break;
                }
            }
        }
    }
    if (!matchesPrimaryJobTypeFilter) {
        scraperLogger.debug(`Filtering out lead (type/subtype not matching job's primary types): ${getLeadValue(lead, 'Name of Business', 'name_of_business')} (Type: ${typeOfBusiness}, SubType: ${subCategory})`);
        return false;
    }

    return true; // Lead passes all filters
}

module.exports = scraperProcessor; 