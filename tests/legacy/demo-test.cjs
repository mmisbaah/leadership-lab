const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = process.env.B || 'http://localhost:8799';
const ADMIN = process.env.ADMIN || 'local_test', ADMIN_PW = process.env.ADMIN_PW || pw, DEMO_PW = process.env.DEMO_PW || 'demo-test-1';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const signIn = async (id, p) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(B + '/'); await pg.fill('#login', id); await pg.fill('#password', p); await pg.click('button[type=submit]'); await pg.waitForSelector('.hero'); return pg; };
  const admin = await signIn(ADMIN, ADMIN_PW);
  await admin.goto(B + '/#team'); await admin.waitForSelector('#addForm');
  if (!(await admin.textContent('table')).includes('demo')) {
    await admin.fill('#nName', 'Demo account'); await admin.fill('#nId', 'demo'); await admin.fill('#nPw', DEMO_PW); await admin.check('#nLocked'); await admin.click('#addForm button.primary');
    await admin.waitForSelector('#addMsg.ok'); console.log('created:', await admin.textContent('#addMsg'));
  }
  console.log('participants row:', (await admin.$eval('tbody', t => [...t.rows].find(r => r.textContent.includes('demo'))?.cells[0].textContent)));
  const demo = await signIn('demo', DEMO_PW);
  console.log('/api/me:', JSON.stringify(await demo.evaluate(async () => (await fetch('/api/me')).json())));
  await demo.goto(B + '/#account'); await demo.waitForSelector('#view h1');
  console.log('password form shown:', !!(await demo.$('#pwForm')), '| note:', (await demo.textContent('#view .panel h3')));
  const r = await demo.evaluate(async p => { const res = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: p, next: 'hacked-pass-1' }) }); return res.status + ' ' + JSON.stringify(await res.json()); }, DEMO_PW);
  console.log('API change attempt:', r);
  // demo can still save progress
  const pr = process.env.LIVE ? 'skipped' : await demo.evaluate(async () => { const res = await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson: 'trust', entry: { choice: 0 } }) }); return res.status; });
  console.log('demo can save progress:', pr);
  await demo.screenshot({ path: S + '/shots/demo-account.png' });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
