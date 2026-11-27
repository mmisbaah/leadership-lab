import { lessons, totalMinutes } from './lessons.js';

// ---------- constants ----------
const CACHE_KEY = 'leadership-lab-v2';
const PHASES = [
  { key: 'SELF', name: 'Self', c: 'var(--p1)', blurb: 'How you show up: credibility, values and the influence you already have.' },
  { key: 'PEOPLE', name: 'People', c: 'var(--p2)', blurb: 'Communication, trust and feedback: the everyday work of leading people.' },
  { key: 'PERFORMANCE', name: 'Performance', c: 'var(--p3)', blurb: 'Delegation, motivation and decisions that get work done through others.' },
  { key: 'INTEGRATE', name: 'Integrate', c: 'var(--p4)', blurb: 'Bring the day’s skills together in one evolving team situation.' },
  { key: 'APPLY', name: 'Apply', c: 'var(--p5)', blurb: 'Turn the day into one specific action you will take at work.' },
];
const TABS = [['plan', 'Facilitator plan'], ['class', 'Class'], ['quiz', 'Quiz'], ['notes', 'Notes']];
const PAGES = ['home', 'sessions', 'plan', 'help', 'account', 'team'];
const LETTERS = 'ABCDEF';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const phaseOf = l => PHASES.find(p => p.key === l.phase) || PHASES[0];
const phaseNo = l => PHASES.indexOf(phaseOf(l)) + 1;
const inPhase = key => lessons.filter(l => l.phase === key);
const pad = n => String(n).padStart(2, '0');
const clock = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// ---------- state ----------
let me = null;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { saved = {}; }
let page = 'home', homePhase = null, lastPage = 'home';
let L = null; // open session: { id, tab, slide, pres, notes, picks: {}, score }

// ---------- server and saving ----------
async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
function cache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch {} }
let syncTimer = null, syncText = '';
const pending = new Set();
function setStatus(t) { syncText = t; $$('[data-sync]').forEach(el => { el.textContent = t; }); }
function queueSave(id, wait = 600) {
  cache(); pending.add(id); setStatus('Saving…');
  clearTimeout(syncTimer); syncTimer = setTimeout(flush, wait);
}
async function flush() {
  const ids = [...pending]; pending.clear();
  try {
    for (const id of ids) await call('/api/progress', { lesson: id, entry: saved[id] || {} });
    setStatus('Saved to your account');
  } catch {
    ids.forEach(id => pending.add(id));
    setStatus('Not saved yet. Retrying…');
    clearTimeout(syncTimer); syncTimer = setTimeout(flush, 5000);
  }
}
function update(id, patch) {
  saved[id] = { ...(saved[id] || {}), ...patch };
  Object.keys(saved[id]).forEach(k => saved[id][k] === undefined && delete saved[id][k]);
}
const isDone = l => !!saved[l.id]?.done;
const doneCount = () => lessons.filter(isDone).length;
const nextLesson = () => lessons.find(l => !isDone(l)) || lessons[lessons.length - 1];

function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

// ---------- theme ----------
const isDark = () => document.documentElement.dataset.theme === 'dark';
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('neu', !dark);
  try { localStorage.setItem('ll-theme', dark ? 'dark' : 'light'); } catch {}
  $$('[data-theme-toggle]').forEach(b => { b.textContent = dark ? 'Light theme' : 'Dark theme'; });
}
document.addEventListener('click', e => { if (e.target.closest('[data-theme-toggle]')) setTheme(!isDark()); if (e.target.closest('[data-print]')) print(); });

