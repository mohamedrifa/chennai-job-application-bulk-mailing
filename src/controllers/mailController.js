const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");

const DAILY_LIMIT = 500;

exports.sendBulkMail = async (req, res) => {
  try {
    const { subject, message, userMail, userPass, emails } = req.body;
    const files = req.files;

    // Validate input
    if (!emails || !Array.isArray(emails) || !subject || !message || !userMail || !userPass) {
      return res.status(400).json({ error: "Missing or invalid fields" });
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

    // Queue remaining emails in DB
    if (remaining.length) {
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
      await MailQueue.insertMany(queueData);
      console.log(`Queued ${queueData.length} emails`);
    }

    // Delete temp files
    if (files) {
      files.forEach(f => fs.unlink(f.path, err => err && console.error(err)));
    }

    // Send success/failure report to userMail
    const totalSent = instantSuccess;
    const totalFailed = instantFail + (remaining.length || 0);

    await transporter.sendMail({
      from: userMail,
      to: userMail,
      subject: "📊 Bulk Mail Report",
      html: `
        <h2>Bulk Mail Report</h2>
        <p><b>Sent Now:</b> ${instantSuccess}</p>
        <p><b>Failed Now:</b> ${instantFail}</p>
        <p><b>Queued:</b> ${remaining.length}</p>
        <p><b>Total Attempts:</b> ${totalSent + totalFailed}</p>
        <p><b>Time:</b> ${new Date().toLocaleString()}</p>
      `,
    });

    console.log("📧 Report mail sent");

  } catch (err) {
    console.error("Bulk mail failed:", err);
  }
};
