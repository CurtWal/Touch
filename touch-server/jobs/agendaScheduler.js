const Agenda = require("agenda");
const Post = require("../models/Post");
require("dotenv").config();
const {
  publishToLinkedIn,
  publishToTwitter,
} = require("../routes/n8nPostSchedule");
const PlatformAuth = require("../models/PlatformAuthSchema");
const jwt = require("jsonwebtoken");

const agenda = new Agenda({
  db: {
    address: process.env.MONGO_URI,
    collection: "jobs",
  },
  processEvery: "5 seconds",
  maxConcurrency: 20,
  defaultLockLifetime: 1000 * 60 * 10, // 10 minutes
});

// Define job
agenda.define("publish post", async (job) => {
  try {
    const { postId } = job.attrs.data;
    const post = await Post.findById(postId);
    
    if (!post) {
      console.warn(`publish post: post not found ${postId}`);
      return;
    }
    const userId = post.createdBy;

    if (post.status !== "scheduled" && post.status !== "approved") {
      console.log(`publish post: skipping ${postId}, status=${post.status}`);
      return;
    }

    //console.log(`🚀 Agenda publishing post ${postId}`);
    console.log("Post owner:", post.createdBy);
    const results = {};
    const errors = {};

    for (const platform of post.platforms) {
      try {
        if (platform === "linkedin") {
          const r = await publishToLinkedIn({ post, userId });
          results.linkedin = r.remoteId;
        }

        if (platform === "twitter") {
          const r = await publishToTwitter({ post, userId });
          results.twitter = r.remoteId;
        }
      } catch (err) {
        console.error(`${platform} publish failed`, err.message);
        errors[platform] = err.message;
      }
    }

    if (Object.keys(results).length > 0) {
      post.status = "published";
      post.remoteIds = results;
      post.publishedAt = new Date();
      await post.save();

      // 🧹 cleanup after 24h
      await agenda.schedule("in 24 hours", "delete-published-post", {
        postId: post._id,
      });
    }

    console.log(`✅ Agenda finished post ${postId}`, { results, errors });
  } catch (err) {
    console.error("❌ Agenda publish job failed:", err);
    throw err;
  }
});

// Delete a post 24 hours after it was marked published
agenda.define("delete-published-post", async (job) => {
  const { postId } = job.attrs.data;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      console.warn(`delete-published-post: post ${postId} not found`);
      return;
    }

    // Delete any base64 or stored media inside the DB
    if (post.media && post.media.length) {
      console.log("Cleaning media for post:", postId);
      post.media = []; // wipe media array
    }

    await post.deleteOne();
    console.log(`🗑️ Deleted post ${postId} after 24 hours`);
  } catch (err) {
    console.error("Error deleting post:", err);
  }
});

// start agenda once
(async function startAgenda() {
  try {
    await agenda.start();
    console.log("Agenda started");
    agenda.on("ready", () =>
      console.log("✅ Agenda is ready and connected to MongoDB")
    );
    agenda.on("error", (err) =>
      console.error("❌ Agenda connection error:", err)
    );
  } catch (err) {
    console.error("Failed to start Agenda:", err);
  }
})();

// Schedule when creating a post
async function schedulePost(post) {
  try {
    const when = post.scheduled_at ? new Date(post.scheduled_at) : null;
    if (!when || isNaN(when.getTime())) {
      throw new Error("Invalid scheduled_at date");
    }

    // create job with uniqueness on postId to avoid duplicates
    const job = agenda.create("publish post", { postId: String(post._id) });
    job.unique({ "data.postId": String(post._id) });
    job.schedule(when);
    await job.save();

    console.log(
      `Scheduled publish post job for ${post._id} at ${when.toISOString()}`
    );
    return job;
  } catch (err) {
    console.error("Failed to schedule post:", err);
    throw err;
  }
}

// graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, stopping Agenda...");
  await agenda.stop();
  process.exit(0);
});

module.exports = { agenda, schedulePost };
