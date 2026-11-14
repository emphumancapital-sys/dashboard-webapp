import { json, bodyOf } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { FORMS, REQUEST_OPTIONS, requestLine, parseRequests } from "./_lib/requests.mjs";
import { readManyTabsFromSpreadsheet, getSheetRowFormulas, getSheetCrudMetadata, writeSheetValues, clearSheetValues, addActivity, inferColumnMeta, toIsoDate, ensureSheetRowExists, copyFormulaColumnsFromPrevious, getSheetMerges, mergeAt, mergeLabel } from "./_lib/sheets.mjs";

// Hiring Pipeline: a stage view over the recruitment pipeline tab.
// A request's stage is the right-most stage column that holds a value, so the sheet stays the single source of truth.
const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TAB = "2026 Rec Pipeline", HEADER_ROW = 1, DATA_START = 2, START = "A", END = "AI";
const STATUS = { header:"RFP Process", fallback:"Q" };
// Candidate outcome for the row. "Failed" here means this candidate dropped out; the row stays as history.
const OUTCOME = { header:"Status", fallback:"AG" };
export const isFailed = v => /fail|gagal/i.test(String(v ?? ""));
const NEGO_TAG = "Nego", FAIL_TAG = "Failed";
// Formula columns of the pipeline tab (same list as data.mjs); copied down when a row is created.
const FORMULA_COLUMNS = ["A","B","C","R","Y","Z","AA","AB","AC","AF","AH"];
// RFP intake tab. Its formula columns are never copied into the pipeline.
const RFP = { tab:"RFP 2026", headerRow:1, dataStart:2, start:"A", end:"S", formulaColumns:["A","B","C","R","S"] };
// manual = the app writes a date into the column. auto = formula columns fed by another tab; never written here.
const STAGES = [
  { key:"first",     label:"1st Interview", mode:"manual", columns:[{ header:"1st Intv", fallback:"U" }] },
  { key:"second",    label:"2nd Interview", mode:"manual", columns:[{ header:"2nd Intv", fallback:"V" }] },
  { key:"offerIn",   label:"Offering In",   mode:"manual", columns:[{ header:"Offering In", fallback:"W" }] },
  { key:"offerDone", label:"Offering Done", mode:"manual", columns:[{ header:"Offering Done", fallback:"X" }] },
  { key:"psikotest", label:"Psikotest",     mode:"auto", source:"SPK 2026", columns:[{ header:"Psychological Test", fallback:"Y", name:"Test" }, { header:"Psikotest Vendor", fallback:"Z", name:"Vendor", detailOnly:true }, { header:"Psikotest Results", fallback:"AA", name:"Result" }] },
  { key:"mcu",       label:"MCU",           mode:"auto", source:"MCU 2026", columns:[{ header:"MCU", fallback:"AB", name:"MCU" }, { header:"MCU Results", fallback:"AC", name:"Result" }] },
  { key:"join",      label:"Join Date",     mode:"manual", columns:[{ header:"Join Date", fallback:"AD" }] }
];
const INFO = { code:"RFP Code", position:"Position", businessUnit:"Business Unit", department:"Department", division:"Division", contract:"Contract", location:"Location", requiredPerson:"Required Person", candidates:"Candidates", received:"RFP Received", hiringDate:"Hiring Date Request", initiator:"Initiator", reason:"Reason", completionDays:"Completion Days", remarks:"Remarks" };

