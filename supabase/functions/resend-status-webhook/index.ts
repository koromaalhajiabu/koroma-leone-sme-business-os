import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"POST required"},405);
 const secret=Deno.env.get("RESEND_WEBHOOK_SECRET")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 if(!secret||!serviceKey||!url)return json({error:"Webhook configuration missing"},503);
 const body=await req.text();
 const id=req.headers.get("svix-id")||"",ts=req.headers.get("svix-timestamp")||"",sig=req.headers.get("svix-signature")||"";
 const stamp=Number(ts);
 if(!id||!ts||!sig||!Number.isFinite(stamp)||Math.abs(Date.now()/1000-stamp)>300)return json({error:"Invalid webhook timestamp or headers"},401);
 const encoded=secret.startsWith("whsec_")?secret.slice(6):secret;
 let keyBytes:Uint8Array;try{keyBytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{return json({error:"Invalid webhook secret"},503);}
 const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${id}.${ts}.${body}`));
 const expected=btoa(String.fromCharCode(...new Uint8Array(digest)));
 const valid=sig.split(" ").some(part=>{const [version,value]=part.split(",");return version==="v1"&&value&&equal(value,expected);});
 if(!valid)return json({error:"Invalid provider signature"},401);
 let event:Record<string,any>;try{event=JSON.parse(body);}catch{return json({error:"Invalid JSON"},400);}
 const type=String(event.type||"");const data=event.data||{};const messageId=String(data.email_id||data.id||"");
 if(!messageId)return json({ok:true,ignored:true});
 const map:Record<string,string>={"email.sent":"accepted","email.delivered":"delivered","email.delivery_delayed":"delayed","email.bounced":"bounced","email.complained":"complained","email.failed":"failed"};
 const state=map[type];if(!state)return json({ok:true,ignored:true});
 const headers={apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json",prefer:"return=minimal"};
 await fetch(`${url}/rest/v1/notification_delivery_queue?provider_message_id=eq.${encodeURIComponent(messageId)}`,{
  method:"PATCH",headers,body:JSON.stringify({delivery_status:state,provider_status_at:new Date().toISOString(),...(state==="bounced"||state==="complained"||state==="failed"?{status:"failed"}:{})})
 });
 return json({ok:true});
});