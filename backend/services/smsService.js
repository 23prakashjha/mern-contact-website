class SMSService {
  constructor() {
    console.warn('SMS service has been disabled - Twilio package removed');
    this.client = null;
    this.fromPhoneNumber = null;
  }

  async sendSMS(to, message) {
    return { success: false, error: 'SMS service is not available - Twilio package has been removed' };
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
