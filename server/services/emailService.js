const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Only initialize transporter if email credentials are provided
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    } else {
      console.warn('Email credentials not provided. Email service will be disabled.');
      this.transporter = null;
    }
  }

  async sendEmail(to, subject, message) {
    if (!this.transporter) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${subject}</h2>
            <p style="color: #666; line-height: 1.6;">${message}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              This message was sent from the Bulk Outreach System.
            </p>
          </div>
        `,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBulkEmails(emails) {
    const results = [];
    
    for (const email of emails) {
      const result = await this.sendEmail(email.to, email.subject, email.message);
      results.push({
        email: email.to,
        ...result
      });
    }

    return results;
  }
}

module.exports = EmailService;
