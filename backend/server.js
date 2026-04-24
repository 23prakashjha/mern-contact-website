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

// Rate limiting for Excel Scraper endpoints
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/excel-scraper/', limiter);

// Add request delay middleware to prevent rapid requests
app.use('/api/scrape', (req, res, next) => {
  // Add random delay to prevent rate limiting
  const delay = Math.random() * 2000 + 1000; // 1-3 seconds random delay
  setTimeout(next, delay);
});

// Rate limiting - more restrictive to prevent IP blocking
const scrapingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs (increased from 3)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});
app.use('/api/', scrapingLimiter);

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

// Justdial Scraper History Schema
const justdialHistorySchema = new mongoose.Schema({
    url: String,
    category: String,
    businessCount: Number,
    scrapeDate: { type: Date, default: Date.now },
    status: { type: String, default: 'completed' },
    data: [{
        name: String,
        phone: String,
        email: String,
        address: String,
        category: String,
        rating: String,
        reviews: String
    }]
});

const JustdialHistory = mongoose.model('JustdialHistory', justdialHistorySchema);

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
    
    // Pattern 1: Standard email regex
    const standardEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const standardMatches = text.match(standardEmailRegex) || [];
    emails.push(...standardMatches);
    
    // Pattern 2: Handle concatenated emails like "thedentalcureg@gmail.comthedentalcureg"
    const concatenatedRegex = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const concatenatedMatches = text.match(concatenatedRegex) || [];
    emails.push(...concatenatedMatches);
    
    // Pattern 3: Handle UUID-style emails (sentry/wixpress style)
    const uuidRegex = /\b[a-f0-9]{32}@(?:sentry(?:-next)?\.wixpress\.com|sentry\.io)\b/g;
    const uuidMatches = text.match(uuidRegex) || [];
    emails.push(...uuidMatches);
    
    // Pattern 4: Handle emails with domain duplication like "gmail.comthedentalcureg@gmail.com"
    const domainDuplicationRegex = /(?:[a-z]+\.(?:com|net|org|co|in))?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const domainDuplicationMatches = text.match(domainDuplicationRegex) || [];
    emails.push(...domainDuplicationMatches);
    
    // Pattern 5: Handle phone+email combinations
    const phoneEmailRegex = /(?:\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4,})?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const phoneEmailMatches = text.match(phoneEmailRegex) || [];
    emails.push(...phoneEmailMatches);
    
    // Pattern 6: Handle mixed content with action words
    const mixedContentRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:phone|call|book|schedule|homeabout|info|enquiries)?/g;
    const mixedContentMatches = text.match(mixedContentRegex) || [];
    emails.push(...mixedContentMatches);
    
    // Pattern 7: Extract emails from complex concatenated strings
    // Examples: "himanshu.a178@gmail.comhimanshu.a178@gmail.com"
    const complexConcatRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const complexConcatMatches = text.match(complexConcatRegex) || [];
    emails.push(...complexConcatMatches);
    
    // Remove duplicates and filter valid emails
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
            
            // Username shouldn't start with digit (but allow for some cases)
            if (username.match(/^\d{10,}$/)) return false; // Exclude pure numbers
            
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
        'garima_clinic@yahoo.inphone'
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
                await this.page.waitForTimeout(this.scrollDelay);
                
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
            await this.page.waitForTimeout(2000);
            
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
                        
                        await this.page.waitForTimeout(1500);
                        await this.scrollToBottom();
                        
                        const contactPageData = await this.extractContactInfoFromPage();
                        allText += ' ' + contactPageData.text;
                        visitedPages.push(contactUrl);
                        
                        // Delay between page navigations
                        await this.page.waitForTimeout(this.pageDelay);
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
const whatsappService = new WhatsAppService();
const smsService = new SMSService();

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

