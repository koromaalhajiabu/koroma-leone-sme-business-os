/* White Lion SME OS — Phone Unlocking & Device Services. */
(() => {
  'use strict';
  const MODULE_KEY = 'phone_unlocking';
  const ALLOWED_ROLES = ['owner','admin','manager'];
  const STATUSES = ['received','quoted','awaiting_payment','processing','completed','failed','cancelled'];
  const APPROVAL_LABELS = {pending:'Awaiting owner approval',approved:'Owner approved',rejected:'Rejected'};
  const STATUS_LABELS = {
    received:'Received', quoted:'Quoted', awaiting_payment:'Awaiting payment',
    processing:'Processing', completed:'Completed', failed:'Failed',
    cancelled:'Cancelled', refunded:'Refunded'
  };
  let client = null, business = null, branch = null, role = null, enabled = false;
  let services = [], orders = [];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => (business?.currency_code || 'SLE') + ' ' + Number(value || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const providerCostLabel = (currency,value) => value==null?'Not supplied':String(currency||'').toUpperCase()==='CREDITS'?Number(value).toLocaleString(undefined,{maximumFractionDigits:4})+' credits':String(currency||'Provider cost')+' '+Number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});
  const DEFAULT_USD_SLE_RATE = 22.98;
  const rateStorageKey = () => 'wl_device_credit_usd_sle_rate_'+String(business?.id||'default');
  const getUsdSleRate = () => { const live=Number($('wluUsdSleRate')?.value); if(Number.isFinite(live)&&live>0&&live<=1000) return live; try { const value=Number(localStorage.getItem(rateStorageKey())); return Number.isFinite(value)&&value>0?value:DEFAULT_USD_SLE_RATE; } catch (_) { return DEFAULT_USD_SLE_RATE; } };
  const creditsToSle = credits => Number(credits||0)*0.01*getUsdSleRate();
  const estimatedSleLabel = (currency,value) => String(currency||'').toUpperCase()==='CREDITS'&&value!=null?'Estimated SLE '+creditsToSle(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'SLE estimate unavailable';
  const providerCostInBusinessCurrency = service => {
    const currency=String(service?.provider_currency||'').toUpperCase();
    const businessCurrency=String(business?.currency_code||'SLE').toUpperCase();
    if(currency===businessCurrency) return Number(service?.provider_cost||0);
    if(currency==='CREDITS'&&businessCurrency==='SLE') return creditsToSle(service?.provider_cost);
    return 0;
  };
  const canManage = () => ALLOWED_ROLES.includes(role);
  function panel() {
    const host = $('wlCloudWork');
    if (!host) return null;
    let root = $('wlPhoneUnlocking');
    if (!root) {
      root = document.createElement('section');
      root.id = 'wlPhoneUnlocking';
      root.innerHTML = `
        <style>
          #wlPhoneUnlocking{margin-top:18px;padding:16px;border:1px solid #dce9df;border-radius:14px;background:#fff;color:#203b2b;font:14px/1.65 system-ui;box-shadow:0 8px 24px #0c37220b}
          #wlPhoneUnlocking h3{margin:0;color:#075b35;font-size:17px;line-height:1.35}
          #wlPhoneUnlocking h4{margin:18px 0 10px;color:#075b35;font-size:15px;line-height:1.4}
          #wlPhoneUnlocking p{color:#68796f;font-size:14px;line-height:1.6;margin:7px 0 14px}
          #wlPhoneUnlocking input,#wlPhoneUnlocking select,#wlPhoneUnlocking textarea{width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid #dce8df;border-radius:8px;background:#fff;color:#203b2b;font:inherit;font-size:14px;min-height:46px;margin:5px 0}
          #wlPhoneUnlocking button{border:1px solid #087a43;border-radius:8px;padding:9px 12px;background:#087a43;color:#fff;font-weight:750;font:inherit;font-size:14px;min-height:44px;margin:5px 5px 5px 0}
          #wlPhoneUnlocking button.secondary{background:#fff;color:#075b35}
          #wlPhoneUnlocking button:disabled{opacity:.5}
          #wlPhoneUnlocking .wlu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
          #wlPhoneUnlocking .wlu-full{grid-column:1/-1}
          #wlPhoneUnlocking .wlu-muted{color:#718078;font-size:12px;line-height:1.65}
          #wlPhoneUnlocking .wlu-status{padding:9px;border-radius:8px;background:#f3f8f4;color:#315641;margin:8px 0;overflow-wrap:anywhere}
          #wlPhoneUnlocking .wlu-scroll{overflow-x:auto}
          #wlPhoneUnlocking table{width:100%;min-width:820px;border-collapse:collapse;font-size:12px;line-height:1.55}
          #wlPhoneUnlocking th,#wlPhoneUnlocking td{text-align:left;padding:8px;border-bottom:1px solid #e8eee9;vertical-align:top}
          #wlPhoneUnlocking th{color:#64776b;background:#f5faf6;font-size:12px;line-height:1.4}
          #wlPhoneUnlocking .wlu-actions{display:flex;gap:4px;flex-wrap:wrap}
          #wlPhoneUnlocking .wlu-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}
          #wlPhoneUnlocking .wlu-kpi{padding:10px;border:1px solid #e2eee5;border-radius:9px;background:#f7fbf8;color:#65776b}
          #wlPhoneUnlocking .wlu-kpi b{display:block;color:#075b35;font-size:16px;margin-top:4px;overflow-wrap:anywhere}
          #wlPhoneUnlocking .wlu-service-row{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #edf2ee}
          @media(max-width:560px){#wlPhoneUnlocking{padding:14px;font-size:14px}#wlPhoneUnlocking h3{font-size:16px}#wlPhoneUnlocking .wlu-grid{grid-template-columns:1fr;gap:10px}#wlPhoneUnlocking .wlu-full{grid-column:auto}#wlPhoneUnlocking .wlu-kpis{grid-template-columns:1fr 1fr;gap:8px}#wlPhoneUnlocking .wlu-service-row{align-items:flex-start;flex-wrap:wrap}#wlPhoneUnlocking .wlu-service-row>span{min-width:0;overflow-wrap:anywhere}#wlPhoneUnlocking summary{font-size:14px;line-height:1.5;padding:4px 0}#wlPhoneUnlocking th,#wlPhoneUnlocking td{padding:10px 9px}}
        </style>
        <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap">
          <div><h3>PHONE UNLOCKING &amp; DEVICE SERVICES</h3><p>Manage legitimate network-unlocking service requests, payments and provider costs.</p></div>
          <span class="wlu-muted" id="wluWorkspace">No workspace selected</span>
        </div>
        <div id="wluStatus" class="wlu-status" role="status" aria-live="polite">Waiting for a business workspace…</div>
        <div class="wlu-provider-tools"><strong>Multi-provider connection hub</strong><span id="wluProviderResult" class="wlu-muted" role="status">Legacy Mobile-Unlock API retired. Use the provider selector below.</span><button id="wluVerifyServiceCoded" type="button" class="secondary">Test ServiceCoded secret</button></div>
        <div id="wluEnableArea" hidden><p>This specialist module is not enabled for this business.</p><button id="wluEnable" type="button">Enable Phone Unlocking</button></div>
        <div id="wluApp" hidden>
          <div class="wlu-kpis" id="wluKpis"></div>
          <details open class="wlu-catalogue">
            <summary><strong>Service catalogue &amp; pricing</strong></summary>
            <p class="wlu-muted">Add and manage the services your business offers and their standard customer prices. Saved services appear in the order form.</p>
            <form id="wluServiceForm" class="wlu-grid">
              <input name="service_name" required minlength="2" maxlength="120" placeholder="Service name">
              <input name="default_price" type="number" required min="0" step="0.01" placeholder="Default customer price">
              <input name="description" maxlength="240" placeholder="Description (optional)">
              <button type="submit">Add service</button>
            </form>
            <div id="wluServices"></div>
            <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e8eee9">
              <h4>Live multi-provider catalogue</h4>
              <p class="wlu-muted">Sync the provider's current IMEI and server services. Provider costs are stored in the provider's own unit (DeviceDecoded uses raw credits; USD conversion is unconfirmed). Customer selling prices are set separately. Adding a service does not place an order.</p>
              <label>Provider<select id="wluProviderChoice"><option value="devicedecoded">DeviceDecoded</option><option value="imei_org">IMEI.org</option><option value="imei_info">IMEI.info</option><option value="gsma">GSMA Device Check</option></select></label><button id="wluSyncCatalogue" type="button" class="secondary">Sync selected provider catalogue</button>
              <span id="wluCatalogueStatus" class="wlu-muted" role="status">No live catalogue sync yet.</span>
              <div class="wlu-grid" style="margin:10px 0;padding:10px;border:1px solid #e2eee5;border-radius:9px">
                <label class="wlu-full">USD to SLE exchange rate
                  <input id="wluUsdSleRate" type="number" min="0.01" max="1000" step="0.01" value="22.98" inputmode="decimal" aria-label="SLE per one US dollar">
                </label>
                <div class="wlu-full wlu-muted">Current estimate: US$1 = SLE <strong id="wluRateDisplay">22.98</strong>. One DeviceDecoded credit = US$0.01. Change this rate to match the rate you actually pay. This setting is saved on this device for the selected business.</div>
              </div>
              <div id="wluLiveServices"></div>
            </div>
          </details>
          <details open class="wlu-checker">
            <summary><strong>Phone Compatibility &amp; Repair Checker</strong></summary>
            <p class="wlu-muted">Check whether your latest synced provider catalogue contains a service for the reported problem. This is a service-availability pre-check, not a device-specific IMEI eligibility result or a physical hardware diagnosis.</p>
            <form id="wluCheckerForm" class="wlu-grid">
              <input name="check_brand" required maxlength="80" placeholder="Phone brand (e.g. Apple, Samsung)">
              <input name="check_model" required maxlength="100" placeholder="Exact phone model">
              <select name="check_issue" required>
                <option value="">Choose the reported problem</option>
                <option value="network_lock">Network / SIM carrier lock</option>
                <option value="blacklist">IMEI blacklist / lost or stolen status check</option>
                <option value="imei_status">General IMEI status / device information</option>
                <option value="activation_lock">Apple Activation Lock</option>
                <option value="google_lock">Google account / FRP lock</option>
                <option value="screen">Broken screen / display</option>
                <option value="battery">Battery / charging problem</option>
                <option value="charging_port">Charging port problem</option>
                <option value="water_damage">Water / liquid damage</option>
                <option value="not_powering">Phone not powering on</option>
                <option value="software">Software / boot / update problem</option>
                <option value="other_hardware">Other hardware fault</option>
              </select>
              <input name="check_imei" inputmode="numeric" pattern="[0-9]{14,16}" maxlength="16" placeholder="IMEI (optional for catalogue check)">
              <input name="check_network" maxlength="100" placeholder="Original network / carrier (if known)">
              <textarea class="wlu-full" name="check_details" maxlength="500" rows="2" placeholder="Describe symptoms or additional details (optional)"></textarea>
              <button type="submit">Check service availability</button>
              <button type="button" id="wluCheckerClear" class="secondary">Clear checker</button>
            </form>
            <div id="wluCheckerResult" class="wlu-status" role="status" aria-live="polite">Enter the phone details and reported problem to begin.</div>
          </details>
          <details open>
            <summary><strong>Create unlocking order</strong></summary>
            <p class="wlu-muted">Record only devices you are authorised to service. IMEI is restricted to business owners, administrators and managers.</p>
            <form id="wluOrderForm">
              <div class="wlu-grid">
                <input name="customer_name" required minlength="2" maxlength="120" placeholder="Customer full name">
                <input name="customer_phone" maxlength="40" placeholder="Customer phone number">
                <input name="device_brand" required maxlength="80" placeholder="Phone brand (e.g. Apple, Samsung)">
                <input name="device_model" required maxlength="100" placeholder="Phone model">
                <input name="imei" required inputmode="numeric" pattern="[0-9]{14,16}" maxlength="16" placeholder="IMEI (14–16 digits)">
                <input name="network_name" required maxlength="100" placeholder="Original network / carrier">
                <input name="country" maxlength="80" placeholder="Country (optional)">
                <select name="service_id" id="wluServiceSelect" required><option value="">Choose service / price</option></select>
                <input name="provider_name" maxlength="120" placeholder="Unlocking provider (optional)">
                <input name="provider_reference" maxlength="160" placeholder="Provider order reference (optional)">
                <input name="provider_cost" type="number" min="0" step="0.01" value="0" placeholder="Provider cost in business currency (SLE)">
                <input name="service_price" type="number" min="0" step="0.01" required placeholder="Customer price">
                <textarea class="wlu-full" name="notes" maxlength="1000" rows="2" placeholder="Order notes (do not enter passwords or account credentials)"></textarea>
              </div>
              <button type="submit">Save unlocking order</button>
            </form>
          </details>
          <details>
            <summary><strong>Record customer payment</strong></summary>
            <form id="wluPaymentForm" class="wlu-grid">
              <select name="order_id" id="wluPaymentOrder" required><option value="">Choose outstanding order</option></select>
              <input name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount received">
              <select name="payment_method"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select>
              <input name="payment_reference" maxlength="160" placeholder="Payment reference (optional)">
              <button type="submit">Record payment</button>
            </form>
          </details>
          <details>
            <summary><strong>Record a customer refund</strong></summary>
            <form id="wluRefundForm" class="wlu-grid">
              <select name="order_id" id="wluRefundOrder" required><option value="">Choose paid order</option></select>
              <input name="amount" type="number" min="0.01" step="0.01" required placeholder="Refund amount">
              <select name="refund_method"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select>
              <input name="refund_reference" maxlength="160" placeholder="Refund reference (optional)">
              <button type="submit">Record refund</button>
            </form>
          </details>
          <h4>Unlocking order register</h4>
          <div class="wlu-scroll" id="wluOrders">Loading orders…</div>
          <div class="wlu-muted" style="margin-top:9px">Provider submissions are available only for supported legacy provider IMEI services after full customer payment and your explicit approval. Orders without a provider service mapping remain manual. Payment and refund records are stored here; automatic general-ledger journal posting is not enabled yet.</div>
        </div>`;
      host.appendChild(root);
      $('wluEnable').addEventListener('click', enableModule);
      $('wluSyncCatalogue').addEventListener('click', syncProviderCatalogue);
      $('wluVerifyServiceCoded').addEventListener('click', verifyServicecodedSecret);
      $('wluLiveServices').addEventListener('click', importProviderService);
      $('wluUsdSleRate').addEventListener('change', saveUsdSleRate);
      $('wluUsdSleRate').addEventListener('input', updateUsdSlePreview);
      $('wluCheckerForm').addEventListener('submit', checkDeviceCompatibility);
      $('wluCheckerClear').addEventListener('click', clearCompatibilityCheck);
      $('wluOrderForm').addEventListener('submit', createOrder);
      $('wluServiceForm').addEventListener('submit', createService);
      $('wluPaymentForm').addEventListener('submit', recordPayment);
      $('wluRefundForm').addEventListener('submit', recordRefund);
      $('wluServiceSelect').addEventListener('change', () => {
        const service = services.find(item => item.id === $('wluServiceSelect').value);
        if (service) { $('wluOrderForm').elements.service_price.value = Number(service.default_price).toFixed(2); $('wluOrderForm').elements.provider_cost.value = providerCostInBusinessCurrency(service).toFixed(2); }
      });
      $('wluPaymentOrder').addEventListener('change', () => {
        const order = orders.find(item => item.id === $('wluPaymentOrder').value);
        if (order) $('wluPaymentForm').elements.amount.placeholder = 'Balance: ' + money(Number(order.service_price)-Number(order.amount_paid));
      });
      $('wluOrders').addEventListener('click', updateOrderStatus);
      $('wluOrders').addEventListener('click', approveOrder);
      $('wluOrders').addEventListener('click', rejectOrder);
      $('wluServices').addEventListener('click', editService);
    }
    return root;
  }
  function say(message, error=false) {
    const el=$('wluStatus'); if(el){el.textContent=message;el.style.background=error?'#fff1f0':'#f3f8f4';el.style.color=error?'#9b2c24':'#315641';}
  }
  async function verifyServicecodedSecret() {
    const button=$('wluVerifyServiceCoded'), status=$('wluProviderResult');
    if(!client) return say('Sign in first to test the provider secret.',true);
    if(!canManage()) return say('Only an owner, administrator or manager can test provider settings.',true);
    button.disabled=true; button.textContent='Checking…';
    status.textContent='Checking whether the deployed Supabase function can read the saved secret…';
    try {
      const {data,error}=await client.functions.invoke('device-services-provider',{body:{action:'verify_servicecoded_secret'}});
      if(error) throw new Error(error.message||'Secret verification request failed.');
      if(!data?.ok) throw new Error(data?.error||'Secret verification failed.');
      if(data.secret_configured===true) {
        status.textContent='ServiceCoded secret is visible to the deployed Supabase function. This does not verify the API endpoint or key validity.';
        say('Secret check passed. No ServiceCoded API request was made and no provider credit was spent.');
      } else {
        status.textContent='SERVICECODED_API_KEY is not visible to the deployed function. Check the exact secret name in Supabase Edge Function Secrets, then redeploy.';
        say('Secret check failed: the deployed function cannot see SERVICECODED_API_KEY.',true);
      }
    } catch(error) {
      status.textContent='Secret check not completed: '+(error.message||String(error));
      say('Could not verify the ServiceCoded secret: '+(error.message||String(error)),true);
    } finally { button.disabled=false; button.textContent='Test ServiceCoded secret'; }
  }
  async function syncProviderCatalogue() {
    const button=$('wluSyncCatalogue'), status=$('wluCatalogueStatus');
    if(!client||!business?.id) return say('Select a business workspace first.',true);
    if(!canManage()) return say('Only an owner, administrator or manager can sync provider catalogues.',true);
    const provider=$('wluProviderChoice')?.value||'devicedecoded';
    if(provider==='imei_info'||provider==='gsma') {
      status.textContent=provider==='imei_info'?'IMEI.info requires funded API access and confirmed API credentials.':'GSMA Device Check requires commercial onboarding and private API documentation.';
      return say(status.textContent,true);
    }
    button.disabled=true; button.textContent='Syncing…'; status.textContent='Connecting securely to '+provider+'…';
    try {
      const {data,error}=await client.functions.invoke('device-services-provider',{body:{action:'sync_catalogue',business_id:business.id,provider}});
      if(error) throw new Error(error.message||'Provider request failed.');
      if(!data?.ok) throw new Error(data?.error||'Provider catalogue sync failed.');
      await loadProviderCatalogue();
      status.textContent=Number(data.synced_count||0)+' services synced from '+data.provider_name+'.';
      say('Catalogue sync completed. No customer order was placed and no provider credit was spent.');
    } catch(error) { status.textContent='Sync not completed: '+(error.message||String(error)); say('Provider catalogue sync failed: '+(error.message||String(error)),true); }
    finally { button.disabled=false; button.textContent='Sync selected provider catalogue'; }
  }
  async function loadProviderCatalogue() {
    if(!client||!business?.id||!$('wluLiveServices')) return;
    const {data,error}=await client.from('phone_unlocking_provider_services')
      .select('id,provider_key,provider_service_id,provider_service_type,provider_group,service_name,provider_credit,provider_currency,delivery_time,description,quantity,requires_custom,is_active,last_synced_at')
      .eq('business_id',business.id).eq('is_active',true)
      .order('provider_group').order('service_name').limit(500);
    if(error) throw error;
    const rows=data||[];
    const rateInput=$('wluUsdSleRate'); if(rateInput) rateInput.value=getUsdSleRate().toFixed(2);
    updateUsdSlePreview();
    $('wluLiveServices').innerHTML=rows.length?'<div class="wlu-scroll"><table><thead><tr><th>Group / service</th><th>Type</th><th>Provider credit</th><th>Estimated provider cost (SLE)</th><th>Delivery</th><th>Action</th></tr></thead><tbody>'+rows.map(item=>{
      const credit=esc(providerCostLabel(item.provider_currency,item.provider_credit));
      const estimate=esc(estimatedSleLabel(item.provider_currency,item.provider_credit));
      return '<tr><td><strong>'+esc(item.service_name)+'</strong><br><small>'+esc(item.provider_group||'')+'</small><br><small>'+esc(item.description||'')+'</small></td><td>'+esc(item.provider_service_type)+'</td><td>'+credit+'</td><td>'+estimate+'</td><td>'+esc(item.delivery_time||'Not specified')+'</td><td><button type="button" class="secondary" data-wlu-import-provider-service="'+esc(item.id)+'">Add to customer catalogue</button></td></tr>';
    }).join('')+'</tbody></table></div>':'<p class="wlu-muted">No provider services saved yet. Choose a provider and sync its catalogue.</p>';
    window.__wluProviderCatalogue=rows;
    if($('wluCheckerResult') && rows.length) $('wluCheckerResult').textContent='Provider catalogue loaded ('+rows.length+' active services). Enter a device and problem to check for a catalogue match.';
  }
  async function importProviderService(event) {
    const button=event.target.closest('[data-wlu-import-provider-service]'); if(!button) return;
    if(!canManage()) return say('Only an owner, administrator or manager can add provider services.',true);
    const item=(window.__wluProviderCatalogue||[]).find(row=>row.id===button.dataset.wluImportProviderService);
    if(!item) return say('Provider service not found. Sync the catalogue again.',true);
    const currency=business?.currency_code||'SLE';
    const entered=prompt('Enter the CUSTOMER SELLING PRICE in '+currency+' for "'+item.service_name+'". Provider credit ('+(item.provider_currency||'provider currency')+') is separate; do not copy it unless the currencies match.','0');
    if(entered===null) return;
    const price=Number(entered);
    if(!Number.isFinite(price)||price<0) return say('Enter a valid non-negative customer selling price.',true);
    const {error}=await client.from('phone_unlocking_services').insert({
      business_id:business.id,service_name:item.service_name,
      description:[item.provider_group,item.description,item.delivery_time?'Delivery: '+item.delivery_time:null].filter(Boolean).join(' · ').slice(0,240)||null,
      default_price:price,provider_service_id:item.provider_service_id,provider_service_type:item.provider_service_type,
      provider_group:item.provider_group,provider_cost:item.provider_credit,provider_currency:item.provider_currency,
      provider_delivery_time:item.delivery_time,provider_info:item.description,provider_requires_custom:item.requires_custom
    });
    if(error) {
      if(error.code==='23505') return say('This service name or provider service is already in your customer catalogue.',true);
      return say('Could not add provider service: '+error.message,true);
    }
    await loadServices();
    say('Provider service added to your customer catalogue at '+money(price)+'. No provider order was placed.');
  }
  function clearCompatibilityCheck() {
    $('wluCheckerForm').reset();
    $('wluCheckerResult').textContent='Enter the phone details and reported problem to begin.';
    $('wluCheckerResult').style.background='#f3f8f4';
    $('wluCheckerResult').style.color='#315641';
  }
  function checkDeviceCompatibility(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form).entries());
    const issue=data.check_issue;
    const result=$('wluCheckerResult');
    const hardware={
      screen:'A broken screen is a physical repair. An online unlocking catalogue cannot confirm the panel, touch layer or frame condition.',
      battery:'Battery faults require battery-health checks and physical inspection of the battery and charging circuit.',
      charging_port:'Charging-port faults require inspection and electrical testing of the port, flex cable and charging circuit.',
      water_damage:'Liquid damage needs prompt physical inspection and board-level assessment. Do not charge or power on a wet device.',
      not_powering:'A phone that will not power on needs physical diagnosis of the battery, charging path, display and mainboard.',
      software:'Software faults need model-specific diagnosis, official firmware/recovery checks and confirmation that the device is not account-locked.',
      other_hardware:'This fault needs an in-person technician inspection before a reliable repair quote can be given.'
    };
    if(hardware[issue]) {
      result.innerHTML='<strong>Technician inspection required</strong><br>'+esc(hardware[issue])+'<br><br><strong>Assessment:</strong> No provider catalogue order should be created from this result. Record the symptoms and arrange a bench diagnosis and written repair quote.';
      result.style.background='#fff8e8';result.style.color='#79520b';
      return;
    }
    if(issue==='activation_lock'||issue==='google_lock') {
      const label=issue==='activation_lock'?'Apple Activation Lock':'Google FRP / account lock';
      result.innerHTML='<strong>Official account recovery required</strong><br>'+esc(label)+' is an anti-theft protection. This checker will not recommend bypass services. Ask the device owner to use the manufacturer’s official account-recovery process or provide valid proof of ownership to an authorised service centre.';
      result.style.background='#fff8e8';result.style.color='#79520b';
      return;
    }
    const synced=Array.isArray(window.__wluProviderCatalogue)?window.__wluProviderCatalogue:[];
    if(!synced.length) {
      result.innerHTML='<strong>Provider catalogue not available yet</strong><br>First select <em>Test legacy API connection</em>, then <em>Sync live provider catalogue</em>. This check uses the latest catalogue synced for the selected business.';
      result.style.background='#fff8e8';result.style.color='#79520b';
      return;
    }
    const rules={
      network_lock:{type:'IMEI',terms:['unlock','network','carrier','sim lock','simlock','operator']},
      blacklist:{type:'IMEI',terms:['blacklist','black list','lost','stolen','gsma','clean check','blacklisted']},
      imei_status:{type:'IMEI',terms:['imei check','imei status','device info','blacklist','black list','gsma','clean check']}
    };
    const rule=rules[issue];
    const matches=synced.filter(item=>{
      const type=String(item.provider_service_type||'').toUpperCase();
      if(type!=='IMEI') return false;
      const text=[item.service_name,item.provider_group,item.description].join(' ').toLowerCase();
      return rule.terms.some(term=>text.includes(term));
    }).slice(0,12);
    const title=issue==='network_lock'?'Network / SIM unlock':issue==='blacklist'?'IMEI blacklist status': 'IMEI status / device information';
    if(!matches.length) {
      result.innerHTML='<strong>No matching service found in the latest synced catalogue</strong><br>Problem: '+esc(title)+'<br>Device: '+esc(data.check_brand)+' '+esc(data.check_model)+'<br><br>This does not prove the phone cannot be serviced. Ask the provider for a manual eligibility check or check another authorised provider. Do not promise the customer a successful result.';
      result.style.background='#fff8e8';result.style.color='#79520b';
      return;
    }
    const cards=matches.map(item=>{
      const local=services.find(s=>s.provider_service_id&&String(s.provider_service_id)===String(item.provider_service_id)&&String(s.provider_service_type||'').toUpperCase()==='IMEI');
      const providerCost=esc(providerCostLabel(item.provider_currency,item.provider_credit));
      const providerEstimate=esc(estimatedSleLabel(item.provider_currency,item.provider_credit));
      const selling=local?money(local.default_price):'Not yet priced in your customer catalogue';
      const delivery=item.delivery_time||'Not specified by provider';
      return '<div class="wlu-service-row"><span><strong>'+esc(item.service_name)+'</strong><br><small class="wlu-muted">'+esc(item.provider_group||'IMEI service')+' · '+esc(item.description||'')+'</small><br><small class="wlu-muted">Provider cost: '+providerCost+' · '+providerEstimate+' · Delivery: '+esc(delivery)+'</small><br><small class="wlu-muted">Your customer price: '+esc(selling)+'</small></span><span>'+(local?'<button type="button" data-wlu-use-check-service="'+esc(local.id)+'">Use this service</button>':'<span class="wlu-muted">Add to customer catalogue first</span>')+'</span></div>';
    }).join('');
    const imei=data.check_imei.trim();
    const validImei=!imei||/^[0-9]{14,16}$/.test(imei);
    result.innerHTML='<strong>Matching provider catalogue service(s) found</strong><br>Problem: '+esc(title)+'<br>Device: '+esc(data.check_brand)+' '+esc(data.check_model)+'<br>Original network: '+esc(data.check_network||'Not supplied')+'<br>IMEI format: '+(imei?(validImei?'Looks like a 14–16 digit IMEI; this checker has not verified its status.':'Invalid IMEI format'):'Not supplied')+'<br><br><strong>Catalogue matches</strong>'+cards+'<p class="wlu-muted">Important: a catalogue match only means the provider lists a relevant service. It does not confirm that this specific IMEI is eligible, clean, compatible or guaranteed to unlock. Confirm the exact device, carrier, country and provider terms before accepting payment. Provider credit is not your customer price or a confirmed SLE cost.</p>';
    result.style.background='#f3f8f4';result.style.color='#315641';
    result.querySelectorAll('[data-wlu-use-check-service]').forEach(button=>button.addEventListener('click',()=>{
      const service=services.find(item=>item.id===button.dataset.wluUseCheckService);
      if(!service) return;
      const order=$('wluOrderForm');
      order.elements.device_brand.value=data.check_brand;
      order.elements.device_model.value=data.check_model;
      order.elements.imei.value=validImei?imei:'';
      order.elements.network_name.value=data.check_network||'';
      $('wluServiceSelect').value=service.id;
      order.elements.service_price.value=Number(service.default_price).toFixed(2);
      order.elements.provider_cost.value=providerCostInBusinessCurrency(service).toFixed(2);
      say('Matching service selected in the order form. Complete the customer details and confirm eligibility before accepting payment.');
      $('wluOrderForm').scrollIntoView({behavior:'smooth',block:'start'});
    }));
  }
  async function enableModule() {
    if (!client || !business?.id || !['owner','admin'].includes(role)) return say('Only the business owner or administrator can enable this module.',true);
    const {error}=await client.from('business_industry_modules').update({is_enabled:true}).eq('business_id',business.id).eq('module_key',MODULE_KEY);
    if(error) return say('Could not enable the module: '+error.message,true);
    enabled=true; await load(); say('Phone Unlocking module enabled for '+business.name+'.');
  }
  async function createService(event) {
    event.preventDefault();
    if(!canManage()) return say('Your role cannot manage service pricing.',true);
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    const {error}=await client.from('phone_unlocking_services').insert({
      business_id:business.id,service_name:data.service_name.trim(),description:data.description.trim()||null,default_price:Number(data.default_price)
    });
    if(error) return say('Could not save service: '+error.message,true);
    form.reset(); await loadServices(); say('Service and default price saved.');
  }
  async function editService(event) {
    const button=event.target.closest('[data-wlu-service-edit]'); if(!button) return;
    if(!canManage()) return say('Your role cannot change service pricing.',true);
    const service=services.find(item=>item.id===button.dataset.wluServiceEdit); if(!service) return;
    const next=prompt('New default price for '+service.service_name, String(service.default_price));
    if(next===null) return;
    const price=Number(next);
    if(!Number.isFinite(price)||price<0) return say('Enter a valid non-negative price.',true);
    const {error}=await client.from('phone_unlocking_services').update({default_price:price,updated_at:new Date().toISOString()}).eq('id',service.id).eq('business_id',business.id);
    if(error) return say('Could not update service price: '+error.message,true);
    await loadServices(); say('Default service price updated. Existing orders were not changed.');
  }
  async function createOrder(event) {
    event.preventDefault();
    if(!canManage()) return say('Your role cannot create unlocking orders.',true);
    if(!branch?.id) return say('Select an active branch before creating an order.',true);
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    const service=services.find(item=>item.id===data.service_id);
    if(!service) return say('Choose a valid service from the service catalogue.',true);
    const imei=data.imei.trim();
    if(!/^[0-9]{14,16}$/.test(imei)) return say('Enter a valid 14–16 digit IMEI.',true);
    const reference='WLU-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
    const {error}=await client.from('phone_unlocking_orders').insert({
      business_id:business.id,branch_id:branch.id,reference,
      customer_name:data.customer_name.trim(),customer_phone:data.customer_phone.trim()||null,
      device_brand:data.device_brand.trim(),device_model:data.device_model.trim(),imei,
      network_name:data.network_name.trim(),country:data.country.trim()||null,
      service_name:service.service_name,provider_service_id:service.provider_service_id||null,provider_service_type:service.provider_service_type||null,provider_name:data.provider_name.trim()||null,
      provider_reference:data.provider_reference.trim()||null,
      provider_cost:Number(data.provider_cost||0),service_price:Number(data.service_price),
      notes:data.notes.trim()||null,status:'received'
    });
    if(error) return say('Could not save order: '+error.message,true);
    form.reset(); await load(); say('Unlocking order '+reference+' created.');
  }
  async function rejectOrder(event) {
    const button=event.target.closest('[data-wlu-reject]'); if(!button) return;
    const order=orders.find(item=>item.id===button.dataset.id); if(!order) return;
    if(role!=='owner') return say('Only the business owner can reject orders.',true);
    if((order.approval_status||'pending')!=='pending') return say('This order has already been reviewed.',true);
    const reason=window.prompt('Optional reason for rejecting order '+order.reference+':','');
    if(reason===null) return;
    if(!window.confirm('Reject this customer order? It will not be submitted to Mobile-Unlock.')) return;
    button.disabled=true;
    try {
      const {error}=await client.rpc('reject_phone_unlocking_order',{
        p_business_id:business.id,p_order_id:order.id,p_reason:reason.trim()||null
      });
      if(error) throw error;
      await load(); say('Order '+order.reference+' rejected. It will not be sent to Mobile-Unlock.');
    } catch(error) {
      say('Could not reject order: '+(error.message||String(error)),true);
    } finally { button.disabled=false; }
  }
  async function approveOrder(event) {
    const button=event.target.closest('[data-wlu-approve]'); if(!button) return;
    const order=orders.find(item=>item.id===button.dataset.id); if(!order) return;
    if(role!=='owner') return say('Only the business owner can approve provider orders.',true);
    if(Number(order.amount_paid)<Number(order.service_price)) return say('The customer must pay the full order amount before approval.',true);
    if(!['received','quoted','awaiting_payment'].includes(order.status)) return say('This order is not eligible for approval.',true);
    if((order.approval_status||'pending')!=='pending') return say('This order has already been reviewed.',true);
    if(!window.confirm('Approve this customer order for manual processing? No provider API order will be sent.')) return;
    button.disabled=true; button.textContent='Approving…';
    try {
      const {error:approvalError}=await client.rpc('approve_phone_unlocking_order',{p_business_id:business.id,p_order_id:order.id});
      if(approvalError) throw approvalError;
      await load(); say('Order '+order.reference+' approved for manual processing. Automated provider submission is disabled until replacement provider order workflows are tested.');
    } catch(error) {
      await load(); say('Approval/submission result: '+(error.message||String(error))+'. Check the order register before trying again; do not submit a duplicate.',true);
    } finally { button.disabled=false; }
  }
  async function recordPayment(event) {
    event.preventDefault();
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());
    const {error}=await client.rpc('record_phone_unlocking_payment',{
      p_business_id:business.id,p_order_id:data.order_id,p_amount:Number(data.amount),
      p_payment_method:data.payment_method,p_payment_reference:data.payment_reference.trim()||null,p_notes:null
    });
    if(error) return say('Payment was not recorded: '+error.message,true);
    form.reset(); await load(); say('Customer payment recorded and order balance updated.');
  }
  async function recordRefund(event) {
    event.preventDefault();
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());
    const {error}=await client.rpc('record_phone_unlocking_refund',{
      p_business_id:business.id,p_order_id:data.order_id,p_amount:Number(data.amount),
      p_refund_method:data.refund_method,p_refund_reference:data.refund_reference.trim()||null,p_notes:null
    });
    if(error) return say('Refund was not recorded: '+error.message,true);
    form.reset(); await load(); say('Refund recorded and net receipts updated.');
  }
  async function updateOrderStatus(event) {
    const button=event.target.closest('[data-wlu-status]'); if(!button) return;
    const order=orders.find(item=>item.id===button.dataset.id); if(!order) return;
    const next=button.dataset.wluStatus;
    if(!STATUSES.includes(next)) return;
    const update={status:next,updated_at:new Date().toISOString()};
    if(next==='completed') update.completed_at=new Date().toISOString();
    if(next!=='completed') update.completed_at=null;
    const {error}=await client.from('phone_unlocking_orders').update(update).eq('id',order.id).eq('business_id',business.id);
    if(error) return say('Could not update order status: '+error.message,true);
    await load(); say('Order '+order.reference+' updated to '+STATUS_LABELS[next]+'.');
  }
  function updateUsdSlePreview() {
    const input=$('wluUsdSleRate'), display=$('wluRateDisplay');
    const rate=Number(input?.value);
    if(display) display.textContent=Number.isFinite(rate)&&rate>0?rate.toFixed(2):'Enter a valid rate';
    const live=$('wluLiveServices');
    if(live&&Array.isArray(window.__wluProviderCatalogue)) {
      const rows=window.__wluProviderCatalogue;
      const table=live.querySelector('tbody');
      if(table) table.innerHTML=rows.map(item=>{
        const credit=esc(providerCostLabel(item.provider_currency,item.provider_credit));
        const estimate=esc(estimatedSleLabel(item.provider_currency,item.provider_credit));
        return '<tr><td><strong>'+esc(item.service_name)+'</strong><br><small>'+esc(item.provider_group||'')+'</small><br><small>'+esc(item.description||'')+'</small></td><td>'+esc(item.provider_service_type)+'</td><td>'+credit+'</td><td>'+estimate+'</td><td>'+esc(item.delivery_time||'Not specified')+'</td><td><button type="button" class="secondary" data-wlu-import-provider-service="'+esc(item.id)+'">Add to customer catalogue</button></td></tr>';
      }).join('');
    }
  }
  function saveUsdSleRate() {
    const input=$('wluUsdSleRate'), rate=Number(input?.value);
    if(!Number.isFinite(rate)||rate<=0||rate>1000) { say('Enter a valid USD-to-SLE rate greater than 0 and no more than 1,000.',true); return; }
    try { localStorage.setItem(rateStorageKey(),String(rate)); } catch (_) {}
    updateUsdSlePreview();
    say('USD-to-SLE rate saved for this business on this device. Existing orders and customer prices were not changed.');
  }
  async function loadServices() {
    const {data,error}=await client.from('phone_unlocking_services').select('id,service_name,description,default_price,is_active,provider_service_id,provider_service_type,provider_group,provider_cost,provider_currency').eq('business_id',business.id).eq('is_active',true).order('service_name');
    if(error) throw error;
    services=data||[];
    $('wluServiceSelect').innerHTML='<option value="">Choose service / price</option>'+services.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.service_name)+' — '+esc(money(item.default_price))+'</option>').join('');
    $('wluServices').innerHTML=services.map(item=>'<div class="wlu-service-row"><span><strong>'+esc(item.service_name)+'</strong><br><small class="wlu-muted">'+esc(item.description||'')+'</small>'+(item.provider_service_id?'<br><small class="wlu-muted">Provider service ID: '+esc(item.provider_service_id)+' · Provider cost: '+esc(providerCostLabel(item.provider_currency,item.provider_cost))+' · '+esc(estimatedSleLabel(item.provider_currency,item.provider_cost))+'</small>':'')+'</span><span><strong>'+esc(money(item.default_price))+'</strong> <button type="button" class="secondary" data-wlu-service-edit="'+esc(item.id)+'">Change price</button></span></div>').join('')||'<p class="wlu-muted">No services yet. Add the services you offer and their default prices.</p>';
  }
  async function loadOrders() {
    const {data,error}=await client.from('phone_unlocking_orders').select('id,reference,customer_name,customer_phone,device_brand,device_model,imei,network_name,service_name,provider_name,provider_reference,provider_service_id,provider_service_type,provider_cost,service_price,amount_paid,amount_refunded,status,approval_status,approved_at,provider_submission_status,provider_submission_message,created_at').eq('business_id',business.id).order('created_at',{ascending:false}).limit(60);
    if(error) throw error;
    orders=data||[];
    const total=orders.length, open=orders.filter(o=>!['completed','failed','cancelled','refunded'].includes(o.status)).length;
    const revenue=orders.reduce((sum,o)=>sum+Number(o.amount_paid||0)-Number(o.amount_refunded||0),0);
    const estimatedMargin=orders.filter(o=>o.status==='completed').reduce((sum,o)=>sum+Number(o.amount_paid||0)-Number(o.amount_refunded||0)-Number(o.provider_cost||0),0);
    $('wluKpis').innerHTML='<div class="wlu-kpi">Orders in register<b>'+total+'</b></div><div class="wlu-kpi">Active orders<b>'+open+'</b></div><div class="wlu-kpi">Net receipts<b>'+esc(money(revenue))+'</b></div><div class="wlu-kpi">Estimated margin (recorded SLE costs only)<b>'+esc(money(estimatedMargin))+'</b></div>';
    $('wluPaymentOrder').innerHTML='<option value="">Choose outstanding order</option>'+orders.filter(o=>Number(o.service_price)>Number(o.amount_paid)&&!['cancelled','refunded','failed'].includes(o.status)).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.reference)+' · '+esc(o.customer_name)+' · '+esc(money(Number(o.service_price)-Number(o.amount_paid)))+'</option>').join('');
    $('wluRefundOrder').innerHTML='<option value="">Choose paid order</option>'+orders.filter(o=>Number(o.amount_paid)>Number(o.amount_refunded||0)&&o.status!=='cancelled').map(o=>'<option value="'+esc(o.id)+'">'+esc(o.reference)+' · '+esc(o.customer_name)+' · refundable '+esc(money(Number(o.amount_paid)-Number(o.amount_refunded||0)))+'</option>').join('');
    $('wluOrders').innerHTML=orders.length?'<table><thead><tr><th>Order / customer</th><th>Device &amp; IMEI</th><th>Network / service</th><th>Provider</th><th>Price / paid / balance</th><th>Approval / provider</th><th>Status</th><th>Update</th></tr></thead><tbody>'+orders.map(o=>{
      const balance=Math.max(0,Number(o.service_price)-Number(o.amount_paid));
      const netPaid=Number(o.amount_paid)-Number(o.amount_refunded||0);
      const options=(o.status==='refunded'?'<option value="refunded" selected disabled>Refunded</option>':'')+STATUSES.map(s=>'<option value="'+s+'" '+(s===o.status?'selected':'')+'>'+STATUS_LABELS[s]+'</option>').join('');
      const approvalText=APPROVAL_LABELS[o.approval_status||'pending']||'Awaiting owner approval';
      const canApprove=role==='owner'&&(o.approval_status||'pending')==='pending'&&Number(o.amount_paid)>=Number(o.service_price)&&!['cancelled','failed','refunded'].includes(o.status);
      const providerText=o.provider_submission_status==='submitted'?'Submitted · '+(o.provider_reference||'reference pending'):o.provider_submission_status==='submitting'?'Submission in progress':o.provider_submission_status==='unknown'?'Submission uncertain — reconcile before retry':o.provider_submission_status==='failed'?'Provider rejected/failed':o.provider_service_id?'Provider service mapped':'Manual service';
      return '<tr><td><strong>'+esc(o.reference)+'</strong><br>'+esc(o.customer_name)+'<br><small>'+esc(o.customer_phone||'')+'</small></td><td>'+esc(o.device_brand)+' '+esc(o.device_model)+'<br><small>IMEI: '+esc(o.imei)+'</small></td><td>'+esc(o.network_name)+'<br>'+esc(o.service_name)+'</td><td>'+esc(o.provider_name||'Mobile-Unlock')+'<br><small>'+esc(o.provider_reference||'No provider ref')+'</small></td><td>'+esc(money(o.service_price))+'<br>Net paid: '+esc(money(netPaid))+'<br>Due: '+esc(money(balance))+'<br>Refunded: '+esc(money(o.amount_refunded))+'<br><small>Provider cost: '+esc(money(o.provider_cost))+'</small></td><td><strong>'+esc(approvalText)+'</strong><br><small>'+esc(providerText)+'</small>'+(o.provider_submission_message?'<br><small>'+esc(o.provider_submission_message)+'</small>':'')+'</td><td>'+esc(STATUS_LABELS[o.status]||o.status)+'</td><td>'+((o.approval_status||'pending')==='pending'&&role==='owner'?'<button type="button" data-wlu-reject data-id="'+esc(o.id)+'" class="secondary">Reject</button>':'')+(canApprove?'<button type="button" data-wlu-approve data-id="'+esc(o.id)+'">Approve'+(o.provider_service_id&&String(o.provider_service_type).toUpperCase()==='IMEI'?' &amp; submit':'')+'</button>':(o.approval_status==='pending'&&Number(o.amount_paid)<Number(o.service_price)?'<small>Full payment required before approval</small>':''))+'<select aria-label="Status for '+esc(o.reference)+'" data-status-select="'+esc(o.id)+'">'+options+'</select><button type="button" class="secondary" data-wlu-status="'+esc(o.status)+'" data-id="'+esc(o.id)+'" '+(o.status==='refunded'?'disabled':'')+'>Update</button></td></tr>'
    }).join('')+'</tbody></table>':'<p class="wlu-muted">No unlocking orders yet. Create the first order above.</p>';
    $('wluOrders').querySelectorAll('[data-status-select]').forEach(select=>select.addEventListener('change',()=>{
      const btn=$('wluOrders').querySelector('[data-id="'+select.dataset.statusSelect+'"]');
      if(btn) btn.dataset.wluStatus=select.value;
    }));
  }
  async function load() {
    if(!client||!business?.id) return;
    try { await Promise.all([loadServices(),loadOrders(),loadProviderCatalogue()]); }
    catch(error){say('Could not load phone unlocking records: '+error.message,true);}
  }
  async function refreshWorkspace(detail={}) {
    const root=panel(); if(!root) return;
    client=window.whiteLionCloud?.getClient?.()||null;
    business=detail.business||window.whiteLionCloud?.getActiveBusiness?.()||null;
    branch=detail.branch||window.whiteLionCloud?.getSelectedBranch?.()||null;
    role=business?.role||null;
    if(!client||!business?.id){$('wluWorkspace').textContent='No business selected';$('wluApp').hidden=true;$('wluEnableArea').hidden=true;say('Sign in and select a business workspace to use this module.');return;}
    $('wluWorkspace').textContent=business.name+' · '+(role||'member');
    let modules=detail.modules;
    if(!Array.isArray(modules)){
      const result=await client.from('business_industry_modules').select('module_key,is_enabled').eq('business_id',business.id);
      if(result.error) return say('Could not check module access: '+result.error.message,true);
      modules=result.data||[];
    }
    enabled=modules.some(m=>m.module_key===MODULE_KEY&&m.is_enabled);
    $('wluEnableArea').hidden=enabled;
    $('wluApp').hidden=!enabled;
    if(!enabled){say(['owner','admin'].includes(role)?'Enable this specialist module when you are ready to use it.':'Ask the business owner or administrator to enable Phone Unlocking.');return;}
    if(!canManage()){say('Your business role does not have permission to view sensitive device identifiers or manage unlocking orders.',true);$('wluApp').hidden=true;return;}
    await load();
  }
  window.addEventListener('whiteLionCloudReady',()=>refreshWorkspace().catch(e=>say(e.message,true)));
  window.addEventListener('whiteLionWorkspaceChanged',e=>refreshWorkspace(e.detail||{}).catch(err=>say(err.message,true)));
  window.addEventListener('whiteLionBranchChanged',e=>{branch=e.detail?.branch||null;});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{panel();refreshWorkspace().catch(()=>{});});
  else {panel();refreshWorkspace().catch(()=>{});}
})();
