const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true },
  className: { type: String, required: true }, // <-- NEW: Added Class Name
  durationMinutes: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('Test', testSchema);