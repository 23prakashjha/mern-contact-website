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
  // Manual filter state
  const [manualFilters, setManualFilters] = useState({
    category: 'all',
    city: 'all',
    search: ''
  });

  // Handle manual filter changes
  const handleManualFiltersChange = (filters) => {
    setManualFilters(filters);
  };

  // Handle manual search changes
  const handleManualSearchChange = (search) => {
    setManualFilters(prev => ({ ...prev, search }));
  };

  // Clear all manual filters
  const clearManualFilters = () => {
    setManualFilters({
      category: 'all',
      city: 'all',
      search: ''
    });
  };

  // Business categories (same as in other pages)
  const businessCategories = [
    'IT Services', 'Manufacturing', 'Healthcare', 'Education', 'Retail', 'Banking & Finance',
    'Real Estate', 'Construction', 'Transportation', 'Hospitality', 'Agriculture', 'Textile',
    'Pharmaceuticals', 'Telecommunications', 'Media & Entertainment', 'Consulting',
    'Logistics & Supply Chain', 'Energy & Utilities', 'Automotive', 'Food & Beverage',
    'Chemicals', 'Electronics', 'Fashion & Apparel', 'Sports & Recreation', 'Travel & Tourism',
    'Legal Services', 'Insurance', 'Government', 'Non-Profit', 'Startups', 'E-commerce',
    'Digital Marketing', 'Research & Development', 'Engineering', 'Architecture',
    'Design & Creative', 'HR & Recruitment', 'Training & Development', 'Security Services',
    'Waste Management', 'Environmental Services', 'Biotechnology', 'Aerospace',
    'Marine & Shipping', 'Mining', 'Forestry', 'Utilities', 'Other'
  ];

  // India cities list (same as in other pages)
  const indiaCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
    'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
    'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivli', 'Vasai-Virar', 'Varanasi',
    'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
    'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur'
  ];

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
        
        const url = `http://localhost:5000/api/companies${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        const companiesData = await response.json();
        
        setCompanies(companiesData);
        
        // Update stats based on filtered companies
        setStats({
          total: companiesData.length,
          sent: companiesData.filter(c => c.status === 'sent').length,
          pending: companiesData.filter(c => c.status === 'pending').length,
          failed: companiesData.filter(c => c.status === 'failed').length
        });
      } catch (error) {
        console.error('Error fetching companies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [manualFilters]);
  return (
    <div className="space-y-6 animate-fadeIn">
      <Toaster position="top-right" />
      {/* Header Section */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
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
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <Stats stats={stats} />
      )}

      {/* Manual Filters Section */}
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
              {businessCategories.map((category) => (
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

      {/* Companies List */}
      <CompanyList 
        companies={companies}
        loading={loading}
        searchTerm={manualFilters.search}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <RecentActivity />
        </div>
        <div className="space-y-6">
          <QuickActions />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
