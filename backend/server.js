const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const puppeteer = require('puppeteer');
require('dotenv').config();

// Excel Scraper imports
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

// Import services
const EmailService = require('./services/emailService');
const WhatsAppService = require('./services/whatsappService');
const SMSService = require('./services/smsService');

// Enhanced Proxy Rotator with better anti-detection
class ProxyRotator {
  constructor() {
    this.userAgents = [
      // Latest Chrome user agents
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      // Firefox user agents
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      // Edge user agents
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      // Safari user agents
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    this.acceptLanguages = [
      'en-US,en;q=0.9,en-GB;q=0.8,en;q=0.7',
      'en-GB,en-US;q=0.9,en;q=0.8',
      'en-US,en;q=0.8',
      'en-GB,en;q=0.9'
    ];
    
    this.platforms = ['Win32', 'Win64', 'MacIntel', 'Linux x86_64'];
  }
  
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }
  
  getRandomViewport() {
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 1600, height: 900 },
      { width: 1280, height: 800 }
    ];
    return viewports[Math.floor(Math.random() * viewports.length)];
  }
  
  getRandomAcceptLanguage() {
    return this.acceptLanguages[Math.floor(Math.random() * this.acceptLanguages.length)];
  }
  
  getRandomPlatform() {
    return this.platforms[Math.floor(Math.random() * this.platforms.length)];
  }
  
  getRandomScreenSize() {
    const screens = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1600, height: 900 },
      { width: 1280, height: 720 }
    ];
    return screens[Math.floor(Math.random() * screens.length)];
  }
}

const proxyRotator = new ProxyRotator();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
    credentials: true
}));

// Rate limiting for Excel Scraper endpoints (more lenient for development)
const excelScraperLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Increased from 80 to 200 requests per windowMs for development
    message: { error: 'Too many Excel Scraper requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
});
app.use('/api/excel-scraper/', excelScraperLimiter);

// Rate limiting for general API endpoints (more lenient for frontend operations)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 200 to 500 requests per windowMs for development
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// More lenient rate limiting for companies endpoint (frequently accessed by frontend)
const companiesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased from 1000 to 2000 for development
  message: { error: 'Too many requests to companies API, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

app.use('/api/', generalApiLimiter);

// Add more lenient rate limiting for expensive operations (development)
const expensiveOperationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 30 to 100 for development
  message: { error: 'Too many expensive operations, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

// Apply expensive operations limiter to specific endpoints
app.use('/api/upload', expensiveOperationsLimiter);

// Add request delay middleware only for scraping endpoints
app.use('/api/scrape', (req, res, next) => {
  // Add random delay to prevent rate limiting
  const delay = Math.random() * 2000 + 1000; // 1-3 seconds random delay
  setTimeout(next, delay);
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bulk-outreach')
    .catch(err => {
        console.log('MongoDB connection error. Running without database...');
        console.log('Please ensure MongoDB is running for full functionality.');
    });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Company Schema
const companySchema = new mongoose.Schema({
    company: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: false },
    website: { type: String },
    address: { type: String },
    category: { type: String },
    city: { type: String },
    message: { type: String },
    status: { 
        type: String, 
        enum: ['pending', 'sent', 'failed'], 
        default: 'pending' 
    },
    communicationType: {
        type: String,
        enum: ['whatsapp', 'email', 'sms', 'all'],
        default: 'all'
    },
    errorMessage: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Company = mongoose.model('Company', companySchema);

// Excel Scraper Upload History Schema
const uploadHistorySchema = new mongoose.Schema({
    originalFilename: String,
    processedFilename: String,
    uploadDate: { type: Date, default: Date.now },
    totalRows: Number,
    processedRows: Number,
    status: String,
    processingTime: Number
});

const UploadHistory = mongoose.model('UploadHistory', uploadHistorySchema);

// Regular File Upload History Schema
const fileUploadHistorySchema = new mongoose.Schema({
    originalFilename: { type: String, required: true },
    filename: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    size: Number,
    mimetype: String,
    recordCount: Number,
    status: { type: String, enum: ['completed', 'processing', 'failed'], default: 'completed' },
    categories: [String],
    errorMessage: String
});

const FileUploadHistory = mongoose.model('FileUploadHistory', fileUploadHistorySchema);


// Google Maps Scraper History Schema
const googleMapsHistorySchema = new mongoose.Schema({
    url: String,
    businessCount: Number,
    scrapeDate: { type: Date, default: Date.now },
    data: [{
        name: String,
        address: String,
        phone: String,
        website: String,
        rating: String,
        category: String
    }]
});

const GoogleMapsHistory = mongoose.model('GoogleMapsHistory', googleMapsHistorySchema);


// Excel Scraper utilities
// Enhanced email regex for better extraction
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4,6}\b|\b\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{4,8}\b|\b\d{8,}\b|(?:\b\d{3}\b[-.\s]?)(?:\b\d{6}\b)|(?:\b\d{3}\b[-.\s]?)(?:\b\d{3}\b[-.\s]?)(?:\b\d{4}\b)/g;

// Additional email patterns for better extraction
const additionalEmailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
];

// Enhanced phone extraction function
const extractPhoneNumbers = (text) => {
    let phones = text.match(phoneRegex) || [];
    
    // Handle concatenated phone-email patterns like "0124-4326628thedentalhomeggn@gmail.com"
    if (phones.length === 0) {
        // Pattern 1: phone number followed immediately by email
        const concatenatedPattern = /(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4})([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const concatMatches = [...text.matchAll(concatenatedPattern)];
        
        concatMatches.forEach(match => {
            phones.push(match[1]); // Extract just the phone part
        });
        
        // Pattern 2: Find phone numbers at the start of strings that are followed by emails
        const phoneAtStartPattern = /^(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4})[a-zA-Z]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneAtStartMatches = [...text.matchAll(phoneAtStartPattern)];
        
        phoneAtStartMatches.forEach(match => {
            phones.push(match[1]);
        });
        
        // Pattern 3: Extract phone numbers from mixed patterns like "122002enquiriesthedentalhomeggn@gmail.comcall"
        // This finds phone numbers that are followed by letters and then an email
        const mixedPattern = /^(\d{6,})[a-zA-Z]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const mixedMatches = [...text.matchAll(mixedPattern)];
        
        mixedMatches.forEach(match => {
            const phonePart = match[1];
            // Try to format the phone number if it's 6+ digits
            if (phonePart.length >= 6 && phonePart.length <= 15) {
                phones.push(phonePart);
            }
        });
        
        // Pattern: phone number with separators and then email
        const splitPattern = /\b(\d{2,4})\b[\s·.-]+\b(\d{5,8})\b/g;
        const matches = [...text.matchAll(splitPattern)];
        
        matches.forEach(match => {
            const combined = match[1] + match[2];
            if (combined.length >= 8 && combined.length <= 15) {
                phones.push(combined);
            }
        });
        
        const threePartPattern = /\b(\d{2,4})\b[\s·.-]+\b(\d{2,4})\b[\s·.-]+\b(\d{4,8})\b/g;
        const threePartMatches = [...text.matchAll(threePartPattern)];
        
        threePartMatches.forEach(match => {
            const combined = match[1] + match[2] + match[3];
            if (combined.length >= 8 && combined.length <= 15) {
                phones.push(combined);
            }
        });
    }
    
    const uniquePhones = [...new Set(phones)]
        .map(phone => phone.trim())
        .filter(phone => {
            const cleaned = phone.replace(/[^0-9+]/g, '');
            
            if (cleaned.match(/^(19|20)\d{2}$/)) return false;
            if (cleaned.match(/^\d{4}$/)) return false;
            if (cleaned.match(/^(123|000|111|222|333|444|555|666|777|888|999)/)) return false;
            
            if (cleaned.length < 7 || cleaned.length > 15) return false;
            
            const digitsOnly = cleaned.replace(/\D/g, '');
            if (digitsOnly.length < 7) return false;
            
            return true;
        });
    
    return uniquePhones.slice(0, 5);
};

// Enhanced email extraction function for complex formats
const extractEmails = (text) => {
    if (!text || typeof text !== 'string') return [];
    
    const emails = [];
    
    // Strategy: Find all @ symbols and carefully extract clean emails
    const atPositions = [];
    let pos = text.indexOf('@');
    while (pos !== -1) {
        atPositions.push(pos);
        pos = text.indexOf('@', pos + 1);
    }
    
    atPositions.forEach(atPos => {
        // Extract username by going backwards from @
        let username = '';
        let i = atPos - 1;
        while (i >= 0 && /[A-Za-z0-9._%+-]/.test(text[i])) {
            username = text[i] + username;
            i--;
        }
        
        // Extract domain by going forwards from @
        let domain = '';
        let j = atPos + 1;
        while (j < text.length && /[A-Za-z0-9.-]/.test(text[j])) {
            domain += text[j];
            j++;
        }
        
        const potentialEmail = username + '@' + domain;
        
        // Basic email format validation
        if (!potentialEmail.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/)) {
            return; // Skip invalid format
        }
        
        // Get the full context for analysis
        const emailStartIndex = atPos - username.length;
        const emailEndIndex = atPos + domain.length + 1;
        
        const fullContext = text;
        const beforeEmail = fullContext.substring(0, emailStartIndex);
        const afterEmail = fullContext.substring(emailEndIndex);
        
        // SPECIFIC FILTERS FOR USER'S PROBLEMATIC CASES:
        
        // 1. Filter out phone+email concatenations (like user's examples)
        if (beforeEmail.match(/\d{3,}[-.\s]?\d{3,}[-.\s]?\d{4,}\s*$/)) {
            return; // Skip: phone number before email
        }
        
        // 2. Filter out emails with HTML/action words attached
        const problematicSuffixes = ['hoursopen', 'copyright', 'homeabout', 'comshop', 'comc'];
        if (problematicSuffixes.some(suffix => potentialEmail.toLowerCase().endsWith(suffix))) {
            return; // Skip: has problematic suffix
        }
        
        // 3. Filter out emails with problematic prefixes
        const problematicPrefixes = ['aboutportfolioservicescontact'];
        if (problematicPrefixes.some(prefix => potentialEmail.toLowerCase().startsWith(prefix))) {
            return; // Skip: has problematic prefix
        }
        
        // 4. Check if email is surrounded by non-email characters (proper boundaries)
        const charBefore = emailStartIndex > 0 ? fullContext[emailStartIndex - 1] : '';
        const charAfter = emailEndIndex < fullContext.length ? fullContext[emailEndIndex] : '';
        
        const isProperlyBounded = (emailStartIndex === 0 || !/[A-Za-z0-9._%+-]/.test(charBefore)) &&
                                 (emailEndIndex === fullContext.length || !/[A-Za-z0-9.-]/.test(charAfter));
        
        if (!isProperlyBounded) {
            return; // Skip: not properly bounded
        }
        
        // 5. Additional context checks
        const contextBefore = fullContext.substring(Math.max(0, emailStartIndex - 20), emailStartIndex);
        const contextAfter = fullContext.substring(emailEndIndex, Math.min(fullContext.length, emailEndIndex + 20));
        
        // Check for action words immediately before/after
        const actionWords = ['phone', 'call', 'book', 'schedule', 'homeabout', 'info', 'enquiries', 
                           'about', 'com', 'shop', 'admin', 'hours', 'open', 'copyright', 
                           'portfolio', 'services', 'contact'];
        
        const hasActionWordBefore = actionWords.some(word => 
            contextBefore.toLowerCase().endsWith(word.toLowerCase())
        );
        const hasActionWordAfter = actionWords.some(word => 
            contextAfter.toLowerCase().startsWith(word.toLowerCase())
        );
        
        if (hasActionWordBefore || hasActionWordAfter) {
            return; // Skip: near action words
        }
        
        // If passed all checks, accept the email
        emails.push(potentialEmail);
    });
    
    // Handle UUID-style emails (sentry/wixpress style) - these are valid
    const uuidRegex = /\b[a-f0-9]{32}@(?:sentry(?:-next)?\.wixpress\.com|sentry\.io)\b/g;
    const uuidMatches = text.match(uuidRegex) || [];
    emails.push(...uuidMatches);
    
    // Remove duplicates and final validation
    const uniqueEmails = [...new Set(emails)]
        .map(email => email.toLowerCase().trim().replace(/^mailto:/, ''))
        .filter(email => {
            // Basic validation
            if (!email || typeof email !== 'string') return false;
            
            // Exclude common test/example domains
            if (email.includes('example.com') || 
                email.includes('test.com') || 
                email.includes('sample.com') ||
                email.includes('domain.com')) return false;
            
            // Exclude file extensions
            if (email.match(/\.(png|jpg|jpeg|gif|css|js)$/)) return false;
            
            // Must contain @ and . and be reasonable length
            if (!email.includes('@') || !email.includes('.') || email.length <= 5) return false;
            
            const parts = email.split('@');
            if (parts.length !== 2) return false;
            
            const [username, domain] = parts;
            if (!username || !domain || username.length === 0 || domain.length <= 3) return false;
            
            if (username.length > 50 || domain.length > 100) return false;
            
            // Domain validation
            if (!domain.includes('.')) return false;
            
            // Username shouldn't be pure numbers
            if (username.match(/^\d+$/)) return false;
            
            // Final check: ensure no phone number patterns
            if (email.match(/\d{3,}[-.\s]?\d{3,}[-.\s]?\d{4,}/)) return false;
            
            return true;
        })
        .slice(0, 5); // Limit to 5 emails per entry

    return uniqueEmails;
};

// Email validation function
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
};

// Email correction function
const correctEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    
    // First try to extract valid emails from the text
    const extractedEmails = extractEmails(email);
    if (extractedEmails.length > 0) {
        return extractedEmails[0]; // Return the first valid email found
    }
    
    let corrected = email.trim().toLowerCase();
    
    // Remove common separators and spaces
    corrected = corrected.replace(/[\s_\-]+/g, '');
    
    // Remove phone numbers and other non-email text
    corrected = corrected.replace(/\d{3,}[-\s]?\d{3,}[-\s]?\d{4,}/g, '');
    corrected = corrected.replace(/phone|call|book|schedule|homeabout|info|enquiries/g, '');
    
    // Remove extra @ symbols if multiple exist
    const atCount = (corrected.match(/@/g) || []).length;
    if (atCount > 1) {
        // Keep only the last @ symbol
        const parts = corrected.split('@');
        const localPart = parts.slice(0, -1).join('');
        const domain = parts[parts.length - 1];
        corrected = localPart + '@' + domain;
    }
    
    // Fix common domain mistakes
    const domainFixes = {
        'gmial.com': 'gmail.com',
        'gamil.com': 'gmail.com',
        'gmail.co': 'gmail.com',
        'yahoo.co': 'yahoo.com',
        'yahho.com': 'yahoo.com',
        'hotmial.com': 'hotmail.com',
        'outlok.com': 'outlook.com',
        'rediffmail.co': 'rediffmail.com'
    };
    
    Object.entries(domainFixes).forEach(([wrong, correct]) => {
        if (corrected.endsWith(wrong)) {
            corrected = corrected.replace(wrong, correct);
        }
    });
    
    // Validate the corrected email
    if (isValidEmail(corrected)) {
        return corrected;
    }
    
    return null;
};

