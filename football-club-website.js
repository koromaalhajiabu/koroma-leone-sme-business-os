/* Koroma Leone Tech - Football Club Website Studio */
(function () {
  'use strict';
  if (window.KoromaClubWebsiteStudio) return;
  const db = () => window.whiteLionCloud && window.whiteLionCloud.getClient();
  const ws = () => window.whiteLionCloud && window.whiteLionCloud.getActiveBusiness();
  const user = () => window.whiteLionCloud && window.whiteLionCloud.getSession && window.whiteLionCloud.getSession()?.user;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slugify = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const tables = {market:'football_player_market_listings',career:'football_player_career_history',performance:'football_player_match_performances',pages:'football_club_website_pages',news:'football_club_website_news',squad:'football_club_website_squad',staff:'football_club_website_staff',fixtures:'football_club_website_fixtures',standings:'football_club_website_standings',transfers:'football_club_website_transfers',gallery:'football_club_website_gallery',sponsors:'football_club_website_sponsors',events:'football_club_website_events',honours:'football_club_website_honours',enquiries:'football_club_website_enquiries'};
  const tabs = [['overview','Overview'],['market','Player Transfer Market'],['career','Career History'],['performance','Player Performance'],['transfer-requests','Transfer Requests'],['player-reports','Player Reports'], ['profile','Club identity'],['delegation','Management authorisation'],['approvals','Approval inbox'],['activity','Activity history'],['pages','Website pages'],['news','News'],['squad','Players'],['scouting','Scout profiles'],['scout-enquiries','Scouting enquiries'],['staff','Staff'],['fixtures','Fixtures & results'],['standings','League table'],['transfers','Transfers'],['gallery','Gallery'],['sponsors','Sponsors'],['events','Academy & events'],['honours','Honours'],['enquiries','Enquiries']];
  const fields = {
    pages:[['title','Page title'],['slug','URL slug'],['summary','Introduction'],['body','Page content','textarea'],['show_in_navigation','Show in menu','check'],['is_published','Published','check'],['sort_order','Menu order','number'],['seo_title','SEO title'],['seo_description','SEO description','textarea']],
    news:[['title','Headline'],['slug','URL slug'],['category','Category','select','Club news|First Team|Academy|Community|Commercial|Match report|Announcement'],['excerpt','Summary','textarea'],['body','Article body','textarea'],['cover_image_url','Cover image','file'],['author_name','Author'],['is_featured','Featured','check'],['is_published','Published','check'],['published_at','Publish date','datetime-local']],
    squad:[['full_name','Full name'],['shirt_number','Shirt number'],['position','Position','select','Goalkeeper|Defender|Midfielder|Forward'],['squad_group','Team','select','First Team|Women|U23|U21|U18|Academy|Other'],['nationality','Nationality'],['bio','Biography','textarea'],['photo_url','Player / staff photo','file'],['appearances','Appearances','number'],['goals','Goals','number'],['assists','Assists','number'],['is_captain','Captain','check'],['is_published','Published','check'],['sort_order','Display order','number']],
    staff:[['full_name','Full name'],['staff_title','Position / title'],['biography','Biography','textarea'],['photo_url','Player / staff photo','file'],['is_published','Published','check'],['sort_order','Display order','number']],
    fixtures:[['opponent_name','Opponent'],['competition_name','Competition'],['fixture_type','Type','select','League|Cup|Friendly|Continental|Other'],['venue_type','Home / away','select','Home|Away|Neutral'],['venue_name','Venue'],['kickoff_at','Kick-off','datetime-local'],['match_status','Status','select','Scheduled|Live|Completed|Postponed|Cancelled'],['home_score','Home score','number'],['away_score','Away score','number'],['match_report','Match report','textarea'],['attendance','Attendance','number'],['man_of_the_match','Player of the match'],['is_published','Published','check']],
    standings:[['competition_name','Competition'],['season','Season'],['team_name','Team'],['played','Played','number'],['won','Won','number'],['drawn','Drawn','number'],['lost','Lost','number'],['goals_for','Goals for','number'],['goals_against','Goals against','number'],['points','Points','number'],['position','Position','number'],['is_published','Published','check']],
    transfers:[['player_name','Player'],['transfer_type','Type','select','Signing|Departure|Loan In|Loan Out|Contract Extension'],['previous_club','Previous club'],['new_club','New club'],['announcement','Announcement','textarea'],['effective_date','Effective date','date'],['is_published','Published','check']],
    gallery:[['title','Title'],['media_type','Media type','select','Image|Video'],['asset_url','Image / video','file'],['caption','Caption'],['alt_text','Alt text'],['category','Category'],['is_published','Published','check'],['sort_order','Display order','number']],
    sponsors:[['sponsor_name','Sponsor name'],['tier','Tier','select','Title Sponsor|Principal Sponsor|Official Partner|Partner|Community Partner'],['logo_url','Sponsor logo','file'],['website_url','Website URL','url'],['description','Description','textarea'],['is_published','Published','check'],['sort_order','Display order','number']],
    events:[['title','Event title'],['event_type','Type','select','Trial|Academy|Community|Matchday|Other'],['description','Description','textarea'],['start_at','Start','datetime-local'],['end_at','End','datetime-local'],['venue','Venue'],['registration_url','Registration URL','url'],['cover_image_url','Cover image','file'],['is_published','Published','check']],
    honours:[['title','Honour'],['competition_name','Competition'],['season','Season'],['honour_type','Type','select','Trophy|League Title|Cup|Award|Other'],['details','Details','textarea'],['award_date','Award date','date'],['image_url','Honour image','file'],['is_published','Published','check']],
    enquiries:[['status','Status','select','New|In Progress|Resolved|Archived']]
  };
  const columns = {pages:['title','slug','summary','show_in_navigation','is_published','sort_order'],news:['title','category','is_featured','is_published','published_at'],squad:['full_name','shirt_number','position','squad_group','nationality','appearances','goals','assists','is_captain','is_published'],staff:['full_name','staff_title','is_published'],fixtures:['opponent_name','competition_name','fixture_type','venue_type','kickoff_at','match_status','home_score','away_score','is_published'],standings:['competition_name','season','position','team_name','played','won','drawn','lost','goals_for','goals_against','points','is_published'],transfers:['player_name','transfer_type','previous_club','new_club','effective_date','is_published'],gallery:['title','media_type','category','caption','is_published'],sponsors:['sponsor_name','tier','website_url','is_published'],events:['title','event_type','start_at','venue','is_published'],honours:['title','competition_name','season','honour_type','award_date','is_published'],enquiries:['full_name','enquiry_type','subject','email','phone','status','created_at']};
  let businessId='', website=null, delegation=null, developer=false, activeTab='overview', directory=[], records=[];
  const permissionForTab={market:'transfers',career:'squad',performance:['squad','fixtures'],'transfer-requests':'transfers','player-reports':'squad',profile:'profile',pages:'pages',news:'news',squad:'squad',scouting:'squad','scout-enquiries':'enquiries',staff:'staff',fixtures:'fixtures',standings:'standings',transfers:'transfers',gallery:'gallery',sponsors:'sponsors',events:'events',honours:'honours',enquiries:'enquiries'};
  const canManageTab=tab=>{const scope=permissionForTab[tab];return !developer||!scope||(Array.isArray(scope)?scope.every(x=>delegation?.permissions?.[x]!==false):delegation?.permissions?.[scope]!==false);};
  const css=document.createElement('style');
  css.textContent='.klw{color:#183c29}.klw *{box-sizing:border-box}.klw-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:15px}.klw-head h1{margin:0;font-size:24px;color:#143b29}.klw-head p,.klw-muted{font-size:11px;color:#748278;line-height:1.6}.klw-actions{display:flex;gap:7px;flex-wrap:wrap}.klw button,.klw a.btn{border:1px solid #dce9df;border-radius:9px;background:white;color:#17422b;padding:9px 12px;font-size:11px;font-weight:750;text-decoration:none;cursor:pointer}.klw button.primary,.klw a.primary{background:#075b35;color:white;border-color:#075b35}.klw button.warn{background:#fff8e9;color:#8b6214}.klw-card{background:white;border:1px solid #e1ebe4;border-radius:14px;padding:16px;margin:12px 0;box-shadow:0 7px 22px #0846240a}.klw-tabs{display:flex;gap:6px;overflow:auto;padding:3px 0 11px}.klw-tabs button{white-space:nowrap;border-radius:20px}.klw-tabs button.active{background:#075b35;color:white}.klw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.klw-kpi{padding:13px;border:1px solid #e4ede6;border-radius:11px;background:#fbfdfb}.klw-kpi small{display:block;font-size:10px;color:#748278}.klw-kpi b{display:block;font-size:21px;margin-top:6px}.klw-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.klw-field{display:grid;gap:5px;min-width:0}.klw-field.full{grid-column:1/-1}.klw-field label{font-size:10px;font-weight:750;color:#607267}.klw-field input,.klw-field textarea,.klw-field select{width:100%;min-width:0;padding:10px;border:1px solid #dce7df;border-radius:8px;font:inherit;font-size:12px}.klw-field textarea{min-height:80px}.klw-check{display:flex;gap:7px;align-items:center;padding:9px 0}.klw-table-wrap{overflow:auto;border:1px solid #e6eee8;border-radius:11px}.klw-table{width:100%;border-collapse:collapse;min-width:620px}.klw-table th,.klw-table td{padding:10px;border-bottom:1px solid #eef3ef;text-align:left;font-size:10px}.klw-table th{background:#f5faf6;color:#718078;text-transform:uppercase;font-size:9px}.klw-pill{display:inline-block;padding:4px 8px;border-radius:20px;background:#e8f6ed;color:#087a43;font-size:9px;font-weight:800}.klw-status{font-size:11px;color:#087a43;margin:10px 0}.klw-note{padding:10px;background:#f3faf4;border:1px solid #dfefe3;border-radius:9px;font-size:11px;line-height:1.6}.klw-empty{padding:22px;text-align:center;color:#7a897f;font-size:11px}.klw-business{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #e6eee8;border-radius:10px;padding:10px;margin:7px 0}.klw-business strong{display:block;font-size:12px}.klw-business small{display:block;color:#7a897f;font-size:10px;margin-top:3px}.klw-modal{display:none;position:fixed;inset:0;background:#071b12aa;z-index:99999;align-items:center;justify-content:center;padding:12px}.klw-modal.open{display:flex}.klw-modal-box{background:white;border-radius:16px;width:min(760px,100%);max-height:92vh;overflow:auto;padding:18px}.klw-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}@media(max-width:720px){.klw-head{display:block}.klw-head .klw-actions{margin-top:10px}.klw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.klw-form{grid-template-columns:1fr}.klw-field.full{grid-column:auto}.klw-card{padding:13px}.klw-modal{align-items:flex-end;padding:0}.klw-modal-box{border-radius:18px 18px 0 0;max-height:93vh}}';
  document.head.appendChild(css);
  const publicUrl=()=>{const basePath=location.pathname.endsWith('/')?location.pathname:location.pathname.slice(0,location.pathname.lastIndexOf('/')+1);return location.origin+basePath+'club-website.html?slug='+encodeURIComponent(website?.slug||'');};
  async function copyPublicLink(){if(!website?.is_published||!website?.slug){message('Publish the club website before sharing its public link.',true);return;}const link=publicUrl();try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);}else{const input=document.createElement('textarea');input.value=link;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('Copy was blocked by this browser.');}message('Public website link copied. Share it with international scouts, agents and the public.');}catch(error){message('Could not copy automatically. Select this public link: '+link,true);}}
  async function sharePublicLink(){if(!website?.is_published||!website?.slug){message('Publish the club website before sharing its public link.',true);return;}const link=publicUrl();if(navigator.share){try{await navigator.share({title:(website.club_name||'Football club')+' | Official website',text:'Official football club website',url:link});return;}catch(error){if(error?.name==='AbortError')return;}}await copyPublicLink();}
  async function uploadMedia(file,scope){
    if(!file)return null;
    const isImage=/^image\/(jpeg|png|webp|gif)$/i.test(file.type);
    const isGalleryVideo=scope==='gallery/asset_url' && /^video\/(mp4|webm)$/i.test(file.type);
    const isScoutingVideo=scope==='squad/highlight_video_url' && /^video\/(mp4|webm)$/i.test(file.type);
    if(!isImage&&!isGalleryVideo&&!isScoutingVideo)throw new Error('Choose a supported image file. Gallery and scouting videos must be MP4 or WEBM.');
    if(file.size>50*1024*1024)throw new Error('Media files must be 50 MB or smaller.');
    const parts=String(file.name||'media.jpg').split('.');
    const ext=(parts.length>1?parts.pop():'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const base=slugify(parts.join('-'))||'club-media';
    const path=businessId+'/'+slugify(scope||'media')+'/'+Date.now()+'-'+base+'.'+ext;
    const bucket=db().storage.from('club-website-media');
    const result=await bucket.upload(path,file,{upsert:false,cacheControl:'3600',contentType:file.type});
    if(result.error)throw result.error;
    const publicResult=bucket.getPublicUrl(result.data.path);
    if(!publicResult?.data?.publicUrl)throw new Error('Media uploaded but its public URL could not be generated.');
    return publicResult.data.publicUrl;
  }
  function message(v,err){const e=document.getElementById('klwStatus');if(e){e.textContent=v;e.style.color=err?'#b33f47':'#087a43';}}
  function shell(inner){document.getElementById('view').innerHTML='<section class="klw"><div class="klw-head"><div><div class="eyebrow">KOROMA LEONE TECH · CLIENT WEBSITE SERVICES</div><h1>Football Club Website Studio</h1><p>Manage multiple club websites from one secure platform.</p></div><div class="klw-actions"><button id="klwRefresh">Refresh</button>'+(website?.slug?(website.is_published?'<a class="btn primary" href="'+esc(publicUrl())+'" target="_blank" rel="noopener">Open public website ↗</a><button id="klwCopyPublicLink">Copy public link</button><button id="klwSharePublicLink">Share website</button>':'<span class="klw-note">Website is a draft. Publish it before sharing its public link.</span>'):'')+'</div></div>'+inner+'<div id="klwStatus" class="klw-status" aria-live="polite"></div><div class="klw-modal" id="klwModal"><div class="klw-modal-box"><div class="klw-modal-head"><strong id="klwModalTitle">Edit record</strong><button id="klwClose">Close</button></div><form id="klwForm"><div id="klwFields"></div><div class="klw-actions" style="justify-content:flex-end;margin-top:13px"><button type="button" id="klwCancel">Cancel</button><button class="primary">Save</button></div></form></div></div></section>';
    document.getElementById('klwRefresh').onclick=open;
    const copy=document.getElementById('klwCopyPublicLink');if(copy)copy.onclick=copyPublicLink;
    const share=document.getElementById('klwSharePublicLink');if(share)share.onclick=sharePublicLink;
    ['klwClose','klwCancel'].forEach(id=>document.getElementById(id).onclick=()=>document.getElementById('klwModal').classList.remove('open'));
  }
  function tabsOnlyHtml(){return '<div class="klw-tabs">'+tabs.map(t=>'<button data-tab="'+t[0]+'" class="'+(activeTab===t[0]?'active':'')+'">'+t[1]+'</button>').join('')+'</div>';}
  function navHtml(){return tabsOnlyHtml()+'<div id="klwContent"></div>';}
  function bindTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;const n=document.querySelector('.klw-tabs');if(n)n.outerHTML=tabsOnlyHtml();bindTabs();loadTab(activeTab);});}
  async function refreshWebsite(){const r=await db().from('football_club_websites').select('*').eq('business_id',businessId).maybeSingle();if(r.error)throw r.error;website=r.data||null;}
  async function refreshDelegation(){const r=await db().from('football_club_website_delegations').select('*').eq('business_id',businessId).maybeSingle();if(r.error)throw r.error;delegation=r.data||null;}
  async function createOwn(f){const r=await db().from('football_club_websites').insert({business_id:businessId,club_name:f.club_name,slug:slugify(f.slug)}).select('*').single();if(r.error)throw r.error;website=r.data;await db().from('business_industry_modules').upsert({business_id:businessId,module_key:'football_club_website',is_enabled:true,configuration:{activated_by:'workspace_owner'},updated_by:user()?.id},{onConflict:'business_id,module_key'});await manager();}
  async function directoryHtml(){
    if(!directory.length)return '<div class="klw-empty">No matching club workspaces. Search by business name or classify a workspace as a football/sports club.</div>';
    const ids=directory.filter(x=>x.website_id).map(x=>x.business_id);
    let accessRows=[];
    if(ids.length){const a=await db().from('football_club_website_delegations').select('business_id,status,approval_mode').in('business_id',ids);if(!a.error)accessRows=a.data||[];}
    const accessByBusiness=Object.fromEntries(accessRows.map(x=>[x.business_id,x]));
    return directory.map(x=>{const a=accessByBusiness[x.business_id],state=a?.status||'not authorised',canOpen=a?.status==='active';return '<div class="klw-business"><div><strong>'+esc(x.club_name||x.business_name)+'</strong><small>'+esc(x.business_name)+' · '+(x.is_published?'Published':x.website_id?'Draft':'No website')+' · '+esc(x.slug||'')+' · Management: '+esc(state.replaceAll('_',' '))+'</small></div>'+(x.website_id?'<button '+(canOpen?'':'disabled title="The club must authorise Koroma Leone Tech first."')+' data-openbiz="'+esc(x.business_id)+'">'+(canOpen?'Manage':'Awaiting authorisation')+'</button>':'')+'</div>';}).join('');
  }
  async function bindOpenBiz(){document.querySelectorAll('[data-openbiz]').forEach(b=>b.onclick=async()=>{businessId=b.dataset.openbiz;try{await refreshDelegation();if(delegation?.status!=='active'){website=null;shell('<div class="klw-card"><h3>Club authorisation required</h3><p class="klw-muted">The club has not yet authorised Koroma Leone Tech to manage this website. Ask the club owner or manager to open Football Club Website Studio → Management authorisation and activate your access.</p><p class="klw-note">No club content is available to the developer until the club grants permission.</p><button id="klwBackToDirectory">Back to club directory</button></div>');document.getElementById('klwBackToDirectory').onclick=showCreate;return;}await refreshWebsite();await manager();}catch(e){message(e.message,true);}});}
  async function searchDirectory(){const q=document.getElementById('klwSearch').value.trim();const r=await db().rpc('platform_club_website_business_directory',{p_search:q||null});if(r.error){message(r.error.message,true);return;}directory=r.data||[];document.getElementById('klwDirectory').innerHTML=await directoryHtml();await bindOpenBiz();document.querySelector('#klwCreate select').innerHTML='<option value="">Select a club business</option>'+directory.map(x=>'<option value="'+esc(x.business_id)+'">'+esc(x.business_name)+'</option>').join('');}
  async function showCreate(){
    if(developer){
      const r=await db().rpc('platform_club_website_business_directory',{p_search:null});if(r.error)throw r.error;directory=r.data||[];
      shell('<div class="klw-card"><h3>Central client website management</h3><p class="klw-muted">Select a client football or sports club business to create a separate official website. Search by another registered business name when needed.</p><div class="klw-form"><div class="klw-field"><label>Search business</label><input id="klwSearch" placeholder="Club name or business name"></div><div class="klw-field" style="align-self:end"><button id="klwSearchBtn">Search</button></div></div><div id="klwDirectory">'+await directoryHtml()+'</div><hr><form id="klwCreate" class="klw-form"><div class="klw-field full"><label>Client business</label><select name="business_id" required><option value="">Select a club business</option>'+directory.map(x=>'<option value="'+esc(x.business_id)+'">'+esc(x.business_name)+'</option>').join('')+'</select></div><div class="klw-field"><label>Official club name</label><input name="club_name" required minlength="2"></div><div class="klw-field"><label>Website URL slug</label><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="club-name-fc"></div><div class="klw-field full"><button class="primary">＋ Create club website</button></div></form></div>');
      document.getElementById('klwSearchBtn').onclick=searchDirectory;await bindOpenBiz();
      document.getElementById('klwCreate').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());const x=await db().rpc('platform_create_club_website',{p_business_id:f.business_id,p_club_name:f.club_name,p_slug:slugify(f.slug)});if(x.error){message(x.error.message,true);return;}businessId=f.business_id;website=null;delegation=null;shell('<div class="klw-card"><h3>Website created · waiting for club authorisation</h3><p class="klw-muted">The website is now part of the club\'s SME OS workspace. The club owner or manager must activate Koroma Leone Tech under Management authorisation before you can add content or upload media.</p><button id="klwReturnDirectory">Return to club directory</button></div>');document.getElementById('klwReturnDirectory').onclick=showCreate;};
    }else{
      const b=ws();shell('<div class="klw-card"><h3>Create your club website</h3><p class="klw-muted">The website belongs to '+esc(b?.name||'your club')+'. Other clubs cannot access its data.</p><form id="klwOwn" class="klw-form"><div class="klw-field"><label>Official club name</label><input name="club_name" required minlength="2" value="'+esc(b?.name||'')+'"></div><div class="klw-field"><label>Website URL slug</label><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value="'+esc(slugify(b?.name||''))+'"></div><div class="klw-field full"><button class="primary">Create club website</button></div></form></div>');
      document.getElementById('klwOwn').onsubmit=async e=>{e.preventDefault();try{await createOwn(Object.fromEntries(new FormData(e.target).entries()));}catch(x){message(x.message,true);}};
    }
  }
  async function manager(){if(!website){await showCreate();return;}shell(navHtml());bindTabs();await loadTab(activeTab);}
  function fieldHtml(tab,row){return '<div class="klw-form">'+(fields[tab]||[]).map(f=>{const n=f[0],l=f[1],t=f[2],o=f[3],v=row?.[n]??(t==='check'?['is_published','show_in_navigation'].includes(n):n==='sort_order'?100:'');if(t==='check')return '<div class="klw-field"><label class="klw-check"><input type="checkbox" name="'+n+'" '+(v?'checked':'')+'> '+l+'</label></div>';if(t==='textarea')return '<div class="klw-field full"><label>'+l+'</label><textarea name="'+n+'">'+esc(v)+'</textarea></div>';if(t==='select')return '<div class="klw-field"><label>'+l+'</label><select name="'+n+'">'+o.split('|').map(x=>'<option '+(String(v)===x?'selected':'')+'>'+x+'</option>').join('')+'</select></div>';if(t==='file')return '<div class="klw-field"><label>'+l+'</label><input name="'+n+'" type="file" accept="'+(n==='asset_url'?'image/*,video/mp4,video/webm':'image/*')+'"><small class="klw-muted">'+(v?'Current media saved. Choose a file to replace it.':'Choose an image or video file.')+'</small></div>';return '<div class="klw-field"><label>'+l+'</label><input name="'+n+'" type="'+(t||'text')+'" value="'+esc(t==='datetime-local'&&v?String(v).slice(0,16):v)+'" '+(t==='number'?'min="0"':'')+'></div>';}).join('')+'</div>';}
  function editRecord(tab,row){
    if(!canManageTab(tab)){message('The club has not granted developer access to this content area.',true);return;}
    document.getElementById('klwModalTitle').textContent=(row?'Edit ':'Add ')+tabs.find(x=>x[0]===tab)[1];document.getElementById('klwFields').innerHTML=fieldHtml(tab,row);document.getElementById('klwModal').classList.add('open');
    document.getElementById('klwForm').onsubmit=async e=>{e.preventDefault();try{const data={};for(const f of (fields[tab]||[])){const el=e.target.elements[f[0]],t=f[2];if(t==='file'){if(el.files?.[0])data[f[0]]=await uploadMedia(el.files[0],tab+'/'+f[0]);else if(row?.[f[0]])data[f[0]]=row[f[0]];continue;}data[f[0]]=t==='check'?el.checked:el.value===''?null:t==='number'?Number(el.value):el.value;}if(tab==='news'&&data.is_published&&!data.published_at)data.published_at=new Date().toISOString();
      if(developer&&delegation?.approval_mode==='approval_required'){
        const staged=await db().rpc('submit_football_club_website_change',{p_business_id:businessId,p_target_table:tables[tab],p_target_id:row?.id||null,p_operation:row?'update':'insert',p_content:data});
        if(staged.error)throw staged.error;
        document.getElementById('klwModal').classList.remove('open');message('Submitted to the club for approval. It will not change the public website until approved.');await loadTab(tab);return;
      }
      const q=db().from(tables[tab]);const r=row?await q.update({...data,...(tab==='enquiries'?{}:{updated_at:new Date().toISOString()})}).eq('business_id',businessId).eq('id',row.id):await q.insert({...data,business_id:businessId});if(r.error)throw r.error;document.getElementById('klwModal').classList.remove('open');message('Record saved.');await loadTab(tab);}catch(error){message(error.message||'The record could not be saved.',true);}};
  }
  async function loadTab(tab){
    if(tab==='profile')return profile();
    if(tab==='overview')return overview();
    if(tab==='delegation')return delegationTab();
    if(tab==='approvals')return approvalsTab();
    if(tab==='activity')return activityTab();
    if(tab==='market')return marketTab();
    if(tab==='career')return careerTab();
    if(tab==='performance')return performanceTab();
    if(tab==='transfer-requests')return transferRequestsTab();
    if(tab==='player-reports')return playerReportsTab();
    if(tab==='scouting')return scoutingTab();
    if(tab==='scout-enquiries')return scoutEnquiriesTab();
    const host=document.getElementById('klwContent'),cols=columns[tab]||[];
    let q=db().from(tables[tab]).select('*').eq('business_id',businessId);
    q=q.order(tab==='enquiries'?'created_at':tab==='fixtures'?'kickoff_at':tab==='standings'?'position':tab==='news'?'created_at':tab==='events'?'start_at':'sort_order',{ascending:tab!=='enquiries'});
    const r=await q;
    if(r.error){host.innerHTML='<div class="klw-note">'+esc(r.error.message)+'</div>';return;}
    records=r.data||[];
    const editable=canManageTab(tab);
    host.innerHTML='<div class="klw-card"><div class="klw-head"><div><h3>'+tabs.find(x=>x[0]===tab)[1]+'</h3><p>'+records.length+' records. Drafts are hidden from public visitors.</p></div>'+(tab==='enquiries'||!editable?'':'<button class="primary" id="klwAdd">＋ Add record</button>')+'</div>'+(records.length?'<div class="klw-table-wrap"><table class="klw-table"><thead><tr>'+cols.map(c=>'<th>'+c.replaceAll('_',' ')+'</th>').join('')+'<th>Actions</th></tr></thead><tbody>'+records.map(row=>'<tr>'+cols.map(c=>'<td>'+(c.endsWith('_at')||c==='created_at'?esc(row[c]?new Date(row[c]).toLocaleString():'—'):typeof row[c]==='boolean'?(row[c]?'<span class="klw-pill">Yes</span>':'No'):esc(row[c]??'—'))+'</td>').join('')+'<td>'+(editable?'<div class="klw-actions"><button data-edit="'+row.id+'">Edit</button>'+(tab==='enquiries'?'':'<button class="warn" data-del="'+row.id+'">Delete</button>')+'</div>':'<span class="klw-muted">Read only</span>')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="klw-empty">No records yet.</div>')+(!editable?'<p class="klw-note">The club has not granted developer editing permission for this content area. You can view content that is already public.</p>':'')+'</div>';
    if(tab!=='enquiries'&&editable)document.getElementById('klwAdd').onclick=()=>editRecord(tab,null);
    if(editable)host.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editRecord(tab,records.find(row=>row.id===b.dataset.edit)));
    if(editable)host.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Delete this record?'))return;
      try{
        if(developer&&delegation?.approval_mode==='approval_required'){
          const staged=await db().rpc('submit_football_club_website_change',{p_business_id:businessId,p_target_table:tables[tab],p_target_id:b.dataset.del,p_operation:'delete',p_content:{}});
          if(staged.error)throw staged.error;
          message('Deletion submitted for club approval. The public website is unchanged until approved.');
          await loadTab(tab);return;
        }
        const x=await db().from(tables[tab]).delete().eq('business_id',businessId).eq('id',b.dataset.del);
        if(x.error)throw x.error;
        message('Record deleted.');await loadTab(tab);
      }catch(error){message(error.message||'Delete request failed.',true);}
    });
  }
  async function profile(){
    const host=document.getElementById('klwContent'),w=website||{},s=w.social_links||{};
    if(!canManageTab('profile')){host.innerHTML='<div class="klw-card"><h3>Club identity and branding</h3><p class="klw-note">This section is read-only. The club has not granted Koroma Leone Tech permission to change club identity or website branding.</p><p><strong>'+esc(w.club_name||'Club website')+'</strong></p><p class="klw-muted">'+esc(w.tagline||'')+'</p></div>';return;}
    const names=[['club_name','Official club name'],['short_name','Short name'],['slug','Website slug'],['tagline','Slogan'],['founded_year','Year founded','number'],['home_ground','Home ground'],['city','City / district'],['country','Country'],['contact_email','Public email','email'],['contact_phone','Public phone','tel'],['whatsapp_phone','WhatsApp number','tel'],['address','Address'],['crest_url','Club crest image','file'],['hero_image_url','Website banner image','file'],['shop_url','Club shop URL','url'],['ticketing_url','Ticketing URL','url'],['academy_contact_email','Academy email','email'],['academy_contact_phone','Academy phone','tel'],['membership_url','Membership URL','url'],['seo_title','SEO title'],['seo_description','SEO description']];
    const input=names.map(f=>'<div class="klw-field"><label>'+f[1]+'</label>'+(f[2]==='file'?'<input name="'+f[0]+'_file" type="file" accept="image/*"><small class="klw-muted">'+(w[f[0]]?'Current image saved. Choose a file to replace it.':'Upload an image file.')+'</small>':'<input name="'+f[0]+'" type="'+(f[2]||'text')+'" value="'+esc(w[f[0]]??(f[0]==='club_name'?ws()?.name:''))+'">')+'</div>').join('');
    host.innerHTML='<div class="klw-card"><h3>Club identity and branding</h3><p class="klw-muted">Set club contact details, crest, colours, history and official links. Paste a public image URL for the crest or banner.</p><form id="klwProfile"><div class="klw-form">'+input+
      '<div class="klw-field"><label>Primary colour</label><input name="primary_color" type="color" value="'+esc(w.primary_color||'#075b35')+'"></div><div class="klw-field"><label>Secondary colour</label><input name="secondary_color" type="color" value="'+esc(w.secondary_color||'#101a2d')+'"></div><div class="klw-field"><label>Accent colour</label><input name="accent_color" type="color" value="'+esc(w.accent_color||'#d5ae5a')+'"></div>'+
      ['facebook','instagram','x','youtube','tiktok'].map(k=>'<div class="klw-field"><label>'+k.toUpperCase()+' URL</label><input name="'+k+'" type="url" value="'+esc(s[k]||'')+'"></div>').join('')+
      '<div class="klw-field full"><label>About the club</label><textarea name="about_text">'+esc(w.about_text||'')+'</textarea></div><div class="klw-field full"><label>Club history</label><textarea name="history_text">'+esc(w.history_text||'')+'</textarea></div></div><button class="primary" style="margin-top:12px">Save club website profile</button></form><p class="klw-note"><strong>Public website link:</strong> '+(w.slug?'<a target="_blank" rel="noopener" href="'+esc(publicUrl())+'">'+esc(publicUrl())+'</a><br>'+(w.is_published?'Published and ready to share with scouts, agents, supporters and the public.':'Not public yet. Publish the website from Overview before sharing this address.'):'Save the profile to create its address.')+'</p></div>';
    document.getElementById('klwProfile').onsubmit=async e=>{e.preventDefault();try{const d=Object.fromEntries(new FormData(e.target).entries()),social={};for(const pair of [['crest_url','crest_url_file'],['hero_image_url','hero_image_url_file']]){const file=e.target.elements[pair[1]]?.files?.[0];delete d[pair[1]];if(file)d[pair[0]]=await uploadMedia(file,'brand/'+pair[0]);else d[pair[0]]=website?.[pair[0]]||null;}['facebook','instagram','x','youtube','tiktok'].forEach(k=>{social[k]=d[k]||'';delete d[k];});const payload={...d,business_id:businessId,slug:slugify(d.slug||d.club_name),founded_year:d.founded_year?Number(d.founded_year):null,primary_color:d.primary_color||'#075b35',secondary_color:d.secondary_color||'#101a2d',accent_color:d.accent_color||'#d5ae5a',social_links:social,updated_at:new Date().toISOString()};if(developer&&delegation?.approval_mode==='approval_required'){const staged=await db().rpc('submit_football_club_website_change',{p_business_id:businessId,p_target_table:'football_club_websites',p_target_id:website.id,p_operation:'update',p_content:payload});if(staged.error)throw staged.error;message('Club identity changes submitted for manager approval. The public profile is unchanged until approved.');await loadTab('approvals');return;}const r=await db().from('football_club_websites').upsert(payload,{onConflict:'business_id'}).select('*').single();if(r.error)throw r.error;website=r.data;message('Club profile saved.');profile();}catch(error){message(error.message||'Club profile could not be saved.',true);}};
  }
  async function overview(){
    const host=document.getElementById('klwContent'),counts={};
    for(const k of Object.keys(tables)){
      const r=await db().from(tables[k]).select('*',{count:'exact',head:true}).eq('business_id',businessId);
      counts[k]=r.error?'—':r.count||0;
    }
    const canPublish=!(developer&&(delegation?.approval_mode==='approval_required'||delegation?.permissions?.profile===false));
    host.innerHTML='<div class="klw-grid"><div class="klw-kpi"><small>Website status</small><b>'+(website.is_published?'Published':'Draft')+'</b></div><div class="klw-kpi"><small>Pages</small><b>'+counts.pages+'</b></div><div class="klw-kpi"><small>News</small><b>'+counts.news+'</b></div><div class="klw-kpi"><small>Players</small><b>'+counts.squad+'</b></div><div class="klw-kpi"><small>Fixtures</small><b>'+counts.fixtures+'</b></div><div class="klw-kpi"><small>Enquiries</small><b>'+counts.enquiries+'</b></div></div><div class="klw-card"><h3>Publishing controls</h3><p class="klw-muted">Draft content remains private. Only published content is visible to public visitors.</p><div class="klw-actions"><button class="primary" id="klwPublish" '+(canPublish?'':'disabled title="The club controls publishing under the current delegated permissions."')+'>'+(website.is_published?'Unpublish website':'Publish website')+'</button>'+(canManageTab('profile')?'<button id="klwProfileEdit">Edit club identity</button>':'')+(website.is_published?'<a class="btn" href="'+esc(publicUrl())+'" target="_blank" rel="noopener">Open public website ↗</a><button id="klwCopyOverviewLink">Copy public link</button><button id="klwShareOverviewLink">Share with scouts / public</button>':'')+'</div><p class="klw-note">'+(website.is_published?'Public link: '+esc(publicUrl())+' — ready to share.':'The club website link becomes publicly accessible after you publish it.')+(developer&&delegation?.approval_mode==='approval_required'?' Club approval is required before developer changes can be made live.':developer&&delegation?.permissions?.profile===false?' Website publishing is controlled by the club because profile permission was not delegated.':'')+' Every club has its own workspace boundary. Public visitors cannot edit club information or view private enquiries.</p></div>';
    const copyOverview=document.getElementById('klwCopyOverviewLink');if(copyOverview)copyOverview.onclick=copyPublicLink;
    const shareOverview=document.getElementById('klwShareOverviewLink');if(shareOverview)shareOverview.onclick=sharePublicLink;
    const publishButton=document.getElementById('klwPublish');
    if(canPublish&&publishButton)publishButton.onclick=async()=>{
      const next=!website.is_published;
      const r=await db().from('football_club_websites').update({is_published:next,published_at:next?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('business_id',businessId).select('*').single();
      if(r.error){message(r.error.message,true);return;}
      website=r.data;manager();
    };
    const profileEdit=document.getElementById('klwProfileEdit');
    if(profileEdit)profileEdit.onclick=()=>{activeTab='profile';document.querySelector('.klw-tabs').outerHTML=tabsOnlyHtml();bindTabs();profile();};
  }
  async function delegationTab(){
    const host=document.getElementById('klwContent');
    await refreshDelegation();
    const status=delegation?.status||'inactive',mode=delegation?.approval_mode||'direct';
    const permissionLabels=[
      ['profile','Club identity and branding'],
      ['pages','Website pages'],
      ['news','News and match reports'],
      ['squad','Players, player photographs and scouting profiles'],
      ['staff','Coaching and staff profiles'],
      ['fixtures','Fixtures and results'],
      ['standings','League tables'],
      ['transfers','Transfers and squad updates'],
      ['gallery','Photo and video gallery'],
      ['sponsors','Sponsors and partners'],
      ['events','Academy, trials and events'],
      ['honours','Honours and trophies'],
      ['enquiries','Club enquiry inbox']
    ];
    const savedPermissions=delegation?.permissions||{};
    const permissionStatus=permissionLabels.map(([key,label])=>{
      const allowed=status==='active'&&savedPermissions[key]!==false;
      return '<div class="klw-note" style="padding:8px 10px;margin:3px 0;display:flex;justify-content:space-between;gap:8px"><span>'+esc(label)+'</span><strong style="color:'+(allowed?'#087a43':'#a34b51')+'">'+(allowed?'Allowed':'Not allowed')+'</strong></div>';
    }).join('');
    const permissionControls=permissionLabels.map(([key,label])=>
      '<label class="klw-check" style="border:1px solid #e4ede6;border-radius:9px;padding:9px;margin:3px 0"><input type="checkbox" data-delegation-permission="'+key+'" '+(savedPermissions[key]===false?'':'checked')+'> '+esc(label)+'</label>'
    ).join('');
    const controls=developer?'':(
      '<div class="klw-card"><h3>Developer permissions</h3><p class="klw-muted">Choose exactly which parts of this club website Koroma Leone Tech may manage. The club retains full owner/admin/manager control.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:5px">'+permissionControls+'</div></div>'+
      '<div class="klw-form"><div class="klw-field"><label>Content publishing policy</label><select id="klwApprovalMode"><option value="direct" '+(mode==='direct'?'selected':'')+'>Direct management — developer changes go live as saved</option><option value="approval_required" '+(mode==='approval_required'?'selected':'')+'>Manager approval required — changes wait for review</option></select></div><div class="klw-field" style="align-self:end"><button id="klwSaveApprovalMode">Save permissions and publishing policy</button></div></div>'+
      '<div class="klw-actions" style="margin-top:12px">'+(status==='active'?'<button class="warn" id="klwSuspendDelegation">Suspend developer access</button>':'<button class="primary" id="klwActivateDelegation">Authorise Koroma Leone Tech</button>')+(status==='suspended'?'<button id="klwRestoreDelegation">Restore access</button>':'')+(status==='active'||status==='suspended'?'<button class="warn" id="klwRevokeDelegation">Revoke authorisation</button>':'')+'</div>'
    );
    host.innerHTML='<div class="klw-card"><h3>Koroma Leone Tech website management</h3><p class="klw-muted">The club controls whether the platform developer may manage this website. Authorisation applies only to this club and can be suspended or revoked at any time.</p><p><strong>Current status:</strong> <span class="klw-pill">'+esc(status.replaceAll('_',' '))+'</span></p><p><strong>Publishing policy:</strong> '+(mode==='approval_required'?'Club manager approval required':'Direct publishing')+'</p>'+(delegation?.approved_at?'<p class="klw-muted">Authorised on '+esc(new Date(delegation.approved_at).toLocaleString())+'</p>':'')+(developer?'<div class="klw-card"><h3>Your permitted content areas</h3>'+permissionStatus+'</div>':controls)+(developer?'<div class="klw-note">Only the club owner, administrator or manager can grant, suspend, restore or revoke this permission or change the permitted content areas.</div>':'<div class="klw-note">Direct management allows authorised website updates to appear immediately. Approval-required mode holds the developer\'s new, changed and deleted content in an approval inbox. You can change permissions later or suspend/revoke access without deleting the website.</div>')+'</div>';
    if(developer)return;
    const save=async nextStatus=>{
      const selected=document.getElementById('klwApprovalMode')?.value||mode;
      const permissions=Object.fromEntries(permissionLabels.map(([key])=>{
        const checkbox=document.querySelector('[data-delegation-permission="'+key+'"]');
        return [key,checkbox?checkbox.checked:savedPermissions[key]!==false];
      }));
      const payload={
        business_id:businessId,website_id:website.id,status:nextStatus||status,
        approval_mode:selected,permissions,updated_by:user()?.id,updated_at:new Date().toISOString()
      };
      if(payload.status==='active'){payload.approved_by=user()?.id;payload.approved_at=new Date().toISOString();}
      const r=await db().from('football_club_website_delegations').upsert(payload,{onConflict:'business_id'}).select('*').single();
      if(r.error){message(r.error.message,true);return;}
      delegation=r.data;message('Club website permissions and authorisation updated.');await loadTab('delegation');
    };
    document.getElementById('klwSaveApprovalMode').onclick=()=>save(status);
    const activate=document.getElementById('klwActivateDelegation');if(activate)activate.onclick=()=>save('active');
    const suspend=document.getElementById('klwSuspendDelegation');if(suspend)suspend.onclick=()=>save('suspended');
    const restore=document.getElementById('klwRestoreDelegation');if(restore)restore.onclick=()=>save('active');
    const revoke=document.getElementById('klwRevokeDelegation');if(revoke)revoke.onclick=()=>{if(confirm('Revoke Koroma Leone Tech website management authorisation?'))save('revoked');};
  }
  async function approvalsTab(){
    const host=document.getElementById('klwContent');
    const r=await db().from('football_club_website_change_requests').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100);
    if(r.error){host.innerHTML='<div class="klw-card">'+esc(r.error.message)+'</div>';return;}
    const rows=r.data||[];
    host.innerHTML='<div class="klw-card"><h3>Website change approvals</h3><p class="klw-muted">Developer updates submitted under approval-required mode remain private until a club manager approves them.</p>'+(rows.length?rows.map(x=>'<article class="klw-card"><div class="klw-head"><div><strong>'+esc(x.operation.toUpperCase())+' · '+esc(x.target_table.replace('football_club_website_',''))+'</strong><p class="klw-muted">'+esc(new Date(x.created_at).toLocaleString())+' · '+esc(x.status)+'</p></div><span class="klw-pill">'+esc(x.status)+'</span></div><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;background:#f7faf7;padding:10px;border-radius:8px">'+esc(JSON.stringify(x.proposed_content||{},null,2).slice(0,2400))+'</pre>'+(x.manager_comment?'<p class="klw-note">Manager note: '+esc(x.manager_comment)+'</p>':'')+(!developer&&x.status==='pending'?'<div class="klw-actions"><button class="primary" data-approve="'+x.id+'">Approve change</button><button class="warn" data-reject="'+x.id+'">Reject change</button></div>':'')+'</article>').join(''):'<div class="klw-empty">There are no website changes waiting for approval.</div>')+'</div>';
    host.querySelectorAll('[data-approve],[data-reject]').forEach(b=>b.onclick=async()=>{const decision=b.hasAttribute('data-approve')?'approved':'rejected';const note=prompt(decision==='approved'?'Optional note for the developer:':'Reason for rejecting this change:')||'';const result=await db().rpc('review_football_club_website_change',{p_request_id:b.dataset.approve||b.dataset.reject,p_decision:decision,p_manager_comment:note});if(result.error){message(result.error.message,true);return;}message('Website change '+decision+'.');await loadTab('approvals');});
  }
  async function activityTab(){
    const host=document.getElementById('klwContent');
    const r=await db().from('football_club_website_activity').select('id,actor_user_id,actor_type,action,target_table,target_id,summary,changed_fields,created_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100);
    if(r.error){host.innerHTML='<div class="klw-card">'+esc(r.error.message)+'</div>';return;}
    const rows=r.data||[];
    host.innerHTML='<div class="klw-card"><h3>Website activity history</h3><p class="klw-muted">A time-ordered record of developer and club-side website changes.</p>'+(rows.length?'<div class="klw-table-wrap"><table class="klw-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Area</th><th>Summary</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at).toLocaleString())+'</td><td>'+esc(x.actor_type.replaceAll('_',' '))+'<br><small>'+esc(x.actor_user_id||'System')+'</small></td><td>'+esc(x.action.replaceAll('_',' '))+'</td><td>'+esc(x.target_table.replace('football_club_website_',''))+'</td><td>'+esc(x.summary)+(x.changed_fields?.length?'<br><small>Fields: '+esc(x.changed_fields.join(', '))+'</small>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="klw-empty">No activity recorded yet.</div>')+'</div>';
  }

  async function scoutingTab(){
    const host=document.getElementById('klwContent');
    const editable=canManageTab('scouting');
    const [squadResult,profileResult]=await Promise.all([
      db().from('football_club_website_squad').select('id,full_name,position,squad_group,nationality,photo_url,appearances,goals,assists,is_published').eq('business_id',businessId).order('sort_order'),
      db().from('football_player_discovery_profiles').select('*').eq('business_id',businessId).order('updated_at',{ascending:false})
    ]);
    if(squadResult.error||profileResult.error){host.innerHTML='<div class="klw-card">'+esc((squadResult.error||profileResult.error).message)+'</div>';return;}
    const squad=squadResult.data||[],profiles=profileResult.data||[];
    let consentMap={};
    if(!developer&&profiles.length){
      const c=await db().from('football_player_discovery_consents').select('*').eq('business_id',businessId);
      if(!c.error)consentMap=Object.fromEntries((c.data||[]).map(x=>[x.profile_id,x]));
    }
    const rows=profiles.map(p=>{
      const c=consentMap[p.id];
      const consentLabel=developer?'Club-controlled':!c||!c.player_or_parent_consent||c.withdrawn_at?'Not recorded':p.is_minor&&!c.guardian_consent?'Guardian consent missing':'Consent recorded';
      return '<tr><td><strong>'+esc(p.public_name)+'</strong><br><small>'+esc(p.public_slug)+'</small></td><td>'+esc(p.position)+'</td><td>'+esc(p.age_band==='Under 18'?'Youth':p.age_band)+'</td><td>'+esc(p.scouting_status)+'</td><td>'+esc(consentLabel)+'</td><td>'+(editable?'<button data-edit-scout-profile="'+p.id+'">Edit</button>':'Read only')+' '+(p.scouting_status==='published'?'<a href="./football-scouting.html?player='+encodeURIComponent(p.public_slug)+'" target="_blank" rel="noopener">Public profile</a>':'<span class="klw-muted">Not public</span>')+'</td></tr>';
    }).join('');
    host.innerHTML='<div class="klw-card"><div class="klw-head"><div><h3>International player discovery profiles</h3><p>Build player profiles for scouts and agents. Every profile remains private until a club owner, administrator or manager publishes it after recording the required consent.</p></div>'+(editable?'<button class="primary" id="klwAddScoutProfile">＋ Create player profile</button>':'')+'</div><div class="klw-note">For players under 18, use an approved display name (such as first name and last initial), never publish a date of birth, personal phone number or personal email, and record guardian consent. Scout enquiries go to the club, not directly to the player.</div><div class="klw-table-wrap" style="margin-top:12px"><table class="klw-table"><thead><tr><th>Public display name</th><th>Position</th><th>Age group</th><th>Status</th><th>Consent</th><th>Profile</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">No discovery profiles have been created.</td></tr>')+'</tbody></table></div><p class="klw-muted">'+profiles.length+' profiles · '+profiles.filter(p=>p.scouting_status==='published').length+' published · '+profiles.filter(p=>p.scouting_status!=='published').length+' drafts / rejected.</p></div>';
    const add=document.getElementById('klwAddScoutProfile');
    if(add)add.onclick=()=>editDiscoveryProfile(null,squad,null);
    host.querySelectorAll('[data-edit-scout-profile]').forEach(b=>b.onclick=()=>editDiscoveryProfile(profiles.find(p=>p.id===b.dataset.editScoutProfile),squad,consentMap[b.dataset.editScoutProfile]||null));
  }
  function editDiscoveryProfile(row,squad,consent){
    const host=document.getElementById('klwContent');
    if(!canManageTab('scouting')){message('The club has not delegated player scouting profile management.',true);return;}
    const currentSquad=squad.find(p=>p.id===row?.squad_member_id);
    const minor=row?.age_band==='Under 18';
    const safeDefaultName=player=>{
      if(!player)return '';
      const parts=String(player.full_name||'').trim().split(/\s+/);
      return parts.length>1?parts[0].slice(0,1)+'. '+parts[parts.length-1].slice(0,1)+'.':parts[0];
    };
    const defaultName=row?.public_name||(currentSquad?(minor?safeDefaultName(currentSquad):currentSquad.full_name):'');
    const allowedPositions=['Goalkeeper','Defender','Midfielder','Forward','Winger','Striker','Other'];
    const initialPosition=allowedPositions.includes(row?.position)?row.position:(allowedPositions.includes(currentSquad?.position)?currentSquad.position:'Other');
    const consentGranted=!!(consent?.player_or_parent_consent&&!consent?.withdrawn_at);
    const guardianGranted=!!consent?.guardian_consent&&!consent?.withdrawn_at;
    const isDeveloperReview=developer&&delegation?.approval_mode==='approval_required';
    host.innerHTML='<div class="klw-card"><div class="klw-head"><div><h3>'+(row?'Edit player discovery profile':'Create player discovery profile')+'</h3><p>This profile is linked to an existing player in the club squad.</p></div><button id="klwScoutProfileCancel">Back</button></div><form id="klwScoutProfileForm" class="klw-form"><div class="klw-field full"><label>Existing club player</label><select name="squad_member_id" required '+(row?'disabled':'')+'><option value="">Select player</option>'+squad.map(p=>'<option value="'+p.id+'" '+(row?.squad_member_id===p.id?'selected':'')+'>'+esc(p.full_name)+' · '+esc(p.squad_group)+'</option>').join('')+'</select></div><div class="klw-field"><label>Public display name</label><input name="public_name" required maxlength="80" value="'+esc(defaultName)+'" placeholder="Use an approved display name"></div><div class="klw-field"><label>Public profile URL slug</label><input name="public_slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" value="'+esc(row?.public_slug||'')+'" placeholder="player-name-club"></div><div class="klw-field"><label>Age group</label><select name="age_band"><option value="Under 18" '+(row?.age_band==='Under 18'?'selected':'')+'>Under 18 (youth)</option><option value="18-21" '+(row?.age_band==='18-21'?'selected':'')+'>18–21</option><option value="22+" '+(!row||row?.age_band==='22+'?'selected':'')+'>22+</option></select></div><div class="klw-field"><label>Primary position</label><select name="position">'+allowedPositions.map(p=>'<option '+(initialPosition===p?'selected':'')+'>'+p+'</option>').join('')+'</select></div><div class="klw-field"><label>Secondary position</label><input name="secondary_position" value="'+esc(row?.secondary_position||'')+'" placeholder="e.g. Right winger"></div><div class="klw-field"><label>Nationality</label><input name="nationality" value="'+esc(row?.nationality||currentSquad?.nationality||'')+'"></div><div class="klw-field"><label>Preferred foot</label><select name="preferred_foot"><option value="">Not specified</option><option '+(row?.preferred_foot==='Right'?'selected':'')+'>Right</option><option '+(row?.preferred_foot==='Left'?'selected':'')+'>Left</option><option '+(row?.preferred_foot==='Both'?'selected':'')+'>Both</option></select></div><div class="klw-field"><label>Height in centimetres (optional)</label><input type="number" name="height_cm" min="100" max="230" value="'+esc(row?.height_cm||'')+'"></div><div class="klw-field full"><label>Player profile summary</label><textarea name="profile_summary" maxlength="1200" placeholder="Playing style, strengths and career summary. Do not enter private contact details.">'+esc(row?.profile_summary||'')+'</textarea></div><div class="klw-field"><label>Current season</label><input name="current_season" value="'+esc(row?.current_season||'')+'" placeholder="e.g. 2026/27"></div><div class="klw-field"><label>Appearances</label><input type="number" name="appearances" min="0" value="'+esc(row?.appearances??currentSquad?.appearances??0)+'"></div><div class="klw-field"><label>Goals</label><input type="number" name="goals" min="0" value="'+esc(row?.goals??currentSquad?.goals??0)+'"></div><div class="klw-field"><label>Assists</label><input type="number" name="assists" min="0" value="'+esc(row?.assists??currentSquad?.assists??0)+'"></div><div class="klw-field"><label>Clean sheets</label><input type="number" name="clean_sheets" min="0" value="'+esc(row?.clean_sheets??0)+'"></div><div class="klw-field full"><label>Playing history (one club / season per line)</label><textarea name="playing_history" placeholder="Club · Season · Competition">'+esc((row?.playing_history||[]).join('\n'))+'</textarea></div><div class="klw-field full"><label>Achievements and honours</label><textarea name="achievements" maxlength="2000">'+esc(row?.achievements||'')+'</textarea></div><div class="klw-field"><label>Player photograph URL</label><input type="url" name="player_image_url" value="'+esc(row?.player_image_url||currentSquad?.photo_url||'')+'"></div><div class="klw-field"><label>Highlight video URL (optional)</label><input type="url" name="highlight_video_url" value="'+esc(row?.highlight_video_url||'')+'" placeholder="HTTPS video link or upload MP4 / WEBM"></div><div class="klw-field"><label>Upload highlight video (MP4 / WEBM, max 50 MB)</label><input type="file" name="highlight_video_file" accept="video/mp4,video/webm"></div><div class="klw-field"><label>Feature this player</label><label class="klw-check"><input type="checkbox" name="is_featured" '+(row?.is_featured?'checked':'')+'> Show in featured players</label></div>'+(developer?'<div class="klw-field full"><div class="klw-note">'+(isDeveloperReview?'This club requires manager approval. Your draft profile will be submitted to the existing Approval inbox.':'You can prepare the profile, but only the club owner, administrator or manager can record consent and publish it.')+'</div></div>':'<div class="klw-field full"><h4>Player and guardian consent record</h4><label class="klw-check"><input type="checkbox" name="player_consent" '+(consentGranted?'checked':'')+'> Player or parent/guardian permission for this public scouting profile has been obtained</label><label class="klw-check"><input type="checkbox" name="guardian_consent" '+(guardianGranted?'checked':'')+'> Parent / legal guardian consent has been obtained (required for Under 18 players)</label></div><div class="klw-field"><label>Consent recording method</label><select name="consent_method"><option value="not_recorded" '+(!consent?.consent_method||consent.consent_method==='not_recorded'?'selected':'')+'>Not recorded</option><option value="written" '+(consent?.consent_method==='written'?'selected':'')+'>Written consent</option><option value="electronic" '+(consent?.consent_method==='electronic'?'selected':'')+'>Electronic consent</option><option value="in_person" '+(consent?.consent_method==='in_person'?'selected':'')+'>Recorded in person</option></select></div><div class="klw-field"><label>Private consent evidence reference (optional)</label><input name="evidence_reference" maxlength="300" value="'+esc(consent?.evidence_reference||'')+'" placeholder="Private internal file/reference only"></div><div class="klw-field full"><label class="klw-check"><input type="checkbox" name="publish_profile" '+(row?.scouting_status==='published'?'checked':'')+'> Approve and publish this player profile after saving the consent record</label></div>')+'<div class="klw-field full"><div class="klw-actions"><button class="primary" type="submit">Save player profile</button><button type="button" id="klwScoutProfileCancel2">Cancel</button></div></div></form><p class="klw-muted">No date of birth, private phone number, personal email or guardian contact details are collected for the public scouting profile.</p></div>';
    document.getElementById('klwScoutProfileCancel').onclick=scoutingTab;
    document.getElementById('klwScoutProfileCancel2').onclick=scoutingTab;
    const form=document.getElementById('klwScoutProfileForm');
    const applyYouthIdentity=()=>{
      if(form.elements.age_band.value!=='Under 18')return;
      const selectedId=row?.squad_member_id||form.elements.squad_member_id.value;
      form.elements.public_name.value='Youth player';
      if(selectedId)form.elements.public_slug.value='youth-player-'+selectedId.replace(/-/g,'').slice(0,10);
    };
    form.elements.age_band.onchange=applyYouthIdentity;
    form.elements.squad_member_id.onchange=applyYouthIdentity;
    applyYouthIdentity();
    form.onsubmit=async e=>{
      e.preventDefault();
      try{
        const selectedId=row?.squad_member_id||form.elements.squad_member_id.value;
        const player=squad.find(p=>p.id===selectedId);
        if(!player)throw new Error('Choose a player from this club’s existing squad.');
        const ageBand=form.elements.age_band.value;
        if(!developer&&form.elements.player_consent.checked&&form.elements.consent_method.value==='not_recorded'){
          throw new Error('Choose how player or parent/guardian consent was recorded.');
        }
        if(!developer&&ageBand==='Under 18'&&form.elements.publish_profile.checked&&!form.elements.guardian_consent.checked){
          throw new Error('Guardian consent is required before publishing a player under 18.');
        }
        let videoUrl=form.elements.highlight_video_url.value.trim()||null;
        let videoType=videoUrl?'link':'link';
        const videoFile=form.elements.highlight_video_file.files?.[0];
        if(videoFile){videoUrl=await uploadMedia(videoFile,'squad/highlight_video_url');videoType=videoFile.type==='video/webm'?'webm':'mp4';}
        const payload={
          business_id:businessId,website_id:website.id,squad_member_id:selectedId,
          public_slug:slugify(form.elements.public_slug.value.trim()),
          public_name:form.elements.public_name.value.trim(),age_band:ageBand,position:form.elements.position.value,
          secondary_position:form.elements.secondary_position.value.trim()||null,
          nationality:form.elements.nationality.value.trim()||null,
          preferred_foot:form.elements.preferred_foot.value||null,
          height_cm:form.elements.height_cm.value?Number(form.elements.height_cm.value):null,
          profile_summary:form.elements.profile_summary.value.trim()||null,
          playing_history:form.elements.playing_history.value.split('\n').map(x=>x.trim()).filter(Boolean),
          achievements:form.elements.achievements.value.trim()||null,
          current_season:form.elements.current_season.value.trim()||null,
          appearances:Number(form.elements.appearances.value||0),goals:Number(form.elements.goals.value||0),
          assists:Number(form.elements.assists.value||0),clean_sheets:Number(form.elements.clean_sheets.value||0),
          player_image_url:form.elements.player_image_url.value.trim()||player.photo_url||null,
          highlight_video_url:videoUrl,highlight_video_type:videoType,
          scouting_status:'draft',is_featured:form.elements.is_featured.checked,
          created_by:row?.created_by||user()?.id,updated_by:user()?.id
        };
        if(developer&&delegation?.approval_mode==='approval_required'){
          const staged=await db().rpc('submit_football_club_website_change',{
            p_business_id:businessId,p_target_table:'football_player_discovery_profiles',
            p_target_id:row?.id||null,p_operation:row?'update':'insert',p_content:payload
          });
          if(staged.error)throw staged.error;
          message('Player profile submitted to the club Approval inbox. The public directory is unchanged until the club reviews and publishes it.');
          await loadTab('approvals');return;
        }
        if(developer&&delegation?.approval_mode!=='direct')throw new Error('The club has not authorised direct player-profile editing.');
        let saved;
        if(row){
          const r=await db().from('football_player_discovery_profiles').update(payload).eq('business_id',businessId).eq('id',row.id).select('*').single();
          if(r.error)throw r.error;saved=r.data;
        }else{
          const r=await db().from('football_player_discovery_profiles').insert(payload).select('*').single();
          if(r.error)throw r.error;saved=r.data;
        }
        if(!developer){
          const playerConsent=form.elements.player_consent.checked;
          const guardianConsent=form.elements.guardian_consent.checked;
          const consentPayload={
            business_id:businessId,profile_id:saved.id,player_or_parent_consent:playerConsent,guardian_consent:guardianConsent,
            consent_method:playerConsent?form.elements.consent_method.value:'not_recorded',
            evidence_reference:form.elements.evidence_reference.value.trim()||null,
            recorded_by:user()?.id,recorded_at:playerConsent?new Date().toISOString():null,
            withdrawn_at:playerConsent?null:new Date().toISOString(),updated_at:new Date().toISOString()
          };
          const c=await db().from('football_player_discovery_consents').upsert(consentPayload,{onConflict:'profile_id'});
          if(c.error)throw c.error;
          if(form.elements.publish_profile.checked){
            if(!playerConsent)throw new Error('Record player or parent/guardian permission before publishing.');
            if(ageBand==='Under 18'&&!guardianConsent)throw new Error('Guardian consent is required for a player under 18.');
            const pub=await db().from('football_player_discovery_profiles').update({scouting_status:'published'}).eq('business_id',businessId).eq('id',saved.id).select('*').single();
            if(pub.error)throw pub.error;
          }
        }
        message('Player discovery profile saved. Only club-approved profiles with valid consent appear in the public scouting directory.');
        await scoutingTab();
      }catch(error){message(error.message||'The scouting profile could not be saved.',true);}
    };
  }
  async function scoutEnquiriesTab(){
    const host=document.getElementById('klwContent');
    const canRespond=canManageTab('scout-enquiries')&&!(developer&&delegation?.approval_mode==='approval_required');
    const [enquiries,profiles]=await Promise.all([
      db().from('football_scout_enquiries').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(100),
      db().from('football_player_discovery_profiles').select('id,public_name,public_slug').eq('business_id',businessId)
    ]);
    if(enquiries.error||profiles.error){host.innerHTML='<div class="klw-card">'+esc((enquiries.error||profiles.error).message)+'</div>';return;}
    const profileMap=Object.fromEntries((profiles.data||[]).map(p=>[p.id,p]));
    const rows=(enquiries.data||[]).map(x=>{
      const p=profileMap[x.profile_id];
      return '<article class="klw-card"><div class="klw-head"><div><h3>'+esc(x.scout_name)+' · '+esc(x.scout_organisation)+'</h3><p>'+esc(x.scout_email)+' · '+esc(new Date(x.created_at).toLocaleString())+'</p></div><span class="klw-pill">'+esc(x.status)+'</span></div><p><strong>Player:</strong> '+esc(p?.public_name||'Player profile')+' · '+esc(x.enquiry_type)+'</p><p>'+esc(x.message)+'</p>'+(x.club_response?'<div class="klw-note"><strong>Club response:</strong> '+esc(x.club_response)+'</div>':'')+(canRespond?'<div class="klw-form"><div class="klw-field"><label>Enquiry status</label><select id="scout-status-'+x.id+'"><option value="new" '+(x.status==='new'?'selected':'')+'>New</option><option value="reviewing" '+(x.status==='reviewing'?'selected':'')+'>Reviewing</option><option value="responded" '+(x.status==='responded'?'selected':'')+'>Responded</option><option value="closed" '+(x.status==='closed'?'selected':'')+'>Closed</option></select></div><div class="klw-field full"><label>Response to scout</label><textarea id="scout-response-'+x.id+'" maxlength="3000">'+esc(x.club_response||'')+'</textarea></div><div class="klw-field full"><button data-scout-reply="'+x.id+'">Save response</button></div></div>':'')+'</article>';
    }).join('');
    host.innerHTML='<div class="klw-card"><h3>International scouting enquiries</h3><p class="klw-muted">Only this club’s owner, administrator or manager and authorised platform support can access these private enquiries. Player contact details are not shared with scouts.</p>'+(rows||'<div class="klw-empty">No scouting enquiries have been received.</div>')+'</div>';
    host.querySelectorAll('[data-scout-reply]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.scoutReply,status=document.getElementById('scout-status-'+id).value;
      const response=document.getElementById('scout-response-'+id).value.trim();
      const r=await db().from('football_scout_enquiries').update({
        status,club_response:response||null,responded_by:user()?.id,
        responded_at:response?new Date().toISOString():null,updated_at:new Date().toISOString()
      }).eq('business_id',businessId).eq('id',id);
      if(r.error){message(r.error.message,true);return;}
      message('Scouting enquiry updated. The scout will receive an in-app notification.');
      await scoutEnquiriesTab();
    });
  }

  async function open(){
    try{
      if(!db()||!user()){shell('<div class="klw-card">Sign in to manage football club websites.</div>');return;}
      const d=await db().rpc('platform_club_website_business_directory',{p_search:null});developer=!d.error;
      if(developer){await showCreate();return;}
      const b=ws();if(!b?.id){shell('<div class="klw-card">Select a club workspace and sign in as its owner, administrator or manager.</div>');return;}
      businessId=b.id;await refreshWebsite();if(!website){await showCreate();return;}await refreshDelegation();await manager();
    }catch(e){shell('<div class="klw-card"><h3>Website Studio could not load</h3><p class="klw-muted">'+esc(e.message||'Unknown error')+'</p></div>');}
  }
  window.KoromaClubWebsiteStudio={open:open,render:open};
})();