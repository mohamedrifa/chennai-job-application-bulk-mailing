const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mailRoutes = require("./routes/mailRoutes");
const { startAllSchedulers } = require("./jobs/dailyMailer"); // ✅ top-level import

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/api/mail", mailRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    startAllSchedulers(); // ✅ actually call it after DB is ready
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`🚀 Mail Server running on port ${PORT}`)
    );
  })
  .catch(err => console.error("❌ Mongo Error:", err));