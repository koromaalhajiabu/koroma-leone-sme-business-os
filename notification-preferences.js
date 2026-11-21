/* Koroma Leone Tech — opt-in controls for subscription email/SMS/WhatsApp alerts. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const client = () => window.whiteLionCloud?.getClient?.() || null;
  const userId = () => window.whiteLionCloud?.getSession?.()?.user?.id || null;
  const style = document.createElement('style');
  style.textContent = `
    #klDeliverySettings{border:0;background:transparent;color:#1767a6;font-size:11px;font-weight:750;padding:7px;cursor:pointer}
    #klDeliveryModal{display:none;position:fixed;inset:0;z-index:100010;background:#101a2d88;align-items:center;justify-content:center;padding:14px}
    #klDeliveryModal.open{display:flex}
    #klDeliveryCard{width:min(470px,100%);max-height:88vh;overflow:auto;background:#fff;color:#203047;border-radius:17px;padding:20px;box-shadow:0 24px 70px #08132655}
    #klDeliveryCard h3{margin:0 0 5px;font-size:17px}#klDeliveryCard p{font-size:11px;color:#718096;line-height:1.55}
    #klDeliveryCard label{display:block;font-size:11px;font-weight:700;margin:12px 0 5px}
    #klDeliveryCard input[type=email],#klDeliveryCard input[type=tel]{width:100%;padding:11px;border:1px solid #dfe5ee;border-radius:9px}
    .kl-channel-option{display:flex!important;align-items:center;gap:9px;padding:10px;border:1px solid #e7ecf3;border-radius:10px;margin:8px 0!important}
    .kl-delivery-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}
    .kl-delivery-actions button{border:1px solid #dfe5ee;border-radius:9px;padding:9px 13px;background:#fff;font-weight:700}
    .kl-delivery-actions .primary{background:#14243d;color:#fff;border-color:#14243d}
    #klDeliveryStatus{font-size:11px;min-height:17px;color:#16865b;margin-top:8px}
    html[data-theme="dark"] #klDeliveryCard{background:#172235;color:#e7edf6}
    html[data-theme="dark"] #klDeliveryCard input{background:#101a2d;color:#e7edf6;border-color:#34445b}
    @media(max-width:600px){#klDeliveryCard{padding:16px}}
  `;
  document.head.appendChild(style);

  function ensureModal(){
    if (!$('klDeliveryModal')) {
      const modal=document.createElement('div');modal.id='klDeliveryModal';
      modal.innerHTML='<section id="klDeliveryCard" role="dialog" aria-modal="true" aria-label="Notification delivery preferences"><h3>Notification delivery settings</h3><p>Choose how you receive subscription and payment alerts. External messages are off until you opt in. Standard provider charges may apply.</p><label for="klDeliveryEmail">Email address</label><input id="klDeliveryEmail" type="email" autocomplete="email" placeholder="you@example.com"><label for="klDeliveryPhone">Mobile number (international format)</label><input id="klDeliveryPhone" type="tel" autocomplete="tel" placeholder="+232XXXXXXXX"><label class="kl-channel-option"><input id="klDeliveryEmailOn" type="checkbox"> Email subscription alerts</label><label class="kl-channel-option"><input id="klDeliverySmsOn" type="checkbox"> SMS subscription alerts</label><label class="kl-channel-option"><input id="klDeliveryWaOn" type="checkbox"> WhatsApp subscription alerts</label><p>By enabling a channel, you consent to receive essential billing and subscription messages on that channel. You can switch it off at any time.</p><div id="klDeliveryStatus" aria-live="polite"></div><div class="kl-delivery-actions"><button type="button" id="klDeliveryCancel">Cancel</button><button type="button" class="primary" id="klDeliverySave">Save preferences</button></div></section>';
      document.body.appendChild(modal);
      modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');});
      $('klDeliveryCancel').addEventListener('click',()=>modal.classList.remove('open'));
      $('klDeliverySave').addEventListener('click',save);
    }
    const head=$('klNotificationPanel')?.querySelector('.kl-notif-head');
    if(head&&!$('klDeliverySettings')){
      const b=document.createElement('button');b.id='klDeliverySettings';b.type='button';b.textContent='Delivery settings';
      b.addEventListener('click',open);head.appendChild(b);
    }
  }
  async function open(){
    ensureModal();const sb=client(),uid=userId();if(!sb||!uid)return;
    $('klDeliveryStatus').textContent='Loading…';
    $('klDeliveryModal').classList.add('open');
    const {data,error}=await sb.from('notification_channel_preferences').select('*').eq('user_id',uid).maybeSingle();
    if(error){$('klDeliveryStatus').textContent='Could not load preferences. Please try again.';return;}
    const p=data||{};
    $('klDeliveryEmail').value=p.email_address||'';
    $('klDeliveryPhone').value=p.phone_e164||'';
    $('klDeliveryEmailOn').checked=!!p.email_enabled;
    $('klDeliverySmsOn').checked=!!p.sms_enabled;
    $('klDeliveryWaOn').checked=!!p.whatsapp_enabled;
    $('klDeliveryStatus').textContent='';
  }
  async function save(){
    const sb=client(),uid=userId();if(!sb||!uid)return;
    const status=$('klDeliveryStatus');status.textContent='Saving…';
    const now=new Date().toISOString();
    const emailOn=$('klDeliveryEmailOn').checked,smsOn=$('klDeliverySmsOn').checked,waOn=$('klDeliveryWaOn').checked;
    const email=$('klDeliveryEmail').value.trim()||null,phone=$('klDeliveryPhone').value.trim()||null;
    if((smsOn||waOn)&&phone&&!/^\+[1-9][0-9]{7,14}$/.test(phone)){status.textContent='Enter the phone number with country code, e.g. +232…';return;}
    if(emailOn&&!email){status.textContent='Enter an email address before enabling email.';return;}
    if((smsOn||waOn)&&!phone){status.textContent='Enter a mobile number before enabling SMS or WhatsApp.';return;}
    const payload={user_id:uid,email_address:email,phone_e164:phone,email_enabled:emailOn,sms_enabled:smsOn,whatsapp_enabled:waOn,email_consent_at:emailOn?now:null,sms_consent_at:smsOn?now:null,whatsapp_consent_at:waOn?now:null,updated_at:now};
    const {error}=await sb.from('notification_channel_preferences').upsert(payload,{onConflict:'user_id'});
    if(error){status.textContent=error.message||'Could not save preferences.';return;}
    status.textContent='Preferences saved. Messages will be sent only when provider credentials are configured.';
    setTimeout(()=>{$('klDeliveryModal')?.classList.remove('open');},1400);
  }
  function install(){ensureModal();}
  document.addEventListener('DOMContentLoaded',install);
  window.addEventListener('whiteLionCloudReady',install);
  const observer=new MutationObserver(()=>{if($('klNotificationPanel'))ensureModal();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();