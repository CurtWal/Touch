const express = require("express");
const router = express.Router();
const { verifyToken } = require("./auth");
const User = require("../models/User");

router.get("/api/user/settings", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select(
    "auto_follow_up_enabled auto_follow_up_start_date"
  );

  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    auto_follow_up_enabled: user.auto_follow_up_enabled,
    auto_follow_up_start_date: user.auto_follow_up_start_date,
  });
});

module.exports = router;