// ---------- shell ----------
function shell() {
  const items = [['home', 'Home'], ['sessions', 'Sessions', lessons.length], ['plan', 'Course plan'], ['help', 'Help'], ['account', 'Account']];
  if (me?.admin) items.push(['team', 'Participants']);
  $('#nav').innerHTML = items.map(([id, label, n]) => `<button class="${page === id ? 'on' : ''}" data-go="${id}" ${page === id ? 'aria-current="page"' : ''}>${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('');
  $('#tabs').innerHTML = [['home', 'Home'], ['sessions', 'Sessions'], ['plan', 'Plan'], ['account', 'Account']]
    .map(([id, label]) => `<button class="${page === id ? 'on' : ''}" data-go="${id}">${label}</button>`).join('');
  const nx = nextLesson();
  $('#railFoot').innerHTML = `<div class="role">Working on</div><div>${doneCount() === lessons.length ? 'All sessions complete' : `Session ${nx.n} · ${esc(phaseOf(nx).name)}`}</div>
    <div style="margin-top:8px">${me ? `Signed in as <span class="who">${esc(me.name)}</span>` : 'Connecting…'}</div>
    <div class="sync" data-sync>${esc(syncText)}</div>
    <button class="theme-btn" data-theme-toggle type="button">${isDark() ? 'Light theme' : 'Dark theme'}</button>`;
  $$('.topbar [data-theme-toggle]').forEach(b => { b.textContent = isDark() ? 'Light theme' : 'Dark theme'; });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) location.hash = b.dataset.go; });

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = h.match(/^s\/([a-z]+)(?:\/([a-z]+))?/);
  if (m && lessons.some(l => l.id === m[1])) {
    const tab = TABS.some(t => t[0] === m[2]) ? m[2] : 'plan';
    if (!L || L.id !== m[1]) L = { id: m[1], tab, slide: 0, pres: false, notes: false, picks: {}, score: 0 };
    else L.tab = tab;
    if (tab !== 'class') L.pres = false;
    if (!$('#view').innerHTML) renderPage();
    renderLesson();
    return;
  }
  closeLessonView();
  page = PAGES.includes(h) ? h : 'home';
  if (page === 'team' && me && !me.admin) page = 'home';
  lastPage = page;
  renderPage();
}

function renderPage() {
  shell();
  const v = $('#view');
  if (page === 'sessions') v.innerHTML = sessionsHTML();
  else if (page === 'plan') v.innerHTML = planHTML();
  else if (page === 'help') v.innerHTML = helpHTML();
  else if (page === 'account') { v.innerHTML = accountHTML(); bindAccount(); }
  else if (page === 'team') { v.innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Participants</h1><p>Loading…</p></div>`; loadTeam(); }
  else { v.innerHTML = homeHTML(); bindHome(); }
  document.title = ({ sessions: 'Sessions · ', plan: 'Course plan · ', help: 'Help · ', account: 'Account · ', team: 'Participants · ' }[page] || '') + 'Leadership Lab';
}

// ---------- cards ----------
function card(l) {
  const s = saved[l.id] || {};
  const chip = s.done ? '<span class="chip ok">✓ Done</span>' : l === nextLesson() ? '<span class="chip now">Up next</span>' : `<span class="chip dim">${l.minutes} min</span>`;
  return `<article class="mod-card">
    <div class="meta"><span class="eyebrow">Session ${l.n} · ${esc(phaseOf(l).name)}</span>${chip}</div>
    <h4>${esc(l.title)}</h4><p>${esc(l.intro)}</p>
    <p class="small muted">Activity: ${esc(l.activity)} · ${l.minutes} min</p>
    <div class="acts"><button class="btn sm primary" data-open="${l.id}/plan">Open session</button><button class="btn sm" data-present="${l.id}">Present</button><button class="btn sm" data-open="${l.id}/quiz">Quiz</button><button class="btn sm" data-open="${l.id}/notes">Notes</button></div>
  </article>`;
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { location.hash = 's/' + o.dataset.open; return; }
  const p = e.target.closest('[data-present]');
  if (p) { L = { id: p.dataset.present, tab: 'class', slide: 0, pres: true, notes: false, picks: {}, score: 0 }; location.hash = `s/${p.dataset.present}/class`; enterFullscreen(); }
});

