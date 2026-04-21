import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import IndividualMessage from './pages/IndividualMessage';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ExcelScraper from './pages/ExcelScraper';
import GoogleMapsScraper from './pages/GoogleMapsScraper';
import JustdialScraper from './pages/JustdialScraper';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/individual" element={<IndividualMessage />} />
          <Route path="/history" element={<History />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/excel-scraper" element={<ExcelScraper />} />
          <Route path="/google-maps-scraper" element={<GoogleMapsScraper />} />
          <Route path="/justdial-scraper" element={<JustdialScraper />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
