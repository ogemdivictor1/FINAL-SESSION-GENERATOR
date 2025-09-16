// index.cjs

const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs-extra");
const path = require("path");
const qrcode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());
app.use(cookieParser());

const SESSIONS_DIR = path.join(__dirname, "sessions");
fs.ensureDirSync(SESSIONS_DIR);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "CYPHER TOKENS"; // set in Render for security
const sessions = {};

// ✅ Health + root routes (important for Render)
app.get("/", (req, res) => {
  res.send("🚀 Cypher Session Generator is live!");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ Start a WhatsApp session
app.post("/api/start-session", async (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN)
    return res.status(403).json({ error: "Unauthorized" });

  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Session ID required" });

  if (sessions[id]) {
    return res.json({ message: `Session '${id}' already running` });
  }

  try {
    const sessionPath = path.join(SESSIONS_DIR, id);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (connection === "open") {
        console.log(`✅ Session '${id}' connected`);
      } else if (connection === "close") {
        console.log(`❌ Session '${id}' closed`, lastDisconnect?.error);
        delete sessions[id];
      }
      if (qr) {
        sessions[id].qr = qr;
      }
    });

    sessions[id] = { sock, qr: null };
    res.json({ message: `Session '${id}' started` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start session" });
  }
});

// ✅ Get QR code
app.get("/qr/:id", async (req, res) => {
  const id = req.params.id;
  if (!sessions[id]) return res.status(404).send("Session not found");
  if (!sessions[id].qr) return res.status(400).send("QR not generated yet");

  const qrImage = await qrcode.toDataURL(sessions[id].qr);
  res.send(`<img src="${qrImage}" alt="Scan QR to connect WhatsApp"/>`);
});

// ✅ Get Pair Code (for phone number linking)
app.post("/api/pair-code", async (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN)
    return res.status(403).json({ error: "Unauthorized" });

  const { id, number } = req.body;
  if (!id || !number)
    return res.status(400).json({ error: "Session ID and number required" });

  try {
    const session = sessions[id];
    if (!session) return res.status(404).json({ error: "Session not running" });

    const code = await session.sock.requestPairingCode(number);
    res.json({ message: `Pair code for ${number}: ${code}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate pair code" });
  }
});

// ✅ Serve frontend (index.html in public folder)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
