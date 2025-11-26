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
      "http://localhost:5678/webhook/chat-handler",
      { payload }
    );

    let clean = response.data.output || "";

    // 🔹 Remove markdown fences and trim whitespace
    clean = clean.replace(/```json/i, "").replace(/```/g, "").trim();

    // 🔹 Try to parse AI JSON
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error("❌ Failed to parse AI reply:", clean);
    }

    // ✅ Handle structured actions
    if (parsed?.action === "send_message") {
      const token = req.headers.authorization?.split(" ")[1];

      // 🧩 Support multiple types like ["email", "sms"]
      const sendTypes = Array.isArray(parsed.types)
        ? parsed.types
        : [parsed.type]; // fallback if single type

      // 🧩 Build recipient list
      let recipients = {};

      if (parsed.sendToAll) {
        recipients = { sendToAll: true };
      } else if (Array.isArray(parsed.names) && parsed.names.length > 0) {
        const validNames = parsed.names.filter((n) =>
          userCrmData.some(
            (c) =>
              `${c.first_name} ${c.last_name}`.toLowerCase() === n.toLowerCase()
          )
        );
        if (validNames.length === 0) {
          return res.status(400).json({ error: "No valid contact names found." });
        }
        recipients = { names: validNames };
      } else if (parsed.name) {
        const found = userCrmData.find(
          (c) =>
            `${c.first_name} ${c.last_name}`.toLowerCase() ===
            parsed.name.toLowerCase()
        );
        if (!found) {
          return res.status(400).json({ error: "Contact not found." });
        }
        recipients = { name: found.first_name + " " + found.last_name };
      } else {
        return res
          .status(400)
          .json({ error: "Invalid AI response: missing recipient info." });
      }

      // 🔹 Send for each message type
      const sendPromises = sendTypes.map(async (type) => {
        const sendBody = {
          type,
          message: parsed.message,
          ...recipients,
        };

        return axios.post(
          "http://localhost:3000/send-message",
          sendBody,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      });

      // Run all (email + sms) in parallel
      const results = await Promise.allSettled(sendPromises);

      const summary = results.map((r, i) => ({
        type: sendTypes[i],
        status: r.status,
        details: r.value?.data || r.reason?.message,
      }));

      return res.json({
        reply: `✅ Sent ${sendTypes.join(" & ")} successfully.`,
        summary,
      });
    }

    // 🗣️ Normal AI chat response (non-send action)
    res.json({ reply: clean });
  } catch (err) {
    console.error("❌ n8n error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chat failed" });
  }
});

module.exports = router;
