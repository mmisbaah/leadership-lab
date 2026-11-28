const { chromium, devices } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  await p.goto(B + '/#s/trust/plan'); await p.waitForSelector('.outline');
  await p.locator('.outline').scrollIntoViewIfNeeded(); await p.screenshot({ path: S + '/shots/outline.png' });
  await p.click('[data-goslide="13"]'); await p.waitForSelector('#stage');
  console.log('outline jump lands on:', await p.$eval('#stage .num', e => e.textContent));
  const ph = await b.newContext({ ...devices['iPhone 13'] }); await ph.addCookies(await ctx.cookies());
  const q = await ph.newPage(); q.on('pageerror', e => errs.push('phone ' + e.message));
  await q.goto(B + '/#s/trust/class'); await q.waitForSelector('#stage'); await q.click('#pvS'); await q.waitForSelector('.pv'); await q.waitForTimeout(300);
  await q.screenshot({ path: S + '/shots/pv-phone.png', fullPage: false });
  console.log('phone overflow-x:', await q.evaluate(() => document.documentElement.scrollWidth > innerWidth), '| errors:', errs.join('|') || 'none');
  await b.close();
})();
