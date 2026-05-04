const mongoose = require("mongoose");

const mailSchema = new mongoose.Schema({
  userMail:    { type: String, required: true },
  userPass:    { type: String, required: true },
  to:          { type: String, required: true },
  subject:     { type: String, required: true },
  message:     { type: String, required: true },
  attachments: { type: Array, default: [] },
  status:      { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
  retries:     { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
  sentAt:      { type: Date },
});

module.exports = mongoose.model("MailQueue", mailSchema);