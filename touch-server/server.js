const express = require("express");
const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
const xlsx = require("xlsx");
const mongoose = require("mongoose");
const postRoutes = require("./routes/post");
const aiAgentChatRoutes = require("./routes/aiAgentChat");

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

app.post("/crm-upload", (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send("No file uploaded");
    }
    const file = req.files.file;
    const workBook = xlsx.read(file.data, { type: "buffer" });
    const sheetName = workBook.SheetNames[0];
    const sheet = workBook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(sheet);

    // Required fields for a valid row (core identity/contact fields)
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

    // Social/media fields (optional, but must exist as columns)
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

    // Check if all required columns exist in the file
    const allColumns = Object.keys(data[0] || {});
    // const hasAllColumns =
    //   REQUIRED_FIELDS.every((field) => allColumns.includes(field)) &&
    //   OPTIONAL_FIELDS.every((field) => allColumns.includes(field));
    // if (!hasAllColumns) {
    //   return res
    //     .status(400)
    //     .json({ error: "Invalid file: missing required columns." });
    // }
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

    // ✅ Fill in any missing optional fields
    data = data.map((row) => {
      OPTIONAL_FIELDS.forEach((f) => {
        if (!(f in row)) row[f] = "";
      });
      return row;
    });

    // Validate each row for required fields (must not be empty)
    let errors = [];
    data = data.map((row, idx) => {
      // Convert all fields to strings (so .trim() is always safe)
      const newRow = {};
      for (const key in row) {
        newRow[key] = row[key] == null ? "" : String(row[key]);
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!newRow.email || !emailRegex.test(newRow.email.trim())) {
        errors.push(
          `Row ${idx + 2}: Invalid or missing email "${newRow.email}"`
        );
      }

      // Phone validation
      const phoneRegex = /^\+?[0-9\s\-().]{7,}$/;
      const phoneValue = newRow.phone.trim();
      if (!phoneValue || !phoneRegex.test(phoneValue)) {
        errors.push(
          `Row ${idx + 2}: Invalid or missing phone "${newRow.phone}"`
        );
      }

      // Normalize social URLs
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

      // Required fields not empty
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

    // Remove duplicates (by all fields)
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
    uploadedCRMData = data;
    console.log(`Uploaded ${data.length} valid rows`);
    res.json({ success: true, count: data.length, rows: data });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).send("Error uploading file");
  }
});

app.get("/crm-data", (req, res) => {
  if (!uploadedCRMData.length)
    return res.status(404).json({ error: "No data uploaded yet" });
  res.json(uploadedCRMData);
});

app.use("/api/posts", postRoutes);
app.use("/", aiAgentChatRoutes);
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
