// Force the server timezone to Indian Standard Time
process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');

const memoryUpload = multer({ storage: multer.memoryStorage() }); 
const dns = require('dns');                     
dns.setDefaultResultOrder('ipv4first');

const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const Test = require('./models/Test');
const getQuestionModel = require('./models/Question');
const SessionLog = require('./models/SessionLog');
const User = require('./models/User'); 
const Result = require('./models/Result');
const OTP = require('./models/OTP');

// --- UPDATED ATTEMPT LOG MODEL (Now Supports Anti-Cheat Heartbeats) ---
const attemptSchema = new mongoose.Schema({
  testId: String,
  studentEmail: String,
  forcedEndTime: Date,
  status: { type: String, default: 'in-progress' },
  lastActiveAt: { type: Date, default: Date.now },
  violationFlag: { type: Boolean, default: false },
  violationReason: String
});
const AttemptLog = mongoose.models.AttemptLog || mongoose.model('AttemptLog', attemptSchema);
// ------------------------------------------------------

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // --- NEW: ANTI-CHEAT BACKGROUND MONITOR ---
    // Runs every 30 seconds to catch students who force-closed the app
    setInterval(async () => {
      const twentySecondsAgo = new Date(Date.now() - 20000);
      try {
        const deadSessions = await AttemptLog.find({
          status: 'in-progress',
          lastActiveAt: { $lt: twentySecondsAgo }
        });

        for (const session of deadSessions) {
          console.log(`[ANTI-CHEAT] Auto-submitting abandoned test for ${session.studentEmail}`);
          
          session.status = 'submitted';
          session.violationFlag = true; 
          session.violationReason = 'App forcefully closed, backgrounded, or network disconnected';
          await session.save();

          // Optionally, you can automatically generate a 0-score Result document here 
          // to completely lock them out of the test on the frontend.
        }
      } catch (error) {
        console.error('Error processing dead sessions:', error);
      }
    }, 30000);

  })
  .catch(err => console.error("MongoDB connection error:", err));

// =========================================================================
// AUTHENTICATION & USER MANAGEMENT
// =========================================================================

app.get('/api/users', async (req, res) => {
  try {
    const allUsers = await User.find({}, '-password'); 
    res.status(200).json(allUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  try {
    const domain = email.split('@')[1];
    if (domain !== 'sastra.ac.in' && domain !== 'sastra.edu') {
      return res.status(400).json({ error: "Access restricted. Please use your official university email ID." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "An account with this email already exists." });

    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    await OTP.findOneAndDelete({ email }); 
    const newOTP = new OTP({ email, otp: generatedOTP });
    await newOTP.save();

    const scriptUrl = "https://script.google.com/macros/s/AKfycbzO-QawDwPgLgJPJxWKLbrS0xCnPiXAZ1b0phRt_S7aWfUBJOCWMpPcunlsUft5BU4/exec"; 

    const emailResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        to: email,
        subject: "Your Registration OTP FOR SASTRATESTPORTAL (TESTING)",
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

app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    const record = await OTP.findOne({ email, otp });
    if (!record) return res.status(400).json({ error: "Invalid or expired OTP." });
    
    await OTP.findByIdAndDelete(record._id);
    res.status(200).json({ message: "Email verified!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to verify OTP." });
  }
});

app.post('/api/forgot-password-otp', async (req, res) => {
  const { email } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) return res.status(404).json({ error: "No account found with this email." });

    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.findOneAndDelete({ email }); 
    const newOTP = new OTP({ email, otp: generatedOTP });
    await newOTP.save();

    const scriptUrl = "https://script.google.com/macros/s/AKfycbzO-QawDwPgLgJPJxWKLbrS0xCnPiXAZ1b0phRt_S7aWfUBJOCWMpPcunlsUft5BU4/exec"; 
    const emailResponse = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        to: email,
        subject: "Password Reset OTP - SASTRA Test Portal",
        html: `<h2>Password Reset Request</h2>
               <p>Use this 6-digit code to reset your password. It expires in 5 minutes.</p>
               <h1 style="color: #da2323; letter-spacing: 5px;">${generatedOTP}</h1>`
      })
    });

    res.status(200).json({ message: "Reset OTP sent successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send reset OTP." });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const record = await OTP.findOne({ email, otp });
    if (!record) return res.status(400).json({ error: "Invalid or expired OTP." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.findOneAndUpdate({ email }, { password: hashedPassword }); 
    await OTP.findOneAndDelete({ email }); 

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

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

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
      await SessionLog.deleteMany({ email: user.email });

      const newSession = new SessionLog({ userId: user._id , email:user.email });
      await newSession.save();

      return res.json({
        message: "Login successful",
        role: user.role,
        sessionId: newSession._id, 
        name: user.name
      });
    } else {
      return res.status(400).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    console.error("LOGIN ERROR:", error); 
    res.status(500).json({ error: "Error logging in" });
  }
});

