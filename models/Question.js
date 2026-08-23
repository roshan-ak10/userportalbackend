// models/Question.js
const mongoose = require('mongoose');

// 1. Your exact existing schema remains unchanged
const questionSchema = new mongoose.Schema({
  testId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Test', 
    required: false 
  },
  topic: {
    type: String, 
    required: true // e.g., 'C', 'Python', 'Java'
  },
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true }
});

// 2. The Dynamic Generator Function requested by your evaluators
const getQuestionModel = (topicName) => {
  // Converts names like "CPP Easy" into a safe MongoDB collection name: "cpp_easy"
  const safeCollectionName = topicName.trim().toLowerCase().replace(/\s+/g, '_');

  // CRITICAL: Check if Mongoose already has this model loaded in memory.
  // If we try to create a model that already exists, the server will crash.
  if (mongoose.models[safeCollectionName]) {
    return mongoose.models[safeCollectionName];
  }

  // If the collection doesn't exist yet, Mongoose creates it right now.
  // The 3rd argument forces MongoDB to use this exact name for the new table.
  return mongoose.model(safeCollectionName, questionSchema, safeCollectionName);
};

// 3. Export the function instead of a static model
module.exports = getQuestionModel;