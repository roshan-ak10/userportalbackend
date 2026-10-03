// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'student' },
  
  // --- NEW FIELDS ADDED FOR SIDEBAR PROFILE ---
  studentClass: { type: String, default: '' },
  year: { type: String, default: '' },
  theme: { type: String, default: 'light' },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);