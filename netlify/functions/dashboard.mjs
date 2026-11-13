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

    const endDate=col(extension.headers,"END CONTRACT"),extName=col(extension.headers,"NAME"),extId=col(extension.headers,"ID"),extBU=col(extension.headers,"BUSINESS UNIT"),extPosition=col(extension.headers,"POSITION"),extStatus=col(extension.headers,"RFP STATUS");
    const contractAlerts=extension.rows.map(row=>({row,date:parseDate(val(row,endDate))})).filter(item=>item.date).map(({row,date})=>({
      employee:String(val(row,extName)||"—"),employeeId:String(val(row,extId)||"—"),businessUnit:String(val(row,extBU)||"—"),position:String(val(row,extPosition)||"—"),status:String(val(row,extStatus)||"—"),date,daysRemaining:Math.ceil((date-today)/86400000)
    })).filter(item=>item.daysRemaining>=0&&item.daysRemaining<=90).sort((a,b)=>a.daysRemaining-b.daysRemaining).slice(0,10).map(item=>({...item,endDate:dateLabel(item.date),date:undefined}));

    const movementReason=col(movement.headers,"REASON");
    const movementCounts={newHire:0,resignation:0,termination:0,retirement:0};
    for(const row of movement.rows){const reason=norm(val(row,movementReason));if(reason==="new hire")movementCounts.newHire++;else if(reason.includes("resign"))movementCounts.resignation++;else if(reason.includes("end of contract")||reason.includes("termination"))movementCounts.termination++;else if(reason.includes("retirement"))movementCounts.retirement++;}

    let activities=[];const warnings=[];
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
      contractAlerts,rfpAlerts:rfpRecent,movementCounts:{...movementCounts,resignation:dashboardMetrics.resignation||movementCounts.resignation,termination:dashboardMetrics.termination||movementCounts.termination,retirement:dashboardMetrics.retirement||movementCounts.retirement},
      latestActivities:activities.slice(0,5),activityHistory:activities,warnings,
      dataBasis:{rfp:"2026 Rec Pipeline",newHire:"New Hire 2026",extension:"Extend 2026",employees:"Data Valid Employees",movement:"New Hire vs Exit",tpc:"2026 TPC Pipeline"}
    });
  }catch(error){return json(502,{error:error.message||"Dashboard data unavailable"});}
};
