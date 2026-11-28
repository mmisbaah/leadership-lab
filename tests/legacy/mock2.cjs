const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const login = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero'); return p; };
  // 16:10 laptop, full screen: letterboxing
  let ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); let p = await login(ctx);
  await p.goto(B + '/#mock'); await p.waitForSelector('#stage'); await p.click('[data-slide="1"]'); await p.keyboard.press('f'); await p.waitForTimeout(500);
  await p.screenshot({ path: S + '/mock/20-adair-16x10.png' });
  console.log('16:10 frame', await p.$eval('.frame', f => `${f.offsetWidth}x${f.offsetHeight} at ${f.offsetLeft},${f.offsetTop}`));
  await ctx.close();
  // Normal class tab + presenter view
  ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); p = await login(ctx);
  await p.goto(B + '/#mock'); await p.waitForSelector('#stage'); await p.click('[data-slide="2"]'); await p.click('#prevS'); await p.click('#prevS'); await p.waitForTimeout(300);
  await p.screenshot({ path: S + '/mock/21-class-tab-ghost.png', fullPage: true });
  await p.keyboard.press('p'); await p.waitForSelector('.pv'); await p.waitForTimeout(400);
  await p.screenshot({ path: S + '/mock/22-presenter.png' });
  await ctx.close();
  // Print views
  ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); p = await login(ctx);
  for (const m of ['slides', 'facilitator']) {
    await p.goto(`${B}/#print/_mockup/${m}`); await p.waitForSelector('.pr'); await p.waitForTimeout(400);
    await p.screenshot({ path: `${S}/mock/23-print-${m}.png` });
    await p.pdf({ path: `${S}/mock/print-${m}.pdf`, printBackground: true, preferCSSPageSize: true });
  }
  await ctx.close();
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
