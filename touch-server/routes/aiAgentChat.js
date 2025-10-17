const express = require("express");
const router = express.Router();
const axios = require("axios");
const Contact = require("../models/Contacts");
const { verifyToken } = require("./auth");

router.post("/api/chat", verifyToken, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;

  try {
    // 🔹 Fetch this user's CRM contacts
    const userCrmData = await Contact.find({ userId }).lean();

    const payload = {
      chatInput: message,
      crmDataUrl: userCrmData, // pass CRM data directly to n8n
    };

    // 🔹 Call your n8n AI webhook
    const response = await axios.post(
      "https://touch.app.n8n.cloud/webhook/chat-handler",
      { payload }
    );

    let clean = response.data.output || "";

    // Remove markdown fences and trim whitespace
    clean = clean.replace(/```json/i, "").replace(/```/g, "").trim();

    // Try to parse the AI response
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error("❌ Failed to parse AI reply:", clean);
    }

    // ✅ Handle structured actions
    if (parsed?.action === "send_message") {
      const token = req.headers.authorization?.split(" ")[1];

      // build the body based on the AI's response
      const sendBody = {
        type: parsed.type,
        message: parsed.message,
      };

      if (parsed.sendToAll) {
        sendBody.sendToAll = true;
      } else if (Array.isArray(parsed.names)) {
        sendBody.names = parsed.names;
      } else if (parsed.name) {
        sendBody.name = parsed.name;
      } else {
        return res
          .status(400)
          .json({ error: "Invalid AI response: no recipient info." });
      }

      // 🔹 Send message request to your own backend route
      const sendRes = await axios.post(
        "https://touch-six.vercel.app/send-message",
        sendBody,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return res.json({
        reply: `✅ ${parsed.type.toUpperCase()} action processed.`,
        details: sendRes.data,
      });
    }

    // 🗣️ Otherwise, normal chat (non-message AI responses)
    res.json({ reply: clean });
  } catch (err) {
    console.error("❌ n8n error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chat failed" });
  }
});

module.exports = router;