// Test function for backend email processing
const testEmailProcessing = () => {
    const testCases = [
        '605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com',
        'dd0a55ccb8124b9c9d938e3acf41f8aa@sentry.wixpress.com',
        'c183baa23371454f99f417f6616b724d@sentry.wixpress.com',
        'thedentalcureg@gmail.comthedentalcureg',
        'gmail.comthedentalcureg@gmail.com',
        'ismilegurgaon@gmail.comhomeabout',
        'ismilegurgaon@gmail.comschedule,0124-4326628thedentalhomeggn@gmail.comc',
        '122002enquiriesthedentalhomeggn@gmail.comcall',
        '0124-4326628thedentalhomeggn@gmail.comcall,info@thegentledentalclinic.cominfo',
        'drsahilmaghu@gmail.comdrsahilmaghu',
        'gmail.comdrsahilmaghu@gmail.comdrsahilmaghu,himanshu.a178@gmail.comhimanshu',
        '.a178@gmail.com,98102-44656drbhutani@yahoo.com,garima_clinic@yahoo.inbook',
        'garima_clinic@yahoo.inphone',
        // User's specific test cases
        '91-8959677492rudrapratapsinghrudra296@gmail.comshop',
        'admin@brcaterers.comhoursopen',
        'lavishtentindia@gmail.comcopyright',
        'aboutportfolioservicescontactinfo@goldenleafevents.com',
        'smilegurgaon@gmail.comhomeabout',
        '0124-4326628thedentalhomeggn@gmail.comc'
    ];

    console.log('=== BACKEND EMAIL PROCESSING TEST ===');
    testCases.forEach((testCase, index) => {
        const extracted = extractEmails(testCase);
        const corrected = correctEmail(testCase);
        console.log(`Test ${index + 1}: "${testCase}"`);
        console.log(`  Extracted: ${extracted.length > 0 ? extracted.join(', ') : 'None'}`);
        console.log(`  Corrected: ${corrected || 'None'}`);
        console.log('---');
    });
};

// Extract address from mixed content (like rllt_detail1 column)
const extractAddress = (text) => {
    if (!text || typeof text !== 'string') return '';
    
    // Remove phone numbers from the text
    let addressText = text.replace(phoneRegex, '');
    
    // Remove business indicators and service-related text, but keep address details
    addressText = addressText.replace(/·\s*\d+[\s-]*\d+/g, ''); // Remove · phone numbers
    addressText = addressText.replace(/\d+[\s-]*\d+[\s-]*\d+/g, ''); // Remove phone numbers
    addressText = addressText.replace(/Open\s+24\s+hours/gi, '');
    addressText = addressText.replace(/\d+\+\s*years?\s+in\s+business/gi, '');
    addressText = addressText.replace(/Online\s+(estimates|appointments)/gi, '');
    addressText = addressText.replace(/On-site\s+services/gi, '');
    addressText = addressText.replace(/Website/gi, '');
    addressText = addressText.replace(/Directions/gi, '');
    addressText = addressText.replace(/Moving\s+service/gi, '');
    addressText = addressText.replace(/Packaging\s+company/gi, '');
    addressText = addressText.replace(/Moving\s+and\s+storage\s+service/gi, '');
    
    // Clean up separators but keep address structure
    addressText = addressText.replace(/·/g, ',');
    addressText = addressText.replace(/\s+/g, ' ');
    addressText = addressText.replace(/,\s*,/g, ',');
    addressText = addressText.replace(/^,\s*/, '');
    addressText = addressText.replace(/,\s*$/, '');
    
    // Split by common separators and collect address parts
    const parts = addressText.split(/[,|·]/);
    const addressParts = [];
    
    for (const part of parts) {
        const cleanPart = part.trim();
        
        // Keep parts that look like address components
        if (cleanPart.length > 2 && 
            !cleanPart.match(/^\d+$/) && // Remove pure numbers (likely phone remnants)
            !cleanPart.toLowerCase().includes('phone') &&
            !cleanPart.toLowerCase().includes('mobile') &&
            !cleanPart.toLowerCase().includes('contact') &&
            !cleanPart.toLowerCase().includes('call') &&
            !cleanPart.match(/^\d+\.\d+$/)) { // Remove ratings like "4.8"
            
            // Keep address-related content including:
            // - Floor numbers: "2nd Floor", "FF-14"
            // - Building names: "Parsvnath Prerna", "Plaza"
            // - Street names: "Fatehabad Rd"
            // - Landmarks: "near Hotel Courtyard by Marriott"
            // - Shop numbers: "Shop No.5", "S.No. 7B"
            // - Block numbers: "Block No. 11"
            
            addressParts.push(cleanPart);
        }
    }
    
    // Join all meaningful address parts
    let finalAddress = addressParts.join(', ');
    
    // Remove any remaining business indicators at the start
    finalAddress = finalAddress.replace(/^\d+\+\s*years?\s+in\s*business,\s*/i, '');
    
    // Limit length but keep more content for complete addresses
    if (finalAddress.length > 300) {
        finalAddress = finalAddress.substring(0, 300) + '...';
    }
    
    return finalAddress.trim();
};

// Extract text from PDF file
const extractTextFromPDF = async (filePath) => {
    try {
        const dataBuffer = require('fs').readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw error;
    }
};

// Extract phone numbers from PDF text
const extractPhoneNumbersFromPDF = async (filePath) => {
    try {
        const text = await extractTextFromPDF(filePath);
        console.log(`Extracted ${text.length} characters from PDF`);
        
        const phones = text.match(phoneRegex) || [];
        
        const uniquePhones = [...new Set(phones)]
            .map(phone => phone.trim())
            .filter(phone => {
                const cleaned = phone.replace(/[^0-9+]/g, '');
                
                if (cleaned.match(/^(19|20)\d{2}$/)) return false;
                if (cleaned.match(/^\d{4}$/)) return false;
                if (cleaned.match(/^(123|000|111|222|333|444|555|666|777|888|999)/)) return false;
                
                if (cleaned.length < 7 || cleaned.length > 15) return false;
                
                const digitsOnly = cleaned.replace(/\D/g, '');
                if (digitsOnly.length < 7) return false;
                
                return true;
            })
            .slice(0, 10);

        console.log(`Found ${uniquePhones.length} valid phone numbers in PDF`);
        return uniquePhones;
    } catch (error) {
        console.error('Error extracting phone numbers from PDF:', error);
        return [];
    }
};

// Extract emails from PDF text
const extractEmailsFromPDF = async (filePath) => {
    try {
        const text = await extractTextFromPDF(filePath);
        
        const emails = text.match(emailRegex) || [];
        const uniqueEmails = [...new Set(emails)]
            .map(email => email.toLowerCase().trim())
            .filter(email => {
                return !email.includes('example.com') && 
                       !email.includes('test.com') && 
                       !email.includes('sample.com') &&
                       !email.includes('domain.com') &&
                       !email.match(/\.(png|jpg|jpeg|gif|css|js)$/) &&
                       email.length > 5;
            })
            .filter((email, index, self) => self.indexOf(email) === index)
            .slice(0, 10);

        console.log(`Found ${uniqueEmails.length} valid emails in PDF`);
        return uniqueEmails;
    } catch (error) {
        console.error('Error extracting emails from PDF:', error);
        return [];
    }
};


// Company categorization function based on company name analysis
const categorizeCompany = (companyName) => {
  if (!companyName || typeof companyName !== 'string') {
    return 'Uncategorized';
  }

  const name = companyName.toLowerCase().trim();
  
  // Define category patterns with keywords
  const categories = {
    'Chartered Accounts': [
      'chartered accountant', 'ca', 'accountant', 'accountancy', 'accounting',
      'audit', 'auditor', 'tax consultant', 'taxation', 'financial advisor',
      'cfo', 'chief financial', 'bookkeeping', 'book keeper', 'finance'
    ],
    'Dental': [
      'dental', 'dentist', 'dental clinic', 'dental care', 'dental hospital',
      'orthodontist', 'periodontist', 'endodontist', 'pediatric dentist',
      'dental surgeon', 'dental lab', 'smile', 'teeth', 'tooth'
    ],
    'Medical/Healthcare': [
      'hospital', 'medical', 'clinic', 'healthcare', 'doctor', 'physician',
      'surgeon', 'pharmacy', 'pharmaceutical', 'medicine', 'medical center',
      'health', 'nursing', 'surgical', 'diagnostic', 'pathology', 'x-ray'
    ],
    'Legal': [
      'lawyer', 'attorney', 'legal', 'law firm', 'advocate', 'counsel',
      'solicitor', 'barrister', 'legal services', 'juris', 'court'
    ],
    'Education': [
      'school', 'college', 'university', 'institute', 'academy', 'education',
      'training', 'tutorial', 'coaching', 'learning', 'educational',
      'student', 'teacher', 'professor'
    ],
    'IT/Software': [
      'software', 'it', 'information technology', 'tech', 'technology',
      'computer', 'programming', 'development', 'developer', 'coding',
      'app', 'application', 'web development', 'solutions', 'digital'
    ],
    'Real Estate': [
      'real estate', 'property', 'builder', 'construction', 'developer',
      'infrastructure', 'building', 'architect', 'interior', 'housing',
      'land', 'estate agent', 'realtor'
    ],
    'Hospitality': [
      'hotel', 'restaurant', 'food', 'cafe', 'catering', 'hospitality',
      'dining', 'bar', 'pub', 'lounge', 'motel', 'resort', 'bakery'
    ],
    'Manufacturing': [
      'manufacturing', 'factory', 'industry', 'production', 'machinery',
      'equipment', 'industrial', 'fabrication', 'assembly', 'plant'
    ],
    'Retail': [
      'shop', 'store', 'retail', 'supermarket', 'mall', 'shopping',
      'grocery', 'market', 'boutique', 'outlet', 'dealer'
    ],
    'Automotive': [
      'car', 'auto', 'automobile', 'vehicle', 'motor', 'garage', 'workshop',
      'service center', 'showroom', 'dealership', 'parts', 'repair'
    ],
    'Consulting': [
      'consultant', 'consulting', 'advisory', 'consultancy', 'advisor',
      'business consultant', 'management consultant'
    ],
    'Marketing': [
      'marketing', 'advertising', 'promotion', 'brand', 'creative agency',
      'digital marketing', 'seo', 'social media', 'media'
    ],
    'Financial Services': [
      'bank', 'banking', 'finance', 'investment', 'insurance', 'loan',
      'credit', 'financial services', 'wealth management', 'broker'
    ],
    'Logistics': [
      'logistics', 'transport', 'shipping', 'delivery', 'courier',
      'freight', 'warehouse', 'distribution', 'supply chain'
    ],
    'Beauty/Wellness': [
      'beauty', 'salon', 'spa', 'wellness', 'cosmetic', 'grooming',
      'hair', 'beauty parlor', 'massage', 'fitness', 'gym'
    ],
    'Entertainment': [
      'entertainment', 'media', 'cinema', 'movie', 'theater', 'music',
      'gaming', 'event', 'party', 'fun'
    ]
  };

  // Check each category for matching keywords
  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (name.includes(keyword)) {
        return category;
      }
    }
  }

  // Special pattern matching for specific cases
  if (name.match(/pvt\.?\.?\s*ltd\.?\.?|limited|ltd\.?\.?|private\s+limited/i)) {
    // Check if it's a professional services company
    if (name.match(/consult|advisor|service|solution/i)) {
      return 'Consulting';
    }
  }

  if (name.match(/dr\.?\.?|doctor|md|m\.?s\.?|b\.?d\.?s\.?|medical/i)) {
    return 'Medical/Healthcare';
  }

  if (name.match(/eng\.?\.?|engineer|engineering|tech/i)) {
    return 'IT/Software';
  }

  return 'Business/Other';
};

