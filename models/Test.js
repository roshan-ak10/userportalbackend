const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true }, // e.g., "C++ Pointers"
  durationMinutes: { type: Number, required: true },
  isScheduled: { type: Boolean, default: true },
  startTime: { type: Date } // Admin can set a specific date/time for the test
});



module.exports = mongoose.model('Test', testSchema);