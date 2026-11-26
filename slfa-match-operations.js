/* Koroma Leone Tech — SLFA Match Operations application. */
(function(){
'use strict';
const BUCKET='slfa-match-evidence',$=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime=v=>v?new Date(v).toLocaleString():'Not scheduled',shortDate=v=>v?new Date(v).toLocaleDateString():'—';
const client=()=>window.whiteLionCloud?.getClient?.(),business=()=>window.whiteLionCloud?.getActiveBusiness?.();
let activeTab='overview',competitionId='',cache={},ocrLoader=null;
const say=m=>{const e=$('slfaOpsNotice');if(e){e.textContent=m;e.hidden=false;}};
const button=(t,a,k='')=>'<button class="slfa-btn '+k+'" type="button" data-action="'+esc(a)+'">'+esc(t)+'</button>';
const clubName=id=>cache.clubs?.find(x=>String(x.id)===String(id))?.name||'Unknown club';
const fixtureName=id=>{const f=cache.fixtures?.find(x=>String(x.id)===String(id));return f?clubName(f.home_club_id)+' vs '+clubName(f.away_club_id)+' · '+dateTime(f.kickoff_at):'Unknown fixture';};
const playerName=id=>cache.playerMap?.get(String(id))?.full_name||'Unknown player';
const isAdmin=()=>!!cache.isAdmin,hasRole=r=>(cache.assignments||[]).some(a=>a.role===r&&a.user_id===cache.userId&&a.is_active);
const teamClubs=()=>Array.from(new Set((cache.assignments||[]).filter(a=>a.role==='team_official'&&a.user_id===cache.userId&&a.is_active).map(a=>a.club_id)));
function styles(){if($('slfaOpsStyles'))return;const s=document.createElement('style');s.id='slfaOpsStyles';s.textContent="\n.slfa-ops{color:#183a2a}.slfa-hero{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:21px;margin-bottom:15px;border-radius:17px;border:1px solid #cfe5d6;background:linear-gradient(115deg,#eaf7ee,#fff 65%,#edf6fc)}\n.slfa-hero h1{margin:5px 0;font-size:clamp(22px,2.4vw,30px);color:#075b35;letter-spacing:-.7px}.slfa-hero p{margin:0;color:#6e8175;font-size:12px;line-height:1.65}.slfa-kicker{font-size:10px;font-weight:850;letter-spacing:1.7px;color:#087a43;text-transform:uppercase}\n.slfa-mark{flex:0 0 54px;width:54px;height:54px;border-radius:15px;display:grid;place-items:center;color:#075b35;background:linear-gradient(145deg,#1eb53a 0 35%,#fff 35% 67%,#0072c6 67%);border:1px solid #d5e9dc;font-weight:950}\n.slfa-notice{padding:11px 13px;border:1px solid #d4e9d9;border-radius:10px;background:#f2faf4;color:#245f39;font-size:11px;line-height:1.6;margin:0 0 13px}.slfa-notice[hidden]{display:none}\n.slfa-tabs{display:flex;gap:7px;overflow-x:auto;padding:3px 1px 12px;margin-bottom:4px}.slfa-tab{white-space:nowrap;border:1px solid #dce9df;border-radius:30px;padding:9px 13px;background:#fff;color:#62766a;font-size:10px;font-weight:850}.slfa-tab.active{background:#087a43;color:#fff;border-color:#087a43}\n.slfa-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin-bottom:14px}.slfa-kpi{padding:15px;border:1px solid #e1ebe4;border-radius:13px;background:#fff;box-shadow:0 6px 18px rgba(7,91,53,.045);min-width:0}.slfa-kpi small{display:block;color:#76877c;font-size:10px}.slfa-kpi b{display:block;color:#075b35;font-size:25px;margin-top:6px}\n.slfa-card{background:#fff;border:1px solid #e0ebe3;border-radius:14px;padding:16px;margin:0 0 13px;min-width:0;box-shadow:0 5px 18px rgba(7,91,53,.035)}.slfa-card h3{font-size:14px;color:#17452e;margin:0 0 5px}.slfa-sub{font-size:10px;color:#7b8b81;line-height:1.6;margin-bottom:12px}\n.slfa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.slfa-field{display:grid;gap:5px;min-width:0}.slfa-field.full{grid-column:1/-1}.slfa-field label{font-size:10px;font-weight:800;color:#526b5b}.slfa-field input,.slfa-field select,.slfa-field textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #dce8df;border-radius:9px;padding:10px;background:#fff;color:#203b2b;font:inherit;font-size:11px}.slfa-field textarea{min-height:75px;resize:vertical}\n.slfa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:37px;padding:8px 11px;border:1px solid #d7e7dc;border-radius:9px;background:#fff;color:#235039;font-weight:800;font-size:10px;text-decoration:none;cursor:pointer}.slfa-btn.primary{background:#087a43;color:#fff;border-color:#087a43}.slfa-btn.blue{background:#0072c6;color:#fff;border-color:#0072c6}.slfa-btn.danger{background:#fff5f5;color:#a83e49;border-color:#edd8da}.slfa-btn:disabled{opacity:.5;cursor:not-allowed}\n.slfa-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:12px}.slfa-table-wrap{width:100%;overflow:auto;border:1px solid #e8eee9;border-radius:10px;-webkit-overflow-scrolling:touch}.slfa-table-wrap table{width:100%;border-collapse:collapse;white-space:nowrap}.slfa-table-wrap th{text-align:left;background:#f4f9f5;color:#718078;font-size:9px;letter-spacing:.7px;text-transform:uppercase;padding:10px}.slfa-table-wrap td{border-top:1px solid #edf2ee;padding:10px;color:#354c3d;font-size:10px;vertical-align:top}.slfa-empty{padding:24px 12px;text-align:center;color:#829087;font-size:11px}\n.slfa-badge{display:inline-block;padding:4px 8px;border-radius:20px;background:#eaf6ed;color:#087a43;font-size:9px;font-weight:850}.slfa-badge.warn{background:#fff4df;color:#986b1c}.slfa-badge.blue{background:#edf5fc;color:#1769a8}\n.slfa-player-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:280px;overflow:auto;padding:3px}.slfa-player{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:7px;align-items:center;border:1px solid #e7eee8;border-radius:8px;padding:7px;font-size:10px}.slfa-player small{color:#829087}.slfa-player input{width:auto;margin:0}.slfa-player b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.slfa-review-box{min-width:260px;max-width:380px;white-space:normal}.slfa-review-box textarea{width:100%;min-height:60px;border:1px solid #dce8df;border-radius:8px;padding:8px;font:inherit;font-size:10px}.slfa-report-text{max-width:340px;white-space:normal;line-height:1.5;color:#566b5c;overflow-wrap:anywhere}.slfa-role-note{font-size:10px;color:#7b8b81;line-height:1.6;margin-top:8px}.slfa-step{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #edf2ee}.slfa-step:last-child{border:0}.slfa-step-num{width:27px;height:27px;flex:0 0 27px;border-radius:9px;background:#eaf6ed;color:#087a43;display:grid;place-items:center;font-size:11px;font-weight:900}.slfa-step b{display:block;font-size:11px;color:#264b34}.slfa-step small{display:block;font-size:10px;color:#78897e;line-height:1.55;margin-top:3px}\n@media(max-width:850px){.slfa-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.slfa-hero{padding:15px}.slfa-mark{width:42px;height:42px;flex-basis:42px}.slfa-card{padding:13px}.slfa-grid{grid-template-columns:1fr}.slfa-field.full{grid-column:auto}.slfa-player-list{grid-template-columns:1fr}.slfa-kpis{gap:8px}.slfa-kpi{padding:12px}.slfa-kpi b{font-size:21px}.slfa-actions .slfa-btn{flex:1}}\n.slfa-command-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 13px}.slfa-state{font-weight:850}.slfa-state.ready{color:#087a43}.slfa-state.alert{color:#a46c16}.slfa-state.closed{color:#1769a8}.slfa-alert-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #edf2ee}.slfa-alert-row:last-child{border:0}.slfa-alert-row b{display:block;color:#294b35;font-size:11px}.slfa-alert-row small{display:block;color:#728278;font-size:10px;line-height:1.5;margin-top:3px}.slfa-compliance-list{margin:0;padding-left:17px;color:#926a21;font-size:10px;line-height:1.7}.slfa-multi-select{min-height:112px}.slfa-row-actions{display:flex;gap:6px;flex-wrap:wrap}.slfa-row-actions .slfa-btn{min-height:31px;padding:6px 8px}@media(max-width:600px){.slfa-alert-row{grid-template-columns:1fr}.slfa-command-toolbar .slfa-btn{flex:1}}@media print{.sidebar,.topbar,.footer,.slfa-tabs,.slfa-actions,.slfa-btn{display:none!important}.slfa-card{break-inside:avoid;box-shadow:none}.slfa-table-wrap{overflow:visible}}\n";document.head.appendChild(s);}
function select(name,options,placeholder){return '<select name="'+esc(name)+'"><option value="">'+esc(placeholder||'Select…')+'</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('')+'</select>';}
function fixtureSelect(items,name='fixture_id'){return select(name,(items||[]).map(f=>({value:f.id,label:clubName(f.home_club_id)+' vs '+clubName(f.away_club_id)+' · '+dateTime(f.kickoff_at)})),'Select fixture');}
function stat(label,value,caption){return '<div class="slfa-kpi"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><small>'+esc(caption)+'</small></div>';}
function hero(){return '<div class="slfa-hero"><div><div class="slfa-kicker">KOROMA LEONE TECH · ASSOCIATION OPERATIONS</div><h1>SLFA Match Operations System</h1><p>Matchday command, electronic team sheets, official assignments, compliance checks, report reconciliation, evidence dossiers and automated reminders.</p></div><div class="slfa-mark">SL</div></div>';}
async function load(){
 const c=client(),b=business();if(!c||!b?.id)throw new Error('Sign in and select the Football Association workspace first.');
 cache.business=b;cache.client=c;cache.userId=window.whiteLionCloud?.getSession?.()?.user?.id||null;
 const [mod,lic,comps]=await Promise.all([
  c.from('business_industry_modules').select('module_key,is_enabled').eq('business_id',b.id).eq('module_key','slfa_match_ops').maybeSingle(),
  c.from('slfa_match_ops_licenses').select('*').eq('business_id',b.id).maybeSingle(),
  c.from('league_competitions').select('*').eq('business_id',b.id).order('created_at',{ascending:false})
 ]);
 if(mod.error)throw mod.error;if(lic.error)throw lic.error;if(comps.error)throw comps.error;
 cache.module=mod.data;cache.license=lic.data;cache.competitions=comps.data||[];
 if(!mod.data?.is_enabled)throw new Error('SLFA Match Operations is not enabled for this workspace. Ask Koroma Leone Tech to activate the product.');
 if(!competitionId||!cache.competitions.some(x=>x.id===competitionId))competitionId=cache.competitions[0]?.id||'';
 cache.isAdmin=['owner','admin','manager'].includes(String(b.role||''));
 if(!competitionId){cache.seasons=[];cache.clubs=[];cache.players=[];cache.fixtures=[];cache.assignments=[];cache.sheets=[];cache.reports=[];cache.members=[];cache.notifications=[];cache.playerMap=new Map();return;}
 const [seasons,clubs,players,fixtures,assignments,sheets,reports,members,compMembers,notifications]=await Promise.all([
  c.from('league_seasons').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('starts_on',{ascending:false}),
  c.from('league_clubs').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('name'),
  c.from('league_players').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('full_name'),
  c.from('league_fixtures').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('kickoff_at'),
  c.from('slfa_match_official_assignments').select('*').eq('business_id',b.id).eq('competition_id',competitionId).eq('is_active',true),
  c.from('slfa_match_team_sheets').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('submitted_at',{ascending:false}),
  c.from('slfa_match_reports').select('*').eq('business_id',b.id).eq('competition_id',competitionId).order('submitted_at',{ascending:false}),
  c.rpc('slfa_match_ops_get_staff',{p_business_id:b.id}),
  c.from('league_competition_members').select('user_id,role,is_active,club_id').eq('business_id',b.id).eq('competition_id',competitionId).eq('is_active',true),
  c.from('slfa_match_ops_notifications').select('*').eq('business_id',b.id).order('created_at',{ascending:false}).limit(100)
 ]);
 for(const r of [seasons,clubs,players,fixtures,assignments,sheets,reports,members,compMembers,notifications])if(r.error)throw r.error;
 cache.seasons=seasons.data||[];cache.clubs=clubs.data||[];cache.players=players.data||[];cache.fixtures=fixtures.data||[];
 cache.assignments=assignments.data||[];cache.sheets=sheets.data||[];cache.reports=reports.data||[];cache.members=members.data||[];cache.compMembers=compMembers.data||[];cache.notifications=notifications.data||[];
 cache.playerMap=new Map(cache.players.map(p=>[String(p.id),p]));
 if(cache.compMembers.some(m=>m.user_id===cache.userId&&m.role==='competition_admin'))cache.isAdmin=true;
 cache.members=cache.members.map(m=>({...m,full_name:m.full_name||'Association staff'}));
}
function tabsHtml(){const a=[['overview','Command Centre'],['teamsheets','Electronic team sheets'],['reports','Referee & commissioner reports']];if(isAdmin())a.push(['officials','Officials & access']);a.push(['setup','System setup'],['licence','Product licence']);return '<div class="slfa-tabs">'+a.map(([id,label])=>'<button class="slfa-tab '+(activeTab===id?'active':'')+'" type="button" data-tab="'+id+'">'+label+'</button>').join('')+'</div>';}

function latestReport(fixtureId,type){
 return cache.reports.filter(r=>r.fixture_id===fixtureId&&r.report_type===type)
  .sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0))[0]||null;
}
function analyseFixture(f){
 const now=Date.now(),kickoff=f.kickoff_at?new Date(f.kickoff_at).getTime():null;
 const sheets=cache.sheets.filter(s=>s.fixture_id===f.id);
 const byClub=id=>sheets.filter(s=>s.club_id===id).sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0))[0]||null;
 const homeSheet=byClub(f.home_club_id),awaySheet=byClub(f.away_club_id);
 const referee=latestReport(f.id,'referee'),commissioner=latestReport(f.id,'match_commissioner');
 const hasOfficial=role=>cache.assignments.some(a=>a.fixture_id===f.id&&a.role===role&&a.is_active);
 const setupIssues=[];
 if(!f.kickoff_at)setupIssues.push('Kick-off time is missing.');
 if(!String(f.venue||'').trim())setupIssues.push('Venue is missing.');
 if(!hasOfficial('referee'))setupIssues.push('Referee is not assigned.');
 if(!hasOfficial('match_commissioner'))setupIssues.push('Match Commissioner is not assigned.');
 const sheetIssues=[],pendingSheets=[];
 for(const [label,s] of [['Home',homeSheet],['Away',awaySheet]]){
  if(!s){sheetIssues.push(label+' team sheet is not submitted.');continue;}
  if(s.status==='returned'){sheetIssues.push(label+' team sheet was returned for correction.');continue;}
  if(s.status==='pending'){pendingSheets.push(label+' team sheet is awaiting approval.');continue;}
  if(s.status==='approved'){
   const starts=s.starting_player_ids||[],subs=s.substitute_player_ids||[];
   if(starts.length!==11)sheetIssues.push(label+' approved sheet does not contain exactly 11 starters.');
   if(subs.length>9)sheetIssues.push(label+' approved sheet has more than 9 substitutes.');
   if(starts.some(id=>subs.includes(id)))sheetIssues.push(label+' sheet lists a player as both starter and substitute.');
   const wrongClub=[...starts,...subs].filter(id=>{const p=cache.playerMap?.get(String(id));return !p||String(p.club_id)!==String(s.club_id);});
   if(wrongClub.length)sheetIssues.push(label+' sheet contains players not registered to that club.');
  }
 }
 const reportIssues=[];
 if(!referee)reportIssues.push('Referee report is outstanding.');
 if(!commissioner)reportIssues.push('Match Commissioner report is outstanding.');
 const discrepancies=[];
 if(referee&&f.home_score!=null&&f.away_score!=null){
  const rh=Number(referee.report_data?.home_score),ra=Number(referee.report_data?.away_score);
  if(Number.isFinite(rh)&&Number.isFinite(ra)&&(rh!==Number(f.home_score)||ra!==Number(f.away_score)))
   discrepancies.push('Referee report score ('+rh+'–'+ra+') differs from the fixture score ('+f.home_score+'–'+f.away_score+').');
 }
 if(referee&&commissioner&&commissioner.report_data&&commissioner.report_data.home_score!=null&&commissioner.report_data.away_score!=null){
  const mh=Number(commissioner.report_data.home_score),ma=Number(commissioner.report_data.away_score);
  const rh=Number(referee.report_data?.home_score),ra=Number(referee.report_data?.away_score);
  if(Number.isFinite(mh)&&Number.isFinite(ma)&&Number.isFinite(rh)&&Number.isFinite(ra)&&(mh!==rh||ma!==ra))
   discrepancies.push('The Match Commissioner score differs from the referee score.');
 }
 const approved=[homeSheet,awaySheet].filter(s=>s?.status==='approved');
 if(approved.length===2){
  const authorised=new Set(approved.flatMap(s=>[...(s.starting_player_ids||[]),...(s.substitute_player_ids||[])].map(String)));
  for(const r of [referee,commissioner].filter(Boolean)){
   const ids=Array.isArray(r.report_data?.player_ids)?r.report_data.player_ids:[];
   const unlisted=ids.filter(id=>!authorised.has(String(id)));
   for(const id of unlisted)discrepancies.push('Reported player '+playerName(id)+' is not on either approved team sheet.');
  }
 }
 const overdue=kickoff!=null&&now>kickoff+90*60*1000;
 let state='Awaiting preparation';
 if(f.status==='cancelled'||f.status==='postponed')state=f.status==='cancelled'?'Cancelled':'Postponed';
 else if(f.status==='completed'){
  if(discrepancies.length||(referee?.status==='pending'||commissioner?.status==='pending'))state='Under review';
  else if(!referee||!commissioner||referee.status==='returned'||commissioner.status==='returned')state='Awaiting reports';
  else if(referee.status==='reviewed'&&commissioner.status==='reviewed'&&homeSheet?.status==='approved'&&awaySheet?.status==='approved')state='Closed';
  else state='Under review';
 }else if(setupIssues.length)state='Awaiting preparation';
 else if(sheetIssues.length)state='Awaiting team sheets';
 else if(pendingSheets.length)state='Under review';
 else if(kickoff!=null&&kickoff<=now)state='In progress / result pending';
 else state='Ready for match';
 const allIssues=[...setupIssues,...sheetIssues,...pendingSheets,...reportIssues,...discrepancies];
 return {state,homeSheet,awaySheet,referee,commissioner,setupIssues,sheetIssues,pendingSheets,reportIssues,discrepancies,allIssues,overdue};
}
function stateClass(state){
 if(state==='Ready for match')return 'ready';
 if(state==='Closed')return 'closed';
 if(state==='Cancelled'||state==='Postponed')return '';
 return 'alert';
}
function overview(){
 const rows=cache.fixtures.map(f=>({fixture:f,ops:analyseFixture(f)})).sort((a,b)=>(new Date(a.fixture.kickoff_at||'2999-01-01'))-(new Date(b.fixture.kickoff_at||'2999-01-01')));
 const active=rows.filter(x=>!['Cancelled','Postponed'].includes(x.ops.state));
 const ready=active.filter(x=>x.ops.state==='Ready for match').length;
 const attention=active.filter(x=>['Awaiting preparation','Awaiting team sheets','Under review','Awaiting reports','In progress / result pending'].includes(x.ops.state)).length;
 const unread=(cache.notifications||[]).filter(n=>!n.read_at);
 const pending=cache.sheets.filter(s=>s.status==='pending').length+cache.reports.filter(r=>r.status==='pending').length;
 const exceptions=rows.filter(x=>x.ops.discrepancies.length);
 const alertRows=cache.notifications.slice(0,14);
 const upcoming=rows.filter(x=>x.fixture.status==='scheduled').slice(0,30);
 return '<div class="slfa-kpis">'+stat('Fixtures monitored',active.length,'Selected competition')+stat('Ready for match',ready,'All readiness checks clear')+stat('Require attention',attention,'Preparation, sheets, reports or review')+stat('Unread alerts',unread.length,'In-app official notifications')+'</div>'+
 '<div class="slfa-command-toolbar">'+button('Export match operations CSV','export-command','primary')+button('Open electronic team sheets','tab:teamsheets')+button('Open report review','tab:reports')+'</div>'+
 '<div class="slfa-card"><h3>Matchday command board</h3><p class="slfa-sub">Each fixture is assessed against venue and kick-off details, assigned officials, both approved team sheets, submitted reports and available score/player cross-checks. “In progress” is inferred from the fixture schedule; this is not a live match clock.</p><div class="slfa-table-wrap"><table><thead><tr><th>Fixture</th><th>Kick-off / venue</th><th>Team sheets</th><th>Officials</th><th>Reports</th><th>Command status</th><th>Actions</th></tr></thead><tbody>'+
 (upcoming.length?upcoming.map(({fixture:f,ops:o})=>'<tr><td><b>'+esc(clubName(f.home_club_id)+' vs '+clubName(f.away_club_id))+'</b><br><small>'+esc(f.matchweek||'')+'</small></td><td>'+esc(dateTime(f.kickoff_at))+'<br>'+esc(f.venue||'Venue missing')+'</td><td>'+esc((o.homeSheet?.status||'Missing')+' / '+(o.awaySheet?.status||'Missing'))+'</td><td>'+esc((cache.assignments.some(a=>a.fixture_id===f.id&&a.role==='referee'&&a.is_active)?'Referee ✓':'Referee missing')+' · '+(cache.assignments.some(a=>a.fixture_id===f.id&&a.role==='match_commissioner'&&a.is_active)?'Commissioner ✓':'Commissioner missing'))+'</td><td>'+esc((o.referee?.status||'Referee missing')+' / '+(o.commissioner?.status||'Commissioner missing'))+'</td><td><span class="slfa-state '+stateClass(o.state)+'">'+esc(o.state)+'</span>'+(o.allIssues.length?'<ul class="slfa-compliance-list">'+o.allIssues.slice(0,3).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'</td><td><div class="slfa-row-actions">'+button('Print dossier','dossier:'+f.id)+'</div></td></tr>').join(''):'<tr><td colspan="7" class="slfa-empty">No fixtures found for this competition. Add fixtures in Competition Setup.</td></tr>')+
 '</tbody></table></div></div>'+
 '<div class="slfa-card"><h3>Automated alerts & outstanding actions</h3><p class="slfa-sub">In-app reminders are generated every 15 minutes for team-sheet deadlines, overdue referee/commissioner reports, pending Super Admin reviews and fixture-score discrepancies.</p>'+
 (alertRows.length?alertRows.map(n=>'<div class="slfa-alert-row"><div><b>'+esc(n.title)+'</b><small>'+esc(n.body)+' · '+esc(dateTime(n.created_at))+'</small></div>'+(n.read_at?'<span class="slfa-badge">Read</span>':'<button class="slfa-btn" type="button" data-alert-read="'+esc(n.id)+'">Mark read</button>')+'</div>').join(''):'<div class="slfa-empty">No automated alerts have been generated for this workspace yet.</div>')+'</div>'+
 '<div class="slfa-card"><h3>Compliance exceptions</h3><p class="slfa-sub">These checks flag structured information that needs human verification before a match record is treated as complete.</p>'+
 (exceptions.length?exceptions.map(({fixture:f,ops:o})=>'<div class="slfa-alert-row"><div><b>'+esc(clubName(f.home_club_id)+' vs '+clubName(f.away_club_id))+'</b><small>'+o.discrepancies.map(esc).join(' · ')+'</small></div><button class="slfa-btn" type="button" data-action="dossier:'+esc(f.id)+'">Inspect dossier</button></div>').join(''):'<div class="slfa-empty">No score or reported-player discrepancies detected in the available structured records.</div>')+'</div>'+
 '<div class="slfa-card"><h3>Submission queue</h3><div class="slfa-kpis">'+stat('Pending reviews',pending,'Team sheets and reports')+stat('Overdue reports',rows.filter(x=>x.ops.overdue&&(!x.ops.referee||!x.ops.commissioner)).length,'More than 90 minutes after kick-off')+stat('Score exceptions',exceptions.length,'Requires Super Admin checks')+stat('Scheduled fixtures',cache.fixtures.filter(f=>f.status==='scheduled').length,'Selected competition')+'</div></div>';
}
function exportCommandCsv(){
 const heads=['Fixture ID','Fixture','Kick-off','Venue','Fixture status','Command status','Home team sheet','Away team sheet','Referee report','Commissioner report','Compliance issues'];
 const rows=cache.fixtures.map(f=>{const o=analyseFixture(f);return [f.id,clubName(f.home_club_id)+' vs '+clubName(f.away_club_id),f.kickoff_at||'',f.venue||'',f.status,o.state,o.homeSheet?.status||'missing',o.awaySheet?.status||'missing',o.referee?.status||'missing',o.commissioner?.status||'missing',o.allIssues.join(' | ')];});
 const quote=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
 const csv=[heads,...rows].map(r=>r.map(quote).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download='slfa-match-operations-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function printMatchDossier(fixtureId){
 const f=cache.fixtures.find(x=>x.id===fixtureId);if(!f){say('Fixture could not be found.');return;}
 const w=window.open('','_blank');if(!w){say('Allow pop-ups to open the printable match dossier.');return;}
 w.document.write('<!doctype html><title>Preparing match dossier</title><p>Preparing match dossier and evidence…</p>');
 try{
  const ops=analyseFixture(f),sheets=cache.sheets.filter(s=>s.fixture_id===f.id),reports=cache.reports.filter(r=>r.fixture_id===f.id);
  const evidence=[];
  for(const r of reports)for(const path of r.evidence_paths||[]){
   const {data,error}=await client().storage.from(BUCKET).createSignedUrl(path,1800);
   if(!error&&data?.signedUrl)evidence.push({report:r,url:data.signedUrl});
  }
  const sheetHtml=sheets.map(s=>'<section><h2>'+esc(clubName(s.club_id))+' team sheet · '+esc(s.status)+'</h2><p><b>Starting XI</b></p><ol>'+((s.starting_player_ids||[]).map(id=>'<li>'+esc(playerName(id))+'</li>').join('')||'<li>Not submitted</li>')+'</ol><p><b>Substitutes</b></p><ol>'+((s.substitute_player_ids||[]).map(id=>'<li>'+esc(playerName(id))+'</li>').join('')||'<li>None recorded</li>')+'</ol><p>Submitted: '+esc(dateTime(s.submitted_at))+' · Reviewed: '+esc(dateTime(s.reviewed_at))+' · '+esc(s.review_note||'')+'</p></section>').join('');
  const reportHtml=reports.map(r=>'<section><h2>'+esc(r.report_type.replaceAll('_',' '))+' report · '+esc(r.status)+'</h2><p>Submitted: '+esc(dateTime(r.submitted_at))+' · OCR state: '+esc(r.ocr_status)+' · confidence: '+(r.ocr_confidence==null?'—':Number(r.ocr_confidence).toFixed(1)+'%')+'</p><h3>Structured report</h3><pre>'+esc(JSON.stringify(r.report_data,null,2))+'</pre><h3>Machine OCR (unverified)</h3><pre>'+esc(r.ocr_text||'No OCR text')+'</pre><h3>Super Admin verified text</h3><pre>'+esc(r.verified_text||'Not verified')+'</pre><p>Review note: '+esc(r.review_note||'—')+'</p></section>').join('');
  const evidenceHtml=evidence.map(e=>'<figure><figcaption>'+esc(e.report.report_type.replaceAll('_',' '))+' evidence</figcaption><img src="'+esc(e.url)+'"></figure>').join('');
  const exceptions=ops.allIssues.map(x=>'<li>'+esc(x)+'</li>').join('')||'<li>No operational exceptions detected.</li>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>SLFA Match Dossier</title><style>body{font:13px Arial;color:#183a2a;padding:26px;line-height:1.5}h1{color:#075b35}h2{font-size:16px;border-bottom:1px solid #dce8df;padding-bottom:6px;margin-top:24px}h3{font-size:13px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f8f6;padding:10px;border-radius:8px}img{max-width:100%;max-height:560px;object-fit:contain;display:block;margin:12px auto;border:1px solid #ddd}section{break-inside:avoid;border-bottom:1px solid #ddd;padding-bottom:14px}.meta{padding:12px;background:#f2f8f3;border-radius:8px}.flag{color:#9a6617}figure{break-inside:avoid}</style></head><body><h1>Koroma Leone Tech · SLFA Match Operations</h1><h2>Official match dossier</h2><div class="meta"><b>'+esc(clubName(f.home_club_id)+' vs '+clubName(f.away_club_id))+'</b><br>Competition: '+esc(cache.competitions.find(c=>c.id===competitionId)?.name||'')+'<br>Kick-off: '+esc(dateTime(f.kickoff_at))+'<br>Venue: '+esc(f.venue||'Not recorded')+'<br>Fixture status: '+esc(f.status)+'<br>Command status: '+esc(ops.state)+'<br>Fixture score: '+esc(f.home_score==null?'Not recorded':f.home_score+' – '+f.away_score)+'</div><h2>Readiness and compliance</h2><ul class="flag">'+exceptions+'</ul><h2>Official appointments</h2><ul>'+cache.assignments.filter(a=>a.fixture_id===f.id).map(a=>'<li>'+esc(a.role.replaceAll('_',' '))+' · '+esc(cache.members.find(m=>m.user_id===a.user_id)?.full_name||a.user_id)+'</li>').join('')+'</ul><h2>Team sheets</h2>'+sheetHtml+'<h2>Match reports and verification</h2>'+reportHtml+'<h2>Photographic evidence</h2>'+evidenceHtml+'<p><b>Evidence note:</b> Machine OCR is not an official transcription until reviewed against the original photograph. This dossier reflects the database records at the time it was generated.</p><script>window.onload=function(){window.print()};</script></body></html>';
  w.document.open();w.document.write(html);w.document.close();
 }catch(e){w.close();say(e?.message||'Match dossier could not be generated.');}
}

function teamPlayers(clubId,fixtureId){
 const old=cache.sheets.find(s=>s.fixture_id===fixtureId&&s.club_id===clubId);
 const list=cache.players.filter(p=>p.club_id===clubId&&p.status==='active');
 return '<div class="slfa-player-list">'+list.map(p=>'<label class="slfa-player"><input type="checkbox" data-start-player value="'+esc(p.id)+'" '+(old?.starting_player_ids?.includes(p.id)?'checked':'')+'><b>'+esc((p.shirt_number?'#'+p.shirt_number+' ':'')+p.full_name)+'</b><small>XI</small><input type="checkbox" data-sub-player value="'+esc(p.id)+'" '+(old?.substitute_player_ids?.includes(p.id)?'checked':'')+'><small>Sub</small></label>').join('')+'</div>';
}
function teamsheets(){
 const assigned=teamClubs(),open=cache.fixtures.filter(f=>f.status==='scheduled'&&f.kickoff_at&&new Date(f.kickoff_at)>new Date(Date.now()+1200000));
 const own=open.filter(f=>assigned.some(id=>[f.home_club_id,f.away_club_id].includes(id)));
 const form=assigned.length?'<div class="slfa-card"><h3>Submit a club team sheet</h3><p class="slfa-sub">Select exactly 11 starters and up to 9 substitutes. Team sheets close 20 minutes before kick-off.</p><form id="slfaTeamSheetForm"><div class="slfa-grid"><div class="slfa-field"><label>Assigned club</label>'+select('club_id',assigned.map(id=>({value:id,label:clubName(id)})),'Select club')+'</div><div class="slfa-field"><label>Scheduled fixture</label>'+select('fixture_id',own.map(f=>({value:f.id,label:clubName(f.home_club_id)+' vs '+clubName(f.away_club_id)+' · '+dateTime(f.kickoff_at)})),'Select fixture')+'</div></div><div id="slfaSheetPlayers" style="margin-top:12px"><div class="slfa-empty">Select club and fixture to load the squad.</div></div><div class="slfa-actions"><button class="slfa-btn primary" type="submit">Submit team sheet to Super Admin</button></div></form></div>':'';
 if(isAdmin())return form+'<div class="slfa-card"><h3>Super Admin team sheet inbox</h3><p class="slfa-sub">Approve or return the submitted XI and substitutes. Approved team sheets are locked.</p><div class="slfa-table-wrap"><table><thead><tr><th>Fixture / Club</th><th>Starting XI</th><th>Substitutes</th><th>Status</th><th>Review</th></tr></thead><tbody>'+
 (cache.sheets.length?cache.sheets.map(s=>'<tr><td>'+esc(fixtureName(s.fixture_id))+'<br>'+esc(clubName(s.club_id))+'</td><td>'+esc((s.starting_player_ids||[]).map(playerName).join(', '))+'</td><td>'+esc((s.substitute_player_ids||[]).map(playerName).join(', ')||'—')+'</td><td><span class="slfa-badge '+(s.status==='pending'?'warn':'')+'">'+esc(s.status)+'</span><br>'+esc(s.review_note||'')+'</td><td>'+(s.status==='pending'?'<div class="slfa-review-box"><textarea data-sheet-note="'+esc(s.id)+'" placeholder="Required if returning"></textarea><div class="slfa-actions"><button class="slfa-btn primary" data-review-sheet="approved" data-id="'+esc(s.id)+'">Approve</button><button class="slfa-btn danger" data-review-sheet="returned" data-id="'+esc(s.id)+'">Return</button></div></div>':esc(s.reviewed_at?dateTime(s.reviewed_at):'—'))+'</td></tr>').join(''):'<tr><td colspan="5" class="slfa-empty">No team sheets submitted.</td></tr>')+'</tbody></table></div></div>';
 return form+'<div class="slfa-card"><h3>Your team-sheet history</h3><div class="slfa-table-wrap"><table><thead><tr><th>Fixture / Club</th><th>Status</th><th>Review note</th><th>Submitted</th></tr></thead><tbody>'+
 (cache.sheets.filter(s=>s.submitted_by===cache.userId||assigned.includes(s.club_id)).map(s=>'<tr><td>'+esc(fixtureName(s.fixture_id))+'<br>'+esc(clubName(s.club_id))+'</td><td>'+esc(s.status)+'</td><td>'+esc(s.review_note||'—')+'</td><td>'+esc(dateTime(s.submitted_at))+'</td></tr>').join('')||'<tr><td colspan="4" class="slfa-empty">No submissions yet. Your Super Admin must assign your club first.</td></tr>')+'</tbody></table></div></div>';
}

function reportForm(type){
 const role=type==='referee'?'referee':'match_commissioner';
 const fixtures=cache.fixtures.filter(f=>cache.assignments.some(a=>a.user_id===cache.userId&&a.role===role&&a.fixture_id===f.id&&a.is_active));
 if(!fixtures.length)return '';
 const players=cache.players.filter(p=>p.status==='active'&&fixtures.some(f=>[f.home_club_id,f.away_club_id].includes(p.club_id)));
 const playerField='<div class="slfa-field full"><label>Players involved (structured compliance check)</label><select class="slfa-multi-select" name="player_ids" multiple size="6">'+players.map(p=>'<option value="'+esc(p.id)+'">'+esc(clubName(p.club_id)+' · '+(p.shirt_number?'#'+p.shirt_number+' ':'')+p.full_name)+'</option>').join('')+'</select><small class="slfa-role-note">Select any players named in the report. The system will compare this list with both approved team sheets.</small></div>';
 return '<div class="slfa-card"><h3>Submit '+(type==='referee'?'referee match report':'Match Commissioner report')+'</h3><p class="slfa-sub">Only fixtures assigned to your account appear here. Attach photographs of handwritten reports or other evidence.</p><form data-match-report="'+type+'"><div class="slfa-grid"><div class="slfa-field full"><label>Assigned fixture</label>'+select('fixture_id',fixtures.map(f=>({value:f.id,label:fixtureName(f.id)})),'Select fixture')+'</div>'+
 (type==='referee'?'<div class="slfa-field"><label>Home score</label><input name="home_score" type="number" min="0" max="99" required></div><div class="slfa-field"><label>Away score</label><input name="away_score" type="number" min="0" max="99" required></div><div class="slfa-field full"><label>Goals, cards, substitutions and incidents</label><textarea name="events"></textarea></div>':'<div class="slfa-field full"><label>Match supervision and observations</label><textarea name="observations" required></textarea></div><div class="slfa-field full"><label>Recommendations / actions</label><textarea name="recommendations"></textarea></div>')+
 playerField+
 '<div class="slfa-field full"><label>Photographic evidence (up to 5 JPG, PNG or WebP images)</label><input type="file" name="evidence" accept="image/jpeg,image/png,image/webp" multiple></div><div class="slfa-field full"><label>OCR text / additional notes</label><textarea name="ocr_text" placeholder="OCR output will be added here after image processing"></textarea><small class="slfa-role-note">Handwriting OCR is assistive and can be inaccurate. The original photograph must be checked and the text verified by Super Admin.</small></div></div><div class="slfa-actions"><button class="slfa-btn primary" type="submit">Submit report and evidence</button></div></form></div>';
}
function reports(){
 const forms=(hasRole('referee')?reportForm('referee'):'')+(hasRole('match_commissioner')?reportForm('match_commissioner'):'');
 if(isAdmin())return forms+'<div class="slfa-card"><h3>Super Admin match report inbox</h3><p class="slfa-sub">Review structured records, machine OCR, evidence photographs and corrected text. OCR remains unverified until a person checks it.</p><div class="slfa-table-wrap"><table><thead><tr><th>Fixture / Type</th><th>OCR output</th><th>Evidence</th><th>Review</th></tr></thead><tbody>'+
 (cache.reports.length?cache.reports.map(r=>'<tr><td>'+esc(fixtureName(r.fixture_id))+'<br>'+esc(r.report_type.replaceAll('_',' '))+'<br><span class="slfa-badge '+(r.status==='pending'?'warn':'')+'">'+esc(r.status)+'</span></td><td><div class="slfa-report-text">'+esc(r.ocr_text||'No OCR text')+'</div><small>'+esc(r.ocr_status)+' · '+(r.ocr_confidence==null?'—':Number(r.ocr_confidence).toFixed(1)+'%')+'</small><br><small>Verified: '+esc(r.verified_text||'Not yet verified')+'</small></td><td><button class="slfa-btn" data-print-report="'+esc(r.id)+'">Open / print</button></td><td>'+(r.status==='pending'?'<div class="slfa-review-box"><textarea data-report-text="'+esc(r.id)+'" placeholder="Corrected OCR text">'+esc(r.verified_text||r.ocr_text||'')+'</textarea><textarea data-report-note="'+esc(r.id)+'" placeholder="Required if returning"></textarea><div class="slfa-actions"><button class="slfa-btn primary" data-review-report="reviewed" data-id="'+esc(r.id)+'">Verify & close</button><button class="slfa-btn danger" data-review-report="returned" data-id="'+esc(r.id)+'">Return</button></div></div>':'<small>Reviewed '+esc(dateTime(r.reviewed_at))+'</small>')+'</td></tr>').join(''):'<tr><td colspan="4" class="slfa-empty">No reports submitted.</td></tr>')+'</tbody></table></div></div>';
 return forms+'<div class="slfa-card"><h3>Your report submissions</h3><div class="slfa-table-wrap"><table><thead><tr><th>Fixture</th><th>Type</th><th>OCR</th><th>Review</th><th>Submitted</th></tr></thead><tbody>'+
 (cache.reports.filter(r=>r.submitted_by===cache.userId).map(r=>'<tr><td>'+esc(fixtureName(r.fixture_id))+'</td><td>'+esc(r.report_type)+'</td><td>'+esc(r.ocr_status)+(r.ocr_confidence==null?'':' · '+Number(r.ocr_confidence).toFixed(0)+'%')+'</td><td>'+esc(r.status+' '+(r.review_note||''))+'</td><td>'+esc(dateTime(r.submitted_at))+'</td></tr>').join('')||'<tr><td colspan="5" class="slfa-empty">No reports yet. You must be assigned to a fixture.</td></tr>')+'</tbody></table></div></div>';
}
function officials(){
 if(!isAdmin())return '<div class="slfa-card"><h3>Restricted access</h3><p class="slfa-sub">Super Admin or association administrator access is required to assign officials.</p></div>';
 return '<div class="slfa-card"><h3>Assign match officials and Team Officials</h3><p class="slfa-sub">Users must already be active members of this association workspace. Match officials are fixture-specific; a Team Official is assigned to a club.</p><form id="slfaAssignForm"><div class="slfa-grid"><div class="slfa-field"><label>Staff member</label>'+select('user_id',cache.members.map(m=>({value:m.user_id,label:m.full_name+' · '+m.role})),'Select staff account')+'</div><div class="slfa-field"><label>Role</label>'+select('role',[{value:'competition_admin',label:'Association Super Admin'},{value:'referee',label:'Referee'},{value:'assistant_referee',label:'Assistant Referee'},{value:'match_commissioner',label:'Match Commissioner'},{value:'team_official',label:'Team Official'}],'Select role')+'</div><div class="slfa-field" id="slfaAssignFixtureWrap"><label>Fixture</label>'+select('fixture_id',cache.fixtures.map(f=>({value:f.id,label:fixtureName(f.id)})),'Select fixture')+'</div><div class="slfa-field" id="slfaAssignClubWrap" hidden><label>Club</label>'+select('club_id',cache.clubs.map(c=>({value:c.id,label:c.name})),'Select club')+'</div></div><div class="slfa-actions"><button class="slfa-btn primary" type="submit">Save assignment</button></div></form></div>'+
 '<div class="slfa-card"><h3>Current assignments</h3><div class="slfa-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Fixture / Club</th><th>Status</th></tr></thead><tbody>'+
 (cache.compMembers.filter(m=>m.role==='competition_admin').map(m=>'<tr><td>'+esc(cache.members.find(x=>x.user_id===m.user_id)?.full_name||m.user_id)+'</td><td>Association Super Admin</td><td>All competitions / selected competition</td><td>Active</td></tr>').join('')+cache.assignments.map(a=>'<tr><td>'+esc(cache.members.find(m=>m.user_id===a.user_id)?.full_name||a.user_id)+'</td><td>'+esc(a.role.replaceAll('_',' '))+'</td><td>'+esc(a.role==='team_official'?clubName(a.club_id):fixtureName(a.fixture_id))+'</td><td>Active</td></tr>').join('')||'<tr><td colspan="4" class="slfa-empty">No assignments yet.</td></tr>')+'</tbody></table></div></div>';
}
function setup(){
 return '<div class="slfa-card"><h3>Association installation checklist</h3><p class="slfa-sub">The match operations app uses the existing competition, season, club, player and fixture records. No duplicate master records are created.</p>'+
 '<div class="slfa-step"><span class="slfa-step-num">1</span><div><b>Configure competitions</b><small>Create competitions and seasons, set points and status.</small></div></div>'+
 '<div class="slfa-step"><span class="slfa-step-num">2</span><div><b>Register clubs and players</b><small>Add each club and its active registered squad members.</small></div></div>'+
 '<div class="slfa-step"><span class="slfa-step-num">3</span><div><b>Schedule fixtures</b><small>Enter home/away teams, venue and kick-off. Team sheets close 20 minutes before kick-off.</small></div></div>'+
 '<div class="slfa-step"><span class="slfa-step-num">4</span><div><b>Create staff accounts and assign roles</b><small>Add staff under Employees, then assign officials by fixture or club.</small></div></div>'+
 '<div class="slfa-actions">'+button('Open Competition Setup','league','primary')+button('Open Employees','employees')+button('Open Audit Trail','audit')+'</div></div>'+
 '<div class="slfa-card"><h3>Operational permissions</h3><div class="slfa-table-wrap"><table><thead><tr><th>Role</th><th>Actions</th></tr></thead><tbody><tr><td>Association Super Admin</td><td>Assign officials; approve or return team sheets and match reports; verify OCR.</td></tr><tr><td>Referee</td><td>Submit match score, events and photographic evidence for assigned fixtures.</td></tr><tr><td>Match Commissioner</td><td>Submit supervision reports and photographic evidence for assigned fixtures.</td></tr><tr><td>Team Official</td><td>Submit XI and substitutes for the club assigned to them.</td></tr></tbody></table></div></div>';
}
function licence(){
 const l=cache.license||{};
 return '<div class="slfa-card"><h3>SLFA Match Operations product licence</h3><p class="slfa-sub">The application is licensed as a separate Koroma Leone Tech product. This product licence is separate from the general SME workspace subscription.</p><div class="slfa-kpis">'+stat('Status',l.status||'Not issued','Managed by Koroma Leone Tech')+stat('Package',l.package_name||'—','Product tier')+stat('Valid until',l.valid_until?shortDate(l.valid_until):'Not set','Expiry date')+stat('User seats',l.seat_limit??'—','Maximum authorised accounts')+'</div><div class="slfa-grid"><div class="slfa-field"><label>Agreement reference</label><input disabled value="'+esc(l.agreement_reference||'Not recorded')+'"></div><div class="slfa-field"><label>Licence start</label><input disabled value="'+esc(l.starts_on||'Not set')+'"></div><div class="slfa-field full"><label>Licence notes</label><textarea disabled>'+esc(l.notes||'No licence notes recorded')+'</textarea></div></div></div>';
}
function content(){
 if(!competitionId)return '<div class="slfa-card"><h3>Set up the first competition</h3><p class="slfa-sub">Create a competition, season, clubs, players and fixtures to start using matchday operations.</p><div class="slfa-actions">'+button('Start Competition Setup','league','primary')+'</div></div>'+setup();
 if(activeTab==='overview')return overview();if(activeTab==='teamsheets')return teamsheets();if(activeTab==='reports')return reports();if(activeTab==='officials')return officials();if(activeTab==='setup')return setup();if(activeTab==='licence')return licence();return overview();
}
async function render(){
 styles();const view=$('view');if(!view)return;view.innerHTML='<div class="slfa-card"><h3>SLFA Match Operations</h3><p class="slfa-sub">Loading association records and access permissions…</p></div>';
 try{
  await load();
  const l=cache.license||{},today=new Date().toISOString().slice(0,10);
  const valid=l.status==='active'&&(!l.starts_on||l.starts_on<=today)&&(!l.valid_until||l.valid_until>=today);
  if(!valid){view.innerHTML='<div class="slfa-ops">'+hero()+'<div class="slfa-card"><h3>Product licence not active</h3><p class="slfa-sub">The application is installed for this association, but the Koroma Leone Tech product licence is not currently active. Team-sheet and match-report actions remain locked until activation.</p>'+licence()+'</div></div>';return;}
  const access=isAdmin()?'Association Super Admin':(hasRole('referee')?'Referee':(hasRole('match_commissioner')?'Match Commissioner':(teamClubs().length?'Team Official':'Association Member')));
  view.innerHTML='<div class="slfa-ops">'+hero()+'<div id="slfaOpsNotice" class="slfa-notice" hidden></div><div class="slfa-card"><div class="slfa-grid"><div class="slfa-field"><label>Competition workspace</label>'+select('competition_id',cache.competitions.map(c=>({value:c.id,label:c.name})),'Select competition')+'</div><div class="slfa-field"><label>Current access</label><input disabled value="'+esc(access)+'"></div></div></div>'+tabsHtml()+content()+'</div>';
  const chooser=view.querySelector('[name="competition_id"]');if(chooser){chooser.value=competitionId;chooser.onchange=()=>{competitionId=chooser.value;activeTab='overview';render();};}
  bind();
 }catch(error){view.innerHTML='<div class="slfa-ops">'+hero()+'<div class="slfa-card"><h3>Match Operations could not load</h3><p class="slfa-sub">'+esc(error?.message||error)+'</p><div class="slfa-actions">'+button('Retry','reload','primary')+'</div></div></div>';bind();}
}
function bind(){
 const v=$('view');if(!v)return;
 v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;render();});
 v.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='reload')render();else if(a==='export-command')exportCommandCsv();else if(a.startsWith('dossier:'))printMatchDossier(a.slice(8));else if(a==='league')window.setPage?.('league');else if(a==='employees')window.setPage?.('employees');else if(a==='audit')window.setPage?.('audit');else if(a.startsWith('tab:')){activeTab=a.slice(4);render();}});
 const sheet=$('slfaTeamSheetForm');
 if(sheet){
  const club=sheet.querySelector('[name="club_id"]'),fixture=sheet.querySelector('[name="fixture_id"]'),host=$('slfaSheetPlayers');
  const fill=()=>host.innerHTML=club.value&&fixture.value?'<p class="slfa-role-note">Tick the XI box for starters and the Sub box for substitutes.</p>'+teamPlayers(club.value,fixture.value):'<div class="slfa-empty">Select club and fixture to load the registered squad.</div>';
  club.onchange=fill;fixture.onchange=fill;
  sheet.onsubmit=async e=>{e.preventDefault();const fd=new FormData(sheet),starts=Array.from(sheet.querySelectorAll('[data-start-player]:checked')).map(x=>x.value),subs=Array.from(sheet.querySelectorAll('[data-sub-player]:checked')).map(x=>x.value);
   if(starts.length!==11||subs.length>9){say('Select exactly 11 starters and no more than 9 substitutes.');return;}if(starts.some(x=>subs.includes(x))){say('A player cannot appear as both starter and substitute.');return;}
   const submit=sheet.querySelector('[type="submit"]');submit.disabled=true;
   try{const {error}=await client().rpc('slfa_match_ops_submit_team_sheet',{p_business_id:business().id,p_competition_id:competitionId,p_fixture_id:fd.get('fixture_id'),p_club_id:fd.get('club_id'),p_starting_player_ids:starts,p_substitute_player_ids:subs});if(error)throw error;activeTab='teamsheets';await render();say('Team sheet submitted to the Super Admin review inbox.');}
   catch(err){say(err.message||'Team sheet could not be submitted.');submit.disabled=false;}
  };
 }
 v.querySelectorAll('[data-review-sheet]').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,decision=b.dataset.reviewSheet,note=v.querySelector('[data-sheet-note="'+id+'"]')?.value||'';if(decision==='returned'&&note.trim().length<5){say('Add a correction note of at least 5 characters.');return;}b.disabled=true;try{const {error}=await client().rpc('slfa_match_ops_review_team_sheet',{p_sheet_id:id,p_decision:decision,p_review_note:note});if(error)throw error;await render();say('Team sheet review saved.');}catch(err){say(err.message||'Review failed.');b.disabled=false;}});
 v.querySelectorAll('form[data-match-report]').forEach(form=>form.onsubmit=async e=>{
  e.preventDefault();const type=form.dataset.matchReport,fd=new FormData(form),files=Array.from(form.querySelector('[name="evidence"]')?.files||[]);if(files.length>5){say('Attach no more than five photographs.');return;}
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;let text=String(fd.get('ocr_text')||''),confidence=null,status='not_run',paths=[];
  try{
   if(files.length){const result=await runOcr(files);text=[text,result.text].filter(Boolean).join('\n\n');confidence=result.confidence;status=result.status;}
   for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Evidence must be JPG, PNG or WebP.');if(file.size>15*1024*1024)throw new Error('Each image must be 15 MB or smaller.');
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type],path=[business().id,competitionId,fd.get('fixture_id'),cache.userId,crypto.randomUUID()+'.'+ext].join('/');
    const {data,error}=await client().storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;paths.push(data.path);
   }
   const playerIds=Array.from(form.querySelector('[name="player_ids"]')?.selectedOptions||[]).map(option=>option.value);\n   const data=type==='referee'?{home_score:Number(fd.get('home_score')),away_score:Number(fd.get('away_score')),events:String(fd.get('events')||''),player_ids:playerIds}:{observations:String(fd.get('observations')||''),recommendations:String(fd.get('recommendations')||''),player_ids:playerIds};
   const {error}=await client().rpc('slfa_match_ops_submit_report',{p_business_id:business().id,p_competition_id:competitionId,p_fixture_id:fd.get('fixture_id'),p_report_type:type,p_report_data:data,p_evidence_paths:paths,p_ocr_text:text,p_ocr_status:status,p_ocr_confidence:confidence});if(error)throw error;
   activeTab='reports';await render();say('Match report submitted with structured details, OCR and photographic evidence.');
  }catch(err){if(paths.length)try{await client().storage.from(BUCKET).remove(paths)}catch(_){}say(err.message||'Match report could not be submitted.');submit.disabled=false;}
 });
 v.querySelectorAll('[data-review-report]').forEach(b=>b.onclick=async()=>{const id=b.dataset.id,decision=b.dataset.reviewReport,text=v.querySelector('[data-report-text="'+id+'"]')?.value||'',note=v.querySelector('[data-report-note="'+id+'"]')?.value||'';if(decision==='returned'&&note.trim().length<5){say('Add a correction note of at least 5 characters.');return;}b.disabled=true;try{const {error}=await client().rpc('slfa_match_ops_review_report',{p_report_id:id,p_decision:decision,p_verified_text:text,p_review_note:note});if(error)throw error;await render();say('Match report review saved.');}catch(err){say(err.message||'Review failed.');b.disabled=false;}});
 const assign=$('slfaAssignForm');
 if(assign){const role=assign.querySelector('[name="role"]'),fwrap=$('slfaAssignFixtureWrap'),cwrap=$('slfaAssignClubWrap'),toggle=()=>{const team=role.value==='team_official',superAdmin=role.value==='competition_admin';fwrap.hidden=team||superAdmin;cwrap.hidden=!team;};role.onchange=toggle;toggle();assign.onsubmit=async e=>{e.preventDefault();const d=new FormData(assign),r=d.get('role');try{const rpcName=r==='competition_admin'?'slfa_match_ops_assign_super_admin':'slfa_match_ops_assign_official';const rpcArgs=r==='competition_admin'?{p_business_id:business().id,p_competition_id:competitionId,p_user_id:d.get('user_id')}:{p_business_id:business().id,p_competition_id:competitionId,p_user_id:d.get('user_id'),p_role:r,p_fixture_id:r==='team_official'?null:d.get('fixture_id'),p_club_id:r==='team_official'?d.get('club_id'):null};const {error}=await client().rpc(rpcName,rpcArgs);if(error)throw error;await render();say('Official assignment saved.');}catch(err){say(err.message||'Official assignment could not be saved.');}};}
 v.querySelectorAll('[data-print-report]').forEach(b=>b.onclick=()=>printReport(b.dataset.printReport));\n v.querySelectorAll('[data-alert-read]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {error}=await client().from('slfa_match_ops_notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.alertRead);if(error)throw error;await render();}catch(e){say(e.message||'Alert could not be marked read.');b.disabled=false;}});
}
async function loadTesseract(){
 if(window.Tesseract)return window.Tesseract;
 if(!ocrLoader)ocrLoader=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.async=true;s.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR engine failed to initialise.'));s.onerror=()=>reject(new Error('OCR library could not load. Check your internet connection.'));document.head.appendChild(s);});
 return ocrLoader;
}
async function runOcr(files){
 try{const T=await loadTesseract(),parts=[],confidence=[];for(const file of files){const r=await T.recognize(file,'eng');const t=String(r?.data?.text||'').trim();if(t)parts.push(t);const n=Number(r?.data?.confidence);if(Number.isFinite(n))confidence.push(n);}const avg=confidence.length?confidence.reduce((a,b)=>a+b,0)/confidence.length:null;return{text:parts.join('\n\n'),confidence:avg,status:parts.length?'needs_review':'failed'};}
 catch(e){return{text:'OCR could not complete: '+(e?.message||'unknown error'),confidence:null,status:'failed'};}
}
async function printReport(id){
 try{const r=cache.reports.find(x=>x.id===id);if(!r)return;const urls=[];for(const path of r.evidence_paths||[]){const {data,error}=await client().storage.from(BUCKET).createSignedUrl(path,1800);if(!error&&data?.signedUrl)urls.push(data.signedUrl);}
 const html='<!doctype html><html><head><meta charset="utf-8"><title>SLFA Match Report</title><style>body{font:13px Arial;color:#173626;padding:24px}h1{color:#075b35}h2{font-size:15px;border-bottom:1px solid #ddd;padding-bottom:6px}pre{white-space:pre-wrap;font:12px/1.5 Arial}img{max-width:100%;max-height:520px;object-fit:contain;display:block;margin:12px auto;border:1px solid #ddd}.meta{padding:10px;background:#f2f8f3;border-radius:8px}</style></head><body><h1>Koroma Leone Tech · SLFA Match Operations</h1><h2>'+esc(r.report_type.replaceAll('_',' '))+'</h2><div class="meta">'+esc(fixtureName(r.fixture_id))+'<br>Submitted: '+esc(dateTime(r.submitted_at))+'<br>Status: '+esc(r.status)+'</div><h2>Structured report</h2><pre>'+esc(JSON.stringify(r.report_data,null,2))+'</pre><h2>Machine OCR (unverified)</h2><pre>'+esc(r.ocr_text||'No OCR extraction')+'</pre><h2>Super Admin verified text</h2><pre>'+esc(r.verified_text||'Not verified')+'</pre><h2>Photographic evidence</h2>'+urls.map(u=>'<img src="'+esc(u)+'">').join('')+'<p>Machine OCR must be checked against the original photographs.</p><script>window.onload=function(){window.print()};</script></body></html>';
 const w=window.open('','_blank');if(!w){say('Allow pop-ups to open the printable report.');return;}w.document.open();w.document.write(html);w.document.close();
 }catch(e){say(e?.message||'Report could not be opened.');}
}
window.KoromaSlfaMatchOperations={render};
})();