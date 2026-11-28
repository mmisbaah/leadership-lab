// The app in a real browser: every page renders without script errors or CSP violations; facilitators run classes,
// mark attendance and customise the deck; participants issue a verified certificate, do the self-assessment, the
// evaluation and the check-in, export their data; presenter view stays in sync, shows QR codes, open-text answers and
// the join card; per-class skips and timers apply; and every slide fits its canvas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, signedIn, go } from './lib/browser.mjs';
import { admin, Client, uid, ADMIN, BASE } from './lib/client.mjs';
import { lessons } from '../public/lessons.js';
import { decks } from '../public/decks.js';

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
const presentTo = (p, classId) => p.evaluate(id => { localStorage.setItem('ll-present-class', id); localStorage.setItem('ll-team-class', id); }, classId);

test('every page renders without script errors or CSP violations', async () => {
  for (const theme of ['light', 'dark']) {
    const p = await signedIn(browser, ADMIN.id, ADMIN.pw, { theme });
    await presentTo(p, cls.id);
    for (const h of ['home', 'live', 'sessions', 'plan', 'reference', 'help', 'account', 'privacy', 'team', 'report/' + cls.id, 'deck/' + cls.id])
      await go(p, h);
    for (const t of ['plan', 'class', 'quiz', 'notes']) await go(p, `s/feedback/${t}`, '.lesson-body');
    await p.goto(BASE + '/#print/trust/slides'); await p.waitForSelector('.pp');
    assert.deepEqual(p.problems, [], theme);
    await p.context().close();
    const q = await signedIn(browser, part.id, part.pw, { theme });
    for (const h of ['home', 'action', 'checkin', 'review', 'certificate', 'assess', 'evaluate', 'privacy', 'account']) await go(q, h);
    assert.deepEqual(q.problems, [], theme + ' participant');
    await q.context().close();
  }
});

