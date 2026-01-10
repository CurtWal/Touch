const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    platforms: [String],
    body_text: String,
    media: [{ type: mongoose.Schema.Types.ObjectId, ref: "Media", default: [], }],
    first_comment: String,
    scheduled_at: Date,
    status: {
      type: String,
      enum: ["draft", "approved", "scheduled", "published", "failed"],
      default: "draft",
    },
    remoteIds: { type: Map, of: String },
    attempts: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
