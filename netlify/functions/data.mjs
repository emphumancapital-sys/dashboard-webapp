import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTabFromSpreadsheet } from "./_lib/sheets.mjs";

const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TALENT_ID = process.env.TALENT_DB_SPREADSHEET_ID || "1pOmWQVDkA7CHKX0f_ck4asltqWt0H-fPB8-YbL3Fnfs";
const TRAINING_ID = process.env.TRAINING_SPREADSHEET_ID || "1Yq3V7sW5sMXSG2ofT92lmHHHdxzljpfn";

// Display labels are intentionally separate from the exact source tab names.
const SOURCES = [
  { id:"rfp", label:"Request for Personnel (RFP)", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"2026 Rec Pipeline", headerRow:1, dataStartRow:2 },
  { id:"spk", label:"Psychotest (SPK)", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"SPK 2026", headerRow:1, dataStartRow:2 },
  { id:"mcu", label:"Medical Check Up (MCU)", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"MCU 2026", headerRow:1, dataStartRow:3 },
  { id:"mcu-induction", label:"MCU Induction", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"MCU Induction 2026", headerRow:1, dataStartRow:2 },
  { id:"new-hire", label:"New Hire", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"New Hire 2026", headerRow:1, dataStartRow:2 },
  { id:"extension", label:"Contract Extension", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Extend 2026", headerRow:1, dataStartRow:2 },
  { id:"resignation", label:"Resignation", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Resignation 2026", headerRow:1, dataStartRow:2 },
  { id:"termination", label:"Termination", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Termination 2026", headerRow:1, dataStartRow:2 },
  { id:"retirement", label:"Retirement", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Retirement 2026", headerRow:1, dataStartRow:2 },
  { id:"master-all", label:"Master All", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Master All", headerRow:1, dataStartRow:2 },
  { id:"new-hire-exit", label:"New Hire vs Exit", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"New Hire vs Exit", headerRow:1, dataStartRow:2 },
  { id:"pivot-dashboard", label:"Pivot Dashboard", group:"Recruitment & Staffing", spreadsheetId:MAIN_ID, tab:"Pivot Dashboard 2026", headerRow:1, dataStartRow:2 },
  { id:"talent", label:"Talent Database", group:"Talent & Learning", spreadsheetId:TALENT_ID, tab:"MASTER ALL", headerRow:1, dataStartRow:2 },
  { id:"training", label:"Training Data", group:"Talent & Learning", spreadsheetId:TRAINING_ID, tab:"2026", headerRow:6, dataStartRow:7 }
];

export const handler = async event => {
  if (event.httpMethod !== "GET") return json(405, { error:"Method not allowed" });
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401, { error:"Admin authentication required." });
    const params = event.queryStringParameters || {};
    if (params.action === "sources") {
      const results = await Promise.all(SOURCES.map(async source => {
        try {
          const data = await readTabFromSpreadsheet(source.spreadsheetId, source.tab, source.headerRow, source.dataStartRow, 1, 10);
          return { id:source.id, label:source.label, group:source.group, tab:source.tab, available:true, totalRows:data.total, totalColumns:data.headers.filter(Boolean).length, headers:data.headers, headerRow:source.headerRow, dataStartRow:source.dataStartRow, error:null };
        } catch (error) {
          return { id:source.id, label:source.label, group:source.group, tab:source.tab, available:false, totalRows:null, totalColumns:null, headers:[], headerRow:source.headerRow, dataStartRow:source.dataStartRow, error:error.message };
        }
      }));
      return json(200, { sources:results, checkedAt:new Date().toISOString(), summary:{ total:results.length, connected:results.filter(x=>x.available).length, failed:results.filter(x=>!x.available).length } });
    }
    const source = SOURCES.find(item => item.id === params.source);
    if (!source) return json(400, { error:"Unknown data source." });
    try {
      const data = await readTabFromSpreadsheet(source.spreadsheetId, source.tab, source.headerRow, source.dataStartRow, params.page, params.pageSize, params.search);
      return json(200, { source:{ id:source.id, label:source.label, group:source.group, tab:source.tab }, ...data, checkedAt:new Date().toISOString(), readOnly:true });
    } catch (error) {
      return json(502, { error:error.message, source:source.label, tab:source.tab });
    }
  } catch (error) {
    return json(500, { error:error.message || "Data integration request failed." });
  }
};
