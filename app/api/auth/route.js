// Login, PIN setup, PIN change, admin PIN reset, logout.
import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../lib/db.js";
import { hashPin, verifyPin, pinProblem, createSession, sessionMember, tokenFrom, caps } from "../../../lib/auth.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (msg, code) => NextResponse.json({ ok: false, error: msg }, { status: code || 400 });

// ?names=1 -> the roster for the sign-in screen (names only, no lab data).
// otherwise -> who is signed in on this token.
export async function GET(req) {
  await ensureInit();
  const url = new URL(req.url);
  if (url.searchParams.get("names")) {
    const r = await q(`SELECT name, role, pd, (pin_hash IS NOT NULL) AS has_pin FROM members ORDER BY name`);
    return NextResponse.json({
      ok: true,
      members: r.rows.map((m) => ({ name: m.name, role: m.role, pd: m.pd, hasPin: m.has_pin })),
    });
  }
  const me = await sessionMember(req.headers.get("x-session") || url.searchParams.get("token") || "");
  if (!me) return NextResponse.json({ ok: true, signedIn: false });
  return NextResponse.json({ ok: true, signedIn: true, me, caps: caps(me) });
}

export async function POST(req) {
  await ensureInit();
  let body;
  try { body = await req.json(); } catch { return fail("Bad request."); }
  const { action } = body || {};

  // ---- who needs to set a PIN ----
  if (action === "status") {
    const r = await q(`SELECT name, pin_hash FROM members WHERE name = $1`, [body.name || ""]);
    if (!r.rows[0]) return fail("No such member.", 404);
    return NextResponse.json({ ok: true, needsSetup: !r.rows[0].pin_hash });
  }

  // ---- first-time PIN, or after an admin reset ----
  if (action === "setPin") {
    const r = await q(`SELECT name, pin_hash FROM members WHERE name = $1`, [body.name || ""]);
    const m = r.rows[0];
    if (!m) return fail("No such member.", 404);
    if (m.pin_hash) return fail("This account already has a PIN. Use Log in, or ask an admin to reset it.", 409);
    const problem = pinProblem(body.pin);
    if (problem) return fail(problem);
    await q(`UPDATE members SET pin_hash = $2 WHERE name = $1`, [m.name, hashPin(body.pin)]);
    const token = await createSession(m.name, body.shared);
    const me = await sessionMember(token);
    return NextResponse.json({ ok: true, token, me, caps: caps(me) });
  }

  // ---- normal login ----
  if (action === "login") {
    const r = await q(`SELECT name, pin_hash FROM members WHERE name = $1`, [body.name || ""]);
    const m = r.rows[0];
    if (!m) return fail("No such member.", 404);
    if (!m.pin_hash) return NextResponse.json({ ok: false, needsSetup: true, error: "Set a PIN first." }, { status: 409 });
    if (!verifyPin(body.pin, m.pin_hash)) return fail("Wrong PIN.", 401);
    const token = await createSession(m.name, body.shared);
    const me = await sessionMember(token);
    return NextResponse.json({ ok: true, token, me, caps: caps(me) });
  }

  // ---- change your own PIN ----
  if (action === "changePin") {
    const me = await sessionMember(tokenFrom(req, body));
    if (!me) return fail("Not signed in.", 401);
    const r = await q(`SELECT pin_hash FROM members WHERE name = $1`, [me.name]);
    if (!verifyPin(body.oldPin, r.rows[0] && r.rows[0].pin_hash)) return fail("Current PIN is wrong.", 401);
    const problem = pinProblem(body.newPin);
    if (problem) return fail(problem);
    await q(`UPDATE members SET pin_hash = $2 WHERE name = $1`, [me.name, hashPin(body.newPin)]);
    // Changing your PIN signs out every other device.
    await q(`DELETE FROM sessions WHERE member = $1 AND token <> $2`, [me.name, tokenFrom(req, body)]);
    return NextResponse.json({ ok: true });
  }

  // ---- an access owner clears someone's PIN so they can set a new one ----
  if (action === "resetPin") {
    const me = await sessionMember(tokenFrom(req, body));
    if (!me || !caps(me).access) return fail("Only an access owner can reset a PIN.", 403);
    const target = body.target || "";
    if (!target) return fail("Who?");
    await q(`UPDATE members SET pin_hash = NULL WHERE name = $1`, [target]);
    await q(`DELETE FROM sessions WHERE member = $1`, [target]);
    return NextResponse.json({ ok: true });
  }

  if (action === "logout") {
    await q(`DELETE FROM sessions WHERE token = $1`, [tokenFrom(req, body)]);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action.");
}
