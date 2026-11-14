import { google } from "googleapis";
import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readManyTabsFromSpreadsheet } from "./_lib/sheets.mjs";
import { personKey, isDropped } from "./_lib/requests.mjs";

// Talent Database: read-only view of a separate spreadsheet. Nothing is ever written to it.
const TALENT_ID = process.env.TALENT_SHEET_ID || "1pOmWQVDkA7CHKX0f_ck4asltqWt0H-fPB8-YbL3Fnfs";
const TALENT_GID = Number(process.env.TALENT_SHEET_GID || 0);        // the tab opened by ...#gid=0
const TALENT_TAB = process.env.TALENT_SHEET_TAB || "";               // optional: tab name, overrides the gid
const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const MAX_ROWS = 10000;
// Columns the page needs, by the header names they may carry (first match wins).
const FIELDS = {
  name:      ["nama lengkap", "nama", "name", "full name", "nama kandidat", "candidate name", "candidate"],
  gender:    ["jenis kelamin", "gender"],
  education: ["latar belakang pendidikan", "education background", "pendidikan terakhir", "pendidikan", "education"],
  major:     ["jurusan", "major"],
  gradYear:  ["year of graduate", "tahun lulus", "graduation year", "year of graduation", "graduate year"],
  age:       ["usia", "age", "umur"]
};
const norm = v => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let titlePromise = null;
function serviceEmail(){ try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}").client_email || ""; } catch { return ""; } }
async function tabTitle(){
  if (TALENT_TAB) return TALENT_TAB;
  if (!titlePromise) titlePromise = (async () => {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON; if (!raw) throw new Error("Google service account is not configured.");
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(raw), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const book = await google.sheets({ version:"v4", auth }).spreadsheets.get({ spreadsheetId: TALENT_ID, fields: "sheets.properties(sheetId,title)" });
    const sheets = book.data.sheets || [], hit = sheets.find(x => x.properties?.sheetId === TALENT_GID) || sheets[0];
    if (!hit) throw new Error("The Talent Database spreadsheet has no tabs.");
    return hit.properties.title;
  })().catch(error => { titlePromise = null; throw error; });
  return titlePromise;
}

export const handler = async event => {
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error:"Admin authentication required." });
    if (event.httpMethod !== "GET") return json(405, { error:"Method not allowed" });
    const refresh = event.queryStringParameters?.refresh === "1";
    let title, values;
    try {
      title = await tabTitle();
      values = (await readManyTabsFromSpreadsheet(TALENT_ID, [{ key:"talent", title, headerRow:1, startColumn:"A", endColumn:"AZ" }], { forceRefresh: refresh })).get("talent")?.values || [];
    } catch (error) {
      const status = Number(error?.code || error?.response?.status), email = serviceEmail();
      if (status === 403 || status === 404 || /permission|not found|unable to parse/i.test(String(error.message))) return json(502, { error:`The Talent Database spreadsheet could not be opened. Share it${email ? ` with ${email}` : " with the service account"} as Viewer, then refresh.` });
      throw error;
    }
    // The header row is the one, among the first rows, that names the most of the expected columns.
    const aliasSet = new Set(Object.values(FIELDS).flat());
    let headerIndex = 0, best = -1;
    values.slice(0, 10).forEach((row, i) => { const score = row.filter(cell => aliasSet.has(norm(cell))).length; if (score > best) { best = score; headerIndex = i; } });
    const rawHeaders = (values[headerIndex] || []).map(v => String(v ?? "").trim());
    const body = values.slice(headerIndex + 1).map((row, i) => ({ row, rowNumber: headerIndex + 2 + i })).filter(x => x.row.some(v => String(v ?? "").trim() !== ""));
    // Keep columns that have a header or any data, in sheet order.
    const width = Math.max(rawHeaders.length, ...body.map(x => x.row.length), 0), keep = [];
    for (let i = 0; i < width; i++) if (rawHeaders[i] || body.some(x => String(x.row[i] ?? "").trim() !== "")) keep.push(i);
    const headers = keep.map(i => rawHeaders[i] || `Column ${i + 1}`);
    const fields = Object.fromEntries(Object.entries(FIELDS).map(([key, aliases]) => { let found = -1; for (const alias of aliases) { found = headers.findIndex(h => norm(h) === alias); if (found > -1) break; } return [key, found]; }));

    // Who is already in the pipeline, or was processed before: matched by name against the pipeline's Candidates column.
    const seen = new Map(), warnings = [];
    try {
      const pipe = (await readManyTabsFromSpreadsheet(MAIN_ID, [{ key:"p", title:"2026 Rec Pipeline", headerRow:1, startColumn:"A", endColumn:"AI" }], { forceRefresh: refresh })).get("p")?.values || [];
      const ph = (pipe[0] || []).map(norm), at = name => ph.indexOf(norm(name));
      const cName = at("Candidates"), cCode = at("RFP Code"), cProcess = at("RFP Process"), cOutcome = at("Status"), cPosition = at("Position");
      if (cName > -1) pipe.slice(1).forEach(row => {
        const key = personKey(row[cName]); if (!key) return;
        const closed = isDropped(row[cOutcome]) || /complet|done|closed|selesai|cancel/i.test(String(row[cProcess] ?? ""));
        const entry = { state: closed ? "processed" : "pipeline", code: String(row[cCode] ?? "").trim(), position: String(row[cPosition] ?? "").trim(), status: String(row[cOutcome] ?? "").trim() || String(row[cProcess] ?? "").trim() };
        const current = seen.get(key); if (!current || (current.state === "processed" && entry.state === "pipeline")) seen.set(key, entry);
      });
    } catch (error) { warnings.push(`Pipeline marks are unavailable: ${error.message || "unknown error"}`); }

    const rows = body.slice(0, MAX_ROWS).map(({ row, rowNumber }) => {
      const hit = fields.name > -1 ? seen.get(personKey(row[keep[fields.name]])) : null;
      return { n: rowNumber, v: keep.map(i => String(row[i] ?? "").trim()), ...(hit ? { f: hit.state, c: hit.code, p: hit.position, s: hit.status } : {}) };
    });
    if (body.length > MAX_ROWS) warnings.push(`Only the first ${MAX_ROWS.toLocaleString()} rows are shown.`);
    if (fields.name < 0) warnings.push("No name column was found, so pipeline marks cannot be shown.");
    return json(200, { tab: title, headers, fields, rows, total: rows.length, warnings, checkedAt: new Date().toISOString() });
  } catch (error) { return json(500, { error: error.message || "Talent Database unavailable." }); }
};
