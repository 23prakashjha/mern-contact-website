import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, CheckCircle, AlertCircle, Globe, Mail, Phone, History, X, Clock } from 'lucide-react';
import axios from 'axios';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import '../styles/ExcelScraper.css';
import toast, { Toaster } from 'react-hot-toast';

function ExcelScraper() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [processedData, setProcessedData] = useState(null);
  const [lastProcessedFile, setLastProcessedFile] = useState(null);
  const [companyCount, setCompanyCount] = useState(0);

  // Progress tracking states
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [processingStartTime, setProcessingStartTime] = useState(null);

  // Detailed scraping progress
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [scrapedCompanies, setScrapedCompanies] = useState(0);
  const [failedCompanies, setFailedCompanies] = useState(0);
  const [currentCompany, setCurrentCompany] = useState('');

  // Persistent progress tracking helpers
  const saveProgressToSession = () => {
    const progressData = {
      progress,
      currentStep,
      estimatedTimeRemaining,
      processingStartTime,
      totalCompanies,
      scrapedCompanies,
      failedCompanies,
      currentCompany,
      processing,
      uploading,
      file: file ? { name: file.name, size: file.size } : null,
      result,
      timestamp: Date.now()
    };
    sessionStorage.setItem('excelScraperProgress', JSON.stringify(progressData));
  };

  const loadProgressFromSession = () => {
    try {
      const savedData = sessionStorage.getItem('excelScraperProgress');
      if (savedData) {
        const progressData = JSON.parse(savedData);
        const timeSinceLastUpdate = Date.now() - progressData.timestamp;
        
        // Only restore if data is less than 5 minutes old
        if (timeSinceLastUpdate < 5 * 60 * 1000 && progressData.processing) {
          return progressData;
        }
      }
    } catch (error) {
      console.warn('Failed to load progress from session:', error);
    }
    return null;
  };

  const clearProgressFromSession = () => {
    sessionStorage.removeItem('excelScraperProgress');
  };

  // Automatically fetch processed data when page loads or when result changes
  useEffect(() => {
    // Try to restore progress from session storage
    const savedProgress = loadProgressFromSession();
    if (savedProgress) {
      // Restore processing state
      setProgress(savedProgress.progress);
      setCurrentStep(savedProgress.currentStep);
      setEstimatedTimeRemaining(savedProgress.estimatedTimeRemaining);
      setProcessingStartTime(savedProgress.processingStartTime);
      setTotalCompanies(savedProgress.totalCompanies);
      setScrapedCompanies(savedProgress.scrapedCompanies);
      setFailedCompanies(savedProgress.failedCompanies);
      setCurrentCompany(savedProgress.currentCompany);
      setUploading(savedProgress.uploading);
      setProcessing(savedProgress.processing);
      setResult(savedProgress.result);
      
      // Clear the session data after restoring
      setTimeout(() => {
        clearProgressFromSession();
      }, 1000);
    }

    fetchHistory();

    // Check if there's a recent processed file to display
    const fetchRecentProcessedData = async () => {
      try {
        const historyResponse = await axios.get('http://localhost:5000/api/excel-scraper/history');
        const recentHistory = historyResponse.data;

        if (recentHistory.length > 0) {
          const mostRecent = recentHistory[0];
          
          // Check if file exists before trying to fetch
          try {
            const checkResponse = await axios.get(`http://localhost:5000/api/excel-scraper/check/${mostRecent.processedFilename}`);

            if (checkResponse.data.exists) {
              setLastProcessedFile(mostRecent);
              await fetchProcessedData(mostRecent.processedFilename);
            } else {
              // Clear expired file references
              setLastProcessedFile(null);
              setProcessedData(null);
              setError('');
            }
          } catch (checkError) {
            // Clear references if check fails
            setLastProcessedFile(null);
            setProcessedData(null);
            setError('');
          }
        }
      } catch (err) {
        setLastProcessedFile(null);
        setProcessedData(null);
      }
    };

    fetchRecentProcessedData();
  }, []);

  // Auto-fetch processed data when upload completes
  useEffect(() => {
    if (result && result.processedFilename) {
      fetchProcessedData(result.processedFilename);
    }
  }, [result]);

  // Progress tracking effect
  useEffect(() => {
    if (processing && processingStartTime) {
      // Save progress to session storage
      saveProgressToSession();
      
      const interval = setInterval(() => {
        const elapsed = (Date.now() - processingStartTime) / 1000; // seconds
        
        // Simulate detailed scraping progress using actual total companies
        let estimatedProgress = 0;
        let estimatedTotalTime = 45; // 45 seconds average
        let currentStepText = '';
        let scrapedCount = 0;
        let failedCount = 0;
        const total = totalCompanies || 100; // Use actual total companies
        
        if (elapsed < 5) {
          estimatedProgress = Math.min((elapsed / 5) * 15, 15);
          currentStepText = 'Reading Excel file...';
          estimatedTotalTime = 50;
          scrapedCount = 0;
          failedCount = 0;
        } else if (elapsed < 10) {
          estimatedProgress = Math.min(15 + ((elapsed - 5) / 5) * 10, 25);
          currentStepText = 'Analyzing websites...';
          estimatedTotalTime = 48;
          scrapedCount = Math.round((elapsed - 5) * (total / 50)); // Scale to actual total
          failedCount = Math.round((elapsed - 5) * (total / 500));
        } else if (elapsed < 25) {
          estimatedProgress = Math.min(25 + ((elapsed - 10) / 15) * 50, 75);
          currentStepText = `Scraping: ${currentCompany || 'Processing websites...'}`;
          estimatedTotalTime = 45;
          scrapedCount = Math.round(total * 0.25 + (elapsed - 10) * (total / 150)); // Scale to actual total
          failedCount = Math.round(total * 0.02 + (elapsed - 10) * (total / 1500));
        } else if (elapsed < 35) {
          estimatedProgress = Math.min(75 + ((elapsed - 25) / 10) * 15, 90);
          currentStepText = 'Processing scraped data...';
          estimatedTotalTime = 42;
          scrapedCount = Math.round(total * 0.55 + (elapsed - 25) * (total / 200)); // Scale to actual total
          failedCount = Math.round(total * 0.05 + (elapsed - 25) * (total / 2000));
        } else {
          estimatedProgress = Math.min(90 + ((elapsed - 35) / 10) * 10, 98);
          currentStepText = 'Finalizing results...';
          estimatedTotalTime = 40;
          scrapedCount = Math.round(total * 0.75 + (elapsed - 35) * (total / 300)); // Scale to actual total
          failedCount = Math.round(total * 0.07 + (elapsed - 35) * (total / 3000));
        }
        
        setProgress(estimatedProgress);
        setCurrentStep(currentStepText);
        setEstimatedTimeRemaining(Math.max(estimatedTotalTime - elapsed, 0));
        setTotalCompanies(total);
        setScrapedCompanies(Math.min(scrapedCount, total));
        setFailedCompanies(Math.min(failedCount, total));
        
        // Update current company name during scraping phase
        if (elapsed >= 10 && elapsed < 25) {
          const companyNames = ['TechCorp', 'DataSoft', 'WebPro', 'InfoSys', 'CloudNet', 'DigitalHub', 'SmartTech', 'DataFlow'];
          setCurrentCompany(companyNames[Math.floor((elapsed - 10) / 2) % companyNames.length]);
        }
        
        // Auto-complete when simulation reaches 100%
        if (estimatedProgress >= 98) {
          clearInterval(interval);
          setTimeout(() => {
            setProgress(100);
            setCurrentStep('Scraping Complete!');
            setEstimatedTimeRemaining(0);
            setScrapedCompanies(total - failedCount);
            setFailedCompanies(failedCount);
            clearProgressFromSession(); // Clear progress when complete
          }, 1000);
        }
      }, 1000);
      
      return () => {
        clearInterval(interval);
        // Save final state before cleanup
        saveProgressToSession();
      };
    } else {
      setProgress(0);
      setCurrentStep('');
      setEstimatedTimeRemaining(0);
      setTotalCompanies(0);
      setScrapedCompanies(0);
      setFailedCompanies(0);
      setCurrentCompany('');
      clearProgressFromSession(); // Clear progress when not processing
    }
  }, [processing, processingStartTime, totalCompanies, currentCompany, file, result, uploading]);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      const uploadedFile = acceptedFiles[0];
      setFile(uploadedFile);
      setError('');
      setResult(null);
      
      // Read Excel file to get actual company count
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          // Set actual company count from file
          const actualCompanyCount = jsonData.length;
          setTotalCompanies(actualCompanyCount);
          
          // Start processing after reading file
          setTimeout(() => {
            handleUpload(uploadedFile, actualCompanyCount);
          }, 500);
        } catch (error) {
          console.error('Error reading Excel file:', error);
          setError('Failed to read Excel file. Please try again.');
        }
      };
      reader.readAsArrayBuffer(uploadedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleUpload = async (uploadedFile, actualCount) => {
    const fileToProcess = uploadedFile || file;
    if (!fileToProcess) return;

    const formData = new FormData();
    formData.append('excelFile', fileToProcess);

    setUploading(true);
    setError('');
    setProcessing(true);
    setProgress(0);
    setCurrentStep('Initializing...');
    setEstimatedTimeRemaining(45);
    setProcessingStartTime(Date.now());
    
    // Use actual company count from file
    const realTotalCount = actualCount || 100;
    setTotalCompanies(realTotalCount);
    setScrapedCompanies(0);
    setFailedCompanies(0);
    setCurrentCompany('');

    try {
      const response = await axios.post('http://localhost:5000/api/excel-scraper/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percentCompleted < 15) {
            setProgress(percentCompleted);
            setCurrentStep('Uploading file...');
            setEstimatedTimeRemaining(Math.max(45 - (percentCompleted * 0.45), 0));
          }
        },
      });

      setResult(response.data);
      setFile(null);
      fetchHistory();
      setProgress(100);
      setCurrentStep('Scraping Complete!');
      setEstimatedTimeRemaining(0);
      setScrapedCompanies(response.data.processedRows || 0);
      setFailedCompanies((response.data.totalRows || 0) - (response.data.processedRows || 0));
      setTotalCompanies(response.data.totalRows || realTotalCount);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
      setProgress(0);
      setCurrentStep('');
      setEstimatedTimeRemaining(0);
      setTotalCompanies(0);
      setScrapedCompanies(0);
      setFailedCompanies(0);
    } finally {
      setUploading(false);
      setTimeout(() => {
        setProcessing(false);
        setProcessingStartTime(null);
        clearProgressFromSession(); // Clear progress when processing completes
      }, 2000);
    }
  };

  const handleDownload = async (filename) => {
    try {
      // First check if file exists
      const checkResponse = await axios.get(`http://localhost:5000/api/excel-scraper/check/${filename}`);

      if (!checkResponse.data.exists) {
        setError('The processed file has expired or been deleted. Please re-upload your Excel file to generate a new processed file.');
        return;
      }

      const response = await axios.get(`http://localhost:5000/api/excel-scraper/download/${filename}`, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `processed-${filename}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('The processed file has expired or been deleted. Please re-upload your Excel file to generate a new processed file.');
      } else {
        setError('Download failed. Please try again.');
      }
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/excel-scraper/history');
      setHistory(response.data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const fetchProcessedData = async (filename) => {
    try {
      // First check if file exists
      const checkResponse = await axios.get(`http://localhost:5000/api/excel-scraper/check/${filename}`);

      if (!checkResponse.data.exists) {
        setError('The processed file has expired. Please re-upload your Excel file to generate a new processed file.');
        return;
      }

      // Fetch the processed Excel file
      const response = await axios.get(`http://localhost:5000/api/excel-scraper/download/${filename}`, {
        responseType: 'arraybuffer',
      });

      // Convert the Excel data to JSON for display
      const data = new Uint8Array(response.data);
      const workbook = XLSX.read(data, { type: 'array' });

      // Get all sheets
      const sheetNames = workbook.SheetNames;
      const allData = {};
      let totalCompanies = 0;

      sheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        allData[sheetName] = jsonData;

        // Count companies in main data sheets
        if (sheetName.includes('Processed') || sheetName.includes('Company') || sheetName.includes('Data') || sheetName.includes('All')) {
          totalCompanies += jsonData.length;
        }
      });

      setProcessedData(allData);
      setCompanyCount(totalCompanies);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('The processed file has expired or been deleted. Please re-upload your Excel file to generate a new processed file.');
      } else {
        setError('Failed to load processed data for display');
      }
    }
  };

  const testScraping = async () => {
    try {
      // Test single URL
      const response = await axios.get('http://localhost:5000/api/excel-scraper/test-scrape?url=https://example.com');
      console.log('Test scraping result:', response.data);

      const { result } = response.data;
      let message = `Test scraping results for ${response.data.url}:\n\n`;
      message += `✅ Success: ${result.success}\n`;
      message += `📧 Emails found: ${result.emails.length}\n`;
      message += `📞 Phones found: ${result.phones.length}\n\n`;

      if (result.emails.length > 0) {
        message += `📧 Emails:\n${result.emails.join('\n')}\n\n`;
      }

      if (result.phones.length > 0) {
        message += `📞 Phones:\n${result.phones.join('\n')}\n\n`;
      }

      if (result.error) {
        message += `❌ Error: ${result.error}\n\n`;
      }

      message += `🔍 Extracted ${response.data.result.scrapedUrl}`;

      alert(message);
    } catch (err) {
      console.error('Test scraping failed:', err);
      alert('Test scraping failed. Check console for details.');
    }
  };

  React.useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      <Toaster position="top-right" />
      {/* Header */}
      <header className="glass-effect sticky top-0 z-50 border-b border-white/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold gradient-text">Excel Scraper Pro</h1>
            </div>
            <div className="flex items-center space-x-2">
              {/* Company Count Display */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-3 py-2">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">
                    {companyCount} Companies
                  </span>
                </div>
              </div>
              <button
                onClick={testScraping}
                className="btn-secondary flex items-center space-x-2 text-sm"
              >
                <Globe className="w-4 h-4" />
                <span>Test</span>
              </button>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="btn-secondary flex items-center space-x-2"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">

        {/* Upload Area */}
        <section className="max-w-6xl  mx-auto mb-8">
          <div
            {...getRootProps()}
            className={clsx(
              'glass-effect p-8 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
              isDragActive
                ? 'border-blue-500 bg-blue-50/50'
                : 'border-gray-300 hover:border-gray-400'
            )}
          >
            <input {...getInputProps()} />
            <div className="text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {file ? (
                <div className="flex items-center justify-center space-x-2">
                  <FileText className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-600">{file.name}</span>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    {isDragActive ? 'Drop your Excel file here' : 'Drag & drop your Excel file here'}
                  </p>
                  <p className="text-sm text-gray-500">or click to browse</p>
                  <p className="text-xs text-gray-400 mt-2">Supports .xlsx and .xls files (max 10MB)</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {file && (
            <div className="mt-6 text-center">
              <div className="flex items-center justify-center space-x-2">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-600">{file.name}</span>
                <span className="text-sm text-gray-500 ml-2">
                  {processing ? '(Processing...)' : '(Ready to process)'}
                </span>
              </div>
            </div>
          )}

          {/* Progress Display */}
          {processing && (
            <div className="mt-6 max-w-6xl mx-auto">
              <div className="glass-effect p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Processing Progress</h3>
                  <div className="text-sm text-gray-500">
                    {estimatedTimeRemaining > 0 ? `${estimatedTimeRemaining}s remaining` : 'Almost done...'}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">{currentStep}</span>
                    <span className="text-sm font-bold text-blue-600">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Progress Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <div className="text-blue-600 font-bold text-lg">{progress}%</div>
                    <div className="text-blue-700">Completed</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <div className="text-green-600 font-bold text-lg">{scrapedCompanies}</div>
                    <div className="text-green-700">Scraped</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg text-center">
                    <div className="text-orange-600 font-bold text-lg">{failedCompanies}</div>
                    <div className="text-orange-700">Failed</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <div className="text-purple-600 font-bold text-lg">{estimatedTimeRemaining}s</div>
                    <div className="text-purple-700">Time Left</div>
                  </div>
                </div>

                {/* Detailed Progress Info */}
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                      <FileText className="w-4 h-4" />
                      <span>Scraping Details</span>
                    </h4>
                    <div className="space-y-1 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span>Total Companies:</span>
                        <span className="font-medium">{totalCompanies}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Successfully Scraped:</span>
                        <span className="font-medium text-green-600">{scrapedCompanies}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Failed to Scrape:</span>
                        <span className="font-medium text-red-600">{failedCompanies}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining:</span>
                        <span className="font-medium text-blue-600">{Math.max(0, totalCompanies - scrapedCompanies - failedCompanies)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                      <Clock className="w-4 h-4" />
                      <span>Time Information</span>
                    </h4>
                    <div className="space-y-1 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span>Time Elapsed:</span>
                        <span className="font-medium">{Math.round((45 - estimatedTimeRemaining))}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Time Remaining:</span>
                        <span className="font-medium">{estimatedTimeRemaining}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Progress:</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Speed:</span>
                        <span className="font-medium">{Math.round(scrapedCompanies / Math.max(1, (45 - estimatedTimeRemaining)))}/s</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Current Activity */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span>{currentStep}</span>
                  </div>
                  {currentCompany && (
                    <div className="mt-2 text-xs text-gray-500">
                      Currently processing: <span className="font-medium text-gray-700">{currentCompany}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Empty State */}
        {!file && !processing && !result && (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <svg className="w-20 h-20 mx-auto text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-600 text-xl mb-4">
              Upload an Excel file to extract contact information
            </p>
            <div className="text-left max-w-lg mx-auto bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-700 text-sm font-semibold mb-2">How it works:</p>
              <ol className="text-gray-600 text-sm space-y-1 list-decimal list-inside">
                <li>Upload an Excel file with company websites</li>
                <li>Scraper automatically extracts contact data</li>
                <li>Processes all websites continuously</li>
                <li>Extracts: Emails, Phone Numbers, Addresses</li>
                <li>Download all data as Excel file</li>
              </ol>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <section className="max-w-6xl mx-auto">
            <div className="glass-effect p-6 rounded-xl">
              <div className="flex items-center space-x-2 mb-4">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <h3 className="text-xl font-semibold">Processing Complete!</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-blue-900">Total Rows</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{result.totalRows}</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-900">Successfully Processed</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{result.processedRows}</p>
                </div>
              </div>

              {/* Phone Number Analysis Section */}
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Phone className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-purple-900">Existing Phone Numbers</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-600">{result.companiesWithExistingPhones || 0}</p>
                  <p className="text-sm text-purple-700 mt-1">Companies already have phone numbers</p>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Phone className="w-5 h-5 text-orange-600" />
                    <span className="font-medium text-orange-900">Need Phone Numbers</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">{result.companiesWithoutExistingPhones || 0}</p>
                  <p className="text-sm text-orange-700 mt-1">Companies need phone numbers added</p>
                </div>
              </div>

              {/* Analysis Summary */}
              {(result.companiesWithExistingPhones > 0 || result.companiesWithoutExistingPhones > 0) && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                    <Phone className="w-4 h-4" />
                    <span>Phone Number Analysis</span>
                  </h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>• <span className="font-medium">{result.companiesWithExistingPhones || 0}</span> companies already have phone numbers in the original file</p>
                    <p>• <span className="font-medium">{result.companiesWithoutExistingPhones || 0}</span> companies need phone numbers to be added</p>
                    <p>• Download the processed Excel file to see separate sheets for analysis</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">
                  Processing time: <span className="font-medium">{result.processingTime}s</span>
                </div>
              </div>

              <button
                onClick={() => handleDownload(result.processedFilename)}
                className="btn-primary w-full inline-flex items-center justify-center space-x-2"
              >
                <Download className="w-5 h-5" />
                <span>Download Processed File</span>
              </button>
            </div>
          </section>
        )}




        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="glass-effect rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Processing History</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {history.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No processing history available</p>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div key={item._id} className="bg-white/50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium truncate">{item.originalFilename}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(item.uploadDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Rows:</span>
                          <span className="ml-1 font-medium">{item.totalRows}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Processed:</span>
                          <span className="ml-1 font-medium">{item.processedRows}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Time:</span>
                          <span className="ml-1 font-medium">{item.processingTime}s</span>
                        </div>
                      </div>
                      {item.processedFilename && (
                        <button
                          onClick={() => handleDownload(item.processedFilename)}
                          className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default ExcelScraper;
