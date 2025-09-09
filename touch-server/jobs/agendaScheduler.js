const Agenda = require("agenda");
const Post = require("../models/Post");
require("dotenv").config();

const agenda = new Agenda({ db: { 
    address: process.env.MONGO_URI, 
    collection: "jobs" 
  } });

// Define job
agenda.define("publish post", async (job) => {
  const { postId } = job.attrs.data;
  const post = await Post.findById(postId);

  if (!post || post.status !== "scheduled") return;

  console.log(`Publishing post: ${post.body_text}`);
  // TODO: API integrations
  post.status = "published";
  await post.save();
});

// Schedule when creating a post
async function schedulePost(post) {
  await agenda.start();
  await agenda.schedule(post.scheduled_at, "publish post", { postId: post._id });
}

module.exports = { agenda, schedulePost };