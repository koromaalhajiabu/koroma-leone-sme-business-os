(() => {
'use strict';
const SUPABASE_URL='https://nclncqlgnxnijlumznnt.supabase.co';
const SUPABASE_KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sb=null,slug='',store=null,services=[];
const money=(v,c='SLE')=>{try{return new Intl.NumberFormat('en-SL',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(v||0))}catch(_){return c+' '+Number(v||0).toFixed(2)}};
const statusLabel={received:'Order received',quoted:'Quote prepared',awaiting_payment:'Awaiting payment',processing:'Processing',completed:'Completed',failed:'Could not be completed',cancelled:'Cancelled',refunded:'Refunded'};
function show(id,text,kind=''){const el=$(id);el.className='result '+kind;el.textContent=text}
async function start(){
 try{
  if(!window.supabase?.createClient)throw new Error('Secure order service did not load. Refresh this page.');
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  slug=new URLSearchParams(location.search).get('store')||'';
  if(!slug)throw new Error('The store link is incomplete. Contact White Lion for the correct link.');
  const {data,error}=await sb.rpc('get_public_device_services',{p_slug:slug});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.message||'This store is unavailable.');
  store=data.store;services=data.services||[];
  $('storeName').textContent='WELCOME TO WHITE LION DEVICE SERVICES!';
  $('storeDescription').textContent='Need professional phone IMEI checks and authorised phone unlocking and device services? We’ve got you covered!';
  $('storeContact').textContent=[store.contact_phone,store.contact_email].filter(Boolean).join(' · ');
  $('serviceId').innerHTML='<option value="">Choose a service</option>'+services.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.service_name)+' — '+esc(money(s.price,store.currency_code))+'</option>').join('');
  const groups=[
   {key:'phones',title:'Phone & smartphone services',note:'Services explicitly listed for mobile phones.'},
   {key:'tablets',title:'Tablet & iPad services',note:'Services explicitly listed for tablets and iPads.'},
   {key:'computers',title:'PC & computer services',note:'Services explicitly listed for laptops, desktops and computers.'},
   {key:'other',title:'IMEI, device checks & other services',note:'General checks and services that are not tied to one device type.'}
  ];
  const classify=s=>{
   const name=String(s.service_name||'').toLowerCase(),desc=String(s.description||'').toLowerCase(),group=String(s.provider_group||'').toLowerCase(),v=name+' '+desc+' '+group;
   if(/\b(ipad|tablet|tab s[0-9]|galaxy tab)\b/.test(v)) return 'tablets';
   if(/\b(pc|computer|desktop|laptop|macbook|imac|windows)\b/.test(v)) return 'computers';
   if(/\b(iphone|smartphone|mobile phone|android phone|samsung galaxy s|galaxy note|sim.?lock|network unlock|carrier unlock)\b/.test(v)) return 'phones';
   return 'other';
  };
  const cards=list=>list.map(s=>'<article class="service"><h3>'+esc(s.service_name)+'</h3><p>'+esc(s.description||'Professional device service request.')+'</p><div class="price">'+esc(money(s.price,store.currency_code))+'</div><button type="button" data-choose="'+esc(s.id)+'">Order this service</button></article>').join('');
  $('services').innerHTML=services.length?groups.map(g=>{
   const items=services.filter(s=>classify(s)===g.key).sort((a,b)=>String(a.service_name).localeCompare(String(b.service_name)));
   return '<section class="price-group"><h3>'+g.title+'</h3><p class="price-group-note">'+g.note+'</p>'+(items.length?'<div class="services">'+cards(items)+'</div>':'<div class="empty-category">No published '+g.title.toLowerCase()+' are currently listed. Contact White Lion to check availability.</div>')+'</section>';
  }).join(''):'<p class="muted">No services are currently published. Please check again later.</p>';
  $('services').querySelectorAll('[data-choose]').forEach(b=>b.addEventListener('click',()=>{$('serviceId').value=b.dataset.choose;$('orderPanel').scrollIntoView({behavior:'smooth',block:'start'});$('serviceId').focus()}));
  if(!services.length)$('orderForm').hidden=true;
 }catch(e){$('services').innerHTML='';show('orderResult',e.message||String(e),'error');$('orderForm').hidden=true;$('trackForm').hidden=true}
}
$('identifyImei').addEventListener('click',async()=>{
 const imeiInput=$('orderForm').querySelector('[name="imei"]'),imei=String(imeiInput.value||'').replace(/\s+/g,'');
 const btn=$('identifyImei'),out=$('imeiLookupResult');
 if(!/^\d{15}$/.test(imei)){out.className='result error';out.textContent='Enter a 15-digit IMEI first.';return}
 btn.disabled=true;btn.textContent='Identifying device…';
 try{
  const {data,error}=await sb.functions.invoke('device-services-provider',{body:{action:'identify_device',imei}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||'The IMEI lookup did not return a device model.');
  $('orderForm').querySelector('[name="device_brand"]').value=data.brand;
  $('orderForm').querySelector('[name="device_model"]').value=data.model;
  out.className='result success';
  out.textContent='Device identified: '+data.brand+' '+data.model+'. Provider: '+data.provider+'.'+(data.credits_used!=null?' Lookup cost: '+data.credits_used+' provider credits.':'')+' Now tap “Find model-specific unlock price” to retrieve the matching service price.';
 }catch(err){out.className='result error';out.textContent=err.message||String(err)}
 finally{btn.disabled=false;btn.textContent='Identify phone from IMEI'}
});
$('findUnlockPrice').addEventListener('click',async()=>{
 const form=$('orderForm'),fd=new FormData(form),btn=$('findUnlockPrice'),out=$('unlockQuoteResult');
 const brand=String(fd.get('device_brand')||'').trim(),model=String(fd.get('device_model')||'').trim();
 if(brand.length<2||model.length<2){out.className='result error';out.textContent='Enter the device brand and exact model first.';return}
 btn.disabled=true;btn.textContent='Finding matching price…';
 try{
  const {data,error}=await sb.rpc('get_public_device_unlock_quote',{
   p_slug:slug,p_device_brand:brand,p_device_model:model,
   p_network_name:String(fd.get('network_name')||'').trim()||null,
   p_country:String(fd.get('country')||'').trim()||null
  });
  if(error)throw error;
  if(!data?.ok||!Array.isArray(data.matches)||!data.matches.length){
   out.className='result error';out.textContent=data?.message||'No exact model-specific unlock price is available. Contact White Lion for a quote.';return;
  }
  const matches=data.matches;
  const matchedIds=new Set(matches.map(s=>String(s.id)));const ordered=[...services].sort((a,b)=>(matchedIds.has(String(b.id))?1:0)-(matchedIds.has(String(a.id))?1:0)||String(a.service_name).localeCompare(String(b.service_name)));$('serviceId').innerHTML='<option value="">Choose a service</option>'+ordered.map(s=>'<option value="'+esc(s.id)+'">'+(matchedIds.has(String(s.id))?'MATCH: ':'')+esc(s.service_name)+' — '+esc(money(s.price,store.currency_code))+'</option>').join('');
  if(matches.length===1)$('serviceId').value=matches[0].id;
  out.className='result success';
  out.textContent=data.message+' '+matches.map(s=>s.service_name+' — '+money(s.price,s.currency_code||store.currency_code)).join(' | ')+(matches.length>1?' Select the correct option in the Service field above.':' The matching service has been selected.');
  $('serviceId').scrollIntoView({behavior:'smooth',block:'center'});
 }catch(err){out.className='result error';out.textContent=err.message||String(err)}
 finally{btn.disabled=false;btn.textContent='Find model-specific unlock price'}
});
$('orderForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,fd=new FormData(form),btn=$('submitOrder');
 btn.disabled=true;btn.textContent='Submitting securely…';
 try{
  const {data,error}=await sb.rpc('submit_public_device_service_order',{
   p_slug:slug,p_customer_name:fd.get('customer_name'),p_customer_phone:fd.get('customer_phone'),
   p_customer_email:fd.get('customer_email')||null,p_device_brand:fd.get('device_brand'),
   p_device_model:fd.get('device_model'),p_imei:fd.get('imei'),p_network_name:fd.get('network_name'),
   p_country:fd.get('country')||null,p_service_id:fd.get('service_id'),p_customer_notes:fd.get('customer_notes')||null
  });
  if(error)throw error;if(!data?.ok)throw new Error(data?.message||'Order could not be submitted.');
  form.reset();
  show('orderResult','Order received successfully. Your reference is '+data.reference+'. Service: '+data.service_name+'. Price: '+money(data.service_price,data.currency_code)+'. We will contact you to confirm payment and processing. Keep your reference and phone number to track this order.','success');
 }catch(err){show('orderResult',err.message||String(err),'error')}
 finally{btn.disabled=false;btn.textContent='Submit order request'}
});
$('paymentClaimForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const track=new FormData($('trackForm')),claim=new FormData(e.currentTarget),btn=$('paymentClaimButton'),out=$('paymentClaimResult');
 const reference=String(track.get('reference')||'').trim(),phone=String(track.get('phone')||'').trim();
 if(!reference||!phone){out.className='result error';out.textContent='Enter your order reference and phone number in the Track an order section first.';return}
 btn.disabled=true;btn.textContent='Submitting…';
 try{
  const {data,error}=await sb.rpc('submit_public_device_payment_claim',{
   p_slug:slug,p_reference:reference,p_customer_phone:phone,p_payment_method:claim.get('payment_method'),
   p_payment_reference:claim.get('payment_reference'),p_amount:Number(claim.get('amount')),p_payer_name:claim.get('payer_name')||null
  });
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.message||'Payment details could not be submitted.');
  e.currentTarget.reset();
  out.className='result success';out.textContent=data.message||'Payment details submitted. Await confirmation from White Lion.';
 }catch(err){out.className='result error';out.textContent=err.message||String(err)}
 finally{btn.disabled=false;btn.textContent='Submit payment details'}
});
$('trackForm').addEventListener('submit',async e=>{
 e.preventDefault();const fd=new FormData(e.currentTarget),btn=$('trackButton');
 btn.disabled=true;btn.textContent='Checking…';
 try{
  const {data,error}=await sb.rpc('get_public_device_order_status',{p_reference:fd.get('reference'),p_customer_phone:fd.get('phone')});
  if(error)throw error;if(!data?.ok)throw new Error(data?.message||'Order not found.');
  const o=data.order;
  const text='Order '+o.reference+' · '+(statusLabel[o.status]||o.status)+' · '+o.device_brand+' '+o.device_model+' · '+o.service_name+' · Price '+money(o.service_price,o.currency_code)+' · Paid '+money(o.amount_paid,o.currency_code)+'. Last updated '+new Date(o.updated_at).toLocaleString()+'.';
  show('trackResult',text,'success');
 }catch(err){show('trackResult',err.message||String(err),'error')}
 finally{btn.disabled=false;btn.textContent='Check status'}
});
start();
})();