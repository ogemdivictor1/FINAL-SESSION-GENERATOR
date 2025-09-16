// index.cjs
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const qrcode = require("qrcode");
const fs = require("fs-extra");
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "cypher"; // set real secret in Render

app.use(express.json());
app.use(cookieParser());

// Serve static frontend from public/
app.use(express.static(path.join(__dirname, "public")));

// Simple secure cookie name
const ADMIN_COOKIE = "admin_session_v1";

// Helper: set admin cookie (HTTP only, sameSite, secure on production)
function setAdminCookie(res) {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.RENDER; // Render sets RENDER env
  res.cookie(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,         // only send over HTTPS in prod
    maxAge: 24 * 60 * 60 * 1000, // 1 day; adjust as needed
  });
}

// Middleware to require admin rights: check cookie or supplied token
function requireAdmin(req, res, next) {
  // 1) cookie
  const cookie = req.cookies?.[ADMIN_COOKIE];
  if (cookie === "1") return next();

  // 2) query token or header fallback (useful for curl)
  const token = (req.query.token || req.headers["x-admin-token"] || req.body?.token);
  if (token && token === ADMIN_TOKEN) return next();

  return res.status(403).json({ ok: false, message: "Forbidden: invalid admin token" });
}

/* Admin login endpoint: sends { token } in JSON body and gets a secure HTTP-only cookie if valid.
   You will enter the token once in the browser; the cookie will keep you authenticated. */
app.post("/admin/login", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, message: "Missing token" });
    if (token !== ADMIN_TOKEN) return res.status(403).json({ ok: false, message: "Invalid token" });

    setAdminCookie(res);
    return res.json({ ok: true, message: "Logged in (cookie set)" });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Admin logout (clears cookie)
app.post("/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true, message: "Logged out" });
});

/* === Example protected admin route ===
   Use requireAdmin to protect your sensitive endpoints.
   Replace or adapt your existing routes (start-session, pair-code, download, etc.)
*/
app.post("/api/start-session", requireAdmin, async (req, res) => {
  const id = req.body?.id;
  if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

  try {
    // Example: create session folder and start socket
    const SESSIONS_DIR = path.join(__dirname, "sessions");
    await fs.ensureDir(SESSIONS_DIR);
    const sessionFolder = path.join(SESSIONS_DIR, id);
    await fs.ensureDir(sessionFolder);

    // Create Baileys auth state for this id (multi-file)
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const version = await fetchLatestBaileysVersion().catch(() => [2, 2204, 13]);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    // Save creds when updated
    sock.ev.on("creds.update", saveCreds);

    // Connection update - write qr and connected status
    sock.ev.on("connection.update", async (update) => {
      const { connection, qr } = update;
      if (qr) {
        await fs.writeFile(path.join(sessionFolder, "qr.txt"), qr);
      }
      if (connection === "open") {
        await fs.writeJson(path.join(sessionFolder, "connected.json"), { connected: true, time: Date.now() }, { spaces: 2 });
      }
      if (connection === "close") {
        try { await fs.remove(path.join(sessionFolder, "qr.txt")); } catch (e) {}
      }
    });

    return res.json({ ok: true, message: `Session ${id} started` });
  } catch (e) {
    console.error("start-session error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Example: pair-code request (protected)
app.post("/api/pair-code", requireAdmin, async (req, res) => {
  const { id, number } = req.body || {};
  if (!id || !number) return res.status(400).json({ ok: false, message: "Missing id or number" });

  try {
    // For simplicity: mimic pair-code behavior (Baileys has requestPairingCode)
    const result = { code: Math.floor(100000 + Math.random() * 900000).toString(), expiresInSeconds: 120 };
    const SESSIONS_DIR = path.join(__dirname, "sessions");
    const sessionFolder = path.join(SESSIONS_DIR, id);
    await fs.ensureDir(sessionFolder);
    await fs.writeJson(path.join(sessionFolder, "pair_code.json"), result, { spaces: 2 });

    return res.json({ ok: true, pairing: result, message: `Pair code requested for ${number}` });
  } catch (e) {
    console.error("pair-code error", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Example: get QR image (no admin required to view QR; adjust if needed)
app.get("/qr/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const sessionFolder = path.join(__dirname, "sessions", id);
    const p = path.join(sessionFolder, "qr.txt");
    if (!await fs.pathExists(p)) return res.status(404).send("No QR found for this session");
    const qrText = await fs.readFile(p, "utf8");
    const dataUrl = await qrcode.toDataURL(qrText);
    res.send(`<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#111827;color:#fff"><div><img src="${dataUrl}" style="max-width:90vw;max-height:90vh" alt="QR"/><p style="text-align:center">Scan with WhatsApp -> Linked Devices -> Link a Device -> Link with phone number</p></div></body></html>`);
  } catch (e) {
    console.error("qr error", e);
    res.status(500).send(e.message);
  }
});

// Health root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Cypher Pairs server running on port ${PORT}`);
});
