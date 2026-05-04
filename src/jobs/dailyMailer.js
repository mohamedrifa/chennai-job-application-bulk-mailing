const nodemailer = require("nodemailer");
const MailQueue = require("../models/mailQueue");
const Settings = require("../models/settings");

const DAILY_LIMIT = 450;
const MAX_RETRY = 3;
const BATCH_SIZE = 3;
const BATCH_DELAY = 3000;

const userTasks = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  try {
    if (userTasks.has(userMail)) {
      clearTimeout(userTasks.get(userMail));
    }

    const data = await Settings.findOne({ userMail });
    if (!data) return;

    const lastRun = new Date(data.lastRun);
    const next = new Date(lastRun.getTime() + 25.5 * 60 * 60 * 1000);
    const delay = next.getTime() - Date.now();

    console.log(`⏳ Next run for ${userMail} in ${Math.round(delay / 1000)}s`);

    const timer = setTimeout(async () => {
      try {
        const pending = await MailQueue.find({
          userMail,
          status: "pending",
        }).limit(DAILY_LIMIT);

        if (!pending.length) {
          console.log(`No pending mails for ${userMail}`);
          return scheduleNextForUser(userMail);
        }

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: userMail, pass: pending[0].userPass },
        });

        let sent = 0, failed = 0;

        for (let i = 0; i < pending.length; i += BATCH_SIZE) {
          const batch = pending.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (mail) => {
              try {
                await withTimeout(
                  transporter.sendMail({
                    from: mail.userMail,
                    to: mail.to,
                    subject: mail.subject,
                    html: mail.message,
                    attachments: mail.attachments,
                  }),
                  30000
                );
                mail.status = "sent";
                mail.sentAt = new Date();
                await mail.save();
                sent++;
              } catch (err) {
                failed++;
                mail.retries++;
                if (mail.retries >= MAX_RETRY) {
                  mail.status = "failed";
                }
                await mail.save();
                console.error("Queue send failed:", mail.to, err.message);
              }
            })
          );
          await sleep(BATCH_DELAY);
        }

        const remaining = await MailQueue.countDocuments({
          userMail,
          status: "pending",
        });

        try {
          await transporter.sendMail({
            from: userMail,
            to: userMail,
            subject: "📊 Bulk Mail Report",
            html: `<b>Sent:</b> ${sent}<br><b>Failed:</b> ${failed}<br><b>Remaining:</b> ${remaining}`,
          });
        } catch (e) {
          console.error("Report mail failed:", e.message);
        }

        await MailQueue.deleteMany({
          status: "sent",
          sentAt: { $lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        });

        await Settings.updateOne({ userMail }, { lastRun: new Date() });

        scheduleNextForUser(userMail);
      } catch (err) {
        console.error("Scheduler run error:", err.message);
        scheduleNextForUser(userMail);
      }
    }, Math.max(delay, 0));

    userTasks.set(userMail, timer);
  } catch (err) {
    console.error("Schedule setup error:", err.message);
  }
}

async function startAllSchedulers() {
  try {
    const users = await Settings.find({});
    console.log(`🔁 Starting schedulers for ${users.length} user(s)`);
    users.forEach(u => scheduleNextForUser(u.userMail));
  } catch (err) {
    console.error("startAllSchedulers error:", err.message);
  }
}

module.exports = { scheduleNextForUser, startAllSchedulers };