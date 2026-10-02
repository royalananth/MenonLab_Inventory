// lib/orderForm.js
// Generates the UTMB "Supply Order Form" .xlsx for one order by filling the
// real UTMB template, so the file uploads cleanly into UTMB purchasing.
//
// Requires ExcelJS:  npm i exceljs   (the monthly pack may already use it)
//
// The ONLY thing to adjust for your data model is the field mapping in
// buildOrderFormBuffer() below — the right-hand side (order.xxx / it.xxx).

import ExcelJS from "exceljs";
import path from "path";

const TEMPLATE_PATH = path.join(process.cwd(), "lib", "templates", "utmb_order_form.xlsx");
const ROOM_DEFAULT = 11; // the division's room, pre-set on the form

/**
 * order shape expected:
 * {
 *   date:       "2026-10-01",      // order/placed date
 *   requestId:  "ORD-1042",        // Request ID #
 *   vendor:     "Bio-Techne",
 *   frs:        "555666",          // entered by Megan at Place
 *   project:    "MPRINT",          // grant / project title
 *   requestor:  "Giovanni Calori",
 *   room:       11,                // optional, defaults to 11
 *   lcode:      "0742",            // optional
 *   sh:         15.0,              // optional shipping & handling
 *   items: [ { qty, cat, desc, cost }, ... ]   // 1..10 line items
 * }
 */
export async function buildOrderFormBuffer(order) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const ws = wb.getWorksheet("Sheet1") || wb.worksheets[0];

  const set = (addr, v) => { if (v !== undefined && v !== null && v !== "") ws.getCell(addr).value = v; };

  // ---- Header ----
  set("B1", order.date);                    // Date
  set("F1", order.requestId);               // Request ID #
  set("B2", order.vendor);                  // Vendor
  set("F2", order.frs);                     // FRS #
  set("B3", order.project);                 // Project title / grant
  set("B4", order.requestor);               // Requestor
  set("B5", order.room ?? ROOM_DEFAULT);    // Room #
  set("D5", order.lcode);                   // LCode

  // ---- Line items: rows 8..17 ----
  const items = (order.items || []).slice(0, 10);
  items.forEach((it, i) => {
    const r = 8 + i;
    set(`B${r}`, it.qty);
    set(`C${r}`, it.cat);
    set(`D${r}`, it.desc);
    set(`E${r}`, it.cost);
    // F{r} already holds =B{r}*E{r} in the template — leave it.
  });

  // ---- Totals ----
  set("F18", order.sh ?? 0);                               // S & H
  ws.getCell("F19").value = { formula: "SUM(F8:F17)+F18" }; // Total Price

  return await wb.xlsx.writeBuffer();
}

/** Safe download filename: UTMB_Order_<name>_<date>.xlsx */
export function orderFormFilename(order) {
  const name = String(order.requestId || order.orderName || "order")
    .replace(/[^\w.-]+/g, "_").slice(0, 40);
  const date = String(order.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return `UTMB_Order_${name}_${date}.xlsx`;
}
