// Per-person PIN login.
//
// Before v7 the app trusted whatever name the browser sent, so anyone could
// act as anyone. Now the browser sends a session token, the server looks up
// who that token belongs to, and the name in the request body is ignored.
import crypto from "crypto";
import { q } from "./db.js";

const SCRYPT_N = 16384;

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(pin), salt, 32, { N: SCRYPT_N }).toString("hex");
  return salt + "$" + h;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes("$")) return false;
  const [salt, h] = stored.split("$");
  let got;
  try {
    got = crypto.scryptSync(String(pin), salt, 32, { N: SCRYPT_N }).toString("hex");
  } catch {
    return false;
  }
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// A PIN is 4-6 digits. Reject the handful that are effectively "no PIN at all".
const WEAK = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "123456", "654321", "000000", "111111", "12345"]);
export function pinProblem(pin) {
  const p = String(pin || "");
  if (!/^\d{4,6}$/.test(p)) return "PIN must be 4 to 6 digits.";
  if (WEAK.has(p)) return "That PIN is too easy to guess. Pick another.";
  return null;
}

export const newToken = () => crypto.randomBytes(24).toString("hex");

export async function createSession(name, shared) {
  const token = newToken();
  await q(
    `INSERT INTO sessions (token, member, shared, created_at, last_seen) VALUES ($1, $2, $3, now(), now())`,
    [token, name, !!shared]
  );
  // Keep the table from growing forever.
  await q(`DELETE FROM sessions WHERE last_seen < now() - interval '60 days'`);
  return token;
}

// Shared lab computers time out after 15 minutes idle. A person's own device
// stays signed in until they press Log out, which is what Ananth asked for.
const SHARED_IDLE_MIN = 15;

export async function sessionMember(token) {
  if (!token) return null;
  const r = await q(
    `SELECT s.token, s.member, s.shared, s.last_seen, m.role, m.pd, m.email, m.owner
       FROM sessions s JOIN members m ON m.name = s.member
      WHERE s.token = $1`,
    [token]
  );
  const s = r.rows[0];
  if (!s) return null;
  if (s.shared) {
    const idleMin = (Date.now() - new Date(s.last_seen).getTime()) / 60000;
    if (idleMin > SHARED_IDLE_MIN) {
      await q(`DELETE FROM sessions WHERE token = $1`, [token]);
      return null;
    }
  }
  await q(`UPDATE sessions SET last_seen = now() WHERE token = $1`, [token]);
  return { name: s.member, role: s.role, pd: s.pd, email: s.email, shared: s.shared, owner: !!s.owner };
}

export function tokenFrom(req, body) {
  return req.headers.get("x-session") || (body && body.token) || "";
}

// Capability rules, in one place, used by the server and mirrored in the UI.
export const caps = (m) => {
  if (!m) return { approve: false, place: false, grants: false, edit: false, access: false, owner: false, book: false, request: false, view: false, guest: true };
  const chair = m.role === "chair";
  const pd = !!m.pd;
  const full = m.role === "admin";
  const purchasing = m.role === "purchasing";
  const guest = m.role === "guest";
  const owner = !!m.owner;
  return {
    // Everyone signed in gets the basics. Guests are outside collaborators who
    // only ever needed instrument time.
    view: true,                                // see the inventory
    book: true,                                // reserve instruments
    request: !guest,                           // raise an order request
    log: !guest,                               // log usage

    approve: (chair || pd) && !guest,          // approve and assign funding
    place: (full || purchasing) && !guest,     // place POs and receive
    grants: (chair || pd) && !guest,           // set budgets
    edit: (full || chair) && !guest,           // edit inventory, instruments

    // Who may hand out access. Owners only — not every admin.
    access: owner,
    owner,
    guest,
  };
};
