const mongoose = require('mongoose');

const testAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  score: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now },
  answers: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
      questionText: String, 
      options: [String], // All 4 options
      selectedOption: String, // What the user clicked
      correctAnswer: String, // The actual right answer
      isCorrect: Boolean
    }
  ]
});



module.exports = mongoose.model('TestAttempt', testAttemptSchema);