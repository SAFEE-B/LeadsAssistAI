# Lead Generation Backend

An automated lead generation system with queue management and **LLM conversational interface**, built with Node.js and Redis. This backend automates the process of scraping business leads from Google Maps, formatting the data, and processing it for clients, while providing an intelligent chatbot interface for natural language interactions.

## Features

- **LLM Conversational Interface**: Natural language chatbot for lead queries and job management
- **Queue-based Architecture**: A dedicated `scraperQueue` for web scraping tasks and a versatile `processingQueue` for subsequent data handling (e.g., formatting, enriching).
- **Automated Workflow**: Scraper (Python) -> `LeadsApart.csv` -> Processing (e.g., formatting to Excel, further enrichment).
- **Concurrent Processing**: The `processingQueue` can handle multiple job types (like formatting, lead enrichment) concurrently.
- **Intelligent Lead Search**: Enhanced search with multiple filters, combinations, and natural language queries
- **Delivery Management**: Track and manage completed files with download capabilities
- **REST API**: Comprehensive API for managing jobs, querying leads, and file operations
- **Real-time Monitoring**: Job progress tracking and system health monitoring
- **File Management**: Upload, download, and preview functionality for Excel/CSV files
- **Database Storage**: SQLite database for leads and job tracking

## Frontend Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND INTERFACE                           │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   LLM CHATBOX   │  │   QUEUE VIEW    │  │   DELIVERIES    │ │
│  │                 │  │                 │  │                 │ │
│  │ • Natural Lang  │  │ • Active Jobs   │  │ • Completed     │ │
│  │ • Lead Queries  │  │ • Progress      │  │ • Download      │ │
│  │ • Job Creation  │  │ • Queue Stats   │  │ • File Info     │ │
│  │ • Smart Replies │  │ • Status        │  │ • History       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                   BACKEND API                                  │
│                                                                 │
│  /api/conversation  → LLM chat processing                      │
│  /api/delivery      → File delivery management                 │
│  /api/leads/search  → Enhanced lead search                     │
│  /api/scraper       → Scraper job creation & management        │
│  /api/processing    → Processing job creation & management     │
│  /api/status        → Real-time monitoring                     │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

The system uses a two-stage queue process:

1.  **Scraper Queue (`scraperQueue`):**
    *   Handles 'scrape' jobs.
    *   A job is added via the API (e.g., business type and zip code).
    *   The `scraperProcessor.js` picks up the job.
    *   It writes the query to `queries.txt`.
    *   It executes the Python script (`maintemp.py`).
    *   `maintemp.py` reads `queries.txt` and outputs `LeadsApart.csv`.
    *   The processor then may trigger a job on the `processingQueue`.

2.  **Processing Queue (`processingQueue`):**
    *   Handles various job types for data manipulation after scraping (e.g., 'format', 'findleads_enrich').
    *   Example: A 'format' job could take `LeadsApart.csv`, process it using `formatter.py`, and output a formatted Excel file.
    *   Example: A 'findleads_enrich' job could take formatted data, use `FindLeadsAndAddSource.py` to add more details, and update the database or generate another file.
    *   This queue allows for concurrent execution of these processing tasks.

```
┌─────────────────┐      ┌────────────────────┐      ┌───────────────────────┐
│ Client Request  │─────▶│    API Endpoint    │─────▶│      scraperQueue     │
│ (BizType, ZIP)  │      │ (/api/scraper/start)│      │ (Job: 'scrape')       │
└─────────────────┘      └────────────────────┘      └───────────┬───────────┘
                                                                 │ (scraperProcessor.js)
                                                                 ▼
                                                      ┌────────────────────┐
                                                      │   Writes to        │
                                                      │   queries.txt      │
                                                      └───────────┬──────────┘
                                                                 │
                                                      ┌────────────────────┐
                                                      │   Executes         │
                                                      │   maintemp.py      │
                                                      └───────────┬──────────┘
                                                                 │ (Outputs)
                                                      ┌────────────────────┐
                                                      │   LeadsApart.csv   │
                                                      └───────────┬──────────┘
                                                                 │ (Optionally triggers next stage)
                                                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                       processingQueue                         │
│ (Handles various job types like 'format', 'findleads_enrich') │
│                                                               │
│ ┌────────────────────┐      ┌────────────────────┐          │
│ │ Job Type: 'format' │      │ Job Type: 'enrich' │ ... etc.  │
│ └─────────┬──────────┘      └─────────┬──────────┘          │
│           │ (formatter.py)            │ (FindLeads...)        │
│           ▼                           ▼                       │
│ ┌────────────────────┐      ┌────────────────────┐          │
│ │ Formatted.xlsx     │      │ EnrichedData.xlsx  │          │
│ └────────────────────┘      └────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 16+ 
- Redis server
- Python 3.7+ (with existing scraper dependencies)
- Chrome/Chromium browser (for scraper)

## Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd lead-generation-backend
npm install
```

