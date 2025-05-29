const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

let db;

const DB_PATH = process.env.DATABASE_URL || './data/leads.db';

async function setupDatabase() {
  try {
    // Ensure data directory exists
    const dbDir = path.dirname(DB_PATH);
    await fs.mkdir(dbDir, { recursive: true });

    // Create database connection
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Error opening database:', err);
        throw err;
      }
      logger.info('Connected to SQLite database');
    });

    // Enable foreign keys
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create tables
    await createTables();
    
    logger.info('Database setup completed');
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

async function createTables() {
  const tables = [
    // Users table - stores user authentication data
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Leads table - stores all business leads
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_of_business TEXT NOT NULL,
      type_of_business TEXT,
      sub_category TEXT,
      website TEXT,
      num_reviews INTEGER DEFAULT 0,
      rating REAL,
      latest_review TEXT,
      business_address TEXT,
      phone_number TEXT,
      email TEXT,
      notes TEXT,
      source_file TEXT,
      zip_code TEXT,
      state TEXT,
      city TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(phone_number) ON CONFLICT REPLACE
    )`,

    // Scraping jobs table - tracks scraper queue jobs
    `CREATE TABLE IF NOT EXISTS scraping_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      client_name TEXT,
      business_types TEXT, -- JSON array
      zip_codes TEXT, -- JSON array
      states TEXT, -- JSON array
      status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
      queries_generated INTEGER DEFAULT 0,
      leads_found INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    )`,

    // Processing jobs table - tracks formatting and findleads jobs
    `CREATE TABLE IF NOT EXISTS processing_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'format', 'findleads', 'generate_queries'
      input_file TEXT,
      output_file TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      results TEXT, -- JSON results
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    )`,

    // Client requests table - tracks requests from Google Sheets or frontend
    `CREATE TABLE IF NOT EXISTS client_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      request_data TEXT, -- JSON data from Google Sheets
      business_types TEXT,
      locations TEXT,
      status TEXT DEFAULT 'received', -- received, processing, completed
      output_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    )`,

    // Search queries table - stores generated search queries
    `CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type TEXT NOT NULL,
      location TEXT NOT NULL,
      query_text TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, completed, failed
      leads_found INTEGER DEFAULT 0,
      scraping_job_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      scraped_at DATETIME,
      FOREIGN KEY (scraping_job_id) REFERENCES scraping_jobs(job_id)
    )`,

    // System metadata table
    `CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Deliveries table - tracks generated files for download
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      format TEXT NOT NULL, -- 'csv', 'excel', 'xlsx'
      lead_count INTEGER DEFAULT 0,
      filters TEXT, -- JSON filters used to generate the file
      request_type TEXT, -- 'export', 'search', etc.
      file_size INTEGER DEFAULT 0,
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      downloaded_at DATETIME
    )`
  ];

  for (const tableSQL of tables) {
    await new Promise((resolve, reject) => {
      db.run(tableSQL, (err) => {
        if (err) {
          logger.error('Error creating table:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Create indexes for better performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_leads_business_type ON leads(type_of_business)',
    'CREATE INDEX IF NOT EXISTS idx_leads_zip_code ON leads(zip_code)',
    'CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state)',
    'CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_search_queries_status ON search_queries(status)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_file_id ON deliveries(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at)'
  ];

  for (const indexSQL of indexes) {
    await new Promise((resolve, reject) => {
      db.run(indexSQL, (err) => {
        if (err) {
          logger.error('Error creating index:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return db;
}

// Helper function to run queries with promises
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get single row
function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get all rows
function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  setupDatabase,
  getDatabase,
  runQuery,
  getOne,
  getAll
}; 