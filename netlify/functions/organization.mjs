import { google } from "googleapis";
import { requireAdmin } from "./_lib/auth.mjs";
import { json } from "./_lib/http.mjs";
import { addActivity } from "./_lib/sheets.mjs";

const MAIN_ID=process.env.GOOGLE_SHEET_ID||"17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TAB="EMP Organization Master";
const HEADERS=["ID","Category","Name","Status","Created At","Updated At"];
const LIST_TAB="EMP Organization Lists";
const SOURCE_HEADERS=[{tab:"RFP 2026",headerRow:1},{tab:"2026 Rec Pipeline",headerRow:1},{tab:"SPK 2026",headerRow:1},{tab:"MCU 2026",headerRow:1},{tab:"MCU Induction 2026",headerRow:1},{tab:"Extend 2026",headerRow:2},{tab:"New Hire 2026",headerRow:1},{tab:"New Hire vs Exit",headerRow:1}];
function colLetter(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
async function syncNativeDropdowns(api){
 const all=await list(api);const categories=["Department","Business Unit","Position"];
 const lists=categories.map(cat=>all.filter(x=>x.category===cat&&x.status==="Active").map(x=>x.name));
 const meta=await api.spreadsheets.get({spreadsheetId:MAIN_ID,fields:"sheets.properties(sheetId,title)"});let listSheet=(meta.data.sheets||[]).find(x=>x.properties.title===LIST_TAB);
 if(!listSheet){const r=await api.spreadsheets.batchUpdate({spreadsheetId:MAIN_ID,requestBody:{requests:[{addSheet:{properties:{title:LIST_TAB,hidden:true}}}]}});listSheet=r.data.replies[0].addSheet;}
 const listId=listSheet.properties?.sheetId??listSheet.sheetId;
 const max=Math.max(1,...lists.map(x=>x.length));const values=[categories,...Array.from({length:max},(_,i)=>lists.map(x=>x[i]||""))];
 await api.spreadsheets.values.clear({spreadsheetId:MAIN_ID,range:`'${LIST_TAB}'!A:C`}).catch(()=>{});
 await api.spreadsheets.values.update({spreadsheetId:MAIN_ID,range:`'${LIST_TAB}'!A1:C${max+1}`,valueInputOption:"RAW",requestBody:{values}});
 const requests=[];
 for(const source of SOURCE_HEADERS){
  const sh=(meta.data.sheets||[]).find(x=>x.properties.title===source.tab);if(!sh)continue;
  const h=await api.spreadsheets.values.get({spreadsheetId:MAIN_ID,range:`'${source.tab}'!A${source.headerRow}:AZ${source.headerRow}`}).catch(()=>({data:{values:[]}}));
  (h.data.values?.[0]||[]).forEach((raw,index)=>{const label=String(raw||"").trim();const cat=/^department$|^departemen$/i.test(label)?"Department":/^business\s*unit$/i.test(label)?"Business Unit":/^position$|^job\s*title$|^jabatan$/i.test(label)?"Position":null;if(!cat)return;const listCol=String.fromCharCode(65+categories.indexOf(cat));requests.push({setDataValidation:{range:{sheetId:sh.properties.sheetId,startRowIndex:source.headerRow,endRowIndex:10000,startColumnIndex:index,endColumnIndex:index+1},rule:{condition:{type:"ONE_OF_RANGE",values:[{userEnteredValue:`='${LIST_TAB}'!$${listCol}$2:$${listCol}$${max+1}`}]},strict:true,showCustomUi:true}}});});
 }
 if(requests.length)await api.spreadsheets.batchUpdate({spreadsheetId:MAIN_ID,requestBody:{requests}});
}

let clientPromise;
async function sheets(){
  if(!clientPromise){clientPromise=(async()=>{const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error("Google service account is not configured.");const auth=new google.auth.GoogleAuth({credentials:JSON.parse(raw),scopes:["https://www.googleapis.com/auth/spreadsheets"]});return google.sheets({version:"v4",auth});})();}
  return clientPromise;
}
async function ensureTab(api){
  const meta=await api.spreadsheets.get({spreadsheetId:MAIN_ID,fields:"sheets.properties(sheetId,title)"});
  let sheet=(meta.data.sheets||[]).find(s=>s.properties.title===TAB);
  if(!sheet){const created=await api.spreadsheets.batchUpdate({spreadsheetId:MAIN_ID,requestBody:{requests:[{addSheet:{properties:{title:TAB,hidden:true}}}]}});sheet={properties:created.data.replies[0].addSheet.properties};}
  const header=await api.spreadsheets.values.get({spreadsheetId:MAIN_ID,range:`'${TAB}'!A1:F1`}).catch(()=>({data:{values:[]}}));
  if(!header.data.values?.length)await api.spreadsheets.values.update({spreadsheetId:MAIN_ID,range:`'${TAB}'!A1:F1`,valueInputOption:"RAW",requestBody:{values:[HEADERS]}});
}
function clean(v){return String(v??"").trim();}
async function list(api){const r=await api.spreadsheets.values.get({spreadsheetId:MAIN_ID,range:`'${TAB}'!A2:F`});return (r.data.values||[]).map((v,i)=>({rowNumber:i+2,id:v[0]||"",category:v[1]||"",name:v[2]||"",status:v[3]||"Active",createdAt:v[4]||"",updatedAt:v[5]||""})).filter(x=>x.id);}
export const handler=async event=>{
 try{
  const actor=await requireAdmin(event);if(!actor)return json(403,{error:"Admin access required."});
  const api=await sheets();await ensureTab(api);
  if(event.httpMethod==="GET")return json(200,{items:await list(api),categories:["Department","Business Unit","Position"]});
  if(event.httpMethod!=="POST"&&event.httpMethod!=="PATCH"&&event.httpMethod!=="DELETE")return json(405,{error:"Method not allowed."});
  const body=JSON.parse(event.body||"{}");const now=new Date().toISOString();
  const allowed=["Department","Business Unit","Position"];
  if(event.httpMethod==="POST"){
   const category=clean(body.category),name=clean(body.name);if(!allowed.includes(category)||!name) return json(400,{error:"Choose a category and enter a name."});
   const items=await list(api);if(items.some(x=>x.category===category&&x.name.toLowerCase()===name.toLowerCase()&&x.status==="Active"))return json(409,{error:`${category} already exists.`});
   const id=`ORG-${Date.now().toString(36).toUpperCase()}`;
   await api.spreadsheets.values.append({spreadsheetId:MAIN_ID,range:`'${TAB}'!A:F`,valueInputOption:"RAW",insertDataOption:"INSERT_ROWS",requestBody:{values:[[id,category,name,"Active",now,now]]}});
   await syncNativeDropdowns(api);await addActivity(actor.username,"Create","Organization Master",id,`Added ${category}: ${name}`);return json(201,{success:true,id});
  }
  const row=Number(body.rowNumber);if(!Number.isInteger(row)||row<2)return json(400,{error:"Invalid organization record."});
  const items=await list(api),existing=items.find(x=>x.rowNumber===row);if(!existing)return json(404,{error:"Organization record not found."});
  if(event.httpMethod==="PATCH"){
   const category=clean(body.category||existing.category),name=clean(body.name||existing.name),status=body.status==="Inactive"?"Inactive":"Active";
   if(!allowed.includes(category)||!name)return json(400,{error:"Invalid category or name."});
   if(items.some(x=>x.rowNumber!==row&&x.category===category&&x.name.toLowerCase()===name.toLowerCase()&&x.status==="Active"&&status==="Active"))return json(409,{error:`${category} already exists.`});
   await api.spreadsheets.values.update({spreadsheetId:MAIN_ID,range:`'${TAB}'!B${row}:F${row}`,valueInputOption:"RAW",requestBody:{values:[[category,name,status,existing.createdAt||now,now]]}});
   await syncNativeDropdowns(api);await addActivity(actor.username,"Update","Organization Master",existing.id,`Updated ${category}: ${name}`);return json(200,{success:true});
  }
  await api.spreadsheets.values.update({spreadsheetId:MAIN_ID,range:`'${TAB}'!D${row}:F${row}`,valueInputOption:"RAW",requestBody:{values:[["Inactive",existing.createdAt||now,now]]}});
  await syncNativeDropdowns(api);await addActivity(actor.username,"Deactivate","Organization Master",existing.id,`Deactivated ${existing.category}: ${existing.name}`);return json(200,{success:true});
 }catch(error){return json(500,{error:error.message||"Organization operation failed."});}
};
