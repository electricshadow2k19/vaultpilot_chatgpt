import React, { useState } from 'react';
import { 
  Save, 
  Bell, 
  Shield, 
  Key, 
  Mail
} from 'lucide-react';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      slack: false,
      rotationAlerts: true,
      expirationWarnings: true,
      securityAlerts: true
    },
    rotation: {
      autoRotation: true,
      rotationInterval: 90,
      warningDays: 30,
      dryRunMode: false
    },
    security: {
      requireMFA: true,
      sessionTimeout: 30,
      auditRetention: 365,
      encryptionLevel: 'high'
    },
    integrations: {
      aws: {
        enabled: true,
        region: 'us-east-1',
        roleArn: ''
      },
      github: {
        enabled: false,
        token: ''
      },
      slack: {
        enabled: false,
        webhookUrl: ''
      }
    }
  });

  const [activeTab, setActiveTab] = useState('notifications');

  const handleSave = () => {
    // Save settings logic here
    console.log('Saving settings:', settings);
    alert('✅ Settings saved successfully!');
  };

  const tabs = [
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'rotation', name: 'Rotation', icon: Key },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'integrations', name: 'Integrations', icon: Mail }
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">Configure your VaultPilot preferences and security settings</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <div className="lg:w-64">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <tab.icon className="mr-3 h-5 w-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="bg-white rounded-lg shadow">
            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Notification Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">Notification Channels</h4>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.email}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, email: e.target.checked }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Email notifications</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.slack}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, slack: e.target.checked }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Slack notifications</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">Alert Types</h4>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.rotationAlerts}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, rotationAlerts: e.target.checked }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Credential rotation alerts</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.expirationWarnings}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, expirationWarnings: e.target.checked }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Expiration warnings</span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.securityAlerts}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            notifications: { ...prev.notifications, securityAlerts: e.target.checked }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Security alerts</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rotation Tab */}
            {activeTab === 'rotation' && (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Rotation Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.rotation.autoRotation}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          rotation: { ...prev.rotation, autoRotation: e.target.checked }
                        }))}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm text-gray-700">Enable automatic rotation</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rotation Interval (days)
                    </label>
                    <input
                      type="number"
                      value={settings.rotation.rotationInterval}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        rotation: { ...prev.rotation, rotationInterval: parseInt(e.target.value) }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Warning Days Before Expiration
                    </label>
                    <input
                      type="number"
                      value={settings.rotation.warningDays}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        rotation: { ...prev.rotation, warningDays: parseInt(e.target.value) }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.rotation.dryRunMode}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          rotation: { ...prev.rotation, dryRunMode: e.target.checked }
                        }))}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm text-gray-700">Dry run mode (test rotations without applying)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Security Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.security.requireMFA}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          security: { ...prev.security, requireMFA: e.target.checked }
                        }))}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm text-gray-700">Require multi-factor authentication</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Session Timeout (minutes)
                    </label>
                    <input
                      type="number"
                      value={settings.security.sessionTimeout}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        security: { ...prev.security, sessionTimeout: parseInt(e.target.value) }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Audit Log Retention (days)
                    </label>
                    <input
                      type="number"
                      value={settings.security.auditRetention}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        security: { ...prev.security, auditRetention: parseInt(e.target.value) }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Encryption Level
                    </label>
                    <select
                      value={settings.security.encryptionLevel}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        security: { ...prev.security, encryptionLevel: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="standard">Standard (AES-256)</option>
                      <option value="high">High (AES-256 + KMS)</option>
                      <option value="maximum">Maximum (HSM-backed)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Integration Settings</h3>
                
                <div className="space-y-6">
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">AWS Integration</h4>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.integrations.aws.enabled}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              aws: { ...prev.integrations.aws, enabled: e.target.checked }
                            }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Enable AWS integration</span>
                      </label>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          AWS Region
                        </label>
                        <input
                          type="text"
                          value={settings.integrations.aws.region}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              aws: { ...prev.integrations.aws, region: e.target.value }
                            }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">GitHub Integration</h4>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.integrations.github.enabled}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              github: { ...prev.integrations.github, enabled: e.target.checked }
                            }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Enable GitHub integration</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-4">Slack Integration</h4>
                    <div className="space-y-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.integrations.slack.enabled}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              slack: { ...prev.integrations.slack, enabled: e.target.checked }
                            }
                          }))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">Enable Slack integration</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleSave}
                className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 flex items-center"
              >
                <Save className="h-5 w-5 mr-2" />
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
