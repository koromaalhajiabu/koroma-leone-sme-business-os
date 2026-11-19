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
   const {data:s}=await admin.from("school_students").select("id,user_id,status").eq("business_id",p.business_id).ilike("admission_number",String(body.admission_number||"").trim()).maybeSingle();
   if(!s||s.status!=="active"||!s.user_id)return reply({error:"Student account not found or not activated."},404);
   return reply({email:"student-"+s.id+"@student-login.whitelion.invalid"});
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