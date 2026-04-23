import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CompanyList from '../components/CompanyList';
import { FileText, Download, Mail, Phone, RefreshCw, CheckCircle, MessageSquare, Send, Smartphone, AlertCircle, Trash2, Search, Filter, MapPin, Globe, Building, Users, TrendingUp, Calendar, Clock, ChevronDown, ChevronUp, Zap, Target, BarChart3, Activity, Sparkles, Star, Shield, Database, Layers, ZapOff, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';

const History = () => {
  const [companies, setCompanies] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [lastProcessedFile, setLastProcessedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('companies');
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [messageType, setMessageType] = useState('email');
  const [messageText, setMessageText] = useState('');
  const [showMessagePanel, setShowMessagePanel] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Manual filter state
  const [manualFilters, setManualFilters] = useState({
    category: 'all',
    city: 'all',
    search: ''
  });
  
  // UI states
  const [showFilters, setShowFilters] = useState(false);
  const [animateCards, setAnimateCards] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const API_BASE_URL = 'http://localhost:5000/api';

  // India cities list (truncated for brevity)
  const indiaCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
    'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
    'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivli', 'Vasai-Virar', 'Varanasi',
    'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
    'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur'
  ];

  // Extract unique categories from companies data
  const getUniqueCategories = () => {
    const categories = new Set();
    companies.forEach(company => {
      if (company.detectedCategory && company.detectedCategory.category) {
        categories.add(company.detectedCategory.category);
      }
      if (company.category) {
        categories.add(company.category);
      }
      if (company.businessCategory) {
        categories.add(company.businessCategory);
      }
      if (company.industry) {
        categories.add(company.industry);
      }
    });
    return Array.from(categories).sort();
  };

  useEffect(() => {
    fetchCompanies();
    fetchProcessedData();
    setTimeout(() => setAnimateCards(true), 100);
  }, []);

  const fetchProcessedData = async () => {
    try {
      const historyResponse = await axios.get('http://localhost:5000/api/excel-scraper/history');
      const recentHistory = historyResponse.data;
      
      if (recentHistory.length > 0) {
        const latestFile = recentHistory[0];
        setLastProcessedFile(latestFile);
        
        // Only try to download if filename exists
        if (latestFile.filename) {
          const response = await axios.get(`http://localhost:5000/api/excel-scraper/download/${latestFile.filename}`, {
            responseType: 'arraybuffer',
          });

          const data = new Uint8Array(response.data);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const sheetNames = workbook.SheetNames;
          const allData = {};
          
          sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            allData[sheetName] = jsonData;
          });

          setProcessedData(allData);
        }
      }
    } catch (err) {
      console.log('No processed data found');
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/companies`);
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const detectDuplicates = () => {
    const companyMap = new Map();
    const duplicateList = [];
    
    companies.forEach(company => {
      const key = `${company.company.toLowerCase().trim()}-${company.phone?.toLowerCase().trim() || ''}`;
      
      if (companyMap.has(key)) {
        duplicateList.push({
          original: companyMap.get(key),
          duplicate: company,
          reason: 'Same company name and phone'
        });
      } else {
        companyMap.set(key, company);
      }
    });
    
    setDuplicates(duplicateList);
    setShowDuplicates(true);
  };

  const removeDuplicates = async () => {
    if (duplicates.length === 0) return;

    if (!confirm(`Remove ${duplicates.length} duplicate companies?`)) return;

    try {
      const duplicateIds = duplicates.map(dup => dup.duplicate._id);
      
      for (const id of duplicateIds) {
        await axios.delete(`${API_BASE_URL}/companies/${id}`);
      }
      
      alert(`Removed ${duplicates.length} duplicates`);
      await fetchCompanies();
      setDuplicates([]);
      setShowDuplicates(false);
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
      alert('Failed to remove duplicates');
    }
  };

  const handleCompanySelect = (companyId) => {
    setSelectedCompanies(prev => 
      prev.includes(companyId) 
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  const selectAllCompanies = () => {
    const filteredIds = filteredCompanies.map(company => company._id);
    setSelectedCompanies(filteredIds);
  };

  const clearSelection = () => {
    setSelectedCompanies([]);
  };

  const sendMessages = async () => {
    if (selectedCompanies.length === 0) {
      alert('Please select companies');
      return;
    }

    if (!messageText.trim()) {
      alert('Please enter a message');
      return;
    }

    try {
      const companiesToSend = filteredCompanies.filter(company => 
        selectedCompanies.includes(company._id)
      );

      for (const company of companiesToSend) {
        const messageData = {
          companyId: company._id,
          messageType: messageType,
          message: messageText,
          recipient: messageType === 'email' ? company.email : 
                    messageType === 'sms' ? company.phone : 
                    company.phone
        };

        await axios.post(`${API_BASE_URL}/send-message`, messageData);
      }

      alert(`Message sent to ${companiesToSend.length} companies`);
      setShowMessagePanel(false);
      setMessageText('');
      setSelectedCompanies([]);
      await fetchCompanies();
    } catch (error) {
      console.error('Failed to send messages:', error);
      alert('Failed to send messages');
    }
  };

  const filteredCompanies = companies.filter(company => {
    const matchesFilter = filter === 'all' || company.status === filter;
    const matchesSearch = company.company.toLowerCase().includes((manualFilters.search || '').toLowerCase()) ||
                         company.email.toLowerCase().includes((manualFilters.search || '').toLowerCase()) ||
                         (company.address && company.address.toLowerCase().includes((manualFilters.search || '').toLowerCase()));
    
    const matchesCategory = manualFilters.category === 'all' || 
                           (company.category && company.category.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
                           (company.businessCategory && company.businessCategory.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
                           (company.industry && company.industry.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
                           (company.sector && company.sector.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
                           (company.type && company.type.toLowerCase().trim() === manualFilters.category.toLowerCase().trim());
    
    const normalizeText = (text) => text ? text.toLowerCase().trim().replace(/\s+/g, ' ') : '';
    const selectedCityNormalized = normalizeText(manualFilters.city);
    
    const matchesCity = manualFilters.city === 'all' || 
                       (company.address && company.address.trim() && normalizeText(company.address).includes(selectedCityNormalized)) ||
                       (company.city && normalizeText(company.city).includes(selectedCityNormalized)) ||
                       (company.location && normalizeText(company.location).includes(selectedCityNormalized));
    
    return matchesFilter && matchesSearch && matchesCategory && matchesCity;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCompanies = filteredCompanies.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));

  // Handle manual filter changes
  const handleManualFiltersChange = (filters) => {
    setManualFilters(filters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Handle manual search changes
  const handleManualSearchChange = (search) => {
    setManualFilters(prev => ({ ...prev, search }));
    setCurrentPage(1); // Reset to first page when search changes
  };

  // Clear all manual filters
  const clearManualFilters = () => {
    setManualFilters({
      category: 'all',
      city: 'all',
      search: ''
    });
    setCurrentPage(1);
  };

  const handleDeleteCompany = (companyId) => {
    setCompanies(prev => prev.filter(company => company._id !== companyId));
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete ALL ${companies.length} companies?`)) return;
    
    try {
      const response = await fetch('http://localhost:5000/api/companies', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setCompanies([]);
        alert('All companies deleted!');
      }
    } catch (error) {
      console.error('Error deleting companies:', error);
      alert('Failed to delete companies');
    }
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Company', 'Phone', 'Email', 'Website', 'Status', 'Communication Type', 'Date'],
      ...filteredCompanies.map(company => [
        company.company,
        company.phone,
        company.email,
        company.website || 'N/A',
        company.status,
        company.communicationType,
        new Date(company.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center space-y-8">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-20 h-20 bg-indigo-200 rounded-full animate-ping opacity-20"></div>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Loading Communication History
            </h2>
            <p className="text-gray-600 animate-pulse">Fetching your outreach data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <Toaster position="top-right" />
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-indigo-400/10 to-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-gradient-to-br from-pink-400/10 to-indigo-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Modern Header */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 mb-8 border border-white/50">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Communication Hub
                  </h1>
                  <p className="text-gray-600 text-sm mt-1">
                    Manage your outreach ecosystem with precision
                  </p>
                </div>
              </div>
              
              {/* Stats Cards */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200">
                  <Building className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-lg font-bold text-blue-900">{companies.length}</p>
                    <p className="text-xs text-blue-600">Companies</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <div>
                    <p className="text-lg font-bold text-green-900">{companies.filter(c => c.status === 'sent').length}</p>
                    <p className="text-xs text-green-600">Sent</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-2xl border border-yellow-200">
                  <Clock className="w-4 h-4 text-yellow-600" />
                  <div>
                    <p className="text-lg font-bold text-yellow-900">{companies.filter(c => c.status === 'pending').length}</p>
                    <p className="text-xs text-yellow-600">Pending</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => exportToCSV()}
                className="flex items-center px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                <Download className="w-4 h-4 mr-1" />
                Export CSV
              </button>
              <button
                onClick={() => {
                  fetchCompanies();
                  fetchProcessedData();
                }}
                className="flex items-center px-3 py-2 bg-white border-2 border-gray-200 text-gray-700 rounded-2xl hover:shadow-xl hover:border-indigo-300 transform hover:scale-105 transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={companies.length === 0}
                className="flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-2xl hover:shadow-xl hover:from-red-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-300 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed disabled:transform-none"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete All
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-1 mb-8 border border-white/50">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('companies')}
              className={`flex-1 flex items-center justify-center px-4 py-2 rounded-2xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'companies'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl transform scale-105'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Building className="w-4 h-4 mr-2" />
              Companies
              <span className="ml-2 px-2 py-1 bg-white/20 rounded-full text-xs">
                {companies.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('duplicates')}
              className={`flex-1 flex items-center justify-center px-4 py-2 rounded-2xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'duplicates'
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-xl transform scale-105'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Duplicates
              {duplicates.length > 0 && (
                <span className="ml-2 px-2 py-1 bg-white/20 rounded-full text-xs">
                  {duplicates.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Companies Tab */}
        {activeTab === 'companies' && (
          <div className={`space-y-8 ${animateCards ? 'animate-fadeIn' : 'opacity-0'}`}>
            {/* Search and Filters */}
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
              {/* Manual Filters */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-5 h-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-800">Filters</h3>
                  </div>
                  {(manualFilters.category !== 'all' || manualFilters.city !== 'all' || manualFilters.search.trim() !== '') && (
                    <button
                      onClick={clearManualFilters}
                      className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={manualFilters.search}
                      onChange={(e) => handleManualSearchChange(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                    />
                  </div>

                  {/* Category Filter */}
                  <div>
                    <select
                      value={manualFilters.category}
                      onChange={(e) => handleManualFiltersChange({ ...manualFilters, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors bg-white"
                    >
                      <option value="all">All Categories</option>
                      {getUniqueCategories().map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* City Filter */}
                  <div>
                    <select
                      value={manualFilters.city}
                      onChange={(e) => handleManualFiltersChange({ ...manualFilters, city: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors bg-white"
                    >
                      <option value="all">All Cities</option>
                      {indiaCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Active Filters Display */}
                {(manualFilters.category !== 'all' || manualFilters.city !== 'all' || manualFilters.search.trim() !== '') && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {manualFilters.search && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                        Search: "{manualFilters.search}"
                      </span>
                    )}
                    {manualFilters.category !== 'all' && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                        Category: {manualFilters.category}
                      </span>
                    )}
                    {manualFilters.city !== 'all' && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                        City: {manualFilters.city}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Status Filter */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-gray-700 mb-2">Communication Status</label>
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border-0 bg-white rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all duration-300 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              
              {/* Active Status Filter */}
              {filter !== 'all' && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    Status: {filter}
                    <button
                      onClick={() => setFilter('all')}
                      className="ml-2 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      ×
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* Company List */}
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/50">
              <CompanyList companies={currentCompanies} onDeleteCompany={handleDeleteCompany} searchTerm={manualFilters.search} filter={filter} />
              
              {/* Pagination */}
              {filteredCompanies.length > itemsPerPage && (
                <div className="border-t border-gray-200 px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100">
                  <div className="flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
                    <div className="text-gray-700 text-sm">
                      <span className="font-bold text-indigo-600">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-bold text-indigo-600">{Math.min(indexOfLastItem, filteredCompanies.length)}</span> of{' '}
                      <span className="font-bold text-indigo-600">{filteredCompanies.length}</span> companies
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        className="px-3 py-2 font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 text-sm"
                      >
                        Previous
                      </button>
                      
                      <div className="flex space-x-1">
                        {[...Array(totalPages)].map((_, index) => {
                          const pageNumber = index + 1;
                          const isActive = pageNumber === currentPage;
                          const isNearCurrent = Math.abs(pageNumber - currentPage) <= 2 || pageNumber === 1 || pageNumber === totalPages;
                          
                          if (!isNearCurrent && pageNumber !== 1 && pageNumber !== totalPages) {
                            if (pageNumber === currentPage - 3 || pageNumber === currentPage + 3) {
                              return (
                                <span key={pageNumber} className="px-2 py-2 text-gray-500 text-sm">
                                  ...
                                </span>
                              );
                            }
                            return null;
                          }
                          
                          return (
                            <button
                              key={pageNumber}
                              onClick={() => paginate(pageNumber)}
                              className={`px-2 py-2 font-bold rounded-xl transition-all duration-300 text-sm ${
                                isActive
                                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl transform scale-105'
                                  : 'text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 text-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Duplicates Tab */}
        {activeTab === 'duplicates' && (
          <div className={`space-y-8 ${animateCards ? 'animate-fadeIn' : 'opacity-0'}`}>
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-xl">
                    <AlertCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Duplicate Detection</h2>
                    <p className="text-gray-600 mt-1 text-sm">Find and remove duplicate companies</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={detectDuplicates}
                    className="flex items-center px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl hover:shadow-xl transform hover:scale-105 transition-all duration-300 font-bold text-sm"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Detect Duplicates
                  </button>
                  {duplicates.length > 0 && (
                    <button
                      onClick={removeDuplicates}
                      className="flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-2xl hover:shadow-xl transform hover:scale-105 transition-all duration-300 font-bold text-sm"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove {duplicates.length}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl p-3 border-2 border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-700">Total Companies</p>
                      <p className="text-xl font-bold text-blue-900 mt-1">{companies.length}</p>
                    </div>
                    <Building className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-red-100 rounded-3xl p-3 border-2 border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-orange-700">Duplicates Found</p>
                      <p className="text-xl font-bold text-orange-900 mt-1">{duplicates.length}</p>
                    </div>
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-3 border-2 border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-700">Unique Companies</p>
                      <p className="text-xl font-bold text-green-900 mt-1">{companies.length - duplicates.length}</p>
                    </div>
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Duplicates Display */}
            {duplicates.length > 0 ? (
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/50">
                <div className="bg-gradient-to-r from-orange-50 to-red-50 px-4 py-3 border-b border-orange-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                      <h3 className="text-lg font-bold text-gray-900">Duplicate Companies Found</h3>
                      <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs rounded-full font-bold shadow-xl">
                        {duplicates.length} Duplicates
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="max-h-96 overflow-y-auto">
                  {duplicates.map((dup, index) => (
                    <div key={index} className="border-b border-gray-100 hover:bg-gradient-to-r hover:from-orange-50 hover:to-red-50 transition-all duration-300">
                      <div className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-3">
                              <h4 className="text-sm font-bold text-gray-900 mb-2">
                                {dup.original.company}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-2">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm font-bold text-green-800">Original Entry</span>
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <p className="text-gray-700">
                                      <span className="font-bold">Email:</span> {dup.original.email || 'No email'}
                                    </p>
                                    <p className="text-gray-700">
                                      <span className="font-bold">Phone:</span> {dup.original.phone || 'No phone'}
                                    </p>
                                    <p className="text-gray-700">
                                      <span className="font-bold">Status:</span> 
                                      <span className={`ml-2 px-2 py-1 rounded-full text-xs font-bold ${
                                        dup.original.status === 'sent' ? 'bg-green-100 text-green-800' :
                                        dup.original.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {dup.original.status || 'No status'}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-2">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                    <span className="text-sm font-bold text-red-800">Duplicate Entry</span>
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <p className="text-gray-700">
                                      <span className="font-bold">Email:</span> {dup.duplicate.email || 'No email'}
                                    </p>
                                    <p className="text-gray-700">
                                      <span className="font-bold">Phone:</span> {dup.duplicate.phone || 'No phone'}
                                    </p>
                                    <p className="text-gray-700">
                                      <span className="font-bold">Status:</span> 
                                      <span className={`ml-2 px-2 py-1 rounded-full text-xs font-bold ${
                                        dup.duplicate.status === 'sent' ? 'bg-green-100 text-green-800' :
                                        dup.duplicate.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        {dup.duplicate.status || 'No status'}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-2">
                              <p className="text-sm text-orange-800">
                                <span className="font-bold">Reason:</span> {dup.reason}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 text-center border border-white/50">
                <div className="max-w-md mx-auto">
                  <div className="p-2 bg-gradient-to-r from-green-100 to-emerald-100 rounded-3xl w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No Duplicates Found</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    Great! All companies in your database are unique. Click "Detect Duplicates" to scan for any potential duplicates.
                  </p>
                  <button
                    onClick={detectDuplicates}
                    className="px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl hover:shadow-xl transform hover:scale-105 transition-all duration-300 font-bold text-sm"
                  >
                    Scan for Duplicates
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out;
        }
      `}</style>
    </div>
  );
};

export default History;
