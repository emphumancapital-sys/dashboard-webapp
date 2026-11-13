import { google } from "googleapis";
import { hashPassword } from "./auth.mjs";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
export const SYSTEM_USERS = "EMP User Management";
export const SYSTEM_ACTIVITY = "EMP Activity Log";
const USER_HEADERS = ["Username","Password Hash","Full Name","Role","Status","Created At","Updated At"];
const ACTIVITY_HEADERS = ["Timestamp","Actor Username","Action","Module","Record ID","Summary"];

let sheetsClient;
let systemSheetsReadyAt = 0;
let systemSheetsPromise = null;
let usersCache = { at:0, value:null, pending:null };
let activityCache = { at:0, value:null, pending:null };
let sheetTitlesCache = {at:0,value:null,pending:null};
async function api() {
  if (sheetsClient) return sheetsClient;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured in Netlify.");
  let credentials;
  try { credentials = JSON.parse(raw); } catch { throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON."); }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  sheetsClient = google.sheets({ version:"v4", auth });
  return sheetsClient;
}
export async function getSpreadsheetId(){ return SHEET_ID; }
export async function getSheetTitles(forceRefresh=false) {
  if(!forceRefresh&&sheetTitlesCache.value&&Date.now()-sheetTitlesCache.at<5*60_000)return sheetTitlesCache.value;
  if(sheetTitlesCache.pending)return sheetTitlesCache.pending;
  sheetTitlesCache.pending=(async()=>{
    const s=await api();const r=await s.spreadsheets.get({spreadsheetId:SHEET_ID,fields:"sheets.properties.title"});
    const titles=(r.data.sheets||[]).map(x=>x.properties.title);
    sheetTitlesCache.value=titles;sheetTitlesCache.at=Date.now();return titles;
  })();
  try{return await sheetTitlesCache.pending;}finally{sheetTitlesCache.pending=null;}
}
export async function ensureSystemSheets() {
  if (Date.now() - systemSheetsReadyAt < 5 * 60_000) return;
  if (systemSheetsPromise) return systemSheetsPromise;
  systemSheetsPromise = (async () => {
  const s=await api(); const titles=await getSheetTitles();
  const requests=[];
  if(!titles.includes(SYSTEM_USERS))requests.push({addSheet:{properties:{title:SYSTEM_USERS}}});
  if(!titles.includes(SYSTEM_ACTIVITY))requests.push({addSheet:{properties:{title:SYSTEM_ACTIVITY}}});
  if(requests.length){await s.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{requests}});sheetTitlesCache={at:0,value:null,pending:null};}
  const now= new Date().toISOString();
  const meta=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A1:G2`}).catch(()=>({data:{values:[]}}));
  if(!meta.data.values?.length){
    await s.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A1:G1`,valueInputOption:"RAW",requestBody:{values:[USER_HEADERS]}});
  }
  const act=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A1:F1`}).catch(()=>({data:{values:[]}}));
  if(!act.data.values?.length){
    await s.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A1:F1`,valueInputOption:"RAW",requestBody:{values:[ACTIVITY_HEADERS]}});
  }
  await seedAdmin();
  systemSheetsReadyAt = Date.now();
  })();
  try { await systemSheetsPromise; } catch (error) { systemSheetsReadyAt = 0; throw error; } finally { systemSheetsPromise = null; }
}
async function seedAdmin(){
  const username=process.env.BOOTSTRAP_ADMIN_USERNAME||"";
  const password=process.env.BOOTSTRAP_ADMIN_PASSWORD||"";
  if(!username||!password)return;
  const users=await getUsers();
  if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return;
  const s=await api(), now=new Date().toISOString();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A:G`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[[username,hashPassword(password), "EMP Administrator","Admin","Active",now,now]]}});
  usersCache = {at:0,value:null,pending:null};
}
export async function getUsers(){
  if (usersCache.value && Date.now()-usersCache.at < 10_000) return usersCache.value;
  if (usersCache.pending) return usersCache.pending;
  usersCache.pending = (async()=>{
  const s=await api();
  const r=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A2:G`});
  const result = (r.data.values||[]).map((v,i)=>({
    rowNumber:i+2,username:String(v[0]||""),passwordHash:String(v[1]||""),
    fullName:String(v[2]||""),role:String(v[3]||"Admin"),status:String(v[4]||"Active"),
    createdAt:String(v[5]||""),updatedAt:String(v[6]||"")
  })).filter(u=>u.username);
  usersCache.value = result; usersCache.at = Date.now(); return result;
  })();
  try { return await usersCache.pending; } finally { usersCache.pending = null; }
}
export async function addActivity(actor,action,module,recordId,summary){
  const s=await api();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A:F`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[[new Date().toISOString(),actor,action,module,recordId,summary]]}});
  activityCache = {at:0,value:null,pending:null};
}
export async function listActivity(days=10){
  if (activityCache.value && Date.now()-activityCache.at < 60_000) return activityCache.value;
  if (activityCache.pending) return activityCache.pending;
  activityCache.pending = (async()=>{
  const s=await api();
  const r=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A2:F`});
  const cutoff=Date.now()-(days-1)*86400000;
  const result = (r.data.values||[]).map(v=>({timestamp:v[0]||"",actor:v[1]||"",action:v[2]||"",module:v[3]||"",recordId:v[4]||"",summary:v[5]||""}))
    .filter(x=>x.timestamp&&new Date(x.timestamp).getTime()>=cutoff)
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  activityCache.value = result; activityCache.at = Date.now(); return result;
  })();
  try { return await activityCache.pending; } finally { activityCache.pending = null; }
}
export async function readTab(title){
  const data = await readTabFromSpreadsheet(SHEET_ID,title,1,2,1,1000,"");
  return {headers:data.headers,rows:data.rows};
}
export async function appendUser(values){
  const s=await api();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A:G`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[values]}});
  usersCache = {at:0,value:null,pending:null};
}
export async function updateUser(rowNumber,values){
  const s=await api();
  await s.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A${rowNumber}:G${rowNumber}`,valueInputOption:"RAW",requestBody:{values:[values]}});
  usersCache = {at:0,value:null,pending:null};
}


