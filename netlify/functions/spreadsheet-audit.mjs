import { google } from "googleapis";
import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const MAX_GRID_ROWS = 2000;
const MAX_GRID_COLUMNS = 80;
const MAX_FORMULA_SAMPLES_PER_TAB = 250;

function getClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured.");
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  return google.sheets({ version: "v4", auth });
}

function colToA1(columnIndex) {
  let n = columnIndex + 1, result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function quoteSheet(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function safeRangeFromValidation(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  // Accept common A1 ranges, optionally quoted sheet names. Reject formulas/functions.
  if (!value.includes("!") || value.startsWith("=") || value.includes("(")) return null;
  return value;
}

function compactValidation(rule) {
  const condition = rule.condition || {};
  return {
    conditionType: condition.type || "UNKNOWN",
    conditionValues: (condition.values || []).map(item => ({
      userEnteredValue: item.userEnteredValue ?? null,
      relativeDate: item.relativeDate ?? null
    })),
    strict: rule.strict ?? null,
    showCustomUi: rule.showCustomUi ?? null,
    inputMessage: rule.inputMessage ?? null
  };
}

export const handler = async event => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error: "Admin authentication required." });

    const sheets = getClient();
    const metadataResponse = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      includeGridData: false,
      fields: "spreadsheetId,properties(title),namedRanges(namedRangeId,name,range),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)))"
    });

    const spreadsheet = metadataResponse.data;
    const sheetMeta = (spreadsheet.sheets || []).map(item => {
      const p = item.properties || {};
      const grid = p.gridProperties || {};
      return {
        sheetId: p.sheetId,
        title: p.title,
        index: p.index,
        hidden: Boolean(p.hidden),
        grid: {
          rowCount: grid.rowCount || 0,
          columnCount: grid.columnCount || 0,
          frozenRowCount: grid.frozenRowCount || 0,
          frozenColumnCount: grid.frozenColumnCount || 0
        }
      };
    });

    const ranges = sheetMeta.map(meta => {
      const rows = Math.min(meta.grid.rowCount || 1, MAX_GRID_ROWS);
      const cols = Math.min(meta.grid.columnCount || 1, MAX_GRID_COLUMNS);
      return `${quoteSheet(meta.title)}!A1:${colToA1(cols - 1)}${rows}`;
    });

    // Request only formulas and validation metadata. Literal cell contents (including employee data)
    // are deliberately excluded from the audit export.
    const gridResponse = ranges.length ? await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      ranges,
      includeGridData: true,
      fields: "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue(userEnteredFormula),dataValidation))))"
    }) : { data: { sheets: [] } };

    const tabAudits = [];
    const validationSourceRanges = new Set();
    let truncatedTabs = 0;

    for (const tab of (gridResponse.data.sheets || [])) {
      const title = tab.properties?.title || "Unknown";
      const meta = sheetMeta.find(item => item.title === title);
      const validationMap = new Map();
      const formulaSamples = [];
      let formulaCount = 0;
      let validationCellCount = 0;

      for (const block of (tab.data || [])) {
        const baseRow = block.startRow || 0;
        const baseCol = block.startColumn || 0;
        (block.rowData || []).forEach((row, rowOffset) => {
          (row.values || []).forEach((cell, colOffset) => {
            const rowNumber = baseRow + rowOffset + 1;
            const colNumber = baseCol + colOffset;
            const cellA1 = `${colToA1(colNumber)}${rowNumber}`;
            const formula = cell.userEnteredValue?.userEnteredFormula;
            if (formula) {
              formulaCount++;
              if (formulaSamples.length < MAX_FORMULA_SAMPLES_PER_TAB) {
                formulaSamples.push({ cell: cellA1, formula });
              }
            }
            const rule = cell.dataValidation;
            if (rule) {
              validationCellCount++;
              const compact = compactValidation(rule);
              const key = JSON.stringify(compact);
              if (!validationMap.has(key)) {
                validationMap.set(key, {
                  ...compact,
                  sampleCells: [],
                  cellCount: 0
                });
              }
              const item = validationMap.get(key);
              item.cellCount++;
              if (item.sampleCells.length < 12) item.sampleCells.push(cellA1);
              if (compact.conditionType === "ONE_OF_RANGE") {
                const source = safeRangeFromValidation(compact.conditionValues[0]?.userEnteredValue);
                if (source) validationSourceRanges.add(source);
              }
            }
          });
        });
      }

      const rowLimit = Math.min(meta?.grid.rowCount || 0, MAX_GRID_ROWS);
      const colLimit = Math.min(meta?.grid.columnCount || 0, MAX_GRID_COLUMNS);
      if ((meta?.grid.rowCount || 0) > MAX_GRID_ROWS || (meta?.grid.columnCount || 0) > MAX_GRID_COLUMNS) truncatedTabs++;

      tabAudits.push({
        title,
        hidden: Boolean(meta?.hidden),
        grid: meta?.grid || null,
        scannedGrid: { rows: rowLimit, columns: colLimit },
        validationCellCount,
        validations: [...validationMap.values()],
        formulaCount,
        formulaSamples,
        formulaSamplesTruncated: formulaCount > formulaSamples.length
      });
    }

    const validationSourceValues = [];
    for (const range of [...validationSourceRanges].slice(0, 100)) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range,
          valueRenderOption: "FORMATTED_VALUE"
        });
        validationSourceValues.push({
          range,
          values: (response.data.values || []).flat().map(value => String(value ?? "")).filter(Boolean).slice(0, 500)
        });
      } catch (error) {
        validationSourceValues.push({ range, error: error.message || "Unable to read validation source range." });
      }
    }

    const report = {
      auditVersion: 1,
      generatedAt: new Date().toISOString(),
      spreadsheet: {
        id: spreadsheet.spreadsheetId,
        title: spreadsheet.properties?.title || null
      },
      privacy: {
        mode: "metadata-and-formulas-only",
        literalCellContentsExcluded: true,
        note: "Only values referenced by dropdown validation source ranges are included so dropdown options can be audited. Ordinary employee/business cell values are not exported."
      },
      limits: {
        maxRowsScannedPerTab: MAX_GRID_ROWS,
        maxColumnsScannedPerTab: MAX_GRID_COLUMNS,
        tabsBeyondGridLimit: truncatedTabs,
        maxFormulaSamplesPerTab: MAX_FORMULA_SAMPLES_PER_TAB,
        maxValidationSourceRanges: 100,
        maxOptionsPerSourceRange: 500
      },
      summary: {
        totalTabs: sheetMeta.length,
        hiddenTabs: sheetMeta.filter(item => item.hidden).length,
        tabsWithValidations: tabAudits.filter(item => item.validationCellCount > 0).length,
        totalValidationCells: tabAudits.reduce((sum, item) => sum + item.validationCellCount, 0),
        totalFormulaCells: tabAudits.reduce((sum, item) => sum + item.formulaCount, 0),
        namedRanges: (spreadsheet.namedRanges || []).length
      },
      tabs: tabAudits,
      namedRanges: (spreadsheet.namedRanges || []).map(item => ({
        name: item.name,
        namedRangeId: item.namedRangeId,
        range: item.range
      })),
      validationSourceValues
    };

    return json(200, report, { "Content-Disposition": 'attachment; filename="emp-hcs-spreadsheet-audit.json"' });
  } catch (error) {
    const status = Number(error?.code || error?.response?.status);
    const message = status === 403
      ? "Google Sheets API access denied. Check that the Netlify service account has access to the spreadsheet."
      : (error.message || "Spreadsheet audit failed.");
    return json(status === 403 ? 403 : 500, { error: message });
  }
};