2. **Setup environment:**
```bash
cp config.env .env
# Edit .env with your configuration
```

3. **Install Redis:**
```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS
brew install redis

# Windows
# Download from https://redis.io/download
```

4. **Start Redis:**
```bash
redis-server
```

5. **Create required directories:**
```bash
mkdir -p data logs uploads
```

6. **Start the backend:**
```bash
# Development
npm run dev

# Production
npm start
```

## Configuration

Key environment variables in `config.env`:

```env
# Server
PORT=3000
NODE_ENV=development

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Queue Concurrency
SCRAPER_QUEUE_CONCURRENCY=1
PROCESSOR_QUEUE_CONCURRENCY=5

# Python Scripts
PYTHON_INTERPRETER=python
SCRAPER_SCRIPT_PATH=./maintemp.py # Reads queries.txt, outputs LeadsApart.csv
FORMATTER_SCRIPT_PATH=./formatter.py # Example: Reads CSV, outputs formatted XLSX
FINDLEADS_SCRIPT_PATH=./FindLeadsAndAddSource.py # Example: Enriches data

# File Paths
FILES_DIRECTORY=./Files
OUTPUTS_DIRECTORY=./Outputs
QUERIES_FILE=./queries.txt
LEADS_APART_FILE=./LeadsApart.csv
```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Scraper Endpoints

#### Start Scraping Job
```http
POST /scraper/start
Content-Type: application/json

{
  "clientName": "John Doe",
  "businessTypes": ["gyms", "restaurants", "hotels"],
  "zipCodes": ["90210", "10001", "60601"],
  "states": ["CA", "NY", "IL"],
  "priority": 5
}
```

#### Get Scraping Job Status
```http
GET /scraper/job/{jobId}
```

#### Get All Scraping Jobs
```http
GET /scraper/jobs?status=completed&clientName=John&limit=50&offset=0
```

#### Generate Search Queries (without scraping)
```http
POST /scraper/generate-queries
Content-Type: application/json

{
  "businessTypes": ["gyms", "restaurants"],
  "locations": ["90210", "New York"]
}
```

### Processing Endpoints

#### Start Format Job
```http
POST /processing/format
Content-Type: application/json

{
  "inputFile": "./LeadsApart.csv", // Typically output from scraper
  "outputFile": "./Files/formatted_leads.xlsx",
  "clientName": "John Doe",
  "jobType": "format" // Explicitly define job type for the processing queue
}
```

#### Start FindLeads Job
```http
POST /processing/findleads 
Content-Type: application/json

{
  "inputFile": "./Files/formatted_leads.xlsx", // Typically output from formatter
  "businessTypes": ["gyms", "restaurants"],
  "zipCodes": ["90210", "10001"],
  "states": ["CA", "NY"],
  "clientName": "John Doe",
  "jobType": "findleads_enrich" // Explicitly define job type
}
```

#### Get Processing Job Status
```http
GET /processing/job/{jobId}
```

### Leads Endpoints

#### Search Leads
```http
GET /leads/search?businessType=gym&state=CA&minRating=4.0&limit=100
```

#### Natural Language Search
```http
POST /leads/search/natural
Content-Type: application/json

{
  "query": "Find all gyms in California with high ratings"
}
```

#### Get Lead Statistics
```http
GET /leads/stats/summary
```

#### Get Filter Options
```http
GET /leads/filters/options
```

### File Management Endpoints

#### Upload File
```http
POST /files/upload
Content-Type: multipart/form-data

file: [CSV/Excel file]
clientName: "John Doe"
description: "Lead data for processing"
```

#### Download File
```http
GET /files/download/{filename}
```

#### List Files
```http
GET /files/list?directory=outputs
```

#### Get File Info
```http
GET /files/info/{filename}
```