// Read-only data cache. Netlify may reuse a warm instance; cache is best-effort.
const READ_CACHE_TTL_MS = 60_000;
const readCache = new Map();
const inflightReads = new Map();
const MAX_CACHE_ENTRIES = 36;

function cacheGet(key){
  const item=readCache.get(key);
  if(!item)return null;
  if(Date.now()-item.at>READ_CACHE_TTL_MS){readCache.delete(key);return null;}
  // LRU refresh
  readCache.delete(key);readCache.set(key,item);
  return item.value;
}
function cacheSet(key,value){
  if(readCache.has(key))readCache.delete(key);
  while(readCache.size>=MAX_CACHE_ENTRIES){const oldest=readCache.keys().next().value;if(!oldest)break;readCache.delete(oldest);}
  readCache.set(key,{at:Date.now(),value});
}
async function with429Retry(fn,attempts=3){
  let last;
  for(let i=0;i<attempts;i++){
    try{return await fn();}
    catch(error){
      last=error;const status=Number(error?.code||error?.response?.status);
      if(![429,500,502,503,504].includes(status)||i===attempts-1)throw error;
      const retryAfter=Number(error?.response?.headers?.["retry-after"]||0)*1000;
      const wait=Math.max(retryAfter,400*(2**i))+Math.floor(Math.random()*120);
      await new Promise(resolve=>setTimeout(resolve,wait));
    }
  }
  throw last;
}
function quoteTab(title){return `'${String(title).replace(/'/g,"''")}'`;}
function rangeFor(tab){
  const start=tab.startColumn||"A",end=tab.endColumn||"ZZ";
  return `${quoteTab(tab.title)}!${start}${tab.headerRow||1}:${end}${tab.endRow||""}`;
}
function cacheKeyFor(spreadsheetId,tab){return `${spreadsheetId}:${rangeFor(tab)}`;}
function shapeRaw(values){return {headers:(values[0]||[]).map(value=>String(value??"").trim()),values};}

// One batchGet per spreadsheet, with request coalescing for identical batches.
export async function readManyTabsFromSpreadsheet(spreadsheetId,tabs,{forceRefresh=false}={}){
  const result=new Map(),missing=[];
  for(const tab of tabs){
    const key=cacheKeyFor(spreadsheetId,tab);
    if(forceRefresh)readCache.delete(key);
    const hit=forceRefresh?null:cacheGet(key);
    if(hit)result.set(tab.key,hit);else missing.push({...tab,cacheKey:key});
  }
  if(!missing.length)return result;

  const toFetch=missing.filter(tab=>!inflightReads.has(tab.cacheKey));
  if(toFetch.length){
    const batchPromise=(async()=>{
      const client=await api();
      const response=await with429Retry(()=>client.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges:toFetch.map(rangeFor),
        valueRenderOption:"FORMATTED_VALUE"
      }));
      const ranges=response.data.valueRanges||[];
      return toFetch.map((tab,index)=>{
        const raw=shapeRaw(ranges[index]?.values||[]);
        cacheSet(tab.cacheKey,raw);return raw;
      });
    })();
    toFetch.forEach((tab,index)=>{
      const perTab=batchPromise.then(values=>values[index]).finally(()=>inflightReads.delete(tab.cacheKey));
      inflightReads.set(tab.cacheKey,perTab);
    });
  }
  const values=await Promise.all(missing.map(async tab=>{
    const hit=cacheGet(tab.cacheKey);if(hit)return hit;
    const pending=inflightReads.get(tab.cacheKey);
    return pending?await pending:null;
  }));
  missing.forEach((tab,index)=>{if(values[index])result.set(tab.key,values[index]);});
  return result;
}

