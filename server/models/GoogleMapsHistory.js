const mongoose = require('mongoose');

const GoogleMapsHistorySchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  businessCount: {
    type: Number,
    required: true
  },
  data: [{
    name: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    }
  }],
  scrapeDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['completed', 'failed', 'in_progress'],
    default: 'completed'
  },
  errorMessage: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for better query performance
GoogleMapsHistorySchema.index({ createdAt: -1 });
GoogleMapsHistorySchema.index({ url: 1 });
GoogleMapsHistorySchema.index({ scrapeDate: -1 });

module.exports = mongoose.model('GoogleMapsHistory', GoogleMapsHistorySchema);
