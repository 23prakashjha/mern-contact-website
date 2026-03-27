const twilio = require('twilio');

class SMSService {
  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID && 
        process.env.TWILIO_AUTH_TOKEN && 
        process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    } else {
      console.warn('Valid Twilio credentials not provided. SMS service will be disabled.');
      this.client = null;
      this.fromPhoneNumber = null;
    }
  }

  async sendSMS(to, message) {
    if (!this.client) {
      return { success: false, error: 'SMS service not configured' };
    }

    try {
      // Format phone number
      const formattedNumber = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromPhoneNumber,
        to: formattedNumber,
      });

      console.log('SMS sent successfully:', result.sid);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('Error sending SMS:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBulkSMS(messages) {
    const results = [];
    
    for (const message of messages) {
      const result = await this.sendSMS(message.to, message.message);
      results.push({
        phone: message.to,
        ...result
      });
    }

    return results;
  }

  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if not present (assuming US/Canada by default)
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    // Add + prefix for international format
    return '+' + cleaned;
  }

  isValidPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    // Check if it's a valid 10-digit number or 11-digit with country code
    return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
  }
}

module.exports = SMSService;
