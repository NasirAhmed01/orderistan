import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { errMsg } from "../api";
import { Avatar, Badge, Empty, Icon, PageHead, Spinner, fmtDate, toast, useGet } from "../ui";

// WhatsApp-style support chat between a seller and the Orderistan admin.
// Text + photos, optimistic sending with retry, "seen" ticks, unread badges, date separators, paste / drag-and-drop photos.
// New messages arrive by polling every 4 s while the tab is visible (no websocket server needed).
// Loading: last 20 messages first, next 50 fetched silently in the background, revealed instantly when the reader scrolls up.

const MAX_FILES = 5, MAX_MB = 5;
const hhmm = (d) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d) => {
  const x = new Date(d), t = new Date(), y = new Date(Date.now() - 864e5);
  return x.toDateString() === t.toDateString() ? "Today" : x.toDateString() === y.toDateString() ? "Yesterday" : fmtDate(d);
};
const byOrder = (a, b) => (a.tmp ? 1 : 0) - (b.tmp ? 1 : 0) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
// merge server messages into the list (no duplicates, a message that already shows keeps its local photo preview)
const mergeIn = (list, incoming) => {
  const map = new Map(list.map((m) => [m._id, m]));
  for (const m of incoming) map.set(m._id, map.has(m._id) ? { ...m, local: map.get(m._id).local } : m);
  return [...map.values()].sort(byOrder);
};

// pictures need the login token, so they are fetched as blobs (and kept for this visit)
const pics = new Map();
function ChatImage({ m, onOpen, onLoaded }) {
  const [src, setSrc] = useState(m.local || pics.get(m._id) || ""); const [bad, setBad] = useState(false);
  useEffect(() => {
    if (src || m.tmp) return; let live = true;
    api.get(`/chat/image/${m._id}`, { responseType: "blob" }).then((r) => {
      const u = URL.createObjectURL(r.data); if (pics.size > 120) pics.delete(pics.keys().next().value); pics.set(m._id, u); if (live) setSrc(u);
    }).catch(() => live && setBad(true));
    return () => { live = false; };
  }, [m._id]); // eslint-disable-line
  if (bad) return <div className="c-img gone"><Icon n="image" /> Photo unavailable</div>;
  return src ? <button type="button" className="c-img" onClick={() => onOpen(src)} aria-label="Open photo"><img src={src} alt="Shared photo" onLoad={onLoaded} /></button> : <div className="c-img wait"><Icon n="image" /></div>;
}
function Lightbox({ src, onClose }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb-bar"><a className="btn sm" href={src} download="orderistan-photo.jpg"><Icon n="link" /> Download</a><button className="btn sm" onClick={onClose}><Icon n="x" /> Close</button></div>
      <img src={src} alt="Shared photo" />
    </div>
  );
}
const Ticks = ({ seen }) => (
  <svg className={"ticks" + (seen ? " seen" : "")} viewBox="0 0 18 12" aria-label={seen ? "Seen" : "Sent"}>
    <polyline points="1 6.5 5 10.5 12 2" />{seen && <polyline points="7 10.5 8 11 16 2" />}
  </svg>
);
const ChatSkeleton = () => (
  <div className="c-skel" aria-hidden="true">{[["l", 58], ["l", 34], ["r", 46], ["l", 64], ["r", 30], ["r", 52], ["l", 40]].map(([s, w], i) => <i key={i} className={s} style={{ width: w + "%" }} />)}</div>
);

// How the thread loads (like WhatsApp):
//  1. open  -> the LAST 20 messages are shown at once, scrolled to the newest one (a cached copy of the thread paints instantly on re-open)
//  2. then  -> the 50 messages before those are fetched silently in the background
//  3. scroll up near the top -> that batch appears immediately (no spinner) and the next 50 are fetched in the background again
const FIRST = 20, BATCH = 50;
const threads = new Map();                         // thread cache for this visit
const maxId = (l) => l.reduce((a, m) => (!m.tmp && m._id > a ? m._id : a), "");