// ---- Sorting helpers: type-aware so dates and numbers sort by value, not by text ----
const MONTHS={jan:0,january:0,januari:0,feb:1,february:1,februari:1,mar:2,march:2,maret:2,apr:3,april:3,may:4,mei:4,jun:5,june:5,juni:5,jul:6,july:6,juli:6,aug:7,august:7,agu:7,agt:7,agustus:7,sep:8,sept:8,september:8,oct:9,october:9,okt:9,oktober:9,nov:10,november:10,dec:11,december:11,des:11,desember:11};
function fullYear(y){y=Number(y);return y<100?(y<70?2000+y:1900+y):y;}
function utc(y,m,d){const t=Date.UTC(y,m,d);const x=new Date(t);return x.getUTCFullYear()===y&&x.getUTCMonth()===m&&x.getUTCDate()===d?t:null;}
// Returns {t, a, b} where a/b are the first two numeric parts of an ambiguous d/m/y value.
function parseDateParts(value){
  const s=String(value??"").trim();if(!s||s.length>40)return null;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if(m){const t=utc(+m[1],+m[2]-1,+m[3]);return t===null?null:{t};}
  m=s.match(/^(?:[A-Za-z]+,?\s+)?(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/);
  if(m&&MONTHS[m[2].toLowerCase()]!==undefined){const t=utc(fullYear(m[3]),MONTHS[m[2].toLowerCase()],+m[1]);return t===null?null:{t};}
  m=s.match(/^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if(m&&MONTHS[m[1].toLowerCase()]!==undefined){const t=utc(fullYear(m[3]),MONTHS[m[1].toLowerCase()],+m[2]);return t===null?null:{t};}
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s.*)?$/);
  if(m)return {a:+m[1],b:+m[2],y:fullYear(m[3])};
  return null;
}
function resolveDate(parts,order){
  if(!parts)return null;if(parts.t!==undefined)return parts.t;
  return order==="dmy"?utc(parts.y,parts.b-1,parts.a):utc(parts.y,parts.a-1,parts.b);
}
function parseNumberLoose(value){
  let s=String(value??"").trim();if(!s||s.length>30)return null;
  let negative=false;if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
  s=s.replace(/^(rp\.?|idr|usd|\$|€|£)\s*/i,"").replace(/\s/g,"");
  if(s.startsWith("-")){negative=!negative;s=s.slice(1);}
  if(!/^\d[\d.,]*$/.test(s))return null;
  const dot=s.lastIndexOf("."),comma=s.lastIndexOf(",");
  if(dot>-1&&comma>-1)s=dot>comma?s.replace(/,/g,""):s.replace(/\./g,"").replace(",",".");
  else if(comma>-1)s=/^\d{1,3}(,\d{3})+$/.test(s)?s.replace(/,/g,""):s.replace(",",".");
  else if(dot>-1&&/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,"");
  const n=Number(s);return Number.isFinite(n)?(negative?-n:n):null;
}
// Decide per column whether it holds dates, numbers or text (80% of non-empty values must agree).
function inferColumnMeta(records,width){
  const meta=[];
  for(let i=0;i<width;i++){
    let filled=0,dates=0,numbers=0,dayFirst=0,monthFirst=0;
    for(const record of records){
      const v=record.row[i];if(v===undefined||v===null||v==="")continue;
      filled++;
      const parts=parseDateParts(v);
      if(parts){dates++;if(parts.t===undefined){if(parts.a>12)dayFirst++;else if(parts.b>12)monthFirst++;}}
      else if(parseNumberLoose(v)!==null)numbers++;
    }
    if(filled&&dates/filled>=0.8)meta.push({type:"date",dateOrder:monthFirst>dayFirst?"mdy":"dmy"}); // ambiguous values: day-first, as in dashboard.mjs
    else if(filled&&numbers/filled>=0.8)meta.push({type:"number"});
    else meta.push({type:"text"});
  }
  return meta;
}
const textCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:"base"});
function sortRecords(records,position,dir,meta){
  const sign=dir==="asc"?1:-1;
  if(position===null){records.sort((x,y)=>sign*(x.rowNumber-y.rowNumber));return;}
  const info=meta[position]||{type:"text"};
  const keyOf=v=>{
    if(v===undefined||v===null||v==="")return null;
    if(info.type==="date")return resolveDate(parseDateParts(v),info.dateOrder);
    if(info.type==="number")return parseNumberLoose(v);
    return String(v);
  };
  const keyed=records.map(record=>({record,key:keyOf(record.row[position])}));
  keyed.sort((x,y)=>{
    // Empty or unparseable values always sink to the bottom, whatever the direction.
    if(x.key===null&&y.key===null)return y.record.rowNumber-x.record.rowNumber;
    if(x.key===null)return 1;if(y.key===null)return -1;
    const c=info.type==="text"?textCollator.compare(x.key,y.key):x.key-y.key;
    return c?sign*c:y.record.rowNumber-x.record.rowNumber;
  });
  keyed.forEach((item,index)=>{records[index]=item.record;});
}

