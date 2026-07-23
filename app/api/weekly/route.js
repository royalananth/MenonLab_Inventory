import { ensureInit, q } from "../../../lib/db.js";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function weekStart(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - off); return x; }

// GET /api/weekly            -> current week
// GET /api/weekly?date=YYYY-MM-DD -> week containing that date
export async function GET(req) {
  await ensureInit();
  const url = new URL(req.url);
  const anchor = url.searchParams.get("date") ? new Date(url.searchParams.get("date")) : new Date();
  const ws = weekStart(anchor);
  const we = new Date(ws); we.setDate(we.getDate() + 7);

  const rows = (await q(`SELECT * FROM usage_log WHERE ts >= $1 AND ts < $2 ORDER BY member, ts`, [ws.toISOString(), we.toISOString()])).rows;
  const members = (await q(`SELECT name FROM members ORDER BY name`)).rows.map((r) => r.name);

  const toRow = (u) => ({
    Date: new Date(u.ts).toLocaleDateString(), Member: u.member, Item: u.item_name, Category: u.category,
    Qty: u.qty, Unit: u.unit, Project: u.project, Experiment: u.experiment,
    Room: u.room, Fridge: u.fridge, Box: u.box, Notes: u.notes,
  });

  const wb = XLSX.utils.book_new();
  const summary = members.map((m) => ({ Member: m, Entries: rows.filter((r) => r.member === m).length })).filter((r) => r.Entries);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary.length ? summary : [{ Member: "—", Entries: 0 }]), "Summary");
  members.forEach((m) => {
    const list = rows.filter((r) => r.member === m);
    if (list.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(list.map(toRow)), m.replace(/[\\/?*[\]:]/g, "").slice(0, 28));
  });

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fname = `MenonLab_Weekly_${ws.toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
