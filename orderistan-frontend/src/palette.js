// Automatic colour palette: the seller picks ONE colour, every other shade of the storefront is derived from it.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); const n = parseInt(m ? m[1] : "e4572e", 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return [h, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s); l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
export const contrastWhite = (hex) => 1.05 / (lum(hex) + 0.05);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const cache = new Map();

// Returns the shades (hex) and the CSS variables that the storefront stylesheet uses.
export function makePalette(hex) {
  const key = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.toLowerCase() : "#e4572e";
  if (cache.has(key)) return cache.get(key);
  const [h, s0, l0] = hexToHsl(key);
  const neutral = s0 < 0.06; // white, black and greys: stay neutral instead of turning pink/red
  const s = neutral ? 0 : clamp(s0, Math.min(s0, 0.4), 0.92); // vivid picks keep >= 0.4, muted picks stay muted
  // fill = a shade that white text is always readable on (buttons, badges); a very light pick (white, pale yellow...) becomes a dark shade
  let sl = Math.min(l0, neutral ? 0.22 : 0.46), strong = hslToHex(h, s, sl);
  while (contrastWhite(strong) < 4.5 && sl > 0.05) { sl -= 0.02; strong = hslToHex(h, s, sl); }
  // sec = second brand colour (analogous hue), also readable with white text
  let ql = 0.4, sec = hslToHex(h - 30, neutral ? 0 : Math.min(s, 0.5), ql);
  while (contrastWhite(sec) < 4.5 && ql > 0.05) { ql -= 0.02; sec = hslToHex(h - 30, neutral ? 0 : Math.min(s, 0.5), ql); }
  // vivid = the glow colour for dark surfaces (service store): bright enough to see on near-black AND to carry dark text on top of it
  const inkHex = hslToHex(h, neutral ? 0 : 0.4, 0.11);
  let vl = clamp(l0, 0.5, 0.66), vivid = neutral ? "#e9e9e9" : hslToHex(h, clamp(s0, 0.6, 0.95), vl);
  while (!neutral && contrast(vivid, inkHex) < 6 && vl < 0.9) { vl += 0.02; vivid = hslToHex(h, clamp(s0, 0.6, 0.95), vl); }
  // on = text colour that is always readable ON the vivid glow colour (dark ink or white, whichever has more contrast)
  const onHex = contrast(vivid, inkHex) >= contrast(vivid, "#ffffff") ? inkHex : "#ffffff";
  const shades = {
    brand: key, strong, deep: hslToHex(h, s, 0.16), ink: hslToHex(h, neutral ? 0 : 0.4, 0.11),
    soft: hslToHex(h, s, 0.92), tint: hslToHex(h, Math.min(s, 0.8), 0.97), line: hslToHex(h, s * 0.7, 0.86),
    acc: hslToHex(h + 38, s, 0.55), acc2: hslToHex(h - 38, s, 0.6),
    light: hslToHex(h, neutral ? 0 : Math.min(s, 0.85), 0.74), // brand colour that is readable on dark surfaces
    sec, vivid, on: onHex
  };
  // --brand itself is used raw as a text / border / background colour all over the stores: if the pick is too light to see on white, use the readable shade
  const safe = contrastWhite(key) >= 3 ? key : strong;
  const rgb = (x) => { const n = parseInt(x.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
  const vars = {
    "--brand": safe, "--brand-strong": shades.strong, "--brand-deep": shades.deep, "--brand-ink": shades.ink, "--brand-soft": shades.soft,
    "--brand-tint": shades.tint, "--brand-line": shades.line, "--brand-acc": shades.acc, "--brand-acc2": shades.acc2, "--brand-light": shades.light, "--brand-sec": shades.sec, "--brand-vivid": shades.vivid, "--brand-on": shades.on, "--brand-vivid-rgb": rgb(shades.vivid),
    "--brand-rgb": rgb(safe), "--brand-ink-rgb": rgb(shades.ink), "--brand-strong-rgb": rgb(shades.strong), "--brand-acc-rgb": rgb(shades.acc), "--brand-acc2-rgb": rgb(shades.acc2)
  };
  const out = { shades, vars }; cache.set(key, out); return out;
}
export const PRESET_COLORS = ["#6d28d9", "#2563eb", "#0f766e", "#16a34a", "#e4572e", "#d97706", "#db2777", "#7c2d12", "#0f172a"];