// ---------- home ----------
function homeHTML() {
  const nx = nextLesson();
  const cur = homePhase || nx.phase;
  const ph = PHASES.find(p => p.key === cur);
  const curNo = PHASES.indexOf(PHASES.find(p => p.key === nx.phase)) + 1;
  const hours = Math.floor(totalMinutes / 60), mins = totalMinutes % 60;
  return `<section class="hero">
    <div class="top"><div><div class="eyebrow">Leadership training · Facilitator material</div><h1>Leadership Lab</h1>
      <p class="sub">${me ? `Welcome, ${esc(me.name.split(' ')[0])}. ` : ''}A practical one-day course: ${lessons.length} sessions in ${PHASES.length} phases, ${hours} h ${mins} min of teaching from 09:00 to 16:00. Present each session, run the activity and decision check, and leave with one action for work.</p></div>
      <div class="wk"><div class="n">${curNo}<small>/${PHASES.length}</small></div><div class="ph">Phase you’re working in</div></div></div>
    <div class="phase-strip" role="group" aria-label="Training phases">${PHASES.map((p, i) => {
      const ls = inPhase(p.key), d = ls.filter(isDone).length;
      return `<button style="--c:${p.c}" class="${p.key === cur ? 'cur' : ''}" data-phase="${p.key}" aria-pressed="${p.key === cur}"><b>${i + 1}</b><span>${p.name}</span><small>${ls.length} session${ls.length === 1 ? '' : 's'} · ${d}/${ls.length} done</small></button>`;
    }).join('')}</div>
  </section>
  <div class="quick"><button class="btn" data-go="plan">Course plan</button><button class="btn" data-open="${nx.id}/plan">${doneCount() === lessons.length ? 'Review the last session' : doneCount() ? `Continue: Session ${nx.n}` : 'Start with Session 01'}</button><button class="btn" data-present="${nx.id}">Present Session ${nx.n}</button></div>
  <div class="grid2">
    <section class="panel"><h3 style="color:inherit">Phase ${PHASES.indexOf(ph) + 1} · ${ph.name}</h3><p class="muted">${ph.blurb}</p>
      <div class="mod-list">${inPhase(ph.key).map(card).join('')}</div></section>
    <section class="panel tips"><h3>Presenting a class</h3>
      <p><b>Open session</b> starts with the facilitator plan: purpose, outcomes, the three-step model and suggested timings. <b>Present</b> opens the class slides full screen.</p>
      <p><b>Arrow keys</b> or the on-screen buttons move between slides. <kbd>F</kbd> toggles full screen, <kbd>N</kbd> shows the facilitator note, <kbd>Esc</kbd> leaves.</p>
      <p><b>Quick checks</b> on the slides: let the room call out an answer, then tap it. The right answer gets confetti and the reasoning appears underneath.</p>
      <p><b>Quiz</b> and <b>Notes</b> are for each participant. Their answer, private reflection and completed sessions save to their own account.</p>
      <p><b>Course plan</b> lays the nine sessions out across the day with breaks, so you can keep time.</p>
      <div class="stats"><div class="stat"><b>${doneCount()}/${lessons.length}</b><span>sessions done</span></div><div class="stat"><b>${hours}h ${mins}m</b><span>teaching time</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.note).length}</b><span>notes written</span></div></div>
    </section>
  </div>`;
}
function bindHome() { $$('[data-phase]').forEach(b => b.onclick = () => { homePhase = b.dataset.phase; renderPage(); }); }

// ---------- sessions ----------
function sessionsHTML() {
  return `<div class="page-head"><div class="eyebrow">${lessons.length} sessions · ${PHASES.length} phases</div><h1>Sessions</h1><p>Every session has a facilitator plan, class slides with a quick check, a decision quiz and a private notes page.</p></div>
  ${PHASES.map((p, i) => `<div class="phase-sec" style="--c:${p.c}"><h3>${i + 1} · ${p.name}</h3><span class="muted small">${esc(p.blurb)}</span></div><div class="mod-grid">${inPhase(p.key).map(card).join('')}</div>`).join('')}`;
}

// ---------- course plan ----------
function dayPlan() {
  // Suggested timetable: 09:00 start, a short welcome, breaks after sessions 02 and 07, lunch after 04, a short close. Ends 16:00.
  const after = { communication: ['Morning break', 15], feedback: ['Lunch', 60], motivation: ['Afternoon break', 15] };
  const rows = []; let t = 9 * 60;
  const add = (label, min, l) => { rows.push({ start: t, end: t + min, label, min, l }); t += min; };
  add('Welcome, introductions and the day’s plan', 15);
  for (const l of lessons) { add(l.title, l.minutes, l); if (after[l.id]) add(...after[l.id]); }
  add('Evaluation and close', 10);
  return rows;
}
function planHTML() {
  const rows = dayPlan();
  return `<div class="page-head"><div class="eyebrow">Suggested timetable</div><h1>Course plan</h1><p>The nine sessions across one day, ${clock(rows[0].start)}–${clock(rows.at(-1).end)}. Session lengths come from the course; the welcome, breaks and close are a suggestion to adjust for your group.</p></div>
  <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Session</th><th>Phase</th><th>Activity</th><th></th></tr></thead><tbody>
  ${rows.map(r => r.l
    ? `<tr><td class="time">${clock(r.start)}–${clock(r.end)}</td><td><b>${r.l.n}</b> ${esc(r.l.title)}<div class="small muted">${r.min} min</div></td><td><span class="ph" style="--c:${phaseOf(r.l).c}"></span>${phaseOf(r.l).name}</td><td>${esc(r.l.activity)}</td><td>${isDone(r.l) ? '<span class="chip ok">✓</span>' : `<button class="btn sm" data-open="${r.l.id}/plan">Open</button>`}</td></tr>`
    : `<tr class="brk"><td class="time">${clock(r.start)}–${clock(r.end)}</td><td colspan="4">${esc(r.label)} · ${r.min} min</td></tr>`).join('')}
  </tbody></table></div>
  <div class="row no-print"><button class="btn" data-print>Print the course plan</button></div>`;
}

