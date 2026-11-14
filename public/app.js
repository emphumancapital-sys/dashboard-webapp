const $ = id => document.getElementById(id);
const state = {
  user: null, users: [], editing: null, sources: [], activeSource: null,
  dataPage: 1, dataPageSize: 50, dataTotalPages: 1, dataTotal: 0, dataToken: 0, loadedSourceId: null,
  sort: { column: null, dir: "desc" }, headers: [], columnIndexes: [], columnMeta: {},
  searchTimer: null, recordSchema: null, schemaCache: new Map(), recordToken: 0, editingRowNumber: null, currentRows: new Map(),
  organization: [], organizationLoaded: false, organizationCategory: "Department", editingOrgRow: null,
  tableSort: { org: { key: null, dir: "desc" }, users: { key: null, dir: "desc" }, pipe: { key: null, dir: "desc" }, pipeFailed: { key: null, dir: "desc" } },
  talent: { headers: [], rows: [], fields: {}, filters: {}, sort: { col: null, dir: "asc" }, page: 1, loaded: false, view: [] },
  pipe: { stages: [], cards: [], statusValues: [], codes: new Set(), unsent: [], rfpTab: "RFP 2026", view: "board", loaded: false, token: 0, drag: null, move: null, detailRow: null, tab: "", statusHeader: "RFP Process" }
};
const PAGE_SIZES = [25, 50, 100, 200];

document.addEventListener("DOMContentLoaded", async () => {
  renderStaticIcons(); initTheme(); initSidebar(); initCollapsibles(); initTooltips();
  try { const saved = Number(localStorage.getItem("emp-page-size")); if (PAGE_SIZES.includes(saved)) state.dataPageSize = saved; } catch {}
  $("dataPageSize").value = String(state.dataPageSize);
  ["orgCategory", "userRole", "userStatus", "dataPageSize", "pipeBU", "requestLocation", "requestType", "requestService"].forEach(id => enhanceSelect($(id), id === "dataPageSize" ? { compact: true } : {}));
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  bindEvents();
  try {
    const res = await api("/.netlify/functions/auth-me");
    if (res.authenticated) enterApp(res.user);
    else showLogin();
  } catch { showLogin(); }
});

function bindEvents() {
  $("loginForm").addEventListener("submit", login);
  $("togglePassword").addEventListener("click", () => { const p = $("loginPassword"); const visible = p.type === "password"; p.type = visible ? "text" : "password"; $("togglePassword").innerHTML = svgIcon(visible ? "eye-off" : "eye", 17); $("togglePassword").setAttribute("aria-label", visible ? "Hide password" : "Show password"); });
  $("logoutButton").addEventListener("click", logout);
  $("refreshButton").addEventListener("click", refreshCurrent);
  $("mobileMenu").addEventListener("click", toggleSidebar);
  $("navFind").addEventListener("input", filterNav);

  document.addEventListener("keydown", onGlobalKeydown);
  document.addEventListener("click", e => {
    const cap = e.target.closest(".nav-caption");
    if (cap) { const closed = cap.closest(".nav-group").classList.toggle("closed"); cap.setAttribute("aria-expanded", String(!closed)); return; }
    const dateTrigger = e.target.closest(".date-trigger"); if (dateTrigger) { openDatePicker(dateTrigger.closest(".date-field")); return; }
    const dateClear = e.target.closest(".date-clear"); if (dateClear) { setDateField(dateClear.closest(".date-field"), ""); dateClear.closest(".date-field").querySelector(".date-trigger").focus(); return; }
    const fieldLabel = e.target.closest("span.field-label"); if (fieldLabel) { fieldLabel.parentElement.querySelector(".select-trigger,.date-trigger")?.focus(); return; }
    const tr = e.target.closest("tbody tr");
    if (!tr || e.target.closest("button,a") || tr.querySelector(".empty-cell,.skeleton") || tr.hasAttribute("data-pipe-row") || tr.hasAttribute("data-contract")) return;
    tr.parentElement.querySelectorAll("tr.selected").forEach(x => x !== tr && x.classList.remove("selected"));
    tr.classList.toggle("selected");
  });
  document.addEventListener("dblclick", e => { const td = e.target.closest("#sourceTable td:not(.record-actions)"); if (td && !td.querySelector(".empty-cell,.skeleton") && td.textContent.trim() && navigator.clipboard) { navigator.clipboard.writeText(td.textContent).then(() => toast("Cell copied to clipboard.", "info", { duration: 1800 }), () => {}); } });
  document.querySelectorAll(".nav-item[data-page]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.page)));

  // Modals: explicit close buttons, guarded backdrop, dirty tracking
  bindModal("orgModal", closeOrgModal, ["closeOrgModal", "cancelOrgModal"]);
  bindModal("recordModal", closeRecordModal, ["closeRecordModal", "cancelRecordModal"]);
  bindModal("userModal", closeUserModal, ["closeModal", "cancelModal"]);
  bindModal("pipeModal", closePipeDetail, ["closePipeModal", "cancelPipeModal"]);
  bindModal("moveModal", closeMoveDialog, ["closeMoveModal", "cancelMoveModal"]);
  bindModal("outcomeModal", closeOutcomeDialog, ["closeOutcomeModal", "cancelOutcomeModal"]);
  bindModal("contractModal", closeContractDetail, ["closeContractModal", "cancelContractModal"]);
  bindModal("sendModal", closeSendDialog, ["closeSendModal", "cancelSendModal"]);
  bindModal("scheduleModal", closeScheduleDetail, ["closeScheduleModal", "cancelScheduleModal"]);
  bindModal("requestModal", closeRequestDialog, ["closeRequestModal", "cancelRequestModal"]);
  bindModal("taskModal", closeTask, ["closeTaskModal", "cancelTaskModal"]);
  $("requestForm").addEventListener("submit", submitRequest);
  $("taskForm").addEventListener("submit", submitTask);
  $("actionList").addEventListener("click", e => { const b = e.target.closest("[data-action-index]"); if (b) openTask((state.dashboard?.actions || [])[Number(b.dataset.actionIndex)]); });
  $("taskBody").addEventListener("click", e => { const b = e.target.closest("[data-copy]"); if (b && navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(() => toast("Copied.", "info", { duration: 1400 }), () => {}); });
  $("taskPipeline").addEventListener("click", () => { const row = state.task?.pipelineRow; closeTask(); if (!row) return; state.pipe.openAfterLoad = row; navigate("hiring"); });
  $("scheduleList").addEventListener("click", e => { const b = e.target.closest("[data-schedule]"); if (b) openScheduleDetail(Number(b.dataset.schedule)); });
  $("scheduleOpen").addEventListener("click", () => state.info?.primary?.run());
  $("scheduleSecond").addEventListener("click", () => state.info?.second?.run());
  $("rfpView").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; state.rfpView = b.dataset.view; renderOpenRfps(); });
  $("rfpList").addEventListener("click", e => { const b = e.target.closest("[data-rfp]"); if (b) openRfpDetail(Number(b.dataset.rfp)); });
  $("joinerList").addEventListener("click", e => { const b = e.target.closest("[data-joiner]"); if (b) openJoinerDetail(Number(b.dataset.joiner)); });
  $("sendForm").addEventListener("submit", submitSend);
  $("contractSent").addEventListener("click", () => setContractStatus(state.contractRow, "sent", true));
  $("contractResign").addEventListener("click", () => setContractStatus(state.contractRow, "resign", true));
  bindModal("confirmModal", () => settleConfirm(false), ["confirmCancel"]);
  bindPipeline(); bindTalent();
  $("confirmOk").addEventListener("click", () => settleConfirm(true));

  $("addUserButton").addEventListener("click", () => openUserModal());
  $("addOrgButton").addEventListener("click", () => openOrgModal());
  $("orgForm").addEventListener("submit", saveOrgItem);
  $("orgTabs").addEventListener("click", e => { const b = e.target.closest("[data-category]"); if (!b) return; state.organizationCategory = b.dataset.category; renderOrganization(); });
  $("userForm").addEventListener("submit", saveUser);
  $("userSearch").addEventListener("input", renderUsers);
  bindLocalSort("orgHead", "org", renderOrganization);
  bindLocalSort("userHead", "users", renderUsers);
  $("orgRows").addEventListener("click", e => {
    const edit = e.target.closest("[data-org-edit]"), toggle = e.target.closest("[data-org-toggle]");
    if (edit) openOrgModal(state.organization.find(x => x.rowNumber === Number(edit.dataset.orgEdit)));
    else if (toggle) toggleOrgStatus(Number(toggle.dataset.orgToggle), toggle.dataset.status);
  });
  $("userRows").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit]"), toggle = e.target.closest("[data-toggle]");
    if (edit) openUserModal(state.users.find(u => u.username === edit.dataset.edit));
    else if (toggle) toggleUserStatus(toggle.dataset.toggle, toggle.dataset.status);
  });

  // Data page
  $("dataSearch").addEventListener("input", () => { $("dataSearchClear").hidden = !$("dataSearch").value; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => { state.dataPage = 1; loadSourceData(); }, 350); });
  $("dataSearchClear").addEventListener("click", () => { $("dataSearch").value = ""; $("dataSearchClear").hidden = true; clearTimeout(state.searchTimer); state.dataPage = 1; loadSourceData(); $("dataSearch").focus(); });
  $("dataPageSize").addEventListener("change", () => { state.dataPageSize = Number($("dataPageSize").value) || 50; try { localStorage.setItem("emp-page-size", String(state.dataPageSize)); } catch {} state.dataPage = 1; loadSourceData(); });
  $("dataPager").addEventListener("click", e => { const b = e.target.closest("[data-goto]"); if (!b || b.disabled) return; state.dataPage = Number(b.dataset.goto); loadSourceData(); });
  $("sourceTableHead").addEventListener("click", e => {
    const b = e.target.closest(".th-sort"); if (!b) return;
    const column = Number(b.dataset.sort), s = state.sort;
    if (s.column !== column) state.sort = { column, dir: "asc" };
    else if (s.dir === "asc") state.sort = { column, dir: "desc" };
    else state.sort = { column: null, dir: "desc" };
    state.dataPage = 1; loadSourceData();
  });
  $("dataSortChip").addEventListener("click", e => {
    if (e.target.closest("[data-sort-reset]")) state.sort = { column: null, dir: "desc" };
    else if (e.target.closest("[data-sort-flip]")) state.sort = { column: state.sort.column, dir: state.sort.dir === "asc" ? "desc" : "asc" };
    else return;
    state.dataPage = 1; loadSourceData();
  });
  $("sourceTableBody").addEventListener("click", e => {
    const edit = e.target.closest("[data-record-edit]"), del = e.target.closest("[data-record-delete]"), send = e.target.closest("[data-record-send]");
    if (send) { const row = state.currentRows.get(Number(send.dataset.recordSend)) || [], at = state.headers.findIndex(h => h.trim().toLowerCase() === "position"); sendRfpToPipeline(Number(send.dataset.recordSend), send.dataset.code, at > -1 ? String(row[state.columnIndexes[at]] ?? "") : ""); }
    else if (edit) openRecordModal(Number(edit.dataset.recordEdit));
    else if (del) deleteRecord(Number(del.dataset.recordDelete));
  });
  $("addRecordButton").addEventListener("click", () => openRecordModal());
  $("recordForm").addEventListener("submit", saveRecord);
  $("recordFields").addEventListener("input", e => clearFieldError(e.target.closest(".field")));
  $("recordFields").addEventListener("change", e => clearFieldError(e.target.closest(".field")));
}