// =========================================================================
// TEST MANAGEMENT & QUESTION BANK 
// =========================================================================

app.get('/api/topics', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const standardModels = ['tests', 'sessionlogs', 'users', 'results', 'otps', 'attemptlogs'];
    const topics = collections
      .map(col => col.name)
      .filter(name => !standardModels.includes(name) && !name.startsWith('system.'));

    res.status(200).json(topics);
  } catch (error) {
    console.error("FETCH TOPICS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

app.post('/api/questions/bank/bulk', memoryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { topic } = req.body; 
    if (!topic) return res.status(400).json({ error: "Topic is required to bank questions." });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const questionsArray = data.map(row => {
      const keys = Object.keys(row);
      return {
        topic: topic, 
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

    const DynamicCollection = getQuestionModel(topic);
    await DynamicCollection.insertMany(questionsArray);

    res.json({ message: `Successfully added ${questionsArray.length} questions to the ${topic} table!` });
  } catch (error) {
    console.error("BANK UPLOAD ERROR:", error);
    res.status(500).json({ error: "Failed to upload to the question bank." });
  }
});

app.post('/api/questions/bank/single', async (req, res) => {
  try {
    const { topic, questionText, options, correctAnswer } = req.body;
    
    if (!topic || !questionText || !options || options.length !== 4 || !correctAnswer) {
      return res.status(400).json({ error: "Please fill out all fields completely." });
    }

    const DynamicCollection = getQuestionModel(topic);
    
    const newQuestion = new DynamicCollection({
      topic,
      questionText,
      options,
      correctAnswer
    });

    await newQuestion.save();
    res.status(201).json({ message: `Question successfully added to '${topic}'!` });
  } catch (error) {
    console.error("SINGLE UPLOAD ERROR:", error);
    res.status(500).json({ error: "Failed to add manual question." });
  }
});

app.post('/api/tests/generate', async (req, res) => {
  const { testName, className, durationMinutes, activeWindowMinutes, topic, rangeStart, rangeEnd, numQuestions } = req.body;

  try {
    const startIdx = Math.max(0, parseInt(rangeStart) - 1);
    const limitAmount = parseInt(rangeEnd) - startIdx;
    
    const DynamicCollection = getQuestionModel(topic);
    const poolQuestions = await DynamicCollection.find({ testId: { $exists: false } }).skip(startIdx).limit(limitAmount);
    
    if (poolQuestions.length < parseInt(numQuestions)) {
      return res.status(400).json({ error: `Only found ${poolQuestions.length} questions in this range.` });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + (activeWindowMinutes) * 60000);

    const newTest = new Test({
      testName,
      className,
      durationMinutes,
      totalQuestions: poolQuestions.length, 
      randomQuestionCount: parseInt(numQuestions), 
      startTime,
      endTime
    });
    await newTest.save();

    const testQuestions = poolQuestions.map(q => ({
      testId: newTest._id,
      topic: q.topic,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer
    }));
    
    await DynamicCollection.insertMany(testQuestions);

    res.status(201).json({ message: "Test created! Pool ready for randomization.", test: newTest });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate dynamic test" });
  }
});

app.get('/api/tests', async (req, res) => {
  try {
    const tests = await Test.find().sort({ startTime: -1 });
    res.status(200).json(tests);
  } catch (error) {
    console.error("FETCH TESTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});

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

app.delete('/api/tests/:id', async (req, res) => {
  try {
    const deletedTest = await Test.findByIdAndDelete(req.params.id);
    if (!deletedTest) return res.status(404).json({ error: "Test not found" });
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    const standardModels = ['tests', 'sessionlogs', 'users', 'results', 'otps', 'attemptlogs'];
    const topicCollections = collections.filter(c => !standardModels.includes(c.name) && !c.name.startsWith('system.'));

    for (let col of topicCollections) {
      const DynamicModel = getQuestionModel(col.name);
      await DynamicModel.deleteMany({ testId: req.params.id });
    }

    res.json({ message: "Test and associated questions deleted successfully" });
  } catch (error) {
    console.error("DELETE TEST ERROR:", error);
    res.status(500).json({ error: "Failed to delete test" });
  }
});

// =========================================================================
// EXAM TAKING & SUBMISSION (STUDENT FACING)
// =========================================================================

app.get('/api/tests/:id', async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.status(200).json(test);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch test details" });
  }
});

app.get('/api/tests/student/:email', async (req, res) => {
  try {
    const studentEmail = req.params.email;
    const currentTime = new Date();

    const activeTests = await Test.find({ 
      startTime: { $lte: currentTime }, 
      endTime: { $gt: currentTime } 
    });

    const pastResults = await Result.find({ studentEmail });
    const takenTestIds = pastResults.map(r => r.testId.toString());
    const availableTests = activeTests.filter(test => !takenTestIds.includes(test._id.toString()));

    res.status(200).json(availableTests);
  } catch (error) {
    console.error("FETCH STUDENT TESTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch student tests" });
  }
});

app.get('/api/start-test/:testId', async (req, res) => {
  const { testId } = req.params;
  const { email } = req.query; 

  try {
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ message: "Test not found" });

    const currentTime = new Date();

    if (currentTime < test.startTime) {
      return res.status(403).json({ message: "This test has not started yet. Please wait." });
    }

    if (currentTime > test.endTime) {
      return res.status(403).json({ message: "This test has expired and is no longer available." });
    }

    let remainingSeconds = test.durationMinutes * 60;

    if (email) {
      const existingResult = await Result.findOne({ testId, studentEmail: email });
      if (existingResult) {
        return res.status(403).json({ message: "You have already completed this test. Multiple attempts are not allowed." });
      }

      let attempt = await AttemptLog.findOne({ testId, studentEmail: email });
      
      // Prevent re-entry if they were auto-submitted for cheating
      if (attempt && attempt.violationFlag) {
        return res.status(403).json({ message: "Exam locked due to academic integrity violation." });
      }

      if (!attempt) {
        attempt = new AttemptLog({
          testId,
          studentEmail: email,
          forcedEndTime: new Date(Date.now() + (test.durationMinutes * 60000)),
          status: 'in-progress',
          lastActiveAt: new Date()
        });
        await attempt.save();
      }

      const remainingMilliseconds = attempt.forcedEndTime.getTime() - Date.now();
      if (remainingMilliseconds <= 0) {
        return res.status(403).json({ message: "Your time for this exam has already expired." });
      }
      remainingSeconds = Math.floor(remainingMilliseconds / 1000);
    }

    let allQuestions = [];
    const collections = await mongoose.connection.db.listCollections().toArray();
    const standardModels = ['tests', 'sessionlogs', 'users', 'results', 'otps', 'attemptlogs'];
    const topicCollections = collections.filter(c => !standardModels.includes(c.name) && !c.name.startsWith('system.'));

    for (let col of topicCollections) {
      const DynamicModel = getQuestionModel(col.name);
      const questions = await DynamicModel.find({ testId });
      if (questions.length > 0) {
        allQuestions = questions;
        break; 
      }
    }

    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }

    const limit = test.randomQuestionCount || test.totalQuestions;
    const selectedQuestions = allQuestions.slice(0, limit);

    const randomizedExam = selectedQuestions.map(q => {
      const qObj = q.toObject(); 
      qObj.options = qObj.options.sort(() => 0.5 - Math.random());
      return qObj;
    });

    res.status(200).json({
      _id: test._id,
      testName: test.testName,
      remainingSeconds: remainingSeconds, 
      durationMinutes: test.durationMinutes,
      questions: randomizedExam 
    });

  } catch (error) {
    console.error("START TEST ERROR:", error);
    res.status(500).json({ message: "Server error generating random test." });
  }
});

// --- NEW: HEARTBEAT ROUTE ---
app.post('/api/results/heartbeat', async (req, res) => {
  const { testId, studentEmail } = req.body;
  
  try {
    // Ping updates the last active timestamp to prevent auto-submission
    await AttemptLog.updateOne(
      { testId, studentEmail, status: 'in-progress' },
      { $set: { lastActiveAt: new Date() } }
    );
    res.status(200).send('Heartbeat received');
  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).send('Server error');
  }
});

