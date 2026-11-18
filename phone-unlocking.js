/* White Lion SME — Phone Unlocking Service.
   Platform-operated service (not a per-tenant SME module): visible only to the
   platform developer account, backed by the real mobile-unlock.com integration
   (the "mobile-unlock-provider" Edge Function, which submits genuine unlock jobs,
   not status checks). Services with no provider_service_id are fulfilled by hand
   in-shop; they carry no API claim. */
(() => {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (v, cur) => (cur ? cur + ' ' : '') + new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(v || 0));
  const cloud = () => window.whiteLionCloud || {};
  const client = () => cloud().getClient && cloud().getClient();
  const OWNERSHIP_KEYWORDS = ['frp', 'activation lock', 'icloud', 'mdm', 'corporate', 'knox', 'passcode', 'pin unlock', 'pattern unlock', 'screen lock'];
  const SUGGESTED_MANUAL_SERVICES = [
    'Bootloop / stuck on logo repair', 'Soft-bricked device firmware restoration', 'Failed OS update recovery',
    'Custom ROM / root / bootloader restoration to stock', 'Forgotten screen passcode / PIN / pattern unlock (in-shop)',
    '"Invalid SIM" / baseband troubleshooting', 'eSIM activation / QR / transfer troubleshooting',
    'APN / VoLTE / Wi-Fi calling provisioning fix', 'Cross-platform data migration (Android ⇄ iPhone)',
    'WhatsApp / chat history transfer', 'Data extraction / recovery (software fault)',
    'iCloud / Google Drive backup repair', 'Adware / malicious profile cleanup',
    'Storage bloat / battery drain cleanup', 'App crash / Play Services / App Store fix'
  ];

  let isDeveloper = null, BUSINESS_ID = null, BRANCH_ID = null;
  let tab = 'orders';
  let services = [], providerServices = [], orders = [], connection = null, storefront = null;
  let showNewOrder = false, showAddManual = false, providerFilter = '';

  function notify(msg, bad) {
    const t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.style.color = bad ? '#b42332' : ''; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3400); }
    else alert(msg);
  }
  function needsOwnershipProof(name) {
    const n = String(name || '').toLowerCase();
    return OWNERSHIP_KEYWORDS.some((k) => n.includes(k));
  }
  function reference() { return 'PU-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase(); }

  async function ensureContext() {
    const c = client();
    if (!c) throw new Error('Sign in first.');
    const { data: devFlag, error: devError } = await c.rpc('is_platform_developer');
    if (devError) throw devError;
    isDeveloper = !!devFlag;
    if (!isDeveloper) return;
    const { data: cfg, error: cfgError } = await c.from('platform_device_services_config').select('business_id,branch_id').maybeSingle();
    if (cfgError) throw cfgError;
    BUSINESS_ID = cfg?.business_id || null;
    BRANCH_ID = cfg?.branch_id || null;
  }

  async function loadAll() {
    const c = client();
    if (!BUSINESS_ID) return;
    const [svcR, provR, ordR, connR, sfR] = await Promise.all([
      c.from('phone_unlocking_services').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }),
      c.from('phone_unlocking_provider_services').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).order('service_name'),
      c.from('phone_unlocking_orders').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }).limit(200),
      c.from('phone_unlocking_provider_connections').select('*').eq('business_id', BUSINESS_ID).eq('provider_key', 'mobile_unlock').maybeSingle(),
      c.from('phone_unlocking_storefronts').select('*').eq('business_id', BUSINESS_ID).maybeSingle()
    ]);
    if (svcR.error) throw svcR.error;
    if (provR.error) throw provR.error;
    if (ordR.error) throw ordR.error;
    if (connR.error) throw connR.error;
    if (sfR.error) throw sfR.error;
    services = svcR.data || [];
    providerServices = provR.data || [];
    orders = ordR.data || [];
    connection = connR.data || null;
    storefront = sfR.data || null;
  }

  async function setConnection(patch) {
    const c = client();
    const { error } = await c.from('phone_unlocking_provider_connections')
      .upsert({ business_id: BUSINESS_ID, provider_key: 'mobile_unlock', updated_at: new Date().toISOString(), ...patch }, { onConflict: 'business_id,provider_key' });
    if (error) throw error;
  }

  async function testConnection() {
    const c = client();
    notify('Testing connection to Mobile-Unlock.com…');
    const { data, error } = await c.functions.invoke('mobile-unlock-provider', { body: { action: 'test_connection', business_id: BUSINESS_ID } });
    if (error || data?.ok === false) {
      const msg = data?.error || error?.message || 'Connection test failed.';
      try { await setConnection({ connection_status: 'error', last_error: msg }); } catch (_) {}
      notify(msg, true);
    } else {
      try { await setConnection({ connection_status: 'connected', last_error: null }); } catch (_) {}
      notify('Connected. Balance: ' + (data.balance ?? 'unknown') + ' ' + (data.currency || '') + ' · ' + (data.service_count ?? 0) + ' services reported by provider.');
    }
    await loadAll(); render();
  }

  async function syncCatalogue() {
    const c = client();
    notify('Syncing live service catalogue from Mobile-Unlock.com…');
    const { data, error } = await c.functions.invoke('mobile-unlock-provider', { body: { action: 'sync_catalogue', business_id: BUSINESS_ID } });
    if (error || data?.ok === false) {
      const msg = data?.error || error?.message || 'Catalogue sync failed.';
      try { await setConnection({ connection_status: 'error', last_error: msg }); } catch (_) {}
      notify(msg, true);
    } else {
      try { await setConnection({ connection_status: 'connected', last_synced_at: data.synced_at || new Date().toISOString(), last_error: null }); } catch (_) {}
      notify('Synced ' + data.synced_count + ' live services from Mobile-Unlock.com.');
    }
    await loadAll(); render();
  }

  async function addProviderServiceToPriceList(ps) {
    const suggested = ps.provider_credit != null ? (Number(ps.provider_credit) * 1.8).toFixed(2) : '';
    const priceRaw = prompt('Your selling price for "' + ps.service_name + '"' + (suggested ? ' (suggested, provider cost × 1.8: ' + suggested + ' ' + (ps.provider_currency || '') + ' — edit as needed):' : ':'), suggested);
    if (priceRaw === null) return;
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) return notify('Enter a valid price.', true);
    const c = client();
    const { error } = await c.from('phone_unlocking_services').upsert({
      business_id: BUSINESS_ID, service_name: ps.service_name, description: ps.description || null,
      default_price: price, is_active: true, provider_service_id: ps.provider_service_id, provider_service_type: ps.provider_service_type,
      provider_group: ps.provider_group, provider_cost: ps.provider_credit, provider_currency: ps.provider_currency,
      provider_delivery_time: ps.delivery_time, provider_info: ps.description, provider_key: 'mobile_unlock',
      provider_is_instant: ps.provider_is_instant, requires_ownership_proof: needsOwnershipProof(ps.service_name)
    }, { onConflict: 'business_id,service_name' });
    if (error) return notify(error.message, true);
    notify('Added to your price list.');
    await loadAll(); render();
  }

  async function addManualService(form) {
    const name = form.name.value.trim();
    const price = Number(form.price.value);
    if (!name) return notify('Enter a service name.', true);
    if (!Number.isFinite(price) || price < 0) return notify('Enter a valid price.', true);
    const c = client();
    const { error } = await c.from('phone_unlocking_services').upsert({
      business_id: BUSINESS_ID, service_name: name, description: form.description.value.trim() || null,
      default_price: price, is_active: true, provider_service_id: null, provider_service_type: null, provider_key: null,
      requires_ownership_proof: form.ownership.checked
    }, { onConflict: 'business_id,service_name' });
    if (error) return notify(error.message, true);
    notify('Manual service added. It has no API behind it — your team fulfils it in-shop.');
    showAddManual = false;
    await loadAll(); render();
  }

  async function toggleServiceActive(svc) {
    const c = client();
    const { error } = await c.from('phone_unlocking_services').update({ is_active: !svc.is_active }).eq('id', svc.id).eq('business_id', BUSINESS_ID);
    if (error) return notify(error.message, true);
    await loadAll(); render();
  }
  async function editServicePrice(svc) {
    const raw = prompt('New selling price for "' + svc.service_name + '":', svc.default_price);
    if (raw === null) return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return notify('Enter a valid price.', true);
    const c = client();
    const { error } = await c.from('phone_unlocking_services').update({ default_price: price }).eq('id', svc.id).eq('business_id', BUSINESS_ID);
    if (error) return notify(error.message, true);
    notify('Price updated.'); await loadAll(); render();
  }
  async function deleteService(svc) {
    if (!confirm('Remove "' + svc.service_name + '" from your price list? Past orders are not affected.')) return;
    const c = client();
    const { error } = await c.from('phone_unlocking_services').delete().eq('id', svc.id).eq('business_id', BUSINESS_ID);
    if (error) return notify(error.message, true);
    await loadAll(); render();
  }

  async function submitNewOrder(form) {
    const svc = services.find((s) => s.id === form.service.value);
    if (!svc) return notify('Choose a service.', true);
    const isProvider = !!svc.provider_service_id;
    const imei = form.imei.value.trim();
    if (isProvider && !/^\d{14,17}$/.test(imei)) return notify('This is a real API unlock service — enter a valid 14–17 digit IMEI.', true);
    if (svc.requires_ownership_proof) {
      if (!form.ownershipConfirmed.checked) return notify('Confirm the customer presented proof of ownership and signed the liability waiver before continuing.', true);
      if (!form.ownershipRef.value.trim()) return notify('Enter the receipt/ID reference for the signed waiver.', true);
    }
    const c = client();
    const notesParts = [];
    if (form.notes.value.trim()) notesParts.push(form.notes.value.trim());
    const payload = {
      business_id: BUSINESS_ID, branch_id: BRANCH_ID, reference: reference(),
      customer_name: form.customerName.value.trim() || 'Walk-in customer',
      customer_phone: form.customerPhone.value.trim() || null,
      customer_email: form.customerEmail.value.trim() || null,
      device_brand: form.deviceBrand.value.trim() || 'Unspecified',
      device_model: form.deviceModel.value.trim() || 'Unspecified',
      imei: imei || 'N/A', network_name: form.networkName.value.trim() || 'Unspecified',
      country: form.country.value.trim() || null,
      service_name: svc.service_name, provider_name: isProvider ? 'Mobile-Unlock' : null,
      provider_service_id: svc.provider_service_id, provider_service_type: svc.provider_service_type,
      provider_cost: svc.provider_cost || 0, service_price: Number(form.price.value) || svc.default_price,
      status: 'received', approval_status: 'pending',
      ownership_proof_confirmed: svc.requires_ownership_proof ? true : false,
      ownership_proof_reference: svc.requires_ownership_proof ? form.ownershipRef.value.trim() : null,
      notes: notesParts.join(' · ') || null
    };
    const { error } = await c.from('phone_unlocking_orders').insert(payload);
    if (error) return notify(error.message, true);
    notify('Order created: ' + payload.reference);
    showNewOrder = false;
    await loadAll(); render();
  }

  async function approveOrder(o) {
    const c = client();
    const { error } = await c.rpc('approve_phone_unlocking_order', { p_business_id: BUSINESS_ID, p_order_id: o.id });
    if (error) return notify(error.message, true);
    notify('Order approved.'); await loadAll(); render();
  }
  async function rejectOrder(o) {
    const reason = prompt('Reason for rejecting this order:');
    if (reason === null) return;
    const c = client();
    const { error } = await c.rpc('reject_phone_unlocking_order', { p_business_id: BUSINESS_ID, p_order_id: o.id, p_reason: reason });
    if (error) return notify(error.message, true);
    notify('Order rejected.'); await loadAll(); render();
  }
  async function recordPayment(o) {
    const amountRaw = prompt('Payment amount received for ' + o.reference + ' (owed: ' + money(o.service_price - o.amount_paid) + '):', String(o.service_price - o.amount_paid));
    if (amountRaw === null) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) return notify('Enter a valid amount.', true);
    const method = prompt('Payment method (cash, mobile money, bank transfer, card):', 'cash');
    if (method === null) return;
    const c = client();
    const { error } = await c.rpc('record_phone_unlocking_payment', { p_business_id: BUSINESS_ID, p_order_id: o.id, p_amount: amount, p_payment_method: method, p_payment_reference: null, p_notes: null });
    if (error) return notify(error.message, true);
    notify('Payment recorded.'); await loadAll(); render();
  }
  async function submitToProvider(o) {
    if (!confirm('Submit this order to Mobile-Unlock.com now? This spends real provider credit and cannot be undone.')) return;
    const c = client();
    notify('Submitting to Mobile-Unlock.com…');
    const { data, error } = await c.functions.invoke('mobile-unlock-provider', { body: { action: 'submit_approved_order', business_id: BUSINESS_ID, order_id: o.id } });
    if (error || data?.ok === false) {
      notify(data?.error || error?.message || 'Submission failed. Check the order status before retrying.', true);
    } else {
      notify('Submitted. Provider reference: ' + data.provider_reference);
    }
    await loadAll(); render();
  }

  function statusPill(s) {
    const label = { connected: 'Connected', error: 'Connection error', not_configured: 'Not connected yet' }[s] || 'Unknown';
    const style = s === 'error' ? ' style="background:#fde3e3;color:#b42332"' : '';
    const cls = s === 'connected' ? '' : ' warn';
    return '<span class="pill' + cls + '"' + style + '>' + label + '</span>';
  }

  function providerTab() {
    const status = connection?.connection_status || 'not_configured';
    const filtered = providerFilter ? providerServices.filter((p) => p.service_name.toLowerCase().includes(providerFilter.toLowerCase()) || String(p.provider_group || '').toLowerCase().includes(providerFilter.toLowerCase())) : providerServices;
    return `
    <div class="panel"><div class="panel-head"><div><h3>Mobile-Unlock.com connection</h3><div class="panel-sub">Real IMEI-based unlock jobs — FRP, iCloud, carrier/SIM, MDM, Knox, blacklist checks.</div></div>${statusPill(status)}</div>
    <p class="panel-sub">${connection?.last_synced_at ? 'Catalogue last synced ' + new Date(connection.last_synced_at).toLocaleString() : 'Catalogue never synced yet.'}${connection?.last_error ? '<br><span style="color:#b42332">' + esc(connection.last_error) + '</span>' : ''}</p>
    <div class="toolbar"><button class="btn primary" id="puTestConn" type="button">Test connection</button><button class="btn" id="puSync" type="button">Sync live catalogue</button></div>
    <div class="notice">The API key lives only in Supabase's server-side secrets — it is never exposed in this app's code or to customers.</div></div>
    <div class="panel"><div class="panel-head"><div><h3>Live provider catalogue (${providerServices.length})</h3><div class="panel-sub">These are the exact services Mobile-Unlock.com currently offers on your account. Add the ones you want to sell.</div></div></div>
    <input class="search" id="puProviderFilter" placeholder="Search services or groups..." value="${esc(providerFilter)}" style="margin-bottom:12px">
    ${filtered.length ? '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Group</th><th>Provider cost</th><th>Delivery</th><th></th></tr></thead><tbody>' +
      filtered.slice(0, 150).map((p) => `<tr><td><b>${esc(p.service_name)}</b>${needsOwnershipProof(p.service_name) ? '<br><small style="color:#b45309">Requires ownership proof</small>' : ''}</td><td>${esc(p.provider_group || '—')}</td><td>${p.provider_credit != null ? money(p.provider_credit, p.provider_currency || '') : '—'}</td><td>${esc(p.delivery_time || '—')}</td><td><button class="btn small" data-add-provider="${p.id}">Add to price list</button></td></tr>`).join('') +
      '</tbody></table></div>' : '<div class="empty">' + (providerServices.length ? 'No matches.' : 'Sync the catalogue above to see what Mobile-Unlock.com actually offers right now.') + '</div>'}
    </div>`;
  }

  function servicesTab() {
    const apiServices = services.filter((s) => s.provider_service_id);
    const manualServices = services.filter((s) => !s.provider_service_id);
    const row = (s) => `<tr><td><b>${esc(s.service_name)}</b>${s.requires_ownership_proof ? '<br><small style="color:#b45309">Ownership proof required</small>' : ''}</td><td><b>${money(s.default_price)}</b></td><td>${s.is_active ? '<span class="pill">Active</span>' : '<span class="pill warn">Hidden</span>'}</td><td><div class="row-actions"><button class="btn small" data-edit-price="${s.id}">Edit price</button><button class="btn small" data-toggle-active="${s.id}">${s.is_active ? 'Hide' : 'Show'}</button><button class="btn small danger" data-delete-service="${s.id}">Delete</button></div></td></tr>`;
    return `
    <div class="panel"><div class="panel-head"><div><h3>Real API-unlock services (${apiServices.length})</h3><div class="panel-sub">Fulfilled automatically by Mobile-Unlock.com.</div></div></div>
    ${apiServices.length ? '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Your price</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + apiServices.map(row).join('') + '</tbody></table></div>' : '<div class="empty">None yet — add some from the Provider connection tab.</div>'}</div>
    <div class="panel"><div class="panel-head"><div><h3>Manually-fulfilled services (${manualServices.length})</h3><div class="panel-sub">No API exists for these anywhere — your technicians do the work in-shop. Priced like any other repair job.</div></div><button class="btn primary" id="puAddManual" type="button">＋ Add manual service</button></div>
    ${showAddManual ? `<form id="puManualForm" class="form-grid" style="margin-bottom:16px">
      <div class="field full"><label>Service name</label><input name="name" required list="puSuggested"><datalist id="puSuggested">${SUGGESTED_MANUAL_SERVICES.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="field full"><label>Description (optional)</label><input name="description"></div>
      <div class="field"><label>Your price</label><input name="price" type="number" step="0.01" min="0" required></div>
      <div class="field full"><label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="ownership" style="width:auto"> Require proof of ownership + signed liability waiver before ordering</label></div>
      <div class="full" style="margin-top:6px"><button class="btn primary" type="submit">Save service</button> <button class="btn" type="button" id="puCancelManual">Cancel</button></div>
    </form>` : ''}
    ${manualServices.length ? '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Your price</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + manualServices.map(row).join('') + '</tbody></table></div>' : '<div class="empty">No manual services added yet.</div>'}</div>`;
  }

  function ordersTab() {
    const apiOptions = services.filter((s) => s.is_active);
    const row = (o) => `<tr><td><b>${esc(o.reference)}</b><div class="panel-sub">${new Date(o.created_at).toLocaleString()}</div></td><td>${esc(o.customer_name)}${o.customer_phone ? '<br><small>' + esc(o.customer_phone) + '</small>' : ''}</td><td>${esc(o.device_brand)} ${esc(o.device_model)}<br><small>${esc(o.imei)}</small></td><td>${esc(o.service_name)}</td><td><b>${money(o.service_price)}</b><br><small>Paid ${money(o.amount_paid)}</small></td><td><span class="pill ${o.approval_status === 'approved' ? '' : 'warn'}"${o.approval_status === 'rejected' ? ' style="background:#fde3e3;color:#b42332"' : ''}>${esc(o.approval_status)}</span>${o.provider_service_id ? '<br><small>Provider: ' + esc(o.provider_submission_status) + '</small>' : ''}</td><td><div class="row-actions">${o.approval_status === 'pending' ? `<button class="btn small" data-approve="${o.id}">Approve</button><button class="btn small danger" data-reject="${o.id}">Reject</button>` : ''}${o.approval_status === 'approved' && Number(o.amount_paid) < Number(o.service_price) ? `<button class="btn small" data-pay="${o.id}">Record payment</button>` : ''}${o.approval_status === 'approved' && o.provider_service_id && o.provider_submission_status === 'not_submitted' && Number(o.amount_paid) >= Number(o.service_price) ? `<button class="btn small primary" data-submit="${o.id}">Submit to provider</button>` : ''}</div></td></tr>`;
    return `
    <div class="panel"><div class="panel-head"><div><h3>Orders</h3><div class="panel-sub">Create an order, get it approved and paid, then submit API orders to the real provider.</div></div><button class="btn primary" id="puNewOrder" type="button">＋ New order</button></div>
    ${showNewOrder ? `<form id="puOrderForm" class="form-grid" style="margin-bottom:16px">
      <div class="field"><label>Customer name</label><input name="customerName"></div>
      <div class="field"><label>Customer phone</label><input name="customerPhone"></div>
      <div class="field"><label>Customer email</label><input name="customerEmail" type="email"></div>
      <div class="field"><label>Device brand</label><input name="deviceBrand" placeholder="Apple, Samsung..."></div>
      <div class="field"><label>Device model</label><input name="deviceModel"></div>
      <div class="field"><label>Network / carrier</label><input name="networkName"></div>
      <div class="field"><label>Country</label><input name="country"></div>
      <div class="field"><label>IMEI (required for real unlock services)</label><input name="imei" placeholder="15-digit IMEI"></div>
      <div class="field full"><label>Service</label><select name="service" id="puOrderService">${apiOptions.map((s) => `<option value="${s.id}" data-price="${s.default_price}" data-ownership="${s.requires_ownership_proof}">${esc(s.service_name)} — ${money(s.default_price)}${s.provider_service_id ? ' (real API unlock)' : ' (manual)'}</option>`).join('')}</select></div>
      <div class="field"><label>Price charged</label><input name="price" type="number" step="0.01" id="puOrderPrice"></div>
      <div class="field full"><label>Notes</label><input name="notes"></div>
      <div class="field full" id="puOwnershipBlock" style="display:none"><label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="ownershipConfirmed" style="width:auto"> Customer presented receipt/ID and signed the liability waiver (they accept responsibility if the device is not legitimately theirs)</label><input name="ownershipRef" placeholder="Receipt / ID reference" style="margin-top:8px"></div>
      <div class="full" style="margin-top:6px"><button class="btn primary" type="submit">Create order</button> <button class="btn" type="button" id="puCancelOrder">Cancel</button></div>
    </form>` : ''}
    ${orders.length ? '<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Device</th><th>Service</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + orders.map(row).join('') + '</tbody></table></div>' : '<div class="empty">No orders yet.</div>'}</div>`;
  }

  function storefrontTab() {
    const s = storefront || {};
    return `<div class="panel"><div class="panel-head"><div><h3>Public order page</h3><div class="panel-sub">Lets customers browse your active services and request an order without logging in.</div></div></div>
    <form id="puStoreForm" class="form-grid">
      <div class="field"><label>Page slug (yoursite.com/s/&lt;slug&gt;)</label><input name="slug" value="${esc(s.slug || '')}" required></div>
      <div class="field"><label>Display name</label><input name="displayName" value="${esc(s.display_name || '')}" required></div>
      <div class="field full"><label>Description</label><input name="description" value="${esc(s.description || '')}"></div>
      <div class="field"><label>Contact phone</label><input name="contactPhone" value="${esc(s.contact_phone || '')}"></div>
      <div class="field"><label>Contact email</label><input name="contactEmail" type="email" value="${esc(s.contact_email || '')}"></div>
      <div class="field full" style="display:flex;gap:18px"><label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="isPublished" style="width:auto" ${s.is_published ? 'checked' : ''}> Published (visible to the public)</label><label style="display:flex;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="acceptsOrders" style="width:auto" ${s.accepts_orders ? 'checked' : ''}> Accepting new orders</label></div>
      <div class="full" style="margin-top:6px"><button class="btn primary" type="submit">Save storefront</button></div>
    </form></div>`;
  }

  function tabButton(key, label) { return '<button class="btn ' + (tab === key ? 'primary' : '') + '" type="button" data-pu-tab="' + key + '">' + label + '</button>'; }

  async function render() {
    const v = document.getElementById('view');
    if (!v) return;
    try {
      await ensureContext();
      if (!isDeveloper) {
        v.innerHTML = '<div class="page-title"><div><h1>Phone unlocking service</h1><p>This module runs the platform-operated phone unlocking business and is available to the platform operator account only.</p></div></div>';
        return;
      }
      if (!BUSINESS_ID) {
        v.innerHTML = '<div class="page-title"><div><h1>Phone unlocking service</h1><p>The platform device-services workspace is not configured yet.</p></div></div>';
        return;
      }
      await loadAll();
    } catch (e) {
      v.innerHTML = '<div class="page-title"><div><h1>Phone unlocking service</h1><p style="color:#b42332">' + esc(e.message || 'Could not load this module.') + '</p></div></div>';
      return;
    }
    v.innerHTML = '<div class="page-title"><div><h1>Phone unlocking service</h1><p>Real unlock jobs run through Mobile-Unlock.com. Everything else is priced, in-shop work — never labelled as an API, never oversold.</p></div></div>' +
      '<div class="toolbar" style="margin-bottom:16px">' + tabButton('orders', 'Orders') + tabButton('services', 'Services & pricing') + tabButton('provider', 'Provider connection') + tabButton('storefront', 'Public order page') + '</div>' +
      '<div id="puTabContent">' + (tab === 'orders' ? ordersTab() : tab === 'services' ? servicesTab() : tab === 'provider' ? providerTab() : storefrontTab()) + '</div>';
    wire(v);
  }

  function wire(v) {
    v.querySelectorAll('[data-pu-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.puTab; showNewOrder = false; showAddManual = false; render(); });

    if (tab === 'provider') {
      document.getElementById('puTestConn')?.addEventListener('click', testConnection);
      document.getElementById('puSync')?.addEventListener('click', syncCatalogue);
      const filterInput = document.getElementById('puProviderFilter');
      if (filterInput) filterInput.oninput = () => { providerFilter = filterInput.value; render(); };
      v.querySelectorAll('[data-add-provider]').forEach((b) => b.onclick = () => addProviderServiceToPriceList(providerServices.find((p) => p.id === b.dataset.addProvider)));
    }

    if (tab === 'services') {
      document.getElementById('puAddManual')?.addEventListener('click', () => { showAddManual = !showAddManual; render(); });
      document.getElementById('puCancelManual')?.addEventListener('click', () => { showAddManual = false; render(); });
      document.getElementById('puManualForm')?.addEventListener('submit', (e) => { e.preventDefault(); addManualService(e.target); });
      v.querySelectorAll('[data-edit-price]').forEach((b) => b.onclick = () => editServicePrice(services.find((s) => s.id === b.dataset.editPrice)));
      v.querySelectorAll('[data-toggle-active]').forEach((b) => b.onclick = () => toggleServiceActive(services.find((s) => s.id === b.dataset.toggleActive)));
      v.querySelectorAll('[data-delete-service]').forEach((b) => b.onclick = () => deleteService(services.find((s) => s.id === b.dataset.deleteService)));
    }

    if (tab === 'orders') {
      document.getElementById('puNewOrder')?.addEventListener('click', () => { showNewOrder = !showNewOrder; render(); });
      document.getElementById('puCancelOrder')?.addEventListener('click', () => { showNewOrder = false; render(); });
      const serviceSelect = document.getElementById('puOrderService');
      const priceInput = document.getElementById('puOrderPrice');
      const ownershipBlock = document.getElementById('puOwnershipBlock');
      const syncServiceFields = () => {
        const opt = serviceSelect?.selectedOptions?.[0];
        if (!opt) return;
        if (priceInput) priceInput.value = opt.dataset.price;
        if (ownershipBlock) ownershipBlock.style.display = opt.dataset.ownership === 'true' ? '' : 'none';
      };
      if (serviceSelect) { serviceSelect.onchange = syncServiceFields; syncServiceFields(); }
      document.getElementById('puOrderForm')?.addEventListener('submit', (e) => { e.preventDefault(); submitNewOrder(e.target); });
      v.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => approveOrder(orders.find((o) => o.id === b.dataset.approve)));
      v.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => rejectOrder(orders.find((o) => o.id === b.dataset.reject)));
      v.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => recordPayment(orders.find((o) => o.id === b.dataset.pay)));
      v.querySelectorAll('[data-submit]').forEach((b) => b.onclick = () => submitToProvider(orders.find((o) => o.id === b.dataset.submit)));
    }

    if (tab === 'storefront') {
      document.getElementById('puStoreForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const c = client();
        const { error } = await c.rpc('save_phone_unlocking_storefront', {
          p_business_id: BUSINESS_ID, p_slug: f.slug.value.trim(), p_display_name: f.displayName.value.trim(),
          p_description: f.description.value.trim() || null, p_contact_phone: f.contactPhone.value.trim() || null,
          p_contact_email: f.contactEmail.value.trim() || null, p_is_published: f.isPublished.checked, p_accepts_orders: f.acceptsOrders.checked
        });
        if (error) return notify(error.message, true);
        notify('Storefront saved.'); await loadAll(); render();
      });
    }
  }

  window.whiteLionPhoneUnlocking = { render, refresh: render };
  window.addEventListener('whiteLionWorkspaceChanged', () => { if (document.querySelector('[data-pu-tab]')) render(); });
  window.addEventListener('whiteLionCloudReady', () => { if (document.querySelector('[data-pu-tab]')) render(); });
})();
