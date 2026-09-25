import pg from "pg";
import { SEED_MEMBERS, SEED_CATS, SEED_PROJECTS, SEED_ITEMS, SEED_INSTRUMENTS, SEED_MEDIA_PAR } from "./seed.js";
import { SEED_F14 } from "./seed_f14.js";

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

  // ---- v6: WhatsApp approvals ----
  // members.whatsapp is the identity used by the agent endpoints.
  // approved_via / approval_transcript are the audit trail for anything
  // approved outside the web app.
  await q(`ALTER TABLE members ADD COLUMN IF NOT EXISTS whatsapp text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_via text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS approval_transcript text`);

  // ============================================================
  // v7 — real logins, PI-assigned funding, instrument super users
  // ============================================================

  // ---- logins ----
  await q(`ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_hash text`);
  await q(`CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY, member text, shared boolean DEFAULT false,
    created_at timestamptz, last_seen timestamptz)`);
  await q(`CREATE INDEX IF NOT EXISTS sessions_member_idx ON sessions (member)`);

  // ---- instrument super users and access ----
  await q(`ALTER TABLE instruments ADD COLUMN IF NOT EXISTS super_user text`);
  await q(`ALTER TABLE instruments ADD COLUMN IF NOT EXISTS restricted boolean DEFAULT false`);
  await q(`ALTER TABLE instruments ADD COLUMN IF NOT EXISTS notes text`);
  await q(`CREATE TABLE IF NOT EXISTS instrument_access (
    id text PRIMARY KEY, instrument_id text, instrument_name text, member text,
    status text, note text, requested_at timestamptz, decided_at timestamptz, decided_by text)`);
  await q(`CREATE INDEX IF NOT EXISTS instr_access_idx ON instrument_access (instrument_id, member)`);

  // ---- ordering: the Rheanna handoff is gone ----
  // Anything sitting in the old 'routed' state goes back to 'requested' with its
  // approver intact, so it appears in that PI's queue under the new flow.
  const seed7 = await q(`SELECT v FROM meta WHERE k='seed7'`);
  if (seed7.rows.length === 0) {
    await q(`UPDATE orders SET status = 'requested' WHERE status = 'routed'`);
    await q(`INSERT INTO meta (k, v) VALUES ('seed7', '1') ON CONFLICT (k) DO NOTHING`);
  }

  // ---- who may hand out access ----
  // Role changes, roster edits and PIN resets belong to owners only. Ananth is
  // seeded as the first one and can nominate others.
  await q(`ALTER TABLE members ADD COLUMN IF NOT EXISTS owner boolean DEFAULT false`);
  const ownerSeed = await q(`SELECT v FROM meta WHERE k='seed8_owner'`);
  if (ownerSeed.rows.length === 0) {
    await q(`UPDATE members SET owner = true WHERE name = 'Kammala, Ananth Kumar'`);
    // If that record is ever renamed, fall back to the chair so the lab is
    // never left with nobody able to manage access.
    const any = await q(`SELECT 1 FROM members WHERE owner = true`);
    if (any.rows.length === 0) await q(`UPDATE members SET owner = true WHERE role = 'chair'`);
    await q(`INSERT INTO meta (k, v) VALUES ('seed8_owner', '1') ON CONFLICT (k) DO NOTHING`);
  }

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

  // NOTE: this must stay AFTER seed5. That block deletes and reloads the whole
  // items table, so anything applied before it is thrown away.
  // ---- vials and aliquots are different things ----
  await q(`ALTER TABLE items ADD COLUMN IF NOT EXISTS aliquots text`);

  // ============================================================
  // v9 — two-stage approval and a full audit trail
  // Requester -> PD -> (Dr. Menon, above a threshold) -> Megan
  // ============================================================

  // What the PD proposed, kept separate from what the chair finally confirmed,
  // so both decisions are on the record rather than one overwriting the other.
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pd_approver text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pd_approved_at timestamptz`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pd_frs text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pd_grant_id text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS pd_grant_name text`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_chair boolean DEFAULT false`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS placed_via text`);

  // Every transition, with who did it and what it cost. This is the
  // accountability record — nothing here is ever edited or deleted.
  await q(`CREATE TABLE IF NOT EXISTS order_events (
    id text PRIMARY KEY, order_id text, event text, actor text, at timestamptz,
    detail text, amount numeric, grant_name text, frs text, via text)`);
  await q(`CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, at)`);
  await q(`CREATE INDEX IF NOT EXISTS order_events_at_idx ON order_events (at DESC)`);

  // The dollar line above which Dr. Menon's approval is required. Owner-settable.
  await q(`INSERT INTO meta (k, v) VALUES ('chair_threshold', '1000') ON CONFLICT (k) DO NOTHING`);

  // Orders already approved under the old single-step chain keep their history:
  // backfill the PD columns from what was recorded, and seed one event each so
  // the trail is not empty for them.
  const seed9 = await q(`SELECT v FROM meta WHERE k='seed9'`);
  if (seed9.rows.length === 0) {
    await q(`UPDATE orders SET pd_approver = pi_approver, pd_approved_at = pi_approved_at,
                    pd_frs = frs, pd_grant_id = grant_id, pd_grant_name = grant_name
              WHERE pi_approver IS NOT NULL AND pd_approver IS NULL`);
    await q(`INSERT INTO order_events (id, order_id, event, actor, at, detail, amount, grant_name, frs, via)
             SELECT 'ev' || substr(md5(random()::text || id), 1, 10), id, 'requested', requester, created_at,
                    'Carried over from before the audit trail existed', total, grant_name, frs, 'app'
               FROM orders WHERE created_at IS NOT NULL`);
    await q(`INSERT INTO order_events (id, order_id, event, actor, at, detail, amount, grant_name, frs, via)
             SELECT 'ev' || substr(md5(random()::text || id || 'a'), 1, 10), id, 'approved', pi_approver, pi_approved_at,
                    'Carried over — single-step approval', total, grant_name, frs, COALESCE(approved_via, 'app')
               FROM orders WHERE pi_approver IS NOT NULL AND pi_approved_at IS NOT NULL`);
    await q(`INSERT INTO meta (k, v) VALUES ('seed9', '1') ON CONFLICT (k) DO NOTHING`);
  }

  // ---- Freezer 14 antibody count, 2026 ----
  // A correction pass, not a reload. Matches on catalog number first, then on
  // name + vendor, and inserts only a row that matches nothing. No deletes.
  const seed8 = await q(`SELECT v FROM meta WHERE k='seed8_f14'`);
  if (seed8.rows.length === 0) {
    let updated = 0, inserted = 0;
    for (const r of SEED_F14) {
      const [cat, name, vendor, animal, clonality, clone, isotype, react, uses, box, storage, vials, aliq, date, notes] = r;
      let hit = null;
      if (cat) {
        hit = (await q(
          `SELECT id FROM items WHERE lower(regexp_replace(catalog, '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace($1, '[^A-Za-z0-9]', '', 'g')) LIMIT 1`,
          [cat]
        )).rows[0];
      }
      if (!hit) {
        hit = (await q(`SELECT id FROM items WHERE lower(name) = lower($1) AND lower(vendor) = lower($2) LIMIT 1`, [name, vendor])).rows[0];
      }
      // The lab counts these in vials; aliquots are tracked alongside, not summed.
      const qty = String(vials);
      const unit = "vial";
      if (hit) {
        // Overwrite the count and location from the sheet; fill detail only
        // where the app has none, so nobody's later edit is thrown away.
        await q(
          `UPDATE items SET
             qty = $2, unit = $3, aliquots = $4,
             box = CASE WHEN $5 <> '' THEN $5 ELSE box END,
             fridge = CASE WHEN $6 <> '' THEN $6 ELSE fridge END,
             host_species  = CASE WHEN COALESCE(host_species,'')  = '' THEN $7  ELSE host_species  END,
             clonality     = CASE WHEN COALESCE(clonality,'')     = '' THEN $8  ELSE clonality     END,
             clone_no      = CASE WHEN COALESCE(clone_no,'')      = '' THEN $9  ELSE clone_no      END,
             isotype       = CASE WHEN COALESCE(isotype,'')       = '' THEN $10 ELSE isotype       END,
             reactivity    = CASE WHEN COALESCE(reactivity,'')    = '' THEN $11 ELSE reactivity    END,
             applications  = CASE WHEN COALESCE(applications,'')  = '' THEN $12 ELSE applications  END,
             received_date = CASE WHEN COALESCE(received_date,'') = '' THEN $13 ELSE received_date END,
             notes = CASE WHEN $14 <> '' AND COALESCE(notes,'') NOT LIKE '%' || $14 || '%'
                          THEN TRIM(BOTH ' · ' FROM COALESCE(notes,'') || ' · ' || $14) ELSE notes END
           WHERE id = $1`,
          [hit.id, qty, unit, String(aliq), box, storage, animal, clonality, clone, isotype, react, uses, date, notes]
        );
        updated++;
      } else {
        await q(
          `INSERT INTO items (id,name,category,scope,project,leader,room,fridge,box,catalog,vendor,qty,unit,aliquots,notes,
                              host_species,clonality,clone_no,isotype,reactivity,applications,received_date)
           VALUES ($1,$2,'Antibodies','General','','','',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          ["i" + Math.random().toString(36).slice(2, 9), name, storage, box, cat, vendor, qty, unit,
            String(aliq), notes, animal, clonality, clone, isotype, react, uses, date]
        );
        inserted++;
      }
    }
    await q(`INSERT INTO meta (k, v) VALUES ('seed8_f14', $1) ON CONFLICT (k) DO NOTHING`, [`updated ${updated}, inserted ${inserted}`]);
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