// Enhanced Website Scraper with Multi-Page Navigation and Bottom Scrolling
class EnhancedWebsiteScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.maxPages = 10; // Maximum pages to navigate per website
        this.maxScrollAttempts = 5; // Maximum scroll attempts per page
        this.scrollDelay = 2000; // Delay between scrolls in ms
        this.pageDelay = 3000; // Delay between page navigations in ms
    }

    async initialize() {
        try {
            console.log('Initializing enhanced website scraper...');
            
            const launchOptions = {
                headless: "new",
                protocolTimeout: 300000,
                defaultViewport: proxyRotator.getRandomViewport(),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-background-networking',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-features=CrossSiteDocumentBlockingIfIsolating',
                    '--disable-features=CrossSiteDocumentBlockingAlways'
                ]
            };

            this.browser = await puppeteer.launch(launchOptions);
            this.page = await this.browser.newPage();
            
            // Set random user agent
            await this.page.setUserAgent(proxyRotator.getRandomUserAgent());
            
            // Set additional headers to mimic real browser
            await this.page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            });

            // Anti-detection script
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
                
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
                
                window.chrome = {
                    runtime: {},
                };
                
                const originalQuery = window.navigator.permissions.query;
                return window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            });

            console.log('Enhanced scraper initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize enhanced scraper:', error);
            return false;
        }
    }

    async scrollToBottom() {
        try {
            let previousHeight = 0;
            let scrollAttempts = 0;
            
            while (scrollAttempts < this.maxScrollAttempts) {
                // Get current page height
                const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
                
                // If height hasn't changed, we've reached the bottom
                if (currentHeight === previousHeight) {
                    break;
                }
                
                // Scroll to bottom
                await this.page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                // Wait for potential lazy loading
                await new Promise(r => setTimeout(r, this.scrollDelay));
                
                previousHeight = currentHeight;
                scrollAttempts++;
                
                console.log(`Scroll attempt ${scrollAttempts}, height: ${currentHeight}`);
            }
            
            console.log(`Finished scrolling after ${scrollAttempts} attempts`);
        } catch (error) {
            console.error('Error during scroll to bottom:', error);
        }
    }

    async extractContactInfoFromPage() {
        try {
            const pageData = await this.page.evaluate(() => {
                const contactSelectors = [
                    'body', 'footer', '.contact', '.footer', '.header', '.nav',
                    'a[href^="mailto:"]', 'a[href^="tel:"]', '[href*="contact"]',
                    '.phone', '.email', '[itemprop="telephone"]', '[itemprop="email"]',
                    '.address', '.info', '.about', 'main', 'section', 'article',
                    '.email-address', '.contact-email', '.support-email', '.mail',
                    '[data-email]', '.email-us', '.contact-info', '.footer-info',
                    'span[class*="email"]', 'div[class*="email"]', 'a[class*="email"]',
                    '.business-email', '.company-email', '.office-email',
                    '.contact-info', '.support', '.help', '.team', '.staff',
                    '.management', '.leadership', '.about-us', '.our-team'
                ];

                let allText = '';
                let allLinks = [];
                
                // Extract text from all selectors
                contactSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(elem => {
                            allText += elem.textContent + ' ';
                        });
                    } catch (e) {
                        // Ignore selector errors
                    }
                });

                // Extract email and phone links specifically
                document.querySelectorAll('a[href^="mailto:"]').forEach(elem => {
                    const email = elem.getAttribute('href').replace('mailto:', '').split('?')[0];
                    allText += email + ' ';
                    allLinks.push({ type: 'email', value: email });
                });

                document.querySelectorAll('a[href^="tel:"]').forEach(elem => {
                    const phone = elem.getAttribute('href').replace('tel:', '');
                    allText += phone + ' ';
                    allLinks.push({ type: 'phone', value: phone });
                });

                // Extract meta information
                document.querySelectorAll('meta[name="description"], meta[property="og:description"]').forEach(elem => {
                    allText += elem.getAttribute('content') + ' ';
                });

                // Extract title
                allText += document.title + ' ';

                // Extract all links that might lead to contact pages
                document.querySelectorAll('a[href]').forEach(elem => {
                    const href = elem.getAttribute('href');
                    const text = elem.textContent.toLowerCase();
                    
                    if (href.includes('contact') || href.includes('about') || 
                        href.includes('team') || href.includes('support') ||
                        text.includes('contact') || text.includes('about') ||
                        text.includes('team') || text.includes('support')) {
                        allLinks.push({ type: 'navigation', value: href, text: elem.textContent });
                    }
                });

                return {
                    text: allText,
                    links: allLinks,
                    pageTitle: document.title,
                    pageUrl: window.location.href
                };
            });

            return pageData;
        } catch (error) {
            console.error('Error extracting contact info from page:', error);
            return { text: '', links: [], pageTitle: '', pageUrl: '' };
        }
    }

    async navigateToContactPages() {
        const contactPages = [];
        try {
            const pageData = await this.extractContactInfoFromPage();
            
            // Find potential contact page links
            for (const link of pageData.links) {
                if (link.type === 'navigation' && contactPages.length < 3) {
                    const absoluteUrl = new URL(link.value, pageData.pageUrl).href;
                    if (absoluteUrl.startsWith('http') && !contactPages.includes(absoluteUrl)) {
                        contactPages.push(absoluteUrl);
                    }
                }
            }
        } catch (error) {
            console.error('Error finding contact pages:', error);
        }
        
        return contactPages;
    }

    async scrapeWebsite(url) {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            console.log(`Enhanced scraping: ${url}`);
            
            if (!this.browser) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize scraper');
                }
            }

            // Navigate to the main page
            await this.page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            // Wait a bit for dynamic content
            await new Promise(r => setTimeout(r, 2000));
            
            // Scroll to bottom to load all content
            await this.scrollToBottom();
            
            // Extract contact info from main page
            const mainPageData = await this.extractContactInfoFromPage();
            let allText = mainPageData.text;
            let visitedPages = [url];
            
            // Find and navigate to contact pages
            const contactPages = await this.navigateToContactPages();
            
            for (let i = 0; i < Math.min(contactPages.length, 3); i++) {
                try {
                    const contactUrl = contactPages[i];
                    if (!visitedPages.includes(contactUrl)) {
                        console.log(`Navigating to contact page: ${contactUrl}`);
                        
                        await this.page.goto(contactUrl, { 
                            waitUntil: 'networkidle2', 
                            timeout: 20000 
                        });
                        
                        await new Promise(r => setTimeout(r, 1500));
                        await this.scrollToBottom();
                        
                        const contactPageData = await this.extractContactInfoFromPage();
                        allText += ' ' + contactPageData.text;
                        visitedPages.push(contactUrl);
                        
                        // Delay between page navigations
                        await new Promise(r => setTimeout(r, this.pageDelay));
                    }
                } catch (error) {
                    console.error(`Error navigating to contact page ${contactPages[i]}:`, error.message);
                }
            }
            
            console.log(`Total extracted text length: ${allText.length} characters from ${visitedPages.length} pages`);

            // Extract emails using multiple patterns
            let allEmails = [];
            additionalEmailPatterns.forEach(pattern => {
                const matches = allText.match(pattern) || [];
                allEmails = allEmails.concat(matches);
            });

            const emails = [...new Set(allEmails)];
            const uniqueEmails = emails
                .map(email => email.toLowerCase().trim().replace(/^mailto:/, ''))
                .filter(email => {
                    return !email.includes('example.com') && 
                           !email.includes('test.com') && 
                           !email.includes('sample.com') &&
                           !email.includes('domain.com') &&
                           !email.includes('yourdomain.com') &&
                           !email.match(/\.(png|jpg|jpeg|gif|css|js)$/) &&
                           email.length > 5 &&
                           email.match(/^[^@]+@[^@]+\.[^@]+$/);
                })
                .filter((email, index, self) => self.indexOf(email) === index)
                .slice(0, 10); // Increased limit for comprehensive extraction

            // Extract phone numbers
            const phones = allText.match(phoneRegex) || [];
            const uniquePhones = [...new Set(phones)]
                .map(phone => phone.trim())
                .filter(phone => {
                    const cleaned = phone.replace(/[^0-9+]/g, '');
                    
                    if (cleaned.match(/^(19|20)\d{2}$/)) return false;
                    if (cleaned.match(/^\d{4}$/)) return false;
                    if (cleaned.match(/^(123|000|111|222|333|444|555|666|777|888|999)/)) return false;
                    
                    if (cleaned.length < 7 || cleaned.length > 15) return false;
                    
                    const digitsOnly = cleaned.replace(/\D/g, '');
                    if (digitsOnly.length < 7) return false;
                    
                    return true;
                })
                .slice(0, 10); // Increased limit for comprehensive extraction

            console.log(`Found ${uniqueEmails.length} emails and ${uniquePhones.length} phones for ${url}`);
            
            if (uniqueEmails.length > 0) {
                console.log(`Emails found: ${uniqueEmails.slice(0, 5).join(', ')}${uniqueEmails.length > 5 ? '...' : ''}`);
            }
            if (uniquePhones.length > 0) {
                console.log(`Phones found: ${uniquePhones.slice(0, 3).join(', ')}${uniquePhones.length > 3 ? '...' : ''}`);
            }

            return {
                success: true,
                emails: uniqueEmails.slice(0, 10),
                phones: uniquePhones.slice(0, 5),
                error: null,
                scrapedUrl: url,
                pagesVisited: visitedPages.length,
                visitedPages: visitedPages
            };
        } catch (error) {
            console.error(`Error in enhanced scraping ${url}:`, error.message);
            return {
                success: false,
                emails: [],
                phones: [],
                error: error.message,
                scrapedUrl: url,
                pagesVisited: 0,
                visitedPages: []
            };
        }
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                console.log('Enhanced scraper closed');
            }
        } catch (error) {
            console.error('Error closing enhanced scraper:', error);
        }
    }
}

// Fallback to original scraper for compatibility
const scrapeWebsite = async (url) => {
    try {
        // Try enhanced scraper first
        const enhancedScraper = new EnhancedWebsiteScraper();
        const result = await enhancedScraper.scrapeWebsite(url);
        await enhancedScraper.close();
        
        if (result.success && (result.emails.length > 0 || result.phones.length > 0)) {
            return result;
        }
        
        // Fallback to original scraper if enhanced doesn't find anything
        console.log('Enhanced scraper found limited data, trying fallback...');
        return await scrapeWebsiteFallback(url);
    } catch (error) {
        console.error('Enhanced scraper failed, using fallback:', error.message);
        return await scrapeWebsiteFallback(url);
    }
};

