import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!url||!anon||!service||!jwt)return json({error:"Authentication required"},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await userClient.auth.getUser(jwt),user=userData?.user;
 if(userError||!user?.id||!user.email)return json({error:"Your sign-in session is invalid. Sign in again."},401);
 let body:{token?:string};try{body=await req.json()}catch{return json({error:"Invalid request body"},400)}
 const token=String(body.token||"").trim();if(token.length<32||token.length>256)return json({error:"Invitation code is invalid."},400);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:invite,error:inviteError}=await admin.from("travel_agency_portal_invites").select("id,applicant_id,business_id,email").eq("token_hash",hash).is("used_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(inviteError||!invite)return json({error:"This invitation is invalid, expired or already used. Ask the agency for a new invitation."},404);
 if(String(invite.email).trim().toLowerCase()!==user.email.trim().toLowerCase())return json({error:"Sign in using the same email address that received this invitation."},403);
 const now=new Date().toISOString();
 const {data:claimed,error:claimError}=await admin.from("travel_agency_portal_invites").update({used_at:now}).eq("id",invite.id).is("used_at",null).select("id").maybeSingle();
 if(claimError||!claimed)return json({error:"This invitation has already been used. Request a new one if needed."},409);
 const {data:applicant,error:linkError}=await admin.from("travel_agency_applicants").update({portal_user_id:user.id,updated_at:now}).eq("id",invite.applicant_id).eq("business_id",invite.business_id).ilike("email",user.email).select("id,full_name,case_reference,destination_interest,status").maybeSingle();
 if(linkError||!applicant){await admin.from("travel_agency_portal_invites").update({used_at:null}).eq("id",invite.id);return json({error:"The invitation does not match an applicant email on file. Contact the agency."},409)}
 await admin.from("travel_agency_notifications").insert({business_id:invite.business_id,applicant_id:applicant.id,recipient_user_id:user.id,title:"Applicant portal activated",body:"Your secure applicant portal is now linked to case "+(applicant.case_reference||applicant.id)+".",notification_type:"portal_activated"});
 return json({ok:true,applicant});
});