// Accountability reporting, shared by the weekly and monthly packs so the two
// can never disagree about what a number means.
//
// The chain being reported on:
//   requester -> PD (approves, proposes grant + FRS) -> Dr. Menon (above the
//   threshold, confirms or changes the fund) -> Megan places on the UTMB site
//   -> received
import { q } from "./db.js";

export const nz = (v) => (v == null ? "" : v);
export const asNum = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
export const short = (n) => (n || "").includes(",") ? n.split(",")[0].trim() : (n || "").split(" ")[0];
const d = (v) => (v ? new Date(v).toLocaleDateString() : "");
const dt = (v) => (v ? new Date(v).toLocaleString() : "");

// An order counts against a grant once it is approved. Requests still in the
// queue are shown separately as pending, never mixed into spend.
export const COMMITTED = ["approved", "ordered", "received"];
export const PENDING = ["requested", "pd_ok"];

export const STATUS_LABEL = {
  requested: "Awaiting PD",
  pd_ok: "Awaiting Dr. Menon",
  routed: "Awaiting PD",
  approved: "Ready for Megan",
  ordered: "Ordered",
  received: "Received",
  rejected: "Sent back",
};

const EVENT_LABEL = {
  requested: "Requested",
  edited: "Edited",
  reassigned: "Passed to another PD",
  pd_approved: "PD approved",
  chair_approved: "Chair approved",
  placed: "Placed on UTMB site",
  received: "Received",
  sent_back: "Sent back",
  deleted: "Cancelled",
  approved: "Approved (pre-audit)",
};

const days = (from, to) => Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000));

export async function loadReportData(start, end) {
  const [orders, events, grants, members, usage] = await Promise.all([
    q(`SELECT * FROM orders ORDER BY created_at DESC`),
    q(`SELECT * FROM order_events ORDER BY at ASC`),
    q(`SELECT * FROM grants ORDER BY name`),
    q(`SELECT name, role, pd FROM members ORDER BY name`),
    q(`SELECT * FROM usage_log WHERE ts >= $1 AND ts < $2 ORDER BY member, ts`, [start.toISOString(), end.toISOString()]),
  ]);
  return { orders: orders.rows, events: events.rows, grants: grants.rows, members: members.rows, usage: usage.rows };
}

// One row per order, carrying the whole chain — this is the sheet to open when
// somebody asks who authorised a charge.
export function orderRows(orders) {
  return orders.map((o) => ({
    "Order ID": nz(o.id),
    Raised: d(o.created_at),
    Status: STATUS_LABEL[o.status] || nz(o.status),
    Item: nz(o.item_name),
    "Catalog #": nz(o.catalog),
    Vendor: nz(o.vendor),
    Qty: nz(o.qty),
    "Unit price": Number(o.unit_price) || 0,
    Total: Number(o.total) || 0,
    Requester: nz(o.requester),
    Project: nz(o.project),
    "Sent to": nz(o.approver),
    "PD approved by": nz(o.pd_approver),
    "PD approved on": d(o.pd_approved_at),
    "PD proposed grant": nz(o.pd_grant_name),
    "PD proposed FRS": nz(o.pd_frs),
    "Needed chair": o.needs_chair ? "Yes" : "No",
    "Chair approved by": nz(o.pi_approver),
    "Chair approved on": d(o.pi_approved_at),
    "Final grant": nz(o.grant_name),
    "Final FRS": nz(o.frs),
    "Fund position at approval": nz(o.fund_note),
    "Funding changed by chair":
      o.pd_approver && o.pi_approver && (nz(o.pd_grant_name) !== nz(o.grant_name) || nz(o.pd_frs) !== nz(o.frs)) ? "Yes" : "",
    "Placed by": nz(o.purchaser),
    "Placed on": d(o.ordered_at),
    PO: nz(o.po),
    "Placed via": nz(o.placed_via),
    Received: d(o.received_at),
    "Days raised to approved": o.created_at && o.pi_approved_at ? days(o.created_at, o.pi_approved_at) : "",
    "Days approved to placed": o.pi_approved_at && o.ordered_at ? days(o.pi_approved_at, o.ordered_at) : "",
    "Approved via": nz(o.approved_via),
    Reason: nz(o.experiment),
    "Sent back because": nz(o.reject_reason),
  }));
}

