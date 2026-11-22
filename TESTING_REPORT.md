# Testing report (honest)

This migration was written in a sandbox WITHOUT internet access: `npm install`, the frontend build, `wrangler dev`/`deploy` and any
connection to MongoDB Atlas, Cloudinary or Brevo were impossible. Nothing below marked "NOT TESTED" has been executed.

| # | Item | Status |
|---|---|---|
| 1 | Frontend production build | NOT TESTED (no npm network). Frontend source changed only in `.env.production`/`.env.example`/comment in `api.js`. |
| 2 | Worker build + wrangler config | NOT TESTED. `worker.mjs` passes `node --check` (syntax only). |
| 3 | Worker startup | NOT TESTED |
| 4 | MongoDB connectivity | NOT TESTED |
| 5-7 | Customer / seller / admin register + login | NOT TESTED (risk: bcryptjs CPU on Free plan, see CLOUDFLARE_DEPLOY.md) |
| 8-12 | Store, products, storefront, cart, checkout, orders | NOT TESTED (route code unchanged) |
| 13 | Cloudinary upload | NOT TESTED (new fetch-based implementation) |
| 14 | Private payment proof upload + access | NOT TESTED (signed URL code is new, see risks) |
| 15 | Chat | NOT TESTED (HTTP polling, route code unchanged) |
| 16 | OTP / e-mail | NOT TESTED (code unchanged, Brevo uses fetch) |
| 17 | Subscriptions | NOT TESTED |
| 18 | Scheduled tasks | NOT TESTED (new cron wiring) |
| 19 | CORS / API routing | NOT TESTED |
| - | JS syntax of edited backend modules (`core, cloud, guards, password, utils, startup-check, db, models, jobs, sysmonitor, worker.mjs`) | PASSED (node parse) |
| - | `cloud.js` helpers `sniff()` (PNG/MP4/junk) and `isPrivateId()` | PASSED (run locally) |

## Known risks to check first on your first deploy
1. Express + multer on `node:http` inside a Durable Object (Cloudflare supports Express; multipart via busboy is unverified here).
2. Mongoose 9 with the Workers `node:net`/`node:tls` support and `mongodb+srv://` DNS.
3. `cloud.js`: Cloudinary upload signature, and the signed URL for private (authenticated) images (SHA-1, 8-char signature, `v1` version segment). If payment screenshots show "No screenshot", this is the place.
4. CPU limit (bcrypt) on the Free plan.
5. `package-lock.json` of the backend was removed (dependencies changed): `npm install` creates a new one, commit it.
