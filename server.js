const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Test = require('./models/Test');           // <--- THIS IS CRITICAL
const Question = require('./models/Question');
const SessionLog = require('./models/SessionLog');

// IMPORT YOUR NEW USER MODEL HERE
const User = require('./models/User'); 

const app = express();
app.use(express.json());
app.use(cors());

// Serve the 'uploads' folder publicly
app.use('/uploads', express.static('uploads')); 


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

  // Configure Cloudinary with your .env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Set up the Cloudinary storage engine for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'user_portal_profiles', // Creates a folder in your Cloudinary account
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

const upload = multer({ storage: storage });

// --- ADMIN ROUTE: GET ALL USERS ---
app.get('/api/users', async (req, res) => {
  try {
    // Fetch all users, but leave out their passwords for security
    const allUsers = await User.find({}, '-password'); 
    res.status(200).json(allUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

//api routes
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    
    res.status(201).json({ message: "User created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Error signing up" });
  }
});

// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
      // 1. Create the new session log
      const newSession = new SessionLog({ userId: user._id });
      await newSession.save();

      // 2. Send data back AND add 'return' to stop the code here
      return res.json({
        message: "Login successful",
        role: user.role,
        sessionId: newSession._id,
        name:user.name
      });
    } else {
      return res.status(400).json({ error: "Invalid credentials" });
    }
    
    // I deleted the duplicate response that was crashing your server here!
    
  } catch (error) {
    console.error("LOGIN ERROR:", error); // This prints the exact error in Render logs
    res.status(500).json({ error: "Error logging in" });
  }
});

// POST: Create a new test (Admin only)
app.post('/api/tests', async (req, res) => {
  // 1. Notice we are extracting totalQuestions here!
  const { testName, durationMinutes, totalQuestions, startTime } = req.body;

  try {
    const newTest = new Test({
      testName,
      durationMinutes,
      totalQuestions, // 2. And we are passing it to the database here!
      startTime
    });
    
    await newTest.save();
    res.status(201).json({ message: "Test created successfully", test: newTest });
  } catch (error) {
    console.error("CREATE TEST ERROR:", error); // Logs the exact reason to Render
    res.status(500).json({ error: "Failed to create test" });
  }
});

// POST: Add a question to a specific test
app.post('/api/questions', async (req, res) => {
  const { testId, questionText, options, correctAnswer } = req.body;

  try {
    // Basic validation to ensure the admin provided exactly 4 options
    if (!options || options.length !== 4) {
      return res.status(400).json({ error: "Exactly 4 options are required" });
    }

    const newQuestion = new Question({
      testId,
      questionText,
      options,
      correctAnswer
    });

    await newQuestion.save();
    res.status(201).json({ message: "Question added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add question" });
  }
});

// GET: Fetch all scheduled tests for the student dashboard
app.get('/api/tests', async (req, res) => {
  try {
    // Fetch all tests where isScheduled is true
    const tests = await Test.find({ isScheduled: true });
    res.status(200).json(tests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));