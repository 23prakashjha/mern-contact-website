import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Stats from '../components/Stats';
import RecentActivity from '../components/RecentActivity';
import QuickActions from '../components/QuickActions';
import { Filter, Search, X } from 'lucide-react';
import CompanyList from '../components/CompanyList';
import toast, { Toaster } from 'react-hot-toast';

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    pending: 0,
    failed: 0
  });
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCompanies: 0,
    limit: 20
  });
    // Manual filter state
  const [manualFilters, setManualFilters] = useState({
    category: 'all',
    city: 'all',
    search: ''
  });
  const [customCities, setCustomCities] = useState([]);

  // Handle manual filter changes
  const handleManualFiltersChange = (filters) => {
    setManualFilters(filters);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  // Handle manual search changes
  const handleManualSearchChange = (search) => {
    setManualFilters(prev => ({ ...prev, search }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  // Clear all manual filters
  const clearManualFilters = () => {
    setManualFilters({
      category: 'all',
      city: 'all',
      search: ''
    });
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  // Handle page change
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, currentPage: newPage }));
  };

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

  
  // Fetch companies data with filters and search
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        
        if (manualFilters.category && manualFilters.category !== 'all') {
          params.append('category', manualFilters.category);
        }
        
        if (manualFilters.city && manualFilters.city !== 'all') {
          params.append('city', manualFilters.city);
        }
        
        if (manualFilters.search && manualFilters.search.trim()) {
          params.append('search', manualFilters.search.trim());
        }
        
        // Add pagination parameters
        params.append('page', pagination.currentPage.toString());
        params.append('limit', pagination.limit.toString());
        
        const url = `http://localhost:5000/api/companies${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        setCompanies(data.companies || []);
        
        // Update pagination info
        setPagination(prev => ({
          ...prev,
          totalPages: data.totalPages || 1,
          totalCompanies: data.totalCompanies || 0
        }));
        
        // Update stats based on all companies (use total count from API)
        setStats({
          total: data.totalCompanies || 0,
          sent: data.stats?.sent || 0,
          pending: data.stats?.pending || 0,
          failed: data.stats?.failed || 0
        });
      } catch (error) {
        console.error('Error fetching companies:', error);
      } finally {
        setLoading(false);
      }
    };

    // Add debounce to prevent rapid API calls during navigation
    const debounceTimer = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(debounceTimer);
  }, [manualFilters, pagination.currentPage]);

  // Load custom cities from localStorage
  useEffect(() => {
    const savedCities = localStorage.getItem('customCities');
    if (savedCities) {
      setCustomCities(JSON.parse(savedCities));
    }
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-indigo-400/10 to-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-gradient-to-br from-pink-400/10 to-indigo-600/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6 animate-fadeIn">
          <Toaster position="top-right" />
      {/* Header Section */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-600 text-lg">
              Welcome back! Here's your outreach overview.
            </p>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last updated: {new Date().toLocaleString()}
              </span>
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                System Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      {loading ? (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/50 flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
          <Stats stats={stats} />
        </div>
      )}

      {/* Manual Filters Section */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
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
              {customCities.map((city, index) => (
                <option key={index} value={city}>
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

      {/* Companies List */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
        <CompanyList 
          companies={companies}
          loading={loading}
          searchTerm={manualFilters.search}
          pagination={pagination}
          onPageChange={handlePageChange}
          onDeleteCompany={(companyId) => {
            setCompanies(prev => prev.filter(c => c._id !== companyId));
            setPagination(prev => ({ ...prev, totalCompanies: prev.totalCompanies - 1 }));
          }}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
            <RecentActivity />
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 border border-white/50">
            <QuickActions />
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
