const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");
const { scheduleNextForUser } = require("../jobs/dailyMailer");

const DAILY_LIMIT = 450;
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

function fileToBase64Attachment(f) {
  const content = fs.readFileSync(f.path).toString("base64");
  return {
    filename: f.originalname,
    content,
    encoding: "base64",
  };
}

exports.sendBulkMail = async (req, res) => {
  const { subject, message, userMail, userPass, emails } = req.body;
  const files = req.files || [];

  if (!Array.isArray(emails) || !emails.length)
    return res.status(400).json({ error: "Invalid email list" });

  const clean = emails.filter(isValidEmail);
  if (!clean.length)
    return res.status(400).json({ error: "No valid emails found" });

  const attachments = files.map(fileToBase64Attachment);

  res.json({ success: true, total: clean.length });

  setImmediate(async () => {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: userMail, pass: userPass },
      });

      const now = clean.slice(0, DAILY_LIMIT);
      const later = clean.slice(DAILY_LIMIT);

      if (later.length) {
        await MailQueue.insertMany(
          later.map(to => ({
            to,
            subject,
            message,
            userMail,
            userPass,
            attachments,
            status: "pending",
            retries: 0,
          }))
        );
        await Settings.updateOne(
          { userMail },
          { lastRun: new Date() },
          { upsert: true }
        );
        scheduleNextForUser(userMail);
      }

      let sent = 0, failed = 0;

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
                  attachments,
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

      files.forEach(f => fs.unlink(f.path, () => {}));

      try {
        await transporter.sendMail({
          from: userMail,
          to: userMail,
          subject: "📊 Bulk Mail Report",
          html: `<b>Sent:</b> ${sent}<br><b>Failed:</b> ${failed}<br><b>Queued:</b> ${later.length || 0}`,
        });
      } catch (e) {
        console.error("Report mail failed:", e.message);
      }
    } catch (err) {
      console.error("Fatal background error:", err.message);
    }
  });
};