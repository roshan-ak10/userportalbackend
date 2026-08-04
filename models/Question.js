const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }], // Array of exactly 4 strings
  correctAnswer: { type: String, required: true } // Must match one of the options
});



module.exports = mongoose.model('Question', questionSchema);