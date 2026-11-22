const jwt = require("jsonwebtoken");
const multer = require("multer");
const crypto = require("crypto");
const { User, Store } = require("./models");
const cache = require("./cache");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Verifies the token AND re-checks the user, so role, suspension and revoked sessions are always honoured.
// The user row is cached for 15 s (and dropped immediately on any write made by this process), so a page load does not cost a DB read per request.
const protect = wrap(async (req, res, next) => {
  const [scheme, tok] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !tok) return res.status(401).json({ message: "Please log in." });
  let payload;
  try { payload = jwt.verify(tok, process.env.JWT_SECRET, { algorithms: ["HS256"] }); }
  catch { return res.status(401).json({ message: "Session expired. Please log in again." }); }
  let user = cache.users.get(String(payload.sub));
  if (!user) {
    user = await User.findById(payload.sub).lean();   // password has select:false, so it is never loaded
    if (user) cache.users.set(String(user._id), user);
  }
  if (!user) return res.status(401).json({ message: "Account no longer exists." });
  if ((payload.tv || 0) !== (user.tokenVersion || 0) || payload.role !== user.role)
    return res.status(401).json({ message: "Session expired. Please log in again." });
  if (user.status === "suspended") return res.status(403).json({ message: "This account is suspended. Contact the administrator." });
  req.user = user; next();
});
const allowRoles = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "You do not have permission to do this." });

// Which store is this request for? Subdomain (shop.<your-domain>) or X-Store-Slug header (path mode / dev).
function slugFromReq(req) {
  const root = (process.env.ROOT_DOMAIN || "").toLowerCase();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0].toLowerCase();
  if (root && host.endsWith("." + root)) {
    const s = host.slice(0, -root.length - 1);
    if (s && s !== "www" && !s.includes(".")) return s;
  }
  if (host.endsWith(".localhost")) return host.split(".")[0];
  return String(req.headers["x-store-slug"] || "").toLowerCase().trim().slice(0, 40) || null;
}
// Store lookups are cached for 30 s (cleared at once when the store is saved in this process).
const tenant = wrap(async (req, res, next) => {
  const slug = slugFromReq(req);
  if (!slug) return res.status(400).json({ message: "No store specified." });
  let lean = cache.stores.get(slug);
  if (!lean) {
    lean = await Store.findOne({ slug }).lean();
    if (lean) cache.stores.set(slug, lean);
  }
  if (!lean) return res.status(404).json({ message: "Store not found." });
  req.store = Store.hydrate(lean); // fresh document object per request (isLive() is evaluated against the clock every time)
  next();
});
// Host header only (never X-Forwarded-Host, which a client can fake). Returns the store slug when the request came in on a store domain.
function tenantHost(req) {
  const root = (process.env.ROOT_DOMAIN || "").toLowerCase();
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (root && host.endsWith("." + root)) {
    const s = host.slice(0, -root.length - 1);
    if (s && s !== "www" && !s.includes(".")) return s;
  }
  return host.endsWith(".localhost") ? host.split(".")[0] : null;
}
// Admin / seller / customer-account APIs only exist on the main domain, never on seller store domains.
const mainHostOnly = (req, res, next) => tenantHost(req) ? res.status(404).json({ message: "API route not found." }) : next();

// Blocks MongoDB operator injection ({"$ne": ...}, {"$gt": ...}, dotted keys) in body, query and params.
function stripOperators(o, depth = 0) {
  if (!o || typeof o !== "object" || depth > 8) return;
  for (const k of Object.keys(o)) {
    if (k.startsWith("$") || k.includes(".") || k === "__proto__" || k === "constructor" || k === "prototype") delete o[k];
    else stripOperators(o[k], depth + 1);
  }
}
const sanitize = (req, _res, next) => { stripOperators(req.body); stripOperators(req.query); stripOperators(req.params); next(); };

const liveOnly = (req, res, next) =>
  req.store.isLive() ? next() : res.status(403).json({ closed: true, message: "This store is currently unavailable." });

// ---- uploads --------------------------------------------------------------------------------------------------------------
// Cloudflare Workers has no disk, so multipart files are kept in memory (multer memoryStorage) and sent to Cloudinary by the route.
// Memory is limited (128 MB per isolate), so the TOTAL size of one upload request is capped before multer even starts reading.
const storage = multer.memoryStorage();
const imgOnly = (req, f, cb) => /^image\/(jpeg|png|webp|gif)$/.test(f.mimetype) ? cb(null, true) : cb(Object.assign(new Error("Only JPG, PNG, WEBP or GIF images are allowed."), { status: 400 }));
const vidOnly = (req, f, cb) => /^video\/(mp4|quicktime|webm)$/.test(f.mimetype) ? cb(null, true) : cb(Object.assign(new Error("Only MP4, MOV or WEBM videos are allowed."), { status: 400 }));
const MB = 1024 * 1024;
const IMG_REQ_MAX = Number(process.env.UPLOAD_IMAGE_REQUEST_MAX_MB || 30) * MB;   // all photos of one request together
const VID_REQ_MAX = Number(process.env.UPLOAD_VIDEO_MAX_MB || 25) * MB;           // one video
const rawUpload = multer({ storage, limits: { fileSize: 5 * MB, files: 24, fields: 60, parts: 90 }, fileFilter: imgOnly });
const rawVideo = multer({ storage, limits: { fileSize: VID_REQ_MAX, files: 1, fields: 20, parts: 30 }, fileFilter: vidOnly });

// Rejects oversized multipart requests from the Content-Length header (a chunked upload without a length is refused too).
const capBody = (max) => (req, res, next) => {
  const len = Number(req.headers["content-length"]);
  if (!Number.isFinite(len)) return res.status(411).json({ message: "Upload size is required." });
  if (len > max + 512 * 1024) return res.status(413).json({ message: `Upload is too large (max ${Math.round(max / MB)} MB in total).` });
  next();
};
const wrapMulter = (m, max) => ({
  single: (n) => [capBody(max), m.single(n)],
  array: (n, c) => [capBody(max), m.array(n, c)],
  fields: (f) => [capBody(max), m.fields(f)]
});
const upload = wrapMulter(rawUpload, IMG_REQ_MAX);
const uploadVideo = wrapMulter(rawVideo, VID_REQ_MAX);

module.exports = { wrap, protect, allowRoles, tenantHost, mainHostOnly, sanitize, slugFromReq, tenant, liveOnly, upload, uploadVideo };
