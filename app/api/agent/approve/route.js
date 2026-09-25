// POST /api/agent/approve
// The only endpoint that writes. Records a PI approval or a send-back that
// came in over WhatsApp, using the same status flow as the web app.
//
// body: {
//   phone:      "+12815550134"      the sender's WhatsApp number
//   orderId:    "o12ab"
//   decision:   "approve" | "reject"
//   frs:        "123456"            required on approve
//   reason:     "buy the 50ug size" optional, on reject
//   transcript: "approve it, MPRINT"   what the person actually said or typed
// }
import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../../lib/db.js";
import { checkSecret, memberByPhone, grantPosition, notify, shortName, money, bad } from "../../../../lib/agent.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const stop = checkSecret(req);
  if (stop) return stop;
  await ensureInit();

  let body;
  try { body = await req.json(); } catch { return bad("Body must be JSON."); }
  const { phone, orderId, decision, frs, reason, transcript } = body || {};

  if (!orderId) return bad("orderId is required.");
  if (decision !== "approve" && decision !== "reject") {
    return bad("decision must be 'approve' or 'reject'.");
  }

  const me = await memberByPhone(phone);
  if (!me) {
    return NextResponse.json({
      ok: false,
      spoken: "I don't recognise this number, so I can't record an approval from it.",
    }, { status: 403 });
  }

  const o = (await q(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
  if (!o) return NextResponse.json({ ok: false, spoken: "I can't find that order." }, { status: 404 });

  // Already dealt with. Say what happened rather than writing again.
  if (o.status !== "requested" && o.status !== "routed") {
    return NextResponse.json({
      ok: false,
      alreadyHandled: true,
      status: o.status,
      spoken: "That order is already " + o.status + ", so there is nothing to approve.",
    }, { status: 409 });
  }

  // The named approver decides. The chair can always step in; nobody else can.
  const isNamedApprover = o.approver && o.approver === me.name;
  const isChair = me.role === "chair";
  if (!isNamedApprover && !isChair) {
    return NextResponse.json({
      ok: false,
      spoken: "This order was routed to " + shortName(o.approver) + " for approval, so I can't record a decision from you.",
    }, { status: 403 });
  }

  const via = "whatsapp";
  const note = String(transcript || "").slice(0, 500);

  if (decision === "reject") {
    await q(
      `UPDATE orders SET status = 'rejected', reject_reason = $2, approved_via = $3, approval_transcript = $4
        WHERE id = $1 AND status IN ('requested','routed')`,
      [orderId, reason || "", via, note]
    );
    await notify([o.requester], "status", "Request sent back",
      shortName(me.name) + " sent back your request for " + o.item_name + (reason ? ": " + reason : "") + " (via WhatsApp).", orderId);
    return NextResponse.json({
      ok: true,
      decision: "reject",
      orderId,
      spoken: "Sent back. " + shortName(o.requester) + " has been told.",
    });
  }

  if (!frs || !String(frs).trim()) {
    return NextResponse.json({
      ok: false,
      needsFrs: true,
      spoken: "Which FRS should this be charged to?",
    }, { status: 422 });
  }

  // The PI names the grant as well as the FRS; the requester never did.
  const grantRef = body.grant || body.grantId || o.grant_id;
  const pos = grantRef ? await grantPosition(grantRef) : null;
  if (grantRef && !pos) {
    return NextResponse.json({
      ok: false,
      unknownGrant: true,
      spoken: "I couldn't find a grant called " + grantRef + ". Which fund should this go against?",
    }, { status: 422 });
  }
  const fundNote = pos
    ? pos.grant + ": " + money(pos.remaining) + " remaining at time of approval"
    : "";

  await q(
    `UPDATE orders SET status = 'approved', pi_approver = $2, pi_approved_at = now(),
            frs = $3, fund_note = $4, approved_via = $5, approval_transcript = $6,
            grant_id = COALESCE($7, grant_id), grant_name = COALESCE($8, grant_name)
      WHERE id = $1 AND status IN ('requested','routed')`,
    [orderId, me.name, String(frs).trim(), fundNote, via, note, pos ? pos.grantId : null, pos ? pos.grant : null]
  );

  const purchasing = (await q(`SELECT name FROM members WHERE role IN ('purchasing', 'admin')`)).rows.map((r) => r.name);
  await notify(purchasing, "order", "Approved — ready to order",
    o.item_name + " was approved by " + shortName(me.name) + " (FRS " + String(frs).trim() + ", via WhatsApp). Ready to place.", orderId);
  await notify([o.requester], "status", "Request approved",
    shortName(me.name) + " approved your request for " + o.item_name + ".", orderId);

  const after = pos ? await grantPosition(pos.grantId) : null;

  return NextResponse.json({
    ok: true,
    decision: "approve",
    orderId,
    item: o.item_name,
    total: Number(o.total) || 0,
    frs: String(frs).trim(),
    approvedBy: me.name,
    grantRemaining: after ? after.remaining : null,
    spoken: "Approved. It's with purchasing for the PO." +
            (after ? " " + after.grant + " is now " + money(after.remaining) + "." : ""),
  });
}
