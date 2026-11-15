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
  $('services').innerHTML=services.length?services.map(s=>'<article class="service"><h3>'+esc(s.service_name)+'</h3><p>'+esc(s.description||'Professional device service request.')+'</p><div class="price">'+esc(money(s.price,store.currency_code))+'</div><button type="button" data-choose="'+esc(s.id)+'">Order this service</button></article>').join(''):'<p class="muted">No services are currently published. Please check again later.</p>';
  document.querySelectorAll('[data-choose]').forEach(b=>b.addEventListener('click',()=>{$('serviceId').value=b.dataset.choose;$('orderPanel').scrollIntoView({behavior:'smooth',block:'start'});$('serviceId').focus()}));
  if(!services.length)$('orderForm').hidden=true;
 }catch(e){$('services').innerHTML='';show('orderResult',e.message||String(e),'error');$('orderForm').hidden=true;$('trackForm').hidden=true}
}
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