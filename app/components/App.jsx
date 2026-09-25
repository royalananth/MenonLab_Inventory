"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { FlaskConical, Boxes, ClipboardList, BarChart3, Settings, Plus, Search, X, MapPin, ChevronLeft, ChevronRight, Download, Trash2, User, Check, Shield, Lock, RefreshCw, ShoppingCart, AlertTriangle, CheckCircle2, Send, PackageCheck, DollarSign, ClipboardCheck, Calendar, Clock, Bell, ListChecks, Pencil, TrendingDown, FileSpreadsheet, Beaker} from "lucide-react";

/* ---------- theme ---------- */
const T = { bg: "#F4F6F8", card: "#FFFFFF", ink: "#12151C", muted: "#5B6672", border: "#E2E7EC", accent: "#0E7C86", accentInk: "#0A5A62", amber: "#B45309", danger: "#B42318", line: "#EEF1F4" };
const PALETTE = ["#0E7C86", "#6D3BB5", "#B45309", "#127449", "#1D4ED8", "#5B6672"];
const catColor = (c, cats) => PALETTE[Math.max(0, cats.indexOf(c)) % PALETTE.length];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- dates ---------- */
function weekStart(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - off); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

/* ---------- atoms ---------- */
const Field = ({ label, children }) => (<label style={{ display: "block", marginBottom: 14 }}><span style={{ fontSize: 12, fontWeight: 600, color: T.muted, letterSpacing: ".02em", display: "block", marginBottom: 6 }}>{label}</span>{children}</label>);
const inpStyle = { width: "100%", boxSizing: "border-box", height: 44, padding: "0 12px", fontSize: 15, color: T.ink, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, outline: "none" };
const Input = (p) => <input {...p} style={{ ...inpStyle, ...(p.style || {}) }} />;
const UNITS = ["aliquots", "vial", "tube", "µL", "µg", "mg", "mL", "rxn", "kit", "bottle", "plate", "box", "each"];
const ANTIBODY_CATS = ["Antibodies"];
const ASSAY_GROUPS = ["", "Western", "Flow", "ICC", "ELISA/Multiplex", "CyTOF", "PCR", "Cell culture"];
const CLONALITY = ["", "M", "P"];

/* An item is low when it is at or below its par level (reorder threshold),
   or simply out when no par level has been set. */
function lowStock(i) {
  const qty = i.qty === "" || i.qty == null || isNaN(+i.qty) ? null : +i.qty;
  if (qty === null) return false;
  // Antibodies are counted in vials, but a record with no vials and a drawer
  // full of aliquots is not out of stock.
  const al = i.aliquots === "" || i.aliquots == null || isNaN(+i.aliquots) ? 0 : +i.aliquots;
  const onHand = qty > 0 ? qty : (al > 0 ? al : qty);
  const min = i.minQty === "" || i.minQty == null || isNaN(+i.minQty) ? null : +i.minQty;
  return min !== null ? onHand <= min : onHand <= 0;
}
const UnitInput = (p) => (<><input {...p} list="unit-opts" style={{ ...inpStyle, ...(p.style || {}) }} placeholder={p.placeholder || "unit"} /><datalist id="unit-opts">{UNITS.map((u) => <option key={u} value={u} />)}</datalist></>);
const Select = ({ children, ...p }) => <select {...p} style={{ ...inpStyle, appearance: "none", ...(p.style || {}) }}>{children}</select>;
const Btn = ({ kind = "primary", style, ...p }) => { const base = { height: 46, borderRadius: 12, fontSize: 15, fontWeight: 600, border: "1px solid transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }; const kinds = { primary: { background: T.accent, color: "#fff" }, ghost: { background: "#fff", color: T.ink, border: `1px solid ${T.border}` }, danger: { background: "#fff", color: T.danger, border: `1px solid ${T.danger}44` } }; return <button {...p} style={{ ...base, ...kinds[kind], ...style }} />; };
const Static = ({ label, value }) => value ? (<div style={{ marginBottom: 12 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 14.5, color: T.ink }}>{value}</div></div>) : null;
function Sheet({ title, onClose, children }) {
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0009", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
      <div style={{ position: "sticky", top: 0, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${T.line}` }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: T.ink, margin: 0 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}><X size={22} /></button>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  </div>);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("log");
  const [me, setMe] = useState("");
  const [token, setToken] = useState("");
  const [srvCaps, setSrvCaps] = useState(null);
  const [instrAccess, setInstrAccess] = useState([]);
  const [orderEvents, setOrderEvents] = useState([]);
  const [chairLimit, setChairLimit] = useState(1000);
  const [members, setMembers] = useState([]);
  const [cats, setCats] = useState([]);
  const [projects, setProjects] = useState([]);
  const [inv, setInv] = useState([]);
  const [usage, setUsage] = useState([]);
  const [grants, setGrants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [mediaPar, setMediaPar] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [orderSeed, setOrderSeed] = useState(null);
  const [toast, setToast] = useState("");
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 2600); };
  const tokenRef = useRef("");
  const unseenRef = useRef(0);

  const clearLocal = useCallback(() => {
    tokenRef.current = ""; setToken(""); setMe(""); setSrvCaps(null);
    try { localStorage.removeItem("mlab_token"); } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!tokenRef.current) { setReady(true); return; }
    setSyncing(true);
    try {
      const r = await fetch("/api/data", { cache: "no-store", headers: { "x-session": tokenRef.current } });
      if (r.status === 401) { clearLocal(); setSyncing(false); setReady(true); return; }
      const d = await r.json();
      setMe(d.me ? d.me.name : ""); setSrvCaps(d.caps || null);
      setMembers(d.members || []); setCats(d.categories || []); setProjects(d.projects || []);
      setInv(d.items || []); setUsage(d.usage || []); setGrants(d.grants || []); setOrders(d.orders || []);
      setInstruments(d.instruments || []); setBookings(d.bookings || []); setNotifs(d.notifications || []);
      setMediaPar(d.mediaPar || []); setInstrAccess(d.instrumentAccess || []);
      setOrderEvents(d.orderEvents || []); setChairLimit(d.chairThreshold || 1000);
    } catch { /* keep last good state */ }
    setSyncing(false); setReady(true);
  }, [clearLocal]);

  useEffect(() => {
    try { const t = localStorage.getItem("mlab_token"); if (t) { tokenRef.current = t; setToken(t); } } catch {}
    load();
    const iv = setInterval(load, 25000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const signedIn = (tok) => {
    tokenRef.current = tok; setToken(tok);
    try { localStorage.setItem("mlab_token", tok); } catch {}
    setReady(false); load();
  };
  const signOut = async () => {
    const t = tokenRef.current;
    clearLocal();
    setTab("log");
    try { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout", token: t }) }); } catch {}
  };

  // Errors used to be swallowed; now a refusal from the server is shown.
  const post = async (body) => {
    let out = { ok: false };
    try {
      const r = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json", "x-session": tokenRef.current }, body: JSON.stringify(body) });
      out = await r.json().catch(() => ({ ok: r.ok }));
      if (r.status === 401) { clearLocal(); flash("Signed out - please sign in again"); return out; }
      if (!r.ok) flash(out.error || "That wasn't allowed");
    } catch { /* offline: the next reload reconciles */ }
    load();
    return out;
  };

  // granular handlers (optimistic + persist)
  const upsertItem = (item) => { setInv((s) => s.some((i) => i.id === item.id) ? s.map((i) => i.id === item.id ? item : i) : [...s, item]); post({ type: "item", action: "upsert", payload: item }); flash("Saved"); };
  const deleteItem = (id) => { setInv((s) => s.filter((i) => i.id !== id)); post({ type: "item", action: "delete", payload: { id } }); flash("Deleted"); };
  const bulkPar = async (category, minQty, onlyMissing) => {
    const r = await post({ type: "item", action: "bulkPar", payload: { category, minQty, onlyMissing } });
    if (r && r.ok) flash(`Par level set on ${r.updated} item${r.updated === 1 ? "" : "s"}`);
  };
  const logUsage = (entry) => {
    setUsage((s) => [entry, ...s]);
    if (entry.itemId && entry.qty && !isNaN(+entry.qty)) setInv((s) => s.map((i) => (i.id === entry.itemId && i.qty !== "" && !isNaN(+i.qty)) ? { ...i, qty: String(Math.max(0, +i.qty - +entry.qty)) } : i));
    post({ type: "usage", action: "add", payload: entry }); flash("Logged");
  };
  const updateUsage = (u) => { setUsage((s) => s.map((x) => x.id === u.id ? { ...x, ...u } : x)); post({ type: "usage", action: "update", payload: u }); flash("Updated"); };
  const deleteUsage = (id) => { setUsage((s) => s.filter((x) => x.id !== id)); post({ type: "usage", action: "delete", payload: { id } }); flash("Entry removed"); };
  const addMember = (p) => { setMembers((s) => [...s, { name: p.name, email: p.email, role: p.role, pd: false }].sort((a, b) => a.name.localeCompare(b.name))); post({ type: "member", action: "add", payload: p }); flash("Member added"); };
  const delMember = (name) => { setMembers((s) => s.filter((m) => m.name !== name)); post({ type: "member", action: "delete", payload: { name } }); };
  const toggleAdmin = (name) => { setMembers((s) => s.map((m) => m.name === name ? { ...m, role: m.role === "admin" ? "member" : "admin" } : m)); post({ type: "member", action: "toggleAdmin", payload: { name } }); };
  const addProject = (p) => { const proj = { id: uid(), name: p.name, leader: p.leader }; setProjects((s) => [...s, proj]); post({ type: "project", action: "add", payload: proj }); flash("Project added"); };
  const updateProject = (p) => { setProjects((s) => s.map((x) => x.id === p.id ? p : x)); post({ type: "project", action: "update", payload: p }); flash("Project updated"); };
  const delProject = (id) => { setProjects((s) => s.filter((p) => p.id !== id)); post({ type: "project", action: "delete", payload: { id } }); };
  const addCat = (name) => { setCats((s) => s.includes(name) ? s : [...s, name]); post({ type: "category", action: "add", payload: { name } }); };
  const delCat = (name) => { setCats((s) => s.filter((c) => c !== name)); post({ type: "category", action: "delete", payload: { name } }); };
  const upsertGrant = (g) => { setGrants((s) => s.some((x) => x.id === g.id) ? s.map((x) => x.id === g.id ? g : x) : [...s, g]); post({ type: "grant", action: "upsert", payload: g }); flash("Saved"); };
  const delGrant = (id) => { setGrants((s) => s.filter((g) => g.id !== id)); post({ type: "grant", action: "delete", payload: { id } }); };
  const createOrder = (o) => { setOrders((s) => [{ ...o, status: "requested", requester: me, createdAt: new Date().toISOString() }, ...s]); post({ type: "order", action: "create", payload: o }); flash("Sent to " + shortName(o.approver || "") + " for approval"); };
  const updateOrder = (o) => { setOrders((s) => s.map((x) => x.id === o.id ? { ...x, ...o } : x)); post({ type: "order", action: "update", payload: o }); flash("Request updated"); };
  const STMAP = { place: "ordered", receive: "received", reject: "rejected", chairApprove: "approved" };
  const orderAction = async (id, action, extra = {}) => {
    // The server decides whether a PD approval ends the chain or hands it to the
    // chair, so don't guess the next status for that one — just reload.
    if (action !== "approve") {
      setOrders((s) => s.map((o) => o.id === id ? { ...o, status: STMAP[action] || o.status, ...(action === "chairApprove" ? { piApprover: me } : action === "reassign" ? { approver: extra.approver } : action === "place" ? { purchaser: me, po: extra.po } : action === "reject" ? { rejectReason: extra.reason } : {}) } : o));
    }
    const r = await post({ type: "order", action, payload: { id, ...extra } });
    if (!r || !r.ok) return;
    const o = orders.find((x) => x.id === id);
    const amount = o ? Number(o.total) || 0 : 0;
    if (action === "receive" && extra.addItem) flash("Received - added to inventory");
    else if (action === "approve") flash(amount >= chairLimit ? "Approved - sent to Dr. Menon" : "Approved - sent to Megan");
    else if (action === "chairApprove") flash("Approved - sent to Megan");
    else if (action === "place") flash("Marked placed");
    else flash("Updated");
  };
  const setChairThreshold = async (value) => { const r = await post({ type: "setting", action: "chairThreshold", payload: { value } }); if (r && r.ok) flash("Approval limit updated"); };
  const delOrder = (id) => { setOrders((s) => s.filter((o) => o.id !== id)); post({ type: "order", action: "delete", payload: { id } }); };
  const addBooking = (b) => { setBookings((s) => [...s, b]); post({ type: "booking", action: "add", payload: b }); flash("Booked"); };
  const delBooking = (id) => { setBookings((s) => s.filter((b) => b.id !== id)); post({ type: "booking", action: "delete", payload: { id } }); flash("Cancelled"); };
  const upsertInstrument = (ins) => { setInstruments((s) => s.some((x) => x.id === ins.id) ? s.map((x) => x.id === ins.id ? ins : x) : [...s, ins]); post({ type: "instrument", action: "upsert", payload: ins }); flash("Saved"); };
  const requestAccess = (instrumentId, note) => { post({ type: "access", action: "request", payload: { instrumentId, note } }); flash("Access requested"); };
  const decideAccess = (id, status, note) => { post({ type: "access", action: "decide", payload: { id, status, note } }); flash(status === "granted" ? "Access granted" : "Access declined"); };
  const delInstrument = (id) => { setInstruments((s) => s.filter((x) => x.id !== id)); post({ type: "instrument", action: "delete", payload: { id } }); };
  const markSeen = (id) => { setNotifs((s) => s.map((n) => n.id === id ? { ...n, seen: true } : n)); post({ type: "notification", action: "seen", payload: { id } }); };
  const markAllSeen = () => { setNotifs((s) => s.map((n) => ({ ...n, seen: true }))); post({ type: "notification", action: "seenAll", payload: { me } }); };

  const setMemberRole = (name, role) => { setMembers((s) => s.map((m) => m.name === name ? { ...m, role } : m)); post({ type: "member", action: "setRole", payload: { name, role } }); };
  const setOwner = (name, owner) => { post({ type: "member", action: "setOwner", payload: { name, owner } }); flash(owner ? "Can now grant access" : "Access-owner right removed"); };
  const setPhone = async (name, whatsapp) => { const r = await post({ type: "member", action: "setPhone", payload: { name, whatsapp } }); if (r && r.ok) flash(whatsapp ? "WhatsApp number saved" : "Number removed"); };

  const memberNames = members.map((m) => m.name);
  const pdNames = members.filter((m) => m.pd).map((m) => m.name);
  // Requests go straight to a PI now, so this list is what the requester picks from.
  const approverNames = members.filter((m) => m.role === "chair" || m.pd).map((m) => m.name);
  const meRec = members.find((m) => m.name === me) || {};
  // The server is the authority on what you may do; this is only for drawing the UI.
  const caps = srvCaps || { approve: false, place: false, grants: false, edit: false, access: false, owner: false, guest: false, view: true, book: true, request: false, log: false };
  const isGuest = !!caps.guest;
  const canEdit = !!caps.edit;
  const unseen = notifs.filter((n) => !n.seen).length;

  // A quiet browser notification when something new lands, so Megan sees an
  // approved order without waiting on UTMB email.
  useEffect(() => {
    if (unseen > unseenRef.current && unseenRef.current !== 0) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = notifs.find((x) => !x.seen);
          if (n) new Notification(n.title, { body: n.body, tag: "mlab-" + n.id });
        }
      } catch {}
    }
    unseenRef.current = unseen;
  }, [unseen, notifs]);

  if (!ready) return <div style={{ minHeight: "100vh", background: T.bg, display: "grid", placeItems: "center", color: T.muted, fontFamily: "system-ui" }}>Loading inventory…</div>;
  if (!me) return <LoginGate onSignedIn={signedIn} />;
  const view = isGuest && !["book", "me"].includes(tab) ? "book" : tab;
  const myAccess = instrAccess.filter((a) => a.member === me);
  const accessQueue = instrAccess.filter((a) => a.status === "requested" &&
    (canEdit || instruments.some((i) => i.id === a.instrumentId && i.superUser === me)));

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: T.bg, minHeight: "100vh", color: T.ink }}>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", paddingBottom: 88, position: "relative" }}>
        <header style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${T.line}`, background: "#fff", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: T.accent, display: "grid", placeItems: "center", color: "#fff" }}><FlaskConical size={18} /></div>
              <div><div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1 }}>Menon Lab</div><div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>Inventory &amp; usage</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={load} title="Refresh" style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}><RefreshCw size={16} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} /></button>
              {<button onClick={() => setShowNotif(true)} title="Alerts" style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: unseen > 0 ? T.accent : T.muted, padding: 4 }}>
                <Bell size={18} />
                {unseen > 0 && <span style={{ position: "absolute", top: -1, right: -3, background: T.danger, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 999, minWidth: 15, height: 15, display: "grid", placeItems: "center", padding: "0 3px" }}>{unseen}</span>}
              </button>}
              <button onClick={() => setTab("me")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer", maxWidth: 130 }}>
                {canEdit ? <Shield size={14} color={T.accent} /> : <User size={14} color={T.muted} />}
                <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(me)}</span>
              </button>
            </div>
          </div>
        </header>

        <PendingBanner
          orders={orders} me={me} caps={caps} accessQueue={accessQueue} view={view}
          onOrders={() => setTab("ord")} onAccess={() => setTab("book")} />

        {view === "log" && <LogTab {...{ me, inv, usage, cats, onLog: logUsage, onUpdateUsage: updateUsage, onDeleteUsage: deleteUsage }} />}
        {view === "inv" && <InvTab {...{ me, inv, cats, projects, pdNames, canEdit, isGuest, onUpsert: upsertItem, onDelete: deleteItem, onBulkPar: bulkPar, onRequest: (seed) => { setOrderSeed(seed); setTab("ord"); } }} />}
        {view === "ord" && <OrdersTab {...{ me, caps, token, orders, orderEvents, chairLimit, grants, projects, inv, members, approverNames, mediaPar, orderSeed, clearSeed: () => setOrderSeed(null), onCreate: createOrder, onUpdate: updateOrder, onAction: orderAction, onDelete: delOrder, onUpsertGrant: upsertGrant, onDelGrant: delGrant }} />}
        {view === "book" && <BookTab {...{ me, canEdit, instruments, bookings, memberNames, myAccess, accessQueue, onBook: addBooking, onCancel: delBooking, onUpsertInstrument: upsertInstrument, onDelInstrument: delInstrument, onRequestAccess: requestAccess, onDecideAccess: decideAccess }} />}
        {view === "rep" && <RepTab {...{ usage, memberNames }} />}
        {view === "set" && <SetTab {...{ members, cats, projects, pdNames, inv, usage, mediaPar, canEdit, caps, token, onAddMember: addMember, onDelMember: delMember, onToggleAdmin: toggleAdmin, onSetRole: setMemberRole, onSetOwner: setOwner, onSetPhone: setPhone, chairLimit, onSetChairLimit: setChairThreshold, onAddProject: addProject, onUpdateProject: updateProject, onDelProject: delProject, onAddCat: addCat, onDelCat: delCat, onReload: load, flash }} />}
        {view === "me" && <MeTab {...{ me, meRec, caps, token, onSignOut: signOut, flash }} />}

        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "#fff", borderTop: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: `repeat(${isGuest ? 2 : 6},1fr)`, height: 66, zIndex: 20 }}>
          {(isGuest
            ? [["book", "Book", Calendar], ["me", "You", User]]
            : [["log", "Log", ClipboardList], ["inv", "Inventory", Boxes], ["ord", "Orders", ShoppingCart], ["book", "Book", Calendar], ["rep", "Reports", BarChart3], ["set", "Manage", Settings]]
          ).map(([k, label, Icon]) => {
            const badge = k === "ord" ? pendingFor(orders, me, caps) : k === "book" ? accessQueue.length : 0;
            return (<button key={k} onClick={() => setTab(k)} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: view === k ? T.accent : T.muted }}>
              <Icon size={19} />{badge > 0 && <span style={{ position: "absolute", top: 6, right: "50%", marginRight: -18, background: T.danger, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 999, minWidth: 15, height: 15, display: "grid", placeItems: "center", padding: "0 3px" }}>{badge}</span>}<span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
            </button>);
          })}
        </nav>

        {showNotif && <NotifSheet notifs={notifs} onSeen={markSeen} onSeenAll={markAllSeen} onGo={(n) => { markSeen(n.id); setShowNotif(false); setTab("ord"); }} onClose={() => setShowNotif(false)} />}

        {toast && <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "10px 16px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, zIndex: 60, display: "flex", alignItems: "center", gap: 7 }}><Check size={15} />{toast}</div>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{-webkit-tap-highlight-color:transparent}`}</style>
    </div>
  );
}

