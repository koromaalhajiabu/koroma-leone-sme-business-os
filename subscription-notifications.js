/* Koroma Leone Tech — in-app business notification centre. */
(() => {
  'use strict';
  if (window.KoromaNotifications) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {subscription:'Subscription',payment:'Payments',orders:'Orders',approvals:'Approvals',inventory:'Inventory',delivery:'Delivery',system:'System'};
  const routes = {billing:'billing',sales:'sales',orders:'sales',approvals:'actions',actions:'actions',inventory:'inventory',stockcontrol:'stockcontrol',delivery:'sales'};
  let open = false, loading = false, rows = [], unreadCount = 0, filter = 'all', categoryFilter = 'all';
  let categoryPrefs = {}, realtimeChannel = null, realtimeUser = null, realtimeTimer = null, reloadRequested = false;
  const categoryKeys = Object.keys(labels);
  const routeLabels = {billing:'Plans & Billing',sales:'Sales & POS',actions:'Executive Action Centre',inventory:'Inventory Management',stockcontrol:'Inventory Intelligence'};
  const isCategoryEnabled = category => categoryPrefs[category] !== false;
  const enabledCategories = () => categoryKeys.filter(isCategoryEnabled);

  const css = document.createElement('style');
  css.textContent = [
    '#klNotificationButton{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:7px 11px;border:1px solid #dfe7e2;border-radius:11px;background:#fff;color:#183326;font-weight:750;cursor:pointer}',
    '#klNotificationButton .kl-count{display:none;min-width:19px;height:19px;padding:0 5px;border-radius:20px;background:#c93645;color:#fff;font-size:10px;line-height:19px;text-align:center}.kl-count.show{display:inline-block!important}',
    '#klNotificationPanel{position:fixed;z-index:100000;top:74px;right:16px;width:min(460px,calc(100vw - 24px));max-height:min(80vh,720px);overflow:hidden;background:#fff;color:#20352a;border:1px solid #e0e9e2;border-radius:17px;box-shadow:0 22px 70px rgba(12,27,48,.22);display:none}',
    '#klNotificationPanel.open{display:flex;flex-direction:column}',
    '.kl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px 12px;border-bottom:1px solid #edf1ed}.kl-head strong{display:block;font-size:15px}.kl-head small{display:block;margin-top:3px;color:#829087;font-size:10px}',
    '.kl-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.kl-actions button{border:1px solid #e1e8e2;border-radius:8px;background:#fff;color:#17633e;font-size:10px;font-weight:750;padding:7px 9px;cursor:pointer}.kl-actions button:disabled{opacity:.45;cursor:not-allowed}.kl-connection{display:inline-block!important;font-size:9px!important;color:#168447!important}.kl-connection.offline{color:#ad6b25!important}',
    '.kl-tools{padding:11px 13px;border-bottom:1px solid #edf1ed;display:grid;gap:9px;background:#fbfdfb}.kl-tabs{display:flex;gap:6px}.kl-tabs button{border:1px solid #e1e9e2;border-radius:20px;background:#fff;color:#607267;padding:6px 11px;font-size:10px;font-weight:750;cursor:pointer}.kl-tabs button.active{background:#eaf6ef;border-color:#b8ddc5;color:#11643a}',
    '.kl-category-filters{display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:1px 1px 5px;scrollbar-width:thin;-webkit-overflow-scrolling:touch}.kl-category-filters button{flex:0 0 auto;border:1px solid #e1e8e2;border-radius:20px;background:#fff;color:#607267;padding:7px 10px;font-size:10px;font-weight:750;white-space:nowrap;cursor:pointer}.kl-category-filters button.active{background:#eaf6ef;border-color:#b8ddc5;color:#11643a}.kl-category-filters button.muted{opacity:.48;text-decoration:line-through}.kl-search-row input{width:100%;min-width:0;border:1px solid #e1e8e2;border-radius:8px;background:#fff;color:#32483a;padding:9px 10px;font-size:11px}',
    '#klNotificationList{overflow:auto;min-height:130px;overscroll-behavior:contain}.kl-item{position:relative;display:block;width:100%;padding:13px 15px 13px 17px;border:0;border-bottom:1px solid #eff3ef;background:#fff;text-align:left;color:inherit;cursor:pointer}.kl-item:hover{background:#f7fbf8}.kl-item.unread{background:#f2f8f3}.kl-item.unread:before{content:"";position:absolute;left:7px;top:18px;width:5px;height:5px;border-radius:50%;background:#168447}',
    '.kl-item b{display:block;font-size:12px;margin:4px 0;line-height:1.4}.kl-item p{margin:0;color:#65766c;font-size:11px;line-height:1.55;overflow-wrap:anywhere}.kl-meta{display:flex;justify-content:space-between;gap:8px;margin-top:7px;color:#89968e;font-size:9px}.kl-category{display:inline-block;border:1px solid #e2eae3;border-radius:20px;padding:3px 7px;color:#577064;background:#fbfdfb;font-size:9px;font-weight:750}.kl-open-action{display:block;margin-top:9px;color:#147245;font-size:10px;font-weight:800}html[data-theme="dark"] .kl-open-action{color:#86dfab}',
    '.kl-empty{padding:30px 18px;text-align:center;color:#7b8a80;font-size:11px;line-height:1.6}.kl-foot{padding:9px 14px;border-top:1px solid #edf1ed;color:#8a978e;font-size:9px;background:#fbfdfb}.kl-preferences{display:none;padding:10px 11px;border:1px solid #e1e9e2;border-radius:10px;background:#fff}.kl-preferences.open{display:block}.kl-preferences p{margin:0 0 9px;color:#718078;font-size:10px;line-height:1.5}.kl-preferences-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.kl-pref-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 9px;border:1px solid #e2eae3;border-radius:8px;background:#fbfdfb;color:#32483a;font-size:10px;font-weight:700;text-align:left}.kl-pref-toggle span:last-child{border-radius:20px;padding:3px 7px;background:#e9f5ed;color:#17633e;font-size:9px}.kl-pref-toggle.off{opacity:.6}.kl-pref-toggle.off span:last-child{background:#f2eeee;color:#8b5555}.kl-pref-status{display:block;margin-top:7px;color:#829087;font-size:9px}',
    'html[data-theme="dark"] #klNotificationButton,html[data-theme="dark"] #klNotificationPanel,html[data-theme="dark"] .kl-head,html[data-theme="dark"] .kl-item,html[data-theme="dark"] .kl-actions button,html[data-theme="dark"] .kl-search-row input,html[data-theme="dark"] .kl-tabs button,html[data-theme="dark"] .kl-category-filters button,html[data-theme="dark"] .kl-preferences,html[data-theme="dark"] .kl-pref-toggle{background:#172235;color:#e7edf6;border-color:#2a374a}',
    'html[data-theme="dark"] .kl-tools,html[data-theme="dark"] .kl-foot{background:#111c2d;border-color:#2a374a}html[data-theme="dark"] .kl-item.unread,html[data-theme="dark"] .kl-item:hover,html[data-theme="dark"] .kl-tabs button.active,html[data-theme="dark"] .kl-category-filters button.active{background:#223149}html[data-theme="dark"] .kl-pref-toggle span:last-child{background:#214333;color:#c8f0d3}html[data-theme="dark"] .kl-pref-toggle.off span:last-child{background:#493039;color:#f0c8ce}',
    'html[data-theme="dark"] .kl-item p,html[data-theme="dark"] .kl-head small,html[data-theme="dark"] .kl-meta{color:#aab8c9}',
    '@media(max-width:600px){#klNotificationPanel{top:64px;right:8px;width:calc(100vw - 16px);max-height:82vh}.kl-head{align-items:flex-start}.kl-actions button{padding:7px 8px}.kl-preferences-grid{grid-template-columns:1fr 1fr}}'
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
        '<div class="kl-head"><div><strong>Notifications</strong><small id="klNotificationSummary">Business updates and reminders</small><small class="kl-connection offline" id="klNotificationConnection">Connecting to live updates…</small></div>' +
        '<div class="kl-actions"><button id="klNotificationRefresh" type="button">Refresh</button><button id="klMarkAllRead" type="button">Mark all read</button></div></div>' +
        '<div class="kl-tools"><div class="kl-tabs" role="tablist" aria-label="Notification status">' +
        '<button type="button" class="active" data-filter="all" aria-selected="true">All</button><button type="button" data-filter="unread" aria-selected="false">Unread</button><button type="button" id="klNotificationPreferences" aria-expanded="false">⚙ Preferences</button></div>' +
        '<div class="kl-category-filters" id="klNotificationCategories" aria-label="Filter by category">' +
        '<button type="button" class="active" data-category="all" aria-pressed="true">All types</button>' +
        '<button type="button" data-category="subscription" aria-pressed="false">Subscription</button>' +
        '<button type="button" data-category="payment" aria-pressed="false">Payments</button>' +
        '<button type="button" data-category="orders" aria-pressed="false">Orders</button>' +
        '<button type="button" data-category="approvals" aria-pressed="false">Approvals</button>' +
        '<button type="button" data-category="inventory" aria-pressed="false">Inventory</button>' +
        '<button type="button" data-category="delivery" aria-pressed="false">Delivery</button>' +
        '<button type="button" data-category="system" aria-pressed="false">System</button></div>' +
        '<div class="kl-preferences" id="klNotificationPreferencesPanel"><p>Choose which categories appear in your Alerts centre. Your choices are saved to your account and follow you across devices.</p><div class="kl-preferences-grid" id="klNotificationPreferenceOptions"></div><small class="kl-pref-status" id="klNotificationPreferenceStatus">All categories are enabled by default.</small></div>' +
        '<div class="kl-search-row"><input id="klNotificationSearch" type="search" placeholder="Search notifications…" aria-label="Search notifications"></div></div>' +
        '<div id="klNotificationList" aria-live="polite"><div class="kl-empty">Sign in to view your notifications.</div></div>' +
        '<div class="kl-foot">Your notifications are private to your signed-in account.</div>';
      document.body.appendChild(p);
      p.querySelector('#klNotificationRefresh').addEventListener('click', () => load(true));
      p.querySelector('#klMarkAllRead').addEventListener('click', markAll);
      p.querySelector('#klNotificationPreferences').addEventListener('click', togglePreferences);
      p.querySelector('#klNotificationPreferenceOptions').addEventListener('click', e => {
        const button = e.target.closest('[data-pref-category]'); if (!button) return;
        const category = button.dataset.prefCategory;
        if (!labels[category]) return;
        saveCategoryPreference(category, !isCategoryEnabled(category));
      });
      p.querySelector('#klNotificationCategories').addEventListener('click', e => {
        const chip = e.target.closest('[data-category]'); if (!chip) return;
        categoryFilter = chip.dataset.category || 'all';
        p.querySelectorAll('[data-category]').forEach(x => {
          const active = x.dataset.category === categoryFilter;
          x.classList.toggle('active', active); x.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        render();
      });
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

  function setConnectionStatus(message, connected) {
    const el = document.getElementById('klNotificationConnection');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('offline', !connected);
  }

  function stopRealtime() {
    const sb = client(), old = realtimeChannel;
    realtimeChannel = null; realtimeUser = null;
    if (old) {
      try { if (sb && typeof sb.removeChannel === 'function') sb.removeChannel(old); else old.unsubscribe(); }
      catch (err) { console.warn('Could not close notification realtime channel:', err); }
    }
  }

  function scheduleRealtimeRefresh() {
    if (realtimeTimer) window.clearTimeout(realtimeTimer);
    realtimeTimer = window.setTimeout(() => { realtimeTimer = null; load(false); }, 220);
  }

  function ensureRealtime() {
    const sb = client(), user = uid();
    if (!sb || !user) { stopRealtime(); setConnectionStatus('Sign in to activate live updates', false); return; }
    if (realtimeChannel && realtimeUser === user) return;
    stopRealtime();
    realtimeUser = user;
    setConnectionStatus('Connecting to live updates…', false);
    try {
      let channel;
      channel = sb.channel('koroma-notifications-' + user)
        .on('postgres_changes', {event:'*', schema:'public', table:'business_notifications', filter:'recipient_user_id=eq.' + user}, scheduleRealtimeRefresh)
        .on('postgres_changes', {event:'*', schema:'public', table:'business_notification_preferences', filter:'user_id=eq.' + user}, scheduleRealtimeRefresh)
        .subscribe(status => {
          if (realtimeChannel !== channel) return;
          if (status === 'SUBSCRIBED') setConnectionStatus('● Live updates connected', true);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnectionStatus('Live connection interrupted · auto-refresh active', false);
        });
      realtimeChannel = channel;
    } catch (err) {
      console.warn('Notification realtime connection failed:', err);
      setConnectionStatus('Live updates unavailable · auto-refresh active', false);
    }
  }

  function renderPreferences() {
    const container = document.getElementById('klNotificationPreferenceOptions');
    if (!container) return;
    container.innerHTML = categoryKeys.map(category => {
      const enabled = isCategoryEnabled(category);
      return '<button type="button" class="kl-pref-toggle ' + (enabled ? '' : 'off') + '" data-pref-category="' + esc(category) + '" aria-pressed="' + (enabled ? 'true' : 'false') + '"><span>' + esc(labels[category]) + '</span><span>' + (enabled ? 'On' : 'Off') + '</span></button>';
    }).join('');
  }

  function togglePreferences() {
    const panel = document.getElementById('klNotificationPreferencesPanel');
    const button = document.getElementById('klNotificationPreferences');
    if (!panel || !button) return;
    const showing = !panel.classList.contains('open');
    panel.classList.toggle('open', showing);
    button.setAttribute('aria-expanded', showing ? 'true' : 'false');
    renderPreferences();
  }

  async function saveCategoryPreference(category, enabled) {
    const sb = client(), user = uid(), status = document.getElementById('klNotificationPreferenceStatus');
    if (!sb || !user) { if (status) status.textContent = 'Sign in to save category preferences.'; return; }
    const previous = isCategoryEnabled(category);
    categoryPrefs[category] = enabled;
    renderPreferences(); render();
    if (status) status.textContent = 'Saving your preference…';
    const {error} = await sb.from('business_notification_preferences').upsert({
      user_id:user, category, enabled, updated_at:new Date().toISOString()
    }, {onConflict:'user_id,category'});
    if (error) {
      categoryPrefs[category] = previous;
      renderPreferences(); render();
      if (status) status.textContent = 'Could not save. Please refresh and try again.';
      console.warn('Notification preference save failed:', error);
      return;
    }
    if (status) status.textContent = 'Saved for your account. Muted alerts remain stored and can be shown again.';
    await load(false);
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
    const category = categoryFilter;
    const term = (document.getElementById('klNotificationSearch')?.value || '').trim().toLowerCase();
    const enabledRows = rows.filter(r => isCategoryEnabled(r.category));
    const visible = enabledRows.filter(r =>
      (filter !== 'unread' || !r.read_at) &&
      (category === 'all' || r.category === category) &&
      (!term || (String(r.title || '') + ' ' + String(r.body || '')).toLowerCase().includes(term))
    );
    document.querySelectorAll('#klNotificationCategories [data-category]').forEach(button => {
      const key = button.dataset.category;
      button.classList.toggle('muted', key !== 'all' && !isCategoryEnabled(key));
    });
    if (!rows.length) { list.innerHTML = '<div class="kl-empty">You are all caught up. New business alerts and billing reminders will appear here.</div>'; return; }
    if (!enabledRows.length) { list.innerHTML = '<div class="kl-empty">All notification categories are muted. Open Preferences to turn categories back on. Your alerts have not been deleted.</div>'; return; }
    if (!visible.length) { list.innerHTML = '<div class="kl-empty">No notifications match these filters.</div>'; return; }
    list.innerHTML = visible.map(r => {
      const d = new Date(r.created_at), exact = Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
      const page = routes[r.action_page] || null;
      const destination = page ? (routeLabels[page] || 'related') : 'notification';
      return '<button type="button" class="kl-item ' + (r.read_at ? '' : 'unread') + '" data-notification-id="' + esc(r.id) + '" data-action-page="' + esc(r.action_page || '') + '">' +
        '<span class="kl-category">' + esc(labels[r.category] || 'Business') + '</span><b>' + esc(r.title) + '</b><p>' + esc(r.body) + '</p>' +
        '<span class="kl-meta"><span>' + esc(relativeTime(r.created_at)) + '</span><span title="' + esc(exact) + '">' + (r.read_at ? 'Read' : 'Unread') + '</span></span>' +
        (page ? '<span class="kl-open-action">Open ' + esc(destination) + ' workspace →</span>' : '') + '</button>';
    }).join('');
  }

  async function load(showLoading) {
    if (loading) { reloadRequested = true; return; }
    loading = true; ensureUI();
    const sb = client(), user = uid(), list = document.getElementById('klNotificationList');
    if (!sb || !user) {
      stopRealtime(); rows = []; categoryPrefs = {};
      if (list) list.innerHTML = '<div class="kl-empty">Sign in to view your notifications.</div>';
      setCount(0); renderPreferences(); loading = false; return;
    }
    ensureRealtime();
    if (showLoading && list) list.innerHTML = '<div class="kl-empty">Loading your business updates…</div>';
    try {
      const [feed, preferenceResult] = await Promise.all([
        sb.from('business_notifications').select('id,title,body,category,action_page,read_at,created_at').eq('recipient_user_id',user).order('created_at',{ascending:false}).limit(100),
        sb.from('business_notification_preferences').select('category,enabled').eq('user_id',user)
      ]);
      if (feed.error) throw feed.error;
      rows = Array.isArray(feed.data) ? feed.data : [];
      categoryPrefs = {};
      if (!preferenceResult.error && Array.isArray(preferenceResult.data)) {
        preferenceResult.data.forEach(pref => { if (labels[pref.category]) categoryPrefs[pref.category] = pref.enabled === true; });
      } else if (preferenceResult.error) {
        console.warn('Notification preferences could not be loaded; using all categories:', preferenceResult.error);
        const prefStatus = document.getElementById('klNotificationPreferenceStatus');
        if (prefStatus) prefStatus.textContent = 'Saved preferences are temporarily unavailable. All categories are shown.';
      }
      renderPreferences();
      const active = enabledCategories();
      let unreadResult = {count:0,error:null};
      if (active.length) {
        unreadResult = await sb.from('business_notifications').select('id',{count:'exact',head:true})
          .eq('recipient_user_id',user).is('read_at',null).in('category',active);
      }
      setCount(unreadResult.error ? rows.filter(r => !r.read_at && isCategoryEnabled(r.category)).length : unreadResult.count);
      render();
    } catch (err) {
      if (list) list.innerHTML = '<div class="kl-empty">Notifications could not be loaded. Check your connection and tap Refresh.</div>';
      console.warn('Notification centre load failed:', err);
    } finally {
      loading = false;
      if (reloadRequested) { reloadRequested = false; window.setTimeout(() => load(false), 0); }
    }
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
    const active = enabledCategories();
    if (!active.length) return;
    const {error} = await sb.from('business_notifications').update({read_at:new Date().toISOString()})
      .eq('recipient_user_id',user).is('read_at',null).in('category',active);
    if (error) { console.warn('Could not mark notifications as read:',error); return; }
    await load(false);
  }

  function refresh() { ensureUI(); ensureRealtime(); load(false); }
  window.KoromaNotifications = {refresh,open:toggle,close};
  document.addEventListener('DOMContentLoaded',() => {ensureUI();load(false);});
  window.addEventListener('whiteLionCloudReady',refresh);
  window.addEventListener('whiteLionWorkspaceChanged',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',() => {if (!document.hidden) refresh();});
  window.setInterval(() => {if (!document.hidden) load(false);},60000);
})();