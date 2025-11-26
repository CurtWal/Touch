const express = require("express");
const router = express.Router();
require("dotenv").config();
const axios = require("axios");
const Contact = require("../models/Contacts");
const { verifyToken } = require("./auth");
const User = require("../models/User");
const { agenda } = require("../jobs/agendaScheduler"); // reuse shared agenda instance
const jwt = require("jsonwebtoken");

// guard against redefining the job if this module is loaded multiple times
if (!agenda._definitions || !agenda._definitions["random_follow_up"]) {
  agenda.define("random_follow_up", async (job) => {
    const { userId } = job.attrs.data;
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Stop if switch is OFF
      if (!user.auto_follow_up_enabled) return;

      // Stop after 10 days
      const start = user.auto_follow_up_start_date;
      if (start && Date.now() - start.getTime() > 10 * 24 * 60 * 60 * 1000) {
        user.auto_follow_up_enabled = false;
        await user.save();
        console.log("⛔ Auto follow-ups ended after 10 days.");
        return;
      }

      const now = new Date();
      const day = now.getDay(); // 0 Sunday, 6 Saturday
      if (day === 0 || day === 6) {
        console.log("📆 Weekend detected — no messages sent today.");
        return;
      }

      const contacts = await Contact.find({
        userId,
        $or: [
          { last_followup_sent: { $exists: false } },
          { last_followup_sent: null },
        ],
      });

      if (!contacts.length) {
        console.log(
          "✅ All contacts followed up — cancelling automation for user",
          userId
        );
        // await agenda.cancel({
        //   name: "random_follow_up",
        //   "data.userId": userId,
        // });
        return;
      }

      const pickCount = Math.ceil(
        contacts.length * (0.1 + Math.random() * 0.15)
      );
      const selected = contacts
        .sort(() => Math.random() - 0.5)
        .slice(0, pickCount);

      const MIN_DELAY_MS = 0;
      const MAX_DELAY_MS = 0; // 6 minutes
      const randomDelay = () =>
        MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);

      for (const contact of selected) {
        try {
          if (!contact.sms_opt_in && !contact.email_opt_in) continue;

          const hour = new Date().getHours();
          const quiet_hours_start = user.quiet_hours_start ?? 18;
          const quiet_hours_end = user.quiet_hours_end ?? 8;
          if (hour >= quiet_hours_start || hour < quiet_hours_end) continue;

          let channel;
          if (contact.sms_opt_in && contact.email_opt_in) {
            channel = Math.random() < 0.5 ? "sms" : "email";
          } else if (contact.sms_opt_in) {
            channel = "sms";
          } else if (contact.email_opt_in) {
            channel = "email";
          }  else {
            // not opted in to anything => skip
            console.warn("Contact not opted in for sms or email, skipping:", String(contact._id));
            continue;
          }
          const contactToken = jwt.sign(
            { contactId: String(contact._id) },
            process.env.SERVER_JWT_SECRET || process.env.JWT_SECRET,
            { expiresIn: "5m" }
          );
          const crmUrl = `http://localhost:3000/api/contacts/${
            contact._id
          }?token=${encodeURIComponent(contactToken)}`;

          // create short-lived server token for internal /send-message call (correct arg order)
          const serverToken = jwt.sign(
            { service: "autoFollowUp", userId: String(userId) },
            process.env.SERVER_JWT_SECRET || process.env.JWT_SECRET,
            { expiresIn: "5m" }
          );

          const aiResponse = await axios.post(
            "http://localhost:5678/webhook-test/chat-handler",
            {
              payload: {
                chatInput: `Write a friendly, personal follow up message to ${contact.first_name}. Use their notes: "${contact.notes}".`,
                crmDataUrl: crmUrl,
              },
            }
          );

          // robust extractor: handle object, JSON embedded in text, or plain text
          function extractAiOutput(output) {
            if (!output) return { message: "" };
            if (typeof output === "object") {
              const msg = output.message ? String(output.message) : JSON.stringify(output);
              return { parsed: output, message: msg, type: output.type };
            }
            const s = String(output).replace(/```(?:json)?/gi, "").trim();
            const jsonMatch = s.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const obj = JSON.parse(jsonMatch[0]);
                const msg = obj.message ? String(obj.message) : JSON.stringify(obj);
                return { parsed: obj, message: msg, type: obj.type };
              } catch (e) {
                // fall through to plain text
              }
            }
            return { message: s };
          }

          const rawOutput = aiResponse.data.output ?? aiResponse.data ?? "";
          const extracted = extractAiOutput(rawOutput);
          const message = (extracted.message || "").trim();

          if (extracted.parsed) {
            console.log("AI returned parsed object, using parsed.message and type:", {
              contactId: String(contact._id),
              parsed: extracted.parsed,
            });
          }

          if (!message) {
            console.warn("AI produced empty message for contact", String(contact._id));
            continue;
          }
         let requestedType = (extracted.parsed?.type || extracted.type || "").toString().toLowerCase() || null;
          // normalize requestedType to either 'email' or 'sms'
          if (requestedType !== "email" && requestedType !== "sms") requestedType = null;

          // re-fetch contact to ensure it still exists and use that doc for updates
          const targetContact = await Contact.findById(contact._id);
          if (!targetContact) {
            console.warn("Skipping send — contact not found (may have been deleted):", String(contact._id));
            continue;
          }

          // ensure requestedType is usable for this contact, otherwise discard it
          if (requestedType === "email") {
            if (!targetContact.email || !contact.email_opt_in) {
              console.warn("Requested EMAIL but contact missing email or not opted in — falling back", String(contact._id));
              requestedType = null;
            }
          } else if (requestedType === "sms") {
            if (!targetContact.phone || !contact.sms_opt_in) {
              console.warn("Requested SMS but contact missing phone or not opted in — falling back", String(contact._id));
              requestedType = null;
            }
          }

          // final sendType: prefer validated AI request, otherwise the chosen channel
          const sendType = requestedType || channel;

          // extra safety: if chosen sendType still not deliverable, skip and warn
          if (sendType === "email" && (!targetContact.email || !contact.email_opt_in)) {
            console.warn("No valid email for contact, skipping:", String(contact._id));
            continue;
          }
          if (sendType === "sms" && (!targetContact.phone || !contact.sms_opt_in)) {
            console.warn("No valid phone for contact, skipping:", String(contact._id));
            continue;
          }

          // send (single contact)
          await axios.post(
            "http://localhost:3000/send-message",
            {
              type: sendType,
              message,
              contactId: String(targetContact._id),
            },
            { headers: { Authorization: `Bearer ${serverToken}` } }
          );

          // update last_followup_sent on the fetched doc
          targetContact.last_followup_sent = new Date();
          await targetContact.save();

          const wait = Math.max(0, randomDelay());
          if (wait > 0) {
            console.log(`⏳ Waiting ${(wait / 60000).toFixed(1)} minutes before next send...`);
            await new Promise((r) => setTimeout(r, wait));
          } else {
            await new Promise((r) => setImmediate(r));
          }
        } catch (err) {
          console.error("⚠️ Error sending to", contact._id, err.message || err);
        }
      }
    } catch (err) {
      console.error("Error in random_follow_up job:", err);
      throw err;
    }
  });
}

// Toggle endpoint saves user flag
router.post("/api/followups/toggle", verifyToken, async (req, res) => {
  try {
    console.log(
      "/api/followups/toggle called - auth header:",
      req.headers.authorization
    );
    console.log("verifyToken set req.user:", req.user);
    const userId = req.user?.id;
    if (!userId) {
      console.warn("Unauthorized: req.user missing after verifyToken");
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { enabled } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.auto_follow_up_enabled = enabled;
    if (enabled) user.auto_follow_up_start_date = new Date();
    await user.save();

    return res.json({ success: true, enabled });
  } catch (err) {
    console.error("Error in followups/toggle:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Start/cancel scheduling using the shared agenda
router.post("/api/auto-follow-up", verifyToken, async (req, res) => {
  const { enabled } = req.body;
  const userId = req.user.id;

  if (enabled) {
    // create a unique repeating job (once per day) for this user
    try {
    //   await agenda.every(
    //     "24 hours",
    //     "random_follow_up",
    //     { userId },
    //     { unique: { "data.userId": String(userId) } }
    //   );
      await agenda.every(
        "1 minute", // <-- test interval
        "random_follow_up",
        { userId },
        { unique: { "data.userId": String(userId) } }
      );
      return res.json({
        success: true,
        message: "✅ Random 10-Day Follow-Up Scheduled",
      });
    } catch (err) {
      console.error("Failed to schedule follow ups:", err);
      return res.status(500).json({ error: "Failed to schedule follow ups" });
    }
  } else {
    try {
      await agenda.cancel({ name: "random_follow_up", "data.userId": userId });
      return res.json({
        success: true,
        message: "🛑 Follow-Up Automation Disabled",
      });
    } catch (err) {
      console.error("Failed to cancel follow ups:", err);
      return res.status(500).json({ error: "Failed to cancel follow ups" });
    }
  }
});

module.exports = router;
