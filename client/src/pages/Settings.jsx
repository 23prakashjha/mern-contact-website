import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { User, Mail, Settings as SettingsIcon, Shield, CheckCircle, Edit2, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
  const { user } = useAuth();
  
  const [settings, setSettings] = useState({
    adminName: user?.username || '',
    adminEmail: user?.email || '',
    defaultCommunicationType: 'all',
    autoSendFollowUp: false,
    followUpDelay: 3,
    maxRetries: 3,
    apiKeyMasked: '···································'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [editMode, setEditMode] = useState({
    adminName: false,
    adminEmail: false
  });
  const [tempValues, setTempValues] = useState({});

  // Update settings when user data changes
  useEffect(() => {
    if (user) {
      setSettings(prev => ({
        ...prev,
        adminName: user.username || '',
        adminEmail: user.email || ''
      }));
    }
  }, [user]);

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEdit = (field) => {
    setEditMode(prev => ({ ...prev, [field]: true }));
    setTempValues(prev => ({ ...prev, [field]: settings[field] }));
  };

  const handleSaveField = (field) => {
    setSettings(prev => ({ ...prev, [field]: tempValues[field] }));
    setEditMode(prev => ({ ...prev, [field]: false }));
    toast.success(`${field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')} updated successfully!`);
  };

  const handleCancelEdit = (field) => {
    setEditMode(prev => ({ ...prev, [field]: false }));
    setTempValues(prev => ({ ...prev, [field]: settings[field] }));
  };

  const handleTempChange = (field, value) => {
    setTempValues(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      alert('Settings saved successfully!');
    }, 1000);
  };

  const handleTestConnection = (service) => {
    alert(`Testing ${service} connection...`);
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <SettingsIcon className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <p className="text-blue-100">Manage your system configuration and administrative information.</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-800">General Information</h2>
        </div>
        
        <div className="space-y-6">

          {/* Admin Name */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                <label className="text-sm font-semibold text-gray-700">
                  Administrator Name
                </label>
              </div>
              {!editMode.adminName && (
                <button
                  onClick={() => handleEdit('adminName')}
                  className="text-purple-600 hover:text-purple-800 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {editMode.adminName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempValues.adminName || settings.adminName}
                  onChange={(e) => handleTempChange('adminName', e.target.value)}
                  className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => handleSaveField('adminName')}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleCancelEdit('adminName')}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium text-gray-900">{settings.adminName}</p>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            )}
          </div>

          {/* Admin Email */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-green-600" />
                <label className="text-sm font-semibold text-gray-700">
                  Administrator Email
                </label>
              </div>
              {!editMode.adminEmail && (
                <button
                  onClick={() => handleEdit('adminEmail')}
                  className="text-green-600 hover:text-green-800 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {editMode.adminEmail ? (
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={tempValues.adminEmail || settings.adminEmail}
                  onChange={(e) => handleTempChange('adminEmail', e.target.value)}
                  className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={() => handleSaveField('adminEmail')}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleCancelEdit('adminEmail')}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium text-gray-900">{settings.adminEmail}</p>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            )}
          </div>

          {/* Default Communication Type */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Default Communication Type
            </label>
            <select
              value={settings.defaultCommunicationType}
              onChange={(e) => handleInputChange('defaultCommunicationType', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Channels</option>
              <option value="email">Email Only</option>
              <option value="whatsapp">WhatsApp Only</option>
              <option value="sms">SMS Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-6 text-gray-800">API Configuration</h2>
        
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Twilio API Key
              </label>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex space-x-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={showApiKey ? 'YOUR_TWILIO_ACCOUNT_SID_HERE' : settings.apiKeyMasked}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleTestConnection('Twilio')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Test
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email SMTP Settings
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="SMTP Server"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Port"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Username"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                placeholder="Password"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => handleTestConnection('Email')}
              className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Test Email Connection
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-6 text-gray-800">Campaign Settings</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Auto Send Follow-up Messages
              </label>
              <p className="text-sm text-gray-500">Automatically send follow-up messages to non-responders</p>
            </div>
            <button
              onClick={() => handleInputChange('autoSendFollowUp', !settings.autoSendFollowUp)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.autoSendFollowUp ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.autoSendFollowUp ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Follow-up Delay (days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.followUpDelay}
              onChange={(e) => handleInputChange('followUpDelay', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Retries
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.maxRetries}
              onChange={(e) => handleInputChange('maxRetries', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default Settings;
