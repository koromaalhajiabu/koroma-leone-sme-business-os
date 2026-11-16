import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"https://koromaalhajiabu.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return reply({ok:false,error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const body=await req.json();
  const serviceClient=createClient(url,service);
  if(body.action==="identify_device"){
   const imei=String(body.imei||"").replace(/\s+/g,"");
   if(!/^\d{15}$/.test(imei)) return reply({ok:false,error:"Enter a valid 15-digit IMEI."},400);
   let sum=0;
   for(let i=0;i<imei.length-1;i++){let n=Number(imei[i]);if(i%2===1){n*=2;if(n>9)n-=9;}sum+=n;}
   const check=(10-(sum%10))%10;
   if(check!==Number(imei[14])) return reply({ok:false,error:"This IMEI failed its check-digit validation. Please check the number and try again."},422);
   const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||req.headers.get("cf-connecting-ip")||"unknown";
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip+"|white-lion-imei-lookup"));
   const ipHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
   const {data:allowed,error:rateError}=await serviceClient.rpc("claim_public_imei_lookup",{p_ip_hash:ipHash});
   if(rateError) return reply({ok:false,error:"IMEI lookup is temporarily unavailable. Please try again later."},503);
   if(allowed!==true) return reply({ok:false,error:"Please wait 30 seconds before requesting another IMEI lookup."},429);
   const key=Deno.env.get("DEVICEDECODED_API_KEY")?.trim();
   if(!key) return reply({ok:false,error:"Automatic IMEI identification is not activated yet. The DeviceDecoded API key must be configured in Supabase Edge Function secrets."},503);
   const catalogueResponse=await fetch("https://devicedecoded.com/api/v1/checks/services",{headers:{Accept:"application/json"}});
   const catalogue=await catalogueResponse.json();
   if(!catalogueResponse.ok) return reply({ok:false,error:"The IMEI provider catalogue is temporarily unavailable."},502);
   const entries=Array.isArray(catalogue.services)?catalogue.services:[];
   const identifyService=entries.find((s:any)=>/\b(imei check|model info|device info|tac lookup|make.?and.?model)\b/i.test(String(s.name||"")+" "+String(s.category||"")));
   if(!identifyService) return reply({ok:false,error:"The connected provider does not currently expose a dedicated IMEI model-identification service."},503);
   const lookupResponse=await fetch("https://devicedecoded.com/api/v1/checks",{
    method:"POST",headers:{"X-API-Key":key,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({imei,service:Number(identifyService.service)})
   });
   const lookup=await lookupResponse.json();
   if(!lookupResponse.ok) return reply({ok:false,error:lookupResponse.status===402?"The IMEI lookup provider has insufficient credits. Please contact White Lion.":lookupResponse.status===401?"The IMEI lookup provider key was rejected. Please contact White Lion.":"The provider could not identify this IMEI. Please enter the model manually."},lookupResponse.status===402?402:502);
   const source={...(lookup.result||{}),...(lookup.summary||{})};
   const findValue=(patterns:string[])=>{
    const pairs=Object.entries(source);
    for(const pattern of patterns){const hit=pairs.find(([k,v])=>new RegExp(pattern,"i").test(k)&&typeof v==="string"&&v.trim());if(hit)return String(hit[1]).trim();}
    return "";
   };
   const brand=findValue(["manufacturer","brand","make"]);
   const model=findValue(["marketing.?name","device.?model","\\bmodel\\b","product.?name"]);
   if(!brand||!model) return reply({ok:false,error:"The provider returned an IMEI result without a clear brand and model. Please enter the device details manually.",provider_service:identifyService.name,credits_used:lookup.credits_used??null},422);
   return reply({ok:true,brand,model,imei,provider:"DeviceDecoded",provider_service:identifyService.name,credits_used:lookup.credits_used??null,credit_balance:lookup.credit_balance??null});
  }
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userErr}=await userClient.auth.getUser();
  if(userErr||!user) return reply({ok:false,error:"Sign in required."},401);
  const {data:isDeveloper,error:developerError}=await userClient.rpc("is_platform_developer");
  if(developerError||isDeveloper!==true) return reply({ok:false,error:"Only the registered White Lion platform developer can manage device-service providers."},403);
  if(body.action==="verify_servicecoded_secret") {
   const configured=Boolean(Deno.env.get("SERVICECODED_API_KEY")?.trim());
   return reply({ok:true,provider:"ServiceCoded",secret_configured:configured,secret_value_exposed:false});
  }
  const provider=String(body.provider||"");
  if(body.action!=="sync_catalogue") return reply({ok:false,error:"Invalid request."},400);
  const {data:platformContext,error:contextError}=await userClient.rpc("get_platform_device_services_context");
  if(contextError||!platformContext?.business_id) return reply({ok:false,error:"Independent Device Services platform context is unavailable."},409);
  const businessId=String(platformContext.business_id);
  if(body.action==="test_devicedecoded_connection"){
   const key=Deno.env.get("DEVICEDECODED_API_KEY")?.trim();
   const response=await fetch("https://devicedecoded.com/api/v1/checks/services",{headers:{Accept:"application/json"}});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok||!Array.isArray(payload.services)) return reply({ok:false,error:"DeviceDecoded catalogue endpoint returned HTTP "+response.status,api_key_configured:Boolean(key)},502);
   return reply({ok:true,provider:"DeviceDecoded",catalogue_reachable:true,service_count:payload.services.length,api_key_configured:Boolean(key),api_key_validity:"not tested; DeviceDecoded documents no non-billable key-validation endpoint"});
  }
  if(body.action==="submit_devicedecoded_order"){
   const key=Deno.env.get("DEVICEDECODED_API_KEY")?.trim();
   if(!key) return reply({ok:false,error:"DEVICEDECODED_API_KEY is not configured in Supabase Edge Function secrets."},503);
   const orderId=String(body.order_id||"");
   if(!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ok:false,error:"A valid order ID is required."},400);
   const {data:order,error:claimError}=await userClient.rpc("claim_devicedecoded_order",{p_order_id:orderId});
   if(claimError||!order?.id) return reply({ok:false,error:claimError?.message||"The order could not be claimed for provider submission."},409);
   let providerResponse:any=null;
   try{
    const response=await fetch("https://devicedecoded.com/api/v1/checks",{
     method:"POST",
     headers:{"X-API-Key":key,"Content-Type":"application/json","Accept":"application/json"},
     body:JSON.stringify({imei:String(order.imei),service:Number(order.provider_service_id)})
    });
    const responseText=await response.text();
    try{providerResponse=JSON.parse(responseText);}catch{providerResponse={raw:responseText.slice(0,5000)};}
    if(!providerResponse||typeof providerResponse!=="object") providerResponse={raw:String(responseText).slice(0,5000)};
    if(response.ok){
     const used=Number(providerResponse.credits_used);
     const reference=providerResponse.order_reference||providerResponse.reference||providerResponse.check_id||providerResponse.id||null;
     const {error:finishError}=await userClient.rpc("finish_devicedecoded_order",{
      p_order_id:orderId,p_outcome:"submitted",p_provider_reference:reference,
      p_provider_credits_used:Number.isFinite(used)?used:null,p_provider_response:providerResponse,
      p_message:"DeviceDecoded accepted the API request. Review the provider response and verify the device outcome before marking the customer order completed."
     });
     if(finishError) return reply({ok:false,outcome:"unknown",error:"DeviceDecoded returned success, but White Lion could not save the response. Check DeviceDecoded order history before retrying. "+finishError.message},502);
     return reply({ok:true,outcome:"submitted",provider:"DeviceDecoded",provider_reference:reference,
      credits_used:Number.isFinite(used)?used:null,credit_balance:providerResponse.credit_balance??null,
      provider_response:providerResponse,
      message:"Provider accepted the request. The customer order is now Processing; verify the final unlock result before marking it Completed."});
    }
    const outcome=[401,402,404,422].includes(response.status)?"failed":"unknown";
    const message=String(providerResponse?.error||providerResponse?.message||("DeviceDecoded returned HTTP "+response.status)).slice(0,450);
    const {error:finishError}=await userClient.rpc("finish_devicedecoded_order",{
     p_order_id:orderId,p_outcome:outcome,p_provider_reference:null,p_provider_credits_used:null,
     p_provider_response:providerResponse,p_message:message
    });
    if(finishError) return reply({ok:false,outcome:"unknown",error:"Provider response received but could not be saved. Reconcile in DeviceDecoded before retrying."},502);
    return reply({ok:false,outcome,error:message,provider_http_status:response.status,
     no_retry:outcome==="unknown",message:outcome==="unknown"?"Do not retry until the provider account is checked for this request.":"The provider rejected the request; the documented response indicates no successful charge."},response.status===402?402:502);
   }catch(networkError){
    const message="The connection ended before White Lion could confirm the DeviceDecoded response. Check provider order history before any retry.";
    await userClient.rpc("finish_devicedecoded_order",{
     p_order_id:orderId,p_outcome:"unknown",p_provider_reference:null,p_provider_credits_used:null,
     p_provider_response:null,p_message:message
    });
    return reply({ok:false,outcome:"unknown",error:message,no_retry:true},502);
   }
  }
  let services:any[]=[], providerName="", currency="USD";
  if(provider==="devicedecoded"){
   providerName="DeviceDecoded"; currency="CREDITS"; const response=await fetch("https://devicedecoded.com/api/v1/checks/services",{headers:{Accept:"application/json"}});
   const payload=await response.json(); if(!response.ok) throw new Error("DeviceDecoded catalogue returned HTTP "+response.status);
   services=(Array.isArray(payload.services)?payload.services:[]).map((x:any)=>{const rawCredits=x.credits==null?null:Number(x.credits);return {id:String(x.service),name:String(x.name||"Unnamed service"),group:String(x.category||"Device checks"),price:rawCredits!==null&&Number.isFinite(rawCredits)?rawCredits:null,currency:"CREDITS",type:"IMEI",description:"DeviceDecoded provider cost: "+(rawCredits!==null&&Number.isFinite(rawCredits)?rawCredits+" credits":"not supplied")+"; USD conversion not confirmed",delivery:x.instant?"Instant":"Provider turnaround varies",instant:typeof x.instant==="boolean"?x.instant:null};});
  }else if(provider==="imei_org"){
   providerName="IMEI.org"; const key=Deno.env.get("IMEI_ORG_API_KEY"); if(!key) return reply({ok:false,error:"IMEI_ORG_API_KEY is not configured in Supabase Edge Function secrets."},409);
   const response=await fetch("https://api-client.imei.org/api/services?apikey="+encodeURIComponent(key),{headers:{Accept:"application/json"}});
   const payload=await response.json(); if(!response.ok||Number(payload.status)!==1) throw new Error("IMEI.org service catalogue request failed.");
   services=(payload?.response?.services||[]).map((x:any)=>({id:String(x.id),name:String(x.name||"Unnamed service"),group:"IMEI services",price:Number(x.price),currency:"USD",type:"IMEI",description:"Provider service catalogue",delivery:"Provider turnaround varies"}));
  }else return reply({ok:false,error:"This provider requires separate onboarding before catalogue integration."},409);
  if(!services.length) throw new Error("Provider returned no services.");
  const admin=createClient(url,service), stamp=new Date().toISOString();
  const rows=services.map(x=>({business_id:businessId,provider_key:provider,provider_service_id:x.id,provider_service_type:x.type||"IMEI",provider_group:x.group,service_name:x.name,provider_credit:Number.isFinite(x.price)?x.price:null,provider_currency:x.currency||currency,delivery_time:x.delivery,provider_is_instant:x.instant,description:x.description,is_active:true,last_synced_at:stamp}));
  const {error:upsertErr}=await admin.from("phone_unlocking_provider_services").upsert(rows,{onConflict:"business_id,provider_key,provider_service_type,provider_service_id"});
  if(upsertErr) throw upsertErr;
  const {error:connectionErr}=await admin.from("phone_unlocking_provider_connections").upsert({business_id:businessId,provider_key:provider,connection_status:"connected",last_synced_at:stamp,last_error:null,updated_at:stamp},{onConflict:"business_id,provider_key"});
  if(connectionErr) throw connectionErr;
  return reply({ok:true,provider_name:providerName,provider_currency:currency,synced_count:rows.length});
 }catch(e){return reply({ok:false,error:String((e as Error)?.message||e).slice(0,300)},500);}
});
