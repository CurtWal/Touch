const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const axios = require("axios");
const Post = require("../models/Post");
const { schedulePost } = require("../jobs/agendaScheduler");
const { verifyToken } = require("./auth");
require("dotenv").config();
const upload = multer(); // memory storage
const mongoose = require("mongoose");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const Media = require("../models/Media");

// file limits: default to 5MB (LinkedIn-like) or override via env
const MAX_FILE_BYTES = parseInt(
  process.env.LINKEDIN_IMAGE_MAX_BYTES || "5242880",
  10,
);
const storage = multer.memoryStorage();
// const uploadMedia = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: MAX_FILE_BYTES },
//   fileFilter: (req, file, cb) => {
//     const allowed = [
//       "image/jpeg",
//       "image/png",
//       "image/webp",
//       "video/mp4",
//       "video/quicktime", // .mov
//       "video/webm",
//     ];
//     if (!allowed.includes(file.mimetype)) {
//       return cb(new Error("Invalid file type"));
//     }
//     cb(null, true);
//   },
// });
function getMediaTypeFromMime(mime) {
  if (!mime) return "image"; // safe default
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "image";
}

async function downloadImageToMedia(url) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });

    const contentType = response.headers["content-type"] || "image/jpeg";

    const media = new Media({
      data: Buffer.from(response.data),
      mimeType: contentType,
      filename: url.split("/").pop() || "image.jpg",
    });

    const saved = await media.save();
    return saved._id;
  } catch (err) {
    console.error("Failed to download image:", url, err.message);
    return null;
  }
}
function parseDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  // Normalize date
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate)) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  let hours = 0;
  let minutes = 0;

  timeStr = timeStr.trim().toLowerCase();

  // Handle “8pm”, "8:00pm", “08:00 PM”, etc.
  const timeRegex = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/;
  const match = timeStr.match(timeRegex);

  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  hours = parseInt(match[1], 10);
  minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];

  // Convert 12hr → 24hr if needed
  if (ampm) {
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }

  // Build final ISO datetime
  const finalDate = new Date(parsedDate);
  finalDate.setHours(hours, minutes, 0, 0);

  return finalDate.toISOString();
}
function excelDateToJSDate(serial) {
  // Excel epoch starts on Jan 1, 1900
  const excelEpoch = new Date(1899, 11, 30);
  return new Date(excelEpoch.getTime() + serial * 86400000);
}

function excelTimeToString(serial) {
  let totalSeconds = Math.round(86400 * serial);
  let hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  let minutes = Math.floor(totalSeconds / 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

// create single post (require auth and set createdBy)
router.post("/", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const {
    platforms = [],
    body_text = "",
    media = [],
    first_comment = "",
    scheduled_at,
  } = req.body;
  try {
    const post = new Post({
      platforms: platforms || [],
      body_text: body_text || "",
      media: media || [],
      first_comment: first_comment || "",
      scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
      status: "draft",
      createdBy: userId, // <-- associate with user
    });
    await post.save();

    if (post.scheduled_at && post.status === "approved") {
      await schedulePost(post);
    }

    res.json(post);
  } catch (err) {
    console.error("Create post error:", err);
    res.status(500).json({ error: err.message });
  }
});
const uploadSingle = multer({ storage: multer.memoryStorage() }).single("file");
// bulk upload CSV/XLSX
router.post("/upload", verifyToken, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send("File missing");
    }

    const file = req.files.file;
    const workbook = xlsx.read(file.data, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    console.log("Parsed rows:", rows);

    const created = [];

    for (const r of rows) {
      const row = {};
      for (const key in r) row[key.trim()] = r[key]; // trim keys

      // Download image if media_url exists
      const mediaId = row.media_url
        ? await downloadImageToMedia(row.media_url)
        : null;

      const postData = {
        platforms: String(row.platforms || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        body_text: row.body_text || "",
        media: mediaId ? [mediaId] : [],
        first_comment: row.first_comment || "",
        status: "approved",
        createdBy: req.user.id,
      };

      // handle scheduled_at
      let scheduledAt = null;
      if (row.date || row.time) {
        try {
          const dateVal =
            typeof row.date === "number"
              ? excelDateToJSDate(row.date).toISOString().split("T")[0]
              : row.date;
          const timeVal =
            typeof row.time === "number"
              ? excelTimeToString(row.time)
              : row.time;
          scheduledAt = parseDateAndTime(dateVal, timeVal);
        } catch (err) {
          console.warn("Invalid date/time:", row.date, row.time);
        }
      }
      postData.scheduled_at = scheduledAt;

      const doc = await new Post(postData).save();
      if (scheduledAt) await schedulePost(doc);

      created.push(doc);
    }

    res.json({ createdCount: created.length, created });
  } catch (err) {
    console.error("Bulk upload error:", err);
    res.status(500).json({ error: err.message });
  }
});
// approve & schedule (ensure only owner can approve)
router.put("/:id/approve", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "not found" });

    if (!post.createdBy || String(post.createdBy) !== String(userId)) {
      return res.status(403).json({ error: "Not allowed to modify this post" });
    }

    post.status = "scheduled";
    await post.save();

    if (post.scheduled_at) {
      await schedulePost(post);
      post.status = "approved";
      await post.save();
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const posts = await Post.find({ createdBy: userId }).sort({
      scheduled_at: -1,
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// upload single media file -> returns URL
// DEBUG: log content-type so we can see if boundary is present
router.post("/upload-media", async (req, res) => {
  try {
    if (!req.files || !req.files.file)
      return res.status(400).json({ error: "No file uploaded" });

    const file = req.files.file;

    // 5MB LIMIT
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 5MB limit" });
    }

    // Save in MongoDB
    const media = new Media({
      data: file.data,
      mimeType: file.mimetype,
      filename: file.name,
    });

    await media.save();

    res.json({
      url: `http://localhost:3000/api/posts/media/${media._id}`,
      mediaId: media._id,
    });
  } catch (err) {
    console.error("upload error", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/media/:id", async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).send("Not found");

    res.contentType(media.mimeType);
    res.send(media.data);
  } catch (e) {
    res.status(500).send("Error retrieving media");
  }
});

module.exports = router;
