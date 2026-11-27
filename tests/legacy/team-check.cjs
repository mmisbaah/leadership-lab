const { chromium } = require('playwright');
(async () => {
  const B = 'https://leadership.mellowpilot.com', b = await chromium.launch(), p = await b.newPage();
  await p.goto(B + '/'); await p.fill('#login', process.env.ADMIN_ID || 'leader_admin'); await p.fill('#password', process.env.ADMIN_PW); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const rows = await p.evaluate(async () => (await (await fetch('/api/team')).json()).map(r => `${r.id} (${r.name}) admin=${r.admin} locked=${r.locked}`));
  console.log(rows.join('\n'));
  await p.goto(B + '/#team'); await p.waitForSelector('table'); await p.waitForTimeout(500);
  console.log('table row:', await p.$eval('tbody', t => [...t.rows].find(r => r.cells[1].textContent.trim() === 'demo')?.cells[0].textContent.trim()));
  await b.close();
})();