// Original scraper as fallback
const scrapeWebsiteFallback = async (url) => {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        console.log(`Fallback scraping: ${url}`);

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': proxyRotator.getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            httpsAgent: new (require('https')).Agent({
                rejectUnauthorized: false
            })
        });

        const $ = cheerio.load(response.data);
        
        const contactSelectors = [
            'body', 'footer', '.contact', '.footer', '.header', '.nav',
            'a[href^="mailto:"]', 'a[href^="tel:"]', '[href*="contact"]',
            '.phone', '.email', '[itemprop="telephone"]', '[itemprop="email"]',
            '.address', '.info', '.about', 'main', 'section', 'article',
            '.email-address', '.contact-email', '.support-email', '.mail',
            '[data-email]', '.email-us', '.contact-info', '.footer-info',
            'span[class*="email"]', 'div[class*="email"]', 'a[class*="email"]',
            '.business-email', '.company-email', '.office-email'
        ];

        let allText = '';
        contactSelectors.forEach(selector => {
            const text = $(selector).text();
            if (text) {
                allText += text + ' ';
            }
        });

        $('a[href^="mailto:"]').each((i, elem) => {
            const email = $(elem).attr('href').replace('mailto:', '').split('?')[0];
            allText += email + ' ';
        });

        $('a[href^="tel:"]').each((i, elem) => {
            const phone = $(elem).attr('href').replace('tel:', '').replace(/[^0-9+]/g, ' ');
            allText += phone + ' ';
        });

        $('meta[name="description"]').each((i, elem) => {
            allText += $(elem).attr('content') + ' ';
        });

        $('meta[property="og:description"]').each((i, elem) => {
            allText += $(elem).attr('content') + ' ';
        });

        allText += $('title').text() + ' ';

        console.log(`Fallback extracted text length: ${allText.length} characters`);

        // Use multiple email patterns for better extraction
        let allEmails = [];
        additionalEmailPatterns.forEach(pattern => {
            const matches = allText.match(pattern) || [];
            allEmails = allEmails.concat(matches);
        });

        const emails = [...new Set(allEmails)];
        const uniqueEmails = emails
            .map(email => email.toLowerCase().trim().replace(/^mailto:/, ''))
            .filter(email => {
                return !email.includes('example.com') && 
                       !email.includes('test.com') && 
                       !email.includes('sample.com') &&
                       !email.includes('domain.com') &&
                       !email.includes('yourdomain.com') &&
                       !email.match(/\.(png|jpg|jpeg|gif|css|js)$/) &&
                       email.length > 5 &&
                       email.match(/^[^@]+@[^@]+\.[^@]+$/);
            })
            .filter((email, index, self) => self.indexOf(email) === index)
            .slice(0, 5);

        const phones = allText.match(phoneRegex) || [];
        
        const uniquePhones = [...new Set(phones)]
            .map(phone => phone.trim())
            .filter(phone => {
                const cleaned = phone.replace(/[^0-9+]/g, '');
                
                if (cleaned.match(/^(19|20)\d{2}$/)) return false;
                if (cleaned.match(/^\d{4}$/)) return false;
                if (cleaned.match(/^(123|000|111|222|333|444|555|666|777|888|999)/)) return false;
                
                if (cleaned.length < 7 || cleaned.length > 15) return false;
                
                const digitsOnly = cleaned.replace(/\D/g, '');
                if (digitsOnly.length < 7) return false;
                
                return true;
            })
            .slice(0, 5);

        console.log(`Fallback found ${uniqueEmails.length} emails and ${uniquePhones.length} phones for ${url}`);
        
        if (uniqueEmails.length > 0) {
            console.log(`Emails found: ${uniqueEmails.join(', ')}`);
        }
        if (uniquePhones.length > 0) {
            console.log(`Phones found: ${uniquePhones.join(', ')}`);
        }

        return {
            success: true,
            emails: uniqueEmails.slice(0, 5),
            phones: uniquePhones.slice(0, 3),
            error: null,
            scrapedUrl: url
        };
    } catch (error) {
        console.error(`Error in fallback scraping ${url}:`, error.message);
        return {
            success: false,
            emails: [],
            phones: [],
            error: error.message,
            scrapedUrl: url
        };
    }
};

// Process Excel file with parallel scraping
const processExcelFile = async (filePath) => {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (!data.length) {
            throw new Error('Excel file is empty or invalid');
        }

        const urlColumn = Object.keys(data[0]).find(key => 
            key.toLowerCase().includes('url') || 
            key.toLowerCase().includes('website') || 
            key.toLowerCase().includes('site') ||
            key.toLowerCase().includes('link') ||
            key.toLowerCase().includes('http')
        ) || Object.keys(data[0]).find(key => {
            return data.some(row => {
                const value = row[key];
                return typeof value === 'string' && 
                       (value.includes('http') || 
                        value.includes('.com') || 
                        value.includes('.in') ||
                        value.includes('.site') ||
                        value.includes('instagram.com') ||
                        value.includes('facebook.com') ||
                        value.includes('google.com'));
            });
        });

        const phoneColumn = Object.keys(data[0]).find(key => 
            key.toLowerCase().includes('phone') || 
            key.toLowerCase().includes('number') || 
            key.toLowerCase().includes('contact') ||
            key.toLowerCase().includes('mobile') ||
            key.toLowerCase().includes('tel') ||
            key.toLowerCase().includes('rllt_detail1')
        ) || Object.keys(data[0]).find(key => {
            return data.some(row => {
                const value = String(row[key] || '');
                const phones = extractPhoneNumbers(value);
                return phones.length > 0;
            });
        });

        const emailColumn = Object.keys(data[0]).find(key => 
            key.toLowerCase().includes('email') || 
            key.toLowerCase().includes('mail') ||
            key.toLowerCase().includes('e-mail')
        ) || Object.keys(data[0]).find(key => {
            return data.some(row => {
                const value = String(row[key] || '');
                return emailRegex.test(value);
            });
        });

        const addressColumn = Object.keys(data[0]).find(key => 
            key.toLowerCase().includes('address') || 
            key.toLowerCase().includes('location') || 
            key.toLowerCase().includes('city') ||
            key.toLowerCase().includes('state') ||
            key.toLowerCase().includes('country') ||
            key.toLowerCase().includes('zip') ||
            key.toLowerCase().includes('postal') ||
            key.toLowerCase().includes('rllt_detail1')
        );

        const companyColumn = Object.keys(data[0]).find(key => 
            key.toLowerCase().includes('company') || 
            key.toLowerCase().includes('name') || 
            key.toLowerCase().includes('business') ||
            key.toLowerCase().includes('firm') ||
            key.toLowerCase().includes('organization') ||
            key.toLowerCase().includes('title') ||
            key.toLowerCase().includes('institution')
        ) || Object.keys(data[0])[0]; // Fallback to first column

        console.log(`Processing ${data.length} rows`);
        console.log(`URL column: ${urlColumn || 'Not found'}`);
        console.log(`Phone column: ${phoneColumn || 'Not found'}`);
        console.log(`Email column: ${emailColumn || 'Not found'}`);
        console.log(`Address column: ${addressColumn || 'Not found'}`);
        console.log(`Company column: ${companyColumn || 'Not found'}`);

        const batchSize = 5;
        const results = [];

        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchPromises = batch.map(async (row, index) => {
                const url = urlColumn ? row[urlColumn] : null;
                const existingPhone = phoneColumn ? String(row[phoneColumn] || '') : '';
                const existingEmail = emailColumn ? String(row[emailColumn] || '') : '';
                const existingAddress = addressColumn ? extractAddress(String(row[addressColumn] || '')) : '';
                const companyName = companyColumn ? String(row[companyColumn] || '') : '';
                const category = categorizeCompany(companyName);
                
                let extractedUrl = url;
                if (typeof url === 'string' && url) {
                    const urlMatch = url.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        extractedUrl = urlMatch[1];
                    } else {
                        const domainMatch = url.match(/([a-zA-Z0-9.-]+\.(com|in|site|org|net)[^\s]*)/);
                        if (domainMatch) {
                            extractedUrl = domainMatch[1];
                        }
                    }
                }
                
                if (!extractedUrl || extractedUrl.trim() === '') {
                    let cleanedPhone = '';
                    if (existingPhone && existingPhone.trim()) {
                        const phoneMatches = extractPhoneNumbers(existingPhone);
                        cleanedPhone = phoneMatches.join(', ').trim();
                    }
                    
                    let cleanedEmail = '';
                    if (existingEmail && existingEmail.trim()) {
                        // First try to extract emails from complex formats
                        const emailMatches = extractEmails(existingEmail);
                        if (emailMatches.length > 0) {
                            cleanedEmail = emailMatches.join(', ').trim();
                        } else {
                            // If no emails found, try to correct the existing email format
                            const correctedEmail = correctEmail(existingEmail);
                            cleanedEmail = correctedEmail || '';
                        }
                    }
                    
                    return {
                        ...row,
                        email: cleanedEmail,
                        phone: cleanedPhone,
                        address: existingAddress.trim(),
                        category: category,
                        scrapeStatus: cleanedPhone || cleanedEmail ? 'Used existing data' : 'No URL found'
                    };
                }

                let finalEmail = '';
                let finalPhone = '';
                let scrapeStatus = '';
                
                let cleanedExistingPhone = '';
                if (existingPhone && existingPhone.trim()) {
                    const phoneMatches = extractPhoneNumbers(existingPhone);
                    cleanedExistingPhone = phoneMatches.join(', ').trim();
                }
                
                let cleanedExistingEmail = '';
                if (existingEmail && existingEmail.trim()) {
                    // First try to extract emails from complex formats
                    const emailMatches = extractEmails(existingEmail);
                    if (emailMatches.length > 0) {
                        cleanedExistingEmail = emailMatches.join(', ').trim();
                    } else {
                        // If no emails found, try to correct the existing email format
                        const correctedEmail = correctEmail(existingEmail);
                        cleanedExistingEmail = correctedEmail || '';
                    }
                }
                
                if (cleanedExistingPhone && cleanedExistingEmail) {
                    finalPhone = cleanedExistingPhone;
                    finalEmail = cleanedExistingEmail;
                    scrapeStatus = 'Used existing data (phone + email)';
                } else if (cleanedExistingPhone) {
                    // Has phone but no email - scrape for email
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = cleanedExistingPhone;
                    finalEmail = scrapeResult.success ? scrapeResult.emails.join(', ') : '';
                    scrapeStatus = scrapeResult.success ? 'Success (scraped email)' : `Error: ${scrapeResult.error}`;
                } else if (cleanedExistingEmail) {
                    // Has email but no phone - scrape for phone
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = scrapeResult.success ? scrapeResult.phones.join(', ') : '';
                    finalEmail = cleanedExistingEmail;
                    scrapeStatus = scrapeResult.success ? 'Success (scraped phone)' : `Error: ${scrapeResult.error}`;
                } else {
                    // Has neither phone nor email - scrape for both
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = scrapeResult.success ? scrapeResult.phones.join(', ') : '';
                    finalEmail = scrapeResult.success ? scrapeResult.emails.join(', ') : '';
                    scrapeStatus = scrapeResult.success ? 'Success (scraped both)' : `Error: ${scrapeResult.error}`;
                }
                
                return {
                    ...row,
                    email: finalEmail,
                    phone: finalPhone,
                    address: existingAddress.trim(),
                    category: category,
                    scrapeStatus: scrapeStatus
                };
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            if (i + batchSize < data.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const companiesWithExistingPhones = results.filter(row => {
            const existingPhone = phoneColumn ? String(row[phoneColumn] || '') : '';
            return existingPhone.trim() !== '' && phoneRegex.test(existingPhone);
        });

        const companiesWithoutExistingPhones = results.filter(row => {
            const existingPhone = phoneColumn ? String(row[phoneColumn] || '') : '';
            return existingPhone.trim() === '' || !phoneRegex.test(existingPhone);
        });

        return {
            processedData: results,
            companiesWithExistingPhones: companiesWithExistingPhones.length,
            companiesWithoutExistingPhones: companiesWithoutExistingPhones.length
        };
    } catch (error) {
        console.error('Error processing Excel file:', error);
        throw error;
    }
};

// Initialize communication services
const emailService = new EmailService();
const whatsappService = new WhatsAppService(); // Disabled - Twilio package removed
const smsService = new SMSService(); // Disabled - Twilio package removed

// Helper function to clean category names
function cleanCategoryName(category) {
  if (!category) return '';
  
  return category
    .replace(/-/g, ' ')  // Replace hyphens with spaces
    .replace(/in\s*Sai\s*Kunj/gi, '')  // Remove 'in-Sai-Kunj'
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\b\w/g, l => l.toUpperCase())  // Capitalize first letter of each word
    .trim();
}

                
// Multer configuration for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'));
        }
    }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Routes

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working', timestamp: new Date() });
});