/* ---------- LOG ---------- */
function LogTab({ me, inv, usage, cats, onLog, onUpdateUsage, onDeleteUsage }) {
  const [q, setQ] = useState(""); const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(""); const [unit, setUnit] = useState(""); const [exp, setExp] = useState(""); const [note, setNote] = useState("");
  const [editU, setEditU] = useState(null);
  const matches = q ? inv.filter((i) => (i.name + " " + i.vendor + " " + i.catalog).toLowerCase().includes(q.toLowerCase())).slice(0, 10) : [];
  const mine = usage.filter((u) => u.member === me).slice(0, 8);
  const submit = () => {
    if (!sel || !exp.trim()) return;
    onLog({ id: uid(), member: me, itemId: sel.id, itemName: sel.name, category: sel.category, qty: qty || "", unit: unit || sel.unit || "", project: sel.scope === "Project" ? sel.project : "General", experiment: exp.trim(), room: sel.room, fridge: sel.fridge, box: sel.box, notes: note.trim(), date: new Date().toISOString() });
    setSel(null); setQty(""); setUnit(""); setExp(""); setNote(""); setQ("");
  };
  if (!me) return <div style={{ padding: 18, color: T.muted, fontSize: 14 }}>Pick your name to start logging.</div>;
  return (
    <div style={{ padding: 18 }}>
      <SectionTitle icon={ClipboardList}>Log usage</SectionTitle>
      {!sel ? (<>
        <div style={{ position: "relative" }}><Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 14 }} /><Input placeholder="Search a reagent…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} /></div>
        {!q && <EmptyNote>Search {inv.length} items by name, vendor, or catalog #, then log what you used.</EmptyNote>}
        {q && matches.length === 0 && <EmptyNote>No match for "{q}".</EmptyNote>}
        <div style={{ marginTop: 8 }}>{matches.map((i) => (
          <button key={i.id} onClick={() => { setSel(i); setUnit(i.unit || defaultUnit(i.category)); }} style={rowBtn}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: catColor(i.category, cats), flexShrink: 0 }} />
              <div style={{ minWidth: 0, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div><div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{locLine(i)}</div></div></div>
            {i.qty !== "" && i.qty != null && <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{i.qty}{i.unit ? " " + i.unit : ""}</span>}
          </button>))}</div>
      </>) : (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ minWidth: 0, paddingRight: 8 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{sel.name}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{sel.category} · {locLine(sel)}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{sel.scope === "Project" ? `Project: ${sel.project}${sel.leader ? " (" + shortName(sel.leader) + ")" : ""}` : "General inventory"}</div></div>
            <button onClick={() => setSel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}><X size={20} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Amount used"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 1" /></Field><Field label="Unit"><UnitInput value={unit} onChange={(e) => setUnit(e.target.value)} /></Field></div>
          <Field label="Experiment *"><Input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="e.g. P-gp WB, batch 12" /></Field>
          <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="lot, dilution…" /></Field>
          <Btn onClick={submit} style={{ opacity: exp.trim() ? 1 : .5 }}>Log usage</Btn>
        </div>)}
      {mine.length > 0 && <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 8 }}>YOUR RECENT ENTRIES</div>
        {mine.map((u) => (<div key={u.id} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.itemName}</div><div style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap" }}>{fmtTime(u.date)}</div></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{[u.qty && `${u.qty} ${u.unit}`, u.experiment, u.project].filter(Boolean).join(" · ")}</div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => setEditU(u)} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 3 }}><Pencil size={15} /></button>
              <button onClick={() => onDeleteUsage(u.id)} title="Remove this entry" style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 3 }}><Trash2 size={15} /></button>
            </div>
          </div></div>))}
      </div>}
      {editU && <UsageEdit u={editU} onSave={(x) => { onUpdateUsage(x); setEditU(null); }} onClose={() => setEditU(null)} />}
    </div>
  );
}

function UsageEdit({ u, onSave, onClose }) {
  const [qty, setQty] = useState((u.qty ?? "") + ""); const [unit, setUnit] = useState(u.unit || ""); const [exp, setExp] = useState(u.experiment || ""); const [note, setNote] = useState(u.notes || "");
  return (<Sheet title="Edit usage entry" onClose={onClose}>
    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{u.itemName}</div>
    <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Correcting this record adjusts the stock count accordingly.</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Amount used"><Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field><Field label="Unit"><UnitInput value={unit} onChange={(e) => setUnit(e.target.value)} /></Field></div>
    <Field label="Experiment"><Input value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
    <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <Btn onClick={() => onSave({ id: u.id, qty, unit, experiment: exp, notes: note })}>Save changes</Btn>
  </Sheet>);
}

/* ---------- INVENTORY ---------- */
function InvTab({ me, inv, cats, projects, pdNames, canEdit, isGuest, onUpsert, onDelete, onBulkPar, onRequest }) {
  const [parPanel, setParPanel] = useState(false);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("All"); const [edit, setEdit] = useState(null); const [view, setView] = useState(null);
  const filtered = inv.filter((i) => {
    if (q && !(i.name + " " + i.vendor + " " + i.catalog + " " + i.box + " " + (i.lot || "") + " " + (i.assayGroup || "") + " " + (i.applications || "") + " " + (i.clone || "")).toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "General store") return i.scope !== "Project";
    if (filter === "Project kits") return i.scope === "Project";
    if (filter === "Needs info") return incomplete(i);
    if (filter === "Low stock") return lowStock(i);
    if (filter === "Duplicates") return false; // handled by its own view below
    if (cats.includes(filter)) return i.category === filter;
    return true;
  });
  const narrowed = q || cats.includes(filter) || filter === "Project kits" || filter === "Needs info" || filter === "Low stock";
  const cap = narrowed ? 100 : 10;
  const groups = cats.map((c) => [c, filtered.filter((i) => i.category === c)]).filter(([, arr]) => arr.length);
  const exportInv = () => {
    const rows = inv.map((i) => ({ Name: i.name, Category: i.category, Assay: i.assayGroup, Scope: i.scope, Project: i.project, Leader: i.leader, Room: i.room, "Fridge/Location": i.fridge, Box: i.box, Qty: i.qty, Unit: i.unit, "Par level": i.minQty, "Cat#": i.catalog, Vendor: i.vendor, "Lot#": i.lot, Host: i.host, Clonality: i.clonality, Clone: i.clone, Isotype: i.isotype, Reactivity: i.reactivity, Applications: i.applications, Owner: i.owner, Received: i.received, Notes: i.notes }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Inventory"); XLSX.writeFile(wb, `MenonLab_Inventory_${isoDate(new Date())}.xlsx`);
  };
  const missingCount = inv.filter(incomplete).length;
  const low = inv.filter(lowStock);
  const hasPar = (i) => !(i.minQty === "" || i.minQty == null || isNaN(+i.minQty));
  const noPar = inv.filter((i) => !hasPar(i)).length;
  const dupGroups = findDuplicates(inv);
  const dupCount = dupGroups.reduce((n, g) => n + g.length - 1, 0);
  const chips = ["All", ...(low.length ? ["Low stock"] : []), ...(canEdit && dupCount ? ["Duplicates"] : []), "General store", "Project kits", ...(missingCount ? ["Needs info"] : []), ...cats];
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle icon={Boxes} noMargin>Inventory <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>· {inv.length}</span></SectionTitle>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportInv} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", color: T.ink, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Download size={15} />Excel</button>
          {canEdit && <button onClick={() => setEdit({ new: true })} style={{ display: "flex", alignItems: "center", gap: 5, background: T.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={16} />Add</button>}
        </div>
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}><Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 14 }} /><Input placeholder="Search name, vendor, cat #, box…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} /></div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>{chips.map((c) => (<button key={c} onClick={() => setFilter(c)} style={{ flexShrink: 0, border: `1px solid ${filter === c ? T.accent : T.border}`, background: filter === c ? T.accent : "#fff", color: filter === c ? "#fff" : T.ink, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</button>))}</div>
      {low.length > 0 && filter !== "Low stock" && (
        <button onClick={() => setFilter("Low stock")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "#FDF0DF", border: `1px solid ${T.amber}33`, borderRadius: 12, padding: "11px 13px", margin: "4px 0 10px", cursor: "pointer", textAlign: "left" }}>
          <TrendingDown size={17} color={T.amber} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: T.amber, fontWeight: 600 }}>{low.length} item{low.length === 1 ? "" : "s"} at or below par level — tap to review</span>
        </button>)}

      {canEdit && noPar > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 13px", margin: "4px 0 10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <AlertTriangle size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{noPar} items have no par level</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>Without one, an item only shows as low when it hits zero. Set a threshold per category and the restocking alerts start working.</div>
              <button onClick={() => setParPanel((v) => !v)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 7 }}>{parPanel ? "Hide" : "Set par levels"}</button>
            </div>
          </div>
          {parPanel && <ParLevelPanel inv={inv} cats={cats} onBulkPar={onBulkPar} />}
        </div>)}
      {!canEdit && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: T.muted, margin: "4px 0 10px" }}><Lock size={13} />View only — tap an item for details. Editing is limited to program directors.</div>}
      {groups.map(([cat, arr]) => (
        <div key={cat} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: catColor(cat, cats) }} /><span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".03em" }}>{cat.toUpperCase()}</span><span style={{ fontSize: 11.5, color: T.muted }}>· {arr.length}</span></div>
          {arr.slice(0, cap).map((i) => (
            <button key={i.id} onClick={() => canEdit ? setEdit(i) : setView(i)} style={{ ...rowBtn, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}><MapPin size={12} />{locLine(i)}{i.scope === "Project" && <span style={{ color: "#127449", fontWeight: 600 }}>· {i.project}</span>}{incomplete(i) && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.amber, fontWeight: 600 }}><AlertTriangle size={11} />needs info</span>}</div></div>
              <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 8 }}>{i.qty !== "" && i.qty != null && <div style={{ fontSize: 13, fontWeight: 700, color: lowStock(i) ? T.amber : T.ink }}>{i.qty}{i.unit ? " " + i.unit : ""}</div>}{i.aliquots && +i.aliquots > 0 ? <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>+{i.aliquots} aliquots</div> : null}{i.minQty ? <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>par {i.minQty}</div> : null}{i.box && <div style={{ fontSize: 11, color: T.muted, fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2 }}>{i.box}</div>}</div>
            </button>))}
          {arr.length > cap && <div style={{ fontSize: 12, color: T.muted, padding: "4px 2px 2px" }}>+{arr.length - cap} more — search or pick this category to see all.</div>}
        </div>))}
      {filter === "Duplicates" && <DuplicatesView groups={dupGroups} onOpen={(i) => setEdit(i)} onDelete={onDelete} />}
      {filter !== "Duplicates" && filtered.length === 0 && <EmptyNote>No items match.</EmptyNote>}
      {edit && <ItemForm item={edit.new ? null : edit} cats={cats} projects={projects} pdNames={pdNames} onRequest={!edit.new && me && !isGuest ? () => { onRequest(edit); setEdit(null); } : null} onSave={(it) => { onUpsert(it); setEdit(null); }} onDelete={(id) => { onDelete(id); setEdit(null); }} onClose={() => setEdit(null)} />}
      {view && <ItemForm item={view} cats={cats} projects={projects} pdNames={pdNames} readOnly onRequest={me && !isGuest ? () => { onRequest(view); setView(null); } : null} onClose={() => setView(null)} />}
    </div>
  );
}

