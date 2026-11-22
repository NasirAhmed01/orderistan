// Password hashing with the pure-JS `bcryptjs` (works on Cloudflare Workers). It produces/verifies the same $2a/$2b hashes as the
// old native module, so existing users keep working. Cost 10 is the default; raise it with BCRYPT_COST (10-14).
const impl = require("bcryptjs");
const native = false;

const COST = Math.min(14, Math.max(10, parseInt(process.env.BCRYPT_COST, 10) || 10));

// At most MAX_ACTIVE hashes at once, MAX_QUEUE waiting. Beyond that we answer 503 instead of piling up CPU work (login/register flood).
const MAX_ACTIVE = 2, MAX_QUEUE = 60;
let active = 0; const queue = [];
function slot() {
  if (active < MAX_ACTIVE) { active++; return Promise.resolve(); }
  if (queue.length >= MAX_QUEUE) return Promise.reject(Object.assign(new Error("Server is busy. Please try again in a moment."), { status: 503 }));
  return new Promise((res) => queue.push(res)).then(() => { active++; });
}
function release() { active--; const next = queue.shift(); if (next) next(); }
async function run(fn) { await slot(); try { return await fn(); } finally { release(); } }

const hash = (pw) => run(() => impl.hash(String(pw), COST));
const compare = (pw, h) => run(() => impl.compare(String(pw), h));
// Unknown emails pay the same bcrypt cost (no timing leak). Computed once, on first use (not at module load).
let dummy = null;
module.exports = { hash, compare, COST, native, get DUMMY_HASH() { return dummy || (dummy = impl.hashSync("not-a-real-password", COST)); } };
