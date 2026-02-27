import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Key, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Activity
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalCredentials: 0,
    expiringSoon: 0,
    recentlyRotated: 0,
    complianceScore: 0
  });

  const [credentials, setCredentials] = useState([]);
  const [rotationHistory, setRotationHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_ENDPOINT = 'https://t9abv3wghl.execute-api.us-east-1.amazonaws.com';

  // Fetch real data from backend
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch credentials from DynamoDB
      const response = await fetch(`${API_ENDPOINT}/credentials`).catch(() => null);
      
      if (response && response.ok) {
        const data = await response.json();
        const allCredentials = data.credentials || [];
        
        // Calculate stats from real data
        const totalCredentials = allCredentials.length;
        const expiringSoon = allCredentials.filter(c => c.expiresIn > 0 && c.expiresIn < 15).length;
        const recentlyRotated = allCredentials.filter(c => {
          const rotatedDate = new Date(c.lastRotated);
          const daysSince = (Date.now() - rotatedDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysSince < 7;
        }).length;
        const complianceScore = totalCredentials > 0 
          ? Math.round((allCredentials.filter(c => c.status === 'active').length / totalCredentials) * 100)
          : 100;
        
        setStats({
          totalCredentials,
          expiringSoon,
          recentlyRotated,
          complianceScore
        });

        // Group credentials by type
        const credentialsByType = allCredentials.reduce((acc, cred) => {
          const type = cred.type || 'Unknown';
          if (!acc[type]) {
            acc[type] = { type, count: 0, statuses: [] };
          }
          acc[type].count++;
          acc[type].statuses.push(cred.status);
          return acc;
        }, {});

        const credentialsList = Object.values(credentialsByType).map((group: any) => {
          const hasExpired = group.statuses.includes('expired');
          const hasExpiring = group.statuses.includes('expiring');
          const status = hasExpired ? 'expired' : hasExpiring ? 'aging' : 'ok';
          
          return {
            type: group.type,
            count: group.count,
            status: status,
            lastRotated: 'Various'
          };
        });

        setCredentials(credentialsList);

        // Generate rotation history from audit logs
        // For now, use empty array - can be populated from audit logs
        setRotationHistory([]);
        
      } else {
        // If API call fails, show empty state
        setStats({
          totalCredentials: 0,
          expiringSoon: 0,
          recentlyRotated: 0,
          complianceScore: 0
        });
        setCredentials([]);
        setRotationHistory([]);
      }
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Show empty state on error
      setStats({
        totalCredentials: 0,
        expiringSoon: 0,
        recentlyRotated: 0,
        complianceScore: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const credentialTypeData = credentials.map(cred => ({
    name: cred.type,
    value: cred.count,
    color: cred.status === 'ok' ? '#2ECC40' : cred.status === 'aging' ? '#FFDC00' : '#FF4136'
  }));

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'aging':
        return <Clock className="h-5 w-5 text-warning" />;
      case 'expired':
        return <AlertTriangle className="h-5 w-5 text-danger" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'text-success';
      case 'aging':
        return 'text-warning';
      case 'expired':
        return 'text-danger';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Monitor your credential security and compliance status</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Key className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Credentials</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCredentials}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-2xl font-bold text-gray-900">{stats.expiringSoon}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Recently Rotated</p>
              <p className="text-2xl font-bold text-gray-900">{stats.recentlyRotated}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Shield className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Compliance Score</p>
              <p className="text-2xl font-bold text-gray-900">{stats.complianceScore}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Credential Types Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Credential Types</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={credentialTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {credentialTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rotation History Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Rotation History</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rotationHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="rotations" stroke="#3f51b5" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Credentials Table */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Credential Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credential Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Rotated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {credentials.map((credential, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {credential.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {credential.lastRotated}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(credential.status)}
                      <span className={`ml-2 text-sm font-medium ${getStatusColor(credential.status)}`}>
                        {credential.status.charAt(0).toUpperCase() + credential.status.slice(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {credential.count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button className="text-primary-600 hover:text-primary-900 font-medium">
                      Rotate Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
