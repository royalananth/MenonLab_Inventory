// GET /api/agent/balance?grant=MPRINT
// Fund position for one grant, or all of them. Read-only.
import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../../lib/db.js";
import { checkSecret, memberByPhone, grantPosition } from "../../../../lib/agent.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const stop = checkSecret(req);
  if (stop) return stop;
  await ensureInit();

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone") || "";
  const ref = url.searchParams.get("grant") || "";

  // Balances are only read out to a member we recognise.
  const me = await memberByPhone(phone);
  if (!me) {
    return NextResponse.json({
      ok: false,
      known: false,
      spoken: "I don't recognise this number.",
    }, { status: 403 });
  }

  if (ref) {
    const pos = await grantPosition(ref);
    if (!pos) {
      return NextResponse.json({
        ok: false,
        spoken: "I couldn't find a grant called " + ref + ".",
      }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...pos });
  }

  const all = (await q(`SELECT id FROM grants ORDER BY name`)).rows;
  const grants = [];
  for (const g of all) {
    const pos = await grantPosition(g.id);
    if (pos) grants.push(pos);
  }
  return NextResponse.json({
    ok: true,
    grants,
    spoken: grants.length
      ? grants.map((g) => g.spoken).join(" ")
      : "No grants have been set up in the app yet.",
  });
}
