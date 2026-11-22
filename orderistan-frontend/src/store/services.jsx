import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import api, { errMsg, thumb } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, Field, Icon, Spinner, fmtTime, money, toast, useGet, waLink } from "../ui";
import { ProductSkeleton, SkeletonCards, SkeletonGrid } from "../kit";
import { fmtMins, ymd } from "../pricing";
import { Crumbs, HeaderActions, Hours, useCatalog } from "./common";
import { useStore } from "./ctx";
import { WorldMap } from "./worldmap";

// SERVICES - dark, glowing business site: floating header, hero with 3D phone + tablet showing the store's own branding, perks strip,
// service cards, how-it-works, stats over a dotted world map, packages, closing banner. Everything is coloured from the store palette.
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 97, s: 2 + ((i * 7) % 4), d: 18 + ((i * 5) % 22), l: -(i * 3.3) }));
const lowPrice = (p) => { const v = Math.min(p.price || Infinity, ...(p.packages || []).map((x) => x.price)); return isFinite(v) ? v : p.price || 0; };
const toSec = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const Arrow = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export function SvcBackdrop() {
  const { store } = useStore();
  return (
    <div className="sx-bd" aria-hidden="true">
      <i className="sx-glow a" /><i className="sx-glow b" /><i className="sx-lines" />
      <WorldMap city={store.city} className="sx-map" />
      {SPARKS.map((p, n) => <b key={n} className="sx-spark" style={{ left: p.x + "%", width: p.s, height: p.s, "--d": p.d + "s", "--l": p.l + "s" }} />)}
    </div>
  );
}

function Cube({ s = 34, style }) {
  return <div className="sx-cube-wrap" style={style}><div className="sx-cube" style={{ "--s": s + "px" }}><i /><i /><i /><i /><i /><i /></div></div>;
}
// an image that falls back to a placeholder when the file is missing / fails to load (no broken-image icon)
function SafeImg({ src, alt = "", fallback = null, ...rest }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [src]);
  return !src || bad ? fallback : <img src={src} alt={alt} onError={() => setBad(true)} {...rest} />;
}
const Mark = ({ store }) => { const init = <b>{(store.name || "S").slice(0, 1).toUpperCase()}</b>; return store.logo ? <SafeImg src={thumb(store.logo, 96)} fallback={init} /> : init; };

