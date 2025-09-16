import express from "express";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode"; // for generating QR as image
import qrcodeTerminal from "qrcode-terminal"; // for terminal QR

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Your Admin Token
const ADMIN_TOKEN = "CYPHER DEALS";

// Store last QR
let latestQR = null;

// Start WhatsApp bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true, // show QR in Render logs/console
  });

  sock.ev.on("creds.update", saveCreds);

  // Capture QR when it is generated
  sock.ev.on("connection.update", async (update) => {
    const { qr, connection } = update;

    if (qr) {
      latestQR = await qrcode.toDataURL(qr);
      qrcodeTerminal.generate(qr, { small: true });
      console.log("📱 Scan this QR with your WhatsApp.");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp bot connected successfully!");
    }

    if (connection === "close") {
      console.log("❌ Connection closed. Reconnecting...");
      startBot();
    }
  });

  return sock;
}

startBot();

// --- Web API ---
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Cypher Pairs</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            background: #0f3460;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          }
          h1 {
            margin-bottom: 20px;
            font-size: 28px;
          }
          img {
            margin-top: 20px;
            border: 5px solid #e94560;
            border-radius: 15px;
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 Cypher Pairs</h1>
          ${
            latestQR
              ? `<img src="${latestQR}" alt="Scan QR to Pair"/>`
              : "<p>⚡ Waiting for QR to be generated... Check logs if nothing shows.</p>"
          }
        </div>
      </body>
    </html>
  `);
});

// Secure admin QR endpoint
app.get("/qr", (req, res) => {
  const token = req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).send("❌ Unauthorized: Invalid Admin Token.");
  }

  if (!latestQR) {
    return res.send("⚡ No QR generated yet. Wait and refresh.");
  }

  res.send(`
    <html>
      <body style="text-align:center; font-family:sans-serif;">
        <h2>Admin QR Code</h2>
        <img src="${latestQR}" alt="QR Code"/>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));    logger,
    browser: ["Cypher Pairs", "Safari", "3.0"],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  // save creds when updated
  sock.ev.on("creds.update", saveCreds);

  // handle QR and connection
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      const qrFile = path.join(authDir, "qr.txt");
      await fs.writeFile(qrFile, qr);
      console.log(`[${id}] QR code generated`);
    }

    // connection status handling
    if (connection === "open") {
      try {
        await fs.remove(path.join(authDir, "qr.txt"));
      } catch (e) {}
      console.log(`✅ [${id}] Session connected successfully!`);

      // write connected.json
      await fs.writeJson(path.join(authDir, "connected.json"), {
        connected: true,
        time: Date.now(),
      });
    }

    if (connection === "connecting") {
      console.log(`⏳ [${id}] Session is connecting...`);
    }

    if (connection === "close") {
      console.log(`❌ [${id}] Session closed`);
    }
  });

  sessions[id] = sock;
}

// API routes
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// generate new session
app.get("/pair/:id", async (req, res) => {
  const { id } = req.params;

  if (!sessions[id]) {
    await startSock(id);
  }

  // wait a bit for QR to generate
  setTimeout(async () => {
    const qrPath = path.join(sessionFolder, id, "qr.txt");
    if (fs.existsSync(qrPath)) {
      const qr = await fs.readFile(qrPath, "utf8");
      const qrImage = await qrcode.toDataURL(qr);
      res.send(`<img src="${qrImage}" alt="QR Code"/>`);
    } else {
      res.send("QR not available, maybe already connected.");
    }
  }, 2000);
});

// download session zip
app.get("/session/:id/download", async (req, res) => {
  const { id } = req.params;
  const zipPath = path.join(sessionFolder, `${id}.zip`);

  // create zip of session folder
  const archiver = await import("archiver");
  const archive = archiver.default("zip", { zlib: { level: 9 } });

  res.attachment(`${id}.zip`);
  archive.directory(path.join(sessionFolder, id), false);
  archive.pipe(res);
  await archive.finalize();
});

app.listen(port, () => {
  console.log(`🚀 Cypher Pairs server running on port ${port}`);
});    res.status(401).json({ ok: false, message: "Unauthorized. Provide ?token= or X-ADMIN-TOKEN header." });
    return false;
  }
  return true;
}

/* Start or reuse socket for a given id */
async function startSessionSocket(id) {
  if (sockets.has(id)) return sockets.get(id);

  const sessionFolder = path.join(SESSIONS_DIR, id);
  fs.ensureDirSync(sessionFolder);

  // Baileys multi-file auth state for this session folder
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const version = await fetchLatestBaileysVersion().catch(() => [2, 2204, 13]);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  // save creds when update
  sock.ev.on("creds.update", saveCreds);

  // handle connection updates - QR and status
  sock.ev.on("connection.update", async (update) => {
    try {
      // QR string while pairing
      if (update.qr) {
        // save qr text in session folder
        await fs.writeFile(path.join(sessionFolder, "qr.txt"), update.qr, "utf-8");
      }

      // when open means authenticated
      if (update.connection === "open") {
        // remove qr file after login
        try { await fs.remove(path.join(sessionFolder, "qr.txt")); } catch(e){}
        console.log(`[${id}] authenticated and open`);
      }

      // when closed
      if (update.connection === "close") {
        console.log(`[${id}] connection closed`, update.lastDisconnect?.error?.output || update);
        // remove socket instance, will be recreated on next request
        if (sockets.has(id)) sockets.delete(id);
      }
    } catch (e) {
      console.error("connection.update handler error", e);
    }
  });

  // small message debug (do not expose sensitive data)
  sock.ev.on("messages.upsert", (m) => {
    console.log(`[${id}] messages.upsert type=${m?.type}`);
  });

  sockets.set(id, { sock, folder: sessionFolder });
  return sockets.get(id);
}

