const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
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

// Import authentication routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// Import JustdialHistory model
const JustdialHistory = require('./models/JustdialHistory');

// Import GoogleMapsHistory model
const GoogleMapsHistory = require('./models/GoogleMapsHistory');

// Add proxy rotation and user agent management for Justdial Scraper
class JustdialProxyRotator {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
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
      { width: 1280, height: 720 }
    ];
    return viewports[Math.floor(Math.random() * viewports.length)];
  }
}

const justdialProxyRotator = new JustdialProxyRotator();

// Function to sanitize data for SSE transmission to prevent JSON parsing issues
function sanitizeForSSE(data) {
  if (data === null || data === undefined) {
    return {};
  }
  
  if (typeof data !== 'object') {
    return { value: String(data).replace(/[\x00-\x1F\x7F]/g, '') };
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      sanitized[key] = null;
    } else if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForSSE(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' ? sanitizeForSSE(item) : 
        typeof item === 'string' ? item.replace(/[\x00-\x1F\x7F]/g, '') : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

function formatJustdialPhoneNumber(phone) {
  if (!phone) return '';
  
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
    cleanPhone = cleanPhone.substring(2);
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  } else if (cleanPhone.length === 13 && cleanPhone.startsWith('+91')) {
    cleanPhone = cleanPhone.substring(3);
  } else if (cleanPhone.length === 10 && cleanPhone.match(/^[6-9]\d{9}$/)) {
    return cleanPhone;
  } else if (cleanPhone.length === 10 && cleanPhone.match(/^[0-9]{10}$/)) {
    if (cleanPhone.match(/^[6-9]\d{9}$/)) {
      return cleanPhone;
    }
    return '';
  } else if (cleanPhone.length > 10) {
    cleanPhone = cleanPhone.slice(-10);
    if (cleanPhone.match(/^[6-9]\d{9}$/)) {
      return cleanPhone;
    }
    return '';
  }
  
  if (cleanPhone.length === 10 && cleanPhone.match(/^[6-9]\d{9}$/)) {
    return cleanPhone;
  }
  
  return '';
}

function validateJustdialPhoneNumber(phone) {
  if (!phone) return { valid: false, reason: 'Empty phone number' };
  
  const formattedPhone = formatJustdialPhoneNumber(phone);
  if (!formattedPhone) return { valid: false, reason: 'Invalid format' };
  
  if (!formattedPhone.match(/^[6-9]\d{9}$/)) {
    return { valid: false, reason: 'Not a valid Indian mobile number' };
  }
  
  return { valid: true, reason: 'Valid Indian mobile number' };
}

function extractCityFromJustdialUrl(url) {
  const match = url.match(/\.com\/([^\/]+)\//);
  if (match && match[1]) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return 'Unknown';
}

// Enhanced Justdial Scraper Service (kept as in original)
class JustdialScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    console.log('🔄 Initializing Justdial browser...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      protocolTimeout: 300000,
      defaultViewport: null,
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
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      window.chrome = {
        runtime: {},
      };
    });
    
    await this.page.setUserAgent(justdialProxyRotator.getRandomUserAgent());
    await this.page.setViewport(justdialProxyRotator.getRandomViewport());
    
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Referer': 'https://www.google.com/',
      'DNT': '1'
    });
    
    console.log('✅ Justdial browser initialized successfully');
  }

  async scrapeBusinessData(url, detectedCategory = '') {
    try {
      await this.initialize();
      
      console.log('🌐 Navigating to Justdial URL:', url);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const city = extractCityFromJustdialUrl(url);
      console.log(`📍 City detected: ${city}`);
      
      await this.waitForBusinessListings();
      
      const businessData = await this.extractAllBusinessesWithPagination(city, detectedCategory);
      
      console.log(`✅ Total businesses found: ${businessData.length}`);
      
      if (businessData.length > 0) {
        console.log('\n📊 Sample extracted Justdial data:');
        console.log('='.repeat(60));
        const sample = businessData[0];
        console.log(`Name: ${sample.name}`);
        console.log(`Phone: ${sample.phone || 'N/A'} (${sample.phone ? formatJustdialPhoneNumber(sample.phone) : 'N/A'})`);
        console.log(`City: ${sample.city || 'N/A'}`);
        console.log(`Category: ${sample.category || 'N/A'}`);
        console.log(`Image: ${sample.image ? 'Yes' : 'No'}`);
        console.log('='.repeat(60));
      }
      
      return businessData;
      
    } catch (error) {
      console.error('❌ Justdial scraping error:', error);
      throw new Error(`Failed to scrape Justdial data: ${error.message}`);
    } finally {
      await this.close();
    }
  }

  async waitForBusinessListings() {
    console.log('⏳ Waiting for Justdial business listings to load...');
    
    const selectors = [
      '.resultbox',
      '.jsx-2622435384',
      '[data-testid="result-card"]',
      '.store-details',
      '.result-card',
      '.listing-card',
      'div[class*="result"]',
      'div[class*="store"]'
    ];
    
    let found = false;
    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 10000 });
        console.log(`✅ Found Justdial selector: ${selector}`);
        found = true;
        break;
      } catch (e) {
        // Continue
      }
    }
    
    if (!found) {
      console.log('⚠️ No Justdial listings found with standard selectors');
    }
  }

  async extractAllBusinessesWithPagination(city, detectedCategory) {
    let allBusinesses = [];
    let currentPage = 1;
    let hasNextPage = true;
    
    while (hasNextPage && currentPage <= 20) {
      console.log(`\n📄 === Processing Justdial Page ${currentPage} ===`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.autoScroll();
      
      const businesses = await this.extractBusinessesFromPage(city, detectedCategory);
      console.log(`📊 Found ${businesses.length} businesses on Justdial page ${currentPage}`);
      
      allBusinesses.push(...businesses);
      console.log(`📈 Total businesses so far: ${allBusinesses.length}`);
      
      hasNextPage = await this.goToNextPage();
      if (hasNextPage) {
        currentPage++;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const uniqueBusinesses = this.removeDuplicates(allBusinesses);
    console.log(`\n🎯 === Justdial Scraping Complete ===`);
    console.log(`📄 Total pages processed: ${currentPage}`);
    console.log(`📊 Total businesses found: ${allBusinesses.length}`);
    console.log(`✨ Unique businesses: ${uniqueBusinesses.length}`);
    
    return uniqueBusinesses;
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 400;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    });
  }

  async extractBusinessesFromPage(city, detectedCategory) {
    return await this.safePageEvaluate((defaultCity, detectedCat) => {
      const businesses = [];
      const processedPhones = new Set();
      
      function formatPhoneNumberLocal(phone) {
        if (!phone) return '';
        
        let cleanPhone = phone.toString().replace(/\D/g, '');
        
        if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
          cleanPhone = cleanPhone.substring(2);
        }
        else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
          cleanPhone = cleanPhone.substring(1);
        }
        else if (cleanPhone.length === 13 && cleanPhone.startsWith('91')) {
          cleanPhone = cleanPhone.substring(2);
        }
        
        if (cleanPhone.length === 10) {
          return cleanPhone;
        }
        
        if (cleanPhone.length > 10) {
          cleanPhone = cleanPhone.slice(-10);
          if (cleanPhone.length === 10) {
            return cleanPhone;
          }
        }
        
        return '';
      }
      
      const clickShowNumberButtons = () => {
        let clickedCount = 0;
        
        const selectors = [
          'button[class*="show"]',
          'button[class*="number"]',
          'span[class*="show"]',
          'div[onclick*="showNumber"]',
          '.show-number',
          '.showNumber',
          '[data-testid*="show-number"]',
          '.call-action',
          '.contact-action',
          '.reveal-number',
          '.view-number',
          '.get-number',
          '.phone-reveal'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const text = (element.textContent || '').toLowerCase();
            if (text.includes('show') || text.includes('number') || text.includes('call')) {
              try {
                element.click();
                clickedCount++;
                console.log(`🖱️ Clicked show number button via selector: ${selector}`);
              } catch(e) {
                console.log('Failed to click element:', e.message);
              }
            }
          });
        }
        
        const allElements = document.querySelectorAll('button, span, div, a, [onclick]');
        allElements.forEach(element => {
          const text = (element.textContent || '').toLowerCase();
          const className = (element.className || '').toLowerCase();
          const onclick = (element.getAttribute('onclick') || '').toLowerCase();
          const dataAction = (element.getAttribute('data-action') || '').toLowerCase();
          
          const showNumberPatterns = [
            'show number',
            'show the number',
            'view number',
            'get number',
            'reveal number',
            'click to show',
            'display number',
            'phone number',
            'contact number'
          ];
          
          const shouldClick = showNumberPatterns.some(pattern => 
            text.includes(pattern) || 
            className.includes('show') || 
            className.includes('number') ||
            onclick.includes('show') ||
            onclick.includes('number') ||
            dataAction.includes('show') ||
            dataAction.includes('number')
          );
          
          if (shouldClick && element.style.display !== 'none' && !element.disabled) {
            try {
              element.scrollIntoView({ behavior: 'instant', block: 'center' });
              
              setTimeout(() => {
                element.click();
                clickedCount++;
                console.log(`🖱️ Clicked show number button via text: ${text.substring(0, 30)}`);
              }, 100);
            } catch(e) {
              console.log('Failed to click element:', e.message);
            }
          }
        });
        
        console.log(`📞 Total show number buttons clicked: ${clickedCount}`);
        return clickedCount;
      };
      
      const buttonsClicked = clickShowNumberButtons();
      
      const waitForNumbers = () => {
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkInterval = setInterval(() => {
          attempts++;
          
          const phoneElements = document.querySelectorAll('[class*="phone"], [class*="tel"], [class*="number"], a[href*="tel:"]');
          let hasNumbers = false;
          
          phoneElements.forEach(el => {
            const text = el.textContent || '';
            if (text.match(/\d{10}/)) {
              hasNumbers = true;
            }
          });
          
          if (hasNumbers || attempts >= maxAttempts) {
            clearInterval(checkInterval);
          }
        }, 300);
      };
      
      waitForNumbers();
      
      const listingSelectors = [
        '.resultbox',
        '.jsx-2622435384',
        '[data-testid="result-card"]',
        '.store-details',
        '.result-card',
        '.listing-card',
        'div[class*="result"]',
        'div[class*="store"]',
        'div[class*="listing"]',
        'li[class*="result"]'
      ];
      
      let listings = [];
      for (const selector of listingSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          listings = elements;
          console.log(`Found ${elements.length} Justdial listings with selector: ${selector}`);
          break;
        }
      }
      
      if (listings.length === 0) {
        console.log('No Justdial listings found');
        return businesses;
      }
      
      console.log(`Processing ${listings.length} Justdial listings...`);
      
      listings.forEach((listing, index) => {
        try {
          const business = {
            name: '',
            phone: '',
            address: '',
            category: '',
            city: defaultCity,
            rating: '',
            image: '',
            website: ''
          };
          
          const nameSelectors = [
            '.store-name',
            '.resultbox-title',
            'h2', 'h3', 'h4',
            '.title',
            '[class*="name"]',
            '.company-name',
            '.business-name'
          ];
          
          for (const selector of nameSelectors) {
            const nameElement = listing.querySelector(selector);
            if (nameElement) {
              let name = nameElement.textContent.trim();
              if (name && name.length > 2 && name.length < 150 && 
                  !name.includes('Show Number') && 
                  !name.includes('More')) {
                business.name = name;
                console.log(`✅ Found name: ${name.substring(0, 50)}`);
                break;
              }
            }
          }
          
          let phoneFound = false;
          let foundPhones = [];
          
          const phoneSelectors = [
            '.tel-number',
            '.phone-number',
            '.mobile-number',
            '[class*="phone"]',
            '[class*="tel"]',
            '[class*="mobile"]',
            '[class*="contact"]',
            '.contact-info',
            '.contact-details',
            '.phone-info',
            '.call-info',
            'a[href*="tel:"]',
            'span[onclick*="tel:"]',
            'div[onclick*="tel:"]',
            '.callnow',
            '.call-btn',
            '[data-phone]',
            '[data-mobile]',
            '[data-tel]',
            '.show-number ~ span',
            '.showNumber + span',
            '.reveal-number',
            '.number-display',
            '.phone-display'
          ];
          
          for (const selector of phoneSelectors) {
            const phoneElements = listing.querySelectorAll(selector);
            for (const phoneElement of phoneElements) {
              let phone = phoneElement.textContent.trim() || 
                         phoneElement.getAttribute('data-phone') || 
                         phoneElement.getAttribute('data-mobile') || 
                         phoneElement.getAttribute('data-tel') ||
                         phoneElement.href || '';
              
              if (phone.startsWith('tel:')) {
                phone = phone.replace('tel:', '');
              }
              
              if (phone) {
                const formattedPhone = formatPhoneNumberLocal(phone);
                if (formattedPhone && !processedPhones.has(formattedPhone)) {
                  foundPhones.push(formattedPhone);
                  console.log(`📞 Found phone via ${selector}: ${formattedPhone}`);
                }
              }
            }
          }
          
          if (foundPhones.length === 0) {
            const elementsWithOnclick = listing.querySelectorAll('[onclick], [data-action]');
            for (const element of elementsWithOnclick) {
              const onclick = element.getAttribute('onclick') || '';
              const dataAction = element.getAttribute('data-action') || '';
              const combinedText = onclick + ' ' + dataAction;
              
              const phonePatterns = [
                /tel:([\+]?[0-9\s\-\(\)]+)/gi,
                /([\+]?91[-\s]?[6-9]\d{9})/gi,
                /([6-9]\d{9})/gi,
                /(\d{3}[-\s]?\d{3}[-\s]?\d{4})/gi,
                /(\d{5}[-\s]?\d{5})/gi
              ];
              
              for (const pattern of phonePatterns) {
                const matches = combinedText.match(pattern);
                if (matches) {
                  for (let match of matches) {
                    const cleanMatch = match.replace(/tel:|[^0-9\+]/g, '');
                    const formattedPhone = formatPhoneNumberLocal(cleanMatch);
                    if (formattedPhone && !processedPhones.has(formattedPhone)) {
                      foundPhones.push(formattedPhone);
                      console.log(`📞 Found phone from attributes: ${formattedPhone}`);
                    }
                  }
                }
              }
            }
          }
          
          if (foundPhones.length === 0) {
            const listingText = listing.textContent + ' ' + listing.innerHTML;
            
            const phonePatterns = [
              /([\+]?91[-\s]?[6-9]\d{9})/gi,
              /([6-9]\d{9})/gi,
              /0?[6-9]\d{9}/gi,
              /\d{3}[-\s]?\d{3}[-\s]?\d{4}/gi,
              /\d{5}[-\s]?\d{5}/gi,
              /\d{4}[-\s]?\d{3}[-\s]?\d{3}/gi,
              /\d{2}[-\s]?\d{4}[-\s]?\d{4}/gi,
              /\+?[0-9][0-9\s\-\(\)]{9,}[0-9]/gi
            ];
            
            for (const pattern of phonePatterns) {
              const matches = listingText.match(pattern);
              if (matches) {
                for (let phone of matches) {
                  const formattedPhone = formatPhoneNumberLocal(phone);
                  if (formattedPhone && !processedPhones.has(formattedPhone)) {
                    foundPhones.push(formattedPhone);
                    console.log(`📞 Found phone from text: ${formattedPhone}`);
                  }
                }
              }
            }
          }
          
          if (foundPhones.length === 0) {
            const dynamicElements = listing.querySelectorAll('*');
            for (const element of dynamicElements) {
              const computedStyle = window.getComputedStyle(element);
              if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
                const text = element.textContent || '';
                if (text.match(/\d{10}/) && !text.includes('Show') && !text.includes('More')) {
                  const formattedPhone = formatPhoneNumberLocal(text);
                  if (formattedPhone && !processedPhones.has(formattedPhone)) {
                    foundPhones.push(formattedPhone);
                    console.log(`📞 Found phone from dynamic content: ${formattedPhone}`);
                  }
                }
              }
            }
          }
          
          if (foundPhones.length > 0) {
            business.phone = foundPhones[0];
            processedPhones.add(foundPhones[0]);
            phoneFound = true;
            console.log(`📞 Final phone selected: ${business.phone} (from ${foundPhones.length} candidates)`);
          }
          
          const addressSelectors = [
            '.address',
            '.location',
            '.store-address',
            '[class*="address"]',
            '[class*="location"]',
            '.addr',
            '.contact-address'
          ];
          
          for (const selector of addressSelectors) {
            const addressElement = listing.querySelector(selector);
            if (addressElement) {
              let address = addressElement.textContent.trim();
              if (address && address.length > 10 && !address.includes('Show Number')) {
                business.address = address;
                console.log(`📍 Found address: ${address.substring(0, 50)}`);
                break;
              }
            }
          }
          
          const categorySelectors = [
            '.category',
            '.store-category',
            '[class*="category"]',
            '.tags',
            '.type',
            '.business-type'
          ];
          
          for (const selector of categorySelectors) {
            const categoryElement = listing.querySelector(selector);
            if (categoryElement) {
              let category = categoryElement.textContent.trim();
              if (category && category.length > 2 && category.length < 100 &&
                  !category.includes('Show')) {
                business.category = category;
                console.log(`🏷️ Found category: ${category}`);
                break;
              }
            }
          }
          
          if (!business.category && detectedCat) {
            business.category = detectedCat;
          }
          
          const imageSelectors = [
            'img',
            '.store-image img',
            '.resultbox-img img',
            '[class*="image"] img',
            '[class*="img"] img',
            'picture img',
            '.thumbnail img',
            '.logo img'
          ];
          
          for (const selector of imageSelectors) {
            const imgElements = listing.querySelectorAll(selector);
            for (const img of imgElements) {
              let imageUrl = img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
              
              if (imageUrl && !imageUrl.startsWith('data:') && 
                  imageUrl !== 'about:blank' && 
                  imageUrl.length > 10) {
                
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                }
                
                if (!imageUrl.includes('placeholder') && 
                    !imageUrl.includes('no-image') &&
                    imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
                  business.image = imageUrl;
                  console.log(`🖼️ Found image: ${imageUrl.substring(0, 80)}`);
                  break;
                }
              }
            }
            if (business.image) break;
          }
          
          const ratingSelectors = [
            '.rating',
            '.stars',
            '[class*="rating"]',
            '[class*="star"]'
          ];
          
          for (const selector of ratingSelectors) {
            const ratingElement = listing.querySelector(selector);
            if (ratingElement) {
              const rating = ratingElement.textContent.trim();
              if (rating && rating.match(/\d+\.?\d*/)) {
                business.rating = rating;
                break;
              }
            }
          }
          
          if (business.name || business.phone) {
            businesses.push(business);
            console.log(`✨ Added business: ${business.name || 'Unknown'} (Phone: ${business.phone || 'N/A'})`);
          }
          
        } catch (error) {
          console.log(`Error processing Justdial listing ${index}:`, error.message);
        }
      });
      
      return businesses;
    }, city, detectedCategory);
  }

  async goToNextPage() {
    try {
      if (!(await this.validateBrowserContext())) {
        console.log('Browser context lost before pagination, attempting recovery...');
        if (!(await this.recoverBrowser())) {
          throw new Error('Failed to recover browser before pagination');
        }
      }

      const nextPageSelectors = [
        'a[title*="Next"]',
        'a[class*="next"]',
        '.next-page',
        '.pagination .next',
        'li.next a',
        'a[rel="next"]',
        'button[aria-label*="Next"]',
        '.page-next'
      ];
      
      for (const selector of nextPageSelectors) {
        const nextButton = await this.page.$(selector);
        if (nextButton) {
          const isDisabled = await this.page.evaluate(el => {
            return el.disabled || 
                   el.classList.contains('disabled') || 
                   el.hasAttribute('disabled');
          }, nextButton);
          
          if (!isDisabled) {
            console.log(`🖱️ Clicking next page button: ${selector}`);
            await nextButton.click();
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!(await this.validateBrowserContext())) {
              console.log('Browser context lost after navigation, attempting recovery...');
              if (!(await this.recoverBrowser())) {
                throw new Error('Failed to recover browser after pagination');
              }
            }
            
            return true;
          }
        }
      }
      
      const paginationLinks = await this.page.$$('.pagination a, .pagination li a');
      if (paginationLinks.length > 0) {
        for (let i = 0; i < paginationLinks.length; i++) {
          const text = await this.page.evaluate(el => el.textContent, paginationLinks[i]);
          if (text && (text.includes('>') || text.toLowerCase().includes('next') || text === '»')) {
            console.log('🖱️ Clicking next page via pagination link');
            await paginationLinks[i].click();
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!(await this.validateBrowserContext())) {
              console.log('Browser context lost after pagination, attempting recovery...');
              if (!(await this.recoverBrowser())) {
                throw new Error('Failed to recover browser after pagination');
              }
            }
            
            return true;
          }
        }
      }
      
      console.log('📄 No next page found');
      return false;
      
    } catch (error) {
      console.error('❌ Error during pagination:', error.message);
      return false;
    }
  }

  removeDuplicates(businesses) {
    const unique = [];
    const seen = new Set();
    
    for (const business of businesses) {
      const key = `${business.name}|${business.phone}`;
      if (!seen.has(key) && (business.name || business.phone)) {
        seen.add(key);
        unique.push(business);
      }
    }
    
    return unique;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async validateBrowserContext() {
    try {
      if (!this.browser || !this.page) {
        return false;
      }
      
      await this.page.evaluate(() => document.title);
      return true;
    } catch (error) {
      console.warn('Browser context validation failed:', error.message);
      return false;
    }
  }

  async recoverBrowser() {
    console.log('🔄 Attempting browser recovery...');
    try {
      await this.close();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.initialize();
      console.log('✅ Browser recovery successful');
      return true;
    } catch (error) {
      console.error('❌ Browser recovery failed:', error.message);
      return false;
    }
  }

  async safePageEvaluate(pageFunction, ...args) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        if (!(await this.validateBrowserContext())) {
          console.log(`Browser context lost, attempting recovery (attempt ${retryCount + 1}/${maxRetries})`);
          if (!(await this.recoverBrowser())) {
            throw new Error('Failed to recover browser context');
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return await this.page.evaluate(pageFunction, ...args);
      } catch (error) {
        retryCount++;
        console.warn(`Page evaluation failed (attempt ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount >= maxRetries) {
          throw new Error(`Page evaluation failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}

class BulkJustdialScraper extends JustdialScraper {
  constructor() {
    super();
    this.targetCount = 300;
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
      
      console.log(`🚀 Starting bulk Justdial scraping for ${this.minCount}-${this.maxCount} businesses`);
      console.log(`🌐 URL: ${url}`);
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const city = extractCityFromJustdialUrl(url);
      console.log(`📍 City: ${city}`);
      
      await this.waitForBusinessListings();
      
      const allBusinesses = await this.extractAllBusinessesWithPagination(city);
      
      const validBusinesses = allBusinesses.filter(business => {
        if (business.phone) {
          business.phone = formatJustdialPhoneNumber(business.phone);
          return business.phone !== '';
        }
        return true;
      });
      
      const limitedBusinesses = validBusinesses.slice(0, this.maxCount);
      
      console.log(`✅ Bulk Justdial scraping complete: ${limitedBusinesses.length} businesses`);
      
      if (this.progressCallback) {
        this.progressCallback({
          current: limitedBusinesses.length,
          target: this.minCount,
          percentage: Math.min((limitedBusinesses.length / this.minCount) * 100, 100),
          status: 'completed'
        });
      }
      
      return limitedBusinesses;
      
    } catch (error) {
      console.error('❌ Bulk Justdial scraping error:', error);
      throw new Error(`Failed to bulk scrape Justdial data: ${error.message}`);
    } finally {
      await this.close();
    }
  }

  async extractAllBusinessesWithPagination(city) {
    let allBusinesses = [];
    let currentPage = 1;
    let hasNextPage = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    
    while (hasNextPage && currentPage <= 30 && allBusinesses.length < this.maxCount) {
      console.log(`\n📄 === Bulk Processing Justdial Page ${currentPage} ===`);
      
      if (this.progressCallback) {
        this.progressCallback({
          current: allBusinesses.length,
          target: this.minCount,
          percentage: Math.min((allBusinesses.length / this.minCount) * 100, 100),
          page: currentPage,
          status: 'processing'
        });
      }
      
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!(await this.validateBrowserContext())) {
          console.log('Browser context lost during pagination, attempting recovery...');
          if (!(await this.recoverBrowser())) {
            throw new Error('Failed to recover browser during pagination');
          }
          await this.page.goto(this.page.url(), { waitUntil: 'networkidle2', timeout: 60000 });
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        await this.autoScroll();
        
        const businesses = await this.extractBusinessesFromPage(city, '');
        console.log(`📊 Found ${businesses.length} businesses on Justdial page ${currentPage}`);
        
        allBusinesses.push(...businesses);
        console.log(`📈 Total businesses: ${allBusinesses.length}`);
        
        // Send progress update after extracting businesses from this page
        if (this.progressCallback) {
          this.progressCallback({
            current: allBusinesses.length,
            target: this.minCount,
            percentage: Math.min((allBusinesses.length / this.minCount) * 100, 100),
            page: currentPage,
            status: 'processing',
            message: `Found ${businesses.length} businesses on page ${currentPage}, total: ${allBusinesses.length}`
          });
        }
        
        consecutiveErrors = 0;
        
        if (allBusinesses.length >= this.maxCount) {
          console.log(`🎯 Reached target of ${this.maxCount} businesses`);
          break;
        }
        
        hasNextPage = await this.goToNextPage();
        if (hasNextPage) {
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        consecutiveErrors++;
        console.error(`❌ Error processing page ${currentPage} (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, error.message);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ Too many consecutive errors (${maxConsecutiveErrors}), stopping pagination`);
          break;
        }
        
        console.log('🔄 Attempting to recover and continue...');
        try {
          await this.recoverBrowser();
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (recoveryError) {
          console.error('❌ Recovery failed:', recoveryError.message);
          break;
        }
      }
    }
    
    const uniqueBusinesses = this.removeDuplicates(allBusinesses);
    console.log(`\n✨ After deduplication: ${uniqueBusinesses.length} unique businesses`);
    
    return uniqueBusinesses;
  }
}

class ProxyRotator {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
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

const excelScraperLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many Excel Scraper requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
});
app.use('/api/excel-scraper/', excelScraperLimiter);

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

const companiesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: { error: 'Too many requests to companies API, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

app.use('/api/', generalApiLimiter);

const expensiveOperationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many expensive operations, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

app.use('/api/upload', expensiveOperationsLimiter);

app.use('/api/scrape', (req, res, next) => {
  const delay = Math.random() * 2000 + 1000;
  setTimeout(next, delay);
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

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

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4,6}\b|\b\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{4,8}\b|\b\d{8,}\b|(?:\b\d{3}\b[-.\s]?)(?:\b\d{6}\b)|(?:\b\d{3}\b[-.\s]?)(?:\b\d{3}\b[-.\s]?)(?:\b\d{4}\b)/g;

const additionalEmailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
];

const extractPhoneNumbers = (text) => {
    let phones = text.match(phoneRegex) || [];
    
    if (phones.length === 0) {
        const concatenatedPattern = /(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4})([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const concatMatches = [...text.matchAll(concatenatedPattern)];
        
        concatMatches.forEach(match => {
            phones.push(match[1]);
        });
        
        const phoneAtStartPattern = /^(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{4})[a-zA-Z]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneAtStartMatches = [...text.matchAll(phoneAtStartPattern)];
        
        phoneAtStartMatches.forEach(match => {
            phones.push(match[1]);
        });
        
        const mixedPattern = /^(\d{6,})[a-zA-Z]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const mixedMatches = [...text.matchAll(mixedPattern)];
        
        mixedMatches.forEach(match => {
            const phonePart = match[1];
            if (phonePart.length >= 6 && phonePart.length <= 15) {
                phones.push(phonePart);
            }
        });
        
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

const extractEmails = (text) => {
    if (!text || typeof text !== 'string') return [];
    
    const emails = [];
    
    const atPositions = [];
    let pos = text.indexOf('@');
    while (pos !== -1) {
        atPositions.push(pos);
        pos = text.indexOf('@', pos + 1);
    }
    
    atPositions.forEach(atPos => {
        let username = '';
        let i = atPos - 1;
        while (i >= 0 && /[A-Za-z0-9._%+-]/.test(text[i])) {
            username = text[i] + username;
            i--;
        }
        
        let domain = '';
        let j = atPos + 1;
        while (j < text.length && /[A-Za-z0-9.-]/.test(text[j])) {
            domain += text[j];
            j++;
        }
        
        const potentialEmail = username + '@' + domain;
        
        if (!potentialEmail.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/)) {
            return;
        }
        
        const emailStartIndex = atPos - username.length;
        const emailEndIndex = atPos + domain.length + 1;
        
        const fullContext = text;
        const beforeEmail = fullContext.substring(0, emailStartIndex);
        const afterEmail = fullContext.substring(emailEndIndex);
        
        if (beforeEmail.match(/\d{3,}[-.\s]?\d{3,}[-.\s]?\d{4,}\s*$/)) {
            return;
        }
        
        const problematicSuffixes = ['hoursopen', 'copyright', 'homeabout', 'comshop', 'comc'];
        if (problematicSuffixes.some(suffix => potentialEmail.toLowerCase().endsWith(suffix))) {
            return;
        }
        
        const problematicPrefixes = ['aboutportfolioservicescontact'];
        if (problematicPrefixes.some(prefix => potentialEmail.toLowerCase().startsWith(prefix))) {
            return;
        }
        
        const charBefore = emailStartIndex > 0 ? fullContext[emailStartIndex - 1] : '';
        const charAfter = emailEndIndex < fullContext.length ? fullContext[emailEndIndex] : '';
        
        const isProperlyBounded = (emailStartIndex === 0 || !/[A-Za-z0-9._%+-]/.test(charBefore)) &&
                                 (emailEndIndex === fullContext.length || !/[A-Za-z0-9.-]/.test(charAfter));
        
        if (!isProperlyBounded) {
            return;
        }
        
        const contextBefore = fullContext.substring(Math.max(0, emailStartIndex - 20), emailStartIndex);
        const contextAfter = fullContext.substring(emailEndIndex, Math.min(fullContext.length, emailEndIndex + 20));
        
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
            return;
        }
        
        emails.push(potentialEmail);
    });
    
    const uuidRegex = /\b[a-f0-9]{32}@(?:sentry(?:-next)?\.wixpress\.com|sentry\.io)\b/g;
    const uuidMatches = text.match(uuidRegex) || [];
    emails.push(...uuidMatches);
    
    const uniqueEmails = [...new Set(emails)]
        .map(email => email.toLowerCase().trim().replace(/^mailto:/, ''))
        .filter(email => {
            if (!email || typeof email !== 'string') return false;
            if (email.includes('example.com') || 
                email.includes('test.com') || 
                email.includes('sample.com') ||
                email.includes('domain.com')) return false;
            if (email.match(/\.(png|jpg|jpeg|gif|css|js)$/)) return false;
            if (!email.includes('@') || !email.includes('.') || email.length <= 5) return false;
            const parts = email.split('@');
            if (parts.length !== 2) return false;
            const [username, domain] = parts;
            if (!username || !domain || username.length === 0 || domain.length <= 3) return false;
            if (username.length > 50 || domain.length > 100) return false;
            if (!domain.includes('.')) return false;
            if (username.match(/^\d+$/)) return false;
            if (email.match(/\d{3,}[-.\s]?\d{3,}[-.\s]?\d{4,}/)) return false;
            return true;
        })
        .slice(0, 5);
    
    return uniqueEmails;
};

const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
};

const correctEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    
    const extractedEmails = extractEmails(email);
    if (extractedEmails.length > 0) {
        return extractedEmails[0];
    }
    
    let corrected = email.trim().toLowerCase();
    corrected = corrected.replace(/[\s_\-]+/g, '');
    corrected = corrected.replace(/\d{3,}[-\s]?\d{3,}[-\s]?\d{4,}/g, '');
    corrected = corrected.replace(/phone|call|book|schedule|homeabout|info|enquiries/g, '');
    
    const atCount = (corrected.match(/@/g) || []).length;
    if (atCount > 1) {
        const parts = corrected.split('@');
        const localPart = parts.slice(0, -1).join('');
        const domain = parts[parts.length - 1];
        corrected = localPart + '@' + domain;
    }
    
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
    
    if (isValidEmail(corrected)) {
        return corrected;
    }
    
    return null;
};

const extractAddress = (text) => {
    if (!text || typeof text !== 'string') return '';
    
    let addressText = text.replace(phoneRegex, '');
    
    addressText = addressText.replace(/·\s*\d+[\s-]*\d+/g, '');
    addressText = addressText.replace(/\d+[\s-]*\d+[\s-]*\d+/g, '');
    addressText = addressText.replace(/Open\s+24\s+hours/gi, '');
    addressText = addressText.replace(/\d+\+\s*years?\s+in\s+business/gi, '');
    addressText = addressText.replace(/Online\s+(estimates|appointments)/gi, '');
    addressText = addressText.replace(/On-site\s+services/gi, '');
    addressText = addressText.replace(/Website/gi, '');
    addressText = addressText.replace(/Directions/gi, '');
    addressText = addressText.replace(/Moving\s+service/gi, '');
    addressText = addressText.replace(/Packaging\s+company/gi, '');
    addressText = addressText.replace(/Moving\s+and\s+storage\s+service/gi, '');
    
    addressText = addressText.replace(/·/g, ',');
    addressText = addressText.replace(/\s+/g, ' ');
    addressText = addressText.replace(/,\s*,/g, ',');
    addressText = addressText.replace(/^,\s*/, '');
    addressText = addressText.replace(/,\s*$/, '');
    
    const parts = addressText.split(/[,|·]/);
    const addressParts = [];
    
    for (const part of parts) {
        const cleanPart = part.trim();
        
        if (cleanPart.length > 2 && 
            !cleanPart.match(/^\d+$/) &&
            !cleanPart.toLowerCase().includes('phone') &&
            !cleanPart.toLowerCase().includes('mobile') &&
            !cleanPart.toLowerCase().includes('contact') &&
            !cleanPart.toLowerCase().includes('call') &&
            !cleanPart.match(/^\d+\.\d+$/)) {
            
            addressParts.push(cleanPart);
        }
    }
    
    let finalAddress = addressParts.join(', ');
    finalAddress = finalAddress.replace(/^\d+\+\s*years?\s+in\s*business,\s*/i, '');
    
    if (finalAddress.length > 300) {
        finalAddress = finalAddress.substring(0, 300) + '...';
    }
    
    return finalAddress.trim();
};

const categorizeCompany = (companyName) => {
  if (!companyName || typeof companyName !== 'string') {
    return 'Uncategorized';
  }

  const name = companyName.toLowerCase().trim();
  
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

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (name.includes(keyword)) {
        return category;
      }
    }
  }

  if (name.match(/pvt\.?\.?\s*ltd\.?\.?|limited|ltd\.?\.?|private\s+limited/i)) {
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

// Enhanced Website Scraper
class EnhancedWebsiteScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.maxPages = 10;
        this.maxScrollAttempts = 5;
        this.scrollDelay = 2000;
        this.pageDelay = 3000;
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
            
            await this.page.setUserAgent(proxyRotator.getRandomUserAgent());
            
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
                const currentHeight = await this.page.evaluate(() => document.body.scrollHeight);
                
                if (currentHeight === previousHeight) {
                    break;
                }
                
                await this.page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
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
                
                contactSelectors.forEach(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(elem => {
                            allText += elem.textContent + ' ';
                        });
                    } catch (e) {
                    }
                });

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

                document.querySelectorAll('meta[name="description"], meta[property="og:description"]').forEach(elem => {
                    allText += elem.getAttribute('content') + ' ';
                });

                allText += document.title + ' ';

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

            await this.page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            await new Promise(r => setTimeout(r, 2000));
            await this.scrollToBottom();
            
            const mainPageData = await this.extractContactInfoFromPage();
            let allText = mainPageData.text;
            let visitedPages = [url];
            
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
                        
                        await new Promise(r => setTimeout(r, this.pageDelay));
                    }
                } catch (error) {
                    console.error(`Error navigating to contact page ${contactPages[i]}:`, error.message);
                }
            }
            
            console.log(`Total extracted text length: ${allText.length} characters from ${visitedPages.length} pages`);

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
                .slice(0, 10);

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
                .slice(0, 10);

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

