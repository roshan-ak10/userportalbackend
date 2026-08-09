// models/Question.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  testId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Test', 
    required: false // <-- IMPORTANT: Change this to false!
  },
  topic: {
    type: String, 
    required: true // e.g., 'C', 'Python', 'Java'
  },
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true }
});

module.exports = mongoose.model('Question', questionSchema);