// ---------- help ----------
function helpHTML() {
  return `<div class="page-head"><div class="eyebrow">How to use the guide</div><h1>Help</h1></div>
  <div class="grid2 help">
    <section class="panel"><h3>Running a session</h3><ol class="list">
      <li>Open the session from <b>Home</b> or <b>Sessions</b>. The <b>Facilitator plan</b> tab has the purpose, outcomes, model, suggested timings and activity steps.</li>
      <li>Switch to <b>Class</b> and press <b>Present</b> (or <kbd>F</kbd>) to show the slides full screen on a projector or shared screen.</li>
      <li>On the quick-check slide, let the room call out an answer, then tap it to reveal the reasoning.</li>
      <li>Close with the reflection slide. Participants write their action in <b>Notes</b> and mark the session complete.</li></ol></section>
    <section class="panel"><h3>Keyboard shortcuts</h3><div class="steps">
      <div class="step"><kbd>→</kbd><span>Next slide</span></div><div class="step"><kbd>←</kbd><span>Previous slide</span></div>
      <div class="step"><kbd>F</kbd><span>Full screen on or off</span></div><div class="step"><kbd>N</kbd><span>Show or hide the facilitator note while presenting</span></div>
      <div class="step"><kbd>Esc</kbd><span>Leave full screen, then close the session</span></div></div></section>
    <section class="panel"><h3>Accounts and privacy</h3>
      <p>Every participant signs in with their own login. Quiz answers, notes and completed sessions save to that account and follow them to another device.</p>
      <p>Facilitators see who has completed which session and how many notes each person wrote, but never what the notes say.</p>
      <p>Forgot a password? A facilitator can set a new one under <b>Participants</b>.</p></section>
    <section class="panel"><h3>Install and offline use</h3>
      <p>Use your browser’s “Install” or “Add to Home Screen” option to keep the guide one tap away. After one visit, the pages work without a connection; anything you change saves to your account when you’re back online.</p></section>
  </div>`;
}

// ---------- account ----------
function accountHTML() {
  return `<div class="page-head"><div class="eyebrow">Your account</div><h1>${esc(me?.name || 'Account')}</h1><p>Signed in as <b>${esc(me?.id || '…')}</b>${me?.admin ? ' · facilitator' : ''}.</p></div>
  <div class="grid2">
    <section class="panel"><h3>Change your password</h3><form id="pwForm" class="list">
      <div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="small muted">At least 8 characters.</p><div class="row"><button class="btn primary">Change password</button></div><p class="msg" id="pwMsg" role="status"></p></form></section>
    <section class="panel"><h3>Your progress</h3>
      <div class="stats"><div class="stat"><b>${doneCount()}/${lessons.length}</b><span>sessions done</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.choice !== undefined).length}</b><span>quizzes answered</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.note).length}</b><span>notes written</span></div></div>
      <p class="muted small">Starting over clears your quiz answers, notes and completed sessions.</p>
      <div class="row"><button class="btn danger" id="resetBtn">Start over</button></div><p class="msg" id="resetMsg" role="status"></p>
      <h3 style="margin-top:8px">Sign out</h3><div class="row"><button class="btn" id="logoutBtn">Sign out</button><a class="btn" href="/login?switch=1">Switch account</a></div></section>
  </div>`;
}
function bindAccount() {
  $('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#pwMsg');
    try { await call('/api/password', { current: $('#pwCur').value, next: $('#pwNew').value }); msg.className = 'msg ok'; msg.textContent = 'Password changed.'; e.target.reset(); }
    catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  };
  $('#resetBtn').onclick = async () => {
    if (!confirm('Clear all your answers, notes and progress? This can’t be undone.')) return;
    try { await call('/api/progress', { reset: true }); saved = {}; cache(); renderPage(); toast('Progress cleared'); }
    catch (err) { $('#resetMsg').className = 'msg bad'; $('#resetMsg').textContent = err.message; }
  };
  $('#logoutBtn').onclick = async () => {
    await fetch('/logout', { method: 'POST' });
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    location.href = '/login';
  };
}

