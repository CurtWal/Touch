const express = require("express");
const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const mongoose = require("mongoose");
const postRoutes = require("./routes/post");
const aiAgentChatRoutes = require("./routes/aiAgentChat");
const formData = require("form-data");
const Mailgun = require("mailgun.js");
const twilio = require("twilio");
const Contact = require("./models/Contacts");
const { verifyToken } = require("./routes/auth");
const Auth = require("./routes/auth");
const Command = require("./routes/command");
const userSettingsRoute = require("./routes/user");
const autoFollowUpRoute = require("./routes/autoFollowUp");
const ContactsInfo = require("./routes/contacts");
const platformAuthRoutes = require("./routes/platformAuth");
const OAuthRoutes = require("./routes/oAuth");
const jwt = require("jsonwebtoken");
const {router: n8nPostScheduleRoutes} = require("./routes/n8nPostSchedule");
const multer = require("multer");

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: "api", key: process.env.MAILGUN_KEY });

// import agenda (if using agenda for scheduling)
const { agenda } = require("./jobs/agendaScheduler");
require("dotenv").config();

// Normalize various time representations into HH:MM (24-hour) string
function normalizeTime(value) {
  if (value == null) return "";
  let s = String(value).trim();
  if (s === "") return "";

  s = s.replace(/^"|"$/g, "");

  // hh:mm or h.mm patterns
  const timeRegex = /^(\d{1,2})(?::|\.)(\d{1,2})(?:\s*(am|pm))?$/i;
  const tm = s.match(timeRegex);
  if (tm) {
    let hh = parseInt(tm[1], 10);
    let mm = parseInt(tm[2], 10);
    const ampm = tm[3];
    if (ampm) {
      if (/pm/i.test(ampm) && hh < 12) hh += 12;
      if (/am/i.test(ampm) && hh === 12) hh = 0;
    }
    hh = Math.max(0, Math.min(23, hh));
    mm = Math.max(0, Math.min(59, mm));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // plain numeric values
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    const num = Number(s);
    let totalMinutes = 0;
    if (num >= 0 && num <= 1) {
      // Excel fractional day (e.g. 0.5 -> 12:00)
      totalMinutes = Math.round(num * 24 * 60);
    } else if (num > 1 && num < 24) {
      // hours expressed as decimal (e.g. 8.5 -> 08:30)
      const hours = Math.floor(num);
      const minutes = Math.round((num - hours) * 60);
      totalMinutes = hours * 60 + minutes;
    } else {
      // Excel serial numbers with date component: use fractional day
      const frac = num - Math.floor(num);
      totalMinutes = Math.round(frac * 24 * 60);
    }
    totalMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // formats like '9 am' or '9pm'
  const ampmRegex = /^(\d{1,2})\s*(am|pm)$/i;
  const m2 = s.match(ampmRegex);
  if (m2) {
    let hh = parseInt(m2[1], 10);
    const ampm = m2[2];
    if (/pm/i.test(ampm) && hh < 12) hh += 12;
    if (/am/i.test(ampm) && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:00`;
  }

  return s;
}
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      process.env.FRONTEND_URL
    ],
    credentials: true,
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  })
);
app.use(express.json());
app.use(fileUpload());
app.use(userSettingsRoute);

// ensure uploads dir exists and serve it
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.warn("⚠️ Could not create uploads directory:", err.message);
  }
}
app.use("/uploads", express.static(uploadsDir));

// Simple file upload endpoint used for attaching images to messages
app.post("/upload", verifyToken, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const savePath = path.join(uploadsDir, safeName);

    await file.mv(savePath);

    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${safeName}`;
    return res.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("Error saving upload:", err);
    return res.status(500).json({ error: "Failed to save file" });
  }
});

// ensure uploads dir exists (use /tmp on Vercel, local dir locally)
// const uploadsDir = process.env.VERCEL 
//   ? path.join("/tmp", "uploads")
//   : path.join(__dirname, "uploads");
  
// if (!fs.existsSync(uploadsDir)) {
//   try {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//   } catch (err) {
//     console.warn("⚠️ Could not create uploads directory:", err.message);
//   }
// }

// // serve uploads
// app.use("/uploads", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.send("Welcome to the Touch Server!");
});

