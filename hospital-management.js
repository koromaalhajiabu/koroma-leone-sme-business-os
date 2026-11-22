/* Koroma Leone Tech — Hospital Management module.
   Cloud-only clinical records. No patient or diagnosis data is written to IndexedDB.
   Database RLS is the authority; client-side checks only improve the interface. */
(function () {
  'use strict';
  if (window.WhiteLionHospital) return;

  var activeTab = 'overview';
  var activeBusinessId = null;
  var currentUserId = null;
  var currentStaff = null;
  var currentPatientPhotoUrls = {};
  var currentStaffPhotoUrls = {};
  var photoUrlCache = {};
  var membershipRole = 'viewer';
  var staffRole = '';
  var patients = [];
  var staff = [];
  var departments = [];
  var wards = [];
  var beds = [];
  var cache = {};
  var root = function () { return document.getElementById('view'); };
  var client = function () { return window.whiteLionCloud && window.whiteLionCloud.getClient && window.whiteLionCloud.getClient(); };
  var business = function () { return window.whiteLionCloud && window.whiteLionCloud.getActiveBusiness && window.whiteLionCloud.getActiveBusiness(); };
  var session = function () { return window.whiteLionCloud && window.whiteLionCloud.getSession && window.whiteLionCloud.getSession(); };
  var isManager = function () { return ['owner','admin','manager'].indexOf(membershipRole) >= 0; };
  var hasRole = function (roles) { return isManager() || roles.indexOf(staffRole) >= 0; };
  function canAccessTab(tab) {
    if (isManager()) return true;
    if (tab==='portal') return !!staffRole;
    var roles = {
      overview:['doctor','nurse','administrator'],
      patients:['doctor','nurse','pharmacist','lab_technician','receptionist','administrator'],
      appointments:['doctor','nurse','receptionist','administrator'],
      clinical:['doctor','nurse','administrator'],
      admissions:['doctor','nurse','administrator'],
      wards:['doctor','nurse','administrator'],
      pharmacy:['doctor','nurse','pharmacist','administrator'],
      laboratory:['doctor','nurse','lab_technician','administrator'],
      billing:['cashier','administrator'],
      staff:[]
    };
    if (tab==='billing' && membershipRole==='accountant') return true;
    return (roles[tab] || []).indexOf(staffRole) >= 0;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function money(value) {
    var currency = (business() && business().currency_code) || 'SLE';
    try { return new Intl.NumberFormat('en-SL', {style:'currency',currency:currency,maximumFractionDigits:2}).format(Number(value || 0)); }
    catch (_) { return currency + ' ' + Number(value || 0).toLocaleString(); }
  }
  function dateTime(value) {
    if (!value) return '—';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', {dateStyle:'medium',timeStyle:'short'});
  }
  function dateOnly(value) {
    if (!value) return '—';
    var d = new Date(value + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB',{dateStyle:'medium'});
  }
  function toast(message, bad) {
    var el = document.getElementById('toast');
    if (el) {
      el.textContent = message;
      el.classList.add('show');
      el.style.background = bad ? '#8f2936' : '#123b2b';
      window.setTimeout(function(){el.classList.remove('show');}, 4200);
    } else {
      alert(message);
    }
  }
  function panel(title, subtitle, body, actions) {
    return '<section class="wlh-panel"><div class="wlh-panel-head"><div><h3>'+esc(title)+'</h3>'+
      (subtitle ? '<p>'+esc(subtitle)+'</p>' : '')+'</div>'+(actions || '')+'</div>'+body+'</section>';
  }
  function field(label, name, type, required, value, extra) {
    return '<label class="wlh-field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" type="'+esc(type || 'text')+'" '+
      (required ? 'required ' : '')+(value != null ? 'value="'+esc(value)+'" ' : '')+(extra || '')+'></label>';
  }
  function photoField(label,name) {
    return '<label class="wlh-field wlh-wide"><span>'+esc(label)+'</span><input type="file" name="'+esc(name)+'" accept="image/jpeg,image/png,image/webp" capture="environment"><small class="wlh-note">JPG, PNG or WebP · maximum 4 MB · private hospital storage</small></label>';
  }
  function validateHospitalPhoto(file) {
    if(!file || !file.size) return null;
    if(['image/jpeg','image/png','image/webp'].indexOf(file.type)<0) throw new Error('Choose a JPG, PNG or WebP image.');
    if(file.size>4*1024*1024) throw new Error('The photo must be 4 MB or smaller.');
    return file;
  }
  function photoExtension(file) {
    return file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  }
  function photoToken() {
    return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  }
  async function uploadHospitalPhoto(file,path) {
    validateHospitalPhoto(file);
    var result=await client().storage.from('hospital-people-photos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(result.error) throw result.error;
    return path;
  }
  async function signedPhotoUrl(path) {
    if(!path) return '';
    var cached=photoUrlCache[path];
    if(cached && cached.expires>Date.now()) return cached.url;
    var result=await client().storage.from('hospital-people-photos').createSignedUrl(path,600);
    if(result.error || !result.data) return '';
    photoUrlCache[path]={url:result.data.signedUrl,expires:Date.now()+540000};
    return result.data.signedUrl;
  }
  async function signedPhotoMap(records) {
    var paths=Array.from(new Set((records||[]).map(function(r){return r.photo_path;}).filter(Boolean)));
    var out={};
    for(var i=0;i<paths.length;i+=50){
      var batch=paths.slice(i,i+50);
      var result=await client().storage.from('hospital-people-photos').createSignedUrls(batch,600);
      if(result.error) continue;
      (result.data||[]).forEach(function(row){
        if(row.path && row.signedUrl){out[row.path]=row.signedUrl;photoUrlCache[row.path]={url:row.signedUrl,expires:Date.now()+540000};}
      });
    }
    return out;
  }
  function avatar(url,label) {
    var initials=String(label||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x.charAt(0);}).join('').toUpperCase()||'?';
    return '<span class="wlh-avatar">'+(url?'<img src="'+esc(url)+'" alt="'+esc(label||'Profile photo')+'" loading="lazy">':'<span>'+esc(initials)+'</span>')+'</span>';
  }
  function area(label, name, rows, extra) {
    return '<label class="wlh-field wlh-wide"><span>'+esc(label)+'</span><textarea name="'+esc(name)+'" rows="'+(rows || 3)+'" '+(extra || '')+'></textarea></label>';
  }
  function selectField(label, name, options, required) {
    return '<label class="wlh-field"><span>'+esc(label)+'</span><select name="'+esc(name)+'" '+(required?'required':'')+'>'+
      '<option value="">Select '+esc(label.toLowerCase())+'</option>'+
      (options || []).map(function(o){return '<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>';}).join('')+
      '</select></label>';
  }
  function patientOptions() {
    return patients.filter(function(p){return p.status === 'active';}).map(function(p){
      return {value:p.id,label:p.patient_number+' · '+p.first_name+' '+p.last_name};
    });
  }
  function staffOptions(role) {
    return staff.filter(function(s){return s.employment_status === 'active' && (!role || s.staff_role === role);}).map(function(s){
      return {value:s.id,label:s.first_name+' '+s.last_name+' · '+s.staff_role.replaceAll('_',' ')};
    });
  }
  function departmentOptions() {
    return departments.map(function(d){return {value:d.id,label:d.name};});
  }
  function wardOptions() {
    return wards.map(function(w){return {value:w.id,label:w.name+' · '+w.ward_type};});
  }
  function bedOptions(availableOnly) {
    return beds.filter(function(b){return !availableOnly || b.status==='available';}).map(function(b){
      var w=wards.find(function(x){return x.id===b.ward_id;});
      return {value:b.id,label:(w?w.name:'Ward')+' · Bed '+b.bed_number+' ('+b.status+')'};
    });
  }
  function table(headers, rows, empty) {
    return '<div class="wlh-table-wrap"><table class="wlh-table"><thead><tr>'+
      headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+
      '</tr></thead><tbody>'+(rows || '<tr><td class="wlh-empty" colspan="'+headers.length+'">'+esc(empty || 'No records yet.')+'</td></tr>')+
      '</tbody></table></div>';
  }
  function badge(value) {
    var c = value === 'completed' || value === 'paid' || value === 'available' || value === 'active' || value === 'dispensed' ? 'good' :
      value === 'cancelled' || value === 'no_show' || value === 'deceased' || value === 'terminated' ? 'bad' :
      value === 'admitted' || value === 'occupied' || value === 'in_progress' || value === 'part_paid' ? 'warn' : 'neutral';
    return '<span class="wlh-badge '+c+'">'+esc(String(value || 'unknown').replaceAll('_',' '))+'</span>';
  }
  function pageTitle(title, description, action) {
    return '<div class="wlh-title"><div><span class="wlh-kicker">KOROMA LEONE TECH · HOSPITAL</span><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+
      (action || '')+'</div>';
  }
  function navTabs() {
    var portalLabel=isManager()?'Management Portal':(staffRole?staffRole.replaceAll('_',' ').replace(/\b\w/g,function(x){return x.toUpperCase();})+' Portal':'Staff Portal');
    var tabs = [
      ['portal',portalLabel,'🏥'],['overview','Overview','▦'],['patients','Patients','♙'],['appointments','Appointments','◷'],
      ['clinical','Clinical Records','✚'],['admissions','Admissions','▣'],['wards','Wards & Beds','▤'],
      ['pharmacy','Pharmacy','⚕'],['laboratory','Laboratory','⌕'],['billing','Billing','＄'],
      ['staff','Staff & Departments','♟']
    ];
    tabs=tabs.filter(function(t){return canAccessTab(t[0]);});
    return '<div class="wlh-tabs">'+tabs.map(function(t){
      return '<button type="button" class="wlh-tab '+(activeTab===t[0]?'active':'')+'" data-hospital-tab="'+t[0]+'"><span>'+t[2]+'</span>'+t[1]+'</button>';
    }).join('')+'</div>';
  }
  function shell(title, description, body, action) {
    return '<div class="wlh">'+pageTitle(title,description,action)+navTabs()+
      '<div class="wlh-privacy"><span>🔒</span> Patient and clinical records are kept in your secured cloud workspace. Clinical data is not cached for offline access.</div>'+
      body+'<div class="wlh-footer">Koroma Leone Tech · Hospital Management · Designed for authorised staff</div></div>';
  }
  async function query(tableName, columns, orderColumn, ascending, limit) {
    var b = business();
    if (!client() || !b || !b.id) throw new Error('Select a business workspace first.');
    var req = client().from(tableName).select(columns || '*').eq('business_id',b.id);
    if (orderColumn) req = req.order(orderColumn,{ascending:!!ascending});
    if (limit) req = req.limit(limit);
    var result = await req;
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function loadContext() {
    var b = business(), s = session();
    if (!b || !b.id || !s || !s.user) throw new Error('Sign in and select a business workspace to use Hospital Management.');
    if (activeBusinessId !== b.id) {
      activeBusinessId = b.id;
      cache = {};
      activeTab = 'overview';
    }
    currentUserId = s.user.id;
    var membership = await client().from('business_members').select('role,is_active')
      .eq('business_id',b.id).eq('user_id',currentUserId).maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data || !membership.data.is_active) throw new Error('Your account does not have active access to this workspace.');
    membershipRole = membership.data.role || 'viewer';
    var ownStaff = await client().from('hospital_staff')
      .select('id,staff_number,first_name,last_name,staff_role,employment_status,department_id,email,photo_path')
      .eq('business_id',b.id).eq('user_id',currentUserId).maybeSingle();
    if (ownStaff.error && ownStaff.error.code !== 'PGRST116') throw ownStaff.error;
    currentStaff = ownStaff.data && ownStaff.data.employment_status === 'active' ? ownStaff.data : null;
    staffRole = currentStaff ? currentStaff.staff_role : '';
    var tasks=[];
    var clinicalRead=isManager() || ['doctor','nurse','pharmacist','lab_technician','receptionist','administrator'].indexOf(staffRole)>=0;
    var staffRead=isManager() || ['doctor','nurse','pharmacist','lab_technician','receptionist','cashier','administrator','other'].indexOf(staffRole)>=0;
    var wardRead=isManager() || ['doctor','nurse','administrator'].indexOf(staffRole)>=0;
    if(clinicalRead) tasks.push(loadList('patients','hospital_patients','id,patient_number,first_name,last_name,date_of_birth,gender,phone,email,address,blood_group,allergies,emergency_contact_name,emergency_contact_phone,status,photo_path,created_at','created_at',false,250));
    else { patients=[]; cache.patients=[]; }
    if(staffRead){
      tasks.push(loadList('staff','hospital_staff','id,staff_number,first_name,last_name,staff_role,specialization,department_id,phone,email,employment_status,user_id,photo_path','first_name',true,200));
      tasks.push(loadList('departments','hospital_departments','id,name,description','name',true,100));
    } else { staff=[]; departments=[]; cache.staff=[]; cache.departments=[]; }
    if(wardRead){
      tasks.push(loadList('wards','hospital_wards','id,name,ward_type','name',true,100));
      tasks.push(loadList('beds','hospital_beds','id,ward_id,bed_number,status','bed_number',true,250));
    } else { wards=[]; beds=[]; cache.wards=[]; cache.beds=[]; }
    await Promise.all(tasks);
    if(activeTab==='overview' && !isManager() && staffRole) activeTab='portal';
    if(!canAccessTab(activeTab)){
      activeTab=isManager()?'overview':(staffRole?'portal':membershipRole==='accountant'?'billing':'overview');
    }
  }
  async function loadList(key, tableName, columns, orderColumn, ascending, limit) {
    var data = await query(tableName,columns,orderColumn,ascending,limit);
    if (key === 'patients') patients=data;
    if (key === 'staff') staff=data;
    if (key === 'departments') departments=data;
    if (key === 'wards') wards=data;
    if (key === 'beds') beds=data;
    cache[key]=data;
    return data;
  }
  function addStyles() {
    if (document.getElementById('wlh-css')) return;
    var style=document.createElement('style');
    style.id='wlh-css';
    style.textContent = [
      '.wlh{max-width:1500px;margin:0 auto;padding:4px 0 28px;color:var(--ink,#17382a)}',
      '.wlh *{box-sizing:border-box}.wlh-title{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:4px 0 20px}',
      '.wlh-kicker{color:#9d7a34;font-weight:850;font-size:9px;letter-spacing:1.7px}.wlh-title h1{margin:5px 0 3px;font-size:clamp(23px,2.6vw,31px);letter-spacing:-.8px;color:#173c2a}',
      '.wlh-title p{margin:0;color:#74847a;font-size:12px}.wlh-tabs{display:flex;gap:7px;overflow:auto;padding:4px 1px 14px;scrollbar-width:thin}',
      '.wlh-tab{border:1px solid #e1eae3;background:#fff;color:#65776b;border-radius:10px;padding:9px 12px;white-space:nowrap;font-weight:750;font-size:11px;cursor:pointer}',
      '.wlh-tab span{margin-right:7px;color:#a07d39}.wlh-tab.active{background:linear-gradient(135deg,#075b35,#0d7544);border-color:#075b35;color:#fff;box-shadow:0 5px 14px #075b3523}',
      '.wlh-privacy{display:flex;align-items:center;gap:8px;padding:10px 13px;margin:0 0 16px;border:1px solid #dfece3;border-radius:10px;background:#f4faf5;color:#4c705a;font-size:10px;line-height:1.5}',
      '.wlh-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px}.wlh-stat{border:1px solid #e5ebe6;background:#fff;border-radius:14px;padding:16px;box-shadow:0 6px 18px #123b2109}',
      '.wlh-stat small{color:#718078;font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.7px}.wlh-stat strong{display:block;font-size:25px;color:#173c2a;letter-spacing:-.7px;margin:8px 0 2px}.wlh-stat span{font-size:10px;color:#8a978e}',
      '.wlh-panel{background:#fff;border:1px solid #e4ebe5;border-radius:14px;padding:17px;margin-bottom:14px;box-shadow:0 6px 18px #123b2108;min-width:0}',
      '.wlh-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.wlh-panel h3{font-size:14px;color:#234333;margin:0;font-weight:850}.wlh-panel-head p{color:#839087;font-size:10px;margin:3px 0 0}',
      '.wlh-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.wlh-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wlh-field{display:grid;gap:5px;min-width:0}.wlh-field span{font-size:10px;font-weight:800;color:#53675a}.wlh-field input,.wlh-field select,.wlh-field textarea{width:100%;min-width:0;border:1px solid #dbe6dd;border-radius:9px;padding:10px 11px;background:#fff;color:#1c3326;font:inherit;font-size:12px;outline:none}.wlh-field input:focus,.wlh-field select:focus,.wlh-field textarea:focus{border-color:#3b9561;box-shadow:0 0 0 3px #3b95611c}.wlh-wide{grid-column:1/-1}',
      '.wlh-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.wlh-btn{border:0;border-radius:9px;padding:10px 14px;background:linear-gradient(135deg,#075b35,#0d7544);color:#fff;font-size:11px;font-weight:850;cursor:pointer}.wlh-btn.alt{background:#fff;color:#1c5b3b;border:1px solid #dce8df}.wlh-btn.warn{background:#fff8e9;color:#936b19;border:1px solid #f0dfb8}.wlh-btn.danger{background:#fff2f1;color:#aa3944;border:1px solid #f1d5d5}.wlh-btn:disabled{opacity:.55;cursor:not-allowed}',
      '.wlh-table-wrap{overflow:auto;border:1px solid #edf1ed;border-radius:10px}table.wlh-table{width:100%;border-collapse:collapse;min-width:620px}table.wlh-table th{background:#f7faf7;color:#78877d;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.65px;padding:11px 10px;border-bottom:1px solid #e8eee9}table.wlh-table td{font-size:11px;color:#405348;padding:11px 10px;border-bottom:1px solid #edf1ed;vertical-align:middle}table.wlh-table tr:last-child td{border-bottom:0}.wlh-empty{text-align:center!important;padding:25px!important;color:#88958c!important}',
      '.wlh-badge{display:inline-block;border-radius:30px;padding:4px 8px;font-size:9px;font-weight:850;text-transform:capitalize;white-space:nowrap}.wlh-badge.good{background:#e8f6ed;color:#167447}.wlh-badge.warn{background:#fff4df;color:#956917}.wlh-badge.bad{background:#fff0f0;color:#ae3d49}.wlh-badge.neutral{background:#eef2f0;color:#637168}',
      '.wlh-search{width:min(280px,100%);padding:9px 11px;border:1px solid #dce6df;border-radius:9px;font-size:11px}.wlh-footer{text-align:center;color:#9aa79e;font-size:9px;padding:18px 0 5px}',
      '.wlh-avatar{width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;background:#e6f3ea;color:#17633d;font-size:11px;font-weight:900;vertical-align:middle;flex:none}.wlh-avatar img{width:100%;height:100%;object-fit:cover}',
      '.wlh-portal-hero{display:flex;align-items:center;gap:14px;padding:18px;border-radius:14px;background:linear-gradient(120deg,#075b35,#0b7546);color:#fff;margin-bottom:14px}.wlh-portal-hero h2{margin:2px 0 4px;font-size:20px}.wlh-portal-hero p{margin:0;color:#d8eee0;font-size:11px}.wlh-portal-hero .wlh-avatar{width:62px;height:62px;background:#ffffff28;color:#fff;border:2px solid #ffffff66}.wlh-portal-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.wlh-portal-link{text-align:left;border:1px solid #e3ebe4;border-radius:12px;padding:14px;background:#fff;color:#244432;cursor:pointer;font-size:12px;font-weight:800}.wlh-portal-link small{display:block;color:#7c8d82;font-size:10px;font-weight:500;margin-top:5px}',
      '@media(max-width:560px){.wlh-portal-links{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '.wlh-note{font-size:10px;color:#849187;line-height:1.6}.wlh-empty-state{padding:22px;text-align:center;color:#839087;font-size:11px;background:#f8fbf8;border:1px dashed #dce8df;border-radius:10px}',
      '@media(max-width:850px){.wlh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wlh-two{grid-template-columns:1fr}}',
      '@media(max-width:560px){.wlh-title{align-items:flex-start;flex-direction:column}.wlh-form{grid-template-columns:1fr}.wlh-grid{gap:8px}.wlh-stat{padding:12px}.wlh-stat strong{font-size:21px}.wlh-panel{padding:13px}.wlh-tabs{margin-right:-5px}}'
    ].join('');
    document.head.appendChild(style);
  }
  async function render() {
    addStyles();
    var target=root();
    if (!target) return;
    target.innerHTML='<div class="wlh-panel"><h3>Loading Hospital Management…</h3><p class="wlh-note">Connecting securely to this workspace.</p></div>';
    try {
      await loadContext();
      if (!canAccessTab(activeTab)) {
        target.innerHTML=shell('Access restricted','Your current hospital role does not have access to this section.','<div class="wlh-empty-state">Ask your hospital administrator to review your staff role and workspace permissions.</div>');
      } else if (activeTab==='portal') await renderPortal();
      else if (activeTab==='overview') await renderOverview();
      else if (activeTab==='patients') await renderPatients();
      else if (activeTab==='appointments') await renderAppointments();
      else if (activeTab==='clinical') await renderClinical();
      else if (activeTab==='admissions') await renderAdmissions();
      else if (activeTab==='wards') await renderWards();
      else if (activeTab==='pharmacy') await renderPharmacy();
      else if (activeTab==='laboratory') await renderLaboratory();
      else if (activeTab==='billing') await renderBilling();
      else if (activeTab==='staff') await renderStaff();
      wire(target);
    } catch (e) {
      target.innerHTML='<div class="wlh-panel"><h3>Hospital workspace unavailable</h3><p class="wlh-note">'+esc(e.message || 'Could not load hospital records.')+'</p><button type="button" class="wlh-btn alt" id="wlhRetry">Retry</button></div>';
      var retry=document.getElementById('wlhRetry');
      if(retry) retry.onclick=render;
    }
  }
  async function statCount(tableName, extra) {
    var req=client().from(tableName).select('id',{count:'exact',head:true}).eq('business_id',business().id);
    if(extra) extra(req);
    var r=await req;
    if(r.error) throw r.error;
    return r.count || 0;
  }
  async function renderPortal() {
    var isStaffPortal=!!staffRole;
    var displayName=isStaffPortal && currentStaff ? currentStaff.first_name+' '+currentStaff.last_name : (business()&&business().name)||'Hospital workspace';
    var roleLabel=isStaffPortal?staffRole.replaceAll('_',' ').replace(/\b\w/g,function(x){return x.toUpperCase();}):membershipRole.replaceAll('_',' ').replace(/\b\w/g,function(x){return x.toUpperCase();});
    var department=isStaffPortal && currentStaff ? (departments.find(function(d){return d.id===currentStaff.department_id;})||{}).name : '';
    var photoUrl=isStaffPortal && currentStaff ? await signedPhotoUrl(currentStaff.photo_path) : '';
    var linksByRole={
      doctor:['clinical','patients','appointments','admissions','laboratory','pharmacy'],
      nurse:['patients','appointments','clinical','admissions','wards'],
      receptionist:['patients','appointments'],
      pharmacist:['pharmacy','patients'],
      lab_technician:['laboratory','patients'],
      cashier:['billing'],
      administrator:['overview','patients','appointments','clinical','admissions','wards','pharmacy','laboratory','billing','staff'],
      other:[]
    };
    var labels={
      overview:['Hospital overview','Daily hospital activity and key summaries'],
      patients:['Patient records','Find and register authorised patient records'],
      appointments:['Appointments','Manage bookings and check-ins'],
      clinical:['Clinical records','Record consultations, observations and care plans'],
      admissions:['Admissions','Manage inpatient admissions and discharge'],
      wards:['Wards and beds','View ward capacity and bed availability'],
      pharmacy:['Pharmacy','Manage medicine inventory and prescriptions'],
      laboratory:['Laboratory','Review test requests and record results'],
      billing:['Billing','Create invoices and record patient payments'],
      staff:['Staff and departments','Manage hospital staff roles and departments']
    };
    var routes=(isManager()?['overview','staff','patients','appointments','clinical','admissions','wards','pharmacy','laboratory','billing']:(linksByRole[staffRole]||[]))
      .filter(function(key){return canAccessTab(key);});
    var quick=routes.map(function(key){
      return '<button type="button" class="wlh-portal-link" data-hospital-tab="'+key+'">'+esc(labels[key][0])+'<small>'+esc(labels[key][1])+'</small></button>';
    }).join('');
    var roleDescription={
      doctor:'You can manage consultations, clinical notes, diagnoses, prescriptions and the patient services approved for your role.',
      nurse:'You can review patient information, record observations and manage the nursing and admission tasks approved for your role.',
      receptionist:'You can register patients and manage appointment bookings and check-ins.',
      pharmacist:'You can access pharmacy stock and authorised prescriptions.',
      lab_technician:'You can access laboratory requests and update test results.',
      cashier:'You can access hospital billing, invoices and payment receipts.',
      administrator:'You can access the hospital administration and operational functions assigned to your account.'
    };
    var intro=isStaffPortal?(roleDescription[staffRole]||'Your hospital role determines which sections you can access.'):'Manage the hospital workspace and review the authorised operational areas.';
    var profile='<div class="wlh-portal-hero">'+avatar(photoUrl,displayName)+'<div><span class="wlh-kicker" style="color:#e1c77d">APPROVED HOSPITAL ACCESS</span><h2>'+esc(displayName)+'</h2><p>'+esc(roleLabel)+(department?' · '+esc(department):'')+'</p><p>'+esc((session()&&session().user&&session().user.email)||'')+'</p></div></div>';
    var accessCard=panel('Your approved access',intro+
      '<div class="wlh-actions" style="margin-top:10px"><span class="wlh-badge good">Active</span><span class="wlh-badge neutral">'+esc(roleLabel)+'</span></div>',
      '<div class="wlh-portal-links">'+(quick||'<div class="wlh-empty-state">No operational sections are assigned to this account. Contact the hospital administrator to review your role.</div>')+'</div>');
    var security=panel('Portal security','Your access is checked against your current signed-in account and active hospital staff assignment.',
      '<p class="wlh-note">Do not share your password. Sign out when using a shared device. Patient and clinical records remain in private cloud storage and are not saved in the phone’s offline cache.</p>');
    root().innerHTML=shell(isStaffPortal?'My Hospital Portal':'Hospital Management Portal',
      'Your personalised entry point to the hospital services approved for your account.',profile+accessCard+security);
  }
  async function renderOverview() {
    var counts=await Promise.all([
      statCount('hospital_patients',function(q){q.eq('status','active');}),
      statCount('hospital_appointments',function(q){q.gte('appointment_at',new Date(new Date().setHours(0,0,0,0)).toISOString()).lt('appointment_at',new Date(new Date().setHours(23,59,59,999)).toISOString()).not('status','in','(cancelled,no_show)');}),
      statCount('hospital_admissions',function(q){q.eq('status','admitted');}),
      statCount('hospital_lab_tests',function(q){q.in('status',['ordered','in_progress']);})
    ]);
    var recent=await query('hospital_appointments','id,patient_id,appointment_at,reason,status','appointment_at',false,8);
    var patientsMap={}; patients.forEach(function(p){patientsMap[p.id]=p;});
    var rows=recent.map(function(a){
      var p=patientsMap[a.patient_id] || {};
      return '<tr><td><b>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</b><div class="wlh-note">'+esc(p.patient_number||'')+'</div></td><td>'+esc(dateTime(a.appointment_at))+'</td><td>'+esc(a.reason||'—')+'</td><td>'+badge(a.status)+'</td></tr>';
    }).join('');
    if (!canAccessTab('overview')) {
      var openInvoices=await statCount('hospital_invoices',function(q){q.in('status',['unpaid','part_paid']);});
      var paidCount=await statCount('hospital_invoice_payments');
      root().innerHTML=shell('Hospital workspace','Your authorised hospital workspace.', '<div class="wlh-grid"><div class="wlh-stat"><small>Outstanding invoices</small><strong>'+openInvoices+'</strong><span>Pending payment</span></div><div class="wlh-stat"><small>Payments recorded</small><strong>'+paidCount+'</strong><span>Receipts in the current workspace</span></div></div>');
      return;
    }
    var body='<div class="wlh-grid">'+[
      ['Active patients',counts[0],'Registered patient records'],['Appointments today',counts[1],'Today’s scheduled activity'],
      ['Current admissions',counts[2],'Patients currently admitted'],['Pending laboratory',counts[3],'Tests awaiting completion']
    ].map(function(x){return '<div class="wlh-stat"><small>'+x[0]+'</small><strong>'+x[1]+'</strong><span>'+x[2]+'</span></div>';}).join('')+'</div>'+
    '<div class="wlh-two">'+panel('Upcoming / recent appointments','Latest appointment records',table(['Patient','Appointment','Reason','Status'],rows,'No appointment records yet.'))+
    panel('Hospital operations','Open a module to continue', '<div class="wlh-actions">'+[
      ['patients','Register patient'],['appointments','Book appointment'],['clinical','New clinical record'],
      ['admissions','Admit patient'],['pharmacy','Pharmacy stock'],['laboratory','Laboratory queue']
    ].map(function(x){return '<button class="wlh-btn alt" type="button" data-hospital-tab="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div><p class="wlh-note" style="margin-top:13px">All patient data is scoped to the selected business. Only assigned hospital staff and authorised business administrators can access it.</p>')+'</div>';
    root().innerHTML=shell('Hospital overview','Monitor patient services and essential hospital activity.',body);
  }
  async function renderPatients() {
    currentPatientPhotoUrls=await signedPhotoMap(patients);
    var rows=patients.map(function(p){
      var name=p.first_name+' '+p.last_name;
      return '<tr><td>'+avatar(currentPatientPhotoUrls[p.photo_path]||'',name)+'</td><td><b>'+esc(p.patient_number)+'</b></td><td>'+esc(name)+'</td><td>'+esc(dateOnly(p.date_of_birth))+'</td><td>'+esc(p.gender||'—')+'</td><td>'+esc(p.phone||'—')+'</td><td>'+badge(p.status)+'</td></tr>';
    }).join('');
    var form = hasRole(['doctor','nurse','receptionist','administrator']) ?
      panel('Register patient','Patient identity and emergency contact details','<form class="wlh-form" data-hospital-form="patient">'+
        field('First name','first_name','text',true)+field('Last name','last_name','text',true)+photoField('Patient photograph','patient_photo')+
        field('Date of birth','date_of_birth','date',false)+selectField('Gender','gender',[
          {value:'female',label:'Female'},{value:'male',label:'Male'},{value:'other',label:'Other'},{value:'prefer_not_to_say',label:'Prefer not to say'}
        ],false)+field('Phone number','phone','tel',false)+field('Email address','email','email',false)+
        field('Blood group','blood_group','text',false)+field('Address','address','text',false)+
        field('Emergency contact name','emergency_contact_name','text',false)+field('Emergency contact phone','emergency_contact_phone','tel',false)+
        area('Known allergies','allergies',2)+area('Administrative notes (avoid unnecessary clinical details)','notes',2)+
        '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Register patient</button></div></form>') : '';
    root().innerHTML=shell('Patient records','Register and search patient demographics for this hospital.',form+
      panel('Registered patients','Showing the latest 250 records','<div class="wlh-actions" style="margin:0 0 10px"><input class="wlh-search" id="wlhPatientSearch" placeholder="Search name, patient number or phone"></div>'+
      '<div id="wlhPatientsTable">'+table(['Photo','Patient number','Full name','Date of birth','Gender','Phone','Status'],rows,'No patients registered yet.')+'</div>'));
  }
  async function renderAppointments() {
    var appts=await query('hospital_appointments','id,patient_id,doctor_staff_id,department_id,appointment_at,reason,status,notes','appointment_at',false,150);
    var patientMap={};patients.forEach(function(p){patientMap[p.id]=p;});
    var staffMap={};staff.forEach(function(s){staffMap[s.id]=s;});
    var rows=appts.map(function(a){
      var p=patientMap[a.patient_id]||{}, d=staffMap[a.doctor_staff_id]||{};
      return '<tr><td><b>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</b><div class="wlh-note">'+esc(p.patient_number||'')+'</div></td><td>'+esc(dateTime(a.appointment_at))+'</td><td>'+esc(d.first_name ? d.first_name+' '+d.last_name : 'Not assigned')+'</td><td>'+esc(a.reason||'—')+'</td><td>'+badge(a.status)+'</td><td>'+(['scheduled','checked_in'].indexOf(a.status)>=0?'<select data-appointment-status="'+a.id+'" class="wlh-search"><option value="scheduled" '+(a.status==='scheduled'?'selected':'')+'>Scheduled</option><option value="checked_in" '+(a.status==='checked_in'?'selected':'')+'>Checked in</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select>':'—')+'</td></tr>';
    }).join('');
    var form=hasRole(['doctor','nurse','receptionist','administrator'])?panel('Book appointment','Schedule a consultation or follow-up','<form class="wlh-form" data-hospital-form="appointment">'+
      selectField('Patient','patient_id',patientOptions(),true)+selectField('Department','department_id',departmentOptions(),false)+
      selectField('Doctor','doctor_staff_id',staffOptions('doctor'),false)+field('Date and time','appointment_at','datetime-local',true)+
      field('Reason for visit','reason','text',false)+area('Notes','notes',2)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Book appointment</button></div></form>'):'';
    root().innerHTML=shell('Appointments','Schedule visits and update the appointment queue.',form+
      panel('Appointment schedule','Latest 150 appointments',table(['Patient','Date & time','Doctor','Reason','Status','Update'],rows,'No appointments yet.')));
  }
  async function renderClinical() {
    var encounters=await query('hospital_encounters','id,patient_id,attending_staff_id,status,chief_complaint,assessment,started_at,ended_at','started_at',false,100);
    var pmap={};patients.forEach(function(p){pmap[p.id]=p;});
    var smap={};staff.forEach(function(s){smap[s.id]=s;});
    var rows=encounters.map(function(e){var p=pmap[e.patient_id]||{},d=smap[e.attending_staff_id]||{};
      return '<tr><td>'+esc(dateTime(e.started_at))+'</td><td><b>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</b><div class="wlh-note">'+esc(p.patient_number||'')+'</div></td><td>'+esc(d.first_name?d.first_name+' '+d.last_name:'—')+'</td><td>'+esc(e.chief_complaint||'—')+'</td><td>'+esc(e.assessment||'—')+'</td><td>'+badge(e.status)+'</td></tr>';
    }).join('');
    var form=hasRole(['doctor','nurse','administrator'])?panel('New clinical encounter','Record clinical notes, assessment and observations','<form class="wlh-form" data-hospital-form="encounter">'+
      selectField('Patient','patient_id',patientOptions(),true)+selectField('Attending clinician','attending_staff_id',staffOptions('doctor').concat(staffOptions('nurse')),false)+
      field('Chief complaint','chief_complaint','text',true)+area('Clinical notes','clinical_notes',3)+area('Assessment','assessment',2)+area('Care plan','plan',2)+
      '<div class="wlh-wide"><strong class="wlh-note">Optional observations</strong></div>'+
      field('Blood pressure','blood_pressure','text',false,null,'placeholder="e.g. 120/80 mmHg"')+
      field('Pulse (bpm)','pulse','number',false,null,'min="1" max="300"')+
      field('Temperature (°C)','temperature','number',false,null,'step="0.1"')+
      field('Respiratory rate (/min)','respiratory_rate','number',false,null,'min="1" max="100"')+
      field('Oxygen saturation (%)','oxygen_saturation','number',false,null,'min="1" max="100"')+
      field('Weight (kg)','weight','number',false,null,'step="0.1"')+
      field('Height (cm)','height','number',false,null,'step="0.1"')+
      (hasRole(['doctor','administrator']) ? field('Diagnosis','diagnosis_text','text',false)+field('Diagnosis code (optional)','diagnosis_code','text',false) : '')+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Save clinical record</button></div></form>'):'';
    root().innerHTML=shell('Clinical records','Authorised clinical staff can create encounter notes, diagnoses and observations.',form+
      panel('Recent encounters','Clinical notes and consultation history',table(['Started','Patient','Clinician','Chief complaint','Assessment','Status'],rows,'No clinical encounters recorded.')));
  }
  async function renderAdmissions() {
    var admissions=await query('hospital_admissions','id,patient_id,ward_id,bed_id,admitting_doctor_staff_id,admission_at,diagnosis,status,discharge_at,discharge_notes','admission_at',false,100);
    var pmap={},wmap={},bmap={},smap={};
    patients.forEach(function(x){pmap[x.id]=x;});wards.forEach(function(x){wmap[x.id]=x;});beds.forEach(function(x){bmap[x.id]=x;});staff.forEach(function(x){smap[x.id]=x;});
    var rows=admissions.map(function(a){var p=pmap[a.patient_id]||{},w=wmap[a.ward_id]||{},b=bmap[a.bed_id]||{},d=smap[a.admitting_doctor_staff_id]||{};
      return '<tr><td><b>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</b><div class="wlh-note">'+esc(p.patient_number||'')+'</div></td><td>'+esc(w.name||'—')+'</td><td>'+esc(b.bed_number||'—')+'</td><td>'+esc(dateTime(a.admission_at))+'</td><td>'+esc(a.diagnosis||'—')+'</td><td>'+badge(a.status)+'</td><td>'+(a.status==='admitted'?'<button class="wlh-btn alt" data-discharge="'+a.id+'" type="button">Discharge</button>':'—')+'</td></tr>';
    }).join('');
    var form=hasRole(['doctor','nurse','administrator'])?panel('Admit patient','Bed assignment is validated and saved as one database transaction','<form class="wlh-form" data-hospital-form="admission">'+
      selectField('Patient','patient_id',patientOptions(),true)+selectField('Ward','ward_id',wardOptions(),true)+
      selectField('Available bed','bed_id',bedOptions(true),true)+selectField('Admitting doctor','admitting_doctor_staff_id',staffOptions('doctor'),false)+
      area('Admission diagnosis','diagnosis',2)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Admit patient</button></div></form>'):'';
    root().innerHTML=shell('Patient admissions','Manage inpatient admission, bed assignment and discharge.',form+
      panel('Admission register','Latest 100 admission records',table(['Patient','Ward','Bed','Admitted','Diagnosis','Status','Action'],rows,'No admissions recorded.')));
  }
  async function renderWards() {
    var bedRows=beds.map(function(b){var w=wards.find(function(x){return x.id===b.ward_id;})||{};
      return '<tr><td>'+esc(w.name||'—')+'</td><td><b>'+esc(b.bed_number)+'</b></td><td>'+badge(b.status)+'</td></tr>';
    }).join('');
    var wardRows=wards.map(function(w){var n=beds.filter(function(b){return b.ward_id===w.id;}).length;
      return '<tr><td><b>'+esc(w.name)+'</b></td><td>'+esc(w.ward_type)+'</td><td>'+n+'</td></tr>';
    }).join('');
    var canManageBeds=isManager() || staffRole==='administrator' || staffRole==='nurse';
    var canManageWards=isManager() || staffRole==='administrator';
    var wardForm=canManageWards?panel('Add ward','Create a ward or unit','<form class="wlh-form" data-hospital-form="ward">'+field('Ward name','name','text',true)+
      selectField('Ward type','ward_type',['general','private','icu','maternity','pediatric','emergency','other'].map(function(x){return {value:x,label:x.replaceAll('_',' ')};}),true)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Add ward</button></div></form>'):'';
    var bedForm=canManageBeds?panel('Add bed','Register a bed under an existing ward','<form class="wlh-form" data-hospital-form="bed">'+
      selectField('Ward','ward_id',wardOptions(),true)+field('Bed number','bed_number','text',true)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Add bed</button></div></form>'):'';
    root().innerHTML=shell('Wards & beds','Monitor capacity and bed availability across hospital wards.', '<div class="wlh-two">'+wardForm+bedForm+'</div>'+
      '<div class="wlh-two">'+panel('Ward directory','Registered wards',table(['Ward','Type','Beds'],wardRows,'No wards created yet.'))+
      panel('Bed register','Current occupancy',table(['Ward','Bed number','Status'],bedRows,'No beds registered yet.'))+'</div>');
  }
  async function renderPharmacy() {
    var medicines=await query('hospital_medicines','id,name,generic_name,category,unit,unit_price,stock_quantity,reorder_level,expiry_date','name',true,250);
    var mrows=medicines.map(function(m){return '<tr><td><b>'+esc(m.name)+'</b><div class="wlh-note">'+esc(m.generic_name||'')+'</div></td><td>'+esc(m.category||'—')+'</td><td>'+esc(m.unit)+'</td><td>'+esc(m.stock_quantity)+'</td><td>'+esc(m.reorder_level)+'</td><td>'+money(m.unit_price)+'</td><td>'+esc(dateOnly(m.expiry_date))+'</td></tr>';}).join('');
    var canStock=hasRole(['pharmacist','administrator']);
    var form=canStock?panel('Add medicine to stock','Maintain the hospital pharmacy catalogue','<form class="wlh-form" data-hospital-form="medicine">'+
      field('Medicine name','name','text',true)+field('Generic name','generic_name','text',false)+
      field('Category','category','text',false)+selectField('Unit','unit',['tablet','capsule','syrup','injection','ointment','drop','inhaler','other'].map(function(x){return {value:x,label:x};}),true)+
      field('Unit price','unit_price','number',true,null,'step="0.01" min="0"')+
      field('Opening stock quantity','stock_quantity','number',true,null,'step="0.01" min="0"')+
      field('Reorder level','reorder_level','number',true,null,'step="0.01" min="0"')+
      field('Expiry date','expiry_date','date',false)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Save medicine</button></div></form>'):'';
    var canPrescribe=hasRole(['doctor','administrator']);
    var prescriptionForm=canPrescribe?panel('Create prescription','Save a medicine order and its prescription line together','<form class="wlh-form" data-hospital-form="prescription">'+
      selectField('Patient','patient_id',patientOptions(),true)+selectField('Doctor','doctor_staff_id',staffOptions('doctor'),true)+
      selectField('Medicine','medicine_id',medicines.map(function(m){return {value:m.id,label:m.name+' · '+m.stock_quantity+' '+m.unit+' in stock'};}),true)+
      field('Dosage','dosage','text',true)+field('Frequency','frequency','text',true)+field('Duration','duration','text',true)+
      field('Quantity','quantity','number',true,null,'min="0.01" step="0.01"')+
      field('Appointment ID (optional)','appointment_id','text',false)+field('Active admission ID (optional)','admission_id','text',false)+
      area('Prescription notes','notes',2)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Create prescription</button></div></form>'):'';
    var prescriptions=await query('hospital_prescription_items','id,prescription_id,medicine_id,dosage,frequency,duration,quantity,quantity_dispensed','created_at',false,200);
    var rx=await query('hospital_prescriptions','id,patient_id,prescribed_at,status,notes','prescribed_at',false,150);
    var pMap={};rx.forEach(function(p){pMap[p.id]=p;});
    var rows=prescriptions.map(function(x){var p=pMap[x.prescription_id]||{},patient=patients.find(function(y){return y.id===p.patient_id;})||{},med=medicines.find(function(y){return y.id===x.medicine_id;})||{};
      var remaining=Number(x.quantity)-Number(x.quantity_dispensed);
      return '<tr><td>'+esc((patient.first_name||'Patient')+' '+(patient.last_name||''))+'</td><td>'+esc(med.name||'Medicine')+'</td><td>'+esc(x.dosage||'—')+' · '+esc(x.frequency||'—')+'</td><td>'+esc(x.quantity_dispensed)+' / '+esc(x.quantity)+'</td><td>'+badge(p.status)+'</td><td>'+(remaining>0 && (canStock || isManager())?'<input class="wlh-search" style="width:75px" type="number" min="0.01" max="'+remaining+'" step="0.01" value="'+remaining+'" id="wlhQty-'+x.id+'"><button class="wlh-btn alt" type="button" data-dispense="'+x.id+'">Dispense</button>':'—')+'</td></tr>';
    }).join('');
    root().innerHTML=shell('Pharmacy','Manage medicine inventory and dispense authorised prescriptions.',form+prescriptionForm+
      panel('Medicine inventory','Stock balances and reorder thresholds',table(['Medicine','Category','Unit','In stock','Reorder level','Unit price','Expiry'],mrows,'No medicines in the catalogue.'))+
      panel('Prescription dispensing','Dispensing decreases stock and updates the prescription atomically',table(['Patient','Medicine','Directions','Dispensed','Status','Action'],rows,'No prescriptions are waiting for dispensing.')));
  }
  async function renderLaboratory() {
    var tests=await query('hospital_lab_tests','id,patient_id,doctor_staff_id,appointment_id,admission_id,test_name,ordered_at,status,result,reported_at,reported_by','ordered_at',false,200);
    var rows=tests.map(function(t){var p=patients.find(function(x){return x.id===t.patient_id;})||{};
      var statusControl=(hasRole(['lab_technician','administrator']) || isManager())?
        '<input class="wlh-search" style="width:180px" id="wlhResult-'+t.id+'" value="'+esc(t.result||'')+'" placeholder="Enter test result">'+
        '<select class="wlh-search" data-lab-status="'+t.id+'"><option value="ordered" '+(t.status==='ordered'?'selected':'')+'>Ordered</option><option value="in_progress" '+(t.status==='in_progress'?'selected':'')+'>In progress</option><option value="completed" '+(t.status==='completed'?'selected':'')+'>Completed</option><option value="cancelled" '+(t.status==='cancelled'?'selected':'')+'>Cancelled</option></select>'+
        '<button class="wlh-btn alt" type="button" data-save-lab="'+t.id+'">Save result</button>':'—';
      return '<tr><td>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</td><td>'+esc(t.test_name)+'</td><td>'+esc(dateTime(t.ordered_at))+'</td><td>'+badge(t.status)+'</td><td>'+esc(t.result||'Awaiting result')+'</td><td>'+statusControl+'</td></tr>';
    }).join('');
    var form=hasRole(['doctor','nurse','administrator'])?panel('Order laboratory test','Create a test request for a registered patient','<form class="wlh-form" data-hospital-form="lab">'+
      selectField('Patient','patient_id',patientOptions(),true)+selectField('Ordering doctor','doctor_staff_id',staffOptions('doctor'),false)+
      field('Test name','test_name','text',true)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Submit test order</button></div></form>'):'';
    root().innerHTML=shell('Laboratory','Manage diagnostic requests and result status.',form+
      panel('Laboratory queue','Latest 200 laboratory requests',table(['Patient','Test','Ordered','Status','Result','Update'],rows,'No laboratory requests.')));
  }
  async function renderBilling() {
    var invoices=await query('hospital_invoices','id,patient_id,admission_id,invoice_number,description,amount,due_date,status,created_at','created_at',false,200);
    var payments=await query('hospital_invoice_payments','id,invoice_id,receipt_number,amount,payment_method,paid_at,note','paid_at',false,300);
    var billingPatients=patients;
    if(!isManager()){
      var billingDirectory=await client().rpc('hospital_list_billing_patients',{p_business_id:business().id});
      if(billingDirectory.error) throw billingDirectory.error;
      billingPatients=billingDirectory.data||[];
    }
    var pmap={};billingPatients.forEach(function(p){pmap[p.id||p.patient_id]=p;});
    var paidMap={};payments.forEach(function(p){paidMap[p.invoice_id]=(paidMap[p.invoice_id]||0)+Number(p.amount);});
    var rows=invoices.map(function(i){var p=pmap[i.patient_id]||{},paid=paidMap[i.id]||0,outstanding=Math.max(0,Number(i.amount)-paid);
      return '<tr><td><b>'+esc(i.invoice_number)+'</b></td><td>'+esc((p.first_name||'Patient')+' '+(p.last_name||''))+'</td><td>'+esc(i.description)+'</td><td>'+money(i.amount)+'</td><td>'+money(paid)+'</td><td>'+money(outstanding)+'</td><td>'+badge(i.status)+'</td><td>'+(outstanding>0 && i.status!=='cancelled' && i.status!=='waived' && (isManager() || membershipRole==='accountant' || staffRole==='cashier' || staffRole==='administrator')?'<button class="wlh-btn alt" type="button" data-invoice-pay="'+i.id+'">Record payment</button>':'—')+'</td></tr>';
    }).join('');
    var canBill=isManager() || membershipRole==='accountant' || staffRole==='cashier' || staffRole==='administrator';
    var canCreateInvoice=isManager() || membershipRole==='accountant' || staffRole==='cashier' || staffRole==='administrator';
    cache.invoices=invoices;
    var form=canBill && canCreateInvoice?panel('Create invoice','Record a hospital service or admission charge','<form class="wlh-form" data-hospital-form="invoice">'+
      selectField('Patient','patient_id',patientOptions(),true)+field('Invoice number','invoice_number','text',true)+
      field('Amount','amount','number',true,null,'min="0.01" step="0.01"')+field('Due date','due_date','date',false)+
      area('Description','description',2)+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Create invoice</button></div></form>'):'';
    root().innerHTML=shell('Hospital billing','Issue invoices and record cash, mobile money, bank or card payments.',form+
      panel('Invoice register','Outstanding balances are calculated from the recorded payment ledger',table(['Invoice','Patient','Description','Invoice total','Paid','Outstanding','Status','Action'],rows,'No invoices have been created.'))+
      panel('Payment history','Latest recorded receipts',table(['Receipt','Invoice','Amount','Method','Date'],payments.slice(0,50).map(function(p){return '<tr><td>'+esc(p.receipt_number)+'</td><td>'+esc(invoices.find(function(i){return i.id===p.invoice_id;})?.invoice_number||'—')+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_method)+'</td><td>'+esc(dateTime(p.paid_at))+'</td></tr>';}).join(''),'No payments recorded.')));
  }
  async function renderStaff() {
    var accountResult=await client().rpc('hospital_list_workspace_members',{p_business_id:business().id});
    if(accountResult.error) throw accountResult.error;
    var accounts=accountResult.data||[];
    var accountRows=accounts.map(function(a){
      var linked=!!a.hospital_staff_id;
      return '<tr><td><b>'+esc(a.full_name||a.email)+'</b><div class="wlh-note">'+esc(a.email)+'</div></td>'+
        '<td>'+esc(a.workspace_role||'—')+'</td>'+
        '<td>'+(linked?badge(a.hospital_role):badge('not_linked'))+'</td>'+
        '<td>'+(linked?badge(a.employment_status):'<span class="wlh-note">No hospital role assigned</span>')+'</td></tr>';
    }).join('');
    currentStaffPhotoUrls=await signedPhotoMap(staff);
    var staffRows=staff.map(function(s){var d=departments.find(function(x){return x.id===s.department_id;})||{};
      var name=s.first_name+' '+s.last_name;
      return '<tr><td>'+avatar(currentStaffPhotoUrls[s.photo_path]||'',name)+'</td><td><b>'+esc(s.staff_number)+'</b></td><td>'+esc(name)+'</td><td>'+esc(s.staff_role.replaceAll('_',' '))+'</td><td>'+esc(d.name||'—')+'</td><td>'+esc(s.email||'—')+'</td><td>'+badge(s.employment_status)+'</td></tr>';
    }).join('');
    var deptRows=departments.map(function(d){return '<tr><td><b>'+esc(d.name)+'</b></td><td>'+esc(d.description||'—')+'</td></tr>';}).join('');
    var form=isManager()?panel('Assign hospital staff account','Use the email of an existing, email-confirmed Koroma Leone Tech account. If they are not yet in this workspace, they are added as a viewer; their hospital role is assigned separately. No password is requested.','<form class="wlh-form" data-hospital-form="staff">'+
      field('Registered account email','staff_email','email',true)+field('Staff number','staff_number','text',true)+
      field('First name','first_name','text',true)+field('Last name','last_name','text',true)+
      selectField('Hospital role','staff_role',['doctor','nurse','pharmacist','lab_technician','receptionist','cashier','administrator','other'].map(function(x){return {value:x,label:x.replaceAll('_',' ')};}),true)+
      field('Specialisation','specialization','text',false)+selectField('Department','department_id',departmentOptions(),false)+
      field('Phone','phone','tel',false)+photoField('Staff profile photograph','staff_photo')+
      '<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Link account and assign role</button></div></form><p class="wlh-note">The person must already have a registered and email-confirmed account. Workspace access still follows the platform account-approval process. Their general workspace role is not promoted by this action.</p>'):'';
    var deptForm=isManager()?panel('Add department','Create clinical or administrative departments','<form class="wlh-form" data-hospital-form="department">'+field('Department name','name','text',true)+
      field('Description','description','text',false)+'<div class="wlh-wide wlh-actions"><button class="wlh-btn" type="submit">Add department</button></div></form>'):'';
    root().innerHTML=shell('Staff & departments','Link registered workspace accounts to hospital roles and manage departments.',form+
      panel('Workspace accounts','Only active workspace members are listed. Hospital roles are independent from general workspace roles.',table(['Account','Workspace role','Hospital role','Staff status'],accountRows,'No active workspace accounts found.'))+
      '<div class="wlh-two">'+deptForm+panel('Department register','Configured departments',table(['Department','Description'],deptRows,'No departments created.'))+'</div>'+
      panel('Hospital staff directory','Staff profile and role register',table(['Photo','Staff number','Name','Role','Department','Email','Status'],staffRows,'No hospital staff profiles.')));
  }
  function wire(target) {
    target.querySelectorAll('[data-hospital-tab]').forEach(function(btn){btn.addEventListener('click',function(){activeTab=btn.getAttribute('data-hospital-tab');render();});});
    var search=document.getElementById('wlhPatientSearch');
    if(search) search.addEventListener('input',function(){
      var term=search.value.toLowerCase();
      var filtered=patients.filter(function(p){return [p.patient_number,p.first_name,p.last_name,p.phone].join(' ').toLowerCase().indexOf(term)>=0;});
      var rows=filtered.map(function(p){var name=p.first_name+' '+p.last_name;return '<tr><td>'+avatar(currentPatientPhotoUrls[p.photo_path]||'',name)+'</td><td><b>'+esc(p.patient_number)+'</b></td><td>'+esc(name)+'</td><td>'+esc(dateOnly(p.date_of_birth))+'</td><td>'+esc(p.gender||'—')+'</td><td>'+esc(p.phone||'—')+'</td><td>'+badge(p.status)+'</td></tr>';}).join('');
      var holder=document.getElementById('wlhPatientsTable');
      if(holder) holder.innerHTML=table(['Photo','Patient number','Full name','Date of birth','Gender','Phone','Status'],rows,'No matching patients.');
    });
    target.querySelectorAll('[data-hospital-form]').forEach(function(form){
      form.addEventListener('submit',function(ev){ev.preventDefault();submitForm(form.getAttribute('data-hospital-form'),form);});
    });
    target.querySelectorAll('[data-appointment-status]').forEach(function(el){
      el.addEventListener('change',async function(){var r=await client().from('hospital_appointments').update({status:el.value}).eq('id',el.getAttribute('data-appointment-status')).eq('business_id',business().id);
        if(r.error) toast(r.error.message,true); else {toast('Appointment updated.');render();}});
    });
    target.querySelectorAll('[data-lab-status]').forEach(function(el){
      el.addEventListener('change',async function(){
        var resultInput=document.getElementById('wlhResult-'+el.getAttribute('data-lab-status'));
        var patch={status:el.value,result:resultInput&&resultInput.value.trim()?resultInput.value.trim():null};
        if(el.value==='completed' && patch.result){patch.reported_at=new Date().toISOString();patch.reported_by=currentUserId;}
        var r=await client().from('hospital_lab_tests').update(patch).eq('id',el.getAttribute('data-lab-status')).eq('business_id',business().id);
        if(r.error) toast(r.error.message,true); else {toast('Laboratory status updated.');render();}
      });
    });
    target.querySelectorAll('[data-save-lab]').forEach(function(btn){
      btn.addEventListener('click',async function(){
        var id=btn.getAttribute('data-save-lab'),input=document.getElementById('wlhResult-'+id),status=target.querySelector('[data-lab-status="'+id+'"]');
        var result=input&&input.value.trim();
        if(!result){toast('Enter the laboratory result before saving.',true);return;}
        var patch={result:result};
        if(status&&status.value==='completed'){patch.reported_at=new Date().toISOString();patch.reported_by=currentUserId;}
        var r=await client().from('hospital_lab_tests').update(patch).eq('id',id).eq('business_id',business().id);
        if(r.error) toast(r.error.message,true); else {toast('Laboratory result saved.');render();}
      });
    });
    target.querySelectorAll('[data-discharge]').forEach(function(btn){
      btn.addEventListener('click',async function(){var note=prompt('Discharge notes (optional):');if(note===null)return;
        var r=await client().rpc('hospital_discharge_patient',{p_business_id:business().id,p_admission_id:btn.getAttribute('data-discharge'),p_discharge_notes:note});
        if(r.error) toast(r.error.message,true); else {toast('Patient discharged and bed released.');render();}});
    });
    target.querySelectorAll('[data-dispense]').forEach(function(btn){
      btn.addEventListener('click',async function(){var id=btn.getAttribute('data-dispense'),input=document.getElementById('wlhQty-'+id),qty=Number(input&&input.value);
        if(!qty || qty<=0){toast('Enter a valid dispensing quantity.',true);return;}
        var r=await client().rpc('hospital_dispense_medicine',{p_business_id:business().id,p_prescription_item_id:id,p_quantity:qty});
        if(r.error) toast(r.error.message,true); else {toast('Medicine dispensed and stock updated.');render();}});
    });
    target.querySelectorAll('[data-invoice-pay]').forEach(function(btn){
      btn.addEventListener('click',async function(){
        var invoiceId=btn.getAttribute('data-invoice-pay'),invoice=(cache.invoices||[]).find(function(x){return x.id===invoiceId;});
        var amount=prompt('Enter payment amount ('+((business()&&business().currency_code)||'SLE')+').');
        if(amount===null)return;
        var method=prompt('Payment method: cash, mobile_money, bank_transfer, card or other','cash');
        if(method===null)return;
        var receipt=prompt('Receipt number:','RCPT-'+Date.now().toString(36).toUpperCase());
        if(receipt===null)return;
        var r=await client().rpc('hospital_record_invoice_payment',{p_business_id:business().id,p_invoice_id:invoiceId,p_receipt_number:receipt,p_amount:Number(amount),p_payment_method:method,p_note:null});
        if(r.error) toast(r.error.message,true); else {toast('Payment recorded. Invoice balance updated.');render();}
      });
    });
  }
  async function submitForm(kind, form) {
    var fd=new FormData(form), data=Object.fromEntries(fd.entries()), b=business(), user=currentUserId;
    var payload={business_id:b.id};
    function nullable(name){return data[name] ? data[name] : null;}
    try {
      if(kind==='patient'){
        var patientPhoto=validateHospitalPhoto(data.patient_photo);
        Object.assign(payload,{patient_number:'PAT-'+Date.now().toString(36).toUpperCase()+'-'+Math.floor(Math.random()*90+10),
          first_name:data.first_name.trim(),last_name:data.last_name.trim(),date_of_birth:nullable('date_of_birth'),
          gender:nullable('gender'),phone:nullable('phone'),email:nullable('email'),address:nullable('address'),
          blood_group:nullable('blood_group'),allergies:nullable('allergies'),emergency_contact_name:nullable('emergency_contact_name'),
          emergency_contact_phone:nullable('emergency_contact_phone'),notes:nullable('notes'),created_by:user});
        var p=await client().from('hospital_patients').insert(payload).select('id').single();
        if(p.error) throw p.error;
        if(patientPhoto){
          try{
            var patientPath=b.id+'/patients/'+p.data.id+'/'+photoToken()+'.'+photoExtension(patientPhoto);
            await uploadHospitalPhoto(patientPhoto,patientPath);
            var patientPhotoSave=await client().from('hospital_patients').update({photo_path:patientPath}).eq('id',p.data.id).eq('business_id',b.id);
            if(patientPhotoSave.error){
              await client().storage.from('hospital-people-photos').remove([patientPath]);
              throw patientPhotoSave.error;
            }
            currentPatientPhotoUrls={};
            toast('Patient registered and photograph saved securely.');
          }catch(photoError){
            toast('Patient registered, but the photograph could not be saved: '+photoError.message,true);
          }
        }else{
          toast('Patient registered successfully.');
        }
      } else if(kind==='appointment'){
        Object.assign(payload,{patient_id:data.patient_id,department_id:nullable('department_id'),doctor_staff_id:nullable('doctor_staff_id'),
          appointment_at:new Date(data.appointment_at).toISOString(),reason:nullable('reason'),notes:nullable('notes'),status:'scheduled'});
        var a=await client().from('hospital_appointments').insert(payload);
        if(a.error) throw a.error;
        toast('Appointment booked.');
      } else if(kind==='encounter'){
        Object.assign(payload,{patient_id:data.patient_id,attending_staff_id:nullable('attending_staff_id'),
          attending_user_id:user,created_by:user,status:'open',chief_complaint:nullable('chief_complaint'),
          clinical_notes:nullable('clinical_notes'),assessment:nullable('assessment'),plan:nullable('plan')});
        var e=await client().from('hospital_encounters').insert(payload).select('id').single();
        if(e.error) throw e.error;
        var observations=[];
        ['blood_pressure','pulse','temperature','respiratory_rate','oxygen_saturation','weight','height'].forEach(function(k){
          if(data[k]) observations.push({business_id:b.id,encounter_id:e.data.id,observation_type:k,value_text:String(data[k]),unit:
            ({pulse:'bpm',temperature:'°C',respiratory_rate:'/min',oxygen_saturation:'%',weight:'kg',height:'cm'})[k]||null,recorded_by:user});
        });
        if(observations.length){var o=await client().from('hospital_observations').insert(observations);if(o.error)throw new Error('Encounter saved, but observations need checking: '+o.error.message);}
        if(data.diagnosis_text){var d=await client().from('hospital_diagnoses').insert({business_id:b.id,encounter_id:e.data.id,
          diagnosis_text:data.diagnosis_text,diagnosis_code:nullable('diagnosis_code'),recorded_by:user});if(d.error)throw new Error('Encounter saved, but diagnosis needs checking: '+d.error.message);}
        toast('Clinical encounter saved.');
      } else if(kind==='admission'){
        var admit=await client().rpc('hospital_admit_patient',{p_business_id:b.id,p_patient_id:data.patient_id,
          p_bed_id:data.bed_id,p_ward_id:data.ward_id,p_admitting_doctor_staff_id:nullable('admitting_doctor_staff_id'),p_diagnosis:nullable('diagnosis')});
        if(admit.error) throw admit.error;
        toast('Patient admitted. Bed occupancy updated.');
      } else if(kind==='ward'){
        Object.assign(payload,{name:data.name.trim(),ward_type:data.ward_type});
        var w=await client().from('hospital_wards').insert(payload);
        if(w.error) throw w.error;
        toast('Ward added.');
      } else if(kind==='bed'){
        Object.assign(payload,{ward_id:data.ward_id,bed_number:data.bed_number.trim(),status:'available'});
        var be=await client().from('hospital_beds').insert(payload);
        if(be.error) throw be.error;
        toast('Bed added and marked available.');
      } else if(kind==='medicine'){
        Object.assign(payload,{name:data.name.trim(),generic_name:nullable('generic_name'),category:nullable('category'),unit:data.unit,
          unit_price:Number(data.unit_price),stock_quantity:Number(data.stock_quantity),reorder_level:Number(data.reorder_level),expiry_date:nullable('expiry_date')});
        var med=await client().from('hospital_medicines').insert(payload);
        if(med.error) throw med.error;
        toast('Medicine saved to pharmacy stock.');
      } else if(kind==='prescription'){
        var rx=await client().rpc('hospital_create_prescription',{p_business_id:b.id,p_patient_id:data.patient_id,
          p_doctor_staff_id:data.doctor_staff_id,p_medicine_id:data.medicine_id,p_dosage:nullable('dosage'),
          p_frequency:nullable('frequency'),p_duration:nullable('duration'),p_quantity:Number(data.quantity),
          p_appointment_id:nullable('appointment_id'),p_admission_id:nullable('admission_id'),p_notes:nullable('notes')});
        if(rx.error) throw rx.error;
        toast('Prescription created with its medicine line.');
      } else if(kind==='lab'){
        Object.assign(payload,{patient_id:data.patient_id,doctor_staff_id:nullable('doctor_staff_id'),test_name:data.test_name.trim(),status:'ordered'});
        var lab=await client().from('hospital_lab_tests').insert(payload);
        if(lab.error) throw lab.error;
        toast('Laboratory test ordered.');
      } else if(kind==='invoice'){
        Object.assign(payload,{patient_id:data.patient_id,invoice_number:data.invoice_number.trim(),description:data.description.trim(),
          amount:Number(data.amount),due_date:nullable('due_date'),status:'unpaid'});
        var inv=await client().from('hospital_invoices').insert(payload);
        if(inv.error) throw inv.error;
        toast('Invoice created.');
      } else if(kind==='staff'){
        var staffPhoto=validateHospitalPhoto(data.staff_photo);
        var st=await client().rpc('hospital_assign_staff_by_email',{
          p_business_id:b.id,
          p_staff_email:data.staff_email.trim().toLowerCase(),
          p_staff_number:data.staff_number.trim(),
          p_first_name:data.first_name.trim(),
          p_last_name:data.last_name.trim(),
          p_staff_role:data.staff_role,
          p_specialization:nullable('specialization'),
          p_department_id:nullable('department_id'),
          p_phone:nullable('phone')
        });
        if(st.error) throw st.error;
        if(staffPhoto){
          try{
            var staffPath=b.id+'/staff/'+st.data+'/'+photoToken()+'.'+photoExtension(staffPhoto);
            await uploadHospitalPhoto(staffPhoto,staffPath);
            var staffPhotoSave=await client().from('hospital_staff').update({photo_path:staffPath}).eq('id',st.data).eq('business_id',b.id);
            if(staffPhotoSave.error){
              await client().storage.from('hospital-people-photos').remove([staffPath]);
              throw staffPhotoSave.error;
            }
            currentStaffPhotoUrls={};
            toast('Staff account linked, role assigned and photograph saved securely.');
          }catch(photoError){
            toast('Staff account linked and role assigned, but the photograph could not be saved: '+photoError.message,true);
          }
        }else{
          toast('Account linked and hospital role assigned. The workspace role was not changed.');
        }
      } else if(kind==='department'){
        Object.assign(payload,{name:data.name.trim(),description:nullable('description')});
        var dep=await client().from('hospital_departments').insert(payload);
        if(dep.error) throw dep.error;
        toast('Department added.');
      }
      await render();
    } catch(e) {
      toast(e.message || 'Unable to save this hospital record.',true);
    }
  }

  function setNavVisibility(enabled) {
    var button=document.querySelector('[data-page="hospital"]');
    if(button) button.hidden=!enabled;
  }
  async function refreshModuleVisibility(event) {
    var detail=event && event.detail || {};
    var modules=detail.modules || [];
    var enabled=modules.some(function(m){return m.module_key==='hospital' && m.is_enabled===true;});
    setNavVisibility(enabled);
  }
  window.addEventListener('whiteLionWorkspaceChanged',refreshModuleVisibility);
  window.addEventListener('whiteLionCloudReady',function(){
    setTimeout(async function(){
      var b=business();
      if(!b || !client()) return;
      var r=await client().from('business_industry_modules').select('module_key,is_enabled')
        .eq('business_id',b.id).eq('module_key','hospital').maybeSingle();
      setNavVisibility(!r.error && !!(r.data && r.data.is_enabled));
    },0);
  });

  window.WhiteLionHospital = {
    open:function(){activeTab='overview';render();},
    render:render,
    setTab:function(tab){activeTab=tab;render();}
  };
})();