import { NextResponse } from "next/server";
import { ensureInit, q } from "../../../lib/db.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mapItem = (r) => ({
  id: r.id, name: r.name, category: r.category, scope: r.scope, project: r.project, leader: r.leader,
  room: r.room, fridge: r.fridge, box: r.box, catalog: r.catalog, vendor: r.vendor, qty: r.qty, unit: r.unit, notes: r.notes,
  lot: r.lot_no || "", assayGroup: r.assay_group || "", host: r.host_species || "", clonality: r.clonality || "",
  clone: r.clone_no || "", isotype: r.isotype || "", reactivity: r.reactivity || "", applications: r.applications || "",
  owner: r.owner || "", received: r.received_date || "", minQty: r.min_qty || "",
});
const mapUsage = (r) => ({ id: r.id, member: r.member, itemId: r.item_id, itemName: r.item_name, category: r.category, qty: r.qty, unit: r.unit, project: r.project, experiment: r.experiment, room: r.room, fridge: r.fridge, box: r.box, notes: r.notes, date: r.ts });
const mapOrder = (r) => ({ id: r.id, itemName: r.item_name, catalog: r.catalog, vendor: r.vendor, qty: r.qty, unitPrice: Number(r.unit_price) || 0, total: Number(r.total) || 0, project: r.project, grantId: r.grant_id, grantName: r.grant_name, experiment: r.experiment, notes: r.notes, requester: r.requester, status: r.status, dupAck: r.dup_ack, authorizer: r.authorizer, approver: r.approver, piApprover: r.pi_approver, piApprovedAt: r.pi_approved_at, purchaser: r.purchaser, po: r.po, orderedAt: r.ordered_at, receivedAt: r.received_at, rejectReason: r.reject_reason, createdAt: r.created_at, checklist: r.checklist ? JSON.parse(r.checklist) : null, explored: r.explored, frs: r.frs || "", fundNote: r.fund_note || "", fromItemId: r.from_item_id || "", requestedApprover: r.requested_approver || "" });

