(function(){
'use strict';
if(window.__wlSchoolAnalyticsInstalled)return;
window.__wlSchoolAnalyticsInstalled=true;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function card(label,value,detail){return '<div class="wls-stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>'}
function panel(host){
var tabs=host.querySelector('.wls-tabs');if(!tabs||tabs.querySelector('[data-wl-analytics]'))return;
var btn=document.createElement('button');btn.type='button';btn.className='wls-tab';btn.textContent='Academic Analytics';btn.setAttribute('data-wl-analytics','1');
tabs.appendChild(btn);
btn.addEventListener('click',function(){
tabs.querySelectorAll('.wls-tab').forEach(function(x){x.classList.toggle('active',x===btn)});
var old=host.querySelector('[data-wl-analytics-panel]');if(old)old.remove();
var content=document.createElement('div');content.setAttribute('data-wl-analytics-panel','1');content.innerHTML='<div class="wls-panel">Loading academic analytics…</div>';
tabs.insertAdjacentElement('afterend',content);
var cloud=window.whiteLionCloud,client=cloud&&cloud.getClient&&cloud.getClient(),business=cloud&&cloud.getActiveBusiness&&cloud.getActiveBusiness();
if(!client||!business||!business.id){content.innerHTML='<div class="wls-panel">Sign in to view school analytics.</div>';return}
Promise.all([
client.from('school_analytics_student_performance').select('student_id,class_id,exam_id,exam_title,percentage').eq('business_id',business.id),
client.from('school_analytics_class_summary').select('class_id,result_count,students_assessed,average_percentage,pass_rate').eq('business_id',business.id),
client.from('school_analytics_attendance_summary').select('student_id,attendance_records,present_or_late,absences,attendance_rate').eq('business_id',business.id),
client.from('school_classes').select('id,name').eq('business_id',business.id),
client.from('school_students').select('id,first_name,last_name,class_id').eq('business_id',business.id)
]).then(function(rs){
rs.forEach(function(r){if(r.error)throw r.error});
var results=rs[0].data||[],classes=rs[3].data||[],students=rs[4].data||[],attendance=rs[2].data||[];
var avg=results.length?results.reduce(function(n,x){return n+Number(x.percentage||0)},0)/results.length:0;
var passed=results.filter(function(x){return Number(x.percentage)>=50}).length;
var passRate=results.length?passed/results.length*100:0;
var attendN=attendance.reduce(function(n,x){return n+Number(x.attendance_records||0)},0);
var attendOk=attendance.reduce(function(n,x){return n+Number(x.present_or_late||0)},0);
var attendRate=attendN?attendOk/attendN*100:0;
var byStudent={};results.forEach(function(x){var v=byStudent[x.student_id]||(byStudent[x.student_id]={sum:0,count:0});v.sum+=Number(x.percentage||0);v.count++});
var top=Object.keys(byStudent).map(function(id){var st=students.find(function(x){return x.id===id})||{},v=byStudent[id];return {name:(st.first_name||'')+' '+(st.last_name||''),className:(classes.find(function(c){return c.id===st.class_id})||{}).name||'—',avg:v.sum/v.count,count:v.count}}).sort(function(a,b){return b.avg-a.avg}).slice(0,10);
var byClass={};results.forEach(function(x){var key=x.class_id||'none',v=byClass[key]||(byClass[key]={sum:0,count:0});v.sum+=Number(x.percentage||0);v.count++});
var classRows=Object.keys(byClass).map(function(id){var v=byClass[id];return {name:(classes.find(function(c){return c.id===id})||{}).name||'Unassigned',avg:v.sum/v.count,count:v.count}}).sort(function(a,b){return b.avg-a.avg});
function rows(items,fn){return items.length?items.map(fn).join(''):'<tr><td class="wls-empty" colspan="5">No records available yet.</td></tr>'}
function bar(label,val){var n=Math.max(0,Math.min(100,Number(val)||0));return '<div style="display:grid;grid-template-columns:minmax(90px,1fr) 3fr 48px;gap:8px;align-items:center;margin:10px 0"><b>'+esc(label)+'</b><div style="height:10px;background:#e8eee9;border-radius:10px;overflow:hidden"><div style="height:100%;width:'+n.toFixed(1)+'%;background:linear-gradient(90deg,#176b49,#d2b56f)"></div></div><b style="text-align:right">'+n.toFixed(1)+'%</b></div>'}
content.innerHTML='<div class="wls-stats">'+card('Exam results',results.length,'Scored records')+card('Average performance',results.length?avg.toFixed(1)+'%':'—','All recorded scores')+card('Pass rate',results.length?passRate.toFixed(1)+'%':'—','50% provisional benchmark')+card('Attendance rate',attendN?attendRate.toFixed(1)+'%':'—','Present or late marks')+'</div><div class="wls-grid"><div class="wls-panel"><h3>Class performance</h3><p class="wls-muted">Average percentage from entered examination results.</p>'+(classRows.length?classRows.map(function(x){return bar(x.name,x.avg)}).join(''):'<div class="wls-empty">Enter examination results to see class performance.</div>')+'</div><div class="wls-panel"><h3>Attendance overview</h3><p class="wls-muted">Present and late records as a share of all recorded attendance.</p>'+bar('School attendance',attendRate)+'<p class="wls-muted">'+attendOk+' present/late out of '+attendN+' attendance records.</p></div></div><div class="wls-panel"><h3>Top student performers</h3><p class="wls-muted">Ranked by average percentage across available examination results.</p><div class="wls-table-wrap"><table class="wls-table"><thead><tr><th>Rank</th><th>Student</th><th>Class</th><th>Average</th><th>Results</th></tr></thead><tbody>'+rows(top,function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.className)+'</td><td><b>'+x.avg.toFixed(1)+'%</b></td><td>'+x.count+'</td></tr>'})+'</tbody></table></div></div><div class="wls-panel"><h3>Analytics notes</h3><p class="wls-muted">The 50% pass benchmark is a provisional overview only. Official grades and report cards continue to use the school’s configured grading scale. Analytics update from the latest saved cloud records.</p></div>';
}).catch(function(err){content.innerHTML='<div class="wls-panel"><h3>Academic analytics could not load</h3><p class="wls-muted">'+esc(err.message||String(err))+'</p><p class="wls-muted">Check that the School Learning Module Enhancements SQL migration has been run in Supabase.</p></div>'});
});
}
function install(){
var api=window.WhiteLionSchool;if(!api||typeof api.render!=='function')return false;
if(api.__analyticsWrapped)return true;
var original=api.render;
api.render=function(){var result=original.apply(this,arguments);setTimeout(function(){var host=document.getElementById('view');if(host)panel(host)},350);return result};
api.__analyticsWrapped=true;
setTimeout(function(){var host=document.getElementById('view');if(host)panel(host)},600);
return true;
}
if(!install()){var count=0;var wait=setInterval(function(){count++;if(install()||count>40)clearInterval(wait)},250)}
})();
