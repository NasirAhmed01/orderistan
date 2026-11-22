// Cloudinary media layer for Cloudflare Workers. Talks to Cloudinary's REST API with fetch() and Node `crypto` signatures
// (the old `cloudinary` npm SDK streamed files from disk and used Node sockets, which do not exist on Workers).
// The API secret lives ONLY in the CLOUDINARY_URL Worker secret and never reaches the browser.
//   - Public media (logos, banners, product photos/videos): delivered from Cloudinary's CDN, auto format + auto quality.
//   - Private media (payment screenshots): stored as type "authenticated". The raw URL is useless without a signature,
//     and only this server can sign it, after checking that the requester is the buyer / store owner / admin.
// Uploads arrive in memory (multer memoryStorage, see guards.js) and are sent to Cloudinary as multipart/form-data.
const crypto = require("crypto");
const { fail } = require("./utils");

const ROOT = "orderistan";
let CFG = null;
function cfg() { // read lazily: Worker secrets are not available when the module is first parsed
  if (CFG) return CFG;
  const m = /^cloudinary:\/\/(\d+):([^@]+)@(.+)$/.exec(String(process.env.CLOUDINARY_URL || "").trim());
  if (!m) throw new Error("Set CLOUDINARY_URL secret (cloudinary://<api_key>:<api_secret>@<cloud_name>).");
  return (CFG = { key: m[1], secret: m[2], cloud: m[3] });
}
const API = () => `https://api.cloudinary.com/v1_1/${cfg().cloud}`;
const sha1 = (s, enc) => crypto.createHash("sha1").update(s).digest(enc);
// Cloudinary API signature: sorted "k=v" pairs joined with & + api secret, SHA-1 hex.
const sign = (p) => sha1(Object.keys(p).filter((k) => p[k] !== undefined && p[k] !== "").sort().map((k) => `${k}=${p[k]}`).join("&") + cfg().secret, "hex");
const now = () => Math.floor(Date.now() / 1000);

// Never trust the browser's Content-Type: check the real file signature.
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image";                                   // JPEG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image"; // PNG
  if (buf.subarray(0, 4).toString() === "GIF8") return "image";                                                // GIF
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image";   // WEBP
  if (buf.subarray(4, 8).toString() === "ftyp") return "video";                                                // MP4 / MOV
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video";                // WEBM
  return null;
}
const head = async (file) => (file?.buffer ? file.buffer.subarray(0, 16) : null);

async function send(file, kind, params) {
  const { key, cloud } = cfg();
  const base = { timestamp: now(), overwrite: "false", unique_filename: "false", ...params };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) fd.append(k, String(v));
  fd.append("api_key", key);
  fd.append("signature", sign(base));
  fd.append("file", new Blob([file.buffer]), "upload");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${kind}/upload`, { method: "POST", body: fd, signal: AbortSignal.timeout(60000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Cloudinary HTTP ${res.status}`);
  return j;
}

const rid = () => crypto.randomBytes(16).toString("hex");
const IMG_IN = "c_limit,h_2000,w_2000/fl_strip_profile"; // cap size, strip EXIF/GPS
const wrapErr = (e) => { console.error("cloudinary:", e.message || e); return fail(502, "Upload failed. Please try again."); };

// kind: "image" | "video". Returns the CDN URL to store in MongoDB.
async function uploadPublic(file, { folder = "public", kind = "image" } = {}) {
  if (sniff(await head(file)) !== kind) throw fail(400, kind === "video" ? "Only MP4, MOV or WEBM videos are allowed." : "Only JPG, PNG, WEBP or GIF images are allowed.");
  try {
    const r = await send(file, kind, kind === "video"
      ? { folder: `${ROOT}/${folder}`, public_id: rid(), allowed_formats: "mp4,mov,webm" }
      : { folder: `${ROOT}/${folder}`, public_id: rid(), allowed_formats: "jpg,png,webp,gif", transformation: IMG_IN });
    return `https://res.cloudinary.com/${cfg().cloud}/${kind}/upload/f_auto,q_auto/v${r.version}/${r.public_id}`;
  } catch (e) { throw wrapErr(e); }
}

// Uploads several files. If one fails, the ones that already went up are deleted again (no orphans in Cloudinary).
async function uploadManyPublic(files, opts) {
  const res = await Promise.allSettled((files || []).map((f) => uploadPublic(f, opts)));
  const ok = res.filter((x) => x.status === "fulfilled").map((x) => x.value);
  const bad = res.find((x) => x.status === "rejected");
  if (bad) { ok.forEach(removePublic); throw bad.reason; }
  return ok;
}

// Returns the private public_id to store in MongoDB (NOT a URL).
const PRIVATE_FOLDERS = ["payments", "chat", "subs"];   // order screenshots, admin<->seller chat photos, renewal payment proofs
async function uploadPrivate(file, folder = "payments") {
  if (!PRIVATE_FOLDERS.includes(folder)) throw fail(500, "Bad upload folder.");
  if (sniff(await head(file)) !== "image") throw fail(400, "Only JPG, PNG, WEBP or GIF images are allowed.");
  try {
    const r = await send(file, "image", { folder: `${ROOT}/${folder}`, public_id: rid(), type: "authenticated", allowed_formats: "jpg,png,webp,gif", transformation: IMG_IN });
    return r.public_id;
  } catch (e) { throw wrapErr(e); }
}

