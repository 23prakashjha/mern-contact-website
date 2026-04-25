import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Grid, List, ChevronRight, Building, Users, Phone, MapPin, Star, Globe, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, debounce } from '../utils/api';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');


  useEffect(() => {
    fetchCategories();
  }, []);


  const fetchCategories = async () => {
    try {
      setLoading(true);
      const existingCategories = await api.get('/api/categories');
      
      // Only use detected categories from API
      setCategories(existingCategories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch categories');
      // No hardcoded fallback - only show what's detected
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };



  const fetchCategoryData = async (category) => {
    try {
      setLoading(true);
      
      // Fetch companies by category with precise matching
      const response = await api.get('/api/companies?limit=1000');
      const allCompanies = response.companies || [];
      
      // Filter companies with strict category matching
      const filteredCompanies = allCompanies.filter(company => {
        const companyCategory = company.category || '';
        const companyName = company.company || '';
        const detectedCategory = company.detectedCategory?.category || '';
        
        // Priority 1: Exact match for detected category (highest confidence)
        if (detectedCategory.toLowerCase() === category.toLowerCase()) {
          return true;
        }
        
        // Priority 2: Exact match for manual category
        if (companyCategory.toLowerCase() === category.toLowerCase()) {
          return true;
        }
        
        // Priority 3: Strong partial match (category contains full category name)
        if (detectedCategory.toLowerCase().includes(category.toLowerCase()) ||
            companyCategory.toLowerCase().includes(category.toLowerCase())) {
          return true;
        }
        
        // Priority 4: Company name contains primary category keywords (strict matching)
        const categoryKeywords = getCategoryKeywords(category);
        const primaryKeywords = categoryKeywords.slice(0, 3); // Use only top 3 most relevant keywords
        
        return primaryKeywords.some(keyword => {
          const keywordLower = keyword.toLowerCase();
          const companyNameLower = companyName.toLowerCase();
          
          // Must contain the keyword as a whole word or phrase
          return companyNameLower.includes(keywordLower) && 
                 keywordLower.length > 2; // Ignore very short matches
        });
      });
      
      setCategoryData(filteredCompanies);
      setSelectedCategory(category);
    } catch (error) {
      console.error('Error fetching category data:', error);
      toast.error('Failed to fetch category data');
      setCategoryData([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get keywords for category matching
  const getCategoryKeywords = (category) => {
    const keywordMap = {
      'Dentals': ['dental', 'dentist', 'dental clinic', 'dental care', 'dental hospital', 'orthodontist'],
      'Packers and Movers': ['packers and movers', 'packers', 'movers', 'moving', 'relocation', 'shifting', 'transport', 'logistics', 'cargo'],
      'Tour and Travels': ['tour and travels', 'travel agency', 'tour operator', 'tour', 'travel', 'travels', 'tourism'],
      'Event Management': ['event management', 'event planner', 'event organizer', 'wedding planner', 'event', 'events', 'management'],
      'Restaurants': ['restaurant', 'food', 'dining', 'cafe', 'eatery', 'bistro', 'food court'],
      'Hotels': ['hotel', 'resort', 'accommodation', 'lodging', 'inn', 'motel', 'guest house'],
      'Hospitals': ['hospital', 'medical', 'healthcare', 'clinic', 'medical center', 'nursing home'],
      'Schools': ['school', 'education', 'college', 'university', 'institute', 'academy', 'tutorial'],
      'Electricians': ['electrician', 'electrical', 'electrical contractor', 'electrical services', 'wiring'],
      'Plumbers': ['plumber', 'plumbing', 'pipe fitting', 'drainage', 'pipe'],
      'Beauty Salons': ['beauty salon', 'beauty parlor', 'hair salon', 'spa', 'salon', 'beauty'],
      'Gyms': ['gym', 'fitness', 'fitness center', 'health club', 'workout'],
      'Real Estate': ['real estate', 'property', 'housing', 'apartment', 'builder', 'construction'],
      'Automobiles': ['automobile', 'car service', 'vehicle', 'car', 'auto', 'motorcycle', 'bike'],
      'Insurance': ['insurance', 'insurance company', 'policy', 'coverage', 'life insurance']
    };
    
    return keywordMap[category] || [category.toLowerCase()];
  };

  
  // Helper function to get category icon
  const getCategoryIcon = (categoryName) => {
    const iconMap = {
      'Dentals': 'medical',
      'Packers and Movers': 'truck',
      'Tour and Travels': 'plane',
      'Event Management': 'calendar',
      'Restaurants': 'utensils',
      'Hotels': 'building',
      'Hospitals': 'hospital',
      'Schools': 'graduation-cap',
      'Electricians': 'bolt',
      'Plumbers': 'wrench',
      'Beauty Salons': 'scissors',
      'Gyms': 'dumbbell',
      'Real Estate': 'home',
      'Automobiles': 'car',
      'Insurance': 'shield'
    };
    
    return iconMap[categoryName] || 'folder';
  };

  // Helper function to get category color
  const getCategoryColor = (categoryName) => {
    const colorMap = {
      'Dentals': 'blue',
      'Packers and Movers': 'green',
      'Tour and Travels': 'purple',
      'Event Management': 'pink',
      'Restaurants': 'orange',
      'Hotels': 'indigo',
      'Hospitals': 'red',
      'Schools': 'yellow',
      'Electricians': 'cyan',
      'Plumbers': 'gray',
      'Beauty Salons': 'rose',
      'Gyms': 'lime',
      'Real Estate': 'teal',
      'Automobiles': 'amber',
      'Insurance': 'emerald'
    };
    
    return colorMap[categoryName] || 'gray';
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

  const filteredCategories = categories.filter(category =>
    category && category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderDataCard = (item) => {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-gray-800">{item.company || 'Unknown'}</h3>
          {item.detectedCategory ? (
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-medium">
              {item.detectedCategory.category}
            </span>
          ) : item.category ? (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {item.category}
            </span>
          ) : null // Don't show anything if no category detected
          }
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          {item.phone && (
            <div className="flex items-center">
              <Phone className="w-4 h-4 mr-2 text-blue-500" />
              <span>{item.phone}</span>
            </div>
          )}
          {item.email && (
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="truncate">{item.email}</span>
            </div>
          )}
          {item.address && (
            <div className="flex items-start">
              <MapPin className="w-4 h-4 mr-2 text-red-500 mt-0.5" />
              <span className="line-clamp-2">{item.address}</span>
            </div>
          )}
          {item.city && (
            <div className="flex items-center">
              <Building className="w-4 h-4 mr-2 text-green-500" />
              <span>{item.city}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Categories</h1>
        <p className="text-gray-600">Browse categories and view related business data</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search categories..."
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>


      {/* Categories Grid/List */}
      {!selectedCategory && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Categories
          </h2>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Filter className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No categories found</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-2'
            }>
              {filteredCategories.map((category, index) => {
                const categoryName = category;
                const iconType = getCategoryIcon(categoryName);
                const colorType = getCategoryColor(categoryName);
                
                // Color classes mapping
                const colorClasses = {
                  blue: 'bg-blue-100 text-blue-600 border-blue-200',
                  green: 'bg-green-100 text-green-600 border-green-200',
                  purple: 'bg-purple-100 text-purple-600 border-purple-200',
                  pink: 'bg-pink-100 text-pink-600 border-pink-200',
                  orange: 'bg-orange-100 text-orange-600 border-orange-200',
                  indigo: 'bg-indigo-100 text-indigo-600 border-indigo-200',
                  red: 'bg-red-100 text-red-600 border-red-200',
                  yellow: 'bg-yellow-100 text-yellow-600 border-yellow-200',
                  cyan: 'bg-cyan-100 text-cyan-600 border-cyan-200',
                  gray: 'bg-gray-100 text-gray-600 border-gray-200',
                  rose: 'bg-rose-100 text-rose-600 border-rose-200',
                  lime: 'bg-lime-100 text-lime-600 border-lime-200',
                  teal: 'bg-teal-100 text-teal-600 border-teal-200',
                  amber: 'bg-amber-100 text-amber-600 border-amber-200',
                  emerald: 'bg-emerald-100 text-emerald-600 border-emerald-200'
                };
                
                const colorClass = colorClasses[colorType] || colorClasses.gray;
                
                return (
                  <div
                    key={index}
                    onClick={() => fetchCategoryData(categoryName)}
                    className={`bg-white rounded-lg shadow-md p-4 hover:shadow-lg cursor-pointer transition-all hover:scale-105 border-2 ${colorClass} hover:shadow-xl`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 ${colorClass.split(' ')[0]} rounded-lg flex items-center justify-center`}>
                          <Filter className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-800 text-lg">{categoryName}</h3>
                          <p className="text-sm text-gray-600 font-medium">Click to explore data</p>
                        </div>
                      </div>
                      <ChevronRight className="w-6 h-6 text-gray-400" />
                    </div>
                    
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Category Data Display */}
      {selectedCategory && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setCategoryData([]);
                }}
                className="text-blue-600 hover:text-blue-800 font-medium mb-2 flex items-center"
              >
                <ChevronRight className="w-4 h-4 mr-1 rotate-180" />
                Back to Categories
              </button>
              <h2 className="text-xl font-semibold text-gray-800">
                {selectedCategory} ({categoryData.length} items)
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : categoryData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Building className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No data found for this category</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-4'
            }>
              {categoryData.map((item, index) => (
                <div key={index}>
                  {renderDataCard(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Categories;
