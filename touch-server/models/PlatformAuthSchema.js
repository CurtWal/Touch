const mongoose = require("mongoose");

const PlatformAuthSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, required: true, enum: ["facebook","instagram","linkedin","tiktok","buffer","twitter","meta"], index: true },
    // store provider-specific tokens/settings in map/obj
    credentials: { type: mongoose.Schema.Types.Mixed, default: {} },
    // optional metadata
    expiresAt: { type: Date, default: null },
    refreshedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    n8nToken: { type: String },
  },
  
  { timestamps: true }
);

PlatformAuthSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model("PlatformAuth", PlatformAuthSchema);
