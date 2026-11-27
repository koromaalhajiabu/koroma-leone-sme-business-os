/* Koroma Leone Tech — standalone Match Operations sign-in and workspace shell.
   Reuses the existing SME OS Supabase project, identities, licence records and RLS. */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://nclncqlgnxnijlumznnt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_iPIsAysPnlvPCAoqntoNRg_dKcSZxKX';
  const $ = (id) => document.getElementById(id);
  const db = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storageKey: 'klt-match-operations-auth-v1',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }) : null;

  if (!db) {
    const message = document.getElementById('login-notice');
    if (message) {
      message.textContent = 'The secure sign-in library is unavailable. Check your connection and refresh this page.';
      message.classList.add('error');
    }
    const signIn = document.getElementById('sign-in-button');
    const reset = document.getElementById('reset-password');
    if (signIn) signIn.disabled = true;
    if (reset) reset.disabled = true;
    return;
  }

  let session = null;
  let activeBusiness = null;
  let businesses = [];
  let syncRun = 0;
  let activeUserId = '';
  let noticeTimer = null;
  const adminUrl = new URL('../index.html', window.location.href).href;

  window.whiteLionCloud = {
    getClient: () => db,
    getSession: () => session,
    getActiveBusiness: () => activeBusiness
  };
  // The shared Match Operations module sends workspace setup actions back to
  // the main SME OS, where competitions, fixtures and staff accounts are managed.
  window.setPage = () => {
    const role = String(activeBusiness?.role || '').toLowerCase();
    if (!['owner', 'admin', 'manager'].includes(role)) {
      const message = document.getElementById('slfaOpsNotice');
      if (message) {
        message.textContent = 'Workspace administration is restricted to association owners, administrators and managers. Your Match Operations permissions remain unchanged.';
        message.hidden = false;
      }
      return;
    }
    window.open(adminUrl, '_blank', 'noopener');
  };

  function notice(message, kind) {
    const panel = $('login-notice');
    if (!panel) return;
    panel.textContent = String(message || '');
    panel.className = 'notice' + (kind ? ' ' + kind : '');
    panel.hidden = false;
  }

  function showLogin(message, kind) {
    $('login-panel').hidden = false;
    $('access-panel').hidden = true;
    $('workspace-panel').hidden = true;
    $('login-password').value = '';
    if (message) notice(message, kind || 'info');
    $('sign-in-button').disabled = false;
    $('sign-in-button').textContent = 'Sign in securely';
  }

  function showAccess(message) {
    $('login-panel').hidden = true;
    $('workspace-panel').hidden = true;
    $('access-panel').hidden = false;
    $('access-message').textContent = String(message || 'Your account is not currently assigned to an active association workspace with Match Operations enabled.');
  }

  function showWorkspace() {
    $('login-panel').hidden = true;
    $('access-panel').hidden = true;
    $('workspace-panel').hidden = false;
    $('account-label').textContent = session?.user?.email || '';
    const picker = $('workspace-picker');
    const wrap = $('workspace-picker-wrap');
    if (businesses.length > 1) {
      wrap.hidden = false;
      picker.innerHTML = businesses.map((b) => '<option value="' + escapeHtml(b.id) + '">' + escapeHtml(b.name) + '</option>').join('');
      picker.value = activeBusiness?.id || '';
    } else {
      wrap.hidden = true;
      picker.innerHTML = '';
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function clearWorkspace() {
    activeBusiness = null;
    businesses = [];
    $('view').innerHTML = '';
    window.whiteLionCloud = {
      getClient: () => db,
      getSession: () => session,
      getActiveBusiness: () => null
    };
  }

  async function signOut() {
    try {
      await db.auth.signOut();
    } catch (error) {
      showAccess('Sign-out could not be completed: ' + (error?.message || 'Unknown error') + '. Close this browser tab after retrying.');
    }
  }

  async function activateBusiness(businessId) {
    const selected = businesses.find((b) => b.id === businessId);
    if (!selected) return;
    activeBusiness = selected;
    window.whiteLionCloud = {
      getClient: () => db,
      getSession: () => session,
      getActiveBusiness: () => activeBusiness
    };
    showWorkspace();
    $('view').innerHTML = '<div class="panel"><p class="panel-intro">Loading your association workspace and verifying the Match Operations licence…</p></div>';
    if (!window.KoromaSlfaMatchOperations?.render) {
      $('view').innerHTML = '<div class="panel"><h2>Application module unavailable</h2><p class="panel-intro">The Match Operations module did not load. Refresh the page or contact Koroma Leone Tech.</p></div>';
      return;
    }
    await window.KoromaSlfaMatchOperations.render();
  }

  async function loadEligibleWorkspaces(currentRun) {
    const access = await db.rpc('get_my_platform_access_status');
    if (currentRun !== syncRun) return;
    if (access.error) throw new Error('Account approval could not be verified: ' + access.error.message);
    if (!access.data?.can_access) {
      clearWorkspace();
      showAccess('Your account is not yet authorised for the SME Business OS. Confirm your email and complete the association workspace approval process before signing in here.');
      return;
    }

    const { data: memberRows, error: memberError } = await db.from('business_members')
      .select('business_id,role,is_active,businesses(id,name,industry,currency_code)')
      .eq('user_id', session.user.id)
      .eq('is_active', true);
    if (currentRun !== syncRun) return;
    if (memberError) throw new Error('Your association membership could not be loaded: ' + memberError.message);

    const membershipList = (memberRows || [])
      .filter((row) => row.businesses?.id)
      .map((row) => ({ ...row.businesses, role: row.role }));
    if (!membershipList.length) {
      clearWorkspace();
      showAccess('Your account is not an active member of an association workspace. Ask the association administrator to add your account before using Match Operations.');
      return;
    }

    const businessIds = membershipList.map((b) => b.id);
    const { data: modules, error: moduleError } = await db.from('business_industry_modules')
      .select('business_id,module_key,is_enabled')
      .in('business_id', businessIds)
      .eq('module_key', 'slfa_match_ops')
      .eq('is_enabled', true);
    if (currentRun !== syncRun) return;
    if (moduleError) throw new Error('Match Operations access could not be verified: ' + moduleError.message);

    const enabled = new Set((modules || []).map((m) => m.business_id));
    businesses = membershipList.filter((b) => enabled.has(b.id));
    if (!businesses.length) {
      clearWorkspace();
      showAccess('Your account is signed in, but no association workspace has Match Operations enabled. Contact the association administrator or Koroma Leone Tech to complete product setup and licensing.');
      return;
    }

    const priorId = activeBusiness?.id;
    const selected = businesses.find((b) => b.id === priorId) || businesses[0];
    await activateBusiness(selected.id);
  }

  async function syncSession(nextSession) {
    const currentRun = ++syncRun;
    session = nextSession || null;
    if (!session) {
      activeUserId = '';
      clearWorkspace();
      showLogin('Sign in with your approved association account. Public account registration is disabled on this portal.', 'info');
      return;
    }
    activeUserId = session.user.id;
    $('sign-in-button').disabled = false;
    $('sign-in-button').textContent = 'Sign in securely';
    try {
      await loadEligibleWorkspaces(currentRun);
    } catch (error) {
      if (currentRun !== syncRun) return;
      clearWorkspace();
      showAccess(error?.message || 'Your workspace could not be loaded. Try again or contact Koroma Leone Tech.');
    }
  }

  $('sign-in-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return notice('Enter your approved email address and password.', 'error');
    $('sign-in-button').disabled = true;
    $('sign-in-button').textContent = 'Verifying…';
    notice('Verifying your account and association access…', 'info');
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      $('sign-in-button').disabled = false;
      $('sign-in-button').textContent = 'Sign in securely';
      return notice(error.message || 'Sign-in failed. Check your details and try again.', 'error');
    }
    await syncSession(data.session);
  });

  $('reset-password').addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    if (!email) return notice('Enter your account email first, then select Reset password.', 'error');
    $('reset-password').disabled = true;
    const { error } = await db.auth.resetPasswordForEmail(email);
    $('reset-password').disabled = false;
    if (error) return notice(error.message || 'Password reset could not be requested.', 'error');
    notice('A password reset link has been requested. Check the email inbox for this account.', 'info');
  });

  $('workspace-picker').addEventListener('change', async (event) => {
    try {
      await activateBusiness(event.target.value);
    } catch (error) {
      showAccess(error?.message || 'The selected association workspace could not be opened.');
    }
  });

  $('workspace-sign-out').addEventListener('click', signOut);
  $('access-sign-out').addEventListener('click', signOut);

  db.auth.onAuthStateChange((event, nextSession) => {
    // Defer Supabase calls until after its auth callback has returned.
    window.setTimeout(() => {
      if (!nextSession) {
        void syncSession(null);
      } else if (nextSession.user.id !== activeUserId || $('login-panel').hidden === false) {
        void syncSession(nextSession);
      } else {
        session = nextSession;
      }
    }, 0);
  });

  (async function init() {
    if (!window.supabase?.createClient) {
      showLogin('The secure database library did not load. Check your internet connection and refresh.', 'error');
      return;
    }
    const { data, error } = await db.auth.getSession();
    if (error) {
      showLogin('The saved login session could not be checked: ' + error.message, 'error');
      return;
    }
    if (data.session) await syncSession(data.session);
    else showLogin();
  })();
})();