// JustdialScraper Class
class JustdialScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      console.log('Initializing Justdial scraper...');
      
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

      console.log('Justdial scraper initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Justdial scraper:', error);
      return false;
    }
  }

  // Helper function to categorize companies
  categorizeCompany(companyName) {
    if (!companyName || typeof companyName !== 'string') {
      return 'Business/Other';
    }
    
    const name = companyName.toLowerCase().trim();
    
    // Electrical categories
    if (name.includes('electrical') || name.includes('electrician') || name.includes('wiring') || 
        name.includes('contractor') || name.includes('repair')) {
      return 'Electrical Services';
    }
    
    // Medical categories
    if (name.includes('doctor') || name.includes('hospital') || name.includes('clinic') || 
        name.includes('medical') || name.includes('health')) {
      return 'Healthcare/Medical';
    }
    
    // Education categories
    if (name.includes('school') || name.includes('college') || name.includes('university') || 
        name.includes('institute') || name.includes('education')) {
      return 'Education';
    }
    
    // Food categories
    if (name.includes('restaurant') || name.includes('hotel') || name.includes('cafe') || 
        name.includes('food') || name.includes('dining')) {
      return 'Food & Dining';
    }
    
    // Shopping categories
    if (name.includes('shop') || name.includes('store') || name.includes('mall') || 
        name.includes('retail') || name.includes('market')) {
      return 'Shopping/Retail';
    }
    
    // Service categories
    if (name.includes('service') || name.includes('solution') || name.includes('consultant') || 
        name.includes('agency') || name.includes('professional')) {
      return 'Professional Services';
    }
    
    return 'Business/Other';
  }

  // Helper function to clean category names
  cleanCategoryName(category) {
    if (!category || typeof category !== 'string') {
      return 'General';
    }
    
    let cleaned = category.trim();
    
    // Remove common prefixes and suffixes
    cleaned = cleaned.replace(/^(in|at|for|of|near|the)\s+/i, '');
    cleaned = cleaned.replace(/\s+(in|at|for|of|near|the)$/i, '');
    
    // Remove special characters and extra spaces
    cleaned = cleaned.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Capitalize first letter of each word
    cleaned = cleaned.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    // Limit length
    if (cleaned.length > 50) {
      cleaned = cleaned.substring(0, 47) + '...';
    }
    
    return cleaned || 'General';
  }

  async scrapeBusinessData(url, detectedCategory = '') {
    try {
      await this.initialize();
      
      // Store detected category globally for use in extraction
      if (detectedCategory) {
        await this.page.evaluate((category) => {
          window.detectedCategory = category;
        }, detectedCategory);
      }
      
      console.log('Navigating to URL:', url);
      
      // Enhanced navigation with exponential backoff
      let accessDenied = true;
      let attempts = 0;
      const maxAttempts = 5;
      let baseDelay = 4000;
      
      while (accessDenied && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts} of ${maxAttempts}`);
        
        try {
          // Calculate exponential backoff delay
          const delay = baseDelay * Math.pow(2, attempts - 1) + Math.random() * 2000;
          
          if (attempts > 1) {
            console.log(`Waiting ${Math.round(delay/1000)}s before retry to prevent rate limiting...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Add human-like interactions before retry
            await this.page.evaluate(() => {
              window.scrollTo(0, Math.floor(Math.random() * 300));
              document.dispatchEvent(new MouseEvent('mousemove', {
                clientX: Math.random() * window.innerWidth,
                clientY: Math.random() * window.innerHeight
              }));
              document.dispatchEvent(new MouseEvent('scroll', {
                clientY: Math.random() * 100
              }));
            });
          }
          
          // Navigate with different wait strategies
          if (attempts === 1) {
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          } else if (attempts === 2) {
            await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
          } else {
            await this.page.goto(url, { waitUntil: 'load', timeout: 60000 });
          }
          
          // Wait for content to load with random delay
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5000 + 3000));
          
          // Check for access denied
          const pageTitle = await this.page.title();
          const pageContent = await this.page.content();
          
          console.log('Page title:', pageTitle);
          console.log('Current URL:', this.page.url());
          
          // Enhanced access denied detection
          accessDenied = 
            pageTitle.includes('Access Denied') ||
            pageTitle.includes('403') ||
            pageTitle.includes('Blocked') ||
            pageTitle.includes('Robot Check') ||
            pageTitle.includes('CAPTCHA') ||
            pageTitle.includes('Security Check') ||
            pageTitle.includes('Too Many Requests') ||
            pageTitle.includes('Justdial - Error') ||
            pageTitle.includes('Page not found') ||
            pageContent.includes('Access Denied') ||
            pageContent.includes('403 Forbidden') ||
            pageContent.includes('captcha') ||
            pageContent.includes('robot') ||
            pageContent.includes('security check') ||
            pageContent.includes('rate limit') ||
            pageContent.includes('too many requests') ||
            pageContent.includes('cloudflare') ||
            pageContent.includes('challenge') ||
            pageContent.includes('bot detection') ||
            pageContent.includes('suspicious activity');
          
          if (accessDenied) {
            console.log('Access denied/rate limited detected, trying different approach...');
            
            if (attempts === 1) {
              // Try refreshing the page
              await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
            } else if (attempts === 2) {
              // Try navigating to a different page first
              await this.page.goto('https://www.justdial.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
              await new Promise(resolve => setTimeout(resolve, 2000));
              await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            } else if (attempts === 3) {
              // Try clearing cookies and navigating again
              await this.page.evaluate(() => {
                document.cookie.split(";").forEach(function(c) { 
                  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                });
              });
              await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            }
          } else {
            console.log('Successfully accessed the page!');
            break;
          }
          
        } catch (error) {
          console.log(`Navigation attempt ${attempts} failed:`, error.message);
          if (attempts >= maxAttempts) {
            throw error;
          }
        }
      }
      
      if (accessDenied) {
        console.log('Still getting access denied after all attempts, attempting to extract anyway...');
        try {
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (e) {
          console.log('Wait timeout, proceeding anyway...');
        }
      }
      
      // Use the new pagination handler to get all businesses
      console.log('Starting pagination-aware scraping...');
      const businessData = await this.handlePagination();
      
      // If no businesses found with pagination, try the old method as fallback
      if (businessData.length === 0) {
        console.log('No businesses found with pagination, trying fallback method...');
        await this.enhancedAutoScroll();
        const fallbackData = await this.extractBusinessesFromCurrentPage();
        return fallbackData;
      }
    
      console.log(`Found ${businessData.length} businesses`);
      
      // If no businesses found with specific selectors, try generic approach
      if (businessData.length === 0) {
        console.log('Trying generic data extraction approach...');
        const genericData = await this.extractGenericData();
        console.log(`Generic approach found ${genericData.length} businesses`);
        return genericData;
      }
    
      return businessData;
    
    } catch (error) {
      console.error('Scraping error:', error);
      
      if (error.message.includes('Runtime.callFunctionOn timed out') || 
          error.message.includes('protocolTimeout')) {
        console.log('Timeout error detected, attempting graceful recovery...');
        throw new Error(`Scraping timeout: The page took too long to respond. Please try again in a few minutes.`);
      }
      
      if (error.message.includes('net::ERR_') || error.message.includes('Navigation timeout')) {
        throw new Error(`Network error: Unable to reach the website. Please check your internet connection and try again.`);
      }
      
      throw new Error(`Failed to scrape data: ${error.message}`);
    } finally {
      await this.close();
    }
  }

  async handlePagination() {
    console.log('Checking for pagination and loading more results...');
    
    let allBusinesses = [];
    let currentPage = 1;
    const maxPages = 50; // Increased to allow more pages for 100+ businesses
    let loadMoreFound = true;
    let consecutiveEmptyPages = 0;
    const maxEmptyPages = 5; // Allow more empty pages before stopping
    
    while (loadMoreFound && currentPage <= maxPages && allBusinesses.length < 200) {
      console.log(`=== PROCESSING PAGE ${currentPage} COMPLETELY ===`);
      
      // ... (rest of the code remains the same)
      console.log(`Page ${currentPage}: Waiting for initial content to load...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 2: Scroll to end of page to trigger ALL lazy loading
      console.log(`Page ${currentPage}: Scrolling to end to load ALL businesses...`);
      await this.scrollToEndOfPage();
      
      // Step 3: Extract ALL businesses from current page
      console.log(`Page ${currentPage}: Extracting ALL businesses from this page...`);
      const pageBusinesses = await this.extractBusinessesFromCurrentPage();
      console.log(`Page ${currentPage}: Found ${pageBusinesses.length} businesses`);
      
      // Step 4: Add all businesses from this page to our collection
      console.log(`Page ${currentPage}: Adding ${pageBusinesses.length} businesses to collection...`);
      const previousCount = allBusinesses.length;
      allBusinesses.push(...pageBusinesses);
      const newBusinessesCount = allBusinesses.length - previousCount;
      console.log(`Page ${currentPage}: Total businesses so far: ${allBusinesses.length} (Added ${newBusinessesCount} new)`);
      
      // Step 5: Check if we've reached our target
      if (allBusinesses.length >= 100) {
        console.log(`Target achieved! Found ${allBusinesses.length} businesses.`);
        break;
      }
      
      // Step 6: Check for empty pages
      if (pageBusinesses.length === 0) {
        consecutiveEmptyPages++;
        console.log(`Page ${currentPage}: Empty page detected (${consecutiveEmptyPages}/${maxEmptyPages})`);
        if (consecutiveEmptyPages >= maxEmptyPages) {
          console.log('Too many consecutive empty pages, stopping...');
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }
      
      // Step 7: Enhanced pagination detection - try multiple methods
      console.log(`Page ${currentPage}: Looking for next page or load more button...`);
      loadMoreFound = await this.page.evaluate(() => {
        // Method 1: Look for "Load More" button with enhanced selectors
        const loadMoreSelectors = [
          'button[class*="load"]',
          'button[class*="more"]',
          'a[class*="load"]',
          'a[class*="more"]',
          'div[class*="load"] button',
          'div[class*="more"] button',
          '.load-more',
          '.show-more',
          '.view-more',
          '[data-testid*="load"]',
          '[data-testid*="more"]',
          'button:contains("Load More")',
          'button:contains("Show More")',
          'button:contains("View More")',
          'a:contains("Load More")',
          'a:contains("Show More")',
          'a:contains("View More")',
          'button[aria-label*="more"]',
          'button[aria-label*="load"]',
          'div[role="button"]:contains("More")'
        ];
        
        for (const selector of loadMoreSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent?.toLowerCase() || '';
              const isVisible = element.offsetParent !== null;
              
              if (isVisible && (text.includes('load') || text.includes('more') || text.includes('view') || text.includes('show'))) {
                console.log(`Found load more element: ${selector} - "${text}"`);
                element.scrollIntoView({ behavior: 'instant', block: 'center' });
                element.click();
                return true;
              }
            }
          } catch (e) {
            // Continue with next selector
          }
        }
        
        // Method 2: Look for pagination links with enhanced detection
        const paginationSelectors = [
          'a[href*="page-"]',
          'a[class*="page"]',
          'li[class*="page"] a',
          '.pagination a',
          '[data-testid*="page"]',
          'nav[aria-label*="pagination"] a',
          '.pager a',
          'a[href*="?page="]',
          'a[href*="&page="]'
        ];
        
        for (const selector of paginationSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent?.trim() || '';
              const href = element.getAttribute('href') || '';
              const isVisible = element.offsetParent !== null;
              
              // Look for next page link
              if (isVisible && ((text.includes('Next') || text.includes('>') || text.includes('›') || href.includes('page-') || href.includes('?page=')) && 
                  !text.includes('Previous') && !text.includes('<') && !text.includes('‹'))) {
                console.log(`Found pagination link: ${selector} - "${text}" - ${href}`);
                element.scrollIntoView({ behavior: 'instant', block: 'center' });
                element.click();
                return true;
              }
            }
          } catch (e) {
            // Continue with next selector
          }
        }
        
        // Method 3: Look for numbered pagination
        try {
          const pageLinks = document.querySelectorAll('a[href*="page"], .pagination a, .pager a');
          const currentPageNum = parseInt(window.location.search.match(/page=(\d+)/)?.[1] || '1');
          
          for (const link of pageLinks) {
            const pageNum = parseInt(link.textContent?.trim() || '0');
            const href = link.getAttribute('href') || '';
            const isVisible = link.offsetParent !== null;
            
            if (isVisible && pageNum === currentPageNum + 1) {
              console.log(`Found numbered pagination: page ${pageNum} - ${href}`);
              link.scrollIntoView({ behavior: 'instant', block: 'center' });
              link.click();
              return true;
            }
          }
        } catch (e) {
          // Continue
        }
        
        // Method 4: Try to scroll down to trigger infinite scroll
        try {
          const scrollHeight = document.body.scrollHeight;
          const currentScroll = window.scrollY;
          const windowHeight = window.innerHeight;
          
          if (currentScroll + windowHeight < scrollHeight - 100) {
            console.log('Scrolling down to trigger infinite scroll...');
            window.scrollTo(0, scrollHeight);
            return true;
          }
        } catch (e) {
          // Continue
        }
        
        return false;
      });
      
      // Step 8: Move to next page if available
      if (loadMoreFound) {
        console.log(`Page ${currentPage}: Moving to next page...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for new content to load
        currentPage++;
        console.log(`=== PAGE ${currentPage - 1} COMPLETED ===`);
      } else {
        console.log(`Page ${currentPage}: No more pages found - scraping complete`);
        console.log(`=== PAGE ${currentPage} COMPLETED - NO MORE PAGES ===`);
      }
    }
    
    console.log(`Total pages processed: ${currentPage - 1}`);
    console.log(`Total businesses found: ${allBusinesses.length}`);
    
    return allBusinesses;
  }

  async scrollToEndOfPage() {
    console.log('Scrolling to end of page to trigger lazy loading...');
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let previousHeight = 0;
        let noChangeCount = 0;
        let scrollAttempts = 0;
        const maxNoChangeCount = 5; // Reduced for faster processing
        const maxScrollAttempts = 20; // Reduced for faster processing
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const windowHeight = window.innerHeight;
          
          // Scroll in smaller increments for better content detection
          const scrollStep = Math.min(window.innerHeight, 800);
          window.scrollBy(0, scrollStep);
          totalHeight += scrollStep;
          scrollAttempts++;
          
          // Check if new content has loaded
          if (scrollHeight === previousHeight) {
            noChangeCount++;
          } else {
            noChangeCount = 0;
            previousHeight = scrollHeight;
          }
          
          // Enhanced stopping conditions
          const reachedBottom = window.scrollY + windowHeight >= scrollHeight - 100;
          const shouldStop = reachedBottom && noChangeCount >= maxNoChangeCount;
          const maxAttemptsReached = scrollAttempts >= maxScrollAttempts;
          
          if (shouldStop || maxAttemptsReached) {
            clearInterval(timer);
            console.log(`Page scrolling completed. Attempts: ${scrollAttempts}, No change count: ${noChangeCount}`);
            
            // Wait for any remaining lazy-loaded content
            setTimeout(() => {
              // Scroll back to top to ensure all content is accessible
              window.scrollTo(0, 0);
              
              // Trigger any scroll-based lazy loading at the top
              setTimeout(() => {
                window.scrollTo(0, 100);
                setTimeout(() => {
                  window.scrollTo(0, 0);
                  setTimeout(resolve, 1000);
                }, 500);
              }, 500);
            }, 2000);
          }
        }, 500); // Faster scrolling for pagination
      });
    });
  }

  async extractBusinessesFromCurrentPage() {
    return await this.page.evaluate(async () => {
      try {
        console.log('=== EXTRACTING BUSINESSES FROM CURRENT PAGE ===');
        const businesses = [];
        
        // Use comprehensive selectors for 2024 Justdial structure
        let listings = [];
        
        // Updated selector list based on current Justdial structure (2024)
        const possibleSelectors = [
          // Modern Justdial result selectors - updated for 2024
          '[data-testid*="result"]',
          '[data-testid*="listing"]',
          '[data-testid*="business"]',
          '[data-testid*="card"]',
          '[data-testid*="item"]',
          
          // Justdial specific class patterns (2024)
          'div[class*="ResultContainer"]',
          'div[class*="ListingContainer"]',
          'div[class*="BusinessCard"]',
          'div[class*="ServiceCard"]',
          'div[class*="ResultCard"]',
          'div[class*="InfoCard"]',
          
          // Generic but effective patterns
          'div[class*="result"]',
          'div[class*="listing"]',
          'div[class*="card"]',
          'div[class*="item"]',
          'div[class*="business"]',
          'div[class*="service"]',
          'div[class*="vendor"]',
          'div[class*="provider"]',
          
          // React/Next.js patterns (common in modern Justdial)
          'div[class*="jsx-"][class*="result"]',
          'div[class*="jsx-"][class*="listing"]',
          'div[class*="jsx-"][class*="card"]',
          'div[class*="jsx-"][class*="item"]',
          'div[class*="jsx-"][class*="container"]',
          
          // Phone-based selectors (most reliable for business detection)
          'div:has([class*="phone"])',
          'div:has([class*="tel"])',
          'div:has([class*="mobile"])',
          'div:has([class*="call"])',
          'div:has(a[href*="tel:"])',
          'div:has(span[title*="Call"])',
          'div:has(div[title*="Call"])',
          'div:has([data-testid*="phone"])',
          'div:has([data-testid*="contact"])',
          'div:has([class*="contact"])',
          
          // Name-based selectors
          'div:has(h1)',
          'div:has(h2)',
          'div:has(h3)',
          'div:has(h4)',
          'div:has([class*="name"])',
          'div:has([class*="title"])',
          'div:has([class*="heading"])',
          'div:has([class*="business-name"])',
          
          // Address-based selectors
          'div:has([class*="address"])',
          'div:has([class*="location"])',
          'div:has([class*="addr"])',
          'div:has([class*="area"])',
          'div:has([class*="city"])',
          
          // Rating-based selectors (Justdial always shows ratings)
          'div:has([class*="rating"])',
          'div:has([class*="star"])',
          'div:has([class*="review"])',
          'div:has([aria-label*="star"])',
          'div:has([aria-label*="rating"])',
          
          // Generic structural selectors
          'article',
          'section',
          'li',
          'tr',
          'td',
          'div[style*="border"]',
          'div[style*="padding"]',
          'div[style*="margin"]'
        ];
        
        for (const selector of possibleSelectors) {
          const found = document.querySelectorAll(selector);
          console.log(`Selector "${selector}": found ${found.length} elements`);
          if (found.length > 0) {
            listings = found;
            console.log(`Using selector: ${selector} with ${found.length} listings`);
            break;
          }
        }
        
        // Enhanced fallback: ultra-aggressive phone-based approach with better validation
        if (listings.length === 0) {
          console.log('Trying ultra-aggressive phone-based approach...');
          const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
          const allElements = document.querySelectorAll('*');
          const phoneElements = [];
          let totalPhoneMatches = 0;
          
          console.log(`Scanning ${allElements.length} elements for phone numbers...`);
          
          allElements.forEach(element => {
            if (!element) return;
            const text = element.textContent || '';
            if (phoneRegex.test(text)) {
              totalPhoneMatches++;
              
              // Enhanced validation for business elements
              if (element.tagName === 'DIV' || element.tagName === 'ARTICLE' || element.tagName === 'SECTION' || element.tagName === 'LI') {
                const elementText = element.textContent || '';
                const hasValidBusinessContent = this.isValidBusinessContent(elementText);
                
                if (hasValidBusinessContent) {
                  phoneElements.push(element);
                }
              }
              
              // Also check parents for business context with better validation
              let parent = element;
              for (let i = 0; i < 8; i++) {
                if (parent && parent.tagName === 'BODY') break;
                
                const parentText = parent.textContent || '';
                const hasPhone = phoneRegex.test(parentText);
                const hasValidBusinessContent = this.isValidBusinessContent(parentText);
                
                if (hasPhone && hasValidBusinessContent && parentText.length < 1000) {
                  phoneElements.push(parent);
                  break;
                }
                
                parent = parent.parentElement;
              }
            }
          });
          
          const uniquePhoneElements = [...new Set(phoneElements)];
          listings = uniquePhoneElements;
          console.log(`Ultra-aggressive phone-based approach: Found ${totalPhoneMatches} phone matches, extracted ${listings.length} unique business elements`);
        }
        
        // Helper function to validate business content
        this.isValidBusinessContent = function(text) {
          if (!text || text.length < 10 || text.length > 1000) return false;
          
          // Enhanced business keyword detection with Indian business context
          const businessKeywords = /business|company|store|shop|service|electrician|doctor|restaurant|hotel|clinic|hospital|school|college|bank|atm|hotel|restaurant|cafe|salon|spa|gym|agency|office|center|centre|chartered|accountant|ca|firm|consultant|solution|professional|expert|specialist|provider|contact|call|phone|mobile|tel|address|location|area|city|rating|review|star|email|website|www|http|road|street|building|shop|market|complex|plaza|near|opposite|behind|above|below|next to|bazaar|market|nagar|colony|area|sector|phase|block|shop|store|service|dealer|distributor|supplier|manufacturer|trader|exporter|importer|wholesaler|retailer|agency|consultancy|organization|enterprise|establishment|outlet|branch|franchise/i;
          
          // Indian phone number patterns
          const phonePatterns = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
          
          const hasBusinessKeywords = businessKeywords.test(text);
          const hasPhoneNumbers = phonePatterns.test(text);
          const hasStructuredContent = text.includes('\n') || text.includes(',') || text.includes('•') || text.includes('-') || text.includes('|') || text.includes('·');
          const hasMultipleWords = text.split(' ').length > 3;
          const hasNumbers = /\d/.test(text);
          const hasIndianPatterns = /nagar|colony|area|sector|phase|block|road|street|marg|gali|bazar|market|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad|surat|jaipur|lucknow|kanpur|nagpur|indore|thane|bhopal|visakhapatnam|pimpri|chinchwad|patna|vadodara|ghaziabad|ludhiana|agra|nashik|faridabad|meerut|rajkot|kalyan|vasai|virar|varanasi|srinagar|aurangabad|dhanbad|amritsar|allahabad|gwalior|vijayawada|jodhpur|madurai|raipur|kota|chandigarh|guwahati|solapur|hubli|dharwad|tiruchirappalli|bareilly|moradabad|mysore|tiruppur|gurgaon|aligarh|jalandhar|bhubaneswar|salem|mira|bhayander|thane|bhiwandi|saharanpur|gorakhpur|guntur|bikaner|indore|ajmer|kochi|coimbatore|thrissur|rajkot|jamshedpur|cuttack|firozabad|kochi|nellore|bhilai|bokaro|belgaum|aurangabad|bhopal|bhiwani|bathinda|shahjahanpur|karnal|panipat|ambala|rohtak|hisar|jind|kaithal|sonipat|kurukshetra|panchkula|yamunanagar|rewari|palwal|faridabad|ballabgarh|bahadurgarh|hansi|tohana|siwani|ratia|fatehabad|sirsa|dabwali|kalayat|pehowa|cheeka|guhla|ishar|kalan|kaithal|assandh|guhla|jind|safidon|pillu|uchana|narwana|barwala|rohtak|meham|beri|bahadurgarh|jhajjar|beri|matanhail|kairu|chhachhrauli|bhiwani|dadri|badhra|loharu|tosham|bhiwani|siwani|loharu|bhiwani|dadri|badhra|tosham|siwani|bhiwani|dadri|badhra|tosham|siwani/gi;
          
          // More lenient validation - if it has phone numbers or business indicators, consider it valid
          return hasPhoneNumbers || (hasBusinessKeywords && (hasStructuredContent || hasMultipleWords || hasIndianPatterns));
        };
        
        // Ultimate fallback: ultra-aggressive div detection with enhanced validation
        if (listings.length === 0) {
          console.log('Trying ultra-aggressive ultimate fallback...');
          const allDivs = document.querySelectorAll('div');
          const substantialDivs = [];
          
          allDivs.forEach(div => {
            const text = div.textContent || '';
            const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
            
            // Enhanced validation with business content checker
            const hasPhone = phoneRegex.test(text);
            const hasValidBusinessContent = this.isValidBusinessContent(text);
            const hasReasonableLength = text.length > 20 && text.length < 2000;
            
            // Add if multiple conditions are met
            if (hasReasonableLength && hasValidBusinessContent && (hasPhone || text.includes('contact') || text.includes('phone'))) {
              substantialDivs.push(div);
            }
          });
          
          listings = substantialDivs;
          console.log(`Ultra-aggressive ultimate fallback found ${listings.length} substantial divs`);
        }
        
        // Super fallback: Extract phone numbers directly from page content and create business entries
        if (listings.length === 0) {
          console.log('Trying super fallback - extracting businesses from phone numbers in page...');
          const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
          const pageText = document.body.textContent || '';
          const phoneMatches = pageText.match(phoneRegex);
          
          if (phoneMatches && phoneMatches.length > 0) {
            console.log(`Found ${phoneMatches.length} phone numbers, creating business entries...`);
            
            // Create artificial div elements for each phone number found
            const artificialListings = [];
            const uniquePhones = [...new Set(phoneMatches)];
            
            uniquePhones.slice(0, 50).forEach((phone, index) => {
              const artificialDiv = document.createElement('div');
              
              // Try to extract surrounding context for this phone number
              const phoneIndex = pageText.indexOf(phone);
              const contextStart = Math.max(0, phoneIndex - 200);
              const contextEnd = Math.min(pageText.length, phoneIndex + phone.length + 200);
              const context = pageText.substring(contextStart, contextEnd);
              
              // Try to extract a business name from the context
              const businessName = this.extractBusinessNameFromContext(context, phone);
              
              artificialDiv.textContent = `${businessName}|${phone}|${context}`;
              artificialDiv.setAttribute('data-artificial-business', 'true');
              artificialDiv.setAttribute('data-phone-index', index);
              artificialDiv.setAttribute('data-phone-number', phone);
              artificialListings.push(artificialDiv);
            });
            
            listings = artificialListings;
            console.log(`Created ${listings.length} artificial business entries from phone numbers`);
          }
        }
        
        // Helper function to extract business name from context
        this.extractBusinessNameFromContext = function(context, phone) {
          // Remove the phone number from context
          const cleanContext = context.replace(phone, '').replace(/\s+/g, ' ').trim();
          
          // Look for business name patterns
          const namePatterns = [
            /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/, // Capitalized words
            /([A-Z][a-z]+\s+(?:Shop|Store|Service|Center|Clinic|Hospital|School|College|Bank|Hotel|Restaurant))/, // Business types
            /([A-Z][a-z]+\s+(?:&|and)\s+[A-Z][a-z]+)/, // Business with &/and
            /((?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+)/, // Multiple capitalized words
          ];
          
          for (const pattern of namePatterns) {
            const match = cleanContext.match(pattern);
            if (match && match[1] && match[1].length > 3 && match[1].length < 50) {
              return match[1];
            }
          }
          
          // Fallback: take the first capitalized word sequence
          const words = cleanContext.split(' ');
          let nameWords = [];
          
          for (const word of words) {
            if (word.length > 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
              nameWords.push(word);
            } else if (nameWords.length > 0) {
              break;
            }
          }
          
          if (nameWords.length > 0) {
            return nameWords.join(' ');
          }
          
          return `Business ${Math.floor(Math.random() * 10000)}`;
        };
        
        // Last resort: If still no listings, try to extract businesses from page text directly
        if (listings.length === 0) {
          console.log('Last resort - extracting businesses directly from page text...');
          const pageText = document.body.textContent || '';
          const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
          const phoneMatches = pageText.match(phoneRegex);
          
          if (phoneMatches && phoneMatches.length > 0) {
            console.log(`Found ${phoneMatches.length} phone numbers in page text, extracting businesses...`);
            
            // Extract business context around each phone number
            const businessListings = [];
            const uniquePhones = [...new Set(phoneMatches)];
            
            uniquePhones.slice(0, 100).forEach((phone, index) => {
              const phoneIndex = pageText.indexOf(phone);
              const contextStart = Math.max(0, phoneIndex - 300);
              const contextEnd = Math.min(pageText.length, phoneIndex + phone.length + 300);
              const context = pageText.substring(contextStart, contextEnd);
              
              // Create a business listing from the context
              const businessDiv = document.createElement('div');
              businessDiv.textContent = context;
              businessDiv.setAttribute('data-extracted-from-text', 'true');
              businessDiv.setAttribute('data-phone-number', phone);
              businessDiv.setAttribute('data-business-index', index);
              businessListings.push(businessDiv);
            });
            
            listings = businessListings;
            console.log(`Created ${listings.length} business listings from page text`);
          } else {
            console.log('No phone numbers found in page text - cannot extract businesses');
            // Don't create placeholder entries - return empty array
            listings = [];
          }
        }
        
        // Debug: Log page structure info
        console.log(`=== PAGE STRUCTURE DEBUG ===`);
        console.log(`Total elements found: ${listings.length}`);
        console.log(`Page title: ${document.title}`);
        console.log(`Page URL: ${window.location.href}`);
        console.log(`Total divs on page: ${document.querySelectorAll('div').length}`);
        console.log(`Total elements with phone numbers: ${document.querySelectorAll('*').length}`);
        
        // Enhanced debugging: Show page HTML structure
        console.log(`=== ENHANCED PAGE STRUCTURE ANALYSIS ===`);
        const body = document.body;
        console.log(`Body tag: ${body.tagName}`);
        console.log(`Body classes: ${body.className}`);
        console.log(`Body HTML length: ${body.innerHTML.length}`);
        
        // Find all potential business containers
        const allDivs = document.querySelectorAll('div');
        const divsWithClasses = [];
        const divsWithText = [];
        
        allDivs.forEach((div, index) => {
          if (div.className && div.className.trim()) {
            divsWithClasses.push({
              index,
              className: div.className,
              textLength: div.textContent?.length || 0,
              text: div.textContent?.substring(0, 100)
            });
          }
          
          const text = div.textContent || '';
          if (text.length > 50 && text.length < 1000) {
            divsWithText.push({
              index,
              className: div.className || 'no-class',
              textLength: text.length,
              text: text.substring(0, 200)
            });
          }
        });
        
        console.log(`Found ${divsWithClasses.length} divs with classes:`);
        divsWithClasses.slice(0, 10).forEach(item => {
          console.log(`  Div ${item.index}: class="${item.className}", text=${item.textLength} chars`);
        });
        
        console.log(`Found ${divsWithText.length} divs with substantial text:`);
        divsWithText.slice(0, 5).forEach(item => {
          console.log(`  Div ${item.index}: class="${item.className}", text="${item.text}..."`);
        });
        
        // Check for phone numbers in the entire page
        const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
        const pageText = body.textContent || '';
        const phoneMatches = pageText.match(phoneRegex);
        console.log(`Phone numbers found in page: ${phoneMatches ? phoneMatches.length : 0}`);
        if (phoneMatches) {
          console.log(`Phone numbers: ${phoneMatches.slice(0, 5).join(', ')}`);
        }
        
        // Check for common JustDial patterns
        const jdPatterns = [
          'jsx-',
          'result',
          'listing',
          'contact',
          'phone',
          'tel',
          'call',
          'business',
          'company',
          'store',
          'service'
        ];
        
        jdPatterns.forEach(pattern => {
          const elements = document.querySelectorAll(`[class*="${pattern}"]`);
          if (elements.length > 0) {
            console.log(`Found ${elements.length} elements with "${pattern}" in class`);
          }
        });
        
        // Debug: Show first few listing structures
        if (listings.length > 0) {
          console.log(`=== FIRST LISTING STRUCTURE DEBUG ===`);
          for (let i = 0; i < Math.min(3, listings.length); i++) {
            const listing = listings[i];
            console.log(`Listing ${i}: Tag=${listing.tagName}, Class=${listing.className}, Text length=${listing.textContent?.length || 0}`);
            console.log(`Listing ${i} text preview: "${listing.textContent?.substring(0, 200)}..."`);
          }
        }
        
        console.log('=== PROCESSING LISTINGS ===');
        
        for (const [index, listing] of listings.entries()) {
          try {
            console.log(`Processing listing ${index}:`, listing.tagName, listing.className);
            
            // Check if this is an artificial business entry
            const isArtificial = listing.getAttribute('data-artificial-business') === 'true';
            const isExtractedFromText = listing.getAttribute('data-extracted-from-text') === 'true';
            
            if (isExtractedFromText) {
              console.log(`Processing business extracted from page text...`);
              const phoneText = listing.textContent || '';
              const storedPhone = listing.getAttribute('data-phone-number');
              
              // Use stored phone number
              let actualPhone = storedPhone;
              
              if (actualPhone) {
                // Format phone number
                let cleanPhone = actualPhone.replace(/\D/g, '');
                if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
                  cleanPhone = cleanPhone.substring(2);
                } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
                  cleanPhone = cleanPhone.substring(1);
                } else if (cleanPhone.length === 11 && cleanPhone.startsWith('91')) {
                  cleanPhone = cleanPhone.substring(2);
                }
                
                // Extract business name from context
                let businessName = this.extractBusinessNameFromContext(phoneText, actualPhone);
                
                // Try to extract address from context
                let address = 'Extracted from page text';
                const addressPatterns = [
                  /([A-Za-z0-9\s,.-]+(?:road|street|marg|nagar|colony|area|sector|phase|block|building|tower|shop|complex|plaza|market|bazaar))/gi,
                  /([A-Za-z0-9\s,.-]+(?:near|opposite|behind|above|below|next to)\s+[A-Za-z0-9\s,.-]+)/gi,
                  /(\d+\s*[A-Za-z0-9\s,.-]{10,100})/g
                ];
                
                for (const pattern of addressPatterns) {
                  const match = phoneText.match(pattern);
                  if (match && match[1] && match[1].length > 10) {
                    address = match[1].trim();
                    break;
                  }
                }
                
                const business = {
                  name: businessName,
                  phone: cleanPhone,
                  address: address,
                  category: 'Extracted from text',
                  city: 'Unknown',
                  image: 'N/A'
                };
                
                businesses.push(business);
                console.log(`  -> Added business from text: "${businessName}" with phone ${cleanPhone}`);
                continue;
              }
            }
            
            if (isArtificial) {
              console.log(`Processing artificial business entry from phone number...`);
              const phoneText = listing.textContent || '';
              const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/;
              const phoneMatch = phoneText.match(phoneRegex);
              const storedPhone = listing.getAttribute('data-phone-number');
              
              // Use stored phone number if available, otherwise extract from text
              const actualPhone = storedPhone || (phoneMatch ? phoneMatch[0] : null);
              
              if (actualPhone) {
                // Format phone number
                let cleanPhone = actualPhone.replace(/\D/g, '');
                if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
                  cleanPhone = cleanPhone.substring(2);
                } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
                  cleanPhone = cleanPhone.substring(1);
                } else if (cleanPhone.length === 11 && cleanPhone.startsWith('91')) {
                  cleanPhone = cleanPhone.substring(2);
                }
                
                // Extract business name and context from the artificial div
                const parts = phoneText.split('|');
                let businessName = parts[0] || `Business ${index + 1}`;
                let context = parts[2] || '';
                
                // Clean up the business name
                businessName = businessName.replace(/\d+/g, '').trim();
                if (businessName.length < 3 || businessName.includes('Business')) {
                  businessName = this.extractBusinessNameFromContext(context, actualPhone);
                }
                
                // Try to extract address from context
                let address = 'Extracted from phone number';
                if (context) {
                  const addressPatterns = [
                    /(?:near|opposite|behind|above|below|next to)\s+([^,\n]+)/i,
                    /([^,\n]+\s+(?:road|street|building|shop|complex|plaza|market))/i,
                    /([^,\n]+\s+(?:floor|block|shop no|s\.no|plot))/i
                  ];
                  
                  for (const pattern of addressPatterns) {
                    const match = context.match(pattern);
                    if (match && match[1] && match[1].length > 5) {
                      address = match[1].trim();
                      break;
                    }
                  }
                }
                
                const business = {
                  name: businessName,
                  phone: cleanPhone.length === 10 && /^[6-9]\d{9}$/.test(cleanPhone) ? cleanPhone : actualPhone,
                  address: address,
                  category: window.detectedCategory || this.categorizeCompany(businessName),
                  city: window.location.href.match(/\/([A-Za-z]+)\//)?.[1]?.charAt(0).toUpperCase() + window.location.href.match(/\/([A-Za-z]+)\//)?.[1]?.slice(1) || 'Unknown',
                  image: 'N/A'
                };
                businesses.push(business);
                console.log(`  -> Added artificial business: "${business.name}" with phone: "${business.phone}"`);
              }
              continue;
            }
            
            const business = {
              name: '',
              phone: '',
              address: '',
              category: '',
              city: '',
              image: ''
            };
            
            // Extract Name
            const nameSelectors = [
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              '.title', '.name', '[class*="name"]', 
              '.company-name', '.store-name', '.business-name',
              '.vendor-name', '.service-name', '.provider-name',
              'span[class*="title"]', 'div[class*="title"]',
              'a[class*="title"]', 'strong[class*="title"]',
              '.resultbox h1', '.resultbox h2', '.resultbox h3',
              '[data-testid*="name"]', '[class*="jsx"] h2', '[class*="jsx"] h3',
              'b', 'strong', '.highlight', '.featured'
            ];
            
            for (const selector of nameSelectors) {
              const element = listing.querySelector(selector);
              if (element) {
                const text = element.textContent?.trim() || '';
                const textLower = text.toLowerCase();
                
                // Simplified validation for business names - less restrictive
                const isValidBusinessName = text.length > 2 && text.length < 150 && 
                    !/^\d+$/.test(text) && 
                    !textLower.includes('ad') &&
                    !textLower.includes('sponsored') &&
                    !textLower.includes('promotion') &&
                    !textLower.includes('advertisement') &&
                    !text.match(/^(call|contact|phone|mobile)$/i) &&
                    // Only filter out most obvious UI text
                    !textLower.includes('skip to main content') &&
                    !textLower.includes('navigation') &&
                    !textLower.includes('filter') &&
                    !textLower.includes('sort') &&
                    !textLower.includes('book appointment') &&
                    !textLower.includes('get the list') &&
                    // Filter out names that start with obvious UI words
                    !textLower.match(/^(photos|skip|navigation|filter|sort|book appointment)/);
                
                if (isValidBusinessName) {
                  business.name = text;
                  console.log(`  -> Name found via "${selector}": "${text}"`);
                  break;
                }
              }
            }
            
            // Extract Phone
            const phoneSelectors = [
              // Most common Justdial phone selectors (2024 updated)
              '.contact-info .tel-number',
              '.phone-number', '.tel-number', '.mobile-number',
              '[data-testid="phone-number"]', '[data-testid*="phone"]',
              '[class*="phone"]', 'a[href*="tel:"]',
              '[class*="contact"] [class*="phone"]',
              '[class*="tel"]', '[class*="mobile"]',
              '.resultbox .phone', '.resultbox .tel', '.resultbox .mobile',
              'span[class*="phone"]', 'div[class*="phone"]',
              '.call-info', '.contact-details', '.vendor-phone',
              
              // Enhanced Justdial-specific phone selectors (2024 patterns)
              'div[class*="jsx"] [class*="phone"]',
              'div[class*="jsx"] [class*="tel"]',
              'div[class*="jsx"] [class*="mobile"]',
              'div[class*="jsx"] a[href*="tel:"]',
              'div[class*="jsx"] [data-testid*="phone"]',
              'div[class*="jsx"] span[title*="Call"]',
              'div[class*="jsx"] div[title*="Call"]',
              'div[class*="jsx"] [data-testid*="contact"]',
              'div[class*="jsx"] [class*="contact"]',
              
              // New 2024 Justdial patterns
              'span[onclick*="tel:"]',
              'div[onclick*="tel:"]',
              'button[onclick*="tel:"]',
              '.callnow',
              '.call-btn',
              '.phone-btn',
              '.mobile-btn',
              '[class*="callnow"]',
              '[class*="call-btn"]',
              '[class*="phone-btn"]',
              '[class*="mobile-btn"]',
              
              // Justdial specific data attributes
              '[data-phone]',
              '[data-mobile]',
              '[data-contact]',
              '[data-tel]',
              
              // Generic phone selectors
              '[title*="Call"]', '[title*="Phone"]', '[title*="Mobile"]',
              '[aria-label*="Call"]', '[aria-label*="Phone"]', '[aria-label*="Mobile"]',
              'a[onclick*="tel:"]',
              'span[data-phone]', 'div[data-phone]',
              
              // More generic selectors
              '[class*="call"]',
              '[class*="contact"]',
              '[class*="number"]',
              'span[title*="call"]',
              'div[title*="call"]',
              
              // Fallback: any element containing phone-like text
              '*'
            ];
            
            const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|\+91\s?\d{10}|91\s?\d{10}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}|[6-9]\d{9}/;
            
            // Helper function to format phone number to standard 10-digit Indian format
            function formatPhoneNumber(phoneNumber) {
              let cleanPhone = phoneNumber.replace(/\D/g, '');
              
              // Handle different phone number formats
              if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
                // International format: +91XXXXXXXXXX
                cleanPhone = cleanPhone.substring(2);
              } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
                // National format: 0XXXXXXXXXX
                cleanPhone = cleanPhone.substring(1);
              } else if (cleanPhone.length === 11 && cleanPhone.startsWith('91')) {
                // Another international format: 91XXXXXXXXXX
                cleanPhone = cleanPhone.substring(2);
              }
              
              // Validate that we have a 10-digit number starting with 6-9 (Indian mobile)
              if (cleanPhone.length === 10 && /^[6-9]\d{9}$/.test(cleanPhone)) {
                return cleanPhone;
              }
              
              return null; // Invalid phone number
            }
            
            console.log(`  -> DEBUG: Extracting phone from listing ${index}`);
            
            for (const selector of phoneSelectors) {
              try {
                const element = listing.querySelector(selector);
                if (element) {
                  const phoneText = element.textContent?.trim() || '';
                  const phoneMatch = phoneText.match(phoneRegex);
                  console.log(`  -> DEBUG: Found element with selector "${selector}": "${phoneText}"`);
                  
                  if (phoneMatch) {
                    const formattedPhone = formatPhoneNumber(phoneMatch[0]);
                    if (formattedPhone) {
                      business.phone = formattedPhone;
                      console.log(`  -> SUCCESS: Phone from "${selector}": "${phoneMatch[0]}" -> "${formattedPhone}"`);
                      break;
                    } else {
                      console.log(`  -> FAILED: Phone format invalid: "${phoneMatch[0]}"`);
                    }
                  }
                }
              } catch (error) {
                console.log(`  -> ERROR with selector "${selector}": ${error.message}`);
              }
            }
            
            // Fallback: extract phone from listing text
            if (!business.phone) {
              console.log(`  -> DEBUG: Trying fallback phone extraction from listing text`);
              const listingText = listing.textContent || '';
              console.log(`  -> DEBUG: Listing text (first 200 chars): "${listingText.substring(0, 200)}..."`);
              const phoneMatches = listingText.match(phoneRegex);
              console.log(`  -> DEBUG: Phone matches in text: ${phoneMatches ? phoneMatches.length : 0}`);
              
              if (phoneMatches) {
                for (const phone of phoneMatches) {
                  const formattedPhone = formatPhoneNumber(phone);
                  if (formattedPhone) {
                    business.phone = formattedPhone;
                    console.log(`  -> SUCCESS: Phone from text: "${phone}" -> "${formattedPhone}"`);
                    break;
                  } else {
                    console.log(`  -> FAILED: Invalid phone format from text: "${phone}"`);
                  }
                }
              }
            }
            
            // Enhanced fallback: search all child elements for phone numbers
            if (!business.phone) {
              console.log(`  -> DEBUG: Trying enhanced fallback - searching all child elements`);
              const allElements = listing.querySelectorAll('*');
              for (const element of allElements) {
                const elementText = element.textContent?.trim() || '';
                const phoneMatch = elementText.match(phoneRegex);
                if (phoneMatch) {
                  const formattedPhone = formatPhoneNumber(phoneMatch[0]);
                  if (formattedPhone) {
                    business.phone = formattedPhone;
                    console.log(`  -> SUCCESS: Phone from child element: "${phoneMatch[0]}" -> "${formattedPhone}"`);
                    break;
                  }
                }
              }
            }
            
            // Final fallback: check onclick attributes and data attributes
            if (!business.phone) {
              console.log(`  -> DEBUG: Trying final fallback - checking attributes`);
              const clickableElements = listing.querySelectorAll('a, button, span, div[onclick], [data-phone], [data-mobile], [data-tel]');
              for (const element of clickableElements) {
                // Check onclick attributes
                const onclick = element.getAttribute('onclick') || '';
                const onclickMatch = onclick.match(/\d{10}/);
                if (onclickMatch) {
                  const formattedPhone = formatPhoneNumber(onclickMatch[0]);
                  if (formattedPhone) {
                    business.phone = formattedPhone;
                    console.log(`  -> SUCCESS: Phone from onclick: "${onclickMatch[0]}" -> "${formattedPhone}"`);
                    break;
                  }
                }
                
                // Check data attributes
                const dataPhone = element.getAttribute('data-phone') || element.getAttribute('data-mobile') || element.getAttribute('data-tel') || '';
                if (dataPhone) {
                  const formattedPhone = formatPhoneNumber(dataPhone);
                  if (formattedPhone) {
                    business.phone = formattedPhone;
                    console.log(`  -> SUCCESS: Phone from data attribute: "${dataPhone}" -> "${formattedPhone}"`);
                    break;
                  }
                }
                
                // Check href attributes for tel: links
                const href = element.getAttribute('href') || '';
                if (href.includes('tel:')) {
                  const phoneFromHref = href.replace('tel:', '').replace(/\D/g, '');
                  const formattedPhone = formatPhoneNumber(phoneFromHref);
                  if (formattedPhone) {
                    business.phone = formattedPhone;
                    console.log(`  -> SUCCESS: Phone from href: "${href}" -> "${formattedPhone}"`);
                    break;
                  }
                }
              }
            }
            
            // Extract Address
            const addressSelectors = [
              '.address-info', '.address', '.location', '.addr',
              '[data-testid="address"]', '[data-testid*="address"]',
              '[class*="address"]', '[class*="location"]', '[class*="addr"]',
              '.resultbox .address', '.resultbox .location', '.resultbox .addr',
              'span[class*="address"]', 'div[class*="address"]',
              '.shop-address', '.store-address', '.business-address',
              '.vendor-address', '.contact-address', '.full-address',
              '.map-location', '.geo-location', '.street-address'
            ];
            
            for (const selector of addressSelectors) {
              const element = listing.querySelector(selector);
              if (element) {
                const addressText = element.textContent?.trim() || '';
                if (addressText.length > 10 && addressText.length < 500 &&
                    (addressText.toLowerCase().includes('road') || 
                     addressText.toLowerCase().includes('street') ||
                     addressText.toLowerCase().includes('near') ||
                     addressText.toLowerCase().includes('plot') ||
                     addressText.toLowerCase().includes('shop') ||
                     addressText.toLowerCase().includes('building') ||
                     addressText.toLowerCase().includes('area') ||
                     addressText.toLowerCase().includes('sector') ||
                     /\d+\s*[A-Za-z]/.test(addressText) ||
                     /\d+,\s*/.test(addressText))) {
                  business.address = addressText;
                  console.log(`  -> Address from "${selector}": "${addressText}"`);
                  break;
                }
              }
            }
            
            // Extract Category
            const categorySelectors = [
              '.category-info', '.category', '[class*="category"]',
              '[data-testid="category"]', '[data-testid*="category"]',
              'span[class*="jsx"]', 'div[class*="jsx"]',
              '.resultbox .category', '.resultbox span',
              '.service-category', '.business-category', '.vendor-category',
              '.type', '.service-type', '.business-type',
              'span[class*="category"]', 'div[class*="category"]',
              '.tag', '.label', '.badge', '.classification'
            ];
            
            for (const selector of categorySelectors) {
              const element = listing.querySelector(selector);
              if (element) {
                const categoryText = element.textContent?.trim() || '';
                if (categoryText.length > 2 && categoryText.length < 80 &&
                    !/\d{10}/.test(categoryText) &&
                    !categoryText.toLowerCase().includes('ad') &&
                    !categoryText.toLowerCase().includes('sponsored') &&
                    !categoryText.toLowerCase().includes('promotion') &&
                    !categoryText.match(/^(call|contact|phone|mobile|address)$/i) &&
                    !categoryText.match(/^\d+$/)) {
                  business.category = cleanCategoryName(categoryText);
                  console.log(`  -> Category from "${selector}": "${business.category}"`);
                  break;
                }
              }
            }
            
            // Extract City
            if (business.address) {
              const cities = ['delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'pune', 'hyderabad', 'ahmedabad', 'jaipur', 'lucknow', 'noida', 'gurgaon', 'faridabad', 'ghaziabad'];
              for (const city of cities) {
                if (business.address.toLowerCase().includes(city)) {
                  business.city = city.charAt(0).toUpperCase() + city.slice(1);
                  console.log(`  -> City from address: "${business.city}"`);
                  break;
                }
              }
            }
            
            if (!business.city) {
              const urlMatch = window.location.href.match(/\/([A-Za-z]+)\//);
              if (urlMatch) {
                const cityFromUrl = urlMatch[1];
                business.city = cityFromUrl.charAt(0).toUpperCase() + cityFromUrl.slice(1);
                console.log(`  -> City from URL: "${business.city}"`);
              }
            }
            
            // Extract Image
            const allImages = listing.querySelectorAll('img');
            let imageSrc = null;
            
            console.log(`  -> Found ${allImages.length} images in listing`);
            
            // Force trigger lazy loading
            allImages.forEach(img => {
              if (img.dataset.src && !img.src) {
                img.src = img.dataset.src;
              }
              if (img.dataset.lazy && !img.src) {
                img.src = img.dataset.lazy;
              }
              if (img.dataset.original && !img.src) {
                img.src = img.dataset.original;
              }
            });
            
            // Find the best business image
            for (const imageElement of allImages) {
              const rect = imageElement.getBoundingClientRect && imageElement.getBoundingClientRect();
              if (rect && (rect.width < 50 || rect.height < 50)) {
                continue;
              }
              
              const possibleSources = [
                imageElement.src,
                imageElement.getAttribute('data-src'),
                imageElement.getAttribute('data-lazy'),
                imageElement.getAttribute('data-original'),
                imageElement.getAttribute('data-srcset'),
                imageElement.srcset,
                imageElement.getAttribute('data-jpg'),
                imageElement.getAttribute('data-webp'),
                imageElement.getAttribute('data-image'),
                imageElement.getAttribute('data-thumbnail'),
                imageElement.getAttribute('data-photo'),
                imageElement.getAttribute('data-picture'),
                imageElement.getAttribute('data-lazy-src'),
                imageElement.getAttribute('data-defer-src'),
                imageElement.getAttribute('data-ll')
              ];
              
              for (const source of possibleSources) {
                if (source && !source.startsWith('data:') && source.trim() !== '' && source !== 'about:blank') {
                  imageSrc = source;
                  break;
                }
              }
              
              if (imageSrc && (imageSrc.includes('srcset') || imageSrc.includes('data-srcset'))) {
                const srcsetMatch = imageSrc.match(/([^\s,]+)(?:\s+\d+w)?/);
                if (srcsetMatch) {
                  imageSrc = srcsetMatch[1];
                }
              }
              
              if (imageSrc && imageSrc !== 'about:blank') {
                console.log(`  -> Raw image source found: "${imageSrc}"`);
                break;
              }
            }
            
            // Process the image URL
            if (imageSrc && imageSrc !== 'about:blank') {
              if (imageSrc.startsWith('data:')) {
                console.log(`  -> Skipping data URI`);
              } else {
                let cleanImageUrl = imageSrc.trim();
                cleanImageUrl = cleanImageUrl.split('?')[0];
                
                if (cleanImageUrl.includes('justdial') || cleanImageUrl.includes('jdimages')) {
                  if (cleanImageUrl.includes('thumb') || cleanImageUrl.includes('small') || cleanImageUrl.includes('medium')) {
                    cleanImageUrl = cleanImageUrl.replace(/thumb|small|medium/g, 'large');
                  }
                }
                
                business.image = cleanImageUrl;
                console.log(`  -> Final image URL: "${business.image}"`);
              }
            } else {
              business.image = 'N/A';
              console.log(`  -> No valid image found, setting to N/A`);
            }
            
            // Add business to results if it has meaningful data
            if (business.name || business.phone) {
              businesses.push(business);
              console.log(`  -> Added business: "${business.name}" with phone: "${business.phone}" (Image: ${business.image})`);
            } else {
              console.log(`  -> Skipping listing ${index}: No valid business data found`);
            }
            
          } catch(e) {
            console.log(`Error processing listing ${index}:`, e.message);
          }
        }
        
        console.log(`=== EXTRACTION COMPLETE ===`);
        console.log(`Total businesses extracted: ${businesses.length}`);
        
        return businesses;
        
      } catch (error) {
        console.error('Error in extractBusinessesFromCurrentPage:', error);
        return [];
      }
    });
  }

  async enhancedAutoScroll() {
    console.log('Starting enhanced automatic scrolling for dynamic content...');
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let previousHeight = 0;
        let noChangeCount = 0;
        let scrollAttempts = 0;
        const maxNoChangeCount = 10;
        const maxScrollAttempts = 40;
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const windowHeight = window.innerHeight;
          
          if (scrollHeight === previousHeight) {
            noChangeCount++;
          } else {
            noChangeCount = 0;
            previousHeight = scrollHeight;
          }
          
          const reachedBottom = window.scrollY + windowHeight >= scrollHeight - 100;
          const shouldStop = reachedBottom && noChangeCount >= maxNoChangeCount;
          const maxAttemptsReached = scrollAttempts >= maxScrollAttempts;
          
          if (shouldStop || maxAttemptsReached) {
            clearInterval(timer);
            console.log(`Scrolling completed. Attempts: ${scrollAttempts}, No change count: ${noChangeCount}`);
            
            setTimeout(() => {
              window.scrollTo(0, 0);
              
              setTimeout(() => {
                window.scrollTo(0, 100);
                setTimeout(() => {
                  window.scrollTo(0, 0);
                  setTimeout(resolve, 2000);
                }, 1000);
              }, 1000);
            }, 3000);
          }
        }, 800);
      });
    });
  }

  async extractGenericData() {
    return await this.page.evaluate(() => {
      try {
        console.log('=== ENHANCED GENERIC DATA EXTRACTION ===');
        const businesses = [];
        
        const phoneRegex = /\+91[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}|0?[6-9]\d{9}|\d{10}|\d{3}[-\s]?\d{3}[-\s]?\d{4}|\(\d{3}\)[-\s]?\d{3}[-\s]?\d{4}/g;
        
        // Helper function to format phone number to standard 10-digit Indian format
        function formatPhoneNumber(phoneNumber) {
          let cleanPhone = phoneNumber.replace(/\D/g, '');
          
          // Handle different phone number formats
          if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
            // International format: +91XXXXXXXXXX
            cleanPhone = cleanPhone.substring(2);
          } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
            // National format: 0XXXXXXXXXX
            cleanPhone = cleanPhone.substring(1);
          } else if (cleanPhone.length === 11 && cleanPhone.startsWith('91')) {
            // Another international format: 91XXXXXXXXXX
            cleanPhone = cleanPhone.substring(2);
          }
          
          // Validate that we have a 10-digit number starting with 6-9 (Indian mobile)
          if (cleanPhone.length === 10 && /^[6-9]\d{9}$/.test(cleanPhone)) {
            return cleanPhone;
          }
          
          return null; // Invalid phone number
        }
        
        const allText = document.body ? document.body.innerText : '';
        let phones = allText.match(phoneRegex) || [];
        
        phones = [...new Set(phones.map(phone => formatPhoneNumber(phone)).filter(phone => phone !== null))];
        
        console.log('Found unique phone numbers:', phones.length);
        
        const potentialCards = document.querySelectorAll(
          'div[class*="jsx"], div[class*="result"], div[class*="listing"], div[class*="card"], div[class*="company"], div[class*="store"], ' +
          'article, section[class*="business"], div[class*="service"], div[class*="provider"], ' +
          'div[class*="contact"], div[class*="info"], li[class*="result"], div[class*="item"]'
        );
        
        console.log('Potential cards found:', potentialCards.length);
        
        const structuredData = [];
        const usedPhones = new Set();
        
        potentialCards.forEach((card, index) => {
          if (!card) return;
          const cardText = card.textContent || '';
          const phoneMatches = cardText.match(phoneRegex);
          
          if (phoneMatches && phoneMatches.length > 0) {
            const formattedPhone = formatPhoneNumber(phoneMatches[0]);
            
            if (!formattedPhone || usedPhones.has(formattedPhone)) return;
            usedPhones.add(formattedPhone);
            
            const business = {
              name: '',
              phone: formattedPhone,
              address: '',
              category: '',
              city: '',
              rating: '',
              image: '',
              website: ''
            };
            
            // Enhanced name extraction
            const nameSelectors = [
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              '.title', '.name', '[class*="name"]', 
              '.company-name', '.store-name', '.business-name',
              '.provider-name', '.service-name',
              'span[class*="jsx"]', 'div[class*="jsx"]',
              'a[class*="jsx"]', 'strong', 'b'
            ];
            
            for (const selector of nameSelectors) {
              const elements = card.querySelectorAll(selector);
              for (const element of elements) {
                if (!element) continue;
                const text = element.textContent?.trim() || '';
                if (text.length > 3 && text.length < 100 && 
                    !/^\d/.test(text) && !phoneRegex.test(text) &&
                    !text.toLowerCase().includes('ad') &&
                    !text.toLowerCase().includes('sponsored')) {
                  business.name = text;
                  console.log(`  -> Name found via "${selector}": "${text}"`);
                  break;
                }
              }
            }
            
            // Additional category extraction
            if (!business.category) {
              const listingText = card?.textContent || '';
              const categoryKeywords = ['electrician', 'electrical', 'contractor', 'service', 'repair', 'installation', 'wiring'];
              const lines = listingText.split('\n');
              
              for (const line of lines) {
                const cleanLine = line.trim();
                if (categoryKeywords.some(keyword => cleanLine.toLowerCase().includes(keyword)) && 
                    cleanLine.length > 3 && cleanLine.length < 30 &&
                    !/\d{10}/.test(cleanLine)) {
                  business.category = cleanCategoryName(cleanLine);
                  console.log(`  -> Category from text: "${business.category}"`);
                  break;
                }
              }
            }
            
            // Fallback: extract category from URL
            if (!business.category) {
              const urlMatch = window.location.href.match(/\/([a-zA-Z-]+)\/([a-zA-Z-]+)$/);
              if (urlMatch) {
                business.category = cleanCategoryName(urlMatch[2]);
                console.log(`  -> Category from URL: "${business.category}"`);
              }
            }
            
            // Final fallback: use detected category if available
            if (!business.category && window.detectedCategory) {
              business.category = window.detectedCategory;
              console.log(`  -> Category from detected category: "${business.category}"`);
            }
            
            // Set image to N/A if not found
            if (!business.image) {
              business.image = 'N/A';
            }
            
            // Add business to structured data if it has valid info
            if (business.name || business.phone) {
              structuredData.push(business);
              console.log(`  -> Added structured business: "${business.name}" with phone: "${business.phone}" (Image: ${business.image})`);
            }
          }
        });
        
        console.log('Structured data found:', structuredData.length);
        
        // Remove duplicates
        const uniqueBusinesses = [];
        const seenPhones = new Set();
        const seenNames = new Set();
        
        structuredData.forEach(business => {
          const phoneKey = business.phone || '';
          const nameKey = business.name ? business.name.toLowerCase().trim() : '';
          
          if (!seenPhones.has(phoneKey) && !seenNames.has(nameKey)) {
            seenPhones.add(phoneKey);
            seenNames.add(nameKey);
            uniqueBusinesses.push(business);
          }
        });
        
        console.log(`Unique businesses after deduplication: ${uniqueBusinesses.length}`);
        
        return uniqueBusinesses;
        
      } catch (error) {
        console.error('Error in generic data extraction:', error);
        return [];
      }
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

// Enhanced Bulk Scraper Class for 250-350 businesses
class BulkJustdialScraper extends JustdialScraper {
  constructor() {
    super();
    this.targetCount = 300; // Target 250-350 businesses
    this.minCount = 250;
    this.maxCount = 350;
    this.progressCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  async scrapeBulkBusinessData(url) {
    try {
      await this.initialize();
      
      console.log(`Starting bulk scraping for ${this.minCount}-${this.maxCount} businesses from:`, url);
      
      // Add initial delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, Math.random() * 6000 + 4000));
      
      // Enhanced navigation with multiple attempts
      let accessDenied = true;
      let attempts = 0;
      const maxAttempts = 8; // Increased attempts for bulk scraping
      
      while (accessDenied && attempts < maxAttempts) {
        attempts++;
        console.log(`Bulk scraping attempt ${attempts} of ${maxAttempts}`);
        
        try {
          if (attempts > 1) {
            console.log('Waiting before bulk retry to prevent rate limiting...');
          }
          
          console.log('Bulk scraping - Navigating to URL:', url);
          await this.page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 
          });
          
          console.log('Bulk scraping - Navigation completed, waiting for content...');
          await new Promise(resolve => setTimeout(resolve, 8000));
          
          const pageTitle = await this.page.title();
          const pageContent = await this.page.content();
          
          console.log('Bulk scraping - Page title:', pageTitle);
          console.log('Bulk scraping - Current URL:', this.page.url());
          console.log('Bulk scraping - Page content length:', pageContent.length);
          
          // Enhanced debugging: Check if page has content
          const bodyText = await this.page.evaluate(() => document.body.textContent || '');
          console.log('Bulk scraping - Body text length:', bodyText.length);
          console.log('Bulk scraping - Body text preview:', bodyText.substring(0, 500));
          
          // Check for common JustDial elements
          const justdialElements = await this.page.evaluate(() => {
            const elements = {
              totalDivs: document.querySelectorAll('div').length,
              jsxElements: document.querySelectorAll('[class*="jsx"]').length,
              phoneElements: document.querySelectorAll('[class*="phone"], [class*="tel"], [class*="mobile"]').length,
              resultElements: document.querySelectorAll('[class*="result"], [class*="listing"]').length,
              businessElements: document.querySelectorAll('[class*="business"], [class*="company"], [class*="store"]').length
            };
            return elements;
          });
          
          console.log('Bulk scraping - Page element counts:', justdialElements);
          
          accessDenied = 
            pageTitle.includes('Access Denied') ||
            pageTitle.includes('403') ||
            pageTitle.includes('Blocked') ||
            pageTitle.includes('Robot Check') ||
            pageTitle.includes('CAPTCHA') ||
            pageTitle.includes('Security Check') ||
            pageTitle.includes('Too Many Requests') ||
            pageContent.includes('Access Denied') ||
            pageContent.includes('403 Forbidden') ||
            pageContent.includes('captcha') ||
            pageContent.includes('robot') ||
            pageContent.includes('security check') ||
            pageContent.includes('rate limit') ||
            pageContent.includes('too many requests') ||
            pageContent.includes('cloudflare') ||
            pageContent.includes('challenge');
          
          if (accessDenied) {
            console.log('Bulk scraping - Access denied/rate limited detected, trying different approach...');
            
            if (attempts <= 3) {
              await this.page.evaluate(() => {
                window.scrollTo(0, Math.floor(Math.random() * 800));
                document.dispatchEvent(new MouseEvent('mousemove', {
                  clientX: Math.random() * window.innerWidth,
                  clientY: Math.random() * window.innerHeight
                }));
              });
              await new Promise(resolve => setTimeout(resolve, 5000));
              await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            }
          } else {
            console.log('Bulk scraping - Successfully accessed the page!');
            break;
          }
          
        } catch (error) {
          console.log(`Bulk scraping navigation attempt ${attempts} failed:`, error.message);
          if (attempts >= maxAttempts) {
            throw error;
          }
        }
      }
      
      if (accessDenied) {
        console.log('Bulk scraping - Still getting access denied after all attempts, attempting to extract anyway...');
        try {
          await new Promise(resolve => setTimeout(resolve, 8000));
        } catch (e) {
          console.log('Bulk scraping - Wait timeout, proceeding anyway...');
        }
      }
      
      // Use enhanced bulk pagination handler
      console.log('Starting enhanced bulk pagination-aware scraping...');
      const businessData = await this.handleBulkPagination();
      
      // If no businesses found with bulk pagination, try enhanced methods
      if (businessData.length === 0) {
        console.log('Bulk scraping - No businesses found with pagination, trying enhanced fallback methods...');
        await this.enhancedBulkAutoScroll();
        const fallbackData = await this.extractBusinessesFromCurrentPage();
        return fallbackData;
      }
    
      console.log(`Bulk scraping completed - Found ${businessData.length} businesses`);
      
      // If still not enough businesses, try generic approach
      if (businessData.length < this.minCount) {
        console.log('Bulk scraping - Trying generic data extraction approach to reach target...');
        const genericData = await this.extractGenericData();
        console.log(`Generic approach found ${genericData.length} additional businesses`);
        
        // Combine, clean, and deduplicate
        const cleanedBusinessData = businessData.map(b => this.cleanAndValidateBusiness(b));
        const cleanedGenericData = genericData.map(b => this.cleanAndValidateBusiness(b));
        const combinedData = this.deduplicateBusinesses([...cleanedBusinessData, ...cleanedGenericData]);
        console.log(`Combined and deduplicated: ${combinedData.length} businesses`);
        
        // Ensure we have at least 100 unique businesses to match Justdial's actual count
        if (combinedData.length < 100) {
          console.log(`Warning: Only ${combinedData.length} unique businesses found, which is less than the target 100+ from Justdial`);
        }
        
        return combinedData.slice(0, this.maxCount);
      }
    
      return businessData.slice(0, this.maxCount);
    
    } catch (error) {
      console.error('Bulk scraping error:', error);
      
      if (error.message.includes('Runtime.callFunctionOn timed out') || 
          error.message.includes('protocolTimeout')) {
        console.log('Bulk scraping timeout error detected, attempting graceful recovery...');
        throw new Error(`Bulk scraping timeout: The page took too long to respond. Please try again in a few minutes.`);
      }
      
      if (error.message.includes('net::ERR_') || error.message.includes('Navigation timeout')) {
        throw new Error(`Bulk scraping network error: Unable to reach the website. Please check your internet connection and try again.`);
      }
      
      throw new Error(`Failed to bulk scrape data: ${error.message}`);
    } finally {
      await this.close();
    }
  }

  async handleBulkPagination() {
    console.log('Starting enhanced bulk pagination for maximum data extraction (target: 100+ results)...');
    
    let allBusinesses = [];
    let currentPage = 1;
    const maxPages = 150; // Further increased for bulk scraping
    let loadMoreFound = true;
    let lastPageBusinessCount = 0;
    let consecutiveEmptyPages = 0;
    const maxEmptyPages = 20; // Further increased to prevent early stopping
    let noNewContentCount = 0;
    const maxNoNewContent = 15; // Increased from 8 to 15 to allow more pages
    
    while (loadMoreFound && currentPage <= maxPages && allBusinesses.length < this.maxCount) {
      const progress = Math.min((allBusinesses.length / this.minCount) * 100, 100);
      console.log(`=== BULK PROCESSING PAGE ${currentPage} - Progress: ${progress.toFixed(1)}% (${allBusinesses.length}/${this.minCount}) ===`);
      
      if (this.progressCallback) {
        this.progressCallback({
          current: allBusinesses.length,
          target: this.minCount,
          percentage: progress,
          page: currentPage,
          status: 'processing'
        });
      }
      
      // Step 1: Wait for initial content to load
      console.log(`Bulk Page ${currentPage}: Waiting for initial content to load...`);
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Step 2: Enhanced scrolling for bulk data
      console.log(`Bulk Page ${currentPage}: Enhanced scrolling for maximum data extraction...`);
      await this.enhancedBulkScroll();
      
      // Step 3: Extract ALL businesses from current page
      console.log(`Bulk Page ${currentPage}: Extracting ALL businesses from this page...`);
      const pageBusinesses = await this.extractBusinessesFromCurrentPage();
      console.log(`Bulk Page ${currentPage}: Found ${pageBusinesses.length} businesses`);
      
      // Step 4: Add all businesses from this page to our collection
      console.log(`Bulk Page ${currentPage}: Adding ${pageBusinesses.length} businesses to collection...`);
      const previousCount = allBusinesses.length;
      allBusinesses.push(...pageBusinesses);
      const newBusinessesCount = allBusinesses.length - previousCount;
      console.log(`Bulk Page ${currentPage}: Total businesses so far: ${allBusinesses.length} (Added ${newBusinessesCount} new)`);
      
      // Check if we've reached our target
      if (allBusinesses.length >= this.minCount) {
        console.log(`Bulk scraping target achieved! Found ${allBusinesses.length} businesses.`);
        if (this.progressCallback) {
          this.progressCallback({
            current: allBusinesses.length,
            target: this.minCount,
            percentage: 100,
            page: currentPage,
            status: 'completed'
          });
        }
        break;
      }
      
      // Step 5: Check for new content
      if (newBusinessesCount === 0) {
        noNewContentCount++;
        console.log(`Bulk Page ${currentPage}: No new businesses found (${noNewContentCount}/${maxNoNewContent})`);
        if (noNewContentCount >= maxNoNewContent) {
          console.log('Bulk scraping: Too many pages with no new content, stopping...');
          break;
        }
      } else {
        noNewContentCount = 0;
      }
      
      // Step 6: Check if we should continue based on empty pages - more lenient for better results
      if (pageBusinesses.length === 0) {
        consecutiveEmptyPages++;
        console.log(`Bulk Page ${currentPage}: Empty page detected (${consecutiveEmptyPages}/${maxEmptyPages})`);
        // Only stop if we have at least 100 businesses or reached max empty pages
        if (consecutiveEmptyPages >= maxEmptyPages && allBusinesses.length >= 100) {
          console.log('Bulk scraping: Enough businesses collected, stopping...');
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
        lastPageBusinessCount = pageBusinesses.length;
      }
      
      // Step 7: Check for more pages or load more buttons - be more persistent
      console.log(`Bulk Page ${currentPage}: Looking for next page or load more button...`);
      loadMoreFound = await this.page.evaluate(() => {
        // Enhanced Load More button detection
        const loadMoreSelectors = [
          'button[class*="load"]',
          'button[class*="more"]',
          'a[class*="load"]',
          'a[class*="more"]',
          'div[class*="load"] button',
          'div[class*="more"] button',
          '.load-more',
          '.show-more',
          '.view-more',
          '.more-results',
          '.loadmore',
          '.showmore',
          '[data-testid*="load"]',
          '[data-testid*="more"]',
          '[class*="jsx"]:has(button)',
          'div[class*="jsx"] button',
          'span[class*="jsx"] button',
          // More specific Justdial selectors
          'button[class*="result"]',
          'button[class*="page"]',
          'a[onclick*="more"]',
          'button[onclick*="more"]',
          'div[class*="pagination"] button',
          'div[class*="pagination"] a'
        ];
        
        // First try to find and click load more buttons
        for (const selector of loadMoreSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent?.toLowerCase() || '';
            const isVisible = element.offsetParent !== null;
            
            if (isVisible && (
              text.includes('load') || 
              text.includes('more') || 
              text.includes('view') ||
              text.includes('show') ||
              text.includes('next') ||
              text.includes('continue')
            )) {
              console.log(`Bulk found load more element: ${selector} - "${text}" - Visible: ${isVisible}`);
              element.scrollIntoView({ behavior: 'instant', block: 'center' });
              setTimeout(() => element.click(), 100);
              return true;
            }
          }
        }
        
        // Try to find pagination links
        const paginationSelectors = [
          'a[href*="page-"]',
          'a[class*="page"]',
          'li[class*="page"] a',
          '.pagination a',
          '[data-testid*="page"]',
          'div[class*="pagination"] a:not([class*="active"])',
          'ul[class*="pagination"] a'
        ];
        
        for (const selector of paginationSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent?.trim() || '';
            const href = element.getAttribute('href') || '';
            const isVisible = element.offsetParent !== null;
            
            if (isVisible && (
              (text.includes('Next') || text.includes('>') || text.includes('»') || href.includes('page-')) && 
              !text.includes('Previous') && !text.includes('<') && !text.includes('«')
            )) {
              console.log(`Bulk found pagination link: ${selector} - "${text}" - ${href}`);
              element.scrollIntoView({ behavior: 'instant', block: 'center' });
              setTimeout(() => element.click(), 100);
              return true;
            }
          }
        }
        
        // Try to scroll down to trigger lazy loading
        const currentScroll = window.scrollY;
        const maxScroll = document.body.scrollHeight - window.innerHeight;
        
        if (currentScroll < maxScroll - 500) {
          console.log('Bulk: Scrolling down to trigger more content...');
          window.scrollTo({ top: currentScroll + 800, behavior: 'smooth' });
          setTimeout(() => {
            window.scrollTo({ top: maxScroll, behavior: 'smooth' });
          }, 500);
          return true;
        }
        
        return false;
      });
      
      // Step 8: Move to next page if available
      if (loadMoreFound) {
        console.log(`Bulk Page ${currentPage}: Moving to next page...`);
        await new Promise(resolve => setTimeout(resolve, 8000)); // Longer wait for bulk scraping
        currentPage++;
        console.log(`=== BULK PAGE ${currentPage - 1} COMPLETED ===`);
      } else {
        console.log(`Bulk Page ${currentPage}: No more pages found - scraping complete`);
        console.log(`=== BULK PAGE ${currentPage} COMPLETED - NO MORE PAGES ===`);
      }
    }
    
    console.log(`Bulk scraping - Total pages processed: ${currentPage - 1}`);
    console.log(`Bulk scraping - Total businesses found: ${allBusinesses.length}`);
    
    // Clean and deduplicate all collected businesses with improved logic
    console.log(`Bulk scraping - Starting deduplication of ${allBusinesses.length} businesses...`);
    
    // First pass: Basic cleaning and validation
    const cleanedBusinesses = allBusinesses.map(b => this.cleanAndValidateBusiness(b)).filter(b => b !== null);
    console.log(`Bulk scraping - After basic cleaning: ${cleanedBusinesses.length} businesses`);
    
    // Second pass: Standard deduplication
    const uniqueBusinesses = this.deduplicateBusinesses(cleanedBusinesses);
    console.log(`Bulk scraping - After standard deduplication: ${uniqueBusinesses.length} unique businesses`);
    
    // Third pass: If still less than 100, try relaxed deduplication
    let finalBusinesses = uniqueBusinesses;
    if (uniqueBusinesses.length < 100 && cleanedBusinesses.length > uniqueBusinesses.length) {
      console.log('Bulk scraping - Trying relaxed deduplication to reach 100+ businesses...');
      const relaxedBusinesses = this.deduplicateBusinessesRelaxed(cleanedBusinesses);
      console.log(`Bulk scraping - After relaxed deduplication: ${relaxedBusinesses.length} businesses`);
      
      // Use the relaxed version if it gives us more businesses
      if (relaxedBusinesses.length > uniqueBusinesses.length) {
        finalBusinesses = relaxedBusinesses;
      }
    }
    
    // Fourth pass: If still less than 100, try very relaxed criteria
    if (finalBusinesses.length < 100 && allBusinesses.length > finalBusinesses.length) {
      console.log('Bulk scraping - Trying very relaxed criteria to reach 100+ businesses...');
      const veryRelaxedBusinesses = this.deduplicateBusinessesVeryRelaxed(allBusinesses);
      console.log(`Bulk scraping - After very relaxed deduplication: ${veryRelaxedBusinesses.length} businesses`);
      
      // Use the very relaxed version if it gives us significantly more businesses
      if (veryRelaxedBusinesses.length > finalBusinesses.length) {
        finalBusinesses = veryRelaxedBusinesses;
      }
    }
    
    console.log(`Bulk scraping - Final result: ${finalBusinesses.length} unique businesses`);
    
    // Ensure we return at least 100 if possible
    if (finalBusinesses.length < 100 && finalBusinesses.length < this.maxCount) {
      console.log(`Bulk scraping - Warning: Only ${finalBusinesses.length} businesses found, but this is the maximum available after deduplication`);
    }
    
    return finalBusinesses.slice(0, this.maxCount);
  }

  async enhancedBulkScroll() {
    console.log('Starting enhanced bulk scrolling for maximum content loading...');
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let previousHeight = 0;
        let noChangeCount = 0;
        let scrollAttempts = 0;
        const maxNoChangeCount = 15; // Increased from 10 for bulk
        const maxScrollAttempts = 60; // Increased from 40 for bulk
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const windowHeight = window.innerHeight;
          
          // Slower, more thorough scrolling for bulk
          const scrollStep = Math.min(window.innerHeight, 400); // Reduced from 600
          window.scrollBy(0, scrollStep);
          totalHeight += scrollStep;
          scrollAttempts++;
          
          // Check if new content has loaded
          if (scrollHeight === previousHeight) {
            noChangeCount++;
          } else {
            noChangeCount = 0;
            previousHeight = scrollHeight;
          }
          
          // Enhanced stopping conditions for bulk
          const reachedBottom = window.scrollY + windowHeight >= scrollHeight - 200;
          const shouldStop = reachedBottom && noChangeCount >= maxNoChangeCount;
          const maxAttemptsReached = scrollAttempts >= maxScrollAttempts;
          
          if (shouldStop || maxAttemptsReached) {
            clearInterval(timer);
            console.log(`Bulk page scrolling completed. Attempts: ${scrollAttempts}, No change count: ${noChangeCount}`);
            
            // Enhanced wait for lazy-loaded content
            setTimeout(() => {
              // Scroll back to top to ensure all content is accessible
              window.scrollTo(0, 0);
              
              // Trigger any scroll-based lazy loading at the top
              setTimeout(() => {
                window.scrollTo(0, 300);
                setTimeout(() => {
                  window.scrollTo(0, 0);
                  setTimeout(() => {
                    // Final scroll to bottom to ensure everything is loaded
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    setTimeout(resolve, 3000);
                  }, 1500);
                }, 1500);
              }, 2000);
            }, 5000); // Increased from 4000
          }
        }, 300); // Slower scrolling from 400
      });
    });
  }

  async enhancedBulkAutoScroll() {
    console.log('Starting enhanced bulk automatic scrolling for dynamic content...');
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let previousHeight = 0;
        let noChangeCount = 0;
        let scrollAttempts = 0;
        const maxNoChangeCount = 15;
        const maxScrollAttempts = 80;
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          const windowHeight = window.innerHeight;
          
          const scrollStep = Math.min(window.innerHeight, 500);
          window.scrollBy(0, scrollStep);
          totalHeight += scrollStep;
          scrollAttempts++;
          
          if (scrollHeight === previousHeight) {
            noChangeCount++;
          } else {
            noChangeCount = 0;
            previousHeight = scrollHeight;
          }
          
          const reachedBottom = window.scrollY + windowHeight >= scrollHeight - 200;
          const shouldStop = reachedBottom && noChangeCount >= maxNoChangeCount;
          const maxAttemptsReached = scrollAttempts >= maxScrollAttempts;
          
          if (shouldStop || maxAttemptsReached) {
            clearInterval(timer);
            console.log(`Enhanced bulk scrolling completed. Attempts: ${scrollAttempts}, No change count: ${noChangeCount}`);
            
            setTimeout(() => {
              window.scrollTo(0, 0);
              
              setTimeout(() => {
                window.scrollTo(0, 200);
                setTimeout(() => {
                  window.scrollTo(0, 0);
                  setTimeout(resolve, 3000);
                }, 1500);
              }, 1500);
            }, 5000);
          }
        }, 600);
      });
    });
  }

  deduplicateBusinesses(businesses) {
    console.log(`Starting deduplication for ${businesses.length} businesses...`);
    const uniqueBusinesses = [];
    const seenExactBusinesses = new Set(); // For exact duplicates only
    
    businesses.forEach((business, index) => {
      const phoneKey = business.phone || '';
      const nameKey = business.name ? business.name.toLowerCase().trim() : '';
      const addressKey = business.address ? business.address.toLowerCase().trim() : '';
      
      // Enhanced validation - check if business has meaningful data
      const hasValidName = nameKey && nameKey.length > 2 && !nameKey.match(/^(call|contact|phone|mobile|address|unknown|n\/a)$/i);
      const hasValidPhone = phoneKey && phoneKey.length === 10 && /^[6-9]\d{9}$/.test(phoneKey);
      const hasValidAddress = addressKey && addressKey.length > 10;
      
      // Additional validation to filter out pagination and navigation elements
      const isPaginationElement = nameKey && (
        nameKey.includes('more') ||
        nameKey.includes('whatsapp') ||
        nameKey.includes('show') ||
        nameKey.includes('view') ||
        nameKey.includes('next') ||
        nameKey.includes('previous') ||
        nameKey.includes('page') ||
        nameKey.includes('load') ||
        nameKey.match(/^\d+\s*more$/i) ||
        nameKey.match(/^\d+$/) ||
        nameKey.match(/^(\d+,\s*)+\d+\s*more$/i) ||
        nameKey.match(/^(whatsapp|instagram|facebook|twitter|youtube|linkedin)/i) ||
        nameKey.match(/^(share|follow|connect|message|chat|call)$/i) ||
        nameKey.match(/^(menu|home|back|close|cancel|ok|yes|no)$/i) ||
        nameKey.match(/^(\w+,\s*)+\d+\s*more$/i)
      );
      
      // Business must have at least name + phone, or name + address to be considered valid
      // AND must not be a pagination/navigation element
      const isValidBusiness = !isPaginationElement && ((hasValidName && hasValidPhone) || (hasValidName && hasValidAddress));
      
      if (!isValidBusiness) {
        const reason = isPaginationElement ? 'Pagination/Navigation element' : 'Invalid business data';
        console.log(`-> Filtering out ${reason} ${index}: "${business.name}" (Phone: ${business.phone}, Address: ${business.address ? business.address.substring(0, 30) + '...' : 'N/A'})`);
        return;
      }
      
      // Create unique key for exact duplicate detection (same name + same phone + same address)
      const exactBusinessKey = `${nameKey}|${phoneKey}|${addressKey}`;
      
      // Allow same business names with different phone numbers or addresses
      // Only filter out exact duplicates (same name + same phone + same address)
      const isExactDuplicate = seenExactBusinesses.has(exactBusinessKey);
      
      if (!isExactDuplicate) {
        seenExactBusinesses.add(exactBusinessKey);
        uniqueBusinesses.push(business);
        console.log(`-> Added unique business: "${business.name}" (Phone: ${business.phone || 'N/A'}, Address: ${business.address ? business.address.substring(0, 30) + '...' : 'N/A'})`);
      } else {
        console.log(`-> Removed exact duplicate: "${business.name}" (Phone: ${business.phone || 'N/A'}, Address: ${business.address ? business.address.substring(0, 30) + '...' : 'N/A'})`);
      }
    });
    
    console.log(`Deduplication complete: ${uniqueBusinesses.length} unique businesses from ${businesses.length} total`);
    return uniqueBusinesses;
  }

  // Enhanced business validation and cleaning
  cleanAndValidateBusiness(business) {
    const cleaned = { ...business };
    
    // Clean name
    if (cleaned.name) {
      cleaned.name = cleaned.name.trim()
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/^[^a-zA-Z0-9]*/, '') // Remove leading non-alphanumeric
        .replace(/[^a-zA-Z0-9]*$/, '') // Remove trailing non-alphanumeric
        .substring(0, 200); // Limit length
      
      // Additional cleaning for pagination elements
      if (cleaned.name) {
        // Remove common pagination patterns
        cleaned.name = cleaned.name
          .replace(/^(\d+,\s*)+\d+\s*more$/gi, '') // "33 More,8 More,12 More"
          .replace(/^(\w+,\s*)+\d+\s*more$/gi, '') // "WhatsApp,33 More"
          .replace(/^(whatsapp|instagram|facebook|twitter|youtube|linkedin),?\s*\d*\s*more?$/gi, '')
          .replace(/^\d+\s*more$/gi, '') // "33 More"
          .replace(/^(show|view|load)\s*more$/gi, '') // "Show More"
          .replace(/^(next|previous)\s*page$/gi, '') // "Next Page"
          .trim();
        
        // If name becomes empty after cleaning, set to null
        if (cleaned.name.length === 0) {
          cleaned.name = '';
        }
      }
    }
    
    // Clean phone (already formatted in extraction, but double-check)
    if (cleaned.phone) {
      const phoneDigits = cleaned.phone.replace(/\D/g, '');
      if (phoneDigits.length === 10 && /^[6-9]\d{9}$/.test(phoneDigits)) {
        cleaned.phone = phoneDigits;
      } else {
        cleaned.phone = '';
      }
    }
    
    // Clean address
    if (cleaned.address) {
      cleaned.address = cleaned.address.trim()
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .substring(0, 500);
    }
    
    // Clean category
    if (cleaned.category) {
      cleaned.category = cleaned.category.trim()
        .replace(/\s+/g, ' ')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .substring(0, 100);
    }
    
    return cleaned;
  }

  // Relaxed deduplication for when we need more businesses
  deduplicateBusinessesRelaxed(businesses) {
    console.log(`Using relaxed deduplication for ${businesses.length} businesses...`);
    const uniqueBusinesses = [];
    const seenExactBusinesses = new Set(); // For exact duplicates only
    
    businesses.forEach((business, index) => {
      const phoneKey = business.phone || '';
      const nameKey = business.name ? business.name.toLowerCase().trim() : '';
      const addressKey = business.address ? business.address.toLowerCase().trim() : '';
      
      // More relaxed validation - just need a name OR phone
      const hasValidName = nameKey && nameKey.length > 2 && !nameKey.match(/^(call|contact|phone|mobile|address|unknown|n\/a)$/i);
      const hasValidPhone = phoneKey && phoneKey.length === 10 && /^[6-9]\d{9}$/.test(phoneKey);
      
      // Additional validation to filter out pagination and navigation elements (relaxed version)
      const isPaginationElement = nameKey && (
        nameKey.includes('more') ||
        nameKey.includes('whatsapp') ||
        nameKey.includes('show') ||
        nameKey.includes('view') ||
        nameKey.includes('next') ||
        nameKey.includes('previous') ||
        nameKey.includes('page') ||
        nameKey.includes('load') ||
        nameKey.match(/^\d+\s*more$/i) ||
        nameKey.match(/^\d+$/) ||
        nameKey.match(/^(\d+,\s*)+\d+\s*more$/i) ||
        nameKey.match(/^(whatsapp|instagram|facebook|twitter|youtube|linkedin)/i) ||
        nameKey.match(/^(share|follow|connect|message|chat|call)$/i)
      );
      
      const isValidBusiness = !isPaginationElement && (hasValidName || hasValidPhone);
      
      if (!isValidBusiness) {
        return;
      }
      
      // Create unique key for exact duplicate detection (same name + same phone + same address)
      const exactBusinessKey = `${nameKey}|${phoneKey}|${addressKey}`;
      
      // Allow same business names with different phone numbers or addresses
      // Only filter out exact duplicates (same name + same phone + same address)
      const isExactDuplicate = seenExactBusinesses.has(exactBusinessKey);
      
      if (!isExactDuplicate) {
        seenExactBusinesses.add(exactBusinessKey);
        uniqueBusinesses.push(business);
        console.log(`-> Added unique business (relaxed): "${business.name}" (Phone: ${business.phone || 'N/A'}, Address: ${business.address ? business.address.substring(0, 30) + '...' : 'N/A'})`);
      } else {
        console.log(`-> Removed exact duplicate (relaxed): "${business.name}" (Phone: ${business.phone || 'N/A'}, Address: ${business.address ? business.address.substring(0, 30) + '...' : 'N/A'})`);
      }
    });
    
    console.log(`Relaxed deduplication complete: ${uniqueBusinesses.length} unique businesses from ${businesses.length} total`);
    return uniqueBusinesses;
  }

  // Very relaxed deduplication for maximum business count
  deduplicateBusinessesVeryRelaxed(businesses) {
    console.log(`Using very relaxed deduplication for ${businesses.length} businesses...`);
    const uniqueBusinesses = [];
    const seenPhones = new Set(); // Only track phone numbers
    
    businesses.forEach((business, index) => {
      const phoneKey = business.phone || '';
      const nameKey = business.name ? business.name.toLowerCase().trim() : '';
      
      // Very relaxed validation - just need some basic info
      const hasAnyName = nameKey && nameKey.length > 1;
      const hasAnyPhone = phoneKey && phoneKey.length >= 5;
      
      // Only filter out obvious pagination elements
      const isObviousPagination = nameKey && (
        nameKey.match(/^\d+$/) ||
        nameKey.match(/^(\d+,\s*)+\d+\s*more$/i) ||
        nameKey.includes('load more results') ||
        nameKey.includes('show more results')
      );
      
      const isValidBusiness = !isObviousPagination && (hasAnyName || hasAnyPhone);
      
      if (!isValidBusiness) {
        return;
      }
      
      // Only filter out exact phone duplicates (same phone number)
      // Allow same business names with different phone numbers
      const isPhoneDuplicate = phoneKey && seenPhones.has(phoneKey);
      
      if (!isPhoneDuplicate) {
        if (phoneKey) {
          seenPhones.add(phoneKey);
        }
        uniqueBusinesses.push(business);
        console.log(`-> Added unique business (very relaxed): "${business.name}" (Phone: ${business.phone || 'N/A'})`);
      } else {
        console.log(`-> Removed phone duplicate (very relaxed): "${business.name}" (Phone: ${business.phone || 'N/A'})`);
      }
    });
    
    console.log(`Very relaxed deduplication complete: ${uniqueBusinesses.length} unique businesses from ${businesses.length} total`);
    return uniqueBusinesses;
  }
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

