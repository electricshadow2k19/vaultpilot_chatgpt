import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './index.css';

// Import dashboard components
import Dashboard from './pages/Dashboard.tsx';
import Credentials from './pages/Credentials.tsx';
import Accounts from './pages/Accounts.tsx';
import Audit from './pages/Audit.tsx';
import Settings from './pages/Settings.tsx';
import Layout from './components/Layout.tsx';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if we have a redirect path from sessionStorage (set by error.html)
    const redirectPath = sessionStorage.getItem('redirectPath');
    if (redirectPath && redirectPath !== location.pathname) {
      sessionStorage.removeItem('redirectPath');
      navigate(redirectPath);
    }
  }, [navigate, location]);

  // Mock user for demo
  const mockUser = {
    username: 'demo@vaultpilot.com',
    attributes: {
      email: 'demo@vaultpilot.com'
    }
  };

  const mockSignOut = () => {
    alert('Sign out functionality requires Cognito setup');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Layout user={mockUser} signOut={mockSignOut}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);