// Simple file test endpoint
app.post('/api/test-upload', upload.single('file'), (req, res) => {
    try {
        console.log('Test upload request received');
        console.log('File info:', req.file);
        console.log('Request body:', req.body);
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        res.json({ 
            message: 'Test upload successful',
            filename: req.file.originalname,
            size: req.file.size
        });
    } catch (error) {
        console.error('Test upload error:', error);
        res.status(500).json({ error: 'Test upload failed' });
    }
});

// Upload and process Excel file
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        console.log('Upload request received');
        console.log('File info:', req.file);
        
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('Processing file:', req.file.path);
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);
        
        console.log('Parsed data rows:', data.length);
        console.log('Sample row:', data[0]);

        const companies = [];
        let skippedRows = 0;
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            
            // Skip empty rows
            if (!row || Object.keys(row).length === 0) {
                skippedRows++;
                continue;
            }

            // Extract and validate required fields
            const companyName = row['Company Name'] || row.Title1 || row.company || row.Company || row.title || '';
            const phone = row['Phone Number'] || row.phone || row.Phone || '';
            let email = row['Email'] || row.email || row.Email || '';
            
            // Apply email correction to handle complex formats
            if (email && email.trim()) {
                const correctedEmail = correctEmail(email);
                email = correctedEmail || email; // Use corrected email if available, otherwise original
            }
            
            // Extract address - check for rllt_detail1 first, then other address columns
            let address = '';
            if (row['rllt_detail1']) {
                address = extractAddress(String(row['rllt_detail1'] || ''));
            } else {
                address = row['Address'] || row.address || row.Address || row.Location || row.location || '';
            }

            // Extract category
            const category = row['Category'] || row.category || row.Type || row.type || row.Industry || row.industry || '';

            // Extract city from address or separate city column
            let city = '';
            if (row['City'] || row.city) {
                city = row['City'] || row.city;
            } else if (address) {
                // Try to extract city from address
                const cityMatch = address.match(/,?\s*([A-Za-z\s]+),?\s*[A-Z]{2,}|\b([A-Za-z\s]+)\b,?\s*[A-Z]{2,}/);
                if (cityMatch) {
                    city = cityMatch[1] || cityMatch[2];
                }
            }

            // Debug logging for each row
            console.log(`Row ${i + 1}:`, {
                companyName: companyName ? `"${companyName}"` : 'MISSING',
                phone: phone ? `"${phone}"` : 'MISSING',
                email: email ? `"${email}"` : 'MISSING',
                address: address ? `"${address}"` : 'MISSING',
                allKeys: Object.keys(row),
                phoneKeyExists: 'phone' in row,
                PhoneKeyExists: 'Phone' in row,
                phoneNumberKeyExists: 'Phone Number' in row,
                companyNameKeyExists: 'Company Name' in row,
                addressKeyExists: 'address' in row,
                AddressKeyExists: 'Address' in row
            });

            // Skip rows with missing required data
            if (!companyName.trim() || !phone.trim()) {
                console.warn(`Skipping row ${i + 1} with missing required data:`, {
                    hasCompany: !!companyName.trim(),
                    hasPhone: !!phone.trim(),
                    company: companyName,
                    phone: phone
                });
                skippedRows++;
                continue;
            }

            const company = new Company({
                company: companyName.trim(),
                phone: phone.trim(),
                email: email.trim(),
                website: (row.yyljef_URL1 || row.Website || row.website || '').trim(),
                address: address.trim(),
                category: category.trim(),
                city: city.trim(),
                message: `Hello ${companyName.trim()}, we would like to connect with you...`,
                status: 'pending'
            });
            companies.push(company);
        }

        console.log(`Processed ${companies.length} valid companies, skipped ${skippedRows} rows`);

        if (companies.length === 0) {
            console.log('No valid companies found');
            return res.status(400).json({ 
                error: 'No valid company data found in file. Please ensure your Excel file has required columns: Title1 (company name) and phone. Email and Address are optional.' 
            });
        }

        try {
            await Company.insertMany(companies);
            
            // Save upload history
            try {
                let categories = [];
                if (req.body.categories) {
                    try {
                        categories = JSON.parse(req.body.categories);
                    } catch (e) {
                        console.log('Could not parse categories from request');
                    }
                }
                
                const uploadRecord = new FileUploadHistory({
                    originalFilename: req.file.originalname,
                    filename: req.file.filename,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                    recordCount: companies.length,
                    status: 'completed',
                    categories: categories
                });
                
                await uploadRecord.save();
                console.log('Upload history saved:', uploadRecord.originalFilename);
            } catch (historyError) {
                console.error('Error saving upload history:', historyError);
                // Continue even if history saving fails
            }
        } catch (dbError) {
            console.error('Database insertion error:', dbError);
            return res.status(400).json({ 
                error: 'Error saving companies to database',
                details: dbError.message 
            });
        }
        
        // Clean up uploaded file with retry logic
        try {
            fs.unlinkSync(req.file.path);
            console.log('Successfully deleted uploaded file:', req.file.path);
        } catch (unlinkError) {
            if (unlinkError.code === 'EBUSY' || unlinkError.code === 'ENOENT') {
                console.log('File busy or not found, scheduling deletion:', req.file.path);
                // Schedule file deletion after a delay
                setTimeout(() => {
                    try {
                        fs.unlinkSync(req.file.path);
                        console.log('Successfully deleted file on retry:', req.file.path);
                    } catch (retryError) {
                        console.log('Could not delete file on retry:', retryError.message);
                        // Continue anyway - the file will be cleaned up by system eventually
                    }
                }, 5000); // Wait 5 seconds and try again
            } else {
                console.log('Unexpected error deleting file:', unlinkError.message);
            }
        }

        res.json({ 
            message: 'File uploaded and processed successfully',
            count: companies.length
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Error processing file' });
    }
});

// Delete all companies
app.delete('/api/companies', async (req, res) => {
    try {
        const result = await Company.deleteMany({});
        
        res.json({
            success: true,
            message: `All ${result.deletedCount} companies deleted successfully`,
            count: result.deletedCount
        });

    } catch (error) {
        console.error('Delete all error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete all companies' 
        });
    }
});

// Delete a company by ID
app.delete('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const company = await Company.findByIdAndDelete(id);
        
        if (!company) {
            return res.status(404).json({ 
                success: false, 
                error: 'Company not found' 
            });
        }

        res.json({
            success: true,
            message: `Company "${company.company}" deleted successfully`
        });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete company' 
        });
    }
});

// Update company email by ID
app.put('/api/companies/:id/email', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        
        // Validate email format
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (email && !emailRegex.test(email.trim())) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format' 
            });
        }
        
        const company = await Company.findByIdAndUpdate(
            id, 
            { 
                email: email ? email.trim() : '',
                updatedAt: new Date()
            }, 
            { new: true, runValidators: true }
        );
        
        if (!company) {
            return res.status(404).json({ 
                success: false, 
                error: 'Company not found' 
            });
        }

        res.json({
            success: true,
            message: `Email updated successfully for "${company.company}"`,
            company: company
        });

    } catch (error) {
        console.error('Update email error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update email' 
        });
    }
});

// Add a new company
app.post('/api/companies', async (req, res) => {
    try {
        const { company, phone, email, website, address, city, message, status } = req.body;
        
        // Validate required fields
        if (!company || !phone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Company name and phone number are required' 
            });
        }
        
        // Check if company already exists
        const existingCompany = await Company.findOne({ 
            $or: [
                { company: company },
                { phone: phone }
            ]
        });
        
        if (existingCompany) {
            return res.status(409).json({ 
                success: false, 
                error: 'Company with this name or phone already exists' 
            });
        }
        
        // Create new company
        const newCompany = new Company({
            company,
            phone,
            email: email || '',
            website: website || '',
            address: address || '',
            city: city || '',
            message: message || `Hello ${company}, we would like to connect with you...`,
            status: status || 'pending',
            createdAt: new Date()
        });
        
        await newCompany.save();
        
        console.log('Company created successfully:', company);
        res.status(201).json({ 
            success: true, 
            message: 'Company created successfully',
            company: newCompany 
        });
    } catch (error) {
        console.error('Create company error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create company' 
        });
    }
});

// Get all companies with their status and filtering support
app.get('/api/companies', companiesLimiter, async (req, res) => {
    try {
        const { category, city, search, page = 1, limit = 20 } = req.query;
        let filter = {};
        
        // Add category filter if provided
        if (category && category !== 'all') {
            filter.category = category;
        }
        
        // Add city filter if provided
        if (city && city !== 'all') {
            filter.city = city;
        }
        
        // Add search filter if provided
        if (search && search.trim()) {
            filter.$or = [
                { company: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Convert page and limit to numbers
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        
        // Get total count for pagination
        const totalCompanies = await Company.countDocuments(filter);
        
        // Get paginated results
        const companies = await Company.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);
        
        // Calculate pagination info
        const totalPages = Math.ceil(totalCompanies / limitNum);
        
        res.json({
            companies,
            currentPage: pageNum,
            totalPages,
            totalCompanies,
            limit: limitNum
        });
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Error fetching companies' });
    }
});

// Batch update companies (for assigning categories)
app.post('/api/companies/batch-update', async (req, res) => {
    try {
        const { companyIds, category } = req.body;
        
        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Company IDs are required' });
        }
        
        if (!category || !category.trim()) {
            return res.status(400).json({ error: 'Category is required' });
        }
        
        // Update all companies with the given IDs
        const result = await Company.updateMany(
            { _id: { $in: companyIds } },
            { category: category.trim(), updatedAt: new Date() }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'No companies found' });
        }
        
        res.json({ 
            message: `Updated ${result.modifiedCount} companies`,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Batch update error:', error);
        res.status(500).json({ error: 'Error updating companies' });
    }
});

// Batch update companies (for assigning cities)
app.post('/api/companies/batch-update-city', async (req, res) => {
    try {
        const { companyIds, city } = req.body;
        
        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Company IDs are required' });
        }
        
        if (!city || !city.trim()) {
            return res.status(400).json({ error: 'City is required' });
        }
        
        // Update all companies with the given IDs
        const result = await Company.updateMany(
            { _id: { $in: companyIds } },
            { city: city.trim(), updatedAt: new Date() }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'No companies found' });
        }
        
        res.json({ 
            message: `Updated ${result.modifiedCount} companies`,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Batch update city error:', error);
        res.status(500).json({ error: 'Error updating companies' });
    }
});