let uploadedCRMData = [];

app.post("/crm-upload", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id; // ⚠️ include userId in your request
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    if (!req.files || !req.files.file) {
      return res.status(400).send("No file uploaded");
    }

    const file = req.files.file;
    const workBook = xlsx.read(file.data, { type: "buffer" });
    const sheetName = workBook.SheetNames[0];
    const sheet = workBook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(sheet);

    const REQUIRED_FIELDS = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "company",
      "city",
      "state",
      "country",
      "timezone",
    ];

    const OPTIONAL_FIELDS = [
      "linkedin_url",
      "instagram_handle",
      "facebook_url",
      "tiktok_handle",
      "sms_opt_in",
      "email_opt_in",
      "messaging_opt_in",
      "quiet_hours_start",
      "quiet_hours_end",
      "tags",
      "notes",
    ];

    const allColumns = Object.keys(data[0] || {});
    const missingRequired = REQUIRED_FIELDS.filter(
      (field) => !allColumns.includes(field)
    );

    if (missingRequired.length > 0) {
      return res.status(400).json({
        error: `Invalid file: missing required columns: ${missingRequired.join(
          ", "
        )}`,
      });
    }

    data = data.map((row) => {
      OPTIONAL_FIELDS.forEach((f) => {
        if (!(f in row)) row[f] = "";
      });
      return row;
    });

    let errors = [];
    data = data.map((row, idx) => {
      const newRow = {};
      for (const key in row) {
        newRow[key] = row[key] == null ? "" : String(row[key]);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!newRow.email || !emailRegex.test(newRow.email.trim())) {
        errors.push(
          `Row ${idx + 2}: Invalid or missing email "${newRow.email}"`
        );
      }

      const phoneRegex = /^\+?[0-9\s\-().]{7,}$/;
      const phoneValue = newRow.phone ? newRow.phone.trim() : "";
      if (!phoneValue || !phoneRegex.test(phoneValue)) {
        errors.push(
          `Row ${idx + 2}: Invalid or missing phone "${newRow.phone || ""}"`
        );
      }

      const normalizeUrl = (url, prefix) => {
        if (!url) return "";
        let u = url.trim();
        if (!/^https?:\/\//i.test(u) && u) {
          u = prefix + u.replace(/^\/+/, "");
        }
        return u;
      };
      newRow.linkedin_url = normalizeUrl(
        newRow.linkedin_url,
        "https://linkedin.com/in/"
      );
      newRow.facebook_url = normalizeUrl(
        newRow.facebook_url,
        "https://facebook.com/"
      );
      newRow.tiktok_handle = normalizeUrl(
        newRow.tiktok_handle,
        "https://tiktok.com/@"
      );
      newRow.instagram_handle = normalizeUrl(
        newRow.instagram_handle,
        "https://instagram.com/"
      );

      // Normalize quiet hours to HH:MM strings
      if (newRow.quiet_hours_start) {
        newRow.quiet_hours_start = normalizeTime(newRow.quiet_hours_start);
      }
      if (newRow.quiet_hours_end) {
        newRow.quiet_hours_end = normalizeTime(newRow.quiet_hours_end);
      }

      REQUIRED_FIELDS.forEach((field) => {
        if (!newRow[field] || newRow[field].trim() === "") {
          errors.push(`Row ${idx + 2}: Missing value for "${field}"`);
        }
      });

      return newRow;
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
    const seen = new Set();
    data = data.filter((row) => {
      const key = ALL_FIELDS.map((f) =>
        String(row[f] || "")
          .toLowerCase()
          .trim()
      ).join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ✅ Add userId to each row before saving
    const contactsToInsert = data.map((row) => ({
      userId,
      ...row,
    }));

    // ✅ Save all to MongoDB
    await Contact.insertMany(contactsToInsert);

    console.log(`✅ Uploaded ${data.length} valid contacts for user ${userId}`);
    res.json({ success: true, count: data.length });
  } catch (error) {
    console.error("❌ Error uploading file:", error);
    res.status(500).send("Error uploading file");
  }
});

app.get("/crm/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const contacts = await Contact.find({ userId });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ message: "Error fetching CRM data" });
  }
});
app.post("/crm-add", verifyToken, async (req, res) => {
  try {
    const { userId, contacts } = req.body;
    if (!userId || !contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "Missing userId or contacts" });
    }
    // Remove _unsaved flag before saving
    const contactsToInsert = contacts.map(({ _unsaved, ...row }) => {
      // normalize quiet hours
      if (row.quiet_hours_start) row.quiet_hours_start = normalizeTime(row.quiet_hours_start);
      if (row.quiet_hours_end) row.quiet_hours_end = normalizeTime(row.quiet_hours_end);
      return {
        userId,
        ...row,
      };
    });
    await Contact.insertMany(contactsToInsert);
    res.json({ success: true, count: contactsToInsert.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to add contacts" });
  }
});
app.delete("/crm", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Contact.deleteMany({ userId });
    return res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting CRM contacts:", err);
    return res.status(500).json({ error: "Failed to delete contacts" });
  }
});

