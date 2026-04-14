const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");
const { scheduleNextForUser } = require("../jobs/dailyMailer");

const DAILY_LIMIT = 450;

// ⚡ FAST CONFIG
const BATCH_SIZE = 3;
const BATCH_DELAY = 3000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("SMTP Timeout")), ms)
    ),
  ]);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.sendBulkMail = async (req, res) => {
  try {
    const { subject, message, userMail, userPass, emails } = req.body;
    const files = req.files || [];

    if (!Array.isArray(emails) || !emails.length)
      return res.status(400).json({ error: "Invalid email list" });

    const clean = emails.filter(isValidEmail);

    const attachments = files.map(f => ({
      filename: f.originalname,
      path: f.path,
    }));

    res.json({ success: true, total: clean.length });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    let sent = 0, failed = 0;

    const now = clean.slice(0, DAILY_LIMIT);
    const later = clean.slice(DAILY_LIMIT);

    // 📌 Queue extra
    if (later.length) {
      await MailQueue.insertMany(later.map(to => ({
        to,
        subject,
        message,
        userMail,
        userPass,
        attachments,
        status: "pending",
        retries: 0
      })));

      await Settings.updateOne(
        { userMail },
        { lastRun: new Date() },
        { upsert: true }
      );

      scheduleNextForUser(userMail);
    }

    // 🚀 BATCH SEND NOW
    for (let i = 0; i < now.length; i += BATCH_SIZE) {
      const batch = now.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (to) => {
          try {
            await withTimeout(
              transporter.sendMail({
                from: `"${userMail}" <${userMail}>`,
                to,
                subject,
                html: message,
                attachments
              }),
              30000
            );
            sent++;
          } catch (err) {
            failed++;
            console.error("Send failed:", to, err.message);
          }
        })
      );

      await sleep(BATCH_DELAY);
    }

    // 🧹 cleanup temp files
    files.forEach(f => fs.unlink(f.path, () => {}));

    // 📊 report
    await transporter.sendMail({
      from: userMail,
      to: userMail,
      subject: "📊 Bulk Mail Report",
      html: `<b>Sent:</b> ${sent}<br><b>Failed:</b> ${failed}<br><b>Queued:</b> ${later.length || 0}`
    });

  } catch (err) {
    console.error("Fatal:", err.message);
  }
};