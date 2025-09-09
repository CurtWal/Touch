const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const Post = require("../models/Post");
const {schedulePost} = require("../jobs/agendaScheduler");
require("dotenv").config();
const upload = multer(); // memory storage
const mongoose = require("mongoose");
const router = express.Router();

// create single post
router.post("/", async (req, res) => {
  const { platforms = [], body_text = "", media = [], first_comment = "", scheduled_at } = req.body;
  try {
    const post = new Post({
      platforms: platforms || [],
      body_text: body_text || "",
      media: media || [],
      first_comment: first_comment || "",
      scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
      status: "draft",
    });
    await post.save();

    // Schedule the post (only if it has scheduled_at + status is approved)
    if (post.scheduled_at && post.status === "approved") {
      await schedulePost(post);
    }

    res.json(post);
  } catch (err) {
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

// approve & schedule (UI calls this)
router.put("/:id/approve", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "not found" });

    post.status = "approved";
    await post.save();

    // schedule publish job (agenda uses MongoDB for timing)
    if (post.scheduled_at) {
      await schedulePost(post);
      post.status = "scheduled";
      await post.save();
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ scheduled_at: -1 });
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

module.exports = router;
