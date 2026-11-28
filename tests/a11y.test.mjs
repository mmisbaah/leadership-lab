// Automated WCAG 2.1 A/AA audit (axe-core) of the participant, presenter and facilitator pages in both themes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { admin, uid, ADMIN, BASE, Client } from './lib/client.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
let browser, cls, part, code;
before(async () => {
  browser = await chromium.launch();
  const A = await admin();
  cls = (await A.json('/api/classes', { name: 'Accessibility class' })).data;
  part = { id: uid('a11y'), pw: 'a11y-pass-1' };
  await A.json('/api/users', { id: part.id, name: 'Access Person', password: part.pw, classId: cls.id });
  for (const l of ['foundations', 'functional']) await A.json('/api/attendance', { classId: cls.id, lesson: l, present: true });
  await A.json('/api/classes/deck', { id: cls.id, lesson: 'foundations', skip: [2], timers: {} });
  await A.json('/api/attendance', { classId: cls.id, lesson: 'trust', present: true });
  // A real certificate for the verification page.
  const id = uid('a11yc');
  await A.json('/api/users', { id, name: 'Cert Holder', password: 'cert-pass-1', classId: cls.id });
  const { lessons } = await import('../public/lessons.js');
  for (const l of lessons) await A.json('/api/attendance', { classId: cls.id, lesson: l.id, userIds: [id], present: true });
  code = (await (await new Client().login(id, 'cert-pass-1')).json('/api/certificate', {})).data.certificate.code;
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
async function context(theme, signIn = true, who = ADMIN) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, bypassCSP: true });   // axe is injected as a script
  await ctx.addInitScript(t => { try { localStorage.setItem('ll-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  if (signIn) {
    await page.goto(BASE + '/login'); await page.fill('#login', who.id); await page.fill('#password', who.pw);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    await page.waitForSelector('.hero');
  }
  return page;
}
const settle = page => page.waitForFunction(() => !/Loading…/.test(document.querySelector('#view')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});

for (const theme of ['light', 'dark']) {
  test(`sign-in and join pages meet WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme, false); const found = [];
    for (const path of ['/login', '/join', '/verify/' + code, '/verify/LL-2026-ZZZZ-ZZZZ']) { await page.goto(BASE + path); found.push(...await audit(page, path)); }
    await page.context().close();
    assert.deepEqual(found, []);
  });

  test(`participant pages meet WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme, true, part); const found = [];
    for (const h of ['home', 'live', 'account', 'action', 'checkin', 'review', 'certificate', 'assess', 'evaluate', 'privacy', 's/foundations/notes', 's/foundations/class']) {
      await page.evaluate(x => { location.hash = x; }, h);
      await page.waitForSelector(h.startsWith('s/') ? '.lesson-body' : '.page-head, .hero'); await settle(page); await page.waitForTimeout(250);
      found.push(...await audit(page, '#' + h));
    }
    await page.context().close();
    assert.deepEqual(found, []);
  });

  test(`facilitator pages meet WCAG 2.1 AA (${theme})`, async () => {
    const page = await context(theme); const found = [];
    await page.evaluate(id => { localStorage.setItem('ll-team-class', id); localStorage.setItem('ll-present-class', id); }, cls.id);
    for (const h of ['home', 'sessions', 'plan', 'reference', 'help', 'account', 'team', 'report/' + cls.id, 'deck/' + cls.id, 's/feedback/plan', 's/feedback/quiz', 's/feedback/notes', 's/feedback/class']) {
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
