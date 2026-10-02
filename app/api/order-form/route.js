// app/api/order-form/route.js
// GET /api/order-form?order_id=<id>[&frs=<frs>]  ->  downloads the filled UTMB Supply Order Form.
//
// Permission: only a member whose role is "purchasing" (Megan) or who is an
// access owner can generate it, and only once an FRS is available (either saved
// on the order, or passed in the `frs` query param when Megan is placing it).

import { NextResponse } from "next/server";
import { q, ensureInit } from "../../../lib/db.js";
import { buildOrderFormBuffer, orderFormFilename } from "../../../lib/orderForm.js";

export const dynamic = "force-dynamic";

// Match how the rest of the app authenticates (x-session), with fallbacks.
function readToken(req) {
  const h = req.headers;
  const auth = h.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    h.get("x-session") ||
    h.get("x-token") ||
    new URL(req.url).searchParams.get("token") ||
    ""
  );
}

async function getActor(req) {
  const token = readToken(req);
  if (!token) return null;
  const s = await q(`SELECT member FROM sessions WHERE token = $1`, [token]);
  const name = s.rows[0]?.member;
  if (!name) return null;
  const m = await q(`SELECT name, role, pd, owner FROM members WHERE name = $1`, [name]);
  return m.rows[0] || null;
}

export async function GET(req) {
  await ensureInit();

  const actor = await getActor(req);
  if (!actor) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const canPlace = actor.role === "purchasing" || actor.owner === true;
  if (!canPlace) {
    return NextResponse.json({ error: "Only Megan can generate the UTMB form" }, { status: 403 });
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");
  const frsOverride = (url.searchParams.get("frs") || "").trim();
  if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  const { rows } = await q(
    `SELECT id, item_name, catalog, vendor, qty, unit_price, total,
            project, grant_name, requester, status, frs, ordered_at, created_at
       FROM orders WHERE id = $1`,
    [orderId]
  );
  const o = rows[0];
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const frs = frsOverride || o.frs || "";
  if (!frs) {
    return NextResponse.json({ error: "Enter the FRS before generating the form" }, { status: 422 });
  }

  const d = o.ordered_at || o.created_at || new Date();
  const order = {
    date: new Date(d).toISOString().slice(0, 10),
    requestId: `ORD-${o.id}`,
    vendor: o.vendor || "",
    frs,
    project: o.grant_name || o.project || "",
    requestor: o.requester || "",
    lcode: "",                 // no LCode column in the schema; left blank
    sh: 0,                     // no S&H column; defaults to 0
    items: [
      { qty: o.qty, cat: o.catalog, desc: o.item_name, cost: o.unit_price },
    ],
  };

  const buf = await buildOrderFormBuffer(order);
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${orderFormFilename(order)}"`,
      "Cache-Control": "no-store",
    },
  });
}
