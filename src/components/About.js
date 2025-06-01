import React from 'react';
import './About.css';

const About = () => {
  const capabilities = [
    {
      category: 'AI-Powered Lead Discovery',
      items: [
        'Natural Language Processing for conversational lead requests',
        'Advanced algorithms for business classification and qualification',
        'Real-time data analysis and quality scoring',
        'Intelligent filtering based on custom criteria'
      ]
    },
    {
      category: 'Data Processing & Export',
      items: [
        'CSV and Excel file generation with custom formatting',
        'Organized delivery tracking and file management',
        'Automated data cleansing and validation',
        'Real-time progress monitoring during processing'
      ]
    },
    {
      category: 'Business Intelligence',
      items: [
        'Location-based business search and filtering',
        'Industry categorization and business type analysis',
        'Contact information discovery and verification',
        'Company size and revenue estimation'
      ]
    },
    {
      category: 'Workflow Automation',
      items: [
        'Queue-based job processing for scalability',
        'Automated retry mechanisms for failed processes',
        'Background job monitoring and status tracking',
        'Integrated notification system for job completion'
      ]
    }
  ];

  const technologies = [
    {
      name: 'Frontend',
      tech: 'React.js with modern hooks and routing',
      description: 'Responsive, component-based UI with real-time updates'
    },
    {
      name: 'Backend',
      tech: 'Node.js with Express framework',
      description: 'RESTful API architecture with middleware support'
    },
    {
      name: 'Database',
      tech: 'SQLite with optimized queries',
      description: 'Lightweight, serverless database for efficient data storage'
    },
    {
      name: 'AI Integration',
      tech: 'Google Gemini AI',
      description: 'Advanced language model for intelligent conversation and data processing'
    },
    {
      name: 'Queue System',
      tech: 'Bull Queue with Redis',
      description: 'Robust job queue system for handling concurrent operations'
    },
    {
      name: 'File Processing',
      tech: 'CSV/Excel generation libraries',
      description: 'Multi-format export capabilities with custom formatting'
    }
  ];

  const useCases = [
    {
      title: 'Sales Team Lead Generation',
      description: 'Sales teams can quickly generate qualified leads for specific territories, industries, or company sizes.',
      example: '"Find me 500 restaurants in California with annual revenue over $1M"'
    },
    {
      title: 'Market Research',
      description: 'Researchers can gather comprehensive business data for market analysis and competitive intelligence.',
      example: '"Get all tech startups in Austin founded in the last 3 years"'
    },
    {
      title: 'Partnership Development',
      description: 'Business development teams can identify potential partners or acquisition targets.',
      example: '"Show me manufacturing companies in the Midwest with 50-200 employees"'
    },
    {
      title: 'Event Marketing',
      description: 'Event organizers can find and contact businesses for sponsorship or participation opportunities.',
      example: '"Find local businesses in downtown Seattle for our conference sponsorship"'
    }
  ];

  return (
    <div className="about-container">
      {/* Header Section */}
      <section className="about-header">
        <div className="container">
          <h1>About Our AI Lead Generation Platform</h1>
          <p className="about-intro">
            Our platform represents the next evolution in business lead generation, 
            combining advanced artificial intelligence with modern web technologies 
            to deliver precise, actionable business intelligence.
          </p>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="what-we-do-section">
        <div className="container">
          <h2>What We Do</h2>
          <div className="description-grid">
            <div className="description-text">
              <p>
                We've built an intelligent lead generation system that understands 
                natural language queries and translates them into precise business 
                data searches. Our AI-powered platform can process complex requests 
                like "Find me all restaurants in California with over 50 employees" 
                and deliver comprehensive, formatted results in minutes.
              </p>
              <p>
                The system combines web scraping, data analysis, and machine learning 
                to identify, qualify, and organize business leads according to your 
                specific requirements. Every lead is processed through our quality 
                assurance pipeline to ensure accuracy and relevance.
              </p>
            </div>
            <div className="capabilities-overview">
              <div className="capability-stat">
                <div className="stat-number">10,000+</div>
                <div className="stat-label">Businesses Analyzed Daily</div>
              </div>
              <div className="capability-stat">
                <div className="stat-number">95%</div>
                <div className="stat-label">Data Accuracy Rate</div>
              </div>
              <div className="capability-stat">
                <div className="stat-number">{'< 2min'}</div>
                <div className="stat-label">Average Response Time</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="capabilities-section">
        <div className="container">
          <h2>Core Capabilities</h2>
          <div className="capabilities-grid">
            {capabilities.map((capability, index) => (
              <div key={index} className="capability-card">
                <h3>{capability.category}</h3>
                <ul>
                  {capability.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="technology-section">
        <div className="container">
          <h2>Technology Stack</h2>
          <p className="tech-intro">
            Built with modern, scalable technologies for reliability and performance.
          </p>
          <div className="tech-grid">
            {technologies.map((tech, index) => (
              <div key={index} className="tech-card">
                <div className="tech-name">{tech.name}</div>
                <div className="tech-tech">{tech.tech}</div>
                <div className="tech-description">{tech.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="use-cases-section">
        <div className="container">
          <h2>Real-World Use Cases</h2>
          <div className="use-cases-grid">
            {useCases.map((useCase, index) => (
              <div key={index} className="use-case-card">
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
                <div className="example-query">
                  <strong>Example:</strong> {useCase.example}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works-detailed">
        <div className="container">
          <h2>How It Works</h2>
          <div className="process-flow">
            <div className="process-step">
              <div className="step-icon">🎯</div>
              <div className="step-content">
                <h3>Input Processing</h3>
                <p>Your natural language query is analyzed by our AI to extract specific criteria like location, industry, company size, and other parameters.</p>
              </div>
            </div>
            <div className="process-arrow">→</div>
            <div className="process-step">
              <div className="step-icon">🔍</div>
              <div className="step-content">
                <h3>Data Discovery</h3>
                <p>Our scraping and analysis engines search multiple data sources to identify businesses matching your criteria.</p>
              </div>
            </div>
            <div className="process-arrow">→</div>
            <div className="process-step">
              <div className="step-icon">⚡</div>
              <div className="step-content">
                <h3>Quality Processing</h3>
                <p>Each lead is validated, enriched with additional data, and scored for quality and relevance to your request.</p>
              </div>
            </div>
            <div className="process-arrow">→</div>
            <div className="process-step">
              <div className="step-icon">📊</div>
              <div className="step-content">
                <h3>Delivery</h3>
                <p>Results are formatted and delivered as downloadable files (CSV/Excel) with organized data structures.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="key-features-section">
        <div className="container">
          <h2>Key Features</h2>
          <div className="features-list">
            <div className="feature-item">
              <div className="feature-icon">💬</div>
              <div className="feature-text">
                <strong>Conversational Interface:</strong> Request leads using natural language - no need to learn complex query syntax.
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📈</div>
              <div className="feature-text">
                <strong>Real-time Dashboard:</strong> Monitor processing status, queue position, and delivery history in real-time.
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔄</div>
              <div className="feature-text">
                <strong>Automated Processing:</strong> Background job processing ensures your requests are handled efficiently without delays.
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📁</div>
              <div className="feature-text">
                <strong>Multiple Export Formats:</strong> Download results in CSV or Excel format with custom filename options.
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🎨</div>
              <div className="feature-text">
                <strong>Custom Formatting:</strong> Organized data columns with clean formatting for immediate use in your workflows.
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔒</div>
              <div className="feature-text">
                <strong>Secure & Private:</strong> Your data and searches are processed securely with user authentication and access control.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About; 