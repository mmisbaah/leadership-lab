import { lessons, totalMinutes } from './lessons.js';
import { decks, reference } from './decks.js';

// ---------- constants ----------
const CACHE_KEY = 'leadership-lab-v2';
const PHASES = [
  { key: 'SELF', name: 'Self', c: 'var(--p1)', blurb: 'How you show up: credibility, balancing task, team and individual, and being a good follower.' },
  { key: 'PEOPLE', name: 'People', c: 'var(--p2)', blurb: 'Communication, trust, feedback and team building: the everyday work of leading people.' },
  { key: 'PERFORMANCE', name: 'Performance', c: 'var(--p3)', blurb: 'Delegation, motivation and decisions that get work done through others.' },
  { key: 'INTEGRATE', name: 'Integrate', c: 'var(--p4)', blurb: 'Bring the course’s skills together in one evolving team situation.' },
  { key: 'APPLY', name: 'Apply', c: 'var(--p5)', blurb: 'Turn the course into one specific action you will take at work.' },
];
const TABS = [['plan', 'Facilitator plan'], ['class', 'Class'], ['quiz', 'Quiz'], ['notes', 'Notes']];
const PAGES = ['home', 'sessions', 'plan', 'reference', 'help', 'account', 'team'];
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
  const items = [['home', 'Home'], ['sessions', 'Sessions', lessons.length], ['plan', 'Course plan'], ['reference', 'Reference'], ['help', 'Help'], ['account', 'Account']];
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
    if (!L || L.id !== m[1]) L = { id: m[1], tab, slide: 0, mode: 'normal', notes: false, picks: {} };
    else L.tab = tab;
    if (tab !== 'class') L.mode = 'normal';
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
  else if (page === 'reference') v.innerHTML = referenceHTML();
  else if (page === 'help') v.innerHTML = helpHTML();
  else if (page === 'account') { v.innerHTML = accountHTML(); bindAccount(); }
  else if (page === 'team') { v.innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Participants</h1><p>Loading…</p></div>`; loadTeam(); }
  else { v.innerHTML = homeHTML(); bindHome(); }
  document.title = ({ sessions: 'Sessions · ', plan: 'Course plan · ', reference: 'Reference · ', help: 'Help · ', account: 'Account · ', team: 'Participants · ' }[page] || '') + 'Leadership Lab';
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
  if (p) { L = { id: p.dataset.present, tab: 'class', slide: 0, mode: 'pres', notes: false, picks: {} }; location.hash = `s/${p.dataset.present}/class`; enterFullscreen(); }
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
      <p class="sub">${me ? `Welcome, ${esc(me.name.split(' ')[0])}. ` : ''}A practical two-day course: ${lessons.length} sessions in ${PHASES.length} phases, ${hours} h ${mins} min of teaching. Present each session, run the activity and decision checks, and leave with one action for work.</p></div>
      <div class="wk"><div class="n">${curNo}<small>/${PHASES.length}</small></div><div class="ph">Phase you’re working in</div></div></div>
    <div class="phase-strip" role="group" aria-label="Training phases">${PHASES.map((p, i) => {
      const ls = inPhase(p.key), d = ls.filter(isDone).length;
      return `<button style="--c:${p.c}" class="${p.key === cur ? 'cur' : ''}" data-phase="${p.key}" aria-pressed="${p.key === cur}"><b>${i + 1}</b> <span>${p.name}</span><small>${ls.length} session${ls.length === 1 ? '' : 's'} · ${d}/${ls.length} done</small></button>`;
    }).join('')}</div>
  </section>
  <div class="quick"><button class="btn" data-go="plan">Course plan</button><button class="btn" data-open="${nx.id}/plan">${doneCount() === lessons.length ? 'Review the last session' : doneCount() ? `Continue: Session ${nx.n}` : 'Start with Session 01'}</button><button class="btn" data-present="${nx.id}">Present Session ${nx.n}</button></div>
  <div class="grid2">
    <section class="panel"><h3 style="color:inherit">Phase ${PHASES.indexOf(ph) + 1} · ${ph.name}</h3><p class="muted">${ph.blurb}</p>
      <div class="mod-list">${inPhase(ph.key).map(card).join('')}</div></section>
    <section class="panel tips"><h3>Presenting a class</h3>
      <p><b>Open session</b> starts with the facilitator plan: purpose, outcomes, the three-step model and suggested timings. <b>Present</b> opens the class slides full screen.</p>
      <p><b>Presenter view</b> (<kbd>P</kbd> in the Class tab) puts the speaker notes, a session timer and the next slide on your laptop. <b>Open projector window</b> puts the slides on the projector, and it follows along.</p>
      <p><b>Arrow keys</b> or the on-screen buttons move between slides. <kbd>F</kbd> toggles full screen, <kbd>N</kbd> shows the facilitator note, <kbd>Esc</kbd> leaves.</p>
      <p><b>Quick checks</b> on the slides: let the room call out an answer, then tap it. The right answer gets confetti and the reasoning appears underneath.</p>
      <p><b>Quiz</b> and <b>Notes</b> are for each participant. Their answer, private reflection and completed sessions save to their own account.</p>
      <p><b>Course plan</b> lays the sessions out across two days with breaks, so you can keep time. <b>Reference</b> has the ten rules of followership, the leadership check sheet and the team checklists on one printable page.</p>
      <div class="stats"><div class="stat"><b>${doneCount()}/${lessons.length}</b> <span>sessions done</span></div><div class="stat"><b>${hours}h ${mins}m</b> <span>teaching time</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.note).length}</b> <span>notes written</span></div></div>
    </section>
  </div>`;
}
function bindHome() { $$('[data-phase]').forEach(b => b.onclick = () => { homePhase = b.dataset.phase; renderPage(); }); }

