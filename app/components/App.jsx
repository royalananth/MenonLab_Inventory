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
  const min = i.minQty === "" || i.minQty == null || isNaN(+i.minQty) ? null : +i.minQty;
  return min !== null ? qty <= min : qty <= 0;
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
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 1900); };
  const meRef = useRef("");

  const load = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/data?me=" + encodeURIComponent(meRef.current || ""), { cache: "no-store" });
      const d = await r.json();
      setMembers(d.members || []); setCats(d.categories || []); setProjects(d.projects || []);
      setInv(d.items || []); setUsage(d.usage || []); setGrants(d.grants || []); setOrders(d.orders || []);
      setInstruments(d.instruments || []); setBookings(d.bookings || []); setNotifs(d.notifications || []); setMediaPar(d.mediaPar || []);
    } catch { /* keep last good state */ }
    setSyncing(false); setReady(true);
  }, []);

  useEffect(() => {
    try { const m = localStorage.getItem("mlab_me"); if (m) { setMe(m); meRef.current = m; } } catch {}
    load();
    const iv = setInterval(load, 25000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const pickMe = (n) => { setMe(n); meRef.current = n; try { localStorage.setItem("mlab_me", n); } catch {} load(); };
  const post = async (body) => { try { const r = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw 0; } catch {} load(); };

  // granular handlers (optimistic + persist)
  const upsertItem = (item) => { setInv((s) => s.some((i) => i.id === item.id) ? s.map((i) => i.id === item.id ? item : i) : [...s, item]); post({ type: "item", action: "upsert", payload: item }); flash("Saved"); };
  const deleteItem = (id) => { setInv((s) => s.filter((i) => i.id !== id)); post({ type: "item", action: "delete", payload: { id } }); flash("Deleted"); };
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
  const createOrder = (o) => { setOrders((s) => [{ ...o, status: "requested", requester: me, createdAt: new Date().toISOString() }, ...s]); post({ type: "order", action: "create", payload: { ...o, requester: me } }); flash("Request sent"); };
  const updateOrder = (o) => { setOrders((s) => s.map((x) => x.id === o.id ? { ...x, ...o } : x)); post({ type: "order", action: "update", payload: o }); flash("Request updated"); };
  const STMAP = { route: "routed", approve: "approved", place: "ordered", receive: "received", reject: "rejected" };
  const orderAction = (id, action, extra = {}) => {
    setOrders((s) => s.map((o) => o.id === id ? { ...o, status: STMAP[action] || o.status, ...(action === "route" ? { authorizer: me, approver: extra.approver } : action === "approve" ? { piApprover: me, frs: extra.frs || o.frs } : action === "place" ? { purchaser: me, po: extra.po } : action === "reject" ? { rejectReason: extra.reason } : {}) } : o));
    post({ type: "order", action, payload: { id, by: me, ...extra } });
    if (action === "receive" && extra.addItem) flash("Received → inventory"); else flash("Updated");
  };
  const delOrder = (id) => { setOrders((s) => s.filter((o) => o.id !== id)); post({ type: "order", action: "delete", payload: { id } }); };
  const addBooking = (b) => { setBookings((s) => [...s, b]); post({ type: "booking", action: "add", payload: b }); flash("Booked"); };
  const delBooking = (id) => { setBookings((s) => s.filter((b) => b.id !== id)); post({ type: "booking", action: "delete", payload: { id } }); flash("Cancelled"); };
  const upsertInstrument = (ins) => { setInstruments((s) => s.some((x) => x.id === ins.id) ? s.map((x) => x.id === ins.id ? ins : x) : [...s, ins]); post({ type: "instrument", action: "upsert", payload: ins }); flash("Saved"); };
  const delInstrument = (id) => { setInstruments((s) => s.filter((x) => x.id !== id)); post({ type: "instrument", action: "delete", payload: { id } }); };
  const markSeen = (id) => { setNotifs((s) => s.map((n) => n.id === id ? { ...n, seen: true } : n)); post({ type: "notification", action: "seen", payload: { id } }); };
  const markAllSeen = () => { setNotifs((s) => s.map((n) => ({ ...n, seen: true }))); post({ type: "notification", action: "seenAll", payload: { me } }); };

  const setMemberRole = (name, role) => { setMembers((s) => s.map((m) => m.name === name ? { ...m, role } : m)); post({ type: "member", action: "setRole", payload: { name, role } }); };

  const memberNames = members.map((m) => m.name);
  const pdNames = members.filter((m) => m.pd).map((m) => m.name);
  const approverNames = members.filter((m) => m.role === "chair" || m.pd).map((m) => m.name);
  const meRec = members.find((m) => m.name === me) || {};
  const role = meRec.role, isPD = meRec.pd, isChair = role === "chair", isFull = role === "admin";
  // "guest" = collaborators outside the lab (Yoshi, Zheping, the group downstairs)
  // who Rheanna asked to be able to reserve instruments and nothing else.
  const isGuest = role === "guest";
  const canEdit = (isFull || isChair) && !isGuest;
  const caps = { intake: isFull && !isGuest, approve: (isChair || isPD) && !isGuest, place: isFull && !isGuest, grants: (isChair || isPD) && !isGuest };
  const unseen = notifs.filter((n) => !n.seen).length;

  if (!ready) return <div style={{ minHeight: "100vh", background: T.bg, display: "grid", placeItems: "center", color: T.muted, fontFamily: "system-ui" }}>Loading inventory…</div>;
  const view = isGuest && !["book", "me"].includes(tab) ? "book" : tab;

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
              {me && <button onClick={() => setShowNotif(true)} title="Alerts" style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: unseen > 0 ? T.accent : T.muted, padding: 4 }}>
                <Bell size={18} />
                {unseen > 0 && <span style={{ position: "absolute", top: -1, right: -3, background: T.danger, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 999, minWidth: 15, height: 15, display: "grid", placeItems: "center", padding: "0 3px" }}>{unseen}</span>}
              </button>}
              <button onClick={() => setTab("me")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 11px", cursor: "pointer", maxWidth: 130 }}>
                {canEdit ? <Shield size={14} color={T.accent} /> : <User size={14} color={T.muted} />}
                <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me ? shortName(me) : "Sign in"}</span>
              </button>
            </div>
          </div>
        </header>

        {!me && <div style={{ margin: 18, padding: 16, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Who are you?</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Pick your name so usage logs to you. Program directors and full-access staff can edit inventory.</div>
          <Btn onClick={() => setTab("me")}>Choose your name</Btn>
        </div>}

        {view === "log" && <LogTab {...{ me, inv, usage, cats, onLog: logUsage, onUpdateUsage: updateUsage, onDeleteUsage: deleteUsage }} />}
        {view === "inv" && <InvTab {...{ me, inv, cats, projects, pdNames, canEdit, isGuest, onUpsert: upsertItem, onDelete: deleteItem, onRequest: (seed) => { setOrderSeed(seed); setTab("ord"); } }} />}
        {view === "ord" && <OrdersTab {...{ me, caps, orders, grants, projects, inv, members, approverNames, mediaPar, orderSeed, clearSeed: () => setOrderSeed(null), onCreate: createOrder, onUpdate: updateOrder, onAction: orderAction, onDelete: delOrder, onUpsertGrant: upsertGrant, onDelGrant: delGrant }} />}
        {view === "book" && <BookTab {...{ me, canEdit, instruments, bookings, onBook: addBooking, onCancel: delBooking, onUpsertInstrument: upsertInstrument, onDelInstrument: delInstrument }} />}
        {view === "rep" && <RepTab {...{ usage, memberNames }} />}
        {view === "set" && <SetTab {...{ members, cats, projects, pdNames, inv, usage, mediaPar, canEdit, onAddMember: addMember, onDelMember: delMember, onToggleAdmin: toggleAdmin, onSetRole: setMemberRole, onAddProject: addProject, onUpdateProject: updateProject, onDelProject: delProject, onAddCat: addCat, onDelCat: delCat }} />}
        {view === "me" && <MeTab {...{ me, members, pickMe, setTab }} />}

        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "#fff", borderTop: `1px solid ${T.border}`, display: "grid", gridTemplateColumns: `repeat(${isGuest ? 2 : 6},1fr)`, height: 66, zIndex: 20 }}>
          {(isGuest
            ? [["book", "Book", Calendar], ["me", "You", User]]
            : [["log", "Log", ClipboardList], ["inv", "Inventory", Boxes], ["ord", "Orders", ShoppingCart], ["book", "Book", Calendar], ["rep", "Reports", BarChart3], ["set", "Manage", Settings]]
          ).map(([k, label, Icon]) => {
            const badge = k === "ord" ? pendingFor(orders, me, caps) : 0;
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
function InvTab({ me, inv, cats, projects, pdNames, canEdit, isGuest, onUpsert, onDelete, onRequest }) {
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("All"); const [edit, setEdit] = useState(null); const [view, setView] = useState(null);
  const filtered = inv.filter((i) => {
    if (q && !(i.name + " " + i.vendor + " " + i.catalog + " " + i.box + " " + (i.lot || "") + " " + (i.assayGroup || "") + " " + (i.applications || "") + " " + (i.clone || "")).toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "General store") return i.scope !== "Project";
    if (filter === "Project kits") return i.scope === "Project";
    if (filter === "Needs info") return incomplete(i);
    if (filter === "Low stock") return lowStock(i);
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
  const chips = ["All", ...(low.length ? ["Low stock"] : []), "General store", "Project kits", ...(missingCount ? ["Needs info"] : []), ...cats];
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
      {!canEdit && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: T.muted, margin: "4px 0 10px" }}><Lock size={13} />View only — tap an item for details. Editing is limited to program directors.</div>}
      {groups.map(([cat, arr]) => (
        <div key={cat} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: catColor(cat, cats) }} /><span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".03em" }}>{cat.toUpperCase()}</span><span style={{ fontSize: 11.5, color: T.muted }}>· {arr.length}</span></div>
          {arr.slice(0, cap).map((i) => (
            <button key={i.id} onClick={() => canEdit ? setEdit(i) : setView(i)} style={{ ...rowBtn, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, textAlign: "left" }}><div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}><MapPin size={12} />{locLine(i)}{i.scope === "Project" && <span style={{ color: "#127449", fontWeight: 600 }}>· {i.project}</span>}{incomplete(i) && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: T.amber, fontWeight: 600 }}><AlertTriangle size={11} />needs info</span>}</div></div>
              <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 8 }}>{i.qty !== "" && i.qty != null && <div style={{ fontSize: 13, fontWeight: 700, color: lowStock(i) ? T.amber : T.ink }}>{i.qty}{i.unit ? " " + i.unit : ""}</div>}{i.minQty ? <div style={{ fontSize: 10.5, color: T.muted, marginTop: 1 }}>par {i.minQty}</div> : null}{i.box && <div style={{ fontSize: 11, color: T.muted, fontFamily: "ui-monospace, Menlo, monospace", marginTop: 2 }}>{i.box}</div>}</div>
            </button>))}
          {arr.length > cap && <div style={{ fontSize: 12, color: T.muted, padding: "4px 2px 2px" }}>+{arr.length - cap} more — search or pick this category to see all.</div>}
        </div>))}
      {filtered.length === 0 && <EmptyNote>No items match.</EmptyNote>}
      {edit && <ItemForm item={edit.new ? null : edit} cats={cats} projects={projects} pdNames={pdNames} onRequest={!edit.new && me && !isGuest ? () => { onRequest(edit); setEdit(null); } : null} onSave={(it) => { onUpsert(it); setEdit(null); }} onDelete={(id) => { onDelete(id); setEdit(null); }} onClose={() => setEdit(null)} />}
      {view && <ItemForm item={view} cats={cats} projects={projects} pdNames={pdNames} readOnly onRequest={me && !isGuest ? () => { onRequest(view); setView(null); } : null} onClose={() => setView(null)} />}
    </div>
  );
}