function onGlobalKeydown(e) {
  if (e.key === "Escape") {
    if (Pop.current) { e.preventDefault(); Pop.close(true); return; }
    const modal = topModal(); if (modal) { e.preventDefault(); MODALS[modal.id]?.(); }
    return;
  }
  if (e.key === "Tab") {
    if (Pop.current) { Pop.close(true); return; }
    const modal = topModal(); if (!modal) return;
    const items = focusables(modal); if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (e.key === "/" && !$("appView").hidden && !topModal() && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); document.body.classList.remove("sidebar-collapsed"); $("navFind").focus(); }
}

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({ error: "Invalid server response" }));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function login(e) {
  e.preventDefault(); const btn = $("loginButton"), err = $("loginError"); err.hidden = true; btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const result = await api("/.netlify/functions/auth-login", { method: "POST", body: JSON.stringify({ username: $("loginUsername").value.trim(), password: $("loginPassword").value }) });
    enterApp(result.user);
  } catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { btn.disabled = false; btn.innerHTML = 'Sign in ' + svgIcon("arrow-right", 16); }
}
async function logout() { try { await api("/.netlify/functions/auth-logout", { method: "POST", body: "{}" }); } catch {} state.user = null; Pop.close(); Object.keys(MODALS).forEach(id => { $(id).hidden = true; }); $("appView").hidden = true; $("loginView").hidden = false; $("loginPassword").value = ""; }
function showLogin() { $("loginView").hidden = false; $("appView").hidden = true; }
function enterApp(user) {
  state.user = user; $("loginView").hidden = true; $("appView").hidden = false;
  const name = user.fullName || user.username; $("masterDataNavGroup").hidden = user.role !== "Admin"; $("profileName").textContent = name; $("profileRole").textContent = user.role || "Admin"; $("profileInitial").textContent = initial(name); $("topInitial").textContent = initial(name);
  loadDashboard();
  loadSources();
}
function navigate(page, sourceId = null) {
  Pop.close();
  document.querySelectorAll(".nav-item[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".data-nav-item").forEach(b => b.classList.toggle("active", page === "data" && b.dataset.source === sourceId));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $("page-" + page).classList.add("active");
  if (page === "users") $("breadcrumbCurrent").textContent = "User Management";
  else if (page === "data") {
    const src = state.sources.find(x => x.id === sourceId) || state.activeSource; state.activeSource = src || state.activeSource; $("breadcrumbCurrent").textContent = src?.label || "Data";
    if (src) { state.dataPage = 1; state.sort = { column: null, dir: "desc" }; state.loadedSourceId = null; $("dataSearch").value = ""; $("dataSearchClear").hidden = true; loadSourceData(); }
  }
  else if (page === "organization") { $("breadcrumbCurrent").textContent = "Organization"; loadOrganization(); }
  else if (page === "hiring") { $("breadcrumbCurrent").textContent = "Hiring Pipeline"; loadPipeline(); }
  else if (page === "talent") { $("breadcrumbCurrent").textContent = "Talent Database"; if (!state.talent.loaded) loadTalent(); }
  else { $("breadcrumbCurrent").textContent = "Overview"; if (state.dashboard) loadDashboard(); }
  $("sidebar").classList.remove("open");
  if (page === "users") loadUsers();
}
function refreshCurrent() { if ($("page-users").classList.contains("active")) loadUsers(); else if ($("page-data").classList.contains("active")) loadSourceData(true); else if ($("page-organization").classList.contains("active")) loadOrganization(); else if ($("page-hiring").classList.contains("active")) loadPipeline(true); else if ($("page-talent").classList.contains("active")) loadTalent(true); else if ($("page-overview").classList.contains("active")) loadDashboard(true); }
function setRefreshing(on) { $("refreshButton").classList.toggle("is-busy", on); $("refreshButton").disabled = on; }

/* ---------- Overview ---------- */
async function loadDashboard(forceRefresh = false, quiet = false) {
  setRefreshing(true);
  try { const data = await api(`/.netlify/functions/dashboard${forceRefresh ? "?refresh=1" : ""}`); renderDashboard(data); if (forceRefresh && !quiet) toast("Overview refreshed.", "success", { duration: 1800 }); }
  catch (e) { toast(e.message, "error"); }
  finally { setRefreshing(false); }
}
function renderDashboard(d) {
  const m = d.metrics || {};
  $("metricNewHire").textContent = fmt(m.rfpRecords);
  $("metricContract").textContent = fmt(m.newHireRecords);
  $("metricRfp").textContent = fmt(m.extensionRecords);
  $("metricYear").textContent = fmt(m.employeeExitRecords);
  const completion = d.completion || {};
  $("metricRfpCaption").textContent = `${fmt(completion.rfpCompleted)} completed · ${pct(completion.rfp)} completion`;
  $("metricHireCaption").textContent = `${fmt(completion.newHireCompleted)} completed · ${pct(completion.newHire)} completion`;
  $("metricExtensionCaption").textContent = `${fmt(completion.extensionCompleted)} completed · ${pct(completion.extension)} completion`;
  const exits = d.movementCounts || {};
  $("yearCaption").textContent = `${fmt(exits.resignation)} resignation · ${fmt(exits.termination)} termination · ${fmt(exits.retirement)} retirement`;
  $("lastUpdated").textContent = "Updated " + new Date(d.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  state.dashboard = d; setRequestConfig(d); renderActions(d); clearFinishedRequests(d.cleanup); renderContracts(); renderSchedule(d); renderOpenRfps(); renderJoiners(d);
  renderActivity(d.latestActivities || [], $("latestActivity"), false); renderActivity(d.activityHistory || [], $("historyList"), true);
  const warnings = d.warnings || []; $("warningBox").hidden = !warnings.length; $("warningBox").textContent = warnings.length ? warnings.join(" · ") : "";
  ["metricNewHire", "metricContract", "metricRfp", "metricYear"].forEach(countUp);
}
/* Contract reminders: rows that still need action first, rows already sent to C&B kept as muted information. */
function renderContracts() {
  const d = state.dashboard || {}, rows = d.contractAlerts || [], need = rows.filter(r => !r.done), done = rows.length - need.length, overdue = need.filter(r => r.state === "overdue").length;
  $("contractCount").className = "count-pill " + (overdue ? "red" : need.length ? "amber" : "neutral"); $("contractCount").hidden = !rows.length;
  $("contractCount").textContent = `${overdue ? `${overdue} overdue · ` : ""}${need.length} need action${done ? ` · ${done} done` : ""}`;
  const remaining = contractRemaining;
  $("contractRows").innerHTML = rows.length ? rows.map(r => `<tr class="is-clickable${r.done ? " is-muted" : ""}${r.pending ? " is-pending" : ""}" data-contract="${r.rowNumber}">
    <td><div class="employee-cell"><b>${esc(r.employee)}</b><small>${esc(r.employeeId)} · ${esc(r.position)}</small>${r.psikotest || r.mcu ? `<div class="reg-flags">${r.psikotest ? `<span class="reg-flag" data-tip="Psikotest: ${escAttr(r.psikotest)}">${svgIcon("check", 10)}Psikotest</span>` : ""}${r.mcu ? `<span class="reg-flag" data-tip="MCU: ${escAttr(r.mcu)}">${svgIcon("check", 10)}MCU</span>` : ""}</div>` : ""}</div></td><td>${esc(r.businessUnit)}</td>
    <td><div class="end-cell"><span class="days-chip ${r.done ? "neutral" : r.daysRemaining <= 30 ? "critical" : r.daysRemaining > 60 ? "safe" : ""}">${esc(remaining(r))}</span><small>${esc(r.endDate)}</small></div></td>
    <td class="col-actions">${r.done ? `<span class="done-chip">${svgIcon("check", 12)}${esc(r.status)}</span>` : `<div class="row-actions"><button type="button" class="row-action good" data-contract-action="sent" data-tip="Mark as sent to C&amp;B" aria-label="Mark ${escAttr(r.employee)} as sent to C&amp;B">${svgIcon("check-circle", 15)}</button><button type="button" class="row-action" data-contract-menu data-tip="Other status" aria-label="Other status for ${escAttr(r.employee)}" aria-haspopup="menu">${svgIcon("more", 15)}</button></div>`}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-cell">${emptyBlock("calendar-clock", "No contracts ending soon")}</td></tr>`;
}
function renderJoiners(d) {
  const rows = d.upcomingJoiners || [];
  $("joinerCount").textContent = `${rows.length} joining`; $("joinerCount").hidden = !rows.length;
  $("joinerList").innerHTML = rows.length ? rows.map(r => `<button type="button" class="activity-item schedule-item" data-joiner="${r.pipelineRow}"><span class="avatar">${esc(initial(r.name || r.position))}</span><div class="activity-copy"><b>${esc(r.name || r.position)}</b><small>${r.guideSent ? `<em class="is-sent">${svgIcon("check", 10)}Guide sent</em>` : `<em class="is-todo">Guide not sent</em>`}${esc([r.name ? r.position : "", r.businessUnit].filter(x => x && x !== "—").map(x => " · " + x).join(""))}</small></div><div class="joiner-when"><span class="days-chip ${r.daysUntil <= 1 ? "safe" : "neutral"}">${soonLabel(r.daysUntil)}</span><small>${esc(r.joinDate)}</small></div>${svgIcon("chevron-right", 14)}</button>`).join("") : emptyBlock("user-plus", "No one joining soon");
}
const soonLabel = days => days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
const SCHEDULE_ICON = { interview: "users", offering: "file-signature", psikotest: "file-check", mcu: "heart-pulse" };
// Upcoming schedule: dated pipeline steps for the next 14 days, grouped by day. Each entry opens its details.
function renderSchedule(d) {
  const rows = d.upcomingSchedule || [];
  $("scheduleCount").textContent = `${rows.length} scheduled`; $("scheduleCount").hidden = !rows.length;
  if (!rows.length) { $("scheduleList").innerHTML = emptyBlock("calendar", "Nothing scheduled"); return; }
  let day = null;
  $("scheduleList").innerHTML = rows.map((r, i) => {
    const head = r.daysUntil !== day ? `<div class="schedule-day"><b>${soonLabel(r.daysUntil)}</b><span>${esc(r.weekday)}, ${esc(r.date)}</span></div>` : ""; day = r.daysUntil;
    return `${head}<button type="button" class="activity-item schedule-item" data-schedule="${i}"><span class="schedule-ico is-${r.kind}">${svgIcon(SCHEDULE_ICON[r.kind] || "calendar", 14)}</span><div class="activity-copy"><b>${esc(r.candidate || r.position)}</b><small><em>${esc(r.label)}</em>${esc([r.candidate ? r.position : "", r.businessUnit].filter(x => x && x !== "—").map(x => " · " + x).join(""))}</small></div>${svgIcon("chevron-right", 14)}</button>`;
  }).join("");
}
const infoGrid = details => (details || []).map(item => { const wide = item.label.trim().toLowerCase() === "remarks"; return `<div${wide ? ' class="is-wide"' : ""}><dt>${esc(item.label === item.label.toUpperCase() ? headerLabel(item.label) : item.label)}</dt><dd${wide ? ' class="is-multiline"' : ""}>${/^https?:\/\/\S+$/i.test(item.value) ? `<a class="cell-link" href="${escAttr(item.value)}" target="_blank" rel="noopener noreferrer">${svgIcon("external-link", 12)}<span>Open link</span></a>` : esc(item.value)}</dd></div>`; }).join("");
// One detail dialog for Overview entries: a summary line, the row's filled columns, and up to two actions.
function openInfo({ kind = "interview", icon = "calendar", title, sub, summary, details, primary, second = null, hint = "" }) {
  state.info = { primary, second };
  $("scheduleModalIcon").className = "modal-icon schedule-ico is-" + kind; $("scheduleModalIcon").innerHTML = svgIcon(icon, 17);
  $("scheduleModalTitle").textContent = title; $("scheduleModalSub").textContent = sub; $("scheduleSummary").innerHTML = summary; $("scheduleInfo").innerHTML = infoGrid(details);
  $("scheduleHint").textContent = hint; $("scheduleOpen").hidden = !primary; if (primary) $("scheduleOpen").innerHTML = primary.html || esc(primary.label);
  $("scheduleSecond").hidden = !second; if (second) $("scheduleSecond").innerHTML = second.html || esc(second.label);
  openModal("scheduleModal", primary ? $("scheduleOpen") : $("cancelScheduleModal"));
}
const openOnBoard = rowNumber => { closeScheduleDetail(); state.pipe.openAfterLoad = rowNumber; navigate("hiring"); };
function openScheduleDetail(index) {
  const r = (state.dashboard?.upcomingSchedule || [])[index]; if (!r) return;
  const label = r.source === "spk" ? "Open in Psychotest (SPK)" : r.source === "mcu" ? "Open in Medical Check Up" : "Open in Hiring Pipeline";
  openInfo({ kind: r.kind, icon: SCHEDULE_ICON[r.kind] || "calendar", title: r.candidate || r.position, sub: [r.candidate && r.position !== "—" ? r.position : "", r.rfpCode, `${r.sourceTab} · Row ${r.rowNumber}`].filter(Boolean).join(" · "),
    summary: `<div><small>${esc(r.label)}</small><b>${esc(r.weekday)}, ${esc(r.date)}</b></div><span class="days-chip ${r.daysUntil <= 1 ? "safe" : "neutral"}">${soonLabel(r.daysUntil)}</span>`, details: r.details,
    primary: { label, run: () => {
      if (r.source === "pipeline") { openOnBoard(r.rowNumber); return; }
      closeScheduleDetail();
      // Psikotest and MCU live in their own tabs: open that table, filtered to this person.
      if (!state.sources.some(x => x.id === r.source)) { toast(`${r.sourceTab} is not available in the data list.`, "warning"); return; }
      document.getElementById("masterDataNavGroup").classList.remove("closed"); navigate("data", r.source);
      if (r.candidate) { $("dataSearch").value = r.candidate; $("dataSearchClear").hidden = false; state.dataPage = 1; loadSourceData(); }
    } } });
}
/* Open RFPs: requests still without a candidate, and requests with a candidate that have not reached a join date. */
function renderOpenRfps() {
  const data = state.dashboard?.openRfps || {}, need = data.needCandidate || [], process = data.inProcess || [], view = state.rfpView === "process" ? "process" : "need", rows = view === "need" ? need : process;
  $("rfpNeedCount").textContent = need.length; $("rfpProcessCount").textContent = process.length;
  $("rfpView").querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  $("rfpList").innerHTML = rows.length ? rows.map((r, i) => `<button type="button" class="activity-item schedule-item" data-rfp="${i}"><span class="schedule-ico is-${view === "need" ? "offering" : "interview"}">${svgIcon(view === "need" ? "user-plus" : "workflow", 14)}</span><div class="activity-copy"><b>${esc(view === "need" ? r.position : r.candidate)}</b><small><em>${esc(view === "need" ? (r.rfpCode || "No code") : r.stage)}</em>${esc([view === "need" ? "" : r.position, r.businessUnit].filter(x => x && x !== "—").map(x => " · " + x).join(""))}</small></div>${r.daysOpen === null ? "" : `<div class="joiner-when"><span class="days-chip ${r.daysOpen > 60 ? "critical" : r.daysOpen > 30 ? "" : "neutral"}">${r.daysOpen}d open</span>${view === "need" ? `<small>${esc(r.stage)}</small>` : ""}</div>`}${svgIcon("chevron-right", 14)}</button>`).join("") : emptyBlock(view === "need" ? "user-plus" : "workflow", view === "need" ? "Every open RFP has a candidate" : "No candidates in process");
}
function openRfpDetail(index) {
  const data = state.dashboard?.openRfps || {}, need = state.rfpView !== "process", r = (need ? data.needCandidate : data.inProcess || [])[index]; if (!r) return;
  openInfo({ kind: need ? "offering" : "interview", icon: need ? "user-plus" : "workflow", title: need ? r.position : r.candidate, sub: [need ? "" : r.position, r.rfpCode, `${r.sourceTab} · Row ${r.rowNumber}`].filter(Boolean).join(" · "),
    summary: `<div><small>${need ? "Candidate" : "Stage"}</small><b>${esc(need ? "None yet" : r.stage)}</b></div>${r.daysOpen === null ? "" : `<span class="days-chip ${r.daysOpen > 60 ? "critical" : r.daysOpen > 30 ? "" : "neutral"}">${r.daysOpen}d open</span>`}${need && r.source === "rfp" ? `<span class="summary-spacer"></span><span class="days-chip neutral">Not in pipeline</span>` : ""}`, details: r.details,
    primary: need ? { html: svgIcon("search", 14) + "Find candidate", run: () => { closeScheduleDetail(); navigate("talent"); } } : { label: "Open in Hiring Pipeline", run: () => openOnBoard(r.rowNumber) },
    second: need && r.source === "pipeline" ? { label: "Open in Hiring Pipeline", run: () => openOnBoard(r.rowNumber) } : null });
}
/* Joining Soon: from the pipeline's Join Date. Each entry carries the onboarding guide task. */
function onboardingMailUrl(r) { const o = state.dashboard?.onboarding || {}; return o.mailUrl ? `${o.mailUrl.replace(/\/$/, "")}/?view=compose&subject=${encodeURIComponent(`${o.subject || "Onboarding Guide"} - ${r.name || r.position}`)}` : ""; }
function openJoinerDetail(pipelineRow) {
  const r = (state.dashboard?.upcomingJoiners || []).find(x => x.pipelineRow === pipelineRow); if (!r) return; const o = state.dashboard?.onboarding || {};
  openInfo({ kind: "mcu", icon: "user-plus", title: r.name || r.position, sub: [r.name && r.position !== "—" ? r.position : "", r.rfpCode, `Row ${r.pipelineRow}`].filter(Boolean).join(" · "),
    summary: `<div><small>Join date</small><b>${esc(r.weekday)}, ${esc(r.joinDate)}</b></div><span class="days-chip ${r.daysUntil <= 1 ? "safe" : "neutral"}">${soonLabel(r.daysUntil)}</span><span class="summary-spacer"></span>${r.guideSent ? `<span class="done-chip">${svgIcon("check", 12)}Onboarding Guide sent ${esc(r.guideSent)}</span>` : `<span class="days-chip">Onboarding Guide not sent</span>`}`, details: r.details,
    hint: o.account ? `Sign in to Zimbra as ${o.account}` : "",
    primary: { html: svgIcon("mail", 14) + "Send Onboarding Guide", run: () => { const url = onboardingMailUrl(r); if (url) window.open(url, "_blank", "noopener"); else toast("The mail link is not configured.", "warning"); } },
    second: r.guideSent ? null : { html: svgIcon("check", 14) + "Mark as sent", run: () => markGuideSent(r) } });
}
async function markGuideSent(r) {
  const btn = $("scheduleSecond"); btn.disabled = true;
  try {
    const today = isoOf(new Date()); await api(PIPE_API, { method: "POST", body: JSON.stringify({ action: "request", kind: "onboarding", rowNumber: r.pipelineRow, code: r.rfpCode, date: today }) });
    r.guideSent = formatDate(today); if (state.dashboard) state.dashboard.actions = (state.dashboard.actions || []).filter(a => !(a.kind === "onboarding" && a.pipelineRow === r.pipelineRow));
    renderJoiners(state.dashboard); renderActions(state.dashboard); toast(`Onboarding Guide marked as sent for ${r.name || r.position}.`, "success"); openJoinerDetail(r.pipelineRow);
  } catch (error) { toast(error.message, "error"); }
  finally { btn.disabled = false; }
}
function closeScheduleDetail() { closeModal("scheduleModal"); }
function openContractMenu(button, rowNumber) {
  if (Pop.current?.anchor === button) { Pop.close(); return; }
  const panel = document.createElement("div"); panel.className = "select-pop stage-menu"; panel.setAttribute("role", "menu"); panel.tabIndex = -1;
  panel.innerHTML = `<button type="button" role="menuitem" class="pop-option" data-action="detail"><span>View details</span></button><div class="pop-sep"></div><div class="pop-title">Set status</div><button type="button" role="menuitem" class="pop-option" data-action="sent"><span>Sent to C&amp;B</span></button><button type="button" role="menuitem" class="pop-option" data-action="resign"><span>Resign</span></button>`;
  panel.addEventListener("click", e => { const b = e.target.closest(".pop-option"); if (!b) return; Pop.close(); if (b.dataset.action === "detail") openContractDetail(rowNumber); else setContractStatus(rowNumber, b.dataset.action); });
  Pop.open(button, panel); panel.querySelector(".pop-option").focus({ preventScroll: true });
}
const contractRemaining = r => r.daysRemaining < 0 ? `${-r.daysRemaining} day${r.daysRemaining === -1 ? "" : "s"} overdue` : r.daysRemaining === 0 ? "Today" : `In ${r.daysRemaining} day${r.daysRemaining === 1 ? "" : "s"}`;
const KEEP_UPPER = new Set(["RFP", "MCU", "ID", "P.E", "C&B", "L", "SPK", "B.U"]);
const headerLabel = text => String(text).split(/\s+/).map(w => KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
// Full row from Extend 2026, so the contract can be checked before its status is changed.
function openContractDetail(rowNumber) {
  const row = (state.dashboard?.contractAlerts || []).find(r => r.rowNumber === rowNumber); if (!row) return;
  state.contractRow = rowNumber;
  $("contractModalTitle").textContent = row.employee; $("contractModalSub").textContent = [row.employeeId, row.position, `Row ${row.rowNumber}`].filter(x => x && x !== "—").join(" · ");
  $("contractSummary").innerHTML = `<div><small>Contract end</small><b>${esc(row.endDate)}</b></div><span class="days-chip ${row.done ? "neutral" : row.daysRemaining <= 30 ? "critical" : row.daysRemaining > 60 ? "safe" : ""}">${esc(contractRemaining(row))}</span><span class="summary-spacer"></span>${row.done ? `<span class="done-chip">${svgIcon("check", 12)}${esc(row.status)}</span>` : `<span class="days-chip neutral">${esc(row.status || "No status yet")}</span>`}`;
  $("contractInfo").innerHTML = (row.details || []).map(item => `<div><dt>${esc(headerLabel(item.label))}</dt><dd>${/^https?:\/\/\S+$/i.test(item.value) ? `<a class="cell-link" href="${escAttr(item.value)}" target="_blank" rel="noopener noreferrer">${svgIcon("external-link", 12)}<span>Open link</span></a>` : esc(item.value)}</dd></div>`).join("");
  $("contractError").hidden = true; $("contractSent").hidden = row.done; $("contractResign").hidden = row.done; $("contractSent").innerHTML = svgIcon("check", 14) + "Sent to C&amp;B";
  openModal("contractModal", row.done ? $("cancelContractModal") : $("contractSent"));
}
function closeContractDetail() { closeModal("contractModal"); state.contractRow = null; }
async function setContractStatus(rowNumber, action, fromDetail = false) {
  const row = (state.dashboard?.contractAlerts || []).find(r => r.rowNumber === rowNumber); if (!row || row.pending) return; const label = action === "resign" ? "Resign" : "Sent to C&B";
  // From the row icon a confirmation is asked first; in the detail dialog the details themselves are the check.
  if (!fromDetail) { const ok = await confirmDialog({ title: `Mark ${row.employee} as ${label}?`, message: `Contract ends ${row.endDate}. STATUS in Extend 2026 is set to ${label}.`, confirmLabel: `Mark as ${label}`, icon: action === "resign" ? "log-out" : "check-circle" }); if (!ok) return; }
  const button = fromDetail ? (action === "resign" ? $("contractResign") : $("contractSent")) : null, buttonHtml = button?.innerHTML;
  if (button) { $("contractError").hidden = true; button.disabled = true; if (action !== "resign") button.innerHTML = `<i class="spinner"></i>Saving…`; }
  row.pending = true; renderContracts();
  try {
    const result = await api("/.netlify/functions/contracts", { method: "POST", body: JSON.stringify({ rowNumber, employee: row.employee, action }) });
    Object.assign(row, { pending: false, done: true, status: result.value || label, state: action === "resign" ? "closed" : "sent" });
    const statusDetail = (row.details || []).find(item => item.label.trim().toUpperCase() === "STATUS"); if (statusDetail) statusDetail.value = row.status; else (row.details = row.details || []).push({ label: "STATUS", value: row.status });
    state.dashboard.contractAlerts = state.dashboard.contractAlerts.filter(r => r.daysRemaining >= 0 || !r.done).sort((a, b) => Number(a.done) - Number(b.done) || a.daysRemaining - b.daysRemaining);
    if (fromDetail) closeContractDetail();
    renderContracts(); toast(`${row.employee} marked as ${result.value || label}.`, "success");
  } catch (error) { row.pending = false; renderContracts(); if (fromDetail) { $("contractError").textContent = error.message; $("contractError").hidden = false; } else toast(error.message, "error", { duration: 8000 }); }
  finally { if (button) { button.disabled = false; button.innerHTML = buttonHtml; } }
}
function renderActivity(rows, target, history) {
  if (!rows.length) { target.innerHTML = emptyBlock("activity", history ? "No activity in the last 10 days" : "No activity yet"); return; }
  target.innerHTML = rows.map(r => { const date = r.timestamp ? new Date(r.timestamp) : null; const time = date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; return `<div class="activity-item">${history ? `<span class="activity-time">${esc(time)}</span>` : `<span class="activity-symbol">${svgIcon(iconFor(r.action), 15)}</span>`}<div class="activity-copy"><b>${esc(r.action)} · ${esc(r.module)}</b><small>${esc(r.summary)}${r.actor ? " — " + esc(r.actor) : ""}</small></div>${history ? "" : `<span class="activity-time">${date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>`}</div>`; }).join("");
}

/* ---------- Data sources ---------- */
async function loadSources() {
  const nav = $("dataNav"); nav.innerHTML = '<div class="nav-loading">Loading spreadsheet tabs…</div>';
  try {
    const result = await api("/.netlify/functions/data?action=sources");
    state.sources = result.sources || [];
    const groups = new Map();
    state.sources.forEach(source => { if (!groups.has(source.group)) groups.set(source.group, []); groups.get(source.group).push(source); });
    nav.innerHTML = [...groups.entries()].map(([group, sources]) => `<div class="nav-subgroup"><div class="nav-subcaption">${esc(group)}</div><div>${sources.map(source => {
      const icon = source.status === "needs_attention" ? "alert-circle" : source.status === "unavailable" ? "alert-triangle" : iconForSource(source.id);
      return `<button class="nav-item data-nav-item ${state.activeSource?.id === source.id ? "active" : ""}" data-source="${escAttr(source.id)}" title="${escAttr(source.label)}"><span class="nav-icon ${source.status !== "ready" ? "nav-icon-warning" : ""}">${svgIcon(icon, 17)}</span><span class="nav-label">${esc(source.label)}</span>${source.status === "needs_attention" ? '<span class="nav-status" title="Source structure needs attention">!</span>' : source.status === "unavailable" ? '<span class="nav-status danger" title="Source unavailable">!</span>' : ""}</button>`;
    }).join("")}</div></div>`).join(""); filterNav();
    nav.querySelectorAll("[data-source]").forEach(button => button.addEventListener("click", () => navigate("data", button.dataset.source)));
    const connected = result.summary?.connected ?? state.sources.filter(x => x.available).length;
    const total = result.summary?.total ?? state.sources.length;
    const failed = result.summary?.failed ?? state.sources.filter(x => !x.available).length;
    const attention = result.summary?.needsAttention ?? state.sources.filter(x => x.status === "needs_attention").length;
    const indicator = document.querySelector(".connection");
    if (indicator) indicator.innerHTML = `<span class="status-dot ${failed ? "is-warning" : ""}"></span><span>${connected}/${total} tabs accessible${attention ? ` · ${attention} need review` : ""}</span>`;
    if (failed) toast(`${failed} spreadsheet tab(s) could not be accessed. Open the source list to inspect details.`, "warning", { duration: 6000 });
  } catch (error) { nav.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; toast(error.message, "error"); }
}

const MODE_LABEL = { view_only: ["Read only", "lock"], partial_crud: ["Limited editing", "pencil"], crud_candidate: ["Editable", "pencil"] };
function paintDataHeading(source) {
  $("dataTitle").textContent = source.label; $("dataGroup").textContent = source.group; $("dataSubtitle").textContent = `Sheet tab · ${source.tab}`;
  const [label, icon] = MODE_LABEL[source.accessMode] || MODE_LABEL.view_only;
  $("dataMode").hidden = false; $("dataMode").className = "mode-pill " + (source.accessMode === "view_only" ? "is-locked" : "is-editable"); $("dataMode").innerHTML = svgIcon(icon, 12) + esc(label);
  $("addRecordButton").hidden = source.accessMode === "view_only" || source.status !== "ready";
}
function skeletonRows(columns, rows) {
  const widths = [72, 54, 88, 46, 64, 80, 58];
  return Array.from({ length: rows }, (_, r) => `<tr class="skeleton-row">${Array.from({ length: columns }, (_, c) => `<td><span class="skeleton" style="width:${widths[(r + c * 3) % widths.length]}%"></span></td>`).join("")}</tr>`).join("");
}
function emptyBlock(icon, title, text) { return `<div class="empty-block"><span>${svgIcon(icon, 20)}</span><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}</div>`; }
function sortDirectionLabel(type, dir) {
  if (type === "date") return dir === "asc" ? "Oldest → Newest" : "Newest → Oldest";
  if (type === "number") return dir === "asc" ? "Low → High" : "High → Low";
  return dir === "asc" ? "A → Z" : "Z → A";
}
function renderSortChip() {
  const s = state.sort, chip = $("dataSortChip");
  if (s.column === null) { chip.className = "sort-chip"; chip.innerHTML = `<span class="sort-chip-label">${svgIcon("arrow-down", 13)}Latest first</span>`; chip.title = "Default order: the most recently added rows are shown first. Click a column header to sort."; return; }
  const position = state.columnIndexes.indexOf(s.column), name = state.headers[position] || "column", type = state.columnMeta[s.column]?.type || "text";
  chip.className = "sort-chip is-active"; chip.title = "";
  chip.innerHTML = `<button type="button" class="sort-chip-label" data-sort-flip title="Reverse order">${svgIcon(s.dir === "asc" ? "arrow-up" : "arrow-down", 13)}<span>${esc(name)}</span><em>${sortDirectionLabel(type, s.dir)}</em></button><button type="button" class="sort-chip-x" data-sort-reset aria-label="Reset to latest first" title="Reset to latest first">${svgIcon("x", 12)}</button>`;
}
function renderPager() {
  const page = state.dataPage, total = state.dataTotalPages, pages = [];
  if (total <= 7) for (let i = 1; i <= total; i++) pages.push(i);
  else { pages.push(1); if (page > 4) pages.push("…"); for (let i = Math.max(2, Math.min(page - 1, total - 4)); i <= Math.min(total - 1, Math.max(page + 1, 5)); i++) pages.push(i); if (page < total - 3) pages.push("…"); pages.push(total); }
  $("dataPager").innerHTML = `<button type="button" class="pager-btn" data-goto="${page - 1}" ${page <= 1 ? "disabled" : ""} aria-label="Previous page" title="Previous page">${svgIcon("chevron-left", 15)}</button>${pages.map(p => p === "…" ? '<span class="pager-gap">…</span>' : `<button type="button" class="pager-btn ${p === page ? "is-current" : ""}" data-goto="${p}" ${p === page ? 'aria-current="page"' : ""}>${p}</button>`).join("")}<button type="button" class="pager-btn" data-goto="${page + 1}" ${page >= total ? "disabled" : ""} aria-label="Next page" title="Next page">${svgIcon("chevron-right", 15)}</button>`;
}
function resetDataFooter(text) { $("dataPageInfo").textContent = text; $("dataPager").innerHTML = ""; $("dataRecordCount").textContent = "—"; document.querySelector(".page-size").hidden = true; }
function cellHtml(value) {
  const text = formatCell(value);
  if (/^https?:\/\/\S+$/i.test(text)) return `<a class="cell-link" href="${escAttr(text)}" target="_blank" rel="noopener noreferrer">${svgIcon("external-link", 12)}<span>${esc(text.replace(/^https?:\/\/(www\.)?/i, ""))}</span></a>`;
  return esc(text);
}

async function loadSourceData(forceRefresh = false) {
  const source = state.activeSource; if (!source) return;
  const token = ++state.dataToken, scroll = $("dataTableScroll"), fresh = state.loadedSourceId !== source.id;
  paintDataHeading(source); $("dataError").hidden = true; renderSortChip();
  if (source.status === "needs_attention") {
    scroll.classList.remove("is-loading"); $("sourceTableHead").innerHTML = "";
    $("sourceTableBody").innerHTML = `<tr><td class="empty-cell"><div class="source-attention"><span>${svgIcon("alert-circle", 22)}</span><b>Source tab needs a header correction</b><p>${esc(source.schemaMessage || "The tab is accessible, but its table structure is not ready to display.")}</p><small>Spreadsheet tab: ${esc(source.tab)}</small></div></td></tr>`;
    resetDataFooter("Table unavailable"); $("dataUpdated").textContent = "Schema review required"; return;
  }
  if (source.status === "unavailable") {
    scroll.classList.remove("is-loading"); $("sourceTableHead").innerHTML = "";
    $("sourceTableBody").innerHTML = `<tr><td class="empty-cell">${emptyBlock("alert-triangle", "This tab could not be accessed", "It failed during the last source check. Try refreshing.")}</td></tr>`;
    $("dataError").hidden = false; $("dataError").textContent = source.error || "The source is unavailable."; resetDataFooter("Table unavailable"); return;
  }
  if (fresh) { $("sourceTableHead").innerHTML = ""; $("sourceTableBody").innerHTML = skeletonRows(Math.min(Math.max((source.headers || []).filter(Boolean).length, 5), 9), 12); scroll.scrollTop = 0; scroll.scrollLeft = 0; resetDataFooter("Loading…"); }
  else scroll.classList.add("is-loading");
  setRefreshing(true);
  // The RFP table shows which requests are already in the pipeline, so make sure that list is loaded.
  const pipeReady = source.id === "rfp-master" && !state.pipe.loaded ? loadPipeline(false, true) : null;
  try {
    const q = new URLSearchParams({ source: source.id, page: String(state.dataPage), pageSize: String(state.dataPageSize), search: $("dataSearch").value || "", dir: state.sort.dir, ...(state.sort.column !== null ? { sort: String(state.sort.column) } : {}), ...(forceRefresh ? { refresh: "1" } : {}) });
    const data = await api(`/.netlify/functions/data?${q}`); if (pipeReady) await pipeReady;
    if (token !== state.dataToken) return;
    if (data.needsAttention) { source.status = "needs_attention"; source.schemaMessage = data.message; loadSourceData(); return; }
    state.dataTotalPages = data.totalPages || 1; state.dataPage = data.page || 1; state.dataTotal = Number(data.total || 0);
    const canEdit = source.accessMode !== "view_only", canDelete = source.accessMode === "crud_candidate";
    const indexes = data.columnIndexes || data.headers.map((_, index) => index);
    state.headers = data.headers; state.columnIndexes = indexes; state.columnMeta = {};
    indexes.forEach((columnIndex, j) => { state.columnMeta[columnIndex] = data.columnMeta?.[j] || { type: "text" }; });
    $("sourceTableHead").innerHTML = `<tr>${data.headers.map((h, j) => { const sorted = state.sort.column === indexes[j]; return `<th class="${sorted ? "is-sorted" : ""}" aria-sort="${sorted ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="th-sort" data-sort="${indexes[j]}" title="Sort by ${escAttr(h)}"><span class="th-text">${esc(h)}</span><span class="sort-ico">${svgIcon(sorted ? (state.sort.dir === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down", 12)}</span></button></th>`; }).join("")}${canEdit ? '<th class="col-actions" aria-label="Actions"></th>' : ""}</tr>`;
    state.currentRows = new Map();
    data.rows.forEach((row, i) => { const full = []; indexes.forEach((columnIndex, j) => full[columnIndex] = row[j]); state.currentRows.set(Number(data.rowNumbers?.[i]), full); });
    const searching = !!$("dataSearch").value.trim();
    const codeAt = source.id === "rfp-master" && state.pipe.loaded ? data.headers.findIndex(h => h.trim().toLowerCase() === "rfp code") : -1;
    const sendCell = (row, rowNumber) => { if (codeAt < 0) return ""; const code = String(row[codeAt] ?? "").trim(); if (!code) return ""; return state.pipe.codes.has(code) ? `<span class="row-flag" title="Already in the hiring pipeline" aria-label="Already in the hiring pipeline">${svgIcon("check-circle", 14)}</span>` : `<button type="button" class="row-action good" data-record-send="${rowNumber}" data-code="${escAttr(code)}" title="Send to pipeline" aria-label="Send ${escAttr(code)} to the hiring pipeline">${svgIcon("send", 14)}</button>`; };
    $("sourceTableBody").innerHTML = data.rows.length ? data.rows.map((row, i) => {
      const rowNumber = Number(data.rowNumbers?.[i]);
      return `<tr data-row-number="${rowNumber}">${row.map(value => `<td title="${escAttr(formatCell(value))}">${cellHtml(value)}</td>`).join("")}${canEdit ? `<td class="record-actions"><div class="row-actions">${sendCell(row, rowNumber)}<button type="button" class="row-action" data-record-edit="${rowNumber}" title="Edit record" aria-label="Edit record in row ${rowNumber}">${svgIcon("pencil", 14)}</button>${canDelete ? `<button type="button" class="row-action danger" data-record-delete="${rowNumber}" title="Delete record" aria-label="Delete record in row ${rowNumber}">${svgIcon("trash", 14)}</button>` : ""}</div></td>` : ""}</tr>`;
    }).join("") : `<tr><td class="empty-cell" colspan="${Math.max(data.headers.length + (canEdit ? 1 : 0), 1)}">${searching ? emptyBlock("search", "No matching records", `Nothing in this sheet matches “${$("dataSearch").value.trim()}”.`) : emptyBlock("inbox", "No records yet", canEdit ? "Use Add Record to create the first one." : "This tab has no data rows.")}</td></tr>`;
    scroll.classList.toggle("has-actions", canEdit);
    const first = state.dataTotal ? (state.dataPage - 1) * (data.pageSize || state.dataPageSize) + 1 : 0, last = first ? first + data.rows.length - 1 : 0;
    $("dataRecordCount").textContent = `${state.dataTotal.toLocaleString()} ${searching ? (state.dataTotal === 1 ? "match" : "matches") : (state.dataTotal === 1 ? "record" : "records")}`;
    $("dataPageInfo").innerHTML = state.dataTotal ? `Showing <b>${first.toLocaleString()}–${last.toLocaleString()}</b> of <b>${state.dataTotal.toLocaleString()}</b>` : "No records to show";
    document.querySelector(".page-size").hidden = !state.dataTotal; if (state.dataTotal) renderPager(); else $("dataPager").innerHTML = ""; renderSortChip();
    $("dataUpdated").textContent = `Updated ${new Date(data.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (!forceRefresh) scroll.scrollTop = 0; // a manual refresh or a save keeps your place
    state.loadedSourceId = source.id;
  } catch (error) {
    if (token !== state.dataToken) return;
    $("sourceTableHead").innerHTML = ""; $("sourceTableBody").innerHTML = `<tr><td class="empty-cell">${emptyBlock("alert-triangle", "Could not load source data", "Check the message below, then refresh.")}</td></tr>`;
    $("dataError").hidden = false; $("dataError").textContent = error.message; resetDataFooter("—"); state.loadedSourceId = null;
  } finally { if (token === state.dataToken) { setRefreshing(false); scroll.classList.remove("is-loading"); } }
}

/* ---------- Record form ---------- */
async function getRecordSchema(source) {
  const hit = state.schemaCache.get(source.id);
  if (hit && Date.now() - hit.at < 60000) return hit.schema;
  const schema = await api(`/.netlify/functions/data?source=${encodeURIComponent(source.id)}&action=schema`);
  state.schemaCache.set(source.id, { at: Date.now(), schema }); return schema;
}
async function openRecordModal(rowNumber = null) {
  const source = state.activeSource; if (!source || source.accessMode === "view_only") return;
  const token = ++state.recordToken, btn = $("saveRecordButton");
  state.editingRowNumber = rowNumber; state.recordSchema = null;
  $("recordForm").reset(); $("recordFormError").hidden = true;
  $("recordModalTitle").textContent = rowNumber ? "Edit Record" : "Add Record";
  $("recordModalSub").textContent = rowNumber ? `${source.label} · Row ${rowNumber}` : source.label;
  $("recordModalNote").hidden = !source.note; $("recordModalNote").innerHTML = source.note ? svgIcon("info", 15) + `<span>${esc(source.note)}</span>` : "";
  $("recordModalHint").textContent = "Loading fields…";
  $("recordFields").innerHTML = Array.from({ length: 8 }, () => `<div class="field"><span class="skeleton" style="width:38%;height:10px"></span><span class="skeleton skeleton-control"></span></div>`).join("");
  btn.disabled = true; btn.textContent = rowNumber ? "Save Changes" : "Save Record";
  openModal("recordModal");
  try {
    const schema = await getRecordSchema(source);
    if (token !== state.recordToken || $("recordModal").hidden) return;
    const editable = (schema.columns || []).filter(c => c.editable);
    if (!editable.length) throw new Error("No editable columns are available for this record.");
    const row = rowNumber ? state.currentRows.get(rowNumber) || [] : [];
    const html = await Promise.all(editable.map(async c => {
      const label = c.header || `Column ${c.index + 1}`, value = row[c.index] ?? "", validation = c.validation || {}; let opts = validation.options || [];
      const orgCategory = /business\s*unit|businessunit/i.test(label) ? "Business Unit" : /department|departemen/i.test(label) ? "Department" : /position|job\s*title|jabatan/i.test(label) ? "Position" : null;
      if (orgCategory) { const master = await getOrganizationOptions(orgCategory); opts = [...new Set([...opts, ...master])]; }
      const meta = state.columnMeta[c.index] || {};
      let type = "text"; if (validation.type === "DATE_IS_VALID" || meta.type === "date" || /date|tanggal|received|join/i.test(label)) type = "date";
      else if (validation.type === "BOOLEAN") type = "checkbox";
      else if (/NUMBER|CURRENCY|PERCENT/i.test(c.numberFormat?.type || "")) type = "number";
      else if (/link|url/i.test(label)) type = "url";
      const id = `rf-${c.index}`, required = !!(opts.length && validation.strict);
      let control = "";
      if (c.fixedValue !== undefined) { const shown = rowNumber && value !== "" ? value : c.fixedValue; return `<div class="field" data-field="${c.index}" data-label="${escAttr(label)}"><label class="field-label" for="${id}">${esc(label)}</label><input id="${id}" name="${c.index}" value="${escAttr(shown)}" disabled><small class="field-help">${svgIcon("lock", 10)}Fixed at ${esc(c.fixedValue)} for now: one RFP is one person.</small></div>`; }
      if (opts.length) {
        const all = value !== "" && !opts.some(o => String(o) === String(value)) ? [value, ...opts] : opts;
        control = `<select id="${id}" name="${c.index}" data-placeholder="Select ${escAttr(label.toLowerCase())}" ${required ? "data-required" : ""} ${c.allowCustom ? "data-allow-custom" : ""}><option value=""></option>${all.map(o => `<option value="${escAttr(o)}" ${String(value) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      }
      else if (type === "checkbox") return `<div class="field field-full" data-field="${c.index}" data-label="${escAttr(label)}"><label class="switch-field"><input type="checkbox" name="${c.index}" ${String(value).toLowerCase() === "true" || value === true ? "checked" : ""}><i class="switch"></i><span>${esc(label)}</span></label></div>`;
      else if (type === "date") control = dateFieldHtml(c.index, toDateInput(value, meta.dateOrder), id);
      else if (type === "number") { const plain = /%/.test(String(value)) ? null : parseNumberLoose(value); control = plain === null && value !== "" ? `<input id="${id}" name="${c.index}" value="${escAttr(value)}" inputmode="decimal" autocomplete="off">` : `<input id="${id}" type="number" step="any" name="${c.index}" value="${escAttr(plain ?? "")}" placeholder="0" autocomplete="off">`; }
      else control = `<input id="${id}" type="${type}" name="${c.index}" value="${escAttr(value)}" ${type === "url" ? 'placeholder="https://" data-url' : ""} autocomplete="off">`;
      const labelHtml = opts.length || type === "date" ? `<span class="field-label">${esc(label)}${required ? " <em>*</em>" : ""}</span>` : `<label class="field-label" for="${id}">${esc(label)}</label>`;
      return `<div class="field" data-field="${c.index}" data-label="${escAttr(label)}">${labelHtml}${control}<small class="field-error" hidden></small></div>`;
    }));
    if (token !== state.recordToken || $("recordModal").hidden) return;
    state.recordSchema = schema;
    $("recordFields").innerHTML = html.join("");
    $("recordFields").querySelectorAll("select").forEach(select => enhanceSelect(select));
    $("recordFields").querySelectorAll(".date-field").forEach(syncDateField);
    $("recordFields").querySelectorAll("[name]").forEach(input => { input.dataset.initial = input.type === "checkbox" ? String(input.checked) : input.value; });
    const locked = (schema.columns || []).length - editable.length;
    $("recordModalHint").textContent = `${editable.length} editable field${editable.length === 1 ? "" : "s"}${locked ? ` · ${locked} formula or read-only column${locked === 1 ? "" : "s"} filled by the sheet` : ""}`;
    btn.disabled = false; $("recordModal").dataset.dirty = ""; focusFirstField($("recordModal"));
  } catch (error) { if (token === state.recordToken) { closeRecordModal(); toast(error.message, "error"); } }
}
function closeRecordModal() { state.recordToken++; closeModal("recordModal"); state.editingRowNumber = null; }
function fieldValue(input) { return input.type === "checkbox" ? String(input.checked) : input.value; }
function setFieldError(field, message) { if (!field) return; field.classList.add("is-invalid"); const small = field.querySelector(".field-error"); if (small) { small.textContent = message; small.hidden = false; } }
function clearFieldError(field) { if (!field || !field.classList.contains("is-invalid")) return; field.classList.remove("is-invalid"); const small = field.querySelector(".field-error"); if (small) small.hidden = true; }
function validateRecordForm() {
  let firstInvalid = null;
  $("recordFields").querySelectorAll(".field").forEach(field => {
    const input = field.querySelector("[name]"); if (!input) return; clearFieldError(field);
    let message = "";
    if (input.hasAttribute("data-required") && !input.value) message = `Select ${field.dataset.label}.`;
    else if (input.hasAttribute("data-url") && input.value && !/^https?:\/\/\S+$/i.test(input.value.trim())) message = "Enter a link that starts with http:// or https://";
    else if (input.type === "number" && input.validity.badInput) message = "Enter a valid number.";
    if (message) { setFieldError(field, message); firstInvalid = firstInvalid || field; }
  });
  if (firstInvalid) { firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" }); firstInvalid.querySelector(".select-trigger,.date-trigger,input")?.focus({ preventScroll: true }); }
  return !firstInvalid;
}
async function saveRecord(e) {
  e.preventDefault(); const source = state.activeSource, btn = $("saveRecordButton"), err = $("recordFormError"); if (!source || !state.recordSchema) return;
  err.hidden = true;
  if (!validateRecordForm()) return;
  const editing = !!state.editingRowNumber, values = {};
  $("recordFields").querySelectorAll("[name]").forEach(input => {
    const value = fieldValue(input);
    // Editing: only send what actually changed (a cleared field is sent as empty so the cell is cleared).
    if (editing) { if (value !== input.dataset.initial) values[input.name] = input.type === "checkbox" ? input.checked : value; return; }
    if (input.type === "checkbox") { values[input.name] = input.checked; return; }
    if (value !== "") values[input.name] = value;
  });
  if (!Object.keys(values).length) {
    if (editing) { closeRecordModal(); toast("No changes to save.", "info"); }
    else { err.textContent = "Fill in at least one field before saving."; err.hidden = false; }
    return;
  }
  const label = btn.textContent; setBusy(btn, true, "Saving…");
  try {
    const payload = editing ? { rowNumber: state.editingRowNumber, values } : { values };
    await api(`/.netlify/functions/data?source=${encodeURIComponent(source.id)}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
    closeRecordModal(); toast(editing ? "Record updated." : "Record created.", "success");
    if (!editing) { state.dataPage = 1; state.sort = { column: null, dir: "desc" }; }
    await loadSourceData(true);
  } catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, label); }
}
async function deleteRecord(rowNumber) {
  const source = state.activeSource; if (!source || source.accessMode !== "crud_candidate") return;
  const row = state.currentRows.get(rowNumber) || [], preview = (source.identityColumns || []).map(i => row[i]).filter(Boolean).slice(0, 2).join(" · ") || row.filter(Boolean).slice(0, 2).join(" · ");
  const ok = await confirmDialog({ title: "Delete this record?", message: `${preview ? `“${preview}” — row` : "Row"} ${rowNumber} in ${source.tab}. Editable fields are cleared; formula cells are preserved.`, confirmLabel: "Delete record", tone: "danger", icon: "trash" });
  if (!ok) return;
  try { await api(`/.netlify/functions/data?source=${encodeURIComponent(source.id)}`, { method: "DELETE", body: JSON.stringify({ rowNumber }) }); toast("Record deleted.", "success"); await loadSourceData(true); }
  catch (error) { toast(error.message, "error"); }
}
function formatCell(value) { return value === null || value === undefined ? "" : String(value); }

/* ---------- Organization ---------- */
async function getOrganizationOptions(category) {
  try { if (!state.organizationLoaded) { const d = await api("/.netlify/functions/organization"); state.organization = d.items || []; state.organizationLoaded = true; } return state.organization.filter(x => x.category === category && x.status === "Active").map(x => x.name); } catch { return []; }
}
async function loadOrganization() {
  if (!state.organizationLoaded) $("orgRows").innerHTML = skeletonRows(4, 6);
  setRefreshing(true);
  try { const d = await api("/.netlify/functions/organization"); state.organization = d.items || []; state.organizationLoaded = true; renderOrganization(); } catch (e) { $("orgRows").innerHTML = `<tr><td colspan="4" class="empty-cell">${emptyBlock("alert-triangle", "Could not load organization data", e.message)}</td></tr>`; }
  finally { setRefreshing(false); }
}
function renderOrganization() {
  document.querySelectorAll(".org-tab").forEach(b => { b.classList.toggle("active", b.dataset.category === state.organizationCategory); b.querySelector("i").textContent = state.organization.filter(x => x.category === b.dataset.category).length; });
  const category = state.organizationCategory, items = applyLocalSort(state.organization.filter(x => x.category === category), "org");
  paintLocalSort("orgHead", "org");
  $("orgCategoryTitle").textContent = category === "Department" ? "Departments" : category + "s"; $("orgCount").textContent = items.length + (items.length === 1 ? " item" : " items");
  $("orgRows").innerHTML = items.length ? items.map(x => { const active = x.status === "Active"; return `<tr><td><b>${esc(x.name)}</b></td><td><span class="status-pill ${active ? "active" : "inactive"}">${esc(x.status)}</span></td><td>${esc(x.updatedAt ? formatDate(x.updatedAt) : "—")}</td><td class="col-actions"><div class="row-actions"><button type="button" class="row-action" data-org-edit="${x.rowNumber}" title="Edit" aria-label="Edit ${escAttr(x.name)}">${svgIcon("pencil", 14)}</button><button type="button" class="row-action ${active ? "danger" : "good"}" data-org-toggle="${x.rowNumber}" data-status="${escAttr(x.status)}" title="${active ? "Deactivate" : "Activate"}" aria-label="${active ? "Deactivate" : "Activate"} ${escAttr(x.name)}">${svgIcon(active ? "ban" : "check-circle", 14)}</button></div></td></tr>`; }).join("") : `<tr><td colspan="4" class="empty-cell">${emptyBlock("inbox", `No ${category.toLowerCase()} items yet`, "Use Add Item to create the first one.")}</td></tr>`;
}
function openOrgModal(item = null) { state.editingOrgRow = item?.rowNumber || null; $("orgModalTitle").textContent = item ? "Edit Organization Item" : "Add Organization Item"; $("orgCategory").value = item?.category || state.organizationCategory; $("orgCategory").disabled = !!item; syncSelect($("orgCategory")); $("orgName").value = item?.name || ""; $("orgFormError").hidden = true; $("saveOrgButton").textContent = item ? "Save Changes" : "Save Item"; openModal("orgModal", $("orgName")); }
function closeOrgModal() { closeModal("orgModal"); state.editingOrgRow = null; }
async function saveOrgItem(e) {
  e.preventDefault(); const btn = $("saveOrgButton"), err = $("orgFormError"), name = $("orgName").value.trim(); err.hidden = true;
  if (!name) { err.textContent = "Enter a name."; err.hidden = false; $("orgName").focus(); return; }
  const label = btn.textContent; setBusy(btn, true, "Saving…");
  try { const editing = !!state.editingOrgRow; await api("/.netlify/functions/organization", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ rowNumber: state.editingOrgRow, category: $("orgCategory").value, name }) }); state.schemaCache.clear(); if (!editing) state.organizationCategory = $("orgCategory").value; closeOrgModal(); toast(editing ? "Organization item updated." : "Organization item added.", "success"); await loadOrganization(); }
  catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, label); }
}
async function toggleOrgStatus(rowNumber, status) {
  const item = state.organization.find(x => x.rowNumber === rowNumber), deactivate = status === "Active";
  const ok = await confirmDialog({ title: `${deactivate ? "Deactivate" : "Activate"} ${item?.name || "this item"}?`, message: deactivate ? "It will no longer appear as an option in forms. Existing records keep their value." : "It will be available again as an option in matching form fields.", confirmLabel: deactivate ? "Deactivate" : "Activate", tone: deactivate ? "danger" : "primary", icon: deactivate ? "ban" : "check-circle" });
  if (!ok) return;
  try { await api("/.netlify/functions/organization", { method: "PATCH", body: JSON.stringify({ rowNumber, status: deactivate ? "Inactive" : "Active" }) }); state.schemaCache.clear(); toast(`${item?.name || "Item"} ${deactivate ? "deactivated" : "activated"}.`, "success"); await loadOrganization(); }
  catch (e) { toast(e.message, "error"); }
}

