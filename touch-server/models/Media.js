const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema({
  data: Buffer,
  mimeType: String,
  filename: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24, // 1 day
  },
});

module.exports = mongoose.model("Media", MediaSchema);
