const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const mailRoutes = require("./routes/mailRoutes");
require("./jobs/dailyMailer"); // <-- add this line

const app = express();

// allow all origins
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// allow large payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api/mail", mailRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} version 4`));