const scrapeWebsite = async (url) => {
    try {
        const enhancedScraper = new EnhancedWebsiteScraper();
        const result = await enhancedScraper.scrapeWebsite(url);
        await enhancedScraper.close();
        
        if (result.success && (result.emails.length > 0 || result.phones.length > 0)) {
            return result;
        }
        
        console.log('Enhanced scraper found limited data, trying fallback...');
        return await scrapeWebsiteFallback(url);
    } catch (error) {
        console.error('Enhanced scraper failed, using fallback:', error.message);
        return await scrapeWebsiteFallback(url);
    }
};

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
        ) || Object.keys(data[0])[0];

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
                        const emailMatches = extractEmails(existingEmail);
                        if (emailMatches.length > 0) {
                            cleanedEmail = emailMatches.join(', ').trim();
                        } else {
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
                    const emailMatches = extractEmails(existingEmail);
                    if (emailMatches.length > 0) {
                        cleanedExistingEmail = emailMatches.join(', ').trim();
                    } else {
                        const correctedEmail = correctEmail(existingEmail);
                        cleanedExistingEmail = correctedEmail || '';
                    }
                }
                
                if (cleanedExistingPhone && cleanedExistingEmail) {
                    finalPhone = cleanedExistingPhone;
                    finalEmail = cleanedExistingEmail;
                    scrapeStatus = 'Used existing data (phone + email)';
                } else if (cleanedExistingPhone) {
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = cleanedExistingPhone;
                    finalEmail = scrapeResult.success ? scrapeResult.emails.join(', ') : '';
                    scrapeStatus = scrapeResult.success ? 'Success (scraped email)' : `Error: ${scrapeResult.error}`;
                } else if (cleanedExistingEmail) {
                    const scrapeResult = await scrapeWebsite(extractedUrl);
                    finalPhone = scrapeResult.success ? scrapeResult.phones.join(', ') : '';
                    finalEmail = cleanedExistingEmail;
                    scrapeStatus = scrapeResult.success ? 'Success (scraped phone)' : `Error: ${scrapeResult.error}`;
                } else {
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

function cleanCategoryName(category) {
  if (!category) return '';
  
  return category
    .replace(/-/g, ' ')
    .replace(/in\s*Sai\s*Kunj/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
}

// Multer configuration
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

const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Routes

app.get('/api/test', (req, res) => {
    res.json({ message: 'Backend is working', timestamp: new Date() });
});

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
            
            if (!row || Object.keys(row).length === 0) {
                skippedRows++;
                continue;
            }

            const companyName = row['Company Name'] || row.Title1 || row.company || row.Company || row.title || '';
            const phone = row['Phone Number'] || row.phone || row.Phone || '';
            let email = row['Email'] || row.email || row.Email || '';
            
            if (email && email.trim()) {
                const correctedEmail = correctEmail(email);
                email = correctedEmail || email;
            }
            
            let address = '';
            if (row['rllt_detail1']) {
                address = extractAddress(String(row['rllt_detail1'] || ''));
            } else {
                address = row['Address'] || row.address || row.Address || row.Location || row.location || '';
            }

            const category = row['Category'] || row.category || row.Type || row.type || row.Industry || row.industry || '';

            let city = '';
            if (row['City'] || row.city) {
                city = row['City'] || row.city;
            } else if (address) {
                const cityMatch = address.match(/,?\s*([A-Za-z\s]+),?\s*[A-Z]{2,}|\b([A-Za-z\s]+)\b,?\s*[A-Z]{2,}/);
                if (cityMatch) {
                    city = cityMatch[1] || cityMatch[2];
                }
            }

            console.log(`Row ${i + 1}:`, {
                companyName: companyName ? `"${companyName}"` : 'MISSING',
                phone: phone ? `"${phone}"` : 'MISSING',
                email: email ? `"${email}"` : 'MISSING',
                address: address ? `"${address}"` : 'MISSING'
            });

            if (!companyName.trim() || !phone.trim()) {
                console.warn(`Skipping row ${i + 1} with missing required data:`, {
                    hasCompany: !!companyName.trim(),
                    hasPhone: !!phone.trim()
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
                error: 'No valid company data found in file. Please ensure your Excel file has required columns: Title1 (company name) and phone.' 
            });
        }

        try {
            await Company.insertMany(companies);
            
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
            }
        } catch (dbError) {
            console.error('Database insertion error:', dbError);
            return res.status(400).json({ 
                error: 'Error saving companies to database',
                details: dbError.message 
            });
        }
        
        try {
            fs.unlinkSync(req.file.path);
            console.log('Successfully deleted uploaded file:', req.file.path);
        } catch (unlinkError) {
            if (unlinkError.code === 'EBUSY' || unlinkError.code === 'ENOENT') {
                console.log('File busy or not found, scheduling deletion:', req.file.path);
                setTimeout(() => {
                    try {
                        fs.unlinkSync(req.file.path);
                        console.log('Successfully deleted file on retry:', req.file.path);
                    } catch (retryError) {
                        console.log('Could not delete file on retry:', retryError.message);
                    }
                }, 5000);
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

app.put('/api/companies/:id/email', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        
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

app.post('/api/companies', async (req, res) => {
    try {
        const { company, phone, email, website, address, city, message, status } = req.body;
        
        if (!company || !phone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Company name and phone number are required' 
            });
        }
        
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

app.get('/api/companies', companiesLimiter, async (req, res) => {
    try {
        const { category, city, search, page = 1, limit = 20 } = req.query;
        let filter = {};
        
        if (category && category !== 'all') {
            filter.category = category;
        }
        
        if (city && city !== 'all') {
            filter.city = city;
        }
        
        if (search && search.trim()) {
            filter.$or = [
                { company: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } }
            ];
        }
        
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        
        const totalCompanies = await Company.countDocuments(filter);
        
        const companies = await Company.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);
        
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

app.post('/api/companies/batch-update', async (req, res) => {
    try {
        const { companyIds, category } = req.body;
        
        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Company IDs are required' });
        }
        
        if (!category || !category.trim()) {
            return res.status(400).json({ error: 'Category is required' });
        }
        
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

app.post('/api/companies/batch-update-city', async (req, res) => {
    try {
        const { companyIds, city } = req.body;
        
        if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
            return res.status(400).json({ error: 'Company IDs are required' });
        }
        
        if (!city || !city.trim()) {
            return res.status(400).json({ error: 'City is required' });
        }
        
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

app.post('/api/categories', async (req, res) => {
    try {
        const { name, type } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required' });
        }
        
        const categoryName = name.trim();
        
        const existingCategories = await Company.distinct('category');
        if (existingCategories.includes(categoryName)) {
            return res.status(409).json({ error: 'Category already exists' });
        }
        
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
                    const smsResult = await SMSService.sendSMS(company.phone, message);
                    const whatsappResult = await WhatsAppService.sendWhatsApp(company.phone, message);
                    result = { sms: smsResult, whatsapp: whatsappResult };
                } else if (communicationType === 'all_channels') {
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

app.post('/api/send-individual-combined', async (req, res) => {
    try {
        const { phone, email, senderEmail, subject, message, communicationType } = req.body;
        
        let success = true;
        let error = null;
        let result = {};

        try {
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

        const newWorkbook = xlsx.utils.book_new();
        
        const mainWorksheet = xlsx.utils.json_to_sheet(processedData);
        xlsx.utils.book_append_sheet(newWorkbook, mainWorksheet, 'All Processed Data');
        
        if (companiesWithExistingPhonesData.length > 0) {
            const existingPhonesWorksheet = xlsx.utils.json_to_sheet(companiesWithExistingPhonesData);
            xlsx.utils.book_append_sheet(newWorkbook, existingPhonesWorksheet, 'Existing Phone Numbers');
        }
        
        if (companiesWithoutExistingPhonesData.length > 0) {
            const needPhonesWorksheet = xlsx.utils.json_to_sheet(companiesWithoutExistingPhonesData);
            xlsx.utils.book_append_sheet(newWorkbook, needPhonesWorksheet, 'Need Phone Numbers');
        }

        const categories = {};
        processedData.forEach(row => {
            const category = row.category || 'Uncategorized';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(row);
        });

        Object.keys(categories).sort().forEach(category => {
            if (categories[category].length > 0) {
                const categoryWorksheet = xlsx.utils.json_to_sheet(categories[category]);
                let sheetName = category.replace(/[\/\\?*[\]:]/g, '-');
                sheetName = sheetName.length > 25 ? sheetName.substring(0, 22) + '...' : sheetName;
                xlsx.utils.book_append_sheet(newWorkbook, categoryWorksheet, sheetName);
            }
        });

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
        
        if (require('fs').existsSync(processedFilePath)) {
            const stats = require('fs').statSync(processedFilePath);
            console.log(`File created successfully. Size: ${stats.size} bytes`);
        } else {
            console.error('ERROR: File was not created!');
        }

        const processingTime = Date.now() - startTime;

        const uploadRecord = new UploadHistory({
            originalFilename,
            processedFilename,
            totalRows: processedData.length,
            processedRows: processedData.filter(row => row.scrapeStatus === 'Success').length,
            status: 'completed',
            processingTime
        });
        await uploadRecord.save();

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

app.get('/api/upload/history', async (req, res) => {
    try {
        const history = await FileUploadHistory.find().sort({ uploadDate: -1 }).limit(50);
        res.json(history);
    } catch (error) {
        console.error('Upload history error:', error);
        res.status(500).json({ error: 'Error fetching upload history' });
    }
});

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

app.get('/api/excel-scraper/history', async (req, res) => {
    try {
        const history = await UploadHistory.find().sort({ uploadDate: -1 }).limit(10);
        res.json(history);
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ error: 'Error fetching history' });
    }
});

app.get('/api/excel-scraper/health', (req, res) => {
    res.json({ status: 'Excel Scraper server is running', timestamp: new Date().toISOString() });
});

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

app.get('/api/justdial-categories', (req, res) => {
  const popularCategories = [
    { name: 'Event Organisers', icon: 'calendar', description: 'Event planning and management services' },
    { name: 'Electricians', icon: 'zap', description: 'Electrical services and repairs' },
    { name: 'Plumbers', icon: 'wrench', description: 'Plumbing services and repairs' },
    { name: 'Restaurants', icon: 'utensils', description: 'Food and dining services' },
    { name: 'Doctors', icon: 'stethoscope', description: 'Medical services and healthcare' },
    { name: 'Chartered Accountants', icon: 'calculator', description: 'Financial services' },
    { name: 'Real Estate Agents', icon: 'home', description: 'Property dealers' },
    { name: 'Hotels', icon: 'bed', description: 'Accommodation services' },
    { name: 'Packers and Movers', icon: 'truck', description: 'Relocation services' },
    { name: 'Caterers', icon: 'coffee', description: 'Food catering services' }
  ];
  
  res.json({
    success: true,
    categories: popularCategories
  });
});

app.post('/api/justdial-scrape', async (req, res) => {
  const { url, detectedCategory } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  if (!url.includes('justdial.com')) {
    return res.status(400).json({ error: 'Invalid Justdial URL' });
  }
  
  try {
    console.log(`\n🎯 Starting Justdial scrape request for: ${url}`);
    const scraper = new JustdialScraper();
    let data = await scraper.scrapeBusinessData(url, detectedCategory);
    
    data = data.map(business => {
      if (business.phone) {
        business.phone = formatJustdialPhoneNumber(business.phone);
      }
      return business;
    });
    
    if (data.length > 0) {
      console.log('\n📞 Sample formatted Justdial phone numbers:');
      console.log('='.repeat(40));
      data.slice(0, 5).forEach((business, idx) => {
        console.log(`${idx + 1}. ${business.name}: ${business.phone || 'N/A'}`);
      });
      console.log('='.repeat(40));
    }
    
    res.json({
      success: true,
      data: data,
      count: data.length,
      message: `Successfully extracted ${data.length} businesses with formatted phone numbers` 
    });
  } catch (error) {
    console.error('Justdial scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape Justdial data',
      message: error.message 
    });
  }
});

app.post('/api/justdial-bulk-scrape', async (req, res) => {
  const { url, detectedCategory } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  if (!url.includes('justdial.com')) {
    return res.status(400).json({ error: 'Invalid Justdial URL' });
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const progressCallback = (progress) => {
    try {
      const sanitizedProgress = sanitizeForSSE(progress);
      const jsonData = JSON.stringify(sanitizedProgress);
      
      if (jsonData && jsonData.startsWith('{') && jsonData.endsWith('}')) {
        res.write(`data: ${jsonData}\n\n`);
      } else {
        console.error('Invalid JSON data for SSE, skipping:', sanitizedProgress);
      }
    } catch (error) {
      console.error('Error in progress callback:', error);
      res.write(`data: ${JSON.stringify({
        status: 'error',
        message: 'Progress update failed',
        timestamp: Date.now()
      })}\n\n`);
    }
  };
  
  try {
    console.log(`\n🚀 Starting bulk Justdial scrape request for: ${url}`);
    const bulkScraper = new BulkJustdialScraper();
    bulkScraper.setProgressCallback(progressCallback);
    
    progressCallback({
      current: 0,
      target: 250,
      percentage: 0,
      status: 'starting',
      message: 'Initializing browser...'
    });
    
    let data = await bulkScraper.scrapeBulkBusinessData(url);
    
    data = data.map(business => {
      if (business.phone) {
        business.phone = formatJustdialPhoneNumber(business.phone);
      }
      return business;
    });
    
    console.log('\n📞 Justdial phone number formatting summary:');
    console.log('='.repeat(40));
    const phonesWithNumbers = data.filter(b => b.phone).length;
    console.log(`Total businesses: ${data.length}`);
    console.log(`Businesses with phone numbers: ${phonesWithNumbers}`);
    console.log(`Businesses without phone numbers: ${data.length - phonesWithNumbers}`);
    
    if (phonesWithNumbers > 0) {
      console.log('\nSample formatted phone numbers:');
      data.slice(0, 5).forEach((business, idx) => {
        if (business.phone) {
          console.log(`${idx + 1}. ${business.name}: ${business.phone}`);
        }
      });
    }
    console.log('='.repeat(40));
    
    const finalData = {
      success: true, 
      data: data, 
      count: data.length,
      phonesWithNumbers: phonesWithNumbers,
      message: `Successfully extracted ${data.length} businesses with formatted phone numbers`,
      finished: true 
    };
    
    const sanitizedFinalData = sanitizeForSSE(finalData);
    res.write(`data: ${JSON.stringify(sanitizedFinalData)}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('Bulk Justdial scraping error:', error);
    const errorData = {
      success: false, 
      error: error.message,
      message: `Bulk Justdial scraping failed: ${error.message}`,
      finished: true 
    };
    
    const sanitizedErrorData = sanitizeForSSE(errorData);
    res.write(`data: ${JSON.stringify(sanitizedErrorData)}\n\n`);
    res.end();
  }
});

app.get('/api/justdial-proxy/image', async (req, res) => {
  const { url } = req.query;
  
  if (!url || url === 'N/A' || url === '') {
    return res.status(404).json({ error: 'No image available' });
  }
  
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.justdial.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      timeout: 15000
    });
    
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    response.data.pipe(res);
    
  } catch (error) {
    console.error('Justdial image proxy error:', error.message);
    res.status(404).json({ error: 'Failed to fetch Justdial image' });
  }
});

app.post('/api/justdial-export/excel', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
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
    
    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 40 },
      { wch: 20 },
      { wch: 15 },
      { wch: 10 },
      { wch: 50 },
      { wch: 30 }
    ];
    
    xlsx.utils.book_append_sheet(wb, ws, 'Justdial Business Data');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=justdial-business-data.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Justdial Excel export error:', error);
    res.status(500).json({ error: 'Failed to export Justdial Excel file' });
  }
});

app.post('/api/justdial-export/csv', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data is required' });
  }
  
  try {
    const headers = ['Business Name', 'Phone Number', 'Address', 'Category', 'City', 'Rating', 'Image URL', 'Website'];
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
      const values = headers.map(header => {
        let value = '';
        if (header === 'Business Name') value = row.name || '';
        else if (header === 'Phone Number') value = row.phone || '';
        else if (header === 'Address') value = row.address || '';
        else if (header === 'Category') value = row.category || '';
        else if (header === 'City') value = row.city || '';
        else if (header === 'Rating') value = row.rating || '';
        else if (header === 'Image URL') value = row.image || '';
        else if (header === 'Website') value = row.website || '';
        
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=justdial-business-data.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Justdial CSV export error:', error);
    res.status(500).json({ error: 'Failed to export Justdial CSV file' });
  }
});

app.post('/api/justdial-history', async (req, res) => {
  try {
    const { url, category, city, businessCount, businesses, scrapeType, status, errorMessage } = req.body;
    
    if (!url || !businessCount || !businesses) {
      return res.status(400).json({ error: 'URL, business count, and businesses data are required' });
    }
    
    const historyEntry = new JustdialHistory({
      url,
      category: category || '',
      city: city || '',
      businessCount,
      businesses,
      scrapeType: scrapeType || 'single',
      status: status || 'completed',
      errorMessage: errorMessage || ''
    });
    
    await historyEntry.save();
    
    res.status(201).json({
      success: true,
      message: 'Scraping history saved successfully',
      history: historyEntry
    });
  } catch (error) {
    console.error('Error saving Justdial history:', error);
    res.status(500).json({ error: 'Failed to save scraping history' });
  }
});

app.get('/api/justdial-history', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, city } = req.query;
    
    const query = {};
    if (category) query.category = new RegExp(category, 'i');
    if (city) query.city = new RegExp(city, 'i');
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };
    
    const history = await JustdialHistory.find(query)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit);
    
    const total = await JustdialHistory.countDocuments(query);
    
    res.json({
      success: true,
      history,
      pagination: {
        current: options.page,
        pages: Math.ceil(total / options.limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching Justdial history:', error);
    res.status(500).json({ error: 'Failed to fetch scraping history' });
  }
});

app.get('/api/justdial-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const historyEntry = await JustdialHistory.findById(id);
    
    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      history: historyEntry
    });
  } catch (error) {
    console.error('Error fetching Justdial history entry:', error);
    res.status(500).json({ error: 'Failed to fetch history entry' });
  }
});

app.delete('/api/justdial-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedEntry = await JustdialHistory.findByIdAndDelete(id);
    
    if (!deletedEntry) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({
      success: true,
      message: 'History entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Justdial history entry:', error);
    res.status(500).json({ error: 'Failed to delete history entry' });
  }
});

app.post('/api/download', async (req, res) => {
  const { data, filename = 'business-data.xlsx' } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

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

const cleanupOldFiles = () => {
    const uploadsDir = path.join(__dirname, 'uploads');
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

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

// ============= CORRECTED GOOGLE MAPS SCRAPER =============

// Google Maps scrape endpoint with real-time progress
app.post('/api/google-maps-scrape', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Loading Google Maps page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    // Wait for the results panel to load
    await page.waitForSelector('[role="feed"]', { timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Click on the results panel to focus
    await page.click('[role="feed"]');
    
    console.log('Starting enhanced scraping...');
    const results = await scrapeAllDataEnhanced(page);

    await browser.close();
    
    // Save to history
    try {
      const historyEntry = new GoogleMapsHistory({
        url,
        businessCount: results.length,
        data: results,
        status: 'completed',
        scrapeDate: new Date()
      });
      
      await historyEntry.save();
      console.log(`Successfully saved ${results.length} businesses to history`);
    } catch (historyError) {
      console.error('Failed to save to history:', historyError);
    }
    
    res.json({ success: true, data: results, count: results.length });
  } catch (error) {
    if (browser) await browser.close();
    console.error('Google Maps scraping error:', error);
    
    try {
      const historyEntry = new GoogleMapsHistory({
        url,
        businessCount: 0,
        data: [],
        status: 'failed',
        errorMessage: error.message,
        scrapeDate: new Date()
      });
      await historyEntry.save();
    } catch (historyError) {
      console.error('Failed to save failed attempt:', historyError);
    }
    
    res.status(500).json({ error: 'Scraping failed: ' + error.message });
  }
});

// Google Maps scrape endpoint with SSE for real-time progress
app.post('/api/google-maps-scrape-progress', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const progressCallback = (progress) => {
    try {
      const sanitizedProgress = sanitizeForSSE(progress);
      const jsonData = JSON.stringify(sanitizedProgress);
      
      if (jsonData && jsonData.startsWith('{') && jsonData.endsWith('}')) {
        res.write(`data: ${jsonData}\n\n`);
      } else {
        console.error('Invalid JSON data for SSE, skipping:', sanitizedProgress);
      }
    } catch (error) {
      console.error('Error in progress callback:', error);
      res.write(`data: ${JSON.stringify({
        status: 'error',
        message: 'Progress update failed',
        timestamp: Date.now()
      })}\n\n`);
    }
  };
  
  try {
    console.log(`\n🚀 Starting Google Maps scrape request for: ${url}`);
    
    progressCallback({
      current: 0,
      target: 200,
      percentage: 0,
      status: 'starting',
      message: 'Initializing browser...'
    });
    
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    progressCallback({
      current: 0,
      target: 200,
      percentage: 0,
      status: 'loading',
      message: 'Loading Google Maps page...'
    });
    
    console.log('Loading Google Maps page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    progressCallback({
      current: 0,
      target: 200,
      percentage: 0,
      status: 'extracting',
      message: 'Page loaded, starting data extraction...'
    });
    
    // Wait for the results panel to load
    await page.waitForSelector('[role="feed"]', { timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Click on the results panel to focus
    await page.click('[role="feed"]');
    
    console.log('Starting enhanced scraping with progress...');
    const results = await scrapeAllDataEnhancedWithProgress(page, progressCallback);

    await browser.close();
    
    // Save to history
    try {
      const historyEntry = new GoogleMapsHistory({
        url,
        businessCount: results.length,
        data: results,
        status: 'completed',
        scrapeDate: new Date()
      });
      
      await historyEntry.save();
      console.log(`Successfully saved ${results.length} businesses to history`);
    } catch (historyError) {
      console.error('Failed to save to history:', historyError);
    }
    
    const finalData = {
      success: true, 
      data: results, 
      count: results.length,
      message: `Successfully extracted ${results.length} businesses`,
      finished: true 
    };
    
    const sanitizedFinalData = sanitizeForSSE(finalData);
    res.write(`data: ${JSON.stringify(sanitizedFinalData)}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('Google Maps scraping error:', error);
    
    try {
      const historyEntry = new GoogleMapsHistory({
        url,
        businessCount: 0,
        data: [],
        status: 'failed',
        errorMessage: error.message,
        scrapeDate: new Date()
      });
      await historyEntry.save();
    } catch (historyError) {
      console.error('Failed to save failed attempt:', historyError);
    }
    
    const errorData = {
      success: false,
      error: 'Scraping failed: ' + error.message,
      finished: true,
      count: 0
    };
    
    const sanitizedErrorData = sanitizeForSSE(errorData);
    res.write(`data: ${JSON.stringify(sanitizedErrorData)}\n\n`);
    res.end();
  }
});

// Enhanced scraping function that gets 100+ businesses
async function scrapeAllDataEnhanced(page) {
  const allResults = new Map();
  const seenNames = new Set();
  
  console.log('Starting enhanced extraction...');
  
  let scrollAttempts = 0;
  const maxScrollAttempts = 30;
  let lastCount = 0;
  let stagnantCount = 0;
  let noNewDataCount = 0;
  
  // Function to scroll the feed container
  async function scrollFeedContainer() {
    return await page.evaluate(() => {
      const scrollableDiv = document.querySelector('[role="feed"]');
      if (scrollableDiv) {
        const previousHeight = scrollableDiv.scrollHeight;
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        return previousHeight;
      }
      return 0;
    });
  }
  
  // Function to click "More results" button if present
  async function clickMoreResultsButton() {
    return await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, div[role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('more results') || 
            ariaLabel.includes('more results') ||
            text.includes('see more') ||
            ariaLabel.includes('see more') ||
            text.includes('load more') ||
            (text.includes('more') && text.length < 20)) {
          btn.click();
          console.log('Clicked "More results" button');
          return true;
        }
      }
      return false;
    });
  }
  
  while (scrollAttempts < maxScrollAttempts && allResults.size < 500) {
    console.log(`\n--- Scroll Attempt ${scrollAttempts + 1}/${maxScrollAttempts} ---`);
    console.log(`Current businesses: ${allResults.size}`);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const extracted = await extractBusinessesEnhanced(page);
    
    let newItems = 0;
    extracted.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!seenNames.has(key) && item.name !== 'Address not found' && item.name.length > 2) {
        seenNames.add(key);
        allResults.set(key, item);
        newItems++;
      }
    });
    
    console.log(`Found ${extracted.length} businesses, ${newItems} new. Total: ${allResults.size}`);
    
    if (allResults.size === lastCount) {
      stagnantCount++;
      noNewDataCount++;
      console.log(`No new businesses. Stagnant: ${stagnantCount}/8, No new data: ${noNewDataCount}/5`);
    } else {
      stagnantCount = 0;
      noNewDataCount = 0;
      lastCount = allResults.size;
    }
    
    if (allResults.size >= 400) {
      console.log(`✅ Reached target of ${allResults.size} businesses!`);
      break;
    }
    
    if (stagnantCount >= 8) {
      console.log(`⚠️ No new businesses after ${stagnantCount} attempts. Checking for "More results" button...`);
      
      const clicked = await clickMoreResultsButton();
      if (clicked) {
        console.log('Clicked "More results" button, waiting for new content...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        stagnantCount = 0;
        noNewDataCount = 0;
      } else {
        if (noNewDataCount >= 5) {
          console.log(`❌ No more results available. Stopping.`);
          break;
        }
      }
    }
    
    const previousHeight = await scrollFeedContainer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newHeight = await page.evaluate(() => {
      const div = document.querySelector('[role="feed"]');
      return div ? div.scrollHeight : 0;
    });
    
    if (newHeight === previousHeight && scrollAttempts > 10) {
      console.log('No new content loaded from scroll');
      stagnantCount++;
    }
    
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    scrollAttempts++;
  }
  
  console.log(`\n========== SCRAPING COMPLETE ==========`);
  console.log(`✅ Total businesses scraped: ${allResults.size}`);
  console.log(`📊 Total scroll attempts: ${scrollAttempts}`);
  
  if (allResults.size > 0) {
    console.log('\n📋 Sample of extracted data (first 5 businesses):');
    const sample = Array.from(allResults.values()).slice(0, 5);
    sample.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.name}`);
      console.log(`   📍 Address: ${item.address.substring(0, 100)}...`);
      console.log(`   📞 Phone: ${item.phone}`);
      console.log(`   🌐 Website: ${item.website}`);
      console.log(`   ⭐ Rating: ${item.rating}`);
      console.log(`   🏷️ Category: ${item.category}`);
    });
  }
  
  return Array.from(allResults.values());
}

// Enhanced scraping function with real-time progress tracking
async function scrapeAllDataEnhancedWithProgress(page, progressCallback) {
  const allResults = new Map();
  const seenNames = new Set();
  
  console.log('Starting enhanced extraction with progress...');
  
  let scrollAttempts = 0;
  const maxScrollAttempts = 30;
  let lastCount = 0;
  let stagnantCount = 0;
  let noNewDataCount = 0;
  
  // Function to scroll the feed container
  async function scrollFeedContainer() {
    return await page.evaluate(() => {
      const scrollableDiv = document.querySelector('[role="feed"]');
      if (scrollableDiv) {
        const previousHeight = scrollableDiv.scrollHeight;
        scrollableDiv.scrollTop = scrollableDiv.scrollHeight;
        return previousHeight;
      }
      return 0;
    });
  }
  
  // Function to click "More results" button if present
  async function clickMoreResultsButton() {
    return await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, div[role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        
        if (text.includes('more results') || 
            ariaLabel.includes('more results') ||
            text.includes('see more') ||
            ariaLabel.includes('see more') ||
            text.includes('load more') ||
            (text.includes('more') && text.length < 20)) {
          btn.click();
          console.log('Clicked "More results" button');
          return true;
        }
      }
      return false;
    });
  }
  
  while (scrollAttempts < maxScrollAttempts && allResults.size < 500) {
    console.log(`\n--- Scroll Attempt ${scrollAttempts + 1}/${maxScrollAttempts} ---`);
    console.log(`Current businesses: ${allResults.size}`);
    
    // Send progress update
    progressCallback({
      current: allResults.size,
      target: 200,
      percentage: Math.min((allResults.size / 200) * 100, 100),
      status: 'scraping',
      message: `Scraping... Found ${allResults.size} businesses (Scroll ${scrollAttempts + 1}/${maxScrollAttempts})`
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const extracted = await extractBusinessesEnhanced(page);
    
    let newItems = 0;
    extracted.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!seenNames.has(key) && item.name !== 'Address not found' && item.name.length > 2) {
        seenNames.add(key);
        allResults.set(key, item);
        newItems++;
      }
    });
    
    console.log(`Found ${extracted.length} businesses, ${newItems} new. Total: ${allResults.size}`);
    
    if (allResults.size === lastCount) {
      stagnantCount++;
      noNewDataCount++;
      console.log(`No new businesses. Stagnant: ${stagnantCount}/8, No new data: ${noNewDataCount}/5`);
    } else {
      stagnantCount = 0;
      noNewDataCount = 0;
      lastCount = allResults.size;
    }
    
    if (allResults.size >= 400) {
      console.log(`✅ Reached target of ${allResults.size} businesses!`);
      progressCallback({
        current: allResults.size,
        target: 200,
        percentage: 100,
        status: 'completed',
        message: `Target reached! Found ${allResults.size} businesses!`
      });
      break;
    }
    
    if (stagnantCount >= 8) {
      console.log(`⚠️ No new businesses after ${stagnantCount} attempts. Checking for "More results" button...`);
      
      const clicked = await clickMoreResultsButton();
      if (clicked) {
        console.log('Clicked "More results" button, waiting for new content...');
        progressCallback({
          current: allResults.size,
          target: 200,
          percentage: Math.min((allResults.size / 200) * 100, 100),
          status: 'scraping',
          message: `Loading more results... Found ${allResults.size} businesses`
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
        stagnantCount = 0;
        noNewDataCount = 0;
      } else {
        if (noNewDataCount >= 5) {
          console.log(`❌ No more results available. Stopping.`);
          progressCallback({
            current: allResults.size,
            target: 200,
            percentage: Math.min((allResults.size / 200) * 100, 100),
            status: 'completed',
            message: `Scraping complete! Found ${allResults.size} businesses`
          });
          break;
        }
      }
    }
    
    const previousHeight = await scrollFeedContainer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newHeight = await page.evaluate(() => {
      const div = document.querySelector('[role="feed"]');
      return div ? div.scrollHeight : 0;
    });
    
    if (newHeight === previousHeight && scrollAttempts > 10) {
      console.log('No new content loaded from scroll');
      stagnantCount++;
    }
    
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    scrollAttempts++;
  }
  
  console.log(`\n========== SCRAPING COMPLETE ==========`);
  console.log(`✅ Total businesses scraped: ${allResults.size}`);
  console.log(`📊 Total scroll attempts: ${scrollAttempts}`);
  
  // Final progress update
  progressCallback({
    current: allResults.size,
    target: 200,
    percentage: Math.min((allResults.size / 200) * 100, 100),
    status: 'finalizing',
    message: `Finalizing data... Found ${allResults.size} businesses`
  });
  
  if (allResults.size > 0) {
    console.log('\n📋 Sample of extracted data (first 5 businesses):');
    const sample = Array.from(allResults.values()).slice(0, 5);
    sample.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.name}`);
      console.log(`   📍 Address: ${item.address.substring(0, 100)}...`);
      console.log(`   📞 Phone: ${item.phone}`);
      console.log(`   🌐 Website: ${item.website}`);
      console.log(`   ⭐ Rating: ${item.rating}`);
      console.log(`   🏷️ Category: ${item.category}`);
    });
  }
  
  return Array.from(allResults.values());
}

async function extractBusinessesEnhanced(page) {
  return await page.evaluate(() => {
    const items = [];
    const seenInThisRound = new Set();
    
    // Updated selectors for Google Maps
    const possibleSelectors = [
      '[role="feed"] > div > div[jsaction]',
      'div[role="feed"] > div > div',
      '[data-result-index]',
      '.Nv2PK',
      '.Nv2PKTHOPQKb',
      '.lXJj5c',
      '.m6QEHe div[role="article"]',
      'div[jsaction*="mouseover"]'
    ];
    
    let cards = [];
    for (const selector of possibleSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        cards = Array.from(elements);
        console.log(`Found ${cards.length} cards using selector: ${selector}`);
        break;
      }
    }
    
    console.log(`Processing ${cards.length} cards...`);
    
    for (let index = 0; index < cards.length; index++) {
      const card = cards[index];
      try {
        // Extract Business Name
        let name = '';
        const nameSelectors = [
          'a[href*="/maps/place/"] .qBF1Pd',
          'a[href*="/maps/place/"] .fontHeadlineSmall',
          'h3 .qBF1Pd',
          '.fontHeadlineSmall',
          '.DUwDvf',
          '.qBF1Pd',
          '[data-attrid="title"]'
        ];
        
        for (const selector of nameSelectors) {
          const el = card.querySelector(selector);
          if (el) {
            let text = el.textContent?.trim();
            if (text && text.length > 1 && text.length < 150) {
              text = text.split('·')[0].split('(')[0].trim();
              if (text.length > 1 && !/^[\d.]+$/.test(text) && text !== 'Best' && text !== 'Website') {
                name = text;
                break;
              }
            }
          }
        }
        
        if (!name) {
          const allText = card.innerText || '';
          const lines = allText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 2 && trimmed.length < 100 && 
                !trimmed.includes('·') && 
                !trimmed.match(/[\d.]/) && 
                !trimmed.includes('reviews') &&
                !trimmed.includes('minutes')) {
              name = trimmed;
              break;
            }
          }
        }
        
        if (!name || name.length < 2) continue;
        if (name.includes('Sponsored') || name.includes('Ad') || name === 'Rating' || name === 'Hours' || name === 'All filters' || 
            name.includes('Rating') || name.includes('Hours') || name.includes('All filters') ||
            name.match(/^(Rating|Hours|All filters)$/i)) continue;
        
        const nameKey = name.toLowerCase().trim();
        if (seenInThisRound.has(nameKey)) continue;
        seenInThisRound.add(nameKey);
        
        // Extract Address
        let address = '';
        const addressSelectors = [
          '.W4Efsd:not(:has(.W4Efsd))',
          '.fontBodySmall',
          '.Io6YTe',
          '[data-item-id="address"]',
          '.QvFfWe'
        ];
        
        for (const selector of addressSelectors) {
          const elements = card.querySelectorAll(selector);
          for (const el of elements) {
            let text = el.textContent?.trim();
            if (text && text.length > 10 && text.length < 300) {
              if (text.includes('Road') || text.includes('Street') || 
                  text.includes('Nagar') || text.includes('Colony') ||
                  text.match(/\d/)) {
                address = text;
                break;
              }
            }
          }
          if (address) break;
        }
        
        // Extract Phone Number
        let phone = '';
        const phoneSelectors = [
          '.UsdlK',
          '[data-item-id="phone"]',
          'a[href^="tel:"]',
          '.Io6YTe'
        ];
        
        for (const selector of phoneSelectors) {
          const el = card.querySelector(selector);
          if (el) {
            let text = el.textContent || el.getAttribute('aria-label') || '';
            const phoneMatch = text.match(/[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{4}/);
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
              !href.includes('search?') &&
              href.length < 200) {
            website = href;
            break;
          }
        }
        
        // Extract Rating
        let rating = '';
        const ratingSelectors = [
          '.MW4etd',
          '[aria-label*="stars"]',
          '.fontBodyMedium'
        ];
        
        for (const selector of ratingSelectors) {
          const el = card.querySelector(selector);
          if (el) {
            const text = el.getAttribute('aria-label') || el.textContent || '';
            const match = text.match(/(\d+\.?\d*)/);
            if (match && parseFloat(match[1]) <= 5) {
              rating = match[1];
              break;
            }
          }
        }
        
        // Extract Category
        let category = '';
        const categorySelectors = [
          '.W4Efsd .qBF1Pd',
          '.fontBodySmall',
          '.UsdlK'
        ];
        
        for (const selector of categorySelectors) {
          const elements = card.querySelectorAll(selector);
          for (const el of elements) {
            let text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 50) {
              if (!text.includes('·') && !text.match(/\d/) && text.length < 30) {
                category = text;
                break;
              }
            }
          }
          if (category) break;
        }
        
        items.push({
          name: name,
          address: address || 'Address not found',
          phone: phone || 'N/A',
          website: website || 'N/A',
          rating: rating || 'N/A',
          category: category || 'Unknown',
          hours: 'N/A'
        });
        
      } catch(e) {
        console.log(`Error processing card ${index}:`, e.message);
      }
    }
    
    return items;
  });
}

// Google Maps history endpoints
app.get('/api/google-maps-history', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const history = await GoogleMapsHistory.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ 
      success: true, 
      history
    });
  } catch (error) {
    console.error('Google Maps history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.delete('/api/google-maps-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedHistory = await GoogleMapsHistory.findByIdAndDelete(id);
    
    if (!deletedHistory) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'History entry deleted successfully'
    });
  } catch (error) {
    console.error('Google Maps history deletion error:', error);
    res.status(500).json({ error: 'Failed to delete history entry' });
  }
});

