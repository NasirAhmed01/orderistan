// Orderistan API (Express). On Cloudflare it runs inside a Durable Object through node:http (see worker.mjs), so the MongoDB
// connection, the caches and the in-memory rate limiter stay warm between requests. Secrets come from the Worker environment (process.env).
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const { User } = require("./models");
const { mainHostOnly, sanitize } = require("./guards");
const P = require("./password");
const rl = require("./ratelimit");
const U = require("./utils");
const jobs = require("./jobs");
const plans = require("./plans");
const { runStartupCheck, checkEnv } = require("./startup-check");

const isProd = process.env.NODE_ENV === "production";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /put_a_long|replace_this/i.test(process.env.JWT_SECRET)) {
  throw new Error("Set JWT_SECRET (env var) to a random string of 32+ characters.");
}

if (!require("./mailer").configured())
  console.warn(isProd ? "WARNING: BREVO_API_KEY / BREVO_SENDER_EMAIL are not set - sign-up and password-reset e-mails CANNOT be sent." : "Dev mode: Brevo is not configured, one-time codes are printed in this console instead of e-mailed.");

const app = express();
app.disable("x-powered-by");
// worker.mjs overwrites X-Forwarded-For with the real client IP (CF-Connecting-IP), so 1 hop is right on Cloudflare.
const tp = process.env.TRUST_PROXY;
const trust = tp === undefined || tp === "" ? 1 : (isNaN(tp) ? tp : Number(tp));
app.set("trust proxy", trust);
// gzip/brotli is applied by Cloudflare automatically.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"], mediaSrc: ["'self'", "https://res.cloudinary.com"], fontSrc: ["'self'", "data:"], connectSrc: ["'self'"], manifestSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
      ...(isProd ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS: only ROOT_DOMAIN, its store sub-domains, ALLOWED_ORIGINS, and localhost in development (all set in the environment).
const ROOT = (process.env.ROOT_DOMAIN || "").toLowerCase();
// Tolerant parsing: accepts commas/spaces/newlines, surrounding quotes and trailing slashes.
const norm = (x) => String(x).trim().replace(/^["\x27]+|["\x27]+$/g, "").replace(/\/+$/, "").toLowerCase();
// Allowed frontends come ONLY from the environment: ALLOWED_ORIGINS (exact origins, comma/space separated) and ROOT_DOMAIN (+ its sub-domains).
const extraOrigins = (process.env.ALLOWED_ORIGINS || "").split(/[\s,;]+/).map(norm).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / server-to-server
    try {
      const h = new URL(origin).hostname.toLowerCase();
      const ok = extraOrigins.includes(norm(origin)) || (ROOT && (h === ROOT || h.endsWith("." + ROOT))) || (!isProd && (h === "localhost" || h.endsWith(".localhost")));
      cb(null, !!ok);
    } catch { cb(null, false); }
  }
}));
// Diagnostic health check: runs BEFORE the DB middleware and reports what is wrong (no secrets are printed).
// Open https://<your-worker>/api/health -> full env + MongoDB + Cloudinary + Brevo report.
app.get("/api/health", async (_req, res) => {
  try { await init(); }
  catch (e) {
    console.error("❌ /api/health: database/startup failed:", e.message);
    const r = await runStartupCheck({ live: false, print: false });
    return res.status(500).json({ status: "error", stage: "database/startup", message: String(e.message).slice(0, 300), env: r.env });
  }
  const r = await runStartupCheck({ live: true, print: true }).catch((e) => ({ ok: false, error: e.message }));
  res.status(r.ok ? 200 : 500).json({ status: r.ok ? "ok" : "error", service: "Orderistan API", db: "connected", ...r, allowedOrigins: extraOrigins });
});
// Cloudflare Cron Triggers (see wrangler.jsonc) call this route through the Worker's scheduled() handler with CRON_SECRET as Bearer token.
// ?job= picks which jobs run: subscriptions, heartbeat, cloudinary, chat (comma separated) or "all" (default).
app.get("/api/cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ message: "Unauthorized." });
  const want = String(req.query.job || "all").split(",").map((x) => x.trim());
  const run = (n) => want.includes("all") || want.includes(n);
  try {
    await init();
    const out = {};
    if (run("subscriptions")) out.subscriptions = await jobs.checkSubscriptions();
    if (run("cloudinary")) out.cloudinary = await jobs.checkCloudinary().catch((e) => ({ error: e.message }));
    if (run("chat")) { out.chat = await jobs.pruneChat().catch((e) => ({ error: e.message })); await jobs.backfill().catch((e) => { out.backfill = e.message; }); }
    if (run("heartbeat")) await require("./sysmonitor").probe({ persist: true }).catch(() => {});
    console.log("✅ cron finished", JSON.stringify(out));
    res.json({ ok: true, ...out });
  } catch (e) { console.error("❌ cron failed:", e); res.status(500).json({ ok: false, message: e.message }); }
});
app.use((req, res, next) => (req.method === "OPTIONS" ? next() : init().then(() => next(), next))); // DB ready before any route
app.use(express.json({ limit: "200kb" }));
app.use(sanitize); // strips $operators and dotted keys from body/query/params

