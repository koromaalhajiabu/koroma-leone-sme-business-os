(function(){
'use strict';
const URL='https://nclncqlgnxnijlumznnt.supabase.co';
const KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),portalCode=params.get('school');
const client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let profile=null;
function msg(id,s){$(id).textContent=s}
function table(headers,rows){return '<table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v??'—')+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">No records available yet.</td></tr>')+'</tbody></table>'}
async function load(){
 const {data,error}=await client.rpc('school_student_portal_data');if(error)throw error;
 const d=data||{},s=d.student||{};
 $('schoolName').textContent=d.school_name||'Student Portal';
 $('studentName').textContent=(s.first_name||'')+' '+(s.last_name||'');
 $('studentMeta').textContent='Student ID: '+(s.admission_number||'—')+' · Class: '+(s.class_name||'Not assigned')+' · '+(s.academic_year||'');
 const a=d.attendance||{};
 $('metrics').innerHTML=[['Attendance records',a.total||0],['Present',a.present||0],['Absent',a.absent||0],['Late',a.late||0],['Assignments',(d.assignments||[]).length],['Library books',(d.library_loans||[]).filter(x=>['issued','overdue'].includes(x.status)).length]].map(x=>'<div class="metric"><b>'+esc(x[1])+'</b><span>'+esc(x[0])+'</span></div>').join('');
 const days=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 $('timetable').innerHTML=table(['Day','Time','Subject','Teacher','Room'],(d.timetable||[]).map(x=>[days[x.day_of_week]||'',String(x.starts_at||'').slice(0,5)+'–'+String(x.ends_at||'').slice(0,5),x.subject,x.teacher,x.room]));
 $('results').innerHTML=table(['Examination','Date','Score','Maximum','Percentage','Remarks'],(d.results||[]).map(x=>[x.exam,x.date,x.score,x.maximum,(x.percentage??'')+'%',x.remarks]));
 $('reports').innerHTML=(d.report_cards||[]).length?(d.report_cards||[]).map(x=>'<div class="status"><b>'+esc(x.title)+'</b> · '+esc(x.score??'—')+' · Grade '+esc(x.grade||'—')+'<br>Class position: '+esc(x.position||'—')+'<br>'+esc(x.teacher_comment||'')+' '+esc(x.principal_comment||'')+'</div>').join(''):'<p class="muted">No published report cards yet.</p>';
 $('assignments').innerHTML=(d.assignments||[]).length?(d.assignments||[]).map(x=>'<div class="status"><b>'+esc(x.title)+'</b> · '+esc(x.subject)+'<br>'+esc(x.instructions||'')+'<br>Due: '+esc(x.due_at||'Not specified')+'</div>').join(''):'<p class="muted">No published assignments yet.</p>';
 $('library').innerHTML=table(['Book','Issued','Due','Returned','Status'],(d.library_loans||[]).map(x=>[x.book,x.issued_on,x.due_on,x.returned_on,x.status]));
 $('fees').innerHTML=table(['Invoice','Description','Term','Amount','Due date','Status'],(d.fees||[]).map(x=>[x.invoice,x.description,x.term,x.amount,x.due_date,x.status]));
 $('loginCard').classList.add('hidden');$('dashboard').classList.remove('hidden');
 const must=!!(client.auth.getUser && (await client.auth.getUser()).data.user?.user_metadata?.must_change_password);
 if(must){$('dashboard').classList.add('hidden');$('passwordCard').classList.remove('hidden')}
}
async function init(){
 if(!portalCode){msg('loginStatus','Your school portal link is incomplete. Ask the school for its official Student Portal link.');$('loginForm').querySelector('button').disabled=true;return}
 const p=await client.rpc('school_get_public_portal_profile',{p_portal_code:portalCode});
 if(p.error||!p.data?.length){msg('loginStatus','This school portal could not be found or is disabled.');$('loginForm').querySelector('button').disabled=true;return}
 profile=p.data[0];$('schoolName').textContent=profile.school_name||'Student Portal';
 const session=await client.auth.getSession();if(session.data.session){try{await load()}catch(e){await client.auth.signOut();msg('loginStatus',e.message)}}
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=$('loginBtn');b.disabled=true;msg('loginStatus','Checking student account…');
 try{
  const resolved=await client.functions.invoke('school-student-accounts',{body:{action:'resolve_login',portal_code:portalCode,admission_number:$('studentId').value.trim(),full_name:$('studentFullName').value.trim()}});
  if(resolved.error||resolved.data?.error)throw new Error(resolved.data?.error||resolved.error?.message||'Student account lookup failed.');
  const signed=await client.auth.signInWithPassword({email:resolved.data.email,password:$('password').value});
  if(signed.error)throw signed.error;await load();msg('loginStatus','Signed in successfully.');
 }catch(err){msg('loginStatus',err.message||'Sign-in failed.');}finally{b.disabled=false}
});

$('activateForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=$('activateBtn');b.disabled=true;msg('activationStatus','Activating your account…');
 try{
  const body={action:'activate',portal_code:portalCode,admission_number:$('activateStudentId').value.trim(),full_name:$('activateFullName').value.trim(),activation_code:$('activationCode').value.trim(),password:$('activatePassword').value};
  const r=await client.functions.invoke('school-student-accounts',{body});
  if(r.error||r.data?.error)throw new Error(r.data?.error||r.error?.message||'Activation failed');
  const signed=await client.auth.signInWithPassword({email:r.data.email,password:body.password});
  if(signed.error)throw signed.error;await load();msg('activationStatus','Account activated successfully.');
 }catch(err){msg('activationStatus',err.message||'Activation failed')}finally{b.disabled=false}
});
$('passwordForm').addEventListener('submit',async e=>{
 e.preventDefault();const a=$('newPassword').value,b=$('confirmPassword').value;
 if(a.length<8||a!==b){msg('passwordStatus','Passwords must match and contain at least 8 characters.');return}
 const {data,error}=await client.auth.updateUser({password:a,data:{must_change_password:false}});
 if(error){msg('passwordStatus',error.message);return}
 $('passwordCard').classList.add('hidden');try{await load()}catch(err){msg('passwordStatus',err.message)}
});
$('signOut').addEventListener('click',async()=>{await client.auth.signOut();location.reload()});
init().catch(e=>msg('loginStatus',e.message||'Student portal failed to load.'));
})();