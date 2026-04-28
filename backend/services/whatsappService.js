class WhatsAppService {
  constructor() {
    console.warn('WhatsApp service has been disabled - Twilio package removed');
    this.client = null;
    this.fromWhatsAppNumber = null;
  }

  async sendWhatsAppMessage(to, message) {
    return { success: false, error: 'WhatsApp service is not available - Twilio package has been removed' };
  }

  async sendBulkWhatsAppMessages(messages) {
    const results = [];
    
    for (const message of messages) {
      const result = await this.sendWhatsAppMessage(message.to, message.message);
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
    
    return cleaned;
  }

  isValidPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    // Check if it's a valid 10-digit number or 11-digit with country code
    return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
  }
}

module.exports = WhatsAppService;
