// node shoot.cjs deck:slide ... -> screenshots of single slides at 1280x720 (print view, all points shown)
const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1340, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  for (const spec of process.argv.slice(2)) {
    const [id, n] = spec.split(':');
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp'); await p.evaluate(async () => { await document.fonts.ready; document.querySelector('.pr-bar').style.display = 'none'; });
    const el = (await p.$$('.pp .frame'))[+n - 1]; await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: `${S}/shots/s-${id}-${n}.png` });
  }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
