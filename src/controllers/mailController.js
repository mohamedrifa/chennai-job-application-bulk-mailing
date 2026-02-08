const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");
const { scheduleNextForUser } = require("../jobs/dailyMailer");

const DAILY_LIMIT = 450;

// SAFE GMAIL DELAYS
const MIN_DELAY = 40000; // 40 sec
const MAX_DELAY = 90000; // 90 sec

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
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

    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    let sent = 0, failed = 0, count = 0;

    const now = clean.slice(0, DAILY_LIMIT);
    const later = clean.slice(DAILY_LIMIT);

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

    for (const to of now) {
      try {
        count++;

        // reset SMTP every 50 mails
        if (count % 50 === 0) {
          transporter.close();
          await sleep(15000);
          transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: userMail, pass: userPass },
          });
        }

        await withTimeout(
          transporter.sendMail({
            from: `"${userMail}" <${userMail}>`,
            to,
            subject,
            html: message,
            replyTo: userMail,
            headers: {
              "X-Mailer": "BulkMailer",
              "Precedence": "bulk"
            },
            attachments
          }),
          30000
        );

        sent++;
      } catch (err) {
        failed++;
        console.error("Send failed:", to, err.message);
      }

      await sleep(randDelay());
    }

    files.forEach(f => fs.unlink(f.path, () => {}));

    await transporter.sendMail({
      from: userMail,
      to: userMail,
      subject: "📊 Bulk Mail Report",
      html: `<b>Sent:</b> ${sent}<br><b>Failed:</b> ${failed}`
    });

  } catch (err) {
    console.error("Fatal:", err.message);
  }
};