/* ---------- Users ---------- */
async function loadUsers() {
  if (!state.users.length) $("userRows").innerHTML = skeletonRows(5, 5);
  setRefreshing(true);
  try { const d = await api("/.netlify/functions/users"); state.users = d.users || []; renderUsers(); } catch (e) { toast(e.message, "error"); }
  finally { setRefreshing(false); }
}
function renderUsers() {
  const q = $("userSearch").value.toLowerCase().trim(), users = applyLocalSort(state.users.filter(u => (u.username + " " + u.fullName + " " + u.role + " " + u.status).toLowerCase().includes(q)), "users");
  paintLocalSort("userHead", "users");
  $("usersTotal").textContent = state.users.length; $("usersActive").textContent = state.users.filter(u => u.status === "Active").length; $("usersAdmins").textContent = state.users.filter(u => u.role === "Admin").length;
  $("userRows").innerHTML = users.length ? users.map(u => { const active = u.status === "Active"; return `<tr><td><div class="user-cell"><span class="avatar">${esc(initial(u.fullName || u.username))}</span><div><b>${esc(u.fullName)}</b><small>@${esc(u.username)}</small></div></div></td><td><span class="role-label">${esc(u.role)}</span></td><td><span class="status-label ${active ? "" : "inactive"}">${esc(u.status)}</span></td><td>${u.updatedAt ? esc(formatDate(u.updatedAt)) : "—"}</td><td class="col-actions"><div class="row-actions"><button type="button" class="row-action" data-edit="${escAttr(u.username)}" title="Edit user" aria-label="Edit ${escAttr(u.username)}">${svgIcon("pencil", 14)}</button><button type="button" class="row-action ${active ? "danger" : "good"}" data-toggle="${escAttr(u.username)}" data-status="${active ? "Inactive" : "Active"}" title="${active ? "Deactivate" : "Activate"}" aria-label="${active ? "Deactivate" : "Activate"} ${escAttr(u.username)}">${svgIcon(active ? "ban" : "check-circle", 14)}</button></div></td></tr>`; }).join("") : `<tr><td colspan="5" class="empty-cell">${q ? emptyBlock("search", "No users found", `Nothing matches “${q}”.`) : emptyBlock("inbox", "No users yet", "Use Add User to create the first account.")}</td></tr>`;
}
async function toggleUserStatus(username, nextStatus) {
  const deactivate = nextStatus === "Inactive";
  const ok = await confirmDialog({ title: `${deactivate ? "Deactivate" : "Activate"} @${username}?`, message: deactivate ? "This account will no longer be able to sign in to EMP." : "This account will be able to sign in to EMP again.", confirmLabel: deactivate ? "Deactivate" : "Activate", tone: deactivate ? "danger" : "primary", icon: deactivate ? "ban" : "check-circle" });
  if (!ok) return;
  try { await api("/.netlify/functions/users", { method: "PATCH", body: JSON.stringify({ username, status: nextStatus }) }); toast(`@${username} ${deactivate ? "deactivated" : "activated"}.`, "success"); loadUsers(); loadDashboard(); } catch (e) { toast(e.message, "error"); }
}
function openUserModal(user = null) {
  state.editing = user?.username || null; $("userForm").reset(); $("modalTitle").textContent = user ? "Edit User" : "Add User"; $("userUsername").value = user?.username || ""; $("userUsername").disabled = !!user; $("userFullName").value = user?.fullName || "";
  $("userPassword").placeholder = user ? "Leave blank to keep current password" : "At least 8 characters"; $("passwordRequired").hidden = !!user; $("passwordHelp").textContent = user ? "Only fill this in to set a new password." : "Stored as a hash on the server.";
  $("userRole").value = user?.role || "Admin"; $("userStatus").value = user?.status || "Active"; syncSelect($("userRole")); syncSelect($("userStatus")); $("formError").hidden = true; $("saveUserButton").textContent = user ? "Save Changes" : "Save User";
  openModal("userModal", user ? $("userFullName") : $("userUsername"));
}
function closeUserModal() { closeModal("userModal"); state.editing = null; }
async function saveUser(e) {
  e.preventDefault(); const btn = $("saveUserButton"), err = $("formError"); err.hidden = true;
  const username = $("userUsername").value.trim(), fullName = $("userFullName").value.trim(), password = $("userPassword").value;
  const problem = username.length < 3 ? ["Username must be at least 3 characters.", "userUsername"] : !fullName ? ["Enter the full name.", "userFullName"] : !state.editing && !password ? ["Set a password for the new user.", "userPassword"] : password && password.length < 8 ? ["Password must be at least 8 characters.", "userPassword"] : null;
  if (problem) { err.textContent = problem[0]; err.hidden = false; $(problem[1]).focus(); return; }
  const label = btn.textContent; setBusy(btn, true, "Saving…");
  try { await api("/.netlify/functions/users", { method: "POST", body: JSON.stringify({ username, fullName, password, role: $("userRole").value, status: $("userStatus").value, originalUsername: state.editing }) }); const editing = !!state.editing; closeUserModal(); toast(editing ? "User updated." : "User added.", "success"); loadUsers(); loadDashboard(); }
  catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, label); }
}

