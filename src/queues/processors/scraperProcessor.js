const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { scraperLogger } = require('../../utils/logger');

// Import database functions with error handling
let runQuery, getOne;
try {
  const db = require('../../database/setup');
  runQuery = db.runQuery;
  getOne = db.getOne;
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

    // Write queries to queries.txt file
    const queriesFile = process.env.QUERIES_FILE || './queries.txt';
    const queriesContent = queries.map(q => `"${q.businessType}", "${q.query}"`).join('\n');
    await fs.writeFile(queriesFile, queriesContent, 'utf8');
    
    scraperLogger.info(`📝 Written ${queries.length} queries to ${queriesFile}`);

    // Update progress
    if (job.progress) {
      job.progress(10);
    }

    // Execute Python scraper script
    const result = await executePythonScraper(job);
    
    // Update progress
    if (job.progress) {
      job.progress(80);
    }

    // Process the scraped results
    const leadsCount = await processScrapedData(jobId);
    
    // Update progress
    if (job.progress) {
      job.progress(90);
    }

    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, leads_found = ? WHERE job_id = ?',
          ['completed', leadsCount, jobId]
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

    scraperLogger.info(`✅ SCRAPER PROCESSOR COMPLETED: Job ${jobId} finished successfully`, { leadsFound: leadsCount });
    
    return {
      success: true,
      leadsFound: leadsCount,
      message: 'Scraping completed successfully',
      queries: queries.length,
      clientName: clientName,
      outputFile: process.env.LEADS_APART_FILE || './LeadsApart.csv'
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
  const csvFile = process.env.LEADS_APART_FILE || './LeadsApart.csv';
  
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

module.exports = scraperProcessor; 