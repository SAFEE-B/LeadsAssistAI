const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { getAll, getOne, runQuery } = require('../database/setup');
const { addScrapingJob, addProcessingJob } = require('../queues/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Store conversation context (in production, use Redis or database)
const conversationContexts = new Map();

// Validation schemas
const conversationSchema = Joi.object({
  message: Joi.string().required(),
  conversationId: Joi.string().optional(),
  userId: Joi.string().optional()
});

// Main conversation endpoint for LLM integration
router.post('/chat', async (req, res) => {
  try {
    const { error, value } = conversationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { message, conversationId, userId = 'default' } = value;
    const currentConversationId = conversationId || uuidv4();
    
    // Get or create conversation context
    let context = conversationContexts.get(currentConversationId) || {
      id: currentConversationId,
      userId,
      messages: [],
      pendingActions: [],
      state: 'active'
    };

    // Add user message to context
    context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Process the message and generate response
    const response = await processConversationalMessage(message, context);
    
    // Add assistant response to context
    context.messages.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      actions: response.actions || [],
      data: response.data || {}
    });

    // Update context
    conversationContexts.set(currentConversationId, context);

    logger.info(`Conversation ${currentConversationId}: Processed message`, {
      userId,
      messageLength: message.length,
      responseType: response.type
    });

    res.json({
      success: true,
      conversationId: currentConversationId,
      message: response.message,
      type: response.type,
      actions: response.actions || [],
      data: response.data || {},
      suggestions: response.suggestions || []
    });

  } catch (error) {
    logger.error('Error processing conversation:', error);
    res.status(500).json({ 
      error: 'Failed to process conversation',
      message: error.message
    });
  }
});

// Get conversation history
router.get('/history/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const context = conversationContexts.get(conversationId);

    if (!context) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: context
    });

  } catch (error) {
    logger.error('Error getting conversation history:', error);
    res.status(500).json({ 
      error: 'Failed to get conversation history',
      message: error.message
    });
  }
});

// Handle user confirmations/responses to pending actions
router.post('/respond/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { action, response: userResponse, data } = req.body;

    const context = conversationContexts.get(conversationId);
    if (!context) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const result = await handleUserResponse(action, userResponse, data, context);
    
    // Add response to conversation
    context.messages.push({
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
      actions: result.actions || [],
      data: result.data || {}
    });

    conversationContexts.set(conversationId, context);

    res.json({
      success: true,
      message: result.message,
      type: result.type,
      actions: result.actions || [],
      data: result.data || {}
    });

  } catch (error) {
    logger.error('Error handling user response:', error);
    res.status(500).json({ 
      error: 'Failed to handle response',
      message: error.message
    });
  }
});

// Process conversational messages
async function processConversationalMessage(message, context) {
  const lowerMessage = message.toLowerCase();

  // Lead count queries
  if (lowerMessage.includes('how many leads') || lowerMessage.includes('count') || lowerMessage.includes('total leads')) {
    return await handleLeadCountQuery(message, context);
  }

  // Lead search queries
  if (lowerMessage.includes('show me') || lowerMessage.includes('find') || lowerMessage.includes('get leads')) {
    return await handleLeadSearchQuery(message, context);
  }

  // Scraping requests
  if (lowerMessage.includes('scrape') || lowerMessage.includes('get new leads') || lowerMessage.includes('find new')) {
    return await handleScrapingRequest(message, context);
  }

  // Job status queries
  if (lowerMessage.includes('status') || lowerMessage.includes('progress') || lowerMessage.includes('jobs')) {
    return await handleJobStatusQuery(message, context);
  }

  // File/delivery queries
  if (lowerMessage.includes('files') || lowerMessage.includes('download') || lowerMessage.includes('delivery')) {
    return await handleFileQuery(message, context);
  }

  // Default response with suggestions
  return {
    type: 'suggestion',
    message: "I can help you with:\n• Checking lead counts by location or business type\n• Searching existing leads\n• Starting new scraping jobs\n• Checking job status\n• Managing files and deliveries\n\nWhat would you like to do?",
    suggestions: [
      "How many leads do we have in California?",
      "Show me all gyms in New York",
      "Start scraping restaurants in zip code 90210",
      "What jobs are currently running?",
      "Show me recent deliveries"
    ]
  };
}

