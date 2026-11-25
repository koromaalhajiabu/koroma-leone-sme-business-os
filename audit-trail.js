/* Koroma Leone Tech — dedicated read-only business and platform audit trail. */
(() => {
  'use strict';
  const ALLOWED_BUSINESS_ROLES = ['owner','admin','manager','accountant'];
  const state = {client:null,session:null,business:null,businessRole:null,businessAccess:false,platformAccess:false,events:[],scope:'business',loading:false,lastLoadedAt:null,authSubscription:null};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const style = document.createElement('style');
  style.textContent = [
    "#wlAuditPage{display:grid;gap:14px}",
    "#wlAuditPage .audit-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:18px;border:1px solid #dce9e0;border-radius:16px;background:linear-gradient(135deg,#f8fcf8,#edf6ef)}",
    "#wlAuditPage .audit-kicker{font-size:9px;font-weight:900;letter-spacing:1.5px;color:#087a43}",
    "#wlAuditPage h1{margin:5px 0 3px;color:#173d29;font-size:25px;letter-spacing:-.5px}",
    "#wlAuditPage .audit-sub{margin:0;color:#6b7c71;font-size:11px;line-height:1.65;max-width:650px}",
    "#wlAuditPage .audit-status{padding:7px 10px;border:1px solid #d5e5da;border-radius:999px;background:#fff;color:#486253;font-size:10px;font-weight:850}",
    "#wlAuditPage .audit-toolbar{display:grid;grid-template-columns:minmax(180px,1fr) minmax(130px,180px) auto auto;gap:8px;align-items:center}",
    "#wlAuditPage input,#wlAuditPage select{width:100%;min-width:0;min-height:41px;box-sizing:border-box;border:1px solid #dce7df;border-radius:10px;background:#fff;color:#203b2b;padding:9px 11px;font:inherit;font-size:11px}",
    "#wlAuditPage button{min-height:40px;border:1px solid #087a43;border-radius:10px;background:linear-gradient(135deg,#087a43,#075b35);color:#fff;padding:8px 13px;font-size:10px;font-weight:850}",
    "#wlAuditPage button.secondary{background:#fff;border-color:#d6e4da;color:#25533a}",
    "#wlAuditPage button:disabled{opacity:.55;cursor:wait}",
    "#wlAuditPage .audit-meta{color:#708078;font-size:10px;line-height:1.6}",
    "#wlAuditPage .audit-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    "#wlAuditPage .audit-kpi{padding:12px;border:1px solid #e0eae3;border-radius:12px;background:#fff}",
    "#wlAuditPage .audit-kpi small{display:block;color:#718078;font-size:9px;font-weight:750}",
    "#wlAuditPage .audit-kpi strong{display:block;margin-top:4px;color:#173d29;font-size:21px}",
    "#wlAuditPage .audit-events{display:grid;gap:8px}",
    "#wlAuditPage .audit-event{padding:13px;border:1px solid #e2ebe5;border-radius:12px;background:#fff;box-shadow:0 5px 18px rgba(7,91,53,.035)}",
    "#wlAuditPage .audit-event-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}",
    "#wlAuditPage .audit-event-title{color:#203b2b;font-size:12px;font-weight:900;text-transform:capitalize}",
    "#wlAuditPage .audit-event-time{color:#76847b;font-size:9px}",
    "#wlAuditPage .audit-event-meta{margin-top:5px;color:#6e7c73;font-size:10px;line-height:1.6;overflow-wrap:anywhere}",
    "#wlAuditPage details{margin-top:7px}",
    "#wlAuditPage details summary{cursor:pointer;color:#286244;font-size:10px;font-weight:800}",
    "#wlAuditPage pre{margin:7px 0 0;padding:10px;border-radius:9px;background:#f5f8f5;color:#394b40;font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere}",
    "#wlAuditPage .audit-empty{padding:25px 15px;border:1px dashed #d5e3d9;border-radius:12px;text-align:center;color:#718078;font-size:11px;line-height:1.7;background:#fbfdfb}",
    "#wlAuditPage .audit-note{padding:11px 13px;border:1px solid #e9e0cd;border-radius:11px;background:#fcf8ef;color:#76623a;font-size:9px;line-height:1.65}",
    "@media(max-width:680px){#wlAuditPage .audit-toolbar{grid-template-columns:1fr 1fr}#wlAuditPage .audit-toolbar input{grid-column:1/-1}#wlAuditPage .audit-toolbar button{width:100%}}",
    "@media(max-width:420px){#wlAuditPage .audit-kpis{grid-template-columns:1fr 1fr}#wlAuditPage .audit-kpis .audit-kpi:last-child{grid-column:1/-1}}"
  ].join('\n');
  document.head.appendChild(style);

  function cloudContext() {
    const api = window.whiteLionCloud;
    return {api,client:api?.getClient?.() || null,session:api?.getSession?.() || null,business:api?.getActiveBusiness?.() || null};
  }
  function setNavVisible(visible) {
    const button = $('auditTrailNavLink');
    if (button) button.hidden = !visible;
  }
  async function checkAccess() {
    const ctx = cloudContext();
    state.client = ctx.client;
    state.session = ctx.session;
    state.business = ctx.business;
    state.businessRole = null;
    state.businessAccess = false;
    state.platformAccess = false;
    if (!state.client || !state.session?.user?.id) {
      setNavVisible(false);
      return false;
    }
    if (state.business?.id) {
      const memberResult = await state.client.from('business_members')
        .select('role,is_active').eq('business_id',state.business.id)
        .eq('user_id',state.session.user.id).eq('is_active',true).maybeSingle();
      if (!memberResult.error && memberResult.data) {
        state.businessRole = String(memberResult.data.role || '').toLowerCase();
        state.businessAccess = ALLOWED_BUSINESS_ROLES.includes(state.businessRole);
      }
    }
    // The RPC verifies platform-developer access on the server; no client flag grants it.
    try {
      const result = await state.client.rpc('get_platform_audit_log',{p_limit:1});
      state.platformAccess = !result.error && Array.isArray(result.data);
    } catch (_) { state.platformAccess = false; }
    setNavVisible(state.businessAccess || state.platformAccess);
    return state.businessAccess || state.platformAccess;
  }
  function dateLabel(value) {
    if (!value) return 'Time unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
  }
  function currentPeriod() { return $('wlAuditPeriod')?.value || '30'; }
  function selectedScope() {
    if (state.businessAccess && state.platformAccess) return $('wlAuditScope')?.value || 'business';
    return state.platformAccess ? 'platform' : 'business';
  }
  function withinPeriod(row,timeKey) {
    const period = currentPeriod();
    if (period === 'all') return true;
    const time = new Date(row[timeKey] || '').getTime();
    return Number.isFinite(time) && time >= Date.now() - Number(period) * 86400000;
  }
  async function fetchBusinessEvents() {
    if (!state.businessAccess || !state.business?.id) throw new Error('Business audit access is restricted to owners, administrators, managers and accountants.');
    const result = await state.client.from('audit_logs')
      .select('id,actor_user_id,action,entity_table,entity_id,details,created_at')
      .eq('business_id',state.business.id).order('created_at',{ascending:false}).limit(250);
    if (result.error) throw new Error(result.error.message);
    return (result.data || []).filter(row=>withinPeriod(row,'created_at'))
      .map(row=>({...row,occurred_at:row.created_at,scope:'business'}));
  }
  async function fetchPlatformEvents() {
    if (!state.platformAccess) throw new Error('Platform audit access is restricted to the authorised platform developer.');
    const result = await state.client.rpc('get_platform_audit_log',{p_limit:250});
    if (result.error) throw new Error(result.error.message);
    const rows = Array.isArray(result.data) ? result.data : (typeof result.data === 'string' ? JSON.parse(result.data) : []);
    return rows.filter(row=>withinPeriod(row,'occurred_at')).map(row=>({...row,scope:'platform'}));
  }
  function visibleEvents() {
    const query = ($('wlAuditSearch')?.value || '').trim().toLowerCase();
    return state.events.filter(row => {
      const searchable = [row.action,row.entity_table,row.entity_id,row.actor_user_id,row.actor_email,row.business_name,JSON.stringify(row.details || {})].join(' ').toLowerCase();
      return !query || searchable.includes(query);
    });
  }
  function renderEvents() {
    const host = $('wlAuditEvents'), summary = $('wlAuditSummary');
    const rows = visibleEvents();
    if (!host || !summary) return;
    summary.textContent = rows.length + ' event(s) visible · Read-only · ' + (selectedScope() === 'platform' ? 'Platform-wide history' : (state.business?.name || 'Selected business'));
    host.innerHTML = rows.length ? rows.map(row => {
      const action = String(row.action || 'Activity').replace(/_/g,' ');
      const actor = row.actor_email || (row.actor_user_id ? String(row.actor_user_id) : 'System');
      const businessName = row.business_name ? ' · ' + row.business_name : '';
      const entity = [row.entity_table || 'Record',row.entity_id || '—'].join(' · ');
      const details = JSON.stringify(row.details || {},null,2);
      return '<article class="audit-event"><div class="audit-event-head"><strong class="audit-event-title">' + esc(action) + '</strong><time class="audit-event-time">' + esc(dateLabel(row.occurred_at)) + '</time></div>' +
        '<div class="audit-event-meta">' + esc(entity) + esc(businessName) + '</div><div class="audit-event-meta">Actor: ' + esc(actor) + '</div>' +
        '<details><summary>Event details</summary><pre>' + esc(details) + '</pre></details></article>';
    }).join('') : '<div class="audit-empty">No audit events match this filter.</div>';
    if ($('wlAuditCount')) $('wlAuditCount').textContent = String(rows.length);
    if ($('wlAuditActorCount')) $('wlAuditActorCount').textContent = String(new Set(rows.map(r=>r.actor_user_id || r.actor_email || 'system')).size);
    if ($('wlAuditEntityCount')) $('wlAuditEntityCount').textContent = String(new Set(rows.map(r=>r.entity_table || 'other')).size);
  }
  function setStatus(message,isError=false) {
    const status = $('wlAuditStatus');
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? '#9c3838' : '';
  }
  async function loadEvents() {
    if (state.loading) return;
    state.loading = true;
    const refresh = $('wlAuditRefresh');
    if (refresh) refresh.disabled = true;
    setStatus('Loading protected audit records…');
    try {
      state.scope = selectedScope();
      state.events = state.scope === 'platform' ? await fetchPlatformEvents() : await fetchBusinessEvents();
      state.lastLoadedAt = new Date().toISOString();
      setStatus('Loaded ' + state.events.length + ' event(s) · ' + dateLabel(state.lastLoadedAt));
      renderEvents();
    } catch (error) {
      state.events = [];
      renderEvents();
      setStatus('Audit trail unavailable: ' + (error?.message || String(error)),true);
    } finally {
      state.loading = false;
      if (refresh) refresh.disabled = false;
    }
  }
  function csvCell(value) {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }
  function exportEvents() {
    const rows = visibleEvents();
    if (!rows.length) return setStatus('There are no visible audit events to export.',true);
    const keys = ['occurred_at','action','business_name','entity_table','entity_id','actor_email','actor_user_id','details'];
    const csv = [keys.join(','),...rows.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\r\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = 'koroma-leone-audit-trail-' + new Date().toISOString().slice(0,10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    setStatus(rows.length + ' visible event(s) exported.');
  }
  function bindPanel() {
    $('wlAuditSearch')?.addEventListener('input',renderEvents);
    $('wlAuditPeriod')?.addEventListener('change',loadEvents);
    $('wlAuditRefresh')?.addEventListener('click',loadEvents);
    $('wlAuditExport')?.addEventListener('click',exportEvents);
    $('wlAuditScope')?.addEventListener('change',loadEvents);
  }
  function renderShell() {
    const view = $('view');
    if (!view) return;
    const scopeOptions = state.businessAccess && state.platformAccess
      ? '<select id="wlAuditScope" aria-label="Audit scope"><option value="business">Business activity</option><option value="platform">Platform activity</option></select>'
      : '';
    view.innerHTML = '<section id="wlAuditPage">' +
      '<header class="audit-hero"><div><div class="audit-kicker">KOROMA LEONE · GOVERNANCE</div><h1>Audit Trail</h1><p class="audit-sub">Review recorded workspace and platform activity. This panel is read-only; it cannot alter, approve or delete audit events.</p></div><span class="audit-status" id="wlAuditStatus">Preparing audit access…</span></header>' +
      '<section class="panel"><div class="audit-toolbar">' + scopeOptions +
      '<input id="wlAuditSearch" type="search" placeholder="Search actions, records or users" aria-label="Search audit trail">' +
      '<select id="wlAuditPeriod" aria-label="Audit period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option><option value="all">All available history</option></select>' +
      '<button id="wlAuditRefresh" type="button">Refresh audit trail</button><button id="wlAuditExport" class="secondary" type="button">Export visible events (CSV)</button></div>' +
      '<div class="audit-kpis" style="margin-top:13px"><div class="audit-kpi"><small>Events visible</small><strong id="wlAuditCount">0</strong></div><div class="audit-kpi"><small>Actors</small><strong id="wlAuditActorCount">0</strong></div><div class="audit-kpi"><small>Record types</small><strong id="wlAuditEntityCount">0</strong></div></div>' +
      '<p class="audit-meta" id="wlAuditSummary" style="margin:12px 0 8px">No records loaded.</p><div class="audit-events" id="wlAuditEvents"><div class="audit-empty">Loading audit history…</div></div></section>' +
      '<div class="audit-note">Read-only audit history. Business events are limited to the selected workspace and authorised management roles. Platform-wide events are available only when Supabase confirms platform-developer access. This panel displays events recorded by the audit system; it does not backfill actions that were never logged.</div>' +
      '</section>';
    if (state.businessAccess && state.platformAccess && $('wlAuditScope')) $('wlAuditScope').value = state.scope || 'business';
    bindPanel();
  }
  async function render() {
    await checkAccess();
    if (!state.businessAccess && !state.platformAccess) {
      const view = $('view');
      if (view) view.innerHTML = '<div class="panel"><h2>Audit Trail access is restricted</h2><p class="panel-sub">Sign in and select a business workspace. Business audit records are available to owners, administrators, managers and accountants. Platform-wide history requires verified developer access.</p></div>';
      return;
    }
    renderShell();
    await loadEvents();
  }
  async function refreshNavigationAccess() {
    try { await checkAccess(); }
    catch (_) { setNavVisible(false); }
  }

  window.KoromaAuditTrail = {render,refresh:loadEvents,checkAccess};
  window.addEventListener('whiteLionCloudReady',() => {
    const ctx = cloudContext();
    if (ctx.client && !state.authSubscription && ctx.client.auth?.onAuthStateChange) {
      const listener = ctx.client.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
          state.events = [];
          state.businessAccess = false;
          state.platformAccess = false;
          setNavVisible(false);
        } else {
          setTimeout(refreshNavigationAccess,0);
        }
      });
      state.authSubscription = listener?.data?.subscription || true;
    }
    refreshNavigationAccess();
  });
  window.addEventListener('whiteLionWorkspaceChanged',refreshNavigationAccess);
  if (window.whiteLionCloud) {
    const ctx = cloudContext();
    if (ctx.client && ctx.session) refreshNavigationAccess();
  }
})();
