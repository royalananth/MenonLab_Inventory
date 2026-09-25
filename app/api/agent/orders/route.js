// GET /api/agent/orders?phone=+12815550134
// What is waiting for this person to approve. Called by the WhatsApp agent
// before it says anything, so it never reads out an order that is already done.
import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../../lib/db.js";
import { checkSecret, memberByPhone, grantPosition, money, shortName, bad } from "../../../../lib/agent.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const stop = checkSecret(req);
  if (stop) return stop;
  await ensureInit();

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone") || "";
  const orderId = url.searchParams.get("orderId") || "";

  const me = await memberByPhone(phone);
  if (!me) {
    return NextResponse.json({
      ok: false,
      known: false,
      spoken: "I don't recognise this number. Ask the lab to add it to your member record before approving anything.",
    }, { status: 403 });
  }

  const rows = orderId
    ? (await q(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows
    : (await q(
        `SELECT * FROM orders WHERE status IN ('requested','routed') AND approver = $1 ORDER BY created_at ASC LIMIT 20`,
        [me.name]
      )).rows;

  const orders = [];
  for (const o of rows) {
    const pos = o.grant_id ? await grantPosition(o.grant_id) : null;
    orders.push({
      orderId: o.id,
      item: o.item_name,
      catalog: o.catalog || "",
      vendor: o.vendor || "",
      qty: o.qty || "",
      total: Number(o.total) || 0,
      totalSpoken: money(o.total),
      grant: o.grant_name || "",
      grantId: o.grant_id || "",
      grantRemaining: pos ? pos.remaining : null,
      project: o.project || "",
      requester: o.requester || "",
      requesterShort: shortName(o.requester),
      status: o.status,
      yoursToApprove: (o.status === "requested" || o.status === "routed") && o.approver === me.name,
      createdAt: o.created_at,
      spoken: shortName(o.requester) + " has requested " + o.item_name +
              (o.qty ? ", quantity " + o.qty : "") + ", " + money(o.total) +
              (o.grant_name ? ", against " + o.grant_name : "") +
              (pos ? ". That grant has " + money(pos.remaining) + " remaining." : "."),
    });
  }

  return NextResponse.json({
    ok: true,
    known: true,
    member: { name: me.name, short: shortName(me.name), role: me.role },
    count: orders.length,
    orders,
    spoken: orders.length === 0
      ? "Nothing is waiting for your approval right now."
      : "You have " + orders.length + " order" + (orders.length === 1 ? "" : "s") + " waiting.",
  });
}
