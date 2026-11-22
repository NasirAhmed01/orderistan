import { useState } from "react";
import { Link } from "react-router-dom";
import api, { errMsg, thumb } from "../api";
import { useAuth } from "../auth";
import { Badge, Field, Icon, fmtTime, money, toast } from "../ui";
import { offPct } from "../pricing";
import { useStore } from "./ctx";
import { Stars } from "./parts";

// Animated palette background (drifting colour blobs). Colours come from the --brand-* variables made by palette.js.
const LEAVES = [[-6, 58, 1], [-30, -52, .95], [-62, 48, .88], [-92, -44, .8], [-120, 36, .7], [-146, -30, .6], [-168, 0, .5]];
function Branch({ c, slim }) {
  const d = slim ? "M0 0C13 -30 13 -72 0 -108C-13 -72 -13 -30 0 0Z" : "M0 0C36 -24 40 -70 0 -112C-40 -70 -36 -24 0 0Z";
  return (
    <svg className={"sf-leaf " + c} viewBox="-130 -230 260 250">
      <defs><linearGradient id={"lg" + c} x1="0" y1="1" x2="0" y2="0"><stop offset="0" style={{ stopColor: "var(--brand-strong)" }} /><stop offset="1" style={{ stopColor: "var(--brand-acc)" }} /></linearGradient></defs>
      <path className="stem" d="M0 12C4 -60 -4 -130 2 -200" />
      {LEAVES.map(([y, a, sc], k) => <g key={k} transform={`translate(0 ${y}) rotate(${a}) scale(${sc})`}><path d={d} fill={`url(#lg${c})`} /><path className="vein" d="M0 -4V-96" /></g>)}
    </svg>
  );
}
export const StoreBackdrop = ({ slim }) => <div className="sf-bd" aria-hidden="true"><i /><i /><i /><i /><u /><u /><Branch c="l1" slim={slim} /><Branch c="l2" slim={slim} /><Branch c="l3" slim={slim} /><Branch c="l4" slim={slim} /></div>;

export const RatingRow = ({ p }) => p.ratingCount > 0 ? <p className="rate-row"><Stars v={p.ratingAvg} /> <b>{p.ratingAvg}</b> <span>({p.ratingCount} reviews)</span></p> : null;
export const OffChip = ({ p }) => { const o = offPct(p); return o > 0 ? <span className="off-chip">{o}% OFF</span> : null; };
export const CatPill = ({ p, icon }) => p.category ? <span className="cat-pill"><Icon n={icon} /> {p.category}</span> : null;

export function PerkCards() {
  const { store } = useStore();
  const del = store.deliveryFee > 0 ? (store.freeDeliveryOver > 0 ? ["Free delivery", `over ${money(store.freeDeliveryOver)}`] : ["Delivery", money(store.deliveryFee)]) : ["Free delivery", "on every order"];
  return (
    <div className="perk-cards">
      <div><Icon n="truck" /><span><b>{del[0]}</b><small>{del[1]}</small></span></div>
      <div><Icon n="shield" /><span><b>Secure payment</b><small>Verified by the seller</small></span></div>
      {(store.whatsapp || store.phone) && <div><Icon n="chat" /><span><b>Seller support</b><small>Chat on WhatsApp</small></span></div>}
    </div>
  );
}

export function SoldBy() {
  const { store, sp } = useStore();
  return (
    <div className="sold-by">
      <span className="sold-logo">{store.logo ? <img src={thumb(store.logo, 90)} alt="" /> : <Icon n="store" />}</span>
      <span>Sold by: <b>{store.name}</b></span>
      <Link to={sp("/")}>View Store <Icon n="right" /></Link>
    </div>
  );
}

export function ProductTabs({ p, reviews = [], reload }) {
  const [tab, setTab] = useState("desc"); const { user } = useAuth(); const { sp } = useStore();
  const [rv, setRv] = useState({ rating: 5, comment: "" });
  const send = async (e) => { e.preventDefault(); try { await api.post(`/store/products/${p._id}/reviews`, rv); toast("Thanks for your review!"); setRv({ rating: 5, comment: "" }); reload?.(); } catch (x) { toast(errMsg(x), "err"); } };
  return (
    <section className="pd-tabs">
      <div className="pd-tabbar" role="tablist">
        <button role="tab" aria-selected={tab === "desc"} className={tab === "desc" ? "on" : ""} onClick={() => setTab("desc")}><Icon n="file" /> Description</button>
        <button role="tab" aria-selected={tab === "rev"} className={tab === "rev" ? "on" : ""} onClick={() => setTab("rev")}><Icon n="star" /> Reviews ({reviews.length})</button>
      </div>
      {tab === "desc" ? <p className="pre pd-desc">{p.description || "The seller has not added a description yet."}</p> : (
        <div className="pd-reviews">
          {reviews.length === 0 && <p className="muted">No reviews yet.</p>}
          {reviews.map((r) => <div key={r._id} className="review"><Stars v={r.rating} /> <b>{r.userName}</b> {r.verified && <Badge v="verified">verified buyer</Badge>}<small className="muted"> {fmtTime(r.createdAt)}</small>{r.comment && <p>{r.comment}</p>}</div>)}
          {user?.role === "customer" ? (
            <form onSubmit={send} className="review-form"><h4>Write a review</h4>
              <Field label="Rating"><select value={rv.rating} onChange={(e) => setRv({ ...rv, rating: +e.target.value })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 && "s"}</option>)}</select></Field>
              <Field label="Comment"><textarea rows={3} value={rv.comment} onChange={(e) => setRv({ ...rv, comment: e.target.value })} /></Field>
              <button className="btn brand">Submit review</button></form>
          ) : <p className="muted"><Link to={sp("/login")} state={{ from: sp("/p/" + p._id) }}>Log in</Link> to write a review.</p>}
        </div>)}
    </section>
  );
}

export const StockPill = ({ p }) => p.inStock ? <span className="stock-pill"><Icon n="check" /> In Stock</span> : <span className="stock-pill out"><Icon n="x" /> Sold out</span>;
export const BoltIcon = () => <svg className="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
