const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { authRateLimit, logLogin } = require('../middleware/auth');
const router = express.Router();

// Debug logging for auth routes
router.use((req, res, next) => {
    console.log(`[AUTH DEBUG] ${req.method} ${req.originalUrl} - Headers:`, JSON.stringify({
        'content-type': req.headers['content-type'],
        'authorization': req.headers['authorization'] ? 'Bearer ***' : 'none',
        'origin': req.headers['origin'],
        'host': req.headers['host']
    }));
    next();
});

// JWT Secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      username: user.username, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const waitForDatabase = (timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const state = mongoose.connection.readyState;
    if (state === 1) return resolve();
    if (state === 2) {
      const timer = setTimeout(() => {
        mongoose.connection.removeListener('open', onOpen);
        reject(new Error('Database connection timed out'));
      }, timeoutMs);
      const onOpen = () => {
        clearTimeout(timer);
        resolve();
      };
      mongoose.connection.once('open', onOpen);
      return;
    }
    // State 0 or 3 - try to reconnect
    const mongoUri = process.env.MONGODB_URI;
    const timer = setTimeout(() => {
      reject(new Error(
        'Database is disconnected' +
        (mongoUri ? '' : '. MONGODB_URI not set in Render dashboard Environment Variables (the .env file is gitignored)')
      ));
    }, timeoutMs);
    const onOpen = () => {
      clearTimeout(timer);
      resolve();
    };
    mongoose.connection.once('open', onOpen);
    mongoose.connect(mongoUri || 'mongodb://localhost:27017/bulk-outreach', {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000
    }).catch(() => {});
  });
};

// Register/Signup route
router.post('/signup', async (req, res) => {
  try {
    await waitForDatabase();

    const { username, email, password, role, companyName } = req.body;
    const normalizedRole = role === 'admin' ? 'admin' : 'user';

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Username, email, and password are required' 
      });
    }

    // If role is admin, company name is required
    if (normalizedRole === 'admin' && !companyName) {
      return res.status(400).json({ 
        message: 'Company name is required for admin accounts' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or username already exists' 
      });
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      role: normalizedRole,
      companyName: normalizedRole === 'admin' ? companyName : undefined
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyName: user.companyName
      }
    });
  } catch (error) {
    console.error('Signup error:', error);

    if (error.message && error.message.includes('Database')) {
      const envHint = process.env.MONGODB_URI
        ? 'Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for testing)'
        : 'MONGODB_URI not set. Add it in Render Dashboard → Environment → MONGODB_URI (the .env file is gitignored)';
      return res.status(503).json({
        message: 'Signup unavailable - ' + error.message + '. ' + envHint
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        message: 'User with this email or username already exists'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: Object.values(error.errors).map((err) => err.message).join(', ')
      });
    }

    res.status(500).json({ 
      message: 'Server error during signup' 
    });
  }
});

// Login route
router.post('/login', authRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email and password are required' 
      });
    }

    await waitForDatabase();

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      await logLogin({ _id: 'unknown', email }, req, false);
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Check if user is active
    if (user.isActive === false) {
      await logLogin(user, req, false);
      return res.status(403).json({ 
        message: 'Account has been deactivated' 
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logLogin(user, req, false);
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Log successful login
    await logLogin(user, req, true);

    // Generate token
    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyName: user.companyName
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    if (error.message && error.message.includes('Database')) {
      const envHint = process.env.MONGODB_URI
        ? 'Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for testing)'
        : 'MONGODB_URI not set. Add it in Render Dashboard → Environment → MONGODB_URI (the .env file is gitignored)';
      return res.status(503).json({
        message: 'Login unavailable - ' + error.message + '. ' + envHint
      });
    }

    res.status(500).json({ 
      message: 'Server error during login' 
    });
  }
});

// Verify token route (for frontend to check if token is valid)
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        message: 'No token provided' 
      });
    }

    await waitForDatabase();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token' 
      });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyName: user.companyName
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);

    if (error.message && error.message.includes('Database')) {
      const envHint = process.env.MONGODB_URI
        ? 'Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for testing)'
        : 'MONGODB_URI not set. Add it in Render Dashboard → Environment → MONGODB_URI (the .env file is gitignored)';
      return res.status(503).json({
        message: 'Verification unavailable - ' + error.message + '. ' + envHint
      });
    }

    res.status(401).json({ 
      message: 'Invalid token' 
    });
  }
});

module.exports = router;
