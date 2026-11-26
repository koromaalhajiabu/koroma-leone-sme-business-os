import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.WHITE_LION_SMOKE_URL || 'https://koromaalhajiabu.github.io/koroma-leone-sme-business-os/';
const testEmail = process.env.WHITE_LION_TEST_EMAIL || '';
const testPassword = process.env.WHITE_LION_TEST_PASSWORD || '';
const hasTestCredentials = Boolean(testEmail && testPassword);
const report = { testedAt: new Date().toISOString(), base, browsers: [], summary: 'running' };

function record(result, name, pass, details = {}) {
  result.checks.push({ name, pass: Boolean(pass), ...details });
}

function skip(result, name, reason) {
  result.checks.push({ name, skipped: true, reason });
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const result = { name, viewport, pageErrors: [], consoleErrors: [], failedRequests: [], checks: [] };
  page.on('pageerror', e => result.pageErrors.push(String(e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
  page.on('requestfailed', r => result.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));

  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.ready; } catch (_) {}
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);

    result.startup = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const auth = document.querySelector('#wlCloudAuth');
      const sidebar = document.querySelector('#sidebar');
      const visible = el => {
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
      };
      return {
        title: document.title,
        ready: document.readyState,
        startupComplete: !!window.__wlStartupComplete,
        startupError: window.__wlStartupError || null,
        scriptFailures: window.__wlScriptFail || [],
        serviceWorkerControlled: !!navigator.serviceWorker?.controller,
        serviceWorkerScript: navigator.serviceWorker?.controller?.scriptURL || null,
        publicMode: !!app?.classList.contains('wl-public-mode'),
        loginVisible: visible(document.querySelector('#wlCloudBox')) && visible(auth) &&
          visible(document.querySelector('#wlCloudEmail')) &&
          visible(document.querySelector('#wlCloudPassword')) &&
          visible(document.querySelector('#wlSignIn')),
        sidebarVisible: visible(sidebar),
        currentCrumb: document.querySelector('#crumb')?.textContent || null,
        viewText: (document.querySelector('#view')?.innerText || '').slice(0, 350)
      };
    });

    record(result, 'application startup completed', !!result.startup.startupComplete, {
      startupError: result.startup.startupError,
      scriptFailures: result.startup.scriptFailures
    });
    record(result, 'service worker controls app after reload', !!result.startup.serviceWorkerControlled, {
      script: result.startup.serviceWorkerScript
    });

    // Verify that both language controls translate the current screen and later-added UI.
    const languageCheck = await page.evaluate(async () => {
      const top = document.querySelector('#wlLanguage');
      const side = document.querySelector('#wlLanguageSidebar');
      if (!top) return { error: 'The primary language selector is missing.' };
      const choose = async (select, code) => {
        select = select || top;
        select.value = code;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 80));
      };
      const operationCoverage = () => ({
        employee: window.wlTranslateText?.('Employee directory') || '',
        inventory: window.wlTranslateText?.('Barcode lookup & scanning') || '',
        accounting: window.wlTranslateText?.('Cloud accounting snapshot') || '',
        attendance: window.wlTranslateText?.('Staff attendance register') || '',
        dynamicCounts: window.wlTranslateText?.('0 sales, 0 purchases and 0 expense records.') || '',
        localizedDate: new Date(2026, 10, 25).toLocaleDateString()
      });
      const guardedScript = document.querySelector('#wl-appearance-controller');
      window.__wlAppearanceScriptBefore = guardedScript?.textContent || '';
      await choose(top, 'fr');
      const french = {
        ready: !!window.__wlI18nReady,
        code: document.documentElement.lang,
        active: window.wlGetLanguage?.() || null,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || '',
        visibleText: document.body.innerText || '',
        domText: (() => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const parts = []; let node;
          while ((node = walker.nextNode())) {
            if (!node.parentElement?.closest('script,style,noscript,template,code,pre,textarea,[data-wl-no-translate]')) parts.push(node.nodeValue);
          }
          return parts.join(' ');
        })(),
        sidebarText: document.querySelector('#sidebar')?.textContent || '',
        scriptTextUnchanged: (() => {
          const script = document.querySelector('#wl-appearance-controller');
          return !!script && script.textContent === window.__wlAppearanceScriptBefore;
        })()
      };
      const probe = document.createElement('span');
      probe.textContent = 'Business name';
      document.body.appendChild(probe);
      await new Promise(resolve => setTimeout(resolve, 80));
      french.dynamicText = probe.textContent.trim();
      probe.remove();
      const salesProbe = document.createElement('span');
      salesProbe.textContent = 'Sales counter';
      document.body.appendChild(salesProbe);
      await new Promise(resolve => setTimeout(resolve, 80));
      french.salesHeading = salesProbe.textContent.trim();
      salesProbe.textContent = 'Scan or select a product to begin.';
      await new Promise(resolve => setTimeout(resolve, 80));
      french.salesEmptyState = salesProbe.textContent.trim();
      salesProbe.remove();
      const mixedProbe = document.createElement('span');
      mixedProbe.textContent = 'Current theme: Light mode';
      document.body.appendChild(mixedProbe);
      await new Promise(resolve => setTimeout(resolve, 80));
      french.mixedCopy = mixedProbe.textContent.trim();
      french.partialCopy = window.wlTranslateText?.('Run your business with clarity.') || '';
      french.signedOutNotice = window.wlTranslateText?.('Not signed in. Create an account or sign in to continue.') || '';
      french.passwordLabel = window.wlTranslateText?.('Password') || '';
      french.showLabel = window.wlTranslateText?.('Show') || '';
      french.englishOption = window.wlTranslateText?.('English') || '';
      french.syncDescription = window.wlTranslateText?.("Track this workspace's device queue, cloud receipts, conflicts and retry activity.") || '';
      french.syncAutoDescription = window.wlTranslateText?.("Automatic sync runs only while the app is open, signed in and connected. It uploads records already assigned to this business. Unassigned records are excluded. Purchase, expense and refund approvals remain in force.") || '';
      french.notificationTip = window.wlTranslateText?.("Choose which categories appear in your Alerts centre.") || '';
      french.clubStepOne = window.wlTranslateText?.("1 · Activate the club manager Require email confirmation, review the club authority evidence, then approve the application. Approval provisions the club workspace, owner membership, primary branch and unpublished website draft.") || '';
      french.categoryRetail = window.wlTranslateText?.('Retail') || '';
      french.categoryDelivery = window.wlTranslateText?.('Delivery') || '';
      french.starterBuild = window.wlTranslateText?.('Starter build') || '';
      french.clubLaunchBody = window.wlTranslateText?.('Require email confirmation, review the club authority evidence, then approve the application.') || '';
      french.executiveProfit = window.wlTranslateText?.('Cost-covered gross profit') || '';
      french.reorderMetric = window.wlTranslateText?.('Forecast daily demand') || '';
      french.stockStatus = window.wlTranslateText?.('Out of stock') || '';
      french.managerBadge = window.wlTranslateText?.('Manager-led') || '';
      french.playerBadge = window.wlTranslateText?.('Consent-gated') || '';
      french.hospitalModule = window.wlTranslateText?.('Patient records') || '';
      french.hospitalCharge = window.wlTranslateText?.('Record a hospital service or admission charge') || '';
      french.studentPortalFail = window.wlTranslateText?.('Student portal failed to load.') || '';
      french.subscriptionState = window.wlTranslateText?.('Paid subscription active') || '';
      french.playerConsent = window.wlTranslateText?.('This club requires manager approval. Your draft profile will be submitted to the existing Approval inbox.') || '';
      french.branchReport = window.wlTranslateText?.('Review branch sales by day, stock availability, opening hours and customer activity before changing prices or staffing.') || '';
      french.leagueSettings = window.wlTranslateText?.('League Settings') || '';
      french.industryChoice = window.wlTranslateText?.('Grocery shop') || '';
      french.hospitalityChoice = window.wlTranslateText?.('Bar or lounge') || '';
      french.farmChoice = window.wlTranslateText?.('Poultry farm') || '';
      french.joiner = window.wlTranslateText?.('and') || '';
      french.itemCount = window.wlTranslateText?.('0 items') || '';
      french.refresh = window.wlTranslateText?.('Refresh') || '';
      french.refreshSentence = window.wlTranslateText?.('Refresh customer registrations') || '';
      french.alertSingular = window.wlTranslateText?.('Alert') || '';
      french.receiptTitle = window.wlTranslateText?.('SALES RECEIPT') || '';
      french.dialogText = window.wlTranslateText?.('Delete this record?') || '';
      french.operationsCoverage = operationCoverage();
      mixedProbe.remove();

      await choose(side, 'ar');
      const arabic = {
        code: document.documentElement.lang,
        direction: document.documentElement.dir,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || '',
        operationsCoverage: operationCoverage()
      };
      await choose(side, 'es');
      const spanish = {
        code: document.documentElement.lang,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || '',
        operationsCoverage: operationCoverage()
      };
      await choose(top, 'hi');
      const hindi = {
        code: document.documentElement.lang,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || '',
        operationsCoverage: operationCoverage()
      };
      await choose(side, 'zh');
      const chinese = {
        code: document.documentElement.lang,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || '',
        operationsCoverage: operationCoverage()
      };
      await choose(top, 'en');
      const english = {
        code: document.documentElement.lang,
        top: top.value,
        side: side?.value || top.value,
        overview: document.querySelector('#nav [data-page="dashboard"]')?.textContent || ''
      };
      return { french, arabic, spanish, hindi, chinese, english };
    });
    const frenchCopyPassed = [
      'Bon retour',
      'Gérez votre entreprise',
      'Un espace de travail connecté pour les ventes',
      'Travaillez de partout'
    ].every(value => languageCheck.french?.domText?.includes(value)) &&
      languageCheck.french?.sidebarText?.includes('Aide et assistance') &&
      !['Welcome back','Run your business','One connected workspace for sales','Work from anywhere'].some(value => languageCheck.french?.visibleText?.includes(value)) &&
      !languageCheck.french?.sidebarText?.includes('Help & Support');
    const frenchPassed = languageCheck.french?.ready &&
      languageCheck.french.code === 'fr' && languageCheck.french.active === 'fr' &&
      languageCheck.french.top === 'fr' && languageCheck.french.side === 'fr' &&
      languageCheck.french.overview.includes('Vue d’ensemble') &&
      languageCheck.french.dynamicText === 'Nom de l’entreprise' &&
      languageCheck.french.salesHeading === 'Caisse de vente' &&
      languageCheck.french.salesEmptyState === 'Scannez ou sélectionnez un produit pour commencer.' &&
      languageCheck.french.mixedCopy.includes('Thème actuel') &&
      languageCheck.french.mixedCopy.toLowerCase().includes('mode clair') &&
      languageCheck.french.partialCopy === 'Gérez votre entreprise en toute clarté.' &&
      languageCheck.french.signedOutNotice === 'Vous n’êtes pas connecté. Créez un compte ou connectez-vous pour continuer.' &&
      languageCheck.french.passwordLabel === 'Mot de passe' &&
      languageCheck.french.showLabel === 'Afficher' &&
      languageCheck.french.englishOption === 'Anglais' &&
      languageCheck.french.syncDescription.startsWith('Suivez la file d’attente') &&
      languageCheck.french.syncAutoDescription.startsWith('La synchronisation automatique') &&
      languageCheck.french.notificationTip === 'Choisissez les catégories qui apparaissent dans votre centre d’alertes.' &&
      languageCheck.french.clubStepOne.startsWith('1 · Activer le responsable du club') &&
      languageCheck.french.categoryRetail === 'Commerce de détail' &&
      languageCheck.french.categoryDelivery === 'Livraison' &&
      languageCheck.french.starterBuild === 'Version de démarrage' &&
      languageCheck.french.clubLaunchBody.startsWith('Exigez la confirmation') &&
      languageCheck.french.executiveProfit === 'Bénéfice brut couvert par les coûts' &&
      languageCheck.french.reorderMetric === 'Demande quotidienne prévue' &&
      languageCheck.french.stockStatus === 'En rupture de stock' &&
      languageCheck.french.managerBadge === 'Géré par le responsable' &&
      languageCheck.french.playerBadge === 'Soumis au consentement' &&
      languageCheck.french.hospitalModule === 'Dossiers des patients' &&
      languageCheck.french.hospitalCharge === 'Enregistrer une prestation hospitalière ou des frais d’admission' &&
      languageCheck.french.studentPortalFail === 'Le portail étudiant n’a pas pu se charger.' &&
      languageCheck.french.subscriptionState === 'Abonnement payant actif' &&
      languageCheck.french.playerConsent.startsWith('Ce club exige l’approbation') &&
      languageCheck.french.branchReport.startsWith('Examinez les ventes de la succursale') &&
      languageCheck.french.leagueSettings === 'Paramètres de la ligue' &&
      languageCheck.french.industryChoice === 'Épicerie' &&
      languageCheck.french.hospitalityChoice === 'Bar ou salon' &&
      languageCheck.french.farmChoice === 'Élevage de volailles' &&
      languageCheck.french.joiner === 'et' &&
      languageCheck.french.itemCount === '0 articles' &&
      languageCheck.french.refresh === 'Actualiser' &&
      languageCheck.french.refreshSentence.startsWith('Actualiser') &&
      languageCheck.french.alertSingular === 'Alerte' &&
      !/\band\b/i.test(languageCheck.french.domText) &&
      !/\bitems\b/i.test(languageCheck.french.domText) &&
      !/\bRefresh\b/i.test(languageCheck.french.domText) &&
      !languageCheck.french.sidebarText.includes('undefined') &&
      languageCheck.french.receiptTitle === 'REÇU DE VENTE' &&
      languageCheck.french.dialogText === 'Supprimer cet enregistrement ?' &&
      languageCheck.french.scriptTextUnchanged && frenchCopyPassed;
    const arabicPassed = languageCheck.arabic?.code === 'ar' &&
      languageCheck.arabic.direction === 'rtl' &&
      languageCheck.arabic.top === 'ar' && languageCheck.arabic.side === 'ar' &&
      languageCheck.arabic.overview.includes('نظرة عامة');
    const spanishPassed = languageCheck.spanish?.code === 'es' &&
      languageCheck.spanish.top === 'es' && languageCheck.spanish.side === 'es' &&
      languageCheck.spanish.overview.includes('Resumen');
    const hindiPassed = languageCheck.hindi?.code === 'hi' &&
      languageCheck.hindi.top === 'hi' && languageCheck.hindi.side === 'hi' &&
      languageCheck.hindi.overview.includes('अवलोकन');
    const chinesePassed = languageCheck.chinese?.code === 'zh' &&
      languageCheck.chinese.top === 'zh' && languageCheck.chinese.side === 'zh' &&
      !languageCheck.chinese.overview.includes('Overview');
    const englishPassed = languageCheck.english?.code === 'en' &&
      languageCheck.english.top === 'en' && languageCheck.english.side === 'en' &&
      languageCheck.english.overview.includes('Overview');
    const expectedOperations = {
      fr: { employee:'Répertoire des employés', inventory:'Recherche et scan de codes-barres', accounting:'Aperçu de la comptabilité cloud', attendance:'Registre de présence du personnel', dynamicCounts:'0 vente, 0 achat et 0 écriture de dépense.' },
      es: { employee:'Directorio de empleados', inventory:'Búsqueda y escaneo de códigos de barras', accounting:'Resumen de contabilidad en la nube', attendance:'Registro de asistencia del personal', dynamicCounts:'0 ventas, 0 compras y 0 registros de gastos.' },
      ar: { employee:'دليل الموظفين', inventory:'البحث عن الرموز الشريطية ومسحها', accounting:'لمحة عن المحاسبة السحابية', attendance:'سجل حضور الموظفين', dynamicCounts:'0 مبيعات و0 مشتريات و0 سجلات مصروفات.' },
      hi: { employee:'कर्मचारी निर्देशिका', inventory:'बारकोड खोज और स्कैनिंग', accounting:'क्लाउड लेखांकन स्नैपशॉट', attendance:'कर्मचारी उपस्थिति रजिस्टर', dynamicCounts:'0 बिक्री, 0 खरीद और 0 व्यय रिकॉर्ड।' },
      zh: { employee:'员工目录', inventory:'条码查询与扫描', accounting:'云端会计概览', attendance:'员工考勤登记', dynamicCounts:'0 笔销售、0 笔采购和 0 条费用记录。' }
    };
    const operationsLanguagePassed = Object.entries(expectedOperations).every(([code, expected]) =>
      Object.entries(expected).every(([key, value]) => languageCheck[({fr:'french',es:'spanish',ar:'arabic',hi:'hindi',zh:'chinese'})[code]]?.operationsCoverage?.[key] === value)
    );
    const datePatterns = {
      fr: /25[\/]11[\/]2026/, es: /25[\/]11[\/]2026/, ar: /25.*11.*2026/,
      hi: /25[\/]11[\/]2026/, zh: /2026[\/]11[\/]25/
    };
    const languageNames = {fr:'french',es:'spanish',ar:'arabic',hi:'hindi',zh:'chinese'};
    const localizedDatesPassed = Object.entries(datePatterns).every(([code, pattern]) =>
      pattern.test(languageCheck[languageNames[code]]?.operationsCoverage?.localizedDate || '')
    );
    record(result, 'default date formatting follows the selected language', localizedDatesPassed, {
      actual: Object.fromEntries(Object.entries(languageNames).map(([code,name]) =>
        [code, languageCheck[name]?.operationsCoverage?.localizedDate || null]))
    });
    record(result, 'inventory, accounting, payroll and dynamic transaction messages translate in all five languages',
      operationsLanguagePassed, {
        expected: expectedOperations,
        actual: {
          fr:languageCheck.french?.operationsCoverage,
          es:languageCheck.spanish?.operationsCoverage,
          ar:languageCheck.arabic?.operationsCoverage,
          hi:languageCheck.hindi?.operationsCoverage,
          zh:languageCheck.chinese?.operationsCoverage
        }
      });
    record(result, 'French translates the public sign-in copy and extended navigation', frenchCopyPassed, {
      expectedFrench: ['Bon retour','Gérez votre entreprise','Un espace de travail connecté pour les ventes','Travaillez de partout','Aide et assistance'],
      forbiddenEnglish: ['Welcome back','Run your business','One connected workspace for sales','Work from anywhere','Help & Support']
    });
    record(result, 'all six language choices translate navigation and synchronise both selectors',
      Boolean(frenchPassed && arabicPassed && spanishPassed && hindiPassed && chinesePassed && englishPassed), {
        french:languageCheck.french,arabic:languageCheck.arabic,spanish:languageCheck.spanish,
        hindi:languageCheck.hindi,chinese:languageCheck.chinese,english:languageCheck.english
      });

    if (viewport.isMobile) {
      const mobileDockCheck = await page.evaluate(() => {
        const app=document.querySelector('.app');
        const dock=document.querySelector('#wlPeDock');
        const topAlerts=document.querySelector('#wlPeAlerts');
        if(!app||!dock||!topAlerts)return {pass:false,error:'Mobile dock or top Alerts control is missing.'};
        app.classList.remove('wl-public-mode');
        app.classList.add('wl-authenticated');
        const labels=[...dock.querySelectorAll('button')].map(button=>button.innerText.replace(/\\s+/g,' ').trim());
        const destinations=[...dock.querySelectorAll('[data-wl-dock]')].map(button=>button.dataset.wlDock);
        const dockVisible=getComputedStyle(dock).display!=='none'&&dock.getBoundingClientRect().width>0;
        const alertsOnlyAtTop=!dock.innerText.toLowerCase().includes('alerts')&&
          document.querySelectorAll('#wlPeAlerts').length===1;
        const expected=['Overview','Sales','Stock','Menu'];
        const pass=dockVisible&&labels.length===4&&labels.every((label,index)=>label===expected[index])&&
          destinations.join(',')==='dashboard,sales,inventory'&&alertsOnlyAtTop;
        return {pass,dockVisible,labels,destinations,alertsOnlyAtTop,topAlertsVisible:getComputedStyle(topAlerts).display!=='none'};
      });
      record(result,'mobile dock shows Overview instead of duplicate Alerts and retains one top Alerts control',mobileDockCheck.pass,mobileDockCheck);
      const mobileLayout = await page.evaluate(() => {
        const viewportMeta = document.querySelector('meta[name="viewport"]')?.content || '';
        const width = document.documentElement.clientWidth;
        const screenWidth = window.innerWidth;
        return {
          viewportMeta,
          viewportConfigured: /width\s*=\s*device-width/i.test(viewportMeta),
          screenWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > screenWidth + 1,
          visualViewportWidth: window.visualViewport?.width || null,
          layoutViewportMatchesScreen: Math.abs(width - screenWidth) <= 1
        };
      });
      record(result, 'Android viewport is configured for device width', mobileLayout.viewportConfigured, mobileLayout);
      record(result, 'Android layout has no page-level horizontal overflow', !mobileLayout.horizontalOverflow, mobileLayout);
      record(result, 'Android layout viewport matches device width', mobileLayout.layoutViewportMatchesScreen, mobileLayout);
    }

    // Simulate the authenticated visual state to verify Workspace Tools cannot overlap Overview.
    const workspacePanelLayout = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const panel = document.querySelector('#wlCloudBox');
      const view = document.querySelector('#view');
      const footer = document.querySelector('.footer');
      const toggle = document.querySelector('#wlWorkspaceToolsToggle');
      if (!app || !panel || !view || !footer || !toggle) return { pass:false, error:'Required dashboard layout element is missing.' };
      const wasPublic = app.classList.contains('wl-public-mode');
      app.classList.remove('wl-public-mode');
      app.classList.add('wl-authenticated');
      panel.classList.remove('wl-tools-open');
      toggle.click();
      const panelRect = panel.getBoundingClientRect();
      const viewRect = view.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const topbarRect = document.querySelector('.topbar')?.getBoundingClientRect();
      const position = getComputedStyle(panel).position;
      const panelBeforeFooter = Boolean(panel.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
      const ownerPanel = document.querySelector('#wlDeveloperBox');
      const ownerAfterFooter = !ownerPanel || Boolean(footer.compareDocumentPosition(ownerPanel) & Node.DOCUMENT_POSITION_FOLLOWING);
      const opened = panel.classList.contains('wl-tools-open') && toggle.getAttribute('aria-expanded') === 'true';
      const visible = getComputedStyle(panel).display !== 'none' && panelRect.width > 0 && panelRect.height > 0;
      const overviewVisible = !topbarRect || viewRect.top >= topbarRect.bottom - 1;
      const pass = panelBeforeFooter && ownerAfterFooter && opened && visible && overviewVisible && position === 'static' &&
        panelRect.top >= viewRect.bottom - 1 && footerRect.top >= panelRect.bottom - 1;
      panel.classList.remove('wl-tools-open');
      toggle.setAttribute('aria-expanded','false');
      app.classList.remove('wl-authenticated');
      if (wasPublic) app.classList.add('wl-public-mode');
      return { pass, panelBeforeFooter, ownerAfterFooter, opened, visible, overviewVisible, position,
        panelTop:Math.round(panelRect.top), viewTop:Math.round(viewRect.top),
        viewBottom:Math.round(viewRect.bottom), panelBottom:Math.round(panelRect.bottom), footerTop:Math.round(footerRect.top) };
    });
    record(result, 'Overview remains visible and Workspace Tools stays below it', workspacePanelLayout.pass, workspacePanelLayout);
    const mobileDockCheck = await page.evaluate(() => {
      const dock = document.querySelector('#wlPeDock');
      const buttons = dock ? [...dock.querySelectorAll('button')] : [];
      const labels = buttons.map(button => button.getAttribute('aria-label') || button.textContent.trim());
      const topAlerts = document.querySelector('#wlPeAlerts');
      const overview = dock?.querySelector('[data-wl-dock="dashboard"]');
      const menu = dock?.querySelector('#wlPeDockMenu');
      const expected = ['Menu','Sales','Stock','Overview'];
      const hasExpectedOrder = labels.length === expected.length && labels.every((label,index) => label === expected[index]);
      return {
        pass: hasExpectedOrder && !!topAlerts && !!overview && !!menu && overview.classList.contains('active') && !menu.classList.contains('active') && !dock?.querySelector('#wlPeDockAlerts'),
        labels,
        topAlertsPresent:!!topAlerts,
        duplicateBottomAlerts:!!dock?.querySelector('#wlPeDockAlerts'),
        overviewDestination:overview?.dataset.wlDock||null,
        menuPresent:!!menu
      };
    });
    record(result, 'Bottom Alerts shortcut is replaced by Overview; Menu, Sales and Stock remain available', mobileDockCheck.pass, mobileDockCheck);


    // The signed-out experience intentionally hides private workspace navigation.
    // Only authenticate when dedicated CI credentials have been configured.
    let authenticatedWorkspace = false;
    if (hasTestCredentials) {
      const email = page.locator('#wlCloudEmail');
      const password = page.locator('#wlCloudPassword');
      if (await email.count() && await password.count()) {
        await email.fill(testEmail);
        await password.fill(testPassword);
        await page.locator('#wlSignIn').click({ timeout: 10000 });
        try {
          await page.waitForFunction(() => {
            const app = document.querySelector('.app');
            const active = window.whiteLionCloud?.getActiveBusiness?.();
            return !app?.classList.contains('wl-public-mode') &&
              Boolean(active?.id || (window.__wlBusinesses || []).length);
          }, null, { timeout: 30000 });
          authenticatedWorkspace = true;
          record(result, 'dedicated CI account signed in and loaded a business workspace', true);
        } catch (_) {
          const status = await page.locator('#wlCloudStatus').textContent().catch(() => '');
          record(result, 'dedicated CI account signed in and loaded a business workspace', false, {
            status: (status || '').trim().slice(0, 300),
            hint: 'Check WHITE_LION_TEST_EMAIL / WHITE_LION_TEST_PASSWORD and ensure that account has an active business membership.'
          });
        }
      } else {
        record(result, 'dedicated CI account login form available', false);
      }
    } else {
      record(result, 'signed-out login screen is visible', result.startup.publicMode && result.startup.loginVisible, {
        publicMode: result.startup.publicMode,
        loginVisible: result.startup.loginVisible
      });
      record(result, 'private workspace navigation is hidden while signed out', !result.startup.sidebarVisible);
      skip(result, 'authenticated workspace navigation and module actions',
        'No WHITE_LION_TEST_EMAIL and WHITE_LION_TEST_PASSWORD secrets are configured. Private navigation is intentionally hidden until sign-in.');
    }

    if (authenticatedWorkspace) {
      const workspaceState = await page.evaluate(() => {
        const app = document.querySelector('.app');
        const sidebar = document.querySelector('#sidebar');
        const active = window.whiteLionCloud?.getActiveBusiness?.();
        const style = sidebar ? getComputedStyle(sidebar) : null;
        return {
          publicMode: !!app?.classList.contains('wl-public-mode'),
          activeBusiness: active?.id || null,
          sidebarDisplay: style?.display || null,
          sidebarVisibility: style?.visibility || null
        };
      });
      record(result, 'authenticated workspace shell is visible', !workspaceState.publicMode &&
        Boolean(workspaceState.activeBusiness) && workspaceState.sidebarDisplay !== 'none' &&
        workspaceState.sidebarVisibility !== 'hidden', workspaceState);

      if (viewport.width < 720) {
        await page.locator('#menuBtn').click({ timeout: 10000 });
        await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('open'), null, { timeout: 5000 });
        record(result, 'mobile workspace menu opens', true);
      }

      for (const [key, expected] of [
        ['products', 'Products'], ['sales', 'Sales'], ['purchases', 'Purchases'],
        ['expenses', 'Expenses'], ['actions', 'Executive Action Centre'],
        ['reorder', 'Smart Reorder Planner'], ['finance', 'Financial Planning'],
        ['billing', 'Plans & Billing'], ['settings', 'Business settings']
      ]) {
        if (viewport.width < 720) {
          const isOpen = await page.locator('#sidebar').evaluate(el => el.classList.contains('open'));
          if (!isOpen) {
            await page.locator('#menuBtn').click({ timeout: 5000 });
            await page.waitForTimeout(150);
          }
        }
        const button = page.locator('#sidebar [data-page="' + key + '"]').first();
        if (!(await button.count())) {
          record(result, 'navigate ' + key, false, { error: 'Navigation item missing from sidebar.' });
          continue;
        }
        try {
          await button.click({ timeout: 8000 });
          await page.waitForTimeout(450);
          const state = await page.evaluate(() => ({
            crumb: document.querySelector('#crumb')?.textContent || '',
            title: document.querySelector('#view h1')?.textContent || '',
            view: (document.querySelector('#view')?.innerText || '').slice(0, 220)
          }));
          const expectedWord = expected.toLowerCase().split(' ')[0];
          const passed = state.crumb.toLowerCase().includes(expectedWord) ||
            state.title.toLowerCase().includes(expectedWord);
          record(result, 'navigate ' + key, passed, { state });
        } catch (error) {
          record(result, 'navigate ' + key, false, { error: String(error.message || error) });
        }

        if (key === 'actions') {
          const actionText = await page.locator('#view').innerText();
          for (const section of [
            'Management alerts', 'Management tasks', 'Branch performance',
            'Stock replenishment recommendations', 'Investigate recent sales', 'Executive activity'
          ]) {
            record(result, 'action centre section: ' + section, actionText.includes(section));
          }
        }
      }

      await page.locator('#sidebar [data-page="products"]').click({ timeout: 8000 });
      await page.waitForTimeout(400);
      const add = page.locator('#view #addBtn');
      if (await add.count()) {
        await add.scrollIntoViewIfNeeded();
        await add.click({ timeout: 8000 });
        await page.waitForTimeout(200);
        const modalOpen = await page.locator('#modalBack.show').count() > 0;
        record(result, 'open product form without saving', modalOpen);
        if (modalOpen) {
          await page.locator('#cancelModal').click();
          record(result, 'close product form without saving', await page.locator('#modalBack.show').count() === 0);
        }
      } else {
        record(result, 'open product form without saving', false, { error: 'Add product button missing.' });
      }

      await page.locator('#sidebar [data-page="dashboard"]').click({ timeout: 8000 });
      await page.waitForTimeout(300);
      const quick = page.locator('#view [data-go="products"]').first();
      if (await quick.count()) {
        await quick.click({ timeout: 8000 });
        await page.waitForTimeout(300);
        const crumb = (await page.locator('#crumb').textContent()) || '';
        record(result, 'dashboard quick action opens products', crumb.toLowerCase().includes('products'), { crumb });
      } else {
        record(result, 'dashboard quick action opens products', false, { error: 'Quick action missing.' });
      }

      const themeButton = page.locator('#themeToggle');
      if (await themeButton.count()) {
        const beforeTheme = await page.locator('html').getAttribute('data-theme');
        await themeButton.click({ timeout: 8000 });
        const afterTheme = await page.locator('html').getAttribute('data-theme');
        record(result, 'appearance toggle responds', beforeTheme !== afterTheme, {
          before: beforeTheme, after: afterTheme
        });
      }
    }

    // The offline check verifies that the local application shell can relaunch.
    // Cloud sign-in/synchronisation are not expected to work without a network.
    await context.setOffline(true);
    let offlineReloadError = null;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(error => { offlineReloadError = String(error.message || error); });
    await page.waitForTimeout(1200);
    const offlineState = await page.evaluate(() => ({
      title: document.title,
      startupComplete: !!window.__wlStartupComplete,
      loginFormPresent: !!document.querySelector('#wlCloudEmail'),
      viewPresent: !!document.querySelector('#view')
    }));
    record(result, 'offline application shell relaunches', !!offlineState.startupComplete &&
      !!offlineState.loginFormPresent && !!offlineState.viewPresent, {
        state: offlineState,
        reloadError: offlineReloadError
      });
    await context.setOffline(false);

    result.final = await page.evaluate(() => ({
      publicMode: !!document.querySelector('.app')?.classList.contains('wl-public-mode'),
      activeBusiness: window.whiteLionCloud?.getActiveBusiness?.()?.id || null,
      startupError: window.__wlStartupError || null
    }));
  } catch (error) {
    result.fatal = String(error.stack || error);
  }

  await page.screenshot({ path: 'browser-' + name + '.png', fullPage: false }).catch(() => {});
  await browser.close();
  report.browsers.push(result);
}

await runViewport('android-compact', { width: 360, height: 800, isMobile: true, hasTouch: true });
await runViewport('android-standard', { width: 390, height: 844, isMobile: true, hasTouch: true });
await runViewport('android-large', { width: 412, height: 915, isMobile: true, hasTouch: true });
await runViewport('desktop', { width: 1365, height: 900 });

const all = report.browsers.flatMap(browser => browser.checks);
const fatalChecks = report.browsers.filter(browser => browser.fatal).map(browser => ({
  name: 'fatal browser execution: ' + browser.name,
  pass: false,
  error: browser.fatal
}));
report.failedChecks = all.filter(check => check.pass === false).concat(fatalChecks);
report.skippedChecks = all.filter(check => check.skipped);
report.summary = report.failedChecks.length
  ? 'FAIL'
  : report.skippedChecks.length
    ? 'PASS_WITH_SKIPS'
    : 'PASS';
fs.writeFileSync('browser-smoke-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failedChecks.length) process.exitCode = 1;
