const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
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
  10
);
const storage = multer.memoryStorage();
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"));
    }
    cb(null, true);
  },
});

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

// bulk upload CSV/XLSX
router.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file)
      return res.status(400).send("file missing");
    const file = req.files.file;
    const wb = xlsx.read(file.data, { type: "buffer" });
    const sheet = wb.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });

    const created = [];
    for (const r of rows) {
      // expected CSV columns: platforms, body_text, media, first_comment, scheduled_at
      const p = {
        platforms: String(r.platforms || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        body_text: r.body_text || "",
        media: String(r.media || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        first_comment: r.first_comment || "",
        scheduled_at: r.scheduled_at ? new Date(r.scheduled_at) : null,
        status: "draft",
      };
      const doc = await new Post(p).save();
      created.push(doc);
    }

    res.json({ createdCount: created.length, created });
  } catch (err) {
    console.error(err);
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
