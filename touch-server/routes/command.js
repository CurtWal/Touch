const express = require("express");
const router = express.Router();
const axios = require("axios");
const Contact = require("../models/Contacts");
const User = require("../models/User");
const { verifyToken } = require("./auth");
const { agenda } = require("../jobs/agendaScheduler"); // use existing agenda instance

// Generates actions by calling the AI (n8n) and returns parsed actions + user info
async function generateActions(command, userId, token) {
  const userCrmData = await Contact.find({ userId }).lean();
  const user = await User.findById(userId);

  const payload = { chatInput: command, crmDataUrl: userCrmData };
  const response = await axios.post(
    `${process.env.N8N_WEBHOOK_URL}`,
    { payload },
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  let clean = response.data.output || "";
  clean = clean.replace(/```json/i, "").replace(/```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error("❌ Failed to parse AI reply:", clean);
    throw new Error("Invalid AI response");
  }

  const actions = Array.isArray(parsed.actions) ? parsed.actions : [parsed];
  return { actions, user };
}

// Executes actions (sends messages). Used by background job and execute route.
async function executeActions(actions, user, token) {
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
        let messageWithSignature = c.message;
        if (user) {
          const userInfo =
            messageType.toLowerCase() === "sms" || messageType.toLowerCase() === "text"
              ? user.phone
              : user.email;
          if (userInfo) {
            messageWithSignature = `${c.message}\n\nSent from: ${user.name} (${userInfo})`;
          }
        }

        const sendBody = {
          type: messageType,
          name: c.name,
          message: messageWithSignature,
        };

        try {
          await axios.post(`${process.env.VITE_API_URL}/send-message`, sendBody, {
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
      const { actions, user } = await generateActions(command, userId, token);
      await executeActions(actions, user, token);
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
        const { actions, user } = await generateActions(command, userId, token);
        await executeActions(actions, user, token);
      } catch (err2) {
        console.error("Background fallback failed:", err2.message || err2);
      }
    });
  }
});

/* Route: generate preview of actions/messages but do NOT send */
router.post("/api/command/preview", verifyToken, async (req, res) => {
  const { command } = req.body;
  const userId = req.user.id;
  const token = req.headers.authorization?.split(" ")[1];

  if (!command) return res.status(400).json({ error: "Missing command" });

  try {
    const { actions } = await generateActions(command, userId, token);
    return res.json({ actions });
  } catch (err) {
    console.error("Preview generation failed:", err.message || err);
    return res.status(500).json({ error: "Failed to generate preview", details: err.message });
  }
});

/* Route: execute previously previewed/edited actions (sends messages) */
router.post("/api/command/execute", verifyToken, async (req, res) => {
  const { actions } = req.body;
  const userId = req.user.id;
  const token = req.headers.authorization?.split(" ")[1];

  if (!actions || !Array.isArray(actions)) return res.status(400).json({ error: "Missing actions array" });

  // respond immediately and run send in background to avoid client timeout
  res.json({ reply: "✅ Sending started. Messages will be delivered shortly." });

  setImmediate(async () => {
    try {
      const user = await User.findById(userId);
      await executeActions(actions, user, token);
    } catch (err) {
      console.error("Execute actions failed:", err.message || err);
    }
  });
});

module.exports = router;