/* Endpoint: home page */
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

/* API: start a session for an id (creates folder). Protected. */
app.post("/api/start-session", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.body.id;
  if (!id) return res.status(400).json({ ok: false, message: "Missing id in body" });
  try {
    await startSessionSocket(id);
    return res.json({ ok: true, message: `Session ${id} started (check /qr/${id})` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* API: get QR image for id (if pairing via QR). Public but recommended to protect. */
app.get("/qr/:id", async (req, res) => {
  const id = req.params.id;
  const sessionFolder = path.join(SESSIONS_DIR, id);
  const qrPath = path.join(sessionFolder, "qr.txt");
  if (!fs.existsSync(qrPath)) {
    return res.status(404).send(`<html><body style="font-family:Arial">
      <h3>No QR available for id: ${id}</h3>
      <p>Make sure you started a session with POST /api/start-session (admin).</p>
      </body></html>`);
  }
  const qrStr = await fs.readFile(qrPath, "utf-8");
  const dataUrl = await qrcode.toDataURL(qrStr);
  return res.send(`<html><body style="font-family:Arial;text-align:center;padding:20px">
    <h2>Scan QR for id: ${id}</h2>
    <img src="${dataUrl}" alt="qr" />
    <p>Or copy the QR string below to a QR app:</p>
    <textarea style="width:90%;height:120px">${qrStr}</textarea>
    </body></html>`);
});

/* API: request Pairing Code (Pair code works for a phone number).
   Protected endpoint because pair codes are sensitive. */
app.post("/api/pair-code", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { id, number } = req.body;
  if (!id || !number) return res.status(400).json({ ok: false, message: "Missing id or number" });

  try {
    const session = await startSessionSocket(id);
    const sock = session.sock;

    // If already registered, return message
    if (sock?.authState?.creds?.registered) {
      return res.json({ ok: false, message: "Session already registered (authenticated)." });
    }

    // requestPairingCode function - Baileys provides pair code flow in recent versions.
    // This call asks WhatsApp to create a pairing code for the number you provided.
    // The owner of that phone number must open WhatsApp -> Linked Devices -> Link a Device -> Link with Phone Number
    // and then enter this code shown below.
    const result = await sock.requestPairingCode(number);
    // result typically contains { code: '123456', expiresInSeconds: 120, method: 'sms' } or similar
    // We save the result to disk so UI can read
    await fs.writeJson(path.join(session.folder, "pair_code.json"), result, { spaces: 2 });

    return res.json({ ok: true, pairing: result, message: "Pair code created. Owner must enter it in WhatsApp -> Linked Devices -> Link with phone number." });
  } catch (e) {
    console.error("pair-code error", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* API: get pair-code info for id (admin) */
app.get("/api/pair-code/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const sessionFolder = path.join(SESSIONS_DIR, id);
  const p = path.join(sessionFolder, "pair_code.json");
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false, message: "No pair code found for this id" });
  const data = fs.readJsonSync(p);
  res.json({ ok: true, data });
});

/* API: download session JSON for id (auth files stored in folder). Protected. */
app.get("/api/download-session/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const sessionFolder = path.join(SESSIONS_DIR, id);
  if (!fs.existsSync(sessionFolder)) return res.status(404).json({ ok: false, message: "No session folder" });

  // zip or produce JSON: for simplicity we collect all files inside folder and return as JSON object
  const files = fs.readdirSync(sessionFolder);
  const out = {};
  for (const f of files) {
    const full = path.join(sessionFolder, f);
    out[f] = fs.readFileSync(full, "utf-8");
  }
  res.json({ ok: true, sessionFiles: out });
});

/* API: session as base64 for id (protected) */
app.get("/api/session-base64/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const sessionStateFile = path.join(SESSIONS_DIR, id, "creds.json"); // one Baileys file (multi-file stores files)
  if (!fs.existsSync(sessionStateFile)) return res.status(404).json({ ok: false, message: "No creds.json yet for this id" });
  const data = fs.readFileSync(sessionStateFile);
  const b64 = Buffer.from(data).toString("base64");
  res.json({ ok: true, base64: b64 });
});

/* API: check status (is authenticated?) */
app.get("/api/status/:id", async (req, res) => {
  const id = req.params.id;
  const session = sockets.get(id);
  const folder = path.join(SESSIONS_DIR, id);
  const isAuth = fs.existsSync(path.join(folder, "creds.json"));
  return res.json({ ok: true, id, inMemory: !!session, hasCreds: isAuth });
});

/* Start server */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CYPHER PAIRS server running on http://localhost:${PORT}`);
  console.log(`Set ADMIN_TOKEN env to protect sensitive endpoints.`);
});
