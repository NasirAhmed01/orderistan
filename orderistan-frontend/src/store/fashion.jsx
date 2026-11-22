import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { thumb } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, Icon, money, useGet, waLink } from "../ui";
import { ProductSkeleton, SkeletonCards, SkeletonGrid } from "../kit";
import { dealText, fromPrice, offPct } from "../pricing";
import { Crumbs, Gallery, HeaderActions, useCatalog } from "./common";
import { ClothingConfigurator } from "./configurators";
import { useStore } from "./ctx";
import { CatPill, OffChip, PerkCards, ProductTabs, RatingRow, SoldBy, StockPill } from "./extras";
import { Heart, Stars } from "./parts";

// CLOTHING - fashion store: navy info bar, search header, deal hero (random best-discounted products), random-photo category tiles, 3:4 product cards.
// Styles live in ../styles-fashion.css (all classes start with nz-).
const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (str) => { let h = 2166136261; for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619); return h >>> 0; };
const shuffle = (list, seed) => { const r = rng(seed), a = [...list]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
const wasPrice = (p) => (p.deal?.kind === "percent" && p.deal.value > 0 ? p.price : p.comparePrice > fromPrice(p) ? p.comparePrice : 0);
const toShop = () => document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });

const BagMark = () => (
  <svg className="nz-bag" viewBox="0 0 40 44" aria-hidden="true">
    <path d="M13 15v-4a7 7 0 0 1 14 0v4" fill="none" stroke="var(--nz-ink)" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M3 15h34l-2.2 25a3 3 0 0 1-3 2.7H8.2a3 3 0 0 1-3-2.7z" fill="var(--nz-fill)" />
    <path d="m13 26 7 6 7-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Animated background: tiny outlined shirts, pants, shoes... drifting up the page (the clothing version of the food store's leaves).
// Colours come from the palette tokens; the stores' "background motion" switch turns the drift off (items then sit still).
const WEAR = {
  shirt: "M8 3 3 6l2.5 4L8 9v12h8V9l2.5 1L21 6l-5-3c0 1.7-1.8 3-4 3S8 4.7 8 3z",
  pants: "M7 3h10l1 18h-4l-2-10-2 10H6zM7 7h10",
  shoe: "M3 16v-4l5-1 2-3 2 2 4 1c3 .5 5 2 5 4v2H3zM3 18h18",
  dress: "M9 3 8 8 5 21h14L16 8l-1-5-3 3zM8 8h8",
  cap: "M4 14a8 8 0 0 1 16 0M3 14h17c1 .4 2 1.2 2 2.5H10",
  hanger: "M12 8V6.5a2 2 0 1 0-2-2M12 8l9 6.5a1 1 0 0 1-.6 1.8H3.6A1 1 0 0 1 3 14.5z",
  bag: "M5 9h14l1 12H4zM9 9V7a3 3 0 0 1 6 0v2",
  socks: "M9 3h6v8l4 4a3 3 0 0 1-4 4l-7-6V3z"
};
// [icon, left %, size px, duration s, delay s, rotation deg, sway vw, start top %]
const DRIFT = [
  ["shirt", 6, 46, 46, -4, -12, 3, 70], ["pants", 17, 40, 54, -30, 10, -2, 20], ["shoe", 29, 44, 50, -18, -8, 4, 45], ["dress", 41, 50, 60, -44, 14, -3, 85],
  ["cap", 53, 36, 44, -10, -16, 2, 30], ["hanger", 64, 42, 56, -36, 8, -4, 60], ["bag", 76, 38, 48, -22, -10, 3, 12], ["socks", 88, 36, 52, -48, 12, -2, 52],
  ["shirt", 11, 34, 58, -50, 18, -3, 36], ["shoe", 35, 34, 62, -12, -14, 2, 92], ["pants", 47, 32, 49, -26, 9, -4, 8], ["dress", 70, 34, 57, -40, -9, 3, 78],
  ["cap", 94, 32, 51, -8, 15, -2, 24], ["bag", 22, 30, 64, -56, -11, 4, 62], ["hanger", 58, 30, 47, -34, 13, -3, 48], ["shirt", 82, 40, 53, -16, -7, 2, 88]
];
export const FashionBackdrop = () => (
  <div className="nz-bd" aria-hidden="true">
    {DRIFT.map(([k, x, size, dur, delay, rot, sway, y], n) => (
      <i key={n} className={n % 3 === 2 ? "b" : ""} style={{ left: x + "%", "--s": size, "--d": dur + "s", "--l": delay + "s", "--r": rot + "deg", "--sw": sway + "vw", "--y": y + "%" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d={WEAR[k]} /></svg>
      </i>
    ))}
  </div>
);

export function FashionHeader() {
  const { store, sp } = useStore(); const { user } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const [params] = useSearchParams();
  const [open, setOpen] = useState(false), [find, setFind] = useState(false), [q, setQ] = useState(params.get("q") || "");
  const cust = user?.role === "customer", wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I need help with my order.");
  useEffect(() => { setOpen(false); setFind(false); }, [loc.pathname]);
  useEffect(() => { setQ(params.get("q") || ""); }, [params]);
  useEffect(() => { if (!open && !find) return; const k = (e) => { if (e.key === "Escape") { setOpen(false); setFind(false); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, find]);
  const submit = (e) => { e.preventDefault(); const v = q.trim(); nav(sp("/") + (v ? "?q=" + encodeURIComponent(v) : ""), { state: { to: "shop" } }); setFind(false); setOpen(false); };
  const delivery = store.freeDeliveryOver > 0 ? <>Free delivery on orders over <b>{money(store.freeDeliveryOver)}</b></> : store.deliveryFee > 0 ? <>Delivery {money(store.deliveryFee)}</> : <>Free delivery on every order</>;
  const shop = <Link to={sp("/")} state={{ to: "shop" }}>Shop</Link>;
  return (
    <header className="nz-head">
      <div className="nz-ann"><div className="container">
        <span><Icon n="truck" />{delivery}</span>
        <span className="nz-ann-r"><span><Icon n="shield" />Secure payments</span>{wa && <a href={wa} target="_blank" rel="noreferrer"><Icon n="chat" />WhatsApp support</a>}</span>
      </div></div>
      <div className="nz-bar"><div className="container nz-bar-in">
        <Link to={sp("/")} className="nz-brand" aria-label={store.name}>{store.logo ? <img src={thumb(store.logo, 120)} alt="" /> : <BagMark />}<span>{store.name}</span></Link>
        <nav className="nz-nav" aria-label="Main"><NavLink to={sp("/")} end>Home</NavLink>{shop}<NavLink to={sp("/about")}>About</NavLink><NavLink to={sp("/contact")}>Contact</NavLink><NavLink to={sp("/faq")}>FAQ</NavLink></nav>
        <form className="nz-search" role="search" onSubmit={submit}><Icon n="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." aria-label="Search products" /></form>
        <div className="nz-actions">
          <button type="button" className="icon-btn nz-find" aria-label="Search" aria-expanded={find} onClick={() => { setFind(!find); setOpen(false); }}><Icon n={find ? "x" : "search"} /></button>
          <HeaderActions />
          <button type="button" className="icon-btn nz-burger" aria-label="Menu" aria-expanded={open} onClick={() => { setOpen(!open); setFind(false); }}><Icon n={open ? "x" : "menu"} /></button>
        </div>
      </div>
      <form className={"nz-searchm" + (find ? " on" : "")} role="search" onSubmit={submit}><div className="container"><Icon n="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." aria-label="Search products" tabIndex={find ? 0 : -1} /><button type="submit" className="nz-go" tabIndex={find ? 0 : -1}>Search</button></div></form>
      <nav className={"nz-menu" + (open ? " on" : "")} aria-label="Menu" onClick={() => setOpen(false)}>
        <div className="container">
          <NavLink to={sp("/")} end>Home</NavLink>{shop}<NavLink to={sp("/about")}>About</NavLink><NavLink to={sp("/contact")}>Contact</NavLink><NavLink to={sp("/faq")}>FAQ</NavLink><NavLink to={sp("/track")}>Track order</NavLink><NavLink to={sp("/wishlist")}>Wishlist</NavLink>
          {!cust && <div className="nz-menu-auth"><Link className="nz-btn ghost" to={sp("/login")}>Log in</Link><Link className="nz-btn" to={sp("/login")} state={{ mode: "register" }}>Sign up</Link></div>}
        </div>
      </nav>
      </div>
    </header>
  );
}

function Tile({ p }) {
  const { sp } = useStore(); const off = offPct(p), dt = dealText(p), was = wasPrice(p);
  const fresh = p.createdAt && Date.now() - new Date(p.createdAt).getTime() < 14 * 864e5, left = typeof p.stock === "number" && p.stock > 0 && p.stock <= 5 && !(p.variants || []).length ? p.stock : 0;
  return (
    <article className="nz-card">
      <Link to={sp("/p/" + p._id)} className="nz-img">{p.images?.[0] ? <><img src={thumb(p.images[0], 560)} alt={p.name} loading="lazy" decoding="async" />{p.images[1] && <img className="alt" src={thumb(p.images[1], 560)} alt="" loading="lazy" />}</> : <span><Icon n="shirt" /></span>}
        {off > 0 || dt ? <i className="nz-tag">{off > 0 ? `-${off}%` : dt}</i> : fresh && p.inStock ? <i className="nz-tag new">New</i> : null}{!p.inStock && <i className="nz-sold">Sold out</i>}</Link>
      <Heart id={p._id} />
      <div className="nz-info"><Link to={sp("/p/" + p._id)}><h3>{p.name}</h3></Link>
        {p.ratingCount > 0 && <div className="nz-rate"><Icon n="star" />{p.ratingAvg}<small>({p.ratingCount})</small></div>}
        <div className="nz-price"><b>{money(fromPrice(p))}</b>{was > 0 && <s>{money(was)}</s>}</div>{left > 0 && <div className="nz-low">Only {left} left</div>}
        {p.colors?.length > 0 && <div className="nz-dots">{p.colors.slice(0, 6).map((c) => <i key={c.name} title={c.name} style={{ background: c.hex }} />)}</div>}</div>
    </article>
  );
}

// Hero: a rotating mosaic of the store's best-discounted products (picked at random from the top deals on every visit).
function Hero({ deals, loading, store, onShop }) {
  const { sp } = useStore(); const [i, setI] = useState(0), [hold, setHold] = useState(false), tx = useRef(0);
  const { list, max } = deals, n = list.length, p = list[i % Math.max(n, 1)], p2 = n > 1 ? list[(i + 1) % n] : null;
  const wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I saw your collection online.");
  useEffect(() => { if (n < 2 || hold || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; const t = setInterval(() => setI((x) => (x + 1) % n), 6000); return () => clearInterval(t); }, [n, hold]);
  const off = p ? offPct(p) : 0, was = p ? wasPrice(p) : 0, img2 = p2 ? p2.images[0] : p?.images?.[1] || p?.images?.[0], link2 = p2 || p;
  return (
    <section className={"nz-hero" + (hold ? " hold" : "")} onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <div className="container nz-hero-in">
        <div className="nz-copy">
          <p className="nz-eyebrow"><span>{store.name} collection</span></p>
          <h1><span>It’s new</span><em>arrivals</em></h1>
          <p className="nz-lede">{store.tagline || `Fresh styles, new this season, from ${store.name}.`}</p>
          <div className="nz-cta"><button type="button" className="nz-btn" onClick={onShop}>Shop now <Icon n="right" /></button>{wa && <a className="nz-btn ghost" href={wa} target="_blank" rel="noreferrer">Ask on WhatsApp</a>}</div>
          {n > 1 && <div className="nz-pager" role="group" aria-label="Featured products">{list.map((x, k) => <button type="button" key={x._id} className={k === i % n ? "on" : ""} onClick={() => setI(k)} aria-label={`Show ${x.name}`} aria-current={k === i % n} />)}</div>}
        </div>
        <div className={"nz-mosaic" + (loading ? " sk" : "")} aria-live="off" onTouchStart={(e) => { tx.current = e.touches[0].clientX; }} onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - tx.current; if (n > 1 && Math.abs(d) > 45) setI((x) => (x + (d < 0 ? 1 : -1) + n) % n); }}>
          {p ? <Link key={"a" + p._id} to={sp("/p/" + p._id)} className="nz-m nz-m-photo fade" aria-label={`${p.name}${off ? `, ${off}% off` : ""}`}>
            <img src={thumb(p.images[0], 900)} alt="" fetchpriority="high" decoding="async" />
            <span className="nz-cap"><b>{p.name}</b><span>{money(fromPrice(p))}{was > 0 && <s>{money(was)}</s>}</span>{off > 0 && <i>-{off}%</i>}</span>
          </Link> : <div className="nz-m nz-m-photo none">{!loading && <Icon n="shirt" />}</div>}
          <div className="nz-m nz-m-deal">{max > 0 ? <><small>Up to</small><strong>{max}<sup>%</sup></strong><small>Off</small></> : <><small>Just in</small><strong className="w">New</strong><small>This season</small></>}<hr /></div>
          {img2 ? <Link key={"b" + link2._id + i} to={sp("/p/" + link2._id)} className="nz-m nz-m-photo2 fade" tabIndex={-1} aria-hidden="true"><img src={thumb(img2, 600)} alt="" loading="lazy" decoding="async" />{offPct(link2) > 0 && <i>-{offPct(link2)}%</i>}</Link> : <div className="nz-m nz-m-photo2 none" />}
          <i className="nz-m nz-m-orange" /><i className="nz-m nz-m-olive" /><i className="nz-m nz-m-rule" />
        </div>
      </div>
    </section>
  );
}

export function FashionHome() {
  const { store, sp } = useStore(); const { items, cats, total, more, loading } = useCatalog(); const loc = useLocation(); const [params, setParams] = useSearchParams();
  const [cat, setCat] = useState(""), [sort, setSort] = useState("newest"), [allCats, setAllCats] = useState(false), [sale, setSale] = useState(false), [limit, setLimit] = useState(12), rail = useRef(null);
  const seed = useRef((Math.random() * 4294967296) >>> 0).current, q = (params.get("q") || "").trim().toLowerCase();
  useEffect(() => { if (loc.state?.to === "shop") { const t = setTimeout(toShop, 80); return () => clearTimeout(t); } }, [loc.key]); // eslint-disable-line
  const deals = useMemo(() => {
    const ok = items.filter((p) => p.images?.[0] && p.inStock !== false), disc = ok.filter((p) => offPct(p) > 0).sort((a, b) => offPct(b) - offPct(a));
    return { list: shuffle((disc.length ? disc : ok).slice(0, 6), seed).slice(0, 3), max: disc.length ? offPct(disc[0]) : 0 };
  }, [items, seed]);
  const tiles = useMemo(() => cats.map((c) => {
    const mine = items.filter((p) => p.category === c), pics = mine.filter((p) => p.images?.[0]);
    return { c, n: mine.length, img: pics.length ? pics[Math.floor(rng(seed ^ hash(c))() * pics.length)].images[0] : "" };
  }).sort((a, b) => b.n - a.n), [items, cats, seed]);
  const shown = useMemo(() => {
    const l = items.filter((p) => (!cat || p.category === cat) && (!sale || offPct(p) > 0) && (!q || `${p.name} ${p.category || ""} ${p.description || ""}`.toLowerCase().includes(q)));
    const by = { low: (a, b) => fromPrice(a) - fromPrice(b), high: (a, b) => fromPrice(b) - fromPrice(a), deal: (a, b) => offPct(b) - offPct(a) }[sort];
    return by ? [...l].sort(by) : l;
  }, [items, cat, sort, q, sale]);
  useEffect(() => { setLimit(12); }, [cat, sort, q, sale]);
  const topDeals = useMemo(() => items.filter((p) => p.inStock !== false && offPct(p) > 0).sort((a, b) => offPct(b) - offPct(a)).slice(0, 10), [items]);
  const slide = (d) => rail.current?.scrollBy({ left: d * rail.current.clientWidth * 0.85, behavior: "smooth" });
  const pick = (c) => { setCat(c); toShop(); };
  const clear = () => { setCat(""); setSale(false); if (q) setParams({}, { replace: true }); };
  const perks = store.freeDeliveryOver > 0 ? ["Free delivery", `over ${money(store.freeDeliveryOver)}`] : store.deliveryFee > 0 ? ["Delivery", money(store.deliveryFee)] : ["Free delivery", "on every order"];
  const wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I have a question about your store.");
  return (
    <>
      <Hero deals={deals} loading={loading} store={store} onShop={toShop} />
      <section className="container"><div className="nz-perks">
        <div><Icon n="truck" /><span><b>{perks[0]}</b><small>{perks[1]}</small></span></div>
        <div><Icon n="shield" /><span><b>Secure payments</b><small>Bank, wallet or COD</small></span></div>
        {wa ? <a href={wa} target="_blank" rel="noreferrer"><Icon n="chat" /><span><b>Chat support</b><small>On WhatsApp</small></span></a> : <Link to={sp("/contact")}><Icon n="mail" /><span><b>Need help?</b><small>Contact us</small></span></Link>}
        <Link to={sp("/policies")}><Icon n="gift" /><span><b>Easy returns</b><small>See our policy</small></span></Link>
        <button type="button" className="nz-perks-go" onClick={toShop} aria-label="Go to products"><Icon n="right" /></button>
      </div></section>
      {tiles.length > 1 && <section className="container nz-sec"><div className="nz-h"><h2>Popular categories</h2>{tiles.length > 4 && <button type="button" className="nz-link" onClick={() => setAllCats(!allCats)}>{allCats ? "Show less" : "View all"} <Icon n="right" /></button>}</div>
        <div className="nz-cats">{(allCats ? tiles : tiles.slice(0, 4)).map(({ c, img }) => <button type="button" key={c} className={"nz-cat" + (cat === c ? " on" : "")} onClick={() => pick(c)}><span className="nz-cat-img">{img ? <img src={thumb(img, 420)} alt="" loading="lazy" decoding="async" /> : <Icon n="shirt" />}</span><span className="nz-cat-name">{c}</span><Icon n="right" /></button>)}</div></section>}
      {topDeals.length > 2 && <section className="container nz-sec"><div className="nz-h"><h2>Top deals <small>save up to {offPct(topDeals[0])}%</small></h2>
        <div className="nz-tools"><button type="button" className="nz-arrow" aria-label="Previous deals" onClick={() => slide(-1)}><Icon n="left" /></button><button type="button" className="nz-arrow" aria-label="Next deals" onClick={() => slide(1)}><Icon n="right" /></button><button type="button" className="nz-link" onClick={() => { setSale(true); setCat(""); toShop(); }}>View all <Icon n="right" /></button></div></div>
        <div className="nz-rail" ref={rail}>{topDeals.map((p) => <Tile key={p._id} p={p} />)}</div></section>}
      <section className="container nz-sec" id="shop">
        <div className="nz-h"><h2>{cat || (sale ? "On sale" : "Popular products")} <small>{cat || q || sale ? shown.length : total ?? shown.length}</small></h2>
          <div className="nz-tools"><select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="deal">Biggest discount</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>{(cat || q || sale) && <button type="button" className="nz-link" onClick={clear}>View all <Icon n="right" /></button>}</div></div>
        {q && <p className="nz-q">Results for “{params.get("q")}”</p>}
        {(cats.length > 1 || topDeals.length > 0) && <div className="nz-filter"><button type="button" className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>{topDeals.length > 0 && <button type="button" className={"sale" + (sale ? " on" : "")} aria-pressed={sale} onClick={() => setSale(!sale)}><Icon n="percent" /> On sale</button>}{cats.map((c) => <button type="button" key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>}
        {loading ? <SkeletonGrid variant="fa" n={8} /> : !shown.length && !more ? <Empty icon="shirt">{q ? `Nothing matches “${params.get("q")}”.` : "Nothing here yet. Check back soon."}</Empty> : <><div className="nz-grid">{shown.slice(0, limit).map((p) => <Tile key={p._id} p={p} />)}{more && limit >= shown.length && <SkeletonCards variant="fa" n={4} />}</div>{shown.length > limit && <div className="nz-more"><button type="button" className="nz-btn ghost" onClick={() => setLimit(limit + 12)}>Show more <small>({shown.length - limit} left)</small></button></div>}</>}</section>
      <section className="container nz-sec nz-last"><div className="nz-help"><div><h2>Not sure about your size?</h2><p>Every piece has its own size chart. Message us and we will help you pick the right fit.</p></div><div className="nz-help-cta">{wa ? <a className="nz-btn light" href={wa} target="_blank" rel="noreferrer"><Icon n="chat" /> Chat on WhatsApp</a> : <Link className="nz-btn light" to={sp("/contact")}><Icon n="mail" /> Contact us</Link>}<Link className="nz-btn outline" to={sp("/track")}><Icon n="truck" /> Track an order</Link></div></div></section>
    </>
  );
}

export function FashionProduct() {
  const { id } = useParams(); const { add, sp, store } = useStore(); const nav = useNavigate(); const [color, setColor] = useState("");
  const d = useGet("/store/products/" + id); const rel = useCatalog();
  if (d.loading && !d.data) return <ProductSkeleton />;
  const p = d.data?.product; if (!p) return <Empty icon="box">This piece was not found.</Empty>;
  const colorImg = (p.colors || []).find((c) => c.name === color)?.image;
  const related = rel.items.filter((x) => x._id !== p._id && x.category === p.category).slice(0, 4);
  return (
    <div className="container fa-detail"><Crumbs p={p} />
      <div className="fa-pd"><div className="pd-left"><Gallery images={p.images} name={p.name} extra={colorImg} overlay={<>{dealText(p) && <span className="pd-badge"><Icon n="gift" /> {dealText(p)}</span>}<Heart id={p._id} /></>} /><ProductTabs p={p} reviews={d.data.reviews} reload={d.reload} /></div>
        <div className="fa-pd-info"><div className="pd-toprow"><CatPill p={p} icon="shirt" /><StockPill p={p} /></div><h1>{p.name}</h1><RatingRow p={p} />
          <p className="pre muted pd-short nz-wrap">{(p.description || "").slice(0, 160)}{(p.description || "").length > 160 ? "..." : ""}</p>
          <div className="price lg">{money(fromPrice(p))}{wasPrice(p) > 0 && <s>{money(wasPrice(p))}</s>}<OffChip p={p} />{dealText(p) && !offPct(p) && <Badge v="rejected">{dealText(p)}</Badge>}</div>
          {p.inStock ? <ClothingConfigurator p={p} onColor={setColor} onAdd={(sel, qty) => add(p, qty, sel)} onBuy={(sel, qty) => { add(p, qty, sel); nav(sp("/cart")); }} /> : <Badge v="rejected">Sold out</Badge>}
          <PerkCards /><SoldBy /></div></div>
      {related.length > 0 && <section className="fa-sec"><div className="fa-h"><h2>You may also like</h2></div><div className="nz-grid">{related.map((x) => <Tile key={x._id} p={x} />)}</div></section>}
    </div>
  );
}
