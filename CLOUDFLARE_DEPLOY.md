# Orderistan - frontend + backend, all on Cloudflare (one Worker)

How it works: one Worker `orderistan`
- serves the React site (`orderistan-frontend/dist`)
- sends every `/api/*` request to the Express backend running in a Cloudflare Container (`orderistan-backend/Dockerfile`)
- runs the daily cron (03:00 UTC) -> `/api/cron`
Same origin => no CORS setup, `VITE_API_URL` stays empty. MongoDB Atlas, Cloudinary and Brevo stay as they are.

## Needs
- Workers **Paid** plan ($5/month) - Containers are not available on Free.
- Atlas > Network Access: allow 0.0.0.0/0 (Container IPs are not fixed).

## 1. Runtime variables (Workers & Pages > orderistan > Settings > **Variables and Secrets**, NOT "Build variables")
Build variables only exist during the build; the backend reads the ones in Variables and Secrets.
Add as **Secret**: MONGODB_URI, JWT_SECRET (32+ chars), CLOUDINARY_URL, BREVO_API_KEY, CRON_SECRET, ADMIN_PASSWORD
Add as **Text**: ROOT_DOMAIN (orderistan.site), SUPPORT_EMAIL, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, ADMIN_EMAIL, ADMIN_NAME, TRIAL_DAYS, JWT_EXPIRES_IN, ADMIN_JWT_EXPIRES_IN (optional: BCRYPT_COST, DB_CAPACITY_MB, STATS_TIMEZONE, STORE_TZ_HOURS)
Do NOT set ALLOWED_ORIGINS / TRUST_PROXY (not needed here). Secrets set in the dashboard survive deploys.
If secrets were ever shared in a zip/chat, rotate them first (see MERGE_AND_AUDIT.md).

## 2. Deploy
GitHub + Workers Builds: Root directory empty, Deploy command `npx wrangler deploy` (Build command can stay empty: wrangler builds the frontend itself).
Or from your PC (Docker Desktop running): `npm install && npm run deploy`.
First deploy takes a few minutes (image build). Check: `https://orderistan.orderistan.workers.dev/api/health`

## 3. Custom domain
Add orderistan.site to Cloudflare, uncomment `routes` in wrangler.jsonc, deploy again. Seller stores (`<slug>.orderistan.site`) need the wildcard route + a proxied DNS record `*`.

## Notes
- Container sleeps after 30 min idle; the next request waits a few seconds (cold start). Change `sleepAfter` in worker.js to keep it warmer (costs more).
- 1 container instance (`standard-1`) - change `instance_type` / `max_instances` in wrangler.jsonc if traffic grows.
- Old Workers `orderistan`, `orderistan1`, `orderistan2` can be deleted in the dashboard.
