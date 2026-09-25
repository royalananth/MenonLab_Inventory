// Shared helpers for the WhatsApp agent endpoints.
// These sit beside the web app and use exactly the same tables and rules.
import { NextResponse } from "next/server";
import { q } from "./db.js";

export const digits = (s) => String(s || "").replace(/\D/g, "");
// Compare on the last 10 digits so +1 281-555-0134, 2815550134 and
// (281) 555-0134 all match the same member record.
export const last10 = (s) => digits(s).slice(-10);

export const bad = (msg, code) => NextResponse.json({ ok: false, error: msg }, { status: code || 400 });

// Every agent call must carry the shared secret.
export function checkSecret(req) {
  const secret = process.env.AGENT_SHARED_SECRET;
  if (!secret) return bad("AGENT_SHARED_SECRET is not set on the server.", 500);
  const got = req.headers.get("x-agent-secret") || "";
  if (got.length !== secret.length || got !== secret) return bad("Bad or missing agent secret.", 401);
  return null;
}

// The sender's WhatsApp number is the identity. No number on file, no access.
export async function memberByPhone(phone) {
  const key = last10(phone);
  if (key.length < 7) return null;
  const r = await q(`SELECT name, email, role, pd, whatsapp FROM members WHERE whatsapp IS NOT NULL AND whatsapp <> ''`);
  return r.rows.find((m) => last10(m.whatsapp) === key) || null;
}

export const shortName = (n) => (n || "").includes(",") ? n.split(",")[0].trim() : (n || "").split(" ")[0];
export const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Budget minus everything already approved, ordered or received against it.
export async function grantPosition(ref) {
  if (!ref) return null;
  const g = (await q(
    `SELECT id, name, budget FROM grants WHERE id = $1 OR lower(name) = lower($2) LIMIT 1`,
    [String(ref), String(ref)]
  )).rows[0];
  if (!g) return null;
  const s = (await q(
    `SELECT COALESCE(SUM(total), 0) AS spent FROM orders
      WHERE grant_id = $1 AND status IN ('approved', 'ordered', 'received')`,
    [g.id]
  )).rows[0];
  const p = (await q(
    `SELECT COALESCE(SUM(total), 0) AS pending FROM orders
      WHERE grant_id = $1 AND status IN ('requested', 'routed')`,
    [g.id]
  )).rows[0];
  const budget = Number(g.budget) || 0;
  const committed = Number(s.spent) || 0;
  const pending = Number(p.pending) || 0;
  return {
    grantId: g.id,
    grant: g.name,
    budget,
    committed,
    pending,
    remaining: budget - committed,
    spoken: g.name + " has " + money(budget - committed) + " remaining of " + money(budget) +
            (pending > 0 ? ", with " + money(pending) + " still awaiting approval" : ""),
  };
}

export const nid = (p) => (p || "n") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function notify(recipients, kind, title, body, orderId) {
  const uniq = [...new Set((recipients || []).filter(Boolean))];
  for (const r of uniq) {
    await q(
      `INSERT INTO notifications (id, recipient, kind, title, body, order_id, seen, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, now())`,
      [nid(), r, kind, title, body, orderId || null]
    );
  }
}