export async function readTabFromSpreadsheet(spreadsheetId,title,headerRow=1,dataStartRow=headerRow+1,page=1,pageSize=50,search="",rangeOptions={}){
  if(!spreadsheetId||!title)throw new Error("Spreadsheet ID and tab name are required.");
  const tab={title,headerRow,startColumn:rangeOptions.startColumn||"A",endColumn:rangeOptions.endColumn||"ZZ"};
  const key=cacheKeyFor(spreadsheetId,tab);
  if(rangeOptions.forceRefresh)readCache.delete(key);
  let raw=rangeOptions.forceRefresh?null:cacheGet(key);
  if(!raw){
    let pending=inflightReads.get(key);
    if(!pending){
      pending=(async()=>{
        const client=await api();
        try{
          const response=await with429Retry(()=>client.spreadsheets.values.get({spreadsheetId,range:rangeFor(tab),valueRenderOption:"FORMATTED_VALUE"}));
          const value=shapeRaw(response.data.values||[]);cacheSet(key,value);return value;
        }catch(error){
          const status=Number(error?.code||error?.response?.status);
          if(status===403)throw new Error(`Access denied to spreadsheet tab "${title}". Share the main spreadsheet with the service account as Viewer.`);
          if(status===400||status===404)throw new Error(`Spreadsheet tab "${title}" was not found. Check the exact tab name.`);
          throw new Error(`Google Sheets API error for "${title}": ${error.message||"unknown error"}`);
        }
      })().finally(()=>inflightReads.delete(key));
      inflightReads.set(key,pending);
    }
    raw=await pending;
  }
  const values=raw.values||[];
  const offset=Math.max(0,dataStartRow-headerRow);
  const candidateRecords=values.slice(offset).map((row,index)=>({row,rowNumber:dataStartRow+index})).filter(record=>{
    const row=record.row;
    return rangeOptions.identityColumns?.length ? rangeOptions.identityColumns.some(index=>row[index]!==undefined&&row[index]!==null&&row[index]!=="") : row.some(value=>value!==""&&value!==null&&value!==undefined);
  });
  const width=Math.max(raw.headers.length,...candidateRecords.map(record=>record.row.length),0);
  const keep=[];
  for(let i=0;i<width;i++){
    const header=String(raw.headers[i]??"").trim();
    const hasData=candidateRecords.some(record=>record.row[i]!==undefined&&record.row[i]!==null&&record.row[i]!=="");
    if(header||hasData)keep.push(i);
  }
  const headers=keep.map(i=>String(raw.headers[i]??"").trim()||`Column ${i+1}`);
  let records=candidateRecords.map(record=>({row:keep.map(i=>record.row[i]??""),rowNumber:record.rowNumber}));
  const q=String(search||"").trim().toLocaleLowerCase();
  if(q)records=records.filter(record=>record.row.some(value=>String(value??"").toLocaleLowerCase().includes(q)));
  // Column types are inferred from every record (not just the current page or search result).
  const columnMeta=inferColumnMeta(candidateRecords.map(record=>({row:keep.map(i=>record.row[i]??"")})),keep.length);
  // Default order: latest sheet row first. sortColumn is the original sheet column index.
  const sortIndex=rangeOptions.sortColumn===undefined||rangeOptions.sortColumn===null||rangeOptions.sortColumn===""?NaN:Number(rangeOptions.sortColumn);
  const sortPosition=Number.isInteger(sortIndex)?keep.indexOf(sortIndex):-1;
  const sortDir=rangeOptions.sortDir==="asc"?"asc":"desc";
  sortRecords(records,sortPosition>-1?sortPosition:null,sortDir,columnMeta);
  const total=records.length;
  const rows=records.map(record=>record.row);
  const rowNumbers=records.map(record=>record.rowNumber);
  const safeSize=Math.min(200,Math.max(10,Number(pageSize)||50));
  const totalPages=Math.max(1,Math.ceil(total/safeSize));
  const safePage=Math.min(totalPages,Math.max(1,Number(page)||1));
  const start=(safePage-1)*safeSize;
  return {headers,columnIndexes:keep,columnMeta,sort:{column:sortPosition>-1?sortIndex:null,dir:sortDir},rows:rows.slice(start,start+safeSize),rowNumbers:rowNumbers.slice(start,start+safeSize),total,page:safePage,pageSize:safeSize,totalPages,headerRow,dataStartRow,cacheTtlSeconds:READ_CACHE_TTL_MS/1000};
}


