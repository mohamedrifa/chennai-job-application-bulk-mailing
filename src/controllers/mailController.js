const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const emails = require("../utils/tempmail.json");

const DAILY_LIMIT = 500;

exports.sendBulkMail = async (req, res) => {
  try {
    const { subject, message, userMail, userPass } = req.body;
    const files = req.files;
    console.log(req.body);

    if (!emails || !subject || !message || !userMail || !userPass) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    const attachments = files
      ? files.map(f => ({ filename: f.originalname, path: f.path }))
      : [];

    let instantSuccess = 0;
    let instantFail = 0;

    // 🔥 SEND FIRST 500 INSTANTLY
    const firstBatch = emails.slice(0, DAILY_LIMIT);
    const remaining = emails.slice(DAILY_LIMIT);

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
      } catch {
        instantFail++;
      }
    }

    // 🕒 STORE REMAINING IN DB QUEUE
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
    }

    // delete temp files
    if (files) files.forEach(f => fs.unlinkSync(f.path));

    return res.json({
      success: true,
      message: "Bulk mail started",
      sentNow: instantSuccess,
      failedNow: instantFail,
      queued: queueData.length,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk mail failed" });
  }
};
