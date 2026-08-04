// models/SessionLog.js
const mongoose = require('mongoose');

const sessionLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  loginTime: { 
    type: Date, 
    default: Date.now // Automatically saves the exact moment they log in
  },
  logoutTime: { 
    type: Date // Left empty until they actually click logout
  }
});

module.exports = mongoose.model('SessionLog', sessionLogSchema);