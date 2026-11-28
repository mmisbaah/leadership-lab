// Browser helpers: a signed-in page that records script errors and Content Security Policy violations.
import { chromium } from 'playwright';
import { BASE } from './client.mjs';

export async function launch() { return chromium.launch(); }

export async function signedIn(browser, id, pw, { theme = 'light', viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(t => { try { localStorage.setItem('ll-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', e => page.problems.push('script error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) page.problems.push('CSP: ' + m.text()); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Refused to load: CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE + '/login');
  await page.fill('#login', id); await page.fill('#password', pw);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  await page.waitForSelector('.hero');
  return page;
}

export async function go(page, hash, selector = '.page-head, .hero, .lesson-head') {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForSelector(selector);
  await page.waitForFunction(() => !/Loading…/.test(document.querySelector('#view')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
}
