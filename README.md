# MERN Bulk Outreach System

A comprehensive web application built with the MERN stack (MongoDB, Express.js, React, Node.js) that enables users to upload Excel files containing company details and send bulk messages via WhatsApp, Email, and SMS.

## 🚀 Features

- **Excel File Upload**: Upload and parse Excel files containing company information
- **Multi-channel Communication**: Send messages via WhatsApp, Email, and SMS
- **Status Tracking**: Monitor delivery status for each message (Sent/Failed/Pending)
- **Communication History**: View detailed history of all sent messages
- **Real-time Statistics**: Track success rates and campaign performance
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- Twilio Account (for WhatsApp and SMS)
- Email Service (Gmail or other SMTP provider)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd mern-contact-website
```

### 2. Backend Setup

```bash
cd backend
npm install
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

### 4. Environment Configuration

Create a `.env` file in the `backend` directory:

```env
MONGODB_URI=mongodb://localhost:27017/bulk-outreach
PORT=5000

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# WhatsApp Configuration
WHATSAPP_API_URL=https://api.twilio.com/2010-04-01/Accounts
```

### 5. Database Setup

Ensure MongoDB is running on your system or use a cloud service like MongoDB Atlas.

## 🗂️ Project Structure

```
mern-contact-website/
├── backend/
│   ├── services/
│   │   ├── emailService.js
│   │   ├── whatsappService.js
│   │   └── smsService.js
│   ├── uploads/
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload.jsx
│   │   │   ├── CompanyList.jsx
│   │   │   ├── Stats.jsx
│   │   │   └── MessageSender.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
└── README.md
```

## 🚀 Running the Application

### 1. Start the Backend Server

```bash
cd backend
npm run dev
```

The backend will run on `http://localhost:5000`

### 2. Start the Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

## 📊 API Endpoints

### Upload Excel File
- **POST** `/api/upload`
- **Content-Type**: `multipart/form-data`
- **Body**: `file` (Excel file)

### Get All Companies
- **GET** `/api/companies`
- **Response**: Array of company objects with status

### Send Messages
- **POST** `/api/send-messages`
- **Body**: 
  ```json
  {
    "companyIds": ["id1", "id2"],
    "communicationType": "all"
  }
  ```

### Get Statistics
- **GET** `/api/stats`
- **Response**: 
  ```json
  {
    "total": 100,
    "sent": 80,
    "pending": 15,
    "failed": 5
  }
  ```

## 📋 Excel File Format

Your Excel file should contain the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| Company | Yes | Company name |
| Phone | Yes | Phone number (with country code) |
| Email | Yes | Email address |
| Website | No | Company website |

**Example:**
```
Company    Phone         Email                Website
ABC Ltd    +1234567890   contact@abc.com      www.abc.com
XYZ Corp   +1234567891   info@xyz.com         www.xyz.com
```

## 🔧 Configuration Details

### Twilio Setup

1. Sign up for a Twilio account
2. Get your Account SID and Auth Token from the Twilio Console
3. Purchase a phone number for SMS/WhatsApp
4. Configure WhatsApp Sandbox for testing

### Email Setup (Gmail)

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password
3. Use the App Password in your `.env` file

## 🎯 Usage Guide

1. **Upload Excel File**: 
   - Click the upload area or drag and drop your Excel file
   - The system will automatically parse and store the data

2. **Select Companies**:
   - Choose which companies to send messages to
   - Select communication type (All, WhatsApp, Email, or SMS)

3. **Send Messages**:
   - Click "Send Messages" to start the campaign
   - Monitor real-time status updates

4. **Track Results**:
   - View statistics in the dashboard
   - Check detailed communication history

## 🛡️ Error Handling

The system includes comprehensive error handling:
- Invalid file formats are rejected
- Phone number validation for SMS/WhatsApp
- Email validation
- API error logging and user feedback

## 🔒 Security Considerations

- Environment variables for sensitive data
- File type validation for uploads
- Input sanitization
- CORS configuration

## 📈 Scalability

The application is designed for scalability:
- Efficient database queries
- Async message processing
- Error recovery mechanisms
- Modular service architecture

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check connection string in `.env`

2. **Email Sending Fails**
   - Verify email credentials
   - Check App Password for Gmail
   - Ensure less secure apps access is enabled

3. **WhatsApp/SMS Not Working**
   - Verify Twilio credentials
   - Check phone number formatting
   - Ensure sufficient Twilio balance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support and questions, please open an issue in the repository.