app.post('/api/results', async (req, res) => {
  const { testId, studentName, studentEmail, score, totalQuestions, answers } = req.body;

  try {
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: "Test not found." });

    if (new Date() > test.endTime) {
      return res.status(403).json({ 
        error: "Test submission rejected. The strict time limit and grace period have expired." 
      });
    }

    const attempt = await AttemptLog.findOne({ testId, studentEmail });
    if (attempt) {
      const gracePeriodEnd = new Date(attempt.forcedEndTime.getTime() + 60000);
      if (new Date() > gracePeriodEnd) {
        return res.status(403).json({ 
          error: "Exam rejected. You exceeded the absolute server-enforced time limit." 
        });
      }
      
      // Update attempt status to clear the heartbeat monitor
      attempt.status = 'submitted';
      await attempt.save();
    }

    const existingResult = await Result.findOne({ testId, studentEmail });
    if (existingResult) {
      return res.status(403).json({ 
        error: "You have already submitted this test. Duplicate submissions are not allowed." 
      });
    }

    const newResult = new Result({
      testId, studentName, studentEmail, score, totalQuestions, answers
    });
    
    await newResult.save();
    res.status(201).json({ message: "Score and detailed answers saved successfully!" });
  } catch (error) {
    console.error("SAVE SCORE ERROR:", error);
    res.status(500).json({ error: "Failed to save score" });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const results = await Result.find()
      .populate('testId', 'testName className') 
      .sort({ submittedAt: -1 }); 
      
    res.status(200).json(results);
  } catch (error) {
    console.error("FETCH RESULTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
});