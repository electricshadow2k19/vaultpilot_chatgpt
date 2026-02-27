import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  RotateCcw, 
  Eye, 
  Edit, 
  Trash2,
  Key,
  Database,
  Mail,
  Github,
  Server
} from 'lucide-react';

interface Credential {
  id: string;
  name: string;
  type: 'AWS IAM' | 'Database' | 'SMTP' | 'GitHub' | 'API Token';
  environment: string;
  lastRotated: string;
  expiresIn: string;
  status: 'active' | 'expired' | 'expiring' | 'rotating';
  description?: string;
}

const Credentials: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const API_ENDPOINT = 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com';

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      
      // Fetch from DynamoDB via API Gateway
      const response = await fetch(`${API_ENDPOINT}/credentials`).catch(() => null);
      
      if (response && response.ok) {
        const data = await response.json();
        const allCredentials = data.credentials || [];
        
        // Transform data to match UI format
        const formattedCredentials = allCredentials.map((cred: any) => ({
          id: cred.id,
          name: cred.name,
          type: cred.type?.replace('_', ' ') || 'Unknown',
          environment: cred.environment || 'production',
          lastRotated: cred.lastRotated ? new Date(cred.lastRotated).toLocaleDateString() : 'Never',
          expiresIn: cred.expiresIn > 0 ? `${cred.expiresIn} days` : cred.expiresIn < 0 ? 'Expired' : 'N/A',
          status: cred.status || 'unknown',
          description: cred.metadata?.description || `${cred.type} credential`
        }));
        
        setCredentials(formattedCredentials);
      } else {
        // No API or error - show empty state
        setCredentials([]);
      }
      
    } catch (error) {
      console.error('Error fetching credentials:', error);
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'AWS IAM':
        return <Server className="h-5 w-5 text-orange-500" />;
      case 'Database':
        return <Database className="h-5 w-5 text-blue-500" />;
      case 'SMTP':
        return <Mail className="h-5 w-5 text-green-500" />;
      case 'GitHub':
        return <Github className="h-5 w-5 text-gray-800" />;
      case 'API Token':
        return <Key className="h-5 w-5 text-purple-500" />;
      default:
        return <Key className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expiring':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'rotating':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredCredentials = credentials.filter(cred => {
    const matchesSearch = cred.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cred.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || cred.type === filterType;
    const matchesStatus = filterStatus === 'all' || cred.status === filterStatus;
    
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleRotate = (id: string) => {
    setCredentials(prev => prev.map(cred => 
      cred.id === id ? { ...cred, status: 'rotating' as const } : cred
    ));
    
    // Simulate rotation process
    setTimeout(() => {
      setCredentials(prev => prev.map(cred => 
        cred.id === id ? { 
          ...cred, 
          status: 'active' as const, 
          lastRotated: new Date().toISOString().split('T')[0],
          expiresIn: '90 days'
        } : cred
      ));
    }, 2000);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Credentials</h1>
          <p className="mt-2 text-gray-600">Manage and monitor your credential lifecycle</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Add Credential
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search credentials..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="AWS IAM">AWS IAM</option>
              <option value="Database">Database</option>
              <option value="SMTP">SMTP</option>
              <option value="GitHub">GitHub</option>
              <option value="API Token">API Token</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
              <option value="rotating">Rotating</option>
            </select>
          </div>
        </div>
      </div>

      {/* Credentials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCredentials.map((credential) => (
          <div key={credential.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                {getTypeIcon(credential.type)}
                <div className="ml-3">
                  <h3 className="text-lg font-semibold text-gray-900">{credential.name}</h3>
                  <p className="text-sm text-gray-500">{credential.type}</p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(credential.status)}`}>
                {credential.status}
              </span>
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Environment:</span>
                <span className="text-gray-900">{credential.environment}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Last Rotated:</span>
                <span className="text-gray-900">{credential.lastRotated}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Expires In:</span>
                <span className="text-gray-900">{credential.expiresIn}</span>
              </div>
              {credential.description && (
                <p className="text-sm text-gray-600 mt-2">{credential.description}</p>
              )}
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => handleRotate(credential.id)}
                disabled={credential.status === 'rotating'}
                className="flex-1 bg-primary-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                {credential.status === 'rotating' ? 'Rotating...' : 'Rotate'}
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Eye className="h-4 w-4" />
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <Edit className="h-4 w-4" />
              </button>
              <button className="p-2 text-gray-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredCredentials.length === 0 && (
        <div className="text-center py-12">
          <Key className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No credentials found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || filterType !== 'all' || filterStatus !== 'all' 
              ? 'Try adjusting your search or filters.'
              : 'Get started by adding your first credential.'
            }
          </p>
        </div>
      )}
    </div>
  );
};

export default Credentials;