const nid = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function notify(recipients, kind, title, body, orderId) {
  const uniq = [...new Set((recipients || []).filter(Boolean))];
  for (const r of uniq) {
    await q(`INSERT INTO notifications (id,recipient,kind,title,body,order_id,seen,created_at) VALUES ($1,$2,$3,$4,$5,$6,false,now())`,
      [nid(), r, kind, title, body, orderId || null]);
  }
}
// Orders land on the purchasing desk (Megan). Full-access staff are included
// as a fallback so the queue is never stuck when she is away.
async function intakeNames() {
  const r = await q(`SELECT name FROM members WHERE role IN ('purchasing','admin') ORDER BY (role='purchasing') DESC`);
  return r.rows.map((x) => x.name);
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
  const who = new URL(req.url).searchParams.get("me") || "";
  const [members, categories, projects, items, usage, grants, orders, instruments, bookings, notifs, mediaPar] = await Promise.all([
    q(`SELECT name,email,role,pd FROM members ORDER BY name`),
    q(`SELECT name FROM categories ORDER BY ord`),
    q(`SELECT id,name,leader FROM projects ORDER BY name`),
    q(`SELECT * FROM items ORDER BY name`),
    q(`SELECT * FROM usage_log ORDER BY ts DESC LIMIT 5000`),
    q(`SELECT id,name,budget,notes FROM grants ORDER BY name`),
    q(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 3000`),
    q(`SELECT id,name,ord,active FROM instruments WHERE active ORDER BY ord`),
    q(`SELECT * FROM bookings ORDER BY day DESC, start_min ASC LIMIT 4000`),
    who ? q(`SELECT * FROM notifications WHERE recipient=$1 ORDER BY created_at DESC LIMIT 60`, [who]) : Promise.resolve({ rows: [] }),
    q(`SELECT * FROM media_par ORDER BY cell_type, name`),
  ]);
  return NextResponse.json({
    members: members.rows.map((m) => ({ name: m.name, email: m.email, role: m.role, pd: m.pd })),
    categories: categories.rows.map((r) => r.name),
    projects: projects.rows,
    items: items.rows.map(mapItem),
    usage: usage.rows.map(mapUsage),
    grants: grants.rows.map((g) => ({ id: g.id, name: g.name, budget: Number(g.budget) || 0, notes: g.notes })),
    orders: orders.rows.map(mapOrder),
    instruments: instruments.rows.map((r) => ({ id: r.id, name: r.name })),
    bookings: bookings.rows.map((b) => ({ id: b.id, instrumentId: b.instrument_id, instrumentName: b.instrument_name, member: b.member, day: b.day, startMin: b.start_min, endMin: b.end_min, purpose: b.purpose })),
    notifications: notifs.rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, orderId: n.order_id, seen: n.seen, date: n.created_at })),
    mediaPar: mediaPar.rows.map((p) => ({ id: p.id, cellType: p.cell_type, name: p.name, vendor: p.vendor, catalog: p.catalog, targetQty: p.target_qty, perStock: p.per_stock })),
  });
}

// Server-side permission checks, so the rules cannot be bypassed by a client
// that simply renders the buttons.
async function roleOf(name) {
  if (!name) return null;
  const r = await q(`SELECT name,role,pd FROM members WHERE name=$1`, [name]);
  return r.rows[0] || null;
}
const PRIVILEGED = ["admin", "chair", "pi"];
const canEditInventory = (m) => !!m && (m.pd || PRIVILEGED.includes(m.role));
const deny = (msg) => NextResponse.json({ ok: false, error: msg }, { status: 403 });

export async function POST(req) {
  await ensureInit();
  const { type, action, payload, by } = await req.json();
  try {
    const actor = await roleOf(by || (payload && payload.by));
    if (type === "item") {
      if (action === "upsert") {
        const i = payload;
        await q(`INSERT INTO items (id,name,category,scope,project,leader,room,fridge,box,catalog,vendor,qty,unit,notes,
                   lot_no,assay_group,host_species,clonality,clone_no,isotype,reactivity,applications,owner,received_date,min_qty)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
                 ON CONFLICT (id) DO UPDATE SET name=$2,category=$3,scope=$4,project=$5,leader=$6,room=$7,fridge=$8,box=$9,catalog=$10,vendor=$11,qty=$12,unit=$13,notes=$14,
                   lot_no=$15,assay_group=$16,host_species=$17,clonality=$18,clone_no=$19,isotype=$20,reactivity=$21,applications=$22,owner=$23,received_date=$24,min_qty=$25`,
          [i.id, i.name, i.category, i.scope, i.project || "", i.leader || "", i.room || "", i.fridge || "", i.box || "",
            i.catalog || "", i.vendor || "", (i.qty ?? "") + "", i.unit || "", i.notes || "",
            i.lot || "", i.assayGroup || "", i.host || "", i.clonality || "", i.clone || "", i.isotype || "",
            i.reactivity || "", i.applications || "", i.owner || "", i.received || "", (i.minQty ?? "") + ""]);
      } else if (action === "delete") {
        // Pilar reported an item disappearing when a usage entry was removed.
        // Deleting an inventory item is now restricted and only ever happens here.
        if (!canEditInventory(actor)) return deny("Only program directors and full-access staff can delete inventory items.");
        await q(`DELETE FROM items WHERE id=$1`, [payload.id]);
      }
    } else if (type === "usage") {
      if (action === "add") {
        const u = payload;
        await q(`INSERT INTO usage_log (id,member,item_id,item_name,category,qty,unit,project,experiment,room,fridge,box,notes,ts)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [u.id, u.member, u.itemId, u.itemName, u.category, (u.qty ?? "") + "", u.unit || "", u.project || "", u.experiment || "", u.room || "", u.fridge || "", u.box || "", u.notes || "", u.date]);
        await adjustStock(u.itemId, u.qty, 0); // subtract new qty
      } else if (action === "update") {
        const u = payload;
        const prev = (await q(`SELECT item_id, qty, member FROM usage_log WHERE id=$1`, [u.id])).rows[0];
        if (prev && prev.member !== (by || "") && !canEditInventory(actor)) return deny("You can only edit your own usage entries.");
        await q(`UPDATE usage_log SET qty=$2, unit=$3, experiment=$4, notes=$5 WHERE id=$1`,
          [u.id, (u.qty ?? "") + "", u.unit || "", u.experiment || "", u.notes || ""]);
        if (prev) await adjustStock(prev.item_id, u.qty, prev.qty); // apply delta (old-new)
      } else if (action === "delete") {
        const prev = (await q(`SELECT item_id, qty, member FROM usage_log WHERE id=$1`, [payload.id])).rows[0];
        if (prev && prev.member !== (by || "") && !canEditInventory(actor)) return deny("You can only remove your own usage entries.");
        await q(`DELETE FROM usage_log WHERE id=$1`, [payload.id]);
        if (prev) await adjustStock(prev.item_id, 0, prev.qty); // restore old qty
      }
    } else if (type === "member") {
      if (action === "add") await q(`INSERT INTO members (name,email,role,pd) VALUES ($1,$2,$3,false) ON CONFLICT (name) DO NOTHING`, [payload.name, payload.email || "", payload.role || "member"]);
      else if (action === "delete") await q(`DELETE FROM members WHERE name=$1 AND pd=false`, [payload.name]);
      else if (action === "toggleAdmin") await q(`UPDATE members SET role = CASE WHEN role='admin' THEN 'member' ELSE 'admin' END WHERE name=$1`, [payload.name]);
      else if (action === "setRole") await q(`UPDATE members SET role=$2 WHERE name=$1 AND pd=false`, [payload.name, payload.role]);
    } else if (type === "project") {
      if (action === "add") await q(`INSERT INTO projects (id,name,leader) VALUES ($1,$2,$3)`, [payload.id, payload.name, payload.leader || ""]);
      else if (action === "update") await q(`UPDATE projects SET name=$2, leader=$3 WHERE id=$1`, [payload.id, payload.name, payload.leader || ""]);
      else if (action === "delete") await q(`DELETE FROM projects WHERE id=$1`, [payload.id]);
    } else if (type === "category") {
      if (action === "add") await q(`INSERT INTO categories (name,ord) VALUES ($1,(SELECT COALESCE(MAX(ord),0)+1 FROM categories)) ON CONFLICT (name) DO NOTHING`, [payload.name]);
      else if (action === "delete") await q(`DELETE FROM categories WHERE name=$1`, [payload.name]);
    } else if (type === "grant") {
      if (action === "upsert") await q(`INSERT INTO grants (id,name,budget,notes) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=$2,budget=$3,notes=$4`, [payload.id, payload.name, payload.budget || 0, payload.notes || ""]);
      else if (action === "delete") await q(`DELETE FROM grants WHERE id=$1`, [payload.id]);
    } else if (type === "order") {
      const p = payload;
      if (action === "create") {
        await q(`INSERT INTO orders (id,item_name,catalog,vendor,qty,unit_price,total,project,grant_id,grant_name,experiment,notes,requester,status,dup_ack,checklist,explored,from_item_id,requested_approver,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'requested',$14,$15,$16,$17,$18,now())`,
          [p.id, p.itemName, p.catalog || "", p.vendor || "", (p.qty ?? "") + "", p.unitPrice || 0, p.total || 0, p.project || "", p.grantId || "", p.grantName || "", p.experiment || "", p.notes || "", p.requester, !!p.dupAck, JSON.stringify(p.checklist || {}), p.explored || "", p.fromItemId || "", p.requestedApprover || ""]);
        await notify(await intakeNames(), "order", "New order request",
          `${short(p.requester)} requested ${p.itemName}`
          + (p.requestedApprover ? ` — for ${short(p.requestedApprover)} to approve. Please route.` : " — needs review & routing."), p.id);
      } else if (action === "update") {
        await q(`UPDATE orders SET item_name=$2,catalog=$3,vendor=$4,qty=$5,unit_price=$6,total=$7,project=$8,grant_id=$9,grant_name=$10,experiment=$11,notes=$12,explored=$13,requested_approver=$14 WHERE id=$1 AND status='requested'`,
          [p.id, p.itemName, p.catalog || "", p.vendor || "", (p.qty ?? "") + "", p.unitPrice || 0, p.total || 0, p.project || "", p.grantId || "", p.grantName || "", p.experiment || "", p.notes || "", p.explored || "", p.requestedApprover || ""]);
      } else if (action === "route") {
        await q(`UPDATE orders SET status='routed', authorizer=$2, approver=$3 WHERE id=$1 AND status='requested'`, [p.id, p.by, p.approver || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (p.approver) await notify([p.approver], "approval", "Approval needed",
          `${short(p.by)} routed ${o ? o.item_name : "an order"} to you for final approval.`, p.id);
        if (o) await notify([o.requester], "status", "Request routed",
          `Your request for ${o.item_name} was sent to ${short(p.approver)} for approval.`, p.id);
      } else if (action === "approve") {
        // Dr. Menon's rule: the FRS is assigned at the moment of final approval,
        // along with the fund position the approver was looking at.
        await q(`UPDATE orders SET status='approved', pi_approver=$2, pi_approved_at=now(), frs=$3, fund_note=$4 WHERE id=$1 AND status='routed'`,
          [p.id, p.by, p.frs || "", p.fundNote || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        await notify(await intakeNames(), "order", "Approved — ready to order",
          `${o ? o.item_name : "An order"} was approved by ${short(p.by)}${p.frs ? " (FRS " + p.frs + ")" : ""}. Ready to place.`, p.id);
        if (o) await notify([o.requester], "status", "Request approved",
          `${short(p.by)} approved your request for ${o.item_name}.`, p.id);
      } else if (action === "place") {
        await q(`UPDATE orders SET status='ordered', purchaser=$2, po=$3, ordered_at=now() WHERE id=$1 AND status='approved'`, [p.id, p.by, p.po || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o) await notify([o.requester, o.approver], "status", "Order placed",
          `${short(p.by)} placed the order for ${o.item_name}${p.po ? " (PO " + p.po + ")" : ""}.`, p.id);
      } else if (action === "receive") {
        await q(`UPDATE orders SET status='received', received_at=now() WHERE id=$1`, [p.id]);
        const o0 = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o0) await notify([o0.requester], "status", "Order received",
          `${o0.item_name} has arrived${p.addItem ? " and was added to inventory" : ""}.`, p.id);
        if (p.addItem) {
          const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
          if (o && o.from_item_id) {
            // requested from an existing inventory record: top that record back up
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
        await q(`UPDATE orders SET status='rejected', reject_reason=$2 WHERE id=$1`, [p.id, p.reason || ""]);
        const o = (await q(`SELECT * FROM orders WHERE id=$1`, [p.id])).rows[0];
        if (o) await notify([o.requester], "status", "Request sent back",
          `${short(p.by)} sent back your request for ${o.item_name}${p.reason ? ": " + p.reason : ""}.`, p.id);
      } else if (action === "delete") {
        await q(`DELETE FROM orders WHERE id=$1`, [p.id]);
      }
    } else if (type === "notification") {
      if (action === "seen") await q(`UPDATE notifications SET seen=true WHERE id=$1`, [payload.id]);
      else if (action === "seenAll") await q(`UPDATE notifications SET seen=true WHERE recipient=$1`, [payload.me]);
      else if (action === "clear") await q(`DELETE FROM notifications WHERE recipient=$1`, [payload.me]);
    } else if (type === "instrument") {
      if (action === "upsert") await q(`INSERT INTO instruments (id,name,ord,active) VALUES ($1,$2,COALESCE((SELECT MAX(ord)+1 FROM instruments),0),true) ON CONFLICT (id) DO UPDATE SET name=$2`, [payload.id, payload.name]);
      else if (action === "delete") await q(`UPDATE instruments SET active=false WHERE id=$1`, [payload.id]);
    } else if (type === "booking") {
      if (action === "add") {
        const b = payload;
        const clash = await q(`SELECT 1 FROM bookings WHERE instrument_id=$1 AND day=$2 AND start_min < $4 AND end_min > $3`,
          [b.instrumentId, b.day, b.startMin, b.endMin]);
        if (clash.rows.length) return deny("That slot overlaps a booking that already exists.");
        await q(`INSERT INTO bookings (id,instrument_id,instrument_name,member,day,start_min,end_min,purpose,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
          [b.id, b.instrumentId, b.instrumentName, b.member, b.day, b.startMin, b.endMin, b.purpose || ""]);
      } else if (action === "delete") {
        await q(`DELETE FROM bookings WHERE id=$1`, [payload.id]);
      }
    } else if (type === "mediaPar") {
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
