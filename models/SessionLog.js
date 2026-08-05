const mongoose = require('mongoose');

const sessionLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  email: { 
    type: String, 
    required: true // <-- ADD THIS
  },
  loginTime: { 
    type: Date, 
    default: Date.now 
  },
  logoutTime: { 
    type: Date 
  }
});

module.exports = mongoose.model('SessionLog', sessionLogSchema);