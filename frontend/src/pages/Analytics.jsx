import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Calendar, TrendingUp, FileText, Filter } from 'lucide-react';
import jsPDF from 'jspdf';
import toast, { Toaster } from 'react-hot-toast';

const Analytics = () => {
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0, failed: 0 });
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allDatesData, setAllDatesData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, yesterday, 7days, 1month, 1year
  const [filteredDatesData, setFilteredDatesData] = useState([]);

  const API_BASE_URL = 'http://localhost:5000/api';

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [statsResponse, companiesResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/stats`),
        axios.get(`${API_BASE_URL}/companies?limit=1000`)
      ]);
      setStats(statsResponse.data);
      setCompanies(companiesResponse.data.companies || []);
      
      // Process all dates data
      const datesData = processAllDatesData(companiesResponse.data.companies || []);
      setAllDatesData(datesData);
      setFilteredDatesData(datesData); // Initially show all data
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCommunicationTypeStats = () => {
    const typeStats = {};
    companies.forEach(company => {
      const type = company.communicationType || 'all';
      if (!typeStats[type]) {
        typeStats[type] = { total: 0, sent: 0, failed: 0 };
      }
      typeStats[type].total++;
      if (company.status === 'sent') typeStats[type].sent++;
      if (company.status === 'failed') typeStats[type].failed++;
    });
    return typeStats;
  };

  const getAllDatesData = () => {
    const allDates = {};
    companies.forEach(company => {
      const date = new Date(company.createdAt).toLocaleDateString();
      if (!allDates[date]) {
        allDates[date] = { 
          date: date,
          total: 0, 
          sent: 0, 
          pending: 0, 
          failed: 0,
          successRatio: 0
        };
      }
      allDates[date].total++;
      if (company.status === 'sent') allDates[date].sent++;
      if (company.status === 'pending') allDates[date].pending++;
      if (company.status === 'failed') allDates[date].failed++;
    });
    
    // Calculate success ratios and sort by date
    return Object.values(allDates)
      .map(dateData => ({
        ...dateData,
        successRatio: dateData.total > 0 ? Math.round((dateData.sent / dateData.total) * 100) : 0
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const processAllDatesData = (companies) => {
    return getAllDatesData();
  };

  // Date filtering functions
  const filterDataByPeriod = (period) => {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'yesterday':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        return allDatesData.filter(data => {
          const dataDate = new Date(data.date);
          return dataDate >= startDate && dataDate <= endDate;
        });
        
      case '7days':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        return allDatesData.filter(data => {
          const dataDate = new Date(data.date);
          return dataDate >= startDate;
        });
        
      case '1month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        return allDatesData.filter(data => {
          const dataDate = new Date(data.date);
          return dataDate >= startDate;
        });
        
      case '1year':
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        return allDatesData.filter(data => {
          const dataDate = new Date(data.date);
          return dataDate >= startDate;
        });
        
      case 'all':
      default:
        return allDatesData;
    }
  };

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    const filtered = filterDataByPeriod(period);
    setFilteredDatesData(filtered);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('Analytics Report', 14, 20);
    
    // Add generation date and period
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Period: ${selectedPeriod === 'all' ? 'All Time' : selectedPeriod}`, 14, 37);
    
    // Add overall stats
    doc.setFontSize(14);
    doc.text('Overall Statistics', 14, 50);
    doc.setFontSize(10);
    doc.text(`Total Companies: ${stats.total}`, 14, 58);
    doc.text(`Messages Sent: ${stats.sent}`, 14, 65);
    doc.text(`Pending: ${stats.pending}`, 14, 72);
    doc.text(`Failed: ${stats.failed}`, 14, 79);
    doc.text(`Success Rate: ${stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0}%`, 14, 86);
    
    // Add filtered dates table
    doc.setFontSize(14);
    doc.text('Filtered Daily Data', 14, 100);
    
    // Simple table without autoTable plugin
    let yPosition = 110;
    
    // Table headers
    doc.setFontSize(8);
    doc.text('Date', 14, yPosition);
    doc.text('Total', 50, yPosition);
    doc.text('Sent', 80, yPosition);
    doc.text('Pending', 110, yPosition);
    doc.text('Failed', 140, yPosition);
    doc.text('Success %', 170, yPosition);
    
    yPosition += 5;
    
    // Table data
    filteredDatesData.forEach(date => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.text(date.date, 14, yPosition);
      doc.text(date.total.toString(), 50, yPosition);
      doc.text(date.sent.toString(), 80, yPosition);
      doc.text(date.pending.toString(), 110, yPosition);
      doc.text(date.failed.toString(), 140, yPosition);
      doc.text(`${date.successRatio}%`, 170, yPosition);
      
      yPosition += 7;
    });
    
    // Save the PDF
    doc.save(`analytics-report-${selectedPeriod}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const communicationStats = getCommunicationTypeStats();
  const dailyStats = filteredDatesData.slice(0, 7); // Show last 7 days from filtered data

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Detailed insights into your outreach performance.</p>
        </div>
        <button
          onClick={downloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>

      {/* Period Filter */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Filter by period:</span>
          <div className="flex gap-2">
            <button
              onClick={() => handlePeriodChange('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedPeriod === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handlePeriodChange('yesterday')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedPeriod === 'yesterday' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => handlePeriodChange('7days')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedPeriod === '7days' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handlePeriodChange('1month')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedPeriod === '1month' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => handlePeriodChange('1year')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedPeriod === '1year' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Last Year
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Showing {filteredDatesData.length} days of data
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Companies</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Messages Sent</p>
              <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Success Rate</h2>
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">
                  Success Rate
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold inline-block text-green-600">
                  {stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-200">
              <div style={{ width: `${stats.total > 0 ? (stats.sent / stats.total) * 100 : 0}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Communication Types</h2>
          <div className="space-y-3">
            {Object.entries(communicationStats).map(([type, data]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    type === 'all' ? 'bg-blue-500' : 
                    type === 'email' ? 'bg-green-500' : 
                    type === 'whatsapp' ? 'bg-green-400' : 'bg-purple-500'
                  }`}></div>
                  <span className="text-sm font-medium text-gray-700 capitalize">{type}</span>
                </div>
                <div className="text-sm text-gray-600">
                  {data.sent}/{data.total} sent
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Daily Activity (Last 7 Days)</h2>
        <div className="space-y-3">
          {dailyStats.map((data) => (
            <div key={data.date} className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{data.date}</span>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-600">{data.sent} sent</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600">{data.failed} failed</span>
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {data.total} total
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comprehensive Dates Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            {selectedPeriod === 'all' ? 'All Upload Dates' : `${selectedPeriod === 'yesterday' ? 'Yesterday' : selectedPeriod === '7days' ? 'Last 7 Days' : selectedPeriod === '1month' ? 'Last Month' : 'Last Year'} Data`} with Success Ratios
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>{filteredDatesData.length} days of data</span>
          </div>
        </div>
        {filteredDatesData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No data available for the selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Total Uploads</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Sent</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Pending</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Failed</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Success Ratio</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-700">Performance</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatesData.map((data, index) => (
                  <tr key={data.date} className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                    <td className="py-3 px-4 font-medium text-gray-900">{data.date}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{data.total}</td>
                    <td className="py-3 px-4 text-center text-green-600 font-medium">{data.sent}</td>
                    <td className="py-3 px-4 text-center text-yellow-600 font-medium">{data.pending}</td>
                    <td className="py-3 px-4 text-center text-red-600 font-medium">{data.failed}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-medium ${
                          data.successRatio >= 80 ? 'text-green-600' : 
                          data.successRatio >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {data.successRatio}%
                        </span>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              data.successRatio >= 80 ? 'bg-green-500' : 
                              data.successRatio >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${data.successRatio}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {data.successRatio >= 80 ? (
                        <span className="flex items-center justify-center gap-1 text-green-600">
                          <TrendingUp className="w-4 h-4" />
                          Excellent
                        </span>
                      ) : data.successRatio >= 60 ? (
                        <span className="flex items-center justify-center gap-1 text-yellow-600">
                          <TrendingUp className="w-4 h-4" />
                          Good
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-red-600">
                          <TrendingUp className="w-4 h-4 rotate-180" />
                          Needs Improvement
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
