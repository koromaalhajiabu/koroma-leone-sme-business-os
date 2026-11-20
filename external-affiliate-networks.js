/* White Lion — External Affiliate Networks.
   External-network clicks are not commissions. Only conversions reported by a partner
   and entered with its external reference appear in the conversion ledger. */
(() => {
  'use strict';
  const repo = () => window.whiteLionCloud;
  const client = () => repo()?.getClient?.();
  const session = () => repo()?.getSession?.();
  const view = () => document.getElementById('view');
  const esc = window.esc || (v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const toast = msg => typeof window.toast === 'function' ? window.toast(msg) : alert(msg);
  const partners = [
    {key:'shopify',name:'Shopify Affiliate Program',category:'E-commerce platform',url:'https://www.shopify.com/affiliates',fit:'Promote online stores and commerce tools',payout:'Confirm the payout method offered to your country'},
    {key:'impact',name:'impact.com',category:'Affiliate network',url:'https://impact.com/affiliate-marketing/',fit:'Apply to multiple advertiser programmes from one network (hosts Bluehost, Canva, Semrush and many more)',payout:'Confirm publisher approval and available withdrawal methods'},
    {key:'hostinger',name:'Hostinger Affiliates',category:'Web hosting',url:'https://www.hostinger.com/affiliates',fit:'Promote hosting, domains and website services',payout:'Check minimum payout and country eligibility'},
    {key:'cj',name:'CJ Affiliate',category:'Affiliate network',url:'https://www.cj.com/publisher',fit:'Discover and apply to multiple advertiser programmes',payout:'Confirm Sierra Leone payout availability before promoting'},
    {key:'namecheap',name:'Namecheap Affiliates',category:'Web hosting & domains',url:'https://www.namecheap.com/affiliates/',fit:'Promote domains, hosting and website security add-ons',payout:'Confirm the payout method and minimum threshold for your account'},
    {key:'bluehost',name:'Bluehost Affiliate Program',category:'Web hosting',url:'https://www.bluehost.com/affiliates',fit:'Promote WordPress hosting plans (runs via the impact.com network)',payout:'Apply through impact.com; confirm your withdrawal method there'},
    {key:'aliexpress',name:'AliExpress Affiliate (Portals)',category:'Electronics & general marketplace',url:'https://portals.aliexpress.com/',fit:'Promote phones, electronics, gadgets and general goods from one huge catalogue',payout:'Confirm available payment methods for your country at sign-up'},
    {key:'clickbank',name:'ClickBank',category:'Software & digital products marketplace',url:'https://www.clickbank.com/affiliate-network/',fit:'Promote software, courses and digital tools across many niches',payout:'ClickBank pays via Payoneer in many countries; confirm Sierra Leone eligibility during setup'},
    {key:'canva',name:'Canva Affiliate Program',category:'Software (design tool)',url:'https://www.canva.com/affiliates/',fit:'Promote Canva Pro to anyone who creates graphics, flyers or social posts',payout:'Runs via impact.com; confirm your withdrawal method there'},
    {key:'semrush',name:'Semrush Affiliate Program',category:'Software (SEO / marketing tool)',url:'https://www.semrush.com/affiliates/',fit:'Promote an SEO and digital-marketing toolkit to businesses and marketers',payout:'Runs via impact.com; confirm your withdrawal method there'},
    {key:'shein',name:'SHEIN Affiliate Program',category:'Fashion & apparel',url:'https://affiliate.shein.com/',fit:'Promote fashion, clothing and accessories to a general audience',payout:'Confirm the payout method and minimum threshold for your country'}
  ];
  let current='overview', cache={accounts:[],clicks:[],conversions:[]};
  function shell(title,sub,body,actions=''){
    return '<div class="page-title"><div><h1>'+title+'</h1><p>'+sub+'</p></div>'+actions+'</div>'+body;
  }
  function nav(){
    const host=document.getElementById('businessToolsNav');
    if(!host||document.getElementById('externalAffiliateNetworksNav'))return;
    const b=document.createElement('button');b.id='externalAffiliateNetworksNav';b.type='button';b.dataset.page='external-affiliates';
    b.innerHTML='<span class="ico">🌐</span>External Affiliate Networks';
    b.addEventListener('click',e=>{e.preventDefault();window.setPage?.('external-affiliates')});
    host.appendChild(b);
  }
  async function load(){
    const sb=client(), user=session()?.user;
    if(!sb||!user)throw new Error('Sign in to manage your external affiliate network accounts.');
    const [a,c,v]=await Promise.all([
      sb.from('external_affiliate_accounts').select('*').order('created_at',{ascending:false}),
      sb.from('external_affiliate_clicks').select('*').order('clicked_at',{ascending:false}).limit(500),
      sb.from('external_affiliate_conversions').select('*').order('created_at',{ascending:false}).limit(500)
    ]);
    for(const r of [a,c,v])if(r.error)throw r.error;
    cache={accounts:a.data||[],clicks:c.data||[],conversions:v.data||[]};
    return cache;
  }
  const accountFor = key => cache.accounts.find(a=>a.partner_key===key);
  function statusPill(s){const good=['approved','paid'];const warn=['applied','pending'];return '<span class="pill '+(good.includes(s)?'':' '+(warn.includes(s)?'warn':'neutral'))+'">'+esc(String(s||'').replaceAll('_',' '))+'</span>'}
  function money(n,c='USD'){try{return new Intl.NumberFormat('en',{style:'currency',currency:c}).format(Number(n||0))}catch(_){return c+' '+Number(n||0).toFixed(2)}}
  function overview(){
    const totalClicks=cache.clicks.length;
    const pending=cache.conversions.filter(x=>['pending','approved'].includes(x.status)).reduce((s,x)=>s+Number(x.commission_amount),0);
    const paid=cache.conversions.filter(x=>x.status==='paid').reduce((s,x)=>s+Number(x.commission_amount),0);
    const cards=partners.map(p=>{
      const a=accountFor(p.key),clicks=cache.clicks.filter(x=>x.partner_account_id===a?.id).length;
      return '<div class="panel"><div class="panel-head"><div><h3>'+p.name+'</h3><div class="panel-sub">'+p.category+'</div></div>'+statusPill(a?.application_status||'not_applied')+'</div><p class="panel-sub">'+p.fit+'.</p><div class="toolbar" style="margin-top:12px"><button class="btn small" data-apply="'+p.key+'">'+(a?'Update application':'Track application')+'</button><a class="btn small" target="_blank" rel="noopener noreferrer" href="'+p.url+'">Official programme ↗</a></div><div class="panel-sub" style="margin-top:10px">Tracked clicks: <b>'+clicks+'</b></div>'+(a?.tracking_url?'<div class="panel-sub" style="margin-top:7px;word-break:break-all">Your tracking link: '+esc(a.tracking_url)+'</div><div class="toolbar" style="margin-top:8px"><button class="btn small" data-copy="'+p.key+'">Copy tracking link</button><button class="btn small" data-visit="'+p.key+'" '+(a.application_status!=='approved'?'disabled':'')+'>Visit partner link</button></div>':'')+'</div>';
    }).join('');
    view().innerHTML=shell('External Affiliate Networks','Manage your own publisher accounts, partner links and verified external commissions.','<div class="notice"><b>Important:</b> A click is not a commission. Earnings are recorded only after the affiliate network reports a qualifying conversion. Payouts are not enabled until you have a verified, supported payment method.</div><div class="stats"><div class="stat"><div class="stat-head">Tracked outbound clicks</div><strong>'+totalClicks+'</strong><small>Clicks recorded by White Lion</small></div><div class="stat"><div class="stat-head">Pending + approved commissions</div><strong>'+money(pending)+'</strong><small>Not necessarily withdrawable</small></div><div class="stat"><div class="stat-head">Paid commissions</div><strong>'+money(paid)+'</strong><small>Marked paid only after confirmation</small></div><div class="stat"><div class="stat-head">Payout readiness</div><strong>On hold</strong><small>No verified payout account connected</small></div></div><div class="grid-main"><div><div class="panel"><div class="panel-head"><div><h3>Partner programmes</h3><div class="panel-sub">Apply through official partner websites; record your approval and unique publisher link here.</div></div></div><div class="grid-main" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'+cards+'</div></div></div><div><div class="panel"><h3>Next steps</h3><ol class="panel-sub" style="line-height:2"><li>Apply through the official programme website.</li><li>Confirm it accepts publishers in Sierra Leone.</li><li>Check an available payout method before promoting.</li><li>Save your publisher ID and approved tracking link here.</li><li>Record a conversion only after it appears in the network report.</li></ol><p class="panel-sub">API credentials and secret tokens must never be entered into this browser-based app. A secure server connection can be added after a network approves your account and provides API access.</p><button class="btn" id="externalConversions">View verified conversions</button></div><div class="panel"><h3>Payment setup</h3><p class="panel-sub">Payout status: <b>Not configured</b>. Your commission records can be prepared, but White Lion will not submit payout requests or claim money has been received.</p></div></div></div>');
    view().querySelectorAll('[data-apply]').forEach(b=>b.onclick=()=>editAccount(b.dataset.apply));
    view().querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{const a=accountFor(b.dataset.copy);if(a?.tracking_url)navigator.clipboard?.writeText(a.tracking_url).then(()=>toast('Tracking link copied')).catch(()=>prompt('Copy tracking link',a.tracking_url))});
    view().querySelectorAll('[data-visit]').forEach(b=>b.onclick=()=>{const a=accountFor(b.dataset.visit);if(a)trackClick(a)});
    document.getElementById('externalConversions').onclick=conversions;
  }
  async function editAccount(key){
    const p=partners.find(x=>x.key===key);if(!p)return;
    const old=accountFor(key);
    const status=prompt('Application status: not_applied, applied, approved, rejected, paused',old?.application_status||'applied');
    if(!status)return;
    const normalized=status.trim().toLowerCase();
    if(!['not_applied','applied','approved','rejected','paused'].includes(normalized)){toast('Choose a listed application status.');return}
    const publisher=prompt('Publisher / affiliate account ID (leave blank if not assigned yet)',old?.publisher_id||'');
    if(publisher===null)return;
    const link=prompt('Your unique affiliate tracking URL (leave blank until approved)',old?.tracking_url||'');
    if(link===null)return;
    if(link.trim()&&!/^https:\/\//i.test(link.trim())){toast('Enter a secure HTTPS tracking link.');return}
    const label=old?.account_label||p.name;
    const payload={owner_user_id:session().user.id,partner_key:key,account_label:label,application_status:normalized,publisher_id:publisher.trim()||null,tracking_url:link.trim()||null,updated_at:new Date().toISOString()};
    const result=old?await client().from('external_affiliate_accounts').update(payload).eq('id',old.id):await client().from('external_affiliate_accounts').insert(payload);
    if(result.error){toast('Could not save partner account: '+result.error.message);return}
    toast('Partner account saved.');await render();
  }
  async function trackClick(account){
    if(account.application_status!=='approved'||!account.tracking_url){toast('Save an approved account and its unique tracking URL first.');return}
    window.open(account.tracking_url,'_blank','noopener');
    const {error}=await client().from('external_affiliate_clicks').insert({owner_user_id:session().user.id,partner_account_id:account.id,destination_url:account.tracking_url});
    if(error)toast('Partner opened, but the local click record failed: '+error.message);else{toast('Partner link opened and click recorded.');await render()}
  }
  function conversions(){
    current='conversions';
    const rows=cache.conversions.map(x=>{const a=cache.accounts.find(y=>y.id===x.partner_account_id);return '<tr><td>'+esc(a?.account_label||'Partner')+'</td><td>'+esc(x.external_conversion_id)+'</td><td>'+money(x.sale_amount,x.currency)+'</td><td><b>'+money(x.commission_amount,x.currency)+'</b></td><td>'+statusPill(x.status)+'</td><td>'+new Date(x.created_at).toLocaleDateString()+'</td></tr>'}).join('');
    view().innerHTML=shell('External conversion ledger','Only network-reported conversions belong here.','<div class="panel"><div class="toolbar"><button class="btn" id="externalBack">← Back</button><button class="btn primary" id="externalAddConversion">＋ Record network-reported conversion</button></div><div class="notice" style="margin-top:14px">Enter a conversion only when it is visible in your affiliate network dashboard or official report. This form is an audit record; it does not independently verify or trigger payment.</div><div class="table-wrap"><table><thead><tr><th>Partner</th><th>Network reference</th><th>Sale amount</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">No external conversions recorded yet.</td></tr>')+'</tbody></table></div></div>');
    document.getElementById('externalBack').onclick=overview;
    document.getElementById('externalAddConversion').onclick=addConversion;
  }
  async function addConversion(){
    if(!cache.accounts.length){toast('Add a partner account first.');return}
    const list=cache.accounts.map(a=>a.partner_key+': '+a.account_label).join('\n');
    const key=(prompt('Partner key to record ('+cache.accounts.map(a=>a.partner_key).join(', ')+')')||'').trim().toLowerCase();
    const a=accountFor(key);if(!a){toast('Partner account not found.');return}
    const ref=prompt('Exact conversion / transaction reference shown by the network');if(!ref?.trim())return;
    const sale=Number(prompt('Sale amount reported by network','0'));
    const commission=Number(prompt('Commission amount reported by network','0'));
    const currency=(prompt('Currency (e.g. USD)','USD')||'USD').trim().toUpperCase();
    const proof=prompt('Where did you verify it? (e.g. network dashboard report date)','');
    if(!Number.isFinite(sale)||sale<0||!Number.isFinite(commission)||commission<0||!/^[A-Z]{3}$/.test(currency)){toast('Enter valid amounts and a three-letter currency.');return}
    const {error}=await client().from('external_affiliate_conversions').insert({owner_user_id:session().user.id,partner_account_id:a.id,external_conversion_id:ref.trim(),sale_amount:sale,commission_amount:commission,currency,status:'pending',evidence_note:(proof||'').trim()||null,network_reported_at:new Date().toISOString()});
    if(error){toast('Could not record conversion: '+error.message);return}
    toast('Network-reported conversion recorded as pending.');await render();conversions();
  }
  async function render(){
    try{await load();if(current==='conversions')conversions();else overview()}
    catch(e){view().innerHTML=shell('External Affiliate Networks','Secure partner and commission workspace.','<div class="panel"><h3>Connection or database setup required</h3><p class="panel-sub">'+esc(e.message||String(e))+'</p><p class="panel-sub">Apply migration <b>059_external_affiliate_networks.sql</b> in Supabase, then reopen this section.</p></div>')}
  }
  function open(){current='overview';document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='external-affiliates'));const crumb=document.getElementById('crumb');if(crumb)crumb.textContent='External Affiliate Networks';document.getElementById('sidebar')?.classList.remove('open');render()}
  window.WhiteLionExternalAffiliateNetworks={open,render};
  nav();
  window.addEventListener('whiteLionCloudReady',()=>{if(document.getElementById('externalAffiliateNetworksNav')?.classList.contains('active'))render()});
})();
