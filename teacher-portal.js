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
function assignedClasses(){return [...new Map((data.assignments||[]).map(a=>[a.class_id,{id:a.class_id,name:a.class_name}])).values()]}
function showLogin(){ $('loginPanel').classList.remove('hidden');$('dashboard').classList.add('hidden'); }
async function load(){
 const {data:result,error}=await client.rpc('school_teacher_portal_data');
 if(error)throw error;data=result;
 $('loginPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');
 $('schoolTitle').textContent=data.school_name||'School Teacher Portal';
 $('teacherWelcome').textContent='Welcome, '+data.teacher.first_name+' '+data.teacher.last_name+' · '+(data.teacher.job_title||'Teacher');
 $('classCount').textContent=assignedClasses().length;
 $('subjectCount').textContent=new Set((data.assignments||[]).map(a=>a.subject_id)).size;
 $('studentCount').textContent=(data.students||[]).length;
 $('assignments').innerHTML=(data.assignments||[]).length?(data.assignments||[]).map(a=>'<div class="assignment"><b>'+esc(a.class_name)+'</b><div>'+esc(a.subject_name)+(a.subject_code?' · '+esc(a.subject_code):'')+'</div><span class="pill">Assigned teaching subject</span></div>').join(''):'<div class="notice">No class or subject assignments are active yet. Please contact the school administrator.</div>';
 const classes=assignedClasses();
 $('attendanceClass').innerHTML=classes.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
 $('attendanceDate').value=new Date().toISOString().slice(0,10);
 $('resultExam').innerHTML=(data.exams||[]).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title+' · '+e.class_name+' · max '+e.max_score)+'</option>').join('');
 updateAttendanceStudents();updateResultSubjects();updateResultStudents();
 $('timetable').innerHTML=(data.timetable||[]).length?'<div class="tablewrap"><table><thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Subject</th><th>Room</th></tr></thead><tbody>'+(data.timetable||[]).map(t=>'<tr><td>'+esc(['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][t.day_of_week]||'')+'</td><td>'+esc(String(t.starts_at).slice(0,5)+'–'+String(t.ends_at).slice(0,5))+'</td><td>'+esc(t.class_name)+'</td><td>'+esc(t.subject_name)+'</td><td>'+esc(t.room||'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No timetable periods assigned yet.</p>';
}
function updateAttendanceStudents(){
 const id=$('attendanceClass').value,students=(data.students||[]).filter(s=>s.class_id===id);
 const today=(data.attendance_today||[]).filter(a=>a.attendance_date===$('attendanceDate').value);
 $('attendanceStudents').innerHTML=students.length?'<div class="tablewrap"><table><thead><tr><th>Student</th><th>Admission no.</th><th>Status</th></tr></thead><tbody>'+students.map(s=>{const current=today.find(a=>a.student_id===s.id);return '<tr><td>'+esc(s.first_name+' '+s.last_name)+'</td><td>'+esc(s.admission_number)+'</td><td><select data-attendance="'+esc(s.id)+'"><option value="present" '+(current?.status==='present'?'selected':'')+'>Present</option><option value="absent" '+(current?.status==='absent'?'selected':'')+'>Absent</option><option value="late" '+(current?.status==='late'?'selected':'')+'>Late</option><option value="excused" '+(current?.status==='excused'?'selected':'')+'>Excused</option></select></td></tr>'}).join('')+'</tbody></table></div>':'<p class="muted">No active students are currently listed in this class.</p>';
}
function updateResultSubjects(){
 const exam=(data.exams||[]).find(e=>e.id===$('resultExam').value);
 const subjects=(data.assignments||[]).filter(a=>exam&&a.class_id===exam.class_id&&(!exam.subject_id||a.subject_id===exam.subject_id));
 $('resultSubject').innerHTML=subjects.map(a=>'<option value="'+esc(a.subject_id)+'">'+esc(a.subject_name)+'</option>').join('');
 updateResultStudents();
}
function updateResultStudents(){
 const exam=(data.exams||[]).find(e=>e.id===$('resultExam').value);
 const students=(data.students||[]).filter(s=>exam&&s.class_id===exam.class_id);
 $('resultStudent').innerHTML=students.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.first_name+' '+s.last_name+' · '+s.admission_number)+'</option>').join('');
 $('resultScore').max=exam?.max_score||100;
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter||e.currentTarget.querySelector('button[type=submit]');b.disabled=true;hide('loginMessage');const fd=new FormData(e.currentTarget);const {error}=await client.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});b.disabled=false;if(error){message('loginMessage',error.message,true);return}try{await load()}catch(err){await client.auth.signOut();showLogin();message('loginMessage',err.message||'Unable to load teacher account',true)}});
$('registerTeacher').addEventListener('click',async()=>{const email=$('loginForm').elements.email.value.trim(),password=$('loginForm').elements.password.value;if(!email||password.length<8){message('loginMessage','Enter your staff email and a password of at least 8 characters, then create your account.',true);return}const b=$('registerTeacher');b.disabled=true;const {data:created,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.href}});b.disabled=false;if(error){message('loginMessage',error.message,true);return}message('loginMessage',created.session?'Account created. You can now sign in.':'Account created. Check your email to verify it, then return here to sign in.');});
$('attendanceClass').addEventListener('change',updateAttendanceStudents);
$('attendanceDate').addEventListener('change',updateAttendanceStudents);
$('resultExam').addEventListener('change',updateResultSubjects);
$('attendanceForm').addEventListener('submit',async e=>{e.preventDefault();const records=[...document.querySelectorAll('[data-attendance]')].map(el=>({student_id:el.dataset.attendance,status:el.value}));if(!records.length){message('attendanceMessage','There are no students to save.',true);return}const {data:count,error}=await client.rpc('school_teacher_record_attendance',{p_class_id:$('attendanceClass').value,p_attendance_date:$('attendanceDate').value,p_records:records});if(error){message('attendanceMessage',error.message,true);return}message('attendanceMessage','Attendance saved for '+count+' student(s).');});
$('resultForm').addEventListener('submit',async e=>{e.preventDefault();const exam=(data.exams||[]).find(x=>x.id===$('resultExam').value);const score=Number($('resultScore').value);if(!exam||score<0||score>Number(exam.max_score)){message('resultMessage','Enter a score between 0 and the examination maximum.',true);return}const {error}=await client.rpc('school_teacher_save_result',{p_exam_id:exam.id,p_subject_id:$('resultSubject').value,p_student_id:$('resultStudent').value,p_score:score,p_remarks:$('resultRemarks').value||null});if(error){message('resultMessage',error.message,true);return}message('resultMessage','Examination result saved successfully.');});
$('refreshBtn').addEventListener('click',()=>load().catch(e=>message('pageMessage',e.message,true)));
$('signOutBtn').addEventListener('click',async()=>{await client.auth.signOut();data=null;showLogin()});
client.auth.getSession().then(async({data:s})=>{if(s.session){try{await load()}catch(e){showLogin();message('loginMessage',e.message,true)}}else showLogin()});
client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showLogin()});
})();