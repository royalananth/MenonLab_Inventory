import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../lib/db.js";
import { sessionMember, tokenFrom, caps } from "../../../lib/auth.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mapItem = (r) => ({
  id: r.id, name: r.name, category: r.category, scope: r.scope, project: r.project, leader: r.leader,
  room: r.room, fridge: r.fridge, box: r.box, catalog: r.catalog, vendor: r.vendor, qty: r.qty, unit: r.unit, notes: r.notes,
  lot: r.lot_no || "", assayGroup: r.assay_group || "", host: r.host_species || "", clonality: r.clonality || "",
  clone: r.clone_no || "", isotype: r.isotype || "", reactivity: r.reactivity || "", applications: r.applications || "",
  owner: r.owner || "", received: r.received_date || "", minQty: r.min_qty || "", aliquots: r.aliquots || "",
});
const mapUsage = (r) => ({ id: r.id, member: r.member, itemId: r.item_id, itemName: r.item_name, category: r.category, qty: r.qty, unit: r.unit, project: r.project, experiment: r.experiment, room: r.room, fridge: r.fridge, box: r.box, notes: r.notes, date: r.ts });
const mapOrder = (r) => ({ id: r.id, itemName: r.item_name, catalog: r.catalog, vendor: r.vendor, qty: r.qty, unitPrice: Number(r.unit_price) || 0, total: Number(r.total) || 0, project: r.project, grantId: r.grant_id, grantName: r.grant_name, experiment: r.experiment, notes: r.notes, requester: r.requester, status: r.status, dupAck: r.dup_ack, authorizer: r.authorizer, approver: r.approver, piApprover: r.pi_approver, piApprovedAt: r.pi_approved_at, purchaser: r.purchaser, po: r.po, orderedAt: r.ordered_at, receivedAt: r.received_at, rejectReason: r.reject_reason, createdAt: r.created_at, checklist: r.checklist ? JSON.parse(r.checklist) : null, explored: r.explored, frs: r.frs || "", fundNote: r.fund_note || "", fromItemId: r.from_item_id || "", approvedVia: r.approved_via || "" });

const nid = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function notify(recipients, kind, title, body, orderId) {
  const uniq = [...new Set((recipients || []).filter(Boolean))];
  for (const r of uniq) {
    await q(`INSERT INTO notifications (id,recipient,kind,title,body,order_id,seen,created_at) VALUES ($1,$2,$3,$4,$5,$6,false,now())`,
      [nid(), r, kind, title, body, orderId || null]);
  }
}
async function purchasingNames() {
  return (await q(`SELECT name FROM members WHERE role IN ('purchasing','admin')`)).rows.map((r) => r.name);
}
const short = (n) => (n || "").includes(",") ? n.split(",")[0].trim() : (n || "").split(" ")[0];

// stock += (restoreQty - newQty), only when the item and both quantities are numeric
async function adjustStock(itemId, newQty, restoreQty) {
  if (!itemId) return;
  const nQ = (newQty === "" || newQty == null || isNaN(+newQty)) ? 0 : +newQty;
  const rQ = (restoreQty === "" || restoreQty == null || isNaN(+restoreQty)) ? 0 : +restoreQty;
  const delta = rQ - nQ;
  if (delta === 0) return;
  const r = await q(`SELECT qty FROM items WHERE id=$1`, [itemId]);
  const cur = r.rows[0] && r.rows[0].qty;
  if (cur != null && cur !== "" && !isNaN(+cur)) {
    await q(`UPDATE items SET qty=$1 WHERE id=$2`, [String(Math.max(0, +cur + delta)), itemId]);
  }
}

