/* Koroma Leone Tech — Football Club Onboarding & Verification Centre */
(function(){
'use strict';
if(window.KoromaFootballClubOnboardingAdmin)return;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cloud=()=>window.whiteLionCloud;
const client=()=>cloud()?.getClient?.();
const panelId='klwClubApplicationAdmin';
let mounted=false,loading=false,refreshTimer=null;
function panelMarkup(){
 return '<section class="dev-role-manager" id="'+panelId+'" style="margin-top:18px;border:1px solid #d6ad57;background:#17283f;padding:15px;border-radius:12px">'+
  '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h3 style="color:#f0d28b;margin:0 0 4px">Football Club Applications</h3><div class="dev-role-help">Review club authority evidence and approve applications. Approval provisions the club workspace and verified website draft in one transaction.</div></div><button type="button" id="klwClubAppsRefresh">Refresh applications</button></div>'+
  '<div id="klwClubAppsStatus" class="dev-role-help" style="margin:10px 0">Loading applications…</div>'+
  '<div id="klwClubAppsList"></div>'+
  '</section>';
}
function mount(){
 const box=document.getElementById('wlDeveloperBox');
 if(!box||mounted)return;
 const anchor=document.getElementById('wlDevApprovalRefresh')?.closest('section');
 if(anchor)anchor.insertAdjacentHTML('afterend',panelMarkup());else box.insertAdjacentHTML('beforeend',panelMarkup());
 mounted=true;
 document.getElementById('klwClubAppsRefresh').addEventListener('click',load);
 load();
 if(!refreshTimer)refreshTimer=setInterval(()=>{if(!document.hidden)load();},60000);
}
function status(message,isError){
 const el=document.getElementById('klwClubAppsStatus');if(!el)return;
 el.textContent=message||'';el.style.color=isError?'#ffaaa6':'#cbd8e8';
}
function applicationCard(a){
 const evidence=a.evidence_path?'<button type="button" data-evidence="'+esc(a.id)+'">Open private evidence</button>':'<span class="dev-role-help">No document uploaded</span>';
 const email=a.applicant_email||'';
 return '<article style="border:1px solid #4a5a72;border-radius:11px;padding:13px;margin:10px 0;background:#1c304c">'+
  '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff;font-size:13px">'+esc(a.official_club_name)+'</strong><div class="dev-meta">'+esc(a.club_type)+' · '+esc(a.city||'')+(a.district?', '+esc(a.district):'')+' · '+esc(a.country)+'</div></div><span style="font-size:10px;font-weight:850;color:#f0d28b">'+esc(a.status.replaceAll('_',' ').toUpperCase())+'</span></div>'+
  '<div class="dev-meta" style="margin:8px 0">Applicant: '+esc(a.manager_full_name)+' · '+esc(a.manager_role)+' · '+esc(email)+' · '+(a.email_confirmed?'EMAIL CONFIRMED':'EMAIL NOT CONFIRMED')+'</div>'+
  '<div class="dev-meta">Club contact: '+esc(a.contact_email)+' · '+esc(a.contact_phone)+'</div>'+
  '<div class="dev-meta">Competition: '+esc(a.competition_name||'Not supplied')+' · Home ground: '+esc(a.home_ground||'Not supplied')+'</div>'+
  '<div class="dev-meta">Registration: '+esc(a.club_registration_body||'Not supplied')+' · '+esc(a.club_registration_number||'No number supplied')+'</div>'+
  '<div class="dev-meta">Proposed site slug: '+esc(a.proposed_website_slug)+'</div>'+
  '<div style="padding:9px;border-radius:8px;background:#14243b;color:#dbe5f1;font-size:10px;margin-top:8px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(a.authority_statement)+'</div>'+
  (a.evidence_reference?'<div class="dev-meta" style="margin-top:6px">Evidence reference: '+esc(a.evidence_reference)+'</div>':'')+
  (a.additional_notes?'<div class="dev-meta" style="margin-top:5px">Additional notes: '+esc(a.additional_notes)+'</div>':'')+
  '<div class="dev-meta" style="margin:7px 0">Submitted: '+esc(new Date(a.created_at).toLocaleString())+'</div>'+
  '<div class="dev-actions" style="margin-top:9px">'+evidence+
    (a.official_website_url?'<a href="'+esc(a.official_website_url)+'" target="_blank" rel="noopener" style="color:#f0d28b;font-size:10px;padding:7px">Existing website ↗</a>':'')+
    (a.email_confirmed?'<button type="button" data-review="approve" data-id="'+esc(a.id)+'" data-slug="'+esc(a.proposed_website_slug)+'">Approve &amp; provision</button>':'<button type="button" disabled title="Email confirmation is required">Awaiting email confirmation</button>')+
    '<button type="button" data-review="request_information" data-id="'+esc(a.id)+'">Request information</button>'+
    '<button type="button" data-review="reject" data-id="'+esc(a.id)+'" style="background:#c45e65;color:#fff">Reject</button>'+
  '</div>'+
  '</article>';
}
async function load(){
 const c=client(),s=cloud()?.getSession?.();
 if(!c||!s?.user){status('Sign in to the developer account to load club applications.',true);return;}
 if(loading)return;loading=true;
 const list=document.getElementById('klwClubAppsList');
 if(!list){loading=false;return;}
 status('Loading submitted applications…');
 try{
  const r=await c.rpc('get_platform_club_applications');
  if(r.error)throw r.error;
  const rows=Array.isArray(r.data)?r.data:[];
  list.innerHTML=rows.map(applicationCard).join('')||'<div class="dev-meta" style="padding:14px 0">No club applications are waiting for review.</div>';
  status(rows.length+' application(s) awaiting action.');
  list.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>review(b.dataset.id,b.dataset.review,b)));
  list.querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>openEvidence(b.dataset.evidence,b)));
 }catch(e){status(e.message||'Could not load club applications.',true);}
 finally{loading=false;}
}
async function review(id,decision,button){
 const c=client();if(!c)return;
 let note='',slug=null;
 if(decision==='approve'){
  slug=prompt('Confirm the club website URL slug:',button.dataset.slug||'');
  if(slug===null)return;
  slug=String(slug).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!slug){status('Enter a valid website slug.',true);return;}
  if(!confirm('Approve this club application, approve the manager account, create the club-owned workspace and manager access, activate its website module, and create a verified website draft?'))return;
 }else if(decision==='request_information'){
  note=prompt('Describe the additional information required from the club:','');
  if(note===null)return;
  if(note.trim().length<5){status('Enter a clear request of at least five characters.',true);return;}
 }else{
  note=prompt('Reason for rejecting this club application (optional):','')||'';
  if(!confirm('Reject this club application? The applicant will not receive workspace access.'))return;
 }
 button.disabled=true;
 try{
  const r=await c.rpc('review_football_club_application',{
   p_application_id:id,p_decision:decision,p_note:note,p_website_slug:slug
  });
  if(r.error)throw r.error;
  const result=r.data||{};
  if(decision==='approve'){
   status('Approved. Workspace: '+result.business_id+' · manager: '+result.manager_email+' · website slug: '+result.website_slug+' · subscription: '+result.subscription_status);
  }else if(decision==='request_information')status('Request for additional information sent to the application record.');
  else status('Application rejected. The applicant remains unable to access a workspace.');
  await load();
 }catch(e){status(e.message||'The application review failed.',true);button.disabled=false;}
}
async function openEvidence(id,button){
 const c=client();if(!c)return;
 button.disabled=true;
 try{
  const r=await c.rpc('get_platform_club_applications');
  if(r.error)throw r.error;
  const app=(r.data||[]).find(x=>x.id===id);
  if(!app?.evidence_path)throw new Error('No private evidence document was attached.');
  const signed=await c.storage.from('club-onboarding-evidence').createSignedUrl(app.evidence_path,300);
  if(signed.error)throw signed.error;
  window.open(signed.data.signedUrl,'_blank','noopener');
 }catch(e){status(e.message||'Could not open private evidence.',true);}
 finally{button.disabled=false;}
}
function ready(){setTimeout(mount,650);}
window.addEventListener('whiteLionCloudReady',ready);
window.addEventListener('whiteLionDeveloperPanelReady',ready);
window.KoromaFootballClubOnboardingAdmin={mount,refresh:load};
ready();
})();