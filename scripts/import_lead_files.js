const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');

// Database connection
const dbPath = path.join(__dirname, '..', 'data', 'leads.db');
const db = new sqlite3.Database(dbPath);

// Files directory
const filesDir = path.join(__dirname, '..', 'Files');

// Progress tracking
let totalFiles = 0;
let processedFiles = 0;
let totalLeads = 0;
let successfulLeads = 0;
let errorLeads = 0;

// Column mapping - maps various possible column names to our database columns
const columnMapping = {
  // Business name variations
  'name_of_business': ['Name of Business', 'Business Name', 'Name', 'Company Name', 'name_of_business'],
  
  // Business type variations
  'type_of_business': ['Type of Business', 'Business Type', 'Type', 'Category', 'type_of_business'],
  
  // Sub-category variations
  'sub_category': ['Sub-Category', 'Subcategory', 'Sub Category', 'Secondary Category', 'sub_category'],
  
  // Contact info variations
  'website': ['Website', 'Website URL', 'URL', 'Web', 'website'],
  'phone_number': ['Phone Number', 'Phone', 'Contact Number', 'Tel', 'Telephone', 'phone_number'],
  'email': ['Email', 'Email Address', 'E-mail', 'Contact Email', 'email'],
  
  // Address variations
  'business_address': ['Business Address', 'Address', 'Full Address', 'Location', 'business_address'],
  'city': ['City', 'city'],
  'state': ['State', 'Province', 'Region', 'state'],
  'zip_code': ['Zip Code', 'ZIP', 'Postal Code', 'zip_code'],
  
  // Review data variations
  'rating': ['Rating', 'Stars', 'Score', 'rating'],
  'num_reviews': ['# of Reviews', 'Number of Reviews', 'Review Count', 'Reviews', 'num_reviews'],
  'latest_review': ['Latest Review', 'Last Review', 'Recent Review', 'Latest Review Date', 'latest_review'],
  
  // Additional fields
  'notes': ['Notes', 'Comments', 'Remarks', 'notes']
};

// Function to find the correct column name from the mapping
function findColumnInSheet(sheet, targetColumn) {
  const possibleNames = columnMapping[targetColumn] || [];
  
  for (const possibleName of possibleNames) {
    // Check for exact match (case insensitive)
    for (const cellKey in sheet) {
      if (cellKey.startsWith('!')) continue; // Skip metadata
      
      const cellValue = sheet[cellKey]?.v?.toString().trim();
      if (cellValue && cellValue.toLowerCase() === possibleName.toLowerCase()) {
        return possibleName;
      }
    }
  }
  return null;
}

// Function to extract state and zip code from address
function extractLocationFromAddress(address) {
  if (!address) return { city: null, state: null, zipCode: null };
  
  // Common patterns for US addresses
  const stateZipPattern = /,\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/;
  const statePattern = /,\s*([A-Z]{2})(?:\s|,|$)/;
  const zipPattern = /\b(\d{5}(-\d{4})?)\b/;
  
  let state = null;
  let zipCode = null;
  let city = null;
  
  // Try to extract state and zip together
  const stateZipMatch = address.match(stateZipPattern);
  if (stateZipMatch) {
    state = stateZipMatch[1];
    zipCode = stateZipMatch[2];
  } else {
    // Try to extract state alone
    const stateMatch = address.match(statePattern);
    if (stateMatch) {
      state = stateMatch[1];
    }
    
    // Try to extract zip alone
    const zipMatch = address.match(zipPattern);
    if (zipMatch) {
      zipCode = zipMatch[1];
    }
  }
  
  // Try to extract city (text before the last comma and state)
  if (state) {
    const cityPattern = new RegExp(`([^,]+),\\s*${state}`);
    const cityMatch = address.match(cityPattern);
    if (cityMatch) {
      const cityPart = cityMatch[1].trim();
      // Remove any preceding address parts
      const cityWords = cityPart.split(',');
      city = cityWords[cityWords.length - 1].trim();
    }
  }
  
  return { city, state, zipCode };
}

