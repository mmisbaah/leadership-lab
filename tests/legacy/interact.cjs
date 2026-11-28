// End-to-end: diagram reveal, timer sync, live poll with a participant, results on the projector, live banner.
const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
const out = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const fac = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await fac.newPage(); p.on('pageerror', e => errs.push('presenter: ' + e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  // Participant account (created once).
  const made = await p.evaluate(async () => { const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'pat', name: 'Participant Test', password: 'participant-1' }) }); return r.status; });
  out('participant account:', made === 201 ? 'created' : made === 409 ? 'exists' : made);
  await p.evaluate(async () => { await fetch('/api/poll/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', poll: { id: 'feedback:9' } }) }); });

  // 1. Diagram reveal: Tuckman (teamwork slide 13) in presenter view + projector.
  await p.goto(B + '/#s/teamwork/class'); await p.waitForSelector('#stage');
  await p.click('[data-slide="11"]'); await p.keyboard.press('p'); await p.waitForSelector('.pv');
  const [proj] = await Promise.all([fac.waitForEvent('page'), p.click('#pvOpen')]);
  proj.on('pageerror', e => errs.push('projector: ' + e.message)); await proj.setViewportSize({ width: 1280, height: 720 });
  await proj.waitForSelector('.proj .canvas'); await p.waitForTimeout(600);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); // to slide 13, step 0
  const rv = async () => ({ slide: await p.$eval('.pv-cur .num', e => e.textContent), ghost: await p.$$eval('.pv-cur [data-h="ghost"]', e => e.length), projHidden: await proj.$$eval('[data-h="hide"]', e => e.length), projSlide: await proj.$eval('.num', e => e.textContent) });
  out('tuckman step 0:', JSON.stringify(await rv()));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  out('tuckman step 2:', JSON.stringify(await rv()));
  await proj.screenshot({ path: S + '/viz/x-projector-tuckman-step2.png' }); await p.screenshot({ path: S + '/viz/x-presenter-tuckman-step2.png' });
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  out('tuckman complete:', JSON.stringify(await rv()));

  // 2. Timer on the Tower Challenge activity slide.
  const actIdx = await p.evaluate(() => [...document.querySelectorAll('.thumbs button')].length); // not in presenter; jump via keyboard instead
  await p.keyboard.press('Escape'); await p.waitForSelector('.thumbs');
  const ix = await p.$$eval('.thumbs button', bs => bs.findIndex(x => x.textContent.includes('Tower Challenge') && !x.textContent.includes('Part')));
  await p.click(`[data-slide="${ix}"]`); await p.keyboard.press('p'); await p.waitForSelector('.pv'); await p.waitForTimeout(800);
  out('timer before start:', await p.$eval('.pv-cur .tmr-t', e => e.textContent), '| projector:', await proj.$eval('.tmr-t', e => e.textContent));
  await p.click('#tmrRun'); await p.waitForTimeout(2300);
  out('after ~2 s running:', await p.$eval('.pv-cur .tmr-t', e => e.textContent), '| projector:', await proj.$eval('.tmr-t', e => e.textContent), '| button:', await p.textContent('#tmrRun'));
  await p.click('#tmrAdd'); await p.waitForTimeout(400);
  out('after +1 min:', await p.$eval('.pv-cur .tmr-t', e => e.textContent), '| projector:', await proj.$eval('.tmr-t', e => e.textContent));
  await proj.screenshot({ path: S + '/viz/x-projector-timer.png' });
  await p.keyboard.press('t'); await p.waitForTimeout(300); out('after T (pause):', await p.textContent('#tmrRun'));

  // 3. Live poll on feedback quick check (slide 10 = index 9).
  await p.keyboard.press('Escape'); await p.goto(B + '/#s/feedback/class'); await p.waitForSelector('#stage');
  await p.click('[data-slide="9"]'); await p.keyboard.press('p'); await p.waitForSelector('.pv'); await p.waitForTimeout(1500);
  await p.click('#pvOpen'); await proj.waitForLoadState('load'); await proj.waitForSelector('.proj .canvas'); await p.waitForTimeout(1200);
  out('projector followed to:', await proj.$eval('.cv-foot .sess', e => e.textContent), await proj.$eval('.num', e => e.textContent));
  out('presenter poll panel:', await p.textContent('#pollCount'));
  const part = await b.newContext({ ...require('playwright').devices['iPhone 13'] }); const m = await part.newPage(); m.on('pageerror', e => errs.push('phone: ' + e.message));
  await m.goto(B + '/'); await m.fill('#login', 'pat'); await m.fill('#password', 'participant-1'); await m.click('button[type=submit]'); await m.waitForSelector('.hero');
  await m.goto(B + '/#live'); await m.waitForSelector('[data-vote]');
  out('phone sees question:', (await m.textContent('.live-q')).slice(0, 60));
  await m.click('[data-vote="1"]'); await m.waitForSelector('.live-opt.on');
  await m.screenshot({ path: S + '/viz/x-phone-voted.png' });
  await p.waitForTimeout(2200);
  out('presenter count after vote:', await p.textContent('#pollCount'), '| projector badge:', await proj.$eval('[data-lcount]', e => e.textContent));
  await p.click('#pollShow'); await p.waitForTimeout(2000);
  out('results shown: projector show flag', await proj.$eval('.canvas', c => c.dataset.show), '| bar B width', await proj.$eval('[data-vi="1"]', e => e.style.width), '| count B', await proj.$eval('[data-vc="1"]', e => e.textContent));
  await proj.screenshot({ path: S + '/viz/x-projector-poll-results.png' });
  await p.click('#pollLock'); await p.waitForTimeout(2500);
  out('after lock, phone buttons disabled:', await m.$eval('[data-vote="0"]', e => e.disabled), '|', await m.textContent('.live-card .small'));
  await m.screenshot({ path: S + '/viz/x-phone-results.png' });
  const late = await m.evaluate(async () => { const r = await fetch('/api/poll/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'feedback:9', choice: 0 }) }); return r.status; });
  out('vote after lock rejected:', late);
  const notAdmin = await m.evaluate(async () => (await fetch('/api/poll/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close' }) })).status);
  out('participant cannot control polls:', notAdmin);
  // Banner on another page, then leaving the poll slide closes it.
  await m.goto(B + '/#home'); await m.waitForTimeout(500); await m.evaluate(() => window.dispatchEvent(new Event('hashchange')));
  await m.waitForTimeout(10500); out('banner on home while poll open:', !!(await m.$('#liveBanner')));
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1500);
  const cur = await m.evaluate(async () => (await (await fetch('/api/poll/current')).json()).active);
  out('poll closed after presenter moved on:', cur === null);
  out('errors:', errs.join(' | ') || 'none'); await b.close();
})();
