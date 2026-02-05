const cron = require("node-cron");
const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");

const DAILY_LIMIT = 500;

// Run every day at 10 AM
cron.schedule("0 10 * * *", async () => {
  console.log("📨 Daily bulk mail started");

  // Get all distinct users who have pending mails
  const users = await MailQueue.distinct("userMail", { status: "pending" });

  for (const userMail of users) {
    // Get pending mails for this user
    const pendingMails = await MailQueue.find({ userMail, status: "pending" }).limit(DAILY_LIMIT);

    if (!pendingMails.length) continue;

    const userPass = pendingMails[0].userPass; // assume same userPass for same user
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

    let successCount = 0;
    let failCount = 0;

    for (const mail of pendingMails) {
      try {
        await transporter.sendMail({
          from: mail.userMail,
          to: mail.to,
          subject: mail.subject,
          html: mail.message,
          attachments: mail.attachments,
        });

        mail.status = "sent";
        mail.sentAt = new Date();
        successCount++;
      } catch (err) {
        mail.retries++;
        mail.status = mail.retries >= 3 ? "failed" : "pending";
        failCount++;
        console.error("Failed to send:", mail.to, err.message);
      }

      await mail.save();
    }

    // Send report to this user
    const totalSent = await MailQueue.countDocuments({ userMail, status: "sent" });
    const pending = await MailQueue.countDocuments({ userMail, status: "pending" });
    const failed = await MailQueue.countDocuments({ userMail, status: "failed" });

    await transporter.sendMail({
      from: userMail,
      to: userMail,
      subject: "📊 Your Bulk Mail Daily Report",
      html: `
        <h2>Daily Bulk Mail Report</h2>
        <p><b>Sent Today:</b> ${successCount}</p>
        <p><b>Failed Today:</b> ${failCount}</p>
        <hr/>
        <p><b>Total Sent:</b> ${totalSent}</p>
        <p><b>Pending:</b> ${pending}</p>
        <p><b>Failed Overall:</b> ${failed}</p>
        <p><b>Time:</b> ${new Date().toLocaleString()}</p>
      `,
    });

    console.log(`📧 Report sent to ${userMail} | Sent: ${successCount}, Failed: ${failCount}`);
  }

  console.log("📨 Daily bulk mail finished");
});
