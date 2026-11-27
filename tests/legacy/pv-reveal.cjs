const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('presenter: ' + e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  await p.goto(B + '/#mock'); await p.waitForSelector('#stage'); await p.keyboard.press('p'); await p.waitForSelector('.pv');
  const [proj] = await Promise.all([ctx.waitForEvent('page'), p.click('#pvOpen')]);
  proj.on('pageerror', e => errs.push('projector: ' + e.message));
  await proj.waitForSelector('.proj .canvas'); await p.waitForTimeout(700);
  const st = async () => ({ pres: await p.$eval('.pv-cur .num', e => e.textContent), ghost: await p.$$eval('.pv-cur .ghost', e => e.length),
    proj: await proj.$eval('.num', e => e.textContent), hidden: await proj.$$eval('.hid', e => e.length) });
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  console.log('on reveal slide, 0 shown  ', JSON.stringify(await st()));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  console.log('after 2 reveals           ', JSON.stringify(await st()));
  await proj.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  console.log('arrow on projector reveals', JSON.stringify(await st()));
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
  console.log('back hides one again      ', JSON.stringify(await st()));
  console.log('linked:', await p.textContent('#pvLink'), '| errors:', errs.join(' | ') || 'none'); await b.close();
})();
