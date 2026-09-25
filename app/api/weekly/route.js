// The weekly accountability pack.
//
// Same sheets as the monthly one, scoped to a week, so nothing has to be
// reconciled between the two. Nine tabs: what happened, what is stuck, every
// order with its full chain, fund position, who spent, who authorised, the
// audit trail, all orders all time, and usage.
//
// GET /api/weekly                      -> current week (Monday start)
// GET /api/weekly?date=YYYY-MM-DD      -> the week containing that date
import { ensureInit, q } from "../../../lib/db.js";
import { sessionMember, caps } from "../../../lib/auth.js";
import { loadReportData, addSheets } from "../../../lib/reports.js";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function weekStart(d) {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7; // Monday
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}

export async function GET(req) {
  await ensureInit();
  const url = new URL(req.url);
  const me = await sessionMember(req.headers.get("x-session") || url.searchParams.get("token") || "");
  if (!me) return new Response("Sign in to the app first, then use the Weekly pack button.", { status: 401 });
  const c = caps(me);
  if (!c.reports) return new Response("The weekly pack is for PIs and purchasing staff.", { status: 403 });

  const anchor = url.searchParams.get("date") ? new Date(url.searchParams.get("date") + "T00:00:00") : new Date();
  const start = weekStart(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const thr = (await q(`SELECT v FROM meta WHERE k='chair_threshold'`)).rows[0];
  const threshold = Number(thr && thr.v) || 1000;

  const data = await loadReportData(start, end);
  const inRange = (o) => o.created_at && new Date(o.created_at) >= start && new Date(o.created_at) < end;
  const inRangeAt = (t) => t && new Date(t) >= start && new Date(t) < end;
  const label = `Week of ${start.toLocaleDateString()} to ${new Date(end - 1).toLocaleDateString()}`;

  const wb = addSheets(XLSX, XLSX.utils.book_new(), data, { label, inRange, inRangeAt, threshold });
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MenonLab_Weekly_${start.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
