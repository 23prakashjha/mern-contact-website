import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FileText, Download, Mail, Phone, RefreshCw, CheckCircle, AlertCircle, Loader2, Globe, Upload as UploadIcon, FileSpreadsheet } from 'lucide-react';

const Upload = () => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [lastProcessedFile, setLastProcessedFile] = useState(null);
  const [dataError, setDataError] = useState('');
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const API_BASE_URL = 'http://localhost:5000/api';

  // Helper function to truncate long text and handle | character
  const addLineBreaks = (text, maxLength = 20) => {
    if (!text || typeof text !== 'string') return text;
    
    // Handle company names with | character - only show text before |
    const pipeIndex = text.indexOf('|');
    if (pipeIndex !== -1) {
      text = text.substring(0, pipeIndex).trim();
    }
    
    // If text is shorter than max length, return as is
    if (text.length <= maxLength) return text;
    
    // Return first maxLength characters followed by ----
    return text.substring(0, maxLength) + ' ----';
  };

  // Fetch existing companies data
  const fetchCompanies = async () => {
    try {
      const response = await makeApiCall(async () => {
        return await axios.get(`${API_BASE_URL}/companies`);
      }, 3, 1000);
      setCompanies(response.data);
      console.log('Fetched companies:', response.data.length);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    }
  };

  // Handle file selection
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ];
      
      if (!validTypes.includes(file.type)) {
        alert('Please select an Excel file (.xlsx, .xls) or CSV file');
        return;
      }
      
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      
      setSelectedFile(file);
      setDataError('');
      
      // Automatically trigger upload after file selection
      await handleFileUpload(file);
    }
  };

  // Handle file upload
  const handleFileUpload = async (fileToUpload = null) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      alert('Please select a file first');
      return;
    }

    setLoading(true);
    setUploadProgress(0);
    setDataError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Upload progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Refresh data after successful upload
      await fetchCompanies();
      await fetchRecentProcessedData();

      alert(`File uploaded successfully! ${response.data.count || 0} companies processed.`);
      setSelectedFile(null);
      setUploadProgress(0);
    } catch (error) {
      console.error('Upload error:', error);
      setDataError(error.response?.data?.error || 'Upload failed. Please try again.');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      
      if (!validTypes.includes(file.type)) {
        alert('Please select an Excel file (.xlsx, .xls) or CSV file');
        return;
      }
      
      setSelectedFile(file);
      setDataError('');
      
      // Automatically trigger upload after file drop
      await handleFileUpload(file);
    }
  };

  // Fetch processed Excel Scraper data
  const fetchProcessedData = async (filename) => {
    try {
      // Download and process Excel file with rate limiting
      const response = await makeApiCall(async () => {
        return await axios.get(`http://localhost:5000/api/excel-scraper/download/${filename}`, {
          responseType: 'arraybuffer',
        });
      }, 3, 1500);

      const data = new Uint8Array(response.data);
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheetNames = workbook.SheetNames;
      const allData = {};
      
      sheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        allData[sheetName] = jsonData;
        console.log(`Loaded sheet "${sheetName}" with ${jsonData.length} rows`);
      });

      console.log('Processed data set with sheets:', Object.keys(allData));
      
      // Set the state first
      setProcessedData(allData);
      
      // Wait a moment for state to update, then trigger upload
      setTimeout(async () => {
        console.log('Triggering automatic upload after state update...');
        try {
          const uploadedCount = await uploadProcessedDataToCompanies();
          console.log('Auto-upload completed:', uploadedCount, 'companies uploaded');
        } catch (error) {
          console.log('Auto-upload failed:', error);
        }
      }, 100);
      
    } catch (err) {
      console.error('Failed to fetch processed data:', err);
      setDataError('Failed to load processed data');
    }
  };

  // Helper function for rate-limited API calls with retry logic
  const makeApiCall = async (apiCall, maxRetries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        return result;
      } catch (error) {
        if (error.response?.status === 429) {
          console.log(`🔄 Rate limited (attempt ${attempt}/${maxRetries}), waiting ${delay * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
          continue;
        }
        throw error; // Re-throw non-429 errors
      }
    }
    throw new Error('Max retries exceeded for API call');
  };

  // Fetch recent processed data
  const fetchRecentProcessedData = async () => {
    try {
      console.log('Fetching recent processed data...');
      const historyResponse = await makeApiCall(async () => {
        return await axios.get('http://localhost:5000/api/excel-scraper/history');
      }, 3, 2000);
      
      const recentHistory = historyResponse.data;
      
      if (recentHistory.length > 0) {
        const mostRecent = recentHistory[0];
        console.log('Found recent processed file:', mostRecent);
        setLastProcessedFile(mostRecent);
        await fetchProcessedData(mostRecent.processedFilename);
      } else {
        console.log('No recent processed data found');
      }
    } catch (err) {
      console.log('No recent processed data found');
    }
  };

  // Auto-load data on component mount
  useEffect(() => {
    const initializeData = async () => {
      console.log('Initializing data...');
      await fetchCompanies();
      await fetchRecentProcessedData();
    };
    initializeData();
  }, []);

  // Update companies count when companies state changes
  useEffect(() => {
    console.log('Companies state updated:', companies.length, 'companies');
  }, [companies]);

  // Update processed data when processedData state changes
  useEffect(() => {
    if (processedData) {
      console.log('Processed data updated:', Object.keys(processedData).length, 'sheets');
      
      // Automatically upload when processed data is available
      const autoUpload = async () => {
        console.log('Auto-uploading processed data from useEffect...');
        try {
          const uploadedCount = await uploadProcessedDataToCompanies();
          console.log('Auto-upload from useEffect completed:', uploadedCount, 'companies uploaded');
        } catch (error) {
          console.log('Auto-upload from useEffect failed:', error);
        }
      };
      
      autoUpload();
    }
  }, [processedData]);

  // Force refresh all data
  const forceRefreshAllData = async () => {
    setAutoProcessing(true);
    setProcessingStatus('Force refreshing all data...');
    
    try {
      console.log('Force refreshing companies...');
      await fetchCompanies();
      
      console.log('Force refreshing processed data...');
      await fetchRecentProcessedData();
      
      setProcessingStatus('All data refreshed successfully!');
      setTimeout(() => {
        setAutoProcessing(false);
        setProcessingStatus('');
      }, 2000);
      
    } catch (error) {
      console.error('Force refresh failed:', error);
      setProcessingStatus('Refresh failed. Please try again.');
      setTimeout(() => {
        setAutoProcessing(false);
        setProcessingStatus('');
      }, 3000);
    }
  };

  // Automatic data processing function
  const startAutoProcessing = async () => {
    setAutoProcessing(true);
    setProcessingStatus('Starting automatic data processing...');
    
    try {
      setProcessingStatus('Fetching latest data from servers...');
      await Promise.all([
        fetchCompanies(),
        fetchRecentProcessedData()
      ]);
      
      // Auto-upload processed data to companies database
      if (processedData) {
        setProcessingStatus('Uploading processed data to companies database...');
        await uploadProcessedDataToCompanies();
      }
      
      setProcessingStatus('Data processing and upload complete!');
      setTimeout(() => {
        setAutoProcessing(false);
        setProcessingStatus('');
      }, 2000);
      
    } catch (error) {
      console.error('Auto processing failed:', error);
      setProcessingStatus('Error during processing. Please try again.');
      setTimeout(() => {
        setAutoProcessing(false);
        setProcessingStatus('');
      }, 3000);
    }
  };

  // Upload processed data to companies database
  const uploadProcessedDataToCompanies = async () => {
    console.log('uploadProcessedDataToCompanies called');
    console.log('Processed data:', processedData);
    
    if (!processedData) {
      console.log('No processed data available');
      return 0;
    }
    
    // Check for "All Processed Data" sheet or any sheet with company data
    let processedCompanies = [];
    
    if (processedData['All Processed Data']) {
      processedCompanies = processedData['All Processed Data'];
      console.log('Found All Processed Data sheet with', processedCompanies.length, 'companies');
    } else {
      // Look for any sheet that has company data
      Object.keys(processedData).forEach(sheetName => {
        if (sheetName.includes('Processed') || sheetName.includes('Company') || sheetName.includes('Data')) {
          processedCompanies = processedData[sheetName];
          console.log('Found companies in sheet:', sheetName, 'with', processedCompanies.length, 'companies');
        }
      });
    }
    
    if (processedCompanies.length === 0) {
      console.log('No companies found in any processed data sheet');
      console.log('Available sheets:', Object.keys(processedData));
      return 0;
    }
    
    // Debug: Show the first company object structure
    if (processedCompanies.length > 0) {
      console.log('First company object structure:', JSON.stringify(processedCompanies[0], null, 2));
      console.log('Available keys in first company:', Object.keys(processedCompanies[0]));
    }
    
    try {
      console.log('Processing ALL', processedCompanies.length, 'companies for upload (NO SKIPPING)...');
      let uploadedCount = 0;
      
      for (const company of processedCompanies) {
        console.log('Processing company:', JSON.stringify(company, null, 2));
        
        // Fallback: Try to find any field that looks like a company name or phone
        const keys = Object.keys(company);
        console.log('Available fields:', keys);
        
        // Helper function to find field by pattern matching
        const findField = (patterns) => {
          console.log('Searching for patterns:', patterns);
          console.log('Available keys:', keys);
          
          for (const pattern of patterns) {
            for (const key of keys) {
              if (key.toLowerCase().includes(pattern.toLowerCase())) {
                console.log(`Found field "${key}" with value "${company[key]}" for pattern "${pattern}"`);
                return company[key];
              }
            }
          }
          console.log(`No field found for patterns:`, patterns);
          return null;
        };
        
        // Try pattern matching first, then fallback to exact matches
        // More comprehensive field name patterns
        const companyName = findField(['company', 'name', 'business', 'organization', 'firm', 'enterprise', 'corporation', 'llc', 'inc', 'ltd', 'pty', 'trading', 'brand']) || 
                           company.company || company.Company || company.name || company.Name || 
                           company['Company Name'] || company['Business Name'] || company['Organization'] || 
                           company['Firm Name'] || company['Client Name'] || company['Contact Name'] ||
                           company['Client'] || company['Customer'] || company['Account'] ||
                           company['Title'] || company['Description'] || company['Service'] ||
                           // Try any field that might contain a company name
                           (() => {
                             for (const key of keys) {
                               const value = String(company[key] || '');
                               // Look for values that seem like company names (not too short, not just numbers)
                               if (value.length > 3 && !value.match(/^\d+$/) && !value.includes('@') && !value.match(/^[\d\s\-\+\(\)]+$/)) {
                                 console.log(`Using field "${key}" as potential company name: "${value}"`);
                                 return value;
                               }
                             }
                             return null;
                           })() ||
                           `Company ${uploadedCount + 1}`; // Last resort fallback
        
        const phoneNumber = findField(['phone', 'mobile', 'contact', 'tel', 'telephone', 'cell', 'number']) || 
                           company.phone || company.Phone || company.mobile || company.Mobile || 
                           company['Phone Number'] || company['Phone No'] || company['Contact Number'] || 
                           company['Mobile Number'] || company.Tel || company['Telephone'] ||
                           company['Cell Phone'] || company['Contact'] || company['Number'] ||
                           // Try any field that looks like a phone number
                           (() => {
                             for (const key of keys) {
                               const value = String(company[key] || '');
                               // Look for values that seem like phone numbers
                               if (value.match(/[\d\-\+\(\)\s]/) && value.length > 7) {
                                 console.log(`Using field "${key}" as potential phone: "${value}"`);
                                 return value;
                               }
                             }
                             return null;
                           })() ||
                           `000000000${uploadedCount + 1}`; // Last resort fallback
        
        const emailAddress = findField(['email', 'mail']) || 
                           company.email || company.Email || company['Email Address'] || company['Email ID'] ||
                           ''; // Fallback empty email
        
        const websiteUrl = findField(['website', 'web', 'url', 'site']) || 
                           company.website || company.Website || company.URL || company.url || 
                           company['Website URL'] || company['Web Address'] ||
                           ''; // Fallback empty website
        
        const address = findField(['address', 'location', 'addr', 'city', 'state', 'area', 'street', 'building']) || 
                       company.address || company.Address || company.location || company.Location || 
                       company['Address'] || company['Location'] || company['City'] || company['State'] ||
                       company['Area'] || company['Street'] || company['Building'] ||
                       ''; // Fallback empty address
        
        console.log('Extracted data:', { companyName, phoneNumber, emailAddress, websiteUrl, address });
        
        // Apply line breaks to long text fields
        const processedCompanyName = addLineBreaks(String(companyName || ''), 20);
        const processedEmailAddress = addLineBreaks(String(emailAddress || ''), 20);
        const processedWebsiteUrl = addLineBreaks(String(websiteUrl || ''), 20);
        
        // NO SKIPPING - Upload ALL companies regardless of missing data
        const companyData = {
          company: processedCompanyName,
          phone: phoneNumber,
          email: processedEmailAddress,
          website: processedWebsiteUrl,
          address: address,
          message: `Hello ${processedCompanyName}, we would like to connect with you...`,
          status: 'pending'
        };
        
        try {
          console.log('Uploading company:', companyData);
          
          // Upload to database with rate limiting
          try {
            await makeApiCall(async () => {
              return await axios.post(`${API_BASE_URL}/companies`, companyData);
            }, 2, 500);
            
            uploadedCount++;
            console.log(`✅ Successfully uploaded company: ${companyName}`);
            
            // Add small delay between uploads to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            // If it's a duplicate (409), try to update existing company instead
            if (error.response?.status === 409) {
              console.log('Company already exists, updating instead:', companyName);
              try {
                // Try to find and update existing company
                await makeApiCall(async () => {
                  return await axios.put(`${API_BASE_URL}/companies/${companyName}`, companyData);
                }, 2, 500);
                
                await axios.put(`${API_BASE_URL}/companies/${companyName}`, companyData);
                uploadedCount++;
                console.log('Successfully updated company:', companyName);
              } catch (updateError) {
                console.log('Company update also failed:', companyName, updateError.response?.data?.error || updateError.message);
              }
            } else {
              console.log('Company upload failed:', companyName, postError.response?.data?.error || postError.message);
            }
          }
        } catch (error) {
          console.log('Company processing failed:', companyName, error.response?.data?.error || error.message);
          // Continue uploading other companies even if one fails
        }
      }
      
      console.log(`Successfully uploaded ${uploadedCount} out of ${processedCompanies.length} companies to database`);
      
      // Force refresh companies data after upload
      console.log('Refreshing companies data after upload...');
      await fetchCompanies();
      
      return uploadedCount;
    } catch (error) {
      console.error('Failed to upload processed data:', error);
      throw error;
    }
  };

  // Auto-load data on component mount
  useEffect(() => {
    const initializeData = async () => {
      console.log('Initializing data...');
      await fetchCompanies();
      await fetchRecentProcessedData();
    };
    initializeData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl shadow-lg transform hover:scale-105 transition-transform">
              <Globe className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Automatic Data Processing
              </h1>
              <p className="text-gray-600 text-lg mt-2">
                All processed data is automatically fetched and displayed in real-time
              </p>
            </div>
          </div>
        </div>

        {/* Excel File Upload Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 mr-2 text-green-600" />
              Upload Excel File
            </h2>
            <p className="text-gray-600">
              Upload Excel files containing company information to add them to the database
            </p>
          </div>

          {/* File Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={loading}
            />
            
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className={`p-4 rounded-full ${
                  dragActive ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  <UploadIcon className={`w-8 h-8 ${
                    dragActive ? 'text-blue-600' : 'text-green-600'
                  }`} />
                </div>
              </div>
              
              <div>
                <p className="text-lg font-medium text-gray-700">
                  {selectedFile ? selectedFile.name : 'Drop your Excel file here or click to browse (Upload starts automatically)'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Supports .xlsx, .xls, and .csv files (Max 10MB) - Upload begins immediately after selection
                </p>
              </div>

              {selectedFile && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        {selectedFile.name}
                      </span>
                      <span className="text-xs text-green-600">
                        ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Uploading...</span>
                <span className="text-sm text-gray-500">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {dataError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">{dataError}</span>
              </div>
            </div>
          )}

          {/* File Format Guidelines */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-3 text-sm">File Format Guidelines:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-800">
              <div>
                <strong>Required Columns:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Company Name</li>
                  <li>• Phone Number</li>
                </ul>
              </div>
              <div>
                <strong>Optional Columns:</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Email Address</li>
                  <li>• Website URL</li>
                  <li>• Address</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

      

      </div>
    </div>
  );
};

export default Upload;
