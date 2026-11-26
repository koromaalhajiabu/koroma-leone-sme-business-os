/* Koroma Leone SME OS — Supabase workspace, master-data and atomic transaction sync. */
(() => {
  const SUPABASE_URL = 'https://nclncqlgnxnijlumznnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
  const $ = (id) => document.getElementById(id);
  const sortBusinessesByName = (items) => [...(items || [])].sort((a,b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {sensitivity:'base', numeric:true}));
  window.__wlCloudScriptLoaded = true;
  // Use document-level delegation so authentication remains clickable even if
  // optional workspace/developer UI mounting fails or replaces button elements.
  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest ? event.target.closest('#wlSignIn, #wlSignUp') : null;
    if (!button) return;
    event.preventDefault();
    authenticate(button.id === 'wlSignUp');
  }, true);
  let client = null, session = null, activeBusiness = null, selectedBranch = null;
  let autoSyncEnabled = false, syncInProgress = false, autoRetryTimer = null, autoRetryAttempt = 0;
  let approvalSettings = { require_purchase_approvals:false, require_expense_approvals:false, require_refund_approvals:false, require_stock_adjustment_approvals:false };
  async function refreshApprovalSettings() {
    if (!client || !activeBusiness) return approvalSettings;
    const {data,error}=await client.rpc('get_business_approval_settings',{p_business_id:activeBusiness.id});
    if (error) throw new Error('Could not verify approval rules: '+error.message);
    approvalSettings=data||approvalSettings;
    try { localStorage.setItem('koroma-leone-approval-settings:'+activeBusiness.id,JSON.stringify(approvalSettings)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('whiteLionApprovalSettingsChanged',{detail:{business:activeBusiness,settings:approvalSettings}}));
    return approvalSettings;
  }

  const style = document.createElement('style');
  style.textContent = `
    #wlCloudBox{background:linear-gradient(135deg,#fff 0%,#f5faf6 100%);border:1px solid #dcebe1;border-radius:16px;padding:16px;color:#203b2b;font-size:12px;box-shadow:0 8px 24px rgba(7,91,53,.06)}
    #wlCloudBox>div:first-child{color:#075b35;letter-spacing:.7px;font-size:12px}
    #wlCloudBox button{border:1px solid #087a43;border-radius:9px;padding:9px 12px;background:linear-gradient(135deg,#087a43,#075b35);color:#fff;font-weight:750;margin:5px 5px 0 0}
    #wlCloudBox button:hover{filter:brightness(1.05)}
    #wlCloudBox input,#wlCloudBox select{width:100%;min-width:0;box-sizing:border-box;padding:10px 11px;border:1px solid #dce8df;border-radius:9px;background:#fff;color:#203b2b;margin:5px 0}
    #wlCloudBox .muted{color:#718078;font-size:10px;line-height:1.55}#wlCloudBox .cloud-actions{display:flex;flex-wrap:wrap;gap:5px}
    #wlCloudBox .cloud-status{margin:8px 0;color:#087a43;overflow-wrap:anywhere;line-height:1.5}
    #wlCloudBox details{margin-top:10px;padding:10px 12px;border:1px solid #e2ece5;border-radius:12px;background:rgba(255,255,255,.8)}
    #wlCloudBox summary{cursor:pointer;color:#075b35;font-weight:800}
    #wlCloudBox .branch-stock{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 2px;border-bottom:1px solid #e8f0ea;color:#31483a}
    #wlCloudBox .branch-note{color:#718078;font-size:10px;margin:7px 0;overflow-wrap:anywhere}
    #wlCloudBox .branch-create-grid{display:grid;grid-template-columns:1fr 1.4fr auto;gap:7px;align-items:center;margin:10px 0}
    #wlCloudBox .branch-create-grid input{margin:0}
    #wlCloudBox .branch-create-grid button{margin:0;white-space:nowrap}
    @media(max-width:620px){#wlCloudBox{padding:13px;border-radius:13px}#wlCloudBox .branch-create-grid{grid-template-columns:1fr}#wlCloudBox .branch-create-grid button{width:100%;min-height:42px}#wlCloudBox .cloud-actions button{flex:1 1 auto}}
    #wlDeveloperBox{margin-top:14px;background:#111d32;border:1px solid #b58c3d;border-radius:13px;padding:15px;color:#fff;font-size:12px}
    #wlDeveloperBox h3{margin:0 0 8px;color:#f0d28b;font-size:15px}
    #wlDeveloperBox button{border:0;border-radius:8px;padding:8px 10px;background:#d6ad57;color:#152238;font-weight:700;margin:5px 5px 5px 0}
    #wlDeveloperBox button.danger{background:#d86b70;color:#fff}
    #wlDeveloperBox .dev-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 0;border-top:1px solid #34435b}
    #wlDeveloperBox .dev-meta{color:#bac6d8;font-size:10px}
    #wlDeveloperBox .dev-actions{display:flex;flex-wrap:wrap;gap:4px}
    #wlDeveloperBox .dev-role-manager{margin:14px 0;padding:14px;border:1px solid #657b99;border-radius:12px;background:#192a43}
    #wlDeveloperBox .dev-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    #wlDeveloperBox .dev-role-manager label{display:block;color:#d9e4f2;font-size:10px;font-weight:800;margin:5px 0}
    #wlDeveloperBox .dev-role-manager select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#17243a;margin:0}
    #wlDeveloperBox .dev-role-manager button{margin-top:10px}
    #wlDeveloperBox .dev-role-help{color:#bac6d8;font-size:10px;line-height:1.55;margin-top:8px}
    @media(max-width:620px){#wlDeveloperBox .dev-role-grid{grid-template-columns:1fr}#wlDeveloperBox .dev-row{align-items:flex-start;flex-direction:column}#wlDeveloperBox .dev-actions{width:100%}}
    .app.wl-public-mode{display:block;min-height:100vh;background:radial-gradient(circle at 12% 8%,rgba(30,181,58,.10),transparent 34%),linear-gradient(135deg,#f5faf6 0%,#fff 58%,#edf7f0 100%)}
    .wl-public-mode .sidebar,.wl-public-mode .topbar,.wl-public-mode #wlInstallBanner,.wl-public-mode #appearanceBar,.wl-public-mode .content,.wl-public-mode .footer{display:none!important}
    .wl-public-mode .main{min-height:100vh;width:100%;padding:clamp(14px,3vw,34px);display:flex;flex-direction:column;align-items:center;justify-content:center}
    .wl-public-mode #wlCloudBox{width:min(1080px,100%);margin:0!important;padding:clamp(20px,4vw,46px)!important;border:1px solid #dcebe1;border-radius:26px;background:#fff;box-shadow:0 28px 90px rgba(7,91,53,.12);color:#203b2b}
    .wl-public-mode #wlCloudBox .wl-public-brand{display:flex;align-items:center;gap:11px;margin-bottom:clamp(22px,4vw,42px)}
    .wl-public-mode #wlCloudBox .wl-public-mark{width:46px;height:46px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,#1eb53a 0 38%,#fff 38% 66%,#0072c6 66% 100%);border:1px solid #dcebe1;color:#075b35;font-size:21px;font-weight:900}
    .wl-public-mode #wlCloudBox .wl-public-brand strong{display:block;font-size:13px;letter-spacing:1.6px;color:#075b35}
    .wl-public-mode #wlCloudBox .wl-public-brand small{display:block;color:#829187;font-size:9px;letter-spacing:1.5px}
    .wl-public-mode #wlCloudBox .wl-public-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:clamp(24px,5vw,64px);align-items:center}
    .wl-public-mode #wlCloudBox .wl-public-kicker{color:#087a43;font-size:10px;font-weight:850;letter-spacing:2px;text-transform:uppercase}
    .wl-public-mode #wlCloudBox .wl-public-copy h1{font-size:clamp(30px,5vw,54px);line-height:1.06;letter-spacing:-1.8px;color:#123b27;margin:12px 0 15px}
    .wl-public-mode #wlCloudBox .wl-public-copy p{font-size:14px;line-height:1.8;color:#66776d;max-width:570px;margin:0}
    .wl-public-mode #wlCloudBox .wl-public-features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:25px}
    .wl-public-mode #wlCloudBox .wl-public-feature{padding:13px;border:1px solid #e4eee7;border-radius:13px;background:#f8fcf9}
    .wl-public-mode #wlCloudBox .wl-public-feature b{display:block;color:#17452e;font-size:12px;margin-bottom:4px}
    .wl-public-mode #wlCloudBox .wl-public-feature span{display:block;color:#718078;font-size:10px;line-height:1.55}
    .wl-public-mode #wlCloudBox .wl-public-auth{padding:clamp(18px,3vw,28px);border:1px solid #e2ece5;border-radius:19px;background:linear-gradient(160deg,#fbfefc,#f4faf6)}
    .wl-public-mode #wlCloudBox .wl-public-auth h2{font-size:21px;color:#173d29;margin:0 0 6px}
    .wl-public-mode #wlCloudBox .wl-public-auth .wl-public-auth-note{font-size:11px;line-height:1.6;color:#738278;margin:0 0 15px}
    .wl-public-mode #wlCloudBox input{padding:13px 12px;margin:6px 0;border-color:#d9e7dd;border-radius:10px;font-size:13px}
    .wl-public-mode #wlCloudBox .cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .wl-public-mode #wlCloudBox .cloud-actions button{min-height:45px;margin:0;border-radius:10px;font-size:12px}
    .wl-public-mode #wlCloudBox #wlSignUp{background:#fff;color:#075b35}
    .wl-public-mode #wlCloudBox .wl-public-privacy{font-size:10px;line-height:1.6;color:#819087;margin:13px 0 0}
    .wl-public-mode #wlCloudBox .cloud-status{font-size:11px;min-height:17px}
    .wl-public-mode .main:after{content:"Designed by Alhaji Abu Koroma · Koroma Leone Tech";display:block;text-align:center;color:#8a9a90;font-size:10px;margin:20px 0 0}
    @media(max-width:760px){.wl-public-mode .main{padding:12px;justify-content:flex-start}.wl-public-mode #wlCloudBox{padding:21px!important;border-radius:19px;margin:8px 0!important}.wl-public-mode #wlCloudBox .wl-public-grid{grid-template-columns:1fr;gap:22px}.wl-public-mode #wlCloudBox .wl-public-copy h1{font-size:34px;letter-spacing:-1.2px}.wl-public-mode #wlCloudBox .wl-public-brand{margin-bottom:24px}.wl-public-mode #wlCloudBox .wl-public-features{gap:8px}.wl-public-mode #wlCloudBox .wl-public-feature{padding:11px}.wl-public-mode #wlCloudBox .wl-public-auth{padding:17px}}
    @media(prefers-reduced-motion:no-preference){.wl-public-mode #wlCloudBox{animation:wlWelcomeIn .45s ease-out both}@keyframes wlWelcomeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}}
  `;
  style.textContent = style.textContent.replace(/#wlCloudBox/g, '#wlCloudBox:not(.wl-auth-shell)');
  style.textContent += `
    .wl-auth-shell #wlCloudWork{margin-top:18px;padding-top:16px;border-top:1px solid #e7edf2;color:#344258;max-height:62vh;overflow:auto}
    .wl-auth-shell #wlCloudWork select,.wl-auth-shell #wlCloudWork input{width:100%;min-width:0;box-sizing:border-box;padding:10px 11px;border:1px solid #dfe5ee;border-radius:9px;background:#fff;color:#24334a;margin:5px 0}
    .wl-auth-shell #wlCloudWork .cloud-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
    .wl-auth-shell #wlCloudWork button{border:1px solid #173d34;border-radius:9px;padding:9px 12px;background:linear-gradient(135deg,#1b7658,#124b3d);color:#fff;font-weight:750;margin:0}
    .wl-auth-shell #wlCloudWork button:hover{filter:brightness(1.06)}
    .wl-auth-shell #wlCloudWork .cloud-status{margin:8px 0;color:#526477;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
    .wl-auth-shell #wlCloudWork details{margin-top:10px;padding:10px 12px;border:1px solid #e2e8ef;border-radius:11px;background:#f8fafc}
    .wl-auth-shell #wlCloudWork summary{cursor:pointer;color:#244b40;font-weight:800}
    .wl-auth-shell #wlCloudWork .muted{color:#718096;font-size:10px;line-height:1.55}
    .wl-auth-shell #wlCloudWork .branch-create-grid{display:grid;grid-template-columns:1fr 1.4fr auto;gap:7px;align-items:center;margin:10px 0}
    @media(max-width:620px){.wl-auth-shell #wlCloudWork .branch-create-grid{grid-template-columns:1fr}.wl-auth-shell #wlCloudWork .branch-create-grid button{width:100%;min-height:42px}}

    .app:not(.wl-authenticated) #wlWorkspaceToolsToggle{display:none!important}
    .app.wl-authenticated #wlCloudBox:not(.wl-tools-open){display:none!important}
    .app.wl-authenticated #wlCloudBox.wl-tools-open{display:block!important;position:static!important;inset:auto!important;float:none!important;clear:both!important;transform:none!important;z-index:auto!important;width:calc(100% - 32px)!important;max-width:1120px!important;margin:16px auto 20px!important;max-height:none!important;overflow:visible!important;border:1px solid #cfe2d5!important;border-radius:16px!important;box-shadow:0 10px 28px rgba(7,35,22,.10)!important;background:#fff!important;padding:16px!important}
    .app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-brand,.app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-story,.app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-bottom,.app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-heading,.app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-card-top,.app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-card-foot{display:none!important}
    .app.wl-authenticated #wlCloudBox.wl-tools-open .wl-auth-layout{display:block!important}
    .app.wl-authenticated #wlCloudBox.wl-tools-open #wlCloudWork{max-height:none!important;overflow:visible!important}
    .app.wl-authenticated #wlCloudBox.wl-tools-open #wlCloudAuth{display:none!important}
    @media(max-width:620px){.app.wl-authenticated #wlCloudBox.wl-tools-open{width:calc(100% - 16px)!important;margin:12px 8px 16px!important;padding:13px!important;border-radius:13px!important}}
    #wlSyncCentre{margin:12px 0 4px;padding:14px;border:1px solid #d8e9de;border-radius:14px;background:linear-gradient(145deg,#fbfefc,#f0f7f2);color:#203b2b}
    #wlSyncCentre .wl-sync-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    #wlSyncCentre .wl-sync-kicker{font-size:9px;font-weight:900;letter-spacing:1.4px;color:#087a43}
    #wlSyncCentre h3{margin:4px 0 3px;font-size:16px;color:#173d29}
    #wlSyncCentre .wl-sync-copy{margin:0;max-width:560px;color:#6b7c71;font-size:10px;line-height:1.6}
    #wlSyncCentre .wl-sync-connection{display:inline-flex;align-items:center;gap:6px;border:1px solid #d5e5da;border-radius:999px;background:#fff;padding:6px 9px;color:#486253;font-size:10px;font-weight:800}
    #wlSyncCentre .wl-sync-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:13px 0}
    #wlSyncCentre .wl-sync-metric{min-width:0;border:1px solid #e0ece4;border-radius:10px;background:#fff;padding:9px}
    #wlSyncCentre .wl-sync-metric span{display:block;color:#718078;font-size:9px;font-weight:750}
    #wlSyncCentre .wl-sync-metric b{display:block;margin-top:3px;color:#173d29;font-size:19px;line-height:1.2}
    #wlSyncCentre .wl-sync-toggle{display:flex;align-items:center;gap:8px;margin:8px 0 4px;color:#244b40;font-size:11px;font-weight:800}
    #wlSyncCentre .wl-sync-toggle input{width:17px;height:17px;margin:0;accent-color:#087a43}
    #wlSyncCentre .wl-sync-note{margin:0 0 8px;color:#718078;font-size:9px;line-height:1.6}
    #wlSyncCentre .wl-sync-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0}
    #wlSyncCentre .wl-sync-actions button{margin:0;padding:7px 10px;font-size:10px}
    #wlSyncCentre .wl-sync-details{margin-top:9px;border-top:1px solid #dce9e0;padding-top:8px}
    #wlSyncCentre .wl-sync-details summary{cursor:pointer;color:#244b40;font-size:10px;font-weight:850}
    #wlSyncCentre .wl-sync-history{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
    #wlSyncCentre .wl-sync-history li,#wlSyncCentre .wl-sync-conflict{padding:8px;border:1px solid #e3ece6;border-radius:9px;background:#fff;font-size:9px;color:#53675b;line-height:1.5}
    #wlSyncCentre .wl-sync-history strong,#wlSyncCentre .wl-sync-conflict strong{color:#244b40}
    #wlSyncCentre .wl-sync-conflict{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;margin-top:7px}
    #wlSyncCentre .wl-sync-conflict-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:0 0 auto}
    #wlSyncCentre .wl-sync-conflict button{flex:0 0 auto;margin:0;padding:6px 8px;font-size:9px}
    #wlSyncCentre .wl-sync-empty{margin:8px 0 0;color:#718078;font-size:9px;line-height:1.6}
    @media(max-width:520px){#wlSyncCentre{padding:11px}#wlSyncCentre .wl-sync-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#wlSyncCentre .wl-sync-conflict{display:block}#wlSyncCentre .wl-sync-conflict-actions{margin-top:7px}#wlSyncCentre .wl-sync-conflict button{margin-top:0}}
  `;
  document.head.appendChild(style);

  function say(message) {
    const el = $('wlCloudStatus');
    if (el) el.textContent = message;
    if (typeof window.toast === 'function') window.toast(message);
  }
  function addPanel() {
    const host = document.querySelector('.main');
    const anchor = document.querySelector('.topbar');
    if (!host || !anchor) return;
    const box = $('wlCloudBox') || document.createElement('section');
    box.id = 'wlCloudBox';
    // Attach authentication actions immediately, before optional developer-panel controls.
    // A missing admin-only element must never leave the public sign-in buttons inert.
    if (box.classList.contains('wl-auth-shell') && $('wlCloudAuth') && $('wlCloudWork')) {
      // Keep the premium login markup from index.html; only hydrate the authenticated workspace.
      $('wlCloudWork').innerHTML = `
        <select id="wlBusinessSelect" aria-label="Choose business"></select>
        <div class="cloud-actions"><button id="wlCreateBusiness">＋ New business</button><button id="wlSyncNow">Sync now</button><button id="wlDiagnoseData" type="button">Check local/cloud data</button><div id="wlDataDiagnostic" class="cloud-status" role="status" aria-live="polite">Diagnostic has not been run. This check will not upload, delete or modify records.</div><button id="wlDownloadNow">Download cloud records</button><button id="wlSignOut">Sign out</button></div><section id="wlSyncCentre" aria-label="Offline and cloud sync control centre">
          <div class="wl-sync-top">
            <div><div class="wl-sync-kicker">SYNC CONTROL CENTRE</div><h3>Offline &amp; cloud sync</h3><p class="wl-sync-copy">Track this workspace's device queue, cloud receipts, conflicts and retry activity.</p></div>
            <span id="wlSyncConnection" class="wl-sync-connection">Checking connection…</span>
          </div>
          <div class="wl-sync-metrics" aria-live="polite">
            <div class="wl-sync-metric"><span>Pending for this business</span><b id="wlSyncPendingCount">—</b></div>
            <div class="wl-sync-metric"><span>Synced to this business</span><b id="wlSyncDoneCount">—</b></div>
            <div class="wl-sync-metric"><span>Unassigned local records</span><b id="wlSyncUnassignedCount">—</b></div>
            <div class="wl-sync-metric"><span>Conflicts to review</span><b id="wlSyncConflictCount">—</b></div>
          </div>
          <label class="wl-sync-toggle"><input id="wlAutoSyncToggle" type="checkbox"> Automatically sync eligible records when online</label>
          <p class="wl-sync-note">Automatic sync runs only while the app is open, signed in and connected. It uploads records already assigned to this business. Unassigned records are excluded. Purchase, expense and refund approvals remain in force.</p>
          <div id="wlSyncStatus" class="cloud-status" role="status" aria-live="polite">Local records are not yet synced.</div>
          <div class="wl-sync-actions"><button id="wlSyncQueueRefresh" type="button">Refresh sync status</button></div>
          <details id="wlSyncHistoryDetails" class="wl-sync-details"><summary>Sync history</summary><ol id="wlSyncHistory" class="wl-sync-history"><li class="wl-sync-empty">No sync activity recorded on this device yet.</li></ol></details>
          <details id="wlSyncConflictDetails" class="wl-sync-details"><summary>Remote changes and conflicts</summary><div id="wlSyncConflicts"><p class="wl-sync-empty">No conflicts loaded. Use Download cloud records to check for remote changes.</p></div></details>
        </section>
        <details id="wlBranchManager" open><summary>Branch management</summary>
          <div class="muted" style="margin:7px 0">Manage outlets, choose the active working location, assign staff and review stock by branch.</div>
          <label class="muted" for="wlBranchSelect">Active working branch</label>
          <select id="wlBranchSelect" aria-label="Select active branch"><option value="">Loading branches…</option></select>
          <div class="branch-create-grid">
            <input id="wlNewBranchName" type="text" maxlength="100" placeholder="New branch name" aria-label="New branch name">
            <input id="wlNewBranchAddress" type="text" maxlength="240" placeholder="Branch address (optional)" aria-label="Branch address">
            <button id="wlCreateBranch" type="button">＋ Add branch</button>
          </div>
          <div class="cloud-actions"><button id="wlRefreshBranches" type="button">Refresh branch list</button></div>
          <div id="wlBranchStatus" class="cloud-status">Select a business to load its branches.</div>
          <div id="wlBranchInventory" class="muted"></div>
          <details><summary>Assign staff to this branch</summary>
            <select id="wlBranchMemberSelect" aria-label="Select business member"><option value="">Load business members…</option></select>
            <div class="cloud-actions"><button id="wlAssignBranchMember">Assign staff</button><button id="wlRemoveBranchMember">Deactivate assignment</button></div>
            <div id="wlBranchMembers" class="muted"></div>
          </details>
        </details>
        <details><summary>Business modules</summary><div id="wlModules" class="muted">Select a business to view modules.</div></details>
`;
    } else {
      // Backward-compatible fallback for pages that do not contain the premium login shell.
      box.innerHTML = `

      <div class="wl-public-brand"><span class="wl-public-mark" aria-hidden="true">K</span><span><strong>KOROMA LEONE</strong><small>BUSINESS SYSTEMS · SME BUSINESS OS</small></span></div>
      <div id="wlCloudAuth" class="wl-public-grid">
        <div class="wl-public-copy">
          <div class="wl-public-kicker">One platform. Your whole business.</div>
          <h1>Run your business with clarity and confidence.</h1>
          <p>Manage sales, stock, purchases, customers, branches and business performance in one connected workspace. Start with your own account and set up your business when you are ready.</p>
          <div class="wl-public-features">
            <div class="wl-public-feature"><b>Sales &amp; inventory</b><span>Keep daily transactions and stock activity organised.</span></div>
            <div class="wl-public-feature"><b>Finance &amp; reports</b><span>Understand business activity with useful records and insights.</span></div>
            <div class="wl-public-feature"><b>Multi-branch operations</b><span>Manage outlets and staff from one business workspace.</span></div>
            <div class="wl-public-feature"><b>Online &amp; offline-ready</b><span>Continue working locally and sync records when connected.</span></div>
          </div>
        </div>
        <div class="wl-public-auth">
          <h2>Get started</h2>
          <p class="wl-public-auth-note">Create your account to set up your own business workspace, or sign in if you already have one.</p>
          <input id="wlCloudEmail" type="email" autocomplete="email" placeholder="Email address" aria-label="Email address">
          <input id="wlCloudPassword" type="password" autocomplete="current-password" placeholder="Password (minimum 8 characters)" aria-label="Password">
          <div class="cloud-actions"><button id="wlSignUp" type="button">Create your account</button><button id="wlSignIn" type="button">Sign in</button></div>
          <p class="wl-public-privacy">Your account is separate from other businesses. You only see workspaces you are authorised to access. Email confirmation may be required before your first sign-in.</p>
        </div>
      </div>
      <div id="wlCloudStatus" class="cloud-status" role="status" aria-live="polite">Connecting securely…</div>
      <div id="wlCloudWork" hidden>
        <select id="wlBusinessSelect" aria-label="Choose business"></select>
        <div class="cloud-actions"><button id="wlCreateBusiness">＋ New business</button><button id="wlSyncNow">Sync now</button><button id="wlDiagnoseData" type="button">Check local/cloud data</button><div id="wlDataDiagnostic" class="cloud-status" role="status" aria-live="polite">Diagnostic has not been run. This check will not upload, delete or modify records.</div><button id="wlDownloadNow">Download cloud records</button><button id="wlSignOut">Sign out</button></div><section id="wlSyncCentre" aria-label="Offline and cloud sync control centre">
          <div class="wl-sync-top">
            <div><div class="wl-sync-kicker">SYNC CONTROL CENTRE</div><h3>Offline &amp; cloud sync</h3><p class="wl-sync-copy">Track this workspace's device queue, cloud receipts, conflicts and retry activity.</p></div>
            <span id="wlSyncConnection" class="wl-sync-connection">Checking connection…</span>
          </div>
          <div class="wl-sync-metrics" aria-live="polite">
            <div class="wl-sync-metric"><span>Pending for this business</span><b id="wlSyncPendingCount">—</b></div>
            <div class="wl-sync-metric"><span>Synced to this business</span><b id="wlSyncDoneCount">—</b></div>
            <div class="wl-sync-metric"><span>Unassigned local records</span><b id="wlSyncUnassignedCount">—</b></div>
            <div class="wl-sync-metric"><span>Conflicts to review</span><b id="wlSyncConflictCount">—</b></div>
          </div>
          <label class="wl-sync-toggle"><input id="wlAutoSyncToggle" type="checkbox"> Automatically sync eligible records when online</label>
          <p class="wl-sync-note">Automatic sync runs only while the app is open, signed in and connected. It uploads records already assigned to this business. Unassigned records are excluded. Purchase, expense and refund approvals remain in force.</p>
          <div id="wlSyncStatus" class="cloud-status" role="status" aria-live="polite">Local records are not yet synced.</div>
          <div class="wl-sync-actions"><button id="wlSyncQueueRefresh" type="button">Refresh sync status</button></div>
          <details id="wlSyncHistoryDetails" class="wl-sync-details"><summary>Sync history</summary><ol id="wlSyncHistory" class="wl-sync-history"><li class="wl-sync-empty">No sync activity recorded on this device yet.</li></ol></details>
          <details id="wlSyncConflictDetails" class="wl-sync-details"><summary>Remote changes and conflicts</summary><div id="wlSyncConflicts"><p class="wl-sync-empty">No conflicts loaded. Use Download cloud records to check for remote changes.</p></div></details>
        </section>
        <details id="wlBranchManager" open><summary>Branch management</summary>
          <div class="muted" style="margin:7px 0">Manage outlets, choose the active working location, assign staff and review stock by branch.</div>
          <label class="muted" for="wlBranchSelect">Active working branch</label>
          <select id="wlBranchSelect" aria-label="Select active branch"><option value="">Loading branches…</option></select>
          <div class="branch-create-grid">
            <input id="wlNewBranchName" type="text" maxlength="100" placeholder="New branch name" aria-label="New branch name">
            <input id="wlNewBranchAddress" type="text" maxlength="240" placeholder="Branch address (optional)" aria-label="Branch address">
            <button id="wlCreateBranch" type="button">＋ Add branch</button>
          </div>
          <div class="cloud-actions"><button id="wlRefreshBranches" type="button">Refresh branch list</button></div>
          <div id="wlBranchStatus" class="cloud-status">Select a business to load its branches.</div>
          <div id="wlBranchInventory" class="muted"></div>
          <details><summary>Assign staff to this branch</summary>
            <select id="wlBranchMemberSelect" aria-label="Select business member"><option value="">Load business members…</option></select>
            <div class="cloud-actions"><button id="wlAssignBranchMember">Assign staff</button><button id="wlRemoveBranchMember">Deactivate assignment</button></div>
            <div id="wlBranchMembers" class="muted"></div>
          </details>
        </details>
        <details><summary>Business modules</summary><div id="wlModules" class="muted">Select a business to view modules.</div></details>
      </div>`;
    }
    // Keep Workspace Tools immediately after Overview and before the footer; it expands in normal page flow.
    const dashboardView = host.querySelector('#view');
    const footer = host.querySelector('.footer');
    if (dashboardView) dashboardView.insertAdjacentElement('afterend', box);
    else if (footer) footer.insertAdjacentElement('beforebegin', box);
    else host.appendChild(box);
    const dev = document.createElement('section');
    dev.id = 'wlDeveloperBox';
    dev.hidden = true;
    dev.innerHTML = `
      <h3>KOROMA LEONE · PRIVATE DEVELOPER CONSOLE</h3>
      <div id="wlDevIdentity" class="dev-meta">Verifying developer permissions…</div>
      <div style="margin:10px 0;padding:10px;border:1px solid #8d7548;border-radius:10px;background:#1a2b43"><strong style="color:#f0d28b">GLOBAL SCOUT RECRUITMENT</strong><div class="dev-meta" style="margin:5px 0 8px">Track real scout organisations, invitations, responses and follow-ups.</div><a href="./football-scout-recruitment.html" target="_blank" rel="noopener" style="display:inline-block;padding:9px 12px;border-radius:8px;background:#d6ad57;color:#152238;font-weight:800;text-decoration:none">Open Recruitment Centre ↗</a></div>
      <div id="wlDevStatus" class="cloud-status">Loading secure platform controls…</div>
      <div id="wlDevStats" class="dev-meta"></div>
      
      <section id="wlDevOwnerCommand" style="margin:14px 0;padding:16px;border:1px solid #d6ad57;border-radius:16px;background:linear-gradient(145deg,#152840,#10251f);color:#fff">
        <style>
          #wlDevOwnerCommand{scroll-margin-top:18px}
          #wlDevOwnerCommand .owner-command-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
          #wlDevOwnerCommand .owner-eyebrow{font-size:10px;letter-spacing:1.2px;color:#c8d5e3;font-weight:800}
          #wlDevOwnerCommand h3{margin:4px 0 0;color:#f0d28b;font-size:19px}
          #wlDevOwnerCommand p{margin:6px 0 12px;color:#bac6d8;font-size:11px;line-height:1.55}
          #wlDevOwnerCommand .owner-command-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
          #wlDevOwnerCommand .owner-mode{padding:6px 9px;border:1px solid #66806c;border-radius:999px;color:#b7e2c0;font-size:10px;font-weight:800}
          #wlDevOwnerCommand #wlDevQuickRefresh{min-height:36px;padding:8px 11px;background:#d6ad57;color:#17243a;border:0;border-radius:9px;font-weight:800}
          #wlDevOwnerCommand .owner-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
          #wlDevOwnerCommand .owner-metric{padding:12px;border:1px solid #435873;border-radius:11px;background:#203650;min-width:0}
          #wlDevOwnerCommand .owner-metric strong{display:block;font-size:23px;line-height:1.1;color:#fff}
          #wlDevOwnerCommand .owner-metric span{display:block;margin-top:6px;color:#c7d3e0;font-size:10px;line-height:1.35}
          #wlDevOwnerCommand .owner-panels{display:grid;grid-template-columns:1.1fr .9fr;gap:10px;margin-top:10px}
          #wlDevOwnerCommand .owner-card{min-width:0;padding:13px;border:1px solid #445973;border-radius:12px;background:#192e47}
          #wlDevOwnerCommand .owner-card h4{margin:0 0 10px;color:#f0d28b;font-size:12px;letter-spacing:.35px}
          #wlDevOwnerCommand .owner-action-list{display:grid;gap:7px}
          #wlDevOwnerCommand .owner-action{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #53657c;border-radius:9px;background:#223953;color:#fff;text-align:left;width:100%}
          #wlDevOwnerCommand .owner-action strong{display:block;font-size:11px}
          #wlDevOwnerCommand .owner-action small{display:block;margin-top:3px;color:#bdcadd;font-size:10px}
          #wlDevOwnerCommand .owner-count{flex:0 0 auto;padding:4px 8px;border-radius:99px;background:#9b6b2f;color:#fff;font-size:11px;font-weight:900}
          #wlDevOwnerCommand .owner-empty{padding:10px;border:1px dashed #61748b;border-radius:9px;color:#c8d5e3;font-size:11px;line-height:1.5}
          #wlDevOwnerCommand .owner-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
          #wlDevOwnerCommand .owner-shortcuts button{min-height:52px;padding:9px 10px;border:1px solid #53657c;border-radius:9px;background:#223953;color:#fff;text-align:left}
          #wlDevOwnerCommand .owner-shortcuts strong{display:block;font-size:11px}
          #wlDevOwnerCommand .owner-shortcuts small{display:block;margin-top:3px;color:#bdcadd;font-size:9px;line-height:1.35}
          #wlDevOwnerCommand .owner-queues{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
          #wlDevOwnerCommand .owner-queue{margin-top:10px}
          #wlDevOwnerCommand .owner-queue-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:9px 0;border-top:1px solid #40536a}
          #wlDevOwnerCommand .owner-queue-row:first-child{border-top:0;padding-top:0}
          #wlDevOwnerCommand .owner-queue-row strong{display:block;color:#fff;font-size:11px;overflow-wrap:anywhere}
          #wlDevOwnerCommand .owner-queue-row small{display:block;margin-top:3px;color:#bac6d8;font-size:10px;line-height:1.45}
          #wlDevOwnerCommand .owner-queue-row button{min-height:30px;padding:6px 9px;border:1px solid #71839a;border-radius:8px;background:#2a4059;color:#fff;font-size:10px;font-weight:800}
          #wlDevOwnerCommand .owner-queue-row button.owner-approve{background:#c39b50;color:#17243a;border:0}
          #wlDevOwnerCommand .owner-queue-row button.owner-reject{border-color:#a75b63;color:#ffd7d7}
          #wlDevOwnerCommand .owner-queue-row .owner-row-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
          #wlDevOwnerCommand .owner-updated{margin-top:10px;color:#9eafc2;font-size:9px;text-align:right}
          @media(max-width:700px){#wlDevOwnerCommand .owner-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#wlDevOwnerCommand .owner-panels,#wlDevOwnerCommand .owner-queues{grid-template-columns:1fr}}
        </style>
        <div class="owner-command-head">
          <div><div class="owner-eyebrow">KOROMA LEONE TECH · PRIVATE OPERATIONS</div><h3>SMART OWNER CONTROL CENTRE</h3><p>One operating screen for customer workspaces, applications, billing and platform issues.</p></div>
          <div class="owner-command-actions"><span id="wlOwnerModeTag" class="owner-mode">Checking platform mode…</span><button id="wlDevQuickRefresh" type="button">Refresh all status</button></div>
        </div>
        <div id="wlOwnerMetrics" class="owner-metrics"><div class="owner-empty">Loading executive overview…</div></div>
        <div class="owner-panels">
          <div class="owner-card"><h4>ACTION REQUIRED</h4><div id="wlOwnerActions" class="owner-action-list"><div class="owner-empty">Checking for items that need attention…</div></div></div>
          <div class="owner-card"><h4>QUICK NAVIGATION</h4><div class="owner-shortcuts">
            <button type="button" data-owner-jump="wlDevApplicationsSection"><strong>Application reviews</strong><small>Business and football club applications</small></button>
            <button type="button" data-owner-jump="wlDevBusinesses"><strong>Business workspaces</strong><small>Workspace and subscription status</small></button>
            <button type="button" data-owner-jump="wlDevAccounts"><strong>Customer accounts</strong><small>Account access and status</small></button>
            <button type="button" data-owner-jump="wlDevRoleManager"><strong>Access and staff roles</strong><small>Workspace-level permissions</small></button>
            <button type="button" data-owner-jump="wlOwnerBillingSection"><strong>Subscription billing</strong><small>Payments and unpaid invoices</small></button>
            <button type="button" data-owner-jump="wlDevAlertSettingsPanel"><strong>System alerts</strong><small>Registration and payment alerts</small></button>
            <button type="button" data-owner-jump="wlDevLeagueManager"><strong>Football administration</strong><small>League and football access controls</small></button>
          </div></div>
        </div>
        <div class="owner-queues">
          <div class="owner-card" id="wlOwnerBillingSection"><h4>SUBSCRIPTION PAYMENTS AWAITING VERIFICATION</h4><div id="wlOwnerPaymentRows" class="owner-queue"><div class="owner-empty">Loading payment queue…</div></div></div>
          <div class="owner-card" id="wlOwnerInvoiceSection"><h4>OPEN SUBSCRIPTION INVOICES</h4><div id="wlOwnerInvoiceRows" class="owner-queue"><div class="owner-empty">Loading invoices…</div></div></div>
          <div class="owner-card" id="wlOwnerExpirySection"><h4>SUBSCRIPTION EXPIRY WATCH</h4><div id="wlOwnerExpiryRows" class="owner-queue"><div class="owner-empty">Loading subscription dates…</div></div></div>
        </div>
        <div id="wlOwnerLastUpdated" class="owner-updated">Last refreshed: —</div>
      </section>
      <div id="wlDevAlertSettingsPanel" style="display:block;visibility:visible;margin:14px 0;padding:14px;border:2px solid #4f8a5b;border-radius:12px;background:#152a1e;color:#fff;position:relative;z-index:2">
        <h3 style="margin:0 0 8px;color:#9fe3ae;font-size:16px">EMAIL ALERTS</h3>
        <div style="color:#bac6d8;font-size:11px;margin-bottom:8px">Get an email the moment someone registers a new account or submits a payment. Requires a one-time Resend API key setup (see below).</div>
        <div class="dev-role-grid">
          <div><label for="wlDevAlertEmail">Alert email address</label><input id="wlDevAlertEmail" type="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#17243a"></div>
          <div><label for="wlDevAlertEnabled">Alerts</label><select id="wlDevAlertEnabled"><option value="true" selected>Enabled</option><option value="false">Paused</option></select></div>
        </div>
        <button id="wlDevAlertSave" type="button">Save alert settings</button>
        <button id="wlDevAlertRefresh" type="button">Refresh</button>
        <div id="wlDevAlertStatus" class="dev-meta" style="margin-top:6px">Loading alert settings…</div>
      </div>
      <div id="wlDevCustomerRegistrationPanel" style="display:block;visibility:visible;margin:14px 0;padding:14px;border:2px solid #d6ad57;border-radius:12px;background:#192a43;color:#fff;position:relative;z-index:2"><h3 style="margin:0 0 8px;color:#f0d28b;font-size:16px">NEW CUSTOMER REGISTRATIONS</h3><div style="color:#bac6d8;font-size:11px;margin-bottom:8px">New platform accounts and their email addresses appear here.</div><button id="wlDevRegistrationsRefresh" type="button">Refresh customer registrations</button><div id="wlDevRegistrations" class="dev-meta" style="display:block;visibility:visible;min-height:28px">Customer registration notifications load after developer verification.</div></div>
      <section class="dev-role-manager" id="wlDevRoleManager">
        <h3 style="margin:0 0 5px;color:#f0d28b">Assign or change a user's business role</h3>
        <div class="dev-role-help">Select a business workspace and a registered account. This grants or updates that person's access to the selected business only.</div>
        <div class="dev-role-grid">
          <div><label for="wlDevRoleBusiness">Business workspace</label><select id="wlDevRoleBusiness"><option value="">Loading business workspaces…</option></select></div>
          <div><label for="wlDevRoleAccount">Registered user</label><select id="wlDevRoleAccount"><option value="">Loading registered accounts…</option></select></div>
          <div><label for="wlDevRoleValue">Business role</label><select id="wlDevRoleValue"><option value="admin">Administrator</option><option value="manager" selected>Manager</option><option value="cashier">Cashier</option><option value="storekeeper">Storekeeper</option><option value="accountant">Accountant</option><option value="viewer">Viewer</option></select></div>
          <div><label for="wlDevRoleStatus">Membership access</label><select id="wlDevRoleStatus"><option value="true" selected>Active</option><option value="false">Inactive</option></select></div>
        </div>
        <button id="wlDevRoleSave" type="button">Assign / update business role</button>
        <div id="wlDevRoleStatus" class="dev-role-help">Choose a business and registered account to continue.</div>
      </section>
      <section class="dev-role-manager" id="wlDevRegistrationLimitManager">
        <h3 style="margin:0 0 5px;color:#f0d28b">Multiple business registration permissions</h3>
        <div class="dev-role-help">Ordinary accounts can register one business by default. Select a registered user and set a higher maximum. Set the limit to 1 to revoke the exception. This does not grant Developer access.</div>
        <div class="dev-role-grid">
          <div><label for="wlDevRegistrationUser">Registered user</label><select id="wlDevRegistrationUser"><option value="">Loading registered accounts…</option></select></div>
          <div><label for="wlDevRegistrationMax">Maximum businesses</label><input id="wlDevRegistrationMax" type="number" min="2" max="1000" step="1" value="2" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #64748b;border-radius:8px;background:#fff;color:#17243a"></div>
        </div>
        <button id="wlDevRegistrationLimitSave" type="button">Grant / update permission</button>
        <button id="wlDevRegistrationLimitRefresh" type="button">Refresh permissions</button>
        <div id="wlDevRegistrationLimitStatus" class="dev-role-help">No additional-business permissions loaded yet.</div>
        <div id="wlDevRegistrationLimits" class="dev-meta">Loading permissions…</div>
      </section>
      <section class="dev-role-manager" id="wlDevLeagueManager">
        <h3 style="margin:0 0 5px;color:#f0d28b">League administration (every business)</h3>
        <div class="dev-role-help">Total control over every football league on the platform: assign, edit or remove any league admin, and freeze or unfreeze any league directly — no business membership required. Suspending a person's whole account is done in "Registered accounts" below.</div>
        <div class="dev-role-grid">
          <div><label for="wlDevLeagueSelect">League</label><select id="wlDevLeagueSelect"><option value="">Loading leagues…</option></select></div>
          <div><label for="wlDevLeagueEmail">Account email</label><input id="wlDevLeagueEmail" type="email" placeholder="admin@example.com"></div>
          <div><label for="wlDevLeagueRole">League role</label><select id="wlDevLeagueRole"><option value="competition_admin" selected>League admin</option><option value="club_manager">Club manager</option><option value="referee">Referee</option><option value="disciplinary_officer">Disciplinary officer</option><option value="viewer">Viewer</option></select></div>
          <div><label for="wlDevLeagueActive">Access</label><select id="wlDevLeagueActive"><option value="true" selected>Active</option><option value="false">Inactive</option></select></div>
        </div>
        <button id="wlDevLeagueAssignSave" type="button">Assign / update league admin</button>
        <div id="wlDevLeagueAssignStatus" class="dev-role-help">Choose a league and enter the account's email to continue.</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px"><h3 style="margin:0;color:#f0d28b;font-size:13px">All leagues</h3><button id="wlDevLeaguesRefresh" type="button">Refresh leagues</button></div>
        <div id="wlDevLeagues" class="dev-meta">Loading leagues…</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px"><h3 style="margin:0;color:#f0d28b;font-size:13px">All league admins &amp; roles</h3><button id="wlDevLeagueAdminsRefresh" type="button">Refresh assignments</button></div>
        <div id="wlDevLeagueAdmins" class="dev-meta">Loading league role assignments…</div>
      </section>
      <div class="dev-actions">
        <button id="wlDevFreeze">Freeze platform</button>
      </div>
      <div style="margin:14px 0;padding:12px;border:1px solid #b85d63;border-radius:10px;background:#351f2b">
        <h3 style="color:#ffd0d0;margin:0 0 6px">Clear demonstration data</h3>
        <div class="dev-meta">Permanently removes all business workspaces and their cloud records, then clears this device's local business records. Your developer sign-in, platform controls and audit history are preserved. Other accounts are disabled immediately and queued for deletion after the existing 30-day recovery period.</div>
        <button id="wlDevResetData" class="danger">Reset all business data</button>
      </div>
      <div id="wlDevBusinesses"></div>
<section id="wlDevApplicationsSection" style="margin-top:16px;padding:13px;border:1px solid #d6ad57;border-radius:12px;background:#192a43"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0;color:#f0d28b">Business application review</h3><button id="wlDevApprovalRefresh" type="button">Refresh applications</button></div><p class="dev-meta">Review the submitted business details. Approval creates the workspace, assigns the customer as owner, creates Main Branch, activates industry modules and applies the existing trial/subscription rules.</p><div id="wlDevApprovals" class="dev-meta" style="margin-top:9px">Loading business applications…</div></section>
<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:15px"><h3 style="margin:0">New business registrations</h3><button id="wlDevBusinessRegistrationsRefresh" type="button">Refresh businesses</button></div><div id="wlDevBusinessRegistrations" class="dev-meta">Business registration notifications load after developer verification.</div><section class="dev-role-manager" id="wlDevAccountInvitePanel"><h3 style="margin:0 0 6px;color:#f0d28b">Invite administrator account</h3><div class="dev-role-help">Send a secure email invitation and grant access to one selected business workspace. The invited person sets their own password.</div><div class="dev-role-grid"><div><label for="wlDevInviteName">Full name</label><input id="wlDevInviteName" type="text" autocomplete="name" placeholder="Administrator full name"></div><div><label for="wlDevInviteEmail">Email address</label><input id="wlDevInviteEmail" type="email" autocomplete="email" placeholder="admin@example.com"></div><div><label for="wlDevInviteBusiness">Business workspace</label><select id="wlDevInviteBusiness"><option value="">Loading workspaces…</option></select></div><div><label for="wlDevInviteRole">Business role</label><select id="wlDevInviteRole"><option value="admin" selected>Administrator</option><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="storekeeper">Storekeeper</option><option value="cashier">Cashier</option><option value="viewer">Viewer</option></select></div></div><button id="wlDevInviteSubmit" type="button">Send administrator invitation</button><div id="wlDevInviteStatus" class="dev-role-help">Invitation is sent through Supabase Auth. No password is created or displayed here.</div></section><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:15px"><h3 style="margin:0">Registered accounts</h3><button id="wlDevAccountsRefresh">Refresh accounts</button></div>
      <div id="wlDevAccounts" class="dev-meta">Account directory loads after developer verification.</div>
      <div class="dev-meta" style="margin-top:10px">Deletion requests suspend access immediately. Accounts remain recoverable for 30 days. Business owners and developer accounts are protected. Permanent deletion is only available after the recovery period through the secure server-side function.</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:16px"><h3 style="margin:0">30-day deletion &amp; recovery</h3><button id="wlDevDeletionRefresh">Refresh requests</button></div>
      <div id="wlDevDeletions" class="dev-meta">Deletion requests load after developer verification.</div>
      <div class="dev-meta" style="margin-top:10px">Developer access is verified by Supabase database permissions. This console does not expose passwords or secret API keys.</div>`;
    // Keep the private developer console separate from the customer dashboard and workspace tools.
    const mainFooter = host.querySelector('.footer');
    if (mainFooter) mainFooter.insertAdjacentElement('afterend', dev);
    else box.insertAdjacentElement('afterend', dev);
    // Notify modules whose mount slots are created dynamically with the developer panel.
    window.dispatchEvent(new Event('whiteLionDeveloperPanelReady'));
    $('wlDevApprovalRefresh').onclick = loadDeveloperApprovals;
    $('wlDevQuickRefresh').onclick = loadDeveloperDashboard;
    dev.addEventListener('click', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-owner-jump]') : null;
      if (!button || !dev.contains(button)) return;
      const target = $(button.dataset.ownerJump);
      if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('wlDevFreeze').onclick = toggleMaintenance;

    $('wlDevRoleSave').onclick = saveDeveloperBusinessRole;
    $('wlDevRegistrationLimitSave').onclick = saveDeveloperRegistrationLimit;
    $('wlDevRegistrationLimitRefresh').onclick = loadDeveloperRegistrationLimits;
    $('wlDevLeagueAssignSave').onclick = saveDeveloperLeagueAdmin;
    $('wlDevLeaguesRefresh').onclick = loadDeveloperLeagues;
    $('wlDevLeagueAdminsRefresh').onclick = loadDeveloperLeagueAdmins;
    $('wlDevResetData').onclick = resetDeveloperBusinessData;
    $('wlDevAccountsRefresh').onclick = loadDeveloperAccounts;
    $('wlDevInviteSubmit').onclick = inviteDeveloperAccount;
    $('wlDevRegistrationsRefresh').onclick = loadDeveloperRegistrations;
    $('wlDevBusinessRegistrationsRefresh').onclick = loadDeveloperBusinessRegistrations;
    $('wlDevAlertSave').onclick = saveDeveloperAlertSettings;
    $('wlDevAlertRefresh').onclick = loadDeveloperAlertSettings;
    $('wlDevDeletionRefresh').onclick = loadDeveloperDeletionRequests;
    $('wlSignOut').onclick = async () => { await client.auth.signOut(); session = null; activeBusiness = null; $('wlDeveloperBox').hidden = true; showSignedOut(); };
    $('wlCreateBusiness').onclick = createBusiness;
    $('wlSyncNow').onclick = () => syncLocalRecords({automatic:false});
    $('wlAutoSyncToggle').onchange = async (event) => {
      autoSyncEnabled = !!event.target.checked;
      try { await setting('wl_auto_sync:' + activeBusiness.id, autoSyncEnabled); }
      catch (error) { autoSyncEnabled = false; event.target.checked = false; syncStatus('Could not save the automatic sync preference on this device: ' + error.message); return; }
      autoRetryAttempt = 0;
      if (autoSyncEnabled) { syncStatus('Automatic sync enabled for this workspace. Only records assigned to this business are eligible.'); scheduleAutomaticSync('automatic-sync-enabled', 1200); }
      else { clearTimeout(autoRetryTimer); autoRetryTimer = null; syncStatus('Automatic sync disabled. Manual sync remains available.'); }
      await updateSyncStatus();
    };
    $('wlSyncQueueRefresh').onclick = updateSyncStatus;
    $('wlDiagnoseData').onclick = diagnoseData;
    $('wlDownloadNow').onclick = downloadCloudRecords;
    $('wlCreateBranch').onclick = createBranch;
    $('wlRefreshBranches').onclick = loadBranches;
    $('wlBranchSelect').onchange = async (e) => {
      selectedBranch = (window.__wlBranches || []).find(b => b.id === e.target.value) || null;
      await loadBranchDetails();
    };
    $('wlAssignBranchMember').onclick = () => setBranchMember(true);
    $('wlRemoveBranchMember').onclick = () => setBranchMember(false);
    $('wlBusinessSelect').onchange = async (e) => {
      const chosen = (window.__wlBusinesses || []).find(b => b.id === e.target.value);
      if (chosen) await selectBusiness(chosen);
    };
  }
  function showSignedOut() {
    document.querySelector('.app')?.classList.add('wl-public-mode'); document.querySelector('.app')?.classList.remove('wl-authenticated');
    $('wlCloudAuth').hidden = false; $('wlCloudWork').hidden = true;
    $('wlCloudStatus').textContent = 'Not signed in. Create an account or sign in to continue.';
  }
  async function authenticate(signUp) {
    const email = $('wlCloudEmail')?.value.trim() || '';
    const password = $('wlCloudPassword')?.value || '';
    if (!email || password.length < 8) return say('Enter your email and a password of at least 8 characters.');
    if (!client) return say('Secure sign-in is still connecting. Please wait a moment and try again.');
    say(signUp ? 'Creating your account…' : 'Signing in…');
    try {
      const result = signUp
        ? await client.auth.signUp({ email, password })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) return say(result.error.message);
      if (signUp && !result.data.session) return say('Account created. Check your email to confirm it, then sign in.');
      session = result.data.session;
      if (session) await loadBusinesses();
      else say('Account created. Check your email for the confirmation link.');
    } catch (error) {
      say(error?.message || 'Sign-in could not be completed. Check your connection and try again.');
    }
  }
  function showAwaitingDeveloperApproval(status) {
    document.querySelector('.app')?.classList.add('wl-public-mode');
    $('wlCloudAuth').hidden = true;
    $('wlCloudWork').hidden = true;
    let panel = $('wlCloudApproval');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'wlCloudApproval';
      panel.style.cssText = 'max-width:620px;margin:24px auto;padding:28px;border:1px solid #dcebe1;border-radius:18px;background:#fff;box-shadow:0 18px 55px rgba(7,91,53,.09);text-align:center;color:#203b2b';
      $('wlCloudBox').appendChild(panel);
    }
    panel.hidden = false;
    const verified = !!status?.email_confirmed;
    const workspacePending = !!status?.workspace_pending;
    const heading = workspacePending ? 'Approved — Awaiting Workspace Assignment' : 'Awaiting Developer Approval';
    const applicationStatus = status?.application_status || 'not_submitted';
    const explanation = workspacePending ? 'Your business application is approved. Your workspace assignment is being completed; refresh this page shortly.' : applicationStatus === 'pending' ? 'Your business application has been submitted and is waiting for developer review.' : applicationStatus === 'needs_information' ? 'The developer has requested more information. Open your application to update the details.' : applicationStatus === 'rejected' ? 'Your business application was not approved. Review the developer note and contact support if you need clarification.' : (verified ? 'Your account is verified. Complete the business application so the developer can review your business and create its workspace.' : 'Please confirm your email using the link sent by Supabase. You can sign in again after confirming it.');
    panel.innerHTML = '<div style="font-size:38px;margin-bottom:10px">⏳</div><div style="font-size:10px;letter-spacing:1.8px;font-weight:850;color:#087a43">KOROMA LEONE CUSTOMER ONBOARDING</div><h1 style="font-size:25px;margin:10px 0;color:#173d29">' + heading + '</h1><p style="font-size:13px;line-height:1.8;color:#66776d">Your account is ' + (verified ? 'email-verified' : 'registered') + '. ' + explanation + '</p><div style="padding:12px;border-radius:11px;background:#f3faf5;color:#356448;font-size:11px">Account: ' + esc(session?.user?.email || '') + '<br>Approval status: ' + esc(status?.approval_status || 'pending') + '</div><p style="font-size:11px;color:#819087;margin:16px 0">You may sign out and return later. Approval does not require you to share your password.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button id="wlApprovalCheck" style="border:0;border-radius:9px;padding:11px 18px;background:#087a43;color:#fff;font-weight:800">Check approval status</button><button id="wlApprovalSignOut" style="border:1px solid #b9cfc0;border-radius:9px;padding:11px 18px;background:#fff;color:#075b35;font-weight:800">Sign out</button></div>';
    $('wlApprovalCheck').onclick = async () => { $('wlApprovalCheck').disabled=true; $('wlApprovalCheck').textContent='Checking…'; await loadBusinesses(); if ($('wlApprovalCheck')) { $('wlApprovalCheck').disabled=false; $('wlApprovalCheck').textContent='Check approval status'; } };
    $('wlApprovalSignOut').onclick = async () => { await client.auth.signOut(); session=null; activeBusiness=null; panel.hidden=true; showSignedOut(); };
    const applyLink = verified && !workspacePending ? '<p style="margin:16px 0"><a href="./business-application.html" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#087a43;color:#fff;text-decoration:none;font-weight:800">' + (applicationStatus === 'pending' ? 'View business application' : 'Complete / update business application') + ' →</a></p>' : '';
    panel.insertAdjacentHTML('beforeend', applyLink);
    $('wlCloudStatus').textContent = !verified ? 'Email confirmation required.' : applicationStatus === 'pending' ? 'Business application awaiting review.' : 'Email verified. Business application required.';
  }
  async function loadBusinesses() {
    // Developer authorization and customer approval are checked by Supabase before
    // any workspace query or operational screen is exposed.
    void checkDeveloperAccess();
    const access = await client.rpc('get_my_platform_access_status');
    if (access.error) {
      $('wlCloudAuth').hidden = true; $('wlCloudWork').hidden = true;
      say('Access verification is temporarily unavailable. No workspace data has been opened. Please retry shortly.');
      return;
    }
    if (!access.data?.can_access) {
      showAwaitingDeveloperApproval(access.data || {});
      return;
    }
    const approvalPanel = $('wlCloudApproval');
    if (approvalPanel) approvalPanel.hidden = true;
    // Only approved, email-verified users can proceed into workspace loading.
    const isDeveloper = !!access.data?.is_developer;
    $('wlCreateBusiness').hidden = !isDeveloper;
    const { data: memberships, error } = await client.from('business_members')
      .select('business_id,role,is_active,businesses(id,name,industry,currency_code,contact_email,contact_phone,address,website,tax_registration_number,receipt_footer,logo_path)')
      .eq('user_id', session.user.id).eq('is_active', true);
    if (error) return say('Could not load workspaces: ' + error.message);
    document.querySelector('.app')?.classList.remove('wl-public-mode'); document.querySelector('.app')?.classList.add('wl-authenticated');
    const businesses = sortBusinessesByName((memberships || []).map(m => ({...m.businesses, role:m.role})).filter(b => b.id));
    if (!isDeveloper && !businesses.length) {
      showAwaitingDeveloperApproval({...access.data,workspace_pending:true});
      return;
    }
    $('wlCloudAuth').hidden = true; $('wlCloudWork').hidden = false;
    const previouslySelectedId = activeBusiness?.id;
    window.__wlBusinesses = businesses;
    $('wlBusinessSelect').innerHTML = businesses.length
      ? businesses.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.role)}</option>`).join('')
      : '<option value="">No business workspace yet</option>';
    if (businesses.length) await selectBusiness(businesses.find(b => b.id === previouslySelectedId) || businesses[0]);
    else if (isDeveloper) say('Developer account verified. Create or manage customer workspaces from the Developer Console.');
    else say('Your account is approved. Your business workspace is being prepared by the Koroma Leone platform developer.');
  }
  async function createBranch() {
    if (!activeBusiness) return say('Select a business workspace first.');
    const name = $('wlNewBranchName')?.value.trim() || '';
    const address = $('wlNewBranchAddress')?.value.trim() || '';
    if (name.length < 2) {
      $('wlBranchStatus').textContent = 'Enter a branch name containing at least two characters.';
      $('wlNewBranchName')?.focus();
      return;
    }
    $('wlCreateBranch').disabled = true;
    $('wlBranchStatus').textContent = 'Creating branch securely…';
    const {data,error} = await client.rpc('create_business_branch', {
      p_business_id:activeBusiness.id,p_name:name,p_address:address || null
    });
    $('wlCreateBranch').disabled = false;
    if (error) { $('wlBranchStatus').textContent = 'Could not create branch: ' + error.message; return; }
    $('wlNewBranchName').value = '';
    $('wlNewBranchAddress').value = '';
    $('wlBranchStatus').textContent = 'Branch created successfully. It is now selected as the working branch.';
    await loadBranches(data?.branch_id);
  }
  async function loadBranches(preferredId) {
    if (!activeBusiness || !client) return;
    $('wlBranchStatus').textContent = 'Loading branches…';
    const {data,error} = await client.from('branches')
      .select('id,name,address,is_active,created_at')
      .eq('business_id',activeBusiness.id).order('created_at');
    if (error) { $('wlBranchStatus').textContent = 'Could not load branches: ' + error.message; return; }
    window.__wlBranches = data || [];
    const active = window.__wlBranches.filter(b => b.is_active);
    $('wlBranchSelect').innerHTML = active.length
      ? active.map(b => '<option value="' + esc(b.id) + '">' + esc(b.name) + (b.address ? ' · ' + esc(b.address) : '') + '</option>').join('')
      : '<option value="">No active branches — create one</option>';
    selectedBranch = active.find(b => b.id === (preferredId || selectedBranch?.id)) || active[0] || null;
    $('wlBranchSelect').value = selectedBranch?.id || '';
    window.dispatchEvent(new CustomEvent('whiteLionBranchChanged', {detail:{branch:selectedBranch,branches:active}}));
    $('wlBranchStatus').textContent = active.length + ' active branch(es) available. Branch selection is active for branch stock, sales, purchases and cloud transaction posting.';
    await loadBranchDetails();
  }
  async function loadBranchDetails() {
    if (!activeBusiness || !selectedBranch) {
      $('wlBranchInventory').textContent = 'No active branch selected.';
      $('wlBranchMembers').textContent = '';
      $('wlBranchMemberSelect').innerHTML = '<option value="">No branch selected</option>';
      return;
    }
    const [stockResult, memberResult, assignmentResult] = await Promise.all([
      client.from('branch_inventory').select('product_id,quantity_on_hand,products(name,sku,unit)')
        .eq('business_id',activeBusiness.id).eq('branch_id',selectedBranch.id).order('updated_at',{ascending:false}),
      client.from('business_members').select('user_id,role,is_active')
        .eq('business_id',activeBusiness.id).eq('is_active',true),
      client.from('branch_members').select('user_id,is_active')
        .eq('business_id',activeBusiness.id).eq('branch_id',selectedBranch.id)
    ]);
    if (stockResult.error) $('wlBranchInventory').textContent = 'Stock unavailable: ' + stockResult.error.message;
    else {
      const rows = stockResult.data || [];
      $('wlBranchInventory').innerHTML = '<div class="branch-note"><strong>Stock at ' + esc(selectedBranch.name) + '</strong></div>' +
        (rows.map(row => '<div class="branch-stock"><span>' + esc(row.products?.name || row.product_id) + '</span><strong>' + Number(row.quantity_on_hand || 0).toLocaleString() + ' ' + esc(row.products?.unit || '') + '</strong></div>').join('') || '<div class="branch-note">No stock records in this branch yet.</div>');
    }
    if (memberResult.error) $('wlBranchMemberSelect').innerHTML = '<option value="">Members unavailable</option>';
    else {
      const members = memberResult.data || [];
      $('wlBranchMemberSelect').innerHTML = '<option value="">Choose a business member…</option>' +
        members.map(m => '<option value="' + esc(m.user_id) + '">' + esc(m.user_id) + ' · ' + esc(m.role) + '</option>').join('');
    }
    if (assignmentResult.error) $('wlBranchMembers').textContent = 'Assignments unavailable: ' + assignmentResult.error.message;
    else {
      const assignments = assignmentResult.data || [];
      const memberMap = new Map((memberResult.data || []).map(m => [m.user_id,m]));
      $('wlBranchMembers').innerHTML = '<div class="branch-note"><strong>Branch assignments</strong></div>' +
        (assignments.map(a => '<div class="branch-note">' + esc(a.user_id) + ' · ' + esc(memberMap.get(a.user_id)?.role || 'member') + ' · ' + (a.is_active ? 'ACTIVE' : 'INACTIVE') + '</div>').join('') || '<div class="branch-note">No staff assigned yet.</div>');
    }
  }
  async function setBranchMember(isActive) {
    if (!activeBusiness || !selectedBranch) return say('Select a branch first.');
    const userId = $('wlBranchMemberSelect').value;
    if (!userId) return say('Choose a business member first.');
    const {error} = await client.rpc('set_branch_member_access', {
      p_business_id:activeBusiness.id,p_branch_id:selectedBranch.id,p_user_id:userId,p_is_active:isActive
    });
    if (error) { $('wlBranchStatus').textContent = 'Could not update branch assignment: ' + error.message; return; }
    $('wlBranchStatus').textContent = isActive ? 'Staff member assigned to branch.' : 'Branch assignment deactivated.';
    await loadBranchDetails();
  }
  async function selectBusiness(business) {
    activeBusiness = business;
    $('wlBusinessSelect').value = business.id;
    try { await refreshApprovalSettings(); }
    catch (error) {
      try { approvalSettings=JSON.parse(localStorage.getItem('koroma-leone-approval-settings:'+business.id)||'null')||approvalSettings; } catch (_) {}
      say('Approval rules could not be refreshed: '+error.message+'. Cached rules are shown until the connection is restored.');
    }
    const sideName = $('sideBusiness'), sideIndustry = $('sideIndustry');
    if (sideName) sideName.textContent = business.name;
    if (sideIndustry) sideIndustry.textContent = business.industry + ' · ' + business.currency_code;
    const { data: modules, error } = await client.from('business_industry_modules')
      .select('module_key,is_enabled').eq('business_id', business.id).order('module_key');
    $('wlModules').textContent = error ? 'Module list unavailable: ' + error.message :
      (modules || []).filter(m => m.is_enabled).map(m => m.module_key.replaceAll('_',' ')).join(' · ') || 'No modules enabled';
    say('Signed in as ' + session.user.email + '. Workspace: ' + business.name + '. The Sync Control Centre is ready for this workspace.');
    updateSyncStatus();
    window.dispatchEvent(new CustomEvent('whiteLionWorkspaceChanged', { detail: { business, modules: modules || [] } }));
    await loadBranches();
    await loadSyncPreferences();
    await updateSyncStatus();
    scheduleAutomaticSync('workspace-selected', 1400);
  }
  async function updateBusinessProfile(profile) {
    if (!client || !session || !activeBusiness) throw new Error('Sign in and select a business workspace first.');
    const role = String(activeBusiness.role || '').toLowerCase();
    if (!['owner','admin'].includes(role)) throw new Error('Only this business owner or an administrator can edit its business profile.');
    const name = String(profile?.name || '').trim();
    const industry = String(profile?.industry || 'Multi-industry').trim();
    const currency = String(profile?.currency || profile?.currency_code || activeBusiness.currency_code || 'SLE').trim().toUpperCase();
    if (name.length < 2) throw new Error('Business name must contain at least two characters.');
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a valid three-letter code.');
    const clean = value => String(value ?? '').trim() || null;
    const payload = {
      name,
      industry: industry || 'Multi-industry',
      currency_code: currency,
      contact_email: clean(profile.email),
      contact_phone: clean(profile.phone),
      address: clean(profile.address),
      website: clean(profile.website),
      tax_registration_number: clean(profile.taxId),
      receipt_footer: clean(profile.receiptFooter),
      logo_path: clean(profile.logoPath) || activeBusiness.logo_path || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from('businesses')
      .update(payload)
      .eq('id', activeBusiness.id)
      .select('id,name,industry,currency_code,contact_email,contact_phone,address,website,tax_registration_number,receipt_footer,logo_path,updated_at')
      .single();
    if (error) throw new Error('Business profile was not saved: ' + error.message);
    activeBusiness = {...activeBusiness, ...data};
    window.__wlBusinesses = (window.__wlBusinesses || []).map(b => b.id === data.id ? {...b, ...data} : b);
    const selector = $('wlBusinessSelect');
    if (selector) {
      selector.innerHTML = (window.__wlBusinesses || []).map(b => '<option value="' + esc(b.id) + '">' + esc(b.name) + ' — ' + esc(b.role) + '</option>').join('');
      selector.value = data.id;
    }
    const sideName = $('sideBusiness'), sideIndustry = $('sideIndustry');
    if (sideName) sideName.textContent = data.name;
    if (sideIndustry) sideIndustry.textContent = data.industry + ' · ' + data.currency_code;
    window.dispatchEvent(new CustomEvent('whiteLionWorkspaceChanged', {detail:{business:activeBusiness, profileUpdated:true}}));
    say('Business profile saved to ' + data.name + '.');
    return activeBusiness;
  }

  async function uploadBusinessLogo(file) {
    if (!client || !session || !activeBusiness) throw new Error('Sign in and select a business workspace first.');
    if (!['owner','admin'].includes(String(activeBusiness.role||'').toLowerCase())) throw new Error('Only the business owner or an administrator can change the logo.');
    if (!(file instanceof File) || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 2*1024*1024) throw new Error('Choose a PNG, JPG, WEBP or GIF image under 2 MB.');
    const ext = ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[file.type];
    const path = activeBusiness.id + '/business-logo-' + Date.now() + '.' + ext;
    const {error} = await client.storage.from('business-branding').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if (error) throw new Error('Business logo upload failed: ' + error.message);
    return path;
  }
  async function getBusinessLogoUrl(path) {
    if (!client || !path || !activeBusiness) return null;
    if (!String(path).startsWith(activeBusiness.id + '/')) throw new Error('Logo path does not belong to the selected business.');
    const {data,error} = await client.storage.from('business-branding').createSignedUrl(path,3600);
    if (error) throw new Error('Could not load business logo: ' + error.message);
    return data?.signedUrl || null;
  }
  async function checkDeveloperAccess() {
    const panel = $('wlDeveloperBox');
    if (!panel || !session) return;
    panel.hidden = session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com';
    if (panel.hidden) return;
    $('wlDevIdentity').textContent = 'Authenticated: ' + session.user.email + ' · Private developer';
    await loadDeveloperDashboard();
    if (panel.dataset.ownerLandingSession !== session.user.id) {
      panel.dataset.ownerLandingSession = session.user.id;
      $('wlDevOwnerCommand')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    await loadDeveloperApprovals();
    if (!window.__wlRegistrationRefreshTimer) {
      window.__wlRegistrationRefreshTimer = setInterval(() => {
        if (session && session.user.email?.toLowerCase() === 'koromaalhajiabu0@gmail.com' && !document.hidden) {
          loadDeveloperRegistrations();
          loadDeveloperBusinessRegistrations();
          loadDeveloperApprovals();
        }
      }, 60000);
    }
  }
  async function loadDeveloperApprovals() {
    const host = $('wlDevApprovals');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading business applications…';
    const {data,error} = await client.rpc('get_platform_pending_business_applications');
    if (error) { host.textContent = 'Could not load business applications: ' + error.message; return; }
    const rows = Array.isArray(data) ? data : [];
    host.innerHTML = rows.length ? rows.map(a => {
      const club = a.club_details || {};
      const isClub = a.application_kind === 'football_club';
      const clubLines = isClub ? [
        'Club category: ' + (club.club_type || ''),
        'Manager: ' + (club.manager_full_name || a.full_name || ''),
        'Manager role: ' + (club.manager_role || ''),
        'District / city: ' + [club.district,club.city].filter(Boolean).join(', '),
        'Competition: ' + (club.competition_name || ''),
        'Home ground: ' + (club.home_ground || ''),
        'Club registration: ' + [club.club_registration_body,club.club_registration_number].filter(Boolean).join(' · '),
        'Public website address: ' + (club.proposed_website_slug || ''),
        'Club contact: ' + [club.contact_email,club.contact_phone].filter(Boolean).join(' · '),
        'Authority statement: ' + (club.authority_statement || ''),
        club.evidence_reference ? 'Evidence reference: ' + club.evidence_reference : '',
        club.evidence_path ? 'Private supporting evidence attached' : 'No supporting evidence attached'
      ] : [];
      const details = [
        isClub ? 'Football Club Workspace' : (a.business_type || a.industry_group),
        a.industry_group,
        a.country,
        a.currency_code,
        a.contact_email || a.email,
        a.contact_phone || a.phone,
        a.address,
        a.website,
        a.tax_registration_number ? 'Tax/registration: ' + a.tax_registration_number : '',
        a.notes ? 'Notes: ' + a.notes : '',
        ...clubLines
      ].filter(Boolean).map(esc).join(' · ');
      const title = isClub ? 'FOOTBALL CLUB APPLICATION · ' + (club.official_club_name || a.business_name) : (a.business_name || 'Business application');
      return '<article class="dev-row" style="align-items:flex-start"><div style="min-width:0;flex:1"><strong>' +
        esc(title) + '</strong><div class="dev-meta">' +
        esc(a.full_name || 'Applicant') + ' · ' + esc(a.email || '') + '</div><div class="dev-meta">' +
        esc(details) + '</div><div class="dev-meta">Submitted: ' + esc(new Date(a.created_at).toLocaleString()) +
        ' · ' + esc(a.status || 'pending') + '</div><div class="dev-meta">Application ID: ' + esc(a.id) +
        (isClub ? ' · Club application ID: ' + esc(a.special_application_id || '') : '') +
        '</div></div><div class="dev-actions">' +
        (club.evidence_path ? '<button type="button" data-club-evidence="' + esc(a.id) + '">Open private evidence</button>' : '') +
        '<button data-review-business="' + esc(a.id) + '" data-decision="approve">' + (isClub ? 'Approve &amp; create club workspace' : 'Approve &amp; create workspace') + '</button>' +
        '<button data-review-business="' + esc(a.id) + '" data-decision="needs_information">Request information</button>' +
        '<button class="danger" data-review-business="' + esc(a.id) + '" data-decision="reject">Reject</button></div></article>';
    }).join('') : '<div class="dev-meta">No business applications are awaiting review.</div>';
    host.querySelectorAll('[data-club-evidence]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const latest = await client.rpc('get_platform_pending_business_applications');
          if (latest.error) throw latest.error;
          const application = (Array.isArray(latest.data) ? latest.data : []).find(a => a.id === button.dataset.clubEvidence);
          const path = application?.club_details?.evidence_path;
          if (!path) throw new Error('No private supporting evidence is attached.');
          const signed = await client.storage.from('club-onboarding-evidence').createSignedUrl(path, 300);
          if (signed.error) throw signed.error;
          window.open(signed.data.signedUrl, '_blank', 'noopener');
        } catch (error) {
          alert('Could not open private club evidence: ' + (error.message || 'Unknown error'));
        } finally { button.disabled = false; }
      };
    });
    host.querySelectorAll('[data-review-business]').forEach(button => {
      button.onclick = async () => {
        const decision = button.dataset.decision;
        const applicationId = button.dataset.reviewBusiness;
        const currentApp = rows.find(a => a.id === applicationId);
        const isClub = currentApp?.application_kind === 'football_club';
        const promptText = decision === 'approve'
          ? (isClub ? 'Approve this football club application, create its club workspace and website draft, and give the manager access under this account?' : 'Approve this business application and automatically create the workspace under the applicant’s account?')
          : decision === 'reject' ? 'Reject this application?' : 'Request more information from this applicant?';
        if (!confirm(promptText)) return;
        const note = decision === 'needs_information' || decision === 'reject'
          ? (prompt('Enter a short note for the applicant:', '') || '') : '';
        if (decision !== 'approve' && !note.trim()) { alert('A review note is required for this decision.'); return; }
        button.disabled = true;
        const result = await client.rpc('review_platform_business_application', {
          p_application_id: applicationId, p_decision: decision, p_review_note: note
        });
        if (result.error) {
          alert('Review failed: ' + result.error.message);
          await loadDeveloperApprovals();
          return;
        }
        await loadDeveloperApprovals();
        if (decision === 'approve') {
          await loadDeveloperDashboard();
          say(isClub ? 'Football club approved. Its club workspace, manager access and website draft have been created under the same account.' : 'Business approved. Its workspace has been created under the customer’s account.');
        } else {
          say(decision === 'reject' ? 'Business application rejected.' : 'More information requested.');
        }
      };
    });
  }

  function ownerControlDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
  }
  function ownerControlMoney(amount, currency) {
    const code = String(currency || 'SLE').toUpperCase();
    const value = Number(amount || 0);
    try { return new Intl.NumberFormat(window.wlGetLanguage?.() || 'en', {style:'currency',currency:code,maximumFractionDigits:2}).format(value); }
    catch (_) { return value.toFixed(2) + ' ' + code; }
  }
  async function loadOwnerControlCentre() {
    const root = $('wlDevOwnerCommand');
    if (!root || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    const metrics = $('wlOwnerMetrics');
    const actionsHost = $('wlOwnerActions');
    if (metrics) metrics.innerHTML = '<div class="owner-empty">Loading executive overview…</div>';
    const [centreResult, billingResult] = await Promise.all([
      client.rpc('get_platform_owner_control_centre'),
      client.rpc('get_platform_billing_overview')
    ]);
    if (centreResult.error) {
      if (metrics) metrics.innerHTML = '<div class="owner-empty">Owner overview unavailable: ' + esc(centreResult.error.message) + '</div>';
      if (actionsHost) actionsHost.innerHTML = '<div class="owner-empty">The owner summary could not be loaded. Use Refresh all status to retry.</div>';
      return;
    }
    const data = centreResult.data || {};
    const billing = billingResult.error ? {} : (billingResult.data || {});
    const pendingPayments = Array.isArray(billing.pending) ? billing.pending : [];
    const invoices = Array.isArray(data.open_invoices) ? data.open_invoices : [];
    const expiryWatch = Array.isArray(data.expiry_watch) ? data.expiry_watch : [];
    const metricCards = [
      ['customer_workspaces','Customer workspaces'],
      ['active_workspaces','Operational workspaces'],
      ['user_count','Registered accounts'],
      ['pending_applications','Applications awaiting review'],
      ['pending_payments','Payments to verify'],
      ['pending_invoices','Outstanding invoices']
    ];
    const statData = {...data,user_count:Number(window.__wlPlatformUserCount || 0)};
    if (metrics) metrics.innerHTML = metricCards.map(([key,label]) =>
      '<div class="owner-metric"><strong>' + esc(Number(statData[key] || 0).toLocaleString()) + '</strong><span>' + esc(label) + '</span></div>'
    ).join('');
    const mode = $('wlOwnerModeTag');
    if (mode) {
      mode.textContent = data.maintenance_enabled ? 'MAINTENANCE MODE' : 'LIVE';
      mode.style.color = data.maintenance_enabled ? '#ffd28d' : '#b7e2c0';
      mode.style.borderColor = data.maintenance_enabled ? '#a87942' : '#66806c';
    }
    const actionItems = [];
    const addAction = (label,count,target,detail) => {
      if (Number(count || 0) > 0) actionItems.push({label,count:Number(count),target,detail});
    };
    addAction('Applications awaiting review',data.pending_applications,'wlDevApplicationsSection','Open the application review queue');
    addAction('Payments to verify',data.pending_payments,'wlOwnerBillingSection','Review payment references and verification');
    addAction('Overdue subscription invoices',data.overdue_invoices,'wlOwnerInvoiceSection','Follow up invoices past their due date');
    addAction('Expired subscriptions',data.expired_subscriptions,'wlOwnerExpirySection','Review customer subscription access');
    addAction('Subscriptions expiring within 7 days',data.expiring_subscriptions,'wlOwnerExpirySection','Contact customers before access expires');
    addAction('Suspended or frozen workspaces',Number(data.suspended_workspaces || 0) + Number(data.frozen_workspaces || 0),'wlDevBusinesses','Review workspace status');
    addAction('Missing subscription records',data.missing_subscription_records,'wlDevBusinesses','Check newly created customer workspaces');
    if (data.maintenance_enabled) actionItems.push({label:'Platform maintenance is enabled',count:1,target:'wlDevFreeze',detail:'Review the platform operating mode'});
    if (actionsHost) actionsHost.innerHTML = actionItems.length ? actionItems.map(item =>
      '<button type="button" class="owner-action" data-owner-jump="' + esc(item.target) + '"><span><strong>' + esc(item.label) + '</strong><small>' + esc(item.detail) + '</small></span><span class="owner-count">' + esc(item.count) + '</span></button>'
    ).join('') : '<div class="owner-empty">No urgent actions are waiting. The platform checks below are up to date.</div>';
    const paymentHost = $('wlOwnerPaymentRows');
    if (paymentHost) {
      if (billingResult.error) paymentHost.innerHTML = '<div class="owner-empty">Payment queue unavailable: ' + esc(billingResult.error.message) + '</div>';
      else if (!pendingPayments.length) paymentHost.innerHTML = '<div class="owner-empty">No subscription payments are waiting for verification.</div>';
      else paymentHost.innerHTML = pendingPayments.map(payment =>
        '<div class="owner-queue-row"><div><strong>' + esc(payment.business_name || 'Customer workspace') + '</strong><small>Invoice ' + esc(payment.invoice_number || '—') + ' · ' + esc(payment.plan_code || 'Plan') + '<br>Provider: ' + esc(payment.provider || '—') + ' · Reference: ' + esc(payment.reference || '—') + '<br>' + esc(ownerControlMoney(payment.amount,payment.currency_code)) + ' · ' + esc(ownerControlDate(payment.submitted_at)) + '</small></div><div class="owner-row-actions"><button type="button" class="owner-approve" data-owner-payment-review="' + esc(payment.payment_id) + '" data-approve="true">Verify</button><button type="button" class="owner-reject" data-owner-payment-review="' + esc(payment.payment_id) + '" data-approve="false">Reject</button></div></div>'
      ).join('');
      paymentHost.querySelectorAll('[data-owner-payment-review]').forEach(button => {
        button.onclick = async () => {
          const approve = button.dataset.approve === 'true';
          if (!confirm(approve ? 'Verify this payment and activate or renew the subscription?' : 'Reject this subscription payment?')) return;
          const note = approve ? '' : (prompt('Enter a reason for rejecting this payment:', '') || '').trim();
          if (!approve && !note) { alert('A reason is required before rejecting a payment.'); return; }
          button.disabled = true;
          const result = await client.rpc('review_subscription_payment', {
            p_payment_id:button.dataset.ownerPaymentReview,
            p_approve:approve,
            p_notes:note
          });
          if (result.error) {
            alert('Payment review failed: ' + result.error.message);
            await loadOwnerControlCentre();
            return;
          }
          say(approve ? 'Payment verified and subscription activated.' : 'Payment rejected and recorded.');
          await loadDeveloperDashboard();
        };
      });
    }
    const invoiceHost = $('wlOwnerInvoiceRows');
    if (invoiceHost) {
      invoiceHost.innerHTML = invoices.length ? invoices.map(invoice =>
        '<div class="owner-queue-row"><div><strong>' + esc(invoice.business_name || 'Customer workspace') + '</strong><small>Invoice ' + esc(invoice.invoice_number || '—') + ' · ' + esc(invoice.plan_code || 'Plan') + '<br>' + esc(ownerControlMoney(invoice.amount_due,invoice.currency_code)) + ' · Due: ' + esc(ownerControlDate(invoice.due_at)) + '<br>' + (invoice.is_overdue ? '<span style="color:#ffaaa9">Overdue</span>' : esc(invoice.status || 'Pending')) + '</small></div><button type="button" data-owner-jump="wlDevBusinesses">Open workspaces</button></div>'
      ).join('') : '<div class="owner-empty">No unpaid subscription invoices.</div>';
    }
    const expiryHost = $('wlOwnerExpiryRows');
    if (expiryHost) {
      expiryHost.innerHTML = expiryWatch.length ? expiryWatch.map(item =>
        '<div class="owner-queue-row"><div><strong>' + esc(item.business_name || 'Customer workspace') + '</strong><small>' + esc(item.plan_code || 'Plan') + ' · ' + esc(item.status || 'Active') + '<br>' + (item.is_expired ? '<span style="color:#ffaaa9">Expired</span>' : 'Due') + ': ' + esc(ownerControlDate(item.expires_at)) + '</small></div><button type="button" data-owner-jump="wlDevBusinesses">Open workspace</button></div>'
      ).join('') : '<div class="owner-empty">No customer subscriptions expire within the next 7 days.</div>';
    }
    const updated = $('wlOwnerLastUpdated');
    if (updated) updated.textContent = 'Last refreshed: ' + ownerControlDate(data.generated_at || new Date().toISOString());
  }

  async function loadDeveloperDashboard() {
    const status = $('wlDevStatus');
    if (!session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    status.textContent = 'Checking developer authorization and loading platform data…';
    const { data, error } = await client.rpc('get_platform_dashboard');
    if (error) { status.textContent = 'Developer database setup required: ' + error.message; return; }
    window.__wlPlatformBusinesses = sortBusinessesByName(Array.isArray(data.businesses) ? data.businesses : []);
    populateDeveloperInviteBusinesses();
    populateDeveloperRoleForm();
    const maintenance = data.maintenance || {enabled:false};
    $('wlDevStats').textContent = 'Businesses: ' + data.business_count + ' · Suspended: ' + data.suspended_count + ' · Frozen: ' + Number(data.frozen_count || 0) + ' · Registered accounts: ' + data.user_count + ' · Platform mode: ' + (maintenance.enabled ? 'MAINTENANCE' : 'LIVE');
    window.__wlPlatformUserCount = Number(data.user_count || 0);
    await loadOwnerControlCentre();
    $('wlDevFreeze').textContent = maintenance.enabled ? 'Unfreeze platform' : 'Freeze platform';
    $('wlDevFreeze').className = maintenance.enabled ? '' : 'danger';
    $('wlDevBusinesses').innerHTML = (window.__wlPlatformBusinesses || []).map(b => {
      const ownerWorkspace = b.id === '50b69fb6-688c-4f28-8755-12cb5c34dc77';
      const subscription = [b.subscription_plan, b.subscription_status].filter(Boolean).join(' · ') || 'No subscription record';
      return `
      <div class="dev-row">
        <div style="min-width:0"><strong>${esc(b.name)}${ownerWorkspace ? ' · PLATFORM OWNER' : ''}</strong><div class="dev-meta">${esc(b.industry)} · Owner: ${esc(b.owner_email || 'Unknown')} · ${b.member_count} members</div><div class="dev-meta">${ownerWorkspace ? 'PROTECTED OWNER WORKSPACE' : (b.is_suspended ? 'SUSPENDED' : 'ACTIVE') + ' · ' + (b.is_frozen ? 'FROZEN' : 'UNFROZEN')} · ${esc(subscription)} · ${esc(b.id)}</div>${b.is_frozen && b.freeze_note ? '<div class="dev-meta">Freeze note: ' + esc(b.freeze_note) + '</div>' : ''}</div>
        <div class="dev-actions">${ownerWorkspace ? '<button disabled title="The platform owner workspace is protected">Protected</button>' : '<button data-dev-business="' + b.id + '" data-suspended="' + (b.is_suspended ? 'true':'false') + '">' + (b.is_suspended ? 'Restore' : 'Suspend') + '</button><button data-dev-freeze-business="' + b.id + '" data-frozen="' + (b.is_frozen ? 'true':'false') + '" class="' + (b.is_frozen ? '' : 'danger') + '">' + (b.is_frozen ? 'Unfreeze' : 'Freeze') + '</button>'}</div>
      </div>`;
    }).join('') || '<div class="dev-meta">No business workspaces have been created.</div>';
    $('wlDevBusinesses').querySelectorAll('[data-dev-business]').forEach(button => {
      button.onclick = async () => {
        const suspend = button.dataset.suspended !== 'true';
        if (!confirm((suspend ? 'Suspend' : 'Restore') + ' this customer business workspace?')) return;
        button.disabled = true;
        const result = await client.rpc('set_platform_business_suspension', {p_business_id:button.dataset.devBusiness,p_is_suspended:suspend});
        if (result.error) { status.textContent = result.error.message; button.disabled = false; return; }
        await loadDeveloperDashboard();
      };
    });
    $('wlDevBusinesses').querySelectorAll('[data-dev-freeze-business]').forEach(button => {
      button.onclick = async () => {
        const freeze = button.dataset.frozen !== 'true';
        let note = '';
        if (freeze) {
          note = prompt('Optional reason for freezing this customer workspace:', 'Temporary account review') || '';
          if (!confirm('Freeze this customer workspace? The customer will lose workspace access until you unfreeze it.')) return;
        } else if (!confirm('Unfreeze this customer workspace and restore normal workspace access?')) return;
        button.disabled = true;
        const result = await client.rpc('set_platform_business_freeze', {
          p_business_id:button.dataset.devFreezeBusiness,
          p_is_frozen:freeze,
          p_note:note
        });
        if (result.error) { status.textContent = result.error.message; button.disabled = false; return; }
        await loadDeveloperDashboard()
      };
    });
    status.textContent = 'Developer authorization verified by Supabase. Platform controls are available.';
    await loadDeveloperApprovals();
    await loadDeveloperAlertSettings();
    await loadDeveloperRegistrations();
    await loadDeveloperBusinessRegistrations();
    await loadDeveloperAccounts();
    await loadDeveloperRegistrationLimits();
    await loadDeveloperDeletionRequests()
    await loadDeveloperLeagues();
    await loadDeveloperLeagueAdmins();
  }
  async function loadDeveloperLeagues() {
    const host = $('wlDevLeagues');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading leagues…';
    const { data, error } = await client.rpc('get_platform_leagues');
    if (error) { host.textContent = 'Leagues unavailable: ' + error.message + '. Run migration 043 first.'; return; }
    const leagues = Array.isArray(data) ? data : [];
    window.__wlPlatformLeagues = leagues;
    const select = $('wlDevLeagueSelect');
    if (select) {
      const selected = select.value;
      select.innerHTML = '<option value="">Choose a league…</option>' +
        leagues.map(l => '<option value="' + esc(l.id) + '">' + esc(l.business_name) + ' — ' + esc(l.name) + (l.is_frozen ? ' (frozen)' : '') + '</option>').join('');
      if (leagues.some(l => l.id === selected)) select.value = selected;
    }
    host.innerHTML = leagues.map(l => `
      <div class="dev-row">
        <div style="min-width:0"><strong>${esc(l.name)}</strong><div class="dev-meta">${esc(l.business_name)} · ${esc(l.competition_type)} · ${l.admin_count} league admin(s)</div><div class="dev-meta">${l.is_frozen ? 'FROZEN' : esc((l.status||'active').toUpperCase())}${l.is_publicly_shared ? ' · Publicly shared' : ''}</div></div>
        <div class="dev-actions"><button data-dev-league="${esc(l.id)}" data-frozen="${l.is_frozen ? 'true':'false'}">${l.is_frozen ? 'Unfreeze':'Freeze'}</button></div>
      </div>`).join('') || '<div class="dev-meta">No leagues have been created yet.</div>';
    host.querySelectorAll('[data-dev-league]').forEach(button => {
      button.onclick = async () => {
        const freeze = button.dataset.frozen !== 'true';
        if (!confirm((freeze ? 'Freeze' : 'Unfreeze') + ' this league? ' + (freeze ? 'All seasons, clubs, players, fixtures, results, events and disciplinary records become read-only until unfrozen.' : 'Changes will be allowed again.'))) return;
        button.disabled = true;
        const result = await client.rpc('set_platform_league_freeze', { p_competition_id: button.dataset.devLeague, p_is_frozen: freeze });
        if (result.error) { host.textContent = result.error.message; button.disabled = false; return; }
        await loadDeveloperLeagues();
      };
    });
  }
  async function loadDeveloperLeagueAdmins() {
    const host = $('wlDevLeagueAdmins');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading league role assignments…';
    const { data, error } = await client.rpc('get_platform_league_admins');
    if (error) { host.textContent = 'League admins unavailable: ' + error.message + '. Run migration 043 first.'; return; }
    const admins = Array.isArray(data) ? data : [];
    host.innerHTML = admins.map(a => `
      <div class="dev-row">
        <div style="min-width:0"><strong>${esc(a.email || a.user_id)}</strong><div class="dev-meta">${esc(a.business_name)} · ${esc(a.league_name)} · ${esc(roleLabelForDev(a.role))}${a.club_name ? ' · ' + esc(a.club_name) : ''}</div><div class="dev-meta">${a.is_active ? 'ACTIVE' : 'INACTIVE'}</div></div>
        <div class="dev-actions"><button class="danger" data-dev-league-admin="${esc(a.id)}">Remove</button></div>
      </div>`).join('') || '<div class="dev-meta">No league admins or roles have been assigned yet.</div>';
    host.querySelectorAll('[data-dev-league-admin]').forEach(button => {
      button.onclick = async () => {
        if (!confirm('Remove this person\'s league role? They will lose access to manage that league immediately.')) return;
        button.disabled = true;
        const result = await client.rpc('remove_platform_league_admin', { p_member_id: button.dataset.devLeagueAdmin });
        if (result.error) { host.textContent = result.error.message; button.disabled = false; return; }
        await loadDeveloperLeagueAdmins();
        await loadDeveloperLeagues();
      };
    });
  }
  function roleLabelForDev(role) {
    return ({competition_admin:'League admin',club_manager:'Club manager',referee:'Referee',disciplinary_officer:'Disciplinary officer',viewer:'Viewer'})[role] || String(role||'').replaceAll('_',' ');
  }
  async function saveDeveloperLeagueAdmin() {
    const status = $('wlDevLeagueAssignStatus');
    const competitionId = $('wlDevLeagueSelect')?.value || '';
    const email = $('wlDevLeagueEmail')?.value.trim() || '';
    const role = $('wlDevLeagueRole')?.value || 'competition_admin';
    const isActive = $('wlDevLeagueActive')?.value === 'true';
    if (!competitionId) { if (status) status.textContent = 'Choose a league first.'; return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (status) status.textContent = 'Enter a valid account email.'; return; }
    const button = $('wlDevLeagueAssignSave');
    button.disabled = true;
    if (status) status.textContent = 'Saving league admin assignment…';
    const result = await client.rpc('set_platform_league_admin', {
      p_competition_id: competitionId, p_email: email, p_role: role, p_club_id: null, p_is_active: isActive
    });
    button.disabled = false;
    if (result.error) { if (status) status.textContent = result.error.message; return; }
    if (status) status.textContent = 'League role assigned/updated for ' + email + '.';
    $('wlDevLeagueEmail').value = '';
    await loadDeveloperLeagueAdmins();
    await loadDeveloperLeagues();
  }
  function populateDeveloperRoleForm() {
    const businessSelect = $('wlDevRoleBusiness');
    const accountSelect = $('wlDevRoleAccount');
    if (businessSelect) {
      const selected = businessSelect.value;
      const businesses = window.__wlPlatformBusinesses || [];
      businessSelect.innerHTML = '<option value="">Choose a business workspace…</option>' +
        businesses.map(b => '<option value="' + esc(b.id) + '">' + esc(b.name) + ' · ' + esc(b.owner_email || 'Owner unknown') + '</option>').join('');
      if (businesses.some(b => b.id === selected)) businessSelect.value = selected;
    }
    if (accountSelect) {
      const selected = accountSelect.value;
      const accounts = window.__wlPlatformAccounts || [];
      accountSelect.innerHTML = '<option value="">Choose a registered account…</option>' +
        accounts.map(a => '<option value="' + esc(a.email || '') + '">' + esc(a.full_name || a.email || 'Unnamed account') + ' · ' + esc(a.email || '') + (a.is_active === false ? ' · SUSPENDED' : '') + '</option>').join('');
      if (accounts.some(a => a.email === selected)) accountSelect.value = selected;
    }
  }
  async function saveDeveloperBusinessRole() {
    const businessId = $('wlDevRoleBusiness')?.value || '';
    const email = $('wlDevRoleAccount')?.value || '';
    const role = $('wlDevRoleValue')?.value || '';
    const isActive = $('wlDevRoleStatus')?.value === 'true';
    const status = $('wlDevRoleStatus');
    const allowed = ['admin','manager','cashier','storekeeper','accountant','viewer'];
    if (!businessId || !email || !allowed.includes(role)) {
      if (status) status.textContent = 'Select a business, registered user and valid role.';
      return;
    }
    const account = (window.__wlPlatformAccounts || []).find(a => a.email?.toLowerCase() === email.toLowerCase());
    if (!account) { if (status) status.textContent = 'Choose an account from the refreshed registered account list.'; return; }
    if (account.is_active === false && isActive) {
      if (status) status.textContent = 'This platform account is suspended. Restore the account first in Registered accounts.';
      return;
    }
    const button = $('wlDevRoleSave');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Saving business membership securely…';
    const {error} = await client.rpc('set_platform_member_access', {
      p_business_id:businessId,p_email:email.trim(),p_role:role,p_is_active:isActive
    });
    if (button) button.disabled = false;
    if (error) { if (status) status.textContent = 'Could not assign role: ' + error.message; return; }
    if (status) status.textContent = 'Role updated: ' + email + ' is now ' + role.toUpperCase() + ' for the selected business.';
    $('wlDevStatus').textContent = 'Business membership updated and recorded in the platform audit log.';
    await loadDeveloperDashboard();
  }
  function populateDeveloperRegistrationAccounts() {
    const select = $('wlDevRegistrationUser');
    if (!select) return;
    const selected = select.value;
    const accounts = (window.__wlPlatformAccounts || []).filter(a =>
      a.email && a.email.toLowerCase() !== 'koromaalhajiabu0@gmail.com'
    );
    select.innerHTML = '<option value="">Choose a registered account…</option>' +
      accounts.map(a => '<option value="' + esc(a.email) + '">' +
        esc(a.full_name || a.email) + ' · ' + esc(a.email) + '</option>').join('');
    if (accounts.some(a => a.email === selected)) select.value = selected;
  }

  async function loadDeveloperRegistrationLimits() {
    const host = $('wlDevRegistrationLimits');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading additional-business permissions…';
    const {data,error} = await client.rpc('get_platform_business_registration_limits');
    if (error) {
      host.textContent = 'Permission list unavailable: ' + error.message + '. Run migration 020 first.';
      return;
    }
    const limits = Array.isArray(data) ? data : [];
    window.__wlBusinessRegistrationLimits = limits;
    populateDeveloperRegistrationAccounts();
    host.innerHTML = limits.map(item =>
      '<div class="dev-row"><div style="min-width:0"><strong>' + esc(item.full_name || item.email) +
      '</strong><div class="dev-meta">' + esc(item.email) + '</div><div class="dev-meta">' +
      Number(item.business_count || 0) + ' owned business(es) · Limit: ' +
      Number(item.max_businesses) + '</div></div><div class="dev-actions">' +
      '<button class="danger" data-revoke-business-limit="' + esc(item.email) + '">Revoke exception</button></div></div>'
    ).join('') || '<div class="dev-meta">No users currently have additional-business permission. All ordinary users are limited to one business.</div>';
    host.querySelectorAll('[data-revoke-business-limit]').forEach(button => {
      button.onclick = async () => {
        const email = button.dataset.revokeBusinessLimit;
        if (!confirm('Revoke the additional-business permission for ' + email + '? Their limit will return to one business. Existing businesses will remain unchanged.')) return;
        button.disabled = true;
        const {data,error} = await client.rpc('set_platform_business_registration_limit', {
          p_email: email,
          p_max_businesses: 1
        });
        if (error) {
          $('wlDevRegistrationLimitStatus').textContent = 'Could not revoke permission: ' + error.message;
          button.disabled = false;
          return;
        }
        $('wlDevRegistrationLimitStatus').textContent = 'Additional-business permission revoked for ' + email + '. Existing businesses were preserved.';
        await loadDeveloperRegistrationLimits();
      };
    });
  }

  async function saveDeveloperRegistrationLimit() {
    const email = $('wlDevRegistrationUser')?.value || '';
    const max = Number($('wlDevRegistrationMax')?.value);
    const status = $('wlDevRegistrationLimitStatus');
    const button = $('wlDevRegistrationLimitSave');
    if (!email) { status.textContent = 'Choose a registered account first.'; return; }
    if (!Number.isInteger(max) || max < 2 || max > 1000) {
      status.textContent = 'Enter a whole-number limit between 2 and 1000.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Saving permission securely…';
    const {data,error} = await client.rpc('set_platform_business_registration_limit', {
      p_email: email,
      p_max_businesses: max
    });
    button.disabled = false;
    if (error) { status.textContent = 'Could not save permission: ' + error.message; return; }
    status.textContent = 'Permission granted to ' + email + '. Maximum owned businesses: ' + max +
      '. Existing businesses: ' + Number(data?.existing_owned_businesses || 0) + '.';
    await loadDeveloperRegistrationLimits();
    await loadDeveloperAccounts();
  }

  async function loadDeveloperAlertSettings() {
    const host = $('wlDevAlertStatus');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading alert settings…';
    const {data,error} = await client.rpc('get_platform_alert_settings');
    if (error) { host.textContent = 'Alert settings unavailable: ' + error.message + '. Run migration 032 first.'; return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      $('wlDevAlertEmail').value = row.alert_email || '';
      $('wlDevAlertEnabled').value = row.alerts_enabled === false ? 'false' : 'true';
    }
    host.textContent = 'Alerts are sent by email whenever someone creates a new account or submits a payment. Make sure a Resend API key has been added (ask your assistant for the one-time setup steps if you have not done this yet).';
  }

  async function saveDeveloperAlertSettings() {
    const host = $('wlDevAlertStatus');
    if (!session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    const email = ($('wlDevAlertEmail').value || '').trim();
    const enabled = $('wlDevAlertEnabled').value === 'true';
    if (!email || !email.includes('@')) { host.textContent = 'Enter a valid email address first.'; return; }
    host.textContent = 'Saving…';
    const {error} = await client.rpc('set_platform_alert_settings', {p_alert_email:email, p_alerts_enabled:enabled});
    if (error) { host.textContent = 'Could not save: ' + error.message; return; }
    host.textContent = 'Saved. Alerts will be sent to ' + email + (enabled ? '.' : ', but are currently paused.');
  }

  async function loadDeveloperRegistrations() {
    const host = $('wlDevRegistrations');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading new registrations…';
    const {data,error} = await client.rpc('get_platform_registrations', {p_limit:200});
    if (error) {
      host.textContent = 'Registration notifications unavailable: ' + error.message + '. Run migration 028 first.';
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const unseen = rows.filter(x => !x.viewed_at).length;
    host.innerHTML = '<div class="dev-meta" style="margin:7px 0 10px">' +
      rows.length + ' registered account(s) · ' + unseen + ' not yet reviewed</div>' +
      rows.map(x => {
        const when = x.registered_at ? new Date(x.registered_at).toLocaleString() : 'Time unavailable';
        return '<div class="dev-row"><div style="min-width:0"><strong>' +
          esc(x.full_name || 'New customer') + '</strong><div class="dev-meta">' +
          esc(x.email || '') + '</div><div class="dev-meta">Registered: ' + esc(when) +
          ' · ' + (x.email_confirmed_at ? 'Email verified' : 'Email not verified') +
          (x.viewed_at ? ' · Reviewed' : ' · NEW REGISTRATION') +
          '</div></div></div>';
      }).join('') || '<div class="dev-meta">No registrations have been recorded yet.</div>';
    if (unseen) {
      const marked = await client.rpc('mark_platform_registrations_viewed');
      if (marked.error) host.insertAdjacentHTML('beforeend',
        '<div class="dev-meta">Could not mark notifications as reviewed: ' + esc(marked.error.message) + '</div>');
    }
  }

  async function loadDeveloperBusinessRegistrations() {
    const host = $('wlDevBusinessRegistrations');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading new business registrations…';
    const {data,error} = await client.rpc('get_platform_business_registrations', {p_limit:200});
    if (error) {
      host.textContent = 'Business registration notifications unavailable: ' + error.message + '. Run migration 029 first.';
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    const unseen = rows.filter(x => !x.viewed_at).length;
    host.innerHTML = '<div class="dev-meta" style="margin:7px 0 10px">' +
      rows.length + ' business workspace(s) recorded · ' + unseen + ' not yet reviewed</div>' +
      rows.map(x => {
        const when = x.registered_at ? new Date(x.registered_at).toLocaleString() : 'Time unavailable';
        return '<div class="dev-row"><div style="min-width:0"><strong>' +
          esc(x.business_name || 'Unnamed business') + '</strong><div class="dev-meta">' +
          esc(x.industry || 'Industry not specified') + '</div><div class="dev-meta">Owner: ' +
          esc(x.owner_email || 'Email unavailable') + '</div><div class="dev-meta">Created: ' +
          esc(when) + (x.viewed_at ? ' · Reviewed' : ' · NEW BUSINESS') +
          '</div><div class="dev-meta">Business ID: ' + esc(x.business_id || '') +
          '</div></div></div>';
      }).join('') || '<div class="dev-meta">No business workspaces have been registered yet.</div>';
    if (unseen) {
      const marked = await client.rpc('mark_platform_business_registrations_viewed');
      if (marked.error) host.insertAdjacentHTML('beforeend',
        '<div class="dev-meta">Could not mark business notifications as reviewed: ' + esc(marked.error.message) + '</div>');
    }
  }

  function populateDeveloperInviteBusinesses() {
    const select = $('wlDevInviteBusiness');
    if (!select) return;
    const current = select.value;
    const businesses = sortBusinessesByName(window.__wlPlatformBusinesses || []);
    select.innerHTML = '<option value="">Choose a business workspace…</option>' + businesses.map(b => '<option value="' + esc(b.id) + '">' + esc(b.name) + ' · ' + esc(b.owner_email || 'Owner unknown') + '</option>').join('');
    if (businesses.some(b => b.id === current)) select.value = current;
  }

  async function inviteDeveloperAccount() {
    const name = $('wlDevInviteName')?.value.trim() || '';
    const email = $('wlDevInviteEmail')?.value.trim().toLowerCase() || '';
    const businessId = $('wlDevInviteBusiness')?.value || '';
    const role = $('wlDevInviteRole')?.value || 'admin';
    const status = $('wlDevInviteStatus');
    const button = $('wlDevInviteSubmit');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !businessId) { if (status) status.textContent = 'Enter a full name, valid email and business workspace.'; return; }
    if (!confirm('Invite ' + name + ' (' + email + ') as ' + role.toUpperCase() + ' for the selected business?')) return;
    button.disabled = true; if (status) status.textContent = 'Sending secure invitation…';
    try {
      const {data,error} = await client.functions.invoke('manage-platform-accounts',{body:{action:'invite',email,full_name:name,business_id:businessId,role}});
      if (error) throw error; if (!data?.ok) throw new Error(data?.error || 'Invitation was not completed.');
      if (status) status.textContent = data.message || 'Invitation sent. Ask the administrator to check their email.';
      $('wlDevInviteName').value = ''; $('wlDevInviteEmail').value = '';
      await loadDeveloperAccounts()
    } catch (error) { if (status) status.textContent = 'Invitation failed: ' + (error.message || 'Unknown error') + '. Confirm the manage-platform-accounts Edge Function is deployed.'; }
    finally { button.disabled = false; }
  }

  async function loadDeveloperAccounts() {
    const host = $('wlDevAccounts');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading registered accounts…';
    const {data,error} = await client.rpc('get_platform_accounts');
    if (error) { host.textContent = 'Account directory unavailable: ' + error.message + '. Run migration 006 first.'; return; }
    const accounts = Array.isArray(data) ? data : [];
    window.__wlPlatformAccounts = accounts;
    populateDeveloperRoleForm();
    populateDeveloperRegistrationAccounts();
    host.innerHTML = accounts.map(a => {
      const active = a.is_active !== false;
      const name = a.full_name || 'Name not provided';
      const last = a.last_sign_in_at ? new Date(a.last_sign_in_at).toLocaleString() : 'Never signed in';
      const protectedAccount = a.email?.toLowerCase() === 'koromaalhajiabu0@gmail.com';
      return '<div class="dev-row"><div style="min-width:0"><strong>' + esc(name) + '</strong><div class="dev-meta">' + esc(a.email || '') + '</div><div class="dev-meta">' + (active ? 'ACTIVE' : 'SUSPENDED') + ' · ' + (a.email_confirmed ? 'Email verified' : 'Email not verified') + ' · ' + Number(a.business_count || 0) + ' workspaces</div><div class="dev-meta">Last sign-in: ' + esc(last) + '</div></div><div class="dev-actions">' + (!protectedAccount ? '<button data-account-edit="' + esc(a.user_id) + '" data-account-name="' + esc(name) + '" data-account-email="' + esc(a.email || '') + '">Edit profile</button>' : '') + '<button data-account-user="' + esc(a.user_id) + '" data-account-active="' + (active ? 'true':'false') + '" ' + (protectedAccount ? 'disabled' : '') + '>' + (active ? 'Suspend access' : 'Restore access') + '</button>' + (!protectedAccount ? '<button class="danger" data-account-delete="' + esc(a.user_id) + '" data-account-email="' + esc(a.email || '') + '">Request deletion</button>' : '') + '</div></div>';
    }).join('') || '<div class="dev-meta">No registered accounts found.</div>';
    host.querySelectorAll('[data-account-edit]').forEach(button => {
      button.onclick = async () => {
        const userId = button.dataset.accountEdit;
        const oldName = button.dataset.accountName || '';
        const oldEmail = button.dataset.accountEmail || '';
        const fullName = prompt('Edit account full name:', oldName); if (fullName === null) return;
        const email = prompt('Edit account email address. A new address requires email confirmation:', oldEmail); if (email === null) return;
        if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { say('Enter a valid full name and email. No changes were made.'); return; }
        if (!confirm('Save profile changes for ' + oldEmail + '? A changed email must be confirmed by the new address.')) return;
        button.disabled = true;
        const {data,error} = await client.functions.invoke('manage-platform-accounts',{body:{action:'update_profile',user_id:userId,full_name:fullName.trim(),email:email.trim().toLowerCase()}});
        if (error || !data?.ok) { say('Profile update failed: ' + (error?.message || data?.error || 'Unknown error')); button.disabled = false; return; }
        say(data.message || 'Account profile updated.'); await loadDeveloperAccounts()
      };
    });
    host.querySelectorAll('[data-account-delete]').forEach(button => {
      button.onclick = async () => {
        const email = button.dataset.accountEmail || '';
        const confirmation = prompt('This will suspend the account immediately and start a 30-day recovery period. Type the exact account email to confirm:', '');
        if (confirmation === null) return;
        if (confirmation.trim().toLowerCase() !== email.toLowerCase()) { say('Email confirmation did not match. No deletion request was created.'); return; }
        if (!confirm('Confirm deletion request for ' + email + '? The account remains recoverable for 30 days.')) return;
        button.disabled = true;
        const result = await client.rpc('request_platform_account_deletion', {
          p_user_id:button.dataset.accountDelete,p_confirm_email:confirmation.trim()
        });
        if (result.error) { say(result.error.message); button.disabled = false; return; }
        say('Deletion request created. Access suspended; 30-day recovery period started.');
        await loadDeveloperAccounts();
        await loadDeveloperDeletionRequests();
      };
    });
    host.querySelectorAll('[data-account-user]').forEach(button => {
      button.onclick = async () => {
        const suspend = button.dataset.accountActive === 'true';
        if (!confirm((suspend ? 'Suspend this account across all business workspaces?' : 'Restore this account access across business workspaces?') + ' Existing records will be preserved.')) return;
        button.disabled = true;
        const result = await client.rpc('set_platform_account_access', {
          p_user_id:button.dataset.accountUser,
          p_is_active:!suspend,
          p_note:''
        });
        if (result.error) { $('wlDevStatus').textContent = result.error.message; button.disabled = false; return; }
        $('wlDevStatus').textContent = suspend ? 'Account access suspended. Existing data preserved.' : 'Account access restored.';
        await loadDeveloperAccounts();
      };
    });
  }

  async function loadDeveloperDeletionRequests() {
    const host = $('wlDevDeletions');
    if (!host || !session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') return;
    host.textContent = 'Loading deletion requests…';
    const {data,error} = await client.rpc('get_platform_account_deletion_requests');
    if (error) { host.textContent = 'Deletion workflow unavailable: ' + error.message + '. Run migration 008 first.'; return; }
    const requests = Array.isArray(data) ? data : [];
    const pendingUsers = new Set(requests.filter(d => d.status === 'pending').map(d => d.target_user_id));
    document.querySelectorAll('#wlDevAccounts [data-account-user]').forEach(button => {
      if (pendingUsers.has(button.dataset.accountUser) && button.dataset.accountActive === 'false') {
        button.disabled = true;
        button.title = 'Cancel the pending deletion request before restoring access';
      }
    });
    host.innerHTML = requests.map(d => {
      const due = d.scheduled_for ? new Date(d.scheduled_for) : null;
      const remaining = due ? Math.max(0,Math.ceil((due.getTime()-Date.now())/86400000)) : 0;
      const pending = d.status === 'pending';
      const dueLabel = due ? due.toLocaleString() : 'Unknown';
      return '<div class="dev-row"><div style="min-width:0"><strong>' + esc(d.target_email) + '</strong><div class="dev-meta">' + esc(d.status.toUpperCase()) + ' · ' + (pending && remaining > 0 ? remaining + ' days remaining' : pending ? 'Eligible for permanent deletion' : 'Closed') + '</div><div class="dev-meta">Scheduled: ' + esc(dueLabel) + '</div><div class="dev-meta">Request: ' + esc(d.id) + '</div>' + (d.failure_note ? '<div class="dev-meta">Note: ' + esc(d.failure_note) + '</div>' : '') + '</div><div class="dev-actions">' + (pending && remaining > 0 ? '<button data-cancel-deletion="' + esc(d.id) + '">Cancel &amp; restore</button>' : '') + (pending && remaining <= 0 ? '<button class="danger" data-process-deletion="' + esc(d.id) + '">Permanently delete</button>' : '') + '</div></div>';
    }).join('') || '<div class="dev-meta">No account deletion requests.</div>';
    host.querySelectorAll('[data-cancel-deletion]').forEach(button => {
      button.onclick = async () => {
        if (!confirm('Cancel this deletion request and restore the account to its previous access state?')) return;
        button.disabled = true;
        const result = await client.rpc('cancel_platform_account_deletion',{p_request_id:button.dataset.cancelDeletion});
        if (result.error) { say(result.error.message); button.disabled = false; return; }
        say('Deletion request cancelled. Previous account access state restored.');
        await loadDeveloperAccounts(); await loadDeveloperDeletionRequests();
      };
    });
    host.querySelectorAll('[data-process-deletion]').forEach(button => {
      button.onclick = async () => {
        const requestId = button.dataset.processDeletion;
        if (!confirm('PERMANENTLY DELETE this account from Supabase Auth? The 30-day recovery period has ended. This cannot be undone. Business-owner accounts are blocked.')) return;
        button.disabled = true; button.textContent = 'Processing…';
        const {data,error} = await client.functions.invoke('process-account-deletions',{body:{request_id:requestId}});
        if (error) { say('Secure deletion function error: ' + error.message + '. Confirm the Edge Function is deployed.'); button.disabled = false; button.textContent = 'Permanently delete'; return; }
        say(data?.message || 'Deletion function completed.');
        await loadDeveloperAccounts(); await loadDeveloperDeletionRequests()
      };
    });
  }
  async function clearLocalBusinessData() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('whiteLionSME', 3);
      request.onerror = () => reject(request.error || new Error('Could not open local business database.'));
      request.onsuccess = () => {
        const database = request.result;
        const names = ['products','sales','purchases','returns','customers','suppliers','expenses','employees','branchInventory','settings'];
        const available = names.filter(name => database.objectStoreNames.contains(name));
        if (!available.length) { database.close(); resolve(); return; }
        const tx = database.transaction(available, 'readwrite');
        available.forEach(name => tx.objectStore(name).clear());
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { const error = tx.error || new Error('Could not clear local business records.'); database.close(); reject(error); };
        tx.onabort = () => { const error = tx.error || new Error('Local data reset was cancelled.'); database.close(); reject(error); };
      };
    });
  }

  async function resetDeveloperBusinessData() {
    if (!session || session.user.email?.toLowerCase() !== 'koromaalhajiabu0@gmail.com') {
      return say('Only the registered private developer account can reset business data.');
    }
    const confirmation = prompt(
      'This permanently deletes ALL business workspaces and cloud business records, and clears this device’s local business records. Your developer login and platform audit history are preserved. Other accounts will be disabled and queued for deletion after 30 days.\n\nType RESET KOROMA LEONE to continue:',
      ''
    );
    if (confirmation !== 'RESET KOROMA LEONE') return say('Reset cancelled. No records were changed.');
    const button = $('wlDevResetData');
    button.disabled = true;
    button.textContent = 'Resetting business data…';
    try {
      const {data,error} = await client.rpc('reset_platform_business_data');
      if (error) throw new Error(error.message);
      await clearLocalBusinessData();
      activeBusiness = null;
      selectedBranch = null;
      window.__wlBusinesses = [];
      await loadBusinesses();
      $('wlDevStatus').textContent = 'Business reset completed. Developer login preserved. Deleted workspaces: ' + Number(data?.deleted_business_workspaces || 0) + '. Other accounts queued for 30-day deletion: ' + Number(data?.accounts_queued_for_30_day_deletion || 0) + '.';
      say('Business records cleared. Your developer account remains signed in.');
    } catch (error) {
      $('wlDevStatus').textContent = 'Reset incomplete: ' + error.message + '. Do not sync old local records; contact the developer console before continuing.';
      say('Reset did not complete: ' + error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Reset all business data';
    }
  }

  async function toggleMaintenance() {
    const dashboard = await client.rpc('get_platform_dashboard');
    if (dashboard.error) { $('wlDevStatus').textContent = dashboard.error.message; return; }
    const current = !!dashboard.data.maintenance?.enabled;
    const next = !current;
    const message = next ? (prompt('Maintenance notice shown to users:', 'The platform is temporarily undergoing maintenance.') || 'The platform is temporarily undergoing maintenance.') : 'The platform is operational.';
    if (!confirm(next ? 'Enable platform maintenance mode?' : 'Disable maintenance mode and restore normal operation?')) return;
    const result = await client.rpc('set_platform_maintenance', {p_enabled:next,p_message:message});
    if (result.error) { $('wlDevStatus').textContent = result.error.message; return; }
    await loadDeveloperDashboard();
  }
  async function manageBusinessAccess() {
    const businesses = window.__wlBusinesses || [];
    const businessId = prompt('Enter the business ID to manage (copy it from the developer list):');
    if (!businessId) return;
    const email = prompt('Enter the registered user email:');
    if (!email) return;
    const role = (prompt('Role: admin, manager, cashier, storekeeper, accountant, viewer', 'manager') || '').toLowerCase();
    const allowed = ['admin','manager','cashier','storekeeper','accountant','viewer'];
    if (!allowed.includes(role)) { $('wlDevStatus').textContent = 'Invalid role selected.'; return; }
    const active = confirm('Keep this member active? Choose Cancel to deactivate access.');
    const result = await client.rpc('set_platform_member_access', {
      p_business_id:businessId.trim(),p_email:email.trim(),p_role:role,p_is_active:active
    });
    if (result.error) { $('wlDevStatus').textContent = result.error.message; return; }
    $('wlDevStatus').textContent = 'Business membership updated and audited.';
    await loadDeveloperDashboard();
  }
  const WL_INDUSTRY_GROUPS = [
    {label:"Retail and trading", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting"], items:["Supermarket","Mini-market","Grocery shop","Provision store","Wholesale shop","Retail store","Boutique / clothing shop","Shoe shop","Electronics shop","Mobile phone shop","Computer and accessories shop","Furniture shop","Building materials shop","Hardware store","Paint shop","Electrical supply shop","Plumbing supply shop","Automotive spare-parts shop","Agricultural supply shop","Stationery and bookshop"]},
    {label:"Food, hospitality and entertainment", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting","restaurant","appointments"], items:["Restaurant","Fast-food outlet","Cafeteria","Bakery","Pastry shop","Bar or lounge","Hotel","Guesthouse","Lodge","Catering business","Ice cream or beverage shop","Event and entertainment business"]},
    {label:"Hospitals and healthcare facilities", modules:["hospital","healthcare","pharmacy","appointments","employees","accounting","compliance"], items:["Hospital / General Hospital","Specialist Hospital","Clinic / Health Centre","Medical Centre","Diagnostic / Laboratory Centre","Maternity Clinic","Dental Clinic"]},
    {label:"Healthcare and pharmaceutical", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting","pharmacy","healthcare","compliance"], items:["Pharmacy","Medical supply store","Medical equipment supplier","Optical shop","Dental supply business","Healthcare product retailer"]},
    {label:"Automotive and transport", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting","transport","fleet","services"], items:["Fuel station","Car dealership","Vehicle spare-parts dealer","Auto repair workshop","Tyre shop","Car wash business","Vehicle rental company","Transport and logistics company","Delivery business"]},
    {label:"Construction and industrial", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting","manufacturing","projects"], items:["Construction company","Building contractor","Hardware wholesaler","Cement distributor","Sand and gravel supplier","Steel and iron merchant","Furniture manufacturer","Manufacturing company","Industrial equipment supplier","Welding and fabrication workshop"]},
    {label:"Professional and personal services", modules:["sales_pos","customers","suppliers","expenses","employees","accounting","services","appointments","projects"], items:["Hair salon","Barbershop","Beauty salon","Spa","Laundry and dry-cleaning business","Cleaning company","Security service company","Repair and maintenance company","Computer repair shop","Printing business","Photography studio","Consultancy firm","Marketing and advertising agency"]},
    {label:"Education and training", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","employees","accounting","school"], items:["School management system","Training centre","Vocational institution","Computer training centre","Driving school","Educational supply shop","Bookshop and learning-material distributor"]},
    {label:"Agriculture and fisheries", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","accounting","manufacturing"], items:["Farm business","Poultry farm","Livestock business","Fish farm","Fishing supply business","Agricultural produce wholesaler","Food processing business"]},
    {label:"Property and rental", modules:["customers","suppliers","expenses","accounting","property","projects","services"], items:["Real estate agency","Property management company","Equipment rental business","Vehicle hire business","Event equipment rental company","Property maintenance company"]},
    {label:"Financial and administrative services", modules:["customers","expenses","employees","accounting","compliance","services"], items:["Accounting and bookkeeping firm","Insurance agency","Microfinance business","Cooperative society","Business administration service provider"]},
    {label:"Sports and local league management", modules:["sports_league","expenses","employees","accounting","customers","suppliers"], items:["Sports club / football club","Sports academy","Local / community league organiser","League / competition organiser","Sports association / federation","Football Association / Federation","Football federation / national association","Sports event organiser"]},
    {label:"General and multi-industry", modules:["sales_pos","inventory","purchasing","customers","suppliers","expenses","employees","accounting","services","projects"], items:["General business","Multi-industry business","Other / not listed"]}
  ];

  function showBusinessSetupDialog() {
    return new Promise(resolve => {
      const existing = document.getElementById('wlIndustrySetupModal');
      if (existing) existing.remove();
      const modal = document.createElement('div');
      modal.id = 'wlIndustrySetupModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(7,17,32,.72);display:flex;align-items:center;justify-content:center;padding:14px;font-family:inherit';
      const allBusinessTypes = [...new Set(WL_INDUSTRY_GROUPS.flatMap(group => group.items))]
        .sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base', numeric:true}));
      const groups = '<optgroup label="All business types — A to Z">' +
        allBusinessTypes.map(item => '<option value="' + esc(item) + '">' + esc(item) + '</option>').join('') +
        '</optgroup>';
      modal.innerHTML = '<form id="wlIndustrySetupForm" style="width:min(520px,100%);max-height:92vh;overflow:auto;background:#fff;color:#17243a;border-radius:18px;padding:22px;box-shadow:0 25px 80px #0005">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:5px"><h2 style="margin:0;font-size:19px">Register a business</h2><button type="button" id="wlIndustrySetupClose" aria-label="Close" style="border:0;border-radius:8px;padding:7px 11px;background:#eef1f5;font-size:18px">×</button></div>' +
        '<p style="margin:0 0 16px;color:#748197;font-size:12px">Choose the business type. Koroma Leone SME will activate the recommended modules for this workspace.</p>' +
        '<label style="display:block;font-size:11px;font-weight:700;margin:12px 0 6px">Business / organisation name</label><input id="wlIndustryBusinessName" required minlength="2" maxlength="120" placeholder="Enter business name" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #dfe5ee;border-radius:10px">' +
        '<label style="display:block;font-size:11px;font-weight:700;margin:14px 0 6px">Industry / business type</label><select id="wlIndustryBusinessType" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #dfe5ee;border-radius:10px;background:#fff">' + groups + '</select>' +
        '<label style="display:block;font-size:11px;font-weight:700;margin:14px 0 6px">Default currency code</label><input id="wlIndustryCurrency" required maxlength="3" value="SLE" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #dfe5ee;border-radius:10px;text-transform:uppercase">' +
        '<div id="wlIndustryModulePreview" style="margin-top:13px;padding:11px;border-radius:10px;background:#f5f7fa;color:#65738a;font-size:11px;line-height:1.6"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" id="wlIndustrySetupCancel" style="border:1px solid #dfe5ee;background:#fff;border-radius:9px;padding:10px 14px">Cancel</button><button type="submit" style="border:0;background:#14243d;color:#fff;border-radius:9px;padding:10px 16px;font-weight:700">Create workspace</button></div></form>';
      document.body.appendChild(modal);
      const form = modal.querySelector('#wlIndustrySetupForm');
      const type = modal.querySelector('#wlIndustryBusinessType');
      const preview = modal.querySelector('#wlIndustryModulePreview');
      const updatePreview = () => {
        const group = WL_INDUSTRY_GROUPS.find(g => g.items.includes(type.value));
        const modules = window.KLTBusinessModuleProfiles?.modulesFor(group?.label, type.value) || ['core', ...(group?.modules || [])];
        preview.innerHTML = '<strong>Recommended modules</strong><br>' + modules.map(esc).join(' · ') +
          '<br><span style="color:#8a6d36">The workspace menu and overview will be tailored to these modules.</span>';
      };
      const close = value => { modal.remove(); resolve(value); };
      type.addEventListener('change', updatePreview);
      updatePreview();
      modal.querySelector('#wlIndustrySetupClose').onclick = () => close(null);
      modal.querySelector('#wlIndustrySetupCancel').onclick = () => close(null);
      modal.addEventListener('click', e => { if (e.target === modal) close(null); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const group = WL_INDUSTRY_GROUPS.find(g => g.items.includes(type.value));
        close({
          name: modal.querySelector('#wlIndustryBusinessName').value.trim(),
          industry: type.value,
          currency: modal.querySelector('#wlIndustryCurrency').value.trim().toUpperCase(),
          modules: window.KLTBusinessModuleProfiles?.modulesFor(group?.label, type.value) || ['core', ...(group?.modules || [])]
        });
      });
      modal.querySelector('#wlIndustryBusinessName').focus();
    });
  }

  async function createBusiness() {
    const setup = await showBusinessSetupDialog();
    if (!setup) return;
    if (setup.name.length < 2 || !/^[A-Z]{3}$/.test(setup.currency)) {
      return say('Enter a business name and a valid three-letter currency code.');
    }
    say('Creating business workspace…');
    const { data, error } = await client.rpc('create_business', {
      p_name: setup.name, p_industry: setup.industry, p_currency_code: setup.currency
    });
    if (error) return say('Could not create workspace: ' + error.message);
    if (typeof window.whiteLionLinkPlatformReferral === 'function') {
      window.whiteLionLinkPlatformReferral(data).catch(() => {});
    }
    const { data: subscription, error: subscriptionError } = await client.from('business_subscriptions')
      .select('status,trial_ends_at')
      .eq('business_id', data)
      .maybeSingle();
    const { error: moduleError } = await client.from('business_industry_modules')
      .update({ is_enabled: true })
      .eq('business_id', data)
      .in('module_key', setup.modules);
    await loadBusinesses();
    const created = (window.__wlBusinesses || []).find(b => b.id === data);
    if (created) await selectBusiness(created);
    if (moduleError) {
      say('Workspace created, but industry modules could not be activated: ' + moduleError.message + '. Ask the developer to verify the module permissions.');
      return;
    }
    const subscriptionNotice = subscriptionError
      ? 'Check Plans & Billing to confirm the subscription status.'
      : subscription?.status === 'trial'
        ? 'Your one-time 7-day Professional trial has started.'
        : 'This account has already used its free trial. Open Plans & Billing and request an invoice to activate this additional workspace.';
    say('Business workspace created. ' + setup.modules.length + ' industry modules activated. ' + subscriptionNotice);
  }

  function syncStatus(message) {
    const el = $('wlSyncStatus');
    if (el) el.textContent = message;
  }
  async function diagnoseData() {
    const button = $('wlDiagnoseData');
    const output = $('wlDataDiagnostic');
    if (button) { button.disabled = true; button.textContent = 'Checking…'; }
    if (output) output.textContent = 'Checking local device records and this signed-in account’s cloud workspace. No records will be changed.';
    try {
      const stores = ['products','sales','purchases','returns','customers','suppliers','expenses','employees','branchInventory'];
      const localCounts = {};
      const localIds = new Set();
      for (const store of stores) {
        try {
          const rows = await all(store);
          localCounts[store] = rows.length;
          rows.forEach(row => {
            if (row.localBusinessId) localIds.add(String(row.localBusinessId));
            if (row.cloudSyncedFor) localIds.add(String(row.cloudSyncedFor));
          });
        } catch (error) {
          localCounts[store] = 'unavailable';
        }
      }
      let cloudSummary = 'Not signed in; cloud membership check skipped.';
      if (client && session?.user?.id) {
        const { data, error } = await client.from('business_members')
          .select('business_id,role,is_active,businesses(id,name)')
          .eq('user_id', session.user.id);
        if (error) {
          cloudSummary = 'Cloud membership check failed: ' + error.message;
        } else {
          const memberships = (data || []).filter(row => row.businesses?.id);
          cloudSummary = memberships.length
            ? memberships.map(row => (row.businesses.name || 'Unnamed business') + ' (' + row.role + (row.is_active ? ', active' : ', inactive') + ')').join('; ')
            : 'No business memberships found for this signed-in account.';
        }
      }
      const localTotal = Object.values(localCounts).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
      const detail = stores.map(name => name + ': ' + localCounts[name]).join(' · ');
      const identity = activeBusiness ? 'Selected workspace: ' + activeBusiness.name + ' (' + activeBusiness.id + ').' : 'No active business workspace selected.';
      const ids = localIds.size ? 'Business IDs attached to local records: ' + Array.from(localIds).join(', ') + '.' : 'No business IDs are attached to the inspected local records.';
      const report = 'READ-ONLY DIAGNOSTIC — Local records found: ' + localTotal + '. ' + detail + '. Cloud: ' + cloudSummary + ' ' + identity + ' ' + ids + ' Nothing was uploaded, deleted or modified.';
      if (output) output.textContent = report;
      say('Diagnostic complete. Review the local/cloud data report below the workspace buttons.');
    } catch (error) {
      if (output) output.textContent = 'Diagnostic could not complete: ' + (error.message || String(error)) + '. No records were changed.';
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Check local/cloud data'; }
    }
  }

  function syncOwner(row) {
    return row?.localBusinessId || row?.businessId || row?.business_id || row?.cloudSyncedFor || null;
  }
  function syncSafe(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function syncHistoryKey() {
    return activeBusiness?.id ? 'wl_sync_history:' + activeBusiness.id : null;
  }
  async function loadSyncPreferences() {
    if (!activeBusiness) return;
    try { autoSyncEnabled = (await setting('wl_auto_sync:' + activeBusiness.id)) === true; }
    catch (_) { autoSyncEnabled = false; }
    const toggle = $('wlAutoSyncToggle');
    if (toggle) toggle.checked = autoSyncEnabled;
    const connection = $('wlSyncConnection');
    if (connection) connection.textContent = navigator.onLine === false ? 'Offline' : 'Online';
  }
  async function readSyncHistory() {
    const key = syncHistoryKey();
    if (!key) return [];
    try {
      const rows = await setting(key);
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }
  async function recordSyncHistory(entry) {
    const key = syncHistoryKey();
    if (!key) return;
    try {
      const rows = await readSyncHistory();
      rows.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        at: new Date().toISOString(),
        mode: entry.mode || 'system',
        status: entry.status || 'info',
        message: String(entry.message || '').slice(0, 260),
        counts: entry.counts || null
      });
      await setting(key, rows.slice(0, 40));
      await renderSyncHistory();
    } catch (_) {}
  }
  async function renderSyncHistory() {
    const host = $('wlSyncHistory');
    if (!host) return;
    const rows = await readSyncHistory();
    host.innerHTML = rows.length ? rows.slice(0, 12).map(row => {
      const when = row.at ? new Date(row.at).toLocaleString() : 'Time unavailable';
      const counts = row.counts ? ' · ' + Object.entries(row.counts).map(([name,value]) => name + ': ' + value).join(', ') : '';
      return '<li><strong>' + syncSafe(String(row.status || 'event').toUpperCase()) + '</strong> · ' +
        syncSafe(row.mode || 'system') + ' · ' + syncSafe(when) + '<br>' +
        syncSafe(row.message || 'Sync event') + syncSafe(counts) + '</li>';
    }).join('') : '<li class="wl-sync-empty">No sync activity recorded on this device yet.</li>';
  }
  async function renderSyncConflicts() {
    const host = $('wlSyncConflicts');
    if (!host || !activeBusiness) return 0;
    const types = ['products','customers','suppliers','expenses'];
    const found = [];
    for (const type of types) {
      const rows = await all(type);
      for (const row of rows) {
        if (row.cloudConflictSnapshot && (row.localBusinessId === activeBusiness.id || row.cloudSyncedFor === activeBusiness.id)) {
          found.push({type,row});
        }
      }
    }
    host.innerHTML = found.length ? found.map(item => {
      const fields = item.row.cloudConflictSnapshot.fields || {};
      const preview = Object.entries(fields).slice(0, 4).map(([key,value]) => key + ': device ' + String(item.row[key] ?? '—') + ' / cloud ' + String(value ?? '—')).join(' · ');
      const label = item.row.name || item.row.description || item.row.category || item.row.id;
      const keepLocalAction = item.type === 'expenses'
        ? '<span class="wl-sync-empty">Expense changes must follow this business\'s approval rules; only the cloud copy can be applied here.</span>'
        : '<button type="button" data-wl-conflict-keep="true" data-wl-conflict-store="' + syncSafe(item.type) +
          '" data-wl-conflict-id="' + syncSafe(item.row.id) + '">Keep device copy</button>';
      return '<div class="wl-sync-conflict"><div><strong>' + syncSafe(item.type.slice(0,-1)) + ': ' + syncSafe(label) + '</strong><br>' +
        '<span>Cloud update ' + syncSafe(item.row.cloudConflictSnapshot.updatedAt || 'time unavailable') + '</span><br>' +
        '<span>' + syncSafe(preview || 'A newer cloud copy is available.') + '</span></div>' +
        '<div class="wl-sync-conflict-actions"><button type="button" data-wl-conflict-apply="true" data-wl-conflict-store="' + syncSafe(item.type) +
        '" data-wl-conflict-id="' + syncSafe(item.row.id) + '">Use cloud copy</button>' + keepLocalAction + '</div></div>';
    }).join('') : '<p class="wl-sync-empty">No unresolved remote changes for this workspace. Download cloud records to check again.</p>';
    host.querySelectorAll('[data-wl-conflict-apply]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        try { await resolveCloudConflict(button.dataset.wlConflictStore, button.dataset.wlConflictId); }
        catch (error) { syncStatus('Could not apply cloud version: ' + error.message); button.disabled = false; }
      };
    });
    host.querySelectorAll('[data-wl-conflict-keep]').forEach(button => {
      button.onclick = async () => {
        button.disabled = true;
        try { await keepDeviceConflict(button.dataset.wlConflictStore, button.dataset.wlConflictId); }
        catch (error) { syncStatus('Could not keep device version: ' + error.message); button.disabled = false; }
      };
    });
    return found.length;
  }
  async function resolveCloudConflict(type, id) {
    const allowed = {
      products:['name','sku','category','unit','cost','price','reorder','barcode','stock'],
      customers:['name','phone','email','address','notes'],
      suppliers:['name','phone','email','address','notes'],
      expenses:['category','description','amount','payment','date']
    };
    if (!Object.prototype.hasOwnProperty.call(allowed,type)) throw new Error('Unsupported conflict type.');
    const rows = await all(type);
    const row = rows.find(item => String(item.id) === String(id));
    if (!row || !row.cloudConflictSnapshot) throw new Error('This conflict is no longer available. Refresh the list.');
    if (row.localBusinessId && row.localBusinessId !== activeBusiness.id) throw new Error('This record belongs to another business workspace.');
    const snapshot = row.cloudConflictSnapshot;
    const fields = snapshot.fields || {};
    for (const key of allowed[type]) {
      if (Object.prototype.hasOwnProperty.call(fields,key)) row[key] = fields[key];
    }
    if (type === 'products' && Object.prototype.hasOwnProperty.call(fields,'stock') && snapshot.branchId) {
      await put('branchInventory',{
        id:String(snapshot.branchId) + '|' + String(row.id),
        businessId:activeBusiness.id,
        branchId:snapshot.branchId,
        productId:row.id,
        quantity:Number(fields.stock || 0)
      });
    }
    row.cloudSyncedAt = snapshot.updatedAt || new Date().toISOString();
    row.cloudConflictSnapshot = null;
    row.cloudConflictAt = null;
    await put(type,row);
    await recordSyncHistory({mode:'conflict review',status:'resolved',message:'Applied the cloud version to the local ' + type.slice(0,-1) + ' record ' + String(id) + '. Cloud data was not changed.'});
    await updateSyncStatus();
    syncStatus('Cloud version applied to this device. No new transaction was posted.');
  }
  async function keepDeviceConflict(type, id) {
    if (!['products','customers','suppliers'].includes(type)) {
      throw new Error('This record type cannot be safely overwritten by the local copy. Expense changes must follow approval rules.');
    }
    if (!activeBusiness || !client || !session) throw new Error('Sign in and select the correct business workspace first.');
    const rows = await all(type);
    const row = rows.find(item => String(item.id) === String(id));
    if (!row || !row.cloudConflictSnapshot) throw new Error('This conflict is no longer available. Refresh the list.');
    if (row.localBusinessId && row.localBusinessId !== activeBusiness.id) throw new Error('This record belongs to another business workspace.');
    const stableId = row.cloudClientRecordId;
    if (!stableId) throw new Error('The record has no stable cloud identity and cannot be safely reconciled.');
    const snapshot = row.cloudConflictSnapshot;
    row.localBusinessId = activeBusiness.id;
    row.cloudSyncedFor = null;
    row.cloudPendingSyncEventId = type + ':' + stableId + ':conflict:' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    if (type === 'products' && snapshot.branchId) row.cloudPendingSyncBranchId = snapshot.branchId;
    row.cloudConflictSnapshot = null;
    row.cloudConflictAt = null;
    row.cloudSyncError = null;
    row.cloudConflictResolution = 'keep_device';
    row.cloudSyncQueuedAt = new Date().toISOString();
    await put(type, row);
    await recordSyncHistory({
      mode:'conflict review',
      status:'queued',
      message:'Kept the device version of ' + type.slice(0,-1) + ' ' + String(id) + '. It is queued for an idempotent cloud update.'
    });
    await updateSyncStatus();
    syncStatus('Device copy selected. It is queued for this workspace; the remote receipt will be re-used for retries of this update.');
    scheduleAutomaticSync('device-conflict-resolution', 700);
  }
  async function updateSyncStatus() {
    if (!activeBusiness) return;
    const businessId = activeBusiness.id;
    const types = ['products','customers','suppliers','expenses','sales','purchases','returns'];
    let pending = 0, synced = 0, unassigned = 0, awaitingApproval = 0, conflicts = 0, failed = 0;
    for (const type of types) {
      const rows = await all(type);
      for (const row of rows) {
        const owner = syncOwner(row);
        if (row.cloudConflictSnapshot && (owner === businessId || row.cloudSyncedFor === businessId)) conflicts++;
        if (row.approvalStatus && row.approvalStatus !== 'completed' && row.localBusinessId === businessId) awaitingApproval++;
        if (row.cloudSyncError && owner === businessId) failed++;
        if (row.cloudSyncedFor === businessId) { synced++; continue; }
        if (owner === businessId) pending++;
        else if (!owner) unassigned++;
      }
    }
    const pendingEl = $('wlSyncPendingCount');
    const doneEl = $('wlSyncDoneCount');
    const unassignedEl = $('wlSyncUnassignedCount');
    const conflictEl = $('wlSyncConflictCount');
    if (pendingEl) pendingEl.textContent = String(pending);
    if (doneEl) doneEl.textContent = String(synced);
    if (unassignedEl) unassignedEl.textContent = String(unassigned);
    if (conflictEl) conflictEl.textContent = String(conflicts);
    const connection = $('wlSyncConnection');
    if (connection) connection.textContent = navigator.onLine === false ? 'Offline · queued on device' : 'Online';
    const note = pending + ' records pending for this workspace · ' + synced + ' synced · ' +
      unassigned + ' unassigned records held back · ' + awaitingApproval + ' awaiting approval' +
      (conflicts ? ' · ' + conflicts + ' remote conflict(s)' : '') + (failed ? ' · ' + failed + ' marked failed' : '') + '.';
    syncStatus(note);
    await renderSyncHistory();
    await renderSyncConflicts();
  }
  function scheduleAutomaticSync(reason, delay) {
    if (!autoSyncEnabled || !activeBusiness || !session || navigator.onLine === false || syncInProgress) return;
    clearTimeout(autoRetryTimer);
    const businessId = activeBusiness.id;
    autoRetryTimer = setTimeout(() => {
      if (!autoSyncEnabled || !session || !activeBusiness || activeBusiness.id !== businessId || navigator.onLine === false) return;
      syncLocalRecords({automatic:true,trigger:reason || 'scheduled'});
    }, Math.max(300, Number(delay || 900)));
  }
  function scheduleAutomaticRetry(businessId) {
    if (!autoSyncEnabled || !activeBusiness || activeBusiness.id !== businessId || navigator.onLine === false) return;
    if (autoRetryAttempt >= 5) {
      syncStatus('Automatic retry paused after five failed attempts. Check the connection, then use Sync now or reconnect.');
      return;
    }
    const delay = Math.min(60000, 5000 * Math.pow(2, autoRetryAttempt));
    autoRetryAttempt++;
    clearTimeout(autoRetryTimer);
    autoRetryTimer = setTimeout(() => {
      if (autoSyncEnabled && session && activeBusiness?.id === businessId && navigator.onLine !== false) {
        syncLocalRecords({automatic:true,trigger:'retry'});
      }
    }, delay);
  }

  async function downloadCloudRecords() {
    if (!client || !activeBusiness) return say('Select a business before downloading cloud records.');
    const button=$('wlDownloadNow'); if(button)button.disabled=true;
    syncStatus('Downloading cloud records…');
    let added=0,updated=0,skipped=0,conflicts=0;
    try {
      const businessId=activeBusiness.id;
      const localProducts=await all('products'), localCustomers=await all('customers'),
        localSuppliers=await all('suppliers'), localExpenses=await all('expenses'),
        localSales=await all('sales'), localPurchases=await all('purchases'), localReturns=await all('returns');
      const [pRes,cRes,sRes,eRes]=await Promise.all([
        client.from('products').select('id,client_record_id,sku,name,category,unit,cost_price,selling_price,reorder_level,is_active,barcode,updated_at').eq('business_id',businessId),
        client.from('customers').select('id,client_record_id,name,phone,email,address,notes,updated_at').eq('business_id',businessId),
        client.from('suppliers').select('id,client_record_id,name,phone,email,address,notes,updated_at').eq('business_id',businessId),
        client.from('expenses').select('id,client_record_id,category,description,amount,payment_method,expense_date').eq('business_id',businessId)
      ]);
      for(const [label,result] of [['products',pRes],['customers',cRes],['suppliers',sRes],['expenses',eRes]]) if(result.error)throw new Error('Could not download '+label+': '+result.error.message);
      const branches=window.__wlBranches||[];
      const branchIds=branches.map(b=>b.id);
      const inventoryResult=branchIds.length?await client.from('branch_inventory').select('branch_id,product_id,quantity_on_hand').eq('business_id',businessId).in('branch_id',branchIds):{data:[],error:null};
      if(inventoryResult.error)throw new Error('Could not download branch stock: '+inventoryResult.error.message);
      const selectedStock=new Map((inventoryResult.data||[]).filter(x=>x.branch_id===selectedBranch?.id).map(x=>[x.product_id,Number(x.quantity_on_hand||0)]));
      const productMap=new Map();
      for(const cloud of pRes.data||[]){
        const old=localProducts.find(x=>x.cloudClientRecordId===cloud.client_record_id);
        if(old&&((old.localBusinessId&&old.localBusinessId!==businessId)||(old.cloudSyncedFor&&old.cloudSyncedFor!==businessId))){skipped++;continue;}
        if(old)productMap.set(cloud.id,old.id);
        if(old&&old.cloudSyncedAt&&cloud.updated_at&&Date.parse(cloud.updated_at)>Date.parse(old.cloudSyncedAt)+1500){old.cloudConflictSnapshot={fields:{name:cloud.name,sku:cloud.sku||'',category:cloud.category||'',unit:cloud.unit||'unit',cost:Number(cloud.cost_price||0),price:Number(cloud.selling_price||0),reorder:Number(cloud.reorder_level||0),barcode:cloud.barcode||'',stock:selectedStock.get(cloud.id)||0},updatedAt:cloud.updated_at,branchId:selectedBranch?.id||null};old.cloudConflictAt=new Date().toISOString();await put('products',old);conflicts++;continue;}
        const row={...(old||{}),id:old?.id||('cloud-product-'+cloud.client_record_id),
          cloudClientRecordId:cloud.client_record_id,localBusinessId:businessId,cloudSyncedFor:businessId,cloudSyncedAt:new Date().toISOString(),
          name:cloud.name,sku:cloud.sku||'',category:cloud.category||'',unit:cloud.unit||'unit',
          cost:Number(cloud.cost_price||0),price:Number(cloud.selling_price||0),reorder:Number(cloud.reorder_level||0),
          stock:selectedStock.get(cloud.id)||0,active:cloud.is_active,barcode:cloud.barcode||''};
        await put('products',row);
        if(selectedBranch?.id){await put('branchInventory',{id:String(selectedBranch.id)+'|'+String(row.id),businessId,branchId:selectedBranch.id,productId:row.id,quantity:selectedStock.get(cloud.id)||0});}
        productMap.set(cloud.id,row.id);old?updated++:added++;
      }
      const syncSimple=async(type,rows,localRows,mapRow)=>{
        for(const cloud of rows||[]){
          const old=localRows.find(x=>x.cloudClientRecordId===cloud.client_record_id);
          if(old&&((old.localBusinessId&&old.localBusinessId!==businessId)||(old.cloudSyncedFor&&old.cloudSyncedFor!==businessId))){skipped++;continue;}
          if(old&&old.cloudSyncedAt&&cloud.updated_at&&Date.parse(cloud.updated_at)>Date.parse(old.cloudSyncedAt)+1500){old.cloudConflictSnapshot={fields:mapRow(cloud),updatedAt:cloud.updated_at};old.cloudConflictAt=new Date().toISOString();await put(type,old);conflicts++;continue;}
          const row={...(old||{}),id:old?.id||('cloud-'+type+'-'+cloud.client_record_id),
            cloudClientRecordId:cloud.client_record_id,localBusinessId:businessId,cloudSyncedFor:businessId,
            cloudSyncedAt:new Date().toISOString(),...mapRow(cloud)};
          if(type==='expenses'&&row.approvalStatus&&row.approvalStatus!=='completed')row.approvalStatus='completed';
          await put(type,row);old?updated++:added++;
        }
      };
      await syncSimple('customers',cRes.data,localCustomers,r=>({name:r.name,phone:r.phone||'',email:r.email||'',address:r.address||'',notes:r.notes||''}));
      await syncSimple('suppliers',sRes.data,localSuppliers,r=>({name:r.name,phone:r.phone||'',email:r.email||'',address:r.address||'',notes:r.notes||''}));
      await syncSimple('expenses',eRes.data,localExpenses,r=>({category:r.category,description:r.description,amount:Number(r.amount||0),payment:r.payment_method||'cash',date:r.expense_date}));
      const [saleRes,purchaseRes]=await Promise.all([
        client.from('offline_sales').select('id,client_transaction_id,receipt,transaction_date,customer_name,payment_method,subtotal,discount,tax,total,branch_id').eq('business_id',businessId),
        client.from('offline_purchases').select('id,client_transaction_id,transaction_date,supplier_name,total,branch_id').eq('business_id',businessId)
      ]);
      if(saleRes.error)throw new Error('Could not download sales: '+saleRes.error.message);
      if(purchaseRes.error)throw new Error('Could not download purchases: '+purchaseRes.error.message);
      const [saleItemsRes,purchaseItemsRes]=await Promise.all([
        client.from('offline_sale_items').select('sale_id,product_id,product_name,quantity,unit_price,line_total').eq('business_id',businessId),
        client.from('offline_purchase_items').select('purchase_id,product_id,product_name,quantity,unit_cost,line_total').eq('business_id',businessId)
      ]);
      if(saleItemsRes.error)throw new Error('Could not download sale items: '+saleItemsRes.error.message);
      if(purchaseItemsRes.error)throw new Error('Could not download purchase items: '+purchaseItemsRes.error.message);
      const importTransactions=async(type,rows,itemRows)=>{
        for(const cloud of rows||[]){
          const old=(type==='sales'?localSales:localPurchases).find(x=>x.cloudTransactionId===cloud.client_transaction_id);
          if(old&&((old.localBusinessId&&old.localBusinessId!==businessId)||(old.cloudSyncedFor&&old.cloudSyncedFor!==businessId))){skipped++;continue;}
          const items=itemRows.filter(i=>i[type==='sales'?'sale_id':'purchase_id']===cloud.id).map(i=>({
            productId:productMap.get(i.product_id)||('cloud-product-id-'+i.product_id),
            name:i.product_name,quantity:Number(i.quantity),
            ...(type==='sales'?{unitPrice:Number(i.unit_price)}:{unitCost:Number(i.unit_cost),cost:Number(i.unit_cost)})
          }));
          const row={...(old||{}),id:old?.id||('cloud-'+type+'-'+cloud.client_transaction_id),
            cloudTransactionId:cloud.client_transaction_id,localBusinessId:businessId,cloudSyncedFor:businessId,
            cloudSyncedAt:new Date().toISOString(),branchId:cloud.branch_id||null,
            receipt:cloud.receipt||('PUR-'+cloud.client_transaction_id.slice(0,10)),
            date:cloud.transaction_date,customer:cloud.customer_name||'',supplier:cloud.supplier_name||'',
            payment:cloud.payment_method||'cash',subtotal:Number(cloud.subtotal??cloud.total??0),discount:Number(cloud.discount||0),tax:Number(cloud.tax||0),total:Number(cloud.total||0),items};
          if(type==='purchases'&&row.approvalRequestId)row.approvalStatus='completed';
          await put(type,row);old?updated++:added++;
        }
      };
      await importTransactions('sales',saleRes.data,saleItemsRes.data||[]);
      await importTransactions('purchases',purchaseRes.data,purchaseItemsRes.data||[]);
      const [returnRes,returnItemsRes]=await Promise.all([
        client.from('offline_sale_returns').select('id,sale_id,branch_id,client_return_id,reason,refund_method,refund_total,created_at').eq('business_id',businessId),
        client.from('offline_sale_return_items').select('return_id,product_id,product_name,quantity,unit_price,refund_amount,restocked').eq('business_id',businessId)
      ]);
      if(returnRes.error)throw new Error('Could not download returns: '+returnRes.error.message);
      if(returnItemsRes.error)throw new Error('Could not download return items: '+returnItemsRes.error.message);
      const cloudSaleById=new Map((saleRes.data||[]).map(x=>[x.id,x]));
      const localSalesAfterImport=await all('sales');
      for(const cloud of returnRes.data||[]){
        const old=localReturns.find(x=>x.clientReturnId===cloud.client_return_id);
        if(old&&((old.localBusinessId&&old.localBusinessId!==businessId)||(old.cloudSyncedFor&&old.cloudSyncedFor!==businessId))){skipped++;continue;}
        const sale=cloudSaleById.get(cloud.sale_id);
        const localSale=localSalesAfterImport.find(x=>x.cloudTransactionId===sale?.client_transaction_id);
        const items=(returnItemsRes.data||[]).filter(x=>x.return_id===cloud.id).map(x=>({
          productId:productMap.get(x.product_id)||('cloud-product-id-'+x.product_id),
          name:x.product_name,quantity:Number(x.quantity),unitPrice:Number(x.unit_price),
          refundAmount:Number(x.refund_amount),restock:!!x.restocked
        }));
        const row={...(old||{}),id:old?.id||cloud.client_return_id,clientReturnId:cloud.client_return_id,
          cloudReturnId:cloud.id,saleId:old?.saleId||localSale?.id||('cloud-sale-'+(sale?.client_transaction_id||cloud.sale_id)),
          saleCloudTransactionId:sale?.client_transaction_id||old?.saleCloudTransactionId||null,
          saleReceipt:sale?.receipt||old?.saleReceipt||'',branchId:cloud.branch_id,localBusinessId:businessId,
          cloudSyncedFor:businessId,reason:cloud.reason,method:cloud.refund_method,
          refundTotal:Number(cloud.refund_total||0),items,date:(cloud.created_at||'').slice(0,10),
          createdAt:cloud.created_at,restock:items.some(x=>x.restock),approvalStatus:'completed'};
        await put('returns',row);old?updated++:added++;
      }
      syncStatus('Download complete: '+added+' new, '+updated+' refreshed, '+skipped+' local unsynced records preserved, '+conflicts+' conflicts awaiting your choice.');
      say('Cloud download completed. Local unsynced records were preserved.');
      window.dispatchEvent(new CustomEvent('whiteLionCloudDownloaded'));
    } catch(error) {
      syncStatus('Download paused: '+error.message+'. Existing local records were preserved where possible.');
      say('Cloud download error: '+error.message);
    } finally {if(button)button.disabled=false;await updateSyncStatus();}
  }

  async function syncLocalRecords(options = {}) {
    const automatic = options.automatic === true;
    if (automatic && !autoSyncEnabled) return;
    if (automatic && navigator.onLine === false) return syncStatus('Offline. Eligible records remain saved on this device.');
    if (syncInProgress) return syncStatus('A sync is already running for this workspace.');
    if (!client || !session || !activeBusiness) return say('Sign in and select a business workspace first.');
    if (!navigator.onLine) { syncStatus('Offline. Records remain safely on this device; reconnect to sync.'); return; }
    if (!automatic && !confirm('Upload this device’s local products, customers, suppliers, expenses, sales, purchases and returns into “' + activeBusiness.name + '”? Continue only if ALL these local records belong in this workspace.')) return;
    const button = $('wlSyncNow');
    const businessSelect = $('wlBusinessSelect'), branchSelect = $('wlBranchSelect');
    syncInProgress = true;
    if (button) { button.disabled = true; button.textContent = automatic ? 'Auto syncing…' : 'Syncing…'; }
    if (businessSelect) businessSelect.disabled = true;
    if (branchSelect) branchSelect.disabled = true;
    const syncBusinessId = activeBusiness.id;
    const types = ['products','customers','suppliers','expenses'];
    let total = 0, transactionTotal = 0, approvalPending = 0;
    try {
      await recordSyncHistory({mode:automatic ? 'automatic' : 'manual',status:'started',message:'Sync started for ' + activeBusiness.name + (options.trigger ? ' (' + options.trigger + ')' : '') + '.'});
      const liveApprovalSettings = await refreshApprovalSettings();
      const localBranchStocks = await all('branchInventory');
      for (const type of types) {
        const rows = (await all(type)).filter(row => !automatic || row.localBusinessId === activeBusiness.id || row.cloudSyncedFor === activeBusiness.id);
        for (const row of rows) {
          const localId = String(row.id);
          if ((row.localBusinessId && row.localBusinessId !== activeBusiness.id) || (row.cloudSyncedFor && row.cloudSyncedFor !== activeBusiness.id)) {
            throw new Error(type + ' record ' + localId + ' is linked to a different business workspace. Export a separate copy before importing it elsewhere.');
          }
          if (type === 'expenses' && row.approvalRequestId) {
            const posted = await client.from('expenses').select('id')
              .eq('business_id',activeBusiness.id).eq('client_record_id',row.cloudClientRecordId||'').maybeSingle();
            if(posted.error)throw new Error('Could not verify approved expense: '+posted.error.message);
            if(posted.data){row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;row.cloudSyncedAt=new Date().toISOString();row.approvalStatus='completed';await put(type,row);continue;}
            const prior = await client.from('business_approval_requests').select('status,executed_at')
              .eq('id',row.approvalRequestId).eq('business_id',activeBusiness.id).maybeSingle();
            if(prior.error)throw new Error('Could not verify expense approval request: '+prior.error.message);
            if(prior.data && prior.data.status==='pending'){approvalPending++;continue;}
            if(prior.data && ['rejected','cancelled'].includes(prior.data.status)){row.approvalStatus=prior.data.status;await put(type,row);continue;}
          }
          let stableId = row.cloudClientRecordId;
          if (!stableId) {
            stableId = crypto.randomUUID();
            row.cloudClientRecordId = stableId;
            await put(type, row);
          }
          if (row.cloudSyncedFor === activeBusiness.id) { if (!row.localBusinessId) { row.localBusinessId=activeBusiness.id; await put(type,row); } continue; }
          if (type === 'products' && !(row.cloudPendingSyncBranchId || selectedBranch?.id)) throw new Error('Select an active branch before syncing product opening stock.');
          const targetBranchId = type === 'products' ? (row.cloudPendingSyncBranchId || selectedBranch?.id) : null;
          const localBranchStock = type === 'products' ? localBranchStocks.find(x => String(x.productId)===String(row.id) && (!x.businessId || x.businessId===activeBusiness.id) && (x.branchId===targetBranchId || x.branchId==='local-main')) : null;
          const openingStock = localBranchStock ? Number(localBranchStock.quantity||0) : Number(row.stock||0);
          const payload = type === 'products' ? {
            branch_id:targetBranchId,
            client_record_id:stableId, sku:row.sku || null, barcode:row.barcode || null, name:row.name || 'Unnamed product',
            category:row.category || null, unit:row.unit || 'unit',
            cost_price:Number(row.cost || 0), selling_price:Number(row.price || 0),
            reorder_level:Number(row.reorder || 0), quantity_on_hand:openingStock
          } : type === 'expenses' ? {
            client_record_id:stableId, category:row.category || 'General',
            description:row.description || 'Expense', amount:Number(row.amount || 0),
            payment_method:row.payment || 'cash', expense_date:row.date || new Date().toISOString().slice(0,10)
          } : {
            client_record_id:stableId, name:row.name || (type === 'customers' ? 'Unnamed customer':'Unnamed supplier'),
            phone:row.phone || null, email:row.email || null, address:row.address || null, notes:row.notes || null
          };
          if (type === 'expenses' && liveApprovalSettings.require_expense_approvals) {
            const existingExpense = await client.from('expenses').select('id')
              .eq('business_id',activeBusiness.id).eq('client_record_id',stableId).maybeSingle();
            if (existingExpense.error) throw new Error('Could not verify expense approval status: '+existingExpense.error.message);
            if (existingExpense.data) {
              row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;
              row.cloudSyncedAt=new Date().toISOString();await put(type,row);continue;
            }
            row.approvalClientRequestId=row.approvalClientRequestId||crypto.randomUUID();
            const approval = await client.rpc('create_business_operation_approval',{
              p_business_id:activeBusiness.id,
              p_client_request_id:row.approvalClientRequestId,
              p_request_type:'expense',
              p_title:(row.category||'Expense')+' · '+(row.description||'Expense'),
              p_description:row.description||'Expense',
              p_amount:Number(row.amount||0),
              p_currency_code:activeBusiness.currency_code||'SLE',
              p_payload:{
                operation:'expense',client_record_id:stableId,
                branch_id:row.branchId||selectedBranch?.id||null,
                category:row.category||'General',description:row.description||'Expense',
                amount:Number(row.amount||0),payment_method:row.payment||'cash',
                expense_date:row.date||new Date().toISOString().slice(0,10)
              }
            });
            if (approval.error) throw new Error('Expense approval request failed: '+approval.error.message);
            row.localBusinessId=activeBusiness.id;
            row.approvalRequestId=approval.data?.request_id||row.approvalRequestId;
            row.approvalStatus='pending';row.approvalSubmittedAt=new Date().toISOString();
            await put(type,row);approvalPending++;continue;
          }
          const {data,error} = await client.rpc('sync_local_records', {
            p_business_id:activeBusiness.id,
            p_event_id:row.cloudPendingSyncEventId || (type + ':' + stableId),
            p_record_type:type,
            p_records:[payload]
          });
          if (error) throw new Error(type + ' record ' + localId + ': ' + error.message);
          row.localBusinessId = activeBusiness.id;
          row.cloudSyncedFor = activeBusiness.id;
          row.cloudSyncedAt = new Date().toISOString();
          delete row.cloudPendingSyncEventId;
          delete row.cloudPendingSyncBranchId;
          row.cloudSyncError = null;
          await put(type,row);
          if(type==='products'&&targetBranchId){await put('branchInventory',{id:String(targetBranchId)+'|'+String(row.id),businessId:activeBusiness.id,branchId:targetBranchId,productId:row.id,quantity:openingStock});}
          total++;
        }
      }
      // Transactions are posted only after master data, especially products, has cloud IDs.
      const productRows = await all('products');
      const productByLocalId = new Map(productRows.map(p => [String(p.id), p]));
      for (const type of ['sales','purchases']) {
        const rows = (await all(type)).filter(row => !automatic || row.localBusinessId === activeBusiness.id || row.cloudSyncedFor === activeBusiness.id);
        for (const row of rows) {
          if ((row.localBusinessId && row.localBusinessId !== activeBusiness.id) || (row.cloudSyncedFor && row.cloudSyncedFor !== activeBusiness.id)) {
            throw new Error(type + ' transaction ' + (row.receipt || row.id) + ' belongs to a different business workspace.');
          }
          if (type === 'purchases' && row.approvalRequestId) {
            const posted = row.cloudTransactionId ? await client.from('offline_purchases').select('id')
              .eq('business_id',activeBusiness.id).eq('client_transaction_id',row.cloudTransactionId).maybeSingle() : {data:null,error:null};
            if(posted.error)throw new Error('Could not verify approved purchase: '+posted.error.message);
            if(posted.data){row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;row.cloudSyncedAt=new Date().toISOString();row.approvalStatus='completed';await put(type,row);continue;}
            const prior = await client.from('business_approval_requests').select('status,executed_at')
              .eq('id',row.approvalRequestId).eq('business_id',activeBusiness.id).maybeSingle();
            if(prior.error)throw new Error('Could not verify purchase approval request: '+prior.error.message);
            if(prior.data && prior.data.status==='pending'){approvalPending++;continue;}
            if(prior.data && ['rejected','cancelled'].includes(prior.data.status)){row.approvalStatus=prior.data.status;await put(type,row);continue;}
          }
          if (row.cloudSyncedFor === activeBusiness.id) { if (!row.localBusinessId) { row.localBusinessId=activeBusiness.id; await put(type,row); } continue; }
          if (!row.branchId) throw new Error('Transaction ' + (row.receipt || row.id) + ' has no saved branch. Select a branch when recording new transactions; older transactions must be assigned deliberately before syncing.');
          if (!row.cloudTransactionId) {
            row.cloudTransactionId = crypto.randomUUID();
            await put(type, row);
          }
          const sourceItems = Array.isArray(row.items) && row.items.length ? row.items :
            (type === 'purchases' ? [{productId:row.productId, name:row.product, quantity:row.quantity, unitPrice:row.cost}] : []);
          if (!sourceItems.length) throw new Error(type + ' transaction ' + (row.receipt || row.cloudTransactionId) + ' has no item details.');
          const items = sourceItems.map(item => {
            const product = productByLocalId.get(String(item.productId));
            if (!product || !product.cloudClientRecordId || product.cloudSyncedFor !== activeBusiness.id) {
              throw new Error('A product in ' + type + ' ' + (row.receipt || row.cloudTransactionId) + ' is not synced to this workspace. Sync products first.');
            }
            return {
              product_client_record_id:product.cloudClientRecordId,
              product_name:item.name || product.name || 'Product',
              quantity:Number(item.quantity || 0), apply_stock:!!(row.createdAt && product.cloudSyncedAt && row.createdAt > product.cloudSyncedAt),
              ...(type === 'sales' ? {unit_price:Number(item.unitPrice ?? product.price ?? 0)} : {unit_cost:Number(item.unitCost ?? item.cost ?? row.cost ?? product.cost ?? 0)})
            };
          });
          const payload = {
            client_transaction_id:row.cloudTransactionId,
            receipt:row.receipt || null,
            transaction_date:row.date || new Date().toISOString().slice(0,10),
            customer_name:row.customer || null,
            supplier_name:row.supplier || null,
            payment_method:row.payment || 'cash',
            subtotal:type === 'sales' ? Number(row.subtotal ?? items.reduce((sum,item) => sum + Math.round(Number(item.quantity || 0) * Number(item.unit_price || 0) * 100) / 100, 0)) : Number(row.total || 0),
            discount:type === 'sales' ? Number(row.discount || 0) : 0,
            tax:type === 'sales' ? Number(row.tax || 0) : 0,
            total:Number(row.total || 0),
            items
          };
          if (type === 'purchases' && liveApprovalSettings.require_purchase_approvals) {
            const existingPurchase = await client.from('offline_purchases').select('id')
              .eq('business_id',activeBusiness.id).eq('client_transaction_id',row.cloudTransactionId).maybeSingle();
            if (existingPurchase.error) throw new Error('Could not verify purchase approval status: '+existingPurchase.error.message);
            if (existingPurchase.data) {
              row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;
              row.cloudSyncedAt=new Date().toISOString();row.cloudApprovalExecuted=true;
              await put(type,row);continue;
            }
            row.approvalClientRequestId=row.approvalClientRequestId||crypto.randomUUID();
            const approval = await client.rpc('create_business_operation_approval',{
              p_business_id:activeBusiness.id,
              p_client_request_id:row.approvalClientRequestId,
              p_request_type:'purchase',
              p_title:'Purchase · '+(row.supplier||'Supplier')+' · '+(row.receipt||row.cloudTransactionId),
              p_description:'Stock purchase awaiting approval before receipt.',
              p_amount:Number(row.total||0),
              p_currency_code:activeBusiness.currency_code||'SLE',
              p_payload:{
                operation:'purchase',branch_id:row.branchId,
                client_transaction_id:row.cloudTransactionId,
                transaction_date:row.date||new Date().toISOString().slice(0,10),
                supplier_name:row.supplier||null,
                items:items.map(item=>({
                  product_client_record_id:item.product_client_record_id,
                  product_name:item.product_name,
                  quantity:item.quantity,
                  unit_cost:item.unit_cost
                }))
              }
            });
            if (approval.error) throw new Error('Purchase approval request failed: '+approval.error.message);
            row.localBusinessId=activeBusiness.id;
            row.approvalRequestId=approval.data?.request_id||row.approvalRequestId;
            row.approvalStatus='pending';row.approvalSubmittedAt=new Date().toISOString();
            await put(type,row);approvalPending++;continue;
          }
          const {data,error} = await client.rpc('sync_branch_transaction', {
            p_business_id:activeBusiness.id,
            p_branch_id:row.branchId,
            p_event_id:type + ':' + row.cloudTransactionId,
            p_transaction_type:type,
            p_transaction:payload
          });
          if (error) throw new Error(type + ' transaction ' + (row.receipt || row.cloudTransactionId) + ': ' + error.message);
          const {data: receipt, error: receiptError} = await client.from('offline_sync_receipts')
            .select('event_id,record_type,record_count')
            .eq('business_id', activeBusiness.id)
            .eq('event_id', type + ':' + row.cloudTransactionId)
            .maybeSingle();
          if (receiptError) throw new Error('Could not verify cloud receipt for ' + (row.receipt || row.cloudTransactionId) + ': ' + receiptError.message);
          if (!receipt) throw new Error('The cloud RPC returned but no sync receipt was found for ' + (row.receipt || row.cloudTransactionId) + '. The local transaction is still pending.');
          if (type === 'sales') {
            let referralId = null;
            try {
              const savedAt = Number(localStorage.getItem('wl-aff-referral-at') || 0);
              const savedId = localStorage.getItem('wl-aff-referral-id');
              if (savedId && savedAt && Date.now() - savedAt <= 365 * 24 * 60 * 60 * 1000) referralId = savedId;
            } catch (_) {}
            if (referralId) {
              const { error: affiliateError } = await client.rpc('record_affiliate_sale', {
                p_business_id: activeBusiness.id,
                p_client_transaction_id: row.cloudTransactionId,
                p_referral_id: referralId
              });
              if (affiliateError) throw new Error('Sale synced, but affiliate commission recording needs a retry: ' + affiliateError.message);
            }
          }
          row.localBusinessId = activeBusiness.id;
          row.cloudSyncedFor = activeBusiness.id;
          row.cloudSyncedAt = new Date().toISOString();
          row.cloudSyncResult = data?.status || 'synced';
          await put(type,row);
          transactionTotal++;
        }
      }
      // Upload returns only after the original sale and its products are in the cloud.
      const localSalesForReturns=await all('sales');
      const returnsToSync=(await all('returns')).filter(row => !automatic || row.localBusinessId === activeBusiness.id || row.cloudSyncedFor === activeBusiness.id);
      let returnTotal=0;
      for(const row of returnsToSync){
        if(row.cloudSyncedFor===activeBusiness.id)continue;
        if(row.approvalRequestId){
          const posted=await client.from('offline_sale_returns').select('id')
            .eq('business_id',activeBusiness.id).eq('client_return_id',row.clientReturnId||String(row.id)).maybeSingle();
          if(posted.error)throw new Error('Could not verify approved refund: '+posted.error.message);
          if(posted.data){row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;row.cloudReturnId=posted.data.id;row.cloudSyncedAt=new Date().toISOString();row.approvalStatus='completed';await put('returns',row);returnTotal++;continue;}
          const prior=await client.from('business_approval_requests').select('status,executed_at')
            .eq('id',row.approvalRequestId).eq('business_id',activeBusiness.id).maybeSingle();
          if(prior.error)throw new Error('Could not verify refund approval request: '+prior.error.message);
          if(prior.data&&prior.data.status==='pending'){approvalPending++;continue;}
          if(prior.data&&['rejected','cancelled'].includes(prior.data.status)){row.approvalStatus=prior.data.status;await put('returns',row);continue;}
        }
        if((row.localBusinessId&&row.localBusinessId!==activeBusiness.id)||(row.cloudSyncedFor&&row.cloudSyncedFor!==activeBusiness.id))
          throw new Error('Return '+(row.clientReturnId||row.id)+' belongs to a different business workspace.');
        const sale=localSalesForReturns.find(s=>String(s.id)===String(row.saleId));
        const saleTransactionId=row.saleCloudTransactionId||sale?.cloudTransactionId;
        if(!saleTransactionId||sale?.cloudSyncedFor!==activeBusiness.id)
          throw new Error('Return '+(row.clientReturnId||row.id)+' is waiting for its original sale to sync first.');
        if(!row.branchId||row.branchId==='local-main')
          throw new Error('Return '+(row.clientReturnId||row.id)+' has no cloud branch. The original sale must be posted to a selected cloud branch.');
        const returnItems=(row.items||[]).map(item=>{
          const product=productByLocalId.get(String(item.productId));
          if(!product?.cloudClientRecordId||product.cloudSyncedFor!==activeBusiness.id)
            throw new Error('A returned product is not synced to this workspace.');
          return {product_client_record_id:product.cloudClientRecordId,product_name:item.name||product.name,
            quantity:Number(item.quantity||0),restock:!!item.restock};
        });
        if (liveApprovalSettings.require_refund_approvals) {
          const existingReturn=await client.from('offline_sale_returns').select('id')
            .eq('business_id',activeBusiness.id).eq('client_return_id',row.clientReturnId||String(row.id)).maybeSingle();
          if(existingReturn.error)throw new Error('Could not verify refund approval status: '+existingReturn.error.message);
          if(existingReturn.data){
            row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;
            row.cloudReturnId=existingReturn.data.id;row.cloudSyncedAt=new Date().toISOString();
            await put('returns',row);returnTotal++;continue;
          }
          row.approvalClientRequestId=row.approvalClientRequestId||crypto.randomUUID();
          const approval=await client.rpc('create_business_operation_approval',{
            p_business_id:activeBusiness.id,
            p_client_request_id:row.approvalClientRequestId,
            p_request_type:'refund',
            p_title:'Refund · '+(row.saleReceipt||row.clientReturnId||row.id),
            p_description:row.reason||'Customer refund request',
            p_amount:Number(row.refundTotal||0),
            p_currency_code:activeBusiness.currency_code||'SLE',
            p_payload:{
              operation:'refund',branch_id:row.branchId,
              client_return_id:row.clientReturnId||String(row.id),
              sale_client_transaction_id:saleTransactionId,
              reason:row.reason||'Customer return',
              refund_method:row.method||'cash',
              items:returnItems
            }
          });
          if(approval.error)throw new Error('Refund approval request failed: '+approval.error.message);
          row.localBusinessId=activeBusiness.id;
          row.approvalRequestId=approval.data?.request_id||row.approvalRequestId;
          row.approvalStatus='pending';row.approvalSubmittedAt=new Date().toISOString();
          await put('returns',row);approvalPending++;continue;
        }
        const {data,error}=await client.rpc('sync_sale_return',{
          p_business_id:activeBusiness.id,p_branch_id:row.branchId,
          p_client_return_id:row.clientReturnId||String(row.id),
          p_sale_client_transaction_id:saleTransactionId,p_reason:row.reason||'Customer return',
          p_refund_method:row.method||'cash',p_items:returnItems
        });
        if(error)throw new Error('Return '+(row.clientReturnId||row.id)+': '+error.message);
        row.localBusinessId=activeBusiness.id;row.cloudSyncedFor=activeBusiness.id;
        row.cloudReturnId=data?.return_id||row.cloudReturnId;row.cloudSyncedAt=new Date().toISOString();
        await put('returns',row);returnTotal++;
      }
      const completionMessage = 'Sync complete: ' + total + ' master/expense records, ' + transactionTotal + ' sales/purchases and ' + returnTotal + ' returns uploaded or confirmed; ' + approvalPending + ' operation(s) submitted for approval.';
      await recordSyncHistory({mode:automatic ? 'automatic' : 'manual',status:'success',message:completionMessage,counts:{master:total,transactions:transactionTotal,returns:returnTotal,approvals:approvalPending}});
      autoRetryAttempt = 0;
      syncStatus(completionMessage);
      say('Cloud sync completed: ' + total + ' records, ' + transactionTotal + ' sales/purchases and ' + returnTotal + ' returns; ' + approvalPending + ' approval request(s) submitted.');
    } catch (error) {
      const failureMessage = 'Sync paused: ' + (error?.message || String(error)) + '. Local records are preserved; retry when ready.';
      syncStatus(failureMessage);
      await recordSyncHistory({mode:automatic ? 'automatic' : 'manual',status:'failed',message:failureMessage});
      if (automatic) scheduleAutomaticRetry(syncBusinessId);
    } finally {
      syncInProgress = false;
      if (button) { button.disabled = false; button.textContent = 'Sync now'; }
      if (businessSelect) businessSelect.disabled = false;
      if (branchSelect) branchSelect.disabled = false;
      await updateSyncStatus();
    }
  }
  window.addEventListener('online', () => {
    autoRetryAttempt = 0;
    if (activeBusiness && autoSyncEnabled) {
      syncStatus('Internet restored. Checking eligible records for this workspace…');
      scheduleAutomaticSync('connection-restored', 1200);
    } else if (activeBusiness) syncStatus('Internet restored. Automatic sync is off; use Sync now when ready.');
  });
  window.addEventListener('offline', () => {
    if (activeBusiness) syncStatus('Offline. Records stay on this device; automatic sync will retry when the connection returns.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeBusiness && autoSyncEnabled && navigator.onLine !== false) {
      scheduleAutomaticSync('app-returned-to-foreground', 900);
    }
  });

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve; script.onerror = () => reject(new Error('Could not load Supabase library.'));
      document.head.appendChild(script);
    });
  }
  async function init() {
    addPanel();
    try {
      await loadSdk();
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      // Publish the client as soon as it exists. Do not make developer tools
      // wait for getSession() or workspace loading to finish before they can
      // obtain the client. RPC authorization and RLS remain enforced by Supabase.
      window.whiteLionCloud = {
        getClient: () => client,
        getSession: () => session,
        getActiveBusiness: () => activeBusiness,
        getSelectedBranch: () => selectedBranch,
        getBranches: () => (window.__wlBranches || []).filter(b => b.is_active),
        getApprovalSettings: () => ({...approvalSettings}),
        updateBusinessProfile,
        uploadBusinessLogo,
        getBusinessLogoUrl,
        refreshApprovalSettings
      };
      window.dispatchEvent(new CustomEvent('whiteLionCloudReady'));

      client.auth.onAuthStateChange((event, nextSession) => {
        session = nextSession;
        if (event === 'INITIAL_SESSION') return;
        if (session) setTimeout(() => loadBusinesses().catch(error => say(error.message || 'Workspace loading failed.')), 0);
        else showSignedOut();
      });

      // Session retrieval and workspace loading are separate startup stages.
      // A session lookup failure must not hide the already-created client.
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        say('Database client connected, but login session could not be checked: ' + sessionError.message);
        return;
      }
      session = data.session;
      if (session) await loadBusinesses();
      else showSignedOut();
    } catch (error) {
      say(error.message || 'Cloud connection could not be initialised.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();