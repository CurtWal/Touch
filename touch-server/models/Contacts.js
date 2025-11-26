const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  first_name: String,
  last_name: String,
  email: String,
  company: String,
  phone: String,
  instagram_handle: String,
  facebook_url: String,
  tiktok_handle: String,
  linkedin_url: String,
  notes: String,
  tags: [String],
  sms_opt_in: Boolean,
  email_opt_in: Boolean,
  messaging_opt_in: Boolean,
  quiet_hours_start: String, // e.g., "22:00"
  quiet_hours_end: String, // e.g., "07:00"
  city: String,
  state: String,
  country: String,
  timezone: String,
  lastInteraction: Date,
  last_followup_sent: Date,
});

module.exports = mongoose.model("Contact", contactSchema);