// ---------- facilitator: participants ----------
async function loadTeam() {
  let rows;
  try { rows = await call('/api/team'); }
  catch (err) { $('#view').innerHTML = `<div class="page-head"><h1>Participants</h1><p class="msg bad">${esc(err.message)}</p></div>`; return; }
  if (page !== 'team') return;
  const when = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '–';
  $('#view').innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Participants</h1>
  <p>${rows.length} account${rows.length === 1 ? '' : 's'}. You see each person’s progress and how many notes they wrote, but not what the notes say.</p></div>
  <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Login ID</th><th>Progress</th><th>Notes</th><th>Last completed</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.name)}${r.admin ? ' <span class="chip dim">facilitator</span>' : ''}</td><td class="mono">${esc(r.id)}</td>
    <td style="white-space:nowrap"><span class="dots" title="${r.done.length} of ${lessons.length}">${lessons.map(l => `<span class="${r.done.includes(l.id) ? 'on' : ''}" title="${esc(l.title)}"></span>`).join('')}</span>${r.done.length}/${lessons.length}</td>
    <td>${r.notes}</td><td>${when(r.last)}</td>
    <td style="white-space:nowrap">${r.id === me.id ? '<span class="small muted">you</span>' : `<button class="link" data-reset="${esc(r.id)}">New password</button> · <button class="link danger" data-remove="${esc(r.id)}" data-name="${esc(r.name)}">Remove</button>`}</td></tr>`).join('')}
  </tbody></table></div>
  <section class="panel"><h3>Add a participant</h3><form id="addForm" class="list">
    <div class="form-row"><div class="field"><label for="nName">Name</label><input id="nName" required maxlength="80" placeholder="e.g. Aishath Ali"></div>
    <div class="field"><label for="nId">Login ID</label><input id="nId" required autocapitalize="none" spellcheck="false" placeholder="e.g. aishath"></div>
    <div class="field"><label for="nPw">Starting password</label><input id="nPw" required minlength="8" placeholder="8+ characters"></div></div>
    <label class="check"><input type="checkbox" id="nAdmin"> Facilitator (can manage accounts)</label>
    <div class="row"><button class="btn primary">Add account</button><button type="button" class="btn" id="genPw">Suggest a password</button></div>
    <p class="msg" id="addMsg" role="status"></p></form></section>`;
  const pw = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  $('#genPw').onclick = () => { $('#nPw').value = pw(); };
  $('#addForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const id = $('#nId').value.trim().toLowerCase(), password = $('#nPw').value;
      await call('/api/users', { id, name: $('#nName').value, password, admin: $('#nAdmin').checked });
      await loadTeam();
      const m = $('#addMsg'); m.className = 'msg ok'; m.textContent = `Account created. Give them login ID “${id}” and password “${password}”.`;
    } catch (err) { const m = $('#addMsg'); m.className = 'msg bad'; m.textContent = err.message; }
  };
  $$('[data-reset]').forEach(b => b.onclick = async () => {
    const password = prompt(`New password for ${b.dataset.reset} (at least 8 characters):`, pw());
    if (!password) return;
    try { await call('/api/users', { id: b.dataset.reset, password, replace: true }); alert(`Password changed. Their new password is: ${password}`); loadTeam(); }
    catch (err) { alert(err.message); }
  });
  $$('[data-remove]').forEach(b => b.onclick = async () => {
    if (!confirm(`Remove ${b.dataset.name}? Their progress and notes are deleted too.`)) return;
    try { await call('/api/users/remove', { id: b.dataset.remove }); loadTeam(); }
    catch (err) { alert(err.message); }
  });
}

// ---------- session screen ----------
function timing(l) {
  // Suggested split of the session's minutes; whole minutes, remainder goes to the activity.
  const parts = [['Open and purpose', .1], ['Outcomes and model', .2], ['Activity: ' + l.activity, .45], ['Decision check', .15], ['Reflection and close', .1]];
  const mins = parts.map(([, f]) => Math.floor(l.minutes * f));
  mins[2] += l.minutes - mins.reduce((a, b) => a + b, 0);
  let t = 0;
  return parts.map(([label], i) => { const r = { label, min: mins[i], at: t }; t += mins[i]; return r; }).filter(r => r.min > 0);
}

function slidesFor(l) {
  const tm = timing(l), act = tm.find(r => r.label.startsWith('Activity'));
  return [
    { type: 'cover', title: l.title, note: `Open with the purpose in one or two sentences, then say what people will be able to do by the end. The whole session runs ${l.minutes} minutes.` },
    { type: 'list', kick: 'Outcomes', title: 'What you will be able to do', items: l.outcomes, note: 'Ask the group which outcome matters most in their role right now. Come back to that answer in the reflection.' },
    { type: 'flow', kick: 'The model', title: l.model.join(' → '), items: l.model, note: 'Walk through each step with a short workplace example. Ask: where does this step usually get skipped?' },
    { type: 'list', kick: 'Group practice', title: l.activity, items: l.instructions, note: `About ${act?.min || 5} minutes. Brief the task, then move between groups and listen for examples to use in the debrief.` },
    { type: 'check', kick: 'Quick check', title: 'What would you do?', note: 'Let the room call out an answer and say why, then tap it.' },
    { type: 'reflect', kick: 'Reflection', title: 'Apply it at work', note: 'Give two minutes of quiet writing. Participants can type their answer in the Notes tab; it stays private to them.' },
  ];
}

