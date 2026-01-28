const mongoose = require("mongoose");

const MediaSchema = new mongoose.Schema({
  data: Buffer,
  mimeType: String,
  filename: String,
   mediaType: String,
  //  {
  //   type: String,
  //    enum: ["image", "video"],
  //    required: true,
  // },
  // size: Number,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24, // 1 day
  },
});

module.exports = mongoose.model("Media", MediaSchema);
