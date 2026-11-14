import { json, bodyOf } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readManyTabsFromSpreadsheet, getSheetRowFormulas, writeSheetValues, addActivity } from "./_lib/sheets.mjs";

// Surat pengantar psikotes: fill DATE, NO SPK, LOKASI TEST and SPK (letter link) on a row of SPK 2026
// that the invitation form already created. Other columns of the row are never touched.
const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TAB = "SPK 2026", HEADER_ROW = 1, DATA_START = 2, START = "A", END = "Q";
const FIELDS = { date:"DATE", noSpk:"NO SPK", location:"LOKASI TEST", link:"SPK" };
const norm = v => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function colLetter(index){ let n = index + 1, s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
const quoted = `'${TAB.replace(/'/g, "''")}'`;
const validIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

export const handler = async event => {
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error:"Admin authentication required." });
    if (event.httpMethod !== "POST") return json(405, { error:"Method not allowed" });
    const body = bodyOf(event), rowNumber = Number(body.rowNumber), name = String(body.name ?? "").trim(), input = body.values || {};
    if (!Number.isInteger(rowNumber) || rowNumber < DATA_START || rowNumber > 10000 || !name) return json(400, { error:"Invalid SPK row." });
    const data = await readManyTabsFromSpreadsheet(MAIN_ID, [{ key:"tab", title:TAB, headerRow:HEADER_ROW, startColumn:START, endColumn:END }], { forceRefresh:true });
    const values = data.get("tab")?.values || [], headers = (values[0] || []).map(v => String(v ?? "").trim());
    const at = header => headers.findIndex(h => norm(h) === norm(header));
    const live = values[rowNumber - HEADER_ROW] || [];
    // Rows are addressed by sheet row number, so confirm the row still holds the same participant before writing.
    if (norm(live[at("NAMA PESERTA")]) !== norm(name)) return json(409, { error:"This row no longer matches the participant you selected (the sheet was changed). Refresh the overview and try again." });
    const date = String(input.date ?? "").trim(), noSpk = String(input.noSpk ?? "").trim(), location = String(input.location ?? "").trim(), link = String(input.link ?? "").trim();
    if (date && !validIso(date)) return json(400, { error:"DATE must be a valid date." });
    if (noSpk.length > 120) return json(400, { error:"NO SPK is too long." });
    if (link && !/^https?:\/\/\S+$/i.test(link)) return json(400, { error:"SPK must be a link that starts with http:// or https://" });
    if (location.length > 300) return json(400, { error:"LOKASI TEST is too long." });
    const formulas = await getSheetRowFormulas(MAIN_ID, TAB, rowNumber, START, END), writes = [];
    for (const [key, value] of Object.entries({ date, noSpk, location, link })) {
      if (!value) continue; const index = at(FIELDS[key]);
      if (index < 0) return json(400, { error:`Column "${FIELDS[key]}" was not found in ${TAB}.` });
      if (String(live[index] ?? "").trim() === value) continue;
      // Automatic copy of a prepared letter never replaces something already typed into the sheet.
      if (body.onlyEmpty && String(live[index] ?? "").trim() !== "") continue;
      if (typeof formulas[index] === "string" && formulas[index].startsWith("=")) return json(409, { error:`${FIELDS[key]} (column ${colLetter(index)}) is calculated by a formula in this row and cannot be set from here.` });
      writes.push({ range:`${quoted}!${colLetter(index)}${rowNumber}`, values:[[value.startsWith("=") ? "'" + value : value]] });
    }
    if (!writes.length) return json(200, { success:true, rowNumber, unchanged:true });
    await writeSheetValues(MAIN_ID, writes);
    try { await addActivity(actor.username, "Update", "Psychotest (SPK)", String(rowNumber), `${name}: surat pengantar updated${noSpk ? ` (${noSpk})` : ""}`); } catch { /* the sheet write already succeeded */ }
    return json(200, { success:true, rowNumber });
  } catch (error) { return json(500, { error: error.message || "SPK update failed." }); }
};