// Budget, what is committed, what is still in the queue, and what is left.
export function fundRows(grants, orders) {
  const sum = (list) => list.reduce((t, o) => t + (Number(o.total) || 0), 0);
  return grants.map((g) => {
    const mine = orders.filter((o) => o.grant_id === g.id || (!o.grant_id && o.grant_name === g.name));
    const committed = sum(mine.filter((o) => COMMITTED.includes(o.status)));
    const pending = sum(mine.filter((o) => PENDING.includes(o.status)));
    const budget = Number(g.budget) || 0;
    return {
      Grant: nz(g.name),
      Budget: budget,
      Committed: committed,
      "Awaiting approval": pending,
      Remaining: budget - committed,
      "Remaining if all pending clears": budget - committed - pending,
      "% used": budget ? Math.round((committed / budget) * 1000) / 10 : "",
      Orders: mine.filter((o) => COMMITTED.includes(o.status)).length,
      Notes: nz(g.notes),
    };
  });
}

// Who is spending, broken out by the fund they are spending from.
export function spendByPerson(orders, inRange) {
  const rows = {};
  orders.filter((o) => COMMITTED.includes(o.status) && inRange(o)).forEach((o) => {
    const k = nz(o.requester) || "—";
    rows[k] = rows[k] || { Person: k, Orders: 0, Total: 0, Grants: new Set(), "Largest single order": 0 };
    rows[k].Orders += 1;
    rows[k].Total += Number(o.total) || 0;
    if (o.grant_name) rows[k].Grants.add(o.grant_name);
    rows[k]["Largest single order"] = Math.max(rows[k]["Largest single order"], Number(o.total) || 0);
  });
  return Object.values(rows)
    .map((r) => ({ ...r, Grants: [...r.Grants].sort().join(", ") }))
    .sort((a, b) => b.Total - a.Total);
}

// Who authorised the spend — the other half of accountability.
export function spendByApprover(orders, inRange) {
  const rows = {};
  orders.filter((o) => COMMITTED.includes(o.status) && inRange(o)).forEach((o) => {
    const k = nz(o.pd_approver) || nz(o.pi_approver) || "—";
    rows[k] = rows[k] || { "Approved by (PD)": k, Orders: 0, Total: 0, "Went to chair": 0 };
    rows[k].Orders += 1;
    rows[k].Total += Number(o.total) || 0;
    if (o.needs_chair) rows[k]["Went to chair"] += 1;
  });
  return Object.values(rows).sort((a, b) => b.Total - a.Total);
}

// What is stuck, with whom, and for how long. The sheet that gets things moving.
export function awaitingRows(orders) {
  const now = new Date();
  return orders
    .filter((o) => PENDING.includes(o.status) || o.status === "approved" || o.status === "ordered")
    .map((o) => {
      const since = o.status === "requested" ? o.created_at
        : o.status === "pd_ok" ? o.pd_approved_at
          : o.status === "approved" ? o.pi_approved_at || o.pd_approved_at
            : o.ordered_at;
      const withWhom = o.status === "requested" ? nz(o.approver)
        : o.status === "pd_ok" ? "Dr. Menon"
          : o.status === "approved" ? "Megan (purchasing)"
            : "Vendor / delivery";
      return {
        "Order ID": nz(o.id),
        Item: nz(o.item_name),
        Total: Number(o.total) || 0,
        Requester: nz(o.requester),
        "Waiting on": withWhom,
        Stage: STATUS_LABEL[o.status] || nz(o.status),
        "Waiting since": d(since),
        "Days waiting": since ? days(since, now) : "",
        Grant: nz(o.grant_name) || nz(o.pd_grant_name),
        FRS: nz(o.frs) || nz(o.pd_frs),
      };
    })
    .sort((a, b) => (Number(b["Days waiting"]) || 0) - (Number(a["Days waiting"]) || 0));
}