// CRUD helpers. Metadata is fetched live so dropdown validation and formula cells
// are never guessed from display labels.
export async function getSheetCrudMetadata(spreadsheetId, title, headerRow, dataStartRow, startColumn, endColumn) {
  const client = await api();
  const meta = await client.spreadsheets.get({
    spreadsheetId,
    includeGridData: true,
    ranges: [`'${String(title).replace(/'/g,"''")}'!${startColumn}${headerRow}:${endColumn}${Math.max(dataStartRow+2,headerRow+2)}`],
    fields: "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,dataValidation,effectiveFormat(numberFormat)))))"
  });
  const sheet = (meta.data.sheets||[]).find(x=>x.properties?.title===title);
  const grid = sheet?.data?.[0];
  const rows = grid?.rowData||[];
  const header = rows[0]?.values||[];
  const template = rows[Math.max(0,dataStartRow-headerRow)]?.values||[];
  const columns = header.map((cell,index)=>{
    const value=cell.userEnteredValue||{};
    const formula=!!value.formulaValue;
    const validation=cell.dataValidation||template[index]?.dataValidation||null;
    const condition=validation?.condition||{};
    const options=condition.type==="ONE_OF_RANGE"?[]:(condition.values||[]).map(x=>x.userEnteredValue).filter(x=>x!==undefined);
    const numberFormat=cell.effectiveFormat?.numberFormat||template[index]?.effectiveFormat?.numberFormat||null;
    return {index, header:value.stringValue||value.numberValue?.toString()||"", formula, validation:validation?{type:condition.type||"",options,strict:validation.strict!==false}:null, numberFormat};
  });
  for(const column of columns){
    if(column.validation?.type==="ONE_OF_RANGE" && !column.validation.options.length){
      const rawRange=(conditionRange(template,column.index)||"").replace(/^=/,"").trim();
      if(rawRange){
        try{
          const values=await client.spreadsheets.values.get({spreadsheetId,range:rawRange,valueRenderOption:"FORMATTED_VALUE"});
          column.validation.options=(values.data.values||[]).flat().map(v=>String(v??"").trim()).filter(Boolean);
        }catch{
          column.validation.options=[];
          column.validation.sourceRangeUnavailable=true;
        }
      }
    }
  }
  return {sheetId:sheet?.properties?.sheetId, columns};
}
function conditionRange(template,index){
  const validation=template[index]?.dataValidation;
  const value=validation?.condition?.values?.[0]?.userEnteredValue;
  return typeof value==="string"?value:"";
}
export async function getSheetRowFormulas(spreadsheetId,title,rowNumber,startColumn,endColumn) {
  const client=await api();
  const range=`'${String(title).replace(/'/g,"''")}'!${startColumn}${rowNumber}:${endColumn}${rowNumber}`;
  const r=await client.spreadsheets.values.get({spreadsheetId,range,valueRenderOption:"FORMULA"});
  return r.data.values?.[0]||[];
}
export async function ensureSheetRowExists(spreadsheetId, sheetId, targetRow, startColumn, endColumn) {
  const client = await api();
  const book = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"
  });
  const sheet = (book.data.sheets || []).find(item => item.properties?.sheetId === sheetId);
  if (!sheet) throw new Error("Target sheet was not found.");
  const grid = sheet.properties.gridProperties || {};
  const currentRows = Number(grid.rowCount || 0);
  const requiredColumns = columnIndex(endColumn) + 1;
  const requests = [];
  if (targetRow > currentRows) {
    requests.push({ appendDimension: { sheetId, dimension: "ROWS", length: targetRow - currentRows } });
  }
  if (requiredColumns > Number(grid.columnCount || 0)) {
    requests.push({ appendDimension: { sheetId, dimension: "COLUMNS", length: requiredColumns - Number(grid.columnCount || 0) } });
  }
  if (requests.length) {
    await client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
  // Extend the previous row's formatting and data validation to the newly-created row.
  // Values are deliberately not copied; formula cells are handled separately.
  if (targetRow > currentRows && targetRow > 1) {
    const startColIndex = columnIndex(startColumn);
    const endColIndex = columnIndex(endColumn) + 1;
    await client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [
      { copyPaste: {
        source: { sheetId, startRowIndex: targetRow - 2, endRowIndex: targetRow - 1, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
        destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
        pasteType: "PASTE_FORMAT", pasteOrientation: "NORMAL"
      }},
      { copyPaste: {
        source: { sheetId, startRowIndex: targetRow - 2, endRowIndex: targetRow - 1, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
        destination: { sheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: startColIndex, endColumnIndex: endColIndex },
        pasteType: "PASTE_DATA_VALIDATION", pasteOrientation: "NORMAL"
      }}
    ]}});
  }
}