/* ---------- Hiring Pipeline (kanban over the recruitment pipeline tab) ---------- */
const PIPE_START = { key: null, label: "Sourcing", mode: "start" };
const PIPE_API = "/.netlify/functions/pipeline";
function pipeColumns() { return [PIPE_START, ...state.pipe.stages]; }
function pipeStageIndex(key) { return state.pipe.stages.findIndex(s => s.key === key); } // -1 = Sourcing
function pipeStage(key) { return state.pipe.stages.find(s => s.key === key) || PIPE_START; }
function pipeCard(rowNumber) { return state.pipe.cards.find(c => c.rowNumber === rowNumber); }
function pipeDate(part) { return part?.iso ? formatDate(part.iso) : (part?.value || ""); }
function pipeDecorate(card) { card.joinIso = card.stages?.join?.iso || ""; card.stageLabel = pipeStage(card.stage).label; return card; }
function pipeFiltered(group) {
  const q = $("pipeSearch").value.toLowerCase().trim(), bu = $("pipeBU").value;
  return state.pipe.cards.filter(c => c.group === group && (!bu || c.businessUnit === bu) && (!q || [c.code, c.position, c.candidates, c.businessUnit, c.department, c.initiator].join(" ").toLowerCase().includes(q)));
}
function bindPipeline() {
  const board = $("pipeBoard");
  $("pipeView").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (!b) return; state.pipe.view = b.dataset.view; renderPipeline(); });
  $("pipeSearch").addEventListener("input", () => { $("pipeSearchClear").hidden = !$("pipeSearch").value; renderPipeline(); });
  $("pipeSearchClear").addEventListener("click", () => { $("pipeSearch").value = ""; $("pipeSearchClear").hidden = true; renderPipeline(); $("pipeSearch").focus(); });
  $("pipeBU").addEventListener("change", renderPipeline);
  $("pipeUnsent").addEventListener("click", () => openUnsentList($("pipeUnsent")));
  $("contractRows").addEventListener("click", e => {
    const tr = e.target.closest("[data-contract]"); if (!tr) return; const rowNumber = Number(tr.dataset.contract), action = e.target.closest("[data-contract-action]"), menu = e.target.closest("[data-contract-menu]");
    if (action) setContractStatus(rowNumber, action.dataset.contractAction); else if (menu) openContractMenu(menu, rowNumber); else openContractDetail(rowNumber);
  });
  bindLocalSort("pipeHead", "pipe", renderPipeline);
  bindLocalSort("pipeFailedHead", "pipeFailed", renderPipeline);
  $("pipeFailedRows").addEventListener("click", e => { const tr = e.target.closest("[data-pipe-row]"); if (tr) openPipeDetail(Number(tr.dataset.pipeRow)); });
  $("outcomeForm").addEventListener("submit", submitOutcome);
  $("outcomeContinue").addEventListener("change", () => { $("outcomeNextField").hidden = !$("outcomeContinue").checked; });
  $("pipeFailButton").addEventListener("click", () => { const rowNumber = state.pipe.detailRow; if (rowNumber) { closePipeDetail(); openOutcomeDialog(rowNumber, "fail"); } });
  board.addEventListener("click", e => {
    const cardEl = e.target.closest(".k-card"); if (!cardEl) return; const rowNumber = Number(cardEl.dataset.row);
    const next = e.target.closest("[data-pipe-next]"), menu = e.target.closest("[data-pipe-menu]");
    const outcome = e.target.closest("[data-pipe-outcome]");
    if (outcome) openOutcomeDialog(rowNumber, outcome.dataset.pipeOutcome);
    else if (next) requestMove(rowNumber, next.dataset.pipeNext);
    else if (e.target.closest("[data-pipe-complete]")) setPipeStatus(rowNumber, "complete");
    else if (menu) openStageMenu(menu, rowNumber);
    else openPipeDetail(rowNumber);
  });
  board.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList.contains("k-card")) openPipeDetail(Number(e.target.dataset.row)); });
  // Drag and drop between columns
  const clearDrag = () => { state.pipe.drag = null; board.classList.remove("is-dragging"); board.querySelectorAll(".is-over,.can-drop,.no-drop,.is-dragging").forEach(el => el.classList.remove("is-over", "can-drop", "no-drop", "is-dragging")); };
  board.addEventListener("dragstart", e => {
    const cardEl = e.target.closest?.(".k-card"); if (!cardEl) return; const card = pipeCard(Number(cardEl.dataset.row)); if (!card) return;
    Pop.close(); state.pipe.drag = card.rowNumber; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(card.rowNumber));
    requestAnimationFrame(() => { cardEl.classList.add("is-dragging"); board.classList.add("is-dragging"); board.querySelectorAll(".k-col").forEach(col => col.classList.add(moveCheck(card, col.dataset.stage || null).ok ? "can-drop" : "no-drop")); });
  });
  board.addEventListener("dragover", e => { const col = e.target.closest?.(".k-col"); if (!col || state.pipe.drag === null || !col.classList.contains("can-drop")) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!col.classList.contains("is-over")) { board.querySelectorAll(".is-over").forEach(el => el.classList.remove("is-over")); col.classList.add("is-over"); } });
  board.addEventListener("dragleave", e => { const col = e.target.closest?.(".k-col"); if (col && !col.contains(e.relatedTarget)) col.classList.remove("is-over"); });
  board.addEventListener("drop", e => { const col = e.target.closest?.(".k-col"), rowNumber = state.pipe.drag; if (!col || rowNumber === null) return; e.preventDefault(); const stage = col.dataset.stage || null; clearDrag(); requestMove(rowNumber, stage); });
  board.addEventListener("dragend", clearDrag);
  $("pipeRows").addEventListener("click", e => {
    const tr = e.target.closest("[data-pipe-row]"); if (!tr) return; const rowNumber = Number(tr.dataset.pipeRow);
    if (e.target.closest("[data-pipe-reopen]")) setPipeStatus(rowNumber, "reopen"); else openPipeDetail(rowNumber);
  });
  $("moveForm").addEventListener("submit", submitMove);
  $("pipeForm").addEventListener("submit", savePipeDetail);
  $("pipeForm").addEventListener("change", () => { $("savePipeButton").disabled = !Object.keys(pipeDetailChanges()).length; });
  $("pipeStatusButton").addEventListener("click", () => { const card = pipeCard(state.pipe.detailRow); if (card) setPipeStatus(card.rowNumber, card.group === "completed" ? "reopen" : "complete"); });
}
async function loadPipeline(forceRefresh = false, quiet = false) {
  const p = state.pipe, token = ++p.token;
  if (!p.loaded && !quiet) $("pipeBoard").innerHTML = Array.from({ length: 6 }, (_, i) => `<section class="k-col"><header class="k-head"><span class="skeleton" style="width:${[60, 84, 84, 76, 88, 62][i]}px"></span></header><div class="k-list">${Array.from({ length: [3, 2, 1, 2, 1, 1][i] }, () => `<div class="k-card is-skeleton"><span class="skeleton" style="width:40%"></span><span class="skeleton" style="width:78%;height:12px"></span><span class="skeleton" style="width:58%"></span></div>`).join("")}</div></section>`).join("");
  if (!quiet) setRefreshing(true);
  try {
    const d = await api(`${PIPE_API}${forceRefresh ? "?refresh=1" : ""}`);
    if (token !== p.token) return;
    p.stages = d.stages || []; setRequestConfig(d); p.cards = (d.cards || []).map(pipeDecorate); p.outcomeHeader = d.outcomeHeader || "Status"; p.statusValues = d.statusValues || []; p.codes = new Set(d.codes || []); p.unsent = d.unsent || []; p.rfpTab = d.rfpTab || p.rfpTab; p.tab = d.tab || ""; p.statusHeader = d.statusHeader || "RFP Process"; p.loaded = true;
    $("pipeError").hidden = true; $("pipeSubtitle").textContent = `Ongoing requests from ${p.tab}, stage by stage.`;
    $("pipeUpdated").textContent = `Updated ${new Date(d.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const units = [...new Set(p.cards.map(c => c.businessUnit).filter(Boolean))].sort((a, b) => a.localeCompare(b)), select = $("pipeBU"), keep = select.value;
    select.innerHTML = `<option value="">All business units</option>${units.map(u => `<option value="${escAttr(u)}">${esc(u)}</option>`).join("")}`; select.value = units.includes(keep) ? keep : ""; syncSelect(select);
    renderPipeline();
    if (!$("pipeModal").hidden && !$("pipeModal").dataset.dirty && pipeCard(p.detailRow)) openPipeDetail(p.detailRow, true);
    if (p.openAfterLoad) { const rowNumber = p.openAfterLoad; p.openAfterLoad = null; if (pipeCard(rowNumber)) openPipeDetail(rowNumber); }
  } catch (error) {
    if (token !== p.token) return;
    if (!p.loaded) $("pipeBoard").innerHTML = `<div class="k-notice">${emptyBlock("alert-triangle", "Could not load the pipeline", "Check the message below, then refresh.")}</div>`;
    $("pipeError").hidden = false; $("pipeError").textContent = error.message;
  } finally { if (token === p.token && !quiet) setRefreshing(false); }
}
function renderPipeline() {
  const p = state.pipe, board = $("pipeBoard"), isBoard = p.view === "board";
  $("pipeOngoingCount").textContent = p.cards.filter(c => c.group === "ongoing").length; $("pipeCompletedCount").textContent = p.cards.filter(c => c.group === "completed").length; $("pipeFailedCount").textContent = p.cards.filter(c => c.group === "failed").length;
  $("pipeView").querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === p.view; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
  board.hidden = !isBoard; $("pipeCompleted").hidden = p.view !== "completed"; $("pipeFailed").hidden = p.view !== "failed";
  const waiting = p.unsent.length; $("pipeUnsent").hidden = !waiting; $("pipeUnsent").innerHTML = `${svgIcon("send", 13)}<b>${waiting}</b> RFP${waiting === 1 ? "" : "s"} not in pipeline`;
  const list = pipeFiltered(isBoard ? "ongoing" : p.view), filtering = !!($("pipeSearch").value.trim() || $("pipeBU").value);
  $("pipeCount").textContent = `${list.length.toLocaleString()} ${filtering ? (list.length === 1 ? "match" : "matches") : (list.length === 1 ? "request" : "requests")}`;
  if (p.view === "failed") { renderPipeFailed(list, filtering); return; }
  if (!isBoard) { renderPipeCompleted(list, filtering); return; }
  if (!p.cards.some(c => c.group === "ongoing")) {
    const found = p.statusValues.filter(v => v.value).map(v => `${v.value} (${v.count})`).join(", ");
    board.innerHTML = `<div class="k-notice">${emptyBlock("inbox", "No ongoing requests", found ? `No row in ${p.tab} has an ongoing ${p.statusHeader}. Values found: ${found}.` : `${p.tab} has no rows with a ${p.statusHeader} value yet.`)}</div>`; return;
  }
  const scroll = { left: board.scrollLeft, tops: Object.fromEntries([...board.querySelectorAll(".k-col")].map(col => [col.dataset.stage, col.querySelector(".k-list")?.scrollTop || 0])) };
  board.innerHTML = pipeColumns().map(stage => {
    const cards = list.filter(c => (c.stage || null) === stage.key).sort((a, b) => (b.daysOpen ?? -1) - (a.daysOpen ?? -1) || b.rowNumber - a.rowNumber);
    return `<section class="k-col is-${stage.mode}" data-stage="${stage.key ?? ""}" aria-label="${escAttr(stage.label)}"><header class="k-head"><b>${esc(stage.label)}</b><span class="k-count">${cards.length}</span>${stage.mode === "auto" ? `<span class="k-auto" title="Filled automatically from ${escAttr(stage.source)}. Cards arrive here by themselves.">${svgIcon("lock", 11)}Auto</span>` : ""}</header><div class="k-list">${cards.map(pipeCardHtml).join("") || `<div class="k-empty">${stage.mode === "auto" ? `Fills from ${esc(stage.source)}` : filtering ? "No matches" : "Drop a card here"}</div>`}</div></section>`;
  }).join("");
  board.scrollLeft = scroll.left; board.querySelectorAll(".k-col").forEach(col => { const top = scroll.tops[col.dataset.stage]; if (top) col.querySelector(".k-list").scrollTop = top; });
}
function pipeCardHtml(card) {
  const next = state.pipe.stages[pipeStageIndex(card.stage) + 1], age = card.daysOpen;
  const since = card.stage ? pipeDate(card.stages[card.stage]) : (card.receivedIso ? formatDate(card.receivedIso) : card.received);
  const action = !next ? `<button type="button" class="k-next is-complete" data-pipe-complete title="Mark this request as completed">${svgIcon("check", 13)}Complete</button>`
    : next.mode === "auto" ? (card.requests?.[next.key] ? `<span class="k-wait" title="Requested. The card moves to ${escAttr(next.label)} once ${escAttr(next.source)} has the data.">${svgIcon("clock", 12)}${esc(next.label)} requested</span>` : `<button type="button" class="k-next" data-pipe-next="${next.key}" title="Request ${escAttr(next.label)}">${esc(next.label)}${svgIcon("arrow-right", 13)}</button>`)
    : `<button type="button" class="k-next" data-pipe-next="${next.key}" title="Move to ${escAttr(next.label)}">${esc(next.label)}${svgIcon("arrow-right", 13)}</button>`;
  return `<article class="k-card${card.pending ? " is-pending" : ""}" draggable="true" tabindex="0" data-row="${card.rowNumber}" aria-label="${escAttr(card.position || card.code)}">
    <div class="k-top"><span class="k-code">${esc(card.code || `Row ${card.rowNumber}`)}</span>${age === null ? "" : `<span class="k-age${age > 60 ? " late" : age > 30 ? " warn" : ""}" title="${age} day${age === 1 ? "" : "s"} since the RFP was received">${age}d</span>`}</div>
    <b class="k-title">${esc(card.position || "Untitled position")}</b>${card.negotiations && card.stage === "offerIn" || card.failedBefore || ["psikotest", "mcu"].some(k => card.requests?.[k] && !card.stages[k]?.reached) ? `<div class="k-badges">${card.negotiations && card.stage === "offerIn" ? `<span class="k-badge nego" title="${escAttr(card.lastNote)}">Negotiating${card.negotiations > 1 ? ` ×${card.negotiations}` : ""}</span>` : ""}${["psikotest", "mcu"].filter(k => card.requests?.[k] && !card.stages[k]?.reached).map(k => `<span class="k-badge request">${k === "mcu" ? "MCU" : "Psikotest"} requested</span>`).join("")}${card.failedBefore ? `<span class="k-badge retry" title="${card.failedBefore} earlier candidate${card.failedBefore === 1 ? "" : "s"} failed for this RFP">Candidate #${card.failedBefore + 1}</span>` : ""}</div>` : ""}
    <div class="k-meta">${esc([card.businessUnit, card.department].filter(Boolean).join(" · ") || "—")}</div>
    ${card.candidates ? `<div class="k-cand">${svgIcon("user", 12)}<span>${esc(card.candidates)}</span></div>` : ""}
    <div class="k-since">${svgIcon("calendar", 12)}${esc(card.stage ? `${pipeStage(card.stage).label}: ${since || "—"}` : `Received ${since || "—"}`)}</div>
    <div class="k-foot">${action}<button type="button" class="row-action" data-pipe-menu title="Move to another stage" aria-label="Move ${escAttr(card.code)} to another stage" aria-haspopup="menu">${svgIcon("more", 15)}</button></div>
    ${card.stage === "offerIn" ? `<div class="k-outcomes"><button type="button" data-pipe-outcome="negotiate" title="Candidate is renegotiating the offer">${svgIcon("rotate-cw", 11)}Negotiating</button><button type="button" class="danger" data-pipe-outcome="fail" title="Candidate declined the offer">${svgIcon("x", 11)}Declined</button></div>` : ""}
  </article>`;
}
function renderPipeCompleted(list, filtering) {
  const rows = applyLocalSort(list, "pipe"); paintLocalSort("pipeHead", "pipe");
  $("pipeRows").innerHTML = rows.length ? rows.map(c => `<tr data-pipe-row="${c.rowNumber}" class="is-clickable"><td><b>${esc(c.code)}</b></td><td>${esc(c.position)}</td><td>${esc(c.businessUnit)}</td><td>${esc(c.candidates || "—")}</td><td>${esc(pipeDate(c.stages.join) || "—")}</td><td>${esc(c.completionDays || "—")}</td><td class="col-actions"><div class="row-actions"><button type="button" class="row-action" data-pipe-reopen title="Reopen (move back to the board)" aria-label="Reopen ${escAttr(c.code)}">${svgIcon("undo", 14)}</button></div></td></tr>`).join("") : `<tr><td colspan="7" class="empty-cell">${filtering ? emptyBlock("search", "No matching requests", "Nothing in the completed list matches this filter.") : emptyBlock("inbox", "Nothing completed yet", "Requests appear here once they are marked completed.")}</td></tr>`;
}
function renderPipeFailed(list, filtering) {
  const rows = applyLocalSort(list, "pipeFailed"); paintLocalSort("pipeFailedHead", "pipeFailed");
  $("pipeFailedRows").innerHTML = rows.length ? rows.map(c => `<tr data-pipe-row="${c.rowNumber}" class="is-clickable"><td><b>${esc(c.code)}</b></td><td>${esc(c.position)}</td><td>${esc(c.businessUnit)}</td><td>${esc(c.candidates || "—")}</td><td>${esc(c.stageLabel)}</td><td class="cell-note" title="${escAttr(c.lastNote)}">${esc(c.lastNote || "—")}</td></tr>`).join("") : `<tr><td colspan="6" class="empty-cell">${filtering ? emptyBlock("search", "No matching rows", "Nothing in the failed list matches this filter.") : emptyBlock("inbox", "No failed candidates", `Rows whose ${state.pipe.outcomeHeader || "Status"} is Failed are kept here as history.`)}</td></tr>`;
}
// Negotiation note or failed candidate: one small dialog for both outcomes.
function openOutcomeDialog(rowNumber, kind) {
  const card = pipeCard(rowNumber); if (!card || card.pending) return; const fail = kind === "fail", atOffer = card.stage === "offerIn" || card.stage === "offerDone";
  state.pipe.outcome = { rowNumber, kind };
  $("outcomeTitle").textContent = fail ? (atOffer ? "Candidate declined" : "Mark candidate as failed") : "Negotiation note"; $("outcomeSub").textContent = [card.code, card.candidates || card.position, pipeStage(card.stage).label].filter(Boolean).join(" · ");
  $("outcomeIcon").className = "modal-icon" + (fail ? " danger" : " amber"); $("outcomeIcon").innerHTML = svgIcon(fail ? "x" : "rotate-cw", 17);
  $("outcomeNoteLabel").innerHTML = (fail ? "Reason" : "What is being negotiated") + " <em>*</em>"; $("outcomeNote").value = ""; $("outcomeNote").placeholder = fail ? (atOffer ? "e.g. Declined the offer, accepted another company" : "e.g. Did not pass the interview") : "e.g. Asked for a higher salary and a later join date";
  $("outcomeNoteHelp").textContent = fail ? `Added to Remarks. ${state.pipe.outcomeHeader || "Status"} is set to Failed and this row leaves the board.` : "Added to Remarks as a dated line. The card stays in its stage.";
  $("outcomeDateSlot").innerHTML = dateFieldHtml("outcomeDate", isoOf(new Date()), "outcomeDateTrigger"); syncDateField($("outcomeDateSlot").firstElementChild);
  $("outcomeContinueField").hidden = !fail; $("outcomeContinue").checked = true; $("outcomeNext").value = ""; $("outcomeNextField").hidden = !fail; $("outcomeError").hidden = true;
  $("outcomeOk").textContent = fail ? "Mark as failed" : "Save note"; $("outcomeOk").className = fail ? "danger-button" : "primary-button";
  openModal("outcomeModal", $("outcomeNote"));
}
function closeOutcomeDialog() { closeModal("outcomeModal"); state.pipe.outcome = null; }
async function submitOutcome(e) {
  e.preventDefault(); const o = state.pipe.outcome, card = o && pipeCard(o.rowNumber), btn = $("outcomeOk"), err = $("outcomeError"); if (!card) return;
  const note = $("outcomeNote").value.trim(), date = $("outcomeDateSlot").querySelector("input").value, fail = o.kind === "fail"; err.hidden = true;
  if (!note || !date) { err.textContent = !note ? (fail ? "Enter the reason." : "Enter a short note.") : "Pick a date."; err.hidden = false; (!note ? $("outcomeNote") : $("outcomeDateTrigger")).focus(); return; }
  const label = btn.textContent; setBusy(btn, true, "Saving…");
  try {
    const result = await api(PIPE_API, { method: "POST", body: JSON.stringify({ rowNumber: card.rowNumber, code: card.code, action: fail ? "fail" : "negotiate", note, date, continue: fail && $("outcomeContinue").checked, candidate: fail && $("outcomeContinue").checked ? $("outcomeNext").value.trim().replace(/\s+/g, " ") : "" }) });
    closeOutcomeDialog();
    if (fail) { card.group = "failed"; card.lastNote = note; toast(result.newRow ? `${card.code}: candidate marked as failed. A new row was added for the next candidate.` : `${card.code}: candidate marked as failed.`, "success", { duration: 5000 }); if (result.warning) toast(result.warning, "warning", { duration: 12000 }); }
    else { card.negotiations = (card.negotiations || 0) + 1; card.lastNote = note; toast(`${card.code}: negotiation noted.`, "success"); }
    renderPipeline(); loadPipeline(true, true);
  } catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, label); }
}
// Can this card go to that stage? Returns the manual stage dates a backward move would clear.
function moveCheck(card, targetKey) {
  const stages = state.pipe.stages, t = pipeStageIndex(targetKey), current = pipeStageIndex(card.stage), target = pipeStage(targetKey);
  if (t === current) return { ok: false, same: true };
  if (target.mode === "auto") {
    // Psikotest and MCU are requested, not dated by hand: the card arrives in the column once the SPK or MCU tab has the data.
    if (card.stages[target.key]?.reached) return { ok: false, tone: "info", reason: `${card.code} already has ${target.label} data in the sheet.` };
    return { ok: true, request: target.key, target, cleared: [] };
  }
  const blocking = stages.filter((s, i) => i > t && s.mode === "auto" && card.stages[s.key]?.reached);
  if (blocking.length) return { ok: false, tone: "warning", reason: `${card.code} already has ${blocking.map(s => s.label).join(" and ")} data in the sheet, so it can't move back before that stage.` };
  return { ok: true, target, cleared: stages.filter((s, i) => i > t && s.mode === "manual" && card.stages[s.key]?.reached) };
}
function openStageMenu(button, rowNumber) {
  if (Pop.current?.anchor === button) { Pop.close(); return; }
  const card = pipeCard(rowNumber); if (!card) return;
  const panel = document.createElement("div"); panel.className = "select-pop stage-menu"; panel.setAttribute("role", "menu"); panel.tabIndex = -1;
  panel.innerHTML = `<div class="pop-title">Move ${esc(card.code)} to</div>` + pipeColumns().map(stage => { const check = moveCheck(card, stage.key), current = (card.stage || null) === stage.key; return `<button type="button" role="menuitem" class="pop-option${current ? " is-selected" : ""}" data-stage="${stage.key ?? ""}" ${check.ok ? "" : "disabled"} title="${escAttr(check.reason || (current ? "Current stage" : ""))}"><span>${esc(stage.label)}</span>${current ? svgIcon("check", 14) : stage.mode === "auto" ? `<em>${check.ok ? (card.requests?.[stage.key] ? "Requested" : "Request") : `${svgIcon("lock", 11)}Auto`}</em>` : ""}</button>`; }).join("");
  const pendingForms = ["psikotest", "mcu"].filter(k => card.requests?.[k] && !card.stages[k]?.reached);
  if (pendingForms.length) panel.insertAdjacentHTML("beforeend", `<div class="pop-sep"></div>${pendingForms.map(k => `<button type="button" role="menuitem" class="pop-option" data-form="${k === "mcu" ? "mcu" : card.requests?.letter ? "invite" : "spk"}"><span>${k === "mcu" ? "Open MCU form…" : card.requests?.letter ? "Send psikotest invitation…" : "Fill surat pengantar psikotes…"}</span></button>`).join("")}`);
  panel.insertAdjacentHTML("beforeend", `<div class="pop-sep"></div><button type="button" role="menuitem" class="pop-option" data-outcome="negotiate"><span>Add negotiation note…</span></button><button type="button" role="menuitem" class="pop-option is-danger" data-outcome="fail"><span>Mark candidate as failed…</span></button>`);
  panel.addEventListener("click", e => { const b = e.target.closest(".pop-option"); if (!b || b.disabled) return; Pop.close(); if (b.dataset.form) openTask(taskFromCard(card, b.dataset.form)); else if (b.dataset.outcome) openOutcomeDialog(rowNumber, b.dataset.outcome); else requestMove(rowNumber, b.dataset.stage || null); });
  panel.addEventListener("keydown", e => { if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return; e.preventDefault(); const items = [...panel.querySelectorAll(".pop-option:not(:disabled)")], i = items.indexOf(document.activeElement); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); });
  Pop.open(button, panel); (panel.querySelector(".pop-option:not(:disabled)") || panel).focus({ preventScroll: true });
}
function requestMove(rowNumber, targetKey) {
  const card = pipeCard(rowNumber); if (!card || card.pending) return;
  const check = moveCheck(card, targetKey || null);
  if (!check.ok) { if (check.reason) toast(check.reason, check.tone); return; }
  if (check.request) { openRequestDialog(rowNumber, check.request); return; }
  const target = check.target, back = !target.key;
  state.pipe.move = { rowNumber, targetKey: target.key, cleared: check.cleared };
  $("moveTitle").textContent = back ? "Move back to Sourcing" : `Move to ${target.label}`; $("moveSub").textContent = [card.code, card.position].filter(Boolean).join(" · ");
  $("moveNote").hidden = !check.cleared.length; $("moveNote").innerHTML = check.cleared.length ? svgIcon("alert-triangle", 15) + `<span>Moving back clears ${check.cleared.length === 1 ? "this date" : "these dates"} in the sheet: ${check.cleared.map(s => `<b>${esc(s.label)}</b> (${esc(pipeDate(card.stages[s.key]))})`).join(", ")}.</span>` : "";
  $("moveField").hidden = back; $("moveError").hidden = true;
  if (!back) { $("moveLabel").textContent = `${target.label} date`; $("moveDateSlot").innerHTML = dateFieldHtml("moveDate", card.stages[target.key]?.iso || isoOf(new Date()), "moveDateTrigger"); syncDateField($("moveDateSlot").firstElementChild); }
  $("moveOk").textContent = back ? "Move back" : "Move"; $("moveOk").className = check.cleared.length ? "danger-button" : "primary-button";
  openModal("moveModal", $("moveOk"));
}
function openUnsentList(button) {
  if (Pop.current?.anchor === button) { Pop.close(); return; }
  const panel = document.createElement("div"); panel.className = "select-pop unsent-pop"; panel.tabIndex = -1;
  panel.innerHTML = `<div class="pop-title">In ${esc(state.pipe.rfpTab)} but not yet in the pipeline</div><div class="pop-list">${state.pipe.unsent.map(r => `<div class="unsent-row"><div><b>${esc(r.code)}</b><small>${esc([r.position, r.businessUnit].filter(Boolean).join(" · ") || "—")}</small>${r.failedBefore ? `<small class="is-retry">Previous candidate failed · needs a new row</small>` : ""}</div><button type="button" class="k-next" data-send="${r.rowNumber}" data-code="${escAttr(r.code)}">${svgIcon("send", 12)}Send</button></div>`).join("")}</div>`;
  panel.addEventListener("click", e => { const b = e.target.closest("[data-send]"); if (!b) return; Pop.close(); const r = state.pipe.unsent.find(x => x.rowNumber === Number(b.dataset.send)); sendRfpToPipeline(Number(b.dataset.send), b.dataset.code, r?.position || ""); });
  Pop.open(button, panel); (panel.querySelector("[data-send]") || panel).focus({ preventScroll: true });
}
// Sending asks for the candidate's name, which goes into the Candidates column of the new pipeline row.
function sendRfpToPipeline(rfpRowNumber, code, label = "") {
  state.pipe.send = { rfpRowNumber, code };
  $("sendSub").textContent = [code, label].filter(Boolean).join(" · "); $("sendCandidate").value = ""; $("sendError").hidden = true;
  openModal("sendModal", $("sendCandidate"));
}
function closeSendDialog() { closeModal("sendModal"); state.pipe.send = null; }
async function submitSend(e) {
  e.preventDefault(); const p = state.pipe, send = p.send, btn = $("sendOk"), err = $("sendError"); if (!send) return;
  const candidate = $("sendCandidate").value.trim().replace(/\s+/g, " "); err.hidden = true;
  setBusy(btn, true, "Sending…");
  try {
    await api(PIPE_API, { method: "POST", body: JSON.stringify({ action: "send", rfpRowNumber: send.rfpRowNumber, code: send.code, candidate }) });
    const code = send.code; closeSendDialog();
    p.codes.add(code); p.unsent = p.unsent.filter(r => r.code !== code); toast(`${code} sent to the pipeline.`, "success");
    await loadPipeline(true, true);
    if ($("page-data").classList.contains("active") && state.activeSource?.id === "rfp-master") loadSourceData(true);
  } catch (error) { err.textContent = error.message; err.hidden = false; if (/already in/i.test(error.message)) loadPipeline(true, true); }
  finally { setBusy(btn, false, "Send to pipeline"); }
}
function closeMoveDialog() { closeModal("moveModal"); state.pipe.move = null; }
function applyStageValues(card, values) {
  Object.entries(values).forEach(([key, iso]) => { card.stages[key] = { ...card.stages[key], reached: !!iso, iso, value: iso ? formatDate(iso) : "" }; });
  card.stage = state.pipe.stages.filter(s => card.stages[s.key]?.reached).pop()?.key || null; pipeDecorate(card);
}
async function submitMove(e) {
  e.preventDefault(); const move = state.pipe.move, card = move && pipeCard(move.rowNumber); if (!card) return;
  const values = Object.fromEntries(move.cleared.map(s => [s.key, ""]));
  if (move.targetKey) { const date = $("moveDateSlot").querySelector("input").value; if (!date) { $("moveError").textContent = "Pick a date for this stage."; $("moveError").hidden = false; return; } if (date !== (card.stages[move.targetKey]?.iso || "")) values[move.targetKey] = date; }
  if (!Object.keys(values).length) { closeMoveDialog(); return; }
  const label = pipeStage(move.targetKey).label, snapshot = JSON.stringify({ stages: card.stages, stage: card.stage });
  closeMoveDialog();
  // Optimistic: the card moves immediately and snaps back if the sheet rejects the change.
  applyStageValues(card, values); card.pending = true; renderPipeline();
  try { await api(PIPE_API, { method: "PATCH", body: JSON.stringify({ rowNumber: card.rowNumber, code: card.code, values }) }); card.pending = false; renderPipeline(); toast(`${card.code} moved to ${label}.`, "success"); loadPipeline(true, true); }
  catch (error) { Object.assign(card, JSON.parse(snapshot)); card.pending = false; pipeDecorate(card); renderPipeline(); toast(`${card.code} was not moved. ${error.message}`, "error"); }
}
async function setPipeStatus(rowNumber, action) {
  const card = pipeCard(rowNumber); if (!card || card.pending) return; const complete = action === "complete", header = state.pipe.statusHeader;
  const ok = await confirmDialog(complete
    ? { title: `Mark ${card.code} as completed?`, message: `${card.position || "This request"} leaves the board and moves to the Completed list. ${header} is updated in the sheet.`, confirmLabel: "Mark completed", icon: "check-circle" }
    : { title: `Reopen ${card.code}?`, message: `${card.position || "This request"} goes back to the board at its last stage. ${header} is set back to ongoing in the sheet.`, confirmLabel: "Reopen", icon: "undo" });
  if (!ok) return;
  const before = { group: card.group, status: card.status };
  card.group = complete ? "completed" : "ongoing"; card.pending = true; if (state.pipe.detailRow === rowNumber) closePipeDetail(); renderPipeline();
  try { const result = await api(PIPE_API, { method: "POST", body: JSON.stringify({ rowNumber, code: card.code, action }) }); card.status = result.value || card.status; card.pending = false; renderPipeline(); toast(complete ? `${card.code} marked as completed.` : `${card.code} reopened.`, "success"); loadPipeline(true, true); }
  catch (error) { Object.assign(card, before); card.pending = false; renderPipeline(); toast(error.message, "error", { duration: 8000 }); }
}
function openPipeDetail(rowNumber, keepScroll = false) {
  const card = pipeCard(rowNumber); if (!card) return; const done = card.group !== "ongoing", stages = state.pipe.stages, body = $("pipeModal").querySelector(".modal-body"), top = body.scrollTop;
  state.pipe.detailRow = rowNumber;
  $("pipeModalTitle").textContent = card.position || card.code; $("pipeModalSub").textContent = [card.code, card.group === "failed" ? (card.outcome || "Failed") : card.status, `Row ${card.rowNumber}`].filter(Boolean).join(" · ");
  const info = [["Business unit", card.businessUnit], ["Department", card.department], ["Division", card.division], ["Contract", card.contract], ["Location", card.location], ["Required person", card.requiredPerson], ["Candidates", card.candidates], ["RFP received", card.receivedIso ? formatDate(card.receivedIso) : card.received], ["Hiring date request", card.hiringDateIso ? formatDate(card.hiringDateIso) : card.hiringDate], ["Initiator", card.initiator], ["Reason", card.reason], ...(done ? [["Completion days", card.completionDays]] : []), ["Remarks", card.remarks, true]].filter(x => x[1]);
  $("pipeInfo").innerHTML = info.map(([label, value, wide]) => `<div${wide ? ' class="is-wide"' : ""}><dt>${esc(label)}</dt><dd${wide ? ' class="is-multiline"' : ""}>${esc(value)}</dd></div>`).join("");
  $("pipeStages").innerHTML = stages.map(stage => {
    const part = card.stages[stage.key] || {}, state_ = part.reached ? (card.stage === stage.key ? "is-current" : "is-done") : "is-pending";
    let control;
    if (stage.mode === "auto") { const parts = (part.parts || []).filter(x => x.value); control = `<div class="stage-text">${parts.length ? parts.map(x => `<span><em>${esc(x.name)}</em>${esc(x.iso ? formatDate(x.iso) : x.value)}</span>`).join("") : `<span class="is-placeholder">Not yet</span>`}</div>`; }
    else if (done || (part.value && !part.iso)) control = `<div class="stage-text"><span${part.value ? "" : ' class="is-placeholder"'}>${esc(pipeDate(part) || "—")}</span></div>`;
    else control = dateFieldHtml(stage.key, part.iso || "", `pd-${stage.key}`);
    return `<div class="stage-row ${state_}"><span class="stage-dot">${part.reached ? svgIcon("check", 11) : ""}</span><div class="stage-name"><b>${esc(stage.label)}</b>${stage.mode === "auto" ? `<small>${svgIcon("lock", 10)}From ${esc(stage.source)}</small>` : ""}</div>${control}</div>`;
  }).join("");
  $("pipeStages").querySelectorAll(".date-field").forEach(field => { syncDateField(field); field.querySelector("input").dataset.initial = field.querySelector("input").value; });
  $("pipeFormError").hidden = true; $("savePipeButton").hidden = done; $("savePipeButton").disabled = true; $("savePipeButton").textContent = "Save Changes";
  $("pipeStatusButton").hidden = card.group === "failed"; $("pipeFailButton").hidden = card.group !== "ongoing";
  $("pipeStatusButton").innerHTML = done ? svgIcon("undo", 14) + "Reopen" : svgIcon("check-circle", 14) + "Mark as completed";
  if (keepScroll) { $("pipeModal").dataset.dirty = ""; body.scrollTop = top; } else openModal("pipeModal", $("cancelPipeModal"));
}
function closePipeDetail() { closeModal("pipeModal"); state.pipe.detailRow = null; }
function pipeDetailChanges() { const values = {}; $("pipeStages").querySelectorAll("input[type=hidden]").forEach(input => { if (input.value !== input.dataset.initial) values[input.name] = input.value; }); return values; }
async function savePipeDetail(e) {
  e.preventDefault(); const card = pipeCard(state.pipe.detailRow), btn = $("savePipeButton"), err = $("pipeFormError"); if (!card) return;
  const values = pipeDetailChanges(); if (!Object.keys(values).length) { closePipeDetail(); return; }
  err.hidden = true; setBusy(btn, true, "Saving…");
  try { await api(PIPE_API, { method: "PATCH", body: JSON.stringify({ rowNumber: card.rowNumber, code: card.code, values }) }); applyStageValues(card, values); closePipeDetail(); renderPipeline(); toast(`${card.code} updated${card.stage ? ` · now at ${pipeStage(card.stage).label}` : ""}.`, "success"); loadPipeline(true, true); }
  catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, "Save Changes"); }
}

