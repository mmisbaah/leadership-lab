const { chromium } = require('playwright');
(async () => {
  const B = 'https://leadership.mellowpilot.com', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1340, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', process.env.ADMIN_ID || 'leader_admin'); await p.fill('#password', process.env.ADMIN_PW); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  let total = 0, diagrams = 0;
  for (const id of ['foundations','functional','followership','communication','trust','feedback','teamwork','delegation','motivation','decisions','capstone','commitment']) {
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp');
    total += await p.$$eval('.pp', e => e.length); diagrams += await p.$$eval('.pp .t-diagram, .pp .t-flow', e => e.length);
  }
  console.log('live slides:', total, '| diagram slides:', diagrams, '| errors:', errs.join(' | ') || 'none'); await b.close();
})();
