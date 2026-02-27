import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';

// Components
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Credentials from './pages/Credentials';
import Audit from './pages/Audit';
import Settings from './pages/Settings';

// Configure Amplify
Amplify.configure({
  Auth: {
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
    userPoolId: process.env.REACT_APP_USER_POOL_ID || '',
    userPoolWebClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || '',
  },
  API: {
    endpoints: [
      {
        name: 'VaultPilotAPI',
        endpoint: process.env.REACT_APP_API_ENDPOINT || '',
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      },
    ],
  },
});

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Layout user={user} signOut={signOut}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/credentials" element={<Credentials />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
            <Toaster position="top-right" />
          </div>
        </Router>
      )}
    </Authenticator>
  );
}

export default App;