// ---------- sessions ----------
function sessionsHTML() {
  return `<div class="page-head"><div class="eyebrow">${lessons.length} sessions · ${PHASES.length} phases</div><h1>Sessions</h1><p>Every session has a facilitator plan, a 25–30 slide class presentation with speaker notes and quick checks, a decision quiz and a private notes page.</p></div>
  ${PHASES.map((p, i) => `<div class="phase-sec" style="--c:${p.c}"><h3>${i + 1} · ${p.name}</h3><span class="muted small">${esc(p.blurb)}</span></div><div class="mod-grid">${inPhase(p.key).map(card).join('')}</div>`).join('')}`;
}

// ---------- course plan ----------
// Suggested two-day timetable. Session lengths come from the course; welcome, breaks and close are suggestions.
const DAYS = [
  { label: 'Day 1', focus: 'Self and People', items: [['Welcome, introductions and the course plan', 15], 'foundations', 'functional', ['Morning break', 15], 'followership', ['Lunch', 60], 'communication', 'trust', ['Afternoon break', 15], 'feedback', 'teamwork', ['Day 1 review and close', 10]] },
  { label: 'Day 2', focus: 'Performance, Integrate and Apply', items: [['Recap of day 1', 15], 'delegation', 'motivation', ['Morning break', 15], 'decisions', ['Lunch', 60], 'capstone', 'commitment', ['Evaluation and close', 10]] },
];
function dayPlan() {
  return DAYS.map(d => {
    const rows = []; let t = 9 * 60;
    for (const it of d.items) {
      const l = typeof it === 'string' ? lessons.find(x => x.id === it) : null;
      const [label, min] = l ? [l.title, l.minutes] : it;
      rows.push({ start: t, end: t + min, label, min, l }); t += min;
    }
    return { ...d, rows };
  });
}
function planHTML() {
  const days = dayPlan();
  return `<div class="page-head"><div class="eyebrow">Suggested timetable</div><h1>Course plan</h1><p>${lessons.length} sessions over two days. Session lengths come from the course; the welcome, breaks and close are a suggestion to adjust for your group.</p></div>
  ${days.map(d => `<div class="phase-sec" style="--c:var(--brass)"><h3>${d.label} · ${clock(d.rows[0].start)}–${clock(d.rows.at(-1).end)}</h3><span class="muted small">${d.focus}</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Time</th><th>Session</th><th>Phase</th><th>Activity</th><th></th></tr></thead><tbody>
  ${d.rows.map(r => r.l
    ? `<tr><td class="time">${clock(r.start)}–${clock(r.end)}</td><td><b>${r.l.n}</b> ${esc(r.l.title)}<div class="small muted">${r.min} min</div></td><td><span class="ph" style="--c:${phaseOf(r.l).c}"></span>${phaseOf(r.l).name}</td><td>${esc(r.l.activity)}</td><td>${isDone(r.l) ? '<span class="chip ok">✓</span>' : `<button class="btn sm" data-open="${r.l.id}/plan">Open</button>`}</td></tr>`
    : `<tr class="brk"><td class="time">${clock(r.start)}–${clock(r.end)}</td><td colspan="4">${esc(r.label)} · ${r.min} min</td></tr>`).join('')}
  </tbody></table></div>`).join('')}
  <div class="row no-print"><button class="btn" data-print>Print the course plan</button></div>`;
}