// Add a new company
app.post('/api/companies', async (req, res) => {
    try {
        const { company, phone, email, website, address, message, status } = req.body;
        
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
app.get('/api/companies', async (req, res) => {
    try {
        const { category, city, search } = req.query;
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
        
        const companies = await Company.find(filter).sort({ createdAt: -1 });
        res.json(companies);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Error fetching companies' });
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

// Justdial Scraper API Routes

// Get popular categories for Justdial
app.get('/api/categories', (req, res) => {
  const popularCategories = [
    { 
      name: 'Electricians', 
      icon: 'zap',
      description: 'Electrical services and repairs',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Plumbers', 
      icon: 'wrench',
      description: 'Plumbing services and repairs',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Restaurants', 
      icon: 'utensils',
      description: 'Food and dining services',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Doctors', 
      icon: 'stethoscope',
      description: 'Medical services and healthcare',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Chartered Accountants', 
      icon: 'calculator',
      description: 'Financial and accounting services',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Real Estate Agents', 
      icon: 'home',
      description: 'Property dealers and real estate',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Hotels', 
      icon: 'bed',
      description: 'Accommodation and hospitality',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Schools', 
      icon: 'graduation-cap',
      description: 'Education and learning centers',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Interior Designers', 
      icon: 'palette',
      description: 'Home and office interior design',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Packers and Movers', 
      icon: 'truck',
      description: 'Relocation and transportation',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Caterers', 
      icon: 'coffee',
      description: 'Food catering services',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    },
    { 
      name: 'Dentists', 
      icon: 'tooth',
      description: 'Dental care services',
      cities: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata']
    }
  ];
  
  res.json({
    success: true,
    categories: popularCategories
  });
});

// Scrape Justdial URL
app.post('/api/justdial-scrape', async (req, res) => {
  const { url, detectedCategory } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Validate Justdial URL
  if (!url.includes('justdial.com')) {
    return res.status(400).json({ error: 'Invalid Justdial URL' });
  }
  
  try {
    const scraper = new JustdialScraper();
    let data = await scraper.scrapeBusinessData(url, detectedCategory);
    
    // Apply enhanced deduplication to regular scraping as well
    console.log('Applying deduplication to regular scraping results...');
    const bulkScraper = new BulkJustdialScraper(); // Use the enhanced deduplication methods
    const cleanedData = data.map(b => bulkScraper.cleanAndValidateBusiness(b));
    const uniqueData = bulkScraper.deduplicateBusinesses(cleanedData);
    
    console.log(`Regular scraping - After deduplication: ${uniqueData.length} unique businesses from ${data.length} total`);
    
    // Ensure minimum 100 businesses if possible to match Justdial's actual count
    if (uniqueData.length < 100 && uniqueData.length < data.length) {
      console.log('Regular scraping - Trying to include more businesses to reach minimum 100...');
      const relaxedData = bulkScraper.deduplicateBusinessesRelaxed(data);
      if (relaxedData.length > uniqueData.length) {
        console.log(`Regular scraping - Using relaxed criteria: ${relaxedData.length} businesses`);
        data = relaxedData;
      } else {
        data = uniqueData;
      }
    } else {
      data = uniqueData;
    }
    
    if (data.length < 100) {
      console.log(`Warning: Only ${data.length} unique businesses found, which is less than the target 100+ from Justdial`);
    }
    
    // Save to history
    try {
      const historyEntry = new JustdialHistory({
        url: url,
        category: detectedCategory || 'Unknown',
        businessCount: data.length,
        scrapeType: 'single',
        data: data
      });
      await historyEntry.save();
      console.log('JustDial scrape history saved successfully');
    } catch (historyError) {
      console.error('Error saving JustDial history:', historyError);
      // Don't fail the request if history saving fails
    }

    res.json({
      success: true,
      data: data,
      count: data.length,
      uniqueCount: data.length,
      originalCount: data.length
    });
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape data',
      message: error.message 
    });
  }
});

// Bulk Scrape Justdial URL for 250-350 businesses
app.post('/api/justdial-bulk-scrape', async (req, res) => {
  const { url, detectedCategory } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Validate Justdial URL
  if (!url.includes('justdial.com')) {
    return res.status(400).json({ error: 'Invalid Justdial URL' });
  }
  
  // Set up Server-Sent Events for progress tracking
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  const progressCallback = (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };
  
  try {
    const bulkScraper = new BulkJustdialScraper();
    bulkScraper.setProgressCallback(progressCallback);
    
    // Send initial progress
    progressCallback({
      current: 0,
      target: 250,
      percentage: 0,
      page: 0,
      status: 'starting'
    });
    
    const data = await bulkScraper.scrapeBulkBusinessData(url);
    
    // Send final progress
    progressCallback({
      current: data.length,
      target: 250,
      percentage: 100,
      page: 0,
      status: 'completed',
      finalData: data
    });
    
    // Save to history
    try {
      const historyEntry = new JustdialHistory({
        url: url,
        category: detectedCategory || 'Unknown',
        businessCount: data.length,
        scrapeType: 'bulk',
        data: data
      });
      await historyEntry.save();
      console.log('JustDial bulk scrape history saved successfully');
    } catch (historyError) {
      console.error('Error saving JustDial bulk history:', historyError);
      // Don't fail request if history saving fails
    }

    // Close the connection
    res.write(`data: ${JSON.stringify({ success: true, data: data, count: data.length, finished: true })}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('Bulk scraping error:', error);
    progressCallback({
      current: 0,
      target: 250,
      percentage: 0,
      page: 0,
      status: 'error',
      error: error.message
    });
    
    res.write(`data: ${JSON.stringify({ success: false, error: error.message, finished: true })}\n\n`);
    res.end();
  }
});

// Bulk Scrape Justdial URL for 250-350 businesses (alias endpoint)
app.post('/api/bulk-scrape', async (req, res) => {
  const { url, detectedCategory } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  // Validate Justdial URL
  if (!url.includes('justdial.com')) {
    return res.status(400).json({ error: 'Invalid Justdial URL' });
  }
  
  // Set up Server-Sent Events for progress tracking
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  const progressCallback = (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };
  
  try {
    const bulkScraper = new BulkJustdialScraper();
    bulkScraper.setProgressCallback(progressCallback);
    
    // Send initial progress
    progressCallback({
      current: 0,
      target: 250,
      percentage: 0,
      page: 0,
      status: 'starting'
    });
    
    const data = await bulkScraper.scrapeBulkBusinessData(url);
    
    // Send final progress
    progressCallback({
      current: data.length,
      target: 250,
      percentage: 100,
      page: 0,
      status: 'completed',
      finalData: data
    });
    
    // Close the connection
    res.write(`data: ${JSON.stringify({ success: true, data: data, count: data.length, finished: true })}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('Bulk scraping error:', error);
    progressCallback({
      current: 0,
      target: 250,
      percentage: 0,
      page: 0,
      status: 'error',
      error: error.message
    });
    
    res.write(`data: ${JSON.stringify({ success: false, error: error.message, finished: true })}\n\n`);
    res.end();
  }
});

// Export Justdial data to Excel
app.post('/api/export/excel', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
    // Ensure all businesses have all required fields, even if empty
    const normalizedData = data.map(business => ({
      'Business Name': business.name || '',
      'Phone Number': business.phone || '',
      'Address': business.address || '',
      'Category': business.category || '',
      'City': business.city || '',
      'Rating': business.rating || '',
      'Image URL': business.image || '',
      'Website': business.website || ''
    }));
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(normalizedData);
    xlsx.utils.book_append_sheet(wb, ws, 'Business Data');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=justdial-business-data.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Failed to export Excel file' });
  }
});

// Export Justdial data to CSV
app.post('/api/export/csv', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
    const headers = ['Business Name', 'Phone Number', 'Address', 'Category', 'City', 'Rating', 'Image URL', 'Website'];
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
      const values = [
        `"${(row.name || '').replace(/"/g, '""')}"`,
        `"${(row.phone || '').replace(/"/g, '""')}"`,
        `"${(row.address || '').replace(/"/g, '""')}"`,
        `"${(row.category || '').replace(/"/g, '""')}"`,
        `"${(row.city || '').replace(/"/g, '""')}"`,
        `"${(row.rating || '').replace(/"/g, '""')}"`,
        `"${(row.image || '').replace(/"/g, '""')}"`,
        `"${(row.website || '').replace(/"/g, '""')}"` 
      ];
      csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=justdial-business-data.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV file' });
  }
});

// Image proxy endpoint to handle CORS issues for Justdial images
app.get('/api/proxy/image', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Image URL is required' });
  }
  
  // Handle N/A case
  if (url === 'N/A' || url === 'n/a') {
    return res.status(404).json({ error: 'No image available (N/A)' });
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  
  console.log(`Proxying Justdial image: ${url}`);
  
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.justdial.com/',
        'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      timeout: 15000,
      maxRedirects: 5
    });
    
    // Check if the response is actually an image
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      console.log(`Not an image: ${contentType}`);
      return res.status(400).json({ error: 'URL does not point to an image' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=7200'); // Cache for 2 hours
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Pipe the image data
    response.data.pipe(res);
    
  } catch (error) {
    console.error('Justdial image proxy error:', error.message);
    
    // Handle different error types
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      res.status(404).json({ error: 'Image not found or server unreachable' });
    } else if (error.code === 'ETIMEDOUT') {
      res.status(408).json({ error: 'Request timeout' });
    } else if (error.response) {
      res.status(error.response.status).json({ 
        error: `Server returned ${error.response.status}`,
        message: error.response.statusText 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch image',
        message: error.message 
      });
    }
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

// Get JustDial scraper history
app.get('/api/justdial-history', async (req, res) => {
  try {
    const history = await JustdialHistory.find()
      .sort({ scrapeDate: -1 })
      .limit(50); // Limit to last 50 entries
    
    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error('Error fetching JustDial history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch history',
      message: error.message 
    });
  }
});

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