// Get unique categories for filter dropdown
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Company.distinct('category');
        const filteredCategories = categories.filter(cat => cat && cat.trim() !== '');
        res.json(filteredCategories.sort());
    } catch (error) {
        console.error('Fetch categories error:', error);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

// Create a new category
app.post('/api/categories', async (req, res) => {
    try {
        const { name, type } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
        }
        
        const categoryName = name.trim();
        
        // Check if category already exists
        const existingCategories = await Company.distinct('category');
        if (existingCategories.includes(categoryName)) {
            return res.status(409).json({ error: 'Category already exists' });
        }
        
        // For manual categories, we don't need to store them separately
        // They will be created when companies are assigned to them
        res.json({ 
            name: categoryName, 
            type: type || 'manual',
            message: 'Category created successfully' 
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Error creating category' });
    }
});

// Get unique cities for filter dropdown
app.get('/api/cities', async (req, res) => {
    try {
        const cities = await Company.distinct('city');
        const filteredCities = cities.filter(city => city && city.trim() !== '');
        res.json(filteredCities.sort());
    } catch (error) {
        console.error('Fetch cities error:', error);
        res.status(500).json({ error: 'Error fetching cities' });
    }
});

// Send bulk messages to selected companies
app.post('/api/send-bulk-messages', async (req, res) => {
    try {
        const { companyIds, message, communicationType } = req.body;
        
        if (!companyIds || companyIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No companies selected' 
            });
        }

        if (!message || message.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required' 
            });
        }

        // Get selected companies from database
        const companies = await Company.find({ _id: { $in: companyIds } });
        
        if (companies.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No companies found' 
            });
        }

        let successCount = 0;
        let errorCount = 0;
        const results = [];

        // Send messages to each selected company
        for (const company of companies) {
            try {
                let result;
                
                if (communicationType === 'email' && company.email) {
                    result = await EmailService.sendEmail(
                        company.email,
                        'Message from Contact Form',
                        message
                    );
                } else if (communicationType === 'sms' && company.phone) {
                    result = await SMSService.sendSMS(company.phone, message);
                } else if (communicationType === 'whatsapp' && company.phone) {
                    result = await WhatsAppService.sendWhatsApp(company.phone, message);
                } else if (communicationType === 'all' && company.phone) {
                    // Send both SMS and WhatsApp
                    const smsResult = await SMSService.sendSMS(company.phone, message);
                    const whatsappResult = await WhatsAppService.sendWhatsApp(company.phone, message);
                    result = { sms: smsResult, whatsapp: whatsappResult };
                } else if (communicationType === 'all_channels') {
                    // Send all three channels
                    const results = {};
                    if (company.email) {
                        results.email = await EmailService.sendEmail(
                            company.email,
                            'Message from Contact Form',
                            message
                        );
                    }
                    if (company.phone) {
                        results.sms = await SMSService.sendSMS(company.phone, message);
                        results.whatsapp = await WhatsAppService.sendWhatsApp(company.phone, message);
                    }
                    result = results;
                }

                if (result && (result.success || !result.error)) {
                    successCount++;
                    results.push({ company: company.company, status: 'success' });
                } else {
                    errorCount++;
                    results.push({ 
                        company: company.company, 
                        status: 'error', 
                        error: result?.error || 'Unknown error' 
                    });
                }
            } catch (error) {
                errorCount++;
                results.push({ 
                    company: company.company, 
                    status: 'error', 
                    error: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Bulk message sending completed. Success: ${successCount}, Errors: ${errorCount}`,
            results: results,
            summary: {
                total: companies.length,
                success: successCount,
                errors: errorCount
            }
        });

    } catch (error) {
        console.error('Bulk message sending error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send bulk messages' 
        });
    }
});

// Send messages with actual API integration
app.post('/api/send-messages', async (req, res) => {
    try {
        const { companyIds, communicationType } = req.body;
        
        const companies = await Company.find({ '_id': { $in: companyIds } });
        
        for (const company of companies) {
            let success = true;
            let error = null;
            
            try {
                if (communicationType === 'all' || communicationType === 'email') {
                    const emailResult = await emailService.sendEmail(
                        company.email,
                        `Business Outreach - ${company.company}`,
                        company.message
                    );
                    if (!emailResult.success) {
                        success = false;
                        error = `Email failed: ${emailResult.error}`;
                    }
                }
                
                if (communicationType === 'all' || communicationType === 'whatsapp') {
                    if (whatsappService.isValidPhoneNumber(company.phone)) {
                        const whatsappResult = await whatsappService.sendWhatsAppMessage(
                            company.phone,
                            company.message
                        );
                        if (!whatsappResult.success) {
                            success = false;
                            error = `WhatsApp failed: ${whatsappResult.error}`;
                        }
                    } else {
                        console.warn(`Invalid phone number for ${company.company}: ${company.phone}`);
                    }
                }
                
                if (communicationType === 'all' || communicationType === 'sms') {
                    if (smsService.isValidPhoneNumber(company.phone)) {
                        const smsResult = await smsService.sendSMS(
                            company.phone,
                            company.message
                        );
                        if (!smsResult.success) {
                            success = false;
                            error = `SMS failed: ${smsResult.error}`;
                        }
                    } else {
                        console.warn(`Invalid phone number for ${company.company}: ${company.phone}`);
                    }
                }
                
            } catch (err) {
                success = false;
                error = err.message;
            }
            
            // Update company status
            company.status = success ? 'sent' : 'failed';
            company.communicationType = communicationType;
            company.updatedAt = new Date();
            if (error) {
                company.errorMessage = error;
            }
            await company.save();
        }
        
        res.json({ 
            message: 'Messages processed successfully',
            count: companies.length
        });
    } catch (error) {
        console.error('Send messages error:', error);
        res.status(500).json({ error: 'Error sending messages' });
    }
});

// Send individual text message
app.post('/api/send-individual-message', async (req, res) => {
    try {
        const { phone, message, communicationType } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({ 
                error: 'Phone number and message are required' 
            });
        }

        let success = true;
        let error = null;
        let result = {};

        try {
            if (communicationType === 'sms' || communicationType === 'all' || communicationType === 'sms_email' || communicationType === 'all_three') {
                if (smsService.isValidPhoneNumber(phone)) {
                    const smsResult = await smsService.sendSMS(phone, message);
                    result.sms = smsResult;
                    if (!smsResult.success) {
                        success = false;
                        error = `SMS failed: ${smsResult.error}`;
                    }
                } else {
                    success = false;
                    error = 'Invalid phone number format for SMS';
                }
            }
            
            if (communicationType === 'whatsapp' || communicationType === 'all' || communicationType === 'whatsapp_email' || communicationType === 'all_three') {
                if (whatsappService.isValidPhoneNumber(phone)) {
                    const whatsappResult = await whatsappService.sendWhatsAppMessage(phone, message);
                    result.whatsapp = whatsappResult;
                    if (!whatsappResult.success) {
                        success = false;
                        error = `WhatsApp failed: ${whatsappResult.error}`;
                    }
                } else {
                    success = false;
                    error = 'Invalid phone number format for WhatsApp';
                }
            }

            if (communicationType === 'email' || communicationType === 'sms_email' || communicationType === 'whatsapp_email' || communicationType === 'all_three') {
                return res.status(400).json({ 
                    error: 'Email communication requires email address. Use /api/send-individual-email endpoint for email messages.' 
                });
            }

        } catch (err) {
            success = false;
            error = err.message;
        }

        res.json({ 
            success,
            message: success ? 'Message sent successfully' : 'Message failed to send',
            error,
            result
        });
    } catch (error) {
        console.error('Send individual message error:', error);
        res.status(500).json({ error: 'Error sending individual message' });
    }
});

// Send individual email message
app.post('/api/send-individual-email', async (req, res) => {
    try {
        const { email, senderEmail, subject, message } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ 
                error: 'Email, subject, and message are required' 
            });
        }

        const emailResult = await emailService.sendEmail(email, subject, message, senderEmail);

        res.json({ 
            success: emailResult.success,
            message: emailResult.success ? 'Email sent successfully' : 'Email failed to send',
            error: emailResult.error,
            result: emailResult
        });
    } catch (error) {
        console.error('Send individual email error:', error);
        res.status(500).json({ error: 'Error sending individual email' });
    }
});

// Send individual combined message (multiple communication types)
app.post('/api/send-individual-combined', async (req, res) => {
    try {
        const { phone, email, senderEmail, subject, message, communicationType } = req.body;
        
        let success = true;
        let error = null;
        let result = {};

        try {
            // Handle SMS
            if (communicationType === 'sms' || communicationType === 'all' || communicationType === 'sms_email' || communicationType === 'all_three') {
                if (phone && smsService.isValidPhoneNumber(phone)) {
                    const smsResult = await smsService.sendSMS(phone, message);
                    result.sms = smsResult;
                    if (!smsResult.success) {
                        success = false;
                        error = `SMS failed: ${smsResult.error}`;
                    }
                } else if (phone) {
                    success = false;
                    error = 'Invalid phone number format for SMS';
                }
            }
            
            // Handle WhatsApp
            if (communicationType === 'whatsapp' || communicationType === 'all' || communicationType === 'whatsapp_email' || communicationType === 'all_three') {
                if (phone && whatsappService.isValidPhoneNumber(phone)) {
                    const whatsappResult = await whatsappService.sendWhatsAppMessage(phone, message);
                    result.whatsapp = whatsappResult;
                    if (!whatsappResult.success) {
                        success = false;
                        error = `WhatsApp failed: ${whatsappResult.error}`;
                    }
                } else if (phone) {
                    success = false;
                    error = 'Invalid phone number format for WhatsApp';
                }
            }

            // Handle Email
            if (communicationType === 'email' || communicationType === 'sms_email' || communicationType === 'whatsapp_email' || communicationType === 'all_three') {
                if (email && subject) {
                    const emailResult = await emailService.sendEmail(email, subject, message, senderEmail);
                    result.email = emailResult;
                    if (!emailResult.success) {
                        success = false;
                        error = `Email failed: ${emailResult.error}`;
                    }
                } else if (email) {
                    success = false;
                    error = 'Email and subject are required for email communication';
                }
            }

        } catch (err) {
            success = false;
            error = err.message;
        }

        res.json({ 
            success,
            message: success ? 'Messages sent successfully' : 'Some messages failed to send',
            error,
            result
        });
    } catch (error) {
        console.error('Send combined message error:', error);
        res.status(500).json({ error: 'Error sending combined message' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const total = await Company.countDocuments();
        const sent = await Company.countDocuments({ status: 'sent' });
        const pending = await Company.countDocuments({ status: 'pending' });
        const failed = await Company.countDocuments({ status: 'failed' });
        
        res.json({
            total,
            sent,
            pending,
            failed
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Error fetching statistics' });
    }
});

// Excel Scraper API Routes

// Excel Scraper upload endpoint
app.post('/api/excel-scraper/upload', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const startTime = Date.now();
        const filePath = req.file.path;
        const originalFilename = req.file.originalname;

        console.log('Starting Excel file processing...');
        const processingResult = await processExcelFile(filePath);
        const { processedData, companiesWithExistingPhones, companiesWithoutExistingPhones } = processingResult;
        console.log(`Processing complete. Total rows: ${processedData.length}`);
        
        const companiesWithExistingPhonesData = processedData.filter(row => {
            const originalPhoneColumns = Object.keys(row).filter(key => 
                key.toLowerCase().includes('phone') || 
                key.toLowerCase().includes('number') || 
                key.toLowerCase().includes('contact') ||
                key.toLowerCase().includes('mobile') ||
                key.toLowerCase().includes('tel') ||
                key.toLowerCase().includes('rllt_detail1')
            );
            
            return originalPhoneColumns.some(col => {
                const value = String(row[col] || '');
                const phones = extractPhoneNumbers(value);
                return phones.length > 0;
            });
        });

        const companiesWithoutExistingPhonesData = processedData.filter(row => {
            const originalPhoneColumns = Object.keys(row).filter(key => 
                key.toLowerCase().includes('phone') || 
                key.toLowerCase().includes('number') || 
                key.toLowerCase().includes('contact') ||
                key.toLowerCase().includes('mobile') ||
                key.toLowerCase().includes('tel') ||
                key.toLowerCase().includes('rllt_detail1')
            );
            
            return !originalPhoneColumns.some(col => {
                const value = String(row[col] || '');
                const phones = extractPhoneNumbers(value);
                return phones.length > 0;
            });
        });

        // Create separate sheets for analysis
        const newWorkbook = xlsx.utils.book_new();
        
        // Main processed data sheet
        const mainWorksheet = xlsx.utils.json_to_sheet(processedData);
        xlsx.utils.book_append_sheet(newWorkbook, mainWorksheet, 'All Processed Data');
        
        // Companies with existing phones analysis sheet
        if (companiesWithExistingPhonesData.length > 0) {
            const existingPhonesWorksheet = xlsx.utils.json_to_sheet(companiesWithExistingPhonesData);
            xlsx.utils.book_append_sheet(newWorkbook, existingPhonesWorksheet, 'Existing Phone Numbers');
        }
        
        // Companies that need phone numbers sheet
        if (companiesWithoutExistingPhonesData.length > 0) {
            const needPhonesWorksheet = xlsx.utils.json_to_sheet(companiesWithoutExistingPhonesData);
            xlsx.utils.book_append_sheet(newWorkbook, needPhonesWorksheet, 'Need Phone Numbers');
        }

        // Category-based analysis sheets
        const categories = {};
        processedData.forEach(row => {
            const category = row.category || 'Uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(row);
        });

        // Create separate sheets for each category
        Object.keys(categories).sort().forEach(category => {
            if (categories[category].length > 0) {
                const categoryWorksheet = xlsx.utils.json_to_sheet(categories[category]);
                // Sanitize sheet name by removing invalid characters
                let sheetName = category.replace(/[\/\\?*[\]:]/g, '-');
                sheetName = sheetName.length > 25 ? sheetName.substring(0, 22) + '...' : sheetName;
                xlsx.utils.book_append_sheet(newWorkbook, categoryWorksheet, sheetName);
            }
        });

        // Create category summary sheet
        const categorySummary = Object.keys(categories).sort().map(category => ({
            'Category': category,
            'Count': categories[category].length,
            'Percentage': ((categories[category].length / processedData.length) * 100).toFixed(2) + '%',
            'With Email': categories[category].filter(row => row.email && row.email.trim()).length,
            'With Phone': categories[category].filter(row => row.phone && row.phone.trim()).length,
            'With Both': categories[category].filter(row => 
                row.email && row.email.trim() && row.phone && row.phone.trim()
            ).length
        }));

        const summaryWorksheet = xlsx.utils.json_to_sheet(categorySummary);
        xlsx.utils.book_append_sheet(newWorkbook, summaryWorksheet, 'Category Summary');
        
        const processedFilename = `processed-${Date.now()}.xlsx`;
        const processedFilePath = path.join(__dirname, 'uploads', processedFilename);
        
        console.log('Writing Excel file to:', processedFilePath);
        xlsx.writeFile(newWorkbook, processedFilePath);
        
        // Verify file was created
        if (require('fs').existsSync(processedFilePath)) {
            const stats = require('fs').statSync(processedFilePath);
            console.log(`File created successfully. Size: ${stats.size} bytes`);
        } else {
            console.error('ERROR: File was not created!');
        }

        const processingTime = Date.now() - startTime;

        // Save to database
        const uploadRecord = new UploadHistory({
            originalFilename,
            processedFilename,
            totalRows: processedData.length,
            processedRows: processedData.filter(row => row.scrapeStatus === 'Success').length,
            status: 'completed',
            processingTime
        });
        await uploadRecord.save();

        // Clean up original file
        require('fs').unlinkSync(filePath);

        res.json({
            success: true,
            message: 'File processed successfully',
            processedFilename,
            totalRows: processedData.length,
            processedRows: processedData.filter(row => row.scrapeStatus === 'Success').length,
            companiesWithExistingPhones: companiesWithExistingPhonesData.length,
            companiesWithoutExistingPhones: companiesWithoutExistingPhonesData.length,
            processingTime: Math.round(processingTime / 1000)
        });

    } catch (error) {
        console.error('Excel Scraper upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Excel Scraper check file endpoint
app.get('/api/excel-scraper/check/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);

        console.log('Check file request for:', filename);
        console.log('File path:', filePath);

        const exists = require('fs').existsSync(filePath);
        
        if (exists) {
            const stats = require('fs').statSync(filePath);
            res.json({ 
                exists: true, 
                size: stats.size,
                created: stats.birthtime,
                message: 'File is available for download'
            });
        } else {
            res.json({ 
                exists: false, 
                message: 'File has been expired or deleted. Please re-upload your Excel file to generate a new processed file.' 
            });
        }
    } catch (error) {
        console.error('Check file error:', error);
        res.status(500).json({ error: 'Error checking file' });
    }
});

// Excel Scraper download endpoint
app.get('/api/excel-scraper/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);

        console.log('Download request for:', filename);
        console.log('File path:', filePath);

        if (!require('fs').existsSync(filePath)) {
            console.log('File not found:', filePath);
            return res.status(404).json({ 
                error: 'File not found',
                message: 'The processed file has been expired or deleted. Please re-upload your Excel file to generate a new processed file.',
                filename: filename
            });
        }

        console.log('File exists, serving download...');
        res.download(filePath, `processed-${filename}`, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            } else {
                console.log('File downloaded successfully');
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error downloading file' });
        }
    }
});

// Excel Scraper clear history endpoint
app.delete('/api/excel-scraper/history', async (req, res) => {
    try {
        const result = await UploadHistory.deleteMany({});
        console.log(`Cleared ${result.deletedCount} records from upload history`);
        res.json({
            success: true,
            message: `Cleared ${result.deletedCount} records from upload history`,
            count: result.deletedCount
        });
    } catch (error) {
        console.error('Clear history error:', error);
        res.status(500).json({ error: 'Error clearing history' });
    }
});

// Regular Upload history endpoint
app.get('/api/upload/history', async (req, res) => {
    try {
        const history = await FileUploadHistory.find().sort({ uploadDate: -1 }).limit(50);
        res.json(history);
    } catch (error) {
        console.error('Upload history error:', error);
        res.status(500).json({ error: 'Error fetching upload history' });
    }
});

// Regular file download endpoint
app.get('/api/upload/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);

        console.log('Download request for uploaded file:', filename);
        console.log('File path:', filePath);

        if (!require('fs').existsSync(filePath)) {
            console.log('File not found:', filePath);
            return res.status(404).json({ 
                error: 'File not found',
                message: 'The uploaded file has been deleted or expired'
            });
        }

        console.log('File exists, serving download...');
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            } else {
                console.log('File downloaded successfully');
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error downloading file' });
        }
    }
});

// Excel Scraper history endpoint
app.get('/api/excel-scraper/history', async (req, res) => {
    try {
        const history = await UploadHistory.find().sort({ uploadDate: -1 }).limit(10);
        res.json(history);
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: 'Error fetching history' });
    }
});

// Excel Scraper health endpoint
app.get('/api/excel-scraper/health', (req, res) => {
    res.json({ status: 'Excel Scraper server is running', timestamp: new Date().toISOString() });
});

// Excel Scraper test scrape endpoint
app.get('/api/excel-scraper/test-scrape', async (req, res) => {
    try {
        const testUrl = req.query.url || 'https://example.com';
        console.log(`Testing scrape with URL: ${testUrl}`);
        
        const result = await scrapeWebsite(testUrl);
        
        const testUrls = [
            'https://example.com',
            'https://httpbin.org/html',
            'https://github.com'
        ];
        
        if (req.query.all === 'true') {
            const results = await Promise.all(
                testUrls.map(async (url) => {
                    try {
                        const scrapeResult = await scrapeWebsite(url);
                        return { url, ...scrapeResult };
                    } catch (error) {
                        return { url, success: false, error: error.message };
                    }
                })
            );
            
            res.json({
                testUrls,
                results,
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                url: testUrl,
                result,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('Test scrape error:', error);
        res.status(500).json({ error: error.message });
    }
});


  
        
// Google Maps Scraper API Routes

app.post('/api/detect-categories', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }).catch(async () => {
      // Fallback: try without executablePath
      return await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1400, height: 900 });
    
    console.log('Loading page for category detection...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const categories = await detectCategories(page);
    
    await browser.close();
    res.json({ success: true, categories, count: categories.length });
  } catch (error) {
    if (browser) await browser.close();
    console.error('Category detection error:', error);
    res.status(500).json({ error: 'Category detection failed: ' + error.message });
  }
});

app.post('/api/google-maps-scrape', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }).catch(async () => {
      // Fallback: try without executablePath
      return await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setViewport({ width: 1400, height: 900 });
    
    console.log('Loading page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    // Wait for results to load
    await page.waitForSelector('[role="feed"]', { timeout: 30000 }).catch(() => {
      console.log('Feed selector not found, continuing anyway...');
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const results = await scrapeAllData(page);

    // Save to history
    try {
      const historyEntry = new GoogleMapsHistory({
        url: url,
        businessCount: results.length,
        data: results
      });
      await historyEntry.save();
      console.log('Google Maps scrape history saved successfully');
    } catch (historyError) {
      console.error('Error saving Google Maps history:', historyError);
      // Don't fail request if history saving fails
    }

    await browser.close();
    res.json({ success: true, data: results, count: results.length });
  } catch (error) {
    if (browser) await browser.close();
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Scraping failed: ' + error.message });
  }
});

async function scrapeAllData(page) {
  const allResults = new Map();
  const seenNames = new Set();
  
  console.log('Starting extraction...');
  
  // Wait for results container
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  let scrollAttempts = 0;
  const maxAttempts = 50; // Enough for 300+ businesses
  let lastCount = 0;
  let stagnantCount = 0;
  
  while (scrollAttempts < maxAttempts && allResults.size < 300 && stagnantCount < 20) {
    
    // Extract current results
    const extracted = await page.evaluate(() => {
      const items = [];
      
      // Find all result cards - updated selectors for current Google Maps structure
      let cards = [];
      
      // Try multiple modern selectors for Google Maps results
      cards = document.querySelectorAll('[role="feed"] > div > div[jsaction]');
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('[data-result-index]');
      }
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('.Nv2PKTHOPQKb');
      }
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('.lXJj5c');
      }
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('[role="article"]');
      }
      
      if (cards.length === 0) {
        cards = document.querySelectorAll('a[href*="/maps/place/"]');
      }
      
      if (cards.length === 0) {
        // Fallback 1: find all divs that contain business information
        const allDivs = document.querySelectorAll('div');
        cards = Array.from(allDivs).filter(div => {
          const text = div.textContent || '';
          return text.includes('★') && (text.includes('·') || text.includes('+'));
        });
      }
      
      if (cards.length === 0) {
        // Fallback 2: Look for any element with business-like content
        const allElements = document.querySelectorAll('*');
        cards = Array.from(allElements).filter(el => {
          const text = el.textContent || '';
          const hasRating = text.includes('★') || text.includes('stars');
          const hasBusinessInfo = text.includes('·') || text.includes('+') || text.match(/\d+\s*reviews?/i);
          const hasName = text.length > 5 && text.length < 100;
          return hasRating && hasBusinessInfo && hasName;
        });
      }
      
      if (cards.length === 0) {
        // Fallback 3: Try to find business data by looking for specific patterns
        const bodyText = document.body.textContent || '';
        console.log('Page content sample:', bodyText.substring(0, 1000));
        
        // Look for business patterns in the entire page
        const businessPattern = /([A-Za-z\s&'-]+)\s*★\s*[\d.]+\s*·\s*([^★·\n]+(?:\n[^★·\n]+)*)/g;
        const matches = bodyText.match(businessPattern);
        if (matches && matches.length > 0) {
          console.log(`Found ${matches.length} business patterns in page text`);
          cards = matches.map((match, index) => ({
            outerHTML: `<div>Business ${index + 1}: ${match}</div>`,
            textContent: match,
            querySelector: () => null
          }));
        }
      }
      
      console.log(`Found ${cards.length} result cards`);
      
      // Debug: Log the first few cards to understand structure
      if (cards.length > 0) {
        console.log('First card HTML structure:');
        console.log(cards[0].outerHTML.substring(0, 500) + '...');
      }
      
      cards.forEach((card, index) => {
        try {
          // Extract Name
          let name = '';
          const nameSelectors = [
            '.qBF1Pd',
            '.fontHeadlineSmall',
            'a[href*="/maps/place/"]',
            'h3',
            '[aria-label*="star"]',
            '.liveresults',
            '.fontBodyMedium',
            '.t39EBf',
            '.hfpxzc',
            '[data-attrid="title"]'
          ];
          
          for (const selector of nameSelectors) {
            const el = card.querySelector(selector);
            if (el) {
              let text = el.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) {
                // Clean up name - remove rating and other suffixes
                text = text.split('·')[0].split('★')[0].split('(')[0].trim();
                if (text.length > 2) {
                  name = text;
                  break;
                }
              }
            }
          }
          
          if (!name || name.length < 2) return;
          if (name.includes('Sponsored') || name.includes('Ad')) return;
          
          // Extract Address - IMPROVED with business type filtering
          let address = '';
          
          // Common business types to exclude from address
          const businessTypes = [
            'chartered accountant', 'ca', 'accountant', 'lawyer', 'advocate', 'doctor', 'dr', 'physician',
            'dentist', 'hospital', 'clinic', 'restaurant', 'hotel', 'school', 'college', 'university',
            'bank', 'atm', 'pharmacy', 'medical store', 'grocery', 'supermarket', 'shop', 'store',
            'salon', 'parlor', 'gym', 'fitness', 'station', 'agency', 'consultant', 'service',
            'company', 'office', 'firm', 'center', 'centre', 'institute', 'academy'
          ];
          
          // Function to check if text contains business types
          function containsBusinessType(text) {
            const lowerText = text.toLowerCase();
            return businessTypes.some(type => lowerText.includes(type));
          }
          
          // Function to check if text looks like a real address
          function looksLikeAddress(text) {
            // Must have at least one address indicator
            const hasAddressIndicator = 
              text.match(/\d/) || // Contains numbers
              text.includes('Road') || 
              text.includes('Street') || 
              text.includes('Marg') ||
              text.includes('Nagar') ||
              text.includes('Colony') ||
              text.includes('Area') ||
              text.includes('District') ||
              text.includes('City') ||
              text.includes('Floor') ||
              text.includes('Above') ||
              text.includes('Near') ||
              text.includes('Metro') ||
              text.includes('Pillar') ||
              text.includes('Village') ||
              text.includes('Building') ||
              text.includes('Tower') ||
              /[A-Za-z]+\s+\d+/.test(text); // Letter + number pattern
              
            // Must not be primarily a business type
            const notBusinessType = !containsBusinessType(text);
            
            return hasAddressIndicator && notBusinessType;
          }
          
          // Try multiple address selectors
          const addressSelectors = [
            '.W4Efsd:not(:has(.W4Efsd))',
            '.fontBodySmall',
            '.W8CcMe',
            '.RZC5L',
            '[data-item-id="address"]',
            '.QvFfWe',
            '.UsdlK',
            'div:not([class])'
          ];
          
          for (const selector of addressSelectors) {
            const elements = card.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.textContent?.trim();
              if (text && text.length > 10 && text.length < 300) {
                if (looksLikeAddress(text)) {
                  address = text;
                  break;
                }
              }
            }
            if (address) break;
          }
          
          // If no address found, try to get from full text with better filtering
          if (!address) {
            const allText = card.innerText;
            const lines = allText.split('\n');
            
            // Look for address-like lines, excluding business types
            for (let i = 1; i < Math.min(lines.length, 6); i++) {
              const line = lines[i].trim();
              if (line.length > 10 && line.length < 300 && looksLikeAddress(line)) {
                address = line;
                break;
              }
            }
            
            // If still no address, try combining multiple lines that look address-like
            if (!address && lines.length > 2) {
              let potentialAddress = '';
              for (let i = 1; i < Math.min(lines.length, 5); i++) {
                const line = lines[i].trim();
                if (line.length > 5 && !containsBusinessType(line)) {
                  potentialAddress += (potentialAddress ? ', ' : '') + line;
                }
              }
              if (potentialAddress.length > 20 && looksLikeAddress(potentialAddress)) {
                address = potentialAddress;
              }
            }
          }
          
          // Extract Phone - IMPROVED
          let phone = '';
          const phoneSelectors = [
            '.UsdlK',
            '[data-item-id="phone"]',
            '.lA4Bhb',
            'span[aria-label*="phone"]',
            'a[href^="tel:"]'
          ];
          
          for (const selector of phoneSelectors) {
            const el = card.querySelector(selector);
            if (el) {
              let text = el.textContent || el.getAttribute('aria-label') || '';
              const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{3,4}[\-]?[0-9]{0,4}/);
              if (phoneMatch) {
                phone = phoneMatch[0];
                break;
              }
            }
          }
          
          // Extract Website
          let website = '';
          const links = card.querySelectorAll('a[href]');
          for (const link of links) {
            const href = link.href;
            if (href && 
                (href.startsWith('http://') || href.startsWith('https://')) &&
                !href.includes('google.com') &&
                !href.includes('maps.google') &&
                href.length < 200) {
              website = href;
              break;
            }
          }
          
          // Extract Rating
          let rating = '';
          const ratingEl = card.querySelector('.MW4etd') || 
                          card.querySelector('[aria-label*="stars"]') ||
                          card.querySelector('.fontBodyMedium');
          if (ratingEl) {
            const text = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
            const match = text.match(/(\d+\.?\d*)/);
            if (match) rating = match[1];
          }
          
          // Extract Category
          let category = '';
          const categorySelectors = [
            '.fontBodySmall .qBF1Pd',
            '.W4Efsd .qBF1Pd',
            '.UsdlK .qBF1Pd',
            '.lXJj5c .fontBodySmall',
            '[data-item-id="category"]',
            '.QvFfWe',
            '.RZC5L'
          ];
          
          for (const selector of categorySelectors) {
            const el = card.querySelector(selector);
            if (el) {
              let text = el.textContent?.trim();
              if (text && text.length > 0 && text.length < 100 && 
                  !text.includes('★') && !text.match(/\d+/)) {
                category = text;
                break;
              }
            }
          }
          
          // If no category found, try to infer from business name and context
          if (!category) {
            const allText = card.innerText;
            const lines = allText.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.length > 3 && trimmed.length < 50 && 
                  !trimmed.match(/\d+/) && 
                  !trimmed.includes('★') && 
                  !trimmed.includes('·') &&
                  !trimmed.toLowerCase().includes('closed') &&
                  !trimmed.toLowerCase().includes('open')) {
                category = trimmed;
                break;
              }
            }
          }
          
          items.push({
            name: name,
            address: address || 'Address not found',
            phone: phone || 'N/A',
            website: website || 'N/A',
            rating: rating || 'N/A',
            category: category || 'Unknown'
          });
          
        } catch(e) {
          console.log(`Card ${index} error:`, e.message);
        }
      });
      
      return items;
    });
    
    // Add new items to results
    let newItems = 0;
    extracted.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allResults.set(key, item);
        newItems++;
      }
    });
    
    console.log(`Round ${scrollAttempts + 1}: Found ${extracted.length} items, ${newItems} new. Total: ${allResults.size}`);
    
    // Check if we're making progress
    if (allResults.size === lastCount) {
      stagnantCount++;
      console.log(`No new items found. Stagnant count: ${stagnantCount}/20`);
    } else {
      stagnantCount = 0;
      lastCount = allResults.size;
    }
    
    if (allResults.size >= 300) {
      console.log('Reached 300 businesses target!');
      break;
    }
    
    // Scroll to load more results
    await page.evaluate(async () => {
      // Find the scrollable container
      const scrollableDiv = document.querySelector('[role="feed"]') || 
                           document.querySelector('.m6QEHe') ||
                           document.querySelector('.lXJj5c') ||
                           document.querySelector('[role="main"]');
      
      if (scrollableDiv) {
        // Scroll to bottom
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Scroll again to trigger loading
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
      } else {
        window.scrollBy(0, window.innerHeight);
      }
    });
    
    // Wait for new content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to click any "More results" button
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        const aria = btn.getAttribute('aria-label')?.toLowerCase() || '';
        if (text.includes('more') || aria.includes('more') || text.includes('load')) {
          btn.click();
          break;
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    scrollAttempts++;
  }
  
  console.log(`\n========== SCRAPING COMPLETE ==========`);
  console.log(`Total businesses found: ${allResults.size}`);
  console.log(`Total scroll attempts: ${scrollAttempts}`);
  
  // Log sample of extracted data
  if (allResults.size > 0) {
    console.log('\nSample of extracted data:');
    const sample = Array.from(allResults.values()).slice(0, 3);
    sample.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.name}`);
      console.log(`   Address: ${item.address}`);
      console.log(`   Phone: ${item.phone}`);
      console.log(`   Website: ${item.website}`);
      console.log(`   Rating: ${item.rating}`);
      console.log(`   Category: ${item.category}`);
    });
  }
  
  return Array.from(allResults.values());
}