/* ---------- Psikotest / MCU requests and the tasks that follow ---------- */
function setRequestConfig(d) {
  if (d.forms) state.forms = d.forms;
  if (!d.requestOptions) return; state.requestOptions = d.requestOptions;
  const fill = (id, options) => { const select = $(id), keep = select.value; select.innerHTML = `<option value=""></option>${options.map(o => `<option value="${escAttr(o)}">${esc(o)}</option>`).join("")}`; select.value = options.includes(keep) ? keep : ""; syncSelect(select); };
  fill("requestLocation", d.requestOptions.locations || []); fill("requestType", d.requestOptions.testTypes || []); fill("requestService", d.requestOptions.services || []);
}
// Form link for a task. With a prefill template the candidate's data is filled in; otherwise the plain form opens.
function formUrl(kind, values) {
  const form = (state.forms || {})[kind] || {};
  if (!form.prefill) return form.url || "";
  // Parameters whose value is unknown are dropped, so the form shows that field untouched.
  const [base, query = ""] = form.prefill.split("?");
  const params = query.split("&").map(pair => { const token = /=\{(\w+)\}$/.exec(pair); if (!token) return pair; const value = String(values[token[1]] ?? "").trim(); return value ? pair.replace(/\{\w+\}$/, encodeURIComponent(value)) : null; }).filter(Boolean);
  return `${base}?${params.join("&")}`;
}
function openRequestDialog(rowNumber, kind) {
  const card = pipeCard(rowNumber); if (!card || card.pending) return;
  if (kind === "mcu") { requestMcu(card); return; }
  state.pipe.request = { rowNumber, kind };
  const previous = card.requests?.psikotest || {};
  $("requestSub").textContent = [card.code, card.candidates || card.position].filter(Boolean).join(" · ");
  $("requestDateSlot").innerHTML = dateFieldHtml("requestDate", previous.dateIso || "", "requestDateTrigger"); syncDateField($("requestDateSlot").firstElementChild);
  [["requestLocation", previous.location], ["requestType", previous.testType], ["requestService", previous.service]].forEach(([id, value]) => { $(id).value = value && [...$(id).options].some(o => o.value === value) ? value : ""; syncSelect($(id)); });
  $("requestError").hidden = true; openModal("requestModal", $("requestDateTrigger"));
}
function closeRequestDialog() { closeModal("requestModal"); state.pipe.request = null; }
async function submitRequest(e) {
  e.preventDefault(); const request = state.pipe.request, card = request && pipeCard(request.rowNumber), btn = $("requestOk"), err = $("requestError"); if (!card) return;
  const date = $("requestDateSlot").querySelector("input").value, location = $("requestLocation").value, testType = $("requestType").value, service = $("requestService").value;
  const missing = !date ? "Pick the psikotest date." : !location ? "Choose the test location." : !testType ? "Choose the Kategori Test." : !service ? "Choose the Kategori Layanan." : "";
  err.hidden = true; if (missing) { err.textContent = missing; err.hidden = false; return; }
  setBusy(btn, true, "Saving…");
  try {
    await api(PIPE_API, { method: "POST", body: JSON.stringify({ rowNumber: card.rowNumber, code: card.code, action: "request", kind: "psikotest", date, location, testType, service }) });
    card.requests = { ...(card.requests || {}), psikotest: { dateIso: date, dateLabel: formatDate(date), location, testType, service } };
    closeRequestDialog(); renderPipeline(); toast(`${card.code}: psikotest requested. Surat pengantar is now in Action Needed.`, "success", { duration: 5000 }); loadPipeline(true, true);
  } catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, "Request surat pengantar"); }
}
async function requestMcu(card) {
  if (!card.requests?.mcu) {
    const ok = await confirmDialog({ title: `Request MCU for ${card.candidates || card.code}?`, message: "It is added to Action Needed until the MCU form has been filled in.", confirmLabel: "Request MCU", icon: "heart-pulse" });
    if (!ok) return;
    try { const today = isoOf(new Date()); await api(PIPE_API, { method: "POST", body: JSON.stringify({ rowNumber: card.rowNumber, code: card.code, action: "request", kind: "mcu", date: today }) }); card.requests = { ...(card.requests || {}), mcu: { dateIso: today, dateLabel: formatDate(today) } }; renderPipeline(); toast(`${card.code}: MCU requested.`, "success"); loadPipeline(true, true); }
    catch (error) { toast(error.message, "error"); return; }
  }
  openTask(taskFromCard(card, "mcu"));
}
function taskFromCard(card, kind) {
  const base = { kind, pipelineRow: card.rowNumber, name: card.candidates || "", position: card.position, businessUnit: card.businessUnit, rfpCode: card.code, onBoard: true };
  if (kind === "mcu") return { ...base, title: "Fill MCU form", dateLabel: card.requests?.mcu?.dateLabel || "" };
  if (kind === "spk") return { ...base, pending: true, title: "Permintaan Surat Pengantar Psikotes", ...(card.requests?.psikotest || {}), current: card.requests?.letter ? { dateIso: card.requests.letter.dateIso, noSpk: card.requests.letter.noSpk, link: card.requests.letter.link } : {} };
  return { ...base, title: "Send psikotest invitation", ...(card.requests?.psikotest || {}) };
}
// Finished Psikotest / MCU requests: their line in Remarks is removed, quietly and one at a time.
async function clearFinishedRequests(list) {
  if (!list?.length || state.clearingRequests) return; state.clearingRequests = true; let changed = false;
  try { for (const item of list) { try { if (item.sync) await api("/.netlify/functions/spk", { method: "POST", body: JSON.stringify({ ...item.sync, onlyEmpty: true }) }); const result = await api(PIPE_API, { method: "POST", body: JSON.stringify({ action: "clearRequest", rowNumber: item.pipelineRow, code: item.code, kind: item.kind }) }); if (!result.unchanged) changed = true; } catch { /* left for the next Overview load */ } } }
  finally { state.clearingRequests = false; }
  if (changed && state.pipe.loaded) loadPipeline(true, true);
  // A letter that was just copied into SPK 2026 changes what is still open.
  if (changed && list.some(item => item.sync) && $("page-overview").classList.contains("active")) loadDashboard(true, true);
}
const TASK_ICON = { invite: "file-check", spk: "file-signature", mcu: "heart-pulse", onboarding: "mail" }, TASK_KIND = { invite: "psikotest", spk: "offering", mcu: "mcu", onboarding: "interview" };
function renderActions(d) {
  const rows = d.actions || [];
  $("actionCount").textContent = `${rows.length} to do`; $("actionCount").hidden = !rows.length;
  $("actionList").innerHTML = rows.length ? rows.map((r, i) => `<button type="button" class="activity-item schedule-item" data-action-index="${i}"><span class="schedule-ico is-${TASK_KIND[r.kind]}">${svgIcon(TASK_ICON[r.kind], 14)}</span><div class="activity-copy"><b>${esc(r.title)}</b><small><em>${esc(r.name || "No candidate name")}</em>${esc([r.position, r.businessUnit].filter(x => x && x !== "—").map(x => " · " + x).join(""))}</small></div>${r.dateLabel ? `<div class="joiner-when"><span class="days-chip ${r.daysUntil !== null && r.daysUntil <= 3 ? "critical" : "neutral"}">${r.kind === "onboarding" ? `Joins ${soonLabel(r.daysUntil).toLowerCase()}` : r.kind === "mcu" ? "Requested" : r.daysUntil === null ? "Test" : r.daysUntil < 0 ? `${-r.daysUntil}d ago` : soonLabel(r.daysUntil)}</span><small>${esc(r.dateLabel)}</small></div>` : ""}${svgIcon("chevron-right", 14)}</button>`).join("") : `<div class="action-empty">${svgIcon("check-circle", 15)}Nothing needs your action</div>`;
}
const copyRow = (label, value) => `<div class="copy-row"><span>${esc(label)}</span><b>${esc(value || "—")}</b>${value ? `<button type="button" class="row-action" data-copy="${escAttr(value)}" data-tip="Copy" aria-label="Copy ${escAttr(label)}">${svgIcon("copy", 13)}</button>` : "<i></i>"}</div>`;
function openTask(task) {
  if (!task) return; if (task.kind === "onboarding") { openJoinerDetail(task.pipelineRow); return; }
  state.task = task; const kind = task.kind;
  $("taskIcon").className = "modal-icon schedule-ico is-" + TASK_KIND[kind]; $("taskIcon").innerHTML = svgIcon(TASK_ICON[kind], 17);
  $("taskTitle").textContent = task.title; $("taskSub").textContent = [task.name, task.position !== "—" ? task.position : "", task.rfpCode].filter(Boolean).join(" · ");
  $("taskError").hidden = true; $("taskPipeline").hidden = !task.pipelineRow || !!task.onBoard;
  if (kind === "spk") {
    const c = task.current || {}, locations = [...new Set([c.location, task.suggestedLocation, ...((state.requestOptions || {}).locations || [])].filter(Boolean))], location = c.location || task.suggestedLocation || "";
    $("taskSummary").innerHTML = `<div><small>Psikotest</small><b>${esc(task.dateLabel || "No test date")}</b></div>${task.testType ? `<span class="days-chip neutral">${esc(task.testType)}</span>` : ""}${task.service ? `<span class="days-chip neutral">${esc(task.service)}</span>` : ""}<span class="summary-spacer"></span>${task.pending ? "" : `<span class="days-chip neutral">SPK 2026 · Row ${task.spkRow}</span>`}`;
    if (task.pending) {
      // No row in SPK 2026 yet: the letter is recorded now and copied into the row once the invitation form has created it.
      $("taskBody").innerHTML = `<div class="field-grid"><div class="field"><span class="field-label">DATE</span>${dateFieldHtml("date", c.dateIso || isoOf(new Date()), "taskDate")}</div><div class="field"><label class="field-label" for="taskNoSpk">NO SPK <em>*</em></label><input id="taskNoSpk" name="noSpk" value="${escAttr(c.noSpk || "")}" maxlength="120" autocomplete="off" placeholder="Enter the letter number"></div><div class="field field-full"><label class="field-label" for="taskLink">SPK (link surat) <em>*</em></label><input id="taskLink" name="link" type="url" value="${escAttr(c.link || "")}" autocomplete="off" placeholder="https://"></div><div class="field field-full"><span class="field-label">LOKASI TEST</span><div class="readonly-value">${esc(task.location || "—")}</div></div></div>`;
      $("taskBody").querySelectorAll(".date-field").forEach(syncDateField);
      $("taskPrimary").textContent = "Save and continue to invitation";
      openModal("taskModal", $("taskNoSpk")); return;
    }
    $("taskBody").innerHTML = `<div class="field-grid"><div class="field"><span class="field-label">DATE</span>${dateFieldHtml("date", c.dateIso || isoOf(new Date()), "taskDate")}</div><div class="field"><label class="field-label" for="taskNoSpk">NO SPK <em>*</em></label><input id="taskNoSpk" name="noSpk" value="${escAttr(c.noSpk || "")}" maxlength="120" autocomplete="off" placeholder="Enter the letter number"></div><div class="field field-full"><span class="field-label">LOKASI TEST</span><select id="taskLocation" name="location" data-placeholder="Select vendor"><option value=""></option>${locations.map(o => `<option value="${escAttr(o)}" ${o === location ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div><div class="field field-full"><label class="field-label" for="taskLink">SPK (link surat) <em>*</em></label><input id="taskLink" name="link" type="url" value="${escAttr(c.link || "")}" autocomplete="off" placeholder="https://"></div></div><div class="section-label task-section">Row in SPK 2026</div><dl class="info-grid">${(task.details || []).map(item => `<div><dt>${esc(item.label === item.label.toUpperCase() ? headerLabel(item.label) : item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join("")}</dl>`;
    $("taskBody").querySelectorAll(".date-field").forEach(syncDateField); enhanceSelect($("taskLocation"));
    $("taskPrimary").textContent = "Save surat pengantar";
    openModal("taskModal", $("taskNoSpk")); return;
  }
  const mcu = kind === "mcu";
  $("taskSummary").innerHTML = mcu ? `<div><small>MCU requested</small><b>${esc(task.dateLabel || "—")}</b></div>` : `<div><small>Psikotest</small><b>${esc(task.dateLabel || "—")}</b></div>${task.testType ? `<span class="days-chip neutral">${esc(task.testType)}</span>` : ""}${task.service ? `<span class="days-chip neutral">${esc(task.service)}</span>` : ""}`;
  $("taskBody").innerHTML = `<div class="copy-list">${mcu ? copyRow("Nama Lengkap", task.name) + copyRow("Business Unit", task.businessUnit !== "—" ? task.businessUnit : "") : copyRow("Name", task.name) + copyRow("Job Title", task.position !== "—" ? task.position : "") + copyRow("Business Unit", task.businessUnit !== "—" ? task.businessUnit : "") + copyRow("Assessment Type", task.testType) + copyRow("Assesment", task.service) + copyRow("Psychological Test Location", task.location) + copyRow("Psychological Test Date", task.dateLabel)}</div>`;
  $("taskPrimary").innerHTML = svgIcon("external-link", 14) + (mcu ? "Open MCU form" : "Open invitation form");
  openModal("taskModal", $("taskPrimary"));
}
function closeTask() { closeModal("taskModal"); state.task = null; }
async function submitTask(e) {
  e.preventDefault(); const task = state.task, btn = $("taskPrimary"), err = $("taskError"); if (!task) return;
  if (task.kind !== "spk") {
    // Invitation and MCU are Google Forms; the sheet fills itself once the form is submitted.
    const url = formUrl(task.kind === "mcu" ? "mcu" : "psikotest", { name: task.name, position: task.position !== "—" ? task.position : "", businessUnit: task.businessUnit !== "—" ? task.businessUnit : "", type: task.testType, service: task.service, location: task.location, date: task.dateIso });
    if (url) window.open(url, "_blank", "noopener"); else toast("The form link is not configured.", "warning");
    return;
  }
  const values = { date: $("taskBody").querySelector('input[name="date"]').value, noSpk: $("taskNoSpk").value.trim(), location: $("taskLocation")?.value || "", link: $("taskLink").value.trim() };
  // Only what actually changed is sent, so cells that already hold the same value are not rewritten.
  const current = task.current || {}, changed = {}; if (values.date !== (current.dateIso || "")) changed.date = values.date; ["noSpk", "location", "link"].forEach(key => { if (values[key] !== (current[key] || "")) changed[key] = values[key]; });
  err.hidden = true;
  const problem = !values.noSpk ? ["Enter the NO SPK.", "taskNoSpk"] : !values.link ? ["Paste the link to the surat pengantar.", "taskLink"] : !/^https?:\/\/\S+$/i.test(values.link) ? ["The SPK link must start with http:// or https://", "taskLink"] : null;
  if (problem) { err.textContent = problem[0]; err.hidden = false; $(problem[1]).focus(); return; }
  if (task.pending) {
    if (!values.date) { err.textContent = "Pick the DATE."; err.hidden = false; return; }
    setBusy(btn, true, "Saving…");
    try {
      await api(PIPE_API, { method: "POST", body: JSON.stringify({ action: "letter", rowNumber: task.pipelineRow, code: task.rfpCode, date: values.date, noSpk: values.noSpk, link: values.link }) });
      const card = pipeCard(task.pipelineRow); if (card) { card.requests = { ...(card.requests || {}), letter: { dateIso: values.date, noSpk: values.noSpk, link: values.link } }; renderPipeline(); }
      toast(`Surat pengantar saved for ${task.name || task.rfpCode}.`, "success");
      if ($("page-overview").classList.contains("active")) loadDashboard(true, true); else if (state.pipe.loaded) loadPipeline(true, true);
      // Next step straight away: the invitation to the candidate.
      setBusy(btn, false, "Save and continue to invitation");
      openTask({ ...task, kind: "invite", pending: false, title: "Send psikotest invitation" });
    } catch (error) { err.textContent = error.message; err.hidden = false; setBusy(btn, false, "Save and continue to invitation"); }
    return;
  }
  setBusy(btn, true, "Saving…");
  try { await api("/.netlify/functions/spk", { method: "POST", body: JSON.stringify({ rowNumber: task.spkRow, name: task.name, values: changed }) }); const name = task.name; closeTask(); toast(`Surat pengantar saved for ${name}.`, "success"); loadDashboard(true, true); }
  catch (error) { err.textContent = error.message; err.hidden = false; }
  finally { setBusy(btn, false, "Save surat pengantar"); }
}

/* ---------- Talent Database: summary charts, column filters like a spreadsheet, pipeline marks ---------- */
const TALENT_PAGE = 50, BLANK = "(Blanks)", STATUS_COL = "_f";
const TALENT_STATUS = { pipeline: "In pipeline", processed: "Processed before", "": "Not processed" };
const TALENT_CHARTS = [["gender", "Gender"], ["education", "Education Background"], ["major", "Major"], ["gradYear", "Year of Graduate"], ["age", "Age"]];
const AGE_BANDS = [[0, 24, "Under 25"], [25, 29, "25–29"], [30, 34, "30–34"], [35, 39, "35–39"], [40, 44, "40–44"], [45, 200, "45 and over"]];
const talentValue = (row, col) => col === STATUS_COL ? TALENT_STATUS[row.f || ""] : (row.v[col] || BLANK);
function bindTalent() {
  $("talentSearch").addEventListener("input", () => { $("talentSearchClear").hidden = !$("talentSearch").value; state.talent.page = 1; renderTalent(); });
  $("talentSearchClear").addEventListener("click", () => { $("talentSearch").value = ""; $("talentSearchClear").hidden = true; state.talent.page = 1; renderTalent(); $("talentSearch").focus(); });
  $("talentHead").addEventListener("click", e => {
    const filter = e.target.closest("[data-filter]"), sort = e.target.closest(".th-sort"); const t = state.talent;
    if (filter) { openTalentFilter(filter, filter.dataset.filter === STATUS_COL ? STATUS_COL : Number(filter.dataset.filter)); return; }
    if (!sort) return; const col = sort.dataset.col === STATUS_COL ? STATUS_COL : Number(sort.dataset.col);
    if (t.sort.col !== col) t.sort = { col, dir: "asc" }; else if (t.sort.dir === "asc") t.sort = { col, dir: "desc" }; else t.sort = { col: null, dir: "asc" };
    t.page = 1; renderTalent();
  });
  $("talentPager").addEventListener("click", e => { const b = e.target.closest("[data-goto]"); if (!b || b.disabled) return; state.talent.page = Number(b.dataset.goto); renderTalent(true); $("talentScroll").scrollTop = 0; });
  $("talentFilters").addEventListener("click", e => { const b = e.target.closest("[data-clear]"); if (!b) return; if (b.dataset.clear === "all") state.talent.filters = {}; else delete state.talent.filters[b.dataset.clear]; state.talent.page = 1; renderTalent(); });
  // Clicking a bar filters the table to that value; clicking it again removes the filter.
  $("talentCharts").addEventListener("click", e => {
    const b = e.target.closest("[data-bar]"); if (!b) return; const t = state.talent, col = Number(b.dataset.col), values = JSON.parse(b.dataset.bar), current = t.filters[col];
    const same = current && current.size === values.length && values.every(v => current.has(v));
    if (same) delete t.filters[col]; else t.filters[col] = new Set(values); t.page = 1; renderTalent();
  });
}
async function loadTalent(forceRefresh = false) {
  const t = state.talent;
  if (!t.loaded) { $("talentCharts").innerHTML = Array.from({ length: 5 }, () => `<div class="chart-card"><span class="skeleton" style="width:46%"></span>${Array.from({ length: 4 }, (_, i) => `<span class="skeleton" style="width:${[82, 64, 40, 28][i]}%;height:10px;margin-top:12px"></span>`).join("")}</div>`).join(""); $("talentHead").innerHTML = ""; $("talentRows").innerHTML = skeletonRows(7, 10); }
  setRefreshing(true); $("talentError").hidden = true;
  try {
    const d = await api(`/.netlify/functions/talent${forceRefresh ? "?refresh=1" : ""}`);
    Object.assign(t, { headers: d.headers || [], rows: d.rows || [], fields: d.fields || {}, loaded: true, page: 1 });
    Object.keys(t.filters).forEach(key => { if (key !== STATUS_COL && Number(key) >= t.headers.length) delete t.filters[key]; });
    $("talentSubtitle").textContent = `${d.total.toLocaleString()} candidates from ${d.tab}.`;
    $("talentUpdated").textContent = `Updated ${new Date(d.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (d.warnings?.length) { $("talentError").hidden = false; $("talentError").textContent = d.warnings.join(" · "); }
    renderTalent();
  } catch (error) {
    if (!t.loaded) { $("talentCharts").innerHTML = ""; $("talentRows").innerHTML = `<tr><td class="empty-cell">${emptyBlock("alert-triangle", "Talent Database could not be loaded", "See the message below.")}</td></tr>`; }
    $("talentError").hidden = false; $("talentError").textContent = error.message;
  } finally { setRefreshing(false); }
}
function talentFiltered(exceptCol = null) {
  const t = state.talent, q = $("talentSearch").value.toLowerCase().trim(), active = Object.entries(t.filters).filter(([key]) => String(key) !== String(exceptCol));
  return t.rows.filter(row => (!q || row.v.some(v => v.toLowerCase().includes(q))) && active.every(([key, set]) => set.has(talentValue(row, key === STATUS_COL ? STATUS_COL : Number(key)))));
}
function renderTalent(pageOnly = false) {
  const t = state.talent; if (!t.loaded) return;
  let rows = talentFiltered();
  if (t.sort.col !== null) { const col = t.sort.col, sign = t.sort.dir === "asc" ? 1 : -1; rows = [...rows].sort((a, b) => { const x = talentValue(a, col), y = talentValue(b, col); if (x === BLANK && y !== BLANK) return 1; if (y === BLANK && x !== BLANK) return -1; return sign * x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }); }); }
  t.view = rows;
  const pages = Math.max(1, Math.ceil(rows.length / TALENT_PAGE)); t.page = Math.min(t.page, pages);
  const start = (t.page - 1) * TALENT_PAGE, slice = rows.slice(start, start + TALENT_PAGE), nameCol = t.fields.name;
  const th = (col, label) => { const sorted = t.sort.col === col, filtered = !!t.filters[col]; return `<th class="${sorted ? "is-sorted" : ""}${filtered ? " is-filtered" : ""}"><div class="th-filter"><button type="button" class="th-sort" data-col="${col}" title="Sort by ${escAttr(label)}"><span class="th-text">${esc(label)}</span><span class="sort-ico">${svgIcon(sorted ? (t.sort.dir === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down", 12)}</span></button><button type="button" class="th-funnel" data-filter="${col}" data-tip="Filter ${escAttr(label)}" aria-label="Filter ${escAttr(label)}" aria-haspopup="dialog">${svgIcon("filter", 12)}</button></div></th>`; };
  $("talentHead").innerHTML = `<tr>${th(STATUS_COL, "Pipeline")}${t.headers.map((h, i) => th(i, h)).join("")}</tr>`;
  $("talentRows").innerHTML = slice.length ? slice.map(row => `<tr>${`<td>${row.f ? `<span class="talent-flag is-${row.f}" data-tip="${escAttr([row.c, row.p, row.s].filter(Boolean).join(" · ") || TALENT_STATUS[row.f])}">${svgIcon(row.f === "pipeline" ? "workflow" : "check", 11)}${TALENT_STATUS[row.f]}</span>` : `<span class="talent-flag is-none">—</span>`}</td>`}${row.v.map((v, i) => `<td title="${escAttr(v)}"${i === nameCol ? ' class="is-name"' : ""}>${cellHtml(v)}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty-cell" colspan="${t.headers.length + 1}">${emptyBlock("search", "No candidates match", "Change or clear the filters.")}</td></tr>`;
  $("talentCount").textContent = `${rows.length.toLocaleString()} of ${t.rows.length.toLocaleString()} candidates`;
  $("talentPageInfo").innerHTML = rows.length ? `Showing <b>${(start + 1).toLocaleString()}–${(start + slice.length).toLocaleString()}</b> of <b>${rows.length.toLocaleString()}</b>` : "No candidates to show";
  const list = []; if (pages <= 7) for (let i = 1; i <= pages; i++) list.push(i); else { list.push(1); if (t.page > 4) list.push("…"); for (let i = Math.max(2, Math.min(t.page - 1, pages - 4)); i <= Math.min(pages - 1, Math.max(t.page + 1, 5)); i++) list.push(i); if (t.page < pages - 3) list.push("…"); list.push(pages); }
  $("talentPager").innerHTML = rows.length ? `<button type="button" class="pager-btn" data-goto="${t.page - 1}" ${t.page <= 1 ? "disabled" : ""} aria-label="Previous page">${svgIcon("chevron-left", 15)}</button>${list.map(p => p === "…" ? '<span class="pager-gap">…</span>' : `<button type="button" class="pager-btn ${p === t.page ? "is-current" : ""}" data-goto="${p}">${p}</button>`).join("")}<button type="button" class="pager-btn" data-goto="${t.page + 1}" ${t.page >= pages ? "disabled" : ""} aria-label="Next page">${svgIcon("chevron-right", 15)}</button>` : "";
  if (pageOnly) return;
  const names = Object.keys(t.filters);
  $("talentFilters").innerHTML = names.length ? names.map(key => { const label = key === STATUS_COL ? "Pipeline" : t.headers[Number(key)], set = t.filters[key]; return `<span class="filter-chip"><b>${esc(label)}</b>${esc(set.size === 1 ? [...set][0] : `${set.size} values`)}<button type="button" data-clear="${key}" aria-label="Remove filter on ${escAttr(label)}">${svgIcon("x", 11)}</button></span>`; }).join("") + (names.length > 1 ? `<button type="button" class="text-button" data-clear="all">Clear all</button>` : "") : "";
  renderTalentCharts(rows);
}
// One ranked list of bars per chart: a name, a bar on a shared baseline, the count and its share.
function renderTalentCharts(rows) {
  const t = state.talent, total = rows.length;
  $("talentCharts").innerHTML = TALENT_CHARTS.map(([field, title]) => {
    const col = t.fields[field]; if (col === undefined || col < 0) return `<div class="chart-card"><h3>${title}</h3><p class="chart-missing">Column not found in the sheet.</p></div>`;
    const counts = new Map(); rows.forEach(row => { const v = row.v[col] || BLANK; counts.set(v, (counts.get(v) || 0) + 1); });
    let bars;
    if (field === "age") {
      bars = AGE_BANDS.map(([lo, hi, label]) => ({ label, values: [], count: 0 })); const other = { label: "Not filled", values: [], count: 0 };
      counts.forEach((count, v) => { const n = parseFloat(v), band = Number.isFinite(n) ? bars[AGE_BANDS.findIndex(([lo, hi]) => n >= lo && n <= hi)] : null; const target = band || other; target.values.push(v); target.count += count; });
      bars = [...bars.filter(b => b.count), ...(other.count ? [other] : [])];
    } else {
      const entries = [...counts.entries()].map(([v, count]) => ({ label: v === BLANK ? "Not filled" : v, values: [v], count }));
      // Years keep their order; everything else is ranked largest first. Long tails fold into one last bar.
      if (field === "gradYear") { entries.sort((a, b) => (parseFloat(a.label) || 0) - (parseFloat(b.label) || 0)); const keep = entries.slice(-10), rest = entries.slice(0, -10); bars = rest.length ? [{ label: `${keep[0].label} and earlier`, values: [...rest.flatMap(x => x.values), ...keep[0].values], count: rest.reduce((n, x) => n + x.count, keep[0].count) }, ...keep.slice(1)] : keep; }
      else { entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)); const keep = entries.slice(0, 7), rest = entries.slice(7); bars = rest.length ? [...keep, { label: `${rest.length} others`, values: rest.flatMap(x => x.values), count: rest.reduce((n, x) => n + x.count, 0) }] : keep; }
    }
    const max = Math.max(1, ...bars.map(b => b.count)), active = t.filters[col];
    return `<div class="chart-card"><h3>${title}</h3><div class="bar-list">${bars.length ? bars.map(b => { const on = active && active.size === b.values.length && b.values.every(v => active.has(v)), share = total ? Math.round(b.count / total * 100) : 0; return `<button type="button" class="bar-row${on ? " is-on" : ""}${active && !on ? " is-dim" : ""}" data-col="${col}" data-bar="${escAttr(JSON.stringify(b.values))}" data-tip="${escAttr(`${b.label}: ${b.count.toLocaleString()} (${share}%)`)}" aria-pressed="${on}"><span class="bar-name">${esc(b.label)}</span><span class="bar-track"><i style="width:${Math.max(2, b.count / max * 100)}%"></i></span><span class="bar-value">${b.count.toLocaleString()}<small>${share}%</small></span></button>`; }).join("") : `<p class="chart-missing">No data for this filter.</p>`}</div></div>`;
  }).join("");
}
// Column filter in the style of a spreadsheet: sort, search, and a checklist of the values in that column.
function openTalentFilter(button, col) {
  if (Pop.current?.anchor === button) { Pop.close(); return; }
  const t = state.talent, counts = new Map(); talentFiltered(col).forEach(row => { const v = talentValue(row, col); counts.set(v, (counts.get(v) || 0) + 1); });
  const all = [...counts.keys()].sort((a, b) => a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  let chosen = new Set(t.filters[col] ? [...t.filters[col]].filter(v => counts.has(v)) : all);
  const panel = document.createElement("div"); panel.className = "select-pop filter-pop"; panel.tabIndex = -1;
  panel.innerHTML = `<div class="filter-sort"><button type="button" data-dir="asc">${svgIcon("arrow-up", 12)}Sort A → Z</button><button type="button" data-dir="desc">${svgIcon("arrow-down", 12)}Sort Z → A</button></div><div class="pop-search">${svgIcon("search", 14)}<input type="text" placeholder="Search values…" autocomplete="off" aria-label="Search values"></div><div class="filter-links"><button type="button" data-all>Select all</button><button type="button" data-none>Clear</button><span></span></div><div class="pop-list"></div><div class="filter-foot"><button type="button" class="secondary-button" data-cancel>Cancel</button><button type="button" class="primary-button" data-ok>OK</button></div>`;
  const list = panel.querySelector(".pop-list"), search = panel.querySelector("input"); let visible = all;
  const draw = () => { const q = search.value.toLowerCase().trim(); visible = q ? all.filter(v => v.toLowerCase().includes(q)) : all; panel.querySelector(".filter-links span").textContent = `${chosen.size} of ${all.length}`; list.innerHTML = visible.length ? visible.slice(0, 400).map(v => `<label class="filter-opt"><input type="checkbox" value="${escAttr(v)}" ${chosen.has(v) ? "checked" : ""}><span>${esc(v)}</span><em>${counts.get(v).toLocaleString()}</em></label>`).join("") + (visible.length > 400 ? `<div class="pop-empty">Search to narrow ${visible.length - 400} more values</div>` : "") : `<div class="pop-empty">No values match</div>`; };
  list.addEventListener("change", e => { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); panel.querySelector(".filter-links span").textContent = `${chosen.size} of ${all.length}`; });
  search.addEventListener("input", draw);
  panel.addEventListener("click", e => {
    const dir = e.target.closest("[data-dir]");
    if (dir) { t.sort = { col, dir: dir.dataset.dir }; t.page = 1; Pop.close(); renderTalent(); }
    else if (e.target.closest("[data-all]")) { visible.forEach(v => chosen.add(v)); draw(); }
    else if (e.target.closest("[data-none]")) { visible.forEach(v => chosen.delete(v)); draw(); }
    else if (e.target.closest("[data-cancel]")) Pop.close(true);
    else if (e.target.closest("[data-ok]")) { if (chosen.size === all.length || !chosen.size) delete t.filters[col]; else t.filters[col] = new Set(chosen); t.page = 1; Pop.close(); renderTalent(); }
  });
  panel.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === search) { e.preventDefault(); panel.querySelector("[data-ok]").click(); } });
  draw(); Pop.open(button, panel); search.focus({ preventScroll: true });
}

/* ---------- Local (client-side) table sort: Organization + Users ---------- */
function bindLocalSort(headId, name, render) {
  $(headId).addEventListener("click", e => {
    const b = e.target.closest(".th-sort"); if (!b) return; const s = state.tableSort[name];
    if (s.key !== b.dataset.key) { s.key = b.dataset.key; s.dir = "asc"; } else if (s.dir === "asc") s.dir = "desc"; else { s.key = null; s.dir = "desc"; }
    render();
  });
}
function applyLocalSort(items, name) {
  const s = state.tableSort[name], out = [...items], latest = (a, b) => (b.rowNumber || 0) - (a.rowNumber || 0);
  if (!s.key) return out.sort(latest); // default: latest added first
  const sign = s.dir === "asc" ? 1 : -1, isDate = /At$/.test(s.key);
  return out.sort((a, b) => {
    const x = a[s.key] || "", y = b[s.key] || "";
    if (!x && !y) return latest(a, b); if (!x) return 1; if (!y) return -1;
    const c = isDate ? new Date(x) - new Date(y) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    return c ? sign * c : latest(a, b);
  });
}
function paintLocalSort(headId, name) {
  const s = state.tableSort[name];
  $(headId).querySelectorAll(".th-sort").forEach(b => { const sorted = s.key === b.dataset.key, th = b.closest("th"); th.classList.toggle("is-sorted", sorted); th.setAttribute("aria-sort", sorted ? (s.dir === "asc" ? "ascending" : "descending") : "none"); b.querySelector(".sort-ico").innerHTML = svgIcon(sorted ? (s.dir === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down", 12); });
}

/* ---------- Modals ---------- */
const MODALS = {};
let lastFocus = null;
function bindModal(id, close, closeIds) {
  MODALS[id] = close; const backdrop = $(id);
  closeIds.forEach(x => $(x).addEventListener("click", close));
  // A form with unsaved input is never dismissed by a stray click outside.
  backdrop.addEventListener("mousedown", e => { if (e.target !== backdrop || Pop.current || Pop.justClosed) return; if (backdrop.dataset.dirty) { const modal = backdrop.querySelector(".modal"); modal.classList.remove("shake"); void modal.offsetWidth; modal.classList.add("shake"); } else close(); });
  backdrop.querySelector("form")?.addEventListener("input", () => { backdrop.dataset.dirty = "1"; });
  backdrop.querySelector("form")?.addEventListener("change", () => { backdrop.dataset.dirty = "1"; });
}
function focusables(root) { return [...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null); }
function focusFirstField(backdrop) { const target = backdrop.querySelector(".modal-body input:not([type=hidden]):not(:disabled),.modal-body .select-trigger:not(:disabled),.modal-body .date-trigger"); const modal = backdrop.querySelector(".modal"); modal.tabIndex = -1; (target || modal).focus({ preventScroll: true }); }
function openModal(id, focusTarget = null) {
  Pop.close(); const backdrop = $(id); if (backdrop.hidden) lastFocus = document.activeElement;
  backdrop.hidden = false; backdrop.dataset.dirty = ""; const body = backdrop.querySelector(".modal-body"); if (body) body.scrollTop = 0;
  requestAnimationFrame(() => { if (focusTarget && !focusTarget.disabled) focusTarget.focus({ preventScroll: true }); else focusFirstField(backdrop); });
}
function closeModal(id) { Pop.close(); const backdrop = $(id); if (backdrop.hidden) return; backdrop.hidden = true; backdrop.dataset.dirty = ""; if (!topModal() && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); }
function topModal() { const open = [...document.querySelectorAll(".modal-backdrop")].filter(el => !el.hidden); return open[open.length - 1] || null; }
let confirmResolve = null;
function confirmDialog({ title, message, confirmLabel = "Confirm", tone = "primary", icon = "alert-circle" }) {
  settleConfirm(false);
  $("confirmTitle").textContent = title; $("confirmMessage").textContent = message; $("confirmOk").textContent = confirmLabel;
  $("confirmOk").className = tone === "danger" ? "danger-button" : "primary-button"; $("confirmIcon").className = "confirm-icon " + tone; $("confirmIcon").innerHTML = svgIcon(icon, 20);
  openModal("confirmModal", tone === "danger" ? $("confirmCancel") : $("confirmOk"));
  return new Promise(resolve => { confirmResolve = resolve; });
}
function settleConfirm(result) { if (!confirmResolve) return; const resolve = confirmResolve; confirmResolve = null; closeModal("confirmModal"); resolve(result); }
function setBusy(button, busy, label) { button.disabled = busy; button.classList.toggle("is-busy", busy); if (busy) button.innerHTML = `<i class="spinner"></i>${esc(label)}`; else button.textContent = label; }

/* ---------- Popover (shared by dropdown + date picker) ---------- */
const Pop = {
  current: null,
  open(anchor, el, { matchWidth = false, onClose = null } = {}) {
    this.close(); el.classList.add("pop"); if (matchWidth) el.style.minWidth = anchor.getBoundingClientRect().width + "px";
    document.body.appendChild(el); this.current = { anchor, el, onClose };
    anchor.setAttribute("aria-expanded", "true"); anchor.classList.add("is-open"); this.place();
  },
  place() {
    const c = this.current; if (!c) return;
    const r = c.anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (!c.anchor.isConnected || r.bottom < 0 || r.top > vh) { this.close(); return; }
    const w = c.el.offsetWidth, h = c.el.offsetHeight, gap = 6;
    let top = r.bottom + gap, side = "bottom";
    if (top + h > vh - 8) { if (r.top - gap - h >= 8) { top = r.top - gap - h; side = "top"; } else top = Math.max(8, vh - 8 - h); }
    c.el.style.top = top + "px"; c.el.style.left = Math.max(8, Math.min(r.left, vw - 8 - w)) + "px"; c.el.dataset.side = side;
  },
  close(refocus = false) { const c = this.current; if (!c) return; this.current = null; this.justClosed = true; setTimeout(() => { this.justClosed = false; }, 0); c.el.remove(); c.anchor.setAttribute("aria-expanded", "false"); c.anchor.classList.remove("is-open"); c.onClose?.(); if (refocus && c.anchor.isConnected) c.anchor.focus({ preventScroll: true }); }
};
document.addEventListener("mousedown", e => { const c = Pop.current; if (c && !c.el.contains(e.target) && !c.anchor.contains(e.target)) Pop.close(); }, true);
window.addEventListener("resize", () => Pop.place());
document.addEventListener("scroll", e => { const c = Pop.current; if (c && !(e.target instanceof Node && c.el.contains(e.target))) Pop.place(); }, true);

/* ---------- Custom dropdown: enhances a native <select>, which stays the source of truth ---------- */
function enhanceSelect(select, { compact = false } = {}) {
  if (select._trigger) { syncSelect(select); return; }
  const button = document.createElement("button");
  button.type = "button"; button.className = "select-trigger" + (compact ? " compact" : ""); button.setAttribute("aria-haspopup", "listbox"); button.setAttribute("aria-expanded", "false");
  if (select.getAttribute("aria-label")) button.setAttribute("aria-label", select.getAttribute("aria-label"));
  button.innerHTML = `<span class="select-value"></span>${svgIcon("chevron-down", 14)}`;
  select.classList.add("native-hidden"); select.tabIndex = -1; select.after(button); select._trigger = button;
  button.addEventListener("click", () => openSelect(select));
  button.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!Pop.current) openSelect(select); } });
  syncSelect(select);
}
function syncSelect(select) {
  const button = select._trigger; if (!button) return;
  const option = select.selectedOptions[0], empty = !option || option.value === "";
  const value = button.querySelector(".select-value"); value.textContent = empty ? (select.dataset.placeholder || "Select") : option.textContent; value.classList.toggle("is-placeholder", empty);
  button.disabled = select.disabled;
}
function openSelect(select) {
  const button = select._trigger; if (Pop.current?.anchor === button) { Pop.close(); return; }
  const allowCustom = select.hasAttribute("data-allow-custom"); let custom = "";
  const titleCase = v => v.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-/(])([a-z\u00c0-\u024f])/g, (m, a, b) => a + b.toUpperCase());
  const options = [...select.options].filter(o => o.value !== ""), searchable = allowCustom || options.length > 7, clearable = !select.hasAttribute("data-required") && [...select.options].some(o => o.value === "") && select.value !== "";
  const panel = document.createElement("div"); panel.className = "select-pop"; panel.tabIndex = -1;
  panel.innerHTML = `${searchable ? `<div class="pop-search">${svgIcon("search", 14)}<input type="text" placeholder="${allowCustom ? "Search or type a new one…" : "Search…"}" autocomplete="off" aria-label="Search options"></div>` : ""}<div class="pop-list" role="listbox"></div>${clearable ? `<button type="button" class="pop-clear">${svgIcon("x", 12)}Clear selection</button>` : ""}`;
  const list = panel.querySelector(".pop-list"), search = panel.querySelector("input"); let active = Math.max(0, options.findIndex(o => o.value === select.value)), visible = options;
  const draw = () => {
    const q = (search?.value || "").toLowerCase().trim(); visible = q ? options.filter(o => o.textContent.toLowerCase().includes(q)) : options; active = Math.min(active, Math.max(visible.length - 1, 0));
    const typed = allowCustom ? titleCase(search?.value || "") : ""; custom = typed && !options.some(o => o.value.toLowerCase() === typed.toLowerCase()) ? typed : "";
    if (custom) visible = [...visible, { value: custom, textContent: `Use “${custom}”`, isCustom: true }];
    list.innerHTML = visible.length ? visible.map((o, i) => `<button type="button" tabindex="-1" role="option" class="pop-option${o.value === select.value ? " is-selected" : ""}${i === active ? " is-active" : ""}${o.isCustom ? " is-custom" : ""}" aria-selected="${o.value === select.value}" data-index="${i}"><span>${esc(o.textContent)}</span>${o.value === select.value ? svgIcon("check", 14) : ""}</button>`).join("") : `<div class="pop-empty">No options match</div>`;
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  };
  const choose = value => { if (value && ![...select.options].some(o => o.value === value)) select.add(new Option(value, value)); select.value = value; syncSelect(select); select.dispatchEvent(new Event("change", { bubbles: true })); Pop.close(true); };
  const move = step => { if (!visible.length) return; active = (active + step + visible.length) % visible.length; list.querySelectorAll(".pop-option").forEach((el, i) => el.classList.toggle("is-active", i === active)); list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" }); };
  list.addEventListener("click", e => { const b = e.target.closest(".pop-option"); if (b) choose(visible[Number(b.dataset.index)].value); });
  list.addEventListener("mousemove", e => { const b = e.target.closest(".pop-option"); if (b && Number(b.dataset.index) !== active) { active = Number(b.dataset.index); list.querySelectorAll(".pop-option").forEach((el, i) => el.classList.toggle("is-active", i === active)); } });
  panel.querySelector(".pop-clear")?.addEventListener("click", () => choose(""));
  search?.addEventListener("input", () => { active = 0; draw(); Pop.place(); });
  panel.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home" && !search) { e.preventDefault(); active = 0; move(0); }
    else if (e.key === "End" && !search) { e.preventDefault(); active = visible.length - 1; move(0); }
    else if (e.key === "Enter" || (e.key === " " && !search)) { e.preventDefault(); if (visible[active]) choose(visible[active].value); }
    else if (!search && e.key.length === 1 && /\S/.test(e.key)) { const i = visible.findIndex(o => o.textContent.toLowerCase().startsWith(e.key.toLowerCase())); if (i > -1) { active = i; move(0); } }
  });
  draw(); Pop.open(button, panel, { matchWidth: true }); (search || panel).focus({ preventScroll: true }); list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
}