function closeLessonView() {
  const box = $('#lesson'); if (box.hidden) return;
  box.hidden = true; box.className = 'lesson'; box.innerHTML = ''; document.body.style.overflow = ''; L = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
function closeLesson() { location.hash = lastPage; }

function renderLesson() {
  const l = lessons.find(x => x.id === L.id), box = $('#lesson'), ph = phaseOf(l);
  box.hidden = false; document.body.style.overflow = 'hidden';
  box.className = 'lesson' + (L.pres ? ' pres' : '');
  box.innerHTML = `<div class="lesson-head"><div class="hrow"><div><div class="k">Phase ${phaseNo(l)} · ${esc(ph.name)} · Session ${l.n} · ${l.minutes} min</div><h2 id="lessonTitle">${esc(l.title)}</h2></div><button class="x" id="closeLesson">Close</button></div>
    <div class="ltabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" aria-selected="${L.tab === id}" class="${L.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div></div>
    <div class="lesson-body">${({ plan: planTab, class: classTab, quiz: quizTab, notes: notesTab })[L.tab](l)}</div>`;
  $('#closeLesson').onclick = closeLesson;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { location.hash = `s/${l.id}/${b.dataset.tab}`; });
  ({ plan: () => {}, class: bindClass, quiz: bindQuiz, notes: bindNotes })[L.tab](l);
  document.title = `${l.title} · Leadership Lab`;
}

function pager(l) {
  const i = lessons.indexOf(l), prev = lessons[i - 1], next = lessons[i + 1];
  return `<div class="pager no-print">${prev ? `<button class="btn" data-open="${prev.id}/plan">← Session ${prev.n}</button>` : '<span></span>'}${next ? `<button class="btn" data-open="${next.id}/plan">Session ${next.n} →</button>` : '<button class="btn" data-go="home">Back to home</button>'}</div>`;
}

