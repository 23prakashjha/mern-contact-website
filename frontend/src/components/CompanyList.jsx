import React from 'react';
import { Mail, Phone, Globe, MapPin, Calendar, Trash2, Building, MessageCircle, Send, Clock, Tag, Map } from 'lucide-react';

const CompanyList = ({ companies = [], onDeleteCompany, searchTerm = '', filter = 'all' }) => {
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
                <div className="font-medium text-gray-900" title={truncateCompanyName(normalizeCompanyName(company.company))}>
                  {truncateCompanyName(normalizeCompanyName(company.company))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="space-y-1">
                  {company.phone && company.phone.trim() !== '' ? (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="text-green-600 font-medium">
                        {company.phone}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-gray-400 italic">No Phone</span>
                    </div>
                  )}
                  {company.email && company.email.trim() !== '' ? (
                    <div className="space-y-1">
                      {company.email.split(',').map((email, emailIndex) => {
                        const trimmedEmail = email.trim();
                        if (!trimmedEmail) return null;
                        return (
                          <div key={emailIndex} className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                            <span className="text-blue-600">
                              {trimmedEmail} {isValidEmail(trimmedEmail) ? '✅' : '❌'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-gray-400 italic">No Email</span>
                    </div>
                  )}
                  {company.website && company.website.trim() !== '' ? (
                    <div className="space-y-1">
                      {splitLongText(company.website, 40).map((websitePart, websiteIndex) => (
                        <div key={websiteIndex} className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                          <a
                            href={`http://${websitePart}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 hover:underline"
                          >
                            {websitePart}
                          </a>
                        </div>
                      ))}
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
                {company.category && company.category.trim() ? (
                  <div className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <span className="text-orange-600 font-medium">{company.category}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-400 italic">No Category</span>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                {company.city && company.city.trim() ? (
                  <div className="flex items-center gap-1">
                    <Map className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                    <span className="text-teal-600 font-medium">{company.city}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Map className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-400 italic">No City</span>
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
