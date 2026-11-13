import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTabFromSpreadsheet, readManyTabsFromSpreadsheet, getSheetTitles, mutateTab } from "./_lib/sheets.mjs";

const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";

// Source map rebuilt from the uploaded Recruitment Pipeline.xlsx workbook.
// Header/data row positions and ranges are intentionally explicit per tab.
const SOURCES = [
  { id:"rfp", label:"Request for Personnel", group:"Recruitment & Staffing", tab:"2026 Rec Pipeline", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"AI", identityColumns:[0,5] },
  { id:"spk", label:"Psychotest (SPK)", group:"Recruitment & Staffing", tab:"SPK 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[2,4] },
  { id:"mcu", label:"Medical Check Up (MCU)", group:"Recruitment & Staffing", tab:"MCU 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"P", identityColumns:[3] },
  { id:"mcu-induction", label:"MCU Induction", group:"Recruitment & Staffing", tab:"MCU Induction 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"H", identityColumns:[2], schemaStatus:"needs_attention", schemaMessage:"Tab exists, but its header row currently contains #REF! and does not define a complete data table. The table is withheld to avoid showing incorrect column names." },
  { id:"extension", label:"Contract Extension", group:"Recruitment & Staffing", tab:"Extend 2026", headerRow:2, dataStartRow:3, startColumn:"A", endColumn:"U", identityColumns:[9,4] },
  { id:"new-hire", label:"New Hire", group:"Recruitment & Staffing", tab:"New Hire 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[4,1] },
  { id:"tpc", label:"TPC Pipeline", group:"Recruitment & Staffing", tab:"2026 TPC Pipeline", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"U", identityColumns:[0,5] },
  { id:"offer", label:"Offer Tracking", group:"Recruitment & Staffing", tab:"Offer", headerRow:2, dataStartRow:3, startColumn:"A", endColumn:"H", identityColumns:[2], schemaStatus:"needs_attention", schemaMessage:"The second row mixes a company value in column A with field labels in columns B–G. A reliable table header cannot be inferred without changing the source workbook." },
  { id:"employee-db", label:"Employee Database", group:"Employee Records", tab:"Data Valid Employees", headerRow:3, dataStartRow:4, startColumn:"A", endColumn:"N", identityColumns:[0,1] },
  { id:"movement", label:"New Hire vs Exit", group:"Employee Records", tab:"New Hire vs Exit", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"C", identityColumns:[0] },
  { id:"pivot-dashboard", label:"Pivot Dashboard 2026", group:"Reports & Logs", tab:"Pivot Dashboard 2026", headerRow:3, dataStartRow:4, startColumn:"AX", endColumn:"BC", identityColumns:[0,1,3,4,5] },
  { id:"rfp-deletion", label:"RFP Deletion Log", group:"Reports & Logs", tab:"RFP Deletion", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[2,4] },
  { id:"resource-deletion", label:"Resource Deletion Log", group:"Reports & Logs", tab:"Resource Deletion", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"AG", identityColumns:[2] }
];

// Only operational tables are writable. Master/reference, pivot and deletion logs remain read-only.
const WRITE_POLICY = {
  "rfp": { formulaColumns:[1,2,27,31,33], requiredColumns:[5,6,7] },
  "spk": { formulaColumns:[4,6,7,8], requiredColumns:[2,4], allowAdd:false },
  "mcu": { formulaColumns:[14], requiredColumns:[3,6], allowAdd:false },
  "extension": { formulaColumns:[], requiredColumns:[4,9] },
  "new-hire": { formulaColumns:[], requiredColumns:[0,4] },
  "tpc": { formulaColumns:[0,1,19], requiredColumns:[5,6,7] }
};

const publicSource = source => ({
  id:source.id, label:source.label, group:source.group, tab:source.tab,
  headerRow:source.headerRow, dataStartRow:source.dataStartRow,
  status:source.schemaStatus || "ready",
  schemaMessage:source.schemaMessage || null,
  canEdit:!!WRITE_POLICY[source.id],allowAdd:WRITE_POLICY[source.id]?.allowAdd!==false,
  available:true
});

export const handler = async event => {
  if (!["GET","POST","DELETE"].includes(event.httpMethod)) return json(405,{error:"Method not allowed"});
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401,{error:"Admin authentication required."});
    const params = event.queryStringParameters || {};

    if(event.httpMethod==="POST"||event.httpMethod==="DELETE"){
      let body={};try{body=JSON.parse(event.body||"{}");}catch{return json(400,{error:"Invalid JSON body."});}
      const source=SOURCES.find(item=>item.id===body.source);
      const policy=source&&WRITE_POLICY[source.id];
      if(!source||!policy)return json(403,{error:"This spreadsheet source is read-only."});
      if(source.schemaStatus)return json(409,{error:"This source needs a header correction before editing."});
      const headersResult=await readTabFromSpreadsheet(MAIN_ID,source.tab,source.headerRow,source.dataStartRow,1,200,"",{startColumn:source.startColumn,endColumn:source.endColumn,identityColumns:source.identityColumns,forceRefresh:true});
      const headers=headersResult.headers||[];
      const values=Array.isArray(body.values)?body.values:[];
      if(event.httpMethod==="POST"&&body.action!=="update"&&body.action!=="add")return json(400,{error:"Unsupported action."});
      if(body.action==="add"&&policy.allowAdd===false)return json(403,{error:"New rows are disabled for this source because some columns are populated by external spreadsheet formulas. Existing records can still be edited safely."});
      if(event.httpMethod==="DELETE"&&body.action!=="delete")return json(400,{error:"Unsupported action."});
      if(event.httpMethod==="POST"){
        if(values.length!==headers.length)return json(400,{error:"The submitted fields do not match this table's columns. Refresh and try again."});
        for(const col of policy.requiredColumns){if(!String(values[col]??"").trim())return json(400,{error:`${headers[col]||"A required field"} is required.`});}
        for(let i=0;i<values.length;i++){
          if(policy.formulaColumns.includes(i))continue;
          const value=String(values[i]??"");
          if(value.length>5000)return json(400,{error:`${headers[i]} is too long (maximum 5,000 characters).`});
          const isUrlColumn=/^(spk|spmcu|invoice)$/i.test(headers[i]||"") || /(link|folder)/i.test(headers[i]||"");
          if(isUrlColumn&&value&&!/^https?:\/\//i.test(value))return json(400,{error:`${headers[i]} must be a complete http(s) link.`});
        }
      }
      const editableColumns=headers.map((_,i)=>i).filter(i=>!policy.formulaColumns.includes(i));
      const operation=event.httpMethod==="DELETE"?"delete":body.action;
      const result=await mutateTab(MAIN_ID,source.tab,operation,{
        rowNumber:body.rowNumber,dataStartRow:source.dataStartRow,
        editableColumns,values,headers,formulaColumns:policy.formulaColumns,lastRow:headersResult.lastDataRow||source.dataStartRow-1,
        columnCount:headers.length
      });
      return json(200,{ok:true,message:operation==="add"?"Record added to Google Sheets.":operation==="update"?"Record updated in Google Sheets.":"Record deleted from Google Sheets.",...result});
    }

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
      checkedAt:new Date().toISOString(),readOnly:!WRITE_POLICY[source.id],
      canEdit:!!WRITE_POLICY[source.id],allowAdd:WRITE_POLICY[source.id]?.allowAdd!==false,formulaColumns:WRITE_POLICY[source.id]?.formulaColumns||[]
    });
  } catch (error) {
    return json(500,{error:error.message || "Data integration request failed."});
  }
};

