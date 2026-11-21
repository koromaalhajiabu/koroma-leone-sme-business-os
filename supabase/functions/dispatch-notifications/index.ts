import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration incomplete" }, 503);
  if (req.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);

  const restHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_notification_delivery_batch`, {
    method: "POST", headers: restHeaders, body: JSON.stringify({ p_limit: 20 }),
  });
  if (!rpc.ok) return json({ error: "Could not claim delivery batch", status: rpc.status }, 502);
  const rows = await rpc.json();
  let sent = 0, retried = 0, blocked = 0, failed = 0;

  for (const item of rows as Array<{id:string;channel:string;destination:string;message_title:string;message_body:string;attempt_count:number}>) {
    let provider = item.channel === "email" ? "resend" : "twilio";
    let response: Response | null = null;
    let responseText = "";
    let providerId: string | null = null;
    let configError = "";

    try {
      if (item.channel === "email") {
        const apiKey = Deno.env.get("RESEND_API_KEY");
        const from = Deno.env.get("RESEND_FROM_EMAIL");
        if (!apiKey || !from) throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL");
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from, to: [item.destination], subject: item.message_title,
            text: item.message_body,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17243a"><h2>${esc(item.message_title)}</h2><p>${esc(item.message_body)}</p><p style="color:#758197;font-size:12px">Koroma Leone Tech SME Business OS</p></div>`,
          }),
        });
      } else {
        const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const token = Deno.env.get("TWILIO_AUTH_TOKEN");
        if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
        const form = new URLSearchParams();
        form.set("To", item.channel === "whatsapp" ? `whatsapp:${item.destination}` : item.destination);
        if (item.channel === "sms") {
          const from = Deno.env.get("TWILIO_SMS_FROM");
          if (!from) throw new Error("Missing TWILIO_SMS_FROM");
          form.set("From", from);
          form.set("Body", `${item.message_title}: ${item.message_body}`);
        } else {
          const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
          const contentSid = Deno.env.get("TWILIO_WHATSAPP_CONTENT_SID");
          if (!from || !contentSid) throw new Error("Missing TWILIO_WHATSAPP_FROM or approved TWILIO_WHATSAPP_CONTENT_SID");
          form.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);
          form.set("ContentSid", contentSid);
          form.set("ContentVariables", JSON.stringify({ "1": item.message_title, "2": item.message_body }));
        }
        response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        });
      }
      responseText = await response.text();
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(responseText); } catch { /* provider may return plain text */ }
      providerId = typeof parsed.id === "string" ? parsed.id : typeof parsed.sid === "string" ? parsed.sid : null;
      if (!response.ok) throw Object.assign(new Error(`Provider rejected request (${response.status})`), { status: response.status });
      
      await fetch(`${supabaseUrl}/rest/v1/notification_delivery_queue?id=eq.${item.id}`, {
        method: "PATCH", headers: { ...restHeaders, prefer: "return=minimal" },
        body: JSON.stringify({ status: "sent", provider_message_id: providerId, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }),
      });
      await fetch(`${supabaseUrl}/rest/v1/notification_delivery_attempts`, {
        method: "POST", headers: { ...restHeaders, prefer: "return=minimal" },
        body: JSON.stringify({ queue_id: item.id, channel: item.channel, provider, outcome: "accepted", provider_message_id: providerId, response_code: response.status, response_excerpt: responseText.slice(0, 900) }),
      });
      sent++;
    } catch (error) {
      const status = Number((error as {status?:number}).status || 0);
      const message = error instanceof Error ? error.message : "Provider delivery failed";
      const missingConfig = message.startsWith("Missing ");
      const permanent = missingConfig || (status >= 400 && status < 500 && status !== 429);
      const maxed = item.attempt_count >= 5;
      const nextStatus = missingConfig ? "blocked" : permanent || maxed ? "failed" : "queued";
      const delayMinutes = [5, 15, 60, 360, 720][Math.min(Math.max(item.attempt_count - 1, 0), 4)];
      await fetch(`${supabaseUrl}/rest/v1/notification_delivery_queue?id=eq.${item.id}`, {
        method: "PATCH", headers: { ...restHeaders, prefer: "return=minimal" },
        body: JSON.stringify({
          status: nextStatus,
          last_error: message.slice(0, 500),
          next_attempt_at: new Date(Date.now() + delayMinutes * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      await fetch(`${supabaseUrl}/rest/v1/notification_delivery_attempts`, {
        method: "POST", headers: { ...restHeaders, prefer: "return=minimal" },
        body: JSON.stringify({ queue_id: item.id, channel: item.channel, provider, outcome: missingConfig ? "blocked" : nextStatus === "queued" ? "retry" : "failed", response_code: status || null, response_excerpt: message.slice(0, 900) }),
      });
      if (missingConfig) blocked++; else if (nextStatus === "queued") retried++; else failed++;
    }
  }

  return json({ processed: rows.length, sent, retried, blocked, failed });
});