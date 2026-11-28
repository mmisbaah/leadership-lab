const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const ids = ['foundations','functional','followership','communication','trust','feedback','teamwork','delegation','motivation','decisions','capstone','commitment'];
  let total = 0, full = 0; const shrunk = [], over = [];
  for (const id of ids) {
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp');
    await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate(() => [...document.querySelectorAll('.pp .canvas')].map(c => { const b = c.querySelector('.cv-body'); return { s: +getComputedStyle(c).getPropertyValue('--s'), over: b.scrollHeight - b.clientHeight, num: c.querySelector('.num').textContent.trim(), t: c.className.split(' ')[1] }; }));
    for (const x of r) { total++; if (x.over > 1) over.push(`${id} ${x.num} ${x.t} +${x.over}px`); else if (x.s < 1) shrunk.push(`${id} ${x.num} ${x.t} at ${Math.round(x.s * 100)}%`); else full++; }
  }
  console.log(`slides: ${total} | fit at full size: ${full} | fit after shrinking text: ${shrunk.length} | still too long: ${over.length}`);
  console.log('shrunk:', shrunk.join('; '));
  console.log('too long:', over.join('; ') || 'none');
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
