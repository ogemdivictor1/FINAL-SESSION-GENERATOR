// index.cjs

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fs = require("fs-extra");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// Sessions directory
const SESSIONS_DIR = "./sessions";
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR);
}

// Store active sessions in memory
const sessions = {};

// Start a new session
app.post("/start-session", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  if (sessions[sessionId]) {
    return res.status(400).json({ error: "Session already exists" });
  }

  const sessionPath = `${SESSIONS_DIR}/${sessionId}`;
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sessions[sessionId] = sock;

  res.json({ message: `Session ${sessionId} started` });
});

// Get QR code
app.get("/qr/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const sock = sessions[sessionId];

  if (!sock) {
    return res.status(400).json({ error: "Session not found. Start it first." });
  }

  sock.ev.on("connection.update", async (update) => {
    const { qr } = update;
    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      res.json({ qr: qrImage });
    }
  });
});

// Request pair code
app.post("/pair-code", async (req, res) => {
  const { sessionId, phoneNumber } = req.body;

  if (!sessionId || !phoneNumber) {
    return res.status(400).json({ error: "sessionId and phoneNumber are required" });
  }

  const sock = sessions[sessionId];
  if (!sock) {
    return res.status(400).json({ error: "Session not found. Start it first." });
  }

  try {
    const code = await sock.requestPairingCode(phoneNumber);
    res.json({ pairCode: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Home route
app.get("/", (req, res) => {
  res.send("🚀 Cypher Session Generator is live!");
});

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
