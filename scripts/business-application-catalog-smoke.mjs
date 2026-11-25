import { chromium } from 'playwright';

const base = process.env.WHITE_LION_SMOKE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const failures = [];
const check = (name, pass, details = {}) => {
  console.log(JSON.stringify({ name, pass: Boolean(pass), ...details }));
  if (!pass) failures.push(name);
};

page.on('pageerror', error => failures.push('page error: ' + String(error)));
try {
  const url = new URL('business-application.html?application=business', base).href;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Array.isArray(window.KLT_BUSINESS_INDUSTRY_GROUPS) &&
    document.querySelectorAll('#business_type optgroup option').length >= 112, null, { timeout: 15000 });

  const initial = await page.evaluate(() => ({
    groups: window.KLT_BUSINESS_INDUSTRY_GROUPS.length,
    catalogueTypes: window.KLT_BUSINESS_INDUSTRY_GROUPS.reduce((sum, group) => sum + group.items.length, 0),
    industryOptions: document.querySelectorAll('#industry_group option').length - 1,
    businessTypeOptions: [...document.querySelectorAll('#business_type optgroup option')]
      .filter(option => option.value !== '__custom__').length,
    customOption: Boolean(document.querySelector('#business_type option[value="__custom__"]'))
  }));
  check('all 13 industry groups and 111 business types load', initial.groups === 13 &&
    initial.catalogueTypes === 111 && initial.industryOptions === 13 &&
    initial.businessTypeOptions === 111 && initial.customOption, initial);

  await page.locator('#business_type').selectOption('Construction company');
  const construction = await page.locator('#industry_group').inputValue();
  check('selecting a business automatically selects its industry',
    construction === 'Construction and industrial', { selectedIndustry: construction });

  await page.locator('#businessTypeSearch').fill('furniture');
  const furnitureOptions = await page.locator('#business_type option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean)
  );
  check('business-type search finds entries across industry groups',
    furnitureOptions.includes('Furniture shop') && furnitureOptions.includes('Furniture manufacturer'),
    { matches: furnitureOptions });

  await page.locator('#business_type').selectOption('Furniture manufacturer');
  const furnitureIndustry = await page.locator('#industry_group').inputValue();
  check('search result still resolves to its canonical industry',
    furnitureIndustry === 'Construction and industrial', { selectedIndustry: furnitureIndustry });

  await page.locator('#businessTypeSearch').fill('');
  await page.locator('#business_type').selectOption('__custom__');
  const custom = await page.evaluate(() => ({
    visible: !document.querySelector('#businessTypeCustomField').classList.contains('hidden'),
    required: document.querySelector('#business_type_custom').required,
    enabled: !document.querySelector('#business_type_custom').disabled
  }));
  check('unlisted businesses can be entered as a custom type',
    custom.visible && custom.required && custom.enabled, custom);

  await page.locator('#language').selectOption('fr');
  const french = await page.evaluate(() => ({
    industry: document.querySelector('#industry_group option[value="Construction and industrial"]')?.textContent,
    business: document.querySelector('#business_type option[value="Construction company"]')?.textContent,
    searchLabel: document.querySelector('label[for="businessTypeSearch"]')?.textContent
  }));
  check('industry and business labels follow the French language selection',
    french.industry === 'Construction et industrie' &&
    french.business === 'Entreprise de construction' &&
    french.searchLabel === 'Rechercher parmi les 111 types d’entreprise', french);

  await page.locator('#language').selectOption('ar');
  const arabicDirection = await page.locator('html').getAttribute('dir');
  check('Arabic selection switches the registration page to right-to-left',
    arabicDirection === 'rtl', { direction: arabicDirection });

  await page.locator('#application_kind').selectOption('football_club');
  const clubState = await page.evaluate(() => ({
    industry: document.querySelector('#industry_group').value,
    type: document.querySelector('#business_type').value,
    industryLocked: document.querySelector('#industry_group').disabled,
    typeLocked: document.querySelector('#business_type').disabled
  }));
  check('football-club registration remains locked to its sports category',
    clubState.industry === 'Sports and local league management' &&
    clubState.type === 'Sports club / football club' &&
    clubState.industryLocked && clubState.typeLocked, clubState);
} catch (error) {
  failures.push('catalogue smoke test exception: ' + String(error.stack || error));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ summary: failures.length ? 'FAIL' : 'PASS', failures }));
if (failures.length) process.exitCode = 1;
