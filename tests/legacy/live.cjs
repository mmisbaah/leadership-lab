const { chromium } = require('playwright');
(async () => {
const S = process.env.S;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage();
  const log = []; p.on('pageerror', e => log.push('pageerror ' + e.message)); p.on('requestfailed', r => log.push('failed ' + r.url() + ' ' + r.failure()?.errorText));
  p.on('response', r => { if (r.status() >= 400) log.push(r.status() + ' ' + r.url()); });
  const r = await p.goto('https://leadership.mellowpilot.com/', { waitUntil: 'load', timeout: 30000 });
  console.log('first load:', r.status(), p.url(), await p.title());
  await p.screenshot({ path: S + '/shots/live-1.png' });
  if (await p.$('#login')) {
    await p.fill('#login', process.env.ADMIN_ID || 'leader_admin'); await p.fill('#password', process.env.ADMIN_PW); await p.click('button[type=submit]');
    await p.waitForLoadState('load'); await p.waitForTimeout(2500);
    console.log('after sign-in:', p.url(), await p.title(), '| hero:', !!await p.$('.hero'), '| error box:', await p.$eval('.err', e => e.textContent).catch(() => null));
    await p.screenshot({ path: S + '/shots/live-2.png' });
  }
  console.log(log.join('\n') || 'no errors'); await b.close();
})();
