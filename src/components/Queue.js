import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Queue.css';

const Queue = () => {
  const [queueStats, setQueueStats] = useState(null);
  const [activeJobs, setActiveJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchQueueData = async () => {
    try {
      setRefreshing(true);
      
      // Fetch queue statistics
      const statsResponse = await axios.get('/api/status/queues');
      setQueueStats(statsResponse.data);
      
      // Fetch active jobs
      const jobsResponse = await axios.get('/api/scraper/jobs');
      setActiveJobs(jobsResponse.data.jobs || []);
      
      setError('');
    } catch (err) {
      setError('Failed to fetch queue data');
      console.error('Queue fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueueData();
    
    // Set up auto-refresh every 10 seconds
    const interval = setInterval(fetchQueueData, 10000);
    
    return () => clearInterval(interval);
  }, []);

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
    return new Date(dateString).toLocaleString();
  };

  const handleJobClick = async (jobId) => {
    try {
      const response = await axios.get(`/api/scraper/job/${jobId}`);
      alert(`Job Details:\n${JSON.stringify(response.data, null, 2)}`);
    } catch (err) {
      alert('Failed to fetch job details');
    }
  };

  if (loading) {
    return (
      <div className="queue-container">
        <div className="loading-spinner">Loading queue data...</div>
      </div>
    );
  }

  return (
    <div className="queue-container">
      <div className="queue-header">
        <h2>📊 Queue Monitor</h2>
        <button 
          onClick={fetchQueueData} 
          disabled={refreshing}
          className="refresh-button"
        >
          {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Queue Statistics */}
      {queueStats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">Scraper Queue</div>
            <div className="stat-details">
              <div className="stat-item">
                <span>Waiting:</span>
                <span className="stat-value">{queueStats.scraper?.waiting || 0}</span>
              </div>
              <div className="stat-item">
                <span>Active:</span>
                <span className="stat-value">{queueStats.scraper?.active || 0}</span>
              </div>
              <div className="stat-item">
                <span>Completed:</span>
                <span className="stat-value">{queueStats.scraper?.completed || 0}</span>
              </div>
              <div className="stat-item">
                <span>Failed:</span>
                <span className="stat-value">{queueStats.scraper?.failed || 0}</span>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">Processing Queue</div>
            <div className="stat-details">
              <div className="stat-item">
                <span>Waiting:</span>
                <span className="stat-value">{queueStats.processing?.waiting || 0}</span>
              </div>
              <div className="stat-item">
                <span>Active:</span>
                <span className="stat-value">{queueStats.processing?.active || 0}</span>
              </div>
              <div className="stat-item">
                <span>Completed:</span>
                <span className="stat-value">{queueStats.processing?.completed || 0}</span>
              </div>
              <div className="stat-item">
                <span>Failed:</span>
                <span className="stat-value">{queueStats.processing?.failed || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Jobs */}
      <div className="jobs-section">
        <h3>Recent Jobs</h3>
        {activeJobs.length === 0 ? (
          <div className="no-jobs">
            No recent jobs found
          </div>
        ) : (
          <div className="jobs-grid">
            {activeJobs.map((job) => (
              <div 
                key={job.id || job.jobId} 
                className="job-card"
                onClick={() => handleJobClick(job.id || job.jobId)}
              >
                <div className="job-header">
                  <div className="job-status">
                    <span className="status-icon">{getStatusIcon(job.status)}</span>
                    <span 
                      className="status-text"
                      style={{ color: getStatusColor(job.status) }}
                    >
                      {job.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="job-id">#{job.id || job.jobId}</div>
                </div>
                
                <div className="job-details">
                  <div className="job-client">
                    <strong>Client:</strong> {job.clientName || 'Unknown'}
                  </div>
                  <div className="job-business-types">
                    <strong>Business Types:</strong> {job.businessTypes?.join(', ') || 'N/A'}
                  </div>
                  <div className="job-locations">
                    <strong>Locations:</strong> {job.zipCodes?.join(', ') || 'N/A'}
                  </div>
                  <div className="job-timestamp">
                    <strong>Created:</strong> {formatDate(job.createdAt || job.timestamp)}
                  </div>
                  {job.completedAt && (
                    <div className="job-completed">
                      <strong>Completed:</strong> {formatDate(job.completedAt)}
                    </div>
                  )}
                  {job.progress && (
                    <div className="job-progress">
                      <strong>Progress:</strong> {job.progress}%
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Queue; 