// Delete a single contact by contact _id (only if it belongs to the authenticated user)
app.delete("/crm/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;
    const deleted = await Contact.findOneAndDelete({ _id: contactId, userId });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting contact:", err);
    return res.status(500).json({ error: "Failed to delete contact" });
  }
});

// Update a single contact (only if it belongs to the authenticated user)
app.patch("/crm/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;
    const update = req.body || {};

    // Normalize quiet hours if present
    if (Object.prototype.hasOwnProperty.call(update, "quiet_hours_start")) {
      update.quiet_hours_start = normalizeTime(update.quiet_hours_start);
    }
    if (Object.prototype.hasOwnProperty.call(update, "quiet_hours_end")) {
      update.quiet_hours_end = normalizeTime(update.quiet_hours_end);
    }

    const updated = await Contact.findOneAndUpdate(
      { _id: contactId, userId },
      { $set: update },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Contact not found" });
    return res.json({ success: true, contact: updated });
  } catch (err) {
    console.error("Error updating contact:", err);
    return res.status(500).json({ error: "Failed to update contact" });
  }
});

// ---------------- SEND MESSAGE ROUTE ----------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/send-message", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No auth token" });

    let isService = false;
    let verifiedUserId = null;

    // Try verify as service token first
    try {
      const svcPayload = jwt.verify(token, process.env.SERVER_JWT_SECRET || process.env.JWT_SECRET);
      if (svcPayload && svcPayload.service === "autoFollowUp") {
        isService = true;
        verifiedUserId = svcPayload.userId || svcPayload.id || null;
      }
    } catch (e) {
      // not a service token, fall through
    }

    // If not a service token, verify as user JWT
    if (!isService) {
      try {
        const userPayload = jwt.verify(token, process.env.JWT_SECRET);
        verifiedUserId = userPayload.id || userPayload.userId || userPayload._id;
        if (!verifiedUserId) return res.status(403).json({ error: "Invalid user token" });
      } catch (err) {
        return res.status(403).json({ error: "Invalid token" });
      }
    }

    // use verifiedUserId (may be null for some service flows)
    const { type, name, names, message, sendToAll, contactId, mediaUrl } = req.body;
    const userId = verifiedUserId;
    console.log("/send-message called", { isService, verifiedUserId, type, contactId, sendToAll, names });


    if (!type || !message) {
      return res.status(400).json({ error: "Missing required fields: type or message" });
    }

    // If service token + contactId -> single send to that contact (no userId required)
    if (isService && contactId) {
      const contact = await Contact.findById(contactId);
      if (!contact) {
        console.warn("/send-message: contact not found for id:", contactId);
        return res.status(404).json({ error: "Contact not found" });
      }
      
      await sendSingleMessage(contact, type, message, mediaUrl);
      return res.json({ success: true, message: `✅ ${type.toUpperCase()} sent to ${contact.email || contact.phone}` });
    }

    // If sendToAll (requires user context)
    if (sendToAll) {
      if (!userId) return res.status(403).json({ error: "sendToAll requires authenticated user" });
      const contacts = await Contact.find({ userId });
      return await sendBatchMessages(contacts, type, message, res, mediaUrl);
    }

    // If names array provided (requires user context)
    if (Array.isArray(names) && names.length > 0) {
      if (!userId) return res.status(403).json({ error: "names list requires authenticated user" });
      const contacts = await Contact.find({
        userId,
        $or: names.map((n) => ({
          $or: [
            { first_name: new RegExp(`^${n}$`, "i") },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$first_name", " ", "$last_name"] },
                  regex: `^${n}$`,
                  options: "i",
                },
              },
            },
          ],
        })),
      });

      if (!contacts.length) return res.status(404).json({ error: "No matching contacts found." });
      return await sendBatchMessages(contacts, type, message, res, mediaUrl);
    }

    // Single-name fallback (requires user context)
    if (!name) return res.status(400).json({ error: "Missing contact name or names list." });

    const contact = await Contact.findOne({
      userId,
      $or: [
        { first_name: new RegExp(`^${name}$`, "i") },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$first_name", " ", "$last_name"] },
              regex: `^${name}$`,
              options: "i",
            },
          },
        },
      ],
    });

    if (!contact) return res.status(404).json({ error: `No contact found for ${name}` });

    await sendSingleMessage(contact, type, message, mediaUrl);
    return res.json({ success: true, message: `✅ ${type.toUpperCase()} sent to ${contact.email || contact.phone}` });
  } catch (error) {
    console.error("❌ Error sending message:", error);
    return res.status(500).json({ error: "Failed to send message", details: error.message });
  }
});

