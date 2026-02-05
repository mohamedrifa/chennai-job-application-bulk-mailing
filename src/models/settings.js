// models/Settings.js
const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  userMail: { type: String, unique: true },
  lastRun: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Settings", SettingsSchema);