// Handle lead count queries
async function handleLeadCountQuery(message, context) {
  const filters = parseLocationAndBusinessFilters(message);
  
  let query = 'SELECT COUNT(*) as count FROM leads WHERE 1=1';
  const params = [];

  // Apply filters
  if (filters.state) {
    query += ' AND UPPER(state) = UPPER(?)';
    params.push(filters.state);
  }
  
  if (filters.city) {
    query += ' AND UPPER(city) LIKE UPPER(?)';
    params.push(`%${filters.city}%`);
  }
  
  if (filters.zipCode) {
    query += ' AND zip_code = ?';
    params.push(filters.zipCode);
  }
  
  if (filters.businessType) {
    query += ' AND UPPER(type_of_business) LIKE UPPER(?)';
    params.push(`%${filters.businessType}%`);
  }

  const result = await getOne(query, params);
  const count = result?.count || 0;

  // Generate contextual response
  let locationDesc = '';
  if (filters.state) locationDesc += ` in ${filters.state}`;
  if (filters.city) locationDesc += ` in ${filters.city}`;
  if (filters.zipCode) locationDesc += ` in zip code ${filters.zipCode}`;
  
  let businessDesc = filters.businessType ? ` for ${filters.businessType}` : '';

  const responseText = count > 0 
    ? `I found ${count} leads${businessDesc}${locationDesc}. Would you like me to show you these leads or get more details?`
    : `I don\'t have any leads${businessDesc}${locationDesc} in our database. Would you like me to start scraping for new leads?`;

  const actions = count > 0 
    ? ['show_leads', 'get_details', 'start_scraping']
    : ['start_scraping', 'modify_search'];

  return {
    type: 'lead_count',
    message: responseText,
    actions,
    data: {
      count,
      filters,
      hasResults: count > 0
    },
    suggestions: count > 0 
      ? [`Show me these ${count} leads`, 'Get more details', 'Start scraping for more']
      : ['Start scraping for new leads', 'Try different search criteria']
  };
}

// Handle lead search queries
async function handleLeadSearchQuery(message, context) {
  const filters = parseLocationAndBusinessFilters(message);
  
  let query = 'SELECT * FROM leads WHERE 1=1';
  const params = [];

  // Apply filters (same logic as count query)
  if (filters.state) {
    query += ' AND UPPER(state) = UPPER(?)';
    params.push(filters.state);
  }
  
  if (filters.city) {
    query += ' AND UPPER(city) LIKE UPPER(?)';
    params.push(`%${filters.city}%`);
  }
  
  if (filters.zipCode) {
    query += ' AND zip_code = ?';
    params.push(filters.zipCode);
  }
  
  if (filters.businessType) {
    query += ' AND UPPER(type_of_business) LIKE UPPER(?)';
    params.push(`%${filters.businessType}%`);
  }

  // Add rating filter if mentioned
  if (message.includes('high rating') || message.includes('well rated')) {
    query += ' AND rating >= 4.0';
  }

  query += ' ORDER BY rating DESC, num_reviews DESC LIMIT 50';

  const leads = await getAll(query, params);

  if (leads.length > 0) {
    // Generate summary
    const avgRating = leads.reduce((sum, lead) => sum + (lead.rating || 0), 0) / leads.length;
    const totalReviews = leads.reduce((sum, lead) => sum + (lead.num_reviews || 0), 0);

    return {
      type: 'lead_results',
      message: `Found ${leads.length} leads matching your criteria. Average rating: ${avgRating.toFixed(1)}, Total reviews: ${totalReviews}. Would you like me to export these to a file or show more details?`,
      actions: ['export_leads', 'show_details', 'refine_search'],
      data: {
        leads: leads.slice(0, 10), // Send first 10 for preview
        totalCount: leads.length,
        summary: { avgRating, totalReviews },
        filters
      },
      suggestions: [
        'Export these leads to Excel',
        'Show me more details',
        'Refine my search criteria'
      ]
    };
  } else {
    return {
      type: 'no_results',
      message: `No leads found matching your criteria. Would you like me to start scraping for new leads or modify your search?`,
      actions: ['start_scraping', 'modify_search'],
      data: { filters },
      suggestions: [
        'Start scraping for new leads',
        'Try different search criteria',
        'Search in nearby areas'
      ]
    };
  }
}