function planTab(l) {
  return `<section class="sec"><div class="eyebrow">Purpose</div><p class="lead">${esc(l.intro)}</p>
    <h4>By the end, participants can</h4><ul class="list">${l.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ul></section>
  <section class="sec"><div class="eyebrow">The model</div><h3>${esc(l.model.join(' → '))}</h3>
    <div class="flow">${l.model.map((m, i) => `<div><b>${pad(i + 1)}</b><span>${esc(m)}</span></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Suggested timings · ${l.minutes} min</div>
    <div class="steps timing">${timing(l).map(r => `<div class="step"><span class="t">+${pad(r.at)} min</span><span>${esc(r.label)}</span><small>${r.min} min</small></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Group practice</div><h3>${esc(l.activity)}</h3>
    <div class="steps">${l.instructions.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(s)}</span></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Decision check</div><p class="lead">${esc(l.scenario)}</p>
    <div class="note"><b>Strongest answer: ${LETTERS[l.correct]}</b>${esc(l.choices[l.correct])} ${esc(l.reason)}</div>
    <div class="eyebrow" style="margin-top:4px">Reflection prompt</div><p>${esc(l.prompt)}</p></section>
  <div class="row no-print"><button class="btn primary" data-present="${l.id}">Present the class</button><button class="btn" data-print>Print the plan</button></div>
  ${pager(l)}`;
}

// ----- class slides -----
function slideHTML(l) {
  const sl = slidesFor(l), s = sl[L.slide], n = `${pad(L.slide + 1)} / ${pad(sl.length)}`;
  const noteBox = text => `<div class="kid" ${L.pres && !L.notes ? 'hidden' : ''}><div class="kid-h">Facilitator note</div>${esc(text)}</div>`;
  if (s.type === 'cover') return `<div class="stage cover" id="stage"><span class="num">${n}</span><div class="body"><div class="kick">Phase ${phaseNo(l)} · ${esc(phaseOf(l).name)} · Session ${l.n}</div><h3>${esc(l.title)}</h3><p class="lede">${esc(l.intro)}</p></div><div class="wave"></div>${noteBox(s.note)}</div>`;
  if (s.type === 'list') return `<div class="stage" id="stage"><span class="num">${n}</span><div class="kick">${esc(s.kick)}</div><h3>${esc(s.title)}</h3><div class="body"><ul class="s-list">${s.items.map((t, i) => `<li><span>${pad(i + 1)}</span>${esc(t)}</li>`).join('')}</ul></div>${noteBox(s.note)}</div>`;
  if (s.type === 'flow') return `<div class="stage" id="stage"><span class="num">${n}</span><div class="kick">${esc(s.kick)}</div><h3>${esc(s.title)}</h3><div class="body"><div class="s-flow">${s.items.map((t, i) => `<div><b>Step ${i + 1}</b><span>${esc(t)}</span></div>`).join('')}</div></div>${noteBox(s.note)}</div>`;
  if (s.type === 'check') {
    const pick = L.picks[l.id];
    const opts = l.choices.map((c, i) => {
      const cls = pick === undefined ? '' : i === l.correct ? 'right' : i === pick ? 'wrong' : 'dim';
      return `<button class="qk-b ${cls}" data-qk="${i}" ${pick !== undefined ? 'disabled' : ''}><span>${LETTERS[i]}</span>${esc(c)}</button>`;
    }).join('');
    const after = pick === undefined ? noteBox(s.note)
      : `<div class="kid" aria-live="polite"><div class="kid-h">${pick === l.correct ? 'Strong response' : `The stronger answer is ${LETTERS[l.correct]}`}</div>${esc(l.reason)}</div>`;
    return `<div class="stage" id="stage"><span class="num">${n}</span><h3>${esc(s.title)}</h3><div class="body"><div class="qbox"><div class="kick">${esc(s.kick)}</div><p>${esc(l.scenario)}</p></div><div class="qk">${opts}</div></div>${after}</div>`;
  }
  return `<div class="stage" id="stage"><span class="num">${n}</span><div class="kick">${esc(s.kick)}</div><h3>${esc(s.title)}</h3><div class="body"><p class="lede" style="font-size:clamp(1.2rem,3.4cqw,2rem);color:var(--s-ink)">${esc(l.prompt)}</p><p class="lede">Write one specific action: the situation, what you will do and when.</p></div><div class="wave"></div>${noteBox(s.note)}</div>`;
}
function classTab(l) {
  const sl = slidesFor(l), last = L.slide === sl.length - 1;
  return `<div class="stage-wrap" id="stageWrap">
    <div class="thumbs" role="tablist" aria-label="Slides">${sl.map((s, i) => `<button class="${i === L.slide ? 'on' : ''}" data-slide="${i}" aria-selected="${i === L.slide}"><b>${pad(i + 1)}</b>${esc(s.type === 'cover' ? 'Title' : s.kick)}</button>`).join('')}</div>
    ${slideHTML(l)}
    <div class="deck-bar"><button class="btn" id="prevS" ${L.slide === 0 ? 'disabled' : ''}>Previous</button><div class="prog" aria-hidden="true"><i style="width:${(L.slide + 1) / sl.length * 100}%"></i></div>
      <span class="score" title="Quick checks answered correctly">★ ${L.score} / 1</span>
      ${L.pres ? `<button class="btn ${L.notes ? 'on' : ''}" id="notesS">Notes</button><button class="btn" id="exitS">Exit full screen</button>` : '<button class="btn" id="presS">Present</button>'}
      <button class="btn primary" id="nextS">${last ? (L.pres ? 'Finish' : 'To the quiz') : 'Next'}</button></div>
    <p class="small muted hint">Use ← → to move between slides, F for full screen.</p></div>`;
}
function bindClass(l) {
  const sl = slidesFor(l);
  const go = i => { L.slide = Math.max(0, Math.min(sl.length - 1, i)); renderLesson(); };
  $$('[data-slide]').forEach(b => b.onclick = () => go(+b.dataset.slide));
  $('#prevS').onclick = () => go(L.slide - 1);
  $('#nextS').onclick = () => {
    if (L.slide < sl.length - 1) return go(L.slide + 1);
    if (L.pres) { exitPres(); return; }
    location.hash = `s/${l.id}/quiz`;
  };
  $('#presS') && ($('#presS').onclick = () => { L.pres = true; renderLesson(); enterFullscreen(); });
  $('#exitS') && ($('#exitS').onclick = exitPres);
  $('#notesS') && ($('#notesS').onclick = () => { L.notes = !L.notes; renderLesson(); });
  $$('[data-qk]').forEach(b => b.onclick = () => {
    const i = +b.dataset.qk; L.picks[l.id] = i;
    if (i === l.correct) L.score = 1;
    renderLesson();
    if (i === l.correct) confetti($('#stage'));
  });
}
function confetti(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const colours = ['#E0AE4C', '#57C990', '#3BA3B0', '#F28C82', '#EEF2F8'];
  box.innerHTML = Array.from({ length: 60 }, () => `<i style="--x:${Math.random() * 100}%;--c:${colours[Math.floor(Math.random() * colours.length)]};--d:${1.2 + Math.random() * 1.4}s;--w:${Math.random() * .3}s;--dx:${(Math.random() - .5) * 200}px;--r:${(Math.random() - .5) * 720}deg"></i>`).join('');
  el.append(box); setTimeout(() => box.remove(), 3200);
}
function enterFullscreen() { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
function exitPres() { if (!L) return; L.pres = false; L.notes = false; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); renderLesson(); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && L?.pres) { L.pres = false; L.notes = false; renderLesson(); } });

