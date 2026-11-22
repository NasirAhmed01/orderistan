# Orderistan - final merged version

Base = "updated" zip (env-driven config, caching, skeletons) + the best parts of "security-headers" zip.
Frontend built OK (vite build), strict CSP verified in dist/_headers, backend syntax-checked, backend npm audit = 0 vulnerabilities.

## What came from where
| Area | Taken from | Why |
|---|---|---|
| Backend routes / models / auth / rate limits | both (identical) | no difference |
| core.js CORS (env-only, no hardcoded worker URLs) | updated | old workers.dev URLs no longer baked in code |
| mailer.js | updated + fallbacks (new) | env-driven, but never "https://undefined" or empty Reply-To |
| startup-check.js (SUPPORT_EMAIL check) | updated + placeholder check (new) | warns if ROOT_DOMAIN is still yourdomain.com |
| Frontend env config (VITE_ROOT_DOMAIN, VITE_SUPPORT_EMAIL, %VITE_...% in index.html) | updated | nothing hardcoded |
| security-headers.js plugin (emitFile), COOP, Cache-Control for index.html | updated | more robust build + better caching |
| CSP style-src WITHOUT 'unsafe-inline' | security-headers | stricter; verified: no inline style/script in build |
| useGet cache + prefetch + request de-dup + race guard | updated | faster store pages |
| Skeletons (Page / Store / Product / cards) | updated | no blank page / spinner |
| Debounced search (useDebounced) | security-headers | updated version called API on every keystroke |
| Error state + "Try again" in Market and store search | security-headers | updated version showed "No stores found" on a network error |
| Safe ROOT fallback in api.js | new | no broken "https://" links if env missing |
| Lazy image component, infinite scroll | NOT used | updated uses native loading="lazy" + Pager; simpler, fewer bugs |

## Pros / cons of the two inputs
security-headers: + strict CSP, + lazy images, + infinite scroll, + debounce, + error/retry UI | - domains hardcoded (orderistan.site, old workers URLs), - no cache/prefetch, - no race guard, - old CSP writer (closeBundle).
updated: + everything env-driven, + SWR cache/prefetch/skeletons/race guard, + COOP + cache headers | - 'unsafe-inline' styles in CSP, - no debounce, - no error UI, - placeholder yourdomain.com in env files, - contained a REAL backend .env (secrets) inside the zip.

## Audit list
CRITICAL
1. The "updated" zip contained orderistan-backend/.env with live secrets (MongoDB URI, JWT_SECRET, TOTP key, Brevo API key, admin password). It is NOT in this final zip. Rotate ALL of them now (Atlas password, JWT_SECRET (logs everyone out), TOTP_ENC_KEY (re-enrol 2FA), Brevo key, admin password).
HIGH / MEDIUM
2. /api/health is public and runs live Mongo/Cloudinary/Brevo checks on every call, and returns allowedOrigins + error messages. Recommend: require CRON_SECRET (or an admin token) for the detailed report.
3. ADMIN_PASSWORD should be removed from env after the admin exists (the file itself says so).
4. Frontend: react-router-dom 6.x has 2 moderate advisories (open redirect via backslash in Link/navigate; SSR deserializeErrors). No SSR is used, so the second does not apply; upgrade to 6.30.x/7.x when convenient and test routing.
5. JWT is kept in localStorage: any XSS could steal it. Mitigated by the strict CSP (no inline script/eval) and React escaping; httpOnly cookie would be stronger.
6. Upload type check uses the client-declared MIME type only (guards.js); Cloudinary re-encodes images, so risk is low. Optional: sniff magic bytes.
7. Set TRUST_PROXY correctly (Cloudflare in front of Vercel changes the value) or all users share one rate-limit IP.
8. Gmail address as Brevo sender hurts deliverability (DMARC). Verify your own domain in Brevo.
9. ROOT_DOMAIN: backend .env.example still says yourdomain.com (placeholder) - set orderistan.site (or your real domain). Frontend .env.production is set to orderistan.site; change it if you stay on workers.dev only.
GOOD (already fine)
- JWT pinned to HS256, token version revocation, account lockout with escalating time, per-IP and per-email rate limits (Mongo-backed, cluster safe), $operator sanitising, helmet, 200kb JSON limit, upload size/count limits, admin TOTP 2FA, weak-admin-password refusal, CORS allow-list, CSP + HSTS + nosniff + frame-ancestors + Permissions-Policy on the frontend, no inline scripts.
