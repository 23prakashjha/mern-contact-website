import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const LOCAL_API_ORIGIN = 'http://localhost:5000';

const apiPath = (path) => {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const normalizeApiUrl = (url) => {
  if (import.meta.env.DEV || typeof url !== 'string' || !url.startsWith(LOCAL_API_ORIGIN)) {
    return url;
  }

  const nextUrl = new URL(url);
  return apiPath(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
};

// Set global default baseURL for all axios calls
axios.defaults.baseURL = API_BASE_URL;

axios.interceptors.request.use((config) => {
  if (config.url) {
    config.url = normalizeApiUrl(config.url);
  }
  return config;
});

if (!import.meta.env.DEV && typeof window !== 'undefined' && !window.__apiFetchPatched) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      return originalFetch(normalizeApiUrl(input), init);
    }

    if (input instanceof Request) {
      const normalizedUrl = normalizeApiUrl(input.url);
      if (normalizedUrl !== input.url) {
        return originalFetch(new Request(normalizedUrl, input), init);
      }
    }

    return originalFetch(input, init);
  };

  window.__apiFetchPatched = true;
}

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // Handle common error scenarios
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('token');
          window.location.href = '/login';
          break;
        case 403:
          console.error('Access forbidden:', data.message);
          break;
        case 404:
          console.error('Resource not found:', data.message);
          break;
        case 500:
          console.error('Server error:', data.message);
          break;
        default:
          console.error('API error:', data.message || 'Unknown error occurred');
      }
    } else if (error.request) {
      // Network error
      console.error('Network error - unable to reach server');
    } else {
      // Other error
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Debounce utility function
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export { API_BASE_URL, api, apiPath, debounce };