rl.mount(app);     // login / sign-up / orders / uploads (cluster-safe, per user) + general limit (see ratelimit.js)

app.use("/api/auth", require("./routes/auth"));
app.use("/api/market", require("./routes/market"));
app.use("/api/me", mainHostOnly, require("./routes/me"));
app.use("/api/store", require("./routes/store"));
app.use("/api/seller", mainHostOnly, require("./routes/seller"));
app.use("/api/chat", mainHostOnly, require("./routes/chat"));
app.use("/api/admin", mainHostOnly, require("./routes/admin"));
app.use("/api", require("./routes/common"));
app.use("/api", (_req, res) => res.status(404).json({ message: "API route not found." }));

app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "File is too large (images max 5 MB)." });
  if (err.name === "MulterError") return res.status(400).json({ message: "Invalid upload." });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid request." });
  if (err.code === 11000) return res.status(409).json({ message: "This already exists." });
  if (err.name === "VersionError") return res.status(409).json({ message: "This order was just changed by someone else. Please refresh and try again." });
  if (err.name === "CastError") return res.status(404).json({ message: "Not found." });
  if (err.name === "ValidationError") return res.status(400).json({ message: Object.values(err.errors)[0]?.message || "Invalid data." });
  if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
  if (err.status === 503) return res.status(503).json({ message: err.message });
  console.error(err); res.status(500).json({ message: "Server error. Please try again." });
});

async function seedAdmin() {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: pw, ADMIN_NAME: name } = process.env;
  if (await User.exists({ role: "admin" })) return;
  if (!email || !pw) return console.warn("No admin yet: set ADMIN_EMAIL and a strong ADMIN_PASSWORD in .env, then restart.");
  if (U.isWeakPassword(pw)) return console.error("Admin NOT created: ADMIN_PASSWORD is weak or a default. " + U.WEAK_ADMIN_MSG);
  try {
    await User.create({ name: name || "Orderistan Owner", email: email.toLowerCase(), password: await P.hash(pw), role: "admin" });
    console.log("Owner admin account created for", email);
  } catch (e) { if (e.code !== 11000) throw e; } // another cluster worker created it a moment ago
}


// ---- bootstrap: connect once per Durable Object instance, reuse on every request ----
let ready = null;
function init() {
  if (!ready) ready = connectDB().then(seedAdmin).then(() => plans.seed()).catch((e) => {
    ready = null;
    console.error("❌ Startup FAILED:", e.message);
    if (/MONGODB_URI/.test(e.message)) console.error("   -> MONGODB_URI secret is missing: run `npx wrangler secret put MONGODB_URI`.");
    else if (/ENOTFOUND|querySrv|ECONNREFUSED|ETIMEDOUT|ServerSelection|whitelist|IP/i.test(e.message)) console.error("   -> Cannot reach MongoDB. Atlas > Network Access: allow 0.0.0.0/0, check the username/password, and if mongodb+srv:// fails use the standard mongodb://host1,host2,host3 string.");
    else if (/auth/i.test(e.message)) console.error("   -> MongoDB authentication failed: wrong user/password in MONGODB_URI.");
    throw e;
  });
  return ready;
}
try {
  process.on("unhandledRejection", (e) => console.error("❌ Unhandled promise rejection:", e && e.stack || e));
  process.on("uncaughtException", (e) => console.error("❌ Uncaught exception:", e && e.stack || e));
} catch { /* process events are not available on every runtime */ }
// export the Express app itself (a function) and attach helpers, so it works even if a platform treats this file as the entry point
app.init = init; app.trust = trust; app.app = app;
module.exports = app;
