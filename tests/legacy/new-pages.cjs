const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero'); await p.waitForTimeout(500);
  await p.screenshot({ path: S + '/shots/n-home.png' });
  await p.click('[data-go="plan"]'); await p.waitForSelector('table'); await p.screenshot({ path: S + '/shots/n-plan.png', fullPage: true });
  await p.click('.rail [data-go="reference"]'); await p.waitForSelector('.ref-groups'); await p.screenshot({ path: S + '/shots/n-reference.png', fullPage: true });
  // save progress on a new session and confirm the server kept it
  await p.goto(B + '/#s/followership/notes'); await p.waitForSelector('#note');
  await p.fill('#note', 'Ask for a private word next time.'); await p.click('#completeBtn'); await p.waitForTimeout(1500);
  const server = await p.evaluate(async () => (await (await fetch('/api/progress')).json()).progress.followership);
  console.log('server has followership progress:', JSON.stringify(server));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
