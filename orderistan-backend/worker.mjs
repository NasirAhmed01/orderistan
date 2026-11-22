// Cloudflare Workers entry point (Free plan, no Containers, no Docker).
//   Browser -> Worker (this file) -> static files from the Assets binding, OR /api/* -> Durable Object "ApiServer".
// The existing Express app (core.js) runs inside the Durable Object through the Workers node:http support, so every route keeps its
// behaviour, and the MongoDB Atlas connection stays open between requests (a plain Worker would reconnect on every request).
import { DurableObject } from "cloudflare:workers";
import { handleAsNodeRequest } from "cloudflare:node";
import http from "node:http";

const PORT = 8080; // only a routing key inside the Durable Object, no real port is opened

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export class ApiServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Express code reads process.env: copy the Worker's text variables and secrets (strings only, bindings are skipped).
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") process.env[k] = v;
    this.booting = null;
  }

  boot() {
    if (!this.booting) {
      this.booting = import("./core.js").then((m) => {
        const app = m.default ?? m;
        http.createServer(app).listen(PORT);
      }).catch((e) => { this.booting = null; throw e; });
    }
    return this.booting;
  }

  async fetch(request) {
    try { await this.boot(); }
    catch (e) {
      console.error("❌ API failed to start:", (e && e.stack) || e);
      // Names of problems only, never secret values.
      return json(500, { status: "error", stage: "module load", message: String((e && e.message) || e).slice(0, 300) });
    }
    return handleAsNodeRequest(PORT, request);
  }
}

const apiStub = (env) => {
  const opts = env.DO_LOCATION_HINT ? { locationHint: env.DO_LOCATION_HINT } : undefined; // e.g. "enam", "weur" (near your Atlas region)
  return env.API.get(env.API.idFromName("orderistan-api"), opts);
};

// Cron Triggers (wrangler.jsonc "triggers.crons") -> the existing /api/cron route, selected with ?job=
const CRON_JOBS = {
  "*/10 * * * *": "subscriptions,heartbeat", // store expiry + 7/3/1-day warnings, DB health heartbeat
  "0 * * * *": "cloudinary",                 // Cloudinary usage alerts (70/85/95 %)
  "0 3 * * *": "chat"                        // 120-day chat prune + data backfill
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api")) return env.ASSETS.fetch(request); // safety net, assets normally answer before the Worker runs
    const h = new Headers(request.headers);
    // The real client IP (used by rate limits and logs). Overwritten, so clients cannot spoof it.
    h.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "0.0.0.0");
    h.set("x-forwarded-proto", "https");
    return apiStub(env).fetch(new Request(request, { headers: h }));
  },

  async scheduled(event, env, ctx) {
    const job = CRON_JOBS[event.cron] || "all";
    const req = new Request(`https://${env.ROOT_DOMAIN || "orderistan.site"}/api/cron?job=${encodeURIComponent(job)}`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET || ""}`, "x-forwarded-for": "127.0.0.1" }
    });
    ctx.waitUntil(apiStub(env).fetch(req).then(async (r) => console.log("cron", job, r.status, (await r.text()).slice(0, 300))));
  }
};
