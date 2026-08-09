const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  studentName: String,
  studentEmail: String,
  score: Number,
  totalQuestions: Number,
  // NEW: Store the detailed answer breakdown
  answers: [{
    questionText: String,
    chosenAnswer: String,
    correctAnswer: String
  }],
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);