// ONE Cloudflare Worker for the whole site:
//   - frontend (dist) is served by Workers Assets
//   - /api/*  -> this file -> Express backend running in a Cloudflare Container (orderistan-backend/Dockerfile)
//   - cron (wrangler.jsonc "triggers") -> GET /api/cron on the backend (replaces vercel.json crons)
// Secrets/vars are set in Cloudflare (see DEPLOY.md) and passed into the container as environment variables.
import { Container, getContainer } from "@cloudflare/containers";

const VARS = [
  "MONGODB_URI", "JWT_SECRET", "JWT_EXPIRES_IN", "ADMIN_JWT_EXPIRES_IN", "CLOUDINARY_URL", "ROOT_DOMAIN", "SUPPORT_EMAIL",
  "BCRYPT_COST", "ALLOWED_ORIGINS", "ADMIN_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD", "BREVO_API_KEY", "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME", "TRIAL_DAYS", "CRON_SECRET", "DB_CAPACITY_MB", "STATS_TIMEZONE", "STORE_TZ_HOURS", "DNS_SERVERS"
];

export class Backend extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";      // stops after 30 min without traffic, wakes on the next request (a few seconds cold start)
  enableInternet = true;   // MongoDB Atlas, Cloudinary, Brevo
  constructor(ctx, env) {
    super(ctx, env);
    const e = { NODE_ENV: "production", PORT: "8080", TRUST_PROXY: "1" };
    for (const k of VARS) if (env[k] !== undefined && env[k] !== "") e[k] = String(env[k]);
    this.envVars = e;
  }
}

const backend = (env) => getContainer(env.BACKEND, "main");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    // The container only sees the Worker, so pass the real visitor IP/host (rate limits + store sub-domains depend on them).
    headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "");
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    return backend(env).fetch(new Request(request, { headers }));
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      backend(env).fetch(new Request("http://backend/api/cron", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }))
        .then(async (r) => console.log("cron", r.status, (await r.text()).slice(0, 300)))
        .catch((e) => console.error("cron failed", e && e.message))
    );
  }
};
