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

const isDatabaseReady = () => mongoose.connection.readyState === 1;

// Register/Signup route
router.post('/signup', async (req, res) => {
  try {
    if (!isDatabaseReady()) {
      return res.status(503).json({
        message: 'Database is not connected. Please check MONGODB_URI on the server.'
      });
    }

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
    res.status(401).json({ 
      message: 'Invalid token' 
    });
  }
});

module.exports = router;
