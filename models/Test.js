const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  isScheduled: { type: Boolean, default: true },
  startTime: { type: Date }
});

module.exports = mongoose.model('Test', testSchema);