export function ChatRoom({ me, storeId, quick = [], onBack }) {
  const peer = me === "seller" ? "admin" : "seller", key = storeId || "me";
  const [items, setItems] = useState([]); const [meta, setMeta] = useState(null); const [peerSeen, setPeerSeen] = useState(null);
  const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [err, setErr] = useState(""); const [busyOld, setBusyOld] = useState(false);
  const [text, setText] = useState(""); const [staged, setStaged] = useState([]); const [drag, setDrag] = useState(false); const [view, setView] = useState("");
  const [far, setFar] = useState(false); const [fresh, setFresh] = useState(0); const [div, setDiv] = useState(null);
  const list = useRef(), box = useRef(), stick = useRef(true), lastId = useRef(""), firstId = useRef(""), restore = useRef(null), queue = useRef(Promise.resolve()), n = useRef(0);
  const buffer = useRef(null), preBusy = useRef(false), oldBusy = useRef(false), moreRef = useRef(false);
  const scope = storeId ? { store: storeId } : {};
  moreRef.current = hasMore;

  const take = (data, silent) => {                         // apply a server answer
    setMeta(data.store || null); setPeerSeen(data.peerSeenAt || null);
    if (data.items.length) {
      lastId.current = data.items.reduce((a, m) => (m._id > a ? m._id : a), lastId.current);
      setItems((cur) => mergeIn(cur, data.items));
      const got = data.items.filter((m) => m.from === peer).length;
      if (got) { window.dispatchEvent(new Event("chat:read")); if (!silent && !stick.current) setFresh((c) => c + got); }
    }
  };
  // background fetch of the batch that sits before `beforeId` (kept aside until the reader scrolls up)
  const prefetch = async (beforeId) => {
    if (!beforeId || preBusy.current) return; preBusy.current = true;
    try { const { data } = await api.get("/chat/messages", { params: { ...scope, before: beforeId, limit: BATCH } }); buffer.current = { for: beforeId, items: data.items, hasMore: data.hasMore }; }
    catch { /* the scroll-up path fetches it itself if this failed */ } finally { preBusy.current = false; }
  };
  const settle = () => { const el = list.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };   // photos grow after they load

  // open the thread (and again when the admin picks another seller)
  useEffect(() => {
    let live = true; buffer.current = null; stick.current = true; setFar(false); setFresh(0); setDiv(null); setErr(""); lastId.current = "";
    const c = threads.get(key);
    if (c) { setItems(c.items); setMeta(c.meta); setPeerSeen(c.peerSeen); setHasMore(c.hasMore); lastId.current = maxId(c.items); firstId.current = c.items[0]?._id || ""; setLoading(false); }
    else { setItems([]); setMeta(null); setHasMore(false); setLoading(true); }
    const warm = !!(c && lastId.current);
    api.get("/chat/messages", { params: warm ? { ...scope, after: lastId.current } : { ...scope, limit: FIRST } }).then(({ data }) => {
      if (!live) return;
      take(data, true);
      if (!warm) { setHasMore(data.hasMore); if (data.items[0]) firstId.current = data.items[0]._id; }
      const theirs = data.items.filter((m) => m.from === peer), k = Math.min(data.unread || 0, theirs.length);
      if (k > 0) setDiv({ id: theirs[theirs.length - k]._id, n: data.unread });
      window.dispatchEvent(new Event("chat:read"));
      if ((warm ? c.hasMore : data.hasMore) && firstId.current) prefetch(firstId.current);
    }).catch((e) => live && !c && setErr(errMsg(e))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [storeId]); // eslint-disable-line
  // keep a copy for instant re-open
  useEffect(() => {
    const real = items.filter((m) => !m.tmp); firstId.current = real[0]?._id || firstId.current;
    if (meta && real.length) threads.set(key, { items: real.slice(-90), meta, peerSeen, hasMore: hasMore || real.length > 90 });
  }, [items, meta, peerSeen, hasMore]); // eslint-disable-line
  // ready to type straight away on a computer
  useEffect(() => { if (!loading && !matchMedia("(pointer: coarse)").matches) box.current?.focus({ preventScroll: true }); }, [loading, storeId]);

  // polling for new messages + "seen" ticks
  useEffect(() => {
    let live = true, busy = false;
    const tick = async () => {
      if (document.hidden || busy || loading) return; busy = true;
      try { const { data } = await api.get("/chat/messages", { params: { ...scope, after: lastId.current || undefined, limit: lastId.current ? undefined : FIRST } }); if (live) take(data); } catch { /* try again on the next tick */ } finally { busy = false; }
    };
    const t = setInterval(tick, 4000); document.addEventListener("visibilitychange", tick);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [storeId, loading]); // eslint-disable-line

  // bottom for new messages (unless the reader scrolled up); keep the position when older messages are added on top
  useLayoutEffect(() => {
    const el = list.current; if (!el) return;
    if (restore.current) { el.scrollTop = el.scrollHeight - restore.current.h + restore.current.top; restore.current = null; return; }
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [items, loading]);

  const older = async () => {
    if (oldBusy.current || !moreRef.current || !firstId.current) return; oldBusy.current = true;
    const fid = firstId.current; let pack = buffer.current && buffer.current.for === fid ? buffer.current : null;
    if (!pack) setBusyOld(true);                                 // only show a spinner when the background batch was not ready
    try {
      if (!pack) { const { data } = await api.get("/chat/messages", { params: { ...scope, before: fid, limit: BATCH } }); pack = { items: data.items, hasMore: data.hasMore }; }
      buffer.current = null;
      const el = list.current; restore.current = { h: el.scrollHeight, top: el.scrollTop };
      setItems((cur) => mergeIn(cur, pack.items)); setHasMore(pack.hasMore);
      if (pack.hasMore && pack.items[0]) prefetch(pack.items[0]._id);   // next 50, quietly
    } catch (e) { toast(errMsg(e), "err"); } finally { oldBusy.current = false; setBusyOld(false); }
  };
  const onScroll = (e) => {
    const el = e.currentTarget, d = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = d < 90; setFar(d > 260); if (d < 90) setFresh(0);
    if (el.scrollTop < 220) older();
  };
  const toEnd = () => { const el = list.current; if (el) { stick.current = true; el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); setFresh(0); } };

  // ---- sending
  const deliver = async (tmp) => {
    try {
      const fd = new FormData(); fd.append("text", tmp.text); if (tmp._file) fd.append("image", tmp._file); if (storeId) fd.append("store", storeId);
      const { data } = await api.post("/chat/messages", fd);
      lastId.current = data.message._id > lastId.current ? data.message._id : lastId.current;
      setItems((cur) => mergeIn(cur.filter((m) => m._id !== tmp._id), [{ ...data.message, local: tmp.local }]));
    } catch (e) {
      setItems((cur) => cur.map((m) => (m._id === tmp._id ? { ...m, state: "failed" } : m)));
      toast(errMsg(e), "err");
    }
  };
  const post = (t, file) => {
    const tmp = { _id: "tmp-" + ++n.current, tmp: true, state: "sending", from: me, text: t, hasImage: !!file, local: file ? URL.createObjectURL(file) : "", _file: file || null, createdAt: new Date().toISOString() };
    stick.current = true; setDiv(null); setItems((cur) => [...cur, tmp]);
    queue.current = queue.current.then(() => deliver(tmp));        // one after the other, so photos keep their order
  };
  const retry = (m) => { setItems((cur) => cur.map((x) => (x._id === m._id ? { ...x, state: "sending" } : x))); queue.current = queue.current.then(() => deliver(m)); };
  const send = () => {
    const t = text.trim(); if (!t && !staged.length) return;
    if (staged.length) staged.forEach((s, i) => post(i === 0 ? t : "", s.file)); else post(t, null);
    staged.forEach((s) => URL.revokeObjectURL(s.url)); setStaged([]); setText(""); if (box.current) box.current.style.height = "auto";
  };

  // ---- composer
  const addFiles = (fl) => {
    const ok = []; for (const f of Array.from(fl || [])) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { toast("Only JPG, PNG, WEBP or GIF photos can be sent.", "err"); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { toast(`${f.name || "Photo"} is bigger than ${MAX_MB} MB.`, "err"); continue; }
      ok.push({ file: f, url: URL.createObjectURL(f) });
    }
    setStaged((cur) => { const all = [...cur, ...ok]; if (all.length > MAX_FILES) { toast(`You can send up to ${MAX_FILES} photos at once.`, "err"); all.slice(MAX_FILES).forEach((s) => URL.revokeObjectURL(s.url)); } return all.slice(0, MAX_FILES); });
  };
  const onPaste = (e) => { const f = Array.from(e.clipboardData?.files || []).filter((x) => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); addFiles(f); } };
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); send(); } };
  const grow = (e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; };

  // group by day (sticky date pill), mark runs from the same sender
  const days = []; for (const m of items) {
    const k = new Date(m.createdAt).toDateString(); let g = days[days.length - 1];
    if (!g || g.k !== k) { g = { k, label: dayLabel(m.createdAt), rows: [] }; days.push(g); }
    g.rows.push(m);
  }
  const live = meta && meta.status === "active" && meta.endsAt && new Date(meta.endsAt) > new Date();
  const left = meta?.endsAt ? Math.ceil((new Date(meta.endsAt) - Date.now()) / 864e5) : null;

  return (
    <div className={"chat" + (drag ? " drag" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      <header className="chat-head">
        {onBack && <button className="icon-btn back" onClick={onBack} aria-label="Back to chats"><Icon n="left" /></button>}
        {me === "admin" ? <>
          <Avatar name={meta?.name || "S"} solid /><div className="grow"><b>{meta?.name || "Seller"}</b>
            <small>{meta ? <>{meta.plan || "No plan"} · {live ? `${left} day(s) left` : meta.status}</> : "Loading..."}</small></div>
          {meta && <div className="row wrap-gap">{!!meta.slug && <Link className="btn sm" to={`/admin/renewals?q=${meta.slug}`}><Icon n="award" /> Renewals</Link>}</div>}
        </> : <>
          <span className="av solid logo-av" aria-hidden="true"><img src="/logo-square.png" alt="" /></span><div className="grow"><b>Orderistan admin</b><small>Renewals, payments and help for your store</small></div>
        </>}
      </header>
      <div className="chat-body">
        <div className="chat-list" ref={list} onScroll={onScroll} role="log" aria-live="polite">
          {loading ? <ChatSkeleton /> : err ? <Empty icon="alert">{err}</Empty> : <>
            {hasMore ? <div className="c-older">{busyOld ? <><Spinner /> Loading earlier messages</> : <span>Scroll up for earlier messages</span>}</div> : items.length > 0 && <div className="c-start"><Icon n="shield" /> Messages are only visible to you and Orderistan.</div>}
            {!items.length && <div className="c-empty"><Icon n="chat" /><b>{me === "seller" ? "Say hello to Orderistan" : "No messages yet"}</b>
              <span>{me === "seller" ? "Send a message or a payment screenshot. The admin will reply here." : "Write the first message to this seller below."}</span></div>}
            {days.map((g) => (
              <section className="c-day" key={g.k}>
                <div className="c-sep"><span>{g.label}</span></div>
                {g.rows.map((m, i) => { const prev = g.rows[i - 1], cont = prev && prev.from === m.from && div?.id !== m._id;
                  return (
                    <Fragment key={m._id}>
                      {div?.id === m._id && <div className="c-unread"><span>{div.n} unread message{div.n > 1 ? "s" : ""}</span></div>}
                      <div className={"c-row " + (m.from === me ? "mine" : "theirs") + (cont ? " cont" : " first")}>
                        <div className={"c-bubble" + (m.state === "failed" ? " failed" : "") + (m.hasImage ? " has-img" : "")}>
                          {m.hasImage && <ChatImage m={m} onOpen={setView} onLoaded={settle} />}
                          {m.text && <span className="ct">{m.text}</span>}
                          <span className="c-meta">{hhmm(m.createdAt)}
                            {m.from === me && (m.state === "sending" ? <Icon n="clock" className="c-clock" /> : m.state === "failed" ? null : <Ticks seen={!!peerSeen && new Date(peerSeen) >= new Date(m.createdAt)} />)}</span>
                        </div>
                        {m.state === "failed" && <button className="c-retry" onClick={() => retry(m)}><Icon n="alert" /> Not sent. Tap to retry</button>}
                      </div>
                    </Fragment>); })}
              </section>))}
          </>}
        </div>
        {far && !loading && <button className="c-down" onClick={toEnd} aria-label="Jump to latest message"><Icon n="down" />{fresh > 0 && <em>{fresh > 99 ? "99+" : fresh}</em>}</button>}
      </div>
      {!!quick.length && !staged.length && !text && !loading && <div className="c-quick">{quick.map((q) => <button key={q} className="chip" onClick={() => post(q, null)}>{q}</button>)}</div>}
      {!!staged.length && <div className="c-stage">{staged.map((s, i) => (
        <div key={s.url}><img src={s.url} alt="Photo to send" /><button aria-label="Remove photo" onClick={() => { URL.revokeObjectURL(s.url); setStaged((c) => c.filter((_, k) => k !== i)); }}><Icon n="x" /></button></div>))}
        <small className="muted">Add a caption below, then send.</small></div>}
      <form className="c-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="c-field">
          <label className="attach" title="Send photos" aria-label="Attach photos"><Icon n="paperclip" />
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
          <textarea ref={box} rows={1} value={text} maxLength={2000} placeholder={staged.length ? "Add a caption..." : "Type a message"} aria-label="Message"
            onChange={grow} onKeyDown={onKey} onPaste={onPaste} />
        </div>
        <button className="send" aria-label="Send" disabled={!text.trim() && !staged.length}><Icon n="send" /></button>
      </form>
      {drag && <div className="c-drop"><Icon n="image" /> Drop photos to send</div>}
      {view && <Lightbox src={view} onClose={() => setView("")} />}
    </div>
  );
}

// ---- seller: one thread with the admin
export function SellerChat() {
  return (
    <>
      <PageHead title="Chat with Orderistan" sub="Ask about your subscription, send payment screenshots and get help from the admin." />
      <div className="chat-shell single">
        <ChatRoom me="seller" quick={["I want to renew my subscription", "I have sent the payment, please check", "I want to upgrade my plan"]} />
      </div>
    </>
  );
}

// ---- admin: inbox of all sellers + the open conversation
export function AdminChat() {
  const [sp, setSp] = useSearchParams(); const sel = sp.get("store") || "";
  const [filter, setFilter] = useState("chats"); const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const d = useGet("/chat/inbox", { filter, q: dq });
  const reload = d.reload;
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) reload(); }, 8000);
    const r = () => reload(); window.addEventListener("chat:read", r);
    return () => { clearInterval(t); window.removeEventListener("chat:read", r); };
  }, [reload]);
  const pick = useCallback((id) => setSp(id ? { store: id } : {}, { replace: true }), [setSp]);
  const items = d.data?.items || [];
  return (
    <>
      <PageHead title="Seller chat" sub="Answer renewal questions and check payment screenshots sent by sellers." />
      <div className={"chat-shell" + (sel ? " open" : "")}>
        <aside className="chat-inbox">
          <div className="c-search"><div className="input-ico"><Icon n="search" /><input placeholder="Search seller" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search seller" /></div>
            <div className="chips">{[["chats", "Chats"], ["unread", "Unread"], ["all", "All sellers"]].map(([v, l]) => <button key={v} className={"chip" + (filter === v ? " on" : "")} onClick={() => setFilter(v)}>{l}</button>)}</div></div>
          <div className="c-people">
            {d.loading && !d.data ? <Spinner /> : !items.length ? <Empty icon="inbox">{filter === "unread" ? "No unread messages." : filter === "all" ? "No sellers found." : "No conversations yet. Use All sellers to start one."}</Empty> :
              items.map((c) => (
                <button key={c.store._id} className={"c-person" + (sel === c.store._id ? " on" : "")} onClick={() => pick(c.store._id)}>
                  <Avatar name={c.store.name} /><div className="grow"><div className="row between"><b>{c.store.name}</b>{c.lastAt && <small className="muted">{dayLabel(c.lastAt) === "Today" ? new Date(c.lastAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : dayLabel(c.lastAt)}</small>}</div>
                    <div className="row between"><span className="muted c-prev">{c.lastHasImage && <Icon n="image" />} {c.lastMessage || (c.lastHasImage ? "Photo" : c.lastAt ? "" : c.store.subscription?.plan || "No messages yet")}</span>
                      {c.unread > 0 && <em className="nav-badge solid">{c.unread}</em>}</div></div>
                </button>))}
          </div>
        </aside>
        <section className="chat-main">
          {sel ? <ChatRoom key={sel} me="admin" storeId={sel} onBack={() => pick("")} /> : <div className="c-none"><Icon n="chat" /><b>Select a seller</b><span>Pick a conversation on the left.</span></div>}
        </section>
      </div>
    </>
  );
}
