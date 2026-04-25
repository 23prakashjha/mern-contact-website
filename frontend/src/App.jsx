import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import IndividualMessage from './pages/IndividualMessage';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ExcelScraper from './pages/ExcelScraper';
import GoogleMapsScraper from './pages/GoogleMapsScraper';
import Categories from './pages/Categories';
import CompanyList from './pages/CompanyList';
import JustdialScraper from './pages/JustdialScraper';

function AppContent() {
  const [isNavigating, setIsNavigating] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <Layout isNavigating={isNavigating}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/individual" element={<IndividualMessage />} />
        <Route path="/history" element={<History />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/excel-scraper" element={<ExcelScraper />} />
        <Route path="/google-maps-scraper" element={<GoogleMapsScraper />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/company-list" element={<CompanyList />} />
        <Route path="/justdial-scraper" element={<JustdialScraper />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