app.post('/api/google-maps-history', async (req, res) => {
  try {
    const { url, businessCount, data, status = 'completed', errorMessage } = req.body;
    
    if (!url || !businessCount || !data) {
      return res.status(400).json({ error: 'Missing required fields: url, businessCount, data' });
    }
    
    const historyEntry = new GoogleMapsHistory({
      url,
      businessCount,
      data,
      status,
      errorMessage,
      scrapeDate: new Date()
    });
    
    await historyEntry.save();
    
    res.json({ 
      success: true, 
      message: 'History entry saved successfully',
      historyEntry
    });
  } catch (error) {
    console.error('Google Maps history save error:', error);
    res.status(500).json({ error: 'Failed to save history entry' });
  }
});

app.post('/api/detect-categories', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
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

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.includes('google.com/maps')) {
    return res.status(400).json({ error: 'Invalid Google Maps URL' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Loading page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    await page.waitForSelector('[role="feed"]', { timeout: 30000 }).catch(() => {
      console.log('Feed selector not found, continuing anyway...');
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const results = await scrapeAllDataEnhanced(page);

    await browser.close();
    res.json({ success: true, data: results, count: results.length });
  } catch (error) {
    if (browser) await browser.close();
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Scraping failed: ' + error.message });
  }
});

async function detectCategories(page) {
  console.log('Detecting categories...');
  
  const categories = await page.evaluate(() => {
    const categorySet = new Set();
    
    const selectors = [
      '[role="feed"] > div > div',
      '.Nv2PK',
      '[data-result-index]',
      '.lXJj5c'
    ];
    
    let cards = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        cards = Array.from(elements);
        break;
      }
    }
    
    cards.forEach(card => {
      try {
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
                !text.includes('') && !text.match(/\d+/)) {
              categorySet.add(text);
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

app.post('/api/google-maps-download', async (req, res) => {
  const { data, filename = 'google-maps-data.xlsx' } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Businesses');

    worksheet.columns = [
      { header: 'Name', key: 'name', width: 40 },
      { header: 'Address', key: 'address', width: 60 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Website', key: 'website', width: 50 },
      { header: 'Rating', key: 'rating', width: 15 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    headerRow.alignment = { horizontal: 'center' };

    data.forEach(item => {
      worksheet.addRow({
        name: item.name || '',
        address: item.address || '',
        phone: item.phone || '',
        website: item.website || '',
        rating: item.rating || ''
      });
    });

    worksheet.getColumn(2).alignment = { wrapText: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel generation error:', error);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});


// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    cleanupOldFiles();
});