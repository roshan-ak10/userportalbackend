const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');

// FIX: Renamed this to memoryUpload so it doesn't conflict with Cloudinary below!
const memoryUpload = multer({ storage: multer.memoryStorage() }); 
const dns = require('dns');                     
dns.setDefaultResultOrder('ipv4first');

// --- NODEMAILER SETUP ---
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587, 
  secure: false, 
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  },
  tls: {
    rejectUnauthorized: false
  },
  localAddress: '0.0.0.0' // <-- The Render Network Bypass!
});

const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Test = require('./models/Test');
const Question = require('./models/Question');
const SessionLog = require('./models/SessionLog');
const User = require('./models/User'); 
const Result = require('./models/Result');
const OTP = require('./models/OTP');

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

// POST: Send OTP and enforce college email domain
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;

  try {
    // 1. Enforce College Email Restriction (Re-enabled for Production!)
    const domain = email.split('@')[1];
    if (domain !== 'sastra.ac.in' && domain !== 'sastra.edu') {
      return res.status(400).json({ error: "Access restricted. Please use your official university email ID." });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "An account with this email already exists." });

    // 3. Generate a 6-digit OTP
    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Save to database (will auto-delete in 5 minutes)
    await OTP.findOneAndDelete({ email }); // Clear any old OTPs for this email
    const newOTP = new OTP({ email, otp: generatedOTP });
    await newOTP.save();

    // 5. Send the email using the Google Apps Script HTTP Bridge (Bypasses Render Firewall!)
    const scriptUrl = "https://script.google.com/macros/s/AKfycbwEb7RWE18ymx49J-vn_9CX4JiIk5CN-ooK5lt813BEGTQGkcZYpOjjVRDzgD7vneQa/exec"; // <-- REPLACE THIS STRING WITH YOUR DEPLOYED WEB APP URL

    const emailResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        to: email,
        subject: "Your Registration OTP",
        html: `<h2>Your Verification Code</h2>
               <p>Use the following 6-digit code to complete your registration. This code will expire in 5 minutes.</p>
               <h1 style="color: #007bff; letter-spacing: 5px;">${generatedOTP}</h1>`
      })
    });

    const emailResult = await emailResponse.json();

    if (emailResult.error) {
      console.error("GOOGLE SCRIPT ERROR:", emailResult.error);
      return res.status(500).json({ error: "Failed to send email via Google Apps Script." });
    }

    res.status(200).json({ message: "OTP sent successfully!" });
  } catch (error) {
    console.error("OTP ERROR:", error);
    res.status(500).json({ error: "Failed to send OTP." });
  }
});

// POST: Verify the OTP
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  
  try {
    const record = await OTP.findOne({ email, otp });
    if (!record) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }
    
    // Once verified, delete it so it can't be used again
    await OTP.findByIdAndDelete(record._id);
    res.status(200).json({ message: "Email verified!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify OTP." });
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
      const newSession = new SessionLog({ userId: user._id , email:user.email });
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
  } catch (error) {
    console.error("LOGIN ERROR:", error); 
    res.status(500).json({ error: "Error logging in" });
  }
});

// POST: Create a new test (Admin only)
app.post('/api/tests', async (req, res) => {
  const { testName, durationMinutes, totalQuestions, startTime } = req.body;

  try {
    const newTest = new Test({
      testName,
      durationMinutes,
      totalQuestions,
      startTime
    });
    
    await newTest.save();
    res.status(201).json({ message: "Test created successfully", test: newTest });
  } catch (error) {
    console.error("CREATE TEST ERROR:", error);
    res.status(500).json({ error: "Failed to create test" });
  }
});

// PUT: Update an existing test
app.put('/api/tests/:id', async (req, res) => {
  try {
    const updatedTest = await Test.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true } 
    );
    if (!updatedTest) return res.status(404).json({ error: "Test not found" });
    res.json({ message: "Test updated successfully", test: updatedTest });
  } catch (error) {
    console.error("UPDATE TEST ERROR:", error);
    res.status(500).json({ error: "Failed to update test" });
  }
});

// DELETE: Delete a test AND its questions
app.delete('/api/tests/:id', async (req, res) => {
  try {
    const deletedTest = await Test.findByIdAndDelete(req.params.id);
    if (!deletedTest) return res.status(404).json({ error: "Test not found" });
    
    await Question.deleteMany({ testId: req.params.id });

    res.json({ message: "Test and associated questions deleted successfully" });
  } catch (error) {
    console.error("DELETE TEST ERROR:", error);
    res.status(500).json({ error: "Failed to delete test" });
  }
});

