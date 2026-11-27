const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  fs.mkdirSync(S + '/light', { recursive: true });
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1340, height: 800 }, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('ll-theme', 'dark'); } catch {} });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const shots = { functional: [7] };
  for (const [id, ns] of Object.entries(shots)) {
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp');
    await p.evaluate(async () => { await document.fonts.ready; document.querySelector('.pr-bar').style.display = 'none'; });
    const frames = await p.$$('.pp .frame');
    for (const n of ns) { await frames[n - 1].scrollIntoViewIfNeeded(); await frames[n - 1].screenshot({ path: `${S}/light/DARK-${id}-${n}.png` }); }
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
