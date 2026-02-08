const cron = require("node-cron");
const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");

const DAILY_LIMIT = 450;

// SAFE DELAY
const MIN_DELAY = 500; // 40 sec
const MAX_DELAY = 1000; // 90 sec

const MAX_RETRY = 3;
const userTasks = new Map();

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

async function scheduleNextForUser(userMail) {

  if (userTasks.has(userMail)) {
    userTasks.get(userMail).stop();
  }

  const data = await Settings.findOne({ userMail });
  if (!data) return;

  const lastRun = new Date(data.lastRun);
  const next = new Date(lastRun.getTime() + 25.5 * 60 * 60 * 1000);
  const cronExp = `${next.getMinutes()} ${next.getHours()} * * *`;

  const task = cron.schedule(cronExp, async () => {

    const pending = await MailQueue.find({
      userMail,
      status: "pending"
    }).limit(DAILY_LIMIT);

    if (!pending.length) return;

    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: pending[0].userPass }
    });

    let count = 0;
    let sent = 0;
    let failed = 0;

    for (const mail of pending) {
      try {
        count++;

        if (count % 50 === 0) {
          transporter.close();
          await sleep(15000);
          transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user: userMail, pass: pending[0].userPass }
          });
        }

        await withTimeout(
          transporter.sendMail({
            from: mail.userMail,
            to: mail.to,
            subject: mail.subject,
            html: mail.message,
            attachments: mail.attachments
          }),
          30000
        );

        await MailQueue.deleteOne({ _id: mail._id });
        sent++;

      } catch (err) {
        failed++;
        mail.retries++;
        if (mail.retries >= MAX_RETRY) {
          mail.status = "failed";
        }
        await mail.save();
      }

      await sleep(randDelay());
    }
    const remaining = await MailQueue.countDocuments({
      userMail,
      status: "pending"
    });

    // 📊 Send report to owner
    try {
      await withTimeout(
        transporter.sendMail({
          from: userMail,
          to: userMail,
          subject: "📊 Bulk Mail Report",
          html: `<b>Sent:</b> ${sent}<br><b>Failed:</b> ${failed}<br><b>Remaining:</b> ${remaining || 0}`
        }),
        30000
      );
    } catch (e) {
      console.error("Report mail failed:", e.message);
    }

    await Settings.updateOne(
      { userMail },
      { lastRun: new Date() }
    );

    scheduleNextForUser(userMail);
  });

  userTasks.set(userMail, task);
}

async function startAllCrons() {
  const users = await Settings.find({});
  users.forEach(u => scheduleNextForUser(u.userMail));
}

startAllCrons();

module.exports = { scheduleNextForUser };
