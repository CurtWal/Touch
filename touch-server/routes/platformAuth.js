const express = require("express");
const router = express.Router();
const axios = require("axios");
const PlatformAuth = require("../models/PlatformAuthSchema");
const { verifyToken } = require("./auth");

// get all platform auths for user
router.get("/api/platforms", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const auths = await PlatformAuth.find({ userId }).lean();
    res.json(auths);
  } catch (err) {
    console.error("GET /api/platforms error:", err);
    res.status(500).json({ error: "Failed to fetch platform auths" });
  }
});

// get single platform auth
router.get("/api/platforms/:platform", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;
    const auth = await PlatformAuth.findOne({ userId, platform }).lean();
    if (!auth) return res.status(404).json({ error: "Not found" });
    res.json(auth);
  } catch (err) {
    console.error("GET /api/platforms/:platform error:", err);
    res.status(500).json({ error: "Failed to fetch platform auth" });
  }
});

// upsert platform credentials (body: { platform, credentials, expiresAt?, notes? })
router.post("/api/platforms", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, credentials, expiresAt, notes } = req.body;
    if (!platform || !credentials) return res.status(400).json({ error: "Missing platform or credentials" });

    // upsert
    const doc = await PlatformAuth.findOneAndUpdate(
      { userId, platform },
      {
        $set: {
          credentials,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          refreshedAt: new Date(),
          notes: notes || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, doc });
  } catch (err) {
    console.error("POST /api/platforms error:", err);
    res.status(500).json({ error: "Failed to save platform credentials" });
  }
});

// delete platform credentials
router.delete("/api/platforms/:platform", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform } = req.params;
    await PlatformAuth.deleteOne({ userId, platform });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/platforms/:platform error:", err);
    res.status(500).json({ error: "Failed to delete platform auth" });
  }
});

// Build LinkedIn authorize URL (returns URL so frontend or n8n can redirect)
router.get("/api/platforms/linkedin/connect", (req, res) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI);
  // requested scopes
  const scope = encodeURIComponent("r_liteprofile r_emailaddress w_member_social");
  const state = "connect_" + Math.random().toString(36).slice(2, 9); // optional CSRF token
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  return res.json({ url });
});

// OAuth callback: exchange code -> access token, call /me, save PlatformAuth
router.get("/api/platforms/linkedin/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");

    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;
    const expiresIn = tokenRes.data.expires_in;

    // fetch member id
    const meRes = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const linkedinUserId = meRes.data?.id;
    console.log("LinkedIn /me response:", meRes.data);
    if (!linkedinUserId) {
      return res.status(400).json({ error: "Failed to obtain LinkedIn user id" });
    }

    // Upsert PlatformAuth record -- associate with currently logged-in user if you pass userId in state/query
    // For now expect frontend to pass ?userId=... to identify owner
    const userId = req.query.userId;
    if (!userId) {
      // In production you should validate the user session; this is simplified for testing
      return res.status(400).json({ error: "Missing userId in callback" });
    }

    await PlatformAuth.findOneAndUpdate(
      { userId, platform: "linkedin" },
      {
        $set: {
          credentials: {
            accessToken,
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
            linkedinUserId,
          },
          refreshedAt: new Date(),
        },
        $setOnInsert: { userId, platform: "linkedin" },
      },
      { upsert: true, new: true }
    );

    // respond with success (redirect to frontend in production)
    return res.send("LinkedIn connected. You can close this window.");
  } catch (err) {
    console.error("LinkedIn callback error:", err.response?.data || err.message);
    return res.status(500).json({ error: "LinkedIn connect failed", details: err.response?.data || err.message });
  }
});

module.exports = router;
