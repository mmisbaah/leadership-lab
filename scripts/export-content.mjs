// Writes every word of the course into one Markdown file for a subject-matter reviewer: each session's facilitator
// plan, decision quiz and notes prompt, then every slide with its speaker notes, quick checks and polls.
// Usage: npm run export-content [-- <output path>]   (default: docs/content-review.md)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { lessons, totalMinutes } from '../public/lessons.js';
import { decks } from '../public/decks.js';

const out = resolve(process.argv[2] || 'docs/content-review.md');
const LETTERS = 'ABCDEFGH';
const LAYOUT = new Set(['t', 'n', 'ic', 'd', 'from', 'ph', 'flex', 'k', 'h', 'p', 'q', 'o', 'a', 'why', 'pq', 'poll', 'src', 'photo']);
const TYPE = { cover: 'Title', cards: 'Cards', points: 'Points', discuss: 'Discussion', section: 'Section', statement: 'Statement', compare: 'Comparison', diagram: 'Diagram', check: 'Quick check', flow: 'Flow', scenario: 'Scenario', reflect: 'Reflection' };
const clean = s => String(s).replace(/\s+/g, ' ').trim();
// Collect the visible text in a slide's content fields (lists, card pairs, diagram labels) in reading order.
function texts(v, acc = []) {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return acc;
  if (typeof v === 'string') { if (v.trim()) acc.push(clean(v)); return acc; }
  if (Array.isArray(v)) {
    if (v.length === 2 && v.every(x => typeof x === 'string')) { acc.push(`**${clean(v[0])}**: ${clean(v[1])}`); return acc; }
    v.forEach(x => texts(x, acc)); return acc;
  }
  for (const [k, x] of Object.entries(v)) if (!['ic', 'icon', 'x', 'y', 'w', 'c'].includes(k)) texts(x, acc);
  return acc;
}

const L = [];
L.push('# Leadership Lab: course content for review', '');
L.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`npm run export-content\`. ${lessons.length} sessions, ${Object.values(decks).filter((d, i) => lessons[i]).length ? lessons.reduce((n, l) => n + (decks[l.id]?.length || 0), 0) : 0} slides, ${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min of teaching.`, '');
L.push('For each session: the facilitator plan, the decision quiz (the strongest answer is marked ✔), the private-notes prompt, and every slide with its speaker notes. Edit the source in `public/lessons.js` and `public/decks.js`, not this file.', '');
L.push('## Contents', '', ...lessons.map(l => `- [Session ${l.n}: ${l.title}](#session-${l.n}-${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')})`), '');

for (const l of lessons) {
  L.push('---', '', `## Session ${l.n}: ${l.title}`, '', `*${l.phase} · ${l.minutes} minutes · Activity: ${l.activity}*`, '', l.intro, '');
  if (l.outcomes?.length) L.push('**Outcomes**', '', ...l.outcomes.map(o => `- ${o}`), '');
  if (l.model?.length) L.push(`**Model:** ${l.model.join(' → ')}`, '');
  if (l.instructions?.length) L.push(`**Activity: ${l.activity}**`, '', ...l.instructions.map((s, i) => `${i + 1}. ${s}`), '');
  L.push('**Decision quiz**', '', l.scenario, '', ...l.choices.map((c, j) => `- ${LETTERS[j]}. ${c}${j === l.correct ? ' ✔' : ''}`), '', `*Why:* ${l.reason}`, '');
  L.push(`**Notes prompt (private to each participant):** ${l.prompt}`, '');
  L.push(`### Slides (${decks[l.id].length})`, '');
  decks[l.id].forEach((s, i) => {
    const title = s.h || s.q || s.k || TYPE[s.t] || s.t;
    L.push(`#### ${i + 1}. ${clean(title)} · ${TYPE[s.t] || s.t}`, '');
    if (s.k && s.h) L.push(`*${clean(s.k)}*`, '');
    if (s.p) L.push(clean(s.p), '');
    const body = Object.entries(s).filter(([k]) => !LAYOUT.has(k) || (k === 'a' && s.t !== 'check')).flatMap(([, v]) => texts(v));
    if (body.length) L.push(...body.map(x => `- ${x}`), '');
    if (s.t === 'check') L.push(...(s.h ? [clean(s.q), ''] : []), ...s.o.map((o, j) => `- ${LETTERS[j]}. ${clean(o)}${j === s.a ? ' ✔' : ''}`), '', `*Why:* ${clean(s.why || '')}`, '');
    if (s.poll || s.pq) L.push(`*Live poll:* ${clean(s.pq || s.q || s.h)}`, '');
    if (s.photo) L.push(`*Photo:* ${s.photo.src ? s.photo.src : 'not yet supplied'} — ${clean(s.photo.subject || '')} (alt: ${clean(s.photo.alt || '')})`, '');
    if (s.src) L.push(`*Source:* ${clean(s.src)}`, '');
    if (s.n) L.push(`> **Speaker notes:** ${clean(s.n)}`, '');
  });
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, L.join('\n'));
console.log(`Wrote ${out} (${L.length} lines)`);