async function sendSingleMessage(contact, type, message) {
  // allow optional mediaUrl passed either on contact or as property
  const mediaUrl = contact && (contact.mediaUrl || contact.attachmentUrl || contact.media || contact.mediaurl);
  if (type === "email" && contact.email) {
    const domain = process.env.MAILGUN_DOMAIN || "motgpayment.com";
    const html = mediaUrl
      ? `<p>${(message || "").replace(/\n/g, "<br/>")}</p><p><img src="${mediaUrl}" style="max-width:600px;"/></p>`
      : undefined;

    const payload = {
      from: process.env.EMAIL_USER,
      to: [contact.email],
      subject: "Message from Touch App",
      text: message,
    };
    if (html) payload.html = html;

    await mg.messages.create(domain, payload);
    console.log(`✅ Email sent to ${contact.email}`);
  } else if (type === "sms" && contact.phone) {
    const opts = {
      body: message,
      from: process.env.TWILIO_NUMBER,
      to: contact.phone,
    };
    if (mediaUrl) opts.mediaUrl = [mediaUrl];
    await twilioClient.messages.create(opts);
    console.log(`✅ SMS sent to ${contact.phone}`);
  } else {
    throw new Error("Missing contact email or phone.");
  }
}

async function sendBatchMessages(contacts, type, message, res, mediaUrl) {
  const batchSize = 10;
  let sent = 0;
  const errors = [];

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (contact) => {
        try {
          await sendSingleMessage(contact, type, message, mediaUrl);
          sent++;
        } catch (err) {
          errors.push({
            contact: contact.email || contact.phone,
            error: err.message,
          });
        }
      })
    );

    // wait before next batch to avoid rate limits
    if (i + batchSize < contacts.length) {
      await sleep(5000);
    }
  }

  return res.json({
    success: true,
    sent,
    errors,
    message: `✅ ${type.toUpperCase()} sent to ${sent} contacts.`,
  });
}


app.use(autoFollowUpRoute);
app.use("/api/posts", postRoutes);
app.use(aiAgentChatRoutes);
app.use(Auth.router);
app.use(Command);
app.use(ContactsInfo);
app.use(platformAuthRoutes);
app.use(OAuthRoutes);
app.use( n8nPostScheduleRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to Mongoose"))
  .catch((err) => console.log("Error connecting to MongoDB:", err));

(async function () {
  await agenda.start();
})();

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});

// error handler (place after all routes)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "Upload error", message: err.message });
  }
  // busboy / parsing errors often arrive as generic Error
  if (err && err.message && err.message.includes("Unexpected end of form")) {
    return res.status(400).json({ error: "Malformed multipart request", message: err.message });
  }
  res.status(500).json({ error: err?.message || "Server error" });
});
