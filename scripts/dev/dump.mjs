import { decks } from '/home/user/leadership-lab/public/decks.js';
const wc = t => String(t).trim().split(/\s+/).length;
const need = s => { const items = s.t === 'points' || s.t === 'scenario' ? (s.items || []) : [];
  return items.length > 4 || items.some(x => wc(x) > 10) || (s.t === 'cards' && s.items.some(([h, p]) => wc(p) > 10)) || (s.t === 'compare' && [...s.a[1], ...s.b[1]].some(x => wc(x) > 8))
    || (s.t === 'flow' && s.items.some(([h, p]) => wc(p) > 10)) || (s.t === 'scenario' && wc(s.p) > 28) || (['statement','discuss','section'].includes(s.t) && s.p && wc(s.p) > 16)
    || (s.t === 'check' && (s.o.some(x => wc(x) > 10) || wc(s.q) > 22)) || ['By the end of this session you can', 'What to take away', 'Try one of these'].includes(s.h); };
for (const id of process.argv.slice(2)) decks[id].forEach((s, i) => { if (!need(s)) return; const { n, ...rest } = s; console.log(`${id} ${i + 1} ${JSON.stringify(rest)}`); });
