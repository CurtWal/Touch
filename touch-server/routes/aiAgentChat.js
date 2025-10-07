const express = require("express");
const router = express.Router();
const axios = require("axios");

router.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  const payload = {
    chatInput: message,
    crmDataUrl: "https://touch-six.vercel.app/crm-data", // n8n can fetch it
  };

  try {
    const response = await axios.post(
      "https://touch.app.n8n.cloud/webhook-test/chat-handler",
      { payload }
    );
    console.log("n8n response:", response.data.output);
    res.json({ reply: response.data.output });
  } catch (err) {
    console.error("n8n error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chat failed" });
  }
});

module.exports = router;
