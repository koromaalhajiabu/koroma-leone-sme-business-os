/* Koroma Leone Tech — secure in-app subscription notification centre. */
(() => {
  'use strict';
  if (window.KoromaNotifications) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let panelOpen = false;
  let loading = false;
  let lastCount = 0;
  const style = document.createElement('style');
  style.textContent = `
    #klNotificationButton{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:7px 10px;border:1px solid #dfe5ee;border-radius:10px;background:#fff;color:#24334a;font-weight:750;cursor:pointer}
    #klNotificationButton .kl-notif-count{display:none;min-width:18px;height:18px;padding:0 5px;border-radius:20px;background:#c93645;color:#fff;font-size:10px;line-height:18px;text-align:center}
    #klNotificationButton .kl-notif-count.show{display:inline-block}
    #klNotificationPanel{position:fixed;z-index:100000;top:72px;right:16px;width:min(420px,calc(100vw - 24px));max-height:min(76vh,650px);overflow:auto;background:#fff;color:#24334a;border:1px solid #e3e9f1;border-radius:16px;box-shadow:0 20px 65px rgba(12,27,48,.22);display:none}
    #klNotificationPanel.open{display:block}
    .kl-notif-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px;background:#fff;border-bottom:1px solid #edf0f4}
    .kl-notif-head strong{font-size:15px}.kl-notif-head button{border:0;background:transparent;color:#1767a6;font-size:11px;font-weight:750;padding:7px;cursor:pointer}
    .kl-notif-item{display:block;width:100%;padding:13px 16px;border:0;border-bottom:1px solid #f0f2f5;background:#fff;text-align:left;color:inherit;cursor:pointer}
    .kl-notif-item:hover{background:#f7faff}.kl-notif-item.unread{background:#f4f8ff}
    .kl-notif-item b{display:block;font-size:12px;margin-bottom:4px}.kl-notif-item p{margin:0;color:#657187;font-size:11px;line-height:1.55}.kl-notif-item small{display:block;margin-top:6px;color:#8a95a6;font-size:10px}
    .kl-notif-empty{padding:28px 18px;text-align:center;color:#7b8798;font-size:12px}
    html[data-theme="dark"] #klNotificationButton,html[data-theme="dark"] #klNotificationPanel,html[data-theme="dark"] .kl-notif-head,html[data-theme="dark"] .kl-notif-item{background:#172235;color:#e7edf6;border-color:#2a374a}
    html[data-theme="dark"] .kl-notif-item.unread,html[data-theme="dark"] .kl-notif-item:hover{background:#223149}
    @media(max-width:600px){#klNotificationPanel{top:62px;right:8px;width:calc(100vw - 16px)}}
  `;
  document.head.appendChild(style);

  function getClient(){return window.whiteLionCloud?.getClient?.()||null;}
  function getUserId(){const session=window.whiteLionCloud?.getSession?.();return session?.user?.id||null;}
  function ensureUI(){
    const actions=document.querySelector('.top-actions');
    if(actions&&!document.getElementById('klNotificationButton')){
      const button=document.createElement('button');
      button.id='klNotificationButton';button.type='button';button.setAttribute('aria-label','Open notifications');button.setAttribute('aria-expanded','false');
      button.innerHTML='<span aria-hidden="true">🔔</span><span class="kl-notif-count" id="klNotificationCount">0</span>';
      const avatar=actions.querySelector('.avatar');
      actions.insertBefore(button,avatar||null);
      button.addEventListener('click',toggle);
    }
    if(!document.getElementById('klNotificationPanel')){
      const panel=document.createElement('section');panel.id='klNotificationPanel';panel.setAttribute('aria-label','Notifications');
      panel.innerHTML='<div class="kl-notif-head"><strong>Notifications</strong><button type="button" id="klMarkAllRead">Mark all read</button></div><div id="klNotificationList" class="kl-notif-empty">Sign in to view your notifications.</div>';
      document.body.appendChild(panel);
      panel.querySelector('#klMarkAllRead').addEventListener('click',markAllRead);
      document.addEventListener('click',event=>{
        if(!panelOpen)return;
        if(event.target.closest('#klNotificationPanel')||event.target.closest('#klNotificationButton'))return;
        close();
      });
    }
  }
  function close(){panelOpen=false;document.getElementById('klNotificationPanel')?.classList.remove('open');document.getElementById('klNotificationButton')?.setAttribute('aria-expanded','false');}
  async function toggle(){ensureUI();if(panelOpen){close();return;}panelOpen=true;document.getElementById('klNotificationPanel')?.classList.add('open');document.getElementById('klNotificationButton')?.setAttribute('aria-expanded','true');await load(true);}
  function updateCount(count){lastCount=count;const badge=document.getElementById('klNotificationCount');if(!badge)return;badge.textContent=count>99?'99+':String(count);badge.classList.toggle('show',count>0);const btn=document.getElementById('klNotificationButton');if(btn)btn.setAttribute('aria-label',count?count+' unread notifications':'Open notifications');}
  function formatDate(value){try{return new Date(value).toLocaleString();}catch(_){return '';}}
  async function load(showLoading){
    if(loading)return;loading=true;ensureUI();
    const list=document.getElementById('klNotificationList');const sb=getClient();const userId=getUserId();
    if(!sb||!userId){if(list)list.textContent='Sign in to view your notifications.';updateCount(0);loading=false;return;}
    if(showLoading&&list)list.innerHTML='<div class="kl-notif-empty">Loading notifications…</div>';
    try{
      const {data,error}=await sb.from('business_notifications').select('id,title,body,category,action_page,read_at,created_at').order('created_at',{ascending:false}).limit(40);
      if(error)throw error;
      const rows=Array.isArray(data)?data:[];
      updateCount(rows.filter(x=>!x.read_at).length);
      if(!list)return;
      if(!rows.length){list.innerHTML='<div class="kl-notif-empty">You are all caught up. New billing reminders will appear here.</div>';return;}
      list.innerHTML=rows.map(row=>'<button type="button" class="kl-notif-item '+(row.read_at?'':'unread')+'" data-notification-id="'+esc(row.id)+'" data-action-page="'+esc(row.action_page||'billing')+'"><b>'+esc(row.title)+'</b><p>'+esc(row.body)+'</p><small>'+esc(formatDate(row.created_at))+(row.read_at?'':' · New')+'</small></button>').join('');
      list.querySelectorAll('[data-notification-id]').forEach(button=>button.addEventListener('click',async()=>{
        const id=button.dataset.notificationId;
        await sb.from('business_notifications').update({read_at:new Date().toISOString()}).eq('id',id);
        close();await load(false);
        if(button.dataset.actionPage==='billing'&&typeof window.setPage==='function')window.setPage('billing');
        else if(button.dataset.actionPage==='billing')document.querySelector('[data-page="billing"]')?.click();
      }));
    }catch(error){
      if(list)list.innerHTML='<div class="kl-notif-empty">Notifications could not be loaded. Check your connection and try again.</div>';
      console.warn('Notification centre load failed:',error);
    }finally{loading=false;}
  }
  async function markAllRead(){
    const sb=getClient();const userId=getUserId();if(!sb||!userId)return;
    const {error}=await sb.from('business_notifications').update({read_at:new Date().toISOString()}).is('read_at',null);
    if(error){console.warn('Could not mark notifications as read:',error);return;}
    await load(true);
  }
  function refresh(){ensureUI();load(false);}
  window.KoromaNotifications={refresh,open:toggle};
  document.addEventListener('DOMContentLoaded',()=>{ensureUI();load(false);});
  window.addEventListener('whiteLionCloudReady',refresh);
  window.addEventListener('whiteLionWorkspaceChanged',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();