export function ServicesHeader() {
  const { store, sp } = useStore(); const { user } = useAuth(); const loc = useLocation(); const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { if (!open) return; const k = (e) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  return (
    <header className="sx-head">
      <div className="container"><div className="sx-bar">
        <Link to={sp("/")} className="sx-brand" aria-label={store.name}><Mark store={store} /><span>{store.name}</span></Link>
        <nav className={"sx-nav" + (open ? " on" : "")} aria-label="Main" onClick={() => setOpen(false)}>
          <NavLink to={sp("/")} end>Home</NavLink><Link to={sp("/")} state={{ to: "services" }}>Services</Link><NavLink to={sp("/about")}>About</NavLink><NavLink to={sp("/contact")}>Contact</NavLink><NavLink to={sp("/faq")}>FAQ</NavLink><NavLink to={sp("/bookings")}>My bookings</NavLink>
          {user?.role !== "customer" && <div className="sx-nav-auth"><Link className="sx-btn ghost sm" to={sp("/login")}>Log in</Link><Link className="sx-btn sm" to={sp("/login")} state={{ mode: "register" }}>Sign up</Link></div>}
        </nav>
        <div className="sx-right">
          {store.phone && <a className="sx-call" href={"tel:" + store.phone}><Icon n="phone" /> {store.phone}</a>}
          <HeaderActions wishlist={false} cart={false} />
          <button type="button" className="sx-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon n={open ? "x" : "menu"} /></button>
        </div>
      </div></div>
    </header>
  );
}

// floating bottom tab bar (phones) shown on every page of a service store
export function ServicesTabBar() {
  const { sp, base } = useStore(); const loc = useLocation(); const path = loc.pathname.replace(/\/+$/, ""), root = (base || "").replace(/\/+$/, "");
  const home = path === root || path === "", svc = home && loc.state?.to === "services" || path.startsWith(root + "/p/");
  const on = (k) => (k === "services" ? svc : k === "home" ? home && !svc : path.startsWith(root + "/" + k));
  return (
    <nav className="sxd-tab" aria-label="Quick navigation">
      <Link to={sp("/")} className={on("home") ? "on" : ""}><Icon n="home" /><span>Home</span></Link>
      <Link to={sp("/")} state={{ to: "services" }} className={on("services") ? "on" : ""}><Icon n="grid" /><span>Services</span></Link>
      <Link to={sp("/bookings")} className={on("bookings") ? "on" : ""}><Icon n="calendar" /><span>Bookings</span></Link>
      <Link to={sp("/profile")} className={on("profile") ? "on" : ""}><Icon n="user" /><span>Profile</span></Link>
    </nav>
  );
}

function ServiceCard({ p }) {
  const { sp } = useStore(); const req = p.bookingMode === "request";
  return (
    <article className="sx-card">
      <Link to={sp("/p/" + p._id)} className="sx-img"><SafeImg src={p.images[0] && thumb(p.images[0], 560)} alt={p.name} loading="lazy" decoding="async" fallback={<span><Icon n="briefcase" /></span>} /><em className={"sx-pill" + (req ? " q" : "")}>{req ? "Request a quote" : "Instant booking"}</em></Link>
      <div className="sx-body"><small>{p.category}</small><Link to={sp("/p/" + p._id)}><h3>{p.name}</h3></Link>
        {p.description && <p>{p.description.slice(0, 110)}</p>}
        <div className="sx-meta">{p.duration > 0 && <span><Icon n="clock" /> {fmtMins(p.duration)}</span>}{p.packages?.length > 0 && <span><Icon n="layers" /> {p.packages.length} packages</span>}</div>
        <div className="sx-foot"><div className="sx-price"><small>from</small> {money(lowPrice(p))}</div><Link className="sx-btn sm" to={sp("/p/" + p._id)}>{req ? "Request" : "Book now"} <Arrow /></Link></div></div>
    </article>
  );
}

function useInView() {
  const ref = useRef(null), [on, setOn] = useState(false);
  useEffect(() => { const el = ref.current; if (!el || !("IntersectionObserver" in window)) { setOn(true); return; } const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.25 }); io.observe(el); return () => io.disconnect(); }, []);
  return [ref, on];
}
function Count({ to, on }) {
  const [v, setV] = useState(0);
  useEffect(() => { if (!on) return; if (reduced() || to < 2) { setV(to); return; } let raf, t0; const step = (t) => { t0 = t0 || t; const k = Math.min(1, (t - t0) / 1100); setV(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [on, to]);
  return <>{v}</>;
}

function Devices({ store, items, loading, lede, kicker }) {
  const rig = useRef(null), fs = items.find((p) => p.images[0]) || items[0], heroImg = store.banner || fs?.images?.[0], tiles = items.slice(0, 4);
  const move = (e) => { if (e.pointerType !== "mouse" || reduced() || !rig.current) return; const r = e.currentTarget.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5; rig.current.style.setProperty("--ry", nx * 14 + "deg"); rig.current.style.setProperty("--rx", -ny * 10 + "deg"); };
  const leave = () => { rig.current?.style.setProperty("--ry", "0deg"); rig.current?.style.setProperty("--rx", "0deg"); };
  return (
    <div className="sx-stage" onPointerMove={move} onPointerLeave={leave} aria-hidden="true">
      <div className="sx-rig" ref={rig}>
        <div className="sx-tablet"><div className="sx-tin"><div className="sx-screen sx-t-screen">
          <div className="sx-s-top"><span className="sx-s-brand"><Mark store={store} /><em>{store.name}</em></span><span className="sx-t-nav"><i /><i /><i /><i /></span></div>
          <strong className="sx-t-title">Our services</strong><p className="sx-t-sub">Pick a service, choose a package and book your slot.</p>
          <div className="sx-t-grid">{(loading ? [0, 1, 2, 3] : tiles).map((p, i) => <div key={p._id || i} className={"sx-t-tile" + (loading ? " sk" : "")}><SafeImg src={p?.images?.[0] && thumb(p.images[0], 240)} fallback={<span><Icon n="briefcase" /></span>} /><b>{p?.name || ""}</b><em>{p ? money(lowPrice(p)) : ""}</em></div>)}{!loading && !tiles.length && [0, 1, 2, 3].map((i) => <div key={i} className="sx-t-tile"><span><Icon n="briefcase" /></span></div>)}</div>
        </div></div></div>
        <div className="sx-phone"><div className="sx-pin"><div className="sx-screen sx-p-screen">
          <div className="sx-s-top"><span className="sx-s-brand"><Mark store={store} /><em>{store.name}</em></span><span className="sx-s-menu"><i /><i /><i /></span></div>
          <small className="sx-s-kick">{kicker}</small>
          <strong className="sx-s-title">Book with <u>{store.name}</u></strong>
          <p className="sx-s-lede">{lede}</p>
          <span className="sx-s-btn">Book a service <Arrow /></span>
          <div className="sx-s-img"><SafeImg src={heroImg && thumb(heroImg, 520)} fallback={<Icon n="briefcase" />} /><span className="sx-s-cap"><b>{fs?.name || store.name}</b><em>{fs ? "from " + money(lowPrice(fs)) : "Book online"}</em></span></div>
        </div></div></div>
        <Cube s={38} style={{ left: "46%", top: "-2%", "--fd": "9s" }} /><Cube s={26} style={{ left: "-3%", bottom: "14%", "--fd": "11s" }} /><Cube s={20} style={{ right: "-2%", top: "16%", "--fd": "8s" }} />
      </div>
    </div>
  );
}

export function ServicesHome() {
  const { store, sp } = useStore(); const { items, cats, total, more, loading } = useCatalog(); const loc = useLocation(); const [cat, setCat] = useState("");
  const [statRef, statOn] = useInView();
  useEffect(() => { if (loc.state?.to === "services") { const t = setTimeout(() => toSec("services"), 80); return () => clearTimeout(t); } }, [loc.key]); // eslint-disable-line
  const shown = useMemo(() => items.filter((p) => !cat || p.category === cat), [items, cat]);
  const wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I would like to know about your services.");
  const packs = useMemo(() => items.flatMap((p) => (p.packages || []).map((k) => ({ ...k, service: p }))).sort((a, b) => a.price - b.price), [items]);
  const pick = packs.length > 3 ? [packs[0], packs[Math.floor(packs.length / 2)], packs[packs.length - 1]] : packs;
  const openDays = (store.availability?.days || []).filter((d) => d.open).length;
  const kicker = store.city ? `Serving ${store.city}` : "Professional services", lede = store.tagline || "Choose a service, pick a time that suits you and book online in minutes.";
  const stats = [[total ?? items.length, "Services"], [packs.length, "Packages"], [openDays, "Days a week"], [cats.length, "Service types"]].filter(([n]) => n > 0);
  const bullets = (k) => { const l = (k.description || "").split(/[\n.;•]+/).map((x) => x.trim()).filter(Boolean).slice(0, 3); return l.length ? l : [k.service.name, k.duration ? fmtMins(k.duration) : "Confirmed by the team"]; };
  return (
    <>
      <section className="sx-hero"><div className="container sx-hero-in">
        <div className="sx-copy">
          <span className="sx-kick"><i />{kicker}</span>
          <h1><span>Book with</span> <em>{store.name}</em></h1>
          <p className="sx-lede">{lede}</p>
          <div className="sx-cta"><button type="button" className="sx-btn" onClick={() => toSec("services")}>Book a service <Arrow /></button>
            {wa ? <a className="sx-btn ghost" href={wa} target="_blank" rel="noreferrer"><span className="sx-round"><Icon n="chat" /></span> WhatsApp us</a> : <button type="button" className="sx-btn ghost" onClick={() => toSec("how")}><span className="sx-round"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span> How it works</button>}</div>
          <ul className="sx-ticks"><li><Icon n="check" /> Choose your own time</li><li><Icon n="check" /> Clear pricing</li><li><Icon n="check" /> Confirmed by the team</li></ul>
        </div>
        <Devices store={store} items={items} loading={loading} lede={lede} kicker={kicker} />
      </div></section>

      <section className="container"><div className="sx-perks">
        <div><Icon n="calendar" /><span><b>Easy booking</b><small>Choose your date and time</small></span></div>
        <div><Icon n="tag" /><span><b>Clear pricing</b><small>Fixed prices, no surprises</small></span></div>
        <div><Icon n="shield" /><span><b>Confirmed by the team</b><small>You get a notification</small></span></div>
        {wa ? <a href={wa} target="_blank" rel="noreferrer"><Icon n="chat" /><span><b>Support</b><small>Chat with us on WhatsApp</small></span></a> : <Link to={sp("/contact")}><Icon n="mail" /><span><b>Support</b><small>We are here to help</small></span></Link>}
      </div></section>

      <section className="container sx-sec" id="services">
        <div className="sx-label">Our services</div>
        <div className="sx-h"><h2>Pick a service. Book your slot.</h2><p>Choose a package, select a time and we take care of the rest.</p></div>
        {cats.length > 1 && <div className="sx-chips"><button type="button" className={!cat ? "on" : ""} onClick={() => setCat("")}>All services</button>{cats.map((c) => <button type="button" key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>}
        {loading ? <SkeletonGrid variant="sv" n={6} /> : !shown.length && !more ? <Empty icon="briefcase">No services listed yet.</Empty> : <div className="sx-grid">{shown.map((p) => <ServiceCard key={p._id} p={p} />)}{more && <SkeletonCards variant="sv" n={2} />}</div>}
      </section>

      <section className="container sx-sec" id="how">
        <div className="sx-label">How it works</div>
        <div className="sx-h"><h2>Three steps to your booking.</h2></div>
        <div className="sx-steps">{[["Choose", "Pick the service and package that suits you.", "briefcase"], ["Book", "Select a date and time that works for you.", "calendar"], ["Relax", "We confirm and take care of the rest.", "check"]].map(([t, d, ic], i) => <div key={t}><span className="sx-num">{i + 1}</span><Icon n={ic} /><h4>{t}</h4><p>{d}</p></div>)}</div>
      </section>

      <section className="container sx-sec"><div className="sx-stats" ref={statRef}>
        <WorldMap city={store.city} className="sx-map-band" fit="meet" />
        <div className="sx-stats-copy"><h2>Book from anywhere</h2><p>Browse services, compare packages and confirm online{store.city ? `, from ${store.city} or wherever you are` : ""}.</p></div>
        <div className="sx-stat-row">{stats.map(([n, l]) => <div key={l}><b><Count to={n} on={statOn} /></b><span>{l}</span></div>)}</div>
      </div></section>

      {pick.length > 0 && <section className="container sx-sec">
        <div className="sx-label">Packages</div>
        <div className="sx-h"><h2>Choose the package that fits.</h2><p>Clear prices, clear duration. Pick one on the service page.</p></div>
        <div className={"sx-plans n" + pick.length}>{pick.map((k, i) => { const mid = pick.length === 3 && i === 1, req = k.service.bookingMode === "request"; return (
          <div key={k.service._id + k.name} className={"sx-plan" + (mid ? " hot" : "")}>{mid && <span className="sx-ribbon">Featured</span>}
            <h3>{k.name}</h3><small>{k.service.name}</small>
            <div className="sx-plan-price"><b>{money(k.price)}</b>{k.duration > 0 && <span>/ {fmtMins(k.duration)}</span>}</div>
            <ul>{bullets(k).map((x) => <li key={x}><Icon n="check" /> {x}</li>)}</ul>
            <Link className={"sx-btn block" + (mid ? "" : " ghost")} to={sp("/p/" + k.service._id)}>{req ? "Request a quote" : "Choose package"} <Arrow /></Link></div>); })}</div>
      </section>}

      <section className="container sx-sec"><div className="sx-banner">
        <div><h2>Ready to book?</h2><p>Pick a service and choose a time that suits you.</p></div>
        <div className="sx-cta"><button type="button" className="sx-btn" onClick={() => toSec("services")}>Book a service <Arrow /></button>{wa && <a className="sx-btn ghost" href={wa} target="_blank" rel="noreferrer"><span className="sx-round"><Icon n="chat" /></span> WhatsApp us</a>}</div>
        <Cube s={44} style={{ right: "9%", top: "14%", "--fd": "10s" }} /><Cube s={26} style={{ right: "26%", bottom: "12%", "--fd": "8s" }} />
      </div></section>

      <section className="container sx-sec sx-last"><div className="sx-contact"><div><h2>Visit or contact us</h2>
        {store.address && <p><Icon n="pin" /> {store.address}{store.city && `, ${store.city}`}</p>}{store.phone && <p><Icon n="phone" /> <a href={"tel:" + store.phone}>{store.phone}</a></p>}{wa && <p><Icon n="chat" /> <a href={wa} target="_blank" rel="noreferrer">Message on WhatsApp</a></p>}
        <Link className="sx-btn ghost sm" to={sp("/contact")}>Contact page <Arrow /></Link></div><div><h4>Opening hours</h4><Hours store={store} /></div></div></section>
    </>
  );
}

// ---- booking / request ---------------------------------------------------------------------------------------------------------------------
const Bolt = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;

// top of the detail page: big headline + button on the left, the service photo (swipeable) in a glowing ring on the right
function DetailHero({ p, req }) {
  const imgs = p.images || [], n = imgs.length; const track = useRef(null); const [i, setI] = useState(0);
  useEffect(() => { setI(0); track.current?.scrollTo({ left: 0 }); }, [p._id]);
  const go = (k) => { const t = track.current; if (!t) return; t.scrollTo({ left: k * t.clientWidth, behavior: "smooth" }); setI(k); };
  const onScroll = () => { const t = track.current; if (!t?.clientWidth) return; const c = Math.round(t.scrollLeft / t.clientWidth); if (c !== i) setI(c); };
  return (
    <section className="sxd-hero">
      <div className="sxd-copy">
        <span className="sxd-badge"><i />{p.category || (req ? "Request a quote" : "Instant booking")}</span>
        <h2 className="sxd-h"><span>{req ? "Request" : "Book"} Your</span><span className="sxd-l2"><em>Service</em> <span>Easily</span></span></h2>
        <p className="sxd-sub">Fast <i>•</i> Simple <i>•</i> Reliable</p>
        <p className="sxd-lede">Pick a date, share your details and confirm in one click. Fast. Simple. Reliable.</p>
        <button type="button" className="sx-btn" onClick={() => toSec("book")}>{req ? "Get a quote" : "Book Now"} <Arrow /></button>
      </div>
      <div className="sxd-pic"><div className="sxd-frame">
        {n ? <div className="sxd-track" ref={track} onScroll={onScroll} role="group" aria-roledescription="carousel" aria-label={p.name}>{imgs.map((x, k) => <div className="sxd-slide" key={x} aria-hidden={k !== i}><img src={thumb(x, 900)} alt={k === 0 ? p.name : ""} decoding="async" loading={k < 2 ? "eager" : "lazy"} draggable="false" /></div>)}</div>
          : <span className="sxd-none"><Icon n="briefcase" /></span>}
      </div></div>
      {n > 1 && <div className="sxd-dots">{imgs.map((x, k) => <button type="button" key={x} className={k === i ? "on" : ""} onClick={() => go(k)} aria-label={`Photo ${k + 1}`} />)}</div>}
    </section>
  );
}

export function ServiceDetail() {
  const { id } = useParams(); const { store, sp } = useStore(); const d = useGet("/store/products/" + id);
  if (d.loading && !d.data) return <ProductSkeleton />;
  const p = d.data?.product; if (!p) return <Empty icon="box">Service not found.</Empty>;
  const req = p.bookingMode === "request", wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I have a question about " + p.name + ".");
  const openDays = (store.availability?.days || []).filter((x) => x.open).length;
  // only real numbers from this service / store (no made-up figures)
  const stats = [
    p.duration > 0 && ["clock", fmtMins(p.duration), "Duration"],
    p.packages?.length > 0 && ["layers", p.packages.length, "Packages"],
    p.ratingCount > 0 && ["star", p.ratingAvg, "Service Rating"],
    openDays > 0 && ["calendar", openDays + "/7", "Days open"],
    wa ? ["chat", "WhatsApp", "Support"] : store.phone ? ["phone", "Call us", "Support"] : null,
  ].filter(Boolean).slice(0, 3);
  return (
    <div className="container sx-detail"><Crumbs p={p} />
      <div className="sxd">
        <div className="sxd-left">
        <DetailHero p={p} req={req} />
        <div className="sxd-perks">
          <div><Icon n="calendar" /><span><b>Easy booking</b><small>Choose your date and time</small></span></div>
          <div><Icon n="tag" /><span><b>Clear pricing</b><small>Fixed prices, no surprises</small></span></div>
          <div><Icon n="shield" /><span><b>Confirmed by the team</b><small>You get a notification</small></span></div>
          {wa ? <a href={wa} target="_blank" rel="noreferrer"><Icon n="chat" /><span><b>Support</b><small>Chat with us on WhatsApp</small></span></a> : <Link to={sp("/contact")}><Icon n="mail" /><span><b>Support</b><small>We are here to help</small></span></Link>}
        </div>
        </div>
        <BookingBox p={p} />
      </div>
      <div className="sxd-wrap">
        <section className="sxd-info">
          <div className="sxd-info-l"><div className="sxd-title">
            <div><h1>{p.name}<i>.</i></h1>
              <div className="sxd-from"><small>from</small> <b>{money(lowPrice(p))}</b></div></div>
            <span className={"sxd-chip" + (req ? " q" : "")}>{req ? <Icon n="chat" /> : <Bolt />} {req ? "Request a quote" : "Instant Booking"}</span>
          </div>
          {p.category && <small className="sxd-cat">{p.category}</small>}
          {p.description && <p className="sx-pd-desc">{p.description}</p>}</div>
          <div className="sxd-info-r">
          {stats.length > 0 && <div className="sxd-stats">{stats.map(([ic, v, l]) => <div key={l}><span className="sxd-ico"><Icon n={ic} /></span><b>{v}</b><small>{l}</small></div>)}</div>}
          <div className="sx-pd-store"><b>{store.name}</b>
            {store.phone && <p><Icon n="phone" /> <a href={"tel:" + store.phone}>{store.phone}</a></p>}{store.address && <p><Icon n="pin" /> {store.address}{store.city && `, ${store.city}`}</p>}
            <Link to={sp("/contact")}>Contact details <Arrow /></Link></div></div>
        </section>
      </div>
    </div>
  );
}

// scrollable day chips with round arrows and a thin progress bar underneath
function DateStrip({ days, openDays, date, setDate }) {
  const ref = useRef(null); const [th, setTh] = useState({ l: 0, w: 100 });
  const sync = () => { const t = ref.current; if (!t) return; const w = t.scrollWidth ? Math.min(100, (t.clientWidth / t.scrollWidth) * 100) : 100, max = t.scrollWidth - t.clientWidth; setTh({ w, l: max > 0 ? (t.scrollLeft / max) * (100 - w) : 0 }); };
  useEffect(() => { sync(); window.addEventListener("resize", sync); return () => window.removeEventListener("resize", sync); }, []);
  const by = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="sxd-dates">
      <div className="sxd-dates-row">
        <button type="button" className="sxd-arr" aria-label="Earlier dates" onClick={() => by(-1)}><Icon n="left" /></button>
        <div className="dates" ref={ref} onScroll={sync}>{days.map((d) => { const v = ymd(d), off = !openDays.has(d.getDay()); return <button type="button" key={v} disabled={off} className={"dt" + (date === v ? " on" : "")} onClick={() => setDate(v)}><small>{d.toLocaleDateString("en", { weekday: "short" })}</small><b>{d.getDate()}</b><small>{d.toLocaleDateString("en", { month: "short" })}</small></button>; })}</div>
        <button type="button" className="sxd-arr" aria-label="Later dates" onClick={() => by(1)}><Icon n="right" /></button>
      </div>
      <div className="sxd-prog" aria-hidden="true"><i style={{ left: th.l + "%", width: th.w + "%" }} /></div>
    </div>
  );
}

function BookingBox({ p }) {
  const { store, sp } = useStore(); const { user } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const req = p.bookingMode === "request", packs = p.packages || [], adds = p.addons || [];
  const [pack, setPack] = useState(packs[0]?.name || ""); const [picked, setPicked] = useState([]); const [date, setDate] = useState(""); const [time, setTime] = useState("");
  const [slots, setSlots] = useState(null); const [busy, setBusy] = useState(false); const [f, setF] = useState({ name: user?.name || "", phone: user?.phone || "", note: "" });
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const openDays = new Set((store.availability?.days || []).filter((x) => x.open).map((x) => x.day));
  useEffect(() => { if (req || date) return; const first = days.find((d) => openDays.has(d.getDay())); if (first) setDate(ymd(first)); }, []); // eslint-disable-line -- pre-select the first open day
  useEffect(() => {
    if (req || !date) return; setSlots(null); setTime("");
    api.get("/store/availability", { params: { date } }).then((r) => setSlots(r.data)).catch((e) => { toast(errMsg(e), "err"); setSlots({ open: false, slots: [] }); });
  }, [date, req]);
  const chosen = packs.find((x) => x.name === pack);
  const total = (chosen ? chosen.price : p.price) + adds.filter((a) => picked.includes(a.name)).reduce((s, a) => s + a.price, 0);
  const submit = async (e) => {
    e.preventDefault();
    if (user?.role !== "customer") return nav(sp("/login"), { state: { from: loc.pathname } });
    if (!req && (!date || !time)) return toast("Choose a date and a time slot.", "err");
    setBusy(true);
    try { const { data } = await api.post("/store/bookings", { product: p._id, package: pack, addons: picked, date, time, ...f }); toast(req ? "Request sent!" : "Booking placed!"); nav(sp("/bookings"), { state: { placed: data.booking._id }, replace: true }); }
    catch (x) { toast(errMsg(x), "err"); if (x?.response?.status === 409 && date) { setTime(""); api.get("/store/availability", { params: { date } }).then((r) => setSlots(r.data)).catch(() => {}); } }
    finally { setBusy(false); }
  };
  return (
    <form id="book" className="card bk sx-book" onSubmit={submit}>
      <div className="sxd-bhead"><span className="sxd-bico"><Icon n="calendar" /></span><div><h3>{req ? "Request this service" : "Book this service"}</h3><p>{req ? "Tell us what you need and we will send a quote" : "Choose your date and provide details"}</p></div></div>
      {packs.length > 0 && <fieldset className="cfg-sec"><legend>Package</legend><div className="pk-list">{packs.map((k) => <label key={k.name} className={"pk" + (pack === k.name ? " on" : "")}><input type="radio" name="pack" checked={pack === k.name} onChange={() => setPack(k.name)} /><div><b>{k.name}</b><small>{[k.duration ? fmtMins(k.duration) : "", k.description].filter(Boolean).join(" · ")}</small></div><span>{money(k.price)}</span></label>)}</div></fieldset>}
      {adds.length > 0 && <fieldset className="cfg-sec"><legend>Add-ons <small>optional</small></legend><div className="chk-list">{adds.map((a) => <label key={a.name} className={"chk" + (picked.includes(a.name) ? " on" : "")}><input type="checkbox" checked={picked.includes(a.name)} onChange={() => setPicked((x) => (x.includes(a.name) ? x.filter((n) => n !== a.name) : [...x, a.name]))} /><span>{a.name}</span><em>+{money(a.price)}</em></label>)}</div></fieldset>}
      {!req ? <>
        <fieldset className="cfg-sec"><legend><Icon n="calendar" className="sxd-li" /> Select Date</legend><DateStrip days={days} openDays={openDays} date={date} setDate={setDate} /></fieldset>
        {date && <fieldset className="cfg-sec"><legend>Time</legend>{!slots ? <Spinner /> : !slots.slots.length ? <p className="muted">Closed on this day.</p> : <div className="slots">{slots.slots.map((s) => <button type="button" key={s.time} disabled={!s.available} className={"slot" + (time === s.time ? " on" : "")} onClick={() => setTime(s.time)}>{s.time}</button>)}</div>}
          {slots?.slots?.length > 0 && !slots.slots.some((s) => s.available) && <p className="muted">Fully booked - try another day.</p>}</fieldset>}</>
        : <Field label="Preferred date (optional)"><input type="date" min={ymd(new Date())} value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      <div className="grid2">
        <Field label={<><Icon n="user" className="sxd-li" /> Your Name</>}><span className="sxd-in"><Icon n="user" /><input required placeholder="Enter your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></span></Field>
        <Field label={<><Icon n="phone" className="sxd-li" /> Phone / WhatsApp</>}><span className="sxd-in"><Icon n="phone" /><input required inputMode="tel" placeholder="Enter phone number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></span></Field>
      </div>
      <Field label={<><Icon n="edit" className="sxd-li" /> {req ? "Tell us what you need" : "Note (optional)"}</>}><span className="sxd-in ta"><Icon n="edit" /><textarea rows={req ? 3 : 2} required={req} placeholder={req ? "Describe what you need..." : "Any special request..."} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></span></Field>
      <div className="row between bk-total"><span>{req ? "Estimated price" : "Total"}</span><b>{money(total)}</b></div>
      <button className="sxd-confirm" disabled={busy}>{busy ? "Sending..." : <>{user?.role !== "customer" ? "Log in to continue" : <><Icon n="calendar" /> {req ? "Send request" : "Confirm Booking"}</>} <Arrow /></>}</button>
      <small className="muted">{req ? "The business will contact you with a quote." : "The business confirms your booking shortly. You pay at the service."}</small>
    </form>
  );
}

export function MyBookings() {
  const { sp } = useStore(); const { user } = useAuth(); const loc = useLocation();
  const d = useGet(user?.role === "customer" ? "/store/bookings" : null);
  if (user?.role !== "customer") return <Navigate to={sp("/login")} state={{ from: sp("/bookings") }} replace />;
  const cancel = async (b) => { if (!window.confirm("Cancel this booking?")) return; try { await api.post(`/store/bookings/${b._id}/cancel`); d.reload(); } catch (e) { toast(errMsg(e), "err"); } };
  return (
    <div className="container"><h1>My bookings</h1>
      {d.loading && !d.data ? <Spinner /> : !d.data?.items?.length ? <Empty icon="calendar">No bookings yet. <Link to={sp("/")}>Browse services</Link></Empty> : d.data.items.map((b) => (
        <div className={"card order" + (loc.state?.placed === b._id ? " fresh" : "")} key={b._id}>
          {loc.state?.placed === b._id && <div className="banner ok"><Icon n="check" /><div>{b.type === "request" ? "Request sent! The business will contact you." : "Booking placed! You will be notified when it is confirmed."}</div></div>}
          <div className="row between wrap-gap"><div><b>{b.serviceName}</b>{b.packageName && <small className="muted"> · {b.packageName}</small>}</div><div><Badge v={b.type} /> <Badge v={b.status} /></div></div>
          <p className="muted" style={{ margin: "6px 0" }}>{b.date ? <><Icon n="calendar" /> {b.date}{b.time && ` at ${b.time}`}</> : "Date: flexible"} · {money(b.price)}{b.addons?.length > 0 && ` · + ${b.addons.join(", ")}`}</p>
          <small className="muted">Placed {fmtTime(b.createdAt)}</small>
          {["pending", "confirmed"].includes(b.status) && <div style={{ marginTop: 8 }}><button className="btn danger ghost sm" onClick={() => cancel(b)}>Cancel</button></div>}</div>))}
    </div>
  );
}
