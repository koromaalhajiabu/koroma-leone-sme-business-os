(() => {
  const SUPABASE_URL = 'https://nclncqlgnxnijlumznnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SLE', maximumFractionDigits: 2 }).format(Number(n) || 0);
    } catch (e) {
      return `Le ${Number(n || 0).toFixed(2)}`;
    }
  };

  const slug = new URLSearchParams(location.search).get('store') || '';
  let services = [];
  let storefront = null;

  const msgEl = $('#message');
  const servicesEl = $('#services');
  const selectEl = $('#serviceSelect');
  const imeiField = $('#imeiField');
  const ownershipField = $('#ownershipField');
  const ownershipNotice = $('#ownershipNotice');
  const form = $('#orderForm');
  const submitBtn = $('#submitOrder');

  function showMessage(text, type) {
    msgEl.textContent = text || '';
    msgEl.className = type || '';
  }

  function renderStorefront() {
    if (!storefront) return;
    $('#storeName').textContent = storefront.display_name || 'Device Services';
    if (storefront.description) $('#storeDescription').textContent = storefront.description;
    const bits = [];
    if (storefront.contact_phone) bits.push(`Call/WhatsApp ${storefront.contact_phone}`);
    if (storefront.contact_email) bits.push(storefront.contact_email);
    $('#storeContact').textContent = bits.join(' · ');
  }

  function renderServices() {
    if (!services.length) {
      servicesEl.innerHTML = '<p class="muted">No services are available right now. Please check back later.</p>';
      return;
    }
    servicesEl.innerHTML = services
      .map((s) => {
        const badges = [];
        if (s.requires_imei) badges.push('<span class="badge">Needs IMEI</span>');
        if (s.requires_ownership_proof) badges.push('<span class="badge warn">Proof of ownership</span>');
        return `<div class="service">
          <h3>${esc(s.service_name)}</h3>
          ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ''}
          <div>${badges.join(' ')}</div>
          <div class="price">${money(s.price)}</div>
        </div>`;
      })
      .join('');

    selectEl.innerHTML =
      '<option value="">Choose a service</option>' +
      services.map((s) => `<option value="${esc(s.service_id)}">${esc(s.service_name)} — ${money(s.price)}</option>`).join('');
  }

  function onServiceChange() {
    const svc = services.find((s) => s.service_id === selectEl.value);
    const imeiInput = imeiField.querySelector('input[name="imei"]');
    const ownCheck = ownershipField.querySelector('input[name="ownership_confirmed"]');
    const ownRef = ownershipField.querySelector('input[name="ownership_reference"]');

    if (svc && svc.requires_imei) {
      imeiField.hidden = false;
      imeiInput.required = true;
    } else {
      imeiField.hidden = true;
      imeiInput.required = false;
      imeiInput.value = '';
    }

    if (svc && svc.requires_ownership_proof) {
      ownershipField.hidden = false;
      ownershipNotice.hidden = false;
      ownRef.required = true;
    } else {
      ownershipField.hidden = true;
      ownershipNotice.hidden = true;
      ownRef.required = false;
      ownCheck.checked = false;
      ownRef.value = '';
    }
  }

  async function start() {
    if (!slug) {
      showMessage('No store specified. Please use the link your provider gave you.', 'error');
      servicesEl.innerHTML = '';
      form.hidden = true;
      return;
    }

    showMessage('Loading…', '');
    const { data, error } = await sb.rpc('get_public_device_storefront', { p_slug: slug });

    if (error) {
      showMessage('This store could not be loaded right now. Please try again later.', 'error');
      return;
    }
    if (!data || data.status !== 'success') {
      showMessage((data && data.message) || 'This storefront is unavailable.', 'error');
      servicesEl.innerHTML = '';
      form.hidden = true;
      return;
    }

    storefront = data.storefront;
    services = data.services || [];
    renderStorefront();
    renderServices();
    onServiceChange();
    showMessage('', '');

    if (!storefront.accepts_orders) {
      showMessage('This store is not currently accepting new orders.', 'error');
      submitBtn.disabled = true;
    }
  }

  selectEl.addEventListener('change', onServiceChange);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('Submitting your request…', '');
    submitBtn.disabled = true;

    const fd = new FormData(form);
    const payload = {
      p_slug: slug,
      p_customer_name: (fd.get('customer_name') || '').toString().trim(),
      p_customer_phone: (fd.get('customer_phone') || '').toString().trim(),
      p_service_id: fd.get('service_id'),
      p_device_brand: (fd.get('device_brand') || '').toString().trim() || null,
      p_device_model: (fd.get('device_model') || '').toString().trim() || null,
      p_imei: (fd.get('imei') || '').toString().trim() || null,
      p_network_name: (fd.get('network_name') || '').toString().trim() || null,
      p_country: null,
      p_ownership_confirmed: fd.get('ownership_confirmed') === 'on',
      p_ownership_reference: (fd.get('ownership_reference') || '').toString().trim() || null,
      p_customer_email: (fd.get('customer_email') || '').toString().trim() || null,
      p_notes: (fd.get('notes') || '').toString().trim() || null,
    };

    if (!payload.p_service_id) {
      showMessage('Please choose a service.', 'error');
      submitBtn.disabled = false;
      return;
    }

    const { data, error } = await sb.rpc('submit_public_device_services_order', payload);

    if (error) {
      showMessage(error.message || 'Something went wrong submitting your request. Please try again.', 'error');
      submitBtn.disabled = false;
      return;
    }
    if (!data || data.status !== 'success') {
      showMessage((data && data.message) || 'Something went wrong submitting your request.', 'error');
      submitBtn.disabled = false;
      return;
    }

    showMessage(`Request received! Your reference is ${data.reference}. The team will contact you shortly to confirm.`, 'success');
    form.reset();
    onServiceChange();
    submitBtn.disabled = false;
  });

  start();
})();