### System Status Endpoints

#### System Health
```http
GET /status/
```

#### Queue Statistics
```http
GET /status/queues
```

#### Performance Metrics
```http
GET /status/performance?timeframe=24h
```

## New API Endpoints

### Conversation Management (`/api/conversation/`)

#### Chat with LLM
```http
POST /conversation/chat
Content-Type: application/json

{
  "message": "How many leads do we have in California?",
  "conversationId": "optional-existing-conversation-id",
  "userId": "user123"
}

Response:
{
  "success": true,
  "conversationId": "uuid-conversation-id",
  "message": "I found 1,245 leads in California. Would you like me to show you these leads or get more details?",
  "type": "lead_count",
  "actions": ["show_leads", "get_details", "start_scraping"],
  "data": {
    "count": 1245,
    "filters": { "state": "CA" },
    "hasResults": true
  },
  "suggestions": [
    "Show me these 1,245 leads",
    "Get more details",
    "Start scraping for more"
  ]
}
```

#### Respond to LLM Actions
```http
POST /conversation/respond/{conversationId}
Content-Type: application/json

{
  "action": "show_leads",
  "response": "yes",
  "data": { /* context data */ }
}
```

#### Get Conversation History
```http
GET /conversation/history/{conversationId}
```

### Delivery Management (`/api/delivery/`)

#### Get All Deliveries
```http
GET /delivery/
GET /delivery/?clientName=John&limit=20&offset=0
```

#### Get Delivery by Job ID
```http
GET /delivery/job/{jobId}
```

#### Download Delivery File
```http
GET /delivery/download/{jobId}/{filename}
```

#### Get Recent Deliveries (for chatbox)
```http
GET /delivery/recent?limit=10
```

#### Get Delivery Statistics
```http
GET /delivery/stats
```

### Enhanced Lead Search (`/api/leads/`)

#### Advanced Search with Multiple Filters
```http
GET /leads/search?businessType=gym&state=CA&hasWebsite=true&minRating=4.0
GET /leads/search?multiple[businessTypes]=gym,restaurant&multiple[states]=CA,NY,TX
GET /leads/search?area=Los Angeles&minReviews=50&hasEmail=true
```

#### Natural Language Search (Enhanced)
```http
POST /leads/search/natural
Content-Type: application/json

{
  "query": "Find all gyms in California with websites and high ratings"
}

Response includes parsed filters:
{
  "success": true,
  "originalQuery": "Find all gyms in California with websites and high ratings",
  "parsedFilters": {
    "businessType": "gym",
    "state": "CA",
    "hasWebsite": true,
    "minRating": 4.0
  },
  "leads": [...],
  "summary": {
    "total": 156,
    "avgRating": 4.3,
    "withWebsite": 156,
    "withEmail": 89,
    "withPhone": 145
  }
}
```

## LLM Conversational Flow Examples

### Example 1: Lead Count Query
```
User: "Tell me how many leads do we have in California right now"

LLM: "I found 1,245 leads in California. Would you like me to show you these leads or get more details?"
Actions: [show_leads, get_details, start_scraping]

User: "Show me these leads"

LLM: "Here are your California leads. I found 1,245 businesses with an average rating of 4.2. 
     890 have websites, 567 have emails, and 1,100 have phone numbers. 
     Would you like me to export these to a file?"
```

### Example 2: Conditional Scraping Request
```
User: "I need restaurants in zip code 90210"

LLM: "I found 45 existing restaurant leads in zip code 90210. Would you like to:
     • Use existing leads
     • Scrape for additional leads  
     • Scrape only new areas"

User: "Scrape for more"

LLM: "Great! I've started scraping for additional restaurants in 90210. Job ID: abc123
     I'll automatically format and process the results when scraping is complete. 
     Estimated time: 15-30 minutes. You can check the progress in the queue section."
```

### Example 3: Complex Search Query
```
User: "Find all gyms in California and Texas with high ratings and websites"

LLM: "Found 234 gyms in California and Texas with high ratings (4.0+) and websites.
     Summary:
     • California: 156 gyms, avg rating 4.3
     • Texas: 78 gyms, avg rating 4.1
     • All have websites, 89% have emails, 95% have phone numbers
     
     Would you like me to export these leads or refine the search?"
```

