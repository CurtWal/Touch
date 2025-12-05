require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// 🟩 Register a new user
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Missing required fields" });

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ error: "User already exists" });

    const user = await User.create({ name, email, password});

    // use process.env.JWT_SECRET at sign time
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "7d" });
    res.json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🟦 Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // use process.env.JWT_SECRET at sign time
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "7d" });
    res.json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🟨 Verify token middleware
function verifyToken(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
    if (!token) return res.status(401).json({ error: "No token provided" });

    const clean = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token;
    //console.log("verifyToken: incoming token (decoded):", jwt.decode(clean));

    // ALWAYS use process.env.JWT_SECRET at verification time
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("verifyToken: JWT_SECRET is not set");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    let payload;
    try {
      payload = jwt.verify(clean, secret);
    } catch (err) {
      console.warn("verifyToken: failed to verify token. err:", err.message);
      return res.status(403).json({ error: "Invalid token" });
    }

    req.user = { id: payload.id || payload.userId || payload._id };
    if (!req.user.id) return res.status(403).json({ error: "Invalid token payload" });

    next();
  } catch (err) {
    console.error("verifyToken unexpected error:", err);
    return res.status(500).json({ error: "Auth error" });
  }
}

module.exports = { router, verifyToken };