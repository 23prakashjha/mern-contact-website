import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FileText, Download, Mail, Phone, RefreshCw, CheckCircle, AlertCircle, Loader2, Globe, Upload as UploadIcon, FileSpreadsheet, History, X, Calendar, Clock, File, ChevronLeft, ChevronRight, Search, Database, Tag, Building, Users, Briefcase, MapPin, Star } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage] = useState(10);
  const [detectedCategories, setDetectedCategories] = useState([]);

  const API_BASE_URL = 'http://localhost:5000/api';

  // Fetch upload history
  const fetchUploadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/upload/history');
      setUploadHistory(response.data || []);
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
      setUploadHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Open history modal and fetch data
  const openHistoryModal = async () => {
    setShowHistoryModal(true);
    await fetchUploadHistory();
  };

  // Filter history based on search term
  const filteredHistory = uploadHistory.filter(item => {
    if (!historySearchTerm) return true;
    const searchLower = historySearchTerm.toLowerCase();
    return (
      (item.originalFilename && item.originalFilename.toLowerCase().includes(searchLower)) ||
      (item.filename && item.filename.toLowerCase().includes(searchLower)) ||
      (item.status && item.status.toLowerCase().includes(searchLower))
    );
  });

  // Pagination for history
  const historyIndexOfLastItem = historyCurrentPage * historyItemsPerPage;
  const historyIndexOfFirstItem = historyIndexOfLastItem - historyItemsPerPage;
  const historyCurrentItems = filteredHistory.slice(historyIndexOfFirstItem, historyIndexOfLastItem);
  const historyTotalPages = Math.ceil(filteredHistory.length / historyItemsPerPage);

  const historyPaginate = (pageNumber) => setHistoryCurrentPage(pageNumber);
  const historyGoToPreviousPage = () => setHistoryCurrentPage(prev => Math.max(prev - 1, 1));
  const historyGoToNextPage = () => setHistoryCurrentPage(prev => Math.min(prev + 1, historyTotalPages));

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  // Download file function
  const downloadFile = async (filename, originalFilename) => {
    try {
      console.log('Downloading file:', filename);
      
      // Show loading toast
      const toastId = toast.loading('Downloading file...');
      
      // Determine the correct download endpoint based on file type
      let downloadUrl;
      if (filename.includes('processed-') || filename.includes('google-maps-data')) {
        // Excel Scraper processed files
        downloadUrl = `http://localhost:5000/api/excel-scraper/download/${filename}`;
      } else {
        // Regular uploaded files
        downloadUrl = `http://localhost:5000/api/upload/download/${filename}`;
      }
      
      const response = await axios.get(downloadUrl, {
        responseType: 'blob',
      });
      
      // Create a blob from the response data
      const blob = new Blob([response.data]);
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = originalFilename || filename;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // Show success toast
      toast.success('File downloaded successfully!', { id: toastId });
      
    } catch (error) {
      console.error('Download error:', error);
      
      // Show appropriate error message
      let errorMessage = 'Failed to download file';
      if (error.response?.status === 404) {
        errorMessage = 'File not found or has been deleted';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error during download';
      }
      
      toast.error(errorMessage);
    }
  };

  // Category detection logic
  const detectCategories = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames;
          const categories = new Set();
          
          sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            // Analyze column headers and data patterns
            const headers = Object.keys(jsonData[0] || {});
            const categoryPatterns = {
              'Technology': ['software', 'tech', 'it', 'computer', 'programming', 'development', 'app', 'web', 'digital', 'system', 'network', 'data', 'cloud', 'cyber', 'security', 'ai', 'ml', 'automation'],
              'Healthcare': ['medical', 'health', 'hospital', 'clinic', 'pharmacy', 'doctor', 'nurse', 'patient', 'treatment', 'medicine', 'pharmaceutical', 'biotech', 'healthcare'],
              'Finance': ['bank', 'financial', 'finance', 'investment', 'insurance', 'credit', 'loan', 'money', 'account', 'payment', 'transaction', 'wealth', 'fund', 'capital'],
              'Retail': ['shop', 'store', 'retail', 'sale', 'product', 'goods', 'merchandise', 'ecommerce', 'commerce', 'market', 'shopping', 'consumer'],
              'Education': ['school', 'education', 'university', 'college', 'academic', 'student', 'teacher', 'training', 'course', 'learning', 'tuition', 'educational'],
              'Manufacturing': ['manufacture', 'production', 'factory', 'industrial', 'machinery', 'equipment', 'fabrication', 'assembly', 'processing', 'plant'],
              'Real Estate': ['property', 'real estate', 'housing', 'building', 'construction', 'architecture', 'land', 'rental', 'lease', 'development'],
              'Hospitality': ['hotel', 'restaurant', 'food', 'beverage', 'tourism', 'travel', 'hospitality', 'catering', 'accommodation', 'entertainment'],
              'Transportation': ['transport', 'logistics', 'shipping', 'delivery', 'freight', 'warehouse', 'distribution', 'fleet', 'vehicle', 'cargo'],
              'Consulting': ['consulting', 'consultant', 'advisory', 'service', 'solution', 'professional', 'expert', 'strategy', 'management'],
              'Marketing': ['marketing', 'advertising', 'promotion', 'brand', 'media', 'campaign', 'creative', 'agency', 'communication'],
              'Legal': ['legal', 'law', 'attorney', 'lawyer', 'court', 'justice', 'regulation', 'compliance', 'contract', 'firm'],
              'Government': ['government', 'public', 'municipal', 'state', 'federal', 'administration', 'official', 'department', 'agency'],
              'Agriculture': ['farm', 'agriculture', 'crop', 'livestock', 'food production', 'rural', 'farming', 'harvest', 'agricultural'],
              'Energy': ['energy', 'power', 'electricity', 'oil', 'gas', 'renewable', 'solar', 'wind', 'nuclear', 'utility'],
              'Telecommunications': ['telecom', 'communication', 'network', 'wireless', 'mobile', 'phone', 'internet', 'broadband', 'satellite'],
              'General Business': ['business', 'company', 'corporation', 'enterprise', 'organization', 'firm', 'llc', 'inc', 'ltd']
            };
            
            // Check sheet name first
            const sheetNameLower = sheetName.toLowerCase();
            Object.entries(categoryPatterns).forEach(([category, keywords]) => {
              if (keywords.some(keyword => sheetNameLower.includes(keyword))) {
                categories.add(category);
              }
            });
            
            // Check headers and sample data
            headers.forEach(header => {
              const headerLower = header.toLowerCase();
              Object.entries(categoryPatterns).forEach(([category, keywords]) => {
                if (keywords.some(keyword => headerLower.includes(keyword))) {
                  categories.add(category);
                }
              });
            });
            
            // Check sample data (first 10 rows)
            jsonData.slice(0, 10).forEach(row => {
              Object.values(row).forEach(value => {
                if (value && typeof value === 'string') {
                  const valueLower = value.toLowerCase();
                  Object.entries(categoryPatterns).forEach(([category, keywords]) => {
                    if (keywords.some(keyword => valueLower.includes(keyword))) {
                      categories.add(category);
                    }
                  });
                }
              });
            });
          });
          
          // If no specific categories found, default to General Business
          if (categories.size === 0) {
            categories.add('General Business');
          }
          
          resolve(Array.from(categories));
        } catch (error) {
          console.error('Error detecting categories:', error);
          resolve(['General Business']);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // Get category icon
  const getCategoryIcon = (category) => {
    const iconMap = {
      'Technology': <Database className="w-4 h-4" />,
      'Healthcare': <Users className="w-4 h-4" />,
      'Finance': <FileText className="w-4 h-4" />,
      'Retail': <Building className="w-4 h-4" />,
      'Education': <FileText className="w-4 h-4" />,
      'Manufacturing': <Building className="w-4 h-4" />,
      'Real Estate': <Building className="w-4 h-4" />,
      'Hospitality': <Star className="w-4 h-4" />,
      'Transportation': <MapPin className="w-4 h-4" />,
      'Consulting': <Briefcase className="w-4 h-4" />,
      'Marketing': <Star className="w-4 h-4" />,
      'Legal': <FileText className="w-4 h-4" />,
      'Government': <Building className="w-4 h-4" />,
      'Agriculture': <MapPin className="w-4 h-4" />,
      'Energy': <Database className="w-4 h-4" />,
      'Telecommunications': <Phone className="w-4 h-4" />,
      'General Business': <Briefcase className="w-4 h-4" />
    };
    return iconMap[category] || <Tag className="w-4 h-4" />;
  };

  // Get category color
  const getCategoryColor = (category) => {
    const colorMap = {
      'Technology': 'blue',
      'Healthcare': 'green',
      'Finance': 'purple',
      'Retail': 'orange',
      'Education': 'indigo',
      'Manufacturing': 'gray',
      'Real Estate': 'teal',
      'Hospitality': 'pink',
      'Transportation': 'red',
      'Consulting': 'yellow',
      'Marketing': 'purple',
      'Legal': 'blue',
      'Government': 'gray',
      'Agriculture': 'green',
      'Energy': 'orange',
      'Telecommunications': 'blue',
      'General Business': 'gray'
    };
    return colorMap[category] || 'gray';
  };

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
        return await axios.get(`${API_BASE_URL}/companies?limit=1000`);
      }, 3, 1000);
      setCompanies(response.data.companies || response.data || []);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    }
  };

  // Handle file selection
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // Debug: Log current state
      console.log('=== DUPLICATE CHECK DEBUG ===');
      console.log('Current lastProcessedFile:', lastProcessedFile);
      console.log('Selected file:', file.name, 'Size:', file.size);
      console.log('lastProcessedFile exists:', !!lastProcessedFile);
      
      if (lastProcessedFile) {
        console.log('lastProcessedFile.processedFilename:', lastProcessedFile.processedFilename);
        console.log('lastProcessedFile.size:', lastProcessedFile.size);
        console.log('Filename match:', lastProcessedFile.processedFilename === file.name);
        console.log('Size match:', lastProcessedFile.size === file.size);
      }
      
      // Check if this is the same file as the last processed file
      if (lastProcessedFile && lastProcessedFile.processedFilename === file.name && lastProcessedFile.size === file.size) {
        console.log('🔄 DUPLICATE FILE DETECTED!');
        const shouldProceed = window.confirm(
          `You've already uploaded "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB).\n\n` +
          `This file was processed on ${new Date(lastProcessedFile.processedAt).toLocaleString()}.\n\n` +
          `Do you want to upload it again? This may create duplicate entries.`
        );
        
        if (!shouldProceed) {
          console.log('❌ User cancelled duplicate upload');
          return;
        }
        console.log('✅ User chose to proceed with duplicate upload');
      } else {
        console.log('🆕 No duplicate detected or lastProcessedFile is null');
      }
      
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
      
      // Detect categories before upload
      const categories = await detectCategories(file);
      setDetectedCategories(categories);
      console.log('Detected categories:', categories);
      
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
    formData.append('categories', JSON.stringify(detectedCategories));

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
      
      // Debug: Log current state
      console.log('=== DRAG-DROP DUPLICATE CHECK DEBUG ===');
      console.log('Current lastProcessedFile:', lastProcessedFile);
      console.log('Dropped file:', file.name, 'Size:', file.size);
      console.log('lastProcessedFile exists:', !!lastProcessedFile);
      
      if (lastProcessedFile) {
        console.log('lastProcessedFile.processedFilename:', lastProcessedFile.processedFilename);
        console.log('lastProcessedFile.size:', lastProcessedFile.size);
        console.log('Filename match:', lastProcessedFile.processedFilename === file.name);
        console.log('Size match:', lastProcessedFile.size === file.size);
      }
      
      // Check if this is the same file as the last processed file
      if (lastProcessedFile && lastProcessedFile.processedFilename === file.name && lastProcessedFile.size === file.size) {
        console.log('🔄 DUPLICATE FILE DETECTED VIA DRAG-DROP!');
        const shouldProceed = window.confirm(
          `You've already uploaded "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB).\n\n` +
          `This file was processed on ${new Date(lastProcessedFile.processedAt).toLocaleString()}.\n\n` +
          `Do you want to upload it again? This may create duplicate entries.`
        );
        
        if (!shouldProceed) {
          console.log('❌ User cancelled duplicate upload via drag-drop');
          return;
        }
        console.log('✅ User chose to proceed with duplicate upload via drag-drop');
      } else {
        console.log('🆕 No duplicate detected via drag-drop or lastProcessedFile is null');
      }
      
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
      
      // Detect categories before upload
      const categories = await detectCategories(file);
      setDetectedCategories(categories);
      console.log('Detected categories:', categories);
      
      setSelectedFile(file);
      setDataError('');
      
      // Automatically trigger upload after file drop
      await handleFileUpload(file);
    }
  };

  // Fetch processed Excel Scraper data
  const fetchProcessedData = async (filename) => {
    try {
      // First check if file exists
      const checkResponse = await makeApiCall(async () => {
        return await axios.get(`http://localhost:5000/api/excel-scraper/check/${filename}`);
      }, 2, 1000);

      if (!checkResponse.data.exists) {
        console.log('File no longer exists:', filename);
        setDataError('The processed file has expired. Please re-upload your Excel file to generate a new processed file.');
        return;
      }

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
      
      // NOTE: Removed automatic upload - only upload when user explicitly triggers it
      
    } catch (err) {
      console.error('Failed to fetch processed data:', err);
      if (err.response?.status === 404) {
        setDataError('The processed file has expired or been deleted. Please re-upload your Excel file to generate a new processed file.');
      } else {
        setDataError('Failed to load processed data');
      }
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
      const historyResponse = await makeApiCall(async () => {
        return await axios.get('http://localhost:5000/api/excel-scraper/history');
      }, 3, 2000);
      
      const recentHistory = historyResponse.data;
      
      if (recentHistory.length > 0) {
        const mostRecent = recentHistory[0];
        
        // Check if file exists before trying to fetch
        try {
          const checkResponse = await makeApiCall(async () => {
            return await axios.get(`http://localhost:5000/api/excel-scraper/check/${mostRecent.processedFilename}`);
          }, 2, 1000);

          if (checkResponse.data.exists) {
            setLastProcessedFile(mostRecent);
            await fetchProcessedData(mostRecent.processedFilename);
          } else {
            // Clear expired file references
            setLastProcessedFile(null);
            setProcessedData(null);
            setDataError('');
          }
        } catch (checkError) {
          // Clear references if check fails
          setLastProcessedFile(null);
          setProcessedData(null);
          setDataError('');
        }
      } else {
        setLastProcessedFile(null);
        setProcessedData(null);
      }
    } catch (err) {
      setLastProcessedFile(null);
      setProcessedData(null);
    }
  };

  // Auto-load data on component mount
  useEffect(() => {
    const initializeData = async () => {
      // Add small delay to ensure smooth navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      await fetchCompanies();
      await fetchRecentProcessedData();
    };
    initializeData();
  }, []);

  // Update companies count when companies state changes
  useEffect(() => {
    // Silently update without console logs
  }, [companies]);

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

  // Automatic data processing function (NO AUTO-UPLOAD)
  const startAutoProcessing = async () => {
    setAutoProcessing(true);
    setProcessingStatus('Starting automatic data processing...');
    
    try {
      setProcessingStatus('Fetching latest data from servers...');
      await Promise.all([
        fetchCompanies(),
        fetchRecentProcessedData()
      ]);
      
      // NOTE: Removed automatic upload - data is only uploaded when user explicitly triggers it
      
      setProcessingStatus('Data refresh complete!');
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

  // Upload processed data to companies database (MANUAL TRIGGER ONLY)
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
      console.log('Processing companies for upload with duplicate checking...');
      let uploadedCount = 0;
      let skippedCount = 0;
      
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
        
        const address = findField(['address', 'location', 'addr', 'area', 'street', 'building']) || 
                       company.address || company.Address || company.location || company.Location || 
                       company['Address'] || company['Location'] || company['Area'] || company['Street'] || 
                       company['Building'] ||
                       ''; // Fallback empty address
        
        // Extract city specifically (separate from address)
        const city = findField(['city']) || 
                    company.city || company.City || company['City'] || company['city'] ||
                    ''; // Fallback empty city
        
        // If no dedicated city field found, try to extract city from address
        let extractedCity = city;
        if (!extractedCity && address) {
          // Try to extract city from address using regex patterns
          const cityMatch = address.match(/,?\s*([A-Za-z\s]+),?\s*[A-Z]{2,}|\b([A-Za-z\s]+)\b,?\s*[A-Z]{2,}/);
          if (cityMatch) {
            extractedCity = cityMatch[1] || cityMatch[2];
            extractedCity = extractedCity.trim();
          }
        }
        
        console.log('Extracted data:', { companyName, phoneNumber, emailAddress, websiteUrl, address, city: extractedCity });
        
        // Skip if missing essential data
        if (!companyName || !phoneNumber || companyName.trim() === '' || phoneNumber.trim() === '') {
          console.log('Skipping company due to missing essential data:', companyName);
          skippedCount++;
          continue;
        }
        
        // Apply line breaks to long text fields
        const processedCompanyName = addLineBreaks(String(companyName || ''), 20);
        const processedEmailAddress = addLineBreaks(String(emailAddress || ''), 20);
        const processedWebsiteUrl = addLineBreaks(String(websiteUrl || ''), 20);
        
        const companyData = {
          company: processedCompanyName,
          phone: phoneNumber,
          email: processedEmailAddress,
          website: processedWebsiteUrl,
          address: address,
          city: extractedCity,
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
            // If it's a duplicate (409), skip it
            if (error.response?.status === 409) {
              console.log('⚠️ Company already exists, skipping:', companyName);
              skippedCount++;
            } else {
              console.log('❌ Company upload failed:', companyName, error.response?.data?.error || error.message);
            }
          }
        } catch (error) {
          console.log('❌ Company processing failed:', companyName, error.response?.data?.error || error.message);
          // Continue uploading other companies even if one fails
        }
      }
      
      console.log(`Upload summary: ${uploadedCount} uploaded, ${skippedCount} skipped (duplicates/invalid) out of ${processedCompanies.length} total companies`);
      
      // Force refresh companies data after upload
      console.log('Refreshing companies data after upload...');
      await fetchCompanies();
      
      return uploadedCount;
    } catch (error) {
      console.error('Failed to upload processed data:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8">
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* History Section - Top */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                <History className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Upload History</h3>
                <p className="text-sm text-gray-600">View and manage all your previous file uploads</p>
              </div>
            </div>
            <button
              onClick={openHistoryModal}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              <History className="w-4 h-4 mr-2" />
              View History
            </button>
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
        </div>

        {/* Empty State */}
        {!selectedFile && (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <svg className="w-20 h-20 mx-auto text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 text-xl mb-4">
              Upload Excel files to add company data to database
            </p>
            <div className="text-left max-w-lg mx-auto bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 text-sm font-semibold mb-2">How it works:</p>
              <ol className="text-gray-600 text-sm space-y-1 list-decimal list-inside">
                <li>Upload Excel file with company information</li>
                <li>Data is automatically processed and validated</li>
                <li>Companies are added to the database</li>
                <li>Processed data from Excel Scraper is synced</li>
                <li>View all upload history and manage data</li>
              </ol>
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <History className="w-6 h-6" />
                    <div>
                      <h2 className="text-2xl font-bold">Upload History</h2>
                      <p className="text-purple-100 text-sm mt-1">Complete history of all file uploads</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {/* Search Bar */}
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search upload history..."
                      value={historySearchTerm}
                      onChange={(e) => {
                        setHistorySearchTerm(e.target.value);
                        setHistoryCurrentPage(1);
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                  </div>
                </div>

                {/* History Content */}
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <File className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">
                      {historySearchTerm ? 'No uploads found matching your search' : 'No upload history available'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {historyCurrentItems.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <FileSpreadsheet className="w-5 h-5 text-green-600" />
                              <h4 className="font-semibold text-gray-800">
                                {item.originalFilename || 'Unknown File'}
                              </h4>
                              {item.status && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  item.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                                  item.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {item.status}
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4" />
                                <span>Uploaded: {formatDate(item.uploadDate)}</span>
                              </div>
                              {item.size && (
                                <div className="flex items-center space-x-2">
                                  <FileText className="w-4 h-4" />
                                  <span>Size: {formatFileSize(item.size)}</span>
                                </div>
                              )}
                              {item.recordCount !== undefined && (
                                <div className="flex items-center space-x-2">
                                  <Database className="w-4 h-4" />
                                  <span>Records: {item.recordCount}</span>
                                </div>
                              )}
                              {item.mimetype && (
                                <div className="flex items-center space-x-2">
                                  <FileText className="w-4 h-4" />
                                  <span>Type: {item.mimetype}</span>
                                </div>
                              )}
                              {item.categories && item.categories.length > 0 && (
                                <div className="flex items-center space-x-2 col-span-full">
                                  <Tag className="w-4 h-4 text-purple-600" />
                                  <span className="font-medium text-purple-700">Categories:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {item.categories.map((category, catIndex) => (
                                      <span
                                        key={catIndex}
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${getCategoryColor(category)}-100 text-${getCategoryColor(category)}-800`}
                                      >
                                        {getCategoryIcon(category)}
                                        <span className="ml-1">{category}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {item.errorMessage && (
                                <div className="flex items-center space-x-2 text-red-600 col-span-full">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>Error: {item.errorMessage}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Download Button */}
                          <div className="ml-4">
                            <button
                              onClick={() => downloadFile(item.filename || item.processedFilename, item.originalFilename)}
                              className="flex items-center px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors shadow-sm hover:shadow-md"
                              title={`Download ${item.originalFilename || 'file'}`}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
export default Upload;
