// Builds the Cloudflare Workers/Pages `_headers` file at build time (see vite.config.js). Hosts come from env, nothing is hardcoded:
//   VITE_API_URL  -> the only cross-origin host the app may call (connect-src)
// Cloudinary (res.cloudinary.com) serves seller photos/videos; Google Fonts serves the two text fonts imported in styles.css.
const origin = (u) => { try { return new URL(u).origin; } catch { return ""; } };

export function buildHeaders(env = {}) {
  const api = origin(env.VITE_API_URL);
  const csp = [
    "default-src 'self'",
    "script-src 'self'",                                                  // no inline scripts, no eval
    "style-src 'self' https://fonts.googleapis.com",                       // strict: React sets style={{}} through the CSSOM, which CSP allows; no 'unsafe-inline' needed (kept from the security-headers version)
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "media-src 'self' blob: https://res.cloudinary.com",
    `connect-src 'self'${api ? " " + api : ""}`,
    "manifest-src 'self' blob:",                                          // per-store web-app manifest is created as a blob (brandHead.js)
    "frame-src 'self'",                                                   // seller "Preview" shows the store in an iframe of this same site
    "frame-ancestors 'self'",                                             // nobody else may embed the site (clickjacking); 'self' keeps the preview working
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
  const security = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "SAMEORIGIN",                                      // legacy twin of frame-ancestors
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin"
  };
  const block = (path, h) => `${path}\n` + Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join("\n") + "\n";
  return [
    block("/*", security),
    block("/assets/*", { "Cache-Control": "public, max-age=31536000, immutable" }),   // hashed filenames: safe to cache forever
    block("/index.html", { "Cache-Control": "no-cache" })
  ].join("\n");
}

export const securityHeadersPlugin = (env) => ({
  name: "security-headers",
  apply: "build",
  generateBundle() { this.emitFile({ type: "asset", fileName: "_headers", source: buildHeaders(env) }); }
});
