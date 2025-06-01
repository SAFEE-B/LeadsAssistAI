import React from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const Landing = () => {
  const stats = [
    { number: '50K+', label: 'Leads Processed Daily' },
    { number: '95%', label: 'Data Accuracy Rate' },
    { number: '10x', label: 'Faster Than Manual' },
    { number: '24/7', label: 'Automated Processing' }
  ];

  const llmTools = [
    {
      name: 'get_lead_count',
      category: 'Data Analysis',
      description: 'Get the total count of leads in the database with optional filters for location and business type. Handles multiple comma-separated values for efficient bulk operations.',
      example: '"How many apartment buildings, gyms, high schools are in zip codes 90210, 94102, 77001?"'
    },
    {
      name: 'export_leads_to_file',
      category: 'File Generation',
      description: 'Export filtered leads to downloadable CSV or Excel files with custom formatting and filenames. Handles large datasets efficiently with progress tracking.',
      example: '"Export nursing homes in Florida to Excel file named Florida_Healthcare"'
    },
    {
      name: 'get_all_leads',
      category: 'Data Export',
      description: 'Retrieve ALL leads from the database with optional filters. Includes safety limits to prevent overwhelming responses and auto-generates files for large datasets.',
      example: '"Get all auto repair shops in California"'
    },
    {
      name: 'search_leads',
      category: 'Data Retrieval',
      description: 'Search for specific leads based on various criteria with pagination support. Returns detailed lead information with configurable limits and offsets for large datasets.',
      example: '"Show me 20 auto repair shops in Texas"'
    },
    {
      name: 'start_scraping_job',
      category: 'Data Collection',
      description: 'Initiates intelligent multi-threaded scraping jobs with advanced filtering, data cleaning, and automatic delivery. The system applies quality filters, removes duplicates, validates contact information, and automatically delivers formatted results to your dashboard.',
      example: '"Find new restaurants in Miami, Florida"'
    },
    {
      name: 'get_queue_status',
      category: 'Job Monitoring',
      description: 'Get real-time status of scraping and processing queues. Shows active jobs, queue positions, completion rates, and system performance metrics.',
      example: '"What\'s the current queue status?"'
    },
    {
      name: 'get_recent_files',
      category: 'File Management',
      description: 'Lists recently generated files and deliveries with download links, file sizes, creation timestamps, and delivery tracking information.',
      example: '"Show my recent downloads"'
    }
  ];

  const technicalSpecs = [
    {
      icon: '⚙️',
      title: 'Concurrent Processing',
      description: 'Built with Node.js Express server architecture that never blocks operations. While multi-threaded Python scraping jobs run in the background, the system continues to instantly respond to all other API requests, database queries, and user interactions without any delays or waiting periods.'
    },
    {
      icon: '⚡',
      title: 'Multi-Threaded Scraping',
      description: 'Advanced Python-based scraping engine using ThreadPoolExecutor with multiple concurrent worker threads and Selenium WebDriver instances. Each thread operates an independent Chrome browser window, allowing simultaneous processing of multiple business locations for dramatically faster data collection speeds.'
    },
    {
      icon: '🔄',
      title: 'Advanced Queue Management',
      description: 'Sophisticated Bull Queue system powered by Redis database manages job distribution and resource allocation. Automatically assigns scraping tasks to available threads based on system capacity, handles job prioritization, implements retry logic, and maintains queue stability under high-load conditions.'
    },
    {
      icon: '💾',
      title: 'Scalable Data Infrastructure',
      description: 'Enterprise-grade SQLite database with optimized indexing on phone numbers, business types, zip codes, and states. Implements automatic duplicate detection via phone number constraints, supports millions of lead records with sub-second query performance, and includes automated data validation and cleanup processes.'
    }
  ];

  return (
    <div className="landing-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Meet <span className="highlight">LeadAssistAI</span><br/>
              Your Intelligent Lead Generation & Management Assistant
            </h1>
            <p className="hero-subtitle">
              Transform how you discover, collect, and manage business leads with our AI-powered assistant. 
              Simply tell LeadAssistAI what you need in natural language, and watch as it intelligently 
              orchestrates multi-threaded scraping, manages databases, and delivers perfectly organized 
              results—all while you focus on closing deals.
            </p>
            <div className="hero-buttons">
              <Link to="/login" className="btn btn-primary">
                Start With LeadAssistAI
              </Link>
              <button 
                onClick={() => document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' })}
                className="btn btn-secondary"
              >
                See How It Works
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="floating-cards-container">
              {/* Card 1: Database Check & Scraping */}
              <div className="floating-card">
                <div className="card-header">
                  <div className="status-indicator"></div>
                  <span>Custom Scraper</span>
                </div>
                <div className="card-content">
                  <div className="ai-activity">
                    <p className="ai-request">"Find auto repair shops in Miami, FL"</p>
                    <div className="ai-response">
                      <span className="ai-thinking">🔍 Checking database...</span>
                      <span className="ai-action">❌ No leads found for this criteria</span>
                      <span className="ai-processing">🚀 Starting scraper to collect fresh leads</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                  <div className="processing-stats">
                    <span>🎯 Smart Fallback</span>
                    <span>⚡ Auto-Scraping</span>
                  </div>
                </div>
              </div>

              {/* Card 2: File Generation */}
              <div className="floating-card card-delayed-1">
                <div className="card-header">
                  <div className="status-indicator status-success"></div>
                  <span>File Export</span>
                </div>
                <div className="card-content">
                  <div className="ai-activity">
                    <p className="ai-request">"Export nursing homes in Florida to Excel"</p>
                    <div className="ai-response">
                      <span className="ai-thinking">📊 Found 1,847 matching leads</span>
                      <span className="ai-action">📁 Generating Excel file...</span>
                      <span className="ai-processing">✅ Florida_Healthcare.xlsx ready</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill progress-complete"></div>
                  </div>
                  <div className="processing-stats">
                    <span>📈 1,847 leads</span>
                    <span>📋 Excel format</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Database Contribution */}
              <div className="floating-card card-delayed-2">
                <div className="card-header">
                  <div className="status-indicator status-info"></div>
                  <span>Database Interaction</span>
                </div>
                <div className="card-content">
                  <div className="ai-activity">
                    <p className="ai-request">"How many gyms are in California?"</p>
                    <div className="ai-response">
                      <span className="ai-thinking">🧮 Analyzing database...</span>
                      <span className="ai-action">📍 Checking 58 counties</span>
                      <span className="ai-processing">💪 Found 3,247 gyms total</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill progress-instant"></div>
                  </div>
                  <div className="processing-stats">
                    <span>⚡ Instant Query</span>
                    <span>🎯 3,247 results</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LLM Tools Section - Moved to be right after hero */}
      <section className="llm-tools-section">
        <div className="container">
          <h2 className="section-title">LeadAssistAI's Intelligent Capabilities</h2>
          <p className="section-subtitle">
            LeadAssistAI can intelligently call these specialized tools to fulfill your lead generation requests
          </p>
          <div className="tools-grid">
            {llmTools.map((tool, index) => (
              <div key={index} className="tool-card">
                <div className="tool-header">
                  <h3 className="tool-name">{tool.name}</h3>
                  <span className="tool-category">{tool.category}</span>
                </div>
                <p className="tool-description">{tool.description}</p>
                <div className="tool-example">
                  <strong>Example:</strong> <em>{tool.example}</em>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Specs Section */}
      <section className="tech-specs-section">
        <div className="container">
          <h2 className="section-title">Technical Infrastructure</h2>
          <p className="section-subtitle">
            Advanced technology components that power our enterprise-grade lead generation system
          </p>
          <div className="tech-specs-grid">
            {technicalSpecs.map((spec, index) => (
              <div key={index} className="tech-spec-item">
                <div className="spec-icon">{spec.icon}</div>
                <div className="spec-title">{spec.title}</div>
                <div className="spec-description">{spec.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="stat-item">
              <div className="stat-number">{stat.number}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section - Detailed Scraping Process */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <h2 className="section-title">How Our Intelligent Scraping System Works</h2>
          <p className="section-subtitle">
            Deep dive into the advanced multi-stage process that powers our enterprise-grade lead generation
          </p>
          <div className="steps-container">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>AI Request Processing & Tool Selection</h3>
                <p>Your natural language request is analyzed by Gemini 2.5 Flash AI, which intelligently selects the appropriate tools from our 7-tool arsenal. The AI determines whether to search existing database, start new scraping, or export results based on your specific needs.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Google Gemini 2.5 Flash, Function Calling API, Natural Language Processing
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Smart Lead Analysis & Query Optimization</h3>
                <p>Before scraping, our system performs intelligent database analysis to check existing leads. It compares business types and locations against our SQLite database with indexed phone numbers, then optimizes scraping queries to only collect missing data, preventing duplicates and reducing processing time.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> SQLite with Optimized Indexing, Duplicate Detection Algorithm, Query Optimization Engine
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Queue-Based Job Management</h3>
                <p>Scraping requests are added to our Bull Queue system powered by Redis. The queue manager intelligently assigns jobs based on system capacity, handles prioritization, and maintains stability under high-load conditions while ensuring non-blocking operations for all other API requests.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Bull Queue, Redis Database, Job Prioritization Algorithm, Resource Allocation Management
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Multi-Threaded Python Execution</h3>
                <p>Our Python scraper launches with ThreadPoolExecutor managing multiple concurrent worker threads. Each thread operates an independent Selenium WebDriver instance with Chrome browser, allowing simultaneous processing of different business locations across multiple search queries.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Python ThreadPoolExecutor, Selenium WebDriver, Chrome Browser Automation, Concurrent Processing
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">5</div>
              <div className="step-content">
                <h3>Intelligent Google Maps Data Extraction</h3>
                <p>Each thread navigates Google Maps, performs targeted searches, extracts business details (name, address, phone, reviews, ratings, websites), handles dynamic page scrolling, and manages review sorting. Advanced error handling ensures stable extraction even with page changes.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Google Maps API Integration, BeautifulSoup HTML Parsing, Dynamic Content Handling, Review Analysis
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">6</div>
              <div className="step-content">
                <h3>Data Processing & Quality Control</h3>
                <p>Scraped data undergoes automatic validation, cleaning, and filtering. Our system removes unwanted placeholders, validates phone numbers and addresses, applies business type filters, and enforces quality standards before database insertion with constraint-based duplicate prevention.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Data Validation Algorithms, Quality Control Filters, Database Constraints, Automated Data Cleaning
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">7</div>
              <div className="step-content">
                <h3>File Generation & Delivery Tracking</h3>
                <p>Final results are combined with existing leads, exported to CSV/Excel formats with custom filenames, and registered in our deliveries tracking system. Files are automatically generated with download links, file metadata, and delivery status tracking for easy access.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> CSV/Excel Generation, File Management System, Delivery Tracking Database, Automated File Serving
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">8</div>
              <div className="step-content">
                <h3>Real-Time Progress & Results Delivery</h3>
                <p>Throughout the entire process, real-time progress updates are provided via WebSocket connections. Job status, completion percentages, and final results are delivered instantly to the user interface with comprehensive logging and error reporting for full transparency.</p>
                <div className="tech-details">
                  <strong>Technology:</strong> Real-Time Progress Tracking, WebSocket Communication, Comprehensive Logging, Error Reporting System
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Experience LeadAssistAI?</h2>
            <p>Join forward-thinking businesses who've discovered the power of AI-driven lead generation. Let LeadAssistAI handle the heavy lifting while you focus on converting leads into customers.</p>
            <button 
              onClick={() => {
                const subject = 'LeadAssistAI Demo Request';
                const body = `Hello LeadAssistAI Team,

I would like to request a demo of LeadAssistAI to see how it can help with lead generation and management for my business.

Please contact me to schedule a demonstration.

Best regards`;
                window.open(`mailto:demo@leadassistai.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
              }}
              className="btn btn-primary btn-large"
            >
              Request Demo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing; 