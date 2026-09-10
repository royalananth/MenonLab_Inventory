import { ensureInit, q } from "../../../lib/db.js";
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
  const monthParam = url.searchParams.get("month");
  const anchor = monthParam ? new Date(monthParam + "-01T00:00:00") : new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const label = start.toISOString().slice(0, 7);

  const [items, orders, usage, grants, par] = await Promise.all([
    q(`SELECT * FROM items ORDER BY category, name`),
    q(`SELECT * FROM orders ORDER BY created_at DESC`),
    q(`SELECT * FROM usage_log WHERE ts >= $1 AND ts < $2 ORDER BY member, ts`, [start.toISOString(), end.toISOString()]),
    q(`SELECT * FROM grants ORDER BY name`),
    q(`SELECT * FROM media_par ORDER BY cell_type, name`),
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
  const STATUS = { requested: "Awaiting review", approved: "Awaiting PI", pi_approved: "Ready to order", ordered: "Ordered", received: "Received", rejected: "Rejected" };
  const orderRows = monthOrders.map((o) => ({
    Date: o.created_at ? new Date(o.created_at).toLocaleDateString() : "",
    Status: STATUS[o.status] || nz(o.status), Item: nz(o.item_name), "Catalog #": nz(o.catalog), Vendor: nz(o.vendor),
    Qty: nz(o.qty), "Unit price": Number(o.unit_price) || 0, Total: Number(o.total) || 0,
    Requester: nz(o.requester), Project: nz(o.project), Grant: nz(o.grant_name), FRS: nz(o.frs),
    Reason: nz(o.experiment), Authorized: nz(o.authorizer), "PI approval": nz(o.pi_approver),
    PO: nz(o.po), Purchaser: nz(o.purchaser),
  }));

  // ---- 4. spend by person ----
  const counted = monthOrders.filter((o) => ["pi_approved", "ordered", "received"].includes(o.status));
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
  orders.rows.filter((o) => ["pi_approved", "ordered", "received"].includes(o.status)).forEach((o) => {
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

  const wb = XLSX.utils.book_new();
  const add = (name, rows, empty) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [empty]), name);

  add("Fund availability", funds, { Grant: "No grants set up yet", Budget: 0, Committed: 0, Remaining: 0 });
  add("Restocking", restock, { Item: "Nothing at or below its par level", Category: "", "On hand": "", "Par level": "" });
  add("Media par levels", mediaSheet, { "Cell type": "—", Reagent: "", Vendor: "" });
  add("Orders", orderRows, { Date: "", Status: "No orders this month", Item: "" });
  add("Spend by person", spend, { Person: "No approved spend this month", Orders: 0, Total: 0 });
  add("Usage", usageRows, { Date: "", Member: "No usage logged this month", Item: "" });
  add("Supply inventory", supply, { Category: "", Item: "Inventory is empty" });

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MenonLab_Monthly_${label}.xlsx"`,
    },
  });
}
