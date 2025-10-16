const express = require("express");
const router = express.Router();
const axios = require("axios");
const Contact = require("../models/Contacts");
const { verifyToken } = require("./auth");

router.post("/api/chat", verifyToken, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;
      // ✅ fetch this user's CRM contacts from MongoDB
    const userCrmData = await Contact.find({ userId }).lean();

  const payload = {
    chatInput: message,
    crmDataUrl: userCrmData, // pass CRM data directly
  };

  try {
    const response = await axios.post(
      "https://touch.app.n8n.cloud/webhook-test/chat-handler",
      { payload }
    );

    const reply = response.data.output;
    let clean = reply;

    // Remove markdown fences and trim whitespace
    clean = clean
      .replace(/```json/i, "")
      .replace(/```/g, "")
      .trim();
    // Try to parse JSON output from AI
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error("❌ Failed to parse AI reply:", clean);
    }

    if (parsed?.action === "send_message") {
      const sendRes = await axios.post(
        "https://touch-six.vercel.app/send-message",
        {
          type: parsed.type,
          name: parsed.name,
          message: parsed.message,
        }
      );

      return res.json({
        reply: `✅ ${parsed.type.toUpperCase()} sent to ${parsed.name}!`,
        details: sendRes.data,
      });
    }

    // Otherwise normal chat
    res.json({ reply });
  } catch (err) {
    console.error("n8n error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chat failed" });
  }
});

module.exports = router;
