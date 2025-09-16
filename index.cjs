const express = require("express");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const ADMIN_TOKEN = "CYPHER TOKENS"; // secure this better if you can
const PORT = process.env.PORT || 3000;

let sessions = {}; // keep track of running sessions

// Start a new session
app.post("/api/start-session", async (req, res) => {
  const { token } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: "Invalid token" });

  const { id } = req.body;
  if (!id) return res.status(400).json({ message: "Missing session ID" });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`./auth/${id}`);
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);

    sessions[id] = sock;
    return res.json({ message: `Session ${id} started.` });
  } catch (err) {
    console.error("Start session error:", err);
    return res.status(500).json({ message: "Failed to start session", error: err.toString() });
  }
});

// Generate a pair code
app.post("/api/pair-code", async (req, res) => {
  const { token } = req.query;
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: "Invalid token" });

  const { id, number } = req.body;
  if (!id || !number) return res.status(400).json({ message: "Missing session ID or number" });

  const sock = sessions[id];
  if (!sock) return res.status(400).json({ message: "Session not found, start it first." });

  try {
    // ✅ Baileys function to request a pairing code
    const code = await sock.requestPairingCode(number);

    return res.json({ message: "Pair code generated", code });
  } catch (err) {
    console.error("Pair code error:", err);
    return res.status(500).json({ message: "Failed to generate pair code", error: err.toString() });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
