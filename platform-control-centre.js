/* Koroma Leone Tech — single owner control centre and consolidated reports navigation. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){var m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};return m[c];});};
  var platformAccess=false, checking=false, authBound=false;
  function context(){var api=window.whiteLionCloud;return{api:api,client:api&&api.getClient?api.getClient():null,session:api&&api.getSession?api.getSession():null,business:api&&api.getActiveBusiness?api.getActiveBusiness():null};}
  async function checkAccess(){
    if(checking)return platformAccess;
    checking=true;
    try{
      var c=context();
      if(!c.client||!c.session||!c.session.user){platformAccess=false;return false;}
      var result=await c.client.rpc('get_platform_audit_log',{p_limit:1});
      platformAccess=!result.error&&Array.isArray(result.data);
      return platformAccess;
    }catch(e){platformAccess=false;return false;}
    finally{checking=false;var nav=$('platformControlCentreNav');if(nav)nav.hidden=!platformAccess;}
  }
  function route(page){if(typeof window.setPage==='function')window.setPage(page);}
  function card(icon,title,description,action,kind){
    return '<button class="quick" type="button" data-cc-'+(kind||'page')+'="'+action+'"><span>'+icon+'</span><b>'+title+'</b><small>'+description+'</small></button>';
  }
  function shell(title,subtitle,body){
    var view=$('view');if(!view)return;
    view.innerHTML='<div class="page-title"><div><div class="eyebrow">KOROMA LEONE TECH · CONTROL CENTRE</div><h1>'+title+'</h1><p>'+subtitle+'</p></div></div>'+body;
    var sidebar=$('sidebar');if(sidebar)sidebar.classList.remove('open');
  }
  async function open(){
    var allowed=await checkAccess();
    var view=$('view');
    if(!allowed){if(view)view.innerHTML='<div class="panel"><h2>Platform control access restricted</h2><p class="panel-sub">This centre is available only to an account verified by the Koroma Leone Tech platform access controls.</p></div>';return;}
    var c=context(),businesses=Array.isArray(window.__wlBusinesses)?window.__wlBusinesses:[];
    var active=c.business&&c.business.name?c.business.name:'No workspace selected';
    var user=c.session&&c.session.user?c.session.user.email||'Verified developer':'Verified developer';
    var html='<div class="stats">'+
      '<div class="stat"><div class="stat-head">Signed-in account</div><strong style="font-size:15px;overflow-wrap:anywhere">'+esc(user)+'</strong><small>Authenticated session</small></div>'+
      '<div class="stat"><div class="stat-head">Active workspace</div><strong style="font-size:15px;overflow-wrap:anywhere">'+esc(active)+'</strong><small>Current working context</small></div>'+
      '<div class="stat"><div class="stat-head">Workspaces available</div><strong>'+businesses.length+'</strong><small>Visible to this account; not a global database count</small></div>'+
      '<div class="stat"><div class="stat-head">Platform access</div><strong style="font-size:15px">Verified</strong><small>Confirmed by Supabase authorization</small></div></div>'+
      '<div class="notice">This is the single entry point for platform-wide administration. It reuses existing management panels rather than creating duplicate copies of business records, billing, settings or audit data.</div>'+
      '<div class="grid-main"><div>'+
      '<div class="panel"><div class="panel-head"><div><h3>Platform management</h3><div class="panel-sub">Open the existing protected management tools.</div></div></div><div class="quick-grid">'+
      card('🧭','Developer console','Approvals, workspace administration and platform maintenance','developer','action')+
      card('🏢','Workspace management','Switch workspace or create a new business','workspace','action')+
      card('👥','Users & access','Manage business staff and permissions','employees')+
      card('💳','Subscriptions & billing','Customer plans, invoices and payment status','billing')+
      card('🛡️','Security & audit','Read business and platform audit history','audit')+
      card('🔔','Notification centre','Subscription, payment, approval and system alerts','notifications','action')+
      card('⚙️','System settings','Open the current workspace settings','settings')+
      '</div></div>'+
      '<div class="panel"><div class="panel-head"><div><h3>Applications</h3><div class="panel-sub">One directory for existing platform applications.</div></div></div><div class="quick-grid">'+
      card('⚽','Football club & player platform','Clubs, player profiles and scouting','football-platform-hub')+
      card('🏫','School management','Admissions, staff, students and results','school')+
      card('🏥','Hospital management','Patients, appointments and clinical operations','hospital')+
      card('🎓','Campus management','Campus operations','campus')+
      card('🛍️','Online store','Storefront and delivery administration','storefront','action')+
      card('📱','Device services','Phone unlocking and device services','phoneunlocking')+
      card('📄','Business documents','Business records and documents','documents')+
      card('⚽','Sports & local league','Separate league competition application','league')+
      '</div></div></div><div>'+
      '<div class="panel"><div class="panel-head"><div><h3>Monitoring & operations</h3><div class="panel-sub">Use one route to the existing reporting and operational panels.</div></div></div><div class="quick-grid">'+
      card('📊','Reports & analytics','Reports, business intelligence and executive views','reports-centre')+
      card('▣','Business operations','Branch controls, reconciliation and operational reviews','operations','action')+
      card('⚡','Automation & assistant','Existing automation workflows','automation')+
      card('🤝','Affiliate marketing','Affiliate programme and external networks','affiliates')+
      card('🎁','Platform referrals','Referral programme management','platform-referrals')+
      '</div></div>'+
      '<div class="panel"><div class="panel-head"><div><h3>Quick workspace actions</h3></div></div><p class="panel-sub">Workspace-specific staff, settings, billing and daily operations remain scoped to the selected business. Customer workspaces retain their own subscription requirements; the owner exemption is not changed by this navigation update.</p><div class="toolbar"><button class="btn primary" type="button" data-cc-action="workspace">Switch workspace</button><button class="btn" type="button" data-cc-action="create">Create business</button><button class="btn" type="button" data-cc-action="developer">Open developer console</button></div><p class="panel-sub" style="margin-top:12px">Data access continues to be enforced by Supabase authentication, database policies and existing role checks. This page does not grant additional permissions.</p></div>'+
      '</div></div>';
    shell('Koroma Leone Tech Control Centre','Manage the platform from one location without duplicating application panels.',html);
    var buttons=view.querySelectorAll('[data-cc-page]');buttons.forEach(function(b){b.addEventListener('click',function(){route(b.getAttribute('data-cc-page'));});});
    view.querySelectorAll('[data-cc-action]').forEach(function(b){b.addEventListener('click',function(){var action=b.getAttribute('data-cc-action');if(action==='workspace'){var select=$('wlBusinessSelect');if(select){select.focus();select.scrollIntoView({behavior:'smooth',block:'center'});}else alert('The workspace selector is not available yet.');}else if(action==='create'){var create=$('wlCreateBusiness');if(create&&!create.hidden)create.click();else alert('Business creation is available only to the verified platform developer.');}else if(action==='developer'){var box=$('wlDeveloperBox');if(box){box.scrollIntoView({behavior:'smooth',block:'start'});}else alert('The protected Developer Console has not loaded yet. Refresh the page and try again.');}else if(action==='notifications'){var bell=$('klNotificationButton');if(bell)bell.click();else alert('The notification centre is still loading. Refresh the page and try again.');}else if(action==='operations'){var ops=$('operationsNavLink');if(ops&&!ops.hidden)ops.click();else alert('Business Operations is not available until a workspace is selected and its access checks finish.');}else if(action==='storefront'){var store=$('storefrontNavLink');if(store)store.click();else alert('Storefront administration is not available in this workspace.');}});});
  }
  function openReports(){
    var html='<div class="notice">These are existing reporting modules. This directory groups them in one place; it does not combine their underlying calculations or change their data scope.</div><div class="panel"><div class="panel-head"><div><h3>Reports & analytics</h3><div class="panel-sub">Choose the level of reporting you need.</div></div></div><div class="quick-grid">'+
      card('▤','Business reports','Sales, expenses, purchases and stock','reports')+
      card('✦','Business intelligence','Business performance and analysis','intelligence')+
      card('◈','Executive intelligence','Executive-level business insights','executive')+
      card('⚑','Executive action centre','Review and manage executive actions','actions')+
      card('◷','Financial planning','Financial planning and forecasts','finance')+
      card('◈','Supplier intelligence','Supplier performance and insights','supplierintel')+
      card('✦','Customer intelligence','Customer activity and insights','customerintel')+
      '</div></div>';
    shell('Reports & Analytics','A single directory for existing reporting tools.',html);
    var view=$('view');view.querySelectorAll('[data-cc-page]').forEach(function(b){b.addEventListener('click',function(){route(b.getAttribute('data-cc-page'));});});
  }
  async function refresh(){var c=context();if(c.client&&!authBound&&c.client.auth&&c.client.auth.onAuthStateChange){authBound=true;c.client.auth.onAuthStateChange(function(){setTimeout(checkAccess,0);});}await checkAccess();}
  window.KoromaPlatformControlCentre={open:open,openReports:openReports,refresh:refresh,checkAccess:checkAccess};
  window.addEventListener('whiteLionCloudReady',refresh);
  window.addEventListener('whiteLionWorkspaceChanged',refresh);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
  if(window.whiteLionCloud)refresh();
})();