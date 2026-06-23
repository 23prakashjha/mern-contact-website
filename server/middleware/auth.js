const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Check if user is active
    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account has been deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  try {
    // First authenticate the user
    await authenticate(req, res, () => {});
    
    if (req.user.role !== 'admin') {
      // Log access attempt
      await logActivity(req.user._id, 'ACCESS_DENIED', {
        attemptedPath: req.path,
        method: req.method,
        userRole: req.user.role
      }, req);
      
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Permission-based middleware
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      // First authenticate the user
      await authenticate(req, res, () => {});
      
      // Admins have all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      // Check specific permission for regular users
      if (req.user.permissions && req.user.permissions[permission] === true) {
        return next();
      }

      // Log access attempt
      await logActivity(req.user._id, 'ACCESS_DENIED', {
        attemptedPath: req.path,
        method: req.method,
        requiredPermission: permission,
        userRole: req.user.role
      }, req);

      res.status(403).json({ message: `Permission '${permission}' required` });
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(401).json({ message: 'Authentication failed' });
    }
  };
};

// Role-based middleware
const requireRole = (role) => {
  return async (req, res, next) => {
    try {
      // First authenticate the user
      await authenticate(req, res, () => {});
      
      if (req.user.role !== role) {
        // Log access attempt
        await logActivity(req.user._id, 'ACCESS_DENIED', {
          attemptedPath: req.path,
          method: req.method,
          requiredRole: role,
          userRole: req.user.role
        }, req);

        res.status(403).json({ message: `${role} role required` });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(401).json({ message: 'Authentication failed' });
    }
  };
};

// Activity logging function
const logActivity = async (userId, action, details, req = null) => {
  try {
    const logData = {
      adminId: userId,
      action,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent'),
      timestamp: new Date()
    };

    // Set severity based on action type
    const severityMap = {
      'DELETE_USER': 'critical',
      'RESET_PASSWORD': 'high',
      'USER_SUSPENDED': 'high',
      'PERMISSION_CHANGED': 'medium',
      'CREATE_USER': 'low',
      'UPDATE_USER': 'low',
      'LOGIN': 'low',
      'LOGOUT': 'low',
      'ACCESS_DENIED': 'medium'
    };
    
    logData.severity = severityMap[action] || 'medium';

    await ActivityLog.create(logData);
    console.log(`Activity logged: ${userId} performed ${action}`);
  } catch (error) {
    console.error('Activity logging error:', error);
  }
};

// Login activity logger
const logLogin = async (user, req, success = true) => {
  try {
    const action = success ? 'LOGIN' : 'LOGIN_FAILED';
    await logActivity(user._id, action, {
      email: user.email,
      success,
      timestamp: new Date()
    }, req);
  } catch (error) {
    console.error('Login logging error:', error);
  }
};

// Logout activity logger
const logLogout = async (user, req) => {
  try {
    await logActivity(user._id, 'LOGOUT', {
      email: user.email,
      timestamp: new Date()
    }, req);
  } catch (error) {
    console.error('Logout logging error:', error);
  }
};

// Rate limiting middleware (optional)
const createRateLimit = (windowMs, max, message) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (requests.has(key)) {
      requests.set(key, requests.get(key).filter(timestamp => timestamp > windowStart));
    }

    // Check limit
    const userRequests = requests.get(key) || [];
    if (userRequests.length >= max) {
      return res.status(429).json({ 
        message: message || 'Too many requests, please try again later' 
      });
    }

    // Add current request
    userRequests.push(now);
    requests.set(key, userRequests);

    next();
  };
};

// API rate limiter
const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many API requests, please try again later'
);

// Auth rate limiter (for login attempts)
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per window
  'Too many login attempts, please try again later'
);

module.exports = {
  authenticate,
  requireAdmin,
  requirePermission,
  requireRole,
  logActivity,
  logLogin,
  logLogout,
  apiRateLimit,
  authRateLimit
};
