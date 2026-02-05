const cron = require("node-cron");
const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");

const DAILY_LIMIT = 500;

cron.schedule("0 10 * * *", async () => {
  console.log("📨 Daily bulk mail started");

  const mails = await MailQueue.find({ status: "pending" }).limit(DAILY_LIMIT);

  let successCount = 0;
  let failCount = 0;

  let mailId = "";
  let pass = "";

  for (const mail of mails) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: mail.userMail,
        pass: mail.userPass,
      },
    });
    mailId = mail.userMail;
    pass = mail.userPass;

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
    }

    await mail.save();
  }

  // 📩 SEND DAILY REPORT MAIL
  const adminTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: mailId,
      pass: pass,
    },
  });

  const totalSent = await MailQueue.countDocuments({ status: "sent" });
  const pending = await MailQueue.countDocuments({ status: "pending" });
  const failed = await MailQueue.countDocuments({ status: "failed" });

  await adminTransporter.sendMail({
    from: mailId,
    to: mailId,
    subject: "📊 Bulk Mail Daily Report",
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

  console.log("📧 Report mail sent");
});
