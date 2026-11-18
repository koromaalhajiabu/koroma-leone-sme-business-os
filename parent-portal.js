(function(){
'use strict';
const SUPABASE_URL='https://nclncqlgnxnijlumznnt.supabase.co';
const SUPABASE_KEY='sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),portalCode=params.get('school');
const client=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let profile=null,session=null;
function status(message){$('authStatus').textContent=message}
function money(v){return new Intl.NumberFormat('en-SL',{style:'currency',currency:'SLE',maximumFractionDigits:2}).format(Number(v||0))}
async function init(){
 if(!client){status('Secure connection could not start. Please refresh this page.');return}
 if(!portalCode){$('authCard').innerHTML='<h2>School portal link incomplete</h2><p class="muted">Please request the official parent portal link from your school administration.</p>';return}
 const p=await client.rpc('school_get_public_portal_profile',{p_portal_code:portalCode});
 if(p.error||!p.data||!p.data.length){$('authCard').innerHTML='<h2>School portal not found or disabled</h2><p class="muted">Check the link provided by your school administration.</p>';return}
 profile=p.data[0];
 $('schoolName').textContent=profile.school_name||'Parent & Guardian Portal';
 if(profile.crest_url)$('schoolCrest').innerHTML='<img src="'+esc(profile.crest_url)+'" alt="School crest">';
 const s=await client.auth.getSession();session=s.data.session;
 if(session)await showDashboard();
 $('authForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('email').value.trim(),password=$('password').value;const b=$('signInBtn');b.disabled=true;status('Signing in securely…');try{const r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error;session=r.data.session;await showDashboard()}catch(err){status(err.message||'Sign-in failed')}finally{b.disabled=false}});
 $('signUpBtn').addEventListener('click',async()=>{const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<8){status('Enter your email and a password of at least 8 characters.');return}const b=$('signUpBtn');b.disabled=true;status('Creating your parent account…');try{const r=await client.auth.signUp({email,password});if(r.error)throw r.error;if(r.data.session){session=r.data.session;await showDashboard()}else status('Account created. Check your email to confirm it, then sign in. After signing in, share your account user ID with the school so it can link your child.')}catch(err){status(err.message||'Account creation failed')}finally{b.disabled=false}});
 $('signOutBtn').addEventListener('click',async()=>{await client.auth.signOut();session=null;$('portalContent').classList.add('hidden');$('authCard').classList.remove('hidden');status('You have signed out.')});
 client.auth.onAuthStateChange((event,next)=>{session=next;if(event==='SIGNED_OUT'){$('portalContent').classList.add('hidden');$('authCard').classList.remove('hidden')}});
}
async function showDashboard(){
 $('authCard').classList.add('hidden');$('portalContent').classList.remove('hidden');
 $('parentIdentity').textContent='Signed in as '+session.user.email+' · Account ID: '+session.user.id;
 $('children').innerHTML='<p class="muted">Loading your linked children…</p>';
 const links=await client.from('school_guardian_links').select('student_id,relationship,can_view_attendance,can_view_results,can_view_fees').eq('business_id',profile.business_id).eq('guardian_user_id',session.user.id).eq('is_active',true);
 if(links.error){$('children').innerHTML='<div class="status">Unable to load linked children: '+esc(links.error.message)+'</div>';return}
 if(!links.data.length){$('children').innerHTML='<div class="status">Your account is not linked to a student at this school yet. Copy your Account ID shown above and provide it to the school administration. They can then link your account to your child.</div>';return}
 const ids=links.data.map(x=>x.student_id);
 const sr=await client.from('school_students').select('id,admission_number,first_name,last_name,status,class_id,school_classes(name)').eq('business_id',profile.business_id).in('id',ids);
 if(sr.error){$('children').innerHTML='<div class="status">Unable to load student details: '+esc(sr.error.message)+'</div>';return}
 const cards=[];
 for(const student of (sr.data||[])){
  const link=links.data.find(x=>x.student_id===student.id);
  let attendance=[],reports=[],invoices=[],payments=[],results=[],messages=[];
  if(link.can_view_attendance){const r=await client.from('school_attendance').select('attendance_date,status,note').eq('business_id',profile.business_id).eq('student_id',student.id).order('attendance_date',{ascending:false}).limit(20);if(!r.error)attendance=r.data||[]}
  if(link.can_view_results){const r=await client.from('school_report_cards').select('report_title,overall_score,overall_grade,class_position,teacher_comment,principal_comment,subject_results,attendance_summary,created_at').eq('business_id',profile.business_id).eq('student_id',student.id).eq('published',true).order('created_at',{ascending:false});if(!r.error)reports=r.data||[];const er=await client.from('school_exam_results').select('score,remarks,created_at,school_exams(title,exam_date,max_score,academic_term)').eq('business_id',profile.business_id).eq('student_id',student.id).order('created_at',{ascending:false}).limit(30);if(!er.error)results=er.data||[]}
  if(link.can_view_fees){const r=await client.from('school_fee_invoices').select('id,invoice_number,description,academic_term,amount,due_date,status,created_at').eq('business_id',profile.business_id).eq('student_id',student.id).order('created_at',{ascending:false});if(!r.error)invoices=r.data||[];const invoiceIds=invoices.map(x=>x.id);if(invoiceIds.length){const pr=await client.from('school_fee_payments').select('invoice_id,receipt_number,amount,payment_method,paid_at').eq('business_id',profile.business_id).in('invoice_id',invoiceIds).order('paid_at',{ascending:false});if(!pr.error)payments=pr.data||[]}}
  const mr=await client.from('school_parent_messages').select('subject,message,sent_at,read_at,sender_user_id').eq('business_id',profile.business_id).eq('student_id',student.id).eq('recipient_user_id',session.user.id).order('sent_at',{ascending:false}).limit(20);if(!mr.error)messages=mr.data||[];
  const present=attendance.filter(x=>x.status==='present').length,absent=attendance.filter(x=>x.status==='absent').length;
  cards.push('<article class="child"><div class="child-head"><div><h3>'+esc(student.first_name+' '+student.last_name)+'</h3><div class="muted">Admission no. '+esc(student.admission_number)+' · '+esc(student.school_classes?.name||'Class not assigned')+' · '+esc(link.relationship)+'</div></div><span class="pill">'+esc(student.status)+'</span></div><div class="metrics"><div class="metric"><small>Attendance records shown</small><b>'+attendance.length+'</b></div><div class="metric"><small>Present</small><b>'+present+'</b></div><div class="metric"><small>Absent</small><b>'+absent+'</b></div></div>'+
 (link.can_view_attendance?'<div class="section"><h4>Recent attendance</h4>'+table(['Date','Status','Note'],attendance.map(x=>[esc(x.attendance_date),esc(x.status),esc(x.note||'—')]))+'</div>':'')+
 (link.can_view_results?'<div class="section"><h4>Published report cards</h4>'+ (reports.length?reports.map(x=>'<div class="status"><b>'+esc(x.report_title)+'</b> · Score '+esc(x.overall_score??'—')+' · Grade '+esc(x.overall_grade||'—')+'<br>'+esc(x.teacher_comment||'')+' '+esc(x.principal_comment||'')+'</div>').join(''):'<p class="muted">No published report cards yet.</p>')+'</div><div class="section"><h4>Examination results</h4>'+table(['Examination','Date','Score','Maximum','Remarks'],results.map(x=>[esc(x.school_exams?.title||'Examination'),esc(x.school_exams?.exam_date||'—'),esc(x.score),esc(x.school_exams?.max_score||'—'),esc(x.remarks||'—')]))+'</div>':'')+
 (link.can_view_fees?'<div class="section"><h4>School fee invoices</h4>'+table(['Invoice','Description','Term','Amount','Status'],invoices.map(x=>[esc(x.invoice_number),esc(x.description),esc(x.academic_term||'—'),money(x.amount),esc(x.status)]))+'</div><div class="section"><h4>Payment receipts</h4>'+table(['Receipt','Date','Amount','Method'],payments.map(x=>[esc(x.receipt_number),esc(x.paid_at),money(x.amount),esc(x.payment_method)]))+'</div>':'')+
 '<div class="section"><h4>Messages from school</h4>'+(messages.length?messages.map(x=>'<div class="status"><b>'+esc(x.subject)+'</b><br>'+esc(x.message)+'<br><small>'+esc(new Date(x.sent_at).toLocaleString())+'</small></div>').join(''):'<p class="muted">No messages from the school yet.</p>')+'</div></article>');
 }
 $('children').innerHTML=cards.join('');
}
function table(head,rows){return '<div class="table-wrap"><table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+head.length+'">No records available.</td></tr>')+'</tbody></table></div>'}
init().catch(e=>status(e.message||'The portal could not load. Please refresh.'));
})();