/* Two records for one tube on the shelf. Groups by catalog number first, then
   by name + vendor, and leaves the judgement to a person — nothing is merged
   or removed automatically. */
function findDuplicates(inv) {
  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byCat = new Map();
  const byNv = new Map();
  for (const i of inv) {
    const c = norm(i.catalog);
    if (c.length >= 3) {
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(i);
    } else {
      const k = norm(i.name) + "|" + norm(i.vendor);
      if (norm(i.name).length < 3) continue;
      if (!byNv.has(k)) byNv.set(k, []);
      byNv.get(k).push(i);
    }
  }
  const groups = [...byCat.values(), ...byNv.values()].filter((g) => g.length > 1);
  groups.sort((a, b) => b.length - a.length || String(a[0].name).localeCompare(String(b[0].name)));
  return groups;
}

const itemLabel = (i) => (i.name || "").trim() || [i.catalog, i.vendor].filter(Boolean).join(" · ") || "Unnamed item";

function DuplicatesView({ groups, onOpen, onDelete }) {
  if (groups.length === 0) return <EmptyNote>No duplicates found.</EmptyNote>;
  const total = groups.reduce((n, g) => n + g.length - 1, 0);
  // Name the set by its fullest entry — these sets usually differ only by a
  // typo or an abbreviation of the same antibody.
  const setName = (g) => g.map(itemLabel).sort((a, b) => b.length - a.length)[0];
  return (<div>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: T.amber, background: "#FDF0DF", border: `1px solid ${T.amber}33`, borderRadius: 12, padding: "11px 13px", marginBottom: 14, lineHeight: 1.45 }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div><b>{groups.length} sets look like the same item</b> — {total} record{total === 1 ? "" : "s"} could go. Check the location and quantity before removing one; two entries can be two genuine tubes in different boxes.</div>
    </div>
    {groups.map((g, gi) => (
      <div key={gi} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{setName(g)}</div>
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 9 }}>{[g[0].vendor, g[0].catalog].filter(Boolean).join(" · ")} — {g.length} records</div>
        {g.map((i) => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 9, borderTop: `1px solid ${T.line}`, padding: "9px 0 0", marginTop: 8 }}>
            <button onClick={() => onOpen(i)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemLabel(i)}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                {i.qty !== "" && i.qty != null ? `${i.qty} ${i.unit || ""}` : "no quantity"}
                {i.aliquots && +i.aliquots > 0 ? ` · +${i.aliquots} aliquots` : ""} · {locLine(i)}
              </div>
            </button>
            <button onClick={() => { if (window.confirm(`Delete this record?\n\n${itemLabel(i)}\n${i.qty !== "" ? i.qty + " " + (i.unit || "") : "no quantity"} at ${locLine(i)}\n\nThe other ${g.length - 1} record${g.length - 1 === 1 ? "" : "s"} in this set stay.`)) onDelete(i.id); }}
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${T.danger}44`, color: T.danger, borderRadius: 9, padding: "7px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <Trash2 size={14} />Delete
            </button>
          </div>
        ))}
      </div>
    ))}
  </div>);
}

/* Par levels are what make the restocking alerts mean anything. Setting 1,500
   of them by hand is not going to happen, so set them a category at a time. */
function ParLevelPanel({ inv, cats, onBulkPar }) {
  const [cat, setCat] = useState(cats[0] || "");
  const [val, setVal] = useState("1");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const hasPar = (i) => !(i.minQty === "" || i.minQty == null || isNaN(+i.minQty));
  const inCat = cat === "*" ? inv : inv.filter((i) => i.category === cat);
  const affected = onlyMissing ? inCat.filter((i) => !hasPar(i)).length : inCat.length;
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
      <Field label="Category">
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          {cats.map((c) => {
            const n = inv.filter((i) => i.category === c && !hasPar(i)).length;
            return <option key={c} value={c}>{c}{n ? ` — ${n} without a par level` : ""}</option>;
          })}
          <option value="*">Everything</option>
        </Select>
      </Field>
      <Field label="Reorder when stock drops to"><Input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} style={{ width: 16, height: 16 }} />
        Only items that don&apos;t have one yet
      </label>
      <Btn onClick={() => { if (val.trim() && !isNaN(+val)) onBulkPar(cat, val.trim(), onlyMissing); }} style={{ opacity: affected > 0 && val.trim() && !isNaN(+val) ? 1 : .5 }}>
        <TrendingDown size={16} />Apply to {affected} item{affected === 1 ? "" : "s"}
      </Btn>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>You can still change any single item&apos;s par level by opening it.</div>
    </div>
  );
}

function ItemForm({ item, cats, projects, pdNames, readOnly, onSave, onDelete, onRequest, onClose }) {
  const [f, setF] = useState(item || { id: uid(), name: "", category: cats[0], scope: "General", project: "", leader: "", room: "", fridge: "", box: "", catalog: "", vendor: "", qty: "", unit: "", notes: "", lot: "", assayGroup: "", host: "", clonality: "", clone: "", isotype: "", reactivity: "", applications: "", owner: "", received: "", minQty: "", aliquots: "" });
  const isAb = ANTIBODY_CATS.includes(f.category);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onProject = (name) => { const p = projects.find((x) => x.name === name); setF((s) => ({ ...s, project: name, leader: p && p.leader ? p.leader : s.leader })); };
  const ok = f.name.trim() && (f.scope !== "Project" || f.project);
  if (readOnly) return (<Sheet title={f.name} onClose={onClose}>
    {lowStock(f) && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.amber, background: "#FDF0DF", borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}><TrendingDown size={15} />At or below par level{f.minQty ? ` (par ${f.minQty})` : ""} — worth reordering.</div>}
    <Static label="Category" value={[f.category, f.assayGroup].filter(Boolean).join(" · ")} /><Static label="Belongs to" value={f.scope === "Project" ? `${f.project}${f.leader ? " · " + shortName(f.leader) : ""}` : "General inventory"} />
    <Static label="Location" value={locLine(f)} /><Static label="Quantity" value={f.qty !== "" ? `${f.qty} ${f.unit}` : ""} /><Static label="Aliquots" value={f.aliquots && +f.aliquots > 0 ? String(f.aliquots) : ""} /><Static label="Par level" value={f.minQty} />
    <Static label="Catalog #" value={f.catalog} /><Static label="Vendor" value={f.vendor} /><Static label="Lot #" value={f.lot} />
    {isAb && <><Static label="Host / clonality" value={[f.host, f.clonality === "M" ? "monoclonal" : f.clonality === "P" ? "polyclonal" : f.clonality].filter(Boolean).join(" · ")} />
      <Static label="Clone #" value={f.clone} /><Static label="Isotype" value={f.isotype} /><Static label="Reactivity" value={f.reactivity} /><Static label="Validated for" value={f.applications} /></>}
    <Static label="Kept by" value={f.owner} /><Static label="Received" value={f.received} /><Static label="Notes" value={f.notes} />
    {onRequest && <div style={{ marginTop: 6 }}><Btn kind="ghost" onClick={onRequest}><ShoppingCart size={16} />Request more of this</Btn></div>}
  </Sheet>);
  return (<Sheet title={item ? "Edit item" : "Add item"} onClose={onClose}>
    <Field label="Reagent name *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Anti-P-gp (C219)" /></Field>
    <Field label="Category"><Select value={f.category} onChange={(e) => set("category", e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
    <Field label="Belongs to"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{["General", "Project"].map((s) => (<button key={s} onClick={() => set("scope", s)} style={{ height: 44, borderRadius: 10, border: `1px solid ${f.scope === s ? T.accent : T.border}`, background: f.scope === s ? "#E6F3F4" : "#fff", color: f.scope === s ? T.accentInk : T.ink, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{s === "General" ? "General store" : "Project kit"}</button>))}</div></Field>
    {f.scope === "Project" && <><Field label="Project *">{projects.length === 0 ? <div style={{ fontSize: 12.5, color: T.amber, background: "#FDF0DF", padding: "10px 12px", borderRadius: 10 }}>No projects yet — add under Manage.</div> : <Select value={f.project} onChange={(e) => onProject(e.target.value)}><option value="">Select project…</option>{projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</Select>}</Field>
      <Field label="Program director"><Select value={f.leader} onChange={(e) => set("leader", e.target.value)}><option value="">—</option>{pdNames.map((n) => <option key={n}>{n}</option>)}</Select></Field></>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Room"><Input value={f.room} onChange={(e) => set("room", e.target.value)} placeholder="e.g. 132" /></Field><Field label="Fridge / freezer"><Input value={f.fridge} onChange={(e) => set("fridge", e.target.value)} placeholder="e.g. #38, -20C" /></Field></div>
    <Field label="Box / label"><Input value={f.box} onChange={(e) => set("box", e.target.value)} placeholder="e.g. Box 1" style={{ fontFamily: "ui-monospace, Menlo, monospace" }} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <Field label="Quantity"><Input value={f.qty} onChange={(e) => set("qty", e.target.value)} placeholder="4" /></Field>
      <Field label="Unit"><UnitInput value={f.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
      <Field label="Par level"><Input value={f.minQty || ""} onChange={(e) => set("minQty", e.target.value)} placeholder="2" inputMode="decimal" /></Field>
    </div>
    {isAb && <Field label="Aliquots on hand"><Input value={f.aliquots || ""} onChange={(e) => set("aliquots", e.target.value)} placeholder="0" inputMode="decimal" /></Field>}
    {isAb && <div style={{ fontSize: 11.5, color: T.muted, marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>Vials and aliquots are counted separately. An item with no vials left but aliquots in the box does not show as out of stock.</div>}
    <div style={{ fontSize: 11.5, color: T.muted, marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>Par level is the reorder threshold. At or below it the item shows as low stock and joins the monthly restocking list.</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Catalog #"><Input value={f.catalog} onChange={(e) => set("catalog", e.target.value)} style={{ fontFamily: "ui-monospace, Menlo, monospace" }} /></Field><Field label="Vendor"><Input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></Field></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Lot #"><Input value={f.lot || ""} onChange={(e) => set("lot", e.target.value)} style={{ fontFamily: "ui-monospace, Menlo, monospace" }} /></Field><Field label="Kept by"><Input value={f.owner || ""} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. Pilar" /></Field></div>
    {isAb && (<div style={{ background: "#F8FAFB", border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800, marginBottom: 12 }}><Beaker size={15} color={T.accent} />ANTIBODY DETAIL</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Assay group"><Select value={f.assayGroup || ""} onChange={(e) => set("assayGroup", e.target.value)}>{ASSAY_GROUPS.map((g) => <option key={g || "none"} value={g}>{g || "—"}</option>)}</Select></Field>
        <Field label="Host species"><Input value={f.host || ""} onChange={(e) => set("host", e.target.value)} placeholder="Rabbit" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Mono / poly"><Select value={f.clonality || ""} onChange={(e) => set("clonality", e.target.value)}>{CLONALITY.map((c) => <option key={c || "none"} value={c}>{c === "M" ? "Monoclonal" : c === "P" ? "Polyclonal" : "—"}</option>)}</Select></Field>
        <Field label="Clone #"><Input value={f.clone || ""} onChange={(e) => set("clone", e.target.value)} placeholder="EP155Y" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Isotype"><Input value={f.isotype || ""} onChange={(e) => set("isotype", e.target.value)} placeholder="IgG" /></Field>
        <Field label="Reactivity"><Input value={f.reactivity || ""} onChange={(e) => set("reactivity", e.target.value)} placeholder="Human, Mouse" /></Field>
      </div>
      <Field label="Validated for"><Input value={f.applications || ""} onChange={(e) => set("applications", e.target.value)} placeholder="WB, IHC-P, ICC/IF" /></Field>
    </div>)}
    <Field label="Notes"><Input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    <Btn onClick={() => ok && onSave(f)} style={{ opacity: ok ? 1 : .5 }}>{item ? "Save changes" : "Add to inventory"}</Btn>
    {onRequest && <div style={{ marginTop: 10 }}><Btn kind="ghost" onClick={onRequest}><ShoppingCart size={16} />Request more of this</Btn></div>}
    {item && <div style={{ marginTop: 10 }}><Btn kind="danger" onClick={() => { if (window.confirm(`Delete "${f.name}" from inventory?\n\nThis removes the item itself. It does NOT touch anyone's usage records.`)) onDelete(item.id); }}><Trash2 size={16} />Delete item</Btn></div>}
  </Sheet>);
}