/* ---------- Custom date picker: two months side by side ---------- */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = n => String(n).padStart(2, "0");
const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function isoOf(date) { return toISO(date.getFullYear(), date.getMonth(), date.getDate()); }
function fromISO(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function formatDate(value, long = false) { const d = fromISO(String(value)) || new Date(value); if (Number.isNaN(d.getTime())) return String(value); return long ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : `${pad2(d.getDate())} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }
function dateFieldHtml(name, iso, id) { return `<div class="date-field"><input type="hidden" name="${name}" value="${escAttr(iso)}"><button type="button" class="date-trigger" id="${id}" aria-haspopup="dialog" aria-expanded="false">${svgIcon("calendar", 15)}<span class="date-value"></span></button><button type="button" class="date-clear" aria-label="Clear date" title="Clear date">${svgIcon("x", 12)}</button></div>`; }
function syncDateField(field) { const value = field.querySelector("input").value, text = field.querySelector(".date-value"); text.textContent = value ? formatDate(value) : "Select date"; text.classList.toggle("is-placeholder", !value); field.classList.toggle("has-value", !!value); }
function setDateField(field, iso) { const input = field.querySelector("input"); if (input.value === iso) { syncDateField(field); return; } input.value = iso; syncDateField(field); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }
function openDatePicker(field) {
  const trigger = field.querySelector(".date-trigger"), input = field.querySelector("input"); if (Pop.current?.anchor === trigger) { Pop.close(); return; }
  const today = new Date(), todayIso = isoOf(today), start = fromISO(input.value) || today;
  let viewY = start.getFullYear(), viewM = start.getMonth(), focusIso = input.value || todayIso;
  const panel = document.createElement("div"); panel.className = "date-pop"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Choose date");
  // mode: "days" (two months), "months" (pick any month of a year), "years" (pick any year)
  let mode = "days", pickOffset = 0, pickYear = viewY;
  const monthHtml = (y, m, offset) => {
    const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(); let cells = "<i></i>".repeat(lead);
    for (let d = 1; d <= days; d++) { const iso = toISO(y, m, d), sunday = (lead + d - 1) % 7 === 6; cells += `<button type="button" tabindex="-1" class="dp-day${sunday ? " is-sunday" : ""}${iso === todayIso ? " is-today" : ""}${iso === input.value ? " is-selected" : ""}" data-date="${iso}" aria-label="${formatDate(iso, true)}"${iso === input.value ? ' aria-pressed="true"' : ""}>${d}</button>`; }
    return `<div class="dp-month"><button type="button" class="dp-title" data-pick="${offset}" title="Choose month and year">${MONTH_NAMES[m]} <span>${y}</span>${svgIcon("chevron-down", 12)}</button><div class="dp-week">${["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w, i) => `<span${i === 6 ? ' class="is-sunday"' : ""}>${w}</span>`).join("")}</div><div class="dp-grid">${cells}</div></div>`;
  };
  const draw = (refocus = false) => {
    if (mode !== "days") {
      const selected = fromISO(input.value), base = Math.floor(pickYear / 12) * 12;
      const cells = mode === "months"
        ? MONTH_NAMES.map((name, i) => `<button type="button" class="dp-cell${selected && selected.getFullYear() === pickYear && selected.getMonth() === i ? " is-selected" : ""}${today.getFullYear() === pickYear && today.getMonth() === i ? " is-today" : ""}" data-month="${i}">${name.slice(0, 3)}</button>`).join("")
        : Array.from({ length: 12 }, (_, i) => base + i).map(y => `<button type="button" class="dp-cell${selected && selected.getFullYear() === y ? " is-selected" : ""}${today.getFullYear() === y ? " is-today" : ""}" data-year="${y}">${y}</button>`).join("");
      panel.innerHTML = `<div class="dp-pick-head"><button type="button" class="dp-step" data-step="-1" aria-label="${mode === "months" ? "Previous year" : "Earlier years"}">${svgIcon("chevron-left", 15)}</button>${mode === "months" ? `<button type="button" class="dp-title" data-years title="Choose year">${pickYear}${svgIcon("chevron-down", 12)}</button>` : `<span class="dp-title is-static">${base} – ${base + 11}</span>`}<button type="button" class="dp-step" data-step="1" aria-label="${mode === "months" ? "Next year" : "Later years"}">${svgIcon("chevron-right", 15)}</button></div><div class="dp-pick-grid">${cells}</div><div class="dp-foot"><button type="button" class="dp-link" data-back>Back to calendar</button><span></span><span></span></div>`;
      if (refocus) (panel.querySelector(".dp-cell.is-selected") || panel.querySelector(".dp-cell")).focus({ preventScroll: true });
      return;
    }
    const next = new Date(viewY, viewM + 1, 1);
    panel.innerHTML = `<div class="dp-nav dp-nav-prev"><button type="button" data-shift="-12" title="Previous year" aria-label="Previous year">${svgIcon("chevrons-left", 15)}</button><button type="button" data-shift="-1" title="Previous month" aria-label="Previous month">${svgIcon("chevron-left", 15)}</button></div><div class="dp-nav dp-nav-next"><button type="button" data-shift="1" title="Next month" aria-label="Next month">${svgIcon("chevron-right", 15)}</button><button type="button" data-shift="12" title="Next year" aria-label="Next year">${svgIcon("chevrons-right", 15)}</button></div><div class="dp-months">${monthHtml(viewY, viewM, 0)}${monthHtml(next.getFullYear(), next.getMonth(), 1)}</div><div class="dp-foot"><button type="button" class="dp-link" data-today>Today</button><span class="dp-current">${input.value ? formatDate(input.value, true) : "No date selected"}</span>${input.value ? '<button type="button" class="dp-link muted" data-clear>Clear</button>' : "<span></span>"}</div>`;
    const target = panel.querySelector(`[data-date="${focusIso}"]`) || panel.querySelector(".dp-day"); if (target) { target.tabIndex = 0; if (refocus) target.focus({ preventScroll: true }); }
  };
  const shift = months => { const d = new Date(viewY, viewM + months, 1); viewY = d.getFullYear(); viewM = d.getMonth(); };
  panel.addEventListener("click", e => {
    const day = e.target.closest(".dp-day"), nav = e.target.closest("[data-shift]"), pick = e.target.closest("[data-pick]"), step = e.target.closest("[data-step]"), monthCell = e.target.closest("[data-month]"), yearCell = e.target.closest("[data-year]");
    if (pick) { pickOffset = Number(pick.dataset.pick); const shown = new Date(viewY, viewM + pickOffset, 1); pickYear = shown.getFullYear(); mode = "months"; draw(true); Pop.place(); }
    else if (e.target.closest("[data-years]")) { mode = "years"; draw(true); Pop.place(); }
    else if (step) { pickYear += Number(step.dataset.step) * (mode === "years" ? 12 : 1); const keep = step.dataset.step; draw(); Pop.place(); panel.querySelector(`[data-step="${keep}"]`)?.focus({ preventScroll: true }); }
    else if (yearCell) { pickYear = Number(yearCell.dataset.year); mode = "months"; draw(true); Pop.place(); }
    else if (monthCell) { const d = new Date(pickYear, Number(monthCell.dataset.month) - pickOffset, 1); viewY = d.getFullYear(); viewM = d.getMonth(); focusIso = toISO(pickYear, Number(monthCell.dataset.month), 1); mode = "days"; draw(true); Pop.place(); }
    else if (e.target.closest("[data-back]")) { mode = "days"; draw(true); Pop.place(); }
    else if (day) { setDateField(field, day.dataset.date); Pop.close(true); }
    else if (nav) { shift(Number(nav.dataset.shift)); const keep = nav.dataset.shift; draw(); Pop.place(); panel.querySelector(`[data-shift="${keep}"]`)?.focus({ preventScroll: true }); }
    else if (e.target.closest("[data-today]")) { setDateField(field, todayIso); Pop.close(true); }
    else if (e.target.closest("[data-clear]")) { setDateField(field, ""); Pop.close(true); }
  });
  panel.addEventListener("keydown", e => {
    const day = e.target.closest?.(".dp-day"); if (!day) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key], d = fromISO(day.dataset.date);
    if (step) d.setDate(d.getDate() + step); else if (e.key === "PageUp") d.setMonth(d.getMonth() - 1); else if (e.key === "PageDown") d.setMonth(d.getMonth() + 1); else return;
    e.preventDefault(); focusIso = isoOf(d);
    const diff = (d.getFullYear() - viewY) * 12 + d.getMonth() - viewM; if (diff < 0) shift(diff); else if (diff > 1) shift(diff - 1);
    draw(true);
  });
  draw(); Pop.open(trigger, panel); panel.style.minWidth = panel.offsetWidth + "px"; (panel.querySelector('.dp-day[tabindex="0"]') || panel).focus({ preventScroll: true });
}

/* ---------- Value parsing shared with the server-side sort ---------- */
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6, aug: 7, agu: 7, agt: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11 };
function toDateInput(value, order = "dmy") {
  const s = String(value ?? "").trim(); if (!s) return "";
  const year = y => (+y < 100 ? (+y < 70 ? 2000 + +y : 1900 + +y) : +y), valid = (y, m, d) => { const x = new Date(y, m, d); return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? toISO(y, m, d) : ""; };
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(?:[A-Za-z]+,?\s+)?(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/); if (m && MONTH_INDEX[m[2].slice(0, 3).toLowerCase()] !== undefined) return valid(year(m[3]), MONTH_INDEX[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/); if (m && MONTH_INDEX[m[1].slice(0, 3).toLowerCase()] !== undefined) return valid(year(m[3]), MONTH_INDEX[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const a = +m[1], b = +m[2], y = year(m[3]); const dayFirst = a > 12 ? true : b > 12 ? false : order !== "mdy"; return dayFirst ? valid(y, b - 1, a) : valid(y, a - 1, b); }
  const d = new Date(s); return Number.isNaN(d.getTime()) ? "" : isoOf(d);
}
function parseNumberLoose(value) {
  let s = String(value ?? "").trim(); if (!s || s.length > 30) return null;
  let negative = false; if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/^(rp\.?|idr|usd|\$|€|£)\s*/i, "").replace(/\s/g, ""); if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  if (dot > -1 && comma > -1) s = dot > comma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (comma > -1) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (dot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s); return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/* ---------- Toasts: top right, colour-coded, stackable ---------- */
const TOAST_ICON = { success: "check-circle", error: "alert-circle", warning: "alert-triangle", info: "info" };
function toast(message, type = "success", { duration } = {}) {
  const wrap = $("toasts"), el = document.createElement("div"), ms = duration || (type === "error" ? 6000 : type === "warning" ? 5000 : 3200);
  el.className = `toast toast-${TOAST_ICON[type] ? type : "info"}`; if (type === "error") el.setAttribute("role", "alert");
  el.innerHTML = `<span class="toast-ico">${svgIcon(TOAST_ICON[type] || "info", 17)}</span><div class="toast-text">${esc(message)}</div><button type="button" class="toast-close" aria-label="Dismiss">${svgIcon("x", 13)}</button><i class="toast-bar" style="animation-duration:${ms}ms"></i>`;
  let timer; const dismiss = () => { clearTimeout(timer); if (el.classList.contains("leaving")) return; el.classList.add("leaving"); setTimeout(() => el.remove(), 220); }, arm = () => { timer = setTimeout(dismiss, ms); };
  el.querySelector(".toast-close").addEventListener("click", dismiss);
  el.addEventListener("mouseenter", () => { clearTimeout(timer); el.classList.add("paused"); });
  el.addEventListener("mouseleave", () => { el.classList.remove("paused"); const bar = el.querySelector(".toast-bar"); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; bar.style.animationDuration = ms + "ms"; arm(); });
  wrap.prepend(el); while (wrap.children.length > 4) wrap.lastElementChild.remove(); arm();
}

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escAttr(v) { return esc(v).replace(/`/g, "&#96;"); }
function initial(v) { return String(v || "A").trim().charAt(0).toUpperCase(); }
function fmt(v) { return Number(v || 0).toLocaleString("en-US"); }
function pct(v) { return Number.isFinite(Number(v)) ? (Number(v) * 100).toFixed(1) + "%" : "—"; }
function iconFor(a) { a = String(a || "").toLowerCase(); return a.includes("add") || a.includes("create") ? "plus" : a.includes("delete") ? "trash" : a.includes("deactiv") ? "minus-circle" : a.includes("activ") ? "check-circle" : a.includes("update") ? "pencil" : "rotate-cw"; }
function iconForSource(id) { return ({ "rfp-master": "clipboard-list", "rfp-pipeline": "workflow", rfp: "clipboard-list", spk: "file-check", mcu: "heart-pulse", "mcu-induction": "activity", extension: "calendar-clock", "new-hire": "user-plus", tpc: "git-branch", offer: "file-signature", "employee-db": "database", movement: "git-compare-arrows", "pivot-dashboard": "chart-no-axes-combined", "rfp-deletion": "archive", "resource-deletion": "archive" })[id] || "file-spreadsheet"; }
const ICONS = {
  "layout-dashboard": `<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>`,
  "users": `<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
  "clipboard-list": `<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 9h6M9 13h6M9 17h3"/>`,
  "user-plus": `<path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>`,
  "database": `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>`,
  "git-branch": `<circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 5v14M18 8a6 6 0 0 1-6 6H8"/>`,
  "file-check": `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 15l2.5 2.5L16 12"/>`,
  "heart-pulse": `<path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/><path d="M3.5 12h4l2-3 3 6 2-3h5"/>`,
  "activity": `<path d="M22 12h-4l-3 8-6-16-3 8H2"/>`,
  "calendar-clock": `<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v3l2 1"/>`,
  "calendar": `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  "file-signature": `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><path d="M14 2v6h6M16 18l2 2 4-4M8 13h6M8 17h4"/>`,
  "git-compare-arrows": `<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>`,
  "chart-no-axes-combined": `<path d="M3 3v18h18M7 14l4-4 4 4 6-7"/><path d="M17 7h4v4"/>`,
  "archive": `<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>`,
  "alert-circle": `<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>`,
  "alert-triangle": `<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>`,
  "rotate-cw": `<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>`,
  "menu": `<path d="M4 6h16M4 12h16M4 18h16"/>`,
  "log-out": `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>`,
  "search": `<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>`,
  "plus": `<path d="M12 5v14M5 12h14"/>`,
  "x": `<path d="m18 6-12 12M6 6l12 12"/>`,
  "check": `<path d="M20 6 9 17l-5-5"/>`,
  "check-circle": `<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>`,
  "minus-circle": `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  "ban": `<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>`,
  "pencil": `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>`,
  "trash": `<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>`,
  "filter": `<path d="M3 5h18l-7 8v6l-4 2v-8z"/>`,
  "mail": `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>`,
  "copy": `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  "send": `<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>`,
  "more": `<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>`,
  "undo": `<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>`,
  "clock": `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  "user": `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  "lock": `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  "inbox": `<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`,
  "external-link": `<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,
  "arrow-up": `<path d="m5 12 7-7 7 7M12 19V5"/>`, "arrow-down": `<path d="M12 5v14M19 12l-7 7-7-7"/>`, "chevrons-up-down": `<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>`,
  "eye": `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`,
  "eye-off": `<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-4 4.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.3 3.5-.7"/>`,
  "sun": `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  "moon": `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>`,
  "panel-left": `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>`,
  "building-2": `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>`,
  "workflow": `<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect x="13" y="13" width="8" height="8" rx="2"/>`,
  "chevron-down": `<path d="m6 9 6 6 6-6"/>`, "chevron-left": `<path d="m15 18-6-6 6-6"/>`, "chevron-right": `<path d="m9 18 6-6-6-6"/>`,
  "chevrons-left": `<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>`, "chevrons-right": `<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>`,
  "arrow-right": `<path d="M5 12h14M13 6l6 6-6 6"/>`, "arrow-up-right": `<path d="M7 17 17 7M8 7h9v9"/>`,
  "info": `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,
  "file-spreadsheet": `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M12 11v8"/>`
};
ICONS["refresh-cw"] = ICONS["rotate-cw"];
function svgIcon(name, size = 18) { const paths = ICONS[name] || ICONS["file-spreadsheet"]; return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`; }
function renderStaticIcons() { document.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = svgIcon(el.dataset.icon, el.classList.contains("metric-icon") ? 17 : 18); }); }

/* ---- collapsible panels (optional sections, closed by default, remembered per browser) ---- */
function initCollapsibles() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem("emp-collapsed") || "{}") || {}; } catch {}
  const apply = (panel, collapsed) => { panel.classList.toggle("is-collapsed", collapsed); panel.querySelector(".panel-toggle").setAttribute("aria-expanded", String(!collapsed)); };
  document.querySelectorAll(".collapsible[data-collapse]").forEach(panel => {
    apply(panel, saved[panel.dataset.collapse] !== false);
    panel.querySelector(".panel-heading").addEventListener("click", () => { const collapsed = !panel.classList.contains("is-collapsed"); apply(panel, collapsed); saved[panel.dataset.collapse] = collapsed; try { localStorage.setItem("emp-collapsed", JSON.stringify(saved)); } catch {} });
  });
}
/* ---- tooltips for icon-only buttons: [data-tip], plus any row action that still carries a title ---- */
function initTooltips() {
  const tip = document.createElement("div"); tip.className = "tooltip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
  let timer = null, current = null;
  const hide = () => { clearTimeout(timer); current = null; tip.classList.remove("show"); };
  const show = el => {
    if (el.hasAttribute("title")) { el.dataset.tip = el.getAttribute("title"); el.removeAttribute("title"); }
    const text = el.dataset.tip; if (!text || current === el) return; hide(); current = el;
    timer = setTimeout(() => {
      if (current !== el || !el.isConnected) return; tip.textContent = text; tip.classList.add("show");
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, above = r.top - h - 8 >= 4;
      tip.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6)) + "px"; tip.style.top = (above ? r.top - h - 7 : r.bottom + 7) + "px";
    }, 280);
  };
  const target = e => e.target.closest?.("[data-tip],.row-action[title],.row-flag[title]");
  document.addEventListener("mouseover", e => { const el = target(e); if (el) show(el); else if (current) hide(); });
  document.addEventListener("focusin", e => { const el = target(e); if (el && el.matches(":focus-visible")) show(el); });
  ["focusout", "mousedown", "keydown"].forEach(type => document.addEventListener(type, hide, true));
  document.addEventListener("scroll", hide, true); window.addEventListener("blur", hide);
}

/* ---- theme, sidebar, motion helpers ---- */
function applyTheme(t, save) { document.documentElement.dataset.theme = t; if (save) { try { localStorage.setItem("emp-theme", t); } catch {} } document.querySelectorAll(".theme-toggle").forEach(b => b.setAttribute("aria-checked", String(t === "dark"))); document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0b110e" : "#f3f6f4"); }
function initTheme() { applyTheme(document.documentElement.dataset.theme || "light"); document.querySelectorAll(".theme-toggle").forEach(b => b.addEventListener("click", () => { const root = document.documentElement; root.classList.add("theme-anim"); applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true); setTimeout(() => root.classList.remove("theme-anim"), 350); })); }
function initSidebar() { try { if (localStorage.getItem("emp-side") === "1") document.body.classList.add("sidebar-collapsed"); } catch {} }
function toggleSidebar() { if (matchMedia("(max-width:720px)").matches) { $("sidebar").classList.toggle("open"); return; } const c = document.body.classList.toggle("sidebar-collapsed"); try { localStorage.setItem("emp-side", c ? "1" : "0"); } catch {} }
function filterNav() { const q = $("navFind").value.toLowerCase().trim(); document.querySelectorAll(".nav-scroll .nav-item").forEach(b => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); }); document.querySelectorAll(".nav-group").forEach(g => { g.hidden = (g.id === "masterDataNavGroup" && state.user?.role !== "Admin") || (!!q && ![...g.querySelectorAll(".nav-item")].some(b => !b.hidden)); g.classList.toggle("filtering", !!q); }); document.querySelectorAll(".nav-subgroup").forEach(g => { g.hidden = !!q && ![...g.querySelectorAll(".nav-item")].some(b => !b.hidden); }); }
function countUp(id) { const el = $(id); if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return; const raw = el.textContent, end = Number(raw.replace(/[^0-9.-]/g, "")); if (raw === "—" || !Number.isFinite(end)) return; const t0 = performance.now(); (function tick(t) { const p = Math.min(1, (t - t0) / 650), e = 1 - Math.pow(1 - p, 3); el.textContent = p < 1 ? fmt(Math.round(end * e)) : raw; if (p < 1) requestAnimationFrame(tick); })(t0); }