export async function writeSheetValues(spreadsheetId, data) {
  const client=await api();
  await client.spreadsheets.values.batchUpdate({spreadsheetId,requestBody:{valueInputOption:"USER_ENTERED",data}});
  // Invalidate cached ranges for this spreadsheet.
  for(const key of readCache.keys()) if(key.startsWith(`${spreadsheetId}:`)) readCache.delete(key);
}
export async function clearSheetValues(spreadsheetId, ranges) {
  const client=await api();
  await client.spreadsheets.values.batchClear({spreadsheetId,requestBody:{ranges}});
  for(const key of readCache.keys()) if(key.startsWith(`${spreadsheetId}:`)) readCache.delete(key);
}

export async function copyRowFormulas(spreadsheetId, sheetId, sourceRow, targetRow, startColumn, endColumn) {
  const client=await api();
  const startColIndex=columnIndex(startColumn), endColIndex=columnIndex(endColumn)+1;
  await client.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:[{copyPaste:{
    source:{sheetId,startRowIndex:sourceRow-1,endRowIndex:sourceRow,startColumnIndex:startColIndex,endColumnIndex:endColIndex},
    destination:{sheetId,startRowIndex:targetRow-1,endRowIndex:targetRow,startColumnIndex:startColIndex,endColumnIndex:endColIndex},
    pasteType:"PASTE_FORMULA",pasteOrientation:"NORMAL"
  }}]}});
}
function columnIndex(label){let n=0;for(const c of String(label).toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1;}

export async function copyFormulaColumnsFromPrevious(spreadsheetId,sheetId,title,startRow,targetRow,columns) {
  if(!columns?.length || targetRow<=startRow)return;
  const client=await api();
  const requests=[];
  const quoted=`'${String(title).replace(/'/g,"''")}'`;
  const ranges=columns.map(letter=>`${quoted}!${letter}${startRow}:${letter}${targetRow-1}`);
  const response=await client.spreadsheets.values.batchGet({spreadsheetId,ranges,valueRenderOption:"FORMULA"});
  const valueRanges=response.data.valueRanges||[];
  columns.forEach((letter,index)=>{
    const values=valueRanges[index]?.values||[];
    let sourceRow=0;
    for(let i=0;i<values.length;i++){
      const value=values[i]?.[0];
      if(typeof value==="string"&&value.startsWith("="))sourceRow=startRow+i;
    }
    if(sourceRow){
      const col=columnIndex(letter);
      requests.push({copyPaste:{
        source:{sheetId,startRowIndex:sourceRow-1,endRowIndex:sourceRow,startColumnIndex:col,endColumnIndex:col+1},
        destination:{sheetId,startRowIndex:targetRow-1,endRowIndex:targetRow,startColumnIndex:col,endColumnIndex:col+1},
        pasteType:"PASTE_FORMULA",pasteOrientation:"NORMAL"
      }});
    }
  });
  if(requests.length)await client.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests}});
}
