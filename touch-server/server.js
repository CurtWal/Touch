const express = require("express");
const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
const xlsx = require("xlsx");

app.use(cors());
app.use(fileUpload());
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.post("/upload", (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send("No file uploaded");
    }
    const file = req.files.file;
    const workBook = xlsx.read(file.data, { type: "buffer" });
    const sheetName = workBook.SheetNames[0];
    const sheet = workBook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(sheet);

    // Only allow files with all required fields
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

    // Check if every required field is present in the first row
    const hasAllFields =
      data.length > 0 &&
      REQUIRED_FIELDS.every((field) => Object.keys(data[0]).includes(field));
    if (!hasAllFields) {
      return res
        .status(400)
        .json({ error: "Invalid file: missing required fields." });
    }
    // Remove duplicates (by all fields)
    const seen = new Set();
    data = data.filter((row) => {
      // Use a unique string of all field values as the key
      const key = REQUIRED_FIELDS.map((f) =>
        String(row[f] || "")
          .toLowerCase()
          .trim()
      ).join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(data);
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).send("Error uploading file");
  }
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
