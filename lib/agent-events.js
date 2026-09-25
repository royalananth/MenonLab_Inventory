// Shared with the web app's own handlers so a WhatsApp approval lands in the
// same audit trail, with the channel recorded.
import { q } from "./db.js";

export async function chairThreshold() {
  const r = await q(`SELECT v FROM meta WHERE k='chair_threshold'`);
  const n = Number(r.rows[0] && r.rows[0].v);
  return isNaN(n) ? 1000 : n;
}

export async function logEvent(orderId, event, actor, detail, o, via) {
  await q(
    `INSERT INTO order_events (id, order_id, event, actor, at, detail, amount, grant_name, frs, via)
     VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8,$9)`,
    ["ev" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), orderId, event, actor,
      detail || "", o ? (Number(o.total) || 0) : null, o ? (o.grant_name || "") : "", o ? (o.frs || "") : "", via || "app"]
  );
}
