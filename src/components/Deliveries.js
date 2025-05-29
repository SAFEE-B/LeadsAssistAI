import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Deliveries.css';

const Deliveries = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, recent, older
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/delivery/recent');
      setDeliveries(response.data.deliveries || []);
      setError('');
    } catch (err) {
      setError('Failed to fetch deliveries');
      console.error('Deliveries fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

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

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = delivery.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.businessTypes?.some(type => type.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const deliveryDate = new Date(delivery.completedAt);
    const daysDiff = Math.floor((new Date() - deliveryDate) / (1000 * 60 * 60 * 24));
    
    const matchesFilter = filter === 'all' || 
                         (filter === 'recent' && daysDiff <= 7) ||
                         (filter === 'older' && daysDiff > 7);
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="deliveries-container">
        <div className="loading-spinner">Loading deliveries...</div>
      </div>
    );
  }

  return (
    <div className="deliveries-container">
      <div className="deliveries-header">
        <h2>📦 Deliveries</h2>
        <button onClick={fetchDeliveries} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Filters and Search */}
      <div className="controls-bar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by client name or business type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'recent' ? 'active' : ''}`}
            onClick={() => setFilter('recent')}
          >
            Recent (7 days)
          </button>
          <button
            className={`filter-btn ${filter === 'older' ? 'active' : ''}`}
            onClick={() => setFilter('older')}
          >
            Older
          </button>
        </div>
      </div>

      {/* Deliveries List */}
      {filteredDeliveries.length === 0 ? (
        <div className="no-deliveries">
          {searchTerm || filter !== 'all' ? 
            'No deliveries match your current filters' : 
            'No completed deliveries found'
          }
        </div>
      ) : (
        <div className="deliveries-grid">
          {filteredDeliveries.map((delivery) => (
            <div key={delivery.id} className="delivery-card">
              <div className="delivery-header">
                <div className="delivery-title">
                  <h3>{delivery.clientName}</h3>
                  <div className="delivery-date">
                    {formatDate(delivery.completedAt)}
                  </div>
                </div>
                <div className="delivery-status">
                  ✅ Completed
                </div>
              </div>

              <div className="delivery-details">
                <div className="detail-item">
                  <strong>Business Types:</strong> {delivery.businessTypes?.join(', ') || 'N/A'}
                </div>
                <div className="detail-item">
                  <strong>Locations:</strong> {delivery.zipCodes?.join(', ') || 'N/A'}
                </div>
                <div className="detail-item">
                  <strong>Leads Found:</strong> {delivery.leadsCount || 0}
                </div>
                <div className="detail-item">
                  <strong>Job ID:</strong> <code>{delivery.jobId}</code>
                </div>
              </div>

              {/* Files Section */}
              {delivery.files && delivery.files.length > 0 && (
                <div className="files-section">
                  <h4>📁 Generated Files</h4>
                  <div className="files-list">
                    {delivery.files.map((file, index) => (
                      <div key={index} className="file-item">
                        <div className="file-info">
                          <span className="file-icon">{getFileIcon(file.name)}</span>
                          <div className="file-details">
                            <div className="file-name">{file.name}</div>
                            <div className="file-meta">
                              {formatFileSize(file.size)} • {file.type}
                            </div>
                          </div>
                        </div>
                        <button
                          className="download-btn"
                          onClick={() => handleDownload(file.id, file.name)}
                        >
                          ⬇️ Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="delivery-actions">
                <button 
                  className="action-btn secondary"
                  onClick={() => {
                    const details = `Delivery Details:\n\nClient: ${delivery.clientName}\nBusiness Types: ${delivery.businessTypes?.join(', ')}\nLocations: ${delivery.zipCodes?.join(', ')}\nLeads Found: ${delivery.leadsCount}\nCompleted: ${formatDate(delivery.completedAt)}\nJob ID: ${delivery.jobId}`;
                    alert(details);
                  }}
                >
                  📋 Details
                </button>
                <button 
                  className="action-btn primary"
                  onClick={() => {
                    // This could trigger a new job with similar parameters
                    alert('Feature coming soon: Repeat job with same parameters');
                  }}
                >
                  🔄 Repeat Job
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredDeliveries.length > 0 && (
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">Total Deliveries:</span>
            <span className="stat-value">{filteredDeliveries.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Leads:</span>
            <span className="stat-value">
              {filteredDeliveries.reduce((sum, delivery) => sum + (delivery.leadsCount || 0), 0)}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Success Rate:</span>
            <span className="stat-value">
              {Math.round((filteredDeliveries.filter(d => d.leadsCount > 0).length / filteredDeliveries.length) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deliveries; 