/* ---------- REPORTS ---------- */
function ProjectEdit({ p, pdNames, onSave, onClose }) {
  const [name, setName] = useState(p.name); const [leader, setLeader] = useState(p.leader || "");
  return (<Sheet title="Edit project" onClose={onClose}>
    <Field label="Project name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    <Field label="Program director"><Select value={leader} onChange={(e) => setLeader(e.target.value)}><option value="">—</option>{pdNames.map((n) => <option key={n}>{n}</option>)}</Select></Field>
    <Btn onClick={() => name.trim() && onSave({ id: p.id, name: name.trim(), leader })} style={{ opacity: name.trim() ? 1 : .5 }}>Save changes</Btn>
  </Sheet>);
}
function RepTab({ usage, memberNames }) {
  const [anchor, setAnchor] = useState(new Date()); const [who, setWho] = useState("All");
  const ws = weekStart(anchor), we = addDays(ws, 6);
  const inWeek = usage.filter((u) => { const d = new Date(u.date); return d >= ws && d <= addDays(we, 1); });
  const rows = who === "All" ? inWeek : inWeek.filter((u) => u.member === who);
  const byMember = memberNames.map((m) => [m, inWeek.filter((u) => u.member === m).length]).filter(([, n]) => n);
  const toRows = (list) => list.map((u) => ({ Date: fmtDate(u.date), Member: u.member, Item: u.itemName, Category: u.category, Qty: u.qty, Unit: u.unit, Project: u.project, Experiment: u.experiment, Room: u.room, Fridge: u.fridge, Box: u.box, Notes: u.notes }));
  const exportFlat = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(rows)), "Usage"); XLSX.writeFile(wb, `MenonLab_Usage_${isoDate(ws)}.xlsx`); };
  const exportByMember = () => {
    const wb = XLSX.utils.book_new();
    const summary = memberNames.map((m) => ({ Member: m, Entries: inWeek.filter((u) => u.member === m).length })).filter((r) => r.Entries);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary.length ? summary : [{ Member: "—", Entries: 0 }]), "Summary");
    memberNames.forEach((m) => { const list = inWeek.filter((u) => u.member === m); if (list.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(list)), m.replace(/[\\/?*[\]:]/g, "").slice(0, 28)); });
    XLSX.writeFile(wb, `MenonLab_Weekly_byMember_${isoDate(ws)}.xlsx`);
  };
  return (
    <div style={{ padding: 18 }}>
      <SectionTitle icon={BarChart3}>Weekly usage</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", marginBottom: 12 }}>
        <button onClick={() => setAnchor(addDays(ws, -7))} style={navBtn}><ChevronLeft size={20} /></button>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDay(ws)} – {fmtDay(we)}</div><button onClick={() => setAnchor(new Date())} style={{ background: "none", border: "none", color: T.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginTop: 1 }}>This week</button></div>
        <button onClick={() => setAnchor(addDays(ws, 7))} style={navBtn}><ChevronRight size={20} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}><Btn kind="ghost" onClick={exportFlat} style={{ opacity: rows.length ? 1 : .5 }}><Download size={16} />This week</Btn><Btn onClick={exportByMember} style={{ opacity: inWeek.length ? 1 : .5 }}><Download size={16} />By member</Btn></div>
      {inWeek.length === 0 ? <EmptyNote>No usage logged this week. Entries appear here as the lab logs them.</EmptyNote> : (<>
        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>{["All", ...byMember.map(([m]) => m)].map((m) => (<button key={m} onClick={() => setWho(m)} style={{ flexShrink: 0, border: `1px solid ${who === m ? T.accent : T.border}`, background: who === m ? T.accent : "#fff", color: who === m ? "#fff" : T.ink, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{m === "All" ? "All" : shortName(m)}</button>))}</div>
        {who === "All" && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>{byMember.map(([m, n]) => (<div key={m} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px" }}><div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{n}</div><div style={{ fontSize: 11.5, color: T.muted }}>{shortName(m)}</div></div>))}</div>}
        {rows.map((u) => (<div key={u.id} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.itemName}</div><div style={{ fontSize: 11.5, color: T.muted, whiteSpace: "nowrap" }}>{fmtDate(u.date)}</div></div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}><b style={{ color: T.ink }}>{shortName(u.member)}</b>{" · "}{[u.qty && `${u.qty} ${u.unit}`, u.experiment, u.project].filter(Boolean).join(" · ")}</div></div>))}
      </>)}
    </div>
  );
}

/* ---------- MANAGE ---------- */
function SetTab({ members, cats, projects, pdNames, inv, usage, mediaPar, canEdit, caps, token, onAddMember, onDelMember, onToggleAdmin, onSetRole, onSetOwner, onSetPhone, chairLimit, onSetChairLimit, onAddProject, onUpdateProject, onDelProject, onAddCat, onDelCat, onReload, flash }) {
  const [nm, setNm] = useState(""); const [nmEmail, setNmEmail] = useState(""); const [nmRole, setNmRole] = useState("member");
  const resetPin = async (name) => {
    if (!window.confirm(`Clear ${shortName(name)}'s PIN? They will choose a new one next time they sign in, and any device they are signed in on is signed out.`)) return;
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", "x-session": token }, body: JSON.stringify({ action: "resetPin", target: name, token }) });
      const d = await r.json();
      flash(d.ok ? "PIN cleared" : (d.error || "Couldn't reset that PIN"));
      onReload();
    } catch { flash("Can't reach the server"); }
  };
  const [pn, setPn] = useState(""); const [pl, setPl] = useState(pdNames[0] || ""); const [nc, setNc] = useState(""); const [editP, setEditP] = useState(null);
  if (!canEdit && !caps.access) return (<div style={{ padding: 18 }}>
    <SectionTitle icon={Settings}>Manage</SectionTitle>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: T.muted, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16, lineHeight: 1.45 }}><Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />You can view the inventory, log usage, request orders and book instruments. Editing inventory and changing roles is limited.</div>
    <Card title={`Lab roster · ${members.length}`}>{members.map((m) => <div key={m.name} style={{ ...rowFlat, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{m.name}</span>{(m.pd || m.role === "chair" || m.role === "admin") && <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{m.role === "chair" ? "CHAIR" : m.pd ? "PD" : "FULL"}</span>}</div>)}</Card>
  </div>);
  return (
    <div style={{ padding: 18 }}>
      <SectionTitle icon={Settings}>Manage</SectionTitle>
      {caps.access ? <Card title={`Access control · ${members.length} people`}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: T.accentInk, background: "#E6F3F4", borderRadius: 10, padding: "10px 12px", marginBottom: 14, lineHeight: 1.45 }}>
          <Shield size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>You decide who is in the app and what each person can do. Everyone signed in can already view inventory, request an order and book instruments — the settings below only add to that.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>{members.map((m) => (
          <div key={m.name} style={{ border: `1px solid ${m.owner ? T.accent : T.line}`, background: "#fff", borderRadius: 11, padding: "11px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                {m.email && <div style={{ fontSize: 11, color: T.muted }}>{m.email}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: m.hasPin ? "#127449" : T.amber, background: m.hasPin ? "#EAF6EE" : "#FDF0DF", borderRadius: 999, padding: "3px 7px" }}>{m.hasPin ? "PIN SET" : "NO PIN"}</span>
                {m.hasPin && <button onClick={() => resetPin(m.name)} style={{ background: "none", border: "none", color: T.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>Reset</button>}
                {!m.pd && <button onClick={() => { if (window.confirm(`Remove ${shortName(m.name)} from the lab roster?`)) onDelMember(m.name); }} style={iconBtn}><Trash2 size={15} color={T.muted} /></button>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 7, marginTop: 9 }}>
              {m.pd || m.role === "chair"
                ? <div style={{ fontSize: 11.5, color: T.muted, display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}`, background: "#E6F3F4", borderRadius: 999, padding: "2px 7px" }}>{m.role === "chair" ? "CHAIR" : "PD"}</span>Approves orders and assigns funding</div>
                : <Select value={m.role || "member"} onChange={(e) => onSetRole(m.name, e.target.value)} style={{ height: 36, fontSize: 12.5 }}>
                    <option value="member">Lab member — log, view, request, book</option>
                    <option value="purchasing">Purchasing — also places orders and records receipt</option>
                    <option value="admin">Full access — also edits inventory and instruments</option>
                    <option value="guest">Booking only — outside collaborator</option>
                  </Select>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer", color: m.owner ? T.accentInk : T.ink }}>
                <input type="checkbox" checked={!!m.owner} onChange={(e) => onSetOwner(m.name, e.target.checked)} style={{ width: 16, height: 16 }} />
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Shield size={13} color={m.owner ? T.accent : T.muted} />Can grant access to others</span>
              </label>
              <PhoneRow m={m} onSave={onSetPhone} />
            </div>
          </div>))}</div>

        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: T.muted, marginBottom: 8 }}>CHAIR APPROVAL LIMIT</div>
        <ChairLimitRow value={chairLimit} onSave={onSetChairLimit} />

        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: T.muted, marginBottom: 8 }}>ADD SOMEONE</div>
        <Field label="Name"><Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Last, First" /></Field>
        <Field label="Email"><Input value={nmEmail} onChange={(e) => setNmEmail(e.target.value)} placeholder="netid@utmb.edu" /></Field>
        <Field label="Access"><Select value={nmRole} onChange={(e) => setNmRole(e.target.value)}>
          <option value="member">Lab member — log, view, request, book</option>
          <option value="purchasing">Purchasing — also places orders and records receipt</option>
          <option value="admin">Full access — also edits inventory and instruments</option>
          <option value="guest">Booking only — outside collaborator</option>
        </Select></Field>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>They choose their own PIN the first time they sign in. You never see it — only clear it.</div>
        <Btn onClick={() => { if (nm.trim()) { onAddMember({ name: nm.trim(), email: nmEmail.trim(), role: nmRole }); setNm(""); setNmEmail(""); setNmRole("member"); } }} style={{ opacity: nm.trim() ? 1 : .5 }}>Add member</Btn>
      </Card>
      : <Card title={`Lab roster · ${members.length}`}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.45 }}>Roles and sign-in are managed by {members.filter((m) => m.owner).map((m) => shortName(m.name)).join(" or ") || "the lab"}.</div>
          {members.map((m) => (
            <div key={m.name} style={{ ...rowFlat, marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{m.role === "chair" ? "CHAIR" : m.pd ? "PD" : m.role === "admin" ? "FULL" : m.role === "purchasing" ? "PURCHASING" : m.role === "guest" ? "BOOK" : ""}</span>
            </div>))}
        </Card>}

      <Card title={`Projects & leaders · ${projects.length}`}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>Project kits are stored with — and accountable to — their program director.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>{projects.map((p) => (<div key={p.id} style={rowFlat}><span style={{ minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>{p.leader && <span style={{ fontSize: 12, color: T.muted }}> · {shortName(p.leader)}</span>}</span><span style={{ display: "flex", gap: 4, flexShrink: 0 }}><button onClick={() => setEditP(p)} title="Edit" style={iconBtn}><Pencil size={15} color={T.muted} /></button><button onClick={() => { if (window.confirm(`Delete project "${p.name}"?`)) onDelProject(p.id); }} style={iconBtn}><Trash2 size={15} color={T.muted} /></button></span></div>))}</div>
        <Field label="Project name"><Input value={pn} onChange={(e) => setPn(e.target.value)} placeholder="e.g. tIL-10 exosome" /></Field>
        <Field label="Program director"><Select value={pl} onChange={(e) => setPl(e.target.value)}>{pdNames.map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Btn onClick={() => { if (pn.trim()) { onAddProject({ name: pn.trim(), leader: pl }); setPn(""); } }} style={{ opacity: pn.trim() ? 1 : .5 }}>Add project</Btn>
        {editP && <ProjectEdit p={editP} pdNames={pdNames} onSave={(x) => { onUpdateProject(x); setEditP(null); }} onClose={() => setEditP(null)} />}
      </Card>
      <Card title={`Categories · ${cats.length}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{cats.map((c) => (<span key={c} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${T.border}`, borderRadius: 999, padding: "5px 6px 5px 11px", fontSize: 12.5, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: catColor(c, cats) }} />{c}<button onClick={() => onDelCat(c)} style={{ ...iconBtn, padding: 2 }}><X size={13} color={T.muted} /></button></span>))}</div>
        <div style={{ display: "flex", gap: 8 }}><Input value={nc} onChange={(e) => setNc(e.target.value)} placeholder="Add category (e.g. Flow antibody)" /><button onClick={() => { if (nc.trim()) { onAddCat(nc.trim()); setNc(""); } }} style={addBtn}><Plus size={18} /></button></div>
      </Card>
      <Card title={`Media par levels · ${(mediaPar || []).length}`}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>The standing media order, by cell type. These feed the media page of the monthly restocking report. Per-item reorder thresholds are set on each item under Inventory.</div>
        {(mediaPar || []).length === 0 ? <EmptyNote>No par levels loaded.</EmptyNote> : [...new Set(mediaPar.map((p) => p.cellType))].map((ct) => (
          <div key={ct} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: T.accent, marginBottom: 6 }}>{(ct || "OTHER").toUpperCase()}</div>
            {mediaPar.filter((p) => p.cellType === ct).map((p) => (
              <div key={p.id} style={{ ...rowFlat, marginBottom: 6 }}>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div><div style={{ fontSize: 11, color: T.muted }}>{[p.vendor, p.catalog].filter(Boolean).join(" · ")}</div></div>
                <div style={{ fontSize: 12, color: T.muted, textAlign: "right", flexShrink: 0 }}>{p.targetQty}{p.perStock ? <div style={{ fontSize: 10.5 }}>{p.perStock}</div> : null}</div>
              </div>))}
          </div>))}
      </Card>
      <Card title="Overview">
        <div style={{ display: "flex", gap: 10 }}>{[["Items", inv.length], ["Low stock", inv.filter(lowStock).length], ["Members", members.length], ["Log entries", usage.length]].map(([l, n]) => (<div key={l} style={{ flex: 1, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 6px", textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: l === "Low stock" && n > 0 ? T.amber : T.accent }}>{n}</div><div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{l}</div></div>))}</div>
      </Card>
    </div>
  );
}

/* ---------- ME ---------- */
/* ---------- sign in ---------- */
/* Before v7 you picked a name off a list and became that person. Now every
   account has its own PIN, set by its owner, and the server decides what you
   may do from the session rather than from anything the browser claims. */
function LoginGate({ onSignedIn }) {
  const [roster, setRoster] = useState(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [shared, setShared] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth?names=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRoster(d.members || []))
      .catch(() => setRoster([]));
  }, []);

  const call = async (payload) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      setBusy(false);
      if (!d.ok) { setErr(d.error || "That didn't work."); return null; }
      return d;
    } catch { setBusy(false); setErr("Can't reach the server."); return null; }
  };

  const doLogin = async () => {
    const d = await call({ action: "login", name: picked.name, pin, shared });
    if (d && d.token) onSignedIn(d.token);
  };
  const doSetup = async () => {
    if (pin !== pin2) { setErr("The two PINs don't match."); return; }
    const d = await call({ action: "setPin", name: picked.name, pin, shared });
    if (d && d.token) onSignedIn(d.token);
  };

  const wrap = (children) => (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: T.bg, minHeight: "100vh", color: T.ink }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 18px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 26 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: T.accent, display: "grid", placeItems: "center", color: "#fff" }}><FlaskConical size={22} /></div>
          <div><div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1 }}>Menon Lab</div><div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Inventory &amp; ordering</div></div>
        </div>
        {children}
      </div>
    </div>
  );

  if (roster === null) return wrap(<div style={{ color: T.muted, fontSize: 14 }}>Loading…</div>);

  if (!picked) {
    const list = roster.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
    return wrap(<>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Sign in</div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>Find your name, then enter your PIN. Everything you log, book or approve is recorded under your account.</div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 14 }} />
        <Input autoFocus placeholder="Your name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
      </div>
      {list.slice(0, 40).map((m) => (
        <button key={m.name} onClick={() => { setPicked(m); setPin(""); setPin2(""); setErr(""); }}
          style={{ ...rowFlat, width: "100%", cursor: "pointer", marginBottom: 7, textAlign: "left" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{m.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {!m.hasPin && <span style={{ fontSize: 10, fontWeight: 700, color: T.amber, background: "#FDF0DF", borderRadius: 999, padding: "3px 7px" }}>SET PIN</span>}
            <ChevronRight size={17} color={T.muted} />
          </span>
        </button>
      ))}
      {list.length === 0 && <EmptyNote>No name matches &quot;{q}&quot;. Ask an admin to add you to the roster.</EmptyNote>}
    </>);
  }

  const setup = !picked.hasPin;
  const canGo = setup ? (pin.length >= 4 && pin2.length >= 4) : pin.length >= 4;
  return wrap(<>
    <button onClick={() => { setPicked(null); setErr(""); }} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 }}><ChevronLeft size={16} />Not you?</button>
    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 3 }}>{picked.name}</div>
    <div style={{ fontSize: 13, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>
      {setup ? "First time in. Choose a PIN of 4 to 6 digits — you'll use it every time, and nobody else can sign in as you without it." : "Enter your PIN."}
    </div>
    <Field label={setup ? "Choose a PIN" : "PIN"}>
      <Input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter" && !setup && canGo) doLogin(); }}
        style={{ letterSpacing: "0.5em", fontSize: 20, textAlign: "center" }} />
    </Field>
    {setup && <Field label="Type it again">
      <Input type="password" inputMode="numeric" maxLength={6} value={pin2}
        onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter" && canGo) doSetup(); }}
        style={{ letterSpacing: "0.5em", fontSize: 20, textAlign: "center" }} />
    </Field>}
    <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, marginBottom: 16, cursor: "pointer", color: T.ink }}>
      <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ width: 17, height: 17, marginTop: 1, flexShrink: 0 }} />
      <span>This is a shared lab computer<span style={{ display: "block", fontSize: 11.5, color: T.muted, marginTop: 2 }}>Signs you out after 15 minutes idle, so the next person isn&apos;t you.</span></span>
    </label>
    {err && <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5, color: T.danger, background: "#FDECEC", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}
    <Btn onClick={setup ? doSetup : doLogin} style={{ opacity: canGo && !busy ? 1 : .5 }}><Lock size={16} />{busy ? "…" : setup ? "Set PIN and sign in" : "Sign in"}</Btn>
    {!setup && <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>Forgotten it? The chair or any full-access member can reset your PIN from Manage.</div>}
  </>);
}

/* A standing reminder of what is waiting on you, for people who don't get
   UTMB email alerts. */
function PendingBanner({ orders, me, caps, accessQueue, view, onOrders, onAccess }) {
  const n = pendingFor(orders, me, caps);
  const a = accessQueue.length;
  if (view === "ord" && a === 0) return null;
  if (n === 0 && a === 0) return null;
  const parts = [];
  if (n > 0) parts.push({ n, label: n === 1 ? "order needs you" : "orders need you", go: onOrders });
  if (a > 0) parts.push({ n: a, label: a === 1 ? "access request" : "access requests", go: onAccess });
  return (
    <div style={{ margin: "14px 18px 0", display: "flex", flexDirection: "column", gap: 7 }}>
      {parts.map((p) => (
        <button key={p.label} onClick={p.go} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "#FDF0DF", border: "1px solid #F0D9B5", borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
          <span style={{ width: 26, height: 26, borderRadius: 999, background: T.amber, color: "#fff", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>{p.n}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#7A4A06", flex: 1 }}>{p.label}</span>
          <ChevronRight size={17} color={T.amber} />
        </button>
      ))}
    </div>
  );
}

/* The line above which Dr. Menon has to sign off. Below it, a PD's approval is
   final and the order goes straight to Megan. */
function ChairLimitRow({ value, onSave }) {
  const [v, setV] = useState(String(value ?? 1000));
  useEffect(() => { setV(String(value ?? 1000)); }, [value]);
  const dirty = String(v).trim() !== String(value);
  const valid = v.trim() !== "" && !isNaN(+v) && +v >= 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, lineHeight: 1.45 }}>
        Orders at or above this go to Dr. Menon after the PD. Below it, the PD&apos;s approval is final and it goes straight to Megan. Set 0 to send everything to him.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.muted }}>$</span>
        <Input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" style={{ height: 40 }} />
        {dirty && valid && <button onClick={() => onSave(+v)}
          style={{ flexShrink: 0, background: T.accent, color: "#fff", border: "none", borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>}
      </div>
      {dirty && !valid && <div style={{ fontSize: 11.5, color: T.danger, marginTop: 5 }}>That needs to be a dollar amount.</div>}
    </div>
  );
}

/* The WhatsApp number an approval is sent to — and the number a reply is
   matched against when it comes back. */
function PhoneRow({ m, onSave }) {
  const [v, setV] = useState(m.whatsapp || "");
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setV(m.whatsapp || ""); }, [m.whatsapp, editing]);
  const approver = m.pd || m.role === "chair";
  const dirty = (v || "") !== (m.whatsapp || "");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Input value={v} onChange={(e) => { setV(e.target.value); setEditing(true); }}
          onBlur={() => { if (!dirty) setEditing(false); }}
          placeholder="WhatsApp number, e.g. +1 409 555 0134"
          inputMode="tel"
          style={{ height: 36, fontSize: 12.5 }} />
        {dirty && <button onClick={() => { onSave(m.name, v.trim()); setEditing(false); }}
          style={{ flexShrink: 0, background: T.accent, color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Save</button>}
      </div>
      {approver && !m.whatsapp && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 4, display: "flex", alignItems: "flex-start", gap: 5, lineHeight: 1.4 }}>
        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />No number — approvals for {shortName(m.name)} stay in the app only.
      </div>}
    </div>
  );
}

/* ---------- your account ---------- */
function MeTab({ me, meRec, caps, token, onSignOut, flash }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifState, setNotifState] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const roleLabel = meRec.role === "chair" ? "Chair" : meRec.pd ? "Program director" : meRec.role === "admin" ? "Full access" : meRec.role === "purchasing" ? "Purchasing" : meRec.role === "guest" ? "Booking only" : "Lab member";
  const allowed = [
    caps.approve && "Approve orders and assign funding",
    caps.place && "Place orders and record receipt",
    caps.grants && "Set grants and budgets",
    caps.edit && "Edit inventory and instruments",
    caps.access && "Decide who is on the roster and what each person can do",
    caps.guest ? "Book instruments" : "Log usage, request orders, view inventory, book instruments",
  ].filter(Boolean);

  const change = async () => {
    setErr("");
    if (newPin !== newPin2) { setErr("The two new PINs don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json", "x-session": token }, body: JSON.stringify({ action: "changePin", oldPin, newPin, token }) });
      const d = await r.json();
      setBusy(false);
      if (!d.ok) { setErr(d.error || "That didn't work."); return; }
      setOldPin(""); setNewPin(""); setNewPin2(""); flash("PIN changed");
    } catch { setBusy(false); setErr("Can't reach the server."); }
  };

  const askNotif = async () => {
    try { const p = await Notification.requestPermission(); setNotifState(p); } catch {}
  };

  return (<div style={{ padding: 18 }}>
    <SectionTitle icon={User}>Your account</SectionTitle>
    <Card title="SIGNED IN AS">
      <div style={{ fontSize: 16, fontWeight: 700 }}>{me}</div>
      <div style={{ fontSize: 12.5, color: T.accent, fontWeight: 600, marginTop: 3 }}>{roleLabel}</div>
      {meRec.email && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{meRec.email}</div>}
      {meRec.whatsapp
        ? <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}><Send size={12} />WhatsApp {meRec.whatsapp}</div>
        : (caps.approve ? <div style={{ fontSize: 12, color: T.amber, marginTop: 5, lineHeight: 1.45 }}>No WhatsApp number on file — approvals reach you in the app only. An access owner can add it under Manage.</div> : null)}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, marginBottom: 7 }}>YOU CAN</div>
        {allowed.map((a) => <div key={a} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5, color: T.ink, marginBottom: 5 }}><Check size={14} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} />{a}</div>)}
      </div>
    </Card>

    <Card title="ALERTS ON THIS DEVICE">
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: notifState === "granted" ? 0 : 12 }}>
        {notifState === "granted"
          ? "Browser alerts are on. You'll be notified when an order needs you or yours moves along, even with the app in another tab."
          : notifState === "denied"
            ? "Browser alerts are blocked for this site. Turn them back on in your browser's site settings if you want them."
            : "Turn on browser alerts so approvals reach you without relying on UTMB email."}
      </div>
      {notifState === "default" && <Btn kind="ghost" onClick={askNotif}><Bell size={16} />Turn on browser alerts</Btn>}
    </Card>

    <Card title="CHANGE YOUR PIN">
      <Field label="Current PIN"><Input type="password" inputMode="numeric" maxLength={6} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="New PIN (4-6 digits)"><Input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="New PIN again"><Input type="password" inputMode="numeric" maxLength={6} value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))} /></Field>
      {err && <div style={{ fontSize: 12.5, color: T.danger, marginBottom: 12 }}>{err}</div>}
      <Btn onClick={change} style={{ opacity: oldPin.length >= 4 && newPin.length >= 4 && !busy ? 1 : .5 }}><Lock size={16} />Change PIN</Btn>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>Changing your PIN signs you out everywhere else.</div>
    </Card>

    <Btn kind="danger" onClick={onSignOut}><X size={16} />Log out</Btn>
  </div>);
}

const SectionTitle = ({ icon: Icon, children, noMargin }) => (<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: noMargin ? 0 : 14 }}><Icon size={20} color={T.accent} /><h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.01em", margin: 0 }}>{children}</h1></div>);
const Card = ({ title, children }) => (<div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}><div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", marginBottom: 12 }}>{title}</div>{children}</div>);
const EmptyNote = ({ children }) => <div style={{ fontSize: 13, color: T.muted, background: "#fff", border: `1px dashed ${T.border}`, borderRadius: 12, padding: 16, lineHeight: 1.5, marginTop: 10 }}>{children}</div>;
const rowBtn = { width: "100%", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 13px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" };
const rowFlat = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 13px" };
const navBtn = { background: "none", border: "none", cursor: "pointer", color: T.ink, padding: 6, display: "grid", placeItems: "center" };
const iconBtn = { background: "none", border: "none", cursor: "pointer", padding: 4 };
const addBtn = { flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: T.accent, color: "#fff", border: "none", cursor: "pointer", display: "grid", placeItems: "center" };
function locLine(i) { return [i.room && `Rm ${i.room}`, i.fridge, i.box].filter(Boolean).join(" · ") || "No location set"; }
function defaultUnit(c) { c = (c || "").toLowerCase(); if (c.includes("antibod")) return "aliquots"; if (c.includes("elisa") || c.includes("kit")) return "kit"; if (c.includes("dna") || c.includes("rna") || c.includes("primer")) return "µL"; if (c.includes("media") || c.includes("culture")) return "bottle"; return ""; }
function incomplete(i) { return !((i.vendor || "").trim()) || !((i.catalog || "").trim()); }
function shortName(n) { return n.includes(",") ? n.split(",")[0].trim() : n.split(" ")[0]; }

/* ---------- ORDERS / PURCHASING ---------- */
const ORDER_STATUS = {
  requested: ["Awaiting PD", "#6D3BB5"], routed: ["Awaiting PD", "#6D3BB5"],
  pd_ok: ["Awaiting Dr. Menon", "#B45309"],
  approved: ["Ready for Megan", "#1D4ED8"], ordered: ["Ordered", "#0E7C86"],
  received: ["Received", "#127449"], rejected: ["Sent back", "#B42318"],
};
const EVENT_LABEL = { requested: "Requested", edited: "Edited", reassigned: "Passed to another PD", pd_approved: "PD approved", chair_approved: "Chair approved", approved: "Approved", placed: "Placed on UTMB site", received: "Received", sent_back: "Sent back", deleted: "Cancelled" };
const money = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Requester -> PI -> purchasing. An order waiting on approval belongs to the
// PI it was addressed to, not to whoever happens to be an admin.
const awaitingMe = (o, me, caps) => {
  if (o.status === "requested" || o.status === "routed") return caps.approve && (o.approver === me || !o.approver);
  if (o.status === "pd_ok") return caps.chairBackup;
  if (o.status === "approved" || o.status === "ordered") return caps.place;
  return false;
};
function pendingFor(orders, me, caps) {
  if (!me) return 0;
  return orders.filter((o) => awaitingMe(o, me, caps)).length;
}
const committedFor = (orders, gid) => orders.filter((o) => o.grantId === gid && (o.status === "ordered" || o.status === "received")).reduce((s, o) => s + (Number(o.total) || 0), 0);

function OrdersTab({ me, caps, token, orders, orderEvents, chairLimit, grants, projects, inv, members, approverNames, mediaPar, orderSeed, clearSeed, onCreate, onUpdate, onAction, onDelete, onUpsertGrant, onDelGrant }) {
  const [nw, setNw] = useState(false);
  useEffect(() => { if (orderSeed) setNw(true); }, [orderSeed]);
  const [editO, setEditO] = useState(null);
  const [view, setView] = useState("act");
  const [receiving, setReceiving] = useState(null);
  const [approving, setApproving] = useState(null);
  const [chairing, setChairing] = useState(null);
  const [reassigning, setReassigning] = useState(null);
  const [showGrants, setShowGrants] = useState(false);

  const mine = orders.filter((o) => o.requester === me);
  const toAct = orders.filter((o) => awaitingMe(o, me, caps));
  const anyRole = caps.approve || caps.place || caps.grants || caps.chairBackup;
  const inChain = orders.filter((o) => ["requested", "routed", "pd_ok", "approved", "ordered"].includes(o.status));
  const shown = view === "mine" ? mine : view === "all" ? orders : view === "queue" ? inChain : toAct;

  const exportToOrder = () => {
    const rows = orders.filter((o) => o.status === "approved").map((o) => ({ Item: o.itemName, "Cat#": o.catalog, Vendor: o.vendor, Qty: o.qty, "Unit $": o.unitPrice, "Total $": o.total, Project: o.project, Grant: o.grantName, Requester: o.requester, "Approved by": o.piApprover, Reason: o.experiment }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Item: "— nothing ready to order —" }]), "To order"); XLSX.writeFile(wb, `MenonLab_ToOrder_${isoDate(new Date())}.xlsx`);
  };
  // The full monthly pack (supply list, restocking, spend, fund availability)
  // is generated server-side so it can also be bookmarked or scheduled.
  const monthlyPack = () => { window.location.href = "/api/monthly?token=" + encodeURIComponent(token || ""); };
  const weeklyPack = () => { window.location.href = "/api/weekly?token=" + encodeURIComponent(token || ""); };
  const exportMonthly = () => {
    const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = orders.filter((o) => new Date(o.createdAt) >= m0).map((o) => ({ Date: fmtDate(o.createdAt), Item: o.itemName, Qty: o.qty, "Total $": o.total, Project: o.project, Grant: o.grantName, Requester: o.requester, Status: (ORDER_STATUS[o.status] || [o.status])[0], Reason: o.experiment }));
    const spendByGrant = grants.map((g) => ({ Grant: g.name, Budget: g.budget, Committed: committedFor(orders, g.id), Remaining: g.budget - committedFor(orders, g.id) }));
    const spendByPerson = [...new Set(orders.map((o) => o.requester))].map((p) => ({ Member: p, "Spend $": orders.filter((o) => o.requester === p && (o.status === "ordered" || o.status === "received")).reduce((s, o) => s + (Number(o.total) || 0), 0) })).filter((r) => r["Spend $"]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Date: "—" }]), "Orders");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spendByGrant.length ? spendByGrant : [{ Grant: "—" }]), "By grant");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spendByPerson.length ? spendByPerson : [{ Member: "—" }]), "By person");
    XLSX.writeFile(wb, `MenonLab_Monthly_${isoDate(new Date())}.xlsx`);
  };

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionTitle icon={ShoppingCart} noMargin>Orders</SectionTitle>
        {me && <button onClick={() => setNw(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: T.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={16} />Request</button>}
      </div>

      {!me && <EmptyNote>Pick your name (top right) to request an order.</EmptyNote>}

      {caps.grants && grants.length > 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
          {grants.map((g) => { const rem = g.budget - committedFor(orders, g.id); return (
            <div key={g.id} style={{ flexShrink: 0, minWidth: 130, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: g.budget && rem <= 0 ? T.danger : T.accent, marginTop: 2 }}>{g.budget ? money(rem) : "—"}</div>
              <div style={{ fontSize: 10.5, color: T.muted }}>{g.budget ? `of ${money(g.budget)} left` : "set budget"}</div>
            </div>); })}
        </div>
      )}
      {caps.grants && <button onClick={() => setShowGrants((s) => !s)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}><DollarSign size={14} />{showGrants ? "Hide grant setup" : "Manage grants & budgets"}</button>}
      {showGrants && caps.grants && <GrantsPanel grants={grants} onUpsert={onUpsertGrant} onDel={onDelGrant} />}
      {caps.grants && <SpendPanel orders={orders} grants={grants} />}
      {caps.reports && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
            <Btn onClick={weeklyPack}><FileSpreadsheet size={16} />Weekly pack</Btn>
            <Btn onClick={monthlyPack}><FileSpreadsheet size={16} />Monthly pack</Btn>
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>Every order with its full chain — who requested, which PD approved, whether Dr. Menon signed off, the grant and FRS at each step, who placed it, and the PO. Plus what is stuck and with whom, spend by person, spend by approver, and the complete audit trail. The monthly pack adds inventory, restocking and instrument usage.</div>
        </div>
      )}

      {anyRole && <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
        {[["act", "Needs you", toAct.length], ["mine", "Mine", mine.length], ["queue", "In the chain", inChain.length], ["all", "All", orders.length]].map(([k, label, n]) => (
          <button key={k} onClick={() => setView(k)} style={{ flex: 1, border: `1px solid ${view === k ? T.accent : T.border}`, background: view === k ? T.accent : "#fff", color: view === k ? "#fff" : T.ink, borderRadius: 10, padding: "8px 6px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}{n > 0 ? ` · ${n}` : ""}</button>
        ))}
      </div>}
      {!anyRole && me && <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 8 }}>YOUR REQUESTS</div>}

      {(caps.place || caps.grants) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {caps.place && <Btn kind="ghost" onClick={exportToOrder}><Download size={16} />To order</Btn>}
          {caps.grants && <Btn kind="ghost" onClick={exportMonthly}><Download size={16} />Monthly</Btn>}
        </div>
      )}

      {shown.length === 0 ? <EmptyNote>{view === "act" ? "Nothing needs your action right now." : view === "mine" ? "You haven't requested anything yet." : "No orders yet."}</EmptyNote>
        : shown.map((o) => <OrderCard key={o.id} o={o} me={me} caps={caps} grants={grants} orders={orders} inv={inv} events={orderEvents.filter((e) => e.orderId === o.id)} chairLimit={chairLimit} onAction={onAction} onDelete={onDelete} onReceive={() => setReceiving(o)} onApprove={() => setApproving(o)} onChair={() => setChairing(o)} onReassign={() => setReassigning(o)} onEdit={() => setEditO(o)} />)}

      {nw && <OrderForm key={orderSeed ? orderSeed.id : "blank"} me={me} projects={projects} approvers={approverNames} inv={inv} seed={orderSeed} onSave={(o) => { onCreate(o); setNw(false); clearSeed && clearSeed(); }} onClose={() => { setNw(false); clearSeed && clearSeed(); }} />}
      {editO && <OrderForm me={me} projects={projects} approvers={approverNames} inv={inv} existing={editO} onSave={(o) => { onUpdate({ ...o, id: editO.id }); setEditO(null); }} onClose={() => setEditO(null)} />}
      {approving && <ApproveSheet o={approving} grants={grants} orders={orders} chairLimit={chairLimit} onConfirm={(x) => { onAction(approving.id, "approve", x); setApproving(null); }} onClose={() => setApproving(null)} />}
      {chairing && <ChairSheet o={chairing} grants={grants} orders={orders} caps={caps} onConfirm={(x) => { onAction(chairing.id, "chairApprove", x); setChairing(null); }} onClose={() => setChairing(null)} />}
      {reassigning && <ReassignSheet o={reassigning} approvers={approverNames} onConfirm={(approver) => { onAction(reassigning.id, "reassign", { approver }); setReassigning(null); }} onClose={() => setReassigning(null)} />}
      {receiving && <ReceiveSheet o={receiving} onConfirm={(addItem) => { onAction(receiving.id, "receive", { addItem }); setReceiving(null); }} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function OrderCard({ o, me, caps, grants, orders, inv, events, chairLimit, onAction, onDelete, onReceive, onApprove, onChair, onReassign, onEdit }) {
  const [trail, setTrail] = useState(false);
  const [st, color] = ORDER_STATUS[o.status] || [o.status, T.muted];
  const dup = inv.find((i) => i.name.toLowerCase().trim() === (o.itemName || "").toLowerCase().trim());
  const grant = grants.find((g) => g.id === o.grantId);
  const remaining = grant ? grant.budget - committedFor(orders, grant.id) : null;
  const atPd = o.status === "requested" || o.status === "routed";
  const atChair = o.status === "pd_ok";
  const minePd = atPd && caps.approve && (o.approver === me || !o.approver);
  const mineChair = atChair && caps.chairBackup;
  const willNeedChair = (Number(o.total) || 0) >= chairLimit;
  const reject = () => { const r = window.prompt("Reason for sending back?") || ""; onAction(o.id, "reject", { reason: r }); };
  const place = () => { const po = window.prompt("PO / order reference from the UTMB site (optional):") || ""; onAction(o.id, "place", { po }); };
  const mine = minePd || mineChair;
  const stripe = mineChair ? "#B45309" : minePd ? "#6D3BB5" : null;

  // The chain, as a strip, so the current stage is obvious at a glance.
  const stages = [
    { key: "req", label: "Requested", who: o.requester, done: true },
    { key: "pd", label: "PD", who: o.pdApprover, done: !!o.pdApprover, active: atPd },
    ...(o.needsChair || willNeedChair ? [{ key: "chair", label: "Dr. Menon", who: o.needsChair ? o.piApprover : "", done: !!(o.needsChair && o.piApprover), active: atChair }] : []),
    { key: "po", label: "Megan", who: o.purchaser, done: !!o.purchaser, active: o.status === "approved" },
    { key: "got", label: "Received", who: "", done: o.status === "received", active: o.status === "ordered" },
  ];

  return (
    <div style={{ background: "#fff", border: `1px solid ${stripe ? stripe + "55" : T.line}`, borderLeft: stripe ? `3px solid ${stripe}` : `1px solid ${T.line}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.itemName}</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{[o.qty && `×${o.qty}`, o.vendor, o.catalog].filter(Boolean).join(" · ")}</div></div>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color, background: color + "18", borderRadius: 999, padding: "3px 8px", height: "fit-content" }}>{st}</span>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 6, display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
        <span style={{ fontWeight: 700, color: T.ink }}>{money(o.total)}</span>
        {o.grantName && <span>· {o.grantName}</span>}{o.project && <span>· {o.project}</span>}<span>· {shortName(o.requester || "")}</span>
      </div>

      {o.status !== "rejected" && <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.line}` }}>
        {stages.map((sg, i) => (
          <span key={sg.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <ChevronRight size={12} color={T.border} />}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 8px",
              background: sg.done ? "#EAF6EE" : sg.active ? (color + "18") : T.bg,
              color: sg.done ? "#127449" : sg.active ? color : T.muted }}>
              {sg.done && <Check size={10} />}{sg.label}{sg.who ? ` · ${shortName(sg.who)}` : ""}
            </span>
          </span>
        ))}
      </div>}

      {o.experiment && <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}><b style={{ color: T.ink, fontWeight: 600 }}>Reason:</b> {o.experiment}</div>}
      {o.frs && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}><b style={{ color: T.ink, fontWeight: 600 }}>FRS:</b> <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{o.frs}</span>{o.pdApprover ? ` · proposed by ${shortName(o.pdApprover)}` : ""}{o.piApprover && o.needsChair ? ` · confirmed by ${shortName(o.piApprover)}` : ""}{o.approvedVia === "whatsapp" ? " · via WhatsApp" : ""}</div>}
      {o.pdFrs && o.frs && o.pdFrs !== o.frs && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 3 }}>Chair changed the account from FRS {o.pdFrs}{o.pdGrantName ? ` (${o.pdGrantName})` : ""}</div>}
      {o.po && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}><b style={{ color: T.ink, fontWeight: 600 }}>PO:</b> {o.po}{o.purchaser ? ` · ${shortName(o.purchaser)}` : ""}</div>}
      {o.explored && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}><b style={{ color: T.ink, fontWeight: 600 }}>Explored:</b> {o.explored}</div>}
      {o.checklist && Object.keys(o.checklist).length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#127449", background: "#EAF6EE", borderRadius: 8, padding: "5px 9px", marginTop: 8, width: "fit-content" }}>
          <ListChecks size={13} />Pre-order checklist completed ({Object.values(o.checklist).filter(Boolean).length}/7)
        </div>
      )}
      {atPd && willNeedChair && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 7 }}>Over the {money(chairLimit)} limit — will need Dr. Menon after you.</div>}
      {dup && atPd && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.amber, background: "#FDF0DF", borderRadius: 8, padding: "6px 9px", marginTop: 8 }}><AlertTriangle size={14} />Already in lab: {dup.qty || "in stock"} at {locLine(dup)}. Cross-check first.</div>}
      {grant && grant.budget > 0 && <div style={{ fontSize: 11.5, color: remaining < o.total ? T.danger : T.muted, marginTop: 8 }}>{grant.name}: {money(remaining)} available{remaining < o.total ? " — exceeds remaining budget" : ""}</div>}
      {o.rejectReason && o.status === "rejected" && <div style={{ fontSize: 12, color: T.danger, marginTop: 6 }}>Sent back: {o.rejectReason}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {minePd && <>
          <ActBtn onClick={onApprove} icon={CheckCircle2}>Approve + assign funding</ActBtn>
          <ActBtn kind="ghost" onClick={reject} icon={X}>Send back</ActBtn>
          <ActBtn kind="ghost" onClick={onReassign} icon={Send}>Pass to another PD</ActBtn></>}
        {mineChair && <>
          <ActBtn onClick={onChair} icon={CheckCircle2}>Final approval</ActBtn>
          <ActBtn kind="ghost" onClick={reject} icon={X}>Send back</ActBtn></>}
        {o.status === "approved" && caps.place && <ActBtn onClick={place} icon={ShoppingCart}>Mark placed on UTMB</ActBtn>}
        {o.status === "ordered" && caps.place && <ActBtn onClick={onReceive} icon={PackageCheck}>Mark received</ActBtn>}
        {o.requester === me && atPd && <ActBtn kind="ghost" onClick={onEdit} icon={Pencil}>Edit</ActBtn>}
        {((o.requester === me && (atPd || o.status === "rejected")) || (caps.place && o.status !== "received")) && <ActBtn kind="ghost" onClick={() => { if (window.confirm("Cancel and delete this order request?")) onDelete(o.id); }} icon={Trash2}>{o.requester === me ? "Delete" : "Cancel"}</ActBtn>}
        {(events || []).length > 0 && <ActBtn kind="ghost" onClick={() => setTrail((v) => !v)} icon={ClipboardCheck}>{trail ? "Hide history" : `History (${events.length})`}</ActBtn>}
      </div>

      {trail && (events || []).length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${T.line}` }}>
          {[...events].sort((a, b) => new Date(a.at) - new Date(b.at)).map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 9, fontSize: 12, padding: "5px 0" }}>
              <span style={{ width: 92, flexShrink: 0, color: T.muted, fontSize: 11 }}>{fmtTime(e.at)}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ fontWeight: 600 }}>{EVENT_LABEL[e.event] || e.event}</b>
                <span style={{ color: T.muted }}> — {shortName(e.actor || "")}{e.via === "whatsapp" ? " (WhatsApp)" : ""}</span>
                {e.detail && <span style={{ display: "block", color: T.muted, fontSize: 11.5, marginTop: 1, lineHeight: 1.4 }}>{e.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const ActBtn = ({ kind = "primary", icon: Icon, children, ...p }) => (<button {...p} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: kind === "ghost" ? `1px solid ${T.border}` : "1px solid transparent", background: kind === "ghost" ? "#fff" : T.accent, color: kind === "ghost" ? T.ink : "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Icon size={15} />{children}</button>);

const CHECKLIST = [
  ["searched", "I searched this app's inventory for this item and similar names"],
  ["located", "I physically checked the likely fridge / freezer / shelf"],
  ["asked", "I asked lab members or the project lead if they have it"],
  ["alternative", "I considered an equivalent already in the lab (other clone, vendor, or kit)"],
  ["approach", "I considered whether an alternate approach avoids this purchase"],
  ["quantity", "I confirmed the size / quantity is what's actually needed"],
  ["price", "I compared vendor pricing or have a quote"],
];

function OrderForm({ me, projects, approvers, inv, existing, seed, onSave, onClose }) {
  const isEdit = !!existing;
  const [f, setF] = useState(existing
    ? { id: existing.id, itemName: existing.itemName || "", catalog: existing.catalog || "", vendor: existing.vendor || "", qty: (existing.qty ?? "") + "", unitPrice: (existing.unitPrice ?? "") + "", project: existing.project || "", approver: existing.approver || "", experiment: existing.experiment || "", notes: existing.notes || "", dupAck: true, explored: existing.explored || "" }
    : { id: uid(), itemName: seed ? seed.name : "", catalog: seed ? seed.catalog || "" : "", vendor: seed ? seed.vendor || "" : "", qty: "1", unitPrice: "", project: seed && seed.scope === "Project" ? seed.project : "", approver: approvers[0] || "", experiment: "", notes: "", dupAck: !!seed, explored: seed ? `Raised from the inventory record: ${seed.qty !== "" && seed.qty != null ? seed.qty + " " + (seed.unit || "") : "no quantity recorded"} at ${locLine(seed)}.` : "", fromItemId: seed ? seed.id : "" });
  const [ck, setCk] = useState({});
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k) => setCk((s) => ({ ...s, [k]: !s[k] }));
  const dup = !isEdit && f.itemName.trim().length > 2 && inv.find((i) => i.name.toLowerCase().includes(f.itemName.toLowerCase().trim()));
  const total = (parseFloat(f.qty) || 0) * (parseFloat(f.unitPrice) || 0);
  const ckDone = isEdit || CHECKLIST.every((c) => ck[c[0]]);
  const ckCount = CHECKLIST.filter((c) => ck[c[0]]).length;
  const ok = f.itemName.trim() && f.experiment.trim() && f.approver && ckDone && (!dup || f.dupAck);
  const submit = () => { if (!ok) return; onSave({ ...f, total, unitPrice: parseFloat(f.unitPrice) || 0, ...(isEdit ? {} : { checklist: ck }) }); };
  return (
    <Sheet title={isEdit ? "Edit request" : "Request an order"} onClose={onClose}>
      {seed && <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5, color: T.accentInk, background: "#E6F3F4", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
        <Boxes size={16} style={{ flexShrink: 0, marginTop: 1 }} /><div>Requested from inventory: <b>{seed.name}</b> — {seed.qty !== "" && seed.qty != null ? `${seed.qty} ${seed.unit || ""} on hand` : "no quantity recorded"} at {locLine(seed)}. Received stock tops this record back up.</div></div>}
      <Field label="Item / reagent *"><Input value={f.itemName} onChange={(e) => set("itemName", e.target.value)} placeholder="e.g. Anti-BCRP (BXP-21)" /></Field>
      {dup && <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: T.amber, background: "#FDF0DF", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><div>Possibly already in the lab: <b>{dup.name}</b> ({dup.qty || "in stock"}, {locLine(dup)}). <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer" }}><input type="checkbox" checked={f.dupAck} onChange={(e) => set("dupAck", e.target.checked)} />I checked — still need to order.</label></div></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Catalog #"><Input value={f.catalog} onChange={(e) => set("catalog", e.target.value)} style={{ fontFamily: "ui-monospace, Menlo, monospace" }} /></Field><Field label="Vendor"><Input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} /></Field></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Quantity"><Input inputMode="decimal" value={f.qty} onChange={(e) => set("qty", e.target.value)} /></Field><Field label="Unit price ($)"><Input inputMode="decimal" value={f.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} placeholder="0.00" /></Field></div>
      <div style={{ fontSize: 13, color: T.muted, marginTop: -4, marginBottom: 14 }}>Estimated total: <b style={{ color: T.ink }}>{money(total)}</b></div>
      <Field label="Project"><Select value={f.project} onChange={(e) => set("project", e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id}>{p.name}</option>)}</Select></Field>

      <Field label="Send to which PD for approval? *">
        <Select value={f.approver} onChange={(e) => set("approver", e.target.value)}>
          <option value="">—</option>{approvers.map((n) => <option key={n}>{n}</option>)}
        </Select>
      </Field>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: T.muted, background: "#F6F8F9", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginTop: -6, marginBottom: 14, lineHeight: 1.45 }}>
        <DollarSign size={15} style={{ flexShrink: 0, marginTop: 1 }} /><div>The PD chooses the grant and FRS when they approve, and Dr. Menon confirms it on larger orders. You don&apos;t pick the funding account.</div>
      </div>

      <Field label="Reason — experiment / justification *"><Input value={f.experiment} onChange={(e) => set("experiment", e.target.value)} placeholder="What is it for? e.g. P-gp WB, Aim 2" /></Field>

      {!isEdit && <div style={{ background: ckDone ? "#EAF6EE" : "#F6F8F9", border: `1px solid ${ckDone ? "#BFE3CC" : T.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}><ListChecks size={16} color={ckDone ? "#127449" : T.accent} /><span style={{ fontSize: 13.5, fontWeight: 800 }}>Before you order</span></div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: ckDone ? "#127449" : T.muted }}>{ckCount}/{CHECKLIST.length}</span>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>Confirm you explored the options. All must be ticked to submit.</div>
        {CHECKLIST.map((c) => (
          <label key={c[0]} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0", cursor: "pointer", borderTop: `1px solid ${ckDone ? "#D6EBDD" : T.line}` }}>
            <input type="checkbox" checked={!!ck[c[0]]} onChange={() => toggle(c[0])} style={{ width: 17, height: 17, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.35 }}>{c[1]}</span>
          </label>
        ))}
      </div>}
      <Field label="What did you find? (options you explored)"><Input value={f.explored} onChange={(e) => set("explored", e.target.value)} placeholder="e.g. only 1 vial left, expired 2024; no equivalent clone" /></Field>
      <Field label="Notes (optional)"><Input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="link, size, lot…" /></Field>
      <Btn onClick={submit} style={{ opacity: ok ? 1 : .5 }}><Send size={16} />{isEdit ? "Save changes" : "Send for approval"}</Btn>
      {!ckDone && <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 8 }}>Complete the checklist to submit.</div>}
      {ckDone && !f.approver && <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 8 }}>Choose which PI should approve.</div>}
    </Sheet>
  );
}

function NotifSheet({ notifs, onSeen, onSeenAll, onGo, onClose }) {
  const KC = { order: ["#B45309", ShoppingCart], approval: ["#6D3BB5", ClipboardCheck], status: ["#0E7C86", Bell] };
  return (
    <Sheet title="Alerts" onClose={onClose}>
      {notifs.length === 0 ? <EmptyNote>No alerts yet. You'll be notified here when an order needs you, or when yours moves along.</EmptyNote> : <>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={onSeenAll} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Mark all read</button>
        </div>
        {notifs.map((n) => {
          const [c, Icon] = KC[n.kind] || KC.status;
          return (
            <button key={n.id} onClick={() => n.orderId ? onGo(n) : onSeen(n.id)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, background: n.seen ? "#fff" : "#F2F9FA", border: `1px solid ${n.seen ? T.line : "#BFE0E3"}`, borderRadius: 12, padding: "11px 12px", marginBottom: 8, cursor: "pointer" }}>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: c + "18", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={15} color={c} /></span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{n.title}</span>
                  {!n.seen && <span style={{ width: 8, height: 8, borderRadius: 999, background: T.accent, flexShrink: 0, marginTop: 4 }} />}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.35 }}>{n.body}</span>
                <span style={{ display: "block", fontSize: 11, color: T.muted, marginTop: 3 }}>{fmtTime(n.date)}</span>
              </span>
            </button>
          );
        })}
      </>}
    </Sheet>
  );
}

/* The PI picks the grant and the FRS here. This is the single point where a
   funding account is attached to a purchase. */
function ApproveSheet({ o, grants, orders, chairLimit, onConfirm, onClose }) {
  const [grantId, setGrantId] = useState(o.grantId || (grants[0] ? grants[0].id : ""));
  const [frs, setFrs] = useState(o.frs || "");
  const grant = grants.find((g) => g.id === grantId);
  const remaining = grant ? grant.budget - committedFor(orders, grant.id) : null;
  const over = grant && grant.budget > 0 && remaining < o.total;
  const ok = frs.trim().length > 0;
  const go = () => {
    if (!ok) return;
    onConfirm({
      frs: frs.trim(),
      grantId: grant ? grant.id : "",
      grantName: grant ? grant.name : "",
      fundNote: grant && grant.budget > 0 ? `${grant.name}: ${money(remaining)} available at approval` : "",
    });
  };
  const toChair = (Number(o.total) || 0) >= chairLimit;
  return (<Sheet title="Approve and assign funding" onClose={onClose}>
    <div style={{ fontSize: 15, marginBottom: 3, fontWeight: 700 }}>{o.itemName}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 6 }}>{[o.qty && `×${o.qty}`, o.vendor, o.catalog].filter(Boolean).join(" · ")}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, marginBottom: 4 }}>{money(o.total)}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>Requested by {shortName(o.requester || "")}{o.project ? ` · ${o.project}` : ""}</div>
    {o.experiment && <div style={{ fontSize: 12.5, color: T.ink, background: "#F6F8F9", border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 16, lineHeight: 1.45 }}><b>Reason:</b> {o.experiment}</div>}

    <Field label="Charge to which grant?">
      <Select value={grantId} onChange={(e) => setGrantId(e.target.value)}>
        <option value="">— no grant —</option>
        {grants.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Select>
    </Field>
    {grant && grant.budget > 0 && (
      <div style={{ fontSize: 12.5, color: over ? T.danger : T.muted, background: over ? "#FDECEC" : "#F6F8F9", border: `1px solid ${over ? "#F3C9C9" : T.border}`, borderRadius: 10, padding: "10px 12px", marginTop: -6, marginBottom: 14 }}>
        {grant.name}: <b style={{ color: over ? T.danger : T.ink }}>{money(remaining)}</b> of {money(grant.budget)} remaining.
        {over ? " This purchase exceeds what's left." : ` After this, ${money(remaining - o.total)}.`}
      </div>
    )}
    {grants.length === 0 && <div style={{ fontSize: 12.5, color: T.amber, background: "#FDF0DF", borderRadius: 10, padding: "10px 12px", marginTop: -6, marginBottom: 14 }}>No grants set up yet. Add them under Orders → Manage grants &amp; budgets.</div>}

    <Field label="FRS / account number *">
      <Input value={frs} onChange={(e) => setFrs(e.target.value)} placeholder="e.g. 123456" style={{ fontFamily: "ui-monospace, Menlo, monospace" }} />
    </Field>
    <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>Recorded on the order along with the fund position at the moment you approve, so the charge can be traced later.</div>
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12.5, background: toChair ? "#FDF0DF" : "#E6F3F4", color: toChair ? "#7A4A06" : T.accentInk, borderRadius: 10, padding: "10px 12px", marginBottom: 14, lineHeight: 1.45 }}>
      {toChair ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <div>{toChair
        ? <>At {money(o.total)} this is over the {money(chairLimit)} limit, so it goes to <b>Dr. Menon</b> next. He can change the fund before it reaches Megan.</>
        : <>Under the {money(chairLimit)} limit — this goes straight to <b>Megan</b> to place on the UTMB site.</>}</div>
    </div>
    <Btn onClick={go} style={{ opacity: ok ? 1 : .5 }}><CheckCircle2 size={16} />{toChair ? "Approve and send to Dr. Menon" : "Approve and send to Megan"}</Btn>
    {!ok && <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 8 }}>An FRS account is required.</div>}
  </Sheet>);
}

/* Stage two. The PD's proposed fund is pre-filled; Dr. Menon can accept it or
   move the charge somewhere else before Megan places anything. */
function ChairSheet({ o, grants, orders, caps, onConfirm, onClose }) {
  const [grantId, setGrantId] = useState(o.grantId || "");
  const [frs, setFrs] = useState(o.frs || o.pdFrs || "");
  const grant = grants.find((g) => g.id === grantId);
  const remaining = grant ? grant.budget - committedFor(orders, grant.id) : null;
  const over = grant && grant.budget > 0 && remaining < o.total;
  const changed = (grantId || "") !== (o.pdGrantName ? (grants.find((g) => g.name === o.pdGrantName) || {}).id || "" : "") || frs.trim() !== (o.pdFrs || "");
  const onBehalf = !caps.chair;
  const ok = frs.trim().length > 0;
  return (<Sheet title="Final approval" onClose={onClose}>
    <div style={{ fontSize: 15, marginBottom: 3, fontWeight: 700 }}>{o.itemName}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 6 }}>{[o.qty && `×${o.qty}`, o.vendor, o.catalog].filter(Boolean).join(" · ")}</div>
    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{money(o.total)}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14 }}>Requested by {shortName(o.requester || "")}{o.project ? ` · ${o.project}` : ""}</div>

    <div style={{ background: "#F6F8F9", border: `1px solid ${T.border}`, borderRadius: 11, padding: "11px 13px", marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: T.muted, marginBottom: 6 }}>WHAT THE PD PROPOSED</div>
      <div style={{ fontSize: 13 }}>{shortName(o.pdApprover || "")} · {o.pdGrantName || "no grant"} · FRS <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{o.pdFrs || "none"}</span></div>
      {o.fundNote && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{o.fundNote}</div>}
    </div>
    {o.experiment && <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 16, lineHeight: 1.45 }}><b>Reason:</b> {o.experiment}</div>}

    <Field label="Charge to which grant?">
      <Select value={grantId} onChange={(e) => setGrantId(e.target.value)}>
        <option value="">— no grant —</option>
        {grants.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Select>
    </Field>
    {grant && grant.budget > 0 && (
      <div style={{ fontSize: 12.5, color: over ? T.danger : T.muted, background: over ? "#FDECEC" : "#F6F8F9", border: `1px solid ${over ? "#F3C9C9" : T.border}`, borderRadius: 10, padding: "10px 12px", marginTop: -6, marginBottom: 14 }}>
        {grant.name}: <b style={{ color: over ? T.danger : T.ink }}>{money(remaining)}</b> of {money(grant.budget)} remaining.
        {over ? " This purchase exceeds what's left." : ` After this, ${money(remaining - o.total)}.`}
      </div>
    )}
    <Field label="FRS / account number *">
      <Input value={frs} onChange={(e) => setFrs(e.target.value)} style={{ fontFamily: "ui-monospace, Menlo, monospace" }} />
    </Field>
    {changed && <div style={{ fontSize: 12, color: T.amber, background: "#FDF0DF", borderRadius: 10, padding: "9px 11px", marginBottom: 14, lineHeight: 1.4 }}>You're changing the account the PD proposed. Both versions stay on the record.</div>}
    {onBehalf && <div style={{ fontSize: 12, color: T.muted, background: "#F6F8F9", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 14, lineHeight: 1.4 }}>You're not the chair — this will be logged as given on his behalf, by you.</div>}
    <Btn onClick={() => ok && onConfirm({ frs: frs.trim(), grantId })} style={{ opacity: ok ? 1 : .5 }}><CheckCircle2 size={16} />Approve and send to Megan</Btn>
  </Sheet>);
}

function ReassignSheet({ o, approvers, onConfirm, onClose }) {
  const [who, setWho] = useState(approvers.find((n) => n !== o.approver) || "");
  return (<Sheet title="Pass to another PI" onClose={onClose}>
    <div style={{ fontSize: 14, marginBottom: 4, fontWeight: 600 }}>{o.itemName}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>{[o.qty && `×${o.qty}`, money(o.total), o.requester && "from " + shortName(o.requester)].filter(Boolean).join(" · ")}</div>
    <Field label="Send to">
      <Select value={who} onChange={(e) => setWho(e.target.value)}><option value="">—</option>{approvers.map((n) => <option key={n}>{n}</option>)}</Select>
    </Field>
    <Btn onClick={() => who && onConfirm(who)} style={{ opacity: who ? 1 : .5 }}><Send size={16} />Pass it on</Btn>
  </Sheet>);
}

function ReceiveSheet({ o, onConfirm, onClose }) {
  const [add, setAdd] = useState(true);
  return (<Sheet title="Mark received" onClose={onClose}>
    <div style={{ fontSize: 14, marginBottom: 4, fontWeight: 600 }}>{o.itemName}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>{[o.qty && `×${o.qty}`, o.vendor, o.grantName].filter(Boolean).join(" · ")}</div>
    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, marginBottom: 16, cursor: "pointer" }}><input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} style={{ width: 18, height: 18 }} />Add this to inventory now</label>
    <Btn onClick={() => onConfirm(add)}><PackageCheck size={16} />Confirm received</Btn>
  </Sheet>);
}

/* Who is ordering, who is spending, and against which grant — the accountability
   view Dr. Menon asked for, on screen rather than only in an export. */
function SpendPanel({ orders, grants }) {
  const [open, setOpen] = useState(false);
  const counted = orders.filter((o) => ["approved", "ordered", "received"].includes(o.status));
  const people = [...new Set(counted.map((o) => o.requester).filter(Boolean))]
    .map((p) => ({ person: p, n: counted.filter((o) => o.requester === p).length, total: counted.filter((o) => o.requester === p).reduce((s, o) => s + (Number(o.total) || 0), 0) }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = people.reduce((s, p) => s + p.total, 0);
  if (!counted.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800 }}><DollarSign size={15} color={T.accent} />Spend &amp; accountability</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>{money(grandTotal)}</span>
      </button>
      {open && (<div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, letterSpacing: ".04em", marginBottom: 8 }}>BY PERSON</div>
        {people.map((p) => (<div key={p.person} style={{ ...rowFlat, marginBottom: 7 }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{shortName(p.person)}</div><div style={{ fontSize: 11.5, color: T.muted }}>{p.n} order{p.n === 1 ? "" : "s"}</div></div>
          <div style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{money(p.total)}</div></div>))}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, letterSpacing: ".04em", margin: "16px 0 8px" }}>BY GRANT</div>
        {grants.map((g) => { const spent = counted.filter((o) => o.grantId === g.id).reduce((s, o) => s + (Number(o.total) || 0), 0); const rem = (g.budget || 0) - spent; return (
          <div key={g.id} style={{ ...rowFlat, marginBottom: 7 }}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div><div style={{ fontSize: 11.5, color: T.muted }}>{money(spent)} committed</div></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: g.budget && rem <= 0 ? T.danger : T.ink, flexShrink: 0 }}>{g.budget ? money(rem) : "—"}</div>
          </div>); })}
        {grants.length === 0 && <div style={{ fontSize: 12.5, color: T.muted }}>No grants set up yet.</div>}
      </div>)}
    </div>
  );
}

function GrantsPanel({ grants, onUpsert, onDel }) {
  const [nm, setNm] = useState(""); const [bud, setBud] = useState("");
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Grants &amp; budgets</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {grants.map((g) => (<div key={g.id} style={{ ...rowFlat, gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div></div>
          <Input value={g.budget || ""} onChange={(e) => onUpsert({ ...g, budget: parseFloat(e.target.value) || 0 })} placeholder="budget $" inputMode="decimal" style={{ width: 110, height: 38 }} />
          <button onClick={() => onDel(g.id)} style={iconBtn}><Trash2 size={15} color={T.muted} /></button>
        </div>))}
      </div>
      <Field label="Add grant / fund"><Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. R01HD114744" /></Field>
      <Field label="Budget ($, optional)"><Input value={bud} onChange={(e) => setBud(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
      <Btn onClick={() => { if (nm.trim()) { onUpsert({ id: uid(), name: nm.trim(), budget: parseFloat(bud) || 0, notes: "" }); setNm(""); setBud(""); } }} style={{ opacity: nm.trim() ? 1 : .5 }}>Add grant</Btn>
    </div>
  );
}

/* ---------- INSTRUMENT BOOKING ---------- */
const timeToMin = (t) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + m; };
const minLabel = (m) => { let h = Math.floor(m / 60), mm = m % 60; const ap = h < 12 ? "AM" : "PM"; h = h % 12 || 12; return `${h}:${String(mm).padStart(2, "0")} ${ap}`; };
const INSTR_COLORS = ["#0E7C86", "#6D3BB5", "#B45309", "#127449", "#1D4ED8", "#B42318", "#0891B2", "#7C3AED"];
const bookingConflicts = (bookings, instrumentId, day, sMin, eMin, ignoreId) =>
  bookings.filter((b) => b.instrumentId === instrumentId && b.day === day && b.id !== ignoreId && sMin < b.endMin && b.startMin < eMin);

const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
const monthLabel = (k) => new Date(k + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const bookingHours = (b) => Math.max(0, b.endMin - b.startMin) / 60;

function BookTab({ me, canEdit, instruments, bookings, memberNames, myAccess, accessQueue, onBook, onCancel, onUpsertInstrument, onDelInstrument, onRequestAccess, onDecideAccess }) {
  const [day, setDay] = useState(new Date());
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(false);
  const [manage, setManage] = useState(false);
  const [mode, setMode] = useState("schedule");
  const [asking, setAsking] = useState(null);
  const dayStr = isoDate(day);
  const colorOf = (id) => INSTR_COLORS[Math.max(0, instruments.findIndex((x) => x.id === id)) % INSTR_COLORS.length];
  const todays = bookings.filter((b) => b.day === dayStr && (filter === "all" || b.instrumentId === filter)).sort((a, b) => a.startMin - b.startMin);
  const groups = instruments.filter((i) => filter === "all" || i.id === filter).map((i) => [i, todays.filter((b) => b.instrumentId === i.id)]);
  const isToday = isoDate(new Date()) === dayStr;

  const accessOf = (insId) => (myAccess.find((a) => a.instrumentId === insId) || {}).status || "";
  const mayBook = (ins) => !ins.restricted || canEdit || ins.superUser === me || accessOf(ins.id) === "granted";
  const bookable = instruments.filter(mayBook);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle icon={Calendar} noMargin>Instruments</SectionTitle>
        {mode === "schedule" && <button onClick={() => setForm(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: T.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={16} />Book</button>}
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        {[["schedule", "Schedule"], ["usage", "Usage log"]].map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex: 1, border: `1px solid ${mode === k ? T.accent : T.border}`, background: mode === k ? T.accent : "#fff", color: mode === k ? "#fff" : T.ink, borderRadius: 10, padding: "8px 6px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {accessQueue.length > 0 && (
        <Card title={`ACCESS REQUESTS · ${accessQueue.length}`}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.45 }}>People asking to be signed off on kit you look after. Grant it once they&apos;ve been trained.</div>
          {accessQueue.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{shortName(a.member)} → {a.instrumentName}</div>
              {a.note && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{a.note}</div>}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Asked {fmtDate(a.requestedAt)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                <ActBtn onClick={() => onDecideAccess(a.id, "granted")} icon={Check}>Grant</ActBtn>
                <ActBtn kind="ghost" onClick={() => onDecideAccess(a.id, "revoked")} icon={X}>Decline</ActBtn>
              </div>
            </div>
          ))}
        </Card>
      )}

      {mode === "usage" ? (
        <InstrumentUsageLog instruments={instruments} bookings={bookings} />
      ) : (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 10px", marginBottom: 12 }}>
          <button onClick={() => setDay(addDays(day, -1))} style={navBtn}><ChevronLeft size={20} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
            {!isToday && <button onClick={() => setDay(new Date())} style={{ background: "none", border: "none", color: T.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginTop: 1 }}>Today</button>}
            {isToday && <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>Today</div>}
          </div>
          <button onClick={() => setDay(addDays(day, 1))} style={navBtn}><ChevronRight size={20} /></button>
        </div>

        <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
          {[["all", "All"], ...instruments.map((i) => [i.id, i.name])].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ flexShrink: 0, border: `1px solid ${filter === k ? T.accent : T.border}`, background: filter === k ? T.accent : "#fff", color: filter === k ? "#fff" : T.ink, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>

        {canEdit && <button onClick={() => setManage((s) => !s)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", margin: "4px 0 12px", display: "flex", alignItems: "center", gap: 5 }}><Settings size={14} />{manage ? "Hide instrument setup" : "Manage instruments"}</button>}
        {manage && canEdit && <InstrumentsPanel instruments={instruments} memberNames={memberNames} onUpsert={onUpsertInstrument} onDel={onDelInstrument} />}

        {groups.map(([ins, list]) => {
          const st = accessOf(ins.id);
          const locked = ins.restricted && !mayBook(ins);
          return (
            <div key={ins.id} style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: colorOf(ins.id) }} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>{ins.name}</span>
                {ins.restricted && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: locked ? T.amber : "#127449", background: locked ? "#FDF0DF" : "#EAF6EE", borderRadius: 999, padding: "2px 7px" }}><Lock size={10} />{locked ? "TRAINING NEEDED" : "SIGNED OFF"}</span>}
                <span style={{ fontSize: 11.5, color: T.muted }}>· {list.length ? `${list.length} booked` : "free"}</span>
              </div>
              {ins.superUser && <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 7, display: "flex", alignItems: "center", gap: 5 }}><Shield size={12} color={T.accent} />Super user: {shortName(ins.superUser)}</div>}
              {locked && (
                st === "requested"
                  ? <div style={{ fontSize: 12, color: T.muted, background: "#F6F8F9", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 8 }}>Access requested — waiting on {ins.superUser ? shortName(ins.superUser) : "the super user"}.</div>
                  : <button onClick={() => setAsking(ins)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.accent}`, color: T.accent, borderRadius: 9, padding: "7px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}><Lock size={13} />{st === "revoked" ? "Ask again" : "Request access"}</button>
              )}
              {list.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, padding: "2px 2px 4px" }}>No bookings — open all day.</div>}
              {list.map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${T.line}`, borderLeft: `3px solid ${colorOf(ins.id)}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
                  <div style={{ minWidth: 78, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{minLabel(b.startMin)}<div style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{minLabel(b.endMin)}</div></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{shortName(b.member)}</div>{b.purpose && <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.purpose}</div>}</div>
                  {(b.member === me || canEdit) && <button onClick={() => onCancel(b.id)} style={iconBtn}><X size={17} color={T.muted} /></button>}
                </div>
              ))}
            </div>
          );
        })}
        {instruments.length === 0 && <EmptyNote>No instruments yet.{canEdit ? " Add some above." : ""}</EmptyNote>}
      </>)}

      {form && <BookingForm me={me} instruments={bookable} bookings={bookings} day={dayStr} preselect={filter !== "all" && bookable.some((i) => i.id === filter) ? filter : ""} onSave={(b) => { onBook(b); setForm(false); }} onClose={() => setForm(false)} />}
      {asking && <AccessRequestSheet ins={asking} onConfirm={(note) => { onRequestAccess(asking.id, note); setAsking(null); }} onClose={() => setAsking(null)} />}
    </div>
  );
}

