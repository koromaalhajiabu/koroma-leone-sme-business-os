/* Koroma Leone Tech — Automation Centre and read-only Business Assistant preview. */
(function () {
  'use strict';

  var state = { tab: 'approvals', rows: [], metrics: null, settings: null, notice: '', renderToken: 0 };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function ctx() {
    var cloud = window.whiteLionCloud;
    return {
      client: cloud && cloud.getClient ? cloud.getClient() : null,
      business: cloud && cloud.getActiveBusiness ? cloud.getActiveBusiness() : null,
      session: cloud && cloud.getSession ? cloud.getSession() : null
    };
  }

  function roleCanReview(type, role) {
    role = String(role || '').toLowerCase();
    if (type === 'payroll') return role === 'owner' || role === 'admin';
    if (type === 'refund') return ['owner','admin','manager'].indexOf(role) !== -1;
    return ['owner', 'admin', 'manager', 'accountant'].indexOf(role) !== -1;
  }

  function cash(value, code) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: /^[A-Z]{3}$/.test(String(code || '')) ? code : 'SLE',
        maximumFractionDigits: 2
      }).format(Number(value || 0));
    } catch (_) {
      return (code || 'SLE') + ' ' + Number(value || 0).toFixed(2);
    }
  }

  function dateText(value) {
    var date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '—';
  }

  function typeText(type) {
    return ({
      purchase: 'Purchase',
      expense: 'Expense',
      refund: 'Refund',
      discount: 'Discount',
      payroll: 'Payroll',
      stock_adjustment: 'Stock adjustment',
      other: 'Other'
    })[type] || 'Other';
  }

  function makeUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function styles() {
    if (document.getElementById('wlAutomationCentreStyle')) return;
    var style = document.createElement('style');
    style.id = 'wlAutomationCentreStyle';
    style.textContent = [
      '#wlAutomationCentre{color:var(--wl-ink,#173b28)}',
      '#wlAutomationCentre .wlac-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px}',
      '#wlAutomationCentre .wlac-heading h1{margin:0;font-size:24px;color:var(--wl-deep,#075b35);letter-spacing:-.5px}',
      '#wlAutomationCentre .wlac-heading p{margin:5px 0 0;color:var(--wl-muted,#718078);font-size:12px}',
      '#wlAutomationCentre .wlac-badge{display:inline-flex;align-items:center;border:1px solid #d9eadf;background:#eff8f1;color:#087443;border-radius:30px;padding:6px 10px;font-size:10px;font-weight:800}',
      '#wlAutomationCentre .wlac-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}',
      '#wlAutomationCentre .wlac-tab{border:1px solid var(--wl-line,#e3ebe5);border-radius:10px;padding:10px 14px;background:#fff;color:var(--wl-ink,#173b28);font-weight:750;font-size:12px}',
      '#wlAutomationCentre .wlac-tab.active{background:#087a43;border-color:#087a43;color:#fff}',
      '#wlAutomationCentre .wlac-grid{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(0,1.4fr);gap:15px;align-items:start}',
      '#wlAutomationCentre .wlac-panel{background:#fff;border:1px solid var(--wl-line,#e3ebe5);border-radius:15px;padding:17px;box-shadow:var(--wl-shadow,0 8px 26px rgba(12,55,34,.055));min-width:0}',
      '#wlAutomationCentre .wlac-panel h3{margin:0 0 12px;font-size:14px;color:var(--wl-deep,#075b35)}',
      '#wlAutomationCentre .wlac-muted{font-size:11px;color:var(--wl-muted,#718078);line-height:1.6}',
      '#wlAutomationCentre .wlac-field{display:grid;gap:6px;margin:0 0 11px}',
      '#wlAutomationCentre .wlac-field label{font-size:10px;color:#536b5b;font-weight:800}',
      '#wlAutomationCentre input,#wlAutomationCentre select,#wlAutomationCentre textarea{width:100%;min-width:0;border:1px solid #dce8df;border-radius:9px;padding:10px 11px;font:inherit;font-size:12px;color:#203b2b;background:#fff;box-sizing:border-box}',
      '#wlAutomationCentre textarea{min-height:78px;resize:vertical}',
      '#wlAutomationCentre .wlac-button{border:1px solid #087a43;background:linear-gradient(135deg,#087a43,#075b35);border-radius:9px;padding:10px 13px;color:#fff;font-size:11px;font-weight:800;cursor:pointer}',
      '#wlAutomationCentre .wlac-button.secondary{background:#fff;color:#075b35;border-color:#cfe2d4}',
      '#wlAutomationCentre .wlac-button.reject{background:#fff8f8;color:#a63845;border-color:#f0d9dc}',
      '#wlAutomationCentre .wlac-button:disabled{opacity:.5;cursor:not-allowed}',
      '#wlAutomationCentre .wlac-request{border:1px solid #e7eee8;border-radius:12px;padding:13px;margin:0 0 10px;background:linear-gradient(120deg,#fff,#fbfdfb)}',
      '#wlAutomationCentre .wlac-request-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}',
      '#wlAutomationCentre .wlac-request h4{margin:0;color:#183d29;font-size:12px;overflow-wrap:anywhere}',
      '#wlAutomationCentre .wlac-meta{font-size:10px;color:#718078;margin-top:5px;line-height:1.5}',
      '#wlAutomationCentre .wlac-request p{margin:8px 0;color:#52665a;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}',
      '#wlAutomationCentre .wlac-status{display:inline-block;padding:5px 8px;border-radius:20px;font-size:9px;font-weight:850;text-transform:capitalize;background:#eef3f7;color:#607087;white-space:nowrap}',
      '#wlAutomationCentre .wlac-status.pending{background:#fff5df;color:#93630d}',
      '#wlAutomationCentre .wlac-status.approved{background:#e9f7ed;color:#087a43}',
      '#wlAutomationCentre .wlac-status.rejected{background:#fdebed;color:#af3c4b}',
      '#wlAutomationCentre .wlac-status.cancelled{background:#edf1f7;color:#607087}',
      '#wlAutomationCentre .wlac-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}',
      '#wlAutomationCentre .wlac-empty{padding:25px;text-align:center;color:#7b8a80;font-size:11px;border:1px dashed #dce8df;border-radius:12px;background:#fbfdfb}',
      '#wlAutomationCentre .wlac-notice{padding:11px 13px;margin:0 0 14px;border:1px solid #dcebe1;border-radius:10px;background:#f2f8ff;color:#315c78;font-size:11px;line-height:1.6}',
      '#wlAutomationCentre .wlac-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}',
      '#wlAutomationCentre .wlac-kpi{border:1px solid #e2ece5;border-radius:12px;padding:13px;background:linear-gradient(145deg,#fff,#f7fbf8);min-width:0}',
      '#wlAutomationCentre .wlac-kpi small{display:block;color:#75857a;font-size:10px}',
      '#wlAutomationCentre .wlac-kpi b{display:block;color:#075b35;font-size:19px;margin-top:6px;overflow-wrap:anywhere}',
      '#wlAutomationCentre .wlac-chat{display:grid;gap:10px}',
      '#wlAutomationCentre .wlac-prompts{display:flex;gap:7px;flex-wrap:wrap}',
      '#wlAutomationCentre .wlac-prompts button{border:1px solid #dce8df;border-radius:20px;padding:7px 10px;background:#f7fbf8;color:#315c40;font-size:10px;font-weight:700;cursor:pointer}',
      '#wlAutomationCentre .wlac-answer{min-height:72px;padding:13px;border:1px solid #e4ece6;border-radius:12px;background:#fbfdfb;color:#2f4939;font-size:12px;line-height:1.65;white-space:pre-wrap}',
      '#wlAutomationCentre .wlac-input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}',
      '#wlAutomationCentre .wlac-input-row input{min-width:0}',
      '#wlAutomationCentre .wlac-policy-row{display:flex;gap:14px;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #e7eee8}',
      '#wlAutomationCentre .wlac-policy-row b{display:block;color:#183d29;font-size:12px}',
      '#wlAutomationCentre .wlac-policy-row small{display:block;color:#718078;font-size:10px;margin-top:4px;line-height:1.5}',
      '#wlAutomationCentre .wlac-policy-row input{width:19px;height:19px;flex:0 0 auto;accent-color:#087a43}'
      '@media(max-width:850px){#wlAutomationCentre .wlac-grid{grid-template-columns:1fr}}',
      '@media(max-width:560px){#wlAutomationCentre .wlac-kpis{grid-template-columns:1fr 1fr}#wlAutomationCentre .wlac-kpi:last-child{grid-column:1/-1}#wlAutomationCentre .wlac-heading h1{font-size:21px}#wlAutomationCentre .wlac-panel{padding:14px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function fallback(message) {
    var view = document.getElementById('view');
    if (view) view.innerHTML = '<div class="panel" style="max-width:760px;margin:12px auto"><h2>Automation &amp; Assistant</h2><p class="panel-sub">' + esc(message) + '</p></div>';
  }

  function card(row, context) {
    var mine = String(row.requested_by) === String(context.session.user.id);
    var canReview = row.status === 'pending' && !mine && roleCanReview(row.request_type, context.business.role);
    var canCancel = row.status === 'pending' && mine;
    var amount = row.amount == null ? 'Amount not specified' : cash(row.amount, row.currency_code);
    var actions = '';
    if (canReview) {
      actions = '<div class="wlac-actions"><button class="wlac-button" type="button" data-wlac-review="approved" data-id="' + esc(row.id) + '">Approve</button><button class="wlac-button reject" type="button" data-wlac-review="rejected" data-id="' + esc(row.id) + '">Reject</button></div>';
    } else if (canCancel) {
      actions = '<div class="wlac-actions"><button class="wlac-button secondary" type="button" data-wlac-review="cancelled" data-id="' + esc(row.id) + '">Cancel request</button></div>';
    }
    return '<article class="wlac-request">' +
      '<div class="wlac-request-head"><div><h4>' + esc(row.title) + '</h4><div class="wlac-meta">' + esc(typeText(row.request_type)) + ' · ' + esc(amount) + '</div></div><span class="wlac-status ' + esc(row.status) + '">' + esc(row.status) + '</span></div>' +
      (row.description ? '<p>' + esc(row.description) + '</p>' : '') +
      '<div class="wlac-meta">Submitted ' + esc(dateText(row.created_at)) + ' · ' + (mine ? 'Submitted by you' : 'Submitted by a colleague') + '</div>' +
      (row.review_note ? '<div class="wlac-meta">Review note: ' + esc(row.review_note) + '</div>' : '') +
      (row.executed_at ? '<div class="wlac-meta">Approved and posted to the business records · ' + esc(dateText(row.executed_at)) + '</div>' : '') +
      actions + '</article>';
  }

  function approvals(context) {
    var role = String(context.business.role || '').toLowerCase();
    var canReview = ['owner', 'admin', 'manager', 'accountant'].indexOf(role) !== -1;
    var pending = state.rows.filter(function (row) { return row.status === 'pending'; }).length;
    var approved = state.rows.filter(function (row) { return row.status === 'approved'; }).length;
    var queue = state.rows.length ? state.rows.map(function (row) { return card(row, context); }).join('') :
      '<div class="wlac-empty">No approval requests are available for this workspace yet.</div>';

    return '<div class="wlac-grid">' +
      '<section class="wlac-panel"><h3>Submit an approval request</h3>' +
      '<p class="wlac-muted">Submit a formal request for an authorised reviewer. Decisions are recorded in this business workspace audit log.</p>' +
      '<form id="wlacRequestForm">' +
      '<div class="wlac-field"><label for="wlacType">Request category</label><select id="wlacType" name="request_type" required>' +
      '<option value="purchase">Purchase</option><option value="expense">Expense</option><option value="refund">Refund</option><option value="discount">Discount</option><option value="payroll">Payroll</option><option value="stock_adjustment">Stock adjustment</option><option value="other">Other</option></select></div>' +
      '<div class="wlac-field"><label for="wlacTitle">Request title</label><input id="wlacTitle" name="title" minlength="3" maxlength="160" required placeholder="Briefly describe what needs approval"></div>' +
      '<div class="wlac-field"><label for="wlacAmount">Amount (' + esc(context.business.currency_code || 'SLE') + ', optional)</label><input id="wlacAmount" name="amount" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
      '<div class="wlac-field"><label for="wlacDescription">Details</label><textarea id="wlacDescription" name="description" maxlength="2000" placeholder="Reason, supplier, reference or supporting context"></textarea></div>' +
      '<button class="wlac-button" type="submit">Submit request</button></form>' +
      '<p class="wlac-muted" style="margin-top:12px">A requester cannot approve their own request. Payroll approvals are restricted to owners and administrators.</p></section>' +
      '<section class="wlac-panel"><div class="wlac-request-head"><div><h3 style="margin-bottom:3px">Approval inbox</h3><div class="wlac-muted">Requests visible to this account</div></div><button class="wlac-button secondary" type="button" id="wlacRefresh">Refresh</button></div>' +
      '<div class="wlac-kpis"><div class="wlac-kpi"><small>Visible requests</small><b>' + state.rows.length + '</b></div><div class="wlac-kpi"><small>Pending</small><b>' + pending + '</b></div><div class="wlac-kpi"><small>Approved</small><b>' + approved + '</b></div></div>' +
      (canReview ? '<div class="wlac-muted" style="margin-bottom:10px">Your role: ' + esc(role) + '. Payroll requests remain restricted to owners and administrators.</div>' : '') +
      '<div id="wlacQueue">' + queue + '</div></section></div>';
  }

  function policySettings(context) {
    var s = state.settings || {};
    var canManage = ['owner','admin'].indexOf(String(context.business.role || '').toLowerCase()) !== -1;
    var disabled = canManage ? '' : ' disabled';
    function check(name, title, description) {
      return '<label class="wlac-policy-row"><span><b>' + title + '</b><small>' + description + '</small></span><input type="checkbox" name="' + name + '"' + (s[name] ? ' checked' : '') + disabled + '></label>';
    }
    return '<section class="wlac-panel"><h3>Approval requirements</h3>' +
      '<p class="wlac-muted">These rules apply to this business only. When enabled, the server holds the operation until an authorised person approves it. Existing records are not changed.</p>' +
      '<form id="wlacSettingsForm">' +
      check('require_purchase_approvals','Purchases and stock receipts','Hold purchase orders and batch receipts before increasing cloud stock') +
      check('require_expense_approvals','Operating expenses','Hold new expense records and cashbook expense entries before posting') +
      check('require_refund_approvals','Customer refunds','Hold refund processing, cashbook entries and returned stock until approved') +
      '<div class="wlac-policy-row"><span><b>Stock adjustments</b><small>Always controlled by the existing stock-adjustment approval workflow. This rule cannot be switched off here.</small></span><span class="wlac-status approved">Approval enforced</span></div>' +
      (canManage ? '<div class="wlac-actions"><button class="wlac-button" type="submit">Save approval rules</button></div>' : '<p class="wlac-muted">Only the business owner or administrator can change approval rules. Your current role is ' + esc(context.business.role || 'member') + '.</p>') +
      '</form><p class="wlac-muted" style="margin-top:12px">Rules are off until the owner or administrator enables them. Pending requests must be reviewed in the Approval workflows tab.</p></section>';
  }

  async function savePolicySettings(event) {
    event.preventDefault();
    var context = ctx();
    if (!context.client || !context.business) return;
    if (['owner','admin'].indexOf(String(context.business.role || '').toLowerCase()) === -1) {
      state.notice = 'Only the business owner or administrator can change approval rules.';
      await render();
      return;
    }
    var form = event.currentTarget;
    var values = {
      p_business_id: context.business.id,
      p_require_purchase_approvals: !!form.elements.require_purchase_approvals.checked,
      p_require_expense_approvals: !!form.elements.require_expense_approvals.checked,
      p_require_refund_approvals: !!form.elements.require_refund_approvals.checked,
      p_require_stock_adjustment_approvals: true
    };
    var result = await context.client.rpc('set_business_approval_settings', values);
    if (result.error) {
      state.notice = 'Approval rules were not changed: ' + result.error.message;
    } else {
      state.settings = result.data || state.settings;
      if (window.whiteLionCloud && window.whiteLionCloud.refreshApprovalSettings) {
        await window.whiteLionCloud.refreshApprovalSettings();
      }
      state.notice = 'Approval rules saved for ' + (context.business.name || 'this business') + '.';
    }
    await render();
  }

  function assistant(context) {
    var metrics = state.metrics;
    if (!metrics) return '<section class="wlac-panel"><h3>Read-only Business Assistant</h3><p class="wlac-muted">Loading the secure monthly business snapshot…</p></section>';
    var period = metrics.month_start ? new Date(metrics.month_start + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'This month';
    return '<section class="wlac-panel">' +
      '<div class="wlac-heading"><div><h1 style="font-size:18px">Koroma Leone Business Assistant</h1><p>Read-only business snapshot · ' + esc(context.business.name) + '</p></div><span class="wlac-badge">Preview mode</span></div>' +
      '<div class="wlac-notice">This preview answers common questions using a read-only, tenant-scoped database summary. A generative AI provider is not connected yet, so it does not invent answers or change records.</div>' +
      '<div class="wlac-kpis"><div class="wlac-kpi"><small>Recorded sales · ' + esc(period) + '</small><b>' + esc(cash(metrics.sales_month, metrics.currency_code)) + '</b></div>' +
      '<div class="wlac-kpi"><small>Recorded expenses · ' + esc(period) + '</small><b>' + esc(cash(metrics.expenses_month, metrics.currency_code)) + '</b></div>' +
      '<div class="wlac-kpi"><small>Pending requests visible to you</small><b>' + Number(metrics.pending_requests_visible || 0) + '</b></div></div>' +
      '<div class="wlac-chat"><div class="wlac-prompts">' +
      '<button type="button" data-wlac-question="How much have we sold this month?">Sales this month</button>' +
      '<button type="button" data-wlac-question="What expenses have we recorded this month?">Expenses this month</button>' +
      '<button type="button" data-wlac-question="How many approval requests are pending?">Pending approvals</button>' +
      '<button type="button" data-wlac-question="Are we profitable?">Are we profitable?</button></div>' +
      '<div class="wlac-input-row"><input id="wlacQuestion" type="text" maxlength="240" placeholder="Ask about sales, expenses, approvals or profit reporting"><button class="wlac-button" type="button" id="wlacAsk">Ask</button></div>' +
      '<div class="wlac-answer" id="wlacAnswer" role="status" aria-live="polite">Choose a suggested question or type a question about this workspace. Answers are read-only and based on the figures above.</div></div>' +
      '<p class="wlac-muted" style="margin-top:12px">These are recorded totals, not audited profit, available cash or a bank balance. Use Reports and Financial Planning for the detailed registers.</p></section>';
  }

  function answer(question) {
    var q = String(question || '').toLowerCase();
    var metrics = state.metrics || {};
    var period = metrics.month_start ? new Date(metrics.month_start + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'this month';
    if (/sales|sold|revenue|turnover/.test(q)) {
      return 'Recorded sales for ' + period + ' total ' + cash(metrics.sales_month, metrics.currency_code) + '. This is the recorded sales total; it is not net profit or cash received.';
    }
    if (/expense|spent|spending|costs?/.test(q)) {
      return 'Recorded expenses for ' + period + ' total ' + cash(metrics.expenses_month, metrics.currency_code) + '. Review the Expenses register for individual entries and supporting details.';
    }
    if (/pending|approval|awaiting/.test(q)) {
      return 'There are ' + Number(metrics.pending_requests_visible || 0) + ' pending approval requests visible to your current account. Other requests may be restricted by your business role.';
    }
    if (/profit|profitable|cash|bank|balance/.test(q)) {
      return 'I cannot safely determine audited profit, available cash or a bank balance from these two totals alone. Cost of goods sold, refunds, cashbook and bank reconciliation must also be reviewed.';
    }
    if (/stock|inventory|reorder/.test(q)) {
      return 'For stock levels and replenishment recommendations, open Inventory Intelligence or Smart Reorder Planner. This preview does not calculate stock balances yet.';
    }
    if (/forecast|predict|prediction/.test(q)) {
      return 'Forecasting is not included in this preview. Use the existing Executive Intelligence and Smart Reorder Planner for current demand and stock analysis.';
    }
    return 'I can answer questions about recorded sales this month, recorded expenses, pending approval requests and the limits of profit reporting. Try one of the suggested questions above.';
  }

  async function loadAssistant(client, businessId) {
    var result = await client.rpc('get_business_assistant_snapshot', { p_business_id: businessId });
    if (result.error) throw new Error('Could not load the read-only business snapshot: ' + result.error.message);
    state.metrics = result.data || null;
  }

  async function review(id, decision) {
    var context = ctx();
    if (!context.client || !context.business || !context.session) return;
    var note = null;
    if (decision === 'cancelled') {
      if (!window.confirm('Cancel this pending request?')) return;
    } else {
      if (!window.confirm((decision === 'approved' ? 'Approve' : 'Reject') + ' this request?')) return;
      note = window.prompt('Optional review note:', '') || null;
    }
    var result = await context.client.rpc('review_business_approval_request', {
      p_request_id: id,
      p_decision: decision,
      p_review_note: note
    });
    state.notice = result.error
      ? 'The request was not changed: ' + result.error.message
      : (decision === 'cancelled' ? 'Your request was cancelled.' : 'Decision recorded and added to the audit log.');
    await render();
  }

  async function submit(event) {
    event.preventDefault();
    var context = ctx();
    if (!context.client || !context.business || !context.session) return;
    if (navigator.onLine === false) {
      state.notice = 'Approval requests require a live cloud connection. Nothing has been submitted.';
      await render();
      return;
    }
    var form = event.currentTarget;
    var data = new FormData(form);
    var title = String(data.get('title') || '').trim();
    var rawAmount = String(data.get('amount') || '').trim();
    var amount = rawAmount === '' ? null : Number(rawAmount);
    if (title.length < 3 || title.length > 160 || (amount !== null && (!Number.isFinite(amount) || amount < 0))) {
      state.notice = 'Check the title and amount, then submit again.';
      await render();
      return;
    }
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Submitting…'; }
    var result = await context.client.from('business_approval_requests').insert({
      business_id: context.business.id,
      client_request_id: makeUuid(),
      request_type: String(data.get('request_type') || 'other'),
      title: title,
      description: String(data.get('description') || '').trim(),
      amount: amount,
      currency_code: context.business.currency_code || 'SLE',
      requested_by: context.session.user.id
    });
    state.notice = result.error ? 'Request was not submitted: ' + result.error.message : 'Approval request submitted successfully.';
    await render();
  }

  function bind(context) {
    Array.prototype.forEach.call(document.querySelectorAll('#wlAutomationCentre [data-wlac-tab]'), function (button) {
      button.addEventListener('click', function () {
        state.tab = button.getAttribute('data-wlac-tab') || 'approvals';
        state.notice = '';
        render();
      });
    });
    var form = document.getElementById('wlacRequestForm');
    if (form) form.addEventListener('submit', submit);
    var settingsForm = document.getElementById('wlacSettingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', savePolicySettings);
    var refresh = document.getElementById('wlacRefresh');
    if (refresh) refresh.addEventListener('click', render);

    Array.prototype.forEach.call(document.querySelectorAll('#wlAutomationCentre [data-wlac-review]'), function (button) {
      button.addEventListener('click', function () {
        review(button.getAttribute('data-id'), button.getAttribute('data-wlac-review'));
      });
    });

    var ask = document.getElementById('wlacAsk');
    var question = document.getElementById('wlacQuestion');
    function answerNow() {
      var target = document.getElementById('wlacAnswer');
      if (target) target.textContent = answer(question ? question.value : '');
    }
    if (ask) ask.addEventListener('click', answerNow);
    if (question) question.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') answerNow();
    });
    Array.prototype.forEach.call(document.querySelectorAll('#wlAutomationCentre [data-wlac-question]'), function (button) {
      button.addEventListener('click', function () {
        if (question) question.value = button.getAttribute('data-wlac-question') || '';
        answerNow();
      });
    });
  }

  function shell(context) {
    styles();
    var view = document.getElementById('view');
    if (!view) return;
    view.innerHTML = '<div id="wlAutomationCentre">' +
      '<div class="wlac-heading"><div><div class="eyebrow">KOROMA LEONE TECH · WORKFLOW CONTROLS</div><h1>Automation Centre</h1><p>Business approvals, accountability and read-only operational guidance for ' + esc(context.business.name || 'this workspace') + '.</p></div><span class="wlac-badge">Business-scoped access</span></div>' +
      (state.notice ? '<div class="wlac-notice" role="status">' + esc(state.notice) + '</div>' : '') +
      '<div class="wlac-tabs"><button class="wlac-tab ' + (state.tab === 'approvals' ? 'active' : '') + '" data-wlac-tab="approvals" type="button">Approval workflows</button><button class="wlac-tab ' + (state.tab === 'policies' ? 'active' : '') + '" data-wlac-tab="policies" type="button">Approval rules</button><button class="wlac-tab ' + (state.tab === 'assistant' ? 'active' : '') + '" data-wlac-tab="assistant" type="button">Business Assistant</button></div>' +
      (state.tab === 'assistant' ? assistant(context) : state.tab === 'policies' ? policySettings(context) : approvals(context)) + '</div>';
    bind(context);
  }

  async function render() {
    var view = document.getElementById('view');
    if (!view) return;
    var token = ++state.renderToken;
    var context = ctx();

    if (!context.client || !context.business || !context.session || !context.session.user) {
      fallback('Sign in and select an authorised business workspace to use approvals and business insights.');
      return;
    }
    if (navigator.onLine === false) {
      fallback('The Automation Centre needs a secure cloud connection. Your existing offline sales and inventory workflows remain available; approval decisions are not queued offline.');
      return;
    }

    view.innerHTML = '<div class="panel" style="max-width:760px;margin:12px auto"><p class="panel-sub">Verifying workspace access and loading the Automation Centre…</p></div>';
    try {
      var access = await context.client.rpc('get_business_subscription_access', { p_business_id: context.business.id });
      if (token !== state.renderToken) return;
      if (access.error) throw new Error('Subscription access could not be verified: ' + access.error.message);
      if (access.data && access.data.allowed === false) {
        fallback('This workspace needs an active subscription before the Automation Centre can be opened. Open Plans & Billing to review access.');
        return;
      }

      var settings = await context.client.rpc('get_business_approval_settings', { p_business_id: context.business.id });
      if (token !== state.renderToken) return;
      if (settings.error) throw new Error('Approval rules could not be loaded: ' + settings.error.message);
      state.settings = settings.data || {};
      var rows = await context.client.from('business_approval_requests')
        .select('id,business_id,client_request_id,request_type,title,description,amount,currency_code,requested_by,status,review_note,reviewed_at,executed_at,created_at')
        .eq('business_id', context.business.id)
        .order('created_at', { ascending: false })
        .limit(150);
      if (token !== state.renderToken) return;
      if (rows.error) throw new Error('Approval inbox could not be loaded: ' + rows.error.message);
      state.rows = rows.data || [];

      if (state.tab === 'assistant') {
        await loadAssistant(context.client, context.business.id);
        if (token !== state.renderToken) return;
      }
      shell(context);
    } catch (error) {
      if (token !== state.renderToken) return;
      fallback(error && error.message ? error.message : 'The Automation Centre could not be loaded.');
    }
  }

  window.KoromaLeoneAutomationCentre = { render: render };
})();