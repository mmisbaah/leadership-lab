// Screenshots every diagram and chevron slide in light and dark themes (print view: all parts shown),
// and audits every slide for fit. Usage: S=... node viz.cjs
const { chromium } = require('playwright'); const fs = require('fs');
const S = process.env.S, pw = fs.readFileSync(S + '/pw.txt', 'utf8').trim(), B = 'http://localhost:8799';
const IDS = ['foundations', 'functional', 'followership', 'communication', 'trust', 'feedback', 'teamwork', 'delegation', 'motivation', 'decisions', 'capstone', 'commitment'];
(async () => {
  fs.mkdirSync(S + '/viz', { recursive: true });
  const b = await chromium.launch(); const errs = [];
  let total = 0; const over = [], shrunk = [], shots = [];
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1340, height: 800 }, colorScheme: theme });
    await ctx.addInitScript(t => { try { localStorage.setItem('ll-theme', t); } catch {} }, theme);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${theme}: ${e.message}`));
    await p.goto(B + '/'); await p.fill('#login', 'local_test'); await p.fill('#password', pw); await p.click('button[type=submit]'); await p.waitForSelector('.hero');
    for (const id of IDS) {
      await p.goto(`${B}/#print/${id}/slides`); await p.waitForSelector('.pp');
      await p.evaluate(async () => { await document.fonts.ready; document.querySelector('.pr-bar').style.display = 'none'; });
      const info = await p.evaluate(() => [...document.querySelectorAll('.pp .canvas')].map((c, i) => { const b = c.querySelector('.cv-body'); return { i, t: c.className.split(' ')[1], d: (c.querySelector('.dg')?.className.match(/dg-(\w+)/) || [])[1], s: +getComputedStyle(c).getPropertyValue('--s'), over: b.scrollHeight - b.clientHeight, hidden: c.querySelectorAll('[data-h]').length }; }));
      const frames = await p.$$('.pp .frame');
      for (const x of info) {
        if (theme === 'light') { total++; if (x.over > 1) over.push(`${id} ${x.i + 1} ${x.t} +${x.over}`); else if (x.s < 1) shrunk.push(`${id} ${x.i + 1} ${x.t} ${Math.round(x.s * 100)}%`); if (x.hidden) over.push(`${id} ${x.i + 1} has hidden parts in print`); }
        if (x.t === 't-diagram' || x.t === 't-flow' || (x.t === 't-cover' && id === 'foundations') || (x.t === 't-scenario' && id === 'capstone' && x.i === 17)) {
          await frames[x.i].scrollIntoViewIfNeeded(); const f = `${S}/viz/${theme}-${id}-${x.i + 1}${x.d ? '-' + x.d : ''}.png`; await frames[x.i].screenshot({ path: f }); shots.push(f);
        }
      }
    }
    await ctx.close();
  }
  console.log(`slides: ${total} | too long: ${over.length ? over.join('; ') : 'none'} | shrunk: ${shrunk.join('; ') || 'none'} | screenshots: ${shots.length}`);
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