// Function to process a single Excel file
async function processExcelFile(filePath, fileName) {
  try {
    console.log(`📄 Processing: ${fileName}`);
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length < 2) {
      console.log(`⚠️  Skipping ${fileName}: No data rows found`);
      return { processed: 0, errors: 0 };
    }
    
    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    // Map headers to our database columns
    const columnMap = {};
    
    for (const [dbColumn, possibleNames] of Object.entries(columnMapping)) {
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i]?.toString().trim();
        if (header && possibleNames.some(name => name.toLowerCase() === header.toLowerCase())) {
          columnMap[dbColumn] = i;
          break;
        }
      }
    }
    
    console.log(`   📊 Found columns:`, Object.keys(columnMap));
    
    // Prepare insert statement
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO leads (
        name_of_business, type_of_business, sub_category, website, phone_number, email,
        business_address, city, state, zip_code, rating, num_reviews, latest_review,
        notes, source_file, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let fileProcessed = 0;
    let fileErrors = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      try {
        // Extract data using column mapping
        const businessName = row[columnMap.name_of_business] || '';
        const businessAddress = row[columnMap.business_address] || '';
        
        // Skip rows without essential data
        if (!businessName && !businessAddress) {
          continue;
        }
        
        // Extract location info from address if not in separate columns
        const addressLocation = extractLocationFromAddress(businessAddress);
        
        const leadData = {
          nameOfBusiness: businessName?.toString().trim() || '',
          typeOfBusiness: row[columnMap.type_of_business]?.toString().trim() || '',
          subCategory: row[columnMap.sub_category]?.toString().trim() || '',
          website: row[columnMap.website]?.toString().trim() || null,
          phoneNumber: row[columnMap.phone_number]?.toString().trim() || null,
          email: row[columnMap.email]?.toString().trim() || null,
          businessAddress: businessAddress,
          city: row[columnMap.city]?.toString().trim() || addressLocation.city,
          state: row[columnMap.state]?.toString().trim() || addressLocation.state,
          zipCode: row[columnMap.zip_code]?.toString().trim() || addressLocation.zipCode,
          rating: parseFloat(row[columnMap.rating]) || null,
          numReviews: parseInt(row[columnMap.num_reviews]) || 0,
          latestReview: row[columnMap.latest_review]?.toString().trim() || null,
          notes: row[columnMap.notes]?.toString().trim() || null,
          sourceFile: fileName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await new Promise((resolve, reject) => {
          stmt.run(
            leadData.nameOfBusiness,
            leadData.typeOfBusiness,
            leadData.subCategory,
            leadData.website,
            leadData.phoneNumber,
            leadData.email,
            leadData.businessAddress,
            leadData.city,
            leadData.state,
            leadData.zipCode,
            leadData.rating,
            leadData.numReviews,
            leadData.latestReview,
            leadData.notes,
            leadData.sourceFile,
            leadData.createdAt,
            leadData.updatedAt,
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        fileProcessed++;
        
      } catch (rowError) {
        fileErrors++;
        console.log(`   ⚠️  Row ${i + 1} error:`, rowError.message);
      }
    }
    
    stmt.finalize();
    
    console.log(`   ✅ ${fileName}: ${fileProcessed} leads imported, ${fileErrors} errors`);
    return { processed: fileProcessed, errors: fileErrors };
    
  } catch (error) {
    console.error(`   ❌ Error processing ${fileName}:`, error.message);
    return { processed: 0, errors: 1 };
  }
}

// Main import function
async function importAllLeadFiles() {
  console.log('🚀 Starting import of all lead files...\n');
  
  try {
    // Get list of Excel files
    const files = await fs.readdir(filesDir);
    const excelFiles = files.filter(file => 
      file.endsWith('.xlsx') || file.endsWith('.xls') || file.endsWith('.csv')
    );
    
    totalFiles = excelFiles.length;
    console.log(`📁 Found ${totalFiles} lead files to process\n`);
    
    // Process each file
    for (const fileName of excelFiles) {
      const filePath = path.join(filesDir, fileName);
      
      try {
        const result = await processExcelFile(filePath, fileName);
        successfulLeads += result.processed;
        errorLeads += result.errors;
        totalLeads += result.processed + result.errors;
        processedFiles++;
        
        // Progress update
        const progressPercent = Math.round((processedFiles / totalFiles) * 100);
        console.log(`📊 Progress: ${processedFiles}/${totalFiles} files (${progressPercent}%)\n`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${fileName}:`, fileError.message);
        processedFiles++;
      }
    }
    
    // Final summary
    console.log('🎉 IMPORT COMPLETE!\n');
    console.log('📊 FINAL SUMMARY:');
    console.log(`   📁 Files processed: ${processedFiles}/${totalFiles}`);
    console.log(`   ✅ Leads imported: ${successfulLeads}`);
    console.log(`   ❌ Errors: ${errorLeads}`);
    console.log(`   📈 Total records: ${totalLeads}`);
    
    // Show database statistics
    await showDatabaseStats();
    
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n✅ Database connection closed successfully');
        console.log('🎯 Lead data is now ready for the backend system!');
      }
    });
  }
}

// Function to show database statistics
async function showDatabaseStats() {
  return new Promise((resolve) => {
    console.log('\n📊 DATABASE STATISTICS:');
    
    // Total leads count
    db.get('SELECT COUNT(*) as count FROM leads', (err, row) => {
      if (!err) {
        console.log(`   📈 Total leads in database: ${row.count}`);
      }
    });
    
    // Top business types
    db.all(
      'SELECT type_of_business, COUNT(*) as count FROM leads WHERE type_of_business IS NOT NULL AND type_of_business != "" GROUP BY type_of_business ORDER BY count DESC LIMIT 10',
      (err, rows) => {
        if (!err) {
          console.log('\n   🏢 Top Business Types:');
          rows.forEach(row => {
            console.log(`      ${row.type_of_business}: ${row.count} leads`);
          });
        }
      }
    );
    
    // Top states
    db.all(
      'SELECT state, COUNT(*) as count FROM leads WHERE state IS NOT NULL AND state != "" GROUP BY state ORDER BY count DESC LIMIT 10',
      (err, rows) => {
        if (!err) {
          console.log('\n   🌍 Top States:');
          rows.forEach(row => {
            console.log(`      ${row.state}: ${row.count} leads`);
          });
        }
      }
    );
    
    // Leads with contact info
    db.get('SELECT COUNT(*) as count FROM leads WHERE phone_number IS NOT NULL', (err, row) => {
      if (!err) {
        console.log(`\n   📞 Leads with phone numbers: ${row.count}`);
      }
    });
    
    db.get('SELECT COUNT(*) as count FROM leads WHERE email IS NOT NULL', (err, row) => {
      if (!err) {
        console.log(`   📧 Leads with email addresses: ${row.count}`);
      }
    });
    
    db.get('SELECT COUNT(*) as count FROM leads WHERE website IS NOT NULL', (err, row) => {
      if (!err) {
        console.log(`   🌐 Leads with websites: ${row.count}`);
      }
      resolve();
    });
  });
}

// Run the import
importAllLeadFiles(); 