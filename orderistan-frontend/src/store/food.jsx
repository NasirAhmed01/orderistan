import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { thumb } from "../api";
import { Badge, Empty, Icon, money, useGet, waLink } from "../ui";
import { useAuth } from "../auth";
import { ProductSkeleton, SkeletonCards, SkeletonGrid } from "../kit";
import { dealText, fromPrice, offPct } from "../pricing";
import { Crumbs, Gallery, HeaderActions, useCatalog } from "./common";
import { FoodConfigurator } from "./configurators";
import { useStore } from "./ctx";
import "../styles-food.css";
import { CatPill, OffChip, PerkCards, ProductTabs, RatingRow, SoldBy, StockPill } from "./extras";
import { Heart } from "./parts";

// FOOD - restaurant website: floating pill header, hero with trust bar, deals strip, sticky menu categories, menu cards with prices "from"
export function FoodHeader() {
  const { store, sp } = useStore(); const { user } = useAuth(); const [open, setOpen] = useState(false); const [scrolled, setScrolled] = useState(false);
  const close = () => setOpen(false), cust = user?.role === "customer";
  const wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I would like to place an order.");
  useEffect(() => { const t = () => setOpen((o) => !o); window.addEventListener("lx:nav", t); return () => window.removeEventListener("lx:nav", t); }, []); // burger inside the hero card
  useEffect(() => { const f = () => setScrolled(window.scrollY > 220); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => { // drawer: Esc closes, page behind does not scroll
    if (!open) return; const k = (e) => e.key === "Escape" && setOpen(false), prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [open]);
  const links = [["/", "Menu", "utensils", true], ["/about", "Our story", "info"], ["/contact", "Find us", "pin"], ["/track", "Track order", "truck"], ["/faq", "FAQ", "help"]];
  return (
    <header className="lx-head">
      <div className="container"><div className="lx-bar">
        <button type="button" className={"lx-hburger" + (scrolled ? " show" : "")} aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon n="menu" /></button>
        <Link to={sp("/")} className="lx-home" aria-label={store.name}>{store.logo ? <img src={thumb(store.logo, 120)} alt="" /> : <b>{store.name.slice(0, 1).toUpperCase()}</b>}</Link>
        <Link to={sp("/")} className="lx-brand">{store.logo ? <img src={thumb(store.logo, 120)} alt="" /> : <b>{store.name.slice(0, 1).toUpperCase()}</b>}<span>{store.name}</span></Link>
        <nav className="lx-nav">{links.map(([to, label, , end]) => <NavLink key={to} to={sp(to === "/" ? "/" : to)} end={!!end}>{label}</NavLink>)}</nav>
        <div className="lx-right">{store.phone && <a className="lx-phone" href={"tel:" + store.phone}><i><Icon n="phone" /></i><span>{store.phone}</span></a>}<HeaderActions /></div>
      </div></div>
      <div className={"lx-drawer" + (open ? " on" : "")} aria-hidden={!open}>
        <div className="lx-scrim" onClick={close} />
        <aside className="lx-panel" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="lx-ph"><Link to={sp("/")} className="lx-pbrand" onClick={close}>{store.logo ? <img src={thumb(store.logo, 120)} alt="" /> : <b>{store.name.slice(0, 1).toUpperCase()}</b>}<span>{store.name}</span></Link>
            <button type="button" className="lx-pclose" aria-label="Close menu" onClick={close}><Icon n="x" /></button></div>
          <nav className="lx-pnav" onClick={close}>{links.map(([to, label, ic, end]) => <NavLink key={to} to={sp(to)} end={!!end} tabIndex={open ? 0 : -1}><i><Icon n={ic} /></i><span>{label}</span><Icon n="right" className="chev" /></NavLink>)}
            {cust && <><NavLink to={sp("/orders")} tabIndex={open ? 0 : -1}><i><Icon n="bag" /></i><span>My orders</span><Icon n="right" className="chev" /></NavLink><NavLink to={sp("/wishlist")} tabIndex={open ? 0 : -1}><i><Icon n="heart" /></i><span>Wishlist</span><Icon n="right" className="chev" /></NavLink></>}</nav>
          <div className="lx-pf">
            {!cust && <div className="lx-pauth"><Link className="lx-pbtn ghost" to={sp("/login")} onClick={close} tabIndex={open ? 0 : -1}>Log in</Link><Link className="lx-pbtn" to={sp("/login")} state={{ mode: "register" }} onClick={close} tabIndex={open ? 0 : -1}>Sign up</Link></div>}
            <div className="lx-pcontact">{store.phone && <a href={"tel:" + store.phone} tabIndex={open ? 0 : -1}><Icon n="phone" />Call us</a>}{wa && <a href={wa} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}><Icon n="chat" />WhatsApp</a>}</div>
          </div>
        </aside>
      </div>
    </header>
  );
}

/* ---- small inline art used by the hero (decor + filled trust icons) ---- */
const Leaf = ({ c }) => <span className={"lx-leaf " + c} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 3C11 3 4 8 4 16.5c0 1.6.3 2.8.8 3.5C5.6 14 9 10 14.5 8 10.8 10.8 8.2 14.2 6.8 19.8c.9.4 1.9.5 3 .5C17.5 20.3 21 13 21 3z" /></svg></span>;
const Spark = ({ c }) => <svg className={"lx-spark " + c} viewBox="0 0 40 40" aria-hidden="true"><path d="M4 24l11-3M9 8l9 8M24 3l2 12" /></svg>;
const WaIcon = () => <svg className="ico wa" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.05-1.32A10 10 0 1 0 12 2zm0 18.1c-1.5 0-2.95-.4-4.2-1.15l-.3-.18-3 .78.8-2.92-.2-.31A8.1 8.1 0 1 1 12 20.1zm4.45-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.95-1.2 7.3 7.3 0 0 1-1.35-1.68c-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.1 3.65.57.25 1.02.4 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z" /></svg>;
const TI = {
  cook: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 2v6a2.5 2.5 0 0 0 5 0V2M7 2v20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M17 2.2c-2.3 0-3.7 2.5-3.7 5.3 0 2.2 1.2 3.8 3 4.2V22h1.4V11.7c1.8-.4 3-2 3-4.2 0-2.8-1.4-5.3-3.7-5.3z" fill="currentColor" /></svg>,
  pay: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" /><path d="M8.3 12.2l2.6 2.6 4.8-5.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  ship: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 5.5A1.5 1.5 0 0 1 3 4h10.5A1.5 1.5 0 0 1 15 5.5V16H1.5zM15 8.5h3.6c.5 0 .9.2 1.2.6l2.2 2.7c.3.3.4.7.4 1.1V16H15z" fill="currentColor" /><circle cx="6" cy="17.8" r="2.4" fill="currentColor" stroke="#fff" strokeWidth="1.3" /><circle cx="18" cy="17.8" r="2.4" fill="currentColor" stroke="#fff" strokeWidth="1.3" /></svg>,
  gift: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="11" width="17.6" height="11" rx="1.6" fill="currentColor" /><rect x="2" y="7" width="20" height="4.2" rx="1.3" fill="currentColor" /><path d="M12 7H8.2a2.4 2.4 0 1 1 0-4.8C10.8 2.2 12 7 12 7zM12 7h3.8a2.4 2.4 0 1 0 0-4.8C13.2 2.2 12 7 12 7z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><path d="M12 7.2V22" stroke="#fff" strokeWidth="1.5" /></svg>
};
const soft = (name) => String(name).replace(/([@._-])/g, "$1\u200b"); // lets long names (emails) wrap after @ . _ -

function MenuCard({ p }) {
  const { sp } = useStore(); const dt = dealText(p), off = offPct(p);
  return (
    <article className="fd-card">
      <Link to={sp("/p/" + p._id)} className="fd-img">{p.images[0] ? <img src={thumb(p.images[0], 420)} alt={p.name} loading="lazy" decoding="async" /> : <span><Icon n="utensils" /></span>}{(dt || off > 0) && <i className="fd-badge">{dt || `-${off}%`}</i>}</Link>
      <div className="fd-body"><Link to={sp("/p/" + p._id)}><h3>{p.name}</h3></Link>
        {p.description && <p>{p.description.slice(0, 90)}</p>}
        {p.sizes?.length > 1 && <div className="fd-sizes">{p.sizes.slice(0, 3).map((s) => <span key={s.name}>{s.name}</span>)}{p.sizes.length > 3 && <span>+{p.sizes.length - 3}</span>}</div>}
        <div className="fd-foot"><div className="price">{p.sizes?.length ? <small>from</small> : null} {money(fromPrice(p))}{p.comparePrice > p.price && <s>{money(p.comparePrice)}</s>}</div>
          {p.inStock ? <Link className="btn brand sm" to={sp("/p/" + p._id)}>{p.sizes?.length || p.addons?.length ? "Customise" : "Order"} <Icon n="right" /></Link> : <Badge v="rejected">Sold out</Badge>}</div></div>
      <Heart id={p._id} />
    </article>
  );
}

export function FoodHome() {
  const { store, sp } = useStore(); const { items, cats, total, more, loading } = useCatalog(); const [cat, setCat] = useState(""); const [q, setQ] = useState(""); const menu = useRef();
  const deals = items.filter((p) => dealText(p) || offPct(p) >= 10);
  const shown = useMemo(() => items.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), [items, cat, q]);
  const wa = waLink(store.whatsapp || store.phone, "Assalam o Alaikum! I would like to place an order.");
  const delivery = store.deliveryFee > 0 ? (store.freeDeliveryOver > 0 ? `Free delivery over ${money(store.freeDeliveryOver)}` : `Delivery ${money(store.deliveryFee)}`) : "Straight to your door";
  const name = store.name || "";
  const words = (store.tagline || "Delicious food, made with love").trim().split(/\s+/), k = Math.min(2, words.length);
  const tagHead = words.slice(0, words.length - k).join(" "), tagLove = words.slice(-k).join(" ");
  const goMenu = () => menu.current?.scrollIntoView({ behavior: "smooth" });
  const pickCat = (c) => { setCat(c); setTimeout(goMenu, 30); };
  return (
    <>
      <section className={"lx-hero" + (store.banner ? " has-img" : "")}>
        <div className="lx-card">
          {store.banner ? <div className="lx-hero-img"><img src={thumb(store.banner, 1600)} alt="" decoding="async" fetchpriority="high" /></div> : <span className="lx-arc" aria-hidden="true" />}
          <Leaf c="a" /><Leaf c="b" /><Leaf c="c" /><Leaf c="d" /><Leaf c="e" /><Leaf c="f" /><Spark c="s1" /><Spark c="s2" />
          <button type="button" className="lx-burger" aria-label="Menu" onClick={() => window.dispatchEvent(new Event("lx:nav"))}><Icon n="menu" /></button>
          <div className="container lx-hero-in"><div className="lx-hero-txt">
            <span className="lx-kicker"><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3C11 3 4 8 4 16.5c0 1.6.3 2.8.8 3.5C5.6 14 9 10 14.5 8 10.8 10.8 8.2 14.2 6.8 19.8c.9.4 1.9.5 3 .5C17.5 20.3 21 13 21 3z" /></svg>{store.city ? `Serving ${store.city}` : "Freshly made"}</span>
            <h1 className={name.length > 28 ? "xl" : name.length > 18 ? "l" : ""}>{soft(name)}</h1>
            <p className="lx-tag">{tagHead}{tagHead && " "}<span className="lx-love">{tagLove}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5C6.5 16.4 3.6 13 3.6 9.3 3.6 6.6 5.6 4.8 8 4.8c1.6 0 3 .9 4 2.4 1-1.5 2.4-2.4 4-2.4 2.4 0 4.4 1.8 4.4 4.5 0 3.7-2.9 7.1-8.4 11.2z" /></svg></span></p>
            <div className="lx-cta-row"><button className="lx-btn" onClick={goMenu}><Icon n="cart" />Order now<Icon n="right" className="arr" /></button>{wa && <a className="lx-btn ghost" href={wa} target="_blank" rel="noreferrer"><WaIcon />WhatsApp</a>}</div>
          </div></div>
        </div>
        <div className="container lx-trust-wrap"><div className="lx-trust">
          <div><i>{TI.cook}</i><span>Cooked fresh for you</span></div>
          <div><i>{TI.pay}</i><span>Bank, JazzCash or cash</span></div>
          <div><i>{TI.ship}</i><span>{delivery}</span></div>
          <div><i>{TI.gift}</i><span>{deals.length > 0 ? `${deals.length} live right now` : "Combos & offers"}</span></div>
        </div></div>
      </section>
      {cats.length > 0 && <section className="container lx-sec"><div className="lx-h"><h2>Our collections</h2><button className="lx-link" onClick={() => pickCat("")}>Explore all <Icon n="right" /></button></div>
        <div className="lx-arches">{cats.slice(0, 6).map((c) => { const its = items.filter((p) => p.category === c); const img = its.find((p) => p.images?.[0])?.images[0];
          return <button key={c} className="lx-arch" onClick={() => pickCat(c)}><span className="lx-arch-i">{img ? <img src={thumb(img, 420)} alt="" loading="lazy" /> : <Icon n="utensils" />}</span><span className="lx-arch-l"><b>{c}</b><small>{its.length} dish{its.length === 1 ? "" : "es"}</small></span></button>; })}</div></section>}
      {deals.length > 0 && <section className="lx-band"><div className="container"><div className="lx-h light"><h2>Today's deals</h2><p>Combos and discounts you will not want to miss.</p></div>
        <div className="fd-deals">{deals.map((p) => <Link key={p._id} to={sp("/p/" + p._id)} className="fd-deal"><div className="fd-deal-i">{p.images[0] && <img src={thumb(p.images[0], 360)} alt="" loading="lazy" />}</div>
          <div><span className="fd-chip">{dealText(p) || `-${offPct(p)}%`}</span><b>{p.name}</b><span className="price">{money(fromPrice(p))}</span></div></Link>)}</div></div></section>}
      <section className="lx-menuwrap"><div className="container lx-sec" ref={menu} id="menu"><div className="lx-h"><h2>Our menu</h2><p>{total ?? items.length} item{(total ?? items.length) === 1 ? "" : "s"} made to order.</p></div>
        <div className="fd-msearch"><Icon n="search" /><input type="search" inputMode="search" enterKeyHint="search" placeholder="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the menu" />{q && <button type="button" aria-label="Clear search" onClick={() => setQ("")}><Icon n="x" /></button>}</div>
        <div className="fd-tabs" role="tablist"><button role="tab" aria-selected={!cat} className={!cat ? "on" : ""} onClick={() => setCat("")}>All</button>{cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
          <div className="sf-search"><Icon n="search" /><input placeholder="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the menu" /></div></div>
        {loading ? <SkeletonGrid variant="fd" n={6} /> : !shown.length && !more ? <Empty icon="utensils">No dishes match. Try another category.</Empty> : <div className="fd-grid">{shown.map((p) => <MenuCard key={p._id} p={p} />)}{more && <SkeletonCards variant="fd" n={2} />}</div>}</div></section>
      <section className="container lx-sec"><div className="lx-steps"><div><b>1</b><span>Pick your dish</span></div><div><b>2</b><span>Choose size &amp; toppings</span></div><div><b>3</b><span>Pay &amp; we start cooking</span></div></div></section>
      <section className="container lx-sec lx-sec-last"><div className="lx-ctaband"><div className="lx-ctaband-t"><i><Icon n="chat" /></i><span><b>Craving something?</b><small>Message us your order and we will confirm and start cooking.</small></span></div>
        {wa ? <a className="lx-btn light" href={wa} target="_blank" rel="noreferrer">Order on WhatsApp</a> : <button className="lx-btn light" onClick={goMenu}>Browse the menu</button>}</div></section>
    </>
  );
}

export function FoodProduct() {
  const { id } = useParams(); const { add, sp, store } = useStore(); const nav = useNavigate();
  const d = useGet("/store/products/" + id);
  if (d.loading && !d.data) return <ProductSkeleton />;
  const p = d.data?.product; if (!p) return <Empty icon="box">Dish not found.</Empty>;
  const dt = dealText(p);
  return (
    <div className="container fd-detail"><Crumbs p={p} />
      <div className="fd-pd"><div className="pd-left"><Gallery images={p.images} name={p.name} overlay={<>{dt && <span className="pd-badge"><Icon n="gift" /> {dt}</span>}<Heart id={p._id} /></>} /><ProductTabs p={p} reviews={d.data.reviews} reload={d.reload} /></div>
        <div><div className="pd-toprow"><CatPill p={p} icon="utensils" /><StockPill p={p} /></div><h1>{p.name}</h1><p className="pre muted pd-short">{(p.description || "").slice(0, 160)}{(p.description || "").length > 160 ? "..." : ""}</p><RatingRow p={p} />
          <div className="price lg">{money(fromPrice(p))}{p.comparePrice > p.price && <s>{money(p.comparePrice)}</s>}<OffChip p={p} /></div>
          {p.inStock ? <FoodConfigurator p={p} onAdd={(sel, qty) => add(p, qty, sel)} onBuy={(sel, qty) => { add(p, qty, sel); nav(sp("/cart")); }} cta="Add to cart" /> : <Badge v="rejected">Sold out right now</Badge>}
          <PerkCards /><SoldBy /></div></div>
    </div>
  );
}