// POST: Add a question to a specific test manually
app.post('/api/questions', async (req, res) => {
  const { testId, questionText, options, correctAnswer } = req.body;

  try {
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

// POST: Bulk Upload Questions from Excel (SAVES THE ENTIRE POOL)
app.post('/api/questions/bulk/:testId', memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { rangeStart, rangeEnd } = req.body;
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // 1. Slice the data based on the requested range
    const startIdx = rangeStart ? Math.max(0, parseInt(rangeStart) - 1) : 0;
    const endIdx = rangeEnd ? Math.min(data.length, parseInt(rangeEnd)) : data.length;
    const questionPool = data.slice(startIdx, endIdx);

    // 2. Save the ENTIRE pool to the database 
    const questionsArray = questionPool.map(row => {
      const keys = Object.keys(row);
      return {
        testId: req.params.testId,
        questionText: String(row[keys[1]]), 
        options: [
          String(row[keys[2]]), 
          String(row[keys[3]]), 
          String(row[keys[4]]), 
          String(row[keys[5]])  
        ],
        correctAnswer: String(row[keys[6]])
      };
    });

    await Question.insertMany(questionsArray);
    res.json({ message: "Question pool uploaded successfully!", count: questionsArray.length });
  } catch (error) {
    console.error("EXCEL UPLOAD ERROR:", error);
    res.status(500).json({ error: "Failed to parse Excel file." });
  }
});

// GET: Generate a randomized exam for a specific student
app.get('/api/student-exam/:testId', async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);
    if (!test) return res.status(404).json({ error: "Test not found" });

    // 1. Get ALL questions available in the pool for this test
    const allQuestions = await Question.find({ testId: req.params.testId });

    // 2. Shuffle the entire pool randomly
    const shuffledPool = allQuestions.sort(() => 0.5 - Math.random());

    // 3. Pick exactly the number of questions the test requires 
    const selectedQuestions = shuffledPool.slice(0, test.totalQuestions);

    // 4. Shuffle the 4 options inside each of those selected questions
    const randomizedExam = selectedQuestions.map(q => {
      const qObj = q.toObject(); 
      qObj.options = qObj.options.sort(() => 0.5 - Math.random());
      return qObj;
    });

    res.status(200).json(randomizedExam);
  } catch (error) {
    console.error("EXAM GENERATION ERROR:", error);
    res.status(500).json({ error: "Failed to generate exam" });
  }
});

// GET: Fetch all scheduled tests for the student dashboard
app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find({ isScheduled: true });
    res.status(200).json(tests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});

// PUT: Update a specific question
app.put('/api/questions/:id', async (req, res) => {
  try {
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedQuestion) return res.status(404).json({ error: "Question not found" });
    res.json({ message: "Question updated successfully", question: updatedQuestion });
  } catch (error) {
    console.error("UPDATE QUESTION ERROR:", error);
    res.status(500).json({ error: "Failed to update question" });
  }
});

// DELETE: Delete a specific question
app.delete('/api/questions/:id', async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) return res.status(404).json({ error: "Question not found" });
    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("DELETE QUESTION ERROR:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
});

// GET: Fetch a single test's details (for the timer)
app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch test details" });
  }
});

// GET: Fetch all questions for a specific test
app.get('/api/questions/:testId', async (req, res) => {
  try {
    const questions = await Question.find({ testId: req.params.testId });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// POST: Save a student's test result
app.post('/api/results', async (req, res) => {
  const { testId, studentName, studentEmail, score, totalQuestions } = req.body;

  try {
    const newResult = new Result({
      testId,
      studentName,
      studentEmail,
      score,
      totalQuestions
    });
    
    await newResult.save();
    res.status(201).json({ message: "Score saved successfully!" });
  } catch (error) {
    console.error("SAVE SCORE ERROR:", error);
    res.status(500).json({ error: "Failed to save score" });
  }
});

// GET: Fetch all student results for the Admin Dashboard
app.get('/api/results', async (req, res) => {
  try {
    const results = await Result.find()
      .populate('testId', 'testName')
      .sort({ submittedAt: -1 }); 
      
    res.status(200).json(results);
  } catch (error) {
    console.error("FETCH RESULTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));