const mongoose = require('mongoose');

const JustdialHistorySchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  businessCount: {
    type: Number,
    required: true
  },
  businesses: [{
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    rating: {
      type: String,
      trim: true
    },
    image: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    }
  }],
  scrapeType: {
    type: String,
    enum: ['single', 'bulk'],
    default: 'single'
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
JustdialHistorySchema.index({ createdAt: -1 });
JustdialHistorySchema.index({ url: 1 });
JustdialHistorySchema.index({ category: 1 });
JustdialHistorySchema.index({ city: 1 });

module.exports = mongoose.model('JustdialHistory', JustdialHistorySchema);