function ItemForm({ item, cats, projects, pdNames, readOnly, onSave, onDelete, onRequest, onClose }) {
  const [f, setF] = useState(item || { id: uid(), name: "", category: cats[0], scope: "General", project: "", leader: "", room: "", fridge: "", box: "", catalog: "", vendor: "", qty: "", unit: "", notes: "", lot: "", assayGroup: "", host: "", clonality: "", clone: "", isotype: "", reactivity: "", applications: "", owner: "", received: "", minQty: "" });
  const isAb = ANTIBODY_CATS.includes(f.category);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const onProject = (name) => { const p = projects.find((x) => x.name === name); setF((s) => ({ ...s, project: name, leader: p && p.leader ? p.leader : s.leader })); };
  const ok = f.name.trim() && (f.scope !== "Project" || f.project);
  if (readOnly) return (<Sheet title={f.name} onClose={onClose}>
    {lowStock(f) && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.amber, background: "#FDF0DF", borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}><TrendingDown size={15} />At or below par level{f.minQty ? ` (par ${f.minQty})` : ""} — worth reordering.</div>}
    <Static label="Category" value={[f.category, f.assayGroup].filter(Boolean).join(" · ")} /><Static label="Belongs to" value={f.scope === "Project" ? `${f.project}${f.leader ? " · " + shortName(f.leader) : ""}` : "General inventory"} />
    <Static label="Location" value={locLine(f)} /><Static label="Quantity" value={f.qty !== "" ? `${f.qty} ${f.unit}` : ""} /><Static label="Par level" value={f.minQty} />
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
function SetTab({ members, cats, projects, pdNames, inv, usage, mediaPar, canEdit, onAddMember, onDelMember, onToggleAdmin, onSetRole, onAddProject, onUpdateProject, onDelProject, onAddCat, onDelCat }) {
  const [nm, setNm] = useState(""); const [nmEmail, setNmEmail] = useState(""); const [nmRole, setNmRole] = useState("member");
  const [pn, setPn] = useState(""); const [pl, setPl] = useState(pdNames[0] || ""); const [nc, setNc] = useState(""); const [editP, setEditP] = useState(null);
  if (!canEdit) return (<div style={{ padding: 18 }}>
    <SectionTitle icon={Settings}>Manage</SectionTitle>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.muted, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}><Lock size={16} />You have logging access. Inventory and roster edits are limited to program directors and full-access staff.</div>
    <Card title={`Lab roster · ${members.length}`}>{members.map((m) => <div key={m.name} style={rowFlat}><span style={{ fontSize: 14 }}>{m.name}</span>{m.role === "admin" && <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{m.pd ? "PD" : "FULL"}</span>}</div>)}</Card>
  </div>);
  return (
    <div style={{ padding: 18 }}>
      <SectionTitle icon={Settings}>Manage</SectionTitle>
      <Card title={`Lab members · ${members.length}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>{members.map((m) => (
          <div key={m.name} style={rowFlat}>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>{m.email && <div style={{ fontSize: 11, color: T.muted }}>{m.email}</div>}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {m.pd || m.role === "chair"
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, border: `1px solid ${T.accent}`, background: "#E6F3F4", borderRadius: 999, padding: "3px 8px" }}>{m.role === "chair" ? "CHAIR" : "PD"}</span>
                : <Select value={m.role || "member"} onChange={(e) => onSetRole(m.name, e.target.value)} style={{ height: 32, fontSize: 11.5, fontWeight: 700, padding: "0 8px", width: 122 }}>
                    <option value="member">Log &amp; view</option>
                    <option value="admin">Full access</option>
                    <option value="guest">Booking only</option>
                  </Select>}
              {!m.pd && <button onClick={() => onDelMember(m.name)} style={iconBtn}><Trash2 size={15} color={T.muted} /></button>}</div>
          </div>))}</div>
        <Field label="Add member — name"><Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Last, First" /></Field>
        <Field label="Email"><Input value={nmEmail} onChange={(e) => setNmEmail(e.target.value)} placeholder="netid@utmb.edu" /></Field>
        <Field label="Access"><Select value={nmRole} onChange={(e) => setNmRole(e.target.value)}>
          <option value="member">Log &amp; view — lab member</option>
          <option value="admin">Full access — edit inventory, take in and place orders</option>
          <option value="guest">Booking only — outside collaborator</option>
        </Select></Field>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>Booking-only is for people outside the lab who need instrument time (for example the group using the ultracentrifuge). They see the Book tab and nothing else.</div>
        <Btn onClick={() => { if (nm.trim()) { onAddMember({ name: nm.trim(), email: nmEmail.trim(), role: nmRole }); setNm(""); setNmEmail(""); setNmRole("member"); } }} style={{ opacity: nm.trim() ? 1 : .5 }}>Add member</Btn>
      </Card>
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
function MeTab({ me, members, pickMe, setTab }) {
  const [q, setQ] = useState("");
  const list = members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  const chair = list.filter((m) => m.role === "chair");
  const pds = list.filter((m) => m.pd);
  const full = list.filter((m) => m.role === "admin" && !m.pd);
  const rest = list.filter((m) => !["chair", "admin", "guest"].includes(m.role) && !m.pd);
  const guests = list.filter((m) => m.role === "guest");
  const badgeOf = (m) => m.role === "chair" ? "CHAIR" : m.pd ? "PD" : m.role === "admin" ? "FULL" : m.role === "guest" ? "BOOK" : null;
  const Row = (m) => (<button key={m.name} onClick={() => { pickMe(m.name); setTab("log"); }} style={{ ...rowFlat, cursor: "pointer", border: `1px solid ${me === m.name ? T.accent : T.border}`, background: me === m.name ? "#E6F3F4" : "#fff", marginBottom: 7 }}><span style={{ fontSize: 14.5, fontWeight: 600 }}>{m.name}</span>{me === m.name ? <Check size={18} color={T.accent} /> : badgeOf(m) ? <span style={{ fontSize: 10.5, fontWeight: 700, color: T.accent }}>{badgeOf(m)}</span> : null}</button>);
  const Group = (title, arr) => arr.length ? <div style={{ marginBottom: 14 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, letterSpacing: ".04em", marginBottom: 8 }}>{title}</div>{arr.map(Row)}</div> : null;
  return (<div style={{ padding: 18 }}>
    <SectionTitle icon={User}>Your identity</SectionTitle>
    <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>Usage you log is attributed to this name.</div>
    <div style={{ position: "relative", marginBottom: 14 }}><Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 14 }} /><Input placeholder="Find your name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} /></div>
    {Group("CHAIR", chair)}{Group("PROGRAM DIRECTORS", pds)}{Group("FULL ACCESS", full)}{Group("LAB MEMBERS", rest)}{Group("BOOKING ONLY", guests)}
    {list.length === 0 && <EmptyNote>No name matches "{q}".</EmptyNote>}
  </div>);
}

/* ---------- shared ---------- */
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
const ORDER_STATUS = { requested: ["Awaiting review", "#B45309"], routed: ["Awaiting approval", "#6D3BB5"], approved: ["Ready to order", "#1D4ED8"], ordered: ["Ordered", "#0E7C86"], received: ["Received", "#127449"], rejected: ["Sent back", "#B42318"] };
const money = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function pendingFor(orders, me, caps) {
  if (!me) return 0;
  return orders.filter((o) => (o.status === "requested" && caps.intake) || (o.status === "routed" && caps.approve) || ((o.status === "approved" || o.status === "ordered") && caps.place)).length;
}
const committedFor = (orders, gid) => orders.filter((o) => o.grantId === gid && (o.status === "ordered" || o.status === "received")).reduce((s, o) => s + (Number(o.total) || 0), 0);

function OrdersTab({ me, caps, orders, grants, projects, inv, members, approverNames, mediaPar, orderSeed, clearSeed, onCreate, onUpdate, onAction, onDelete, onUpsertGrant, onDelGrant }) {
  const [nw, setNw] = useState(false);
  useEffect(() => { if (orderSeed) setNw(true); }, [orderSeed]);
  const [editO, setEditO] = useState(null);
  const [view, setView] = useState("act");
  const [receiving, setReceiving] = useState(null);
  const [routing, setRouting] = useState(null);
  const [showGrants, setShowGrants] = useState(false);

  const mine = orders.filter((o) => o.requester === me);
  const toAct = orders.filter((o) => (o.status === "requested" && caps.intake) || (o.status === "routed" && caps.approve) || ((o.status === "approved" || o.status === "ordered") && caps.place));
  const anyRole = caps.intake || caps.approve || caps.place || caps.grants;
  const shown = view === "mine" ? mine : view === "all" ? orders : toAct;

  const exportToOrder = () => {
    const rows = orders.filter((o) => o.status === "approved").map((o) => ({ Item: o.itemName, "Cat#": o.catalog, Vendor: o.vendor, Qty: o.qty, "Unit $": o.unitPrice, "Total $": o.total, Project: o.project, Grant: o.grantName, Requester: o.requester, "Approved by": o.piApprover, Reason: o.experiment }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Item: "— nothing ready to order —" }]), "To order"); XLSX.writeFile(wb, `MenonLab_ToOrder_${isoDate(new Date())}.xlsx`);
  };
  // The full monthly pack (supply list, restocking, spend, fund availability)
  // is generated server-side so it can also be bookmarked or scheduled.
  const monthlyPack = () => { window.location.href = "/api/monthly"; };
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
      {(caps.place || caps.grants) && (
        <div style={{ marginBottom: 14 }}>
          <Btn onClick={monthlyPack}><FileSpreadsheet size={16} />Monthly pack — supplies, restocking, spend, funds</Btn>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>Seven tabs: fund availability by grant, restocking list, media par levels, orders, spend by person, usage, and the full supply inventory.</div>
        </div>
      )}

      {anyRole && <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
        {[["act", "Needs action", toAct.length], ["mine", "My requests", mine.length], ["all", "All", orders.length]].map(([k, label, n]) => (
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
        : shown.map((o) => <OrderCard key={o.id} o={o} me={me} caps={caps} grants={grants} orders={orders} inv={inv} onAction={onAction} onDelete={onDelete} onReceive={() => setReceiving(o)} onRoute={() => setRouting(o)} onEdit={() => setEditO(o)} />)}

      {nw && <OrderForm key={orderSeed ? orderSeed.id : "blank"} me={me} projects={projects} grants={grants} inv={inv} seed={orderSeed} onSave={(o) => { onCreate(o); setNw(false); clearSeed && clearSeed(); }} onClose={() => { setNw(false); clearSeed && clearSeed(); }} />}
      {editO && <OrderForm me={me} projects={projects} grants={grants} inv={inv} existing={editO} onSave={(o) => { onUpdate({ ...o, id: editO.id }); setEditO(null); }} onClose={() => setEditO(null)} />}
      {routing && <RouteSheet o={routing} approvers={approverNames} onConfirm={(approver) => { onAction(routing.id, "route", { approver }); setRouting(null); }} onClose={() => setRouting(null)} />}
      {receiving && <ReceiveSheet o={receiving} onConfirm={(addItem) => { onAction(receiving.id, "receive", { addItem }); setReceiving(null); }} onClose={() => setReceiving(null)} />}
    </div>
  );
}

function OrderCard({ o, me, caps, grants, orders, inv, onAction, onDelete, onReceive, onRoute, onEdit }) {
  const [st, color] = ORDER_STATUS[o.status] || [o.status, T.muted];
  const dup = inv.find((i) => i.name.toLowerCase().trim() === (o.itemName || "").toLowerCase().trim());
  const grant = grants.find((g) => g.id === o.grantId);
  const remaining = grant ? grant.budget - committedFor(orders, grant.id) : null;
  const insufficient = grant && grant.budget > 0 && remaining < o.total;
  const reject = () => { const r = window.prompt("Reason for sending back?") || ""; onAction(o.id, "reject", { reason: r }); };
  const place = () => { const po = window.prompt("PO / order reference (optional):") || ""; onAction(o.id, "place", { po }); };
  // Dr. Menon's rule: the FRS is assigned at the moment of final approval,
  // together with the fund position the approver was looking at.
  const approveWithFrs = () => {
    const frs = window.prompt(`FRS / account to charge${grant ? " for " + grant.name : ""}:`, o.frs || "");
    if (frs === null) return;
    const fundNote = grant && grant.budget > 0 ? `${grant.name}: ${money(remaining)} available at approval` : "";
    onAction(o.id, "approve", { frs: frs.trim(), fundNote });
  };
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.itemName}</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{[o.qty && `×${o.qty}`, o.vendor, o.catalog].filter(Boolean).join(" · ")}</div></div>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color, background: color + "18", borderRadius: 999, padding: "3px 8px", height: "fit-content" }}>{st}</span>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 6, display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
        <span style={{ fontWeight: 700, color: T.ink }}>{money(o.total)}</span>
        {o.grantName && <span>· {o.grantName}</span>}{o.project && <span>· {o.project}</span>}<span>· {shortName(o.requester || "")}</span>
      </div>
      {o.experiment && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}><b style={{ color: T.ink, fontWeight: 600 }}>Reason:</b> {o.experiment}</div>}
      {o.frs && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}><b style={{ color: T.ink, fontWeight: 600 }}>FRS:</b> <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{o.frs}</span>{o.piApprover ? ` · assigned by ${shortName(o.piApprover)}` : ""}</div>}
      {o.explored && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}><b style={{ color: T.ink, fontWeight: 600 }}>Explored:</b> {o.explored}</div>}
      {o.checklist && Object.keys(o.checklist).length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#127449", background: "#EAF6EE", borderRadius: 8, padding: "5px 9px", marginTop: 8, width: "fit-content" }}>
          <ListChecks size={13} />Pre-order checklist completed ({Object.values(o.checklist).filter(Boolean).length}/7)
        </div>
      )}
      {o.status === "routed" && o.approver && <div style={{ fontSize: 11.5, color: "#6D3BB5", marginTop: 6 }}>Sent to {shortName(o.approver)} for approval by {shortName(o.authorizer || "")}</div>}
      {dup && o.status === "requested" && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.amber, background: "#FDF0DF", borderRadius: 8, padding: "6px 9px", marginTop: 8 }}><AlertTriangle size={14} />Already in lab: {dup.qty || "in stock"} at {locLine(dup)}. Cross-check first.</div>}
      {o.status === "routed" && caps.approve && grant && grant.budget > 0 && <div style={{ fontSize: 11.5, color: insufficient ? T.danger : T.muted, marginTop: 8 }}>{grant.name}: {money(remaining)} available {insufficient ? "— exceeds remaining budget" : ""}</div>}
      {o.rejectReason && o.status === "rejected" && <div style={{ fontSize: 12, color: T.danger, marginTop: 6 }}>Sent back: {o.rejectReason}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {o.status === "requested" && caps.intake && <>
          <ActBtn onClick={onRoute} icon={Send}>Route for approval</ActBtn>
          <ActBtn kind="ghost" onClick={reject} icon={X}>Send back</ActBtn></>}
        {o.status === "routed" && caps.approve && <>
          <ActBtn onClick={approveWithFrs} icon={CheckCircle2}>Approve + assign FRS</ActBtn>
          <ActBtn kind="ghost" onClick={reject} icon={X}>Send back</ActBtn></>}
        {o.status === "approved" && caps.place && <ActBtn onClick={place} icon={ShoppingCart}>Place order</ActBtn>}
        {o.status === "ordered" && caps.place && <ActBtn onClick={onReceive} icon={PackageCheck}>Mark received</ActBtn>}
        {(o.requester === me || caps.intake) && o.status === "requested" && <ActBtn kind="ghost" onClick={onEdit} icon={Pencil}>Edit</ActBtn>}
        {((o.requester === me && (o.status === "requested" || o.status === "rejected")) || (caps.intake && o.status !== "received")) && <ActBtn kind="ghost" onClick={() => { if (window.confirm("Cancel and delete this order request?")) onDelete(o.id); }} icon={Trash2}>{o.requester === me ? "Delete" : "Cancel"}</ActBtn>}
      </div>
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

function OrderForm({ me, projects, grants, inv, existing, seed, onSave, onClose }) {
  const isEdit = !!existing;
  const [f, setF] = useState(existing ? { id: existing.id, itemName: existing.itemName || "", catalog: existing.catalog || "", vendor: existing.vendor || "", qty: (existing.qty ?? "") + "", unitPrice: (existing.unitPrice ?? "") + "", project: existing.project || "", grantId: existing.grantId || "", grantName: existing.grantName || "", experiment: existing.experiment || "", notes: existing.notes || "", dupAck: true, explored: existing.explored || "" } : { id: uid(), itemName: seed ? seed.name : "", catalog: seed ? seed.catalog || "" : "", vendor: seed ? seed.vendor || "" : "", qty: "1", unitPrice: "", project: seed && seed.scope === "Project" ? seed.project : "", grantId: "", grantName: "", experiment: "", notes: "", dupAck: !!seed, explored: seed ? `Raised from the inventory record: ${seed.qty !== "" && seed.qty != null ? seed.qty + " " + (seed.unit || "") : "no quantity recorded"} at ${locLine(seed)}.` : "", fromItemId: seed ? seed.id : "" });
  const [ck, setCk] = useState({});
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k) => setCk((s) => ({ ...s, [k]: !s[k] }));
  const dup = !isEdit && f.itemName.trim().length > 2 && inv.find((i) => i.name.toLowerCase().includes(f.itemName.toLowerCase().trim()));
  const total = (parseFloat(f.qty) || 0) * (parseFloat(f.unitPrice) || 0);
  const ckDone = isEdit || CHECKLIST.every((c) => ck[c[0]]);
  const ckCount = CHECKLIST.filter((c) => ck[c[0]]).length;
  const ok = f.itemName.trim() && f.experiment.trim() && ckDone && (!dup || f.dupAck);
  const submit = () => { if (!ok) return; const g = grants.find((x) => x.id === f.grantId); onSave({ ...f, total, unitPrice: parseFloat(f.unitPrice) || 0, grantName: g ? g.name : "", ...(isEdit ? {} : { checklist: ck }) }); };
  const seedGrant = grants.find((x) => x.id === f.grantId);
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
      <Field label="Grant / fund"><Select value={f.grantId} onChange={(e) => set("grantId", e.target.value)}><option value="">—</option>{grants.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
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
      <Btn onClick={submit} style={{ opacity: ok ? 1 : .5 }}><Send size={16} />{isEdit ? "Save changes" : "Send request"}</Btn>
      {!ckDone && <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 8 }}>Complete the checklist to submit.</div>}
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

function RouteSheet({ o, approvers, onConfirm, onClose }) {
  const [who, setWho] = useState(approvers[0] || "");
  return (<Sheet title="Route for approval" onClose={onClose}>
    <div style={{ fontSize: 14, marginBottom: 4, fontWeight: 600 }}>{o.itemName}</div>
    <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16 }}>{[o.qty && `×${o.qty}`, money(o.total), o.requester && "from " + shortName(o.requester)].filter(Boolean).join(" · ")}</div>
    <Field label="Send to for final approval">
      <Select value={who} onChange={(e) => setWho(e.target.value)}>{approvers.map((n) => <option key={n}>{n}</option>)}</Select>
    </Field>
    <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Final approval must come from the Chair or a program director.</div>
    <Btn onClick={() => who && onConfirm(who)} style={{ opacity: who ? 1 : .5 }}><Send size={16} />Send for approval</Btn>
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

function BookTab({ me, canEdit, instruments, bookings, onBook, onCancel, onUpsertInstrument, onDelInstrument }) {
  const [day, setDay] = useState(new Date());
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState(false);
  const [manage, setManage] = useState(false);
  const dayStr = isoDate(day);
  const colorOf = (id) => INSTR_COLORS[Math.max(0, instruments.findIndex((x) => x.id === id)) % INSTR_COLORS.length];
  const todays = bookings.filter((b) => b.day === dayStr && (filter === "all" || b.instrumentId === filter)).sort((a, b) => a.startMin - b.startMin);
  const groups = instruments.filter((i) => filter === "all" || i.id === filter).map((i) => [i, todays.filter((b) => b.instrumentId === i.id)]);
  const isToday = isoDate(new Date()) === dayStr;

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle icon={Calendar} noMargin>Instruments</SectionTitle>
        {me && <button onClick={() => setForm(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: T.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={16} />Book</button>}
      </div>

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
      {manage && canEdit && <InstrumentsPanel instruments={instruments} onUpsert={onUpsertInstrument} onDel={onDelInstrument} />}

      {groups.map(([ins, list]) => (
        <div key={ins.id} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: colorOf(ins.id) }} /><span style={{ fontSize: 13, fontWeight: 800 }}>{ins.name}</span><span style={{ fontSize: 11.5, color: T.muted }}>· {list.length ? `${list.length} booked` : "free"}</span></div>
          {list.length === 0 && <div style={{ fontSize: 12.5, color: T.muted, padding: "2px 2px 4px" }}>No bookings — open all day.</div>}
          {list.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${T.line}`, borderLeft: `3px solid ${colorOf(ins.id)}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
              <div style={{ minWidth: 78, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{minLabel(b.startMin)}<div style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{minLabel(b.endMin)}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{shortName(b.member)}</div>{b.purpose && <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.purpose}</div>}</div>
              {(b.member === me || canEdit) && <button onClick={() => onCancel(b.id)} style={iconBtn}><X size={17} color={T.muted} /></button>}
            </div>
          ))}
        </div>
      ))}
      {instruments.length === 0 && <EmptyNote>No instruments yet.{canEdit ? " Add some above." : ""}</EmptyNote>}

      {form && <BookingForm me={me} instruments={instruments} bookings={bookings} day={dayStr} preselect={filter !== "all" ? filter : ""} onSave={(b) => { onBook(b); setForm(false); }} onClose={() => setForm(false)} />}
    </div>
  );
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

function InstrumentsPanel({ instruments, onUpsert, onDel }) {
  const [nm, setNm] = useState("");
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Instruments</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {instruments.map((i) => (<div key={i.id} style={{ ...rowFlat, gap: 8 }}>
          <Input value={i.name} onChange={(e) => onUpsert({ ...i, name: e.target.value })} style={{ height: 38, border: "none", padding: 0, fontWeight: 600 }} />
          <button onClick={() => onDel(i.id)} style={iconBtn}><Trash2 size={15} color={T.muted} /></button>
        </div>))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Add instrument" />
        <button onClick={() => { if (nm.trim()) { onUpsert({ id: uid(), name: nm.trim() }); setNm(""); } }} style={addBtn}><Plus size={18} /></button>
      </div>
    </div>
  );
}
