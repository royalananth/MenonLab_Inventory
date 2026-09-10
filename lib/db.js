import pg from "pg";
import { SEED_MEMBERS, SEED_CATS, SEED_PROJECTS, SEED_ITEMS, SEED_INSTRUMENTS, SEED_MEDIA_PAR } from "./seed.js";

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

// Columns added in v5. Added idempotently so an existing deployment upgrades in place.
const ITEM_COLS = [
  ["lot_no", "text"], ["assay_group", "text"], ["host_species", "text"], ["clonality", "text"],
  ["clone_no", "text"], ["isotype", "text"], ["reactivity", "text"], ["applications", "text"],
  ["owner", "text"], ["received_date", "text"], ["min_qty", "text"],
];
async function addCols(table, cols) {
  for (const [name, type] of cols) await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type}`);
}

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
    await addCols("items", ITEM_COLS);
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

  // ============================================================
  // v5 — consolidated inventory from the lab's 11 spreadsheets,
  //      antibody detail, par levels, FRS on orders, media par table.
  // ============================================================
  await addCols("items", ITEM_COLS);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS frs text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fund_note text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS from_item_id text`);
  await q(`CREATE TABLE IF NOT EXISTS media_par (
    id text PRIMARY KEY, cell_type text, name text, vendor text, catalog text, target_qty text, per_stock text)`);
  await q(`CREATE INDEX IF NOT EXISTS items_name_idx ON items (lower(name))`);
  await q(`CREATE INDEX IF NOT EXISTS items_catalog_idx ON items (lower(catalog))`);
  await q(`CREATE INDEX IF NOT EXISTS usage_ts_idx ON usage_log (ts DESC)`);

  const seed5 = await q(`SELECT v FROM meta WHERE k='seed5'`);
  if (seed5.rows.length === 0) {
    // Replace the item list wholesale with the consolidated, de-duplicated,
    // unit-normalised set built from the lab's source spreadsheets.
    // usage_log, orders, bookings, notifications, members and grants are untouched.
    await q(`DELETE FROM items`);
    await seedItems();
    await seedCatsProjects();

    for (const n of SEED_INSTRUMENTS) {
      const exists = await q(`SELECT 1 FROM instruments WHERE lower(name)=lower($1)`, [n]);
      if (exists.rows.length === 0) {
        await q(`INSERT INTO instruments (id,name,ord,active) VALUES ($1,$2,COALESCE((SELECT MAX(ord)+1 FROM instruments),0),true)`,
          ["ins" + Math.random().toString(36).slice(2, 8), n]);
      } else {
        await q(`UPDATE instruments SET active=true WHERE lower(name)=lower($1)`, [n]);
      }
    }

    await q(`DELETE FROM media_par`);
    for (const p of SEED_MEDIA_PAR) {
      await q(`INSERT INTO media_par (id,cell_type,name,vendor,catalog,target_qty,per_stock) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        ["mp" + Math.random().toString(36).slice(2, 8), p.cell || "", p.name || "", p.vendor || "", p.cat || "", p.qty || "", p.per || ""]);
    }

    await q(`INSERT INTO meta (k, v) VALUES ('seed5', '1') ON CONFLICT (k) DO NOTHING`);
  }
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

// SEED_ITEMS row =
// [0 name, 1 category, 2 scope, 3 project, 4 room, 5 fridge, 6 box, 7 catalog, 8 vendor,
//  9 qty, 10 unit, 11 notes, 12 leader, 13 lot, 14 assayGroup, 15 host, 16 clonality,
//  17 clone, 18 isotype, 19 reactivity, 20 applications, 21 owner, 22 received, 23 minQty]
const ITEM_INSERT_COLS = ["id", "name", "category", "scope", "project", "leader", "room", "fridge", "box",
  "catalog", "vendor", "qty", "unit", "notes", "lot_no", "assay_group", "host_species", "clonality",
  "clone_no", "isotype", "reactivity", "applications", "owner", "received_date", "min_qty"];

async function seedItems() {
  const cols = ITEM_INSERT_COLS.length;
  let idx = 0;
  const rows = SEED_ITEMS.map((a) => ["i" + (idx++), a[0], a[1], a[2] ? "Project" : "General", a[3] || "", a[12] || "",
    a[4] || "", a[5] || "", a[6] || "", a[7] || "", a[8] || "", (a[9] ?? "") + "", a[10] || "", a[11] || "",
    a[13] || "", a[14] || "", a[15] || "", a[16] || "", a[17] || "", a[18] || "", a[19] || "", a[20] || "",
    a[21] || "", a[22] || "", (a[23] ?? "") + ""]);
  for (const grp of chunk(rows, 300)) {
    const values = [];
    const params = [];
    grp.forEach((r, i) => {
      const base = i * cols;
      values.push(`(${Array.from({ length: cols }, (_, j) => "$" + (base + j + 1)).join(",")})`);
      params.push(...r);
    });
    await q(`INSERT INTO items (${ITEM_INSERT_COLS.join(",")})
             VALUES ${values.join(",")} ON CONFLICT (id) DO NOTHING`, params);
  }
}

async function seedCatsProjects() {
  let ord = 0;
  for (const c of SEED_CATS) {
    await q(`INSERT INTO categories (name,ord) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING`, [c, ord++]);
  }
  for (const p of SEED_PROJECTS) {
    const exists = await q(`SELECT 1 FROM projects WHERE lower(name)=lower($1)`, [p.name]);
    if (exists.rows.length === 0) {
      await q(`INSERT INTO projects (id,name,leader) VALUES ($1,$2,$3)`,
        ["p" + Math.random().toString(36).slice(2, 8), p.name, p.leader || ""]);
    }
  }
}

async function seedAll() {
  for (const m of SEED_MEMBERS) {
    await q(`INSERT INTO members (name,email,role,pd) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO NOTHING`, [m.n, m.e, m.r, m.pd]);
  }
  await seedCatsProjects();
  await seedItems();
}
