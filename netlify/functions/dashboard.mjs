import { json } from "./_lib/http.mjs";
import { requireAdmin } from "./_lib/auth.mjs";
import { readManyTabsFromSpreadsheet, listActivity } from "./_lib/sheets.mjs";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "17Iz_3lQyCkYLR5E-MyKkyQ_j21Qwda2zaUJf_CW2VYk";
const TABS = [
  {key:"rfp",title:"2026 Rec Pipeline",headerRow:1,startColumn:"A",endColumn:"AI",identityColumns:[0,5]},
  {key:"newHire",title:"New Hire 2026",headerRow:1,startColumn:"A",endColumn:"Q",identityColumns:[4,1]},
  {key:"extension",title:"Extend 2026",headerRow:2,startColumn:"A",endColumn:"U",identityColumns:[9,4]},
  {key:"employees",title:"Data Valid Employees",headerRow:3,startColumn:"A",endColumn:"N",identityColumns:[0,1]},
  {key:"movement",title:"New Hire vs Exit",headerRow:1,startColumn:"A",endColumn:"C",identityColumns:[0]},
  {key:"tpc",title:"2026 TPC Pipeline",headerRow:1,startColumn:"A",endColumn:"U",identityColumns:[0,5]},
  {key:"summary",title:"Dashboard 2026",headerRow:5,startColumn:"B",endColumn:"L",endRow:25}
];
const norm = value => String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function rowsFor(raw,headerRow,dataStartRow=headerRow+1,identityColumns=[]){
  const values=raw?.values||[];
  const headers=(values[0]||[]).map(value=>String(value??"").trim());
  const rows=values.slice(dataStartRow-headerRow).filter(row=>identityColumns.length?identityColumns.some(index=>row[index]!==undefined&&row[index]!==null&&row[index]!==""):row.some(value=>value!==""&&value!==null&&value!==undefined));
  return {headers,rows};
}
function col(headers,name){return headers.findIndex(value=>norm(value)===norm(name));}
function val(row,index){return index<0?"":row[index]??"";}
function parseDate(value){
  if(value===null||value===undefined||value==="")return null;
  const text=String(value).trim();
  let m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(m){let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;let d=new Date(y,b-1,a);if(d.getFullYear()===y&&d.getMonth()===b-1&&d.getDate()===a)return d;d=new Date(y,a-1,b);if(d.getFullYear()===y&&d.getMonth()===a-1&&d.getDate()===b)return d;}
  m=text.match(/^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{2,4})$/);
  if(m){const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};const y=+m[3]<100?2000+(+m[3]):+m[3];const d=new Date(y,months[m[2].slice(0,3).toLowerCase()],+m[1]);if(!Number.isNaN(d.getTime()))return d;}
  const parsed=new Date(text);return Number.isNaN(parsed.getTime())?null:parsed;
}
function dateLabel(date){return date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
const CONTRACT_WINDOW_DAYS=90, CONTRACT_OVERDUE_DAYS=30, JOIN_WINDOW_DAYS=7, SCHEDULE_WINDOW_DAYS=14;
// Dated pipeline steps shown on the Overview schedule: [sheet header, kind, label].
const SCHEDULE_STEPS=[["1st Intv","interview","1st Interview"],["2nd Intv","interview","2nd Interview"],["Offering In","offering","Offering In"],["Offering Done","offering","Offering Done"]];
// Psikotest and MCU dates come from their own tabs, not from the pipeline's formula columns.
const SCHEDULE_TABS=[
  {key:"spk",title:"SPK 2026",headerRow:1,startColumn:"A",endColumn:"Q",kind:"psikotest",label:"Psikotest",date:"TEST",name:"NAMA PESERTA",position:"POSISI",businessUnit:"B.U",code:"RFP"},
  {key:"mcu",title:"MCU 2026",headerRow:1,startColumn:"A",endColumn:"Q",kind:"mcu",label:"MCU",date:"Tanggal MCU",name:"Nama Lengkap",position:"",businessUnit:"Business Unit",code:""}
];
// A date cell may carry a time ("14/11/2026 08:00"); only the date matters here.
const dateOnly=value=>String(value??"").trim().replace(/[T\s]+\d{1,2}[:.]\d{2}.*$/,"");
// Statuses after which Human Capital has nothing left to do for the contract.
export const contractDone=status=>/sent\s*to\s*c\s*(&|and|n)?\s*b|resign/i.test(String(status??""));
function countRows(rows,index){return rows.filter(row=>String(val(row,index)).trim()!=="").length;}

export const handler = async event => {
  if(event.httpMethod!=="GET")return json(405,{error:"Method not allowed"});
  try{
    const actor=await requireAdmin(event);
    if(!actor)return json(401,{error:"Admin authentication required."});
    const data=await readManyTabsFromSpreadsheet(SPREADSHEET_ID,TABS,{forceRefresh:event.queryStringParameters?.refresh==="1"});
    const rfp=rowsFor(data.get("rfp"),1,2,[0,5]);
    const newHire=rowsFor(data.get("newHire"),1,2,[4,1]);
    const extension=rowsFor(data.get("extension"),2,3,[9,4]);
    const employees=rowsFor(data.get("employees"),3,4,[0,1]);
    const movement=rowsFor(data.get("movement"),1,2,[0]);
    const tpc=rowsFor(data.get("tpc"),1,2,[0,5]);

    const today=new Date();today.setHours(0,0,0,0);const currentYear=today.getFullYear();
    const summary=data.get("summary")?.values||[];
    const summaryCell=(sheetRow,relativeColumn)=>summary[sheetRow-5]?.[relativeColumn]??null;
    const asNumber=value=>{const text=String(value??"").trim().replace(/,/g,"");if(text.endsWith("%")){const parsed=Number(text.slice(0,-1));return Number.isFinite(parsed)?parsed/100:0;}const parsed=Number(text);return Number.isFinite(parsed)?parsed:0;};
    const dashboardMetrics={
      rfpTotal:asNumber(summaryCell(7,4)),rfpCompleted:asNumber(summaryCell(7,5)),rfpRate:asNumber(summaryCell(7,6)),
      newHireTotal:asNumber(summaryCell(6,8)),newHireCompleted:asNumber(summaryCell(6,9)),newHireRate:asNumber(summaryCell(6,10)),
      resignation:asNumber(summaryCell(7,0)),termination:asNumber(summaryCell(7,1)),retirement:asNumber(summaryCell(7,2)),
      extensionTotal:asNumber(summaryCell(11,8)),extensionCompleted:asNumber(summaryCell(11,9)),extensionRate:asNumber(summaryCell(11,10))
    };
    const rfpCode=col(rfp.headers,"RFP Code"),rfpDate=col(rfp.headers,"RFP Received"),rfpPosition=col(rfp.headers,"Position"),rfpBU=col(rfp.headers,"Business Unit"),rfpContract=col(rfp.headers,"Contract"),rfpProcess=col(rfp.headers,"RFP Process");
    const currentRfp=rfp.rows.map(row=>({row,date:parseDate(val(row,rfpDate))})).filter(item=>item.date&&item.date.getFullYear()===currentYear).sort((a,b)=>b.date-a.date);
    const rfpRecent=currentRfp.slice(0,8).map(({row,date})=>({
      rfpCode:String(val(row,rfpCode)||"—"),position:String(val(row,rfpPosition)||"—"),businessUnit:String(val(row,rfpBU)||"—"),contract:String(val(row,rfpContract)||"—"),process:String(val(row,rfpProcess)||"—"),received:dateLabel(date)
    }));

    // Contract reminders (Extend 2026). Column O "STATUS" decides whether HC still has to act:
    // "Sent to C&B" or "Resign" means done. Done rows stay listed until the end date as information only.
    const extValues=data.get("extension")?.values||[];
    const endDate=col(extension.headers,"END CONTRACT"),extName=col(extension.headers,"NAME"),extId=col(extension.headers,"ID"),extBU=col(extension.headers,"BUSINESS UNIT"),extPosition=col(extension.headers,"POSITION");
    const extStatus=col(extension.headers,"STATUS")>-1?col(extension.headers,"STATUS"):14;
    const contractAll=extValues.slice(1).map((row,index)=>({row,rowNumber:3+index})).filter(({row})=>[9,4].some(i=>row[i]!==undefined&&row[i]!==null&&row[i]!=="")).map(({row,rowNumber})=>{
      const date=parseDate(val(row,endDate));if(!date)return null;
      const status=String(val(row,extStatus)||"").trim(),done=contractDone(status),daysRemaining=Math.ceil((date-today)/86400000);
      return {rowNumber,details:extension.headers.map((label,i)=>({label,value:String(row[i]??"").trim()})).filter(item=>item.label&&item.value),employee:String(val(row,extName)||"—"),employeeId:String(val(row,extId)||"—"),businessUnit:String(val(row,extBU)||"—"),position:String(val(row,extPosition)||"—"),status,done,daysRemaining,endDate:dateLabel(date),
        state:done?(/resign/i.test(status)?"closed":"sent"):daysRemaining<0?"overdue":"due"};
    }).filter(Boolean)
      // Next 90 days, plus contracts that ended in the last 30 days and were never marked done.
      .filter(item=>(item.daysRemaining>=0&&item.daysRemaining<=CONTRACT_WINDOW_DAYS)||(!item.done&&item.daysRemaining<0&&item.daysRemaining>=-CONTRACT_OVERDUE_DAYS))
      .sort((a,b)=>Number(a.done)-Number(b.done)||a.daysRemaining-b.daysRemaining);
    const contractAlerts=contractAll.slice(0,100);

    // People joining in the next 7 days (New Hire 2026). Information only.
    const nhJoin=col(newHire.headers,"Join Date"),nhName=col(newHire.headers,"Name"),nhPosition=col(newHire.headers,"Position"),nhBU=col(newHire.headers,"Business Unit"),nhContract=col(newHire.headers,"Contract"),nhId=col(newHire.headers,"ID");
    const upcomingJoiners=newHire.rows.map(row=>({row,date:parseDate(val(row,nhJoin))})).filter(item=>item.date).map(({row,date})=>({
      name:String(val(row,nhName)||"—"),employeeId:String(val(row,nhId)||""),position:String(val(row,nhPosition)||"—"),businessUnit:String(val(row,nhBU)||"—"),contract:String(val(row,nhContract)||""),joinDate:dateLabel(date),daysUntil:Math.ceil((date-today)/86400000)
    })).filter(item=>item.daysUntil>=0&&item.daysUntil<=JOIN_WINDOW_DAYS).sort((a,b)=>a.daysUntil-b.daysUntil||a.name.localeCompare(b.name)).slice(0,50);

    // Upcoming schedule: every dated pipeline step in the next 14 days (2026 Rec Pipeline), for requests still running.
    const pipeValues=data.get("rfp")?.values||[];
    const ivCode=col(rfp.headers,"RFP Code"),ivPosition=col(rfp.headers,"Position"),ivBU=col(rfp.headers,"Business Unit"),ivCandidate=col(rfp.headers,"Candidates"),ivProcess=col(rfp.headers,"RFP Process"),ivOutcome=col(rfp.headers,"Status");
    const blank=value=>{const text=String(value??"").trim();return !text||/^(#.*|-+|—)$/.test(text);};
    const upcomingSchedule=[],scheduleWarnings=[];
    pipeValues.slice(1).forEach((row,index)=>{
      if(![0,5].some(i=>row[i]!==undefined&&row[i]!==null&&row[i]!==""))return;
      if(/fail|gagal/i.test(String(val(row,ivOutcome)))||/complet|done|closed|selesai|cancel/i.test(String(val(row,ivProcess))))return;
      for(const [header,kind,label] of SCHEDULE_STEPS){
        const date=parseDate(val(row,col(rfp.headers,header)));if(!date)continue;
        const daysUntil=Math.ceil((date-today)/86400000);if(daysUntil<0||daysUntil>SCHEDULE_WINDOW_DAYS)continue;
        upcomingSchedule.push({source:"pipeline",sourceTab:"2026 Rec Pipeline",rowNumber:2+index,kind,label,candidate:String(val(row,ivCandidate)||"").trim(),position:String(val(row,ivPosition)||"—"),businessUnit:String(val(row,ivBU)||"—"),rfpCode:String(val(row,ivCode)||""),date:dateLabel(date),weekday:date.toLocaleDateString("en-GB",{weekday:"short"}),daysUntil,
          details:rfp.headers.map((name,i)=>({label:name,value:String(row[i]??"").trim()})).filter(item=>item.label&&!blank(item.value))});
      }
    });
    // Read separately so the Overview still loads if one of these tabs is missing or renamed.
    for(const tab of SCHEDULE_TABS){
      let values=[];
      try{values=(await readManyTabsFromSpreadsheet(SPREADSHEET_ID,[tab],{forceRefresh:event.queryStringParameters?.refresh==="1"})).get(tab.key)?.values||[];}
      catch(error){scheduleWarnings.push(`${tab.label} schedule unavailable (${tab.title}): ${error.message||"unknown error"}`);continue;}
      const headers=(values[0]||[]).map(value=>String(value??"").trim()),at=name=>name?col(headers,name):-1,dateCol=at(tab.date);
      if(dateCol<0){scheduleWarnings.push(`${tab.label} schedule unavailable: column "${tab.date}" was not found in ${tab.title}.`);continue;}
      values.slice(1).forEach((row,index)=>{
        const date=parseDate(dateOnly(val(row,dateCol)));if(!date)return;
        const daysUntil=Math.ceil((date-today)/86400000);if(daysUntil<0||daysUntil>SCHEDULE_WINDOW_DAYS)return;
        upcomingSchedule.push({source:tab.key,sourceTab:tab.title,rowNumber:tab.headerRow+1+index,kind:tab.kind,label:tab.label,candidate:String(val(row,at(tab.name))||"").trim(),position:String(val(row,at(tab.position))||"").trim()||"—",businessUnit:String(val(row,at(tab.businessUnit))||"").trim()||"—",rfpCode:String(val(row,at(tab.code))||"").trim(),date:dateLabel(date),weekday:date.toLocaleDateString("en-GB",{weekday:"short"}),daysUntil,
          details:headers.map((name,i)=>({label:name,value:String(row[i]??"").trim()})).filter(item=>item.label&&!blank(item.value))});
      });
    }
    const stepOrder=["1st Interview","2nd Interview","Offering In","Offering Done","Psikotest","MCU"];
    upcomingSchedule.sort((a,b)=>a.daysUntil-b.daysUntil||stepOrder.indexOf(a.label)-stepOrder.indexOf(b.label)||String(a.candidate||a.position).localeCompare(String(b.candidate||b.position)));

    const movementReason=col(movement.headers,"REASON");
    const movementCounts={newHire:0,resignation:0,termination:0,retirement:0};
    for(const row of movement.rows){const reason=norm(val(row,movementReason));if(reason==="new hire")movementCounts.newHire++;else if(reason.includes("resign"))movementCounts.resignation++;else if(reason.includes("end of contract")||reason.includes("termination"))movementCounts.termination++;else if(reason.includes("retirement"))movementCounts.retirement++;}

    let activities=[];const warnings=[...scheduleWarnings];
    try{activities=await listActivity(10);}catch(error){warnings.push(`Activity log unavailable: ${error.message||"unknown error"}`);}
    return json(200,{
      generatedAt:new Date().toISOString(),currentYear,
      metrics:{
        rfpRecords:dashboardMetrics.rfpTotal||countRows(rfp.rows,rfpCode),
        newHireRecords:dashboardMetrics.newHireTotal||newHire.rows.length,
        employeeRecords:countRows(employees.rows,col(employees.headers,"EMP#")),
        tpcRecords:tpc.rows.length,
        extensionRecords:dashboardMetrics.extensionTotal,
        employeeExitRecords:dashboardMetrics.resignation+dashboardMetrics.termination+dashboardMetrics.retirement
      },
      completion:{rfp:dashboardMetrics.rfpRate,newHire:dashboardMetrics.newHireRate,extension:dashboardMetrics.extensionRate,rfpCompleted:dashboardMetrics.rfpCompleted,newHireCompleted:dashboardMetrics.newHireCompleted,extensionCompleted:dashboardMetrics.extensionCompleted},
      contractAlerts,contractSummary:{needAction:contractAll.filter(x=>!x.done).length,overdue:contractAll.filter(x=>x.state==="overdue").length,done:contractAll.filter(x=>x.done).length,windowDays:CONTRACT_WINDOW_DAYS},
      upcomingJoiners,joinWindowDays:JOIN_WINDOW_DAYS,upcomingSchedule:upcomingSchedule.slice(0,80),scheduleWindowDays:SCHEDULE_WINDOW_DAYS,rfpAlerts:rfpRecent,movementCounts:{...movementCounts,resignation:dashboardMetrics.resignation||movementCounts.resignation,termination:dashboardMetrics.termination||movementCounts.termination,retirement:dashboardMetrics.retirement||movementCounts.retirement},
      latestActivities:activities.slice(0,5),activityHistory:activities,warnings,
      dataBasis:{rfp:"2026 Rec Pipeline",newHire:"New Hire 2026",extension:"Extend 2026",employees:"Data Valid Employees",movement:"New Hire vs Exit",tpc:"2026 TPC Pipeline"}
    });
  }catch(error){return json(502,{error:error.message||"Dashboard data unavailable"});}
};
