import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { thumb } from "../api";
import { useAuth } from "../auth";
import { Bell, CATALOG_FIRST, Icon, UserMenu, fetchData, useGet } from "../ui";
import { useStore } from "./ctx";

// Progressive catalogue: the first page (24 items) renders as soon as it arrives; the remaining pages (a plan allows at most 50 items)
// load in parallel in the background and are appended in order. `loading` = nothing to show yet, `more` = still loading the rest.
export function useCatalog() {
  const first = useGet("/store/products", CATALOG_FIRST, { cache: true });
  const catQ = useGet("/store/categories", null, { cache: true });
  const [rest, setRest] = useState({});
  const pages = first.data?.pages || 1, total = first.data?.total;
  useEffect(() => {
    setRest({});
    if (pages <= 1) return;
    let dead = false;
    for (let pg = 2; pg <= pages; pg++) {
      fetchData("/store/products", { ...CATALOG_FIRST, page: pg })
        .then((r) => { if (!dead) setRest((m) => ({ ...m, [pg]: r.items || [] })); })
        .catch(() => { if (!dead) setRest((m) => ({ ...m, [pg]: [] })); });
    }
    return () => { dead = true; };
  }, [pages, total]);
  const items = useMemo(() => {
    const out = [...(first.data?.items || [])];
    for (let pg = 2; pg <= pages; pg++) { if (!rest[pg]) break; out.push(...rest[pg]); } // keep page order, never skip a gap
    return out;
  }, [first.data, rest, pages]);
  const cats = useMemo(() => {
    const given = (catQ.data?.items || []).filter(Boolean);
    return given.length ? given : [...new Set(items.map((p) => p.category).filter(Boolean))];
  }, [catQ.data, items]);
  const more = pages > 1 && Array.from({ length: pages - 1 }).some((_, k) => !rest[k + 2]);
  return { items, cats, total, more, loading: first.loading && !first.data };
}

// Product photo carousel: swipe / scroll-snap, arrows, dots, counter, keyboard, synced thumbnails
export function Gallery({ images, name, extra, overlay }) {
  const all = useMemo(() => [...(extra ? [extra] : []), ...(images || []).filter((x) => x !== extra)], [images, extra]);
  const [i, setI] = useState(0); const track = useRef(); const n = all.length;
  const go = useCallback((k, smooth = true) => {
    const t = track.current; if (!t) return; const c = Math.max(0, Math.min(n - 1, k));
    t.scrollTo({ left: c * t.clientWidth, behavior: smooth ? "smooth" : "auto" }); setI(c);
  }, [n]);
  useEffect(() => { go(0, false); }, [extra, n, go]);
  const onScroll = () => { const t = track.current; if (!t || !t.clientWidth) return; const c = Math.round(t.scrollLeft / t.clientWidth); if (c !== i) setI(c); };
  const key = (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); } };
  return (
    <div className="gal cr">
      <div className="cr-wrap">
        <div className="gal-main cr-track" ref={track} onScroll={onScroll} onKeyDown={key} tabIndex={n > 1 ? 0 : -1} role="group" aria-roledescription="carousel" aria-label={name}>
          {n ? all.map((x, k) => <div className="cr-slide" key={x} aria-hidden={k !== i}><img src={thumb(x, 1000)} alt={k === 0 ? name : ""} decoding="async" loading={k < 2 ? "eager" : "lazy"} draggable="false" /></div>)
            : <div className="cr-slide"><span className="gal-none"><Icon n="image" /></span></div>}
        </div>
        {n > 1 && <>
          <button type="button" className="cr-arrow prev" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous photo"><Icon n="right" /></button>
          <button type="button" className="cr-arrow next" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Next photo"><Icon n="right" /></button>
          <span className="cr-count">{i + 1} / {n}</span>
          <div className="cr-dots">{all.map((x, k) => <button type="button" key={x} className={k === i ? "on" : ""} onClick={() => go(k)} aria-label={`Photo ${k + 1}`} />)}</div>
        </>}
        {overlay && <div className="pd-ov">{overlay}</div>}
      </div>
      {n > 1 && <div className="gal-th">{all.map((x, k) => <button type="button" key={x} className={k === i ? "on" : ""} onClick={() => go(k)} aria-label={`Photo ${k + 1}`}><img src={thumb(x, 140)} alt="" loading="lazy" /></button>)}</div>}
    </div>
  );
}

export function Crumbs({ p }) {
  const { store, sp } = useStore();
  return <nav className="crumbs" aria-label="Breadcrumb"><svg className="ico crumb-home" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" /></svg><Link to={sp("/")}>{store.name}</Link><Icon n="right" />{p.category && <><span>{p.category}</span><Icon n="right" /></>}<b>{p.name}</b></nav>;
}

export const Hours = ({ store }) => {
  const days = store.availability?.days || [], names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (!days.length) return null;
  return <ul className="hours">{days.map((d) => <li key={d.day}><span>{names[d.day]}</span><b>{d.open ? `${d.from} - ${d.to}` : "Closed"}</b></li>)}</ul>;
};

// cart + account buttons used by all three storefront headers
export function HeaderActions({ wishlist = true, cart = true }) {
  const { sp, cart: lines, wish, store } = useStore(); const { user } = useAuth(); const cust = user?.role === "customer";
  const count = lines.reduce((a, i) => a + i.qty, 0), svc = store.category === "services";
  const menu = [{ to: sp("/profile"), label: "My profile", icon: "user" }, ...(svc ? [{ to: sp("/bookings"), label: "My bookings", icon: "calendar" }] : [{ to: sp("/orders"), label: "My orders", icon: "bag" }]),
    ...(wishlist && !svc ? [{ to: sp("/wishlist"), label: "Wishlist", icon: "heart" }] : []), { to: sp("/notifications"), label: "Notifications", icon: "bell" }, ...(svc ? [] : [{ to: sp("/track"), label: "Track an order", icon: "truck" }])];
  return (
    <div className="sf-actions">
      {wishlist && !svc && <Link to={sp("/wishlist")} className="icon-btn" aria-label="Wishlist"><Icon n="heart" />{wish.size > 0 && <b className="count">{wish.size}</b>}</Link>}
      {cart && !svc && <Link to={sp("/cart")} className="icon-btn" aria-label={`Cart, ${count} items`}><Icon n="cart" />{count > 0 && <b key={count} className="count pop">{count}</b>}</Link>}
      {cust && <Bell base={sp("")} />}
      {cust ? <UserMenu items={menu} afterLogout={sp("/")} /> : <><Link className="btn ghost sm" to={sp("/login")}>Log in</Link><Link className="btn brand sm hide-sm" to={sp("/login")} state={{ mode: "register" }}>Sign Up</Link></>}
    </div>
  );
}