// ----- quiz -----
function quizTab(l) {
  const pick = saved[l.id]?.choice;
  return `<section class="sec"><div class="eyebrow">Decision practice</div><h3>What would you do?</h3><p class="lead">${esc(l.scenario)}</p>
    <div class="q-options" role="group" aria-label="Choices">${l.choices.map((c, i) => {
      const cls = pick === undefined ? '' : i === l.correct ? 'right' : i === pick ? 'wrong' : '';
      return `<button class="opt ${cls}" data-choice="${i}" aria-pressed="${pick === i}" ${pick !== undefined ? 'disabled' : ''}><span class="dot">${LETTERS[i]}</span><span>${esc(c)}</span></button>`;
    }).join('')}</div>
    <div aria-live="polite">${pick === undefined ? '<p class="small muted">Choose the response you think is strongest. Your answer saves to your account.</p>'
      : `<div class="result ${pick === l.correct ? 'pass' : 'fail'}"><b>${pick === l.correct ? 'Strong response' : `Consider ${LETTERS[l.correct]} instead`}</b>${esc(l.reason)}</div>
         <div class="row" style="margin-top:12px"><button class="btn" id="retry">Try again</button><button class="btn primary" data-open="${l.id}/notes">Go to notes</button></div>`}</div></section>
  ${pager(l)}`;
}
function bindQuiz(l) {
  $$('[data-choice]').forEach(b => b.onclick = () => { update(l.id, { choice: +b.dataset.choice }); queueSave(l.id, 0); renderLesson(); });
  $('#retry') && ($('#retry').onclick = () => { update(l.id, { choice: undefined }); queueSave(l.id, 0); renderLesson(); });
}

// ----- notes -----
function notesTab(l) {
  const s = saved[l.id] || {};
  return `<section class="sec"><div class="eyebrow">Make it yours</div><h3>${esc(l.prompt)}</h3>
    <div class="field"><label for="note">Private reflection</label><textarea id="note" maxlength="4000" placeholder="Write a concrete action or observation…">${esc(s.note)}</textarea></div>
    <p class="small muted" data-sync>${s.note ? 'Saved to your account' : 'Saves automatically to your account. Your facilitator never sees what you write.'}</p>
    <div class="row"><button class="btn ${s.done ? '' : 'primary'}" id="completeBtn">${s.done ? 'Completed ✓ · undo' : 'Mark session complete'}</button></div></section>
  ${pager(l)}`;
}
function bindNotes(l) {
  $('#note').oninput = e => { update(l.id, { note: e.target.value || undefined }); queueSave(l.id, 900); };
  $('#completeBtn').onclick = () => {
    const done = !isDone(l);
    update(l.id, { done: done || undefined, doneAt: done ? new Date().toISOString() : undefined });
    queueSave(l.id, 0); renderLesson(); shell();
    if (done) toast(`Session ${l.n} complete`);
  };
}

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  if (!L || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') { if (L.pres) exitPres(); else closeLesson(); return; }
  if (L.tab !== 'class') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && L.pres)) { e.preventDefault(); $('#nextS')?.click(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); $('#prevS')?.click(); }
  else if (e.key === 'f' || e.key === 'F') { if (L.pres) exitPres(); else { L.pres = true; renderLesson(); enterFullscreen(); } }
  else if ((e.key === 'n' || e.key === 'N') && L.pres) { L.notes = !L.notes; renderLesson(); }
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { if (pending.size) flush(); });

// ---------- start ----------
async function start() {
  route();
  try {
    const [user, data] = await Promise.all([call('/api/me'), call('/api/progress')]);
    me = user; saved = { ...data.progress }; cache();
    if (L) { shell(); renderLesson(); } else route();
  } catch (e) {
    if (e.message !== 'Signed out') setStatus('Offline: changes will sync later');
  }
}
start();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
