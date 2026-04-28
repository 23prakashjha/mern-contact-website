import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

const Layout = ({ children, isNavigating }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Debug log for sidebar state changes
  React.useEffect(() => {
    console.log('Sidebar state changed:', isSidebarOpen);
  }, [isSidebarOpen]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Debug indicator - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-0 right-0 bg-red-500 text-white px-2 py-1 text-xs z-50 lg:hidden">
          Sidebar: {isSidebarOpen ? 'OPEN' : 'CLOSED'}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="ml-2 bg-blue-500 text-white px-2 py-1 rounded text-xs"
          >
            Toggle
          </button>
        </div>
      )}
      
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* Mobile menu button */}
      <button
        onClick={() => {
          console.log('Hamburger clicked, setting sidebar to open');
          setIsSidebarOpen(true);
        }}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        style={{ zIndex: 60 }}
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <div className={`
        fixed top-0 left-0 lg:sticky lg:top-0 h-screen
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      style={{ zIndex: 50 }}
      >
        <Sidebar closeSidebar={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 min-h-screen relative">
        {/* Navigation Loading Overlay */}
        {isNavigating && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 font-medium">Loading...</p>
            </div>
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
