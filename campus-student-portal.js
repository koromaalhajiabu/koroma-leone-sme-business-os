(function(){
'use strict';
const SUPABASE_URL='https://nclncqlgnxnijlumznnt.supabase.co';
const SUPABASE_KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let data=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>{try{return new Intl.NumberFormat('en-SL',{style:'currency',currency:'SLE',maximumFractionDigits:2}).format(Number(n||0))}catch(e){return 'Le '+Number(n||0).toFixed(2)}};
function message(id,text,error){const el=$(id);el.textContent=text;el.classList.remove('hidden','error');if(error)el.classList.add('error')}
function hide(id){$(id).classList.add('hidden')}
function showLogin(){ $('loginPanel').classList.remove('hidden');$('dashboard').classList.add('hidden');$('dashButtons').classList.add('hidden'); }
async function load(){
 const {data:result,error}=await client.rpc('campus_student_portal_data');
 if(error)throw error;data=result;
 $('loginPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');$('dashButtons').classList.remove('hidden');
 $('campusTitle').textContent=data.campus_name||'Student Portal';
 if(data.campus_crest){$('campusCrest').src=data.campus_crest;$('campusCrest').style.display='block'}
 const s=data.student||{};
 $('studentWelcome').textContent='Welcome, '+s.first_name+' '+s.last_name+' · '+(s.student_number||'')+(data.program?' · '+data.program.name:'');
 $('gpaStat').textContent=data.cumulative_gpa==null?'—':Number(data.cumulative_gpa).toFixed(2);
 $('courseCountStat').textContent=(data.enrollments||[]).length;
 const due=(data.invoices||[]).filter(x=>x.status==='unpaid'||x.status==='part_paid').reduce((n,x)=>n+Number(x.amount||0),0);
 $('feesStat').textContent=money(due);
 $('enrollments').innerHTML=(data.enrollments||[]).length?'<div class="tablewrap"><table><thead><tr><th>Course</th><th>Section</th><th>Term</th><th>Status</th><th>Score %</th><th>Grade</th><th>GPA pts</th></tr></thead><tbody>'+(data.enrollments||[]).map(e=>'<tr><td><b>'+esc(e.course_code)+'</b> '+esc(e.course_title)+'</td><td>'+esc(e.section_code||'—')+'</td><td>'+esc(e.term_name||'—')+'</td><td><span class="pill">'+esc(e.status)+'</span></td><td>'+esc(e.percentage_score==null?'—':e.percentage_score)+'</td><td>'+esc(e.letter_grade||'—')+'</td><td>'+esc(e.gpa_points==null?'—':e.gpa_points)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">You are not yet enrolled in any course sections.</p>';
 $('invoices').innerHTML=(data.invoices||[]).length?'<div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>'+(data.invoices||[]).map(i=>'<tr><td>'+esc(i.invoice_number)+'</td><td>'+esc(i.description)+'</td><td>'+money(i.amount)+'</td><td>'+esc(i.due_date||'—')+'</td><td><span class="pill">'+esc(i.status)+'</span></td></tr>').join('')+'</tbody></table></div>':'<p class="muted">No invoices on your record.</p>';
}
function exportTranscriptPdf(){
 if(!data){message('pageMessage','Load your records first.',true);return}
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF();
 const s=data.student||{};
 doc.setFontSize(16);doc.text(data.campus_name||'White Lion Campus',14,18);
 doc.setFontSize(11);doc.text('Official Academic Transcript',14,26);
 doc.setFontSize(10);
 doc.text('Student: '+(s.first_name||'')+' '+(s.last_name||''),14,36);
 doc.text('Student number: '+(s.student_number||'—'),14,42);
 doc.text('Program: '+((data.program||{}).name||'—'),14,48);
 doc.text('Cumulative GPA (4.0 scale): '+(data.cumulative_gpa==null?'—':Number(data.cumulative_gpa).toFixed(2)),14,54);
 doc.text('Generated: '+new Date().toLocaleString(),14,60);
 let y=72;
 doc.setFontSize(9);
 const headers=['Course','Title','Credits','Term','Score %','Grade','GPA pts'];
 const colX=[14,44,104,120,152,172,188];
 headers.forEach((h,i)=>doc.text(h,colX[i],y));
 y+=3;doc.line(14,y,200,y);y+=6;
 (data.enrollments||[]).forEach(e=>{
   if(y>275){doc.addPage();y=20}
   const row=[e.course_code||'',(e.course_title||'').slice(0,26),String(e.credit_hours==null?'—':e.credit_hours),(e.term_name||'—').slice(0,14),String(e.percentage_score==null?'—':e.percentage_score),e.letter_grade||'—',String(e.gpa_points==null?'—':e.gpa_points)];
   row.forEach((c,i)=>doc.text(String(c),colX[i],y));
   y+=7;
 });
 y+=6;
 if(y>270){doc.addPage();y=20}
 doc.setFontSize(8);
 doc.text('This transcript is generated directly from the institution\'s student records system and reflects grades on file at the time of generation.',14,y,{maxWidth:182});
 doc.save((s.student_number||'transcript')+'-transcript.pdf');
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter||e.currentTarget.querySelector('button[type=submit]');b.disabled=true;hide('loginMessage');const fd=new FormData(e.currentTarget);const {error}=await client.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});b.disabled=false;if(error){message('loginMessage',error.message,true);return}try{await load()}catch(err){await client.auth.signOut();showLogin();message('loginMessage',err.message||'Unable to load student account',true)}});
$('registerStudent').addEventListener('click',async()=>{const email=$('loginForm').elements.email.value.trim(),password=$('loginForm').elements.password.value;if(!email||password.length<8){message('loginMessage','Enter your student email and a password of at least 8 characters, then create your account.',true);return}const b=$('registerStudent');b.disabled=true;const {data:created,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.href}});b.disabled=false;if(error){message('loginMessage',error.message,true);return}message('loginMessage',created.session?'Account created. You can now sign in.':'Account created. Check your email to verify it, then return here to sign in.');});
$('exportTranscript').addEventListener('click',exportTranscriptPdf);
$('refreshBtn').addEventListener('click',()=>load().catch(e=>message('pageMessage',e.message,true)));
$('signOutBtn').addEventListener('click',async()=>{await client.auth.signOut();data=null;showLogin()});
client.auth.getSession().then(async({data:s})=>{if(s.session){try{await load()}catch(e){showLogin();message('loginMessage',e.message,true)}}else showLogin()});
client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showLogin()});
})();
