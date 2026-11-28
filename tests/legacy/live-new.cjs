const { chromium } = require('playwright');
(async () => {
  const B = 'https://leadership.mellowpilot.com';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', process.env.ADMIN_ID || 'leader_admin'); await p.fill('#password', process.env.ADMIN_PW); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  console.log('sessions in nav:', await p.textContent('.nav .count'), '| hero:', (await p.textContent('.hero .sub')).slice(0, 60));
  await p.goto(B + '/#reference'); await p.waitForSelector('.ref-groups'); console.log('reference sections:', await p.$$eval('#view .panel', e => e.length));
  for (const id of ['functional', 'followership', 'teamwork']) { await p.goto(`${B}/#s/${id}/class`); await p.waitForSelector('#stage'); console.log(id, 'slides:', await p.$$eval('.thumbs button', e => e.length)); }
  await p.goto(B + '/#plan'); await p.waitForSelector('table'); console.log('plan days:', await p.$$eval('table', e => e.length));
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
