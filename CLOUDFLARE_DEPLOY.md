# Orderistan on Cloudflare Workers (Free plan) - frontend + API in ONE Worker

No Vercel, no Containers, no Docker, no paid plan. Database stays **MongoDB Atlas**, media stays **Cloudinary**.

```
Browser ──► Cloudflare Worker "orderistan"
             ├─ static files (React/Vite build)  → Assets binding (served without running code)
             └─ /api/*  → Worker → Durable Object "ApiServer" → Express app (core.js) → MongoDB Atlas / Cloudinary / Brevo
Cron Triggers → same Durable Object → /api/cron?job=...
```

## 1. One-time setup (your computer)
```bash
npm install                      # installs wrangler at the repo root
npx wrangler login
npm run install:all              # backend + frontend dependencies
```

## 2. Secrets (never commit them)
Run each command and paste the value when asked:
```bash
npx wrangler secret put MONGODB_URI          # mongodb+srv://user:pass@cluster.mongodb.net/orderistan?retryWrites=true&w=majority
npx wrangler secret put JWT_SECRET           # openssl rand -base64 48   (32+ chars)
npx wrangler secret put CLOUDINARY_URL       # cloudinary://<api_key>:<api_secret>@<cloud_name>
npx wrangler secret put CRON_SECRET          # openssl rand -hex 32
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_SENDER_EMAIL   # a sender verified in Brevo
npx wrangler secret put ADMIN_EMAIL          # first-time owner account only
npx wrangler secret put ADMIN_PASSWORD       # strong (12+ chars); delete it afterwards: npx wrangler secret delete ADMIN_PASSWORD
```
Dashboard alternative: Workers & Pages → orderistan → Settings → Variables and Secrets.
Optional secrets/vars: `BCRYPT_COST`, `DB_CAPACITY_MB`, `STATS_TIMEZONE`, `STORE_TZ_HOURS`, `UPLOAD_IMAGE_REQUEST_MAX_MB`, `UPLOAD_VIDEO_MAX_MB`, `DO_LOCATION_HINT`.
Non-secret settings (`ROOT_DOMAIN`, `SUPPORT_EMAIL`, `ALLOWED_ORIGINS`, ...) are in `wrangler.jsonc` → `vars`. **Edit `ALLOWED_ORIGINS`** to your real `*.workers.dev` URL / custom domain.
Local run: copy `.dev.vars.example` to `.dev.vars`, fill it, then `npm run dev`.

## 3. MongoDB Atlas
- Network Access → allow `0.0.0.0/0` (Workers have no fixed IP).
- The connection string must contain the database name (`.../orderistan?...`). Existing collections and data are untouched.
- If `mongodb+srv://` cannot connect from Workers, use Atlas → Connect → Drivers → **standard** `mongodb://host1,host2,host3/...` string.

## 4. Deploy
```bash
npx wrangler deploy
```
Cloudflare Git build (Workers Builds): Root directory empty, Build command empty (wrangler runs `npm run build`), Deploy command `npx wrangler deploy`.
Check: `https://orderistan.<your-subdomain>.workers.dev/api/health` → `{"status":"ok",...}` (reports env + MongoDB + Cloudinary + Brevo, no secrets).

## 5. Custom domain + seller stores
Add `orderistan.site` to Cloudflare, uncomment `routes` in `wrangler.jsonc`, add a proxied wildcard DNS record `*`, deploy again. Add the domain to `ALLOWED_ORIGINS`.

## Scheduled jobs (replaces Vercel cron + setInterval)
| Cron | Jobs |
|---|---|
| `*/10 * * * *` | subscription expiry + 7/3/1-day warnings, DB heartbeat |
| `0 * * * *` | Cloudinary usage alerts (70/85/95 %) |
| `0 3 * * *` | 120-day chat prune (with Cloudinary photo cleanup) + data backfill |

## Free-plan limits and what they mean here (Cloudflare docs, Nov 2026 - re-check before launch)
- **10 ms CPU per Worker request, 100,000 Worker requests/day, 50 subrequests/request, 5 cron triggers.** Static files do not run the Worker, so only `/api/*` counts. Chat polling (every 4 s per open chat) and the notification badge (every 90 s) DO count: a busy marketplace can reach 100,000 API calls/day. When the limit is hit Cloudflare returns Error 1027 for `/api`.
- The Worker itself only forwards the request. The heavy work (bcrypt, MongoDB TLS, Express) runs in the Durable Object. Cloudflare's docs are ambiguous about the CPU limit of Durable Objects on Free (a table says 30 s, the FAQ says "same as Workers"). **If login/register show Error 1102 / "exceeded resource limits", this is the cause**; the only fixes are a lower `BCRYPT_COST` (min 10 in code), or the $5 Workers Paid plan.
- Memory is 128 MB per isolate, and uploads are buffered in memory: images max 5 MB each and **30 MB per request**, videos **25 MB** (the old limit was 50 MB). Bigger video needs direct browser→Cloudinary upload (not implemented).
- One Durable Object serves the whole API (soft limit ~1,000 requests/s, single-threaded). Fine for a small/medium marketplace; bcrypt hashing is queued (2 at a time).
- The Durable Object's MongoDB connection is dropped after ~1-2 minutes without traffic; the next request pays ~300 ms to reconnect.
- Durable Object free-tier request/duration quotas: not verified by me, check Cloudflare dashboard → Durable Objects → Plans.
