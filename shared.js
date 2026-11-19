/* White Lion SME OS — shared helpers used across modules.
   Loaded first (not deferred) so window.esc exists before any other script runs. */
window.esc = function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

// Load the optional affiliate workspace after the deferred Supabase client has initialised.
(function () {
  function loadAffiliateModule() {
    if (window.__wlAffiliateModuleRequested) return;
    window.__wlAffiliateModuleRequested = true;
    var script = document.createElement('script');
    script.src = './affiliate-marketing.js?v=1';
    script.async = false;
    script.onerror = function () { window.__wlScriptFail && window.__wlScriptFail.push('affiliate-marketing.js'); };
    document.body.appendChild(script);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAffiliateModule, { once: true });
  else loadAffiliateModule();
})();
