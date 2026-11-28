const { chromium } = require('playwright'); const fs = require('fs');
const S = process.argv[2], pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]');
  await p.waitForSelector('.hero'); await p.waitForTimeout(800);
  await p.goto(B + '/#s/communication/quiz'); await p.waitForTimeout(500);
  console.log('retry present:', !!await p.$('#retry'));
  await p.click('#retry'); await p.waitForTimeout(300);
  console.log('after retry, disabled:', await p.$eval('[data-choice="2"]', e => e.disabled), 'saved choice:', await p.evaluate(() => JSON.parse(localStorage.getItem('leadership-lab-v2')).communication));
  await b.close();
})();
