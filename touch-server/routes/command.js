const express = require("express");
const router = express.Router();
const axios = require("axios");
const Contact = require("../models/Contacts");
const { verifyToken } = require("./auth");
const { agenda } = require("../jobs/agendaScheduler"); // use existing agenda instance

// move the processing logic into a reusable function
async function processCommand(command, userId, token) {
  // load contacts
  const userCrmData = await Contact.find({ userId }).lean();

  // send command + data to AI (n8n)
  const payload = { chatInput: command, crmDataUrl: userCrmData };

  const response = await axios.post(
    "http://localhost:5678/webhook-test/chat-handler",
    { payload },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  let clean = response.data.output || "";
  clean = clean
    .replace(/```json/i, "")
    .replace(/```/g, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
    //console.log("🧠 Parsed AI reply:", parsed);
  } catch (e) {
    console.error("❌ Failed to parse AI reply:", clean);

    throw new Error("Invalid AI response");
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [parsed];

  for (const actionObj of actions) {
    if (actionObj.action === "send_message") {
      const tokenHeader = token;

      const contactsToSend = Array.isArray(actionObj.contacts)
        ? actionObj.contacts
        : actionObj.name
        ? [
            {
              name: actionObj.name,
              message: actionObj.message,
              type: actionObj.type,
            },
          ]
        : [];

      if (!contactsToSend.length) {
        console.warn("⚠️ No contacts found to send.");
        continue;
      }

      for (const c of contactsToSend) {
        const messageType = c.type || actionObj.type || "email";
        const sendBody = {
          type: messageType,
          name: c.name,
          message: c.message,
        };

        //console.log(`📤 Sending ${messageType.toUpperCase()} to ${c.name}`);

        try {
          await axios.post("http://localhost:3000/send-message", sendBody, {
            headers: { Authorization: `Bearer ${tokenHeader}` },
          });
        } catch (err) {
          console.error(`❌ Failed to send to ${c.name}:`, err.message);
        }
      }
    }
  }

  return { success: true, reply: "✅ All actions processed." };
}

// define a background job on the shared Agenda instance (idempotent: guard re-definition)
try {
  agenda.define("process command", async (job) => {
    const { command, userId, token } = job.attrs.data;
    //console.log("⚙️ Running process command job:", { command, userId });
    try {
      await processCommand(command, userId, token);
      //console.log("✅ processCommand finished successfully");
    } catch (err) {
      console.error("Agenda job process command failed:", err.message || err);
      // optionally persist a job error record / notify user
    }
  });
} catch (e) {
  // ignore if already defined
  console.error(
    "Agenda job 'process command' already defined, skipping re-definition."
  );
}

/* Route: accepts command, responds immediately, schedules background work */
router.post("/api/command", verifyToken, async (req, res) => {
  const { command } = req.body;
  const userId = req.user.id;
  const token = req.headers.authorization?.split(" ")[1];

  if (!command) return res.status(400).json({ error: "Missing command" });

  // immediate response
  res.json({
    reply: "✅ Message automation started. You can close this page.",
  });

  // schedule background job via Agenda; fallback to setImmediate if Agenda fails
  try {
    await agenda.now("process command", { command, userId, token });
  } catch (err) {
    console.warn(
      "Agenda scheduling failed, falling back to immediate background processing:",
      err.message || err
    );
    setImmediate(async () => {
      try {
        await processCommand(command, userId, token);
      } catch (err2) {
        console.error("Background fallback failed:", err2.message || err2);
      }
    });
  }
});

module.exports = router;
