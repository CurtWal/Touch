const express = require("express");
const router = express.Router();
const PlatformAuth = require("../models/PlatformAuthSchema");
const axios = require("axios");
const { verifyToken } = require("./auth");
const jwt = require("jsonwebtoken");

// 1) Redirect user to LinkedIn OAuth
router.get("/auth/linkedin", (req, res) => {
  const state = req.query.state; // JWT passed from frontend
  const SCOPES = 'openid profile email w_member_social'
  const redirectUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
    process.env.LINKEDIN_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    process.env.LINKEDIN_REDIRECT_URI
  )}&scope=${SCOPES}%20openid%20profile%20email&state=${state}`;

  res.redirect(redirectUrl);
});

// 2) OAuth callback from LinkedIn
router.get("/auth/linkedin/callback", async (req, res) => {
  const { code, state } = req.query;
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  const userId = decoded.id; // the logged-in user

  try {
    // Exchange code for token
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
      }
    );

    const {
      access_token,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
    } = tokenRes.data;


    // ⚡ Generate dedicated n8n JWT for running scheduled posts
    const n8nToken = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: "1y" } // long lived
    );
    await PlatformAuth.findOneAndUpdate(
      { userId, platform: "linkedin" },
      {
        $set: {
          credentials: {
            accessToken: access_token,
            refreshToken: refresh_token,
          },
          n8nToken,  
          expiresAt: new Date(Date.now() + expires_in * 1000),
          refreshedAt: new Date(),
          notes: "LinkedIn OAuth connected",
        },
      },
      { upsert: true, new: true }
    );

    // Redirect to frontend confirmation page
    res.redirect(
      process.env.FRONTEND_URL + "/social-accounts?linkedin=connected"
    );
  } catch (err) {
    console.error("LinkedIn OAuth error:", err.response?.data || err.message);
    res.status(500).send("LinkedIn OAuth failed");
  }
});

router.post("/auth/linkedin/refresh", verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
    if (!doc || !doc.credentials.refreshToken) {
      return res.status(400).json({ error: "No LinkedIn refresh token" });
    }

    const refreshToken = doc.credentials.refreshToken;

    const refreshRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        },
      }
    );

    const newAccessToken = refreshRes.data.access_token;

    const expiresIn = refreshRes.data.expires_in;

    doc.credentials.accessToken = newAccessToken;
    doc.expiresAt = new Date(Date.now() + expiresIn * 1000);
    doc.refreshedAt = new Date();
    await doc.save();

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("LinkedIn refresh error:", err.response?.data || err.message);
    res.status(500).send("LinkedIn refresh failed");
  }
});

router.get("/auth/linkedin/token", verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const doc = await PlatformAuth.findOne({ userId, platform: "linkedin" });
    if (!doc) return res.status(404).json({ error: "LinkedIn not connected" });

    // if token expired, refresh it
    if (doc.expiresAt && doc.expiresAt < new Date()) {
      // ideally call your refresh endpoint here
    }

    res.json({ accessToken: doc.credentials.accessToken });
  } catch (err) {
    console.error("LinkedIn token fetch error:", err);
    res.status(500).json({ error: "Failed to fetch token" });
  }
});
module.exports = router;
