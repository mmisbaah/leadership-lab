// Applies edit batches to the course decks and rewrites public/decks.js.
// Every on-screen field that is shortened has its original wording appended to the slide's speaker notes,
// so no instructional detail is lost. Usage: node build-decks.mjs <repo>/public <edits.mjs>...
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [pub, ...editFiles] = process.argv.slice(2);
const { decks, reference } = await import(pathToFileURL(pub + '/decks.js') + '?' + Date.now());
const { lessons } = await import(pathToFileURL(pub + '/lessons.js'));
const L = id => lessons.find(l => l.id === id);

// Shared slides as decks.js builds them; unchanged ones are written back as helper calls.
const helpers = {
  cover: id => ({ t: 'cover', n: `Welcome the group to session ${L(id).n}. Read the title, then give the purpose in your own words: ${L(id).intro} Say how long the session runs (${L(id).minutes} minutes) and that there is a practical activity in the middle.` }),
  outcomes: id => ({ t: 'points', k: 'Outcomes', h: 'By the end of this session you can', items: L(id).outcomes, n: 'Read the three outcomes aloud. Ask people to pick the one that matters most in their job right now and keep it in mind; you will come back to it in the reflection.' }),
  activity: id => ({ t: 'points', k: 'Group practice', h: L(id).activity, items: L(id).instructions, n: 'Brief the whole activity before anyone moves. Check that every group knows the task, the time limit and what they will report back. Then circulate and listen for examples you can use in the debrief.' }),
  lessonCheck: id => ({ t: 'check', q: L(id).scenario, o: L(id).choices, a: L(id).correct, why: L(id).reason, n: 'Let the room call out an answer and say why before you tap it. If people disagree, ask each side for their reasoning first: the discussion matters more than the answer.' }),
  reflect: id => ({ t: 'reflect', h: 'Apply it at work', p: L(id).prompt, n: 'Give two minutes of quiet writing. Participants can type their answer in the Notes tab; it is private to them. Invite one or two volunteers to share, but do not push anyone.' }),
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Text of a field as a readable sentence, for the notes.
const flat = (key, v) => {
  if (key === 'a' || key === 'b') return `${v[0]}: ${v[1].join('; ')}`;
  if (Array.isArray(v)) return v.map(x => Array.isArray(x) ? (Array.isArray(x[1]) ? `${x[0]}: ${x[1].join('; ')}` : `${x[0]}: ${x[1]}`) : x).join('; ');
  return String(v);
};
const LABEL = { items: 'On-screen points', p: 'Full text', o: 'Full options', q: 'Full question', a: 'Left column', b: 'Right column', key: 'Key' };
const COPY_FIELDS = ['items', 'p', 'o', 'q'];

const edits = {};
for (const f of editFiles) { const m = await import(pathToFileURL(f) + '?' + Date.now()); for (const [id, e] of Object.entries(m.default)) edits[id] = { ...(edits[id] || {}), ...e }; }

const out = {};
const report = [];
for (const [id, deck] of Object.entries(decks)) {
  const e = edits[id] || {};
  out[id] = deck.flatMap((s, i) => {
    const ed = e[i + 1];
    if (!ed) return [s];
    const { insertAfter = [], ...fields } = ed;
    return [edit(s, fields, id, i), ...insertAfter];
  });
}
function edit(s, ed, id, i) {
  {
    const next = { ...s, ...ed };
    for (const k of Object.keys(next)) if (next[k] === null) delete next[k];
    // Preserve the original wording of shortened copy in the notes.
    const kept = [];
    for (const k of [...COPY_FIELDS, 'a', 'b']) {
      if (!(k in ed) || s[k] === undefined || same(s[k], ed[k])) continue;
      if ((k === 'a' || k === 'b') && s.t === 'check') continue;
      kept.push(`${LABEL[k]}: ${flat(k, s[k])}`);
    }
    if (s.t !== next.t && s.items && !('items' in ed)) kept.push(`Original points: ${flat('items', s.items)}`);
    if (kept.length) next.n = `${ed.n || s.n} | Full wording from the earlier slide: ${kept.join(' | ')}`;
    report.push(`${id} ${i + 1}: ${Object.keys(ed).join(', ')}`);
    return next;
  }
}

// Serialise. Helper slides stay helper calls when unchanged.
const q = v => JSON.stringify(v);
const lit = s => '{ ' + Object.entries(s).map(([k, v]) => `${k}: ${q(v)}`).join(', ') + ' }';
const slideSrc = (id, s) => {
  for (const [name, fn] of Object.entries(helpers)) if (L(id) && same(s, fn(id))) return `${name}('${id}')`;
  return lit(s);
};
const order = [...lessons.map(l => l.id), ...Object.keys(out).filter(id => !L(id))];
const header = readFileSync(pub + '/decks.js', 'utf8').split('export const decks = {')[0];
let src = header + 'export const decks = {\n';
for (const id of order) {
  const l = L(id);
  src += `\n  // ───────────── ${l ? `${l.n} ${l.title} (${l.phase})` : 'Mock-ups for design review (#mock)'} ─────────────\n  ${/^[a-z]+$/.test(id) ? id : q(id)}: [\n`;
  src += out[id].map(s => '    ' + slideSrc(id, s) + ',').join('\n') + '\n  ],\n';
}
src += '};\n\n// Quick-reference material shown on the Reference page. Each list mirrors the slides in the matching session.\nexport const reference = ' + JSON.stringify(reference, null, 2) + ';\n';
writeFileSync(pub + '/decks.js', src);
console.log(`edited ${report.length} slides`);
