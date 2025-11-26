const express = require("express");
const router = express.Router();
const { verifyToken } = require("./auth");
const Contact = require("../models/Contacts");

router.get("/api/contacts/:id", verifyToken, async (req, res) => {
  const contactId = req.params.id;
  const userId = req.user.id;

  const contact = await Contact.findOne({ _id: contactId, userId }).lean();

  if (!contact) return res.status(404).json({ error: "Contact not found" });

  return res.json(contact);
});

module.exports = router;