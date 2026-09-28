// Sending the WhatsApp message that starts a conversation.
//
// Meta will not let you message someone out of the blue with free text, so the
// opening message must be a template they approved in advance. Once the person
// replies, the ElevenLabs agent handles the rest and our /api/agent/* endpoints
// record the decision.
//
// Needs four environment variables. Without them nothing is sent and nothing
// breaks — the app carries on with its own in-app alerts.
//   ELEVENLABS_API_KEY          from elevenlabs.io -> profile -> API keys
//   ELEVENLABS_AGENT_ID         the agent assigned to the WhatsApp number
//   WHATSAPP_PHONE_NUMBER_ID    the number's id, from ElevenLabs' WhatsApp page
//   WHATSAPP_TEMPLATE_NAME      default: lab_order_action
//   WHATSAPP_TEMPLATE_LANG      default: en_US
import { q } from "./db.js";

const API = "https://api.elevenlabs.io/v1/convai/whatsapp/outbound-message";

export function whatsappConfig() {
  const cfg = {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    agentId: process.env.ELEVENLABS_AGENT_ID || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    template: process.env.WHATSAPP_TEMPLATE_NAME || "lab_order_action",
    lang: process.env.WHATSAPP_TEMPLATE_LANG || "en_US",
  };
  const missing = ["apiKey", "agentId", "phoneNumberId"].filter((k) => !cfg[k]);
  return { ...cfg, ready: missing.length === 0, missing };
}

// Meta wants digits only, with the country code and no punctuation.
// A 10-digit US number is assumed to be +1.
export function waUserId(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 ? "1" + d : d;
}

const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (n) => (n || "").includes(",") ? n.split(",")[0].trim() : (n || "").split(" ")[0];
// Template parameters cannot contain newlines, tabs, or runs of spaces.
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, 180) || "-";

// The five slots in the approved template, in order.
export function templateParams({ needed, item, amount, context, instruction }) {
  return [{
    parameters: [needed, item, amount, context, instruction].map((t) => ({ text: clean(t) })),
  }];
}

// What each stage says.
export function stageMessage(stage, o, limit) {
  const amount = money(o.total);
  if (stage === "pd") {
    return {
      needed: "your approval",
      item: o.item_name,
      amount,
      context: `requested by ${short(o.requester)}${o.project ? ` for ${o.project}` : ""}`,
      instruction: (Number(o.total) || 0) >= (limit || 0)
        ? `Reply approve with the grant and FRS. Over ${money(limit)}, so Dr. Menon signs off after you.`
        : "Reply approve with the grant and FRS, or send back with a reason.",
    };
  }
  if (stage === "chair") {
    return {
      needed: "final approval",
      item: o.item_name,
      amount,
      context: `${short(o.pd_approver)} approved it on ${o.pd_grant_name || "no grant"}, FRS ${o.pd_frs || "none"}`,
      instruction: "Reply yes to confirm that account, or name a different grant and FRS.",
    };
  }
  return {
    needed: "placing on the UTMB site",
    item: o.item_name,
    amount,
    context: `${o.grant_name || "no grant"}, FRS ${o.frs || "none"} — cleared by ${short(o.pi_approver || o.pd_approver)}`,
    instruction: "Place it, then reply placed with the PO number.",
  };
}

async function logSend(orderId, to, name, ok, detail) {
  await q(
    `INSERT INTO order_events (id, order_id, event, actor, at, detail, amount, grant_name, frs, via)
     VALUES ($1,$2,$3,$4,now(),$5,NULL,'','','whatsapp')`,
    ["ev" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), orderId,
      ok ? "whatsapp_sent" : "whatsapp_failed", name || to, detail || ""]
  );
}

// Fire one message. Never throws — a WhatsApp outage must not block an
// approval from being recorded, so a failure is logged and the app moves on.
export async function sendWhatsApp({ to, name, orderId, stage, order, limit }) {
  const cfg = whatsappConfig();
  const userId = waUserId(to);
  if (!cfg.ready) {
    if (orderId) await logSend(orderId, to, name, false, `Not sent — WhatsApp is not configured (missing ${cfg.missing.join(", ")})`);
    return { ok: false, reason: "not_configured", missing: cfg.missing };
  }
  if (!userId) {
    if (orderId) await logSend(orderId, to, name, false, "Not sent — no WhatsApp number on file");
    return { ok: false, reason: "no_number" };
  }

  const msg = stageMessage(stage, order || {}, limit);
  const body = {
    whatsapp_phone_number_id: cfg.phoneNumberId,
    whatsapp_user_id: userId,
    template_name: cfg.template,
    template_language_code: cfg.lang,
    template_params: templateParams(msg),
    agent_id: cfg.agentId,
    // Hand the agent who it is talking to and what about, so it does not have
    // to guess the sender's identity from the conversation.
    conversation_initiation_client_data: {
      dynamic_variables: {
        member_name: name || "",
        member_phone: userId,
        order_id: orderId || "",
        stage: stage || "",
        item: msg.item,
        amount: msg.amount,
      },
    },
  };

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const text = await r.text();
    if (!r.ok) {
      if (orderId) await logSend(orderId, to, name, false, `WhatsApp send failed (${r.status}): ${text.slice(0, 200)}`);
      return { ok: false, reason: "api_error", status: r.status, detail: text.slice(0, 300) };
    }
    let conv = "";
    try { conv = (JSON.parse(text) || {}).conversation_id || ""; } catch { /* body is not JSON; the send still worked */ }
    if (orderId) await logSend(orderId, to, name, true, `WhatsApp sent to ${short(name || "")} (${userId})${conv ? ` · conversation ${conv}` : ""}`);
    return { ok: true, conversationId: conv };
  } catch (e) {
    if (orderId) await logSend(orderId, to, name, false, `WhatsApp send error: ${String(e.message || e).slice(0, 200)}`);
    return { ok: false, reason: "network", detail: String(e.message || e) };
  }
}

// Look up whose number to use, then send. Used by the order handlers.
export async function pingMembers(names, { orderId, stage, order, limit }) {
  const uniq = [...new Set((names || []).filter(Boolean))];
  if (uniq.length === 0) return [];
  const rows = (await q(
    `SELECT name, whatsapp FROM members WHERE name = ANY($1) AND whatsapp IS NOT NULL AND whatsapp <> ''`,
    [uniq]
  )).rows;
  const out = [];
  for (const m of rows) {
    out.push({ name: m.name, ...(await sendWhatsApp({ to: m.whatsapp, name: m.name, orderId, stage, order, limit })) });
  }
  return out;
}
