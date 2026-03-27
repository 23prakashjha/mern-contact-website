import React from 'react';

const Stats = ({ stats = {} }) => {
  // Default stats object to prevent undefined errors
  const defaultStats = {
    total: 0,
    sent: 0,
    pending: 0,
    failed: 0
  };
  
  const safeStats = { ...defaultStats, ...stats };
  
  const statCards = [
    {
      title: 'Total Companies',
      value: safeStats.total,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'from-blue-50 to-blue-100',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
    },
    {
      title: 'Messages Sent',
      value: safeStats.sent,
      color: 'from-green-500 to-green-600',
      bgColor: 'from-green-50 to-green-100',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    {
      title: 'Pending',
      value: safeStats.pending,
      color: 'from-yellow-500 to-yellow-600',
      bgColor: 'from-yellow-50 to-yellow-100',
      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
    },
    {
      title: 'Failed',
      value: safeStats.failed,
      color: 'from-red-500 to-red-600',
      bgColor: 'from-red-50 to-red-100',
      icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    }
  ];

  const successRate = safeStats.total > 0 ? Math.round((safeStats.sent / safeStats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <div
            key={index}
            className="group relative overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105"
          >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${card.bgColor} opacity-50`}></div>
            
            {/* Content */}
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 bg-gradient-to-r ${card.color} rounded-xl shadow-lg transform group-hover:scale-110 transition-transform duration-300`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                  </svg>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">{card.value}</div>
                  <div className="text-sm text-gray-600">{card.title}</div>
                </div>
              </div>
              
              {/* Mini Progress Bar */}
              <div className="w-full bg-white bg-opacity-60 rounded-full h-1">
                <div 
                  className={`h-1 rounded-full bg-gradient-to-r ${card.color} transition-all duration-500`}
                  style={{ width: `${safeStats.total > 0 ? (card.value / safeStats.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* Hover Effect */}
            <div className={`absolute inset-0 bg-gradient-to-r ${card.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
          </div>
        ))}
      </div>

      {/* Success Rate Card */}
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-6 lg:space-y-0">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-gray-800">Overall Performance</h3>
            <p className="text-gray-600">Campaign success rate and key metrics</p>
          </div>
          
          <div className="flex items-center space-x-8">
            <div className="text-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-green-600 to-green-700 bg-clip-text text-transparent">
                {successRate}%
              </div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
            
            <div className="hidden lg:block w-32">
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-8 border-gray-200"></div>
                <div 
                  className="absolute top-0 left-0 w-32 h-32 rounded-full border-8 border-transparent border-t-green-500 border-r-green-500 transform -rotate-45 transition-all duration-500"
                  style={{ 
                    borderTopColor: 'rgb(34, 197, 94)',
                    borderRightColor: 'rgb(34, 197, 94)',
                    transform: `rotate(-45deg) rotate(${(successRate / 100) * 360}deg)`
                  }}
                ></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                  <div className="text-lg font-bold text-gray-800">{safeStats.sent}</div>
                  <div className="text-xs text-gray-600">sent</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Progress Bars */}
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Messages Sent</span>
            <span className="text-sm text-gray-500">{safeStats.sent} of {safeStats.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500 shadow-lg"
              style={{ width: `${safeStats.total > 0 ? (safeStats.sent / safeStats.total) * 100 : 0}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Pending</span>
            <span className="text-sm text-gray-500">{safeStats.pending} of {safeStats.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 h-3 rounded-full transition-all duration-500 shadow-lg"
              style={{ width: `${safeStats.total > 0 ? (safeStats.pending / safeStats.total) * 100 : 0}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Failed</span>
            <span className="text-sm text-gray-500">{safeStats.failed} of {safeStats.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-red-500 to-red-600 h-3 rounded-full transition-all duration-500 shadow-lg"
              style={{ width: `${safeStats.total > 0 ? (safeStats.failed / safeStats.total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stats;
