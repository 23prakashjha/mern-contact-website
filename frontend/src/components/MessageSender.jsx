import React, { useState } from 'react';

const MessageSender = ({ onSendMessage, loading, companies = [] }) => {
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [communicationType, setCommunicationType] = useState('all_channels');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Business categories (same as in History page)
 

  const handleCompanyToggle = (companyId) => {
    setSelectedCompanies(prev => 
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  const handleSelectAll = () => {
    if (selectedCompanies.length === filteredCompanies.length) {
      setSelectedCompanies([]);
    } else {
      setSelectedCompanies(filteredCompanies.map(company => company._id));
    }
  };

  const handleSendMessage = () => {
    if (selectedCompanies.length === 0) {
      alert('Please select at least one company');
      return;
    }
    
    onSendMessage(selectedCompanies, communicationType);
  };

  // Filter companies based on selected category
  const filteredCompanies = companies.filter(company => {
    if (selectedCategory === 'all') return true;
    
    return (
      (company.category && company.category.toLowerCase().trim() === selectedCategory.toLowerCase().trim()) ||
      (company.businessCategory && company.businessCategory.toLowerCase().trim() === selectedCategory.toLowerCase().trim()) ||
      (company.industry && company.industry.toLowerCase().trim() === selectedCategory.toLowerCase().trim()) ||
      (company.sector && company.sector.toLowerCase().trim() === selectedCategory.toLowerCase().trim()) ||
      (company.type && company.type.toLowerCase().trim() === selectedCategory.toLowerCase().trim())
    );
  });

  const pendingCompanies = filteredCompanies.filter(company => company.status === 'pending');

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        Send Messages
      </h2>
      
      {/* Category Filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setSelectedCompanies([]); // Clear selection when filter changes
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          {businessCategories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Communication Type
        </label>
        <select
          value={communicationType}
          onChange={(e) => setCommunicationType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all_channels">📧📱💬 All Channels (Email + SMS + WhatsApp)</option>
          <option value="whatsapp">💬 WhatsApp Only</option>
          <option value="email">📧 Email Only</option>
          <option value="sms">📱 SMS Only</option>
        </select>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-gray-700">
            Select Companies ({pendingCompanies.length} pending{selectedCategory !== 'all' && ` in ${selectedCategory}`})
          </h3>
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {selectedCompanies.length === pendingCompanies.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        
        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
          {pendingCompanies.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {selectedCategory === 'all' 
                ? 'No pending companies to message'
                : `No pending companies found in ${selectedCategory} category`
              }
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {pendingCompanies.map((company) => (
                <label
                  key={company._id}
                  className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCompanies.includes(company._id)}
                    onChange={() => handleCompanyToggle(company._id)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {company.company}
                    </div>
                    <div className="text-sm text-gray-500">
                      {company.email} • {company.phone}
                    </div>
                    {company.category && (
                      <div className="text-xs text-blue-600 mt-1">
                        Category: {company.category || company.businessCategory || company.industry || company.sector || company.type}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {selectedCompanies.length} company{selectedCompanies.length !== 1 ? 'ies' : ''} selected
        </div>
        
        <button
          onClick={handleSendMessage}
          disabled={loading || selectedCompanies.length === 0}
          className={`px-6 py-2 rounded-md font-medium text-white transition-colors ${
            loading || selectedCompanies.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Sending...' : 'Send Messages'}
        </button>
      </div>

      {selectedCompanies.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Preview:</strong> Messages will be sent via {communicationType === 'all_channels' ? 'all channels (Email + SMS + WhatsApp)' : communicationType} 
            to {selectedCompanies.length} selected compan{selectedCompanies.length !== 1 ? 'ies' : 'y'}.
          </p>
        </div>
      )}
    </div>
  );
};

export default MessageSender;
