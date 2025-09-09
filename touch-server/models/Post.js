const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    platforms: { type: [String] }, // ['facebook','instagram','linkedin','tiktok','buffer']
    body_text: { type: String },
    media: { type: [String] }, // S3 or public URLs
    first_comment: { type: String },
    scheduled_at: { type: Date },
    status: {
      type: String,
      enum: ["draft", "approved", "scheduled", "published", "failed"],
      default: "draft",
    },
    remoteIds: { type: Map, of: String }, // platform -> remote post id
    attempts: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", PostSchema);
