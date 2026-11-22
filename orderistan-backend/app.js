// Entry point (Vercel detects this file as the Express app; `npm run dev` uses server.js which requires it too).
// The real application lives in core.js. If core.js crashes while loading (bad/missing env var, missing package...),
// this file does NOT crash: it logs the real reason with console.error and answers every request with a JSON diagnostic.
require("dotenv").config();
const { runStartupCheck } = require("./startup-check");

let exported;
try {
  exported = require("./core");
  console.log("✅ App module loaded (Express ready). MongoDB connects on the first request.");
} catch (e) {
  console.error("❌ Startup crash (module load):", (e && e.stack) || e);
  runStartupCheck({ live: false, print: false }).then((r) => {
    const bad = Object.entries(r.env).filter(([, v]) => v !== "ok");
    console.error("Env problems:\n" + (bad.length ? bad.map(([k, v]) => `   - ${k}: ${v}`).join("\n") : "   (none found - see the error above)"));
  }).catch(() => {});
  const express = require("express");
  const fallback = express();
  fallback.use(async (_req, res) => {
    const r = await runStartupCheck({ live: false, print: false }).catch(() => ({ env: {} }));
    res.status(500).json({ status: "error", stage: "module load", message: String((e && e.message) || e).slice(0, 300), env: r.env });
  });
  fallback.init = () => Promise.reject(e);
  fallback.trust = 1;
  fallback.app = fallback;
  exported = fallback;
}
module.exports = exported;
