// Automated WCAG 2.1 A/AA audit (axe-core) of the participant, presenter and facilitator pages in both themes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { admin, uid, ADMIN, BASE } from './lib/client.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
let browser, cls;
before(async () => {
  browser = await chromium.launch();
  cls = (await (await admin()).json('/api/classes', { name: 'Accessibility class' })).data;
});
after(async () => { await browser?.close(); });

async function audit(page, label) {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => {
    // Slides are a scaled 1280×720 canvas; hidden reveal steps are deliberately low contrast "ghosts" for the presenter.
    const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, exclude: [['.ghost']] });
    return res.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')} — ${v.nodes[0].failureSummary.split('\n')[1] || ''}`);
  });
  return r.map(x => `${label}: ${x}`);
}
async function context(theme, signIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, bypassCSP: true });   // axe is injected as a script
  await ctx.addInitScript(t => { try { localStorage.setItem('ll-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  if (signIn) {
    await page.goto(BASE + '/login'); await page.fill('#login', ADMIN.id); await page.fill('#password', ADMIN.pw);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    await page.waitForSelector('.hero');
  }
  return page;
}
const settle = page => page.waitForFunction(() => !/Loading…/.test(document.querySelector('#view')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});

for (const theme of ['light', 'dark']) {
  test(`sign-in and join pages meet WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme, false); const found = [];
    for (const path of ['/login', '/join']) { await page.goto(BASE + path); found.push(...await audit(page, path)); }
    await page.context().close();
    assert.deepEqual(found, []);
  });

  test(`participant and facilitator pages meet WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme); const found = [];
    for (const h of ['home', 'sessions', 'live', 'plan', 'reference', 'help', 'account', 'action', 'checkin', 'review', 'certificate', 'team', 'report/' + cls.id, 's/feedback/plan', 's/feedback/quiz', 's/feedback/notes', 's/feedback/class']) {
      await page.evaluate(x => { location.hash = x; }, h);
      await page.waitForSelector(h.startsWith('s/') ? '.lesson-body' : '.page-head, .hero'); await settle(page); await page.waitForTimeout(150);
      found.push(...await audit(page, '#' + h));
    }
    await page.context().close();
    assert.deepEqual(found, []);
  });

  test(`presenter view meets WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme);
    await page.evaluate(() => { location.hash = 's/trust/class'; }); await page.waitForSelector('#stage');
    await page.keyboard.press('p'); await page.waitForSelector('.pv'); await page.waitForTimeout(300);
    const found = await audit(page, 'presenter');
    await page.context().close();
    assert.deepEqual(found, []);
  });
}
