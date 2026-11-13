const $ = id => document.getElementById(id);
const state = { user: null, users: [], editing: null };

document.addEventListener("DOMContentLoaded", async () => {
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
  $("togglePassword").addEventListener("click",()=>{const p=$("loginPassword");p.type=p.type==="password"?"text":"password";});
  $("logoutButton").addEventListener("click",logout);
  $("refreshButton").addEventListener("click",refreshCurrent);
  $("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
  $("addUserButton").addEventListener("click",()=>openUserModal());
  $("closeModal").addEventListener("click",closeUserModal);
  $("cancelModal").addEventListener("click",closeUserModal);
  $("userModal").addEventListener("click",e=>{if(e.target===$("userModal"))closeUserModal();});
  $("userForm").addEventListener("submit",saveUser);
  $("userSearch").addEventListener("input",renderUsers);
  $("viewHistory").addEventListener("click",()=>$("historyPanel").scrollIntoView({behavior:"smooth",block:"center"}));
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
}
function navigate(page){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $("page-"+page).classList.add("active");$("breadcrumbCurrent").textContent=page==="users"?"User Management":"Overview";$("sidebar").classList.remove("open");
  if(page==="users")loadUsers();
}
function refreshCurrent(){if($("page-users").classList.contains("active"))loadUsers();else loadDashboard();}
async function loadDashboard(){
  $("refreshButton").disabled=true;
  try{const data=await api("/.netlify/functions/dashboard");renderDashboard(data);}
  catch(e){toast(e.message);}
  finally{$("refreshButton").disabled=false;}
}
function renderDashboard(d){
  const m=d.metrics||{};$("metricNewHire").textContent=fmt(m.newHireRecords);$("metricContract").textContent=fmt(m.contractDue);$("metricRfp").textContent=fmt(m.agingRfp);$("metricYear").textContent=fmt(m.newHiresThisYear);$("yearCaption").textContent="Join records in "+d.currentYear;
  $("contractCount").textContent=(d.contractAlerts||[]).length+" alerts";$("rfpCount").textContent=(d.rfpAlerts||[]).length+" alerts";$("lastUpdated").textContent="Updated "+new Date(d.generatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  $("contractRows").innerHTML=d.contractAlerts?.length?d.contractAlerts.map(r=>`<tr><td><div class="employee-cell"><b>${esc(r.employee)}</b><small>${esc(r.employeeId)} · ${esc(r.position)}</small></div></td><td>${esc(r.businessUnit)}</td><td>${esc(r.endDate)}</td><td><span class="days-chip ${r.daysRemaining<=30?"critical":r.daysRemaining>60?"safe":""}">${r.daysRemaining===0?"Today":"H-"+r.daysRemaining}</span></td></tr>`).join(""):`<tr><td colspan="4" class="empty-cell">No contract expiration within 90 days.</td></tr>`;
  $("rfpRows").innerHTML=d.rfpAlerts?.length?d.rfpAlerts.slice(0,8).map(r=>`<tr><td><div class="employee-cell"><b>${esc(r.position)}</b><small>${esc(r.businessUnit)} · ${esc(r.rfpNumber)}</small></div></td><td>${esc(r.recruitmentType)}</td><td><span class="days-chip ${r.ageDays>=60?"critical":""}">${r.ageDays} days</span></td></tr>`).join(""):`<tr><td colspan="3" class="empty-cell">No qualifying RFP aged 30+ days.</td></tr>`;
  renderActivity(d.latestActivities||[],$("latestActivity"),false);renderActivity(d.activityHistory||[],$("historyList"),true);
  const warnings=d.warnings||[];$("warningBox").hidden=!warnings.length;$("warningBox").textContent=warnings.length?"Data mapping notice: "+warnings.join(" "):"";
}
function renderActivity(rows,target,history){
  if(!rows.length){target.innerHTML=`<div class="empty-state">${history?"No activity in the last 10 days.":"No activity recorded yet."}</div>`;return;}
  target.innerHTML=rows.map(r=>{const date=r.timestamp?new Date(r.timestamp):null;const time=date?date.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";return `<div class="activity-item">${history?`<span class="activity-time">${esc(time)}</span>`:`<span class="activity-symbol">${iconFor(r.action)}</span>`}<div class="activity-copy"><b>${esc(r.action)} · ${esc(r.module)}</b><small>${esc(r.summary)}${r.actor?" — "+esc(r.actor):""}</small></div>${history?"":`<span class="activity-time">${date?date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</span>`}</div>`;}).join("");
}
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
function iconFor(a){a=String(a||"").toLowerCase();return a.includes("add")?"＋":a.includes("deactiv")?"−":a.includes("activ")?"✓":"↻";}
