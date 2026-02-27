/**
 * API Service
 * Handles all API calls to the VaultPilot backend
 */

import { Auth } from 'aws-amplify';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.vaultpilot.com';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

/**
 * Make authenticated API request
 */
async function makeRequest<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<ApiResponse<T>> {
  try {
    // Get JWT token from Cognito
    const session = await Auth.currentSession();
    const token = session.getIdToken().getJwtToken();

    const response = await fetch(`${API_ENDPOINT}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    console.error('API Request failed:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get all credentials
 */
export async function getCredentials() {
  return makeRequest('GET', '/credentials');
}

/**
 * Get single credential
 */
export async function getCredential(id: string) {
  return makeRequest('GET', `/credentials/${id}`);
}

/**
 * Create new credential
 */
export async function createCredential(credential: any) {
  return makeRequest('POST', '/credentials', credential);
}

/**
 * Update credential
 */
export async function updateCredential(id: string, credential: any) {
  return makeRequest('PUT', `/credentials/${id}`, credential);
}

/**
 * Delete credential
 */
export async function deleteCredential(id: string) {
  return makeRequest('DELETE', `/credentials/${id}`);
}

/**
 * Rotate credential
 */
export async function rotateCredential(id: string) {
  return makeRequest('POST', `/rotation/${id}`);
}

/**
 * Trigger discovery
 */
export async function triggerDiscovery() {
  return makeRequest('POST', '/discovery');
}

/**
 * Get audit logs
 */
export async function getAuditLogs(filters?: any) {
  const queryParams = filters ? '?' + new URLSearchParams(filters).toString() : '';
  return makeRequest('GET', `/audit${queryParams}`);
}

/**
 * Get settings
 */
export async function getSettings() {
  return makeRequest('GET', '/settings');
}

/**
 * Update settings
 */
export async function updateSettings(settings: any) {
  return makeRequest('PUT', '/settings', settings);
}
