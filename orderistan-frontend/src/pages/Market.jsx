import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ROOT, thumb } from "../api";
import { Empty, Icon, Pager, money, useDebounced, useGet } from "../ui";
import { SkeletonGrid, StoreSkeletonGrid } from "../kit";
import MainHeader, { MainFooter } from "./MainHeader";
import "../styles-market.css";

const Bolt = () => <svg className="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
const MARKET_TRUST = [[<Icon n="shield" key="s" />, "Trusted & Secure"], [<Bolt key="b" />, "Fast & Easy"], [<Icon n="store" key="t" />, "Support Local Business"]];

function OpenStoreCta() {
  return (
    <aside className="mk-cta">
      <div className="mk-cta-text">
        <h3>Want to start your own store?</h3>
        <p>Turn your Instagram into an online store with Orderistan.</p>
      </div>
      <Link className="btn primary mk-cta-btn" to="/seller-signup"><Icon n="store" /> Open Your Store <Icon n="right" /></Link>
      <svg className="mk-cta-art" viewBox="0 0 140 150" aria-hidden="true">
        <path d="M20 58h100v78a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill="#fff" stroke="#0a2a73" strokeWidth="4" />
        <path d="M14 30h112l8 28a14 14 0 0 1-28 0 14 14 0 0 1-28 0 14 14 0 0 1-28 0 14 14 0 0 1-28 0 14 14 0 0 1-28 0z" fill="#ff7a00" stroke="#0a2a73" strokeWidth="4" strokeLinejoin="round" />
        <rect x="62" y="78" width="46" height="36" rx="3" fill="#cfe2ff" stroke="#0a2a73" strokeWidth="4" />
        <path d="M85 78v36M62 96h46" stroke="#0a2a73" strokeWidth="3" />
        <rect x="30" y="86" width="22" height="56" rx="3" fill="#0a2a73" />
      </svg>
    </aside>
  );
}

// Store cards link to /s/<slug> (same site) so a customer who is logged in on the main domain stays logged in while shopping.
export function StoreCard({ s }) {
  return (
    <Link to={`/s/${s.slug}`} className="scard" style={{ "--brand": s.themeColor }}>
      <div className="scard-banner" style={s.banner ? { backgroundImage: `url(${thumb(s.banner, 600)})` } : undefined}><span className="scard-online"><i /> Online</span></div>
      <div className="scard-body">
        <div className="scard-logo">{s.logo ? <img src={thumb(s.logo, 120)} alt="" /> : <span>{s.name.slice(0, 1).toUpperCase()}</span>}</div>
        <b>{s.name}</b>
        {s.tagline && <span className="muted">{s.tagline}</span>}
        <small className="muted"><Icon n="pin" /> {s.city ? s.city + " - " : ""}{s.products} product{s.products === 1 ? "" : "s"}</small>
        <small className="muted"><Icon n="link" /> {s.slug}.{ROOT}</small>
        <span className="scard-btn">View Store <Icon n="right" /></span>
      </div>
    </Link>
  );
}

export default function Market() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "products" ? "products" : "stores"; const q = sp.get("q") || "";
  const setTab = (t) => setSp(t === "products" ? { tab: "products", ...(q ? { q } : {}) } : q ? { q } : {});
  const setQ = (v) => setSp({ ...(tab === "products" ? { tab } : {}), ...(v ? { q: v } : {}) }, { replace: true });
  return (
    <div className="landing">
      <MainHeader />
      <div className="container sf-main">
        <section className="market-hero">
          <h1>Browse <em>Orderistan</em></h1>
          <p>Discover local stores and products from sellers all over Pakistan.</p>
          <ul>{MARKET_TRUST.map(([i, t]) => <li key={t}>{i}<span>{t}</span></li>)}</ul>
        </section>
        <div className="seg mk-seg" role="tablist">
          <button role="tab" aria-selected={tab === "stores"} className={tab === "stores" ? "on" : ""} onClick={() => setTab("stores")}>Stores</button>
          <button role="tab" aria-selected={tab === "products"} className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>Products</button>
        </div>
        {tab === "stores" ? <Stores q={q} setQ={setQ} /> : <Products q={q} setQ={setQ} />}
      </div>
      <MainFooter />
    </div>
  );
}

const Failed = ({ d }) => <Empty icon="alert">{d.error} <button className="btn sm" onClick={d.reload}>Try again</button></Empty>;

function Stores({ q, setQ }) {
  const [sp] = useSearchParams(); const [city, setCity] = useState(sp.get("city") || ""); const [page, setPage] = useState(1); const [category, setCategory] = useState("");
  const cities = useGet("/market/cities", null, { cache: true }); const dq = useDebounced(q); const d = useGet("/market/stores", { q: dq, city, category, page }, { cache: true });
  return (
    <>
      <div className="toolbar">
        <div className="input-ico grow"><Icon n="search" /><input placeholder="Search stores..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }}>
          <option value="">All cities</option>{(cities.data?.items || []).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Business category"><option value="">All businesses</option><option value="food">Food &amp; Restaurant</option><option value="clothing">Clothing &amp; Fashion</option><option value="services">Services</option></select>
      </div>
      {d.loading && !d.data ? <StoreSkeletonGrid n={6} /> : d.error && !d.data?.items ? <Failed d={d} /> : !d.data?.items?.length ? <Empty icon="store">No stores found.</Empty> : <div className="market-layout"><div className={"sgrid" + (d.loading ? " busy" : "")}>{d.data.items.map((s) => <StoreCard key={s.slug} s={s} />)}</div><OpenStoreCta /></div>}
      <Pager data={d.data} onPage={setPage} />
    </>
  );
}

function Products({ q, setQ }) {
  const [sort, setSort] = useState("newest"); const [page, setPage] = useState(1);
  const dq = useDebounced(q); const d = useGet("/market/products", { q: dq, sort, page }, { cache: true });
  return (
    <>
      <div className="toolbar">
        <div className="input-ico grow"><Icon n="search" /><input placeholder="Search products from all stores..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option><option value="popular">Popular</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </select>
      </div>
      {d.loading && !d.data ? <SkeletonGrid n={8} /> : d.error && !d.data?.items ? <Failed d={d} /> : !d.data?.items?.length ? <Empty icon="box">No products found.</Empty> : (
        <div className={"pgrid" + (d.loading ? " busy" : "")}>{d.data.items.map((p) => <ProductTile key={p._id} p={p} />)}</div>)}
      <Pager data={d.data} onPage={setPage} />
    </>
  );
}

export const discount = (p) => (p.comparePrice > p.price ? Math.round((1 - p.price / p.comparePrice) * 100) : 0);

export function ProductTile({ p }) {
  const to = `/s/${p.storeInfo?.slug}/p/${p._id}`; const off = discount(p);
  return (
    <div className="pcard">
      {off > 0 && <span className="pbadge">-{off}%</span>}
      <Link to={to} className="pimg">{p.images?.[0] ? <img src={thumb(p.images[0], 400)} alt={p.name} loading="lazy" decoding="async" /> : <span>No image</span>}</Link>
      <div className="pinfo">
        <Link to={to}><b>{p.name}</b></Link>
        <small className="muted">by <Link to={`/s/${p.storeInfo?.slug}`}>{p.storeInfo?.name}</Link></small>
        <span className="price">{money(p.price)} {p.comparePrice > p.price && <s>{money(p.comparePrice)}</s>}</span>
        <Link className="btn brand sm" to={to}>View &amp; buy</Link>
      </div>
    </div>
  );
}