async function detectCategories(page) {
  console.log('Detecting categories...');
  
  const categories = await page.evaluate(() => {
    const categorySet = new Set();
    
    // Find all result cards
    let cards = document.querySelectorAll('[role="feed"] > div > div');
    if (cards.length === 0) cards = document.querySelectorAll('.Nv2PK');
    if (cards.length === 0) cards = document.querySelectorAll('[data-result-index]');
    if (cards.length === 0) cards = document.querySelectorAll('.lXJj5c');
    
    cards.forEach(card => {
      try {
        // Try multiple category selectors
        const categorySelectors = [
          '.fontBodySmall .qBF1Pd',
          '.W4Efsd .qBF1Pd',
          '.UsdlK .qBF1Pd',
          '.lXJj5c .fontBodySmall',
          '[data-item-id="category"]',
          '.QvFfWe',
          '.RZC5L'
        ];
        
        for (const selector of categorySelectors) {
          const el = card.querySelector(selector);
          if (el) {
            let text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 100 && 
                !text.includes('★') && !text.match(/\d+/)) {
              categorySet.add(text);
              break;
            }
          }
        }
        
        // If no category found, try to infer from business context
        if (!categorySet.size) {
          const allText = card.innerText;
          const lines = allText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 3 && trimmed.length < 50 && 
                !trimmed.match(/\d+/) && 
                !trimmed.includes('★') && 
                !trimmed.includes('·') &&
                !trimmed.toLowerCase().includes('closed') &&
                !trimmed.toLowerCase().includes('open')) {
              categorySet.add(trimmed);
              break;
            }
          }
        }
      } catch(e) {
        console.log('Category detection error:', e.message);
      }
    });
    
    return Array.from(categorySet).filter(cat => cat && cat.length > 0);
  });
  
  console.log(`Found ${categories.length} unique categories`);
  return categories;
}

