/* White Lion SME OS — Affiliate Marketing module.
   Supabase is authoritative for programmes, referrals, commissions and payouts.
   This module does not create commissions from clicks or unverified sales. */
(() => {
  'use strict';
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const money = (n,c='SLE') => new Intl.NumberFormat('en',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(n||0));
  const cloud = () => window.whiteLionCloud;
  const client = () => cloud()?.getClient?.();
  const business = () => cloud()?.getActiveBusiness?.() || null;
  const session = () => cloud()?.getSession?.() || null;
  const role = () => String(business()?.role || '').toLowerCase();
  const canManage = () => ['owner','admin'].includes(role());
  const isDeveloper = () => !!(session()?.user && business()?.id === '50b69fb6-688c-4f28-8755-12cb5c34dc77');
  const host = () => document.getElementById('view');
  const toast = msg => typeof window.toast === 'function' ? window.toast(msg) : alert(msg);
  const baseUrl = () => location.origin + location.pathname;
  let current = 'dashboard';

  function addNav() {
    const nav = document.getElementById('businessToolsNav');
    if (!nav || document.getElementById('affiliateMarketingNav')) return;
    const button = document.createElement('button');
    button.id='affiliateMarketingNav'; button.type='button'; button.dataset.page='affiliates';
    button.innerHTML='<span class="ico">↗</span>Affiliate Marketing';
    nav.appendChild(button);
  }
  function setActive() {
    document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='affiliates'));
    const crumb=document.getElementById('crumb'); if(crumb)crumb.textContent='Affiliate Marketing';
    document.getElementById('sidebar')?.classList.remove('open');
  }
  function shell(title,sub,body,action='') {
    return '<div class="page-title"><div><h1>'+title+'</h1><p>'+sub+'</p></div>'+action+'</div>'+body;
  }
  function noCloud() {
    host().innerHTML=shell('Affiliate Marketing','Referral partnerships and commission management',
      '<div class="panel"><h3>Secure cloud connection required</h3><p class="panel-sub">Sign in and select a business workspace to manage affiliate marketing. Affiliate records are stored in Supabase, not only on this device.</p></div>');
  }
  async function query(programs, affiliates, referrals, commissions, payouts) {
    const sb=client(), b=business();
    const p=await sb.from('affiliate_programs').select('*').order('created_at',{ascending:false});
    if(p.error)throw p.error;
    const [a,r,c,w]=await Promise.all([
      sb.from('affiliate_profiles').select('*').order('created_at',{ascending:false}),
      sb.from('affiliate_referrals').select('*').order('first_clicked_at',{ascending:false}).limit(200),
      sb.from('affiliate_commissions').select('*').order('created_at',{ascending:false}).limit(200),
      sb.from('affiliate_payout_requests').select('*').order('requested_at',{ascending:false}).limit(100)
    ]);
    for(const x of [a,r,c,w])if(x.error)throw x.error;
    return {programs:p.data||[],affiliates:a.data||[],referrals:r.data||[],commissions:c.data||[],payouts:w.data||[],business:b};
  }
  function renderOverview(data) {
    const {programs,affiliates,referrals,commissions,payouts,business:b}=data;
    const active=programs.filter(x=>x.status==='active').length;
    const pending=commissions.filter(x=>['pending','approved','payable'].includes(x.status)).reduce((n,x)=>n+Number(x.commission_amount||0),0);
    const paid=commissions.filter(x=>x.status==='paid').reduce((n,x)=>n+Number(x.commission_amount||0),0);
    const isPlatform=isDeveloper();
    const my=affiliates.find(x=>x.user_id===session()?.user?.id);
    const action=canManage()||isPlatform?'<button class="btn primary" id="affiliateCreateProgram">＋ Create programme</button>':'';
    const stats='<div class="report-kpis"><div class="report-kpi"><span>Programmes</span><b>'+programs.length+'</b><small>'+active+' active</small></div><div class="report-kpi"><span>Affiliates</span><b>'+affiliates.length+'</b><small>'+affiliates.filter(x=>x.status==='active').length+' active</small></div><div class="report-kpi"><span>Tracked referrals</span><b>'+referrals.length+'</b><small>Clicks and tracked visits</small></div><div class="report-kpi"><span>Paid commissions</span><b>'+money(paid,b?.currency||'SLE')+'</b><small>Pending / approved: '+money(pending,b?.currency||'SLE')+'</small></div></div>';
    const programRows=programs.map(p=>'<tr><td><b>'+esc(p.program_name)+'</b><div class="panel-sub">'+(p.business_id?'Business programme':'White Lion platform programme')+'</div></td><td>'+(p.commission_type==='percentage'?Number(p.commission_value)+'%':money(p.commission_value,p.currency))+'</td><td>'+esc(p.currency)+'</td><td><span class="pill '+(p.status==='active'?'':'neutral')+'">'+esc(p.status)+'</span></td><td>'+p.cookie_days+' days</td><td><button class="btn small" data-aff-program-status="'+p.id+'" data-next="'+(p.status==='active'?'paused':'active')+'">'+(p.status==='active'?'Pause':'Activate')+'</button></td></tr>').join('');
    const affiliateRows=affiliates.map(a=>'<tr><td><b>'+esc(a.display_name)+'</b><div class="panel-sub">'+esc(a.contact_email)+'</div></td><td><code>'+esc(a.referral_code)+'</code></td><td><span class="pill '+(a.status==='active'?'':'warn')+'">'+esc(a.status)+'</span></td><td><button class="btn small" data-aff-copy="'+esc(a.referral_code)+'">Copy link</button></td><td>'+(canManage()||isDeveloper()?'<button class="btn small" data-affiliate-status="'+a.id+'" data-next="'+(a.status==='active'?'suspended':'active')+'">'+(a.status==='pending'?'Approve':a.status==='active'?'Suspend':'Activate')+'</button>':'—')+'</td></tr>').join('');
    host().innerHTML=shell('Affiliate Marketing','Grow through trusted referrals. Track performance and commissions for '+esc(b?.name||'your workspace')+'.',stats+
      '<div class="panel"><div class="panel-head"><div><h3>Affiliate programmes</h3><div class="panel-sub">Each programme belongs to one business or to the White Lion platform.</div></div>'+action+'</div>'+ (programRows?'<div class="table-wrap"><table><thead><tr><th>Programme</th><th>Commission</th><th>Currency</th><th>Status</th><th>Attribution</th><th>Manage</th></tr></thead><tbody>'+programRows+'</tbody></table></div>':'<div class="empty">No affiliate programme exists yet. Create one to get started.</div>')+'</div>'+
      '<div class="panel"><div class="panel-head"><div><h3>Affiliate partners</h3><div class="panel-sub">Approved partners can share their unique referral links.</div></div><button class="btn" id="affiliateJoin">＋ Join a programme</button></div>'+(affiliateRows?'<div class="table-wrap"><table><thead><tr><th>Affiliate</th><th>Referral code</th><th>Status</th><th>Referral</th><th>Manage</th></tr></thead><tbody>'+affiliateRows+'</tbody></table></div>':'<div class="empty">No affiliate partners registered yet.</div>')+'</div>'+
      '<div class="panel"><h3>Commission and payout controls</h3><p class="panel-sub">Commissions must be created only after a qualifying sale or subscription has been verified, and adjusted for refunds. Referral clicks alone never earn commissions. Payouts remain subject to administrator review.</p><div class="toolbar"><button class="btn" id="affiliateViewCommissions">View commissions ('+commissions.length+')</button><button class="btn" id="affiliateViewPayouts">View payout requests ('+payouts.length+')</button></div></div>') ;
    document.getElementById('affiliateCreateProgram')?.addEventListener('click',()=>createProgram());
    host().querySelectorAll('[data-aff-program-status]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await client().from('affiliate_programs').update({status:btn.dataset.next,updated_at:new Date().toISOString()}).eq('id',btn.dataset.affProgramStatus);if(error){toast('Programme update failed: '+error.message);return}toast('Programme status updated');await render()}));
    host().querySelectorAll('[data-affiliate-status]').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await client().from('affiliate_profiles').update({status:btn.dataset.next}).eq('id',btn.dataset.affiliateStatus);if(error){toast('Affiliate review failed: '+error.message);return}toast('Affiliate status updated');await render()}));
    document.getElementById('affiliateJoin')?.addEventListener('click',()=>joinProgram(programs));
    host().querySelectorAll('[data-aff-copy]').forEach(btn=>btn.addEventListener('click',()=>{const url=baseUrl()+'?ref='+encodeURIComponent(btn.dataset.affCopy);navigator.clipboard?.writeText(url).then(()=>toast('Referral link copied')).catch(()=>prompt('Copy your referral link',url))}));
    document.getElementById('affiliateViewCommissions')?.addEventListener('click',()=>renderLedger('commissions',commissions,b?.currency||'SLE'));
    document.getElementById('affiliateViewPayouts')?.addEventListener('click',()=>renderLedger('payouts',payouts,b?.currency||'SLE'));
    if(my?.status==='active') {
      const link=baseUrl()+'?ref='+encodeURIComponent(my.referral_code);
      const box=document.createElement('div');box.className='panel';box.innerHTML='<h3>Your referral link</h3><p class="panel-sub">Share this link. A click is tracked, but a commission is not earned until a qualifying transaction is verified.</p><input class="search" readonly style="width:100%" value="'+esc(link)+'"><button class="btn primary" id="myAffiliateCopy" style="margin-top:10px">Copy my referral link</button>';
      host().insertBefore(box,host().children[2]||null);
      document.getElementById('myAffiliateCopy').onclick=()=>navigator.clipboard?.writeText(link).then(()=>toast('Referral link copied')).catch(()=>prompt('Copy your referral link',link));
    }
  }
  async function createProgram() {
    const b=business(),sb=client();if(!sb)return;
    const name=prompt('Programme name');if(!name?.trim())return;const platformProgram=isDeveloper()&&confirm('Create this as a White Lion platform-wide programme? Choose Cancel for the selected business only.');
    const type=prompt('Commission type: percentage or fixed','percentage');if(!['percentage','fixed'].includes((type||'').toLowerCase())){toast('Choose percentage or fixed');return}
    const value=Number(prompt(type==='percentage'?'Commission percentage (e.g. 10)':'Fixed commission amount','10'));
    if(!Number.isFinite(value)||value<0||(type==='percentage'&&value>100)){toast('Enter a valid commission');return}
    const currency=(prompt('Commission currency (SLE, USD, etc.)',b?.currency||'SLE')||'SLE').toUpperCase();
    const {error}=await sb.from('affiliate_programs').insert({business_id:platformProgram?null:(b?.id||null),program_name:name.trim(),commission_type:type.toLowerCase(),commission_value:value,currency,status:'active',created_by:session()?.user?.id});
    if(error){toast('Could not create programme: '+error.message);return}
    toast('Affiliate programme created and activated. Applications follow its approval setting.');await render();
  }
  async function joinProgram(programs) {
    const sb=client(),user=session()?.user;if(!sb||!user)return;
    const active=programs.filter(p=>p.status==='active');
    if(!active.length){toast('There are no active programmes to join yet.');return}
    const pick=active.length===1?active[0]:active.find(p=>p.program_name.toLowerCase()===(prompt('Enter programme name: '+active.map(x=>x.program_name).join(', '))||'').trim().toLowerCase());
    if(!pick){toast('Programme not selected');return}
    const display=prompt('Your name as it should appear to programme managers',user.user_metadata?.full_name||user.email?.split('@')[0]||'Affiliate');if(!display?.trim())return;
    const code='WL'+crypto.randomUUID().replace(/-/g,'').slice(0,10).toUpperCase();
    const {error}=await sb.from('affiliate_profiles').insert({program_id:pick.id,business_id:pick.business_id,user_id:user.id,display_name:display.trim(),referral_code:code,contact_email:user.email,status:pick.approval_required?'pending':'active'});
    if(error){toast('Affiliate registration failed: '+error.message);return}
    toast(pick.approval_required?'Application submitted for approval.':'Affiliate account activated.');await render();
  }
  function renderLedger(kind,rows,currency) {
    const title=kind==='commissions'?'Commission ledger':'Payout requests';
    const content=kind==='commissions'?rows.map(x=>'<tr><td>'+esc(x.source_reference)+'</td><td>'+money(x.gross_amount,currency)+'</td><td><b>'+money(x.commission_amount,x.currency||currency)+'</b></td><td>'+esc(x.status)+'</td><td>'+new Date(x.created_at).toLocaleDateString()+'</td></tr>').join(''):rows.map(x=>'<tr><td>'+money(x.amount,x.currency||currency)+'</td><td>'+esc(x.payout_method)+'</td><td>'+esc(x.payout_destination)+'</td><td>'+esc(x.status)+'</td><td>'+new Date(x.requested_at).toLocaleDateString()+'</td></tr>').join('');
    host().innerHTML=shell(title,'Verified transaction and payment records', '<div class="panel"><button class="btn" id="affiliateBack">← Back to overview</button><div class="table-wrap" style="margin-top:15px"><table><thead><tr>'+(kind==='commissions'?'<th>Source</th><th>Sale value</th><th>Commission</th><th>Status</th><th>Date</th>':'<th>Amount</th><th>Method</th><th>Destination</th><th>Status</th><th>Date</th>')+'</tr></thead><tbody>'+(content||'<tr><td colspan="5" class="empty">No records yet.</td></tr>')+'</tbody></table></div></div>');
    document.getElementById('affiliateBack').onclick=render;
  }
  async function render() {
    if(!client()||!session()?.user){noCloud();return}
    try{const data=await query();renderOverview(data)}
    catch(error){host().innerHTML=shell('Affiliate Marketing','The affiliate database is not ready yet.','<div class="panel"><h3>Database migration required</h3><p class="panel-sub">'+esc(error?.message||String(error))+'</p><p>Apply <b>055_affiliate_marketing_foundation.sql</b> in the Supabase SQL Editor, then reopen this section. Existing business records are not changed by this module.</p></div>')}
  }
  function open() {current='affiliates';setActive();render()}
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-page="affiliates"]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();open();
  },true);
  window.addEventListener('whiteLionCloudReady',()=>{if(current==='affiliates')render()});
  window.addEventListener('whiteLionWorkspaceChanged',()=>{if(current==='affiliates')render()});
  window.WhiteLionAffiliateMarketing={render,open};
  addNav();
  // Record an incoming referral only after the cloud client is ready. The token
  // prevents repeated refreshes from counting as separate unique visitors.
  const params=new URLSearchParams(location.search),ref=params.get('ref');
  if(ref&&/^[A-Z0-9]{4,40}$/i.test(ref)){
    let token;try{token=localStorage.getItem('wl-aff-visitor:'+ref);if(!token){token=crypto.randomUUID();localStorage.setItem('wl-aff-visitor:'+ref,token)}}catch(_){token=crypto.randomUUID()}
    const track=()=>{const sb=client();if(!sb)return;sb.rpc('track_affiliate_referral',{p_referral_code:ref,p_visitor_token:token}).then(()=>{}).catch(()=>{})};
    window.addEventListener('whiteLionCloudReady',track,{once:true});setTimeout(track,2500);
  }
})();
