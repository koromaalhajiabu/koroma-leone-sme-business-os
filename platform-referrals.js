/* Koroma Leone Tech — Refer & Earn.
   Any signed-in account gets a referral link. A reward is only ever recorded
   after a business that account referred becomes a verified PAYING subscriber
   (first subscription payment approved). Rewards are reviewed and paid
   manually by the platform developer, the same trusted pattern already used
   for Orange Money subscription payments. No automatic payouts happen here. */
(() => {
  'use strict';
  const repo = () => window.whiteLionCloud;
  const client = () => repo()?.getClient?.();
  const session = () => repo()?.getSession?.();
  const view = () => document.getElementById('view');
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const toast = msg => typeof window.toast === 'function' ? window.toast(msg) : alert(msg);
  let current='overview', cache={code:'',referrals:[],rewards:[],isDeveloper:false,allRewards:[]};

  function shell(title,sub,body){
    return '<div class="page-title"><div><h1>'+title+'</h1><p>'+sub+'</p></div></div>'+body;
  }
  function nav(){
    const host=document.getElementById('businessToolsNav');
    if(!host||document.getElementById('platformReferralsNav'))return;
    const b=document.createElement('button');b.id='platformReferralsNav';b.type='button';b.dataset.page='platform-referrals';
    b.innerHTML='<span class="ico">🎁</span>Refer &amp; Earn';
    b.addEventListener('click',e=>{e.preventDefault();window.setPage?.('platform-referrals')});
    host.appendChild(b);
  }
  function statusPill(s){const good=['converted','paid','approved'];const warn=['business_created','pending','rejected'];
    return '<span class="pill '+(good.includes(s)?'':(warn.includes(s)?' warn':' neutral'))+'">'+esc(String(s||'').replaceAll('_',' '))+'</span>'}
  function money(n,c){try{return new Intl.NumberFormat('en',{style:'currency',currency:c||'SLE'}).format(Number(n||0))}catch(_){return (c||'')+' '+Number(n||0).toFixed(2)}}
  function baseUrl(){return location.origin+location.pathname}

  async function isDeveloper(){
    const sb=client();if(!sb)return false;
    try{const {data,error}=await sb.rpc('get_my_platform_access_status');if(error)return false;return data?.can_access===true&&data?.is_developer===true}
    catch(_){return false}
  }

  async function load(){
    const sb=client(), user=session()?.user;
    if(!sb||!user)throw new Error('Sign in to get your referral link and see your rewards.');
    const [codeRes,refRes,rewardRes,dev]=await Promise.all([
      sb.rpc('get_or_create_my_referral_code'),
      sb.from('platform_referrals').select('*').eq('referrer_user_id',user.id).order('first_clicked_at',{ascending:false}),
      sb.from('platform_referral_rewards').select('*').eq('referrer_user_id',user.id).order('created_at',{ascending:false}),
      isDeveloper()
    ]);
    if(codeRes.error)throw codeRes.error;
    if(refRes.error)throw refRes.error;
    if(rewardRes.error)throw rewardRes.error;
    cache={code:codeRes.data,referrals:refRes.data||[],rewards:rewardRes.data||[],isDeveloper:dev,allRewards:[]};
    if(dev){
      const allRes=await sb.from('platform_referral_rewards').select('*,platform_referrals(referral_code)').order('created_at',{ascending:false}).limit(200);
      if(!allRes.error) cache.allRewards=allRes.data||[];
    }
    return cache;
  }

  function overview(){
    const link=baseUrl()+'?pref='+encodeURIComponent(cache.code||'');
    const clicked=cache.referrals.length;
    const businessesCreated=cache.referrals.filter(r=>['business_created','converted'].includes(r.status)).length;
    const converted=cache.referrals.filter(r=>r.status==='converted').length;
    const pendingEarn=cache.rewards.filter(r=>['pending','approved'].includes(r.status)).reduce((s,r)=>s+Number(r.amount),0);
    const paidEarn=cache.rewards.filter(r=>r.status==='paid').reduce((s,r)=>s+Number(r.amount),0);
    const currency=cache.rewards[0]?.currency_code||'SLE';
    const rows=cache.referrals.map(r=>'<tr><td>'+new Date(r.first_clicked_at).toLocaleDateString()+'</td><td>'+statusPill(r.status)+'</td><td>'+(r.business_created_at?new Date(r.business_created_at).toLocaleDateString():'—')+'</td><td>'+(r.converted_at?new Date(r.converted_at).toLocaleDateString():'—')+'</td></tr>').join('');
    const rewardRows=cache.rewards.map(r=>'<tr><td>'+new Date(r.created_at).toLocaleDateString()+'</td><td><b>'+money(r.amount,r.currency_code)+'</b></td><td>'+statusPill(r.status)+'</td><td>'+(r.notes?esc(r.notes):'—')+'</td></tr>').join('');
    view().innerHTML=shell('Refer & Earn','Invite other businesses to Koroma Leone Tech. Earn a reward once a business you referred becomes a paying subscriber.',
      '<div class="notice"><b>How it works:</b> share your link below. A click is not a reward — you only earn once the referred business creates a workspace and its subscription payment is verified by Koroma Leone Tech. Rewards are reviewed and paid manually; nothing is paid automatically.</div>'+
      '<div class="panel"><h3>Your referral link</h3><p class="panel-sub">Share this with other business owners. When they sign up, create a workspace, and later pay for a paid plan, you earn a reward.</p>'+
      '<div class="toolbar" style="margin-top:10px;flex-wrap:wrap"><input id="wlRefLink" readonly value="'+esc(link)+'" style="flex:1;min-width:220px;padding:10px 12px;border:1px solid #dde3ec;border-radius:9px;font-size:12px"><button class="btn primary small" id="wlRefCopy">Copy link</button></div>'+
      '<div class="panel-sub" style="margin-top:8px">Your referral code: <b>'+esc(cache.code||'—')+'</b></div></div>'+
      '<div class="stats"><div class="stat"><div class="stat-head">Link clicks tracked</div><strong>'+clicked+'</strong><small>People who opened your link</small></div>'+
      '<div class="stat"><div class="stat-head">Businesses created</div><strong>'+businessesCreated+'</strong><small>Signed up through your link</small></div>'+
      '<div class="stat"><div class="stat-head">Converted to paid</div><strong>'+converted+'</strong><small>Earned a reward</small></div>'+
      '<div class="stat"><div class="stat-head">Pending + approved</div><strong>'+money(pendingEarn,currency)+'</strong><small>Not yet paid</small></div>'+
      '<div class="stat"><div class="stat-head">Paid out</div><strong>'+money(paidEarn,currency)+'</strong><small>Confirmed paid</small></div></div>'+
      '<div class="grid-main"><div><div class="panel"><h3>Your referred signups</h3><div class="table-wrap"><table><thead><tr><th>Clicked</th><th>Status</th><th>Workspace created</th><th>Converted</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="empty">No clicks recorded yet. Share your link to get started.</td></tr>')+'</tbody></table></div></div></div>'+
      '<div><div class="panel"><h3>Your rewards</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Notes</th></tr></thead><tbody>'+(rewardRows||'<tr><td colspan="4" class="empty">No rewards earned yet.</td></tr>')+'</tbody></table></div></div></div></div>'+
      (cache.isDeveloper?'<div class="panel" style="margin-top:16px"><div class="panel-head"><div><h3>Developer: review all rewards</h3><div class="panel-sub">Mark a reward approved, paid, or rejected after you verify and pay it yourself</div></div></div>'+renderDeveloperTable()+'</div>':'')
    );
    const copyBtn=document.getElementById('wlRefCopy');
    if(copyBtn)copyBtn.onclick=()=>{const input=document.getElementById('wlRefLink');input.select();navigator.clipboard?.writeText(input.value).then(()=>toast('Referral link copied')).catch(()=>{})};
    if(cache.isDeveloper)bindDeveloperActions();
  }

  function renderDeveloperTable(){
    const rows=cache.allRewards.map(r=>'<tr><td>'+new Date(r.created_at).toLocaleDateString()+'</td><td>'+esc(r.platform_referrals?.referral_code||'—')+'</td><td><b>'+money(r.amount,r.currency_code)+'</b></td><td>'+statusPill(r.status)+'</td><td>'+(['pending','approved'].includes(r.status)?'<div class="toolbar"><button class="btn small" data-reward-approve="'+r.id+'">Approve</button><button class="btn small primary" data-reward-paid="'+r.id+'">Mark paid</button><button class="btn small alt" data-reward-reject="'+r.id+'">Reject</button></div>':'—')+'</td></tr>').join('');
    return '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Code</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" class="empty">No rewards recorded yet.</td></tr>')+'</tbody></table></div>';
  }
  async function reviewReward(id,status){
    const notes = status==='rejected' ? (prompt('Reason for rejecting this reward (optional)')||'') : '';
    const {error}=await client().rpc('review_platform_referral_reward',{p_reward_id:id,p_status:status,p_notes:notes});
    if(error){toast('Could not update reward: '+error.message);return}
    toast('Reward marked '+status+'.');await render();
  }
  function bindDeveloperActions(){
    view().querySelectorAll('[data-reward-approve]').forEach(b=>b.onclick=()=>reviewReward(b.getAttribute('data-reward-approve'),'approved'));
    view().querySelectorAll('[data-reward-paid]').forEach(b=>b.onclick=()=>reviewReward(b.getAttribute('data-reward-paid'),'paid'));
    view().querySelectorAll('[data-reward-reject]').forEach(b=>b.onclick=()=>reviewReward(b.getAttribute('data-reward-reject'),'rejected'));
  }

  async function render(){
    try{await load();overview()}
    catch(e){view().innerHTML=shell('Refer & Earn','Invite businesses and track your rewards.','<div class="panel"><h3>Connection or database setup required</h3><p class="panel-sub">'+esc(e.message||String(e))+'</p><p class="panel-sub">Apply migration <b>202611210100_platform_referral_program.sql</b> in Supabase, then reopen this section.</p></div>')}
  }
  function open(){current='overview';document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='platform-referrals'));const crumb=document.getElementById('crumb');if(crumb)crumb.textContent='Refer & Earn';document.getElementById('sidebar')?.classList.remove('open');render()}
  window.WhiteLionPlatformReferrals={open,render};
  nav();
  window.addEventListener('whiteLionCloudReady',()=>{if(document.getElementById('platformReferralsNav')?.classList.contains('active'))render()});

  // Record an incoming platform referral click (?pref=CODE), before the visitor
  // signs up. The token is reused on refresh so repeat visits aren't double counted.
  const params=new URLSearchParams(location.search), pref=params.get('pref');
  if(pref&&/^[A-Z0-9]{4,24}$/i.test(pref)){
    let token;
    try{
      token=localStorage.getItem('wl-pref-visitor:'+pref);
      if(!token){token=crypto.randomUUID();localStorage.setItem('wl-pref-visitor:'+pref,token)}
      localStorage.setItem('wl-pref-visitor-token',token);
      localStorage.setItem('wl-pref-code',pref.toUpperCase());
    }catch(_){token=crypto.randomUUID()}
    const track=()=>{const sb=client();if(!sb)return;sb.rpc('track_platform_referral',{p_referral_code:pref,p_visitor_token:token}).catch(()=>{})};
    window.addEventListener('whiteLionCloudReady',track,{once:true});setTimeout(track,2500);
  }

  // Once a business is created (see cloud.js createBusiness()), it calls this
  // helper to link that new workspace to whichever referral click brought the
  // signed-in owner here, if any.
  window.whiteLionLinkPlatformReferral = async function(businessId){
    try{
      const sb=client();if(!sb||!businessId)return;
      const token=localStorage.getItem('wl-pref-visitor-token');
      if(!token)return;
      await sb.rpc('link_platform_referral_to_business',{p_visitor_token:token,p_business_id:businessId});
    }catch(_){}
  };
})();
