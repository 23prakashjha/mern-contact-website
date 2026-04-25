import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Grid, List, CheckSquare, Square, Plus, X, Building, Phone, Mail, MapPin, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, debounce } from '../utils/api';

const CompanyList = () => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanies, setSelectedCompanies] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // India cities list
  const indiaCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
    'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
    'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivli', 'Vasai-Virar', 'Varanasi',
    'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
    'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur'
  ];

  useEffect(() => {
    fetchCompanies();
    fetchCategories();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const companies = await api.get('/api/companies');
      setCompanies(companies || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const categories = await api.get('/api/categories');
      setCategories(categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const toggleCompanySelection = (companyId) => {
    const newSelection = new Set(selectedCompanies);
    if (newSelection.has(companyId)) {
      newSelection.delete(companyId);
    } else {
      newSelection.add(companyId);
    }
    setSelectedCompanies(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedCompanies.size === filteredCompanies.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(filteredCompanies.map(company => company._id)));
    }
  };

  const createCategory = async () => {
    if (!newCategory.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    try {
      setIsCreatingCategory(true);
      const response = await api.post('/api/categories', {
        name: newCategory.trim(),
        type: 'manual'
      });

      if (response) {
        toast.success('Category created successfully');
        setCategories([...categories, response.name]);
        setNewCategory('');
        setShowCategoryModal(false);
        
        // Assign selected companies to the new category
        if (selectedCompanies.size > 0) {
          await assignCompaniesToCategory(response.name);
        }
      }
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const assignCompaniesToCategory = async (categoryName) => {
    try {
      const companyIds = Array.from(selectedCompanies);
      await api.post('/api/companies/batch-update', {
        companyIds,
        category: categoryName
      });

      toast.success(`${companyIds.length} companies assigned to category`);
      setSelectedCompanies(new Set());
      fetchCompanies(); // Refresh companies data
    } catch (error) {
      console.error('Error assigning companies to category:', error);
      toast.error('Failed to assign companies to category');
    }
  };

  const handleAssignToCategory = async (categoryName) => {
    if (selectedCompanies.size === 0) {
      toast.error('Please select at least one company');
      return;
    }

    await assignCompaniesToCategory(categoryName);
  };

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((term) => {
      setSearchTerm(term);
    }, 300),
    []
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    debouncedSearch(value);
  };

  const filteredCompanies = companies.filter(company => {
    const searchLower = searchTerm.toLowerCase();
    return (
      company.company?.toLowerCase().includes(searchLower) ||
      company.email?.toLowerCase().includes(searchLower) ||
      company.phone?.toLowerCase().includes(searchLower) ||
      company.city?.toLowerCase().includes(searchLower) ||
      company.category?.toLowerCase().includes(searchLower)
    );
  });

  const renderCompanyCard = (company) => {
    const isSelected = selectedCompanies.has(company._id);
    
    return (
      <div
        key={company._id}
        className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 border-2 ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
        }`}
      >
        <div className="p-4">
          {/* Header with checkbox */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start space-x-3 flex-1">
              <button
                onClick={() => toggleCompanySelection(company._id)}
                className="mt-1 flex-shrink-0"
              >
                {isSelected ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                )}
              </button>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 text-lg">{company.company || 'Unknown'}</h3>
                {company.category && (
                  <span className="inline-block mt-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    {company.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Company Details */}
          <div className="space-y-2 text-sm">
            {company.phone && (
              <div className="flex items-center text-gray-600">
                <Phone className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" />
                <span className="truncate">{company.phone}</span>
              </div>
            )}
            {company.email && (
              <div className="flex items-center text-gray-600">
                <Mail className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                <span className="truncate">{company.email}</span>
              </div>
            )}
            {company.address && (
              <div className="flex items-start text-gray-600">
                <MapPin className="w-4 h-4 mr-2 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{company.address}</span>
              </div>
            )}
            {company.city && (
              <div className="flex items-center text-gray-600">
                <Building className="w-4 h-4 mr-2 text-purple-500 flex-shrink-0" />
                <span>{company.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Company List</h1>
        <p className="text-gray-600">Manage and categorize your companies</p>
      </div>

      {/* Controls Bar */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          {/* Search and Select All */}
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search companies..."
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <button
              onClick={toggleAllSelection}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {selectedCompanies.size === filteredCompanies.length && filteredCompanies.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
              <span>Select All</span>
            </button>
          </div>

          {/* View Mode and Actions */}
          <div className="flex items-center space-x-2">
            <div className="flex border border-gray-300 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-l-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-r-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>

            {selectedCompanies.size > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedCompanies.size} selected
                </span>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Category</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Category Assignment Buttons */}
        {selectedCompanies.size > 0 && categories.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Assign to:</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((category, index) => (
                  <button
                    key={index}
                    onClick={() => handleAssignToCategory(category)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <Tag className="w-3 h-3 inline mr-1" />
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Companies Grid/List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Building className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>No companies found</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          : 'space-y-4'
        }>
          {filteredCompanies.map((company) => renderCompanyCard(company))}
        </div>
      )}

      {/* New Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Category</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Enter category name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && createCategory()}
                />
              </div>

              {selectedCompanies.size > 0 && (
                <div className="text-sm text-gray-600">
                  {selectedCompanies.size} companies will be assigned to this category
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createCategory}
                  disabled={isCreatingCategory || !newCategory.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingCategory ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyList;
