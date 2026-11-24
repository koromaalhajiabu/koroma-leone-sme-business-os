/* Koroma Leone Tech — Football Club Operations & Launch Centre
 * Read-only operational view. Uses the existing developer-only application RPC;
 * launch checks are guidance and never mark a club published automatically.
 */
(function () {
  'use strict';
  if (window.KoromaClubOperationsCentre) return;
  const cloud = () => window.whiteLionCloud;
  const client = () => cloud()?.getClient?.();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let busy = false;

  const css = `
  #klClubOpsCentre{margin-top:18px;padding:16px;border:1px solid #d6ad57;border-radius:14px;background:linear-gradient(145deg,#17283f,#101d31);color:#fff}
  #klClubOpsCentre h3{margin:0;color:#f0d28b;font-size:16px}
  #klClubOpsCentre .kloc-sub{color:#c4d0df;font-size:11px;line-height:1.6;margin-top:5px}
  #klClubOpsCentre .kloc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:13px 0}
  #klClubOpsCentre .kloc-card{background:#203653;border:1px solid #40536d;border-radius:10px;padding:11px;min-width:0}
  #klClubOpsCentre .kloc-card b{display:block;color:#f3d99e;font-size:19px}
  #klClubOpsCentre .kloc-card span{display:block;color:#d0d9e5;font-size:10px;margin-top:3px}
  #klClubOpsCentre .kloc-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
  #klClubOpsCentre a,#klClubOpsCentre button{display:inline-flex;align-items:center;justify-content:center;border:1px solid #64758d;border-radius:8px;padding:8px 10px;background:#f0d28b;color:#17283f;text-decoration:none;font-size:11px;font-weight:750;cursor:pointer}
  #klClubOpsCentre button.secondary,#klClubOpsCentre a.secondary{background:#203653;color:#fff}
  #klClubOpsCentre .kloc-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  #klClubOpsCentre .kloc-step{background:#203653;border:1px solid #40536d;border-radius:9px;padding:10px;font-size:11px;line-height:1.5;color:#e4eaf2}
  #klClubOpsCentre .kloc-step strong{display:block;color:#f3d99e;margin-bottom:3px}
  #klClubOpsCentre .kloc-note{font-size:10px;color:#b9c7d8;margin-top:10px;line-height:1.6}
  @media(max-width:650px){#klClubOpsCentre .kloc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#klClubOpsCentre .kloc-list{grid-template-columns:1fr}}
  `;
  function mount() {
    const host = document.getElementById('wlDeveloperBox');
    if (!host || document.getElementById('klClubOpsCentre')) return;
    if (!document.getElementById('klClubOpsStyle')) {
      const style = document.createElement('style'); style.id = 'klClubOpsStyle'; style.textContent = css; document.head.appendChild(style);
    }
    const section = document.createElement('section');
    section.id = 'klClubOpsCentre';
    section.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div><h3>Football Club Operations &amp; Launch Centre</h3><div class="kloc-sub">Operational overview for club onboarding, verification, website launch and scouting readiness.</div></div>
        <button type="button" id="klocRefresh">Refresh status</button>
      </div>
      <div class="kloc-grid">
        <div class="kloc-card"><b id="klocPending">—</b><span>Open applications requiring review</span></div>
        <div class="kloc-card"><b>Manager-led</b><span>Website publication and content approval</span></div>
        <div class="kloc-card"><b>Consent-gated</b><span>Player discovery and youth safeguarding</span></div>
      </div>
      <div class="kloc-actions">
        <a href="./club-apply.html" target="_blank" rel="noopener">Open club application ↗</a>
        <a class="secondary" href="./football-scouting.html" target="_blank" rel="noopener">Scouting portal ↗</a>
        <a class="secondary" href="./club-website.html" target="_blank" rel="noopener">Public club website ↗</a>
        <button class="secondary" type="button" id="klocApps">Open application review</button>
      </div>
      <div class="kloc-list">
        <div class="kloc-step"><strong>1 · Activate the club manager</strong>Require email confirmation, review the club authority evidence, then approve the application. Approval provisions the club workspace, owner membership, main branch and unpublished website draft.</div>
        <div class="kloc-step"><strong>2 · Verify the club record</strong>Check the official club name, manager identity, registration details, competition, home ground and contact information against submitted evidence.</div>
        <div class="kloc-step"><strong>3 · Complete the website launch checklist</strong>Manager adds the crest, club profile, contact details, management/staff, squad, pages and current club information; preview the public site before publishing.</div>
        <div class="kloc-step"><strong>4 · Register and maintain players</strong>Use the club's authorised squad/player records in the Sports &amp; Local League workspace. Keep identity, position, squad status and statistics accurate; do not publish private contact or date-of-birth data.</div>
        <div class="kloc-step"><strong>5 · Prepare scouting profiles</strong>Only publish eligible player profiles after club approval and required player/guardian consent. Under-18 profiles remain subject to guardian consent and youth privacy safeguards.</div>
        <div class="kloc-step"><strong>6 · Monitor delegated access and publication</strong>Confirm the manager explicitly authorises developer access before editing on their behalf. Respect direct-publish or manager-approval mode and revoke access when instructed.</div>
      </div>
      <div class="kloc-note" id="klocStatus" role="status">Live application count will load when the developer session is available. Website and player launch checks are operational checklists, not automatic certification.</div>
    `;
    host.appendChild(section);
    section.querySelector('#klocRefresh').addEventListener('click', refresh);
    section.querySelector('#klocApps').addEventListener('click', () => {
      const panel = document.getElementById('klwClubApplicationAdmin');
      if (panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
      else setStatus('The Football Club Applications panel is not mounted. Refresh the developer console or confirm the onboarding module loaded.', true);
    });
    refresh();
  }
  function setStatus(message, error) {
    const el = document.getElementById('klocStatus');
    if (el) { el.textContent = message; el.style.color = error ? '#ffb5b5' : '#b9c7d8'; }
  }
  async function refresh() {
    if (busy) return;
    const c = client();
    if (!c || !c.auth || typeof c.auth.getSession !== 'function') {
      setStatus('The platform session client is not ready. Refresh this panel after the developer console finishes loading.', true);
      return;
    }
    busy = true;
    setStatus('Checking the developer-only club application queue…');
    try {
      const sessionResult = await c.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data?.session?.user) {
        setStatus('No active Supabase session was found for this browser tab. Please refresh the page and confirm the developer account is still signed in.', true);
        return;
      }
      const r = await c.rpc('get_platform_club_applications');
      if (r.error) throw r.error;
      const rows = Array.isArray(r.data) ? r.data : [];
      const count = document.getElementById('klocPending');
      if (count) count.textContent = String(rows.length);
      setStatus('Live queue checked at ' + new Date().toLocaleTimeString() + '. The count includes open applications only; approved club totals and website publication states are not inferred from this queue.');
    } catch (e) {
      setStatus('Could not load the live queue: ' + (e?.message || String(e)) + '. Existing application review remains available in its own panel.', true);
    } finally { busy = false; }
  }
  function ready() { setTimeout(mount, 900); }
  window.addEventListener('whiteLionCloudReady', ready);
  window.addEventListener('whiteLionDeveloperPanelReady', ready);
  window.KoromaClubOperationsCentre = { mount, refresh };
  ready();
})();