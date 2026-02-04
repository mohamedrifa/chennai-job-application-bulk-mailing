const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const emails = require("../utils/tempmail.json");

const DAILY_LIMIT = 500;

exports.sendBulkMail = async (req, res) => {
  try {
    const { subject, message, userMail, userPass } = req.body;
    const files = req.files;

    if (!emails || !subject || !message || !userMail || !userPass) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const attachments = files
      ? files.map(f => ({ filename: f.originalname, path: f.path }))
      : [];

    // 🔥 IMMEDIATE RESPONSE
    res.json({
      success: true,
      message: "Bulk mail job started. Emails are being sent in the background.",
      totalEmails: emails.length,
    });

    // === ASYNCHRONOUS EMAIL PROCESSING ===
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    let instantSuccess = 0;
    let instantFail = 0;

    // Send first 500 instantly
    const firstBatch = emails.slice(0, DAILY_LIMIT);
    const remaining = emails.slice(DAILY_LIMIT);

    // Process first batch
    for (const to of firstBatch) {
      try {
        await transporter.sendMail({
          from: userMail,
          to,
          subject,
          html: message,
          attachments,
        });
        instantSuccess++;
      } catch (err) {
        instantFail++;
        console.error("Failed to send:", to, err.message);
      }
    }

    console.log(`Instantly sent: ${instantSuccess}, failed: ${instantFail}`);

    // Queue remaining emails in DB
    const queueData = remaining.map(to => ({
      to,
      subject,
      message,
      userMail,
      userPass,
      attachments,
      status: "pending",
      retries: 0,
    }));

    if (queueData.length) {
      await MailQueue.insertMany(queueData);
      console.log(`Queued ${queueData.length} emails`);
    }

    // Delete temp files
    if (files) {
      files.forEach(f => fs.unlink(f.path, err => err && console.error(err)));
    }

  } catch (err) {
    console.error("Bulk mail failed:", err);
  }
};