test('facilitators create a class, import people, mark attendance, add a co-facilitator and open the report', async () => {
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw);
  await go(p, 'team'); await p.waitForSelector('#classSel');
  await p.click('#newClassBtn'); await p.fill('#cName', 'UI made class');
  await p.click('#classForm button.primary');
  await p.waitForSelector('.join-code');
  assert.match((await p.textContent('.join-code')).trim(), /^UMC-[A-Z0-9]{3}$/);
  assert.ok(await p.$('.cc-qr svg.qr'), 'the class card shows a join QR code');
  await p.fill('#impText', 'name,login,password\nUi Person One,,\nUi Person Two,' + uid('ui') + ',chosen-pw-22');
  await p.click('#importForm button.primary');
  await p.waitForSelector('#impResult table');
  assert.match(await p.textContent('#impMsg'), /2 accounts created/);
  await go(p, 'team'); await p.waitForSelector('table.att');
  // Mark the whole class present for Session 01, then untick one person.
  await p.click('[data-all="foundations"]'); await p.waitForTimeout(600); await p.waitForSelector('table.att');
  assert.equal(await p.locator('[data-lesson="foundations"]:checked').count(), 2);
  await p.locator('[data-lesson="foundations"]').first().uncheck(); await p.waitForTimeout(500);
  await go(p, 'team'); await p.waitForSelector('table.att');
  assert.equal(await p.locator('[data-lesson="foundations"]:checked').count(), 1, 'the untick was saved');
  // Co-facilitator by login ID.
  const fid = uid('cofac');
  await A.json('/api/users', { id: fid, name: 'Co Facilitator', password: 'co-fac-pass-1', role: 'facilitator' });
  await p.fill('#facId', fid); await p.click('#facForm button'); await p.waitForSelector(`[data-unfac="${fid}"]`);
  const href = await p.getAttribute('a[href^="#report/"]', 'href');
  await go(p, href.slice(1)); await p.waitForSelector('#repCsv');
  assert.match(await p.textContent('.report-head h1'), /UI made class/);
  assert.match(await p.textContent('#view'), /Impact: self-assessment/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#repCsv')]);
  assert.match(dl.suggestedFilename(), /^class-report-umc-/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('a participant issues a verified certificate once attendance is marked', async () => {
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'certificate'); await p.waitForSelector('.page-head h1');
  assert.match(await p.textContent('.page-head h1'), /Not yet/);
  for (const l of lessons) await A.json('/api/attendance', { classId: cls.id, lesson: l.id, present: true });
  await p.reload(); await p.waitForSelector('#issueCert');
  await p.click('#issueCert'); await p.waitForSelector('.cert');
  assert.match(await p.textContent('.cert-name'), /Browser Participant/);
  assert.match(await p.textContent('.cert-class'), /Browser test class/);
  const code = (await p.textContent('.cert-verify .mono')).trim().split('/').pop();
  assert.match(code, /^LL-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(await p.$('.cert-qr'), 'certificate carries a verification QR code');
  await p.goto(BASE + '/verify/' + code);
  assert.match(await p.textContent('h1'), /Certificate verified/);
  await p.context().close();
});

test('self-assessment, evaluation and check-in save privately; the action plan offers a calendar reminder', async () => {
  await part.c.json('/api/progress', { lesson: 'commitment', entry: { note: 'Hold a weekly one-to-one with each person' } });
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'assess'); await p.waitForSelector('#assessForm');
  for (let i = 0; i < 10; i++) await p.check(`input[name=s${i}][value="${(i % 5) + 1}"]`);
  await p.click('#assessForm button.primary'); await p.waitForFunction(() => /Done on/.test(document.querySelector('#view').textContent));
  assert.deepEqual((await part.c.json('/api/assessment')).data.baseline.answers, [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  await go(p, 'evaluate'); await p.waitForSelector('#evalForm');
  for (const k of ['relevance', 'pace', 'facilitator']) await p.check(`input[name=${k}][value="4"]`);
  await p.fill('#evImprove', 'More practice'); await p.click('#evalForm button.primary');
  await p.waitForFunction(() => /Thank you/.test(document.querySelector('#view').textContent));
  await p.goto(BASE + '/checkin'); await p.waitForSelector('#ciForm');
  assert.match(await p.textContent('.commit'), /weekly one-to-one/);
  await p.check('input[name=rating][value="4"]'); await p.fill('#ciNext', 'Add a skip-level chat');
  await p.click('#ciForm button.primary'); await p.waitForSelector('.ci');
  await go(p, 'action', '.doc');
  const [ics] = await Promise.all([p.waitForEvent('download'), p.click('#icsBtn')]);
  const text = readFileSync(await ics.path(), 'utf8');
  assert.match(text, /^BEGIN:VCALENDAR\r\n/); assert.match(text, /DTSTART;VALUE=DATE:\d{8}\r\n/); assert.match(text, /\/checkin/);
  assert.match(text.replace(/\r\n /g, ''), /weekly one-to-one/); assert.ok(text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'lines folded at 75 octets');
  const due = text.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/).slice(1).join('-');
  assert.ok(Date.parse(due) - Date.now() > 20 * 864e5, 'reminder is about 30 days out');
  await go(p, 'privacy'); await p.waitForSelector('#expJson');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#expMd')]);
  assert.match(readFileSync(await dl.path(), 'utf8'), /weekly one-to-one/);
  assert.deepEqual(p.problems, []);
  await p.context().close();
});

test('the review quiz shows explanations and never changes the in-class answers', async () => {
  const before = (await part.c.json('/api/progress')).text;
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'review');
  for (let i = 0; i < 10; i++) { await p.click('[data-rv] >> nth=0'); await p.waitForSelector('.why'); await p.click('#rvNext'); }
  await p.waitForSelector('#rvAgain');
  assert.equal((await part.c.json('/api/progress')).text, before);
  await p.context().close();
});

test('shared-computer mode keeps nothing in the browser', async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(BASE + '/login'); await p.fill('#login', part.id); await p.fill('#password', part.pw); await p.check('input[name=shared]');
  await Promise.all([p.waitForURL(u => !u.pathname.startsWith('/login')), p.click('button[type=submit]')]);
  await p.waitForSelector('.hero'); await p.waitForTimeout(800);
  const cookie = (await ctx.cookies()).find(c => c.name === 'll_session');
  assert.equal(cookie.expires, -1, 'session cookie (no expiry)');
  assert.equal(await p.evaluate(() => localStorage.getItem('leadership-lab-v2')), null);
  await go(p, 'account'); assert.match(await p.textContent('#view'), /Shared computer/);
  await ctx.close();
});

test('presenter view: sync, timers, per-class skip and timer overrides, QR codes, open-text polls and the join card', async () => {
  await A.json('/api/classes/deck', { id: cls.id, lesson: 'trust', skip: [2], timers: { 3: 7 } });
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw);
  await presentTo(p, cls.id); await p.reload(); await p.waitForSelector('.hero');
  await go(p, 's/trust/class', '#stage');
  await p.keyboard.press('p'); await p.waitForSelector('.pv');
  const [proj] = await Promise.all([p.context().waitForEvent('page'), p.click('#pvOpen')]);
  await proj.setViewportSize({ width: 1280, height: 720 }); await proj.waitForSelector('.proj #stage'); await p.waitForTimeout(600);
  const num = pg => pg.$eval('#stage .num', e => e.textContent.trim());
  // Slide 3 is skipped for this class: from slide 2 the next slide is 4.
  for (let k = 0; k < 20 && /^0[12] /.test(await num(p)); k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(120); }
  assert.match(await num(p), /^04 /, 'skipped slide 3');
  await p.waitForTimeout(400);
  assert.equal(await num(proj), await num(p));
  // Slide 4 is the opening question: a multiple-choice poll with a vote QR code, its timer overridden to 7 minutes.
  assert.equal(await p.textContent('#stage .tmr-t'), '07:00');
  await p.waitForSelector('#stage[data-live="1"]');
  await proj.waitForSelector('#stage[data-live="1"] .live-qr svg');
  const voter = await new Client().login(part.id, part.pw);
  assert.equal((await voter.json('/api/poll/current')).data.active.kind, 'choice');
  // Slide 22 is the debrief: an open-text poll.
  for (let k = 0; k < 120 && !/^22 /.test(await num(p)); k++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
  assert.match(await num(p), /^22 /);
  await p.waitForTimeout(800);
  const cur = (await voter.json('/api/poll/current')).data.active;
  assert.equal(cur.kind, 'open'); assert.equal(cur.id, 'trust:21');
  await voter.json('/api/poll/vote', { id: cur.id, text: 'Fear of blame' });
  await p.waitForFunction(() => /Fear of blame/.test(document.querySelector('#pollMod')?.textContent || ''), null, { timeout: 8000 });
  await p.click('#pollShow'); await p.waitForTimeout(2200);
  assert.match(await proj.textContent('#stage .ot'), /fear|blame/i, 'word cloud on the projector');
  await p.click('#pollView'); await p.waitForTimeout(2200);
  assert.match(await proj.textContent('#stage .ot-list'), /Fear of blame/);
  // J puts the class join card (with its QR code) on the projector.
  await p.keyboard.press('j'); await p.waitForTimeout(500);
  assert.ok(await proj.$('#stage .join-card.big svg.qr'));
  assert.match(await proj.textContent('#stage .join-card'), new RegExp(cls.code));
  await p.keyboard.press('j');
  const t1 = await p.textContent('#pvClock'); await p.waitForTimeout(2200);
  assert.notEqual(await p.textContent('#pvClock'), t1, 'session timer runs');
  assert.deepEqual(p.problems, []);
  await p.context().close();
  await A.json('/api/classes/deck', { id: cls.id, lesson: 'trust', skip: [], timers: {} });
});

test('the deck customiser saves skips and timers for one class', async () => {
  const p = await signedIn(browser, ADMIN.id, ADMIN.pw);
  await go(p, 'deck/' + cls.id); await p.waitForSelector('#deckForm');
  await p.selectOption('#deckLesson', 'feedback'); await p.waitForSelector('[data-skip="5"]');
  await p.check('[data-skip="5"]');
  const gp = decks.feedback.findIndex(s => s.k === 'Group practice');
  await p.fill(`[data-timer="${gp}"]`, '12');
  await p.click('#deckForm button.primary'); await p.waitForFunction(() => /Saved/.test(document.querySelector('#deckMsg').textContent));
  const c = (await A.json('/api/classes?scope=all')).data.classes.find(x => x.id === cls.id);
  assert.deepEqual(c.deck.feedback, { skip: [5], timers: { [gp]: 12 } });
  await p.waitForTimeout(800); await p.click('#deckReset'); await p.waitForTimeout(800);
  assert.deepEqual((await A.json('/api/classes?scope=all')).data.classes.find(x => x.id === cls.id).deck, {});
  await p.context().close();
});

test('Dhivehi switches the layout to right to left with the Thaana font, falling back to English text', async () => {
  const p = await signedIn(browser, part.id, part.pw);
  await go(p, 'account'); await p.selectOption('#locSel', 'dv'); await p.waitForSelector('.hero, .page-head');
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await p.evaluate(() => document.documentElement.lang), 'dv');
  assert.match(await p.evaluate(() => getComputedStyle(document.body).fontFamily), /Noto Sans Thaana/);
  assert.ok(await p.$('#locNote'), 'notice that translation is pending');
  assert.match(await p.textContent('#nav'), /Home/, 'untranslated strings fall back to English');
  await p.evaluate(() => localStorage.setItem('ll-locale', 'en'));
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
    assert.equal(await p.locator('.pp .ph, .pp img').count(), 0, `${l.id}: no photo frames until photos are supplied`);
  }
  assert.ok(total >= lessons.length * 25);
  assert.deepEqual(over, []);
  await p.context().close();
});
