const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({
  testName: { type: String, required: true },
  className: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  randomQuestionCount: { type: Number, required: true }, // <-- Added this field for the randomizer
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now } 
});

module.exports = mongoose.model('Test', testSchema);