/* How much each machine was actually used, month by month — the record
   Dr. Menon asked for. */
function InstrumentUsageLog({ instruments, bookings }) {
  const [m, setM] = useState(monthKey(new Date()));
  const months = [...new Set(bookings.map((b) => monthKey(b.day + "T00:00:00")))].sort().reverse();
  const opts = months.includes(m) ? months : [m, ...months];
  const inMonth = bookings.filter((b) => monthKey(b.day + "T00:00:00") === m);

  const rows = instruments.map((ins) => {
    const list = inMonth.filter((b) => b.instrumentId === ins.id);
    const people = [...new Set(list.map((b) => b.member))];
    const hrs = list.reduce((t, b) => t + bookingHours(b), 0);
    const byPerson = people.map((p) => ({
      name: p,
      sessions: list.filter((b) => b.member === p).length,
      hours: list.filter((b) => b.member === p).reduce((t, b) => t + bookingHours(b), 0),
    })).sort((a, b) => b.hours - a.hours);
    return { ins, sessions: list.length, people: people.length, hours: hrs, byPerson };
  }).sort((a, b) => b.sessions - a.sessions);

  const totalSessions = rows.reduce((t, r) => t + r.sessions, 0);
  const totalHours = rows.reduce((t, r) => t + r.hours, 0);
  const allPeople = [...new Set(inMonth.map((b) => b.member))].length;

  return (<div>
    <Field label="Month">
      <Select value={m} onChange={(e) => setM(e.target.value)}>{opts.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}</Select>
    </Field>
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {[["Sessions", totalSessions], ["Hours", Math.round(totalHours * 10) / 10], ["People", allPeople]].map(([l, n]) => (
        <div key={l} style={{ flex: 1, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 6px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{n}</div>
          <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>{l}</div>
        </div>
      ))}
    </div>
    {rows.every((r) => r.sessions === 0) && <EmptyNote>Nothing was booked in {monthLabel(m)}.</EmptyNote>}
    {rows.filter((r) => r.sessions > 0).map((r) => (
      <div key={r.ins.id} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{r.ins.name}</div>
            {r.ins.superUser && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>Super user: {shortName(r.ins.superUser)}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.accent }}>{r.people} {r.people === 1 ? "person" : "people"}</div>
            <div style={{ fontSize: 11.5, color: T.muted }}>{r.sessions} sessions · {Math.round(r.hours * 10) / 10} h</div>
          </div>
        </div>
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${T.line}` }}>
          {r.byPerson.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
              <span style={{ color: T.ink }}>{shortName(p.name)}</span>
              <span style={{ color: T.muted, fontVariantNumeric: "tabular-nums" }}>{p.sessions} × · {Math.round(p.hours * 10) / 10} h</span>
            </div>
          ))}
        </div>
      </div>
    ))}
    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>The same figures appear in the monthly pack, on the Instrument usage tab.</div>
  </div>);
}

function AccessRequestSheet({ ins, onConfirm, onClose }) {
  const [note, setNote] = useState("");
  return (<Sheet title={`Request access — ${ins.name}`} onClose={onClose}>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
      {ins.superUser ? `${shortName(ins.superUser)} looks after this instrument and will be asked to sign you off.` : "A full-access member will be asked to sign you off."} Say what training you have had, or what you need it for.
    </div>
    <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. trained by Pilar in June, need it for EV runs" /></Field>
    <Btn onClick={() => onConfirm(note.trim())}><Send size={16} />Send request</Btn>
  </Sheet>);
}

function BookingForm({ me, instruments, bookings, day, preselect, onSave, onClose }) {
  const [insId, setInsId] = useState(preselect || (instruments[0] && instruments[0].id) || "");
  const [d, setD] = useState(day);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [purpose, setPurpose] = useState("");
  const sMin = timeToMin(start), eMin = timeToMin(end);
  const conflicts = insId ? bookingConflicts(bookings, insId, d, sMin, eMin) : [];
  const valid = insId && eMin > sMin && conflicts.length === 0;
  const submit = () => { if (!valid) return; const ins = instruments.find((x) => x.id === insId); onSave({ id: uid(), instrumentId: insId, instrumentName: ins ? ins.name : "", member: me, day: d, startMin: sMin, endMin: eMin, purpose: purpose.trim() }); };
  return (
    <Sheet title="Book an instrument" onClose={onClose}>
      <Field label="Instrument"><Select value={insId} onChange={(e) => setInsId(e.target.value)}>{instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
      <Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      {eMin <= sMin && <div style={{ fontSize: 12, color: T.amber, marginTop: -6, marginBottom: 12 }}>End time must be after start.</div>}
      {conflicts.length > 0 && <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: T.danger, background: "#FDECEC", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><div>Conflict: {shortName(conflicts[0].member)} has it {minLabel(conflicts[0].startMin)}–{minLabel(conflicts[0].endMin)}. Pick another time.</div></div>}
      <Field label="Purpose (optional)"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. EV pelleting, Aim 2" /></Field>
      <Btn onClick={submit} style={{ opacity: valid ? 1 : .5 }}><Calendar size={16} />Reserve</Btn>
    </Sheet>
  );
}

function InstrumentsPanel({ instruments, memberNames, onUpsert, onDel }) {
  const [nm, setNm] = useState("");
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Instruments</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 12, lineHeight: 1.45 }}>The super user oversees training and proper use. Mark an instrument as needing sign-off and only people they approve can book it.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
        {instruments.map((i) => (
          <div key={i.id} style={{ border: `1px solid ${T.line}`, borderRadius: 11, padding: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Input value={i.name} onChange={(e) => onUpsert({ ...i, name: e.target.value })} style={{ height: 38, border: "none", padding: 0, fontWeight: 700 }} />
              <button onClick={() => onDel(i.id)} style={iconBtn}><Trash2 size={15} color={T.muted} /></button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5 }}>SUPER USER</div>
            <Select value={i.superUser || ""} onChange={(e) => onUpsert({ ...i, superUser: e.target.value })} style={{ height: 38, marginBottom: 9 }}>
              <option value="">— nobody assigned —</option>
              {memberNames.map((n) => <option key={n}>{n}</option>)}
            </Select>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={!!i.restricted} onChange={(e) => onUpsert({ ...i, restricted: e.target.checked })} style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0 }} />
              <span>Needs training sign-off before booking</span>
            </label>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Add instrument" />
        <button onClick={() => { if (nm.trim()) { onUpsert({ id: uid(), name: nm.trim(), superUser: "", restricted: false }); setNm(""); } }} style={addBtn}><Plus size={18} /></button>
      </div>
    </div>
  );
}
