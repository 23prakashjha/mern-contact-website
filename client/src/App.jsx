import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import IndividualMessage from './pages/IndividualMessage';
import History from './pages/History';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ExcelScraper from './pages/ExcelScraper';
import GoogleMapsScraper from './pages/GoogleMapsScraper';
import JustdialScraper from './pages/JustdialScraper';
import Categories from './pages/Categories';
import CompanyList from './pages/CompanyList';
import AdminDashboard from './pages/AdminDashboard';

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
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        
        {/* User accessible pages (both user and admin can access) */}
        <Route path="/" element={
          <ProtectedRoute pageName="dashboard">
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute pageName="dashboard">
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/excel-scraper" element={
          <ProtectedRoute pageName="excel-scraper">
            <ExcelScraper />
          </ProtectedRoute>
        } />
        <Route path="/upload" element={
          <ProtectedRoute pageName="upload">
            <Upload />
          </ProtectedRoute>
        } />
        <Route path="/history" element={
          <ProtectedRoute pageName="history">
            <History />
          </ProtectedRoute>
        } />
        <Route path="/google-maps-scraper" element={
          <ProtectedRoute pageName="google-maps-scraper">
            <GoogleMapsScraper />
          </ProtectedRoute>
        } />
        <Route path="/justdial-scraper" element={
          <ProtectedRoute pageName="justdial-scraper">
            <JustdialScraper />
          </ProtectedRoute>
        } />
        
        {/* Admin only pages */}
        <Route path="/admin-dashboard" element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/individual" element={
          <ProtectedRoute requiredRole="admin">
            <IndividualMessage />
          </ProtectedRoute>
        } />
        <Route path="/analytics" element={
          <ProtectedRoute requiredRole="admin">
            <Analytics />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute requiredRole="admin">
            <Settings />
          </ProtectedRoute>
        } />
        <Route path="/categories" element={
          <ProtectedRoute requiredRole="admin">
            <Categories />
          </ProtectedRoute>
        } />
        <Route path="/company-list" element={
          <ProtectedRoute requiredRole="admin">
            <CompanyList />
          </ProtectedRoute>
        } />
        
        {/* Redirect any unknown routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
