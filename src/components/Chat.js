import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import './Chat.css';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  // Queue state
  const [queueStats, setQueueStats] = useState(null);
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
        text: "🎯 Welcome to LeadAssistAI! I'm your intelligent lead generation assistant. I can help you discover, analyze, and manage business leads with enterprise-grade precision.\n\n✨ Try asking me:\n• \"Start a scraping job for coffee shops in New York\"\n• \"Export all nursing homes in Texas to Excel\"\n• \"How many gyms are in California?\"\n• \"Show me recent restaurant leads\"",
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
      const statsResponse = await api.get('/api/status/queues');
      setQueueStats(statsResponse.data.queueStats);
      
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
      const response = await api.get('/api/delivery/recent');
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
      const response = await api.get(`/api/files/download/${fileId}`, {
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
      case 'processing': return '#f59e0b';
      case 'waiting': return '#6b7280';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'active': return '⚡';
      case 'processing': return '⚙️';
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
      return '📄';
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
        userId: 'default'
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
            leads: response.data.leads.slice(0, 10)
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
      {/* Left Sidebar for Enhanced Scraper Queue */}
      <div className="left-sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <h3>🚀 Scraper Intelligence</h3>
            <button 
              onClick={fetchQueueData} 
              disabled={queueLoading}
              className="refresh-button"
              title="Refresh queue data"
            >
              {queueLoading ? '⏳' : '🔄'}
            </button>
          </div>

          {queueError && (
            <div className="error-banner">
              ⚠️ {queueError}
            </div>
          )}

          {/* Enhanced Queue Statistics */}
          {queueStats && (
            <div className="queue-overview">
              <div className={`queue-stat-card ${(queueStats.scraper?.active || 0) > 0 ? 'active' : 'inactive'}`}>
                <div className="stat-header">
                  <span className="stat-icon">⚡</span>
                  <span className="stat-title">Scraper Engine</span>
                </div>
                <div className="stat-details">
                  <div className="stat-row">
                    <span className="stat-label">Queue Status</span>
                    <div className="stat-indicators">
                      <span className="indicator waiting">
                        <span className="indicator-dot"></span>
                        {queueStats.scraper?.waiting || 0} Waiting
                      </span>
                      <span className="indicator active">
                        <span className="indicator-dot"></span>
                        {queueStats.scraper?.active || 0} Active
                      </span>
                      <span className="indicator completed">
                        <span className="indicator-dot"></span>
                        {queueStats.scraper?.completed || 0} Done
                      </span>
                    </div>
                  </div>
                  <div className="queue-health">
                    <div className="health-bar">
                      <div className="health-fill" style={{
                        width: `${Math.min(100, ((queueStats.scraper?.active || 0) / 4) * 100)}%`
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Main Content Area (Chat) */}
      <div className="main-content">
        <div className="chat-container">
          <div className="chat-header">
            <div className="header-content">
              <div className="header-main">
                <h2>🤖 LeadAssistAI</h2>
                <div className="ai-status">
                  <span className="status-dot"></span>
                  <span>AI Assistant Online</span>
                </div>
              </div>
              <p className="header-subtitle">
                Intelligent lead generation and management powered by advanced AI
              </p>
            </div>
          </div>
          
          <div className="messages-container">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.sender}`}>
                <div className="message-content">
                  <div className={`message-bubble ${message.isError ? 'error' : ''}`}>
                    <div className="message-text">{message.text}</div>
                    
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
                        <div className="leads-header">
                          <span className="leads-count">{message.leads.length} leads found</span>
                        </div>
                        {message.leads.map((lead, index) => (
                          <div key={index} className="lead-item">
                            <div className="lead-name">{lead.name || lead.business_name}</div>
                            {lead.address && <div className="lead-address">📍 {lead.address}</div>}
                            {lead.phone && <div className="lead-phone">📞 {lead.phone}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="message-timestamp">
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
                      <div className="typing-text">LeadAssistAI is thinking</div>
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
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
                placeholder="Ask me to find leads, export data, or analyze your database..."
                disabled={isLoading}
                className="message-input"
              />
              <button 
                type="submit" 
                disabled={isLoading || !inputValue.trim()}
                className="send-button"
              >
                {isLoading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <span className="send-icon">🚀</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Sidebar for Deliveries */}
      <div className="right-sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <h3>📦 Delivery Center</h3>
            <button 
              onClick={fetchDeliveries} 
              disabled={deliveriesLoading}
              className="refresh-button"
              title="Refresh deliveries"
            >
              {deliveriesLoading ? '⏳' : '🔄'}
            </button>
          </div>

          {deliveriesError && (
            <div className="error-banner">
              ⚠️ {deliveriesError}
            </div>
          )}

          <div className="deliveries-section">
            {deliveries.length === 0 ? (
              <div className="no-deliveries">
                <div className="no-deliveries-icon">📋</div>
                <p>No recent deliveries</p>
                <small>Exported files will appear here</small>
              </div>
            ) : (
              <div className="deliveries-list">
                {deliveries.slice(0, 8).map((delivery) => (
                  <div key={delivery.id} className="delivery-card">
                    <div className="delivery-header">
                      <span className="delivery-client">{delivery.clientName}</span>
                      <span className="delivery-date">{formatDate(delivery.completedAt)}</span>
                    </div>
                    
                    <div className="delivery-info">
                      <div className="delivery-stats">
                        <span className="leads-count">
                          📊 {delivery.leadsCount || 0} leads
                        </span>
                        <span className="business-types">
                          🏢 {delivery.businessTypes?.join(', ') || 'N/A'}
                        </span>
                      </div>

                      {delivery.files && delivery.files.length > 0 && (
                        <div className="delivery-files">
                          {delivery.files.map((file, index) => (
                            <button
                              key={index}
                              className="download-button"
                              onClick={() => handleDownload(file.id, file.name)}
                              title={`Download ${file.name}`}
                            >
                              <span className="download-icon">⬇️</span>
                              <span className="file-icon">{getFileIcon(file.name)}</span>
                              <span className="file-name">
                                {file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat; 