import { ensureInit, q } from "../../../lib/db.js";
import { sessionMember, caps } from "../../../lib/auth.js";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The monthly pack Dr. Menon asked for:
//   1. Supply inventory list          — everything currently on hand
//   2. Restocking list                — items at or below their par level, media first
//   3. Orders this month              — who ordered what, on which grant, with the FRS
//   4. Spend by person                — accountability
//   5. Fund availability by grant     — budget, committed, remaining
//   6. Usage this month               — what was actually consumed
//
// GET /api/monthly                     -> current month
// GET /api/monthly?month=YYYY-MM       -> any month

const nz = (v) => (v == null ? "" : v);
const asNum = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);

export async function GET(req) {
  await ensureInit();
  const url = new URL(req.url);
  // Budgets and spend live in this file, so it needs a session like everything
  // else. The browser opens it directly, so the token may come by query string.
  const me = await sessionMember(req.headers.get("x-session") || url.searchParams.get("token") || "");
  if (!me) return new Response("Sign in to the app first, then use the Monthly pack button.", { status: 401 });
  const c = caps(me);
  if (!c.place && !c.grants && !c.edit) return new Response("The monthly pack is for PIs and purchasing staff.", { status: 403 });
  const monthParam = url.searchParams.get("month");
  const anchor = monthParam ? new Date(monthParam + "-01T00:00:00") : new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const label = start.toISOString().slice(0, 7);

  const [items, orders, usage, grants, par, instruments, bookings, access] = await Promise.all([
    q(`SELECT * FROM items ORDER BY category, name`),
    q(`SELECT * FROM orders ORDER BY created_at DESC`),
    q(`SELECT * FROM usage_log WHERE ts >= $1 AND ts < $2 ORDER BY member, ts`, [start.toISOString(), end.toISOString()]),
    q(`SELECT * FROM grants ORDER BY name`),
    q(`SELECT * FROM media_par ORDER BY cell_type, name`),
    q(`SELECT id,name,super_user,restricted FROM instruments WHERE active ORDER BY ord`),
    q(`SELECT * FROM bookings WHERE day >= $1 AND day < $2 ORDER BY day, start_min`,
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]),
    q(`SELECT * FROM instrument_access ORDER BY instrument_name, member`),
  ]);

  const monthOrders = orders.rows.filter((o) => o.created_at && new Date(o.created_at) >= start && new Date(o.created_at) < end);

  // ---- 1. supply inventory ----
  const supply = items.rows.map((i) => ({
    Category: nz(i.category), Item: nz(i.name), "Catalog #": nz(i.catalog), Vendor: nz(i.vendor),
    Qty: nz(i.qty), Unit: nz(i.unit), "Par level": nz(i.min_qty),
    Room: nz(i.room), Location: nz(i.fridge), Box: nz(i.box),
    "Lot #": nz(i.lot_no), Assay: nz(i.assay_group), Owner: nz(i.owner), Project: nz(i.project),
  }));

  // ---- 2. restocking ----
  const isLow = (i) => {
    const qty = asNum(i.qty), min = asNum(i.min_qty);
    if (qty === null) return false;
    if (min !== null) return qty <= min;
    return qty <= 0;
  };
  const restock = items.rows.filter(isLow).map((i) => ({
    Priority: /media|serum|pbs|fbs|dmem|trypsin/i.test(i.name + " " + i.category) ? "Media / culture" : "Standard",
    Item: nz(i.name), Category: nz(i.category), "Catalog #": nz(i.catalog), Vendor: nz(i.vendor),
    "On hand": nz(i.qty), Unit: nz(i.unit), "Par level": nz(i.min_qty),
    "Suggested order": (() => { const qn = asNum(i.qty), mn = asNum(i.min_qty); return mn !== null && qn !== null ? Math.max(1, mn * 2 - qn) : ""; })(),
    Room: nz(i.room), Location: nz(i.fridge),
  }));
  restock.sort((a, b) => (a.Priority === b.Priority ? String(a.Item).localeCompare(String(b.Item)) : a.Priority === "Media / culture" ? -1 : 1));

  // media par reference, so the standing media order is visible even when stock is not logged
  const mediaSheet = par.rows.map((p) => ({
    "Cell type": nz(p.cell_type), Reagent: nz(p.name), Vendor: nz(p.vendor), "Catalog #": nz(p.catalog),
    "Target qty": nz(p.target_qty), "Per stock": nz(p.per_stock),
  }));

  // ---- 3. orders this month ----
  // These must match the values actually stored in orders.status.
  const STATUS = { requested: "Awaiting PI approval", approved: "Ready to order", ordered: "Ordered", received: "Received", rejected: "Sent back" };
  const COMMITTED = ["approved", "ordered", "received"];
  const orderRows = monthOrders.map((o) => ({
    Date: o.created_at ? new Date(o.created_at).toLocaleDateString() : "",
    Status: STATUS[o.status] || nz(o.status), Item: nz(o.item_name), "Catalog #": nz(o.catalog), Vendor: nz(o.vendor),
    Qty: nz(o.qty), "Unit price": Number(o.unit_price) || 0, Total: Number(o.total) || 0,
    Requester: nz(o.requester), Project: nz(o.project), Grant: nz(o.grant_name), FRS: nz(o.frs),
    Reason: nz(o.experiment), Authorized: nz(o.authorizer), "PI approval": nz(o.pi_approver),
    PO: nz(o.po), Purchaser: nz(o.purchaser),
  }));

  // ---- 4. spend by person ----
  const counted = monthOrders.filter((o) => COMMITTED.includes(o.status));
  const byPerson = {};
  counted.forEach((o) => {
    const k = nz(o.requester) || "—";
    byPerson[k] = byPerson[k] || { Person: k, Orders: 0, Total: 0 };
    byPerson[k].Orders += 1;
    byPerson[k].Total += Number(o.total) || 0;
  });
  const spend = Object.values(byPerson).sort((a, b) => b.Total - a.Total);

  // ---- 5. fund availability ----
  const committedAll = {};
  orders.rows.filter((o) => COMMITTED.includes(o.status)).forEach((o) => {
    const k = nz(o.grant_id) || nz(o.grant_name);
    committedAll[k] = (committedAll[k] || 0) + (Number(o.total) || 0);
  });
  const funds = grants.rows.map((g) => {
    const spent = (committedAll[g.id] || 0) + (committedAll[g.name] || 0);
    const budget = Number(g.budget) || 0;
    return { Grant: nz(g.name), Budget: budget, Committed: spent, Remaining: budget - spent, "% used": budget ? Math.round((spent / budget) * 1000) / 10 : "", Notes: nz(g.notes) };
  });

  // ---- 6. usage this month ----
  const usageRows = usage.rows.map((u) => ({
    Date: new Date(u.ts).toLocaleDateString(), Member: nz(u.member), Item: nz(u.item_name), Category: nz(u.category),
    Qty: nz(u.qty), Unit: nz(u.unit), Project: nz(u.project), Experiment: nz(u.experiment), Notes: nz(u.notes),
  }));

  // ---- 7. instrument usage this month ----
  // How many people booked each machine, how many sessions, how many hours.
  const hours = (b) => Math.max(0, (Number(b.end_min) - Number(b.start_min))) / 60;
  const instrUsage = instruments.rows.map((ins) => {
    const list = bookings.rows.filter((b) => b.instrument_id === ins.id);
    const people = [...new Set(list.map((b) => nz(b.member)).filter(Boolean))];
    const hrs = list.reduce((t, b) => t + hours(b), 0);
    return {
      Instrument: nz(ins.name),
      "Super user": nz(ins.super_user),
      Restricted: ins.restricted ? "Yes" : "No",
      "People booking": people.length,
      Sessions: list.length,
      "Hours booked": Math.round(hrs * 10) / 10,
      "Avg session (h)": list.length ? Math.round((hrs / list.length) * 10) / 10 : 0,
      "Who": people.map((n) => (n.includes(",") ? n.split(",")[0].trim() : n)).sort().join(", "),
    };
  }).sort((a, b) => b.Sessions - a.Sessions);

  // per person per instrument, so a machine's load can be attributed
  const perPerson = {};
  bookings.rows.forEach((b) => {
    const k = nz(b.instrument_name) + "||" + nz(b.member);
    perPerson[k] = perPerson[k] || { Instrument: nz(b.instrument_name), Member: nz(b.member), Sessions: 0, "Hours booked": 0 };
    perPerson[k].Sessions += 1;
    perPerson[k]["Hours booked"] += hours(b);
  });
  const instrByPerson = Object.values(perPerson)
    .map((r) => ({ ...r, "Hours booked": Math.round(r["Hours booked"] * 10) / 10 }))
    .sort((a, b) => String(a.Instrument).localeCompare(String(b.Instrument)) || b.Sessions - a.Sessions);

  const accessRows = access.rows.map((a) => ({
    Instrument: nz(a.instrument_name), Member: nz(a.member), Status: nz(a.status),
    Requested: a.requested_at ? new Date(a.requested_at).toLocaleDateString() : "",
    Decided: a.decided_at ? new Date(a.decided_at).toLocaleDateString() : "",
    "Decided by": nz(a.decided_by), Note: nz(a.note),
  }));

  const wb = XLSX.utils.book_new();
  const add = (name, rows, empty) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [empty]), name);

  add("Fund availability", funds, { Grant: "No grants set up yet", Budget: 0, Committed: 0, Remaining: 0 });
  add("Restocking", restock, { Item: "Nothing at or below its par level", Category: "", "On hand": "", "Par level": "" });
  add("Media par levels", mediaSheet, { "Cell type": "—", Reagent: "", Vendor: "" });
  add("Orders", orderRows, { Date: "", Status: "No orders this month", Item: "" });
  add("Spend by person", spend, { Person: "No approved spend this month", Orders: 0, Total: 0 });
  add("Usage", usageRows, { Date: "", Member: "No usage logged this month", Item: "" });
  add("Instrument usage", instrUsage, { Instrument: "No instruments set up", Sessions: 0, "Hours booked": 0 });
  add("Instrument by person", instrByPerson, { Instrument: "No bookings this month", Member: "", Sessions: 0 });
  add("Instrument access", accessRows, { Instrument: "No access requests yet", Member: "", Status: "" });
  add("Supply inventory", supply, { Category: "", Item: "Inventory is empty" });

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MenonLab_Monthly_${label}.xlsx"`,
    },
  });
}
