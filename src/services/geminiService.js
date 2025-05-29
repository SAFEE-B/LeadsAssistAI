const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getAll, getOne, runQuery } = require('../database/setup');
const { addScrapingJob, addProcessingJob, getQueueStats } = require('../queues/setup');
const FileGenerationService = require('./fileGenerationService');
const logger = require('../utils/logger');

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      tools: [this.getToolDefinitions()]
    });
    
    // Initialize file generation service
    this.fileService = new FileGenerationService();
  }

  // Define tools that Gemini can call
  getToolDefinitions() {
    return {
      function_declarations: [
        {
          name: "get_lead_count",
          description: "Get the total count of leads in the database, optionally filtered by location or business type",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city name"
              },
              state: {
                type: "string", 
                description: "Filter by state name or abbreviation"
              },
              zipCode: {
                type: "string",
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type or category"
              }
            }
          }
        },
        {
          name: "search_leads",
          description: "Search for leads based on various criteria with pagination",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default 10, max 1000)"
              },
              offset: {
                type: "number",
                description: "Number of records to skip for pagination (default 0)"
              }
            }
          }
        },
        {
          name: "get_all_leads",
          description: "Get ALL leads from the database with optional filters. Use with caution as this can return large datasets.",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              maxResults: {
                type: "number",
                description: "Safety limit to prevent overwhelming responses (default 10000)"
              }
            }
          }
        },
        {
          name: "start_scraping_job",
          description: "Start a new scraping job to find leads",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "Location to search (city, state, or zip code)"
              },
              businessType: {
                type: "string", 
                description: "Type of business to search for"
              },
              maxResults: {
                type: "number",
                description: "Maximum number of results to scrape (default 100)"
              }
            },
            required: ["location", "businessType"]
          }
        },
        {
          name: "get_queue_status",
          description: "Get the current status of scraping and processing queues",
          parameters: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "get_recent_files",
          description: "Get list of recently generated files and deliveries",
          parameters: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Number of files to return (default 5)"
              }
            }
          }
        },
        {
          name: "export_leads_to_file",
          description: "Export leads to a downloadable file (CSV or Excel) and save to deliveries",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              format: {
                type: "string",
                description: "File format: 'csv' or 'excel' (default: csv)"
              },
              filename: {
                type: "string",
                description: "Custom filename (optional)"
              },
              maxResults: {
                type: "number",
                description: "Maximum number of leads to export (default 10000)"
              }
            }
          }
        }
      ]
    };
  }

  // Execute tool functions
  async executeFunction(functionName, args) {
    try {
      logger.info(`Executing function: ${functionName}`, { args });

      switch (functionName) {
        case 'get_lead_count':
          return await this.getLeadCount(args);
        
        case 'search_leads':
          return await this.searchLeads(args);
        
        case 'get_all_leads':
          return await this.getAllLeads(args);
        
        case 'export_leads_to_file':
          return await this.exportLeadsToFile(args);
        
        case 'start_scraping_job':
          return await this.startScrapingJob(args);
        
        case 'get_queue_status':
          return await this.getQueueStatus();
        
        case 'get_recent_files':
          return await this.getRecentFiles(args);
        
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      logger.error(`Error executing function ${functionName}:`, error);
      return { error: error.message };
    }
  }

  // Helper function to convert state names to abbreviations
  mapStateToAbbreviation(state) {
    if (!state) return state;
    
    const stateMap = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
      'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
      'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
      'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
      'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
      'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
      'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
      'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    const lowerState = state.toLowerCase();
    return stateMap[lowerState] || state;
  }

  // Helper function to build state query condition
  buildStateCondition(state, query, params) {
    if (!state) return;
    
    const stateAbbr = this.mapStateToAbbreviation(state);
    
    // If we mapped to an abbreviation, search for exact match
    if (stateAbbr !== state && stateAbbr.length === 2) {
      query += ' AND UPPER(state) = UPPER(?)';
      params.push(stateAbbr);
    } else {
      // Search for both the original input and potential abbreviation
      query += ' AND (LOWER(state) LIKE LOWER(?) OR LOWER(state) LIKE LOWER(?))';
      params.push(`%${state}%`, `%${stateAbbr}%`);
    }
    
    return query;
  }

  async getLeadCount(args) {
    const { city, state, zipCode, businessType } = args;
    
    let query = 'SELECT COUNT(*) as count FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }
    if (businessType) {
      query += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      params.push(`%${businessType}%`);
    }

    const result = await getOne(query, params);
    return { count: result.count, filters: args };
  }

  async searchLeads(args) {
    const { city, state, zipCode, businessType, limit = 10, offset = 0 } = args;
    
    // Enforce reasonable limits
    const safeLimit = Math.min(limit, 1000);
    const safeOffset = Math.max(offset, 0);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }
    if (businessType) {
      query += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      params.push(`%${businessType}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    const leads = await getAll(query, params);
    
    // Get total count for pagination info
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    
    if (city) {
      countQuery += ' AND LOWER(city) LIKE LOWER(?)';
      countParams.push(`%${city}%`);
    }
    if (state) {
      countQuery = this.buildStateCondition(state, countQuery, countParams);
    }
    if (zipCode) {
      countQuery += ' AND zip_code = ?';
      countParams.push(zipCode);
    }
    if (businessType) {
      countQuery += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      countParams.push(`%${businessType}%`);
    }
    
    const totalResult = await getOne(countQuery, countParams);
    const total = totalResult.total;
    
    return { 
      leads, 
      count: leads.length, 
      total: total,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: (safeOffset + safeLimit) < total,
      filters: args 
    };
  }

  async getAllLeads(args) {
    const { city, state, zipCode, businessType, maxResults = 10000, generateFile = false } = args;
    
    // Safety check - prevent overwhelming responses
    const safeMaxResults = Math.min(maxResults, 50000);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }
    if (businessType) {
      query += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      params.push(`%${businessType}%`);
    }

    // Add safety limit and ordering
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(safeMaxResults);

    const leads = await getAll(query, params);
    
    // Get total count to see if we hit the limit
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    
    if (city) {
      countQuery += ' AND LOWER(city) LIKE LOWER(?)';
      countParams.push(`%${city}%`);
    }
    if (state) {
      countQuery = this.buildStateCondition(state, countQuery, countParams);
    }
    if (zipCode) {
      countQuery += ' AND zip_code = ?';
      countParams.push(zipCode);
    }
    if (businessType) {
      countQuery += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      countParams.push(`%${businessType}%`);
    }
    
    const totalResult = await getOne(countQuery, countParams);
    const total = totalResult.total;
    const truncated = total > safeMaxResults;
    
    // Auto-generate file for large datasets
    let fileInfo = null;
    if (leads.length > 0) {
      try {
        fileInfo = await this.fileService.generateLeadsFile(leads, {
          format: 'csv',
          filters: { city, state, zipCode, businessType },
          requestType: 'get_all_leads'
        });
      } catch (fileError) {
        logger.error('Error generating file for getAllLeads:', fileError);
        // Continue without file generation
      }
    }
    
    return { 
      leads: leads.slice(0, 10), // Only show first 10 in chat for readability
      count: leads.length,
      total: total,
      truncated: truncated,
      maxResults: safeMaxResults,
      message: truncated ? 
        `Generated file with first ${leads.length} of ${total} total leads (truncated for performance)` :
        `Generated file with all ${leads.length} leads`,
      file: fileInfo,
      filters: args 
    };
  }

  async startScrapingJob(args) {
    const { location, businessType, maxResults = 100 } = args;
    
    const jobData = {
      query: `${businessType} in ${location}`,
      location: location,
      businessType: businessType,
      maxResults: maxResults,
      source: 'conversation',
      timestamp: new Date().toISOString()
    };

    const job = await addScrapingJob(jobData);
    
    return {
      success: true,
      jobId: job.id,
      message: `Started scraping job for ${businessType} in ${location}`,
      estimatedResults: maxResults
    };
  }

  async getQueueStatus() {
    const stats = await getQueueStats();
    return {
      scraperQueue: stats.scraperQueue,
      processingQueue: stats.processingQueue,
      totalActive: stats.scraperQueue.active + stats.processingQueue.active,
      totalWaiting: stats.scraperQueue.waiting + stats.processingQueue.waiting
    };
  }

  async getRecentFiles(args) {
    const { limit = 5 } = args;
    
    try {
      const files = await this.fileService.getRecentDeliveries(limit);
      return {
        files,
        count: files.length,
        message: files.length > 0 ? 
          `Found ${files.length} recent deliveries` : 
          'No recent deliveries found'
      };
    } catch (error) {
      logger.error('Error getting recent files:', error);
      return {
        files: [],
        count: 0,
        message: "Error retrieving deliveries",
        error: error.message
      };
    }
  }

  async exportLeadsToFile(args) {
    const { city, state, zipCode, businessType, format = 'csv', filename, maxResults = 10000 } = args;
    
    // Safety check
    const safeMaxResults = Math.min(maxResults, 50000);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }
    if (businessType) {
      query += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      params.push(`%${businessType}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(safeMaxResults);

    const leads = await getAll(query, params);
    
    if (leads.length === 0) {
      return {
        success: false,
        message: 'No leads found matching your criteria',
        count: 0,
        filters: args
      };
    }

    // Generate file
    const fileInfo = await this.fileService.generateLeadsFile(leads, {
      format,
      filename,
      filters: { city, state, zipCode, businessType },
      requestType: 'export_leads'
    });

    return {
      success: true,
      message: `Successfully exported ${leads.length} leads to ${format.toUpperCase()} file`,
      file: fileInfo,
      count: leads.length,
      downloadUrl: fileInfo.downloadUrl,
      filename: fileInfo.filename,
      format: fileInfo.format,
      size: fileInfo.sizeFormatted,
      filters: args
    };
  }

  // Main conversation method
  async processConversation(message, conversationHistory = []) {
    try {
      // Build conversation context with proper role mapping
      const chatHistory = conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Map assistant -> model for Gemini
        parts: [{ text: msg.content }]
      }));

      // Add current user message
      chatHistory.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // System prompt to guide Gemini's behavior
      const systemPrompt = `You are an AI assistant for a lead generation system. You help users manage leads, start scraping jobs, and analyze data.

Available tools:
- get_lead_count: Count leads with optional filters
- search_leads: Find specific leads
- start_scraping_job: Start new lead generation jobs
- get_queue_status: Check job queues
- get_recent_files: View recent deliveries

Be helpful, concise, and use tools when appropriate. Always confirm actions before starting scraping jobs.`;

      // Start chat with system prompt
      const chat = this.model.startChat({
        history: [{
          role: 'user',
          parts: [{ text: systemPrompt }]
        }, {
          role: 'model', 
          parts: [{ text: 'I understand. I\'m ready to help you manage your lead generation system.' }]
        }, ...chatHistory.slice(0, -1)]
      });

      // Send user message and get response
      const result = await chat.sendMessage(message);
      const response = result.response;

      // Check if Gemini wants to call functions
      const functionCalls = response.functionCalls();
      let toolResults = [];
      
      if (functionCalls && functionCalls.length > 0) {
        // Execute each function call
        for (const functionCall of functionCalls) {
          const functionResult = await this.executeFunction(
            functionCall.name, 
            functionCall.args
          );
          
          toolResults.push({
            functionName: functionCall.name,
            result: functionResult
          });
        }

        // Send function results back to Gemini for final response
        const functionResponse = await chat.sendMessage([{
          functionResponse: {
            name: functionCalls[0].name,
            response: toolResults[0].result
          }
        }]);

        return {
          message: functionResponse.response.text(),
          toolCalls: toolResults,
          type: 'function_result'
        };
      } else {
        // Regular text response
        return {
          message: response.text(),
          type: 'text'
        };
      }

    } catch (error) {
      logger.error('Error in Gemini conversation:', error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

module.exports = GeminiService; 