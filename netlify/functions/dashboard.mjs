import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readTab, listActivity } from "./_lib/sheets.mjs";

const SHEETS={
  rec:process.env.SHEET_REC_PIPELINE||"2026 Rec Pipeline",
  newHire:process.env.SHEET_NEW_HIRE||"New Hire 2026",
  extend:process.env.SHEET_EXTEND||"Extend 2026",
  resignation:process.env.SHEET_RESIGNATION||"Resignation 2026",
  termination:process.env.SHEET_TERMINATION||"Termination 2026",
  retirement:process.env.SHEET_RETIREMENT||"Retirement 2026"
};
const norm=s=>String(s||"").trim().toLowerCase();
function findHeader(headers,candidates){
  const hs=headers.map(norm);
  for(const c of candidates){const i=hs.indexOf(norm(c));if(i>=0)return i;}
  for(const c of candidates){const i=hs.findIndex(h=>h&&h.includes(norm(c)));if(i>=0)return i;}
  return -1;
}
function get(row,headers,candidates){const i=findHeader(headers,candidates);return i<0?"":row[i];}
function dateVal(v){
  if(v instanceof Date&&!isNaN(v))return v;
  if(typeof v==="number"&&v>20000&&v<80000)return new Date(Date.UTC(1899,11,30)+v*86400000);
  if(!v)return null;
  const d=new Date(v);return isNaN(d)?null:d;
}
function day(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function fmt(d){return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function contractAlerts(sources,today,warnings){
  const out=[];
  for(const src of sources){
    const {headers,rows}=src.data;
    const idx=findHeader(headers,["contract end date","end date","contract expiry","expiry date","tanggal akhir kontrak","tgl akhir kontrak","tanggal berakhir kontrak","akhir kontrak","end of contract","pkwt end"]);
    if(idx<0){warnings.push(`Contract end-date column not detected in "${src.name}".`);continue;}
    for(const r of rows){
      const d=dateVal(r[idx]);if(!d)continue;
      const days=Math.ceil((day(d)-today)/86400000);if(days<0||days>90)continue;
      out.push({employee:String(get(r,headers,["employee name","nama karyawan","name","nama"])||"—"),employeeId:String(get(r,headers,["employee id","nik","personnel number"])||"—"),businessUnit:String(get(r,headers,["business unit","division","bu"])||"—"),position:String(get(r,headers,["position","job title","jabatan"])||"—"),endDate:fmt(d),daysRemaining:days,source:src.name});
    }
  }
  return out.sort((a,b)=>a.daysRemaining-b.daysRemaining);
}
function rfpAlerts(src,today,warnings){
  const {headers,rows}=src;
  const dateIdx=findHeader(headers,["request date","rfp date","date request","tanggal request","tanggal rfp","received date","rfp received","open date"]);
  const typeIdx=findHeader(headers,["recruitment type","request type","contract type","jenis recruitment","jenis permintaan","employment type","type"]);
  if(dateIdx<0){warnings.push(`RFP request-date column not detected in "${SHEETS.rec}".`);return[];}
  if(typeIdx<0){warnings.push("RFP recruitment-type column not detected; aging alerts are withheld to avoid misclassification.");return[];}
  const allowed=["pkwt addition","pkwt replacement","tpc to pkwt"],out=[];
  for(const r of rows){
    const type=norm(r[typeIdx]);if(!allowed.some(x=>type.includes(x)))continue;
    const d=dateVal(r[dateIdx]);if(!d)continue;
    const age=Math.floor((today-day(d))/86400000);if(age<30)continue;
    out.push({rfpNumber:String(get(r,headers,["rfp number","no rfp","request number","no. rfp"])||"—"),businessUnit:String(get(r,headers,["business unit","division","bu"])||"—"),position:String(get(r,headers,["position","job title","jabatan","manpower position"])||"—"),recruitmentType:String(r[typeIdx]),requestDate:fmt(d),ageDays:age,status:String(get(r,headers,["rfp status","status"])||"—"),pic:String(get(r,headers,["pic","recruiter","request by","owner"])||"—")});
  }
  return out.sort((a,b)=>b.ageDays-a.ageDays);
}
export const handler = async event=>{
  if(event.httpMethod!=="GET")return json(405,{error:"Method not allowed"});
  try{
    const actor=await requireAdmin(event);if(!actor)return json(401,{error:"Admin authentication required."});
    const warnings=[];
    const names=[SHEETS.newHire,SHEETS.extend,SHEETS.rec,SHEETS.resignation,SHEETS.termination,SHEETS.retirement];
    const results=await Promise.all(names.map(async name=>({name,data:await readTab(name)})));
    const byName=Object.fromEntries(results.map(x=>[x.name,x.data]));
    const today=day(new Date()),year=today.getFullYear();
    const nh=byName[SHEETS.newHire]||{headers:[],rows:[]},ext=byName[SHEETS.extend]||{headers:[],rows:[]},rec=byName[SHEETS.rec]||{headers:[],rows:[]};
    const contracts=contractAlerts([{name:SHEETS.newHire,data:nh},{name:SHEETS.extend,data:ext}],today,warnings);
    const rfps=rfpAlerts(rec,today,warnings);
    const joinIdx=findHeader(nh.headers,["join date","hire date","tanggal join","tgl join"]);
    const newHiresThisYear=joinIdx<0?0:nh.rows.filter(r=>{const d=dateVal(r[joinIdx]);return d&&d.getFullYear()===year;}).length;
    const activity=await listActivity(10);
    return json(200,{generatedAt:new Date().toISOString(),currentYear:year,metrics:{newHireRecords:nh.rows.length,contractDue:contracts.length,agingRfp:rfps.length,newHiresThisYear,movementRecords:["resignation","termination","retirement"].reduce((n,k)=>n+(byName[SHEETS[k]]?.rows.length||0),0)},contractAlerts:contracts.slice(0,12),rfpAlerts:rfps.slice(0,12),latestActivities:activity.slice(0,5),activityHistory:activity,warnings});
  }catch(e){return json(500,{error:e.message||"Dashboard data unavailable"});}
};
