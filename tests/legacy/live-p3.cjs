const { chromium } = require('playwright');
(async () => {
  const B = 'https://leadership.mellowpilot.com', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1340, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/'); await p.fill('#login', process.env.ADMIN_ID || 'leader_admin'); await p.fill('#password', process.env.ADMIN_PW); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
  const api = (path, body) => p.evaluate(async ([path, body]) => { const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return [r.status, await r.json()]; }, [path, body]);
  const open = await api('/api/poll/control', { action: 'open', poll: { id: 'selftest:0', q: 'Self-test', o: ['Yes', 'No'] } });
  const cur = await api('/api/poll/current');
  const vote = await api('/api/poll/vote', { id: 'selftest:0', choice: 0 });
  const res = await api('/api/poll/results?id=selftest:0');
  await api('/api/poll/control', { action: 'reset', poll: { id: 'selftest:0' } }); const closed = await api('/api/poll/control', { action: 'close' });
  console.log('open', open[0], '| current q:', cur[1].active?.q, '| vote', vote[0], '| results', JSON.stringify(res[1].counts), res[1].total, '| closed active:', closed[1].active);
  let total = 0, visual = 0;
  for (const id of ['foundations','functional','followership','communication','trust','feedback','teamwork','delegation','motivation','decisions','capstone','commitment']) {
    await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp'); total += await p.$$eval('.pp', e => e.length); visual += await p.$$eval('.pp .t-diagram, .pp .t-flow', e => e.length);
  }
  console.log('live slides:', total, '| diagram slides:', visual, '| errors:', errs.join(' | ') || 'none'); await b.close();
})();
