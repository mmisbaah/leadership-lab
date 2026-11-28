const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch();
  for (const blockCss of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
    if (blockCss) await p.route(/\/css\/app\.css/, r => r.abort());
    await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('#view .hero, #view h1');
    await p.goto(B + '/#s/trust/class'); await p.waitForSelector('#stage'); await p.click('[data-slide="22"]'); await p.waitForTimeout(300);
    const txt = await p.$eval('.s-cards', e => e.innerText.replace(/\n/g, ' / '));
    console.log(blockCss ? 'NO CSS :' : 'WITH CSS:', txt.slice(0, 120));
    await p.screenshot({ path: `${S}/shots/space-${blockCss ? 'nocss' : 'css'}.png` });
    await ctx.close();
  }
  await b.close();
})();
