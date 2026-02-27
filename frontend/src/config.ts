// VaultPilot Frontend Configuration
// Centralized configuration to avoid hardcoded values

export const config = {
  // API Gateway Endpoint - can be overridden via environment variable
  // Production rotation API: https://nh9vt3pbta.execute-api.us-east-1.amazonaws.com/prod
  // Main API: https://t9abv3wghl.execute-api.us-east-1.amazonaws.com
  apiEndpoint: process.env.REACT_APP_API_ENDPOINT || 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com',
  rotationApiEndpoint: process.env.REACT_APP_ROTATION_API_ENDPOINT || 'https://nh9vt3pbta.execute-api.us-east-1.amazonaws.com/prod',
  
  // VaultPilot AWS Account ID (for customer onboarding instructions)
  vaultPilotAccountId: process.env.REACT_APP_VAULTPILOT_ACCOUNT_ID || '700880967608',
  
  // Environment
  environment: process.env.REACT_APP_ENVIRONMENT || 'production',
  
  // Feature flags
  features: {
    enableRotation: true,
    enableDiscovery: true,
    enableAuditLogs: true,
  },
  
  // Default settings
  defaults: {
    rotationInterval: 90, // days
    scanInterval: 24, // hours
  },
};

export default config;

