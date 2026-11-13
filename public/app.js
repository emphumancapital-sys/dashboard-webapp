const $ = id => document.getElementById(id);
const state = { user: null, users: [], editing: null, sources: [], activeSource: null, dataPage: 1, dataPageSize: 50, dataTotalPages: 1, searchTimer: null };

document.addEventListener("DOMContentLoaded", async () => {
  renderStaticIcons();
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"}).format(new Date());
  bindEvents();
  try {
    const res = await api("/.netlify/functions/auth-me");
    if (res.authenticated) enterApp(res.user);
    else showLogin();
  } catch { showLogin(); }
});

function bindEvents(){
  $("loginForm").addEventListener("submit", login);
  $("togglePassword").addEventListener("click",()=>{const p=$("loginPassword");const visible=p.type==="password";p.type=visible?"text":"password";$("togglePassword").innerHTML=svgIcon(visible?"eye-off":"eye",17);$("togglePassword").setAttribute("aria-label",visible?"Hide password":"Show password");});
  $("logoutButton").addEventListener("click",logout);
  $("refreshButton").addEventListener("click",refreshCurrent);
  $("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
  $("addUserButton").addEventListener("click",()=>openUserModal());
  $("closeModal").addEventListener("click",closeUserModal);
  $("cancelModal").addEventListener("click",closeUserModal);
  $("userModal").addEventListener("click",e=>{if(e.target===$("userModal"))closeUserModal();});
  $("userForm").addEventListener("submit",saveUser);
  $("userSearch").addEventListener("input",renderUsers);
  $("viewHistory").addEventListener("click",()=>$("historyPanel").scrollIntoView({behavior:"smooth",block:"center"}));
  $("dataSearch").addEventListener("input",()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.dataPage=1;loadSourceData();},350);});
  $("dataRefresh").addEventListener("click",()=>loadSourceData(true));
  $("dataPrev").addEventListener("click",()=>{if(state.dataPage>1){state.dataPage--;loadSourceData();}});
  $("dataNext").addEventListener("click",()=>{if(state.dataPage<state.dataTotalPages){state.dataPage++;loadSourceData();}});
}
async function api(url,options={}){
  const res=await fetch(url,{...options,credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data=await res.json().catch(()=>({error:"Invalid server response"}));
  if(!res.ok)throw new Error(data.error||"Request failed");
  return data;
}
async function login(e){
  e.preventDefault();const btn=$("loginButton"),err=$("loginError");err.hidden=true;btn.disabled=true;btn.textContent="Signing in…";
  try{
    const result=await api("/.netlify/functions/auth-login",{method:"POST",body:JSON.stringify({username:$("loginUsername").value.trim(),password:$("loginPassword").value})});
    enterApp(result.user);
  }catch(error){err.textContent=error.message;err.hidden=false;}
  finally{btn.disabled=false;btn.innerHTML='Sign In <span>→</span>';}
}
async function logout(){try{await api("/.netlify/functions/auth-logout",{method:"POST",body:"{}"});}catch{}state.user=null;$("appView").hidden=true;$("loginView").hidden=false;$("loginPassword").value="";}
function showLogin(){$("loginView").hidden=false;$("appView").hidden=true;}
function enterApp(user){
  state.user=user;$("loginView").hidden=true;$("appView").hidden=false;
  const name=user.fullName||user.username;$("profileName").textContent=name;$("profileRole").textContent=user.role||"Admin";$("profileInitial").textContent=initial(name);$("topInitial").textContent=initial(name);
  loadDashboard();
  loadSources();
}
function navigate(page, sourceId=null){
  document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".data-nav-item").forEach(b=>b.classList.toggle("active",page==="data"&&b.dataset.source===sourceId));
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $("page-"+page).classList.add("active");
  if(page==="users")$("breadcrumbCurrent").textContent="User Management";
  else if(page==="data"){const src=state.sources.find(x=>x.id===sourceId)||state.activeSource;state.activeSource=src||state.activeSource;$("breadcrumbCurrent").textContent=src?.label||"Data";if(src){state.dataPage=1;$("dataSearch").value="";loadSourceData();}}
  else $("breadcrumbCurrent").textContent="Overview";
  $("sidebar").classList.remove("open");
  if(page==="users")loadUsers();
}
function refreshCurrent(){if($("page-users").classList.contains("active"))loadUsers();else if($("page-data").classList.contains("active"))loadSourceData(true);else loadDashboard(true);}
async function loadDashboard(forceRefresh=false){
  $("refreshButton").disabled=true;
  try{const data=await api(`/.netlify/functions/dashboard${forceRefresh?"?refresh=1":""}`);renderDashboard(data);}
  catch(e){toast(e.message);}
  finally{$("refreshButton").disabled=false;}
}
function renderDashboard(d){
  const m=d.metrics||{};
  $("metricNewHire").textContent=fmt(m.rfpRecords);
  $("metricContract").textContent=fmt(m.newHireRecords);
  $("metricRfp").textContent=fmt(m.extensionRecords);
  $("metricYear").textContent=fmt(m.employeeExitRecords);
  const completion=d.completion||{};
  $("metricRfpCaption").textContent=`${fmt(completion.rfpCompleted)} completed · ${pct(completion.rfp)} completion`;
  $("metricHireCaption").textContent=`${fmt(completion.newHireCompleted)} completed · ${pct(completion.newHire)} completion`;
  $("metricExtensionCaption").textContent=`${fmt(completion.extensionCompleted)} completed · ${pct(completion.extension)} completion`;
  const exits=d.movementCounts||{};
  $("yearCaption").textContent=`${fmt(exits.resignation)} resignation · ${fmt(exits.termination)} termination · ${fmt(exits.retirement)} retirement`;
  $("contractCount").textContent=(d.contractAlerts||[]).length+" upcoming";
  $("rfpCount").textContent=(d.rfpAlerts||[]).length+" recent records";
  $("lastUpdated").textContent="Updated "+new Date(d.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  $("contractRows").innerHTML=d.contractAlerts?.length?d.contractAlerts.map(r=>`<tr><td><div class="employee-cell"><b>${esc(r.employee)}</b><small>${esc(r.employeeId)} · ${esc(r.position)}</small></div></td><td>${esc(r.businessUnit)}</td><td>${esc(r.endDate)}</td><td><span class="days-chip ${r.daysRemaining<=30?"critical":r.daysRemaining>60?"safe":""}">${r.daysRemaining===0?"Today":"In "+r.daysRemaining+" days"}</span></td></tr>`).join(""):`<tr><td colspan="4" class="empty-cell">No contract end dates within the next 90 days.</td></tr>`;
  $("rfpRows").innerHTML=d.rfpAlerts?.length?d.rfpAlerts.map(r=>`<tr><td><div class="employee-cell"><b>${esc(r.position)}</b><small>${esc(r.rfpCode)}</small></div></td><td>${esc(r.businessUnit)}</td><td>${esc(r.contract)}</td><td>${esc(r.process)}</td></tr>`).join(""):`<tr><td colspan="4" class="empty-cell">No RFP records received in ${d.currentYear}.</td></tr>`;
  $("rfpYearCaption").textContent=String(d.currentYear||"");
  renderActivity(d.latestActivities||[],$("latestActivity"),false);renderActivity(d.activityHistory||[],$("historyList"),true);
  const warnings=d.warnings||[];$("warningBox").hidden=!warnings.length;$("warningBox").textContent=warnings.length?warnings.join(" · "):"";
}
function renderActivity(rows,target,history){
  if(!rows.length){target.innerHTML=`<div class="empty-state">${history?"No activity in the last 10 days.":"No activity recorded yet."}</div>`;return;}
  target.innerHTML=rows.map(r=>{const date=r.timestamp?new Date(r.timestamp):null;const time=date?date.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";return `<div class="activity-item">${history?`<span class="activity-time">${esc(time)}</span>`:`<span class="activity-symbol">${svgIcon(iconFor(r.action),15)}</span>`}<div class="activity-copy"><b>${esc(r.action)} · ${esc(r.module)}</b><small>${esc(r.summary)}${r.actor?" — "+esc(r.actor):""}</small></div>${history?"":`<span class="activity-time">${date?date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</span>`}</div>`;}).join("");
}
async function loadSources(){
  const nav=$("dataNav");nav.innerHTML='<div class="nav-loading">Loading spreadsheet tabs…</div>';
  try{
    const result=await api("/.netlify/functions/data?action=sources");
    state.sources=result.sources||[];
    const groups=new Map();
    state.sources.forEach(source=>{if(!groups.has(source.group))groups.set(source.group,[]);groups.get(source.group).push(source);});
    nav.innerHTML=[...groups.entries()].map(([group,sources])=>`<div class="nav-caption">${esc(group)}</div>${sources.map(source=>{
      const icon=source.status==="needs_attention"?"alert-circle":source.status==="unavailable"?"alert-triangle":iconForSource(source.id);
      return `<button class="nav-item data-nav-item ${state.activeSource?.id===source.id?"active":""}" data-source="${escAttr(source.id)}"><span class="nav-icon ${source.status!=="ready"?"nav-icon-warning":""}">${svgIcon(icon,17)}</span><span class="nav-label">${esc(source.label)}</span>${source.status==="needs_attention"?'<span class="nav-status" title="Source structure needs attention">!</span>':source.status==="unavailable"?'<span class="nav-status danger" title="Source unavailable">!</span>':""}</button>`;
    }).join("")}`).join("");
    nav.querySelectorAll("[data-source]").forEach(button=>button.addEventListener("click",()=>navigate("data",button.dataset.source)));
    const connected=result.summary?.connected??state.sources.filter(x=>x.available).length;
    const total=result.summary?.total??state.sources.length;
    const failed=result.summary?.failed??state.sources.filter(x=>!x.available).length;
    const attention=result.summary?.needsAttention??state.sources.filter(x=>x.status==="needs_attention").length;
    const indicator=document.querySelector(".connection");
    if(indicator)indicator.innerHTML=`<span class="status-dot ${failed?"is-warning":""}"></span><span>${connected}/${total} tabs accessible${attention?` · ${attention} need review`:""}</span>`;
    if(failed)toast(`${failed} spreadsheet tab(s) could not be accessed. Open the source list to inspect details.`);
  }catch(error){nav.innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;toast(error.message);}
}
async function loadSourceData(forceRefresh=false){
  const source=state.activeSource;if(!source)return;
  $("dataTitle").textContent=source.label;$("dataGroup").textContent=source.group;$("dataSubtitle").textContent=`Read-only view · ${source.tab}`;
  $("sourceTableHead").innerHTML="";$("sourceTableBody").innerHTML='<tr><td class="empty-cell">Loading source data…</td></tr>';
  $("dataError").hidden=true;$("dataRefresh").disabled=true;
  if(source.status==="needs_attention"){
    $("sourceTableBody").innerHTML=`<tr><td class="empty-cell" colspan="8"><div class="source-attention"><span>${svgIcon("alert-circle",22)}</span><b>Source tab needs a header correction</b><p>${esc(source.schemaMessage||"The tab is accessible, but its table structure is not ready to display.")}</p><small>Spreadsheet tab: ${esc(source.tab)}</small></div></td></tr>`;
    $("dataRecordCount").textContent="Structure review";$("dataPageInfo").textContent="Table unavailable";$("dataPrev").disabled=true;$("dataNext").disabled=true;
    $("dataSourceMeta").innerHTML=`<span class="source-meta-chip"><strong>Tab:</strong> ${esc(source.tab)}</span><span class="source-meta-chip"><strong>Header row:</strong> ${source.headerRow}</span><span class="source-meta-chip"><strong>Status:</strong> Needs review</span>`;
    $("dataUpdated").textContent="Schema review required";$("dataRefresh").disabled=false;return;
  }
  if(source.status==="unavailable"){
    $("sourceTableBody").innerHTML=`<tr><td class="empty-cell">This tab could not be accessed during the last source check.</td></tr>`;
    $("dataError").hidden=false;$("dataError").textContent=source.error||"The source is unavailable.";$("dataRefresh").disabled=false;return;
  }
  try{
    const q=new URLSearchParams({source:source.id,page:String(state.dataPage),pageSize:String(state.dataPageSize),search:$("dataSearch").value||"",...(forceRefresh?{refresh:"1"}:{})});
    const data=await api(`/.netlify/functions/data?${q}`);
    if(data.needsAttention){source.status="needs_attention";source.schemaMessage=data.message;loadSourceData();return;}
    state.dataTotalPages=data.totalPages||1;state.dataPage=data.page||1;
    $("sourceTableHead").innerHTML=`<tr>${data.headers.map((h,i)=>`<th title="${escAttr(h)}">${esc(h)}</th>`).join("")}</tr>`;
    $("sourceTableBody").innerHTML=data.rows.length?data.rows.map(row=>`<tr>${row.map(value=>`<td title="${escAttr(formatCell(value))}">${esc(formatCell(value))}</td>`).join("")}</tr>`).join(""):`<tr><td class="empty-cell" colspan="${Math.max(data.headers.length,1)}">No records found${$("dataSearch").value?" for this search":" in this tab"}.</td></tr>`;
    $("dataRecordCount").textContent=`${Number(data.total||0).toLocaleString()} records`;
    $("dataPageInfo").textContent=`Page ${state.dataPage} of ${state.dataTotalPages}`;
    $("dataPrev").disabled=state.dataPage<=1;$("dataNext").disabled=state.dataPage>=state.dataTotalPages;
    $("dataUpdated").textContent=`Updated ${new Date(data.checkedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
    $("dataSourceMeta").innerHTML=`<span class="source-meta-chip"><strong>Source tab:</strong> ${esc(data.source.tab)}</span><span class="source-meta-chip"><strong>Header row:</strong> ${data.headerRow}</span><span class="source-meta-chip"><strong>Data starts:</strong> row ${data.dataStartRow}</span><span class="source-meta-chip"><strong>Columns:</strong> ${data.headers.length}</span><span class="source-meta-chip"><strong>Mode:</strong> Read only</span>`;
  }catch(error){
    $("sourceTableBody").innerHTML='<tr><td class="empty-cell">Could not load source data.</td></tr>';
    $("dataError").hidden=false;$("dataError").textContent=error.message;$("dataRecordCount").textContent="—";$("dataPageInfo").textContent="—";
    $("dataSourceMeta").innerHTML=`<span class="source-meta-chip"><strong>Source tab:</strong> ${esc(source.tab)}</span>`;
  }finally{$("dataRefresh").disabled=false;}
}
function formatCell(value){return value===null||value===undefined?"":String(value);}
async function loadUsers(){
  $("userRows").innerHTML='<tr><td colspan="5" class="empty-cell">Loading users…</td></tr>';
  try{const d=await api("/.netlify/functions/users");state.users=d.users||[];renderUsers();}catch(e){toast(e.message);}
}
function renderUsers(){
  const q=$("userSearch").value.toLowerCase().trim(),users=state.users.filter(u=>(u.username+" "+u.fullName+" "+u.role+" "+u.status).toLowerCase().includes(q));
  $("usersTotal").textContent=state.users.length;$("usersActive").textContent=state.users.filter(u=>u.status==="Active").length;$("usersAdmins").textContent=state.users.filter(u=>u.role==="Admin").length;
  $("userRows").innerHTML=users.length?users.map(u=>`<tr><td><div class="user-cell"><span class="avatar">${initial(u.fullName||u.username)}</span><div><b>${esc(u.fullName)}</b><small>@${esc(u.username)}</small></div></div></td><td><span class="role-label">${esc(u.role)}</span></td><td><span class="status-label ${u.status==="Inactive"?"inactive":""}">${esc(u.status)}</span></td><td>${u.updatedAt?new Date(u.updatedAt).toLocaleDateString():"—"}</td><td><div class="row-actions"><button class="small-action" data-edit="${escAttr(u.username)}">Edit</button><button class="small-action" data-toggle="${escAttr(u.username)}" data-status="${u.status==="Active"?"Inactive":"Active"}">${u.status==="Active"?"Deactivate":"Activate"}</button></div></td></tr>`).join(""):'<tr><td colspan="5" class="empty-cell">No users found.</td></tr>';
  document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openUserModal(state.users.find(u=>u.username===b.dataset.edit))));
  document.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm(`${b.dataset.status} ${b.dataset.toggle}?`))return;try{await api("/.netlify/functions/users",{method:"PATCH",body:JSON.stringify({username:b.dataset.toggle,status:b.dataset.status})});toast("User status updated.");loadUsers();loadDashboard();}catch(e){toast(e.message);}}));
}
function openUserModal(user=null){
  state.editing=user?.username||null;$("userForm").reset();$("modalTitle").textContent=user?"Edit User":"Add User";$("userUsername").value=user?.username||"";$("userUsername").disabled=!!user;$("userFullName").value=user?.fullName||"";$("userPassword").required=!user;$("userPassword").placeholder=user?"Leave blank to keep current password":"At least 8 characters";$("userRole").value=user?.role||"Admin";$("userStatus").value=user?.status||"Active";$("formError").hidden=true;$("userModal").hidden=false;
}
function closeUserModal(){$("userModal").hidden=true;state.editing=null;}
async function saveUser(e){
  e.preventDefault();const btn=$("saveUserButton"),err=$("formError");btn.disabled=true;btn.textContent="Saving…";err.hidden=true;
  try{await api("/.netlify/functions/users",{method:"POST",body:JSON.stringify({username:$("userUsername").value.trim(),fullName:$("userFullName").value.trim(),password:$("userPassword").value,role:$("userRole").value,status:$("userStatus").value,originalUsername:state.editing})});closeUserModal();toast("User saved.");loadUsers();loadDashboard();}
  catch(error){err.textContent=error.message;err.hidden=false;}
  finally{btn.disabled=false;btn.textContent="Save User";}
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.classList.remove("show"),2800);}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escAttr(v){return esc(v).replace(/`/g,"&#96;");}
function initial(v){return String(v||"A").trim().charAt(0).toUpperCase();}
function fmt(v){return Number(v||0).toLocaleString("en-US");}
function pct(v){return Number.isFinite(Number(v))?(Number(v)*100).toFixed(1)+"%":"—";}
function iconFor(a){a=String(a||"").toLowerCase();return a.includes("add")?"plus":a.includes("deactiv")?"minus-circle":a.includes("activ")?"check-circle": "refresh-cw";}
function iconForSource(id){return ({rfp:"clipboard-list",spk:"file-check",mcu:"heart-pulse","mcu-induction":"activity",extension:"calendar-clock","new-hire":"user-plus",tpc:"git-branch",offer:"file-signature","employee-db":"database",movement:"git-compare-arrows","pivot-dashboard":"chart-no-axes-combined","rfp-deletion":"archive","resource-deletion":"archive"})[id]||"file-spreadsheet";}
const ICONS={
  "layout-dashboard":`<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  "users":`<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
  "clipboard-list":`<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 9h6M9 13h6M9 17h3"/>`,
  "user-plus":`<path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>`,
  "database":`<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>`,
  "git-branch":`<circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 5v14M18 8a6 6 0 0 1-6 6H8"/>`,
  "file-check":`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 15l2.5 2.5L16 12"/>`,
  "heart-pulse":`<path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/><path d="M3.5 12h4l2-3 3 6 2-3h5"/>`,
  "activity":`<path d="M22 12h-4l-3 8-6-16-3 8H2"/>`,
  "calendar-clock":`<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v3l2 1"/>`,
  "file-signature":`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M14 2v6h6M16 18l2 2 4-4M8 13h6M8 17h4"/>`,
  "git-compare-arrows":`<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>`,
  "chart-no-axes-combined":`<path d="M3 3v18h18M7 14l4-4 4 4 6-7"/><path d="M17 7h4v4"/>`,
  "archive":`<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>`,
  "alert-circle":`<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>`,
  "alert-triangle":`<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>`,
  "refresh-cw":`<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17 5l3 2M4 17l3 2a7 7 0 0 0 11.4-4"/>`,
  "menu":`<path d="M4 6h16M4 12h16M4 18h16"/>`,
  "log-out":`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>`,
  "search":`<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`,
  "plus":`<path d="M12 5v14M5 12h14"/>`,
  "x":`<path d="m18 6-12 12M6 6l12 12"/>`,
  "check-circle":`<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>`,
  "minus-circle":`<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  "eye":`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`,
  "eye-off":`<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-4 4.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.3 3.5-.7"/>`,
  "file-spreadsheet":`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 11v8"/>`
};
function svgIcon(name,size=18){const paths=ICONS[name]||ICONS["file-spreadsheet"];return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;}
function renderStaticIcons(){document.querySelectorAll("[data-icon]").forEach(el=>{el.innerHTML=svgIcon(el.dataset.icon,el.classList.contains("metric-icon")?17:18);});}
