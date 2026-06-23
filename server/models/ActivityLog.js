const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE_USER',
      'UPDATE_USER',
      'DELETE_USER',
      'RESET_PASSWORD',
      'LOGIN',
      'LOGOUT',
      'ACCESS_DENIED',
      'PERMISSION_CHANGED',
      'USER_SUSPENDED',
      'USER_REACTIVATED'
    ]
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetUsername: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  }
});

// Index for better query performance
activityLogSchema.index({ adminId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ targetUserId: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });

// Remove sensitive data from JSON output
activityLogSchema.methods.toJSON = function() {
  const log = this.toObject();
  // Keep all fields for admin viewing, but could filter if needed
  return log;
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
