(function(){
'use strict';
const SUPABASE_URL='https://nclncqlgnxnijlumznnt.supabase.co';
const SUPABASE_KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let data=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(id,text,error){const el=$(id);el.textContent=text;el.classList.remove('hidden','error');if(error)el.classList.add('error')}
function hide(id){$(id).classList.add('hidden')}
function showLogin(){ $('loginPanel').classList.remove('hidden');$('dashboard').classList.add('hidden');$('dashButtons').classList.add('hidden'); }
function studentsFor(sectionId){return (data.students||[]).filter(s=>s.section_id===sectionId)}
async function load(){
 const {data:result,error}=await client.rpc('campus_lecturer_portal_data');
 if(error)throw error;data=result;
 $('loginPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');$('dashButtons').classList.remove('hidden');
 $('campusTitle').textContent=data.campus_name||'Lecturer Portal';
 if(data.campus_crest){$('campusCrest').src=data.campus_crest;$('campusCrest').style.display='block'}
 const l=data.lecturer||{};
 $('lecturerWelcome').textContent='Welcome, '+l.first_name+' '+l.last_name+' · '+(l.job_title||'Lecturer');
 $('sectionCount').textContent=(data.sections||[]).length;
 $('studentCount').textContent=(data.students||[]).length;
 $('pendingCount').textContent=(data.students||[]).filter(s=>s.percentage_score==null).length;
 $('sections').innerHTML=(data.sections||[]).length?(data.sections||[]).map(sec=>{
   const n=studentsFor(sec.section_id).length;
   return '<div class="section-card"><b>'+esc(sec.course_code)+'</b> '+esc(sec.course_title)+' · section '+esc(sec.section_code)+'<div class="muted">'+esc(sec.term_name||'—')+' · '+esc(sec.credit_hours==null?'—':sec.credit_hours)+' credit hours · '+esc(sec.schedule||'No schedule set')+(sec.room?' · Room '+esc(sec.room):'')+'</div><span class="pill">'+n+' student(s) enrolled</span></div>';
 }).join(''):'<p class="muted">No course sections are currently assigned to you. Contact your campus administrator.</p>';
 $('gradeSection').innerHTML=(data.sections||[]).map(sec=>'<option value="'+esc(sec.section_id)+'">'+esc(sec.course_code+' · sec '+sec.section_code)+'</option>').join('');
 updateStudentsForSection();
}
function updateStudentsForSection(){
 const sectionId=$('gradeSection').value;
 const students=studentsFor(sectionId);
 $('studentsForSection').innerHTML=students.length?'<div class="tablewrap"><table><thead><tr><th>Student</th><th>No.</th><th>Status</th><th>Score %</th><th>Grade</th><th>GPA pts</th><th></th></tr></thead><tbody>'+students.map(s=>'<tr><td>'+esc(s.first_name+' '+s.last_name)+'</td><td>'+esc(s.student_number)+'</td><td><span class="pill">'+esc(s.status)+'</span></td><td><input type="number" min="0" max="100" step="0.1" data-score="'+esc(s.enrollment_id)+'" value="'+esc(s.percentage_score==null?'':s.percentage_score)+'" style="width:80px"></td><td>'+esc(s.letter_grade||'—')+'</td><td>'+esc(s.gpa_points==null?'—':s.gpa_points)+'</td><td><button class="btn alt small" data-save="'+esc(s.enrollment_id)+'">Save</button></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No students are enrolled in this section yet.</p>';
 $('studentsForSection').querySelectorAll('[data-save]').forEach(b=>{
   b.onclick=async()=>{
     const id=b.getAttribute('data-save');
     const input=$('studentsForSection').querySelector('[data-score="'+id+'"]');
     const score=Number(input.value);
     if(!input.value||!Number.isFinite(score)||score<0||score>100){message('gradeMessage','Enter a percentage score between 0 and 100.',true);return}
     b.disabled=true;b.textContent='Saving…';
     const {error}=await client.rpc('campus_lecturer_save_grade',{p_enrollment_id:id,p_percentage_score:score});
     b.disabled=false;b.textContent='Save';
     if(error){message('gradeMessage',error.message,true);return}
     message('gradeMessage','Grade saved successfully.');
     await load();
   };
 });
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter||e.currentTarget.querySelector('button[type=submit]');b.disabled=true;hide('loginMessage');const fd=new FormData(e.currentTarget);const {error}=await client.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});b.disabled=false;if(error){message('loginMessage',error.message,true);return}try{await load()}catch(err){await client.auth.signOut();showLogin();message('loginMessage',err.message||'Unable to load lecturer account',true)}});
$('registerLecturer').addEventListener('click',async()=>{const email=$('loginForm').elements.email.value.trim(),password=$('loginForm').elements.password.value;if(!email||password.length<8){message('loginMessage','Enter your work email and a password of at least 8 characters, then create your account.',true);return}const b=$('registerLecturer');b.disabled=true;const {data:created,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.href}});b.disabled=false;if(error){message('loginMessage',error.message,true);return}message('loginMessage',created.session?'Account created. You can now sign in.':'Account created. Check your email to verify it, then return here to sign in.');});
$('gradeSection').addEventListener('change',updateStudentsForSection);
function downloadMyInformation(){
 if(!data){message('pageMessage','Load your records first.',true);return}
 const blob=new Blob([JSON.stringify({format:'White Lion Lecturer Portal Export',exported_at:new Date().toISOString(),data},null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(data.lecturer&&(data.lecturer.first_name+'-'+data.lecturer.last_name)||'my-lecturer-record')+'-information.json';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('downloadMyInfo').addEventListener('click',downloadMyInformation);
$('refreshBtn').addEventListener('click',()=>load().catch(e=>message('pageMessage',e.message,true)));
$('signOutBtn').addEventListener('click',async()=>{await client.auth.signOut();data=null;showLogin()});
client.auth.getSession().then(async({data:s})=>{if(s.session){try{await load()}catch(e){showLogin();message('loginMessage',e.message,true)}}else showLogin()});
client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
})();
