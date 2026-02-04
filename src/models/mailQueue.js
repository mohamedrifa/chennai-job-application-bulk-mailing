const mongoose = require("mongoose");

const mailSchema = new mongoose.Schema({
  to: String,
  subject: String,
  message: String,
  attachments: Array,
  status: { type: String, default: "pending" },
  retries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("MailQueue", mailSchema);