const idFromUrl = (u) => { const m = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:.*\/)?(orderistan\/[^?]+?)(?:\.\w+)?(?:\?.*)?$/.exec(String(u || "")); return m ? { id: m[2], kind: m[1] } : null; };
async function destroy(kind, id, type) {
  const { key } = cfg();
  const p = { public_id: id, timestamp: now(), invalidate: "true", ...(type ? { type } : {}) };
  const res = await fetch(`${API()}/${kind}/destroy`, { method: "POST", body: new URLSearchParams({ ...p, api_key: key, signature: sign(p) }), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Cloudinary destroy HTTP ${res.status}`);
}
const removePublic = (url) => { const p = idFromUrl(url); if (p) destroy(p.kind, p.id).catch((e) => console.error("cloudinary delete:", e.message)); };
const isPrivateId = (id) => /^orderistan\/(payments|chat|subs)\/[a-f0-9]{32}$/.test(String(id || ""));
const removePrivate = (id) => { if (isPrivateId(id)) destroy("image", id, "authenticated").catch((e) => console.error("cloudinary delete:", e.message)); };

// Signed delivery URL for an "authenticated" image. Signature = first 8 chars of base64url(SHA-1("<transformation>/<public_id>" + secret)).
function privateUrl(id, transformation) {
  const { cloud, secret } = cfg();
  const sig = sha1((transformation ? transformation + "/" : "") + id + secret, "base64").replace(/\+/g, "-").replace(/\//g, "_").slice(0, 8);
  return `https://res.cloudinary.com/${cloud}/image/authenticated/s--${sig}--/${transformation ? transformation + "/" : ""}v1/${id}`;
}

// Sends a private image through our server (after the caller has done the permission check).
// It is downscaled by Cloudinary first (max 1600px wide, auto quality). It is never cached by the browser.
async function streamPrivate(res, id) {
  if (!isPrivateId(id)) return res.status(404).json({ message: "No screenshot." });
  let up = null;
  for (const url of [privateUrl(id, "c_limit,f_auto,q_auto,w_1600"), privateUrl(id, "")]) {
    try { up = await fetch(url, { signal: AbortSignal.timeout(15000) }); } catch { up = null; }
    if (up?.ok) break;
  }
  if (!up?.ok) return res.status(404).json({ message: "No screenshot." });
  const buf = Buffer.from(await up.arrayBuffer());
  // Payment proofs are personal: never kept in any cache (a shared computer must not show the previous person's screenshot).
  res.set({ "Content-Type": up.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" });
  res.end(buf);
}

async function ping() {
  const { key, secret } = cfg();
  const r = await fetch(`${API()}/ping`, { headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Cloudinary ping HTTP ${r.status}`);
  return cfg().cloud;
}

// Account usage from Cloudinary's Admin API (storage, bandwidth, transformations, credits). Cached for 5 minutes because the API is rate limited.
let usageMemo = { at: 0, data: null };
const metric = (m) => (m && typeof m === "object" ? { usage: Number(m.usage) || 0, limit: Number(m.limit) || 0, percent: m.used_percent != null ? Number(m.used_percent) : (m.limit ? (m.usage / m.limit) * 100 : null), credits: m.credits_usage != null ? Number(m.credits_usage) : null } : { usage: 0, limit: 0, percent: null, credits: null });
async function usage(force = false) {
  if (!force && usageMemo.data && Date.now() - usageMemo.at < 300000) return usageMemo.data;
  const { key, secret } = cfg();
  const res = await fetch(`${API()}/usage`, { headers: { Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Cloudinary usage HTTP ${res.status}`);
  const r = await res.json();
  const m = { storage: metric(r.storage), bandwidth: metric(r.bandwidth), transformations: metric(r.transformations), objects: metric(r.objects), requests: Number(r.requests) || 0 };
  const credits = r.credits ? { usage: Number(r.credits.usage) || 0, limit: Number(r.credits.limit) || 0, percent: r.credits.used_percent != null ? Number(r.credits.used_percent) : null } : null;
  const percents = [credits?.percent, m.storage.percent, m.bandwidth.percent, m.transformations.percent].filter((x) => typeof x === "number" && Number.isFinite(x));
  const data = { plan: r.plan || "", updated: r.last_updated || r.date_requested || null, ...m, credits, resources: Number(r.resources) || 0, derived: Number(r.derived_resources) || 0,
    percent: percents.length ? Math.max(...percents) : null };
  usageMemo = { at: Date.now(), data };
  return data;
}

module.exports = { usage, uploadPublic, uploadManyPublic, uploadPrivate, removePublic, removePrivate, streamPrivate, isPrivateId, sniff, ping };
