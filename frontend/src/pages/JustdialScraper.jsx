import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Download, FileSpreadsheet, FileText, Loader2, Building, Phone, MapPin, Star, Globe, ChevronRight, Eye, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';

function JustdialScraper() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [data, setData] = useState([]);
  const [scraped, setScraped] = useState(false);
  const [hasScraped, setHasScraped] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(40);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'
  const [detectedCategory, setDetectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState('');
  const [bulkProgress, setBulkProgress] = useState({
    current: 0,
    target: 250,
    percentage: 0,
    page: 0,
    status: 'idle'
  });


  const handleReset = () => {
    setUrl('');
    setData([]);
    setCount(0);
    setError('');
    setHasScraped(false);
    setProgress('');
    setScraped(false);
    setCurrentPage(1);
    setSearchTerm('');
    setDetectedCategory('');
  };

  // Handle search term change for filtering results
  const handleSearchChange = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when searching
  };


  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) {
      return data;
    }

    const searchLower = searchTerm.toLowerCase();
    return data.filter(business =>
      business.name && business.name.toLowerCase().includes(searchLower)
    );
  }, [data, searchTerm]);

  // Function to extract category from JustDial URL
  const extractCategoryFromUrl = (urlString) => {
    if (!urlString || !urlString.includes('justdial.com')) {
      return '';
    }

    try {
      // Handle various JustDial URL patterns:
      // https://www.justdial.com/Delhi/Electricians
      // https://www.justdial.com/Delhi/Electricians/page-2
      // https://www.justdial.com/Mumbai/Chartered-Accountants
      // https://www.justdial.com/Bangalore/Restaurants/Chinese
      // https://www.justdial.com/Delhi/NCR/Electricians

      const url = new URL(urlString);
      const pathname = url.pathname;

      // Split the pathname and filter out empty parts
      const pathParts = pathname.split('/').filter(part => part.length > 0);

      // JustDial URLs typically have structure: /City/Category[/Subcategory]
      if (pathParts.length >= 2) {
        // The category is usually the second part (index 1)
        let category = pathParts[1];

        // Handle pagination like /page-2
        if (category.startsWith('page-')) {
          // If we have more parts, the previous one might be the category
          if (pathParts.length >= 3) {
            category = pathParts[pathParts.length - 2];
          } else {
            return '';
          }
        }

        // Clean up the category name
        category = category
          .replace(/-/g, ' ')  // Replace hyphens with spaces
          .replace(/in\s*Sai\s*Kunj/gi, '')  // Remove 'in-Sai-Kunj' (case insensitive)
          .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
          .replace(/\b\w/g, l => l.toUpperCase())  // Capitalize first letter of each word
          .trim();

        // Common category mappings for better formatting
        const categoryMappings = {
          'Chartered Accountants': 'Chartered Accountants',
          'C A': 'Chartered Accountants',
          'Ca': 'Chartered Accountants',
          'Electricians': 'Electricians',
          'Electrical Contractors': 'Electrical Contractors',
          'Restaurants': 'Restaurants',
          'Doctors': 'Doctors',
          'Hospitals': 'Hospitals',
          'Schools': 'Schools',
          'Colleges': 'Colleges',
          'Hotels': 'Hotels',
          'Travel Agents': 'Travel Agents',
          'Real Estate': 'Real Estate',
          'Insurance': 'Insurance',
          'Banks': 'Banks',
          'Atm': 'ATM',
          'Petrol Pumps': 'Petrol Pumps',
          'Grocery Stores': 'Grocery Stores',
          'Supermarkets': 'Supermarkets',
          'Shopping Malls': 'Shopping Malls',
          'Movie Theaters': 'Movie Theaters',
          'Spas': 'Spas',
          'Salons': 'Salons',
          'Gyms': 'Gyms',
          'Dentists': 'Dentists',
          'Lawyers': 'Lawyers',
          'Architects': 'Architects',
          'Interior Designers': 'Interior Designers',
          'Builders': 'Builders',
          'Contractors': 'Contractors',
          'Plumbers': 'Plumbers',
          'Carpenters': 'Carpenters',
          'Painters': 'Painters',
          'Cleaning Services': 'Cleaning Services',
          'Packers And Movers': 'Packers and Movers',
          'Caterers': 'Caterers',
          'Bakeries': 'Bakeries',
          'Florists': 'Florists',
          'Photographers': 'Photographers',
          'Event Planners': 'Event Planners',
          'Web Designers': 'Web Designers',
          'Software Companies': 'Software Companies',
          'Digital Marketing': 'Digital Marketing',
          'Advertising Agencies': 'Advertising Agencies'
        };

        // Return mapped category if available, otherwise return cleaned category
        return categoryMappings[category] || category;
      }
    } catch (error) {
      console.error('Error extracting category from URL:', error);
    }

    return '';
  };

  // Handle URL change and auto-detect category
  const handleUrlChange = (e) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setHasScraped(false); // Reset auto-scraping flag when URL changes

    // Auto-detect category when URL changes
    const category = extractCategoryFromUrl(newUrl);
    setDetectedCategory(category);
  };

  const handleScrape = async (e) => {
    if (e) e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a Justdial URL');
      return;
    }

    if (!url.includes('justdial.com')) {
      setError('Please enter a valid Justdial URL');
      return;
    }

    setLoading(true);
    setHasScraped(true); // Set auto-scraping flag to true
    setData([]);
    setScraped(false);
    setCurrentPage(1);
    setError('');
    setProgress('Loading page...');

    try {
      const response = await axios.post('/api/justdial-scrape', { url, detectedCategory });

      if (response.data.success) {
        const businessCount = response.data.count;
        setData(response.data.data);
        setCount(businessCount);
        setScraped(true);
        setProgress('');
        setError('');
        
        // Show enhanced success message with deduplication info
        if (businessCount >= 100) {
          toast.success(`Successfully scraped ${businessCount} unique businesses!`);
        } else if (businessCount >= 90) {
          toast.success(`Successfully scraped ${businessCount} unique businesses!`);
        } else if (businessCount >= 50) {
          toast.success(`Successfully scraped ${businessCount} unique businesses!`);
        } else {
          toast(`Found ${businessCount} unique businesses. Try bulk scraping for more results.`, {
            icon: '',
            duration: 4000
          });
        }

        // Set items per page to 40
        setItemsPerPage(40);
      } else {
        setError('Failed to scrape data');
        setProgress('');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      setError(error.response?.data?.message || 'Failed to scrape data. Please try again.');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkScrape = async (e) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a Justdial URL');
      return;
    }

    if (!url.includes('justdial.com')) {
      setError('Please enter a valid Justdial URL');
      return;
    }

    setBulkLoading(true);
    setData([]);
    setScraped(false);
    setCurrentPage(1);
    setError('');
    setBulkProgress({
      current: 0,
      target: 250,
      percentage: 0,
      page: 0,
      status: 'starting'
    });

    try {
      // Use fetch with streaming for Server-Sent Events
      const response = await fetch('/api/justdial-bulk-scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ url, detectedCategory })
      });

      if (!response.ok) {
        throw new Error('Failed to start bulk scraping');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.finished) {
                setBulkLoading(false);
                
                if (data.success) {
                  const businessCount = data.count;
                  setData(data.data);
                  setScraped(true);
                  setItemsPerPage(40); // Set to 40 for bulk results
                  
                  // Show enhanced success message for bulk scraping
                  if (businessCount >= 100) {
                    toast.success(`Bulk scraped ${businessCount} unique businesses!`);
                  } else if (businessCount >= 90) {
                    toast.success(`Bulk scraped ${businessCount} unique businesses!`);
                  } else if (businessCount >= 50) {
                    toast.success(`Bulk scraped ${businessCount} unique businesses!`);
                  } else {
                    toast.success(`Bulk scraped ${businessCount} unique businesses!`);
                  }
                  
                  setBulkProgress({
                    current: data.count,
                    target: 250,
                    percentage: 100,
                    page: 0,
                    status: 'completed'
                  });
                } else {
                  setError(data.error || 'Bulk scraping failed');
                  setBulkProgress({
                    current: 0,
                    target: 250,
                    percentage: 0,
                    page: 0,
                    status: 'error'
                  });
                }
                return;
              } else {
                // Update progress
                setBulkProgress({
                  current: data.current,
                  target: data.target,
                  percentage: data.percentage,
                  page: data.page,
                  status: data.status
                });
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error);
            }
          }
        }
      }

    } catch (error) {
      console.error('Bulk scraping error:', error);
      setError(error.message || 'Failed to start bulk scraping');
      setBulkLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await axios.post('/api/export/excel', { data }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'justdial-business-data.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export Excel file');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await axios.post('/api/export/csv', { data }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'justdial-business-data.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('CSV file downloaded successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export CSV file');
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Memoized current page data
  const currentData = useMemo(() => {
    return filteredData.slice(startIndex, endIndex);
  }, [filteredData, startIndex, endIndex]);

  // Pagination controls
  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // Reset to page 1 when items per page changes
  const handleItemsPerPageChange = useCallback((newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  }, []);

  // Auto-scraping effect when Justdial URL is pasted
  useEffect(() => {
    const timer = setTimeout(() => {
      if (url.trim() && url.includes('justdial.com') && !loading && !hasScraped) {
        handleScrape();
      }
    }, 1500); // 1.5 second delay to allow user to finish pasting
    
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-0 overflow-x-hidden">
      <Toaster position="top-right" />
      
      <div className="w-full">
        <div className="text-center py-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Justdial Scraper
          </h1>
          <p className="text-gray-600">
            Extract business data instantly
          </p>
        </div>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-4">
        {/* URL Input Section */}
        <div className="bg-white rounded-xl shadow-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Search className="w-5 h-5 mr-2 text-blue-600" />
            Enter Justdial URL
          </h2>
          <form onSubmit={handleScrape} className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                Justdial Business Listing URL
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={handleUrlChange}
                placeholder="https://www.justdial.com/Delhi/Electricians"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              {detectedCategory && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-blue-900">Detected Category:</span>
                    <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {detectedCategory}
                    </span>
                  </div>
                </div>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Example: https://www.justdial.com/Delhi/Electricians
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={handleBulkScrape}
                disabled={loading || bulkLoading}
                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              >
                {bulkLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Bulk Scraping...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Bulk Scrape
                  </>
                )}
              </button>
            </div>
          </form>
          
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            </div>
          )}
          
          <p className="mt-2 text-sm text-gray-500">
            Example: https://www.justdial.com/Delhi/Electricians
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-2xl p-8 mb-0 border border-gray-200">
            <div className="flex items-center justify-center gap-4 mb-4">
              <svg className="animate-spin h-10 w-10 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-blue-600 text-lg font-medium">{progress || 'Scraping...'}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
            <p className="text-gray-600 text-sm text-center mt-4">
              Extracting business data from Justdial...
            </p>
          </div>
        )}

        {/* Bulk Scraping Progress */}
        {bulkLoading && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-0">
            <div className="text-center mb-6">
              <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk Scraping in Progress</h3>
              <p className="text-gray-600">Extracting 250-350 unique businesses targeting 100+ from Justdial...</p>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm font-medium text-gray-700">
                  {bulkProgress.current} / {bulkProgress.target} businesses ({bulkProgress.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${bulkProgress.percentage}%` }}
                ></div>
              </div>
            </div>
            
            {/* Status Information */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">{bulkProgress.current}</div>
                <div className="text-sm text-gray-600">Unique Businesses</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">{bulkProgress.page}</div>
                <div className="text-sm text-gray-600">Pages Processed</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900 capitalize">{bulkProgress.status}</div>
                <div className="text-sm text-gray-600">Current Status</div>
              </div>
            </div>
            
            {/* Status Messages */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse mr-3"></div>
                <span className="text-sm text-blue-800">
                  {bulkProgress.status === 'starting' && 'Initializing bulk scraper...'}
                  {bulkProgress.status === 'processing' && `Processing page ${bulkProgress.page}...`}
                  {bulkProgress.status === 'completed' && 'Bulk scraping completed successfully!'}
                  {bulkProgress.status === 'error' && 'An error occurred during bulk scraping.'}
                  {!['starting', 'processing', 'completed', 'error'].includes(bulkProgress.status) && 'Working...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Export Options */}
        {scraped && data.length > 0 && (
          <div className="bg-white rounded-xl shadow-2xl p-6 mb-0 border border-gray-200">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 space-y-4 lg:space-y-0">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Business Data ({filteredData.length} {searchTerm ? 'filtered' : 'unique'} results)
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} unique businesses
                  {searchTerm && ` (searched for "${searchTerm}")`}
                  {filteredData.length >= 100 && ' 🎉 Excellent dataset - 100+ businesses!'}
                  {filteredData.length < 100 && filteredData.length >= 90 && ' ✨ High-quality dataset - 90+ businesses'}
                  {filteredData.length < 90 && filteredData.length >= 50 && ' ✅ Good dataset'}
                  {filteredData.length < 50 && ' ⚠️ Limited dataset'}
                </p>
              </div>

              {/* Search and View Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                {/* Search Box */}
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      placeholder="Search vendor names..."
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                  </div>
                  {searchTerm && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Items per page display */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Showing 40 items per page</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportExcel}
                className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Download Excel
              </button>
              <button
                onClick={handleExportCSV}
                className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-all flex items-center gap-2 shadow-lg"
              >
                <FileText className="w-5 h-5" />
                Download CSV
              </button>
            </div>

            {/* Detected Category Display */}
            {detectedCategory && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <Search className="w-5 h-5 text-blue-600 mr-2" />
                  <div>
                    <span className="text-sm font-medium text-blue-900">Detected Category:</span>
                    <span className="ml-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {detectedCategory}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Responsive Table */}
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="table-auto min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Image
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Business Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      City
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentData.map((business, index) => (
                    <tr key={startIndex + index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
                          {business.image && business.image !== 'N/A' && business.image.trim() !== '' ? (
                            <img
                              src={business.image}
                              alt={business.name || 'Business'}
                              className="w-12 h-12 object-cover rounded-lg"
                              loading="lazy"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Building className="w-6 h-6 text-gray-400" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Building className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" />
                          <div className="text-sm font-medium text-gray-900">
                            {business.name || 'Unknown Business'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Phone className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" />
                          <span className="text-sm text-gray-900">
                            {business.phone || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="flex items-start">
                          <MapPin className="w-4 h-4 mr-2 text-blue-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-gray-900 max-w-xs break-words" title={business.address}>
                            {business.address || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0" />
                          <span className="text-sm text-gray-900">
                            {business.city || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {business.category || detectedCategory || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col space-y-4 items-center overflow-hidden">
                <div className="text-sm text-gray-600 text-center">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} unique businesses
                  {searchTerm && ` (filtered from ${data.length} total)`}
                  {filteredData.length >= 100 && ' - Excellent dataset with 100+ unique entries!'}
                  {filteredData.length < 100 && filteredData.length >= 90 && ' - High-quality dataset with 90+ unique entries'}
                  {filteredData.length < 90 && filteredData.length >= 50 && ' - Good dataset'}
                  {filteredData.length < 50 && ' - Consider bulk scraping for more results'}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={prevPage}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`px-3 py-1 text-sm border rounded-md ${currentPage === pageNum
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={nextPage}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    Next
                    <ChevronRightIcon className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {!scraped && !loading && data.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <Building className="w-20 h-20 mx-auto text-gray-400 mb-6" />
            <p className="text-gray-600 text-xl mb-4">
              Paste a Justdial URL to extract business data
            </p>
            <div className="text-left max-w-lg mx-auto bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 text-sm font-semibold mb-2">How it works:</p>
              <ol className="text-gray-600 text-sm space-y-1 list-decimal list-inside">
                <li>Paste a Justdial search URL</li>
                <li>Scraper automatically starts extracting</li>
                <li>Extracts: Name, Phone, Address, City, Category</li>
                <li>Download all data as Excel or CSV file</li>
              </ol>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

export default JustdialScraper;
