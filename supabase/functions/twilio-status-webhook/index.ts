import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const equal=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"POST required"},405);
 const token=Deno.env.get("TWILIO_AUTH_TOKEN")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const url=Deno.env.get("SUPABASE_URL")||"";
 if(!token||!serviceKey||!url)return json({error:"Webhook configuration missing"},503);
 const raw=await req.text();const params=new URLSearchParams(raw);
 const signature=req.headers.get("x-twilio-signature")||"";
 const signedUrl=req.url;
 let material=signedUrl;
 const keys=[...new Set([...params.keys()])].sort();
 for(const key of keys){const vals=params.getAll(key).sort();for(const value of vals)material+=key+value;}
 const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(token),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",cryptoKey,new TextEncoder().encode(material));
 const expected=btoa(String.fromCharCode(...new Uint8Array(digest)));
 if(!signature||!equal(signature,expected))return json({error:"Invalid provider signature"},401);
 const sid=params.get("MessageSid");const state=(params.get("MessageStatus")||"").toLowerCase();
 if(!sid)return json({ok:true,ignored:true});
 const mapped=state==="delivered"||state==="read"?"delivered":state==="undelivered"?"undelivered":state==="failed"?"failed":state==="sent"||state==="queued"||state==="sending"?"accepted":null;
 if(!mapped)return json({ok:true,ignored:true});
 const headers={apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json",prefer:"return=minimal"};
 await fetch(`${url}/rest/v1/notification_delivery_queue?provider_message_id=eq.${encodeURIComponent(sid)}`,{
  method:"PATCH",headers,body:JSON.stringify({delivery_status:mapped,provider_status_at:new Date().toISOString(),...(mapped==="failed"||mapped==="undelivered"?{status:"failed"}:{})})
 });
 return json({ok:true});
});