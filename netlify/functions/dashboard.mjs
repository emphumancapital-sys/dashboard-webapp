import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTab, listActivity } from "./_lib/sheets.mjs";

const SHEETS = {
  rec: process.env.SHEET_REC_PIPELINE || "2026 Rec Pipeline",
  newHire: process.env.SHEET_NEW_HIRE || "New Hire 2026",
  extend: process.env.SHEET_EXTEND || "Extend 2026",
  resignation: process.env.SHEET_RESIGNATION || "Resignation 2026",
  termination: process.env.SHEET_TERMINATION || "Termination 2026",
  retirement: process.env.SHEET_RETIREMENT || "Retirement 2026"
};

const norm = value => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function findHeader(headers = [], candidates = []) {
  const normalized = headers.map(norm);
  // Prefer exact header matches before partial matches to avoid selecting
  // similarly named but semantically different columns.
  for (const candidate of candidates) {
    const i = normalized.indexOf(norm(candidate));
    if (i >= 0) return i;
  }
  for (const candidate of candidates) {
    const needle = norm(candidate);
    if (needle.length < 4) continue;
    const i = normalized.findIndex(header => header && (header.includes(needle) || needle.includes(header)));
    if (i >= 0) return i;
  }
  return -1;
}

function valueAt(row, headers, candidates, fallback = "") {
  const index = findHeader(headers, candidates);
  return index < 0 ? fallback : (row[index] ?? fallback);
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  // Handle common Indonesian/Google Sheets display formats explicitly.
  let match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) {
    const a = Number(match[1]), b = Number(match[2]), y = Number(match[3]);
    const d = new Date(y, b - 1, a); // dd/MM/yyyy
    if (d.getFullYear() === y && d.getMonth() === b - 1 && d.getDate() === a) return d;
    const us = new Date(y, a - 1, b); // fallback MM/dd/yyyy
    if (us.getFullYear() === y && us.getMonth() === a - 1 && us.getDate() === b) return us;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function formatDate(date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function nonEmptyRows(rows = []) {
  return rows.filter(row => row.some(value => value !== "" && value !== null && value !== undefined));
}

function contractAlerts(sources, today, warnings) {
  const output = [];
  const endDateHeaders = [
    "contract end date", "contract end", "end date", "contract expiry", "expiry date",
    "tanggal akhir kontrak", "tgl akhir kontrak", "tanggal berakhir kontrak", "akhir kontrak",
    "end of contract", "pkwt end", "contract until", "tanggal selesai kontrak", "tgl selesai kontrak",
    "last working date contract", "contract end period"
  ];
  for (const source of sources) {
    const { headers, rows } = source.data;
    const dateIndex = findHeader(headers, endDateHeaders);
    if (dateIndex < 0) {
      warnings.push(`Kolom tanggal akhir kontrak belum terdeteksi pada tab "${source.name}". Header terbaca: ${headers.filter(Boolean).join(" | ") || "tidak ada header"}.`);
      continue;
    }
    for (const row of rows) {
      const endDate = parseDate(row[dateIndex]);
      if (!endDate) continue;
      const daysRemaining = Math.ceil((startOfDay(endDate) - today) / 86400000);
      if (daysRemaining < 0 || daysRemaining > 90) continue;
      output.push({
        employee: String(valueAt(row, headers, ["employee name", "employee", "nama karyawan", "name", "nama"]) || "—"),
        employeeId: String(valueAt(row, headers, ["employee id", "employee number", "nik", "personnel number", "no induk karyawan"]) || "—"),
        businessUnit: String(valueAt(row, headers, ["business unit", "business unit name", "division", "bu", "unit"]) || "—"),
        position: String(valueAt(row, headers, ["position", "job title", "jabatan", "position title"]) || "—"),
        endDate: formatDate(endDate),
        daysRemaining,
        source: source.name
      });
    }
  }
  return output.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function rfpAlerts(source, today, warnings) {
  const { headers, rows } = source;
  // Keep the original Recruitment Pipeline terminology first: Req Date,
  // RFP Received, Contract Type, and RFP Process.
  const dateIndex = findHeader(headers, [
    "rfp received", "req date", "request date", "tanggal request", "tgl request",
    "date", "rfp date", "date request", "received date", "open date"
  ]);
  const typeIndex = findHeader(headers, [
    "contract type", "contract", "type", "tipe", "jenis", "recruitment type",
    "request type", "jenis recruitment", "jenis permintaan", "employment type"
  ]);
  if (dateIndex < 0) {
    warnings.push(`Kolom tanggal RFP tidak terdeteksi pada tab "${SHEETS.rec}". Header terbaca: ${headers.filter(Boolean).join(" | ") || "tidak ada header"}.`);
    return [];
  }
  if (typeIndex < 0) {
    warnings.push(`Kolom Contract Type/Request Type tidak terdeteksi pada tab "${SHEETS.rec}"; reminder RFP ditahan agar tidak salah klasifikasi.`);
    return [];
  }

  const allowedTypes = new Set(["pkwt addition", "pkwt replacement", "tpc to pkwt"]);
  const output = [];
  for (const row of rows) {
    const recruitmentType = String(row[typeIndex] ?? "").trim();
    if (!allowedTypes.has(norm(recruitmentType))) continue;
    const requestDate = parseDate(row[dateIndex]);
    if (!requestDate) continue;
    const ageDays = Math.floor((today - startOfDay(requestDate)) / 86400000);
    if (ageDays < 30) continue;
    output.push({
      rfpNumber: String(valueAt(row, headers, ["rfp number", "no rfp", "request number", "no. rfp", "rfp no"]) || "—"),
      businessUnit: String(valueAt(row, headers, ["business unit", "business unit name", "division", "bu", "unit"]) || "—"),
      position: String(valueAt(row, headers, ["position", "job title", "jabatan", "manpower position", "position requested"]) || "—"),
      recruitmentType,
      requestDate: formatDate(requestDate),
      ageDays,
      status: String(valueAt(row, headers, ["rfp process", "rfp status", "status", "result", "hasil"]) || "—"),
      pic: String(valueAt(row, headers, ["pic", "recruiter", "request by", "owner", "created by"]) || "—")
    });
  }
  return output.sort((a, b) => b.ageDays - a.ageDays);
}

async function readOptionalTab(name, warnings) {
  try {
    const data = await readTab(name);
    if (!data.headers?.length) warnings.push(`Tab "${name}" berhasil diakses tetapi belum memiliki header/data.`);
    return { name, data: { headers: data.headers || [], rows: nonEmptyRows(data.rows || []) }, available: true };
  } catch (error) {
    warnings.push(`Gagal membaca tab "${name}": ${error.message || "unknown error"}. Periksa nama tab dan akses service account.`);
    return { name, data: { headers: [], rows: [] }, available: false };
  }
}

export const handler = async event => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error: "Admin authentication required." });

    const warnings = [];
    const names = [SHEETS.newHire, SHEETS.extend, SHEETS.rec, SHEETS.resignation, SHEETS.termination, SHEETS.retirement];
    const results = await Promise.all(names.map(name => readOptionalTab(name, warnings)));
    const byName = Object.fromEntries(results.map(result => [result.name, result.data]));
    const today = startOfDay(new Date());
    const currentYear = today.getFullYear();
    const newHire = byName[SHEETS.newHire] || { headers: [], rows: [] };
    const extend = byName[SHEETS.extend] || { headers: [], rows: [] };
    const rec = byName[SHEETS.rec] || { headers: [], rows: [] };

    const contracts = contractAlerts([
      { name: SHEETS.newHire, data: newHire },
      { name: SHEETS.extend, data: extend }
    ], today, warnings);
    const rfps = rfpAlerts(rec, today, warnings);
    const joinIndex = findHeader(newHire.headers, ["join date", "hire date", "tanggal join", "tgl join", "date of joining", "joining date"]);
    if (joinIndex < 0 && newHire.headers.length) warnings.push(`Kolom Join Date tidak terdeteksi pada tab "${SHEETS.newHire}"; KPI New Hires This Year ditampilkan 0.`);
    const newHiresThisYear = joinIndex < 0 ? 0 : newHire.rows.filter(row => {
      const date = parseDate(row[joinIndex]);
      return date && date.getFullYear() === currentYear;
    }).length;

    let activity = [];
    try { activity = await listActivity(10); }
    catch (error) { warnings.push(`Activity Log tidak dapat dibaca: ${error.message || "unknown error"}.`); }

    const movementRecords = ["resignation", "termination", "retirement"]
      .reduce((total, key) => total + (byName[SHEETS[key]]?.rows.length || 0), 0);

    return json(200, {
      generatedAt: new Date().toISOString(),
      currentYear,
      metrics: {
        newHireRecords: newHire.rows.length,
        contractDue: contracts.length,
        agingRfp: rfps.length,
        newHiresThisYear,
        movementRecords
      },
      contractAlerts: contracts.slice(0, 12),
      rfpAlerts: rfps.slice(0, 12),
      latestActivities: activity.slice(0, 5),
      activityHistory: activity,
      sourceStatus: results.map(result => ({ sheet: result.name, available: result.available, rows: result.data.rows.length, headers: result.data.headers })),
      warnings
    });
  } catch (error) {
    return json(500, { error: error.message || "Dashboard data unavailable" });
  }
};
