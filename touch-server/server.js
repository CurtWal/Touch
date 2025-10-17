const express = require("express");
const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
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

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: "api", key: process.env.MAILGUN_KEY });

// import agenda (if using agenda for scheduling)
const { agenda } = require("./jobs/agendaScheduler");
require("dotenv").config();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

app.get("/", (req, res) => {
  res.send("Hello World");
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
    const contactsToInsert = contacts.map(({ _unsaved, ...row }) => ({
      userId,
      ...row,
    }));
    await Contact.insertMany(contactsToInsert);
    res.json({ success: true, count: contactsToInsert.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to add contacts" });
  }
});


// ---------------- SEND MESSAGE ROUTE ----------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/send-message", verifyToken, async (req, res) => {
  try {
    const { type, name, names, message, sendToAll } = req.body;
    const userId = req.user.id;

    if (!type || !message) {
      return res.status(400).json({
        error: "Missing required fields: type or message",
      });
    }

    // 🔹 If user wants to send to all contacts
    if (sendToAll) {
      const contacts = await Contact.find({ userId });
      return await sendBatchMessages(contacts, type, message, res);
    }

    // 🔹 If user provides a list of names
    if (Array.isArray(names) && names.length > 0) {
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

      if (!contacts.length)
        return res.status(404).json({ error: "No matching contacts found." });

      return await sendBatchMessages(contacts, type, message, res);
    }

    // 🔹 Single name fallback
    if (!name)
      return res.status(400).json({ error: "Missing contact name or names list." });

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

    if (!contact)
      return res.status(404).json({ error: `No contact found for ${name}` });

    await sendSingleMessage(contact, type, message);
    return res.json({ success: true, message: `✅ ${type.toUpperCase()} sent to ${contact.email || contact.phone}` });
  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({ error: "Failed to send message", details: error.message });
  }
});

async function sendSingleMessage(contact, type, message) {
  if (type === "email" && contact.email) {
    await mg.messages.create("motgpayment.com", {
      from: process.env.EMAIL_USER,
      to: [contact.email],
      subject: "Message from Touch App",
      text: message,
    });
    console.log(`✅ Email sent to ${contact.email}`);
  } else if (type === "sms" && contact.phone) {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_NUMBER,
      to: contact.phone,
    });
    console.log(`✅ SMS sent to ${contact.phone}`);
  } else {
    throw new Error("Missing contact email or phone.");
  }
}

async function sendBatchMessages(contacts, type, message, res) {
  const batchSize = 10;
  let sent = 0;
  const errors = [];

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (contact) => {
        try {
          await sendSingleMessage(contact, type, message);
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



app.use("/api/posts", postRoutes);
app.use("/", aiAgentChatRoutes);
app.use("/", Auth.router);
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