// Handle scraping requests
async function handleScrapingRequest(message, context) {
  const filters = parseLocationAndBusinessFilters(message);
  
  if (!filters.businessType && !filters.state && !filters.city && !filters.zipCode) {
    return {
      type: 'need_details',
      message: "I'd be happy to start scraping for new leads! Please specify:\n• What type of businesses (e.g., gyms, restaurants, hotels)\n• Location (state, city, or zip code)",
      actions: ['provide_details'],
      suggestions: [
        'Scrape gyms in California',
        'Find restaurants in zip code 90210',
        'Get hotels in New York'
      ]
    };
  }

  // Check if we already have leads in this area
  let existingQuery = 'SELECT COUNT(*) as count FROM leads WHERE 1=1';
  const existingParams = [];

  if (filters.state) {
    existingQuery += ' AND UPPER(state) = UPPER(?)';
    existingParams.push(filters.state);
  }
  if (filters.zipCode) {
    existingQuery += ' AND zip_code = ?';
    existingParams.push(filters.zipCode);
  }
  if (filters.businessType) {
    existingQuery += ' AND UPPER(type_of_business) LIKE UPPER(?)';
    existingParams.push(`%${filters.businessType}%`);
  }

  const existing = await getOne(existingQuery, existingParams);
  const existingCount = existing?.count || 0;

  if (existingCount > 0) {
    return {
      type: 'confirm_scraping',
      message: `I found ${existingCount} existing leads matching your criteria. Would you like to:\n• Use existing leads\n• Scrape for additional leads\n• Scrape only new areas`,
      actions: ['use_existing', 'scrape_additional', 'scrape_new_areas'],
      data: {
        existingCount,
        filters,
        scrapingParams: {
          businessTypes: filters.businessType ? [filters.businessType] : [],
          zipCodes: filters.zipCode ? [filters.zipCode] : [],
          states: filters.state ? [filters.state] : []
        }
      },
      suggestions: [
        'Use existing leads',
        'Scrape for more leads',
        'Scrape different areas'
      ]
    };
  } else {
    // Start scraping directly
    const jobId = uuidv4();
    
    const scrapingParams = {
      businessTypes: filters.businessType ? [filters.businessType] : ['general'],
      zipCodes: filters.zipCode ? [filters.zipCode] : [],
      states: filters.state ? [filters.state] : []
    };

    // If no specific zip codes but have state/city, we might need to handle differently
    if (scrapingParams.zipCodes.length === 0 && (filters.state || filters.city)) {
      scrapingParams.zipCodes = ['DEFAULT']; // You might want to implement city-to-zipcode lookup
    }

    try {
      await addScrapingJob({
        jobId,
        clientName: 'LLM_User',
        businessTypes: scrapingParams.businessTypes,
        zipCodes: scrapingParams.zipCodes,
        states: scrapingParams.states,
        queries: [] // Will be generated in processor
      });

      return {
        type: 'scraping_started',
        message: `Great! I've started scraping for ${filters.businessType || 'businesses'} ${filters.state ? `in ${filters.state}` : ''}${filters.zipCode ? ` (zip: ${filters.zipCode})` : ''}. Job ID: ${jobId}\n\nI'll automatically format and process the results when scraping is complete. You can check the progress in the queue section.`,
        actions: ['check_progress'],
        data: {
          jobId,
          scrapingParams,
          estimatedTime: '15-30 minutes'
        },
        suggestions: [
          'Check job progress',
          'Start another scraping job',
          'View current queue'
        ]
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Sorry, I couldn't start the scraping job. Error: ${error.message}`,
        actions: ['retry', 'modify_request'],
        suggestions: ['Try again', 'Modify the request']
      };
    }
  }
}

