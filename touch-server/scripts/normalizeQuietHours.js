require('dotenv').config();
const mongoose = require('mongoose');
const Contact = require('../models/Contacts');

// Duplicate of server's normalization helper to avoid importing server.js
function normalizeTime(value) {
  if (value == null) return "";
  let s = String(value).trim();
  if (s === "") return "";

  s = s.replace(/^"|"$/g, "");

  const timeRegex = /^(\d{1,2})(?::|\.)(\d{1,2})(?:\s*(am|pm))?$/i;
  const tm = s.match(timeRegex);
  if (tm) {
    let hh = parseInt(tm[1], 10);
    let mm = parseInt(tm[2], 10);
    const ampm = tm[3];
    if (ampm) {
      if (/pm/i.test(ampm) && hh < 12) hh += 12;
      if (/am/i.test(ampm) && hh === 12) hh = 0;
    }
    hh = Math.max(0, Math.min(23, hh));
    mm = Math.max(0, Math.min(59, mm));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    const num = Number(s);
    let totalMinutes = 0;
    if (num >= 0 && num <= 1) {
      totalMinutes = Math.round(num * 24 * 60);
    } else if (num > 1 && num < 24) {
      const hours = Math.floor(num);
      const minutes = Math.round((num - hours) * 60);
      totalMinutes = hours * 60 + minutes;
    } else {
      const frac = num - Math.floor(num);
      totalMinutes = Math.round(frac * 24 * 60);
    }
    totalMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const ampmRegex = /^(\d{1,2})\s*(am|pm)$/i;
  const m2 = s.match(ampmRegex);
  if (m2) {
    let hh = parseInt(m2[1], 10);
    const ampm = m2[2];
    if (/pm/i.test(ampm) && hh < 12) hh += 12;
    if (/am/i.test(ampm) && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:00`;
  }

  return s;
}

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.error('MONGO_URI not set in environment');
      process.exit(1);
    }

    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const contacts = await Contact.find({});
    let updated = 0;
    for (const c of contacts) {
      const originalStart = c.quiet_hours_start || '';
      const originalEnd = c.quiet_hours_end || '';
      const normStart = originalStart ? normalizeTime(originalStart) : '';
      const normEnd = originalEnd ? normalizeTime(originalEnd) : '';
      if (normStart !== String(originalStart) || normEnd !== String(originalEnd)) {
        await Contact.findByIdAndUpdate(c._id, { quiet_hours_start: normStart, quiet_hours_end: normEnd });
        updated++;
      }
    }

    console.log(`Processed ${contacts.length} contacts. Updated ${updated} contacts.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