// Get JustDial history by ID
app.get('/api/justdial-history/:id', async (req, res) => {
  try {
    const historyEntry = await JustdialHistory.findById(req.params.id);
    
    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      data: historyEntry
    });
  } catch (error) {
    console.error('Error fetching JustDial history entry:', error);
    res.status(500).json({ 
      error: 'Failed to fetch history entry',
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

// Delete JustDial history entry
app.delete('/api/justdial-history/:id', async (req, res) => {
  try {
    const historyEntry = await JustdialHistory.findByIdAndDelete(req.params.id);
    
    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      message: 'History entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting JustDial history entry:', error);
    res.status(500).json({ 
      error: 'Failed to delete history entry',
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

// Download all JustDial history data
app.post('/api/download/justdial-history', async (req, res) => {
  try {
    const history = await JustdialHistory.find()
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
          'Phone Number': business.phone || '',
          'Address': business.address || '',
          'Category': business.category || entry.category || '',
          'City': business.city || '',
          'Image URL': business.image || '',
          'Scrape Date': new Date(entry.scrapeDate).toLocaleString(),
          'Scrape Type': entry.scrapeType || 'single',
          'Original URL': entry.url || ''
        });
      });
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(allData);
    xlsx.utils.book_append_sheet(wb, ws, 'All History Data');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="justdial-complete-history.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Download history error:', error);
    res.status(500).json({ error: 'Failed to download history data' });
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

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Run initial cleanup
    cleanupOldFiles();
});
