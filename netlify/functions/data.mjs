import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTabFromSpreadsheet, readManyTabsFromSpreadsheet, getSheetTitles, getSheetCrudMetadata, getSheetRowFormulas, writeSheetValues, clearSheetValues, addActivity, copyFormulaColumnsFromPrevious, ensureSheetRowExists } from "./_lib/sheets.mjs";

const MAIN_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";

// Source map rebuilt from the uploaded Recruitment Pipeline.xlsx workbook.
// Header/data row positions and ranges are intentionally explicit per tab.
const SOURCES = [
  { id:"rfp-master", label:"Request for Personnel", group:"Recruitment & Staffing", tab:"RFP 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"S", identityColumns:[0,5], formulaColumns:["A","B","C","R","S"], accessMode:"crud_candidate" },
  { id:"rfp-pipeline", label:"Recruitment Pipeline", group:"Recruitment & Staffing", tab:"2026 Rec Pipeline", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"AI", identityColumns:[0,5], formulaColumns:["A","B","C","R","Y","Z","AA","AB","AC","AF","AH"], accessMode:"crud_candidate" },
  { id:"spk", label:"Psychotest (SPK)", group:"Recruitment & Staffing", tab:"SPK 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[2,4], formulaColumns:["A","D"], accessMode:"crud_candidate" },
  { id:"mcu", label:"Medical Check Up (MCU)", group:"Recruitment & Staffing", tab:"MCU 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[3], formulaColumns:["A","F","J","O"], accessMode:"crud_candidate" },
  { id:"mcu-induction", label:"MCU Induction", group:"Recruitment & Staffing", tab:"MCU Induction 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"H", identityColumns:[0,1,2,3,4,5,6,7], accessMode:"partial_crud", writableColumns:["A"], importedColumns:["B","C","D","E","F","G","H"], note:"Only RFP Received (column A) is editable. Columns B:H are populated through IMPORTRANGE and must remain read-only." },
  { id:"extension", label:"Contract Extension", group:"Recruitment & Staffing", tab:"Extend 2026", headerRow:2, dataStartRow:3, startColumn:"A", endColumn:"U", identityColumns:[9,4], formulaColumns:["A","E","F","H","I","L","M"], accessMode:"crud_candidate" },
  { id:"new-hire", label:"New Hire", group:"Employee Records", tab:"New Hire 2026", headerRow:1, dataStartRow:2, startColumn:"A", endColumn:"Q", identityColumns:[4,1], formulaColumns:["A","B","C","D","F","G","O"], accessMode:"crud_candidate" },
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
  formulaColumns:source.formulaColumns || [],
  note:source.note || null,
  schemaMessage:source.schemaMessage || null,
  available:true
});


function colLetter(index){let n=index+1,s="";while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function quoteTab(title){return `'${String(title).replace(/'/g,"''")}'`;}
function safeValue(value){
  if(value===null||value===undefined)return "";
  if(typeof value==="string" && value.length>5000)throw new Error("Field value is too long.");
  if(typeof value==="string" && value.startsWith("="))return "'"+value;
  return value;
}
async function findNextRow(source){
  const start=source.dataStartRow;
  const range=`${quoteTab(source.tab)}!${source.startColumn}${start}:${source.endColumn}`;
  // Use raw grid values to find first empty record slot, not the filtered/paginated index.
  const { google } = await import("googleapis");
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error("Google service account is not configured.");
  const credentials=JSON.parse(raw);
  const auth=new google.auth.GoogleAuth({credentials,scopes:["https://www.googleapis.com/auth/spreadsheets"]});
  const api=google.sheets({version:"v4",auth});
  const response=await api.spreadsheets.values.get({spreadsheetId:MAIN_ID,range,valueRenderOption:"FORMATTED_VALUE"});
  const values=response.data.values||[];
  for(let i=0;i<2000;i++){
    const row=values[i]||[];
    const hasIdentity=source.identityColumns.some(index=>row[index]!==undefined&&row[index]!==""&&row[index]!==null);
    if(!hasIdentity)return start+i;
  }
  throw new Error("No empty row found in the first 2,000 data rows. Please extend the sheet capacity or contact an administrator.");
}
function validateWritable(source, payload, columns, rowFormulas){
  const keys=Object.keys(payload||{});
  if(!keys.length)throw new Error("No fields were submitted.");
  for(const key of keys){
    const index=Number(key);
    if(!Number.isInteger(index)||index<0||index>=columns.length)throw new Error("Invalid column in request.");
    const letter=colLetter(index);
    if(source.accessMode==="view_only")throw new Error("This source is view-only.");
    if(source.accessMode==="partial_crud" && !(source.writableColumns||[]).includes(letter))throw new Error(`Column ${letter} is read-only for this source.`);
    if((source.formulaColumns||[]).includes(letter) || (rowFormulas[index] && String(rowFormulas[index]).startsWith("=")))throw new Error(`Column ${letter} (${columns[index]?.header||"field"}) contains a formula or is formula-managed and cannot be edited.`);
    const column=columns[index]||{}, value=payload[key], label=String(column.header||"");
    if(column.validation?.strict && column.validation.options?.length && value!=="" && !column.validation.options.some(option=>String(option)===String(value)))throw new Error(`Invalid option for ${label}. Please choose a value from the dropdown.`);
    if(/link|url/i.test(label) && value!=="" && !/^https?:\/\/[^\s]+$/i.test(String(value)))throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
    if(column.validation?.type==="DATE_IS_VALID" && value!=="" && Number.isNaN(Date.parse(String(value))))throw new Error(`${label} must be a valid date.`);
  }
}

export const handler = async event => {
  try {
    const actor = await requireAdmin(event);
    if (!actor) return json(401,{error:"Admin authentication required."});
    const params = event.queryStringParameters || {};

    if (event.httpMethod === "GET" && params.action === "sources") {
      const titles=await getSheetTitles(params.refresh==="1");
      const present=SOURCES.filter(source=>titles.includes(source.tab));
      const tabs=present.map(source=>({key:source.id,title:source.tab,headerRow:source.headerRow,endRow:source.headerRow,startColumn:source.startColumn,endColumn:source.endColumn}));
      let data=new Map(),readError=null;
      try{if(tabs.length)data=await readManyTabsFromSpreadsheet(MAIN_ID,tabs,{forceRefresh:params.refresh==="1"});}catch(e){readError=e.message||"Google Sheets read failed.";}
      const results=SOURCES.map(source=>{
        const base=publicSource(source);
        if(!titles.includes(source.tab))return {...base,available:false,status:"unavailable",headers:[],error:`Tab "${source.tab}" does not exist.`};
        if(readError)return {...base,available:false,status:"unavailable",headers:[],error:readError};
        const raw=data.get(source.id);if(!raw)return {...base,available:false,status:"unavailable",headers:[],error:"No values returned."};
        const headers=(raw.values?.[0]||[]).map(v=>String(v??"").trim());
        return {...base,headers,status:source.schemaStatus||(headers.some(Boolean)?"ready":"needs_attention"),error:null};
      });
      return json(200,{sources:results,checkedAt:new Date().toISOString(),summary:{total:results.length,connected:results.filter(x=>x.available).length,failed:results.filter(x=>!x.available).length,needsAttention:results.filter(x=>x.status==="needs_attention").length}});
    }

    const source=SOURCES.find(x=>x.id===params.source);
    if(!source)return json(400,{error:"Unknown data source."});
    if(source.schemaStatus)return json(200,{source:publicSource(source),needsAttention:true,message:source.schemaMessage,headers:[],rows:[],total:0,page:1,pageSize:50,totalPages:1,checkedAt:new Date().toISOString(),readOnly:true});

    if(event.httpMethod==="GET" && params.action==="schema"){
      const meta=await getSheetCrudMetadata(MAIN_ID,source.tab,source.headerRow,source.dataStartRow,source.startColumn,source.endColumn);
      const templateRow=source.dataStartRow;
      const formulas=await getSheetRowFormulas(MAIN_ID,source.tab,templateRow,source.startColumn,source.endColumn);
      const columns=meta.columns.map((c,i)=>{const isFormula=(source.formulaColumns||[]).includes(colLetter(i))||(formulas[i]&&String(formulas[i]).startsWith("="));return {...c,formula:!!isFormula,editable:source.accessMode!=="view_only" && (source.accessMode!=="partial_crud" || source.writableColumns.includes(colLetter(i))) && !isFormula};});
      return json(200,{source:publicSource(source),columns,canCreate:source.accessMode!=="view_only",canUpdate:source.accessMode!=="view_only",canDelete:source.accessMode==="crud_candidate",checkedAt:new Date().toISOString()});
    }

    if(event.httpMethod==="GET"){
      const data=await readTabFromSpreadsheet(MAIN_ID,source.tab,source.headerRow,source.dataStartRow,params.page,params.pageSize,params.search,{startColumn:source.startColumn,endColumn:source.endColumn,identityColumns:source.identityColumns,forceRefresh:params.refresh==="1"});
      return json(200,{source:publicSource(source),...data,checkedAt:new Date().toISOString(),readOnly:source.accessMode==="view_only"});
    }

    if(!["POST","PATCH","DELETE"].includes(event.httpMethod))return json(405,{error:"Method not allowed"});
    if(source.accessMode==="view_only")return json(403,{error:"This source is view-only."});
    const body=JSON.parse(event.body||"{}");
    const meta=await getSheetCrudMetadata(MAIN_ID,source.tab,source.headerRow,source.dataStartRow,source.startColumn,source.endColumn);
    if(event.httpMethod==="POST"){
      const rowNumber=await findNextRow(source);
      await ensureSheetRowExists(MAIN_ID,meta.sheetId,rowNumber,source.startColumn,source.endColumn);
      const formulas=await getSheetRowFormulas(MAIN_ID,source.tab,rowNumber,source.startColumn,source.endColumn);
      validateWritable(source,body.values,meta.columns,formulas);
      if(source.accessMode==="crud_candidate"){
        await copyFormulaColumnsFromPrevious(MAIN_ID,meta.sheetId,source.tab,source.dataStartRow,rowNumber,source.formulaColumns||[]);
      }
      const data=Object.entries(body.values).map(([key,value])=>({range:`${quoteTab(source.tab)}!${colLetter(Number(key))}${rowNumber}`,values:[[safeValue(value)]]}));
      await writeSheetValues(MAIN_ID,data);
      await addActivity(actor.username,"Create",source.tab,String(rowNumber),`Created record in ${source.tab}`);
      return json(201,{success:true,rowNumber,message:"Record created."});
    }
    const rowNumber=Number(body.rowNumber);
    if(!Number.isInteger(rowNumber)||rowNumber<source.dataStartRow||rowNumber>10000)return json(400,{error:"Invalid row number."});
    const formulas=await getSheetRowFormulas(MAIN_ID,source.tab,rowNumber,source.startColumn,source.endColumn);
    if(event.httpMethod==="PATCH"){
      validateWritable(source,body.values,meta.columns,formulas);
      const data=Object.entries(body.values).map(([key,value])=>({range:`${quoteTab(source.tab)}!${colLetter(Number(key))}${rowNumber}`,values:[[safeValue(value)]]}));
      await writeSheetValues(MAIN_ID,data);
      await addActivity(actor.username,"Update",source.tab,String(rowNumber),`Updated record in ${source.tab}`);
      return json(200,{success:true,rowNumber,message:"Record updated."});
    }
    if(source.accessMode!=="crud_candidate")return json(403,{error:"Delete is disabled for this source."});
    const writable=meta.columns.filter((c,i)=>!formulas[i]||!String(formulas[i]).startsWith("=")).map(c=>c.index);
    const ranges=writable.map(i=>`${quoteTab(source.tab)}!${colLetter(i)}${rowNumber}`);
    if(!ranges.length)return json(400,{error:"No editable cells found for this row."});
    await clearSheetValues(MAIN_ID,ranges);
    await addActivity(actor.username,"Delete",source.tab,String(rowNumber),`Cleared editable cells for row ${rowNumber}`);
    return json(200,{success:true,rowNumber,message:"Editable fields cleared. Formula and imported cells were preserved."});
  }catch(error){return json(500,{error:error.message||"Data operation failed."});}
};
