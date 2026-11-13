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
