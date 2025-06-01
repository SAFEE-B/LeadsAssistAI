import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  Navigate
} from 'react-router-dom';
import './App.css';

// Import components
import Landing from './components/Landing';
import Login from './components/Login';
import Chat from './components/Chat';

// Basic PrivateRoute component
const PrivateRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('authToken'); // Simple auth check
  return isAuthenticated ? children : <Navigate to="/login" />;
};

// Header component for better navigation
const Header = () => {
  const isAuthenticated = !!localStorage.getItem('authToken');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/'; 
  };

  const handleRequestDemo = () => {
    const subject = 'LeadAssistAI Demo Request';
    const body = `Hello LeadAssistAI Team,

I would like to request a demo of LeadAssistAI to see how it can help with lead generation and management for my business.

Please contact me to schedule a demonstration.

Best regards`;
    
    window.open(`mailto:demo@leadassistai.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  return (
    <header className="main-header">
      <div className="header-container">
        <Link to="/" className="logo">
          <span className="logo-icon">🤖</span>
          <span className="logo-text">LeadAssistAI</span>
        </Link>
        
        <nav className="header-nav">
          {!isAuthenticated ? (
            <>
              <Link to="/" className="nav-link">Home</Link>
              <div className="auth-buttons">
                <Link to="/login" className="nav-link login-link">Login</Link>
                <button onClick={handleRequestDemo} className="nav-link demo-btn">Request Demo</button>
              </div>
            </>
          ) : (
            <>
              <Link to="/dashboard" className="nav-link">Dashboard</Link>
              <div className="user-menu">
                <span className="user-welcome">Welcome, {user.username || 'User'}</span>
                <button onClick={handleLogout} className="logout-btn">Logout</button>
              </div>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

function App() {
  const isAuthenticated = !!localStorage.getItem('authToken');

  return (
    <Router>
      <div className="App">
        <Header />
        
        <main className="App-content">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Landing />} />
            <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
            
            {/* Protected Routes */}
            <Route 
              path="/dashboard" 
              element={
                <PrivateRoute>
                  <Chat />
                </PrivateRoute>
              }
            />
            
            {/* Redirect unknown paths */}
            <Route 
              path="*" 
              element={isAuthenticated ? <Navigate to="/dashboard" /> : <Navigate to="/" />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 