import { json, bodyOf } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readManyTabsFromSpreadsheet, getSheetRowFormulas, getSheetCrudMetadata, writeSheetValues, addActivity } from "./_lib/sheets.mjs";

// Contract reminders: set the STATUS column (O) of one Extend 2026 row from the Overview page.
const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TAB = "Extend 2026", HEADER_ROW = 2, DATA_START = 3, START = "A", END = "U";
const ACTIONS = {
  sent:   { label:"Sent to C&B", matches: v => /sent\s*to\s*c\s*(&|and|n)?\s*b/i.test(v) },
  resign: { label:"Resign",      matches: v => /resign/i.test(v) }
};
const norm = v => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function colLetter(index){ let n = index + 1, s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
const quoted = `'${TAB.replace(/'/g, "''")}'`;

export const handler = async event => {
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error:"Admin authentication required." });
    if (event.httpMethod !== "POST") return json(405, { error:"Method not allowed" });
    const body = bodyOf(event), rowNumber = Number(body.rowNumber), action = ACTIONS[body.action], employee = String(body.employee ?? "").trim();
    if (!action) return json(400, { error:"Unknown action." });
    if (!Number.isInteger(rowNumber) || rowNumber < DATA_START || rowNumber > 10000 || !employee) return json(400, { error:"Invalid contract row." });
    const data = await readManyTabsFromSpreadsheet(MAIN_ID, [{ key:"tab", title:TAB, headerRow:HEADER_ROW, startColumn:START, endColumn:END }], { forceRefresh:true });
    const values = data.get("tab")?.values || [], headers = (values[0] || []).map(v => String(v ?? "").trim());
    const find = (name, fallback) => { const i = headers.findIndex(h => norm(h) === norm(name)); return i > -1 ? i : fallback; };
    const statusCol = find("STATUS", 14), nameCol = find("NAME", 9);
    // Rows are addressed by sheet row number, so confirm the row still holds the same person before writing.
    const live = values[rowNumber - HEADER_ROW] || [];
    if (String(live[nameCol] ?? "").trim() !== employee) return json(409, { error:"This row no longer matches the contract you selected (the sheet was changed). Refresh the overview and try again." });
    const formulas = await getSheetRowFormulas(MAIN_ID, TAB, rowNumber, START, END);
    if (typeof formulas[statusCol] === "string" && formulas[statusCol].startsWith("=")) return json(409, { error:`STATUS (column ${colLetter(statusCol)}) is calculated by a formula in this row and cannot be set from here.` });
    const current = String(live[statusCol] ?? "").trim();
    if (action.matches(current)) return json(200, { success:true, rowNumber, value: current, unchanged:true });
    // Use the spelling the sheet already uses: dropdown options first, then existing rows. Never invent one.
    let value = "";
    try { const meta = await getSheetCrudMetadata(MAIN_ID, TAB, HEADER_ROW, DATA_START, START, END); value = (meta.columns?.[statusCol]?.validation?.options || []).map(String).find(action.matches) || ""; } catch { /* fall back to existing rows */ }
    if (!value) { const seen = new Map(); for (const row of values.slice(DATA_START - HEADER_ROW)) { const v = String(row?.[statusCol] ?? "").trim(); if (action.matches(v)) seen.set(v, (seen.get(v) || 0) + 1); } value = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ""; }
    if (!value) return json(422, { error:`No "${action.label}" value was found in the STATUS dropdown or in existing rows of ${TAB}, so the app will not guess one. Set it once in the sheet and try again.` });
    await writeSheetValues(MAIN_ID, [{ range:`${quoted}!${colLetter(statusCol)}${rowNumber}`, values:[[value]] }]);
    try { await addActivity(actor.username, "Update", "Contract Extension", String(rowNumber), `${employee}: status set to ${value}`); } catch { /* the sheet write already succeeded */ }
    return json(200, { success:true, rowNumber, value, previous: current });
  } catch (error) { return json(500, { error: error.message || "Contract update failed." }); }
};
