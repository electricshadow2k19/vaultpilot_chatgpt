import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Key, 
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Activity,
  RefreshCw,
  Eye,
  RotateCw,
  Server,
  Filter,
  Search
} from 'lucide-react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalAccounts: 0,
    activeKeys: 0,
    expiringSoon: 0,
    expired: 0,
    totalCredentials: 0,
    recentlyRotated: 0,
    complianceScore: 0
  });

  const [credentials, setCredentials] = useState<any[]>([]);
  const [accountSummary, setAccountSummary] = useState<any[]>([]);
  const [rotationTrend, setRotationTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [awsAccounts, setAwsAccounts] = useState<any[]>([]);
  
  // Filters
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCredential, setSelectedCredential] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [sortField, setSortField] = useState<string>('lastRotated');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const API_ENDPOINT = 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com';
  const ROTATION_API_ENDPOINT = 'https://nh9vt3pbta.execute-api.us-east-1.amazonaws.com/prod';

  // Generate rotation trend from credentials
  const generateRotationTrend = (credentials: any[]) => {
    const last7Days = [];
    const today = new Date();
    
    // Create buckets for last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      last7Days.push({
        date: i === 0 ? 'Today' : dateStr,
        rotations: 0,
        fullDate: date.toISOString().split('T')[0]
      });
    }
    
    // Count rotations per day based on lastRotated field
    credentials.forEach((cred: any) => {
      if (cred.lastRotated) {
        const rotatedDate = new Date(cred.lastRotated);
        const rotatedDateStr = rotatedDate.toISOString().split('T')[0];
        
        const dayBucket = last7Days.find(day => day.fullDate === rotatedDateStr);
        if (dayBucket) {
          dayBucket.rotations++;
        }
      }
    });
    
    return last7Days.map(({ date, rotations }) => ({ date, rotations }));
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch AWS accounts
      const accountsResponse = await fetch(`${API_ENDPOINT}/accounts`).catch(() => null);
      let totalAccountsCount = 0;
      let accountsList: any[] = [];
      
      if (accountsResponse && accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        totalAccountsCount = accountsData.count || 0;
        accountsList = accountsData.accounts || [];
        setAwsAccounts(accountsList);
      }
      
      // Fetch credentials
      const credsResponse = await fetch(`${API_ENDPOINT}/credentials`).catch(() => null);
      
      if (credsResponse && credsResponse.ok) {
        const data = await credsResponse.json();
        const allCredentials = data.credentials || [];
        
        setCredentials(allCredentials);
        
        // Calculate stats
        const activeKeys = allCredentials.filter((c: any) => c.status === 'active').length;
        const expiringSoon = allCredentials.filter((c: any) => c.expiresIn > 0 && c.expiresIn < 15).length;
        const expired = allCredentials.filter((c: any) => c.status === 'expired').length;
        const totalCredentials = allCredentials.length;
        const recentlyRotated = allCredentials.filter((c: any) => {
          const rotatedDate = new Date(c.lastRotated);
          const daysSince = (Date.now() - rotatedDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysSince < 7;
        }).length;
        
        // Group by account and map to account names
        const accountGroups = allCredentials.reduce((acc: any, cred: any) => {
          // Map tenantId to accountId (default -> 700880967608)
          let accountId = cred.accountId || cred.tenantId;
          if (accountId === 'default') accountId = '700880967608';
          
          // Find account name from accounts list
          const account = accountsList.find((a: any) => a.accountId === accountId);
          const accountLabel = account ? `${account.accountName}` : accountId;
          
          if (!acc[accountLabel]) {
            acc[accountLabel] = { accountId: accountLabel, count: 0, active: 0, expiring: 0, expired: 0 };
          }
          acc[accountLabel].count++;
          if (cred.status === 'active') acc[accountLabel].active++;
          if (cred.status === 'expiring') acc[accountLabel].expiring++;
          if (cred.status === 'expired') acc[accountLabel].expired++;
          return acc;
        }, {});
        
        const accountSummaryData = Object.values(accountGroups);
        
        // Use API count if available, otherwise count from credentials
        const finalAccountCount = totalAccountsCount > 0 ? totalAccountsCount : Object.keys(accountGroups).length;
        
        setStats({
          totalAccounts: finalAccountCount,
          activeKeys,
          expiringSoon,
          expired,
          totalCredentials,
          recentlyRotated,
          complianceScore: totalCredentials > 0 ? Math.round((activeKeys / totalCredentials) * 100) : 100
        });
        
        setAccountSummary(accountSummaryData);
        
        // Generate rotation trend from actual credential lastRotated dates
        const trendData = generateRotationTrend(allCredentials);
        setRotationTrend(trendData);
        
      } else {
        setStats({
          totalAccounts: 0,
          activeKeys: 0,
          expiringSoon: 0,
          expired: 0,
          totalCredentials: 0,
          recentlyRotated: 0,
          complianceScore: 0
        });
      }
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique accounts for filter
  const uniqueAccounts = Array.from(new Set(credentials.map((c: any) => c.tenantId || 'default')));

  // Helper function to check if credential belongs to selected account
  const credentialMatchesAccount = (cred: any, selectedAccountId: string): boolean => {
    if (selectedAccountId === 'all') return true;
    
    // Check direct accountId match
    if (cred.accountId === selectedAccountId) return true;
    
    // Map tenantId to accountId for "default" credentials
    // "default" tenantId belongs to the main VaultPilot account (700880967608)
    if (cred.tenantId === 'default' && selectedAccountId === '700880967608') return true;
    
    // Check if tenantId matches
    if (cred.tenantId === selectedAccountId) return true;
    
    return false;
  };

  // Sort handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort credentials
  const filteredAndSortedCredentials = credentials
    .filter((cred: any) => {
      if (!credentialMatchesAccount(cred, selectedAccount)) return false;
      if (selectedStatus !== 'all' && cred.status !== selectedStatus) return false;
      if (selectedType !== 'all' && cred.type !== selectedType) return false;
      if (searchTerm && !cred.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'account':
          aVal = a.tenantId || 'default';
          bVal = b.tenantId || 'default';
          break;
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'age':
          aVal = getAgeInDays(a.lastRotated);
          bVal = getAgeInDays(b.lastRotated);
          break;
        case 'lastRotated':
          aVal = new Date(a.lastRotated).getTime();
          bVal = new Date(b.lastRotated).getTime();
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" /> Active
        </span>;
      case 'expiring':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3 mr-1" /> Expiring
        </span>;
      case 'expired':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="h-3 w-3 mr-1" /> Expired
        </span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Unknown</span>;
    }
  };

  const getAgeInDays = (lastRotated: string) => {
    const rotatedDate = new Date(lastRotated);
    return Math.floor((Date.now() - rotatedDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  const pieChartData = accountSummary.map((account: any, index: number) => ({
    name: account.accountId,
    value: account.count,
    color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">Real-time credential security monitoring across all AWS accounts</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total AWS Accounts</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalAccounts}</p>
              <p className="text-xs text-green-600 mt-1">✓ All connected</p>
            </div>
            <Server className="h-12 w-12 text-blue-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Credentials</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeKeys}</p>
              <p className="text-xs text-gray-500 mt-1">✓ Healthy status</p>
            </div>
            <CheckCircle className="h-12 w-12 text-green-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.expiringSoon}</p>
              <p className="text-xs text-yellow-600 mt-1">⚠ Needs attention</p>
            </div>
            <Clock className="h-12 w-12 text-yellow-500 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.expired}</p>
              <p className="text-xs text-red-600 mt-1">✕ Critical</p>
            </div>
            <AlertTriangle className="h-12 w-12 text-red-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credentials by Account - Pie Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Credentials by Account</h3>
          {pieChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>

        {/* Rotation Trend - Line Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rotation Trend (Last 7 Days)</h3>
          {rotationTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rotationTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="rotations" stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              No rotation history yet
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Accounts</option>
              {awsAccounts.map((account: any) => (
                <option key={account.id} value={account.accountId}>
                  {account.accountName} ({account.accountId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring Soon</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Types</option>
              <option value="AWS_IAM_KEY">IAM Keys</option>
              <option value="SMTP_PASSWORD">SMTP</option>
              <option value="RDS_PASSWORD">Database</option>
              <option value="SECRETS_MANAGER">Secrets Manager</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search credentials..."
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Live Credentials Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Live Credentials ({filteredAndSortedCredentials.length})
          </h3>
          <p className="text-sm text-gray-600 mt-1">Real-time view of all managed credentials • Click column headers to sort</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  onClick={() => handleSort('account')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Account</span>
                    {sortField === 'account' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Credential Name</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('type')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Type</span>
                    {sortField === 'type' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Status</span>
                    {sortField === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('age')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Age</span>
                    {sortField === 'age' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort('lastRotated')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center space-x-1">
                    <span>Last Rotated</span>
                    {sortField === 'lastRotated' ? (
                      sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedCredentials.length > 0 ? filteredAndSortedCredentials.map((cred: any) => (
                <tr key={cred.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cred.tenantId || 'default'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{cred.name}</div>
                    <div className="text-xs text-gray-500">{cred.environment}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cred.type?.replace('_', ' ')}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(cred.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{getAgeInDays(cred.lastRotated)} days</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {new Date(cred.lastRotated).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(cred.lastRotated).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={async () => {
                        if (window.confirm(`Rotate credential: ${cred.name}?`)) {
                          try {
                            const response = await fetch(`${ROTATION_API_ENDPOINT}/rotation/${cred.id}`, { 
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json'
                              }
                            });
                            if (response.ok) {
                              alert('✅ Rotation initiated! Refresh the page to see updates.');
                              fetchDashboardData();
                            } else {
                              const error = await response.json();
                              alert(`Failed to rotate: ${error.message || 'Unknown error'}`);
                            }
                          } catch (error) {
                            alert('Failed to initiate rotation');
                          }
                        }
                      }}
                      className="text-primary-600 hover:text-primary-900 font-medium"
                      title="Rotate Now"
                    >
                      Rotate Now
                    </button>
                    <button
                      onClick={() => {
                        setSelectedCredential(cred);
                        setShowDetailsModal(true);
                      }}
                      className="text-gray-600 hover:text-gray-900"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4 inline" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Key className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p>No credentials found matching your filters</p>
                    <p className="text-sm mt-1">Try adjusting your filter settings or scan an AWS account</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedCredential && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedCredential.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{selectedCredential.id}</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Account</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCredential.tenantId || 'default'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Type</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCredential.type?.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Environment</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCredential.environment}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedCredential.status)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Source</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCredential.source}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Expires In</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedCredential.expiresIn} days</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Created</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(selectedCredential.createdAt).toLocaleDateString()}
                    {' '}
                    {new Date(selectedCredential.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Last Rotated</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(selectedCredential.lastRotated).toLocaleDateString()}
                    {' '}
                    {new Date(selectedCredential.lastRotated).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Last Updated</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {new Date(selectedCredential.updatedAt).toLocaleDateString()}
                    {' '}
                    {new Date(selectedCredential.updatedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Age</label>
                  <p className="mt-1 text-sm text-gray-900">{getAgeInDays(selectedCredential.lastRotated)} days</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm(`Rotate credential: ${selectedCredential.name}?`)) {
                      try {
                        const response = await fetch(`${ROTATION_API_ENDPOINT}/rotation/${selectedCredential.id}`, { 
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          }
                        });
                        if (response.ok) {
                          alert('✅ Rotation initiated!');
                          setShowDetailsModal(false);
                          fetchDashboardData();
                        } else {
                          const error = await response.json();
                          alert(`Failed to rotate: ${error.message || 'Unknown error'}`);
                        }
                      } catch (error) {
                        alert('Failed to initiate rotation');
                      }
                    }
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Rotate Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
