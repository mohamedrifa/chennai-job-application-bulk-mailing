const cron = require("node-cron");
const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");

const DAILY_LIMIT = 450;
const MIN_DELAY = 40000;
const MAX_DELAY = 90000;
const MAX_RETRY = 3;

const userTasks = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
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

    const userPass = pending[0].userPass;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: userMail, pass: userPass }
    });

    for (const mail of pending) {
      try {
        await transporter.sendMail({
          from: mail.userMail,
          to: mail.to,
          subject: mail.subject,
          html: mail.message,
          attachments: mail.attachments
        });

        await MailQueue.deleteOne({ _id: mail._id });
        await sleep(randDelay());

      } catch (err) {
        mail.retries++;
        if (mail.retries >= MAX_RETRY) {
          mail.status = "failed";
        }
        await mail.save();
        await sleep(180000);
      }
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