### Example 4: Job Status Inquiry
```
User: "What jobs are currently running?"

LLM: "📋 Active Jobs (2):
     • job-456: processing (formatting)
     • job-789: pending (scraping)
     
     ✅ Recently Completed (3):
     • job-123: scraping (found 150 leads)
     • job-321: findleads
     • job-654: formatting
     
     Would you like details on any specific job?"
```

## Enhanced Search Capabilities

### Multiple Value Searches
```javascript
// Search for multiple business types in multiple states
const response = await fetch('/api/leads/search?' + new URLSearchParams({
  'multiple[businessTypes]': 'gym,restaurant,hotel',
  'multiple[states]': 'CA,NY,TX',
  'hasWebsite': 'true',
  'minRating': '4.0'
}));
```

### Natural Language Processing
The system can parse complex natural language queries:

```javascript
const queries = [
  "Find all restaurants in California with excellent ratings",
  "Show me gyms near Los Angeles with websites and many reviews", 
  "Get warehouses in zip codes 90210, 10001, and 60601",
  "Find hotels in New York area with 4+ star ratings",
  "Show businesses without websites in Texas",
  "Get all leads from the Bay Area with phone numbers"
];

// Each query is automatically parsed to extract:
// - Business types, locations, ratings, contact filters
// - Multiple values (zip codes, states, business types)
// - Areas/regions, rating ranges, contact requirements
```

## Usage Examples

### 1. Complete LLM-Driven Workflow

```javascript
// Frontend chatbox integration
class LeadChatbox {
  async sendMessage(message, conversationId = null) {
    const response = await fetch('/api/conversation/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId,
        userId: this.userId
      })
    });
    
    const result = await response.json();
    this.displayMessage(result.message, result.suggestions);
    return result;
  }
  
  async handleUserAction(action, response, data, conversationId) {
    const result = await fetch(`/api/conversation/respond/${conversationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, response, data })
    });
    
    return await result.json();
  }
}

// Usage
const chatbox = new LeadChatbox();

// User asks question
await chatbox.sendMessage("How many gyms do we have in California?");

// User responds to suggestion
await chatbox.handleUserAction("show_leads", "yes", contextData, conversationId);
```

### 2. Enhanced Lead Discovery

```javascript
// Complex multi-criteria search
const searchCriteria = {
  multiple: {
    businessTypes: ['gym', 'fitness center', 'yoga studio'],
    states: ['CA', 'NY', 'TX'],
    zipCodes: ['90210', '10001', '77001']
  },
  minRating: 4.0,
  hasWebsite: true,
  hasEmail: true,
  minReviews: 20
};

const leads = await fetch('/api/leads/search?' + new URLSearchParams(searchCriteria));
```

### 3. Delivery Management

```javascript
// Get recent deliveries for dashboard
const recentDeliveries = await fetch('/api/delivery/recent?limit=10');

// Download specific delivery
const downloadFile = (jobId, filename) => {
  window.location.href = `/api/delivery/download/${jobId}/${filename}`;
};

// Track delivery statistics
const deliveryStats = await fetch('/api/delivery/stats');
```

### 4. Real-time Queue Monitoring

```javascript
// Monitor queue status for frontend display
const updateQueueDisplay = async () => {
  const queueStats = await fetch('/api/status/queues');
  const { queueStats: stats } = await queueStats.json();
  
  // Update UI
  document.getElementById('scraper-queue').textContent = 
    `${stats.scraper.active} active, ${stats.scraper.waiting} waiting`;
  document.getElementById('processing-queue').textContent = 
    `${stats.processing.active} active, ${stats.processing.waiting} waiting`;
};

// Real-time updates
setInterval(updateQueueDisplay, 5000);
```

## Frontend Integration Guide

### React Component Example

```jsx
import React, { useState, useEffect } from 'react';

