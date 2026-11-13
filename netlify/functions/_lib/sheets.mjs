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
  const indexedRows=values.slice(offset).map((row,index)=>({row,sheetRow:dataStartRow+index})).filter(item=>rangeOptions.identityColumns?.length ? rangeOptions.identityColumns.some(index=>item.row[index]!==undefined&&item.row[index]!==null&&item.row[index]!=="") : item.row.some(value=>value!==""&&value!==null&&value!==undefined));
  const candidateRows=indexedRows.map(item=>item.row);
  const width=Math.max(raw.headers.length,...candidateRows.map(row=>row.length),0);
  const keep=[];
  for(let i=0;i<width;i++){
    const header=String(raw.headers[i]??"").trim();
    const hasData=candidateRows.some(row=>row[i]!==undefined&&row[i]!==null&&row[i]!=="");
    if(header||hasData)keep.push(i);
  }
  const headers=keep.map(i=>String(raw.headers[i]??"").trim()||`Column ${i+1}`);
  let indexed=candidateRows.map((row,index)=>({row:keep.map(i=>row[i]??""),sheetRow:indexedRows[index].sheetRow}));
  const q=String(search||"").trim().toLocaleLowerCase();
  if(q)indexed=indexed.filter(item=>item.row.some(value=>String(value??"").toLocaleLowerCase().includes(q)));
  const total=indexed.length;
  const safeSize=Math.min(200,Math.max(10,Number(pageSize)||50));
  const totalPages=Math.max(1,Math.ceil(total/safeSize));
  const safePage=Math.min(totalPages,Math.max(1,Number(page)||1));
  const start=(safePage-1)*safeSize;
  const pageRows=indexed.slice(start,start+safeSize);
  return {headers,rows:pageRows.map(item=>item.row),rowNumbers:pageRows.map(item=>item.sheetRow),total,page:safePage,pageSize:safeSize,totalPages,headerRow,dataStartRow,lastDataRow:indexedRows.length?indexedRows[indexedRows.length-1].sheetRow:dataStartRow-1,cacheTtlSeconds:READ_CACHE_TTL_MS/1000};
}

// Spreadsheet write helpers. All mutations are restricted by the data endpoint allowlist.
export async function mutateTab(spreadsheetId, title, operation, payload) {
  const client=await api();
  const metadata=await client.spreadsheets.get({spreadsheetId,fields:"sheets.properties"});
  const sheet=(metadata.data.sheets||[]).find(item=>item.properties?.title===title);
  if(!sheet)throw new Error(`Sheet "${title}" was not found.`);
  const sheetId=sheet.properties.sheetId;
  const rowNumber=Number(payload.rowNumber||0);
  const editableColumns=[...new Set((payload.editableColumns||[]).map(Number))].filter(n=>Number.isInteger(n)&&n>=0&&n<200);
  if(!editableColumns.length)throw new Error("No editable columns are configured.");
  const colLetter=n=>{let x=n+1,out="";while(x){const r=(x-1)%26;out=String.fromCharCode(65+r)+out;x=Math.floor((x-1)/26);}return out;};
  const quoted=`'${String(title).replace(/'/g,"''")}'`;
  const enteredValue=index=>{
    const value=String(payload.values?.[index]??"");
    const header=String(payload.headers?.[index]||"");
    return /phone|mobile|handphone|nomor hp/i.test(header)&&/^\\+/.test(value)?"'"+value:value;
  };
  const invalidate=()=>{for(const key of [...readCache.keys()])if(key.startsWith(`${spreadsheetId}:`)&&key.includes(quoted))readCache.delete(key);};
  if(operation==="update"){
    if(rowNumber<payload.dataStartRow||rowNumber>Number(payload.lastRow||0))throw new Error("The selected row is outside the current data range. Refresh the table and try again.");
    const data=editableColumns.map(index=>({range:`${quoted}!${colLetter(index)}${rowNumber}`,values:[[enteredValue(index)]]}));
    await with429Retry(()=>client.spreadsheets.values.batchUpdate({spreadsheetId,valueInputOption:"USER_ENTERED",requestBody:{data}}));
    invalidate();return {rowNumber};
  }
  if(operation==="delete"){
    if(rowNumber<payload.dataStartRow||rowNumber>Number(payload.lastRow||0))throw new Error("The selected row is outside the current data range. Refresh the table and try again.");
    await with429Retry(()=>client.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:[{deleteDimension:{range:{sheetId,dimension:"ROWS",startIndex:rowNumber-1,endIndex:rowNumber}}}]}}));
    invalidate();return {rowNumber};
  }
  if(operation==="add"){
    const lastRow=Number(payload.lastRow||0);
    const insertAt=Math.max(Number(payload.dataStartRow)-1,lastRow);
    const formulaColumns=[...new Set((payload.formulaColumns||[]).map(Number))].filter(n=>Number.isInteger(n)&&n>=0);
    const requests=[{insertDimension:{range:{sheetId,dimension:"ROWS",startIndex:insertAt,endIndex:insertAt+1},inheritFromBefore:true}}];
    // Copy the latest existing formula per formula column, rather than copying a whole
    // row that could duplicate stale user-entered values.
    if(lastRow>=Number(payload.dataStartRow)&&formulaColumns.length){
      const formulaRanges=formulaColumns.map(index=>`${quoted}!${colLetter(index)}${payload.dataStartRow}:${colLetter(index)}${lastRow}`);
      const formulaResponse=await with429Retry(()=>client.spreadsheets.values.batchGet({spreadsheetId,ranges:formulaRanges,valueRenderOption:"FORMULA"}));
      const valueRanges=formulaResponse.data.valueRanges||[];
      formulaColumns.forEach((column,index)=>{
        const cells=valueRanges[index]?.values||[];
        let sourceRow=0;
        for(let r=cells.length-1;r>=0;r--){
          const value=cells[r]?.[0];
          if(typeof value==="string"&&value.startsWith("=")){sourceRow=Number(payload.dataStartRow)+r;break;}
        }
        if(sourceRow){
          requests.push({copyPaste:{source:{sheetId,startRowIndex:sourceRow-1,endRowIndex:sourceRow,startColumnIndex:column,endColumnIndex:column+1},destination:{sheetId,startRowIndex:insertAt,endRowIndex:insertAt+1,startColumnIndex:column,endColumnIndex:column+1},pasteType:"PASTE_FORMULA",pasteOrientation:"NORMAL"}});
        }
      });
    }
    await with429Retry(()=>client.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests}}));
    const newRow=insertAt+1;
    const data=editableColumns.map(index=>({range:`${quoted}!${colLetter(index)}${newRow}`,values:[[enteredValue(index)]]}));
    if(data.length)await with429Retry(()=>client.spreadsheets.values.batchUpdate({spreadsheetId,valueInputOption:"USER_ENTERED",requestBody:{data}}));
    invalidate();return {rowNumber:newRow};
  }
  throw new Error("Unsupported spreadsheet operation.");
}

