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
import { chairThreshold, logEvent } from "../../../../lib/agent-events.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  const stop = checkSecret(req);
  if (stop) return stop;
  await ensureInit();

  let body;
  try { body = await req.json(); } catch { return bad("Body must be JSON."); }
  let { phone, orderId, decision, frs, reason, transcript } = body || {};

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

  const atPd = o.status === "requested" || o.status === "routed";
  const atChair = o.status === "pd_ok";

  // Already dealt with. Say what happened rather than writing again.
  if (!atPd && !atChair) {
    return NextResponse.json({
      ok: false,
      alreadyHandled: true,
      status: o.status,
      spoken: "That order is already " + o.status + ", so there is nothing to approve.",
    }, { status: 409 });
  }

  const isNamedApprover = o.approver && o.approver === me.name;
  const isChair = me.role === "chair";
  // Stage one belongs to the named PD (the chair may step in). Stage two is the
  // chair's alone — a PD cannot clear their own order past the limit.
  if (atPd && !isNamedApprover && !isChair) {
    return NextResponse.json({
      ok: false,
      spoken: "This one went to " + shortName(o.approver) + " for approval, so I can't record a decision from you.",
    }, { status: 403 });
  }
  if (atChair && !isChair) {
    return NextResponse.json({
      ok: false,
      spoken: "That order is over the approval limit and is waiting on Dr. Menon, so I can't record it from you.",
    }, { status: 403 });
  }

  const via = "whatsapp";
  const note = String(transcript || "").slice(0, 500);

  if (decision === "reject") {
    await q(
      `UPDATE orders SET status = 'rejected', reject_reason = $2, approved_via = $3, approval_transcript = $4
        WHERE id = $1 AND status IN ('requested','routed','pd_ok')`,
      [orderId, reason || "", via, note]
    );
    await logEvent(orderId, "sent_back", me.name, "Sent back over WhatsApp" + (reason ? ": " + reason : ""), o, "whatsapp");
    await notify([o.requester], "status", "Request sent back",
      shortName(me.name) + " sent back your request for " + o.item_name + (reason ? ": " + reason : "") + " (via WhatsApp).", orderId);
    return NextResponse.json({
      ok: true,
      decision: "reject",
      orderId,
      spoken: "Sent back. " + shortName(o.requester) + " has been told.",
    });
  }

  const frsIn = frs || (atChair ? o.pd_frs : "");
  if (!frsIn || !String(frsIn).trim()) {
    return NextResponse.json({
      ok: false,
      needsFrs: true,
      spoken: "Which FRS should this be charged to?",
    }, { status: 422 });
  }
  frs = frsIn;

  // The PI names the grant as well as the FRS; the requester never did.
  const grantRef = body.grant || body.grantId || o.grant_id || o.pd_grant_id;
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

  const amount = Number(o.total) || 0;
  const frsClean = String(frs).trim();

  if (atPd) {
    // Over the limit it goes on to Dr. Menon rather than to purchasing.
    const limit = await chairThreshold();
    const needsChair = amount >= limit;
    await q(
      `UPDATE orders SET status = $2, pd_approver = $3, pd_approved_at = now(),
              pd_frs = $4, pd_grant_id = $5, pd_grant_name = $6,
              frs = $4, grant_id = $5, grant_name = $6, fund_note = $7,
              needs_chair = $8, approved_via = $9, approval_transcript = $10,
              pi_approver = CASE WHEN $8 THEN NULL ELSE $3 END,
              pi_approved_at = CASE WHEN $8 THEN NULL ELSE now() END
        WHERE id = $1 AND status IN ('requested','routed')`,
      [orderId, needsChair ? "pd_ok" : "approved", me.name, frsClean,
        pos ? pos.grantId : "", pos ? pos.grant : "", fundNote, needsChair, via, note]
    );
    const after0 = (await q(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    await logEvent(orderId, "pd_approved", me.name,
      `PD approval over WhatsApp · ${money(amount)} · ${pos ? pos.grant : "no grant"} · FRS ${frsClean}` +
      (needsChair ? ` — over the ${money(limit)} limit, sent to the chair` : " — under the limit, straight to purchasing"), after0, "whatsapp");
    if (needsChair) {
      const chairs = (await q(`SELECT name FROM members WHERE role = 'chair'`)).rows.map((r) => r.name);
      await notify(chairs, "approval", "Chair approval needed",
        `${shortName(me.name)} approved ${o.item_name} (${money(amount)}) over WhatsApp — over the ${money(limit)} limit, needs your sign-off.`, orderId);
      await notify([o.requester], "status", "PD approved",
        `${shortName(me.name)} approved your request for ${o.item_name}. It now needs the chair's sign-off.`, orderId);
      const afterG = pos ? await grantPosition(pos.grantId) : null;
      return NextResponse.json({
        ok: true, decision: "approve", stage: "pd", sentToChair: true, orderId,
        item: o.item_name, total: amount, frs: frsClean,
        spoken: `Approved. At ${money(amount)} it's over the ${money(limit)} limit, so it's gone to Dr. Menon for final sign-off.` +
          (afterG ? ` ${afterG.grant} would be ${money(afterG.remaining)} after this.` : ""),
      });
    }
  } else {
    // Chair stage. Keep the PD's fund unless the chair named a different one.
    await q(
      `UPDATE orders SET status = 'approved', pi_approver = $2, pi_approved_at = now(),
              frs = $3, fund_note = $4, approved_via = $5, approval_transcript = $6,
              grant_id = COALESCE($7, grant_id), grant_name = COALESCE($8, grant_name)
        WHERE id = $1 AND status = 'pd_ok'`,
      [orderId, me.name, frsClean, fundNote, via, note, pos ? pos.grantId : null, pos ? pos.grant : null]
    );
    const after0 = (await q(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    await logEvent(orderId, "chair_approved", me.name,
      `Final approval over WhatsApp · ${money(amount)} · ${pos ? pos.grant : o.grant_name || "no grant"} · FRS ${frsClean}`, after0, "whatsapp");
  }

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
