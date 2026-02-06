const nodemailer = require("nodemailer");
const fs = require("fs");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");
const { scheduleNextForUser } = require("../jobs/dailyMailer");

const DAILY_LIMIT = 450;

exports.sendBulkMail = async (req, res) => {
  try {
    const { subject, message, userMail, userPass, emails } = req.body;
    const files = req.files || [];

    if (
      !Array.isArray(emails) ||
      !emails.length ||
      !subject ||
      !message ||
      !userMail ||
      !userPass
    ) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    const attachments = files.map(f => ({
      filename: f.originalname,
      path: f.path,
    }));

    // 🚀 Instant response
    res.json({
      success: true,
      message: "Bulk mail job started in background",
      total: emails.length,
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    let success = 0;
    let failed = 0;

    // split
    const nowBatch = emails.slice(0, DAILY_LIMIT);
    const laterBatch = emails.slice(DAILY_LIMIT);

    // Queue remaining
    if (laterBatch.length) {
      const bulkQueue = laterBatch.map(to => ({
        to,
        subject,
        message,
        userMail,
        userPass,
        attachments,
        status: "pending",
        retries: 0,
      }));
      await MailQueue.insertMany(bulkQueue);
    }

    // throttle sender
    for (const to of nowBatch) {
      try {
        await transporter.sendMail({
          from: userMail,
          to,
          subject,
          html: message,
          attachments,
        });
        success++;
        await new Promise(r => setTimeout(r, 400)); // 2.5/sec
      } catch (err) {
        failed++;
        console.error("Send failed:", to, err.message);
      }
    }

    console.log(`Now Sent: ${success}, Failed: ${failed}`);

    // save last run
    await Settings.findOneAndUpdate(
      { userMail },
      { $set: { lastRun: new Date() } },
      { upsert: true }
    );

    // ⏰ start next cron
    scheduleNextForUser(userMail);

    // cleanup temp files
    files.forEach(f => fs.unlink(f.path, () => {}));

    // 📊 report mail
    await transporter.sendMail({
      from: userMail,
      to: userMail,
      subject: "📊 Bulk Mail Report",
      html: `
        <h2>Bulk Mail Report</h2>
        <p><b>Sent:</b> ${success}</p>
        <p><b>Failed:</b> ${failed}</p>
        <p><b>Queued:</b> ${laterBatch.length}</p>
        <p><b>Total:</b> ${emails.length}</p>
        <p><b>Time:</b> ${new Date().toLocaleString()}</p>
      `,
    });

    console.log("📧 Report sent");

  } catch (err) {
    console.error("Bulk mail fatal error:", err.message);
  }
};
