// lib/orderForm.js
// Fills the UTMB "Supply Order Form" .xlsx for one order, from the embedded
// template, so the downloaded file matches UTMB's form exactly and uploads
// cleanly into UTMB purchasing.
//
// Uses exceljs (declared in package.json). No file reads at runtime — the
// template is embedded as base64 in orderFormTemplate.js.

import ExcelJS from "exceljs";
import { TEMPLATE_B64 } from "./orderFormTemplate.js";

const ROOM_DEFAULT = 11; // the division's room, pre-set on the form

// order shape:
// { date, requestId, vendor, frs, project, requestor, room, lcode, sh,
//   items: [ { qty, cat, desc, cost }, ... ] }
export async function buildOrderFormBuffer(order) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(TEMPLATE_B64, "base64"));
  const ws = wb.getWorksheet("Sheet1") || wb.worksheets[0];

  const set = (addr, v) => {
    if (v !== undefined && v !== null && v !== "") ws.getCell(addr).value = v;
  };
  const num = (v) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ---- Header ----
  set("B1", order.date);                 // Date
  set("F1", order.requestId);            // Request ID #
  set("B2", order.vendor);               // Vendor
  set("F2", order.frs);                  // FRS #
  set("B3", order.project);              // Project title / grant
  set("B4", order.requestor);            // Requestor
  set("B5", order.room ?? ROOM_DEFAULT); // Room #
  set("D5", order.lcode);                // LCode

  // ---- Line items: rows 8..17 ----
  const items = (order.items || []).slice(0, 10);
  items.forEach((it, i) => {
    const r = 8 + i;
    const qty = num(it.qty);
    const cost = num(it.cost);
    set(`B${r}`, qty);
    set(`C${r}`, it.cat);
    set(`D${r}`, it.desc);
    set(`E${r}`, cost);
    // keep the template's Total formula AND give it a cached value
    ws.getCell(`F${r}`).value = { formula: `B${r}*E${r}`, result: qty * cost };
  });

  // ---- Totals ----
  const sh = num(order.sh);
  const lineTotal = items.reduce((s, it) => s + num(it.qty) * num(it.cost), 0);
  set("F18", sh);                                         // S & H
  ws.getCell("F19").value = { formula: "SUM(F8:F17)+F18", result: lineTotal + sh };

  return await wb.xlsx.writeBuffer();
}

// Safe download filename: UTMB_Order_<name>_<date>.xlsx
export function orderFormFilename(order) {
  const name = String(order.requestId || order.orderName || "order")
    .replace(/[^\w.-]+/g, "_").slice(0, 40);
  const date = String(order.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return `UTMB_Order_${name}_${date}.xlsx`;
}
