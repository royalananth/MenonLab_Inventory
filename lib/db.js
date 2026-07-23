import pg from "pg";
import { SEED_MEMBERS, SEED_CATS, SEED_PROJECTS, SEED_ITEMS } from "./seed.js";

const { Pool } = pg;
let pool;
function getPool() {
  if (!pool) {
    const cs = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
    if (!cs) throw new Error("No database connection string. Set POSTGRES_URL (Vercel Postgres) or DATABASE_URL.");
    const local = cs.includes("localhost") || cs.includes("127.0.0.1");
    pool = new Pool({ connectionString: cs, ssl: local ? false : { rejectUnauthorized: false }, max: 3 });
  }
  return pool;
}
export async function q(text, params) {
  return getPool().query(text, params);
}

let initPromise;
export function ensureInit() { if (!initPromise) initPromise = doInit(); return initPromise; }

async function doInit() {
  await q(`CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v text)`);
  await q(`CREATE TABLE IF NOT EXISTS members (name text PRIMARY KEY, email text, role text, pd boolean)`);
  await q(`CREATE TABLE IF NOT EXISTS categories (name text PRIMARY KEY, ord int)`);
  await q(`CREATE TABLE IF NOT EXISTS projects (id text PRIMARY KEY, name text, leader text)`);
  await q(`CREATE TABLE IF NOT EXISTS items (
    id text PRIMARY KEY, name text, category text, scope text, project text, leader text,
    room text, fridge text, box text, catalog text, vendor text, qty text, unit text, notes text)`);
  await q(`CREATE TABLE IF NOT EXISTS usage_log (
    id text PRIMARY KEY, member text, item_id text, item_name text, category text, qty text, unit text,
    project text, experiment text, room text, fridge text, box text, notes text, ts timestamptz)`);
  const seeded = await q(`SELECT v FROM meta WHERE k='seeded'`);
  if (seeded.rows.length === 0) {
    await seedAll();
    await q(`INSERT INTO meta (k, v) VALUES ('seeded', '1') ON CONFLICT (k) DO NOTHING`);
  }

  // ---- ordering / purchasing module ----
  await q(`CREATE TABLE IF NOT EXISTS grants (id text PRIMARY KEY, name text, budget numeric DEFAULT 0, notes text)`);
  await q(`CREATE TABLE IF NOT EXISTS orders (
    id text PRIMARY KEY, item_name text, catalog text, vendor text, qty text, unit_price numeric DEFAULT 0, total numeric DEFAULT 0,
    project text, grant_id text, grant_name text, experiment text, notes text, requester text,
    status text, dup_ack boolean DEFAULT false,
    authorizer text, authorized_at timestamptz, approver text, pi_approver text, pi_approved_at timestamptz,
    purchaser text, po text, ordered_at timestamptz, received_at timestamptz, reject_reason text, created_at timestamptz)`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS approver text`);

  const seed2 = await q(`SELECT v FROM meta WHERE k='seed2'`);
  if (seed2.rows.length === 0) {
    await q(`INSERT INTO members (name,email,role,pd) VALUES ('Menon, Ramkumar','','chair',false) ON CONFLICT (name) DO NOTHING`);
    await q(`INSERT INTO meta (k, v) VALUES ('seed2', '1') ON CONFLICT (k) DO NOTHING`);
  }
  // migration: chair rename + drop the two example grants
  const seed4 = await q(`SELECT v FROM meta WHERE k='seed4'`);
  if (seed4.rows.length === 0) {
    await q(`UPDATE members SET role='chair' WHERE name='Menon, Ramkumar'`);
    await q(`DELETE FROM members WHERE name='Megan'`);
    await q(`DELETE FROM grants WHERE name IN ('R01HD114744','U2CTR004868') AND budget=0`);
    await q(`INSERT INTO meta (k, v) VALUES ('seed4', '1') ON CONFLICT (k) DO NOTHING`);
  }

  // ---- checklist + notifications ----
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS checklist text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS explored text`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY, recipient text, kind text, title text, body text, order_id text, seen boolean DEFAULT false, created_at timestamptz)`);
  await q(`CREATE INDEX IF NOT EXISTS notif_recipient_idx ON notifications (recipient, seen)`);

  // ---- instrument booking module ----
  await q(`CREATE TABLE IF NOT EXISTS instruments (id text PRIMARY KEY, name text, ord int, active boolean DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS bookings (id text PRIMARY KEY, instrument_id text, instrument_name text, member text, day text, start_min int, end_min int, purpose text, created_at timestamptz)`);
  const seed3 = await q(`SELECT v FROM meta WHERE k='seed3'`);
  if (seed3.rows.length === 0) {
    const instr = ["Ultracentrifuge New", "Ultracentrifuge -2", "Flow cytometer", "Confocal Cytation", "Keyence microscope", "Hoods"];
    let io = 0;
    for (const n of instr) await q(`INSERT INTO instruments (id,name,ord,active) VALUES ($1,$2,$3,true) ON CONFLICT (id) DO NOTHING`, ["ins" + Math.random().toString(36).slice(2, 8), n, io++]);
    await q(`INSERT INTO meta (k, v) VALUES ('seed3', '1') ON CONFLICT (k) DO NOTHING`);
  }
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

async function seedAll() {
  // members
  for (const m of SEED_MEMBERS) {
    await q(`INSERT INTO members (name,email,role,pd) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO NOTHING`, [m.n, m.e, m.r, m.pd]);
  }
  // categories
  let ord = 0;
  for (const c of SEED_CATS) {
    await q(`INSERT INTO categories (name,ord) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, [c, ord++]);
  }
  // projects
  for (const p of SEED_PROJECTS) {
    await q(`INSERT INTO projects (id,name,leader) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      ["p" + Math.random().toString(36).slice(2, 8), p.name, p.leader]);
  }
  // items (chunked multi-row insert)
  const cols = 14;
  let idx = 0;
  const rows = SEED_ITEMS.map((a) => {
    // a = [name,category,scope(0/1),project,room,fridge,box,catalog,vendor,qty,unit,notes,leader]
    return ["i" + (idx++), a[0], a[1], a[2] ? "Project" : "General", a[3] || "", a[12] || "",
      a[4] || "", a[5] || "", a[6] || "", a[7] || "", a[8] || "", (a[9] ?? "") + "", a[10] || "", a[11] || ""];
  });
  for (const grp of chunk(rows, 400)) {
    const values = [];
    const params = [];
    grp.forEach((r, i) => {
      const base = i * cols;
      values.push(`(${Array.from({ length: cols }, (_, j) => "$" + (base + j + 1)).join(",")})`);
      params.push(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13]);
    });
    await q(`INSERT INTO items (id,name,category,scope,project,leader,room,fridge,box,catalog,vendor,qty,unit,notes)
             VALUES ${values.join(",")} ON CONFLICT (id) DO NOTHING`, params);
  }
}
