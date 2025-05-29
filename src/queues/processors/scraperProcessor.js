const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { scraperLogger } = require('../../utils/logger');

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
      // Write optimized queries to queries.txt file
      const queriesFile = process.env.QUERIES_FILE || './queries.txt';
      const queriesContent = optimizedQueries.map(q => `"${q.businessType}", "${q.query}"`).join('\n');
      await fs.writeFile(queriesFile, queriesContent, 'utf8');
      
      scraperLogger.info(`📝 Written ${optimizedQueries.length} optimized queries to ${queriesFile}`);

      // Update progress
      if (job.progress) {
        job.progress(20);
    }

    // Execute Python scraper script
    const result = await executePythonScraper(job);
      
      // Update progress
      if (job.progress) {
        job.progress(70);
      }

      // Process the scraped results
      newLeadsCount = await processScrapedData(jobId);
      scrapedLeads = await getScrapedLeads();
      
      scraperLogger.info(`🔍 Scraped ${newLeadsCount} new leads`);
    } else {
      scraperLogger.info(`⚡ Skipping scraping - all requested leads already exist in database`);
    }
    
    // Update progress
    if (job.progress) {
      job.progress(80);
    }

    // 🔄 COMBINE RESULTS: Merge existing + new leads into final output
    const finalOutputFile = await combineLeadsIntoFinalFile(existingLeads, scrapedLeads, jobData);
    const totalLeadsCount = existingLeads.length + newLeadsCount;

    scraperLogger.info(`📋 Final Results`, {
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      totalLeads: totalLeadsCount,
      outputFile: finalOutputFile
    });
    
    // Update progress
    if (job.progress) {
      job.progress(90);
    }

    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, leads_found = ? WHERE job_id = ?',
          ['completed', totalLeadsCount, jobId]
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
      leadsFound: totalLeadsCount,
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      outputFile: finalOutputFile
    });
    
    return {
      success: true,
      leadsFound: totalLeadsCount,
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
  
  try {
    for (const query of queries) {
      // Parse business types and locations
      const businessTypes = parseBusinessTypes(query.businessType);
      const locations = parseLocations(query.location);
      
      // Check each combination of business type and location
      for (const businessType of businessTypes) {
        for (const location of locations) {
          // Check if we already have leads for this business type + location
          const existingForLocation = await checkExistingLeadsForLocation(businessType, location);
          
          if (existingForLocation.length > 0) {
            // Add existing leads to our collection
            existingLeads.push(...existingForLocation);
            scraperLogger.info(`📋 Found ${existingForLocation.length} existing leads for ${businessType} in ${location}`);
          } else {
            // Add to optimization queue for scraping
            optimizedQueries.push({
              businessType: businessType,
              location: location,
              query: `${businessType} in ${location}`,
              maxResults: query.maxResults || 1000
            });
            scraperLogger.info(`🔍 Need to scrape: ${businessType} in ${location}`);
          }
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

// Helper function to parse business types from input
function parseBusinessTypes(businessTypesString) {
  if (!businessTypesString) return [];
  
  // Split by common delimiters and clean up
  const types = businessTypesString
    .split(/[,&+;]|\sand\s|\sor\s/i)
    .map(type => type.trim())
    .filter(type => type.length > 0);
    
  return types.length > 0 ? types : [businessTypesString];
}

// Helper function to parse locations from input
function parseLocations(locationString) {
  if (!locationString) return [];
  
  // Split by commas and clean up
  const locations = locationString
    .split(/[,;]/)
    .map(loc => loc.trim())
    .filter(loc => loc.length > 0);
    
  return locations.length > 0 ? locations : [locationString];
}

// Check existing leads for a specific business type and location
async function checkExistingLeadsForLocation(businessType, location) {
  if (!getAll) return [];
  
  try {
    // Query database for existing leads
    const leads = await getAll(`
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
        city
      FROM leads 
      WHERE 
        (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
        AND (
          LOWER(business_address) LIKE LOWER(?) 
          OR LOWER(zip_code) = LOWER(?)
          OR LOWER(city) LIKE LOWER(?)
          OR LOWER(state) LIKE LOWER(?)
        )
    `, [
      `%${businessType}%`, `%${businessType}%`,
      `%${location}%`, location, `%${location}%`, `%${location}%`
    ]);
    
    return leads || [];
    
  } catch (error) {
    scraperLogger.warn(`Error checking existing leads for ${businessType} in ${location}:`, error.message);
    return [];
  }
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
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Standardize field names for consistency
    const standardizeFields = (lead) => ({
      'Type of Business': lead['Type of Business'] || lead.type_of_business || '',
      'Sub-Category': lead['Sub-Category'] || lead.sub_category || '',
      'Name of Business': lead['Name of Business'] || lead.name_of_business || '',
      'Website': lead['Website'] || lead.website || '',
      '# of Reviews': lead['# of Reviews'] || lead.num_reviews || '',
      'Rating': lead['Rating'] || lead.rating || '',
      'Latest Review Date': lead['Latest Review Date'] || lead.latest_review || '',
      'Business Address': lead['Business Address'] || lead.business_address || '',
      'Phone Number': lead['Phone Number'] || lead.phone_number || ''
    });

    // Combine and standardize all leads
    const allLeads = [
      ...existingLeads.map(standardizeFields),
      ...newLeads.map(standardizeFields)
    ];

    // Remove duplicates based on business name + phone number
    const uniqueLeads = [];
    const seen = new Set();
    
    for (const lead of allLeads) {
      const key = `${lead['Name of Business']}_${lead['Phone Number']}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLeads.push(lead);
      }
    }

    // Write to CSV
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
        { id: 'Phone Number', title: 'Phone Number' }
      ]
    });

    await csvWriter.writeRecords(uniqueLeads);
    
    scraperLogger.info(`📄 Combined results written to ${outputFile}`, {
      totalLeads: uniqueLeads.length,
      existingLeads: existingLeads.length,
      newLeads: newLeads.length,
      duplicatesRemoved: allLeads.length - uniqueLeads.length
    });

    return outputFile;

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
    return fallbackScraperOutputFile;
  }
}

module.exports = scraperProcessor; 