// Handle job status queries
async function handleJobStatusQuery(message, context) {
  try {
    // Get recent jobs
    const scrapingJobs = await getAll(`
      SELECT * FROM scraping_jobs 
      WHERE created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    const processingJobs = await getAll(`
      SELECT * FROM processing_jobs 
      WHERE created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    const activeJobs = [...scrapingJobs, ...processingJobs].filter(job => 
      job.status === 'pending' || job.status === 'processing'
    );

    const completedJobs = [...scrapingJobs, ...processingJobs].filter(job => 
      job.status === 'completed'
    );

    let message = '';
    if (activeJobs.length > 0) {
      message += `📋 Active Jobs (${activeJobs.length}):\n`;
      activeJobs.forEach(job => {
        message += `• ${job.job_id}: ${job.status} (${job.type || 'scraping'})\n`;
      });
    }

    if (completedJobs.length > 0) {
      message += `\n✅ Recently Completed (${completedJobs.length}):\n`;
      completedJobs.slice(0, 5).forEach(job => {
        message += `• ${job.job_id}: ${job.type || 'scraping'}\n`;
      });
    }

    if (activeJobs.length === 0 && completedJobs.length === 0) {
      message = 'No recent jobs found. Would you like to start a new scraping job?';
    }

    return {
      type: 'job_status',
      message,
      actions: activeJobs.length > 0 ? ['view_details', 'check_queue'] : ['start_job'],
      data: {
        activeJobs,
        completedJobs,
        totalActive: activeJobs.length,
        totalCompleted: completedJobs.length
      },
      suggestions: [
        'View job details',
        'Check queue status',
        'Start new job'
      ]
    };

  } catch (error) {
    return {
      type: 'error',
      message: `Sorry, I couldn't retrieve job status. Error: ${error.message}`,
      suggestions: ['Try again', 'Check system status']
    };
  }
}

// Handle file/delivery queries
async function handleFileQuery(message, context) {
  // This would integrate with the files route
  return {
    type: 'file_info',
    message: "I can help you with file management. What would you like to do?",
    actions: ['list_files', 'recent_deliveries'],
    suggestions: [
      'Show recent files',
      'List all deliveries',
      'Download latest file'
    ]
  };
}

// Handle user responses to pending actions
async function handleUserResponse(action, userResponse, data, context) {
  switch (action) {
    case 'show_leads':
      if (userResponse === 'yes' || userResponse === 'show') {
        // Return the leads data
        return {
          type: 'lead_display',
          message: 'Here are your leads:',
          data: data
        };
      }
      break;

    case 'start_scraping':
      if (userResponse === 'yes' || userResponse === 'start') {
        // Start scraping job
        return await startScrapingFromContext(data);
      }
      break;

    case 'use_existing':
      return {
        type: 'existing_leads',
        message: `Great! I'll prepare the ${data.existingCount} existing leads for download.`,
        actions: ['export_existing'],
        data: data
      };

    case 'scrape_additional':
      return await startScrapingFromContext(data);
  }

  return {
    type: 'acknowledgment',
    message: 'Got it! What else can I help you with?'
  };
}

// Helper function to start scraping from context
async function startScrapingFromContext(data) {
  try {
    const jobId = uuidv4();
    
    await addScrapingJob({
      jobId,
      clientName: 'LLM_User',
      ...data.scrapingParams,
      queries: []
    });

    return {
      type: 'scraping_started',
      message: `Scraping job started! Job ID: ${jobId}. I'll process the results automatically when complete.`,
      data: { jobId }
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to start scraping: ${error.message}`
    };
  }
}

// Parse location and business filters from natural language
function parseLocationAndBusinessFilters(message) {
  const filters = {};
  const lowerMessage = message.toLowerCase();

  // Business type patterns
  const businessTypes = [
    'gym', 'gyms', 'fitness', 'restaurant', 'restaurants', 'hotel', 'hotels', 
    'warehouse', 'warehouses', 'factory', 'factories', 'school', 'schools',
    'laundromat', 'laundromats', 'auto repair', 'nursing home', 'nursing homes',
    'mobile home park', 'mobile home parks', 'rv park', 'rv parks', 'apartment', 'apartments'
  ];
  
  for (const type of businessTypes) {
    if (lowerMessage.includes(type)) {
      filters.businessType = type;
      break;
    }
  }

  // State patterns
  const statePatterns = [
    { pattern: /\bcalifornia\b|\bca\b/, state: 'CA' },
    { pattern: /\btexas\b|\btx\b/, state: 'TX' },
    { pattern: /\bflorida\b|\bfl\b/, state: 'FL' },
    { pattern: /\bnew york\b|\bny\b/, state: 'NY' },
    { pattern: /\bwashington\b|\bwa\b/, state: 'WA' },
    { pattern: /\bnevada\b|\bnv\b/, state: 'NV' },
    { pattern: /\boregon\b|\bor\b/, state: 'OR' },
    { pattern: /\barizona\b|\baz\b/, state: 'AZ' },
    { pattern: /\butah\b|\but\b/, state: 'UT' },
    { pattern: /\bcolorado\b|\bco\b/, state: 'CO' }
  ];

  for (const { pattern, state } of statePatterns) {
    if (pattern.test(lowerMessage)) {
      filters.state = state;
      break;
    }
  }

  // Zip code pattern
  const zipMatch = lowerMessage.match(/\b\d{5}\b/);
  if (zipMatch) {
    filters.zipCode = zipMatch[0];
  }

  // City patterns (simple extraction after "in")
  const cityMatch = lowerMessage.match(/\bin\s+([a-zA-Z\s]+?)(?:\s|$|,)/);
  if (cityMatch && cityMatch[1] && !filters.state) {
    const potentialCity = cityMatch[1].trim();
    if (potentialCity.length > 2 && potentialCity.length < 30) {
      filters.city = potentialCity;
    }
  }

  return filters;
}

module.exports = router; 