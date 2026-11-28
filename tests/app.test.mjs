// The app in a real browser: every page renders without script errors or CSP violations, the facilitator tools work,
// the follow-up pages respect their rules, presenter view stays in sync, and every slide fits its canvas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, signedIn, go } from './lib/browser.mjs';
import { admin, Client, uid, ADMIN, BASE } from './lib/client.mjs';
import { lessons } from '../public/lessons.js';

let browser, A, cls, part;
before(async () => {
  browser = await launch();
  A = await admin();
  cls = (await A.json('/api/classes', { name: 'Browser test class' })).data;
  const id = uid('bp'), pw = 'browser-pass-1';
  await A.json('/api/users', { id, name: 'Browser Participant', password: pw, classId: cls.id });
  part = { id, pw, c: await new Client().login(id, pw) };
});
after(async () => { await browser?.close(); });

test('every page renders without script errors or CSP violations', async () => {
  for (const theme of ['light', 'dark']) {
    const p = await signedIn(browser, ADMIN.id, ADMIN.pw, { theme });
    for (const h of ['home', 'live', 'sessions', 'plan', 'reference', 'help', 'account', 'action', 'checkin', 'review', 'certificate', 'team', 'report/' + cls.id])
      await go(p, h);
    for (const t of ['plan', 'class', 'quiz', 'notes']) await go(p, `s/feedback/${t}`, '.lesson-body');
    await p.goto(BASE + '/#print/trust/slides'); await p.waitForSelector('.pp');
    assert.deepEqual(p.problems, [], theme);
    await p.context().close();
  }
});

test('facilitators create a class, import participants and open the class report', async () => {
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw);
  await go(p, 'team'); await p.waitForSelector('#classSel');
  await p.click('#newClassBtn'); await p.fill('#cName', 'UI made class');
  await p.click('#classForm button.primary');
  await p.waitForSelector('.join-code');
  const code = (await p.textContent('.join-code')).trim();
  assert.match(code, /^UMC-[A-Z0-9]{3}$/);
  await p.fill('#impText', 'name,login,password\nUi Person One,,\nUi Person Two,' + uid('ui') + ',chosen-pw-22');
  await p.click('#importForm button.primary');
  await p.waitForSelector('#impResult table');
  assert.equal(await p.locator('#impResult tbody tr').count(), 2);
  assert.match(await p.textContent('#impMsg'), /2 accounts created/);
  await p.waitForSelector('#impCsv');
  await go(p, 'team'); await p.waitForSelector('#classSel');
  assert.ok(await p.locator('tbody tr', { hasText: 'Ui Person One' }).count());
  const href = await p.getAttribute('a[href^="#report/"]', 'href');
  await go(p, href.slice(1)); await p.waitForSelector('#repCsv');
  assert.match(await p.textContent('.report-head h1'), /UI made class/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#repCsv')]);
  assert.match(dl.suggestedFilename(), /^class-report-umc-/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('the review quiz shows explanations and never changes the in-class answers', async () => {
  const before = (await part.c.json('/api/progress')).text;
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'review');
  for (let i = 0; i < 10; i++) {
    await p.click('[data-rv] >> nth=0');
    await p.waitForSelector('.why');
    await p.click('#rvNext');
  }
  await p.waitForSelector('#rvAgain');
  assert.match(await p.textContent('.review, .panel h3'), /strongest answer \d+ of 10/);
  await p.click('#rvAgain'); await p.waitForSelector('[data-rv]');
  assert.equal((await part.c.json('/api/progress')).text, before, 'review answers must not be saved to the account');
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('the certificate is locked until every session is complete, then shows name, class and date', async () => {
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'certificate');
  assert.match(await p.textContent('.page-head h1'), /Not yet/);
  for (const l of lessons) await part.c.json('/api/progress', { lesson: l.id, entry: { done: true, doneAt: '2026-11-20T10:00:00.000Z' } });
  await p.reload(); await p.waitForSelector('.cert');
  assert.match(await p.textContent('.cert-name'), /Browser Participant/);
  assert.match(await p.textContent('.cert-class'), /Browser test class/);
  assert.match(await p.textContent('.cert-date'), /2026/);
  await p.context().close();
});

test('the 30-day check-in saves privately and the action plan shows the commitment', async () => {
  await part.c.json('/api/progress', { lesson: 'commitment', entry: { note: 'Hold a weekly one-to-one with each person', done: true } });
  const p = await signedIn(browser, part.id, part.pw);
  await p.goto(BASE + '/checkin'); await p.waitForSelector('#ciForm');
  assert.match(await p.textContent('.commit'), /weekly one-to-one/);
  await p.check('input[name=rating][value="4"]');
  await p.fill('#ciHelped', 'Calendar reminders'); await p.fill('#ciBlocked', 'Night shifts'); await p.fill('#ciNext', 'Add a skip-level chat');
  await p.click('#ciForm button.primary');
  await p.waitForSelector('.ci');
  assert.match(await p.textContent('.commit'), /skip-level/);
  assert.equal((await part.c.json('/api/checkins')).data.checkins.length, 1);
  await go(p, 'action', '.doc');
  assert.match(await p.textContent('.doc'), /weekly one-to-one/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('presenter view and the projector window stay in sync, and the session timer runs', async () => {
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw);
  await go(p, 's/feedback/class', '#stage');
  await p.keyboard.press('p'); await p.waitForSelector('.pv');
  const [proj] = await Promise.all([p.context().waitForEvent('page'), p.click('#pvOpen')]);
  await proj.setViewportSize({ width: 1280, height: 720 }); await proj.waitForSelector('.proj #stage'); await p.waitForTimeout(600);
  const num = pg => pg.$eval('#stage .num', e => e.textContent.trim());
  for (let i = 0; i < 5; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
  await p.waitForTimeout(400);
  assert.equal(await num(proj), await num(p));
  await proj.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
  assert.equal(await num(p), await num(proj), 'the projector drives the presenter too');
  const t1 = await p.textContent('#pvClock'); await p.waitForTimeout(2200);
  assert.notEqual(await p.textContent('#pvClock'), t1, 'session timer is running');
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('every slide fits its 1280×720 canvas', async () => {
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw, { viewport: { width: 1600, height: 1000 } });
  const over = []; let total = 0;
  for (const l of lessons) {
    await p.goto(`${BASE}/#print/${l.id}/slides`); await p.waitForSelector('.pp');
    await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate(() => [...document.querySelectorAll('.pp .canvas')].map(c => { const b = c.querySelector('.cv-body'); return { over: b.scrollHeight - b.clientHeight, num: c.querySelector('.num').textContent.trim() }; }));
    total += r.length;
    for (const x of r) if (x.over > 1) over.push(`${l.id} ${x.num} +${x.over}px`);
  }
  assert.ok(total >= lessons.length * 25);
  assert.deepEqual(over, []);
  await p.context().close();
});
