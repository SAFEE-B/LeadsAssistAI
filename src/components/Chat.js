import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import axios from 'axios';
import './Chat.css';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  // Queue state
  const [queueStats, setQueueStats] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');

  // Deliveries state
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);
  const [deliveriesError, setDeliveriesError] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    // Add welcome message
    setMessages([
      {
        id: 1,
        text: "Hello! I'm your Lead Generation Assistant. I can help you find leads for specific business types and locations. Try asking me something like: 'Find restaurants in 90210' or 'I need warehouses and factories in 28025'",
        sender: 'assistant',
        timestamp: new Date()
      }
    ]);

    // Fetch initial data
    fetchQueueData();
    fetchDeliveries();

    // Set up auto-refresh for queue data every 30 seconds
    const queueInterval = setInterval(fetchQueueData, 30000);
    
    // Set up auto-refresh for deliveries every 60 seconds
    const deliveriesInterval = setInterval(fetchDeliveries, 60000);
    
    return () => {
      clearInterval(queueInterval);
      clearInterval(deliveriesInterval);
    };
  }, []);

  // Queue functions
  const fetchQueueData = async () => {
    try {
      // Fetch queue statistics
      const statsResponse = await axios.get('/api/status/queues');
      setQueueStats(statsResponse.data);
      
      // Fetch active jobs
      const jobsResponse = await axios.get('/api/scraper/jobs');
      setActiveJobs(jobsResponse.data.jobs || []);
      
      setQueueError('');
    } catch (err) {
      setQueueError('Failed to fetch queue data');
      console.error('Queue fetch error:', err);
    } finally {
      setQueueLoading(false);
    }
  };

  // Deliveries functions
  const fetchDeliveries = async () => {
    try {
      const response = await axios.get('/api/delivery/recent');
      setDeliveries(response.data.deliveries || []);
      setDeliveriesError('');
    } catch (err) {
      setDeliveriesError('Failed to fetch deliveries');
      console.error('Deliveries fetch error:', err);
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const response = await axios.get(`/api/files/download/${fileId}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download file');
      console.error('Download error:', err);
    }
  };

  // Helper functions
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'active': return '#f59e0b';
      case 'waiting': return '#6b7280';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'active': return '⚡';
      case 'waiting': return '⏳';
      case 'failed': return '❌';
      default: return '❓';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName) => {
    if (!fileName || typeof fileName !== 'string') {
      return '📄'; // Default icon for invalid filenames
    }
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'xlsx':
      case 'xls':
        return '📊';
      case 'csv':
        return '📄';
      case 'pdf':
        return '📑';
      default:
        return '📄';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Prepare the request payload
      const requestPayload = {
        message: inputValue,
        userId: 'default' // You can get this from auth context
      };

      // Only include conversationId if it exists
      if (conversationId) {
        requestPayload.conversationId = conversationId;
      }

      const response = await api.post('/api/conversation/chat', requestPayload);

      const { message, actions, conversationId: newConversationId, data } = response.data;
      
      if (newConversationId && !conversationId) {
        setConversationId(newConversationId);
      }

      const assistantMessage = {
        id: Date.now() + 1,
        text: message,
        sender: 'assistant',
        timestamp: new Date(),
        actions: actions,
        data: data
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Refresh data if it was a command that might have changed something
      if (inputValue.toLowerCase().includes('export') || 
          inputValue.toLowerCase().includes('download') || 
          inputValue.toLowerCase().includes('file')) {
        setTimeout(() => {
          fetchDeliveries();
        }, 2000);
      }
      
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'assistant',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = async (action) => {
    setIsLoading(true);
    
    try {
      let response;
      
      switch (action.type) {
        case 'start_scraping':
          response = await api.post('/api/scraper/start', action.payload);
          const successMessage = {
            id: Date.now(),
            text: `🚀 Started scraping job for ${action.payload.businessTypes.join(', ')} in ${action.payload.zipCodes.join(', ')}. Job ID: ${response.data.jobId}`,
            sender: 'assistant',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, successMessage]);
          // Refresh queue data
          setTimeout(fetchQueueData, 1000);
          break;
          
        case 'show_leads':
          response = await api.get('/api/leads/search', { params: action.payload });
          const leadsMessage = {
            id: Date.now(),
            text: `Found ${response.data.leads.length} leads:`,
            sender: 'assistant',
            timestamp: new Date(),
            leads: response.data.leads.slice(0, 10) // Show first 10
          };
          setMessages(prev => [...prev, leadsMessage]);
          break;
          
        default:
          console.log('Unknown action:', action);
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now(),
        text: 'Sorry, I couldn\'t complete that action. Please try again.',
        sender: 'assistant',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Left Sidebar for Queue Status */}
      <div className="left-sidebar">
        {/* Queue Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>📊 Queue Status</h3>
            <button 
              onClick={fetchQueueData} 
              disabled={queueLoading}
              className="refresh-button-small"
              title="Refresh queue data"
            >
              🔄
            </button>
          </div>

          {queueError && (
            <div className="error-banner-small">
              ⚠️ {queueError}
            </div>
          )}

          {queueStats && (
            <div className="queue-stats">
              <div className="stat-mini">
                <div className="stat-label">Scraper Queue</div>
                <div className="stat-values">
                  <span className="waiting">⏳ {queueStats.scraper?.waiting || 0}</span>
                  <span className="active">⚡ {queueStats.scraper?.active || 0}</span>
                  <span className="completed">✅ {queueStats.scraper?.completed || 0}</span>
                </div>
              </div>
              
              <div className="stat-mini">
                <div className="stat-label">Processing Queue</div>
                <div className="stat-values">
                  <span className="waiting">⏳ {queueStats.processing?.waiting || 0}</span>
                  <span className="active">⚡ {queueStats.processing?.active || 0}</span>
                  <span className="completed">✅ {queueStats.processing?.completed || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Jobs */}
          <div className="recent-jobs">
            <h4>Jobs in Queue</h4>
            {activeJobs.length === 0 ? (
              <div className="no-jobs-mini">No recent jobs</div>
            ) : (
              <div className="jobs-list-mini">
                {activeJobs.map((job) => (
                  <div key={job.id || job.jobId} className="job-mini">
                    <div className="job-status-mini">
                      <span className="status-icon">{getStatusIcon(job.status)}</span>
                      <span className="job-id">#{job.id || job.jobId}</span>
                    </div>
                    <div className="job-info-mini">
                      <div>{job.businessTypes?.join(', ') || 'N/A'}</div>
                      <div className="job-date-mini">{formatDate(job.createdAt || job.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area (Chat) */}
      <div className="main-content">
        {/* Chat Section */}
        <div className="chat-container">
          <div className="chat-header">
            <h2>🤖 Lead Generation Assistant</h2>
            <p>Ask me to find leads for any business type and location</p>
          </div>
          
          <div className="messages-container">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.sender}`}>
                <div className="message-content">
                  <div className={`message-bubble ${message.isError ? 'error' : ''}`}>
                    {message.text}
                    
                    {message.actions && message.actions.length > 0 && (
                      <div className="message-actions">
                        {message.actions.map((action, index) => (
                          <button
                            key={index}
                            className="action-button"
                            onClick={() => handleActionClick(action)}
                            disabled={isLoading}
                          >
                            {action.text}
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {message.leads && (
                      <div className="leads-preview">
                        {message.leads.map((lead, index) => (
                          <div key={index} className="lead-item">
                            <strong>{lead.name || lead.business_name}</strong>
                            {lead.address && <div className="lead-address">{lead.address}</div>}
                            {lead.phone && <div className="lead-phone">📞 {lead.phone}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="message-time">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="message assistant">
                <div className="message-content">
                  <div className="message-bubble">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="input-form">
            <div className="input-container">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message here..."
                disabled={isLoading}
                className="message-input"
              />
              <button 
                type="submit" 
                disabled={isLoading || !inputValue.trim()}
                className="send-button"
              >
                {isLoading ? '⏳' : '🚀'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Sidebar for Deliveries */}
      <div className="right-sidebar">
        {/* Deliveries Section */}
        <div className="sidebar-section">
          <div className="section-header">
            <h3>📦 Recent Deliveries</h3>
            <button 
              onClick={fetchDeliveries} 
              disabled={deliveriesLoading}
              className="refresh-button-small"
              title="Refresh deliveries"
            >
              🔄
            </button>
          </div>

          {deliveriesError && (
            <div className="error-banner-small">
              ⚠️ {deliveriesError}
            </div>
          )}

          <div className="deliveries-list">
            {deliveries.length === 0 ? (
              <div className="no-deliveries-mini">No recent deliveries</div>
            ) : (
              deliveries.slice(0, 5).map((delivery) => (
                <div key={delivery.id} className="delivery-mini">
                  <div className="delivery-header-mini">
                    <span className="delivery-client">{delivery.clientName}</span>
                    <span className="delivery-date-mini">{formatDate(delivery.completedAt)}</span>
                  </div>
                  
                  <div className="delivery-stats">
                    <span className="leads-count">{delivery.leadsCount || 0} leads</span>
                    <span className="business-types">{delivery.businessTypes?.join(', ') || 'N/A'}</span>
                  </div>

                  {delivery.files && delivery.files.length > 0 && (
                    <div className="files-mini">
                      {delivery.files.map((file, index) => (
                        <button
                          key={index}
                          className="download-button-mini"
                          onClick={() => handleDownload(file.id, file.name)}
                          title={`Download ${file.name}`}
                        >
                          {getFileIcon(file.name)} {file.name.substring(0, 20)}...
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat; 