app.post('/api/download', async (req, res) => {
  const { data, filename = 'google-maps-data.xlsx' } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  // Convert data to worksheet format
  const wsData = data.map(item => ({
    'Name': item.name || '',
    'Address': item.address || '',
    'Phone': item.phone || '',
    'Website': item.website || ''
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'Businesses');
  
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// Google Maps Download Endpoint
app.post('/api/google-maps-download', async (req, res) => {
  const { data, filename = 'google-maps-data.xlsx' } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  // Convert data to worksheet format
  const wsData = data.map(item => ({
    'Name': item.name || '',
    'Address': item.address || '',
    'Phone': item.phone || '',
    'Website': item.website || ''
  }));

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'Businesses');
  
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// Periodic cleanup function for old upload files
const cleanupOldFiles = () => {
    const uploadsDir = path.join(__dirname, 'uploads');
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    try {
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            const now = Date.now();
            
            files.forEach(file => {
                const filePath = path.join(uploadsDir, file);
                try {
                    const stats = fs.statSync(filePath);
                    const fileAge = now - stats.mtime.getTime();
                    
                    if (fileAge > maxAge) {
                        fs.unlinkSync(filePath);
                        console.log('Cleaned up old file:', file);
                    }
                } catch (error) {
                    console.log('Could not process file during cleanup:', file, error.message);
                }
            });
        }
    } catch (error) {
        console.log('Cleanup error:', error.message);
    }
};

// History API endpoints


// Get Google Maps scraper history
app.get('/api/google-maps-history', async (req, res) => {
  try {
    const history = await GoogleMapsHistory.find()
      .sort({ scrapeDate: -1 })
      .limit(50); // Limit to last 50 entries
    
    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error('Error fetching Google Maps history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch history',
      message: error.message 
    });
  }
});


// Get Google Maps history by ID
app.get('/api/google-maps-history/:id', async (req, res) => {
  try {
    const historyEntry = await GoogleMapsHistory.findById(req.params.id);
    
    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      data: historyEntry
    });
  } catch (error) {
    console.error('Error fetching Google Maps history entry:', error);
    res.status(500).json({ 
      error: 'Failed to fetch history entry',
      message: error.message 
    });
  }
});


// Delete Google Maps history entry
app.delete('/api/google-maps-history/:id', async (req, res) => {
  try {
    const historyEntry = await GoogleMapsHistory.findByIdAndDelete(req.params.id);
    
    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      message: 'History entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Google Maps history entry:', error);
    res.status(500).json({ 
      error: 'Failed to delete history entry',
      message: error.message 
    });
  }
});


// Download all Google Maps history data
app.post('/api/download/google-maps-history', async (req, res) => {
  try {
    const history = await GoogleMapsHistory.find()
      .sort({ scrapeDate: -1 });
    
    if (history.length === 0) {
      return res.status(404).json({ error: 'No history data found' });
    }

    // Combine all data from all history entries
    const allData = [];
    history.forEach(entry => {
      entry.data.forEach(business => {
        allData.push({
          'Business Name': business.name || '',
          'Address': business.address || '',
          'Phone': business.phone || '',
          'Website': business.website || '',
          'Rating': business.rating || '',
          'Category': business.category || '',
          'Scrape Date': new Date(entry.scrapeDate).toLocaleString(),
          'Original URL': entry.url || ''
        });
      });
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(allData);
    xlsx.utils.book_append_sheet(wb, ws, 'All History Data');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="google-maps-complete-history.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Download history error:', error);
    res.status(500).json({ error: 'Failed to download history data' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Export to Excel
app.post('/api/export/excel', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data to export' });
    }

    const exportData = data.map(business => ({
      'Business Name': business.name || '',
      'Phone Number': business.phone || '',
      'Address': business.address || '',
      'City': business.city || '',
      'Category': business.category || '',
      'Image': business.image || ''
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportData);
    xlsx.utils.book_append_sheet(wb, ws, 'Business Data');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="business-data.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

// Export to CSV
app.post('/api/export/csv', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'No data to export' });
    }

    const headers = ['Business Name', 'Phone Number', 'Address', 'City', 'Category', 'Image'];
    const rows = data.map(business => [
      business.name || '',
      business.phone || '',
      business.address || '',
      business.city || '',
      business.category || '',
      business.image || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="business-data.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Run initial cleanup
    cleanupOldFiles();
});