// ---------- reference ----------
function referenceHTML() {
  const block = r => {
    const from = lessons.find(l => l.id === r.id);
    const body = r.kind === 'ol' ? `<ol class="list">${r.items.map(t => `<li>${esc(t)}</li>`).join('')}</ol>`
      : r.kind === 'groups' ? `<div class="ref-groups">${r.items.map(([h, items]) => `<div><b>${esc(h)}</b> <ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`
      : `<div class="steps">${r.items.map(([h, p]) => `<div class="step ref-pair"><b>${esc(h)}</b> <span>${esc(p)}</span></div>`).join('')}</div>`;
    return `<section class="panel"><h3>${esc(r.title)}</h3>${body}<p class="small muted">From Session ${from.n}: <button class="link" data-open="${from.id}/plan">${esc(from.title)}</button></p></section>`;
  };
  return `<div class="page-head"><div class="eyebrow">Quick reference</div><h1>Reference</h1><p>The rules, checklists and models from the course on one page. Print it as a handout or keep it open while you teach.</p></div>
  <div class="grid2">${reference.map(block).join('')}</div>
  <div class="row no-print"><button class="btn" data-print>Print the reference</button></div>`;
}

// ---------- help ----------
function helpHTML() {
  return `<div class="page-head"><div class="eyebrow">How to use the guide</div><h1>Help</h1></div>
  <div class="grid2 help">
    <section class="panel"><h3>Running a session</h3><ol class="list">
      <li>Open the session from <b>Home</b> or <b>Sessions</b>. The <b>Facilitator plan</b> tab has the purpose, outcomes, model, suggested timings and activity steps.</li>
      <li>Switch to <b>Class</b>. Each session has 25 to 30 slides. Press <b>Present</b> (<kbd>F</kbd>) for full screen on one screen, or <b>Presenter view</b> (<kbd>P</kbd>) to keep notes, a timer and the next slide on your laptop while a projector window shows the slides.</li>
      <li>On the quick-check slide, let the room call out an answer, then tap it to reveal the reasoning.</li>
      <li>Close with the reflection slide. Participants write their action in <b>Notes</b> and mark the session complete.</li></ol></section>
    <section class="panel"><h3>Keyboard shortcuts</h3><div class="steps">
      <div class="step"><kbd>→</kbd><span>Next slide</span></div><div class="step"><kbd>←</kbd><span>Previous slide</span></div>
      <div class="step"><kbd>F</kbd><span>Full screen on or off</span></div><div class="step"><kbd>P</kbd><span>Presenter view: notes, timer, next slide</span></div><div class="step"><kbd>N</kbd><span>Show or hide the facilitator note while presenting</span></div>
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
  return `<div class="page-head"><div class="eyebrow">Your account</div><h1>${esc(me?.name || 'Account')}</h1><p>Signed in as <b>${esc(me?.id || '…')}</b> ${me?.admin ? ' · facilitator' : ''}.</p></div>
  <div class="grid2">
    <section class="panel"><h3>Change your password</h3><form id="pwForm" class="list">
      <div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="small muted">At least 8 characters.</p><div class="row"><button class="btn primary">Change password</button></div><p class="msg" id="pwMsg" role="status"></p></form></section>
    <section class="panel"><h3>Your progress</h3>
      <div class="stats"><div class="stat"><b>${doneCount()}/${lessons.length}</b> <span>sessions done</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.choice !== undefined).length}</b> <span>quizzes answered</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.note).length}</b> <span>notes written</span></div></div>
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

function closeLessonView() {
  const box = $('#lesson'); if (box.hidden) return;
  box.hidden = true; box.className = 'lesson'; box.innerHTML = ''; document.body.style.overflow = ''; L = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
function closeLesson() { location.hash = lastPage; }

function renderLesson() {
  const l = lessons.find(x => x.id === L.id), box = $('#lesson'), ph = phaseOf(l);
  box.hidden = false; document.body.style.overflow = 'hidden';
  box.className = 'lesson' + (L.mode === 'pres' ? ' pres' : L.mode === 'presenter' ? ' presenter' : '');
  box.innerHTML = `<div class="lesson-head"><div class="hrow"><div><div class="k">Phase ${phaseNo(l)} · ${esc(ph.name)} · Session ${l.n} · ${l.minutes} min</div><h2 id="lessonTitle">${esc(l.title)}</h2></div><button class="x" id="closeLesson">Close</button></div>
    <div class="ltabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" aria-selected="${L.tab === id}" class="${L.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div></div>
    <div class="lesson-body">${({ plan: planTab, class: classTab, quiz: quizTab, notes: notesTab })[L.tab](l)}</div>`;
  $('#closeLesson').onclick = closeLesson;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { location.hash = `s/${l.id}/${b.dataset.tab}`; });
  ({ plan: bindPlan, class: bindClass, quiz: bindQuiz, notes: bindNotes })[L.tab](l);
  document.title = `${l.title} · Leadership Lab`;
}

function bindPlan(l) { $$('[data-goslide]').forEach(b => b.onclick = () => { L.slide = +b.dataset.goslide; location.hash = `s/${l.id}/class`; }); }

function pager(l) {
  const i = lessons.indexOf(l), prev = lessons[i - 1], next = lessons[i + 1];
  return `<div class="pager no-print">${prev ? `<button class="btn" data-open="${prev.id}/plan">← Session ${prev.n}</button>` : '<span></span>'}${next ? `<button class="btn" data-open="${next.id}/plan">Session ${next.n} →</button>` : '<button class="btn" data-go="home">Back to home</button>'}</div>`;
}

function planTab(l) {
  return `<section class="sec"><div class="eyebrow">Purpose</div><p class="lead">${esc(l.intro)}</p>
    <h4>By the end, participants can</h4><ul class="list">${l.outcomes.map(o => `<li>${esc(o)}</li>`).join('')}</ul></section>
  <section class="sec"><div class="eyebrow">The model</div><h3>${esc(l.model.join(' → '))}</h3>
    <div class="flow">${l.model.map((m, i) => `<div><b>${pad(i + 1)}</b> <span>${esc(m)}</span></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Suggested timings · ${l.minutes} min</div>
    <div class="steps timing">${timing(l).map(r => `<div class="step"><span class="t">+${pad(r.at)} min</span><span>${esc(r.label)}</span><small>${r.min} min</small></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Class presentation · ${deckOf(l).length} slides · ${checksIn(l)} quick checks</div>
    <ol class="outline">${deckOf(l).map((s, i) => `<li class="${s.t === 'section' ? 'part' : ''}"><button class="link" data-goslide="${i}">${esc(thumbLabel(l, s))}</button></li>`).join('')}</ol></section>
  <section class="sec"><div class="eyebrow">Group practice</div><h3>${esc(l.activity)}</h3>
    <div class="steps">${l.instructions.map((s, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(s)}</span></div>`).join('')}</div></section>
  <section class="sec"><div class="eyebrow">Decision check</div><p class="lead">${esc(l.scenario)}</p>
    <div class="note"><b>Strongest answer: ${LETTERS[l.correct]}</b> ${esc(l.choices[l.correct])} ${esc(l.reason)}</div>
    <div class="eyebrow" style="margin-top:4px">Reflection prompt</div><p>${esc(l.prompt)}</p></section>
  <div class="row no-print"><button class="btn primary" data-present="${l.id}">Present the class</button><button class="btn" data-print>Print the plan</button></div>
  ${pager(l)}`;
}

// ----- class slides -----
// L.mode: 'normal' (in the Class tab), 'pres' (full screen), 'presenter' (laptop view with notes; a projector window follows).
const deckOf = l => decks[l.id];
const checksIn = l => deckOf(l).filter(s => s.t === 'check').length;
const scoreOf = (l, picks) => deckOf(l).reduce((n, s, i) => n + (s.t === 'check' && picks[i] === s.a ? 1 : 0), 0);

// One slide as HTML. opts: { i, picks, notes (show the facilitator note box), still (no interaction, for previews) }
function slideHTML(l, { i, picks = {}, notes = false, still = false }) {
  const d = deckOf(l), s = d[i], num = `<span class="num">${pad(i + 1)} / ${pad(d.length)}</span>`;
  const kick = s.k ? `<div class="kick">${esc(s.k)}</div>` : '';
  const note = notes && s.n && !(s.t === 'check' && picks[i] !== undefined) ? `<div class="kid"><div class="kid-h">Facilitator note</div>${esc(s.n)}</div>` : '';
  const wrap = (cls, inner) => `<div class="stage ${cls} ${still ? 'still' : ''}" ${still ? 'aria-hidden="true"' : 'id="stage"'}>${num}${inner}${note}</div>`;
  switch (s.t) {
    case 'cover': return wrap('cover', `<div class="body"><div class="kick">Phase ${phaseNo(l)} · ${esc(phaseOf(l).name)} · Session ${l.n}</div><h3>${esc(l.title)}</h3><p class="lede">${esc(l.intro)}</p></div><div class="wave"></div>`);
    case 'section': return wrap('cover section', `<div class="body"><div class="kick">${esc(s.k)}</div><h3>${esc(s.h)}</h3>${s.p ? `<p class="lede">${esc(s.p)}</p>` : ''}</div><div class="wave"></div>`);
    case 'statement': return wrap('statement', `${kick}<div class="body"><h3 class="big">${esc(s.h)}</h3>${s.p ? `<p class="lede">${esc(s.p)}</p>` : ''}</div>`);
    case 'points': return wrap('', `${kick}<h3>${esc(s.h)}</h3><div class="body"><ul class="s-list">${s.items.map((t, j) => `<li><span>${pad(j + (s.from || 1))}</span> ${esc(t)}</li>`).join('')}</ul></div>`);
    case 'cards': return wrap('', `${kick}<h3>${esc(s.h)}</h3><div class="body"><div class="s-cards">${s.items.map(([h, p]) => `<div><b>${esc(h)}</b> <span>${esc(p)}</span></div>`).join('')}</div></div>`);
    case 'flow': return wrap('', `${kick}<h3>${esc(s.h)}</h3><div class="body"><div class="s-flow">${s.items.map(([h, p], j) => `<div><b>Step ${j + 1}</b> <span>${esc(h)}</span><p>${esc(p)}</p></div>`).join('')}</div></div>`);
    case 'compare': return wrap('', `${kick}<h3>${esc(s.h)}</h3><div class="body"><div class="s-cmp">${[s.a, s.b].map(([h, items], j) => `<div class="${j ? 'yes' : 'no'}"><b>${esc(h)}</b> <ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div></div>`);
    case 'discuss': return wrap('discuss', `${kick}<div class="body"><div class="badge">Discuss</div><h3 class="big">${esc(s.h)}</h3>${s.p ? `<p class="lede">${esc(s.p)}</p>` : ''}</div>`);
    case 'scenario': return wrap('', `${kick}<h3>${esc(s.h)}</h3><div class="body"><div class="qbox"><p>${esc(s.p)}</p></div>${s.items ? `<ul class="s-list">${s.items.map((t, j) => `<li><span>${pad(j + 1)}</span> ${esc(t)}</li>`).join('')}</ul>` : ''}</div>`);
    case 'check': {
      const pick = picks[i];
      const opts = s.o.map((c, j) => {
        const cls = pick === undefined ? '' : j === s.a ? 'right' : j === pick ? 'wrong' : 'dim';
        return `<button class="qk-b ${cls}" ${still ? 'tabindex="-1"' : `data-qk="${j}"`} ${pick !== undefined || still ? 'disabled' : ''}><span>${LETTERS[j]}</span> ${esc(c)}</button>`;
      }).join('');
      const after = pick === undefined ? '' : `<div class="kid" aria-live="polite"><div class="kid-h">${pick === s.a ? 'Strong response' : `The stronger answer is ${LETTERS[s.a]}`}</div>${esc(s.why)}</div>`;
      return wrap('', `<h3>What would you do?</h3><div class="body"><div class="qbox"><div class="kick">Quick check</div><p>${esc(s.q)}</p></div><div class="qk">${opts}</div></div>${after}`);
    }
    default: return wrap('', `<div class="kick">Reflection</div><h3>${esc(s.h)}</h3><div class="body"><p class="lede prompt">${esc(s.p)}</p><p class="lede">Write one specific action: the situation, what you will do and when.</p></div><div class="wave"></div>`);
  }
}

function deckBar(l) {
  const d = deckOf(l), last = L.slide === d.length - 1, n = checksIn(l);
  const tools = L.mode === 'pres'
    ? `<button class="btn ${L.notes ? 'on' : ''}" id="notesS">Notes</button><button class="btn" id="exitS">Exit full screen</button>`
    : L.mode === 'presenter' ? '' : '<button class="btn" id="presS">Present</button><button class="btn" id="pvS">Presenter view</button>';
  return `<div class="deck-bar"><button class="btn" id="prevS" ${L.slide === 0 ? 'disabled' : ''}>Previous</button><div class="prog" aria-hidden="true"><i style="width:${(L.slide + 1) / d.length * 100}%"></i></div>
    <span class="score" title="Quick checks answered correctly">★ ${scoreOf(l, L.picks)} / ${n}</span>${tools}
    <button class="btn primary" id="nextS">${last ? (L.mode === 'normal' ? 'To the quiz' : 'Finish') : 'Next'}</button></div>`;
}

function classTab(l) {
  if (L.mode === 'presenter') return presenterHTML(l);
  const d = deckOf(l);
  return `<div class="stage-wrap" id="stageWrap">
    <div class="thumbs" role="tablist" aria-label="Slides">${d.map((s, i) => `<button class="${i === L.slide ? 'on' : ''}" data-slide="${i}" aria-selected="${i === L.slide}"><b>${pad(i + 1)}</b> ${esc(thumbLabel(l, s))}</button>`).join('')}</div>
    ${slideHTML(l, { i: L.slide, picks: L.picks, notes: L.mode === 'normal' || L.notes })}
    ${deckBar(l)}
    <p class="small muted hint">← → move between slides · F full screen · P presenter view</p></div>`;
}
const thumbLabel = (l, s) => s.t === 'cover' ? 'Title' : s.t === 'check' ? 'Quick check' : s.t === 'section' ? `${s.k}: ${s.h}` : s.h || s.k;

// ----- presenter view -----
const fmt = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
function elapsed() { return L.clock.run ? L.clock.acc + (Date.now() - L.clock.since) : L.clock.acc; }
function paceText(l) {
  const d = deckOf(l), plannedMs = l.minutes * 60000;
  const expected = plannedMs * L.slide / d.length, diff = elapsed() - expected;
  const mins = Math.round(Math.abs(diff) / 60000);
  return { over: elapsed() > plannedMs, text: mins < 1 ? 'On pace' : diff > 0 ? `${mins} min behind` : `${mins} min ahead` };
}
function presenterHTML(l) {
  const d = deckOf(l), s = d[L.slide], next = d[L.slide + 1], pace = paceText(l);
  const opt = s.t === 'check' ? s.o[s.a] : '', stop = /[.!?”"]$/.test(opt) ? '' : '.';
  const answer = s.t === 'check' ? `<div class="note ans"><b>Answer: ${LETTERS[s.a]}</b> ${esc(opt)}${stop} ${esc(s.why)}</div>` : '';
  return `<div class="pv">
    <div class="pv-top"><div class="ttl"><div class="k">Presenter view · Session ${l.n}</div><b>${esc(l.title)}</b></div>
      <div class="pv-clock"><b id="pvClock">${fmt(elapsed())}</b><small>of ${l.minutes}:00</small><button class="btn sm" id="pvRun">${L.clock.run ? 'Pause' : 'Start'}</button><button class="btn sm" id="pvReset">Reset</button></div>
      <span class="pv-link ${L.linked ? 'on' : ''}" id="pvLink">${L.linked ? 'Projector window connected' : 'No projector window'}</span>
      <button class="btn sm primary" id="pvOpen">Open projector window</button><button class="btn sm" id="pvExit">Exit presenter view</button></div>
    <div class="pv-main">
      <div class="pv-cur">${slideHTML(l, { i: L.slide, picks: L.picks })}</div>
      <div class="pv-side">
        <section class="panel"><div class="pv-time ${pace.over ? 'over' : ''}"><span>Slide <b>${L.slide + 1}</b> of ${d.length}</span><span id="pvPace">${pace.text}</span></div></section>
        <section class="panel"><h3>Speaker notes</h3><p class="pv-notes">${esc(s.n)}</p>${answer}</section>
        <section class="panel"><h3>Next</h3>${next ? `<div class="pv-next">${slideHTML(l, { i: L.slide + 1, picks: L.picks, still: true })}</div>` : '<p class="muted">End of the deck.</p>'}</section>
        <p class="pv-help">← → or Space to move · Esc leaves presenter view. Answer quick checks here or on the projector; both stay in step.</p>
      </div>
    </div>
    ${deckBar(l)}
  </div>`;
}

// The projector window and the presenter view talk over a BroadcastChannel (same browser, same site).
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('ll-present') : null;
function broadcast() { if (chan && L && L.mode === 'presenter') chan.postMessage({ type: 'state', id: L.id, slide: L.slide, picks: L.picks }); }
let tick = null;
function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!L || L.mode !== 'presenter') { clearInterval(tick); return; }
    const c = $('#pvClock'); if (c) c.textContent = fmt(elapsed());
    const l = lessons.find(x => x.id === L.id), p = $('#pvPace'), pace = paceText(l);
    if (p) { p.textContent = pace.text; p.parentElement.classList.toggle('over', pace.over); }
  }, 1000);
}

function bindClass(l) {
  const d = deckOf(l);
  const go = i => { L.slide = Math.max(0, Math.min(d.length - 1, i)); renderLesson(); broadcast(); };
  $$('[data-slide]').forEach(b => b.onclick = () => go(+b.dataset.slide));
  $('#prevS').onclick = () => go(L.slide - 1);
  $('#nextS').onclick = () => {
    if (L.slide < d.length - 1) return go(L.slide + 1);
    if (L.mode === 'pres') return exitPres();
    if (L.mode === 'presenter') return exitPresenter();
    location.hash = `s/${l.id}/quiz`;
  };
  $('#presS') && ($('#presS').onclick = () => { L.mode = 'pres'; renderLesson(); enterFullscreen(); });
  $('#pvS') && ($('#pvS').onclick = () => enterPresenter());
  $('#exitS') && ($('#exitS').onclick = exitPres);
  $('#notesS') && ($('#notesS').onclick = () => { L.notes = !L.notes; renderLesson(); });
  $$('[data-qk]').forEach(b => b.onclick = () => pickAnswer(l, L.slide, +b.dataset.qk));
  if (L.mode === 'presenter') {
    $('#pvRun').onclick = () => { if (L.clock.run) { L.clock.acc = elapsed(); L.clock.run = false; } else { L.clock.since = Date.now(); L.clock.run = true; } renderLesson(); };
    $('#pvReset').onclick = () => { L.clock = { acc: 0, since: Date.now(), run: L.clock.run }; renderLesson(); };
    $('#pvOpen').onclick = openProjector;
    $('#pvExit').onclick = exitPresenter;
    startTick();
  }
}
function pickAnswer(l, i, j) {
  if (L.picks[i] !== undefined) return;
  L.picks[i] = j; renderLesson(); broadcast();
  if (j === deckOf(l)[i].a) confetti($('#stage'));
}
function enterPresenter() {
  L.mode = 'presenter';
  if (!L.clock) L.clock = { acc: 0, since: Date.now(), run: true };
  renderLesson(); broadcast();
}
function exitPresenter() { L.mode = 'normal'; clearInterval(tick); renderLesson(); }
function openProjector() {
  const w = window.open(`${location.origin}/#proj/${L.id}`, 'll-projector', 'popup,width=1280,height=720');
  if (!w) toast('Allow pop-ups for this site to open the projector window');
}
function confetti(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const colours = ['#E0AE4C', '#57C990', '#3BA3B0', '#F28C82', '#EEF2F8'];
  box.innerHTML = Array.from({ length: 60 }, () => `<i style="--x:${Math.random() * 100}%;--c:${colours[Math.floor(Math.random() * colours.length)]};--d:${1.2 + Math.random() * 1.4}s;--w:${Math.random() * .3}s;--dx:${(Math.random() - .5) * 200}px;--r:${(Math.random() - .5) * 720}deg"></i>`).join('');
  el.append(box); setTimeout(() => box.remove(), 3200);
}
function enterFullscreen(el = document.documentElement) { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
function exitPres() { if (!L) return; L.mode = 'normal'; L.notes = false; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); renderLesson(); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && L?.mode === 'pres') { L.mode = 'normal'; L.notes = false; renderLesson(); } });

// ----- projector window: shows only the slide, follows the presenter view -----
let P = null; // { id, slide, picks }
function renderProjector() {
  const l = lessons.find(x => x.id === P.id);
  document.body.classList.add('projector');
  document.body.innerHTML = `<div class="proj">${slideHTML(l, { i: P.slide, picks: P.picks })}<div class="proj-hint" id="projHint">Click anywhere for full screen · ← → move slides</div></div>`;
  document.title = `${l.title} · Projector`;
  $$('[data-qk]').forEach(b => b.onclick = e => { e.stopPropagation(); chan?.postMessage({ type: 'pick', id: P.id, slide: P.slide, choice: +b.dataset.qk }); });
}
function startProjector(id) {
  P = { id, slide: 0, picks: {} };
  renderProjector();
  document.addEventListener('click', () => { enterFullscreen(); $('#projHint')?.remove(); });
  document.addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); chan?.postMessage({ type: 'nav', id: P.id, dir: 1 }); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); chan?.postMessage({ type: 'nav', id: P.id, dir: -1 }); }
  });
  if (!chan) { document.body.innerHTML = '<p style="color:#fff;padding:24px">This browser cannot link a projector window. Use Present (full screen) instead.</p>'; return; }
  chan.onmessage = ({ data }) => {
    if (data.type === 'state' && data.id === P.id) {
      const prevPick = P.picks[data.slide], pick = data.picks[data.slide];
      P.slide = data.slide; P.picks = data.picks; renderProjector();
      const s = decks[P.id][P.slide];
      if (prevPick === undefined && pick !== undefined && pick === s.a) confetti($('#stage'));
    }
  };
  chan.postMessage({ type: 'hello', id });
  setInterval(() => chan.postMessage({ type: 'hello', id }), 4000);
}
// Presenter side: answer the projector.
let lastHello = 0;
if (chan) chan.addEventListener('message', ({ data }) => {
  if (P || !L || L.mode !== 'presenter' || data.id !== L.id) return;
  const l = lessons.find(x => x.id === L.id);
  if (data.type === 'hello') { lastHello = Date.now(); if (!L.linked) { L.linked = true; renderLesson(); } broadcast(); }
  if (data.type === 'nav') { L.slide = Math.max(0, Math.min(deckOf(l).length - 1, L.slide + data.dir)); renderLesson(); broadcast(); }
  if (data.type === 'pick' && data.slide === L.slide) pickAnswer(l, data.slide, data.choice);
});
setInterval(() => { if (L?.linked && Date.now() - lastHello > 10000) { L.linked = false; if (L.mode === 'presenter') renderLesson(); } }, 3000);

