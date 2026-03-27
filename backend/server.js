const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
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

// Excel Scraper utilities
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4,6}\b|\b\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{4,8}\b|\b\d{8,}\b|(?:\b\d{3}\b[-.\s]?)(?:\b\d{6}\b)|(?:\b\d{3}\b[-.\s]?)(?:\b\d{3}\b[-.\s]?)(?:\b\d{4}\b)/g;

// Enhanced phone extraction function
const extractPhoneNumbers = (text) => {
    let phones = text.match(phoneRegex) || [];
    
    if (phones.length === 0) {
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

// Scrape website for contact information
const scrapeWebsite = async (url) => {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        console.log(`Scraping: ${url}`);

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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
            '.address', '.info', '.about', 'main', 'section', 'article'
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

        console.log(`Extracted text length: ${allText.length} characters`);

        const emails = allText.match(emailRegex) || [];
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
            .filter((email, index, self) => self.indexOf(email) === index);

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

        console.log(`Found ${uniqueEmails.length} emails and ${uniquePhones.length} phones for ${url}`);

        return {
            success: true,
            emails: uniqueEmails.slice(0, 5),
            phones: uniquePhones.slice(0, 3),
            error: null,
            scrapedUrl: url
        };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
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

        console.log(`Processing ${data.length} rows`);
        console.log(`URL column: ${urlColumn || 'Not found'}`);
        console.log(`Phone column: ${phoneColumn || 'Not found'}`);
        console.log(`Email column: ${emailColumn || 'Not found'}`);
        console.log(`Address column: ${addressColumn || 'Not found'}`);

        const batchSize = 5;
        const results = [];

        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const batchPromises = batch.map(async (row, index) => {
                const url = urlColumn ? row[urlColumn] : null;
                const existingPhone = phoneColumn ? String(row[phoneColumn] || '') : '';
                const existingEmail = emailColumn ? String(row[emailColumn] || '') : '';
                const existingAddress = addressColumn ? extractAddress(String(row[addressColumn] || '')) : '';
                
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
                        const phoneMatches = existingPhone.match(phoneRegex) || [];
                        cleanedPhone = phoneMatches.join(', ').trim();
                    }
                    
                    let cleanedEmail = '';
                    if (existingEmail && existingEmail.trim()) {
                        const emailMatches = existingEmail.match(emailRegex) || [];
                        cleanedEmail = emailMatches.join(', ').trim();
                    }
                    
                    return {
                        ...row,
                        email: cleanedEmail,
                        phone: cleanedPhone,
                        address: existingAddress.trim(),
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
                    const emailMatches = existingEmail.match(emailRegex) || [];
                    cleanedExistingEmail = emailMatches.join(', ').trim();
                }
                
                if (cleanedExistingPhone && cleanedExistingEmail) {
                    finalPhone = cleanedExistingPhone;
                    finalEmail = cleanedExistingEmail;
                    scrapeStatus = 'Used existing data (phone + email)';
                } else if (cleanedExistingPhone) {
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = cleanedExistingPhone;
                    scrapeStatus = scrapeResult.success ? 'Success' : `Error: ${scrapeResult.error}`;
                }
                
                return {
                    ...row,
                    email: finalEmail,
                    phone: finalPhone,
                    address: existingAddress.trim(),
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
            const email = row['Email'] || row.email || row.Email || '';
            
            // Extract address - check for rllt_detail1 first, then other address columns
            let address = '';
            if (row['rllt_detail1']) {
                address = extractAddress(String(row['rllt_detail1'] || ''));
            } else {
                address = row['Address'] || row.address || row.Address || row.Location || row.location || row.City || row.city || '';
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
// ... (rest of the code remains the same)
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

// Get all companies with their status
app.get('/api/companies', async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.json(companies);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Error fetching companies' });
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

// Excel Scraper download endpoint
app.get('/api/excel-scraper/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'uploads', filename);

        if (!require('fs').existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath, `processed-${filename}`, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ error: 'Error downloading file' });
            }
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Error downloading file' });
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

// Periodic cleanup function for old upload files
const cleanupOldFiles = () => {
    const uploadsDir = path.join(__dirname, 'uploads');
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
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

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Run initial cleanup
    cleanupOldFiles();
});
