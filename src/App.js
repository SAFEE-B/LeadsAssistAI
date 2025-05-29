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
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Queue from './components/Queue';
import Deliveries from './components/Deliveries';

// Basic PrivateRoute component
const PrivateRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('authToken'); // Simple auth check
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  // Simple way to check if user is authenticated for nav display
  // In a real app, this would likely come from a context or state management
  const isAuthenticated = !!localStorage.getItem('authToken');

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    // Force a re-render by reloading the page
    window.location.href = '/login'; 
  };

  return (
    <Router>
      <div className="App">
        <nav>
          <ul>
            <li>
              <Link to="/">🏠 Home</Link>
            </li>
            {isAuthenticated ? (
              <>
                <li>
                  <Link to="/queue">📊 Queue</Link>
                </li>
                <li>
                  <Link to="/deliveries">📦 Deliveries</Link>
                </li>
                <li>
                  <button onClick={handleLogout}>🚪 Logout</button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/login">🔑 Login</Link>
                </li>
                <li>
                  <Link to="/signup">📝 Sign Up</Link>
                </li>
              </>
            )}
          </ul>
        </nav>

        <main className="App-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            <Route 
              path="/" 
              element={
                <PrivateRoute>
                  <Chat />
                </PrivateRoute>
              }
            />
            <Route 
              path="/queue" 
              element={
                <PrivateRoute>
                  <Queue />
                </PrivateRoute>
              }
            />
            <Route 
              path="/deliveries" 
              element={
                <PrivateRoute>
                  <Deliveries />
                </PrivateRoute>
              }
            />
             {/* Redirect unknown paths to home or login based on auth */}
            <Route 
              path="*" 
              element={isAuthenticated ? <Navigate to="/" /> : <Navigate to="/login" />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 