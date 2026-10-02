// app/api/order-form/route.js
// GET /api/order-form?order_id=123  ->  downloads the filled UTMB Supply Order Form.
//
// Only Megan (purchasing / "place" capability) or an access owner can generate it,
// and only once an FRS has been entered on the order.
//
// TWO things to wire to your existing code, marked TODO:
//   1. how you read the session/actor from the request (same as /api/data)
//   2. a DB query that returns the order in the shape lib/orderForm expects

import { NextResponse } from "next/server";
import { buildOrderFormBuffer, orderFormFilename } from "@/lib/orderForm";
// import { getSession } from "@/lib/auth";   // TODO: use your real session helper
// import { pool } from "@/lib/db";            // TODO: use your real db handle

export const dynamic = "force-dynamic";

export async function GET(req) {
  // 1) ---- session / permission -------------------------------------------
  const session = await getSession(req);                 // TODO: match /api/data
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(session.caps?.place || session.owner)) {
    return NextResponse.json({ error: "Only Megan can generate the UTMB form" }, { status: 403 });
  }

  const orderId = new URL(req.url).searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  // 2) ---- load the order and build the form shape ------------------------
  //    Replace this block with your real query. It must return:
  //    { date, requestId, vendor, frs, project, requestor, lcode, sh, items:[{qty,cat,desc,cost}] }
  const order = await loadOrderForForm(orderId);          // TODO: implement below
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (!order.frs) {
    return NextResponse.json({ error: "Enter the FRS before generating the form" }, { status: 422 });
  }

  // 3) ---- generate and stream -------------------------------------------
  const buf = await buildOrderFormBuffer(order);
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${orderFormFilename(order)}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ---------------------------------------------------------------------------
// TODO: implement with your real schema. Example shape using a single-item
// order plus the grant it was approved on. Adjust column names to your tables.
async function loadOrderForForm(orderId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.frs, o.grant_name, o.vendor, o.placed_at, o.created_at,
            o.qty, o.cat_no, o.item_name, o.unit_cost, o.requester_name, o.lcode, o.sh
       FROM orders o
      WHERE o.id = $1`,
    [orderId]
  );
  const o = rows[0];
  if (!o) return null;
  return {
    date:      (o.placed_at || o.created_at || new Date()).toISOString().slice(0, 10),
    requestId: `ORD-${o.id}`,
    vendor:    o.vendor,
    frs:       o.frs,
    project:   o.grant_name,
    requestor: o.requester_name,
    lcode:     o.lcode,
    sh:        o.sh || 0,
    items:     [{ qty: o.qty, cat: o.cat_no, desc: o.item_name, cost: o.unit_cost }],
  };
}
