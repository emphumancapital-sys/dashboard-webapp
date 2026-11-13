import { google } from "googleapis";
import { hashPassword } from "./auth.mjs";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
export const SYSTEM_USERS = "EMP User Management";
export const SYSTEM_ACTIVITY = "EMP Activity Log";
const USER_HEADERS = ["Username","Password Hash","Full Name","Role","Status","Created At","Updated At"];
const ACTIVITY_HEADERS = ["Timestamp","Actor Username","Action","Module","Record ID","Summary"];

let sheetsClient;
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
export async function getSheetTitles() {
  const s=await api(); const r=await s.spreadsheets.get({spreadsheetId:SHEET_ID,fields:"sheets.properties.title"});
  return (r.data.sheets||[]).map(x=>x.properties.title);
}
export async function ensureSystemSheets() {
  const s=await api(); const titles=await getSheetTitles();
  const requests=[];
  if(!titles.includes(SYSTEM_USERS))requests.push({addSheet:{properties:{title:SYSTEM_USERS}}});
  if(!titles.includes(SYSTEM_ACTIVITY))requests.push({addSheet:{properties:{title:SYSTEM_ACTIVITY}}});
  if(requests.length)await s.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{requests}});
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
}
async function seedAdmin(){
  const username=process.env.BOOTSTRAP_ADMIN_USERNAME||"";
  const password=process.env.BOOTSTRAP_ADMIN_PASSWORD||"";
  if(!username||!password)return;
  const users=await getUsers();
  if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return;
  const s=await api(), now=new Date().toISOString();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A:G`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[[username,hashPassword(password), "EMP Administrator","Admin","Active",now,now]]}});
}
export async function getUsers(){
  const s=await api();
  const r=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A2:G`});
  return (r.data.values||[]).map((v,i)=>({
    rowNumber:i+2,username:String(v[0]||""),passwordHash:String(v[1]||""),
    fullName:String(v[2]||""),role:String(v[3]||"Admin"),status:String(v[4]||"Active"),
    createdAt:String(v[5]||""),updatedAt:String(v[6]||"")
  })).filter(u=>u.username);
}
export async function addActivity(actor,action,module,recordId,summary){
  const s=await api();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A:F`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[[new Date().toISOString(),actor,action,module,recordId,summary]]}});
}
export async function listActivity(days=10){
  const s=await api();
  const r=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${SYSTEM_ACTIVITY}'!A2:F`});
  const cutoff=Date.now()-(days-1)*86400000;
  return (r.data.values||[]).map(v=>({timestamp:v[0]||"",actor:v[1]||"",action:v[2]||"",module:v[3]||"",recordId:v[4]||"",summary:v[5]||""}))
    .filter(x=>x.timestamp&&new Date(x.timestamp).getTime()>=cutoff)
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
}
export async function readTab(title){
  const s=await api();
  const r=await s.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`'${title.replace(/'/g,"''")}'!A:ZZ`,valueRenderOption:"UNFORMATTED_VALUE"});
  const values=r.data.values||[];
  if(!values.length)return {headers:[],rows:[]};
  return {headers:values[0].map(x=>String(x||"").trim()),rows:values.slice(1).filter(row=>row.some(x=>x!==""&&x!==null))};
}
export async function appendUser(values){
  const s=await api();
  await s.spreadsheets.values.append({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A:G`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[values]}});
}
export async function updateUser(rowNumber,values){
  const s=await api();
  await s.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`'${SYSTEM_USERS}'!A${rowNumber}:G${rowNumber}`,valueInputOption:"RAW",requestBody:{values:[values]}});
}


// Read-only access to any tab, including approved external spreadsheets.
// ---- Read optimization -------------------------------------------------
// Netlify function instances may be reused. Keep a short in-memory cache and
// coalesce concurrent requests. This avoids repeated Sheets API reads during
// navigation/pagination. Cache is best-effort per warm function instance.
const READ_CACHE_TTL_MS = 60_000;
const readCache = new Map();
const inflightReads = new Map();
const MAX_CACHE_ENTRIES = 40;

function cacheGet(key) {
  const hit = readCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > READ_CACHE_TTL_MS) { readCache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  if (readCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = [...readCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
    if (oldest) readCache.delete(oldest[0]);
  }
  readCache.set(key, { at:Date.now(), value });
}
async function with429Retry(fn, attempts=3) {
  let last;
  for (let i=0; i<attempts; i++) {
    try { return await fn(); }
    catch (err) {
      last = err;
      const status = err?.code || err?.response?.status;
      if (![429, 500, 502, 503, 504].includes(Number(status)) || i === attempts-1) throw err;
      const retryAfter = Number(err?.response?.headers?.['retry-after'] || 0) * 1000;
      const delay = Math.max(retryAfter, 350 * (2 ** i)) + Math.floor(Math.random()*150);
      await new Promise(resolve=>setTimeout(resolve, delay));
    }
  }
  throw last;
}
function makeRange(title, headerRow) {
  const escaped = String(title).replace(/'/g, "''");
  return `'${escaped}'!A${headerRow}:ZZ`;
}

// Fetch several tabs in one API request per spreadsheet (batchGet).
export async function readManyTabsFromSpreadsheet(spreadsheetId, tabs) {
  const results = new Map();
  const missing = [];
  for (const tab of tabs) {
    const key = `${spreadsheetId}:${tab.title}:${tab.headerRow}`;
    const cached = cacheGet(key);
    if (cached) results.set(tab.key, cached);
    else missing.push({ ...tab, cacheKey:key });
  }
  if (missing.length) {
    const s = await api();
    const requestKey = `batch:${missing.map(x=>x.cacheKey).sort().join('|')}`;
    let pending = inflightReads.get(requestKey);
    if (!pending) {
      pending = with429Retry(() => s.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: missing.map(x=>makeRange(x.title,x.headerRow)),
        valueRenderOption:'UNFORMATTED_VALUE',
        dateTimeRenderOption:'SERIAL_NUMBER'
      })).then(response => {
        const valueRanges = response.data.valueRanges || [];
        return missing.map((tab, i) => {
          const values = valueRanges[i]?.values || [];
          const data = { headers:(values[0]||[]).map(v=>String(v??'').trim()), values };
          cacheSet(tab.cacheKey, data);
          return data;
        });
      }).finally(()=>inflightReads.delete(requestKey));
      inflightReads.set(requestKey,pending);
    }
    const fetched = await pending;
    missing.forEach((tab,i)=>results.set(tab.key,fetched[i]));
  }
  return results;
}

export async function readTabFromSpreadsheet(spreadsheetId, title, headerRow = 1, dataStartRow = headerRow + 1, page = 1, pageSize = 50, search = "") {
  if (!spreadsheetId || !title) throw new Error("Spreadsheet ID and tab name are required.");
  const key = `${spreadsheetId}:${title}:${headerRow}`;
  let raw = cacheGet(key);
  if (!raw) {
    const pending = inflightReads.get(key);
    if (pending) raw = await pending;
    else {
      const promise = (async()=>{
        const s = await api();
        try {
          const response = await with429Retry(()=>s.spreadsheets.values.get({
            spreadsheetId, range:makeRange(title,headerRow),
            valueRenderOption:'UNFORMATTED_VALUE', dateTimeRenderOption:'SERIAL_NUMBER'
          }));
          const values = response.data.values || [];
          const data = { headers:(values[0]||[]).map(v=>String(v??'').trim()), values };
          cacheSet(key,data);
          return data;
        } catch(error) {
          const status = error?.code || error?.response?.status;
          if (status === 403) throw new Error(`Access denied to spreadsheet/tab "${title}". Share the spreadsheet with the service account as Viewer.`);
          if (status === 400 || status === 404) throw new Error(`Spreadsheet or tab "${title}" was not found, or its name is incorrect.`);
          throw new Error(`Google Sheets API error for "${title}": ${error.message || 'unknown error'}`);
        }
      })().finally(()=>inflightReads.delete(key));
      inflightReads.set(key,promise);
      raw = await promise;
    }
  }
  const headers = raw.headers;
  const values = raw.values;
  const width = headers.length;
  let rows = values.slice(Math.max(0,dataStartRow-headerRow)).map(row=>Array.from({length:width},(_,i)=>row[i]??''))
    .filter(row=>row.some(value=>value!==''&&value!==null&&value!==undefined));
  const q=String(search||'').trim().toLocaleLowerCase();
  if(q) rows=rows.filter(row=>row.some(value=>String(value??'').toLocaleLowerCase().includes(q)));
  const total=rows.length;
  const safePageSize=Math.min(200,Math.max(10,Number(pageSize)||50));
  const totalPages=Math.max(1,Math.ceil(total/safePageSize));
  const safePage=Math.min(totalPages,Math.max(1,Number(page)||1));
  const start=(safePage-1)*safePageSize;
  return {headers,rows:rows.slice(start,start+safePageSize),total,page:safePage,pageSize:safePageSize,totalPages,headerRow,dataStartRow,cacheTtlSeconds:READ_CACHE_TTL_MS/1000};
}
