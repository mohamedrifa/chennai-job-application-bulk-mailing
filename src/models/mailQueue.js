const mongoose = require("mongoose");

const mailSchema = new mongoose.Schema({
  userMail: { type: String, required: true }, // Sender email
  userPass: { type: String, required: true }, // Sender app password or OAuth token
  to: { type: String, required: true },       // Recipient email
  subject: { type: String, required: true },
  message: { type: String, required: true },
  attachments: { type: Array, default: [] },
  status: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
  retries: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date }  // When mail was successfully sent
});

module.exports = mongoose.model("MailQueue", mailSchema);
