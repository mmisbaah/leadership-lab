const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  fs.mkdirSync(S + '/light', { recursive: true });
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1340, height: 800 }, colorScheme: 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('ll-theme', 'light'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const shots = { functional: [1, 5, 7, 12, 15, 19], trust: [7], delegation: [14], decisions: [7], teamwork: [13] };
  for (const [id, ns] of Object.entries(shots)) {
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp');
    await p.evaluate(async () => { await document.fonts.ready; document.querySelector('.pr-bar').style.display = 'none'; });
    const frames = await p.$$('.pp .frame');
    for (const n of ns) { await frames[n - 1].scrollIntoViewIfNeeded(); await frames[n - 1].screenshot({ path: `${S}/light/${id}-${n}.png` }); }
  }
  // Answered quick check in full screen.
  await p.goto(B + '/#s/feedback/class'); await p.waitForSelector('#stage'); await p.click('[data-slide="9"]'); await p.click('[data-qk="0"]');
  await p.keyboard.press('f'); await p.waitForSelector('.lesson.pres'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${S}/light/fullscreen-check.png` });
  console.log('light canvas bg:', await p.$eval('.canvas', c => getComputedStyle(c).getPropertyValue('--s-bg')), '| surround:', await p.$eval('.stage-wrap', e => getComputedStyle(e).backgroundColor));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // Projector window in light mode.
  await p.goto(B + '/#s/feedback/class'); await p.waitForSelector('#stage'); await p.keyboard.press('p'); await p.waitForSelector('.pv');
  const [proj] = await Promise.all([ctx.waitForEvent('page'), p.click('#pvOpen')]);
  await proj.setViewportSize({ width: 1440, height: 900 }); await proj.waitForSelector('.proj .canvas'); await p.waitForTimeout(600);
  await proj.screenshot({ path: `${S}/light/projector.png` });
  console.log('projector canvas bg:', await proj.$eval('.canvas', c => getComputedStyle(c).getPropertyValue('--s-bg')));
  // Switch the presenter window to dark with the theme button: slides should follow without a re-render.
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('.rail [data-theme-toggle]'); await p.waitForTimeout(300);
  console.log('after switching to dark:', await p.$eval('.canvas', c => getComputedStyle(c).getPropertyValue('--s-bg')));
  await p.screenshot({ path: `${S}/light/class-dark.png` });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
