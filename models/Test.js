const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  // Automatically capture the exact moment the test is created
  startTime: { type: Date, default: Date.now },
  // Store the strict cutoff time (Start + Duration + 30 mins)
  endTime: { type: Date, required: true },
  // Audit trail
  createdAt: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('Test', testSchema);