const norm = v => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function colIndex(letter){ let n = 0; for (const c of String(letter).toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; }
function colLetter(index){ let n = index + 1, s = ""; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
const quoted = `'${TAB.replace(/'/g, "''")}'`;
// Formula columns often show a placeholder instead of an empty cell.
const filled = v => { const s = String(v ?? "").trim(); return !!s && !/^(#.*|-+|—|0|n\/a|false)$/i.test(s); };
export function statusGroup(value){
  const s = String(value ?? "").trim(); if (!s) return "other";
  if (/\b(not|un|in)\s*-?\s*complet/i.test(s)) return "ongoing";
  if (/complet|done|closed?|selesai|finish|fulfilled/i.test(s)) return "completed";
  if (/on\s*-?\s*going|progress|open|proses|berjalan/i.test(s)) return "ongoing";
  return "other";
}
function resolveColumns(headers){
  const find = (header, fallback) => { const i = headers.findIndex(h => norm(h) === norm(header)); return i > -1 ? i : (fallback ? colIndex(fallback) : -1); };
  return {
    status: find(STATUS.header, STATUS.fallback),
    outcome: find(OUTCOME.header, OUTCOME.fallback),
    info: Object.fromEntries(Object.entries(INFO).map(([key, header]) => [key, find(header)])),
    stages: STAGES.map(stage => ({ ...stage, columns: stage.columns.map(c => ({ ...c, index: find(c.header, c.fallback) })) }))
  };
}
async function readTab(forceRefresh){
  const data = await readManyTabsFromSpreadsheet(MAIN_ID, [{ key:"pipeline", title:TAB, headerRow:HEADER_ROW, startColumn:START, endColumn:END }, { key:"rfp", title:RFP.tab, headerRow:RFP.headerRow, startColumn:RFP.start, endColumn:RFP.end }], { forceRefresh });
  const values = data.get("pipeline")?.values || [];
  const rfpValues = data.get("rfp")?.values || [], rfpHeaders = (rfpValues[0] || []).map(v => String(v ?? "").trim());
  const rfpCol = name => rfpHeaders.findIndex(h => norm(h) === norm(name));
  const rfpRows = rfpValues.slice(RFP.dataStart - RFP.headerRow).map((row, i) => ({ row, rowNumber: RFP.dataStart + i })).filter(r => filled(r.row[rfpCol("RFP Code")]));
  const headers = (values[0] || []).map(v => String(v ?? "").trim());
  const cols = resolveColumns(headers);
  const records = values.slice(DATA_START - HEADER_ROW).map((row, i) => ({ row, rowNumber: DATA_START + i })).filter(r => filled(r.row[cols.info.code]) || filled(r.row[cols.info.position]));
  return { headers, cols, records, values, rfp: { headers: rfpHeaders, rows: rfpRows, col: rfpCol } };
}
// Pick the spelling the sheet already uses for a value in one column: dropdown options first, then existing rows.
async function sheetValueFor(columnIndex, matches, records){
  let value = "";
  try { const metaInfo = await getSheetCrudMetadata(MAIN_ID, TAB, HEADER_ROW, DATA_START, START, END); value = (metaInfo.columns?.[columnIndex]?.validation?.options || []).map(String).find(matches) || ""; } catch { /* fall back to values already used in the column */ }
  if (!value) { const seen = new Map(); for (const r of records) { const v = String(r.row[columnIndex] ?? "").trim(); if (matches(v)) seen.set(v, (seen.get(v) || 0) + 1); } value = [...seen.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || ""; }
  return value;
}
const statusValueFor = (wanted, cols, records) => sheetValueFor(cols.status, v => statusGroup(v) === wanted, records);
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const tagDate = iso => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
// Adds one dated line to Remarks, keeping whatever is already there.
function remarksWrite(cols, rowNumber, live, line){
  const index = cols.info.remarks; if (index < 0) throw new Error(`Column "Remarks" was not found in ${TAB}.`);
  const current = String(live[index] ?? "").trim(), text = current ? `${current}\n${line}` : line;
  return { range:`${quoted}!${colLetter(index)}${rowNumber}`, values:[[text.startsWith("=") ? "'" + text : text]] };
}
// Creates one pipeline row for `code` below the last record. `valueOf(header)` supplies the value for each shared column.
// Returns { rowNumber } on success or { status, error } when refused; a refusal leaves the tab as it was.
async function createPipelineRow(code, valueOf, tabData, candidate = ""){
  const { headers, cols, records, values, rfp } = tabData;
  const ongoing = await statusValueFor("ongoing", cols, records);
  if (cols.status > -1 && !ongoing) return { status:422, error:`No "ongoing" value was found in the ${STATUS.header} dropdown or in existing rows, so the app will not guess one. Set it once in the sheet and try again.` };
  // A row is free when every non-formula cell in A:AI is empty, so a notes or total row is never written over.
  const formulaIndexes = new Set(FORMULA_COLUMNS.map(colIndex));
  const rowIsFree = n => (values[n - HEADER_ROW] || []).every((v, i) => formulaIndexes.has(i) || String(v ?? "").trim() === "");
  // Always append below the last existing record; an empty row in the middle of the data is never reused.
  let rowNumber = records.reduce((max, r) => Math.max(max, r.rowNumber), DATA_START - 1) + 1; while (rowNumber <= 10000 && !rowIsFree(rowNumber)) rowNumber++;
  if (rowNumber > 10000) return { status:400, error:"No free row was found in the pipeline tab." };
  const metaInfo = await getSheetCrudMetadata(MAIN_ID, TAB, HEADER_ROW, DATA_START, START, END);
  // Preparing the row (formulas) happens before any value is written, so a failure here leaves the data untouched.
  let merges = [];
  // Remember which formula cells were empty beforehand, so a refused request can put the row back exactly as it was.
  let before = []; try { before = await getSheetRowFormulas(MAIN_ID, TAB, rowNumber, START, END); } catch { before = []; }
  const undoFormulas = async () => { const ranges = FORMULA_COLUMNS.filter(letter => String(before[colIndex(letter)] ?? "") === "").map(letter => `${quoted}!${letter}${rowNumber}`); if (ranges.length) { try { await clearSheetValues(MAIN_ID, ranges); } catch { /* best effort */ } } };
  try {
    await ensureSheetRowExists(MAIN_ID, metaInfo.sheetId, rowNumber, START, END);
    merges = await getSheetMerges(MAIN_ID, metaInfo.sheetId);
    await copyFormulaColumnsFromPrevious(MAIN_ID, metaInfo.sheetId, TAB, DATA_START, rowNumber, FORMULA_COLUMNS);
  } catch (error) {
    const inRow = merges.filter(m => rowNumber - 1 >= m.startRowIndex && rowNumber - 1 < m.endRowIndex && m.startColumnIndex <= colIndex(END)).map(mergeLabel);
    const message = String(error.message || "unknown error");
    return { status:409, error: /Nothing was written/.test(message) ? message : `Could not prepare row ${rowNumber} of ${TAB}: ${message}${inRow.length ? ` Merged cells in that row: ${inRow.join(", ")}.` : ""} Nothing was written.` };
  }
  // A value written into a merged cell that is not the merge's top-left cell is silently dropped by Sheets, so refuse instead.
  const dropped = col => { const m = mergeAt(merges, rowNumber - 1, col); return m && (m.startRowIndex !== rowNumber - 1 || m.startColumnIndex !== col) ? m : null; };
  const formulas = await getSheetRowFormulas(MAIN_ID, TAB, rowNumber, START, END);
  // Fill every column the RFP tab and the pipeline tab share by name, skipping formula columns on either side.
  const rfpFormula = new Set(RFP.formulaColumns.map(colIndex)), writes = [], blocked = [];
  rfp.headers.forEach((header, i) => {
    if (!header || rfpFormula.has(i)) return; const target = headers.findIndex(h => norm(h) === norm(header));
    if (target < 0 || target === cols.status || target === cols.outcome || isFormula(formulas[target]) || FORMULA_COLUMNS.includes(colLetter(target))) return;
    const value = String(valueOf(header, target) ?? "").trim(); if (value && dropped(target)) blocked.push(`${header} (${mergeLabel(dropped(target))})`); else if (value) writes.push({ range:`${quoted}!${colLetter(target)}${rowNumber}`, values:[[value.startsWith("=") ? "'" + value : value]] });
  });
  if (cols.status > -1 && !isFormula(formulas[cols.status])) writes.push({ range:`${quoted}!${colLetter(cols.status)}${rowNumber}`, values:[[ongoing]] });
  // Candidate's name, when given, goes into the Candidates column of the new row.
  if (candidate) {
    const index = cols.info.candidates;
    if (index < 0) { await undoFormulas(); return { status:400, error:`Column "Candidates" was not found in ${TAB}. Nothing was written.` }; }
    if (isFormula(formulas[index])) { await undoFormulas(); return { status:409, error:`Candidates (column ${colLetter(index)}) is calculated by a formula in the new row, so a name cannot be written there. Nothing was written.` }; }
    if (dropped(index)) blocked.push(`Candidates (${mergeLabel(dropped(index))})`); else writes.push({ range:`${quoted}!${colLetter(index)}${rowNumber}`, values:[[candidate.startsWith("=") ? "'" + candidate : candidate]] });
  }
  // If RFP Code is not a formula in the new row, carry the existing code over as text (it is never generated here).
  if (!isFormula(formulas[cols.info.code])) writes.push({ range:`${quoted}!${colLetter(cols.info.code)}${rowNumber}`, values:[[code]] });
  if (blocked.length) { await undoFormulas(); return { status:409, error:`Row ${rowNumber} of ${TAB} has merged cells that would swallow these values: ${blocked.join(", ")}. Unmerge them in the sheet, then try again. Nothing was written.` }; }
  if (!writes.length) { await undoFormulas(); return { status:400, error:"No matching columns were found between the RFP tab and the pipeline tab." }; }
  await writeSheetValues(MAIN_ID, writes);
  // Safety check: the new row must resolve to this RFP's code. If the sheet's formula says otherwise, undo and report.
  const after = String((await readLiveRow(rowNumber))[cols.info.code] ?? "").trim();
  if (after !== code) {
    await clearSheetValues(MAIN_ID, writes.map(w => w.range)); await undoFormulas();
    return { status:409, error:`The new pipeline row (row ${rowNumber}) showed RFP Code "${after || "empty"}" instead of "${code}", so the row was emptied again. The RFP Code formula in ${TAB} needs a row in a specific position; add this one in the sheet.` };
  }
  return { rowNumber };
}
// Send one RFP from the intake tab into the pipeline tab as a new row.
async function sendToPipeline(actor, body){
  const rfpRow = Number(body.rfpRowNumber), code = String(body.code ?? "").trim();
  if (!Number.isInteger(rfpRow) || rfpRow < RFP.dataStart || rfpRow > 10000 || !code) return json(400, { error:"Invalid RFP row." });
  const tabData = await readTab(true), { cols, records, rfp } = tabData;
  const source = rfp.rows.find(r => r.rowNumber === rfpRow);
  if (!source || String(source.row[rfp.col("RFP Code")] ?? "").trim() !== code) return json(409, { error:"This row no longer matches the RFP you selected (the sheet was changed). Refresh and try again." });
  // A row whose candidate failed is history; only a live row blocks sending the same RFP again.
  const existing = records.find(r => String(r.row[cols.info.code] ?? "").trim() === code && !isFailed(r.row[cols.outcome]));
  if (existing) return json(409, { error:`${code} is already in ${TAB} (row ${existing.rowNumber}).`, rowNumber: existing.rowNumber });
  const candidate = String(body.candidate ?? "").trim().replace(/\s+/g, " ");
  if (candidate.length > 120) return json(400, { error:"Keep the candidate's name under 120 characters." });
  const created = await createPipelineRow(code, header => source.row[rfp.col(header)], tabData, candidate);
  if (created.error) return json(created.status, { error: /^Could not|^Row |^No /.test(created.error) ? created.error : `Not sent. ${created.error}` });
  await logActivity(actor, code, `${code}: sent to pipeline (row ${created.rowNumber})${candidate ? ` with candidate ${candidate}` : ""}`);
  return json(201, { success:true, rowNumber: created.rowNumber, code });
}

async function readLiveRow(rowNumber){
  const data = await readManyTabsFromSpreadsheet(MAIN_ID, [{ key:"row", title:TAB, headerRow:rowNumber, endRow:rowNumber, startColumn:START, endColumn:END }], { forceRefresh:true });
  return data.get("row")?.values?.[0] || [];
}
const isFormula = v => typeof v === "string" && v.startsWith("=");
const validIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
async function logActivity(actor, code, summary){ try { await addActivity(actor.username, "Update", "Hiring Pipeline", code, summary); } catch { /* the sheet write already succeeded; never fail it on the audit entry */ } }

export const handler = async event => {
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error:"Admin authentication required." });
    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      const { cols, records, rfp } = await readTab(params.refresh === "1");
      const width = colIndex(END) + 1;
      const meta = inferColumnMeta(records.map(r => ({ row: Array.from({ length: width }, (_, i) => r.row[i] ?? "") })), width);
      const iso = (row, index) => index < 0 ? "" : toIsoDate(row[index], meta[index]?.dateOrder);
      const text = (row, index) => index < 0 ? "" : String(row[index] ?? "").trim();
      const today = Date.now(), counts = new Map(), cards = [];
      // Earlier candidates that failed for the same RFP, and the codes that still have a live row.
      const failedByCode = new Map(), liveCodes = new Set();
      for (const { row } of records) { const c = text(row, cols.info.code); if (!c) continue; if (isFailed(text(row, cols.outcome))) failedByCode.set(c, (failedByCode.get(c) || 0) + 1); else liveCodes.add(c); }
      for (const { row, rowNumber } of records) {
        const status = text(row, cols.status), outcome = text(row, cols.outcome), failed = isFailed(outcome), group = failed ? "failed" : statusGroup(status);
        counts.set(status, (counts.get(status) || 0) + 1);
        if (group === "other") continue;
        const stages = {}; let current = null;
        for (const stage of cols.stages) {
          const parts = stage.columns.map(c => ({ name:c.name || stage.label, value: filled(row[c.index]) ? text(row, c.index) : "", iso: filled(row[c.index]) ? iso(row, c.index) : "", detailOnly: !!c.detailOnly }));
          const reached = parts.some(p => p.value && !p.detailOnly);
          stages[stage.key] = { reached, value: parts[0].value, iso: parts[0].iso, ...(stage.mode === "auto" ? { parts: parts.map(({ name, value, iso }) => ({ name, value, iso })) } : {}) };
          if (reached) current = stage.key;
        }
        const receivedIso = iso(row, cols.info.received);
        const info = Object.fromEntries(Object.keys(INFO).map(key => [key, text(row, cols.info[key])]));
        const remarkLines = info.remarks.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        cards.push({ rowNumber, ...info, receivedIso, hiringDateIso: iso(row, cols.info.hiringDate), status, outcome, group, stage: current, stages,
          requests: parseRequests(info.remarks),
          negotiations: remarkLines.filter(x => x.startsWith(`[${NEGO_TAG} `)).length, lastNote: remarkLines[remarkLines.length - 1] || "",
          failedBefore: group === "failed" ? 0 : (failedByCode.get(info.code) || 0),
          daysOpen: receivedIso ? Math.max(0, Math.floor((today - Date.parse(receivedIso + "T00:00:00Z")) / 86400000)) : null });
      }
      return json(200, {
        tab: TAB, statusHeader: STATUS.header,
        stages: cols.stages.map(s => ({ key:s.key, label:s.label, mode:s.mode, source:s.source || null, column: s.columns[0].index > -1 ? colLetter(s.columns[0].index) : null })),
        cards, codes: [...liveCodes], outcomeHeader: OUTCOME.header, forms: FORMS, requestOptions: REQUEST_OPTIONS,
        // RFPs in the intake tab that have no row in the pipeline tab yet.
        unsent: (() => { const inPipeline = liveCodes; const get = (row, name) => { const i = rfp.col(name); return i < 0 ? "" : String(row[i] ?? "").trim(); }; return rfp.rows.filter(r => !inPipeline.has(get(r.row, "RFP Code"))).map(r => ({ rowNumber: r.rowNumber, code: get(r.row, "RFP Code"), position: get(r.row, "Position"), businessUnit: get(r.row, "Business Unit"), received: get(r.row, "RFP Received"), failedBefore: failedByCode.get(get(r.row, "RFP Code")) || 0 })).reverse(); })(),
        rfpTab: RFP.tab, statusValues: [...counts.entries()].map(([value, count]) => ({ value, count, group: statusGroup(value) })).sort((a, b) => b.count - a.count),
        checkedAt: new Date().toISOString()
      });
    }

    if (!["PATCH", "POST"].includes(event.httpMethod)) return json(405, { error:"Method not allowed" });
    const body = bodyOf(event);
    if (event.httpMethod === "POST" && body.action === "send") return await sendToPipeline(actor, body);
    const rowNumber = Number(body.rowNumber), code = String(body.code ?? "").trim();
    if (!Number.isInteger(rowNumber) || rowNumber < DATA_START || rowNumber > 10000) return json(400, { error:"Invalid row number." });
    const { cols, records } = await readTab(false);
    // Rows are addressed by sheet row number, so confirm the row still holds the same request before touching it.
    const live = await readLiveRow(rowNumber);
    const liveCode = String(live[cols.info.code] ?? "").trim();
    if (!code || liveCode !== code) return json(409, { error:"This row no longer matches the request you opened (the sheet was changed). Refresh the pipeline and try again." });
    const formulas = await getSheetRowFormulas(MAIN_ID, TAB, rowNumber, START, END);
    const liveStatus = String(live[cols.status] ?? "").trim();

    if (event.httpMethod === "PATCH") {
      // Set or clear stage dates: { values: { first:"2026-11-13", offerIn:"" } }
      if (statusGroup(liveStatus) === "completed") return json(409, { error:"This request is already completed. Reopen it before changing its stages." });
      if (isFailed(live[cols.outcome])) return json(409, { error:"This candidate is marked as failed, so the row is kept as history and its stages cannot be changed." });
      const entries = Object.entries(body.values || {});
      if (!entries.length) return json(400, { error:"No stage changes were submitted." });
      const writes = [], clears = [];
      for (const [key, raw] of entries) {
        const stage = cols.stages.find(s => s.key === key), value = String(raw ?? "").trim();
        if (!stage) return json(400, { error:"Unknown stage." });
        if (stage.mode !== "manual") return json(400, { error:`${stage.label} is filled automatically from ${stage.source} and cannot be set here.` });
        const index = stage.columns[0].index;
        if (index < 0) return json(400, { error:`Column for ${stage.label} was not found in ${TAB}.` });
        if (isFormula(formulas[index])) return json(400, { error:`${stage.label} (column ${colLetter(index)}) contains a formula in this row and cannot be edited.` });
        if (value && !validIso(value)) return json(400, { error:`${stage.label} must be a valid date.` });
        const range = `${quoted}!${colLetter(index)}${rowNumber}`;
        if (value) writes.push({ range, values:[[value]] }); else if (String(live[index] ?? "") !== "") clears.push(range);
      }
      if (writes.length) await writeSheetValues(MAIN_ID, writes);
      if (clears.length) await clearSheetValues(MAIN_ID, clears);
      // Describe where the request now stands, for the audit trail.
      const after = cols.stages.filter(s => { const v = body.values?.[s.key]; return v !== undefined ? !!String(v).trim() : s.columns.some(c => !c.detailOnly && filled(live[c.index])); }).pop();
      await logActivity(actor, code, `${code}: stage set to ${after ? after.label : "Sourcing"}`);
      return json(200, { success:true, rowNumber, stage: after ? after.key : null });
    }

    if (body.action === "clearRequest") {
      // A finished Psikotest or MCU request: remove its line(s) from Remarks and keep every other line as it is.
      const kind = body.kind === "mcu" ? "MCU" : body.kind === "psikotest" ? "Psikotest" : null, index = cols.info.remarks;
      if (!kind || index < 0) return json(400, { error:"Unknown request." });
      const lines = String(live[index] ?? "").split(/\r?\n/), kept = lines.filter(line => !line.trim().startsWith(`[${kind} `));
      if (kept.length === lines.length) return json(200, { success:true, rowNumber, unchanged:true });
      if (isFormula(formulas[index])) return json(409, { error:"Remarks is calculated by a formula in this row." });
      const text = kept.join("\n").trim(), range = `${quoted}!${colLetter(index)}${rowNumber}`;
      if (text) await writeSheetValues(MAIN_ID, [{ range, values:[[text.startsWith("=") ? "'" + text : text]] }]); else await clearSheetValues(MAIN_ID, [range]);
      await logActivity(actor, code, `${code}: ${kind} request finished, note removed from Remarks`);
      return json(200, { success:true, rowNumber });
    }

    if (body.action === "request") {
      // Psikotest or MCU request: one dated line in Remarks. The stage columns themselves are formulas fed by the SPK and MCU tabs.
      const kind = body.kind === "mcu" ? "mcu" : body.kind === "psikotest" ? "psikotest" : null;
      if (!kind) return json(400, { error:"Unknown request." });
      if (isFailed(live[cols.outcome])) return json(409, { error:"This candidate is marked as failed." });
      if (statusGroup(liveStatus) === "completed") return json(409, { error:"This request is already completed." });
      const date = String(body.date ?? "").trim(), location = String(body.location ?? "").trim(), testType = String(body.testType ?? "").trim(), service = String(body.service ?? "").trim();
      if (!validIso(date)) return json(400, { error:"Pick a valid date." });
      if (kind === "psikotest") {
        if (!REQUEST_OPTIONS.locations.includes(location)) return json(400, { error:"Choose a test location from the list." });
        if (!REQUEST_OPTIONS.testTypes.includes(testType)) return json(400, { error:"Choose Seleksi or Promosi." });
        if (!REQUEST_OPTIONS.services.includes(service)) return json(400, { error:"Choose Standard or Quick." });
      }
      await writeSheetValues(MAIN_ID, [remarksWrite(cols, rowNumber, live, requestLine(kind, { date, location, testType, service }))]);
      await logActivity(actor, code, kind === "mcu" ? `${code}: MCU requested` : `${code}: psikotest requested (${testType}, ${service})`);
      return json(200, { success:true, rowNumber, kind });
    }

    if (body.action === "negotiate" || body.action === "fail") {
      const note = String(body.note ?? "").trim().replace(/\s+/g, " "), date = String(body.date ?? "").trim();
      if (!note) return json(400, { error: body.action === "fail" ? "Enter the reason." : "Enter a short note about the negotiation." });
      if (note.length > 500) return json(400, { error:"Keep the note under 500 characters." });
      if (!validIso(date)) return json(400, { error:"Pick a valid date." });
      if (isFailed(live[cols.outcome])) return json(409, { error:"This candidate is already marked as failed." });
      if (statusGroup(liveStatus) === "completed") return json(409, { error:"This request is already completed." });
      const stageNow = cols.stages.filter(s => s.columns.some(c => !c.detailOnly && filled(live[c.index]))).pop();
      if (body.action === "negotiate") {
        // Renegotiation: the card stays where it is; one dated line is added to Remarks.
        await writeSheetValues(MAIN_ID, [remarksWrite(cols, rowNumber, live, `[${NEGO_TAG} ${tagDate(date)}] ${note}`)]);
        await logActivity(actor, code, `${code}: negotiation noted`);
        return json(200, { success:true, rowNumber });
      }
      // Failed: this row becomes history (candidate, dates and reason stay), and optionally a new row continues the RFP.
      if (cols.outcome < 0) return json(400, { error:`Column "${OUTCOME.header}" was not found in ${TAB}.` });
      if (isFormula(formulas[cols.outcome])) return json(409, { error:`${OUTCOME.header} (column ${colLetter(cols.outcome)}) is calculated by a formula in this row and cannot be set from here.` });
      const failedValue = await sheetValueFor(cols.outcome, isFailed, records);
      if (!failedValue) return json(422, { error:`No "Failed" value was found in the ${OUTCOME.header} dropdown or in existing rows, so the app will not guess one. Set it once in the sheet and try again.` });
      await writeSheetValues(MAIN_ID, [{ range:`${quoted}!${colLetter(cols.outcome)}${rowNumber}`, values:[[failedValue]] }, remarksWrite(cols, rowNumber, live, `[${FAIL_TAG} ${tagDate(date)} · ${stageNow ? stageNow.label : "Sourcing"}] ${note}`)]);
      await logActivity(actor, code, `${code}: candidate marked ${failedValue} at ${stageNow ? stageNow.label : "Sourcing"}`);
      if (!body.continue) return json(200, { success:true, rowNumber, value: failedValue, newRow: null });
      // Continue the same RFP with the next candidate: a fresh row carrying the request details, no candidate, no stage dates.
      const tabData = await readTab(true);
      const nextCandidate = String(body.candidate ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      const created = await createPipelineRow(code, (header, target) => live[target], tabData, nextCandidate);
      if (created.error) return json(200, { success:true, rowNumber, value: failedValue, newRow: null, warning:`The candidate was marked ${failedValue}, but the new row for the next candidate was not created. ${created.error}` });
      await logActivity(actor, code, `${code}: new row ${created.rowNumber} for the next candidate`);
      return json(200, { success:true, rowNumber, value: failedValue, newRow: created.rowNumber });
    }

    // POST { action: "complete" | "reopen" } switches the status column, reusing a spelling the sheet already uses.
    const action = body.action === "reopen" ? "reopen" : body.action === "complete" ? "complete" : null;
    if (!action) return json(400, { error:"Unknown action." });
    const wanted = action === "complete" ? "completed" : "ongoing", index = cols.status;
    if (index < 0) return json(400, { error:`Column "${STATUS.header}" was not found in ${TAB}.` });
    if (isFormula(formulas[index])) return json(409, { formulaManaged:true, error:`${STATUS.header} (column ${colLetter(index)}) is calculated by a formula in this row, so it updates by itself and cannot be set from here.` });
    if (statusGroup(liveStatus) === wanted) return json(200, { success:true, rowNumber, value: liveStatus, unchanged:true });
    const value = await statusValueFor(wanted, cols, records);
    if (!value) return json(422, { error:`No "${wanted}" value was found in the ${STATUS.header} dropdown or in existing rows, so the app will not guess one. Set it once in the sheet and try again.` });
    await writeSheetValues(MAIN_ID, [{ range:`${quoted}!${colLetter(index)}${rowNumber}`, values:[[value]] }]);
    await logActivity(actor, code, `${code}: ${STATUS.header} set to ${value}`);
    return json(200, { success:true, rowNumber, value });
  } catch (error) { return json(500, { error: error.message || "Pipeline operation failed." }); }
};
