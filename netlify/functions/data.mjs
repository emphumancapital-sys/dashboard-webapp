import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTabFromSpreadsheet, readManyTabsFromSpreadsheet, getSheetTitles } from "./_lib/sheets.mjs";

const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";

// Source map rebuilt from the uploaded Recruitment Pipeline.xlsx workbook.
// Header/data row positions and ranges are intentionally explicit per tab.
const SOURCES = [
  { id:"rfp-master", label:"Request for Personnel", group:"Recruitment & Staffing", tab:"RFP 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"S", identityColumns:[0,5], accessMode:"crud_candidate" },
  { id:"rfp-pipeline", label:"Recruitment Pipeline", group:"Recruitment & Staffing", tab:"2026 Rec Pipeline", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"AI", identityColumns:[0,5], accessMode:"crud_candidate" },
  { id:"spk", label:"Psychotest (SPK)", group:"Recruitment & Staffing", tab:"SPK 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[2,4], accessMode:"crud_candidate" },
  { id:"mcu", label:"Medical Check Up (MCU)", group:"Recruitment & Staffing", tab:"MCU 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[3], accessMode:"crud_candidate" },
  { id:"mcu-induction", label:"MCU Induction", group:"Recruitment & Staffing", tab:"MCU Induction 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"H", identityColumns:[0], accessMode:"partial_crud", writableColumns:["A"], importedColumns:["B","C","D","E","F","G","H"], note:"Only RFP Received (column A) is editable. Columns B:H are populated through IMPORTRANGE and must remain read-only." },
  { id:"extension", label:"Contract Extension", group:"Recruitment & Staffing", tab:"Extend 2026", headerRow:2, dataStartRow:3, startColumn:"A", endColumn:"U", identityColumns:[9,4], accessMode:"crud_candidate" },
  { id:"new-hire", label:"New Hire", group:"Employee Records", tab:"New Hire 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[4,1], accessMode:"crud_candidate" },
  { id:"employee-db", label:"Employee Database", group:"Employee Records", tab:"Data Valid Employees", headerRow:3, dataStartRow:4, startColumn:"A", endColumn:"N", identityColumns:[0,1], accessMode:"view_only" },
  { id:"movement", label:"New Hire vs Exit", group:"Employee Records", tab:"New Hire vs Exit", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"C", identityColumns:[0], accessMode:"crud_candidate" }
];

const publicSource = source => ({
  id:source.id, label:source.label, group:source.group, tab:source.tab,
  headerRow:source.headerRow, dataStartRow:source.dataStartRow,
  status:source.schemaStatus || "ready",
  accessMode:source.accessMode || "view_only",
  writableColumns:source.writableColumns || [],
  importedColumns:source.importedColumns || [],
  note:source.note || null,
  schemaMessage:source.schemaMessage || null,
  available:true
});

export const handler = async event => {
  if (event.httpMethod !== "GET") return json(405,{error:"Method not allowed"});
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401,{error:"Admin authentication required."});
    const params = event.queryStringParameters || {};

    if (params.action === "sources") {
      const titles=await getSheetTitles(params.refresh==="1");
      const present=SOURCES.filter(source=>titles.includes(source.tab));
      // Only header rows are fetched here. Full tab data is loaded on demand.
      const tabs = present.map(source => ({
        key:source.id, title:source.tab, headerRow:source.headerRow, endRow:source.headerRow,
        startColumn:source.startColumn, endColumn:source.endColumn
      }));
      let data = new Map();
      let readError = null;
      try { if(tabs.length)data = await readManyTabsFromSpreadsheet(MAIN_ID,tabs,{forceRefresh:params.refresh==="1"}); }
      catch (error) { readError = error.message || "Google Sheets read failed."; }

      const results = SOURCES.map(source => {
        const base = publicSource(source);
        if (!titles.includes(source.tab)) return { ...base, available:false, status:"unavailable", totalRows:null, totalColumns:null, headers:[], error:`Tab "${source.tab}" does not exist in the main workbook.` };
        if (readError) return { ...base, available:false, status:"unavailable", totalRows:null, totalColumns:null, headers:[], error:readError };
        const raw = data.get(source.id);
        if (!raw) return { ...base, available:false, status:"unavailable", totalRows:null, totalColumns:null, headers:[], error:"No values returned for this tab." };
        const headers=(raw.values?.[0]||[]).map(value=>String(value??"").trim());
        const hasHeader=headers.some(Boolean);
        const status=source.schemaStatus||(hasHeader?"ready":"needs_attention");
        return { ...base, status, schemaMessage:source.schemaMessage||(hasHeader?null:"The tab is accessible but no usable header row was found."), totalRows:null, totalColumns:headers.filter(Boolean).length, headers, error:null };
      });
      const failed = results.filter(item => !item.available);
      const attention = results.filter(item => item.status === "needs_attention");
      return json(200,{
        sources:results, checkedAt:new Date().toISOString(), cacheTtlSeconds:60,
        summary:{total:results.length,connected:results.filter(item=>item.available).length,failed:failed.length,needsAttention:attention.length}
      });
    }

    const source = SOURCES.find(item => item.id === params.source);
    if (!source) return json(400,{error:"Unknown data source."});
    if (source.schemaStatus) return json(200,{source:publicSource(source),needsAttention:true,message:source.schemaMessage,headers:[],rows:[],total:0,page:1,pageSize:50,totalPages:1,checkedAt:new Date().toISOString(),readOnly:true});

    const data = await readTabFromSpreadsheet(
      MAIN_ID,source.tab,source.headerRow,source.dataStartRow,
      params.page,params.pageSize,params.search,
      {startColumn:source.startColumn,endColumn:source.endColumn,identityColumns:source.identityColumns,forceRefresh:params.refresh==="1"}
    );
    return json(200,{
      source:publicSource(source),...data,
      checkedAt:new Date().toISOString(),readOnly:true
    });
  } catch (error) {
    return json(500,{error:error.message || "Data integration request failed."});
  }
};

