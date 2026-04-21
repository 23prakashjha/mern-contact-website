import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bold, Italic, Underline, Link, Smile, Paperclip, Send, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, Filter, Search, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

const IndividualMessage = () => {
  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    message: '',
    communicationType: 'email'
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  
  // Reviews modal state
  const [showReviews, setShowReviews] = useState(false);
  
  // Manual filter state
  const [manualFilters, setManualFilters] = useState({
    category: 'all',
    city: 'all',
    search: ''
  });
  
  // Email filtering state
  const [emailFilter, setEmailFilter] = useState('all'); // 'all', 'with_email', 'without_email'
  
  
  // Message toolbar state
  const [showToolbar, setShowToolbar] = useState(true);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const textarea = document.querySelector('textarea[name="message"]');
      if (!textarea || document.activeElement !== textarea) return;
      
      // Check for Ctrl/Cmd key combinations
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            applyFormat('bold');
            break;
          case 'i':
            e.preventDefault();
            applyFormat('italic');
            break;
          case 'u':
            e.preventDefault();
            applyFormat('underline');
            break;
          case 'l':
            e.preventDefault();
            insertLink();
            break;
          case 'k':
            e.preventDefault();
            insertLink();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [formData.message]); // Include formData.message to ensure latest state

  // India cities list (same as in History page)
  const indiaCities = [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam',
    'Pimpri-Chinchwad', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
    'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivli', 'Vasai-Virar', 'Varanasi',
    'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
    'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur',
    'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati', 'Hubli-Dharwad', 'Cuttack',
    'Firozabad', 'Mangalore', 'Dehradun', 'Bhilai', 'Tiruchirappalli', 'Gurgaon',
    'Noida', 'Bhubaneswar', 'Salem', 'Warangal', 'Kochi', 'Guntur', 'Bhiwandi',
    'Raurkela', 'Bokaro Steel City', 'Siliguri', 'Tirupur', 'Moradabad', 'Fategarh Sahib',
    'Jalandhar', 'Bhatpara', 'South Dumdum', 'Bardhaman', 'Mysore', 'Panihati',
    'Tatanagar', 'Kamarhati', 'Durgapur', 'Bangalore Rural', 'North Dumdum', 'Berhampur',
    'Pondicherry', 'Nanded', 'Imphal', 'Rajahmundry', 'Tirupati', 'Karnal', 'Kolhapur',
    'Ajmer', 'Gulbarga', 'Jamshedpur', 'Bhilwara', 'Gwalior', 'Ujjain', 'Loni',
    'Sikandarabad', 'Jhansi', 'Shimla', 'Raniganj', 'Aligarh', 'Parbhani', 'Tumkur',
    'Bikaner', 'Panipat', 'Eluru', 'Sambalpur', 'Nizamabad', 'Secunderabad', 'Erode',
    'Bellary', 'Bhilai', 'Vellore', 'Aizawl', 'Kochi-Munnar', 'Kozhikode', 'Akola',
    'Kurnool', 'Bokaro', 'Belgaum', 'Latur', 'Gulbarga', 'Udupi', 'Davanagere',
    'Kolar', 'Mangalore', 'Chitradurga', 'Bellary', 'Raichur', 'Bidar', 'Hospet',
    'Gulbarga', 'Bijapur', 'Bagalkot', 'Gokak', 'Mudhol', 'Badami', 'Bankapura',
    'Kundgol', 'Mundargi', 'Nargund', 'Navalgund', 'Ron', 'Shirhatti', 'Yelburga',
    'Aland', 'Afzalpur', 'Athni', 'Babaleshwar', 'Bailhongal', 'Bamnasi', 'Basavakalyan',
    'Bhalki', 'Chincholi', 'Deodurg', 'Gurmatkal', 'Hukkeri', 'Jevargi', 'Kamalapur',
    'Kansur', 'Khadgat', 'Konnur', 'Koppal', 'Kotnoor', 'Koushambi', 'Kudligi',
    'Lingsugur', 'Muddebihal', 'Mudhol', 'Mundargi', 'Nandgad', 'Naragund', 'Navalgund',
    'Raichur', 'Ron', 'Sedam', 'Shahabad', 'Shirhatti', 'Shorapur', 'Sindgi',
    'Surpur', 'Talikota', 'Yadrami', 'Yelburga', 'Yergol', 'Zalki'
  ];

  // Business categories (same as in History and MessageSender)
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

  // Fetch companies from backend
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/companies');
        const data = await response.json();
        setCompanies(data);
      } catch (error) {
        console.error('Error fetching companies:', error);
      }
    };

    fetchCompanies();
  }, []);

  // Refresh companies when page loads or after upload
  const refreshCompanies = () => {
    fetchCompanies();
  };

  // Helper function to truncate company names
  const truncateCompanyName = (name, maxWords = 20) => {
    if (!name) return '';
    
    // First split by "|" to get the main company name
    const parts = name.split('|');
    const mainName = parts[0].trim();
    
    // Then check word count and truncate if needed
    const words = mainName.split(' ');
    if (words.length <= maxWords) return mainName;
    return words.slice(0, maxWords).join(' ') + ' ----';
  };

  // Helper function to normalize company name (remove large letters)
  const normalizeCompanyName = (name) => {
    if (!name) return '';
    // Convert to proper case: first letter capital, rest lowercase
    return name.replace(/\b\w+/g, (word) => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  };

  // Email validation function
  const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  };

  // Filter out companies with names longer than 20 words (now allows up to 20 words)
  const filteredCompanies = companies.filter(company => {
    if (!company.company) return false;
    
    // Get only the main name part before "|" for word counting
    const parts = company.company.split('|');
    const mainName = parts[0].trim();
    const wordCount = mainName.split(' ').length;
    
    return wordCount <= 20; // Changed from 10 to 20 words
  }).filter(company => {
    // Category filtering
    const categoryMatch = manualFilters.category === 'all' || (
      (company.category && company.category.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
      (company.businessCategory && company.businessCategory.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
      (company.industry && company.industry.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
      (company.sector && company.sector.toLowerCase().trim() === manualFilters.category.toLowerCase().trim()) ||
      (company.type && company.type.toLowerCase().trim() === manualFilters.category.toLowerCase().trim())
    );
    
    // City filtering
    const cityMatch = manualFilters.city === 'all' || (
      (company.city && company.city.toLowerCase().trim() === manualFilters.city.toLowerCase().trim()) ||
      (company.location && company.location.toLowerCase().trim() === manualFilters.city.toLowerCase().trim()) ||
      (company.address && company.address.trim() && company.address.toLowerCase().includes(manualFilters.city.toLowerCase().trim()))
    );
    
    // Search filtering
    const searchMatch = !manualFilters.search || manualFilters.search.trim() === '' ||
      company.company.toLowerCase().includes(manualFilters.search.toLowerCase()) ||
      (company.email && company.email.toLowerCase().includes(manualFilters.search.toLowerCase())) ||
      (company.address && company.address.toLowerCase().includes(manualFilters.search.toLowerCase()));
    
    // Email filtering
    const emailMatch = emailFilter === 'all' || (
      emailFilter === 'with_email' && company.email && company.email.trim() !== ''
    ) || (
      emailFilter === 'without_email' && (!company.email || company.email.trim() === '')
    );
    
    
    return categoryMatch && cityMatch && searchMatch && emailMatch;
  });

  // Auto-populate form when company is selected
  const handleCompanySelect = (company) => {
    setSelectedCompany(company);
    setFormData({
      phone: company.phone || '',
      email: company.email || '',
      message: `Hello ${company.company}, we would like to connect with you...`,
      communicationType: company.email ? 'email' : 'sms'
    });
  };

  // Handle bulk company selection
  const handleCompanyCheckbox = (companyId) => {
    setSelectedCompanies(prev => 
      prev.includes(companyId) 
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
  };

  // Select all companies
  const selectAllCompanies = () => {
    setSelectedCompanies(filteredCompanies.map(c => c._id));
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedCompanies([]);
  };

  // Toggle bulk mode
  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedCompanies([]);
    setSelectedCompany(null);
  };

  // Handle manual filter changes
  const handleManualFiltersChange = (filters) => {
    setManualFilters(filters);
    setSelectedCompany(null); // Clear selection when filters change
    setSelectedCompanies([]); // Clear bulk selections when filters change
  };

  // Handle manual search changes
  const handleManualSearchChange = (search) => {
    setManualFilters(prev => ({ ...prev, search }));
    setSelectedCompany(null); // Clear selection when search changes
    setSelectedCompanies([]); // Clear bulk selections when search changes
  };

  // Clear all manual filters
  const clearManualFilters = () => {
    setManualFilters({
      category: 'all',
      city: 'all',
      search: ''
    });
    setSelectedCompany(null);
    setSelectedCompanies([]);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      let response;
      
      if (bulkMode && selectedCompanies.length > 0) {
        // Bulk message sending
        response = await axios.post('http://localhost:5000/api/send-bulk-messages', {
          companyIds: selectedCompanies,
          message: formData.message,
          communicationType: formData.communicationType
        });
      } else if (formData.communicationType === 'email') {
        response = await axios.post('http://localhost:5000/api/send-individual-email', {
          email: formData.email,
          subject: 'Message from Contact Form',
          message: formData.message
        });
      } else if (formData.communicationType === 'all_channels') {
        response = await axios.post('http://localhost:5000/api/send-individual-combined', {
          phone: formData.phone,
          email: formData.email,
          subject: 'Message from Contact Form',
          message: formData.message,
          communicationType: 'all_three'
        });
      } else if (formData.communicationType === 'email_sms') {
        response = await axios.post('http://localhost:5000/api/send-individual-combined', {
          phone: formData.phone,
          email: formData.email,
          subject: 'Message from Contact Form',
          message: formData.message,
          communicationType: 'email_and_sms'
        });
      } else if (formData.communicationType === 'email_whatsapp') {
        response = await axios.post('http://localhost:5000/api/send-individual-combined', {
          phone: formData.phone,
          email: formData.email,
          subject: 'Message from Contact Form',
          message: formData.message,
          communicationType: 'email_and_whatsapp'
        });
      } else {
        response = await axios.post('http://localhost:5000/api/send-individual-message', {
          phone: formData.phone,
          message: formData.message,
          communicationType: formData.communicationType
        });
      }

      setResult(response.data);
      
      // Auto-clear form after successful send
      if (response.data.success) {
        setTimeout(() => {
          resetForm();
        }, 2000); // Clear after 2 seconds
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Message toolbar functions - Enhanced Text Selection Based
  const applyFormat = (format) => {
    const textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.message.substring(start, end);
    
    // If no text selected, either insert formatting markers or show alert
    if (selectedText.length === 0) {
      // For formatting that requires text, show a more helpful message
      if (['bold', 'italic', 'underline', 'list', 'numbered_list'].includes(format)) {
        // Insert sample text with formatting for demonstration
        let sampleText = '';
        switch (format) {
          case 'bold':
            sampleText = '**Bold text**';
            break;
          case 'italic':
            sampleText = '*Italic text*';
            break;
          case 'underline':
            sampleText = '__Underlined text__';
            break;
          case 'list':
            sampleText = '\n• List item';
            break;
          case 'numbered_list':
            sampleText = '\n1. Numbered item';
            break;
        }
        
        const newMessage = formData.message.substring(0, start) + sampleText + formData.message.substring(end);
        setFormData(prev => ({ ...prev, message: newMessage }));
        
        // Position cursor appropriately
        setTimeout(() => {
          textarea.focus();
          if (format === 'list' || format === 'numbered_list') {
            textarea.setSelectionRange(start + sampleText.length - 9, start + sampleText.length); // Select the item text
          } else {
            textarea.setSelectionRange(start + 2, start + sampleText.length - 2); // Select the formatted text
          }
        }, 0);
        return;
      }
    }
    
    let formattedText = '';
    
    switch (format) {
      case 'bold':
        // Check if already bold, remove formatting
        if (selectedText.startsWith('**') && selectedText.endsWith('**')) {
          formattedText = selectedText.slice(2, -2);
        } else {
          formattedText = `**${selectedText}**`;
        }
        break;
      case 'italic':
        // Check if already italic, remove formatting
        if (selectedText.startsWith('*') && selectedText.endsWith('*') && !selectedText.startsWith('**')) {
          formattedText = selectedText.slice(1, -1);
        } else {
          formattedText = `*${selectedText}*`;
        }
        break;
      case 'underline':
        // Check if already underlined, remove formatting
        if (selectedText.startsWith('__') && selectedText.endsWith('__')) {
          formattedText = selectedText.slice(2, -2);
        } else {
          formattedText = `__${selectedText}__`;
        }
        break;
      case 'list':
        formattedText = `\n• ${selectedText}`;
        break;
      case 'numbered_list':
        formattedText = `\n1. ${selectedText}`;
        break;
      default:
        formattedText = selectedText;
    }
    
    // Update the message with formatted text
    const newMessage = formData.message.substring(0, start) + formattedText + formData.message.substring(end);
    setFormData(prev => ({ ...prev, message: newMessage }));
    
    // Restore cursor position after formatting
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formattedText.length);
    }, 0);
  };

  const alignText = (alignment) => {
    const textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.message.substring(start, end);
    
    if (selectedText.length === 0) {
      // Insert alignment marker with sample text
      let alignmentText = '';
      switch (alignment) {
        case 'center':
          alignmentText = '\n→ Centered text';
          break;
        case 'right':
          alignmentText = '\n← Right aligned text';
          break;
        case 'left':
        default:
          alignmentText = '\n← Left aligned text';
          break;
      }
      
      const newMessage = formData.message.substring(0, start) + alignmentText + formData.message.substring(end);
      setFormData(prev => ({ ...prev, message: newMessage }));
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + alignmentText.length - 15, start + alignmentText.length); // Select the sample text
      }, 0);
      return;
    }
    
    let alignmentMarker = '';
    switch (alignment) {
      case 'center':
        alignmentMarker = '\n→ ';
        break;
      case 'right':
        alignmentMarker = '\n← ';
        break;
      case 'left':
      default:
        alignmentMarker = '\n← ';
        break;
    }
    
    const formattedText = alignmentMarker + selectedText;
    const newMessage = formData.message.substring(0, start) + formattedText + formData.message.substring(end);
    setFormData(prev => ({ ...prev, message: newMessage }));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + formattedText.length);
    }, 0);
  };

  const insertLink = () => {
    const textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.message.substring(start, end);
    
    const url = prompt('Enter URL:', selectedText.startsWith('http') ? selectedText : 'https://');
    if (url) {
      const linkText = selectedText || 'Link text';
      const formattedLink = `[${linkText}](${url})`;
      const newMessage = formData.message.substring(0, start) + formattedLink + formData.message.substring(end);
      setFormData(prev => ({ ...prev, message: newMessage }));
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + formattedLink.length);
      }, 0);
    }
  };

  const insertEmoji = () => {
    const textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;
    
    const emojis = ['😊', '👍', '❤️', '🎉', '👏', '🙏', '💯', '✨', '🚀', '💪'];
    const emojiList = emojis.map((emoji, index) => `${index + 1}. ${emoji}`).join('\n');
    const choice = prompt(`Choose emoji:\n${emojiList}\n\nEnter number (1-10):`, '1');
    
    const emojiIndex = parseInt(choice) - 1;
    if (emojiIndex >= 0 && emojiIndex < emojis.length) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const emoji = emojis[emojiIndex];
      const newMessage = formData.message.substring(0, start) + emoji + formData.message.substring(end);
      setFormData(prev => ({ ...prev, message: newMessage }));
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 1, start + 1);
      }, 0);
    }
  };

  const insertLineBreak = () => {
    const textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const newMessage = formData.message.substring(0, start) + '\n' + formData.message.substring(start);
    setFormData(prev => ({ ...prev, message: newMessage }));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    }, 0);
  };

  const attachFile = () => {
    alert('File attachment feature coming soon!');
  };

  const resetForm = () => {
    setFormData({
      phone: '',
      email: '',
      message: '',
      communicationType: 'email'
    });
    setResult(null);
    setError('');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Toaster position="top-right" />
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Send Messages</h1>
        
        {/* Mode Toggle */}
        <div className="mb-6">
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => toggleBulkMode()}
              className={`px-4 py-2 rounded-md transition-colors ${
                bulkMode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {bulkMode ? 'Switch to Individual' : 'Switch to Bulk'}
            </button>
            {bulkMode && (
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={selectAllCompanies}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Select All ({companies.length})
                </button>
                <button
                  type="button"
                  onClick={clearAllSelections}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Clear Selection ({selectedCompanies.length})
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Company Selection */}
        {!bulkMode ? (
          <div className="mb-6">
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
            
            {/* Email Filter */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Email
              </label>
              <select
                value={emailFilter}
                onChange={(e) => {
                  setEmailFilter(e.target.value);
                  setSelectedCompany(null); // Clear selection when filter changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Companies</option>
                <option value="with_email">📧 With Email</option>
                <option value="without_email">📱 Without Email</option>
              </select>
            </div>
            
            {/* Active Email Filter */}
            {emailFilter !== 'all' && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                  Email: {emailFilter === 'with_email' ? 'With Email' : 'Without Email'}
                  <button
                    onClick={() => setEmailFilter('all')}
                    className="ml-2 text-orange-600 hover:text-orange-800 text-sm"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
            
            {/* Company Selection Table */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Company (Optional)
                </label>
                <span className="text-sm text-gray-500">
                  {filteredCompanies.length} companies available
                </span>
              </div>
              <div className="border border-gray-300 rounded-md max-h-60 overflow-y-auto">
                {filteredCompanies.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    No companies found matching your filters
                  </div>
                )}
                {filteredCompanies.length > 0 && (
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCompanies.map((company, index) => (
                        <tr 
                          key={company._id} 
                          className={`hover:bg-gray-50 cursor-pointer ${
                            selectedCompany?._id === company._id ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => handleCompanySelect(company)}
                        >
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900" title={truncateCompanyName(normalizeCompanyName(company.company))}>
                            {truncateCompanyName(normalizeCompanyName(company.company))}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{company.phone ? company.phone.split(',')[0].trim() : '-'}</td>
                          <td className="px-3 py-2 text-sm">
                            {company.email && company.email.trim() !== '' ? (
                              <div className="space-y-1">
                                {company.email.split(',').map((email, emailIndex) => {
                                  const trimmedEmail = email.trim();
                                  if (!trimmedEmail) return null;
                                  return (
                                    <span key={`${company._id}-${emailIndex}`} className="text-green-600 block">
                                      {trimmedEmail} {isValidEmail(trimmedEmail) ? '✅' : '❌'}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-red-600">No Email</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {company.website && company.website.trim() !== '' ? (
                              <span className="text-blue-600">{company.website}</span>
                            ) : (
                              <span className="text-gray-600">No Website</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            {/* Manual Filters for Bulk Mode */}
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
            
            {/* Email Filter for Bulk Mode */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Email
              </label>
              <select
                value={emailFilter}
                onChange={(e) => {
                  setEmailFilter(e.target.value);
                  setSelectedCompanies([]); // Clear selections when filter changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Companies</option>
                <option value="with_email">📧 With Email</option>
                <option value="without_email">📱 Without Email</option>
              </select>
            </div>
            
            {/* Active Email Filter for Bulk Mode */}
            {emailFilter !== 'all' && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                  Email: {emailFilter === 'with_email' ? 'With Email' : 'Without Email'}
                  <button
                    onClick={() => setEmailFilter('all')}
                    className="ml-2 text-orange-600 hover:text-orange-800 text-sm"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
            
            {/* Company Selection Table for Bulk Mode */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Companies ({selectedCompanies.length} selected)
                </label>
                <button
                  type="button"
                  onClick={refreshCompanies}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Refresh Companies
                </button>
              </div>
              <div className="border border-gray-300 rounded-md max-h-60 overflow-y-auto">
                {filteredCompanies.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    No companies found matching your filters
                  </div>
                )}
                {filteredCompanies.length > 0 && (
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={selectedCompanies.length === filteredCompanies.length && filteredCompanies.length > 0}
                            onChange={(e) => e.target.checked ? selectAllCompanies() : clearAllSelections()}
                            className="mr-2"
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCompanies.map((company, index) => (
                        <tr key={company._id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedCompanies.includes(company._id)}
                              onChange={() => handleCompanyCheckbox(company._id)}
                              className="mr-2"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900" title={truncateCompanyName(normalizeCompanyName(company.company))}>
                            {truncateCompanyName(normalizeCompanyName(company.company))}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{company.phone ? company.phone.split(',')[0].trim() : '-'}</td>
                          <td className="px-3 py-2 text-sm">
                            {company.email && company.email.trim() !== '' ? (
                              <div className="space-y-1">
                                {company.email.split(',').map((email, emailIndex) => {
                                  const trimmedEmail = email.trim();
                                  if (!trimmedEmail) return null;
                                  return (
                                    <span key={`${company._id}-${emailIndex}`} className="text-green-600 block">
                                      {trimmedEmail} {isValidEmail(trimmedEmail) ? '✅' : '❌'}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-red-600">No Email</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {company.website && company.website.trim() !== '' ? (
                              <span className="text-blue-600">{company.website}</span>
                            ) : (
                              <span className="text-gray-600">No Website</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Communication Type Selection for Bulk Mode */}
        {bulkMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Send Via
            </label>
            <select
              name="communicationType"
              value={formData.communicationType}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="email">📧 Email</option>
              <option value="sms">📱 SMS</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="email_sms">📧📱 Email + SMS</option>
              <option value="email_whatsapp">📧💬 Email + WhatsApp</option>
              <option value="all">📱💬 SMS + WhatsApp</option>
              <option value="all_channels">📧📱💬 Email + SMS + WhatsApp</option>
            </select>
          </div>
        )}
        
        {result && (
          <div className={`p-4 rounded-lg mb-6 ${
            result.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <p className="font-medium">{result.message}</p>
            {result.error && <p className="text-sm mt-1">{result.error}</p>}
            {result.success && <p className="text-sm mt-2 text-green-600">Form will auto-clear in 2 seconds...</p>}
          </div>
        )}

        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!bulkMode && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Send Via
                </label>
                <select
                  name="communicationType"
                  value={formData.communicationType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="email">📧 Email</option>
                  <option value="sms">📱 SMS</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="all">📱💬 SMS + WhatsApp</option>
                  <option value="all_channels">📧📱💬 Email + SMS + WhatsApp</option>
                </select>
              </div>

              {formData.communicationType === 'email' || formData.communicationType === 'all_channels' || formData.communicationType === 'email_sms' || formData.communicationType === 'email_whatsapp' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required={formData.communicationType === 'email' || formData.communicationType === 'all_channels' || formData.communicationType === 'email_sms' || formData.communicationType === 'email_whatsapp'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="recipient@example.com"
                  />
                </div>
              ) : null}

              {formData.communicationType !== 'email' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required={formData.communicationType !== 'email'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+1234567890"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Include country code (e.g., +1 for US)
                  </p>
                </div>
              ) : null}
            </>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Message *
              </label>
              <button
                type="button"
                onClick={() => setShowToolbar(!showToolbar)}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                {showToolbar ? 'Hide Toolbar' : 'Show Toolbar'}
              </button>
            </div>
            
            {/* Message Toolbar */}
            {showToolbar && (
              <div className="border border-gray-300 rounded-t-md bg-gray-50 p-2 flex flex-wrap items-center gap-2 mb-0">
                {/* Text Formatting */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                  <button
                    type="button"
                    onClick={() => applyFormat('bold')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Bold (Ctrl+B)"
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('italic')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Italic (Ctrl+I)"
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('underline')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Underline (Ctrl+U)"
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                </div>

                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                  <button
                    type="button"
                    onClick={() => alignText('left')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Align Left"
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => alignText('center')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Align Center"
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => alignText('right')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Align Right"
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Lists */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                  <button
                    type="button"
                    onClick={() => applyFormat('list')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Bullet List"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormat('numbered_list')}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Numbered List"
                  >
                    <ListOrdered className="w-4 h-4" />
                  </button>
                </div>

                {/* Insert */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={insertLink}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Insert Link"
                  >
                    <Link className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={insertEmoji}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Insert Emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={insertLineBreak}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Line Break"
                  >
                    <span className="text-sm font-bold">↵</span>
                  </button>
                  <button
                    type="button"
                    onClick={attachFile}
                    className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-800 hover:shadow-sm"
                    title="Attach File (Coming Soon)"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Formatting Help */}
                <div className="ml-auto text-xs text-gray-500 italic">
                  Select text to format, or click buttons to insert formatting
                </div>
              </div>
            )}
            
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              rows={6}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                showToolbar ? 'rounded-t-none' : 'rounded-t-md'
              }`}
              placeholder="Enter your message here... (Select text and use toolbar for formatting, or click buttons to insert formatting)"
            />
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading || (bulkMode && selectedCompanies.length === 0)}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending...' : (bulkMode ? `Send to ${selectedCompanies.length} Companies` : 'Send Message')}
            </button>
            <button
              type="button"
              onClick={() => setShowReviews(true)}
              className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors"
            >
              📋 Reviews
            </button>
          </div>
        </form>
      </div>
      
      {/* Reviews Modal */}
      {showReviews && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">📋 Message Format Reviews</h2>
                <button
                  onClick={() => setShowReviews(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Email Format */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white mr-3">
                      📧
                    </div>
                    <h3 className="text-lg font-semibold text-blue-800">Email Format</h3>
                  </div>
                  <div className="bg-white rounded-md p-3 border border-blue-200">
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Subject:</strong> Message from Contact Form
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      <strong>Body:</strong><br/>
                      Hello [Company Name],<br/><br/>
                      {formData.message || 'Your message content here...'}<br/><br/>
                      Best regards,<br/>
                      Your Team
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-blue-600">
                    <strong>Features:</strong> Rich formatting, attachments, HTML support
                  </div>
                </div>
                
                {/* SMS Format */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white mr-3">
                      📱
                    </div>
                    <h3 className="text-lg font-semibold text-green-800">SMS Format</h3>
                  </div>
                  <div className="bg-white rounded-md p-3 border border-green-200">
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      Hello [Company Name]! {formData.message || 'Your message content here...'} 
                      - Your Team
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      Characters: {(formData.message || 'Your message content here...').length + 30}/160
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-green-600">
                    <strong>Features:</strong> 160 char limit, instant delivery, universal
                  </div>
                </div>
                
                {/* WhatsApp Format */}
                <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white mr-3">
                      💬
                    </div>
                    <h3 className="text-lg font-semibold text-green-700">WhatsApp Format</h3>
                  </div>
                  <div className="bg-white rounded-md p-3 border border-green-300">
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      Hello [Company Name],<br/><br/>
                      {formData.message || 'Your message content here...'}<br/><br/>
                      Best regards,<br/>
                      Your Team
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-green-600">
                    <strong>Features:</strong> Rich media, read receipts, global reach
                  </div>
                </div>
              </div>
              
              {/* Combined Formats */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">🔄 Combined Formats</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-purple-600 mr-2">📧📱</span>
                      <h4 className="font-semibold text-purple-800">Email + SMS</h4>
                    </div>
                    <p className="text-sm text-gray-700">
                      Send email with full formatting + SMS notification for immediate attention
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-purple-600 mr-2">📧💬</span>
                      <h4 className="font-semibold text-purple-800">Email + WhatsApp</h4>
                    </div>
                    <p className="text-sm text-gray-700">
                      Send detailed email + WhatsApp message for higher engagement
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-purple-600 mr-2">📱💬</span>
                      <h4 className="font-semibold text-purple-800">SMS + WhatsApp</h4>
                    </div>
                    <p className="text-sm text-gray-700">
                      Send both SMS and WhatsApp for maximum reach
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-purple-600 mr-2">📧📱💬</span>
                      <h4 className="font-semibold text-purple-800">All Channels</h4>
                    </div>
                    <p className="text-sm text-gray-700">
                      Send via Email, SMS, and WhatsApp for comprehensive coverage
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Current Message Preview */}
              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">📝 Your Current Message</h3>
                <div className="bg-white rounded-md p-3 border border-gray-300">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {formData.message || 'No message entered yet...'}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Message length: {formData.message.length} characters
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowReviews(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndividualMessage;
