/* Koroma Leone Tech — in-app business notification centre. */
(() => {
  'use strict';
  if (window.KoromaNotifications) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {subscription:'Subscription',payment:'Payments',orders:'Orders',approvals:'Approvals',inventory:'Inventory',delivery:'Delivery',system:'System'};
  const routes = {billing:'billing',sales:'sales',orders:'sales',approvals:'actions',actions:'actions',inventory:'inventory',stockcontrol:'stockcontrol',delivery:'sales'};
  let open = false, loading = false, rows = [], unreadCount = 0, filter = 'all';

  const css = document.createElement('style');
  css.textContent = [
    '#klNotificationButton{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:7px 11px;border:1px solid #dfe7e2;border-radius:11px;background:#fff;color:#183326;font-weight:750;cursor:pointer}',
    '#klNotificationButton .kl-count{display:none;min-width:19px;height:19px;padding:0 5px;border-radius:20px;background:#c93645;color:#fff;font-size:10px;line-height:19px;text-align:center}.kl-count.show{display:inline-block!important}',
    '#klNotificationPanel{position:fixed;z-index:100000;top:74px;right:16px;width:min(460px,calc(100vw - 24px));max-height:min(80vh,720px);overflow:hidden;background:#fff;color:#20352a;border:1px solid #e0e9e2;border-radius:17px;box-shadow:0 22px 70px rgba(12,27,48,.22);display:none}',
    '#klNotificationPanel.open{display:flex;flex-direction:column}',
    '.kl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px 12px;border-bottom:1px solid #edf1ed}.kl-head strong{display:block;font-size:15px}.kl-head small{display:block;margin-top:3px;color:#829087;font-size:10px}',
    '.kl-actions{display:flex;gap:5px}.kl-actions button{border:1px solid #e1e8e2;border-radius:8px;background:#fff;color:#17633e;font-size:10px;font-weight:750;padding:7px 9px;cursor:pointer}',
    '.kl-tools{padding:11px 13px;border-bottom:1px solid #edf1ed;display:grid;gap:9px;background:#fbfdfb}.kl-tabs{display:flex;gap:6px}.kl-tabs button{border:1px solid #e1e9e2;border-radius:20px;background:#fff;color:#607267;padding:6px 11px;font-size:10px;font-weight:750;cursor:pointer}.kl-tabs button.active{background:#eaf6ef;border-color:#b8ddc5;color:#11643a}',
    '.kl-filter-row{display:grid;grid-template-columns:118px minmax(0,1fr);gap:7px}.kl-filter-row select,.kl-filter-row input{width:100%;min-width:0;border:1px solid #e1e8e2;border-radius:8px;background:#fff;color:#32483a;padding:8px 9px;font-size:11px}',
    '#klNotificationList{overflow:auto;min-height:130px;overscroll-behavior:contain}.kl-item{position:relative;display:block;width:100%;padding:13px 15px 13px 17px;border:0;border-bottom:1px solid #eff3ef;background:#fff;text-align:left;color:inherit;cursor:pointer}.kl-item:hover{background:#f7fbf8}.kl-item.unread{background:#f2f8f3}.kl-item.unread:before{content:"";position:absolute;left:7px;top:18px;width:5px;height:5px;border-radius:50%;background:#168447}',
    '.kl-item b{display:block;font-size:12px;margin:4px 0;line-height:1.4}.kl-item p{margin:0;color:#65766c;font-size:11px;line-height:1.55;overflow-wrap:anywhere}.kl-meta{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:#89968e;font-size:9px}.kl-category{display:inline-block;border:1px solid #e2eae3;border-radius:20px;padding:3px 7px;color:#577064;background:#fbfdfb;font-size:9px;font-weight:750}',
    '.kl-empty{padding:30px 18px;text-align:center;color:#7b8a80;font-size:11px;line-height:1.6}.kl-foot{padding:9px 14px;border-top:1px solid #edf1ed;color:#8a978e;font-size:9px;background:#fbfdfb}',
    'html[data-theme="dark"] #klNotificationButton,html[data-theme="dark"] #klNotificationPanel,html[data-theme="dark"] .kl-head,html[data-theme="dark"] .kl-item,html[data-theme="dark"] .kl-actions button,html[data-theme="dark"] .kl-filter-row select,html[data-theme="dark"] .kl-filter-row input,html[data-theme="dark"] .kl-tabs button{background:#172235;color:#e7edf6;border-color:#2a374a}',
    'html[data-theme="dark"] .kl-tools,html[data-theme="dark"] .kl-foot{background:#111c2d;border-color:#2a374a}html[data-theme="dark"] .kl-item.unread,html[data-theme="dark"] .kl-item:hover,html[data-theme="dark"] .kl-tabs button.active{background:#223149}',
    'html[data-theme="dark"] .kl-item p,html[data-theme="dark"] .kl-head small,html[data-theme="dark"] .kl-meta{color:#aab8c9}',
    '@media(max-width:600px){#klNotificationPanel{top:64px;right:8px;width:calc(100vw - 16px);max-height:82vh}.kl-filter-row{grid-template-columns:108px minmax(0,1fr)}}'
  ].join('');
  document.head.appendChild(css);

  const client = () => window.whiteLionCloud?.getClient?.() || null;
  const uid = () => window.whiteLionCloud?.getSession?.()?.user?.id || null;

  function ensureUI() {
    const actions = document.querySelector('.top-actions');
    if (actions && !document.getElementById('klNotificationButton')) {
      const b = document.createElement('button');
      b.id = 'klNotificationButton'; b.type = 'button'; b.setAttribute('aria-label','Open notifications'); b.setAttribute('aria-expanded','false');
      b.innerHTML = '<span aria-hidden="true">🔔</span><span>Alerts</span><span class="kl-count" id="klNotificationCount">0</span>';
      actions.insertBefore(b, actions.querySelector('.avatar') || null);
      b.addEventListener('click', toggle);
    }
    if (!document.getElementById('klNotificationPanel')) {
      const p = document.createElement('section');
      p.id = 'klNotificationPanel'; p.setAttribute('aria-label','Business notifications');
      p.innerHTML =
        '<div class="kl-head"><div><strong>Notifications</strong><small id="klNotificationSummary">Business updates and reminders</small></div>' +
        '<div class="kl-actions"><button id="klNotificationRefresh" type="button">Refresh</button><button id="klMarkAllRead" type="button">Mark all read</button></div></div>' +
        '<div class="kl-tools"><div class="kl-tabs" role="tablist" aria-label="Notification status">' +
        '<button type="button" class="active" data-filter="all" aria-selected="true">All</button><button type="button" data-filter="unread" aria-selected="false">Unread</button></div>' +
        '<div class="kl-filter-row"><select id="klNotificationCategory" aria-label="Filter by type">' +
        '<option value="all">All types</option><option value="subscription">Subscription</option><option value="payment">Payments</option><option value="orders">Orders</option><option value="approvals">Approvals</option><option value="inventory">Inventory</option><option value="delivery">Delivery</option><option value="system">System</option></select>' +
        '<input id="klNotificationSearch" type="search" placeholder="Search notifications…" aria-label="Search notifications"></div></div>' +
        '<div id="klNotificationList" aria-live="polite"><div class="kl-empty">Sign in to view your notifications.</div></div>' +
        '<div class="kl-foot">Your notifications are private to your signed-in account.</div>';
      document.body.appendChild(p);
      p.querySelector('#klNotificationRefresh').addEventListener('click', () => load(true));
      p.querySelector('#klMarkAllRead').addEventListener('click', markAll);
      p.querySelector('#klNotificationCategory').addEventListener('change', render);
      p.querySelector('#klNotificationSearch').addEventListener('input', render);
      p.querySelectorAll('[data-filter]').forEach(tab => tab.addEventListener('click', () => {
        filter = tab.dataset.filter === 'unread' ? 'unread' : 'all';
        p.querySelectorAll('[data-filter]').forEach(x => {
          const on = x.dataset.filter === filter;
          x.classList.toggle('active', on); x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        render();
      }));
      p.querySelector('#klNotificationList').addEventListener('click', e => {
        const item = e.target.closest('[data-notification-id]');
        if (item) openItem(item);
      });
      document.addEventListener('click', e => {
        if (!open) return;
        if (e.target instanceof Element && (e.target.closest('#klNotificationPanel') || e.target.closest('#klNotificationButton'))) return;
        close();
      });
    }
  }

  function close() {
    open = false;
    document.getElementById('klNotificationPanel')?.classList.remove('open');
    document.getElementById('klNotificationButton')?.setAttribute('aria-expanded','false');
  }

  async function toggle() {
    ensureUI();
    if (open) { close(); return; }
    open = true;
    document.getElementById('klNotificationPanel')?.classList.add('open');
    document.getElementById('klNotificationButton')?.setAttribute('aria-expanded','true');
    await load(true);
  }

  function setCount(n) {
    unreadCount = Math.max(0, Number(n || 0));
    const badge = document.getElementById('klNotificationCount');
    if (badge) { badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount); badge.classList.toggle('show', unreadCount > 0); }
    const b = document.getElementById('klNotificationButton');
    if (b) b.setAttribute('aria-label', unreadCount ? unreadCount + ' unread notifications' : 'Open notifications');
    const summary = document.getElementById('klNotificationSummary');
    if (summary) summary.textContent = unreadCount ? unreadCount + ' unread business update' + (unreadCount === 1 ? '' : 's') : 'You are up to date';
    const mark = document.getElementById('klMarkAllRead');
    if (mark) mark.disabled = unreadCount === 0;
  }

  function relativeTime(value) {
    const d = new Date(value); if (Number.isNaN(d.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (seconds < 45) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return d.toLocaleDateString();
  }

  function render() {
    const list = document.getElementById('klNotificationList'); if (!list) return;
    const category = document.getElementById('klNotificationCategory')?.value || 'all';
    const term = (document.getElementById('klNotificationSearch')?.value || '').trim().toLowerCase();
    const visible = rows.filter(r =>
      (filter !== 'unread' || !r.read_at) &&
      (category === 'all' || r.category === category) &&
      (!term || (String(r.title || '') + ' ' + String(r.body || '')).toLowerCase().includes(term))
    );
    if (!rows.length) { list.innerHTML = '<div class="kl-empty">You are all caught up. New business alerts and billing reminders will appear here.</div>'; return; }
    if (!visible.length) { list.innerHTML = '<div class="kl-empty">No notifications match these filters.</div>'; return; }
    list.innerHTML = visible.map(r => {
      const d = new Date(r.created_at), exact = Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
      return '<button type="button" class="kl-item ' + (r.read_at ? '' : 'unread') + '" data-notification-id="' + esc(r.id) + '" data-action-page="' + esc(r.action_page || '') + '">' +
        '<span class="kl-category">' + esc(labels[r.category] || 'Business') + '</span><b>' + esc(r.title) + '</b><p>' + esc(r.body) + '</p>' +
        '<span class="kl-meta"><span>' + esc(relativeTime(r.created_at)) + '</span><span title="' + esc(exact) + '">' + (r.read_at ? 'Read' : 'Unread') + '</span></span></button>';
    }).join('');
  }

  async function load(showLoading) {
    if (loading) return;
    loading = true; ensureUI();
    const sb = client(), user = uid(), list = document.getElementById('klNotificationList');
    if (!sb || !user) { rows = []; if (list) list.innerHTML = '<div class="kl-empty">Sign in to view your notifications.</div>'; setCount(0); loading = false; return; }
    if (showLoading && list) list.innerHTML = '<div class="kl-empty">Loading your business updates…</div>';
    try {
      const [feed, unread] = await Promise.all([
        sb.from('business_notifications').select('id,title,body,category,action_page,read_at,created_at').eq('recipient_user_id',user).order('created_at',{ascending:false}).limit(100),
        sb.from('business_notifications').select('id',{count:'exact',head:true}).eq('recipient_user_id',user).is('read_at',null)
      ]);
      if (feed.error) throw feed.error;
      rows = Array.isArray(feed.data) ? feed.data : [];
      setCount(unread.error ? rows.filter(r => !r.read_at).length : unread.count);
      render();
    } catch (err) {
      if (list) list.innerHTML = '<div class="kl-empty">Notifications could not be loaded. Check your connection and tap Refresh.</div>';
      console.warn('Notification centre load failed:', err);
    } finally { loading = false; }
  }

  async function openItem(button) {
    const sb = client(), user = uid(), id = button.dataset.notificationId;
    if (!sb || !user || !id) return;
    const {error} = await sb.from('business_notifications').update({read_at:new Date().toISOString()})
      .eq('id',id).eq('recipient_user_id',user).is('read_at',null);
    if (error) { console.warn('Could not mark notification as read:',error); return; }
    const page = routes[button.dataset.actionPage] || null;
    close(); await load(false);
    if (page && typeof window.setPage === 'function') window.setPage(page);
    else if (page) document.querySelector('[data-page="' + page + '"]')?.click();
  }

  async function markAll() {
    const sb = client(), user = uid();
    if (!sb || !user || unreadCount === 0) return;
    const {error} = await sb.from('business_notifications').update({read_at:new Date().toISOString()})
      .eq('recipient_user_id',user).is('read_at',null);
    if (error) { console.warn('Could not mark notifications as read:',error); return; }
    await load(false);
  }

  function refresh() { ensureUI(); load(false); }
  window.KoromaNotifications = {refresh,open:toggle,close};
  document.addEventListener('DOMContentLoaded',() => {ensureUI();load(false);});
  window.addEventListener('whiteLionCloudReady',refresh);
  window.addEventListener('whiteLionWorkspaceChanged',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) refresh();});
  window.setInterval(() => {if (!document.hidden) load(false);},60000);
})();