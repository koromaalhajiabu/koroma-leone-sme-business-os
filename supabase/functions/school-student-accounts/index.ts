import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,key,{auth:{persistSession:false}});
  const body=await req.json();
  if(body.action==="resolve_login"){
   const {data:p}=await admin.from("school_profiles").select("business_id,portal_enabled").eq("portal_code",body.portal_code).maybeSingle();
   if(!p?.portal_enabled)return reply({error:"School portal unavailable."},404);
   const {data:s}=await admin.from("school_students").select("id,user_id,status,first_name,last_name").eq("business_id",p.business_id).eq("admission_number",String(body.admission_number||"").trim()).maybeSingle();
   if(!s||s.status!=="active"||!s.user_id||String((s.first_name+" "+s.last_name)).trim().toLowerCase().replace(/\\s+/g," ")!==String(body.full_name||"").trim().toLowerCase().replace(/\\s+/g," "))return reply({error:"Student ID and full name do not match an active portal account."},401);
   return reply({email:"student-"+s.id+"@student-login.whitelion.invalid"});
  }
  if(body.action==="activate"){
   const portalCode=String(body.portal_code||"").trim(),admission=String(body.admission_number||"").trim(),fullName=String(body.full_name||"").trim(),activation=String(body.activation_code||"").trim().toUpperCase(),password=String(body.password||"");
   if(!portalCode||!admission||!fullName||!activation)return reply({error:"Enter your Student ID, full name and activation code."},400);
   if(password.length<8)return reply({error:"Choose a password with at least 8 characters."},400);
   const {data:p}=await admin.from("school_profiles").select("business_id,portal_enabled").eq("portal_code",portalCode).maybeSingle();
   if(!p?.portal_enabled)return reply({error:"School portal unavailable."},404);
   const {data:s,error:se}=await admin.from("school_students").select("id,first_name,last_name,admission_number,status,user_id,portal_activation_code").eq("business_id",p.business_id).eq("admission_number",admission).maybeSingle();
   const norm=(v:any)=>String(v||"").trim().replace(/\\s+/g," ").toLowerCase();
   if(se||!s||s.status!=="active"||s.user_id||norm(s.first_name+" "+s.last_name)!==norm(fullName))return reply({error:"Student ID, name or activation code is incorrect, or the code has already been used."},401);
   const {data:codeRow,error:codeError}=await admin.from("school_student_portal_activation_codes").select("activation_code").eq("business_id",p.business_id).eq("student_id",s.id).maybeSingle();
   if(codeError||!codeRow||String(codeRow.activation_code).toUpperCase()!==activation)return reply({error:"The one-time activation code is incorrect or has already been used."},401);
   const email="student-"+s.id+"@student-login.whitelion.invalid";
   const {data:created,error:ce}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:s.first_name+" "+s.last_name,account_type:"school_student",student_id:s.id,must_change_password:false}});
   if(ce||!created.user)return reply({error:ce?.message||"Could not create student account."},409);
   const {data:linked,error:le}=await admin.from("school_students").update({user_id:created.user.id}).eq("id",s.id).is("user_id",null).select("id").maybeSingle();
   if(le||!linked){await admin.auth.admin.deleteUser(created.user.id);return reply({error:"Activation code already used. Please sign in instead."},409);}
   const {error:consumeError}=await admin.from("school_student_portal_activation_codes").delete().eq("student_id",s.id).eq("activation_code",codeRow.activation_code);\n   if(consumeError){await admin.from("school_students").update({user_id:null}).eq("id",s.id).eq("user_id",created.user.id);await admin.auth.admin.deleteUser(created.user.id);return reply({error:"Could not consume the activation code. Please try again."},500);}\n   const {error:me}=await admin.from("school_memberships").upsert({business_id:p.business_id,user_id:created.user.id,school_role:"student",is_active:true},{onConflict:"business_id,user_id"});
   if(me){await admin.from("school_students").update({user_id:null}).eq("id",s.id).eq("user_id",created.user.id);await admin.auth.admin.deleteUser(created.user.id);return reply({error:"Account setup failed: "+me.message},500);}
   return reply({ok:true,email,student_name:s.first_name+" "+s.last_name});
  }
  const token=(req.headers.get("Authorization")||"").replace("Bearer ","");
  const {data:u,error:ue}=await admin.auth.getUser(token);
  if(ue||!u.user)return reply({error:"Administrator sign-in required."},401);
  const businessId=String(body.business_id||""),studentId=String(body.student_id||""),password=String(body.temporary_password||"");
  const {data:m}=await admin.from("business_members").select("role,is_active").eq("business_id",businessId).eq("user_id",u.user.id).maybeSingle();
  if(!m||m.is_active===false||!["owner","admin","manager"].includes(String(m.role).toLowerCase()))return reply({error:"School administrator permission required."},403);
  if(password.length<12)return reply({error:"Temporary password must contain at least 12 characters."},400);
  const {data:s}=await admin.from("school_students").select("id,admission_number,first_name,last_name,status,user_id").eq("business_id",businessId).eq("id",studentId).maybeSingle();
  if(!s||s.status!=="active"||s.user_id)return reply({error:"Active student not found or account already exists."},409);
  const email="student-"+s.id+"@student-login.whitelion.invalid";
  const {data:created,error:ce}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:s.first_name+" "+s.last_name,account_type:"school_student",must_change_password:true}});
  if(ce||!created.user)throw ce||new Error("Could not create student account.");
  const {error:le}=await admin.from("school_students").update({user_id:created.user.id}).eq("id",s.id).is("user_id",null);
  if(le){await admin.auth.admin.deleteUser(created.user.id);throw le;}
  const {error:re}=await admin.from("school_memberships").upsert({business_id:businessId,user_id:created.user.id,school_role:"student",is_active:true},{onConflict:"business_id,user_id"});
  if(re){await admin.from("school_students").update({user_id:null}).eq("id",s.id);await admin.auth.admin.deleteUser(created.user.id);throw re;}
  return reply({ok:true,student_name:s.first_name+" "+s.last_name,admission_number:s.admission_number,temporary_password:password});
 }catch(e){return reply({error:e?.message||"Student account request failed."},500)}
});