export async function GET(req) {
  await ensureInit();
  const me = await sessionMember(req.headers.get("x-session") || new URL(req.url).searchParams.get("token") || "");
  // Lab data — budgets, orders, who has what — is for signed-in members only.
  if (!me) return NextResponse.json({ signedIn: false, caps: caps(null) }, { status: 401 });
  const who = me.name;

  const [members, categories, projects, items, usage, grants, orders, instruments, bookings, notifs, mediaPar, access] = await Promise.all([
    q(`SELECT name,email,role,pd,owner,(pin_hash IS NOT NULL) AS has_pin FROM members ORDER BY name`),
    q(`SELECT name FROM categories ORDER BY ord`),
    q(`SELECT id,name,leader FROM projects ORDER BY name`),
    q(`SELECT * FROM items ORDER BY name`),
    q(`SELECT * FROM usage_log ORDER BY ts DESC LIMIT 5000`),
    q(`SELECT id,name,budget,notes FROM grants ORDER BY name`),
    q(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 3000`),
    q(`SELECT id,name,ord,active,super_user,restricted FROM instruments WHERE active ORDER BY ord`),
    q(`SELECT * FROM bookings ORDER BY day DESC, start_min ASC LIMIT 4000`),
    who ? q(`SELECT * FROM notifications WHERE recipient=$1 ORDER BY created_at DESC LIMIT 60`, [who]) : Promise.resolve({ rows: [] }),
    q(`SELECT * FROM media_par ORDER BY cell_type, name`),
    q(`SELECT * FROM instrument_access ORDER BY requested_at DESC LIMIT 2000`),
  ]);

  return NextResponse.json({
    signedIn: !!me,
    me: me ? { name: me.name, role: me.role, pd: me.pd, shared: me.shared } : null,
    caps: caps(me),
    members: members.rows.map((m) => ({ name: m.name, email: m.email, role: m.role, pd: m.pd, owner: !!m.owner, hasPin: m.has_pin })),
    categories: categories.rows.map((r) => r.name),
    projects: projects.rows,
    items: items.rows.map(mapItem),
    usage: usage.rows.map(mapUsage),
    grants: grants.rows.map((g) => ({ id: g.id, name: g.name, budget: Number(g.budget) || 0, notes: g.notes })),
    orders: orders.rows.map(mapOrder),
    instruments: instruments.rows.map((r) => ({ id: r.id, name: r.name, superUser: r.super_user || "", restricted: !!r.restricted })),
    bookings: bookings.rows.map((b) => ({ id: b.id, instrumentId: b.instrument_id, instrumentName: b.instrument_name, member: b.member, day: b.day, startMin: b.start_min, endMin: b.end_min, purpose: b.purpose })),
    notifications: notifs.rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, orderId: n.order_id, seen: n.seen, date: n.created_at })),
    mediaPar: mediaPar.rows.map((p) => ({ id: p.id, cellType: p.cell_type, name: p.name, vendor: p.vendor, catalog: p.catalog, targetQty: p.target_qty, perStock: p.per_stock })),
    instrumentAccess: access.rows.map((a) => ({ id: a.id, instrumentId: a.instrument_id, instrumentName: a.instrument_name, member: a.member, status: a.status, note: a.note, requestedAt: a.requested_at, decidedAt: a.decided_at, decidedBy: a.decided_by })),
  });
}

const deny = (msg) => NextResponse.json({ ok: false, error: msg }, { status: 403 });

// Can this person book that instrument? Unrestricted kit is open to the lab;
// restricted kit needs granted access, or you are its super user.
async function mayBook(me, c, instrumentId) {
  const ins = (await q(`SELECT id,name,restricted,super_user FROM instruments WHERE id=$1`, [instrumentId])).rows[0];
  if (!ins) return "That instrument no longer exists.";
  if (!ins.restricted) return null;
  if (c.edit || ins.super_user === me.name) return null;
  const g = await q(`SELECT 1 FROM instrument_access WHERE instrument_id=$1 AND member=$2 AND status='granted'`, [instrumentId, me.name]);
  if (g.rows.length) return null;
  return `${ins.name} needs training sign-off. Request access from ${ins.super_user ? short(ins.super_user) : "the super user"} first.`;
}

export async function POST(req) {
  await ensureInit();
  const body = await req.json();
  const { type, action, payload } = body;

  // Identity comes from the session, never from the request body.
  const me = await sessionMember(tokenFrom(req, body));
  if (!me) return NextResponse.json({ ok: false, error: "Signed out. Please sign in again.", signedOut: true }, { status: 401 });
  const by = me.name;
  const c = caps(me);

  try {
    if (type === "item") {
      if (action === "upsert") {
        if (!c.edit) return deny("Only program directors and full-access staff can edit inventory.");
        const i = payload;
        await q(`INSERT INTO items (id,name,category,scope,project,leader,room,fridge,box,catalog,vendor,qty,unit,notes,
                   lot_no,assay_group,host_species,clonality,clone_no,isotype,reactivity,applications,owner,received_date,min_qty,aliquots)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
                 ON CONFLICT (id) DO UPDATE SET name=$2,category=$3,scope=$4,project=$5,leader=$6,room=$7,fridge=$8,box=$9,catalog=$10,vendor=$11,qty=$12,unit=$13,notes=$14,
                   lot_no=$15,assay_group=$16,host_species=$17,clonality=$18,clone_no=$19,isotype=$20,reactivity=$21,applications=$22,owner=$23,received_date=$24,min_qty=$25,aliquots=$26`,
          [i.id, i.name, i.category, i.scope, i.project || "", i.leader || "", i.room || "", i.fridge || "", i.box || "",
            i.catalog || "", i.vendor || "", (i.qty ?? "") + "", i.unit || "", i.notes || "",
            i.lot || "", i.assayGroup || "", i.host || "", i.clonality || "", i.clone || "", i.isotype || "",
            i.reactivity || "", i.applications || "", i.owner || "", i.received || "", (i.minQty ?? "") + "", (i.aliquots ?? "") + ""]);
      } else if (action === "delete") {
        if (!c.edit) return deny("Only program directors and full-access staff can delete inventory items.");
        await q(`DELETE FROM items WHERE id=$1`, [payload.id]);
      } else if (action === "bulkPar") {
        // Low-stock alerts can only fire on items that have a par level. Setting
        // them one at a time across 1,500 items is nobody's afternoon, so this
        // sets a threshold across a whole category at once.
        if (!c.edit) return deny("Only program directors and full-access staff can set par levels.");
        const val = String(payload.minQty ?? "").trim();
        if (val === "" || isNaN(+val)) return NextResponse.json({ ok: false, error: "Par level must be a number." }, { status: 400 });
        const onlyMissing = payload.onlyMissing !== false;
        const r = payload.category === "*"
          ? await q(`UPDATE items SET min_qty=$1 WHERE ($2::bool = false OR min_qty IS NULL OR min_qty = '')`, [val, onlyMissing])
          : await q(`UPDATE items SET min_qty=$1 WHERE category=$3 AND ($2::bool = false OR min_qty IS NULL OR min_qty = '')`, [val, onlyMissing, payload.category]);
        return NextResponse.json({ ok: true, updated: r.rowCount });
      }
    } else if (type === "usage") {
      if (action === "add") {
        const u = payload;
        await q(`INSERT INTO usage_log (id,member,item_id,item_name,category,qty,unit,project,experiment,room,fridge,box,notes,ts)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [u.id, by, u.itemId, u.itemName, u.category, (u.qty ?? "") + "", u.unit || "", u.project || "", u.experiment || "", u.room || "", u.fridge || "", u.box || "", u.notes || "", u.date]);
        await adjustStock(u.itemId, u.qty, 0);
      } else if (action === "update") {
        const u = payload;
        const prev = (await q(`SELECT item_id, qty, member FROM usage_log WHERE id=$1`, [u.id])).rows[0];
        if (prev && prev.member !== by && !c.edit) return deny("You can only edit your own usage entries.");
        await q(`UPDATE usage_log SET qty=$2, unit=$3, experiment=$4, notes=$5 WHERE id=$1`,
          [u.id, (u.qty ?? "") + "", u.unit || "", u.experiment || "", u.notes || ""]);
        if (prev) await adjustStock(prev.item_id, u.qty, prev.qty);
      } else if (action === "delete") {
        const prev = (await q(`SELECT item_id, qty, member FROM usage_log WHERE id=$1`, [payload.id])).rows[0];
        if (prev && prev.member !== by && !c.edit) return deny("You can only remove your own usage entries.");
        await q(`DELETE FROM usage_log WHERE id=$1`, [payload.id]);
        if (prev) await adjustStock(prev.item_id, 0, prev.qty);
      }
    } else if (type === "member") {
      // Who gets what access is the owner's call and nobody else's.
      if (!c.access) return deny("Only an access owner can change who is on the roster or what they can do.");
      if (action === "add") await q(`INSERT INTO members (name,email,role,pd) VALUES ($1,$2,$3,false) ON CONFLICT (name) DO NOTHING`, [payload.name, payload.email || "", payload.role || "member"]);
      else if (action === "delete") {
        if (payload.name === by) return deny("You can't remove your own account.");
        const t = (await q(`SELECT owner FROM members WHERE name=$1`, [payload.name])).rows[0];
        if (t && t.owner) return deny("Take away their access-owner right first, then remove them.");
        await q(`DELETE FROM members WHERE name=$1 AND pd=false`, [payload.name]);
        await q(`DELETE FROM sessions WHERE member=$1`, [payload.name]);
      }
      else if (action === "toggleAdmin") await q(`UPDATE members SET role = CASE WHEN role='admin' THEN 'member' ELSE 'admin' END WHERE name=$1`, [payload.name]);
      else if (action === "setRole") {
        if (payload.name === by) return deny("You can't change your own role.");
        await q(`UPDATE members SET role=$2 WHERE name=$1 AND pd=false`, [payload.name, payload.role]);
      }
      else if (action === "setOwner") {
        // Nominating another owner, or standing one down. Never the last one.
        const want = !!payload.owner;
        if (!want) {
          const others = await q(`SELECT 1 FROM members WHERE owner = true AND name <> $1`, [payload.name]);
          if (others.rows.length === 0) return deny("Somebody has to be able to grant access. Nominate a second owner first.");
        }
        await q(`UPDATE members SET owner=$2 WHERE name=$1`, [payload.name, want]);
        await notify([payload.name], "access", want ? "You can now grant access" : "Access-owner right removed",
          want ? `${short(by)} made you an access owner — you can set roles and reset PINs.` : `${short(by)} removed your access-owner right.`, null);
      }
    } else if (type === "project") {
      if (!c.edit) return deny("Only program directors and full-access staff can change projects.");
      if (action === "add") await q(`INSERT INTO projects (id,name,leader) VALUES ($1,$2,$3)`, [payload.id, payload.name, payload.leader || ""]);
      else if (action === "update") await q(`UPDATE projects SET name=$2, leader=$3 WHERE id=$1`, [payload.id, payload.name, payload.leader || ""]);
      else if (action === "delete") await q(`DELETE FROM projects WHERE id=$1`, [payload.id]);
    } else if (type === "category") {
      if (!c.edit) return deny("Only program directors and full-access staff can change categories.");
      if (action === "add") await q(`INSERT INTO categories (name,ord) VALUES ($1,(SELECT COALESCE(MAX(ord),0)+1 FROM categories)) ON CONFLICT (name) DO NOTHING`, [payload.name]);
      else if (action === "delete") await q(`DELETE FROM categories WHERE name=$1`, [payload.name]);
    } else if (type === "grant") {
      if (!c.grants) return deny("Only the chair and program directors can set grants and budgets.");
      if (action === "upsert") await q(`INSERT INTO grants (id,name,budget,notes) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=$2,budget=$3,notes=$4`, [payload.id, payload.name, payload.budget || 0, payload.notes || ""]);
      else if (action === "delete") await q(`DELETE FROM grants WHERE id=$1`, [payload.id]);
    } else if (type === "order") {
      const p = payload;
      if (action === "create") {
        // The requester supplies the item and names the PI. They do NOT pick a
        // grant — funding is the PI's call, assigned at approval.
        if (!p.approver) return NextResponse.json({ ok: false, error: "Name the PI who should approve this." }, { status: 400 });
        await q(`INSERT INTO orders (id,item_name,catalog,vendor,qty,unit_price,total,project,experiment,notes,requester,approver,status,dup_ack,checklist,explored,from_item_id,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'requested',$13,$14,$15,$16,now())`,
          [p.id, p.itemName, p.catalog || "", p.vendor || "", (p.qty ?? "") + "", p.unitPrice || 0, p.total || 0, p.project || "", p.experiment || "", p.notes || "", by, p.approver, !!p.dupAck, JSON.stringify(p.checklist || {}), p.explored || "", p.fromItemId || ""]);
        await notify([p.approver], "approval", "Approval needed",
          `${short(by)} requested ${p.itemName} — needs your approval and a funding account.`, p.id);
      } else if (action === "update") {
        const o = (await q(`SELECT requester FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o && o.requester !== by && !c.edit) return deny("You can only edit your own requests.");
        await q(`UPDATE orders SET item_name=$2,catalog=$3,vendor=$4,qty=$5,unit_price=$6,total=$7,project=$8,experiment=$9,notes=$10,explored=$11,approver=COALESCE($12,approver) WHERE id=$1 AND status='requested'`,
          [p.id, p.itemName, p.catalog || "", p.vendor || "", (p.qty ?? "") + "", p.unitPrice || 0, p.total || 0, p.project || "", p.experiment || "", p.notes || "", p.explored || "", p.approver || null]);
      } else if (action === "reassign") {
        // Send it to a different PI.
        if (!c.approve && !c.edit) return deny("Only the chair and program directors can reassign an approval.");
        await q(`UPDATE orders SET approver=$2 WHERE id=$1 AND status='requested'`, [p.id, p.approver || ""]);
        if (p.approver) await notify([p.approver], "approval", "Approval needed",
          `${short(by)} passed an approval to you.`, p.id);
      } else if (action === "approve") {
        // PI reviews, picks the grant and FRS, and approves. This is the only
        // point at which funding is decided.
        if (!c.approve) return deny("Only the chair and program directors can approve and assign funding.");
        const o0 = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (!o0) return NextResponse.json({ ok: false, error: "No such order." }, { status: 404 });
        if (o0.status !== "requested") return NextResponse.json({ ok: false, error: `That order is already ${o0.status}.` }, { status: 409 });
        if (o0.approver && o0.approver !== by && me.role !== "chair") return deny(`This one was sent to ${short(o0.approver)}.`);
        if (!p.frs || !String(p.frs).trim()) return NextResponse.json({ ok: false, error: "An FRS account is required to approve." }, { status: 400 });
        const g = p.grantId ? (await q(`SELECT id,name,budget FROM grants WHERE id=$1`, [p.grantId])).rows[0] : null;
        // Record the fund position as it stood at approval, so the decision can
        // be read back later. Computed here rather than trusted from the client.
        let fundNote = p.fundNote || "";
        if (g) {
          const spent = (await q(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE grant_id=$1 AND status IN ('approved','ordered','received')`, [g.id])).rows[0];
          const remaining = (Number(g.budget) || 0) - (Number(spent.s) || 0);
          fundNote = `${g.name}: $${remaining.toFixed(2)} available at approval`;
        }
        await q(`UPDATE orders SET status='approved', pi_approver=$2, pi_approved_at=now(), frs=$3, fund_note=$4,
                        grant_id=$5, grant_name=$6, approved_via='app' WHERE id=$1 AND status='requested'`,
          [p.id, by, String(p.frs).trim(), fundNote, g ? g.id : "", g ? g.name : (p.grantName || "")]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        await notify(await purchasingNames(), "order", "Approved — ready to order",
          `${o ? o.item_name : "An order"} approved by ${short(by)} · FRS ${String(p.frs).trim()}${g ? " · " + g.name : ""}. Ready to place.`, p.id);
        if (o) await notify([o.requester], "status", "Request approved",
          `${short(by)} approved your request for ${o.item_name}.`, p.id);
      } else if (action === "place") {
        if (!c.place) return deny("Only purchasing and full-access staff can place orders.");
        await q(`UPDATE orders SET status='ordered', purchaser=$2, po=$3, ordered_at=now() WHERE id=$1 AND status='approved'`, [p.id, by, p.po || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o) await notify([o.requester, o.approver], "status", "Order placed",
          `${short(by)} placed the order for ${o.item_name}${p.po ? " (PO " + p.po + ")" : ""}.`, p.id);
      } else if (action === "receive") {
        if (!c.place) return deny("Only purchasing and full-access staff can record receipt.");
        await q(`UPDATE orders SET status='received', received_at=now() WHERE id=$1`, [p.id]);
        const o0 = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o0) await notify([o0.requester], "status", "Order received",
          `${o0.item_name} has arrived${p.addItem ? " and was added to inventory" : ""}.`, p.id);
        if (p.addItem) {
          const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
          if (o && o.from_item_id) {
            const cur = (await q(`SELECT qty FROM items WHERE id=$1`, [o.from_item_id])).rows[0];
            if (cur && cur.qty !== "" && !isNaN(+cur.qty) && !isNaN(+o.qty)) {
              await q(`UPDATE items SET qty=$1 WHERE id=$2`, [String(+cur.qty + +o.qty), o.from_item_id]);
            }
          } else if (o) {
            await q(`INSERT INTO items (id,name,category,scope,project,leader,room,fridge,box,catalog,vendor,qty,unit,notes)
                     VALUES ($1,$2,'General',$3,$4,'','','','',$5,$6,$7,'',$8) ON CONFLICT (id) DO NOTHING`,
              ["i" + Math.random().toString(36).slice(2, 8), o.item_name, o.project ? "Project" : "General", o.project || "", o.catalog, o.vendor,
                (o.qty ?? "") + "", "Received " + new Date().toISOString().slice(0, 10) + (o.grant_name ? " · " + o.grant_name : "") + (o.frs ? " · FRS " + o.frs : "")]);
          }
        }
      } else if (action === "reject") {
        const o0 = (await q(`SELECT approver, requester FROM orders WHERE id=$1`, [p.id])).rows[0];
        const mayReject = c.approve || c.place || (o0 && o0.approver === by);
        if (!mayReject) return deny("You can't send this one back.");
        await q(`UPDATE orders SET status='rejected', reject_reason=$2 WHERE id=$1`, [p.id, p.reason || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o) await notify([o.requester], "status", "Request sent back",
          `${short(by)} sent back your request for ${o.item_name}${p.reason ? ": " + p.reason : ""}.`, p.id);
      } else if (action === "delete") {
        const o = (await q(`SELECT requester, status FROM orders WHERE id=$1`, [p.id])).rows[0];
        const mine = o && o.requester === by && (o.status === "requested" || o.status === "rejected");
        if (!mine && !c.place && !c.edit) return deny("You can't delete that request.");
        await q(`DELETE FROM orders WHERE id=$1`, [p.id]);
      }
    } else if (type === "notification") {
      if (action === "seen") await q(`UPDATE notifications SET seen=true WHERE id=$1 AND recipient=$2`, [payload.id, by]);
      else if (action === "seenAll") await q(`UPDATE notifications SET seen=true WHERE recipient=$1`, [by]);
      else if (action === "clear") await q(`DELETE FROM notifications WHERE recipient=$1`, [by]);
    } else if (type === "instrument") {
      if (!c.edit) return deny("Only program directors and full-access staff can change instruments.");
      if (action === "upsert") {
        await q(`INSERT INTO instruments (id,name,ord,active,super_user,restricted)
                 VALUES ($1,$2,COALESCE((SELECT MAX(ord)+1 FROM instruments),0),true,$3,$4)
                 ON CONFLICT (id) DO UPDATE SET name=$2, super_user=$3, restricted=$4`,
          [payload.id, payload.name, payload.superUser || "", !!payload.restricted]);
      } else if (action === "delete") await q(`UPDATE instruments SET active=false WHERE id=$1`, [payload.id]);
    } else if (type === "access") {
      const p = payload;
      if (action === "request") {
        const ins = (await q(`SELECT id,name,super_user FROM instruments WHERE id=$1`, [p.instrumentId])).rows[0];
        if (!ins) return NextResponse.json({ ok: false, error: "No such instrument." }, { status: 404 });
        const existing = (await q(`SELECT id,status FROM instrument_access WHERE instrument_id=$1 AND member=$2`, [p.instrumentId, by])).rows[0];
        if (existing && existing.status === "granted") return NextResponse.json({ ok: true, already: true });
        if (existing) {
          await q(`UPDATE instrument_access SET status='requested', note=$2, requested_at=now(), decided_at=NULL, decided_by=NULL WHERE id=$1`, [existing.id, p.note || ""]);
        } else {
          await q(`INSERT INTO instrument_access (id,instrument_id,instrument_name,member,status,note,requested_at)
                   VALUES ($1,$2,$3,$4,'requested',$5,now())`,
            ["ia" + Math.random().toString(36).slice(2, 8), ins.id, ins.name, by, p.note || ""]);
        }
        const admins = (await q(`SELECT name FROM members WHERE role IN ('admin','chair')`)).rows.map((r) => r.name);
        await notify([ins.super_user, ...admins], "access", "Instrument access requested",
          `${short(by)} is asking for access to ${ins.name}.`, null);
      } else if (action === "decide") {
        const row = (await q(`SELECT * FROM instrument_access WHERE id=$1`, [p.id])).rows[0];
        if (!row) return NextResponse.json({ ok: false, error: "No such request." }, { status: 404 });
        const ins = (await q(`SELECT super_user FROM instruments WHERE id=$1`, [row.instrument_id])).rows[0];
        const isSuper = ins && ins.super_user === by;
        if (!isSuper && !c.edit) return deny("Only the instrument's super user or full-access staff can decide this.");
        const status = p.status === "granted" ? "granted" : "revoked";
        await q(`UPDATE instrument_access SET status=$2, decided_at=now(), decided_by=$3, note=COALESCE($4, note) WHERE id=$1`,
          [p.id, status, by, p.note || null]);
        await notify([row.member], "access", status === "granted" ? "Instrument access granted" : "Instrument access declined",
          `${short(by)} ${status === "granted" ? "signed you off on" : "declined access to"} ${row.instrument_name}.`, null);
      }
    } else if (type === "booking") {
      if (action === "add") {
        const b = payload;
        const blocked = await mayBook(me, c, b.instrumentId);
        if (blocked) return deny(blocked);
        const clash = await q(`SELECT 1 FROM bookings WHERE instrument_id=$1 AND day=$2 AND start_min < $4 AND end_min > $3`,
          [b.instrumentId, b.day, b.startMin, b.endMin]);
        if (clash.rows.length) return deny("That slot overlaps a booking that already exists.");
        await q(`INSERT INTO bookings (id,instrument_id,instrument_name,member,day,start_min,end_min,purpose,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
          [b.id, b.instrumentId, b.instrumentName, by, b.day, b.startMin, b.endMin, b.purpose || ""]);
      } else if (action === "delete") {
        const prev = (await q(`SELECT member FROM bookings WHERE id=$1`, [payload.id])).rows[0];
        if (prev && prev.member !== by && !c.edit) return deny("You can only cancel your own bookings.");
        await q(`DELETE FROM bookings WHERE id=$1`, [payload.id]);
      }
    } else if (type === "mediaPar") {
      if (!c.edit) return deny("Only program directors and full-access staff can change par levels.");
      const p = payload;
      if (action === "upsert") await q(`INSERT INTO media_par (id,cell_type,name,vendor,catalog,target_qty,per_stock) VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (id) DO UPDATE SET cell_type=$2,name=$3,vendor=$4,catalog=$5,target_qty=$6,per_stock=$7`,
        [p.id, p.cellType || "", p.name || "", p.vendor || "", p.catalog || "", p.targetQty || "", p.perStock || ""]);
      else if (action === "delete") await q(`DELETE FROM media_par WHERE id=$1`, [p.id]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