// ----- quiz -----
function quizTab(l) {
  const pick = saved[l.id]?.choice;
  return `<section class="sec"><div class="eyebrow">Decision practice</div><h3>What would you do?</h3><p class="lead">${esc(l.scenario)}</p>
    <div class="q-options" role="group" aria-label="Choices">${l.choices.map((c, i) => {
      const cls = pick === undefined ? '' : i === l.correct ? 'right' : i === pick ? 'wrong' : '';
      return `<button class="opt ${cls}" data-choice="${i}" aria-pressed="${pick === i}" ${pick !== undefined ? 'disabled' : ''}><span class="dot">${LETTERS[i]}</span><span>${esc(c)}</span></button>`;
    }).join('')}</div>
    <div aria-live="polite">${pick === undefined ? '<p class="small muted">Choose the response you think is strongest. Your answer saves to your account.</p>'
      : `<div class="result ${pick === l.correct ? 'pass' : 'fail'}"><b>${pick === l.correct ? 'Strong response' : `Consider ${LETTERS[l.correct]} instead`}</b> ${esc(l.reason)}</div>
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
  if (P || !L || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') { if (L.mode === 'pres') exitPres(); else if (L.mode === 'presenter') exitPresenter(); else closeLesson(); return; }
  if (L.tab !== 'class') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && L.mode !== 'normal')) { e.preventDefault(); $('#nextS')?.click(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); $('#prevS')?.click(); }
  else if ((e.key === 'f' || e.key === 'F') && L.mode !== 'presenter') { if (L.mode === 'pres') exitPres(); else { L.mode = 'pres'; renderLesson(); enterFullscreen(); } }
  else if ((e.key === 'p' || e.key === 'P') && L.mode === 'normal') enterPresenter();
  else if ((e.key === 'n' || e.key === 'N') && L.mode === 'pres') { L.notes = !L.notes; renderLesson(); }
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { if (pending.size) flush(); });

// ---------- start ----------
async function start() {
  const pm = location.hash.match(/^#proj\/([a-z]+)/);
  if (pm && decks[pm[1]]) { startProjector(pm[1]); return; }
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
