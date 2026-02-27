import React, { useState, useEffect } from 'react';
import { Cloud, Plus, RefreshCw, Trash2, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react';

interface AWSAccount {
  id: string;
  accountName: string;
  accountId: string;
  roleArn: string;
  externalId: string;
  regions: string[];
  status: 'active' | 'error' | 'pending';
  lastScan?: string;
  credentialsCount?: number;
}

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<AWSAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState({
    accountName: '',
    accountId: '',
    roleArn: '',
    externalId: '',
    regions: ['us-east-1']
  });

  const API_ENDPOINT = 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com';

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_ENDPOINT}/accounts`);
      
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      } else {
        console.error('Failed to fetch accounts');
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_ENDPOINT}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount)
      });
      
      if (response.ok) {
        const data = await response.json();
        alert('✅ Account added successfully! Scanning for credentials...');
        
        setShowAddModal(false);
        setNewAccount({
          accountName: '',
          accountId: '',
          roleArn: '',
          externalId: '',
          regions: ['us-east-1']
        });
        
        // Refresh accounts list
        fetchAccounts();
      } else {
        const error = await response.json();
        alert(`❌ Failed to add account: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Error adding account:', error);
      alert('Failed to add account. Check console for details.');
    }
  };

  const handleTestConnection = async (account: AWSAccount) => {
    try {
      alert(`Testing connection to ${account.accountName}...`);
      // TODO: Implement actual test connection API call
    } catch (error) {
      console.error('Error testing connection:', error);
    }
  };

  const handleScanAccount = async (account: AWSAccount) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/accounts/${account.accountId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ Scan complete! Found ${data.credentialsFound || 0} credentials.`);
        fetchAccounts(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`❌ Scan failed: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error scanning account:', error);
      alert('Failed to scan account');
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (window.confirm('Are you sure you want to remove this AWS account?')) {
      try {
        // TODO: Replace with actual API call
        setAccounts(accounts.filter(acc => acc.id !== accountId));
        alert('✅ Account removed successfully');
      } catch (error) {
        console.error('Error deleting account:', error);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </span>
      ),
      error: (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="w-3 h-3 mr-1" />
          Error
        </span>
      ),
      pending: (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Pending
        </span>
      )
    };
    return badges[status as keyof typeof badges] || badges.pending;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AWS Accounts</h1>
            <p className="text-gray-600 mt-1">Manage AWS accounts for credential rotation</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add AWS Account
          </button>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-3 animate-spin" />
            <p className="text-gray-500">Loading accounts...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
            <Cloud className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No AWS accounts connected yet</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Add your first AWS account →
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Scan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credentials</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Cloud className="h-8 w-8 text-primary-600 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{account.accountName}</div>
                        <div className="text-xs text-gray-500">{account.roleArn}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {account.accountId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {account.regions.map(region => (
                        <span key={region} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {region}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(account.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.lastScan ? new Date(account.lastScan).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {account.credentialsCount || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleScanAccount(account)}
                      className="text-primary-600 hover:text-primary-900"
                      title="Scan for credentials"
                    >
                      <RefreshCw className="h-4 w-4 inline" />
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Remove account"
                    >
                      <Trash2 className="h-4 w-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Integration Guide */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
          <ExternalLink className="h-5 w-5 mr-2" />
          How to Connect an AWS Account
        </h3>
        <ol className="space-y-2 text-sm text-blue-800">
          <li><strong>Step 1:</strong> Log into your AWS account and go to IAM → Roles</li>
          <li><strong>Step 2:</strong> Create a new role with "Another AWS account" trust policy</li>
          <li><strong>Step 3:</strong> Use VaultPilot Account ID: <code className="bg-blue-100 px-2 py-1 rounded">700880967608</code></li>
          <li><strong>Step 4:</strong> Enable "Require external ID" and generate a unique ID</li>
          <li><strong>Step 5:</strong> Attach policies: <code className="bg-blue-100 px-2 py-1 rounded">IAMReadOnlyAccess</code>, <code className="bg-blue-100 px-2 py-1 rounded">SecretsManagerReadWrite</code></li>
          <li><strong>Step 6:</strong> Copy the Role ARN and External ID, then add the account above</li>
        </ol>
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add AWS Account</h2>
            
            <form onSubmit={handleAddAccount}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <input
                    type="text"
                    required
                    value={newAccount.accountName}
                    onChange={(e) => setNewAccount({ ...newAccount, accountName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="e.g., Production AWS Account"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AWS Account ID</label>
                  <input
                    type="text"
                    required
                    value={newAccount.accountId}
                    onChange={(e) => setNewAccount({ ...newAccount, accountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="e.g., 123456789012"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role ARN</label>
                  <input
                    type="text"
                    required
                    value={newAccount.roleArn}
                    onChange={(e) => setNewAccount({ ...newAccount, roleArn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="arn:aws:iam::123456789012:role/VaultPilotAccess"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">External ID</label>
                  <input
                    type="text"
                    required
                    value={newAccount.externalId}
                    onChange={(e) => setNewAccount({ ...newAccount, externalId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="e.g., vaultpilot-unique-id-12345"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regions to Scan</label>
                  <select
                    multiple
                    value={newAccount.regions}
                    onChange={(e) => setNewAccount({ 
                      ...newAccount, 
                      regions: Array.from(e.target.selectedOptions, option => option.value)
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                    <option value="eu-west-1">eu-west-1 (Ireland)</option>
                    <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple regions</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;

