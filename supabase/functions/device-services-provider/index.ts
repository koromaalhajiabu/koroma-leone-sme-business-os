import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://koromaalhajiabu.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return reply({ok:false,error:"POST required."},405);
 try{
  const auth=req.headers.get("Authorization")||"", url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userErr}=await userClient.auth.getUser();
  if(userErr||!user) return reply({ok:false,error:"Sign in required."},401);
  const body=await req.json();
  const {data:isDeveloper,error:developerError}=await userClient.rpc("is_platform_developer");
  if(developerError||isDeveloper!==true) return reply({ok:false,error:"Only the registered White Lion platform developer can manage device-service providers."},403);
  if(body.action==="verify_servicecoded_secret") {
   const configured=Boolean(Deno.env.get("SERVICECODED_API_KEY")?.trim());
   return reply({ok:true,provider:"ServiceCoded",secret_configured:configured,secret_value_exposed:false});
  }
  const businessId=String(body.business_id||""), provider=String(body.provider||"");
  if(body.action!=="sync_catalogue"||!businessId) return reply({ok:false,error:"Invalid request."},400);
  if(!businessId) return reply({ok:false,error:"Business ID is required."},400);
  let services:any[]=[], providerName="", currency="USD";
  if(provider==="devicedecoded"){
   providerName="DeviceDecoded"; currency="CREDITS"; const response=await fetch("https://devicedecoded.com/api/v1/checks/services",{headers:{Accept:"application/json"}});
   const payload=await response.json(); if(!response.ok) throw new Error("DeviceDecoded catalogue returned HTTP "+response.status);
   services=(Array.isArray(payload.services)?payload.services:[]).map((x:any)=>{const rawCredits=x.credits==null?null:Number(x.credits);return {id:String(x.service),name:String(x.name||"Unnamed service"),group:String(x.category||"Device checks"),price:rawCredits!==null&&Number.isFinite(rawCredits)?rawCredits:null,currency:"CREDITS",type:"IMEI",description:"DeviceDecoded provider cost: "+(rawCredits!==null&&Number.isFinite(rawCredits)?rawCredits+" credits":"not supplied")+"; USD conversion not confirmed",delivery:x.instant?"Instant":"Provider turnaround varies"};});
  }else if(provider==="imei_org"){
   providerName="IMEI.org"; const key=Deno.env.get("IMEI_ORG_API_KEY"); if(!key) return reply({ok:false,error:"IMEI_ORG_API_KEY is not configured in Supabase Edge Function secrets."},409);
   const response=await fetch("https://api-client.imei.org/api/services?apikey="+encodeURIComponent(key),{headers:{Accept:"application/json"}});
   const payload=await response.json(); if(!response.ok||Number(payload.status)!==1) throw new Error("IMEI.org service catalogue request failed.");
   services=(payload?.response?.services||[]).map((x:any)=>({id:String(x.id),name:String(x.name||"Unnamed service"),group:"IMEI services",price:Number(x.price),currency:"USD",type:"IMEI",description:"Provider service catalogue",delivery:"Provider turnaround varies"}));
  }else return reply({ok:false,error:"This provider requires separate onboarding before catalogue integration."},409);
  if(!services.length) throw new Error("Provider returned no services.");
  const admin=createClient(url,service), stamp=new Date().toISOString();
  const rows=services.map(x=>({business_id:businessId,provider_key:provider,provider_service_id:x.id,provider_service_type:x.type||"IMEI",provider_group:x.group,service_name:x.name,provider_credit:Number.isFinite(x.price)?x.price:null,provider_currency:x.currency||currency,delivery_time:x.delivery,description:x.description,is_active:true,last_synced_at:stamp}));
  const {error:upsertErr}=await admin.from("phone_unlocking_provider_services").upsert(rows,{onConflict:"business_id,provider_key,provider_service_type,provider_service_id"});
  if(upsertErr) throw upsertErr;
  await admin.from("phone_unlocking_provider_connections").upsert({business_id:businessId,provider_key:provider,connection_status:"connected",last_synced_at:stamp,last_error:null,updated_at:stamp},{onConflict:"business_id,provider_key"});
  return reply({ok:true,provider_name:providerName,provider_currency:currency,synced_count:rows.length});
 }catch(e){return reply({ok:false,error:String((e as Error)?.message||e).slice(0,300)},500);}
});
