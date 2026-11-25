import { chromium } from 'playwright';

const base = (process.env.WHITE_LION_SMOKE_URL ||
  'https://koromaalhajiabu.github.io/koroma-leone-sme-business-os/').replace(/\/?$/, '/');

const payload = {
  status: 'success',
  tracking: {
    order_number: 'SECURITY-QA',
    delivery_status: 'in_transit',
    tracking_code: 'QA-TRACKING-CODE',
    delivery_address: '<img src=x onerror=window.__trackingXss=true>',
    rider_name: '<svg onload=window.__trackingXss=true>',
    rider_phone: '+23200000000',
    events: [{
      status: 'delivered',
      at: '2026-11-25T12:00:00Z',
      note: '<img src=x onerror=window.__trackingXss=true><script>window.__trackingXss=true</script>'
    }]
  }
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => { window.__trackingXss = false; });
  await context.route(
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2(?:\/|$)/,
    route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.supabase={createClient:function(){return {rpc:async function(){return {data:' +
        JSON.stringify(payload) + '};}};}};'
    })
  );
  const page = await context.newPage();
  await page.goto(new URL('delivery-tracking.html?code=SECURITY-QA', base).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForSelector('#result h2', { timeout: 10000 });
  const result = await page.evaluate(() => ({
    executed: window.__trackingXss,
    injectedElements: document.querySelectorAll('#result img, #result svg, #result script').length,
    visibleLiteralPayload: (document.querySelector('#result')?.textContent || '').includes('<img src=x onerror=window.__trackingXss=true>'),
    orderRendered: document.querySelector('#result h2')?.textContent === 'Order SECURITY-QA'
  }));
  if (result.executed || result.injectedElements !== 0 ||
      !result.visibleLiteralPayload || !result.orderRendered) {
    throw new Error('Delivery tracking security regression detected: ' + JSON.stringify(result));
  }
  console.log('Delivery tracking XSS regression check passed:', JSON.stringify(result));
  await context.close();
} finally {
  await browser.close();
}
