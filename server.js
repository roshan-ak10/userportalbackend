const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    res.status(200).json({ message: "Login successful", user: { email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

app.post('/api/upload-details', upload.single('photo'), async (req, res) => {
  try {
    const { email, dob, regno, userClass, section } = req.body;
    
    const updateData = {};
    if (dob) updateData.dob = dob;
    if (regno) updateData.regno = regno;
    if (userClass) updateData.userClass = userClass;
    if (section) updateData.section = section;
    
    // THE MAGIC FIX: req.file.path now contains the secure Cloudinary URL!
    if (req.file) {
      updateData.photoUrl = req.file.path; 
    }

    await User.findOneAndUpdate(
      { email: email }, 
      { $set: updateData },
      { returnDocument: 'after' } 
    );

    res.status(200).json({ message: "Details saved successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error saving details" });
  }
});


const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));