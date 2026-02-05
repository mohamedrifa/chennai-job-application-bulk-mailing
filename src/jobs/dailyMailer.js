const cron = require("node-cron");
const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");

const DAILY_LIMIT = 450;

const userTasks = new Map();

async function scheduleNextForUser(userMail) {

  // 🛑 stop old cron for this user
  if (userTasks.has(userMail)) {
    userTasks.get(userMail).stop();
  }

  let data = await Settings.findOne({ userMail });
  if (!data) return;

  const lastRun = new Date(data.lastRun);
  const next = new Date(lastRun.getTime() + 25.5 * 60 * 60 * 1000);

  const min = next.getMinutes();
  const hr = next.getHours();
  const cronExp = `${min} ${hr} * * *`;

  console.log(`⏰ Next run for ${userMail}:`, cronExp);

  const task = cron.schedule(cronExp, async () => {
    console.log(`📨 Running for ${userMail}`);

    const pendingMails = await MailQueue
      .find({ userMail, status: "pending" })
      .limit(DAILY_LIMIT);

    if (!pendingMails.length) return;

    const userPass = pendingMails[0].userPass;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass },
    });

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
      } catch (err) {
        mail.retries++;
        mail.status = mail.retries >= 3 ? "failed" : "pending";
      }

      await mail.save();
    }

    await Settings.updateOne(
      { userMail },
      { lastRun: new Date() }
    );

    scheduleNextForUser(userMail); // shift again
  });

  // ✅ save task reference
  userTasks.set(userMail, task);
}

async function startAllCrons() {
  const users = await Settings.find({});
  users.forEach(u => scheduleNextForUser(u.userMail));
}

startAllCrons();
module.exports = { scheduleNextForUser };
