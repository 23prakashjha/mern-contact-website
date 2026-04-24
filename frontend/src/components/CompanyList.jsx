import React, { useState } from 'react';
import { Mail, Phone, Globe, MapPin, Calendar, Trash2, Building, MessageCircle, Send, Clock, Tag, Map, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';

const CompanyList = ({ companies = [], onDeleteCompany, searchTerm = '', filter = 'all' }) => {
  const [expandedCompanies, setExpandedCompanies] = useState(new Set());
  const [expandedUrls, setExpandedUrls] = useState(new Set());
  // Helper function to truncate company names
  const truncateCompanyName = (name, maxChars = 20) => {
    if (!name) return '';
    
    // First split by "|" to get the main company name
    const parts = name.split('|');
    const mainName = parts[0].trim();
    
    // Check character count and truncate if needed
    if (mainName.length <= maxChars) return mainName;
    return mainName.substring(0, maxChars) + '...';
  };

  // Toggle company name expansion
  const toggleCompanyExpansion = (companyId) => {
    setExpandedCompanies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  // Toggle URL expansion
  const toggleUrlExpansion = (companyId) => {
    setExpandedUrls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  // Get display name based on expansion state
  const getDisplayName = (company) => {
    const normalizedName = normalizeCompanyName(company.company);
    if (expandedCompanies.has(company._id)) {
      return normalizedName;
    }
    return truncateCompanyName(normalizedName);
  };

  // Check if company name should show expand button
  const shouldShowExpandButton = (company) => {
    const normalizedName = normalizeCompanyName(company.company);
    const truncatedName = truncateCompanyName(normalizedName);
    return normalizedName !== truncatedName;
  };

  // Helper function to truncate and split long text
  const splitLongText = (text, maxChars = 40) => {
    if (!text || typeof text !== 'string') return [];
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      if ((currentLine + ' ' + word).length <= maxChars) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word is too long, break it
          while (word.length > maxChars) {
            lines.push(word.substring(0, maxChars));
            word = word.substring(maxChars);
          }
          currentLine = word;
        }
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  // Helper function to normalize company name (remove large letters)
  const normalizeCompanyName = (name) => {
    if (!name) return '';
    // Convert to proper case: first letter capital, rest lowercase
    return name.replace(/\b\w+/g, (word) => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  };

  // Filter out companies with names longer than 20 characters
  const filteredCompanies = companies.filter(company => {
    if (!company.company) return false;
    
    // Get only the main name part before "|" for character counting
    const parts = company.company.split('|');
    const mainName = parts[0].trim();
    
    return mainName.length <= 100; // Allow up to 100 characters for filtering
  });

  // Email validation function
  const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  };

  // Enhanced email extraction function
  const extractValidEmails = (text) => {
    if (!text || typeof text !== 'string') return [];
    
    const emails = [];
    
    // Pattern 1: Standard email regex
    const standardEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const standardMatches = text.match(standardEmailRegex) || [];
    emails.push(...standardMatches);
    
    // Pattern 2: Handle concatenated emails like "thedentalcureg@gmail.comthedentalcureg"
    const concatenatedRegex = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const concatenatedMatches = text.match(concatenatedRegex) || [];
    emails.push(...concatenatedMatches);
    
    // Pattern 3: Handle UUID-style emails (sentry/wixpress style)
    const uuidRegex = /\b[a-f0-9]{32}@(?:sentry(?:-next)?\.wixpress\.com|sentry\.io)\b/g;
    const uuidMatches = text.match(uuidRegex) || [];
    emails.push(...uuidMatches);
    
    // Pattern 4: Handle emails with domain duplication like "gmail.comthedentalcureg@gmail.com"
    const domainDuplicationRegex = /(?:[a-z]+\.(?:com|net|org|co|in))?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const domainDuplicationMatches = text.match(domainDuplicationRegex) || [];
    emails.push(...domainDuplicationMatches);
    
    // Remove duplicates and filter valid emails
    const uniqueEmails = [...new Set(emails)];
    return uniqueEmails.filter(email => isValidEmail(email));
  };

  // Enhanced email correction function
  const correctEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    
    // First try to extract valid emails from the text
    const extractedEmails = extractValidEmails(email);
    if (extractedEmails.length > 0) {
      return extractedEmails[0]; // Return the first valid email found
    }
    
    let corrected = email.trim().toLowerCase();
    
    // Remove common separators and spaces
    corrected = corrected.replace(/[\s_\-]+/g, '');
    
    // Remove phone numbers and other non-email text
    corrected = corrected.replace(/\d{3,}[-\s]?\d{3,}[-\s]?\d{4,}/g, '');
    corrected = corrected.replace(/phone|call|book|schedule|homeabout|info|enquiries/g, '');
    
    // Remove extra @ symbols if multiple exist
    const atCount = (corrected.match(/@/g) || []).length;
    if (atCount > 1) {
      // Keep only the last @ symbol
      const parts = corrected.split('@');
      const localPart = parts.slice(0, -1).join('');
      const domain = parts[parts.length - 1];
      corrected = localPart + '@' + domain;
    }
    
    // Fix common domain mistakes
    const domainFixes = {
      'gmial.com': 'gmail.com',
      'gamil.com': 'gmail.com',
      'gmail.co': 'gmail.com',
      'yahoo.co': 'yahoo.com',
      'yahho.com': 'yahoo.com',
      'hotmial.com': 'hotmail.com',
      'outlok.com': 'outlook.com',
      'rediffmail.co': 'rediffmail.com'
    };
    
    Object.entries(domainFixes).forEach(([wrong, correct]) => {
      if (corrected.endsWith(wrong)) {
        corrected = corrected.replace(wrong, correct);
      }
    });
    
    // Validate the corrected email
    if (isValidEmail(corrected)) {
      return corrected;
    }
    
    return null;
  };

  // Test function for email extraction (can be removed in production)
  const testEmailExtraction = () => {
    const testCases = [
      '605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com',
      'dd0a55ccb8124b9c9d938e3acf41f8aa@sentry.wixpress.com',
      'c183baa23371454f99f417f6616b724d@sentry.wixpress.com',
      'thedentalcureg@gmail.comthedentalcureg',
      'gmail.comthedentalcureg@gmail.com',
      'ismilegurgaon@gmail.comhomeabout',
      'ismilegurgaon@gmail.comschedule,0124-4326628thedentalhomeggn@gmail.comc',
      '122002enquiriesthedentalhomeggn@gmail.comcall',
      '0124-4326628thedentalhomeggn@gmail.comcall,info@thegentledentalclinic.cominfo',
      'drsahilmaghu@gmail.comdrsahilmaghu',
      'gmail.comdrsahilmaghu@gmail.comdrsahilmaghu,himanshu.a178@gmail.comhimanshu',
      '.a178@gmail.com,98102-44656drbhutani@yahoo.com,garima_clinic@yahoo.inbook',
      'garima_clinic@yahoo.inphone'
    ];

    testCases.forEach((testCase, index) => {
      const extracted = extractValidEmails(testCase);
      const corrected = correctEmail(testCase);
      console.log(`Test ${index + 1}: "${testCase}"`);
      console.log(`  Extracted: ${extracted.length > 0 ? extracted[0] : 'None'}`);
      console.log(`  Corrected: ${corrected || 'None'}`);
      console.log('---');
    });
  };

  // Uncomment to test in browser console
  // testEmailExtraction();

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: {
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-800',
        borderColor: 'border-amber-200',
        icon: Clock,
        label: 'Pending'
      },
      sent: {
        bgColor: 'bg-emerald-100',
        textColor: 'text-emerald-800',
        borderColor: 'border-emerald-200',
        icon: Send,
        label: 'Sent'
      },
      failed: {
        bgColor: 'bg-rose-100',
        textColor: 'text-rose-800',
        borderColor: 'border-rose-200',
        icon: MessageCircle,
        label: 'Failed'
      }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </div>
    );
  };

  const getCommunicationBadge = (type) => {
    const typeConfig = {
      email: { color: 'text-blue-600', bg: 'bg-blue-50', label: 'Email' },
      sms: { color: 'text-green-600', bg: 'bg-green-50', label: 'SMS' },
      whatsapp: { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'WhatsApp' },
      all: { color: 'text-purple-600', bg: 'bg-purple-50', label: 'All Channels' }
    };

    const config = typeConfig[type] || typeConfig.all;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${config.color} ${config.bg}`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const handleDelete = async (companyId, companyName) => {
    if (window.confirm(`Are you sure you want to delete ${companyName}? This action cannot be undone.`)) {
      try {
        await fetch(`http://localhost:5000/api/companies/${companyId}`, {
          method: 'DELETE'
        });
        onDeleteCompany(companyId);
      } catch (error) {
        console.error('Error deleting company:', error);
        alert('Failed to delete company');
      }
    }
  };

  if (filteredCompanies.length === 0) {
    return (
      <div className="text-center max-w-4xl">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl mb-6 shadow-sm">
          <Building className="w-12 h-12 text-gray-400" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-3">No companies found</h3>
        <p className="text-gray-500 max-w-md mx-auto text-lg">
          {searchTerm || filter !== 'all' 
            ? 'Try adjusting your search or filter criteria'
            : companies.length > 0 
              ? 'No companies with names of 100 characters or less found'
              : 'Upload an Excel file to get started with your outreach campaign'
          }
        </p>
      </div>
    );
  }

  return (
    <div className=" overflow-hidden max-w-5xl mx-auto">
      <div className="overflow-x-auto overflow-y-visible scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
        <table className="w-full min-w-max">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">S.No</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredCompanies.map((company, index) => (
            <tr key={company._id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <div className="font-medium text-gray-900" title={normalizeCompanyName(company.company)}>
                    {getDisplayName(company)}
                  </div>
                  {shouldShowExpandButton(company) && (
                    <button
                      onClick={() => toggleCompanyExpansion(company._id)}
                      className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all duration-200 flex-shrink-0"
                      title={expandedCompanies.has(company._id) ? "Show less" : "Show full company name"}
                    >
                      {expandedCompanies.has(company._id) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                {company.detectedCategory && company.detectedCategory.category ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    <Tag className="w-3 h-3 mr-1" />
                    {company.detectedCategory.category}
                  </span>
                ) : company.category ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    <Tag className="w-3 h-3 mr-1" />
                    {company.category}
                  </span>
                ) : company.businessCategory ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <Tag className="w-3 h-3 mr-1" />
                    {company.businessCategory}
                  </span>
                ) : company.industry ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <Tag className="w-3 h-3 mr-1" />
                    {company.industry}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <Tag className="w-3 h-3 mr-1" />
                    No Category
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="space-y-1">
                  {company.phone && company.phone.trim() !== '' ? (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="text-green-600 font-medium">
                        {company.phone.split(',')[0].trim()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-gray-400 italic">No Phone</span>
                    </div>
                  )}
                  {(() => {
                    const email = company.email ? company.email.split(',')[0].trim() : '';
                    const correctedEmail = email ? correctEmail(email) : null;
                    const isValid = email && isValidEmail(email);
                    const displayEmail = isValid ? email : correctedEmail;
                    
                    return displayEmail ? (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <span className="text-blue-600">
                          {displayEmail}
                        </span>
                        {!isValid && correctedEmail && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">
                            ✓ Fixed
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-gray-400 italic">No Email</span>
                      </div>
                    );
                  })()}
                  {company.website && company.website.trim() !== '' ? (
                    <div className="flex items-start gap-1">
                      <Globe className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <a
                            href={company.website.split(',')[0].trim().startsWith('http') ? company.website.split(',')[0].trim() : `https://${company.website.split(',')[0].trim()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 hover:underline break-all"
                          >
                            {expandedUrls.has(company._id) 
                              ? company.website.split(',')[0].trim()
                              : company.website.split(',')[0].trim().substring(0, 30) + (company.website.split(',')[0].trim().length > 30 ? '...' : '')
                            }
                          </a>
                          {company.website.split(',')[0].trim().length > 30 && (
                            <button
                              onClick={() => toggleUrlExpansion(company._id)}
                              className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-all duration-200 flex-shrink-0"
                              title={expandedUrls.has(company._id) ? "Show less" : "Show full URL"}
                            >
                              {expandedUrls.has(company._id) ? (
                                <EyeOff className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-gray-400 italic">No Website</span>
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                {company.address && company.address.trim() ? (
                  <div className="space-y-1">
                    {splitLongText(company.address, 40).map((addressPart, addressIndex) => (
                      <div key={addressIndex} className="flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600">{addressPart}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-400 italic">No address</span>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                {getStatusBadge(company.status)}
              </td>
              <td className="px-4 py-3 text-sm">
                {getCommunicationBadge(company.communicationType)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(company.createdAt)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                <button
                  onClick={() => handleDelete(company._id, company.company)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all duration-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default CompanyList;