const LeadGenerationDashboard = () => {
  const [messages, setMessages] = useState([]);
  const [currentJobs, setCurrentJobs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  // Chatbox component
  const Chatbox = () => {
    const [input, setInput] = useState('');
    
    const sendMessage = async () => {
      const response = await fetch('/api/conversation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationId
        })
      });
      
      const result = await response.json();
      setConversationId(result.conversationId);
      setMessages(prev => [...prev, 
        { role: 'user', content: input },
        { role: 'assistant', content: result.message, actions: result.actions }
      ]);
      setInput('');
    };
    
    return (
      <div className="chatbox">
        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              {msg.content}
              {msg.actions && (
                <div className="actions">
                  {msg.actions.map(action => (
                    <button key={action} onClick={() => handleAction(action)}>
                      {action.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask about leads, start jobs, check status..."
        />
      </div>
    );
  };

  // Queue monitoring component
  const QueueView = () => {
    useEffect(() => {
      const fetchJobs = async () => {
        const response = await fetch('/api/scraper/jobs?status=pending,processing');
        const { jobs } = await response.json();
        setCurrentJobs(jobs);
      };
      
      fetchJobs();
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }, []);
    
    return (
      <div className="queue-view">
        <h3>Current Jobs</h3>
        {currentJobs.map(job => (
          <div key={job.job_id} className="job-item">
            <span>{job.client_name}</span>
            <span>{job.status}</span>
            <span>{job.business_types?.join(', ')}</span>
          </div>
        ))}
      </div>
    );
  };

  // Deliveries component  
  const DeliveriesView = () => {
    useEffect(() => {
      const fetchDeliveries = async () => {
        const response = await fetch('/api/delivery/recent');
        const { deliveries } = await response.json();
        setDeliveries(deliveries);
      };
      
      fetchDeliveries();
    }, []);
    
    return (
      <div className="deliveries-view">
        <h3>Recent Deliveries</h3>
        {deliveries.map(delivery => (
          <div key={delivery.job_id} className="delivery-item">
            <span>{delivery.client_name}</span>
            <span>{delivery.leads_found} leads</span>
            {delivery.downloadUrl && (
              <a href={delivery.downloadUrl} download>Download</a>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard">
      <div className="chat-section">
        <Chatbox />
      </div>
      <div className="queue-section">
        <QueueView />
      </div>
      <div className="delivery-section">
        <DeliveriesView />
      </div>
    </div>
  );
};
```

## Key Improvements Summary

### 🧠 **LLM Integration**
- **Natural Conversation Flow**: Multi-turn conversations with context
- **Intelligent Parsing**: Extract business types, locations, filters from natural language
- **Action-based Responses**: Structured actions for user interaction
- **Contextual Suggestions**: Smart follow-up suggestions based on query results

### 🔍 **Enhanced Search**
- **Multiple Value Filters**: Search across multiple states, business types, zip codes
- **Contact Information Filters**: Filter by website, email, phone presence
- **Area/Region Search**: Search by city, area, or region names
- **Rating and Review Ranges**: Min/max filters for ratings and review counts
- **Combination Queries**: Complex multi-criteria searches

### 📦 **Delivery Management**  
- **File Tracking**: Track all completed processing jobs and output files
- **Secure Downloads**: Job-based download URLs with access control
- **Delivery History**: Complete history of all client deliveries
- **File Information**: Size, type, creation date for all deliveries

### 🎯 **Interactive Workflows**
- **Conditional Logic**: Ask user preferences before taking actions
- **Smart Recommendations**: Suggest existing leads vs. new scraping
- **Progress Communication**: Real-time updates on job progress
- **Error Recovery**: Graceful handling of failed operations

This enhanced backend transforms your lead generation system into an intelligent, conversational platform that can handle complex queries, manage workflows autonomously, and provide a seamless user experience through natural language interaction.

## Quick Start for New Features

1. **Enable Conversation Mode:**
```bash
# Start the enhanced backend
npm run dev

# Test conversation endpoint
curl -X POST http://localhost:3000/api/conversation/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "How many leads do we have in California?"}'
```

2. **Try Enhanced Search:**
```bash
# Multiple business types and states
curl "http://localhost:3000/api/leads/search?multiple[businessTypes]=gym,restaurant&multiple[states]=CA,NY&hasWebsite=true"

# Natural language search
curl -X POST http://localhost:3000/api/leads/search/natural \
  -H "Content-Type: application/json" \
  -d '{"query": "Find all hotels in Los Angeles with excellent ratings"}'
```

3. **Check Deliveries:**
```bash
# Get recent deliveries
curl http://localhost:3000/api/delivery/recent

# Get delivery statistics
curl http://localhost:3000/api/delivery/stats
```

The system is now ready to handle sophisticated conversational interactions while maintaining all the powerful automation and queue management features of the original system!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the logs in `./logs/` directory
- Review environment configuration
- Monitor system status via `/api/status/` endpoints 