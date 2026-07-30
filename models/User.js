// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // New fields
  dob: { type: String },
  regno: { type: String },
  userClass: { type: String }, // Using 'userClass' because 'class' is a reserved word in JavaScript
  section: { type: String },
  photoUrl: { type: String }
});

module.exports = mongoose.model('User', userSchema);