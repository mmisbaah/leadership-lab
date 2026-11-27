const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const ids = ['foundations','functional','followership','communication','trust','feedback','teamwork','delegation','motivation','decisions','capstone','commitment'];
  const overflow = []; let total = 0;
  for (const id of ids) {
    await p.goto(`${B}/#s/${id}/class`); await p.waitForSelector('#stage');
    await p.keyboard.press('f'); await p.waitForSelector('.lesson.pres');
    const n = await p.evaluate(() => document.querySelectorAll('.thumbs button').length);
    for (let i = 0; i < n; i++) {
      total++;
      const r = await p.evaluate(() => { const s = document.querySelector('#stage'); return { over: s.scrollHeight - s.clientHeight, num: s.querySelector('.num').textContent, type: s.className }; });
      if (r.over > 2) { overflow.push(`${id} ${r.num} (${r.type}) +${r.over}px`); await p.screenshot({ path: `${S}/shots/ovf-${id}-${i + 1}.png` }); }
      if (['functional','followership','teamwork'].includes(id) && [6, 11, 14, 18].includes(i)) await p.screenshot({ path: `${S}/shots/deck-${id}-${i + 1}.png` });
      await p.keyboard.press('ArrowRight'); await p.waitForTimeout(30);
    }
    await p.keyboard.press('Escape');
  }
  console.log('slides rendered:', total); console.log('overflowing at 1280x720:', overflow.length ? '\n' + overflow.join('\n') : 'none');
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