// Every transition, newest last, with who did it. Never edited.
export function auditRows(events, orders, inRangeAt) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  return events
    .filter((e) => (inRangeAt ? inRangeAt(e.at) : true))
    .map((e) => {
      const o = byId.get(e.order_id);
      return {
        When: dt(e.at),
        Event: EVENT_LABEL[e.event] || nz(e.event),
        By: nz(e.actor),
        Item: o ? nz(o.item_name) : "(order deleted)",
        Amount: Number(e.amount) || 0,
        Grant: nz(e.grant_name),
        FRS: nz(e.frs),
        Channel: nz(e.via),
        "Order ID": nz(e.order_id),
        Detail: nz(e.detail),
      };
    })
    .reverse();
}

export function usageRows(usage) {
  return usage.map((u) => ({
    Date: d(u.ts), Member: nz(u.member), Item: nz(u.item_name), Category: nz(u.category),
    Qty: nz(u.qty), Unit: nz(u.unit), Project: nz(u.project), Experiment: nz(u.experiment), Notes: nz(u.notes),
  }));
}

// The headline figures for the period, so the first tab answers the question
// without anyone having to add up a column.
export function summaryRows(label, orders, events, inRange, inRangeAt, threshold) {
  const raised = orders.filter((o) => inRange(o));
  const evs = events.filter((e) => inRangeAt(e.at));
  const sum = (list) => list.reduce((t, o) => t + (Number(o.total) || 0), 0);
  const ev = (kind) => evs.filter((e) => e.event === kind);
  const evSum = (kind) => ev(kind).reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const awaiting = orders.filter((o) => PENDING.includes(o.status));
  const ready = orders.filter((o) => o.status === "approved");
  return [
    { Measure: "Period", Value: label },
    { Measure: "Chair approval required above", Value: threshold },
    { Measure: "—", Value: "" },
    { Measure: "Requests raised", Value: raised.length, Amount: sum(raised) },
    { Measure: "PD approvals given", Value: ev("pd_approved").length, Amount: evSum("pd_approved") },
    { Measure: "Chair approvals given", Value: ev("chair_approved").length, Amount: evSum("chair_approved") },
    { Measure: "Orders placed on the UTMB site", Value: ev("placed").length, Amount: evSum("placed") },
    { Measure: "Orders received", Value: ev("received").length, Amount: evSum("received") },
    { Measure: "Requests sent back", Value: ev("sent_back").length, Amount: evSum("sent_back") },
    { Measure: "—", Value: "" },
    { Measure: "Still awaiting approval (all time)", Value: awaiting.length, Amount: sum(awaiting) },
    { Measure: "Approved, waiting on Megan (all time)", Value: ready.length, Amount: sum(ready) },
  ];
}

export function addSheets(XLSX, wb, data, { label, inRange, inRangeAt, threshold }) {
  const { orders, events, grants, usage } = data;
  const add = (name, rows, empty) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [empty]), name);

  add("Summary", summaryRows(label, orders, events, inRange, inRangeAt, threshold), { Measure: "—", Value: "" });
  add("Awaiting action", awaitingRows(orders), { Item: "Nothing is waiting", Total: 0, "Waiting on": "" });
  add("Orders this period", orderRows(orders.filter(inRange)), { Item: "No orders raised in this period", Total: 0 });
  add("Fund availability", fundRows(grants, orders), { Grant: "No grants set up yet", Budget: 0, Committed: 0, Remaining: 0 });
  add("Spend by person", spendByPerson(orders, inRange), { Person: "No approved spend in this period", Orders: 0, Total: 0 });
  add("Spend by approver", spendByApprover(orders, inRange), { "Approved by (PD)": "None", Orders: 0, Total: 0 });
  add("Audit trail", auditRows(events, orders, inRangeAt), { When: "", Event: "Nothing happened in this period", By: "" });
  add("All orders, all time", orderRows(orders), { Item: "No orders yet", Total: 0 });
  add("Usage", usageRows(usage), { Date: "", Member: "No usage logged in this period", Item: "" });
  return wb;
}
