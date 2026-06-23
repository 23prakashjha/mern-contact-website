import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, Shield, Sparkles, ArrowRight, Crown, CheckCircle, Building } from 'lucide-react';

const Signup = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    companyName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [isMounted, setIsMounted] = useState(false);
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    
    // Clear errors when user types
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ''
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    // Validate company name for admin accounts
    if (formData.role === 'admin' && !formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required for admin accounts';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    const result = await signup(
      formData.username,
      formData.email,
      formData.password,
      formData.role,
      formData.companyName
    );
    
    if (result.success) {
      navigate('/dashboard');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 py-12 px-4 sm:px-6 lg:px-8">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-4000"></div>
      </div>
      
      {/* Floating particles */}
      <div className="absolute inset-0">
        {[...Array(25)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          >
            <div className="w-1 h-1 bg-white rounded-full opacity-50"></div>
          </div>
        ))}
      </div>

      <div className={`max-w-md w-full space-y-8 relative z-10 transition-all duration-1000 ${isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg transform transition-transform duration-300 hover:scale-110">
            <Crown className="h-8 w-8 text-white" />
          </div>
          <div className="mt-6">
            <h2 className="text-center text-4xl font-bold text-white mb-2">
              Join Us Today
            </h2>
            <p className="text-center text-lg text-emerald-200">
              Create your account and get started
            </p>
          </div>
          <p className="mt-4 text-center text-sm text-emerald-300">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-white hover:text-emerald-200 transition-colors duration-200 inline-flex items-center gap-1"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="relative group">
              <label htmlFor="username" className="block text-sm font-medium text-emerald-200 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className={`block w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border ${errors.username ? 'border-red-400/50' : 'border-emerald-400/30'} text-white placeholder-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15`}
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={handleChange}
                />
              </div>
              {errors.username && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.username}
                </p>
              )}
            </div>

            <div className="relative group">
              <label htmlFor="email" className="block text-sm font-medium text-emerald-200 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`block w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border ${errors.email ? 'border-red-400/50' : 'border-emerald-400/30'} text-white placeholder-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.email}
                </p>
              )}
            </div>

            <div className="relative group">
              <label htmlFor="role" className="block text-sm font-medium text-emerald-200 mb-2">
                Account Type
              </label>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                <select
                  id="role"
                  name="role"
                  className="block w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border border-emerald-400/30 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15 appearance-none cursor-pointer"
                  value={formData.role}
                  onChange={handleChange}
                >
                  <option value="user" className="bg-emerald-900">User - Basic Access</option>
                  <option value="admin" className="bg-emerald-900">Admin - Full Access</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-xs text-emerald-300">
                <span className="font-medium">User:</span> Dashboard, Excel Scraper, Upload, History
                <br />
                <span className="font-medium">Admin:</span> Full access to all features
              </p>
            </div>

            {/* Company Name Field - Only shown for admin accounts */}
            {formData.role === 'admin' && (
              <div className="relative group">
                <label htmlFor="companyName" className="block text-sm font-medium text-emerald-200 mb-2">
                  Company Name
                </label>
                <div className="relative">
                  <Building className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                  <input
                    id="companyName"
                    name="companyName"
                    type="text"
                    required={formData.role === 'admin'}
                    className={`block w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border ${errors.companyName ? 'border-red-400/50' : 'border-emerald-400/30'} text-white placeholder-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15`}
                    placeholder="Enter your company name"
                    value={formData.companyName}
                    onChange={handleChange}
                  />
                </div>
                {errors.companyName && (
                  <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errors.companyName}
                  </p>
                )}
              </div>
            )}

            <div className="relative group">
              <label htmlFor="password" className="block text-sm font-medium text-emerald-200 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className={`block w-full pl-12 pr-12 py-3 bg-white/10 backdrop-blur-md border ${errors.password ? 'border-red-400/50' : 'border-emerald-400/30'} text-white placeholder-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15`}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-emerald-400 hover:text-emerald-300 transition-colors" />
                  ) : (
                    <Eye className="h-5 w-5 text-emerald-400 hover:text-emerald-300 transition-colors" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.password}
                </p>
              )}
              {formData.password && !errors.password && (
                <p className="mt-1 text-sm text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Password strength: {formData.password.length >= 8 ? 'Strong' : 'Good'}
                </p>
              )}
            </div>

            <div className="relative group">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-emerald-200 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-emerald-400 group-focus-within:text-emerald-300 transition-colors" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className={`block w-full pl-12 pr-12 py-3 bg-white/10 backdrop-blur-md border ${errors.confirmPassword ? 'border-red-400/50' : 'border-emerald-400/30'} text-white placeholder-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 group-hover:bg-white/15`}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5 text-emerald-400 hover:text-emerald-300 transition-colors" />
                  ) : (
                    <Eye className="h-5 w-5 text-emerald-400 hover:text-emerald-300 transition-colors" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.confirmPassword}
                </p>
              )}
              {formData.confirmPassword && !errors.confirmPassword && formData.password === formData.confirmPassword && (
                <p className="mt-1 text-sm text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Passwords match
                </p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating account...
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  Create Account
                  <Sparkles className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Signup;
