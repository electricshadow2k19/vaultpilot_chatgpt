import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Key, 
  AlertTriangle, 
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
  
  // Filters
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const API_ENDPOINT = 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
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
        
        // Group by account
        const accountGroups = allCredentials.reduce((acc: any, cred: any) => {
          const accountId = cred.accountId || cred.tenantId || 'default';
          if (!acc[accountId]) {
            acc[accountId] = { accountId, count: 0, active: 0, expiring: 0, expired: 0 };
          }
          acc[accountId].count++;
          if (cred.status === 'active') acc[accountId].active++;
          if (cred.status === 'expiring') acc[accountId].expiring++;
          if (cred.status === 'expired') acc[accountId].expired++;
          return acc;
        }, {});
        
        const accountSummaryData = Object.values(accountGroups);
        
        setStats({
          totalAccounts: accountSummaryData.length,
          activeKeys,
          expiringSoon,
          expired,
          totalCredentials,
          recentlyRotated,
          complianceScore: totalCredentials > 0 ? Math.round((activeKeys / totalCredentials) * 100) : 100
        });
        
        setAccountSummary(accountSummaryData);
        
        // Mock rotation trend - would come from audit logs in production
        setRotationTrend([
          { date: '10/12', rotations: 5 },
          { date: '10/13', rotations: 8 },
          { date: '10/14', rotations: 6 },
          { date: '10/15', rotations: 12 },
          { date: '10/16', rotations: 9 },
          { date: '10/17', rotations: 15 },
          { date: 'Today', rotations: recentlyRotated }
        ]);
        
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

  // Filter credentials
  const filteredCredentials = credentials.filter((cred: any) => {
    if (selectedAccount !== 'all' && cred.tenantId !== selectedAccount) return false;
    if (selectedStatus !== 'all' && cred.status !== selectedStatus) return false;
    if (selectedType !== 'all' && cred.type !== selectedType) return false;
    if (searchTerm && !cred.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
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
              {accountSummary.map((account: any) => (
                <option key={account.accountId} value={account.accountId}>{account.accountId}</option>
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
            Live Credentials ({filteredCredentials.length})
          </h3>
          <p className="text-sm text-gray-600 mt-1">Real-time view of all managed credentials</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credential Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Rotated</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCredentials.length > 0 ? filteredCredentials.map((cred: any) => (
                <tr key={cred.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cred.tenantId || 'default'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{cred.name}</div>
                    <div className="text-xs text-gray-500">{cred.environment}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cred.type?.replace('_', ' ')}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(cred.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{getAgeInDays(cred.lastRotated)} days</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(cred.lastRotated).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-primary-600 hover:text-primary-900 mr-3" title="Rotate">
                      <RotateCw className="h-4 w-4" />
                    </button>
                    <button className="text-gray-600 hover:text-gray-900" title="View Details">
                      <Eye className="h-4 w-4" />
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
    </div>
  );
};

export default Dashboard;
