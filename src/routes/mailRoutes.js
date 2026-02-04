const express = require("express");
const multer = require("multer");
const { sendBulkMail } = require("../controllers/mailController");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/send",
  upload.array("documents"),
  sendBulkMail
);

module.exports = router;
