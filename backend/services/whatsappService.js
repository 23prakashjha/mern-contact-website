const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID && 
        process.env.TWILIO_AUTH_TOKEN && 
        process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.fromWhatsAppNumber = process.env.TWILIO_PHONE_NUMBER;
    } else {
      console.warn('Valid Twilio credentials not provided. WhatsApp service will be disabled.');
      this.client = null;
      this.fromWhatsAppNumber = null;
    }
  }

  async sendWhatsAppMessage(to, message) {
    if (!this.client) {
      return { success: false, error: 'WhatsApp service not configured' };
    }

    try {
      // Format phone number for WhatsApp
      const formattedNumber = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.fromWhatsAppNumber}`,
        to: `whatsapp:${formattedNumber}`,
      });

      console.log('WhatsApp message sent successfully:', result.sid);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return { success: false, error: error.message };
    }
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
