import { lessons, totalMinutes } from './lessons.js';
import { decks, reference } from './decks.js';
import { DIAGRAMS, flowHTML, applyReveal } from './diagrams.js';
import { icon } from './icons.js';
import { photos } from './photos.js';
import { qrSVG } from './qr.js';
import { STATEMENTS, SCALE, EVALUATION } from './assessment.js';

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
const PAGES = ['home', 'live', 'sessions', 'plan', 'reference', 'help', 'account', 'action', 'checkin', 'review', 'certificate', 'assess', 'evaluate', 'privacy', 'team', 'report', 'deck'];
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
// On a shared computer (chosen at sign-in) nothing about the person is kept in this browser.
const sharedMode = () => !!me?.shared;
function cache() { if (sharedMode()) return; try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch {} }
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
  const items = [['home', 'Home'], ['live', 'Live poll'], ['sessions', 'Sessions', lessons.length], ['plan', 'Course plan'], ['reference', 'Reference'], ['review', 'Review quiz'], ['action', 'Action plan'], ['checkin', 'Check-in'], ['help', 'Help'], ['account', 'Account']];
  if (me?.facilitator) items.push(['team', 'Participants']);
  $('#nav').innerHTML = items.map(([id, label, n]) => `<button class="${page === id ? 'on' : ''}" data-go="${id}" ${page === id ? 'aria-current="page"' : ''}>${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('');
  $('#tabs').innerHTML = [['home', 'Home'], ['live', 'Live'], ['sessions', 'Sessions'], ['plan', 'Plan'], ['account', 'Account']]
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
  // A projector window that is pointed at another session (or anywhere else) starts afresh.
  if (P || /^proj\//.test(h)) { location.reload(); return; }
  const pr = h.match(/^print\/([a-z_]+)(?:\/([a-z]+))?/);
  if (pr && decks[pr[1]]) { startPrint(pr[1], pr[2]); return; }
  if (document.body.classList.contains('printing')) { location.reload(); return; }
  if (h === 'mock') {
    if (!L || L.id !== MOCK_ID) L = { id: MOCK_ID, tab: 'class', slide: 0, step: 0, mode: 'normal', notes: false, picks: {} };
    if (!$('#view').innerHTML) renderPage();
    renderLesson();
    return;
  }
  const m = h.match(/^s\/([a-z]+)(?:\/([a-z]+))?/);
  if (m && lessons.some(l => l.id === m[1])) {
    const tab = TABS.some(t => t[0] === m[2]) ? m[2] : 'plan';
    if (!L || L.id !== m[1]) L = { id: m[1], tab, slide: 0, step: 0, mode: 'normal', notes: false, picks: {} };
    else L.tab = tab;
    if (tab !== 'class') L.mode = 'normal';
    if (!$('#view').innerHTML) renderPage();
    renderLesson();
    return;
  }
  closeLessonView();
  const rep = h.match(/^report\/([\w-]+)$/), dk = h.match(/^deck\/([\w-]+)$/);
  if (rep) reportId = rep[1];
  if (dk) deckClassId = dk[1];
  page = rep ? 'report' : dk ? 'deck' : PAGES.includes(h) && !['report', 'deck'].includes(h) ? h : 'home';
  if (['team', 'report', 'deck'].includes(page) && me && !me.facilitator) page = 'home';
  lastPage = page;
  renderPage();
}

function renderPage() {
  shell();
  liveBanner();
  const v = $('#view');
  if (page === 'sessions') v.innerHTML = sessionsHTML();
  else if (page === 'plan') v.innerHTML = planHTML();
  else if (page === 'live') { v.innerHTML = liveHTML(); bindLive(); }
  else if (page === 'reference') v.innerHTML = referenceHTML();
  else if (page === 'help') v.innerHTML = helpHTML();
  else if (page === 'account') { v.innerHTML = accountHTML(); bindAccount(); }
  else if (page === 'team') { v.innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Participants</h1><p>Loading…</p></div>`; loadTeam(); }
  else if (page === 'deck') { v.innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Customise the deck</h1><p>Loading…</p></div>`; loadDeckPage(); }
  else if (page === 'report') { v.innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Class report</h1><p>Loading…</p></div>`; loadReport(); }
  else if (page === 'action') { v.innerHTML = actionHTML(); bindAction(); }
  else if (page === 'certificate') { v.innerHTML = certificateHTML(); bindCertificate(); }
  else if (page === 'assess') { v.innerHTML = assessHTML(); bindAssess(); }
  else if (page === 'evaluate') { v.innerHTML = evaluateHTML(); bindEvaluate(); }
  else if (page === 'privacy') { v.innerHTML = privacyHTML(); bindPrivacy(); }
  else if (page === 'checkin') { v.innerHTML = checkinHTML(); bindCheckin(); }
  else if (page === 'review') { v.innerHTML = reviewHTML(); bindReview(); }
  else { v.innerHTML = homeHTML(); bindHome(); }
  document.title = ({ live: 'Live poll · ', sessions: 'Sessions · ', plan: 'Course plan · ', reference: 'Reference · ', help: 'Help · ', account: 'Account · ', team: 'Participants · ', report: 'Class report · ', deck: 'Customise deck · ', action: 'Action plan · ', certificate: 'Certificate · ', checkin: 'Check-in · ', review: 'Review quiz · ', assess: 'Self-assessment · ', evaluate: 'Course evaluation · ', privacy: 'My data · ' }[page] || '') + 'Leadership Lab';
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
  if (p) { L = { id: p.dataset.present, tab: 'class', slide: 0, step: 0, mode: 'pres', notes: false, picks: {} }; location.hash = `s/${p.dataset.present}/class`; enterFullscreen(); }
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
      <div class="step"><kbd>F</kbd><span>Full screen on or off</span></div><div class="step"><kbd>P</kbd><span>Presenter view: notes, timer, next slide</span></div><div class="step"><kbd>N</kbd><span>Show or hide the facilitator note while presenting</span></div><div class="step"><kbd>T</kbd><span>Start or pause the activity timer; <kbd>R</kbd> resets it, <kbd>+</kbd> adds a minute</span></div><div class="step"><kbd>V</kbd><span>Show or hide live poll results; <kbd>L</kbd> locks or unlocks voting</span></div><div class="step"><kbd>J</kbd><span>Show or hide the class join code and QR code on the projector</span></div>
      <div class="step"><kbd>Esc</kbd><span>Leave full screen, then close the session</span></div></div></section>
    <section class="panel"><h3>Accounts and privacy</h3>
      <p>Every participant signs in with their own login. Quiz answers, notes and completed sessions save to that account and follow them to another device.</p>
      <p>Facilitators see who has completed which session and how many notes each person wrote, but never what the notes say.</p>
      <p>Forgot a password? A facilitator can set a new one under <b>Participants</b>.</p></section>
    <section class="panel"><h3>Live polls</h3>
      <p>When a facilitator presents a quick check or an opening question (in presenter view or full screen), it opens as a live poll. Participants answer on their phones under <b>Live poll</b>; each person counts once and can change their answer until voting is locked.</p>
      <p>The slide shows how many have answered. The facilitator chooses when to show the results and when to lock voting. Moving to another slide closes the poll.</p></section>
    <section class="panel"><h3>Install and offline use</h3>
      <p>Use your browser’s “Install” or “Add to Home Screen” option to keep the guide one tap away. After one visit, the pages work without a connection; anything you change saves to your account when you’re back online.</p></section>
  </div>`;
}

// ---------- live poll (participants) ----------
// The voting card for phones. It checks every two seconds for the poll the facilitator has open.
let liveLoop = null, liveData = null;
function liveHTML() {
  return `<div class="page-head"><div class="eyebrow">Live poll</div><h1>Vote</h1><p>When your facilitator shows a question to the room, it appears here. Your answer is counted once; you can change it until voting closes.</p></div>
  <section class="panel live-card" id="liveCard" aria-live="polite"><p class="muted">Connecting…</p></section>`;
}
function renderLiveCard() {
  const box = $('#liveCard'); if (!box) return;
  const a = liveData?.active;
  // Re-draw only when something changed, and never while someone is typing an answer.
  const key = JSON.stringify(liveData || null);
  if (box.dataset.key === key || (box.contains(document.activeElement) && document.activeElement.matches('textarea'))) return;
  box.dataset.key = key;
  if (!a) { box.innerHTML = `<div class="live-wait">${icon('radio', 'ic')}<div><b>No question is open right now.</b><p class="muted small">Keep this page open. The next question appears here automatically.</p></div></div>`; return; }
  const mine = liveData.myVote, res = liveData.results, total = res?.total || 0;
  if (a.kind === 'open') {
    box.innerHTML = `<div class="eyebrow">${a.locked ? 'Answers closed' : 'Open now · type a short answer'}</div><h2 class="live-q">${esc(a.q)}</h2>
      ${a.locked ? '' : `<form id="otForm" class="list"><div class="field"><label for="otText">Your answer</label><textarea id="otText" rows="2" maxlength="140" required placeholder="A word or a short phrase">${esc(mine || '')}</textarea></div>
        <div class="row"><button class="btn primary">${mine ? 'Change my answer' : 'Send'}</button><span class="small muted" id="otCount">${(mine || '').length}/140</span></div></form>`}
      <p class="small muted">${mine ? `Your answer: “${esc(mine)}”. ` : a.locked ? 'You did not answer this one. ' : ''}Answers are shown to the room without names.${res ? ` · ${total} response${total === 1 ? '' : 's'}` : ''}</p>
      ${res ? `<ul class="list small ot-phone">${res.entries.slice(0, 20).map(e => `<li>${esc(cleanText(e.text))}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}</li>`).join('')}</ul>` : ''}`;
    const f = $('#otForm');
    if (f) {
      $('#otText').oninput = e => { $('#otCount').textContent = `${e.target.value.length}/140`; };
      f.onsubmit = async e => {
        e.preventDefault();
        try { const r = await call('/api/poll/vote', { id: a.id, text: $('#otText').value }); liveData.myVote = r.myVote; document.activeElement.blur(); box.dataset.key = ''; renderLiveCard(); toast('Answer sent'); }
        catch (err) { toast(err.message); checkLive(); }
      };
    }
    return;
  }
  box.innerHTML = `<div class="eyebrow">${a.locked ? 'Voting closed' : 'Open now'}</div><h2 class="live-q">${esc(a.q)}</h2>
    <div class="live-opts" role="group" aria-label="Answers">${a.o.map((o, j) => {
      const c = res?.counts?.[j] || 0, pct = total ? Math.round(c / total * 100) : 0;
      return `<button class="live-opt${mine === j ? ' on' : ''}" data-vote="${j}" ${a.locked ? 'disabled' : ''} aria-pressed="${mine === j}">
        ${res ? `<i style="width:${pct}%"></i>` : ''}<b>${LETTERS[j]}</b> <span>${esc(o)}</span>${res ? ` <em>${c}</em>` : ''}${mine === j ? ' <small>Your answer</small>' : ''}</button>`;
    }).join('')}</div>
    <p class="small muted">${mine === null || mine === undefined ? (a.locked ? 'You did not vote on this one.' : 'Tap an answer to vote.') : a.locked ? 'Your vote is in. Voting has closed.' : 'Your vote is in. Tap another answer to change it.'}${res ? ` · ${total} response${total === 1 ? '' : 's'}` : ''}</p>`;
  box.querySelectorAll('[data-vote]').forEach(b => b.onclick = async () => {
    try { const r = await call('/api/poll/vote', { id: a.id, choice: +b.dataset.vote }); liveData.myVote = r.myVote; box.dataset.key = ''; renderLiveCard(); }
    catch (e) { toast(e.message); checkLive(); }
  });
}
async function checkLive() {
  try { liveData = await call('/api/poll/current'); } catch { return; }
  if (page === 'live' && !L) renderLiveCard();
  liveBanner();
}
function bindLive() { clearInterval(liveLoop); checkLive(); liveLoop = setInterval(() => { if (page === 'live' && !L) checkLive(); else clearInterval(liveLoop); }, 2000); }
// Elsewhere in the app, a slim banner points to the open poll.
function liveBanner() {
  let b = $('#liveBanner');
  const show = liveData?.active && page !== 'live' && !L && !P && !document.body.classList.contains('printing');
  if (!show) { b?.remove(); return; }
  if (!b) { b = document.createElement('a'); b.id = 'liveBanner'; b.className = 'live-banner'; b.href = '#live'; document.body.append(b); }
  b.innerHTML = `${icon('radio', 'ic')} <span><b>Live poll open.</b> ${liveData.myVote !== null && liveData.myVote !== undefined ? 'You have voted; tap to see it.' : 'Tap to vote.'}</span>`;
}
setInterval(() => { if (me && !P && page !== 'live' && !L) checkLive(); }, 10000);

// ---------- account ----------
function accountHTML() {
  return `<div class="page-head"><div class="eyebrow">Your account</div><h1>${esc(me?.name || 'Account')}</h1><p>Signed in as <b>${esc(me?.id || '…')}</b>${me?.facilitator ? ` · ${me.role}` : ''}${me?.className ? ` · ${esc(me.className)}` : ''}.</p>${me?.shared ? '<p class="msg ok">Shared computer: you will be signed out when the browser closes, and nothing is stored in this browser. Sign out when you finish.</p>' : ''}</div>
  <div class="grid2">
    ${me?.locked ? `<section class="panel"><h3>Demo account</h3><p>This is a shared demo account, so its password can’t be changed here.</p><p class="small muted">Progress and notes on this account are visible to anyone who signs in with it. Ask your facilitator for your own login to keep your work private.</p></section>`
    : `<section class="panel"><h3>Change your password</h3><form id="pwForm" class="list">
      <div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required></div>
      <p class="small muted">At least 8 characters.</p><div class="row"><button class="btn primary">Change password</button></div><p class="msg" id="pwMsg" role="status"></p></form></section>`}
    <section class="panel"><h3>Your progress</h3>
      <div class="stats"><div class="stat"><b>${doneCount()}/${lessons.length}</b> <span>sessions done</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.choice !== undefined).length}</b> <span>quizzes answered</span></div><div class="stat"><b>${lessons.filter(l => saved[l.id]?.note).length}</b> <span>notes written</span></div></div>
      <p class="muted small">Starting over clears your quiz answers, notes and completed sessions.</p>
      <div class="row"><button class="btn danger" id="resetBtn">Start over</button></div><p class="msg" id="resetMsg" role="status"></p>
      <h3 style="margin-top:8px">After the course</h3><div class="row"><a class="btn" href="#action">Action plan</a><a class="btn" href="#checkin">30-day check-in</a><a class="btn" href="#review">Review quiz</a><a class="btn" href="#assess">Self-assessment</a><a class="btn" href="#evaluate">Course evaluation</a><a class="btn ${certReady() ? 'primary' : ''}" href="#certificate">Certificate</a></div>
      <p class="small muted">Your certificate is issued once your facilitator has marked ${me?.threshold || lessons.length} sessions present (${doneCount()} so far).</p>
      <h3 style="margin-top:8px">Privacy</h3><div class="row"><a class="btn" href="#privacy">My data and privacy</a></div>
      <h3 style="margin-top:8px">Presenting</h3><label class="check"><input type="checkbox" id="confOpt" ${celebrate() ? 'checked' : ''}> Confetti for correct quick-check answers</label>
      <p class="small muted">Off by default: correct answers get a quiet green highlight. Also switchable in presenter view.</p>
      <h3 style="margin-top:8px">Sign out</h3><div class="row"><button class="btn" id="logoutBtn">Sign out</button><a class="btn" href="/login?switch=1">Switch account</a></div></section>
  </div>`;
}
function bindAccount() {
  if ($('#pwForm')) $('#pwForm').onsubmit = async e => {
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
  $('#confOpt').onchange = e => { try { localStorage.setItem('ll-confetti', e.target.checked ? 'on' : 'off'); } catch {} };
  $('#logoutBtn').onclick = async () => {
    await fetch('/logout', { method: 'POST' });
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    location.href = '/login';
  };
}

// ---------- facilitator: classes and participants ----------
// Facilitators work with the classes they own or co-facilitate; admins can switch to every class. Attendance is
// marked here and decides certificates. Private notes, check-in text and individual self-assessments never reach
// these pages: the server sends attendance, quiz answers and group averages only.
let classesCache = null;
const teamScope = () => { try { return localStorage.getItem('ll-team-scope') || 'mine'; } catch { return 'mine'; } };
async function loadClasses(force) {
  const scope = me?.admin ? teamScope() : 'mine';
  if (!classesCache || force || classesCache.scope !== scope) classesCache = await call('/api/classes?scope=' + scope);
  return classesCache;
}
const teamFilter = () => { try { return localStorage.getItem('ll-team-class') || 'mine'; } catch { return 'mine'; } };
const setTeamFilter = v => { try { localStorage.setItem('ll-team-class', v); } catch {} };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const pwGen = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\n');
const joinURL = code => `${location.origin}/join?code=${encodeURIComponent(code)}`;
const verifyURL = code => `${location.origin}/verify/${code}`;
// Parse pasted CSV or TSV (optional header row: name, login, password).
function parseRows(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = line => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  let rows = lines.map(split), head = rows[0].map(h => h.toLowerCase());
  let idx = { name: 0, login: 1, password: 2 };
  if (head.includes('name')) { idx = { name: head.indexOf('name'), login: head.findIndex(h => /login|id|user/.test(h)), password: head.indexOf('password') }; rows = rows.slice(1); }
  return rows.map(r => ({ name: r[idx.name] || '', login: idx.login >= 0 ? r[idx.login] || '' : '', password: idx.password >= 0 ? r[idx.password] || '' : '' })).filter(r => r.name);
}

async function loadTeam() {
  let data, rows;
  let filter = teamFilter();
  try {
    data = await loadClasses(true);
    const known = new Set(['mine', ...(me.admin ? ['all', 'unassigned'] : []), ...data.classes.map(c => c.id)]);
    if (!known.has(filter)) { filter = 'mine'; setTeamFilter(filter); }
    rows = await call('/api/team?class=' + encodeURIComponent(filter));
  } catch (err) { $('#view').innerHTML = `<div class="page-head"><h1>Participants</h1><p class="msg bad">${esc(err.message)}</p></div>`; return; }
  if (page !== 'team') return;
  const classes = data.classes, active = classes.filter(c => c.status === 'active'), archived = classes.filter(c => c.status !== 'active');
  const cur = classes.find(c => c.id === filter), owner = cur && (cur.owner === me.id || me.admin);
  const className = id => classes.find(c => c.id === id)?.name || 'No class';
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
  const classOptions = (sel, blank = me.admin) => (blank ? opt('', 'No class', sel || '') : '') + active.map(c => opt(c.id, c.name, sel)).join('') + (archived.length ? `<optgroup label="Archived">${archived.map(c => opt(c.id, c.name, sel)).join('')}</optgroup>` : '');
  const people = rows.filter(r => !r.facilitator || filter !== cur?.id);
  const certCell = r => r.certificate ? `<a href="/verify/${esc(r.certificate.code)}" class="mono small" target="_blank" rel="noopener">${esc(r.certificate.code)}</a>${r.certificate.status === 'valid' ? ` <button class="link danger" data-revoke="${esc(r.certificate.code)}">Revoke</button>` : ' <span class="chip dim">revoked</span> <button class="link" data-reinstate="' + esc(r.certificate.code) + '">Reinstate</button>'}` : r.attended.length >= data.threshold ? '<span class="small">Ready: the participant can issue it</span>' : '<span class="small muted">–</span>';
  const actions = r => r.id === me.id ? '<span class="small muted">you</span>' : `<button class="link" data-reset="${esc(r.id)}">New password</button> · <button class="link danger" data-remove="${esc(r.id)}" data-name="${esc(r.name)}">Remove</button>`;
  const moveCell = r => r.facilitator ? `<span class="small muted">${esc(r.role)}</span>` : `<label class="sr" for="mv-${esc(r.id)}">Class for ${esc(r.name)}</label><select id="mv-${esc(r.id)}" data-move="${esc(r.id)}">${classOptions(r.classId)}</select>`;
  const dots = r => `<span class="dots" title="${r.attended.length} of ${lessons.length} sessions attended">${lessons.map(l => `<span class="${r.attended.includes(l.id) ? 'on' : ''}"></span>`).join('')}</span>${r.attended.length}/${lessons.length}`;

  const roster = cur
    ? `<div class="tbl-wrap att-wrap"><table class="att"><caption class="sr">Attendance for ${esc(cur.name)}. Tick a box to mark someone present; the session number marks everyone present.</caption>
      <thead><tr><th scope="col">Participant</th>${lessons.map(l => `<th scope="col" class="att-h"><button class="att-all" data-all="${l.id}" title="Mark everyone present for Session ${l.n}: ${esc(l.title)}" aria-label="Mark everyone present for Session ${l.n}">${l.n}</button></th>`).join('')}<th scope="col">Attended</th><th scope="col">Quizzes</th><th scope="col">Certificate</th><th scope="col">Class</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>
      ${people.length ? people.map(r => `<tr><th scope="row">${esc(r.name)}<br><span class="mono small muted">${esc(r.id)}</span>${r.locked ? ' <span class="chip dim">demo</span>' : ''}</th>
        ${lessons.map(l => `<td class="att-c"><input type="checkbox" data-att="${esc(r.id)}" data-lesson="${l.id}" ${r.attended.includes(l.id) ? 'checked' : ''} aria-label="${esc(r.name)} attended Session ${l.n}"></td>`).join('')}
        <td>${r.attended.length}/${lessons.length}</td><td>${r.quizzes}/${lessons.length}</td><td>${certCell(r)}</td><td>${moveCell(r)}</td><td style="white-space:nowrap">${actions(r)}</td></tr>`).join('') : `<tr><td colspan="${lessons.length + 6}" class="muted">No participants yet. Share the join code or import a list below.</td></tr>`}
      </tbody></table></div><p class="small muted">A certificate needs ${data.threshold} of ${lessons.length} sessions marked present. Tick boxes as people arrive, or press a session number to mark the whole class present and untick anyone absent.</p>`
    : `<div class="tbl-wrap"><table><caption class="sr">Participants</caption><thead><tr><th scope="col">Name</th><th scope="col">Login ID</th><th scope="col">Class</th><th scope="col">Attendance</th><th scope="col">Quizzes</th><th scope="col">Certificate</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr><td>${esc(r.name)}${r.facilitator ? ` <span class="chip dim">${esc(r.role)}</span>` : ''}${r.locked ? ' <span class="chip dim">demo</span>' : ''}</td><td class="mono">${esc(r.id)}</td>
        <td>${moveCell(r)}</td><td style="white-space:nowrap">${r.facilitator ? '' : dots(r)}</td><td>${r.facilitator ? '' : `${r.quizzes}/${lessons.length}`}</td><td>${r.facilitator ? '' : certCell(r)}</td><td style="white-space:nowrap">${actions(r)}</td></tr>`).join('') : `<tr><td colspan="7" class="muted">No participants here yet.</td></tr>`}
      </tbody></table></div>`;

  $('#view').innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator</div><h1>Participants and classes</h1>
  <p>Your classes, their join codes and attendance. You see attendance and quiz answers; private notes, check-ins and self-assessments are never shown to facilitators.</p></div>
  <section class="panel"><div class="row class-bar">
    ${me.admin ? `<div class="seg" role="group" aria-label="Which classes"><button class="${data.scope === 'mine' ? 'on' : ''}" data-scope="mine" aria-pressed="${data.scope === 'mine'}">My classes</button><button class="${data.scope === 'all' ? 'on' : ''}" data-scope="all" aria-pressed="${data.scope === 'all'}">All classes</button></div>` : ''}
    <label for="classSel" class="small"><b>Show</b></label>
    <select id="classSel">${opt('mine', me.admin && data.scope === 'all' ? 'Participants in my classes' : 'All my classes', filter)}${active.map(c => opt(c.id, `${c.name} (${c.members})`, filter)).join('')}${archived.length ? `<optgroup label="Archived">${archived.map(c => opt(c.id, `${c.name} (${c.members})`, filter)).join('')}</optgroup>` : ''}${me.admin ? opt('unassigned', `No class (${data.unassigned})`, filter) + opt('all', 'Everyone', filter) : ''}</select>
    ${cur || (filter === 'unassigned' && me.admin) ? `<a class="btn" href="#report/${esc(filter)}">Class report</a>` : ''}${cur ? `<a class="btn" href="#deck/${esc(cur.id)}">Customise deck</a>` : ''}
    <button class="btn" id="newClassBtn">New class</button></div>
    ${!classes.length ? `<p class="muted">${data.scope === 'all' ? 'There are no classes yet.' : 'You don’t run any classes yet. Create one, or ask a class owner to add you as a co-facilitator.'}</p>` : ''}
    ${cur ? `<div class="class-card"><div class="cc-main"><div><div class="eyebrow">Join code</div><p class="join-code mono">${esc(cur.code)}</p>
        <p class="small muted">Participants create their own login at <b>${esc(location.host)}/join</b> with this code, or scan the QR code.</p>
        <div class="row"><button class="btn sm" id="copyCode">Copy join link</button>${owner || cur.mine ? '<button class="btn sm" id="newCode">New code</button><button class="btn sm" id="renameClass">Rename</button>' : ''}${owner ? `<button class="btn sm" id="archiveClass">${cur.status === 'active' ? 'Archive class' : 'Restore class'}</button>` : ''}</div>
        <p class="small muted">${cur.status === 'active' ? 'Active' : `Archived ${fmtDate(cur.archivedAt)}: the join code no longer works, and the class and its participants are deleted two years after archiving`} · created ${fmtDate(cur.created)} · ${cur.members} participant${cur.members === 1 ? '' : 's'} · owner ${esc(cur.ownerName || 'none')}${cur.owner === me.id ? ' (you)' : ''}</p></div>
        <div class="cc-qr">${qrSVG(joinURL(cur.code), { label: `QR code to join ${cur.name}` })}</div></div>
      <div class="cofac"><h4>Co-facilitators</h4>${cur.facilitators.length ? `<ul class="list small">${cur.facilitators.map(f => `<li>${esc(f.name)} <span class="mono muted">${esc(f.id)}</span>${owner ? ` · <button class="link danger" data-unfac="${esc(f.id)}">Remove</button>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">None yet.</p>'}
        ${owner ? `<form id="facForm" class="row"><label for="facId" class="sr">Login ID of a facilitator to add</label><input id="facId" placeholder="Facilitator login ID" autocapitalize="none" spellcheck="false" required><button class="btn sm">Add co-facilitator</button></form><p class="msg" id="facMsg" role="status"></p>` : ''}</div></div>` : ''}
    <form id="classForm" class="list" hidden><div class="form-row"><div class="field"><label for="cName">Class name</label><input id="cName" maxlength="80" required placeholder="e.g. MNDF supervisors, January"></div>
      <div class="field"><label for="cCode">Join code (optional)</label><input id="cCode" maxlength="16" placeholder="Made for you, e.g. MS-7KQ" autocapitalize="characters"></div></div>
      <div class="row"><button class="btn primary">Create class</button><button type="button" class="btn" id="cancelClass">Cancel</button></div><p class="msg" id="classMsg" role="status"></p></form></section>
  ${roster}
  <div class="grid2">
    <section class="panel"><h3>Add an account</h3><form id="addForm" class="list">
      <div class="field"><label for="nName">Name</label><input id="nName" required maxlength="80" placeholder="e.g. Aishath Ali"></div>
      <div class="form-row"><div class="field"><label for="nId">Login ID</label><input id="nId" required autocapitalize="none" spellcheck="false" placeholder="e.g. aishath"></div>
      <div class="field"><label for="nPw">Starting password</label><input id="nPw" required minlength="8" placeholder="8+ characters"></div></div>
      ${me.admin ? `<div class="field"><label for="nRole">Account type</label><select id="nRole"><option value="participant">Participant</option><option value="facilitator">Facilitator (runs their own classes)</option><option value="admin">Admin (all classes, accounts and backups)</option></select></div>` : ''}
      <div class="field" id="nClassWrap"><label for="nClass">Class</label><select id="nClass">${classOptions(cur?.id || '', me.admin)}</select></div>
      <label class="check"><input type="checkbox" id="nLocked"> Demo account (shared; its password can’t be changed by whoever signs in)</label>
      <div class="row"><button class="btn primary" ${!me.admin && !active.length ? 'disabled' : ''}>Add account</button><button type="button" class="btn" id="genPw">Suggest a password</button></div>
      <p class="msg" id="addMsg" role="status"></p></form></section>
    <section class="panel"><h3>Bulk import</h3><form id="importForm" class="list">
      <p class="small muted">One person per line: <b>name</b>, then optional <b>login ID</b> and <b>password</b>, separated by commas or tabs (paste straight from a spreadsheet). Missing login IDs and passwords are made for you.</p>
      <div class="field"><label for="impClass">Into class</label><select id="impClass" required>${active.map(c => opt(c.id, c.name, cur?.id)).join('')}</select></div>
      <div class="field"><label for="impText">Participants</label><textarea id="impText" rows="6" placeholder="name,login,password&#10;Aishath Ali,aishath,&#10;Ibrahim Rasheed,,"></textarea></div>
      <div class="field"><label for="impFile">Or choose a CSV file</label><input id="impFile" type="file" accept=".csv,.tsv,.txt,text/csv"></div>
      <div class="row"><button class="btn primary" ${active.length ? '' : 'disabled'}>Import</button></div>
      ${active.length ? '' : '<p class="small muted">Create a class first.</p>'}<p class="msg" id="impMsg" role="status"></p><div id="impResult"></div></form></section>
  </div>
  ${me.admin ? `<section class="panel"><h3>Backups</h3><p class="small muted" id="bkInfo">Loading…</p><div class="row"><button class="btn" id="bkNow">Back up now</button></div><div id="bkList"></div></section>` : ''}`;

  const reload = () => loadTeam();
  const act = fn => async (...a) => { try { await fn(...a); } catch (err) { alert(err.message); } };
  $$('[data-scope]').forEach(b => b.onclick = () => { try { localStorage.setItem('ll-team-scope', b.dataset.scope); } catch {} reload(); });
  $('#classSel').onchange = e => { setTeamFilter(e.target.value); reload(); };
  $('#newClassBtn').onclick = () => { $('#classForm').hidden = false; $('#cName').focus(); };
  $('#cancelClass').onclick = () => { $('#classForm').hidden = true; };
  $('#classForm').onsubmit = async e => {
    e.preventDefault();
    try { const c = await call('/api/classes', { name: $('#cName').value, code: $('#cCode').value || undefined }); setTeamFilter(c.id); await reload(); toast(`Class created. Join code ${c.code}`); }
    catch (err) { $('#classMsg').className = 'msg bad'; $('#classMsg').textContent = err.message; }
  };
  if (cur) {
    $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(joinURL(cur.code)); toast('Join link copied'); } catch { prompt('Copy the join link:', joinURL(cur.code)); } };
    $('#newCode') && ($('#newCode').onclick = act(async () => { if (!confirm('Make a new join code? The old code stops working.')) return; await call('/api/classes/update', { id: cur.id, code: 'new' }); reload(); }));
    $('#renameClass') && ($('#renameClass').onclick = act(async () => { const name = prompt('Class name:', cur.name); if (!name) return; await call('/api/classes/update', { id: cur.id, name }); reload(); }));
    $('#archiveClass') && ($('#archiveClass').onclick = act(async () => {
      if (cur.status === 'active' && !confirm('Archive this class? Its join code stops working. Archived classes and their participants are deleted automatically after two years.')) return;
      await call('/api/classes/update', { id: cur.id, status: cur.status === 'active' ? 'archived' : 'active' }); reload();
    }));
    $('#facForm') && ($('#facForm').onsubmit = async e => {
      e.preventDefault();
      try { await call('/api/classes/facilitators', { id: cur.id, add: $('#facId').value.trim() }); classesCache = null; reload(); toast('Co-facilitator added'); }
      catch (err) { $('#facMsg').className = 'msg bad'; $('#facMsg').textContent = err.message; }
    });
    $$('[data-unfac]').forEach(b => b.onclick = act(async () => { if (!confirm('Remove this co-facilitator from the class?')) return; await call('/api/classes/facilitators', { id: cur.id, remove: b.dataset.unfac }); reload(); }));
    $$('[data-att]').forEach(c => c.onchange = act(async () => {
      c.disabled = true;
      try { await call('/api/attendance', { classId: cur.id, lesson: c.dataset.lesson, userIds: [c.dataset.att], present: c.checked }); }
      catch (err) { c.checked = !c.checked; throw err; } finally { c.disabled = false; }
      const row = c.closest('tr'), n = row.querySelectorAll('[data-att]:checked').length; row.children[lessons.length + 1].textContent = `${n}/${lessons.length}`;
    }));
    $$('[data-all]').forEach(b => b.onclick = act(async () => {
      const l = lessons.find(x => x.id === b.dataset.all);
      const r = await call('/api/attendance', { classId: cur.id, lesson: l.id, present: true });
      toast(`${r.marked} marked present for Session ${l.n}`); reload();
    }));
  }
  $$('[data-revoke]').forEach(b => b.onclick = act(async () => { if (!confirm(`Revoke certificate ${b.dataset.revoke}? The verification page will show it as revoked.`)) return; await call('/api/certificates/revoke', { code: b.dataset.revoke }); reload(); }));
  $$('[data-reinstate]').forEach(b => b.onclick = act(async () => { await call('/api/certificates/revoke', { code: b.dataset.reinstate, revoke: false }); reload(); }));
  $$('[data-move]').forEach(s => s.onchange = act(async () => { await call('/api/users/class', { id: s.dataset.move, classId: s.value || null }); toast(`Moved to ${className(s.value)}`); reload(); }));
  $('#genPw').onclick = () => { $('#nPw').value = pwGen(); };
  const roleSel = $('#nRole');
  if (roleSel) roleSel.onchange = () => { $('#nClassWrap').hidden = roleSel.value !== 'participant'; };
  $('#addForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const id = $('#nId').value.trim().toLowerCase(), password = $('#nPw').value, role = roleSel?.value || 'participant';
      await call('/api/users', { id, name: $('#nName').value, password, role, locked: $('#nLocked').checked, classId: role === 'participant' ? $('#nClass').value || null : null });
      await reload();
      const m = $('#addMsg'); m.className = 'msg ok'; m.textContent = `Account created. Give them login ID “${id}” and password “${password}”.`;
    } catch (err) { const m = $('#addMsg'); m.className = 'msg bad'; m.textContent = err.message; }
  };
  $('#impFile').onchange = async e => { const f = e.target.files[0]; if (f) $('#impText').value = await f.text(); };
  $('#importForm').onsubmit = async e => {
    e.preventDefault();
    const list = parseRows($('#impText').value), msg = $('#impMsg');
    if (!list.length) { msg.className = 'msg bad'; msg.textContent = 'Paste at least one name.'; return; }
    try {
      const r = await call('/api/classes/import', { id: $('#impClass').value, rows: list });
      const ok = r.results.filter(x => x.status === 'created');
      msg.className = 'msg ok'; msg.textContent = `${ok.length} account${ok.length === 1 ? '' : 's'} created in ${r.class.name}.`;
      $('#impResult').innerHTML = `<div class="tbl-wrap"><table><caption class="sr">Import results</caption><thead><tr><th scope="col">Name</th><th scope="col">Login ID</th><th scope="col">Password</th><th scope="col">Result</th></tr></thead><tbody>
        ${r.results.map(x => `<tr><td>${esc(x.name || '')}</td><td class="mono">${esc(x.id || '')}</td><td class="mono">${esc(x.password || '')}</td><td>${x.status === 'created' ? 'Created' : esc(x.error || x.status)}</td></tr>`).join('')}</tbody></table></div>
        <div class="row"><button class="btn" id="impCsv" type="button">Download logins (CSV)</button></div><p class="small muted">Passwords are shown once. Download the list before leaving this page.</p>`;
      $('#impCsv').onclick = () => download(`logins-${r.class.code}.csv`, toCSV([['Name', 'Login ID', 'Password', 'Class', 'Sign in at'], ...ok.map(x => [x.name, x.id, x.password, r.class.name, `${location.origin}/login`])]));
      classesCache = null;
    } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  };
  $$('[data-reset]').forEach(b => b.onclick = act(async () => {
    const password = prompt(`New password for ${b.dataset.reset} (at least 8 characters):`, pwGen());
    if (!password) return;
    await call('/api/users', { id: b.dataset.reset, password, replace: true }); alert(`Password changed. Their new password is: ${password}`); reload();
  }));
  $$('[data-remove]').forEach(b => b.onclick = act(async () => {
    if (!confirm(`Remove ${b.dataset.name}? Their notes, attendance, check-ins and certificate are deleted too.`)) return;
    await call('/api/users/remove', { id: b.dataset.remove }); reload();
  }));
  if (me.admin) {
    const showBackups = async () => {
      try {
        const r = await call('/api/admin/backups');
        $('#bkInfo').innerHTML = `${r.backups.length} snapshot${r.backups.length === 1 ? '' : 's'} kept (newest 30). A new one is made every night. ${r.encrypted ? 'Snapshots are encrypted and complete.' : '<b class="bad-t">BACKUP_KEY is not set, so snapshots leave out passwords, private notes and check-ins.</b> Run <code>npm run generate-backup-key</code> and follow its instructions.'}`;
        $('#bkList').innerHTML = r.backups.length ? `<ul class="list small">${r.backups.slice(0, 5).map(b => `<li class="mono">${esc(b.key.slice(9, 25).replace('T', ' '))} UTC · ${Math.round((b.bytes || 0) / 1024)} KB${b.encrypted ? ' · encrypted' : ' · redacted'}</li>`).join('')}</ul>` : '';
      } catch (err) { $('#bkInfo').textContent = err.message; }
    };
    $('#bkNow').onclick = act(async () => { const r = await call('/api/admin/backup', {}); toast(`Backup saved (${Math.round(r.bytes / 1024)} KB)`); showBackups(); });
    showBackups();
  }
}

// ---------- facilitator: class report ----------
// Attendance, quiz answers, live polls and group-level impact figures. No notes, check-in text or individual
// self-assessments: the server only sends averages over at least three people.
let reportId = null, reportData = null;
async function loadReport() {
  try { reportData = await call('/api/classes/report?id=' + encodeURIComponent(reportId)); }
  catch (err) { $('#view').innerHTML = `<div class="page-head"><h1>Class report</h1><p class="msg bad">${esc(err.message)}</p></div>`; return; }
  if (page !== 'report') return;
  const r = reportData, m = r.members, I = r.impact;
  const has = (u, l) => u.attended.some(a => a.lesson === l.id);
  const complete = m.filter(u => u.attended.length >= r.threshold).length;
  const quiz = lessons.map(l => {
    const answers = m.map(u => u.quiz[l.id]).filter(Number.isInteger);
    const counts = l.choices.map((_, j) => answers.filter(a => a === j).length);
    return { l, counts, total: answers.length, right: counts[l.correct] };
  });
  const answered = quiz.reduce((a, q) => a + q.total, 0), right = quiz.reduce((a, q) => a + q.right, 0);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const bar = (v, max, cls = '') => `<span class="rbar ${cls}"><i style="width:${max ? Math.round(v / max * 100) : 0}%"></i></span>`;
  const num = v => v === null || v === undefined ? '<span class="muted small">fewer than ' + (I.assessment.minGroup) + '</span>' : v.toFixed(1);
  const delta = v => v === null ? '<span class="muted small">–</span>' : `<b class="${v > 0 ? 'ok-t' : v < 0 ? 'bad-t' : ''}">${v > 0 ? '+' : ''}${v.toFixed(1)}</b>`;
  const where = id => { const [deck, i] = id.split(':'); return { s: decks[deck]?.[+i], l: lessons.find(x => x.id === deck) }; };
  const byDay = {};
  for (const p of r.polls) (byDay[p.closedAt.slice(0, 10)] ||= []).push(p);
  const E = I.evaluation, F = I.followThrough, A = I.assessment;
  $('#view').innerHTML = `<div class="page-head report-head"><div class="eyebrow">Class report · ${esc(r.class.code || 'no join code')}</div><h1>${esc(r.class.name)}</h1>
    <p>Generated ${new Date(r.generated).toLocaleString()}. Attendance, quiz answers, live polls and group averages only; private notes, check-in text and individual self-assessments are never included.</p></div>
  <div class="row no-print"><a class="btn" href="#team">Back to participants</a><button class="btn" id="repCsv">Download CSV</button><button class="btn primary" data-print>Print summary</button></div>
  <div class="stats rep-stats"><div class="stat"><b>${m.length}</b> <span>enrolled</span></div><div class="stat"><b>${complete}</b> <span>reached the certificate (${r.threshold} sessions)</span></div><div class="stat"><b>${pct(right, answered)}%</b> <span>quiz answers correct</span></div><div class="stat"><b>${F.checkedIn}/${F.enrolled}</b> <span>did a 30-day check-in</span></div></div>
  <section class="panel"><h3>Attendance by session</h3><div class="tbl-wrap flat"><table><caption class="sr">Attendance by session</caption><thead><tr><th scope="col">Session</th><th scope="col">Present</th><th scope="col"><span class="sr">Share</span></th></tr></thead><tbody>
    ${lessons.map(l => { const d = m.filter(u => has(u, l)).length; return `<tr><td><b>${l.n}</b> ${esc(l.title)}</td><td>${d} of ${m.length} (${pct(d, m.length)}%)</td><td>${bar(d, m.length)}</td></tr>`; }).join('')}</tbody></table></div></section>
  <section class="panel"><h3>Impact: self-assessment before and after</h3>
    <p class="small muted">Class averages on a 1 (rarely) to 5 (consistently) scale. ${A.baselineCount} first assessment${A.baselineCount === 1 ? '' : 's'}, ${A.followupCount} at 30 days, ${A.pairedCount} people with both. A figure appears once at least ${A.minGroup} people have answered, so no individual’s ratings can be worked out. Change is measured only for people who answered both times.</p>
    <div class="tbl-wrap flat"><table><caption class="sr">Self-assessment averages</caption><thead><tr><th scope="col">Statement</th><th scope="col">Before</th><th scope="col">After 30 days</th><th scope="col">Change</th></tr></thead><tbody>
      ${A.statements.map(s => `<tr><td>${esc(s.text)}</td><td>${num(s.baseline)}</td><td>${num(s.followup)}</td><td>${delta(s.change)}</td></tr>`).join('')}</tbody></table></div></section>
  <div class="grid2">
    <section class="panel"><h3>Follow-through</h3><p><b>${F.checkedIn}</b> of ${F.enrolled} participants (${F.rate}%) have done at least one 30-day check-in.</p>
      <p>Average self-rated follow-through: ${F.averageRating === null ? `<span class="muted">shown once ${F.minGroup} people have checked in</span>` : `<b>${F.averageRating.toFixed(1)}</b> out of 5`}</p><p class="small muted">What people wrote in their check-ins stays private.</p></section>
    <section class="panel"><h3>Course evaluation (anonymous)</h3>${E.count < E.minGroup ? `<p>${E.count} response${E.count === 1 ? '' : 's'} so far. Results appear once ${E.minGroup} people have responded, so no answer can be traced to a person.</p>` : `
      <p>${E.count} responses. Relevance <b>${E.relevance.toFixed(1)}</b>/5 · Facilitator <b>${E.facilitator.toFixed(1)}</b>/5 · Pace <b>${E.pace.toFixed(1)}</b> (3 is about right)</p>
      <div class="rq-opts">${['Much too slow', 'A bit slow', 'About right', 'A bit fast', 'Much too fast'].map((t, j) => `<div class="rq-opt"><span class="lt">${j + 1}</span> <span class="txt">${t}</span> ${bar(E.paceCounts[j], E.count)} <span class="mono">${E.paceCounts[j]}</span></div>`).join('')}</div>
      ${E.comments.length ? `<h4>One thing to improve</h4><ul class="list small">${E.comments.map(c => `<li>“${esc(c)}”</li>`).join('')}</ul>` : ''}`}</section>
  </div>
  <section class="panel"><h3>Quiz answers by question</h3><p class="small muted">Each session’s decision question. The strongest answer is marked; a large share on another option points to a misconception worth revisiting.</p>
    ${quiz.map(q => `<div class="rq"><p><b>${q.l.n}</b> ${esc(q.l.scenario)} <span class="muted small">· ${q.total} answered · ${pct(q.right, q.total)}% chose the strongest answer</span></p>
      <div class="rq-opts">${q.l.choices.map((c, j) => `<div class="rq-opt ${j === q.l.correct ? 'right' : ''}"><span class="lt">${LETTERS[j]}</span> <span class="txt">${esc(c)}${j === q.l.correct ? ' <em>(strongest)</em>' : ''}</span> ${bar(q.counts[j], q.total, j === q.l.correct ? 'ok' : '')} <span class="mono">${q.counts[j]}</span></div>`).join('')}</div></div>`).join('')}</section>
  <section class="panel"><h3>Participants</h3><div class="tbl-wrap flat"><table><caption class="sr">Participants</caption><thead><tr><th scope="col">Name</th><th scope="col">Login ID</th><th scope="col">Attended</th><th scope="col">Quiz correct</th><th scope="col">Certificate</th></tr></thead><tbody>
    ${m.map(u => { const a = lessons.filter(l => Number.isInteger(u.quiz[l.id])), ok = a.filter(l => u.quiz[l.id] === l.correct).length;
      return `<tr><td>${esc(u.name)}</td><td class="mono">${esc(u.id)}</td><td>${u.attended.length}/${lessons.length}</td><td>${ok}/${a.length}</td><td>${u.certificate ? `<span class="mono small">${esc(u.certificate.code)}</span>${u.certificate.status !== 'valid' ? ' (revoked)' : ''}` : '–'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">No participants.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><h3>Live poll history</h3>${Object.keys(byDay).length ? Object.entries(byDay).map(([day, polls]) => `<h4>${fmtDate(day)}</h4>${polls.map(p => { const { s, l } = where(p.id), max = Math.max(1, ...p.counts, ...p.entries.map(e => e.count));
      return `<div class="rq"><p><b>${esc(l ? `Session ${l.n}` : p.id)}</b> ${esc(p.q)} <span class="muted small">· ${p.total} response${p.total === 1 ? '' : 's'} · closed ${new Date(p.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>
        ${p.kind === 'open' ? `<ul class="list small">${p.entries.slice(0, 30).map(e => `<li>${e.pinned ? '📌 ' : ''}${esc(e.text)}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}</li>`).join('')}</ul>`
          : `<div class="rq-opts">${p.o.map((o, j) => `<div class="rq-opt ${s?.t === 'check' && j === s.a ? 'right' : ''}"><span class="lt">${LETTERS[j]}</span> <span class="txt">${esc(o)}</span> ${bar(p.counts[j], max, s?.t === 'check' && j === s.a ? 'ok' : '')} <span class="mono">${p.counts[j]}</span></div>`).join('')}</div>`}</div>`; }).join('')}`).join('') : '<p class="muted">No live polls have been run with this class yet.</p>'}</section>`;
  $('#repCsv').onclick = () => {
    const fmt = v => v === null || v === undefined ? '' : v;
    const rows = [['Class report', r.class.name], ['Join code', r.class.code || ''], ['Generated', r.generated], ['Certificate needs sessions', r.threshold], [],
      ['Participants'], ['Name', 'Login ID', 'Sessions attended', 'Quiz answered', 'Quiz strongest answer', 'Certificate', ...lessons.map(l => `S${l.n} present`)],
      ...m.map(u => { const a = lessons.filter(l => Number.isInteger(u.quiz[l.id])); return [u.name, u.id, u.attended.length, a.length, a.filter(l => u.quiz[l.id] === l.correct).length, u.certificate ? `${u.certificate.code}${u.certificate.status !== 'valid' ? ' (revoked)' : ''}` : '', ...lessons.map(l => has(u, l) ? 'yes' : '')]; }),
      [], ['Attendance by session'], ['Session', 'Title', 'Present', 'Enrolled'], ...lessons.map(l => [l.n, l.title, m.filter(u => has(u, l)).length, m.length]),
      [], [`Self-assessment averages (1-5; shown when ${A.minGroup}+ answered)`], ['Statement', 'Before', 'After 30 days', 'Change (paired)'], ...A.statements.map(s => [s.text, fmt(s.baseline), fmt(s.followup), fmt(s.change)]),
      [], ['Follow-through'], ['Checked in', F.checkedIn], ['Enrolled', F.enrolled], ['Rate %', F.rate], ['Average self-rating', fmt(F.averageRating)],
      [], ['Anonymous evaluation'], ['Responses', E.count], ['Relevance', fmt(E.relevance)], ['Facilitator', fmt(E.facilitator)], ['Pace (3 = about right)', fmt(E.pace)], ...E.comments.map(c => ['Comment', c]),
      [], ['Quiz answers'], ['Session', 'Question', 'Option', 'Text', 'Strongest', 'Count'], ...quiz.flatMap(q => q.l.choices.map((c, j) => [q.l.n, q.l.scenario, LETTERS[j], c, j === q.l.correct ? 'yes' : '', q.counts[j]])),
      [], ['Live polls'], ['Closed at', 'Poll', 'Question', 'Answer', 'Count', 'Total'],
      ...r.polls.flatMap(p => p.kind === 'open' ? p.entries.map(e => [p.closedAt, p.id, p.q, e.text, e.count, p.total]) : p.o.map((o, j) => [p.closedAt, p.id, p.q, o, p.counts[j], p.total]))];
    download(`class-report-${(r.class.code || r.class.id).toLowerCase()}.csv`, toCSV(rows));
  };
}

// ---------- facilitator: customise a class's deck ----------
// Skip slides and change activity timers for one class. Stored on the server and applied in presenter view (when
// presenting to that class) and for the class's participants.
let deckClassId = null, deckLessonId = 'foundations';
async function loadDeckPage() {
  let data;
  try { data = await loadClasses(true); } catch (err) { $('#view').innerHTML = `<p class="msg bad">${esc(err.message)}</p>`; return; }
  const c = data.classes.find(x => x.id === deckClassId);
  if (!c) { $('#view').innerHTML = `<div class="page-head"><h1>Customise deck</h1><p class="msg bad">You don’t run that class.</p></div>`; return; }
  const l = lessons.find(x => x.id === deckLessonId) || lessons[0], d = decks[l.id], ov = c.deck[l.id] || { skip: [], timers: {} };
  const changed = lessons.filter(x => c.deck[x.id]).map(x => x.n);
  $('#view').innerHTML = `<div class="page-head"><div class="eyebrow">Facilitator · ${esc(c.name)}</div><h1>Customise the deck</h1>
    <p>Skip slides or change activity timers for this class only. Other classes, and the course itself, are not affected. Changes apply in presenter view when you present to ${esc(c.name)}, and for its participants.</p></div>
  <div class="row no-print"><a class="btn" href="#team">Back to participants</a><label for="deckLesson" class="small"><b>Session</b></label><select id="deckLesson">${lessons.map(x => `<option value="${x.id}" ${x.id === l.id ? 'selected' : ''}>${x.n} ${esc(x.title)}${c.deck[x.id] ? ' (changed)' : ''}</option>`).join('')}</select></div>
  ${changed.length ? `<p class="small muted">Sessions changed for this class: ${changed.join(', ')}.</p>` : ''}
  <form id="deckForm" class="panel"><div class="tbl-wrap flat"><table class="deck-tbl"><caption class="sr">Slides in Session ${l.n}</caption><thead><tr><th scope="col">#</th><th scope="col">Slide</th><th scope="col">Skip</th><th scope="col">Timer (minutes)</th></tr></thead><tbody>
    ${d.map((s, i) => { const base = timerMinutes(l, s, i, {}); return `<tr class="${ov.skip.includes(i) ? 'skipped' : ''}"><td class="mono">${pad(i + 1)}</td><td>${esc(thumbLabel(l, s))} <span class="muted small">${esc(s.k || '')}</span></td>
      <td>${i === 0 ? '<span class="small muted">title</span>' : `<input type="checkbox" data-skip="${i}" ${ov.skip.includes(i) ? 'checked' : ''} aria-label="Skip slide ${i + 1}">`}</td>
      <td>${base ? `<input type="number" min="1" max="120" class="tm-in" data-timer="${i}" value="${ov.timers[i] ?? ''}" placeholder="${base}" aria-label="Timer minutes for slide ${i + 1} (planned ${base})"> <span class="small muted">planned ${base}</span>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div><div class="row"><button class="btn primary">Save for this class</button><button type="button" class="btn" id="deckReset">Use the standard deck</button></div><p class="msg" id="deckMsg" role="status"></p></form>`;
  $('#deckLesson').onchange = e => { deckLessonId = e.target.value; loadDeckPage(); };
  $$('[data-skip]').forEach(b => b.onchange = () => b.closest('tr').classList.toggle('skipped', b.checked));
  const save = async (skip, timers) => {
    const msg = $('#deckMsg');
    try { await call('/api/classes/deck', { id: c.id, lesson: l.id, skip, timers }); classesCache = null; refreshPresentDeck(); msg.className = 'msg ok'; msg.textContent = 'Saved. Presenter view uses these changes when you present to this class.'; setTimeout(loadDeckPage, 600); }
    catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  };
  $('#deckForm').onsubmit = e => {
    e.preventDefault();
    const timers = {};
    $$('[data-timer]').forEach(x => { if (x.value) timers[x.dataset.timer] = +x.value; });
    save($$('[data-skip]:checked').map(x => +x.dataset.skip), timers);
  };
  $('#deckReset').onclick = () => save([], {});
}

// ---------- after the course: action plan, certificate, check-in, self-assessment, evaluation, my data ----------
// All of these read only the signed-in person's own data. Nothing here is visible to facilitators.
const COURSE_TITLE = 'Leadership Lab: a practical two-day leadership course';
const commitment = () => saved.commitment?.note || '';
const certReady = () => doneCount() >= (me?.threshold || lessons.length);
const lastDoneAt = () => lessons.map(l => saved[l.id]?.doneAt || '').sort().pop() || null;
const longDate = iso => new Date(iso || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const checkinDate = () => new Date(new Date(certData?.certificate?.completedOn || lastDoneAt() || Date.now()).getTime() + 30 * 864e5);

// A calendar file (RFC 5545) for the 30-day check-in: an all-day event with a 9:00 reminder and a link to /checkin.
function checkinICS(date, goal) {
  const d = x => x.toISOString().slice(0, 10).replace(/-/g, '');
  const icsText = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => { const out = []; let cur = ''; for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch; } out.push(cur); return out.join('\r\n'); };
  const end = new Date(date.getTime() + 864e5), url = `${location.origin}/checkin`;
  const desc = `Time for your Leadership Lab 30-day check-in.\n\nYour commitment: ${goal || '(open your action plan)'}\n\nRate how well you followed through, note what helped and what got in the way, and set your next commitment: ${url}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Leadership Lab//30-day check-in//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:checkin-${crypto.randomUUID()}@${location.host}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${d(date)}`, `DTEND;VALUE=DATE:${d(end)}`, 'SUMMARY:Leadership Lab: 30-day check-in', `DESCRIPTION:${icsText(desc)}`, `URL:${url}`, 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Leadership Lab 30-day check-in', 'TRIGGER;RELATED=START:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR']
    .map(fold).join('\r\n') + '\r\n';
}

function actionHTML() {
  const notes = lessons.filter(l => saved[l.id]?.note && l.id !== 'commitment');
  const review = checkinDate();
  return `<div class="page-head"><div class="eyebrow">Only you can see this page</div><h1>Your action plan</h1>
    <p>Built from your own notes. Print it or save it as a PDF, and put the check-in in your calendar so it doesn’t slip.</p></div>
  <div class="row no-print"><button class="btn primary" data-print>Print or save as PDF</button><button class="btn" id="icsBtn">Add 30-day check-in to calendar (.ics)</button><a class="btn" href="#checkin">30-day check-in</a></div>
  <article class="printable doc">
    <header><div class="eyebrow">Leadership Lab · personal action plan</div><h2>${esc(me?.name || '')}</h2>
      <p class="small muted">${me?.className ? esc(me.className) + ' · ' : ''}${doneCount()} of ${lessons.length} sessions attended · check-in on ${longDate(review.toISOString())}</p></header>
    <section><h3>My commitment</h3>${commitment() ? `<p class="commit">${esc(commitment())}</p>` : `<p class="muted">You have not written your commitment yet. Add it in <a href="#s/commitment/notes">Session 12 · Notes</a>.</p>`}</section>
    <section><h3>What I took from each session</h3>${notes.length ? notes.map(l => `<div class="plan-note"><h4>Session ${l.n} · ${esc(l.title)}</h4><p class="small muted">${esc(l.prompt)}</p><p>${esc(saved[l.id].note)}</p></div>`).join('') : '<p class="muted">No notes yet. Each session’s Notes tab asks one question; your answers appear here.</p>'}</section>
    <section><h3>Review</h3><p>On ${longDate(review.toISOString())}, open <b>${esc(location.host)}/checkin</b>, rate how well you followed through, and set your next commitment.</p>
      <div class="sign-row"><span>First situation where I will act:</span><span class="line"></span></div><div class="sign-row"><span>Who I will tell:</span><span class="line"></span></div></section>
  </article>`;
}
function bindAction() {
  $('#icsBtn').onclick = () => download('leadership-lab-30-day-check-in.ics', checkinICS(checkinDate(), commitment()), 'text/calendar');
  if (!certData) call('/api/certificate').then(d => { certData = d; }).catch(() => {});
}

// Certificates are issued by the server once a facilitator has marked enough sessions, and carry a code anyone can
// check at /verify/<code>.
let certData = null;
function certificateHTML() {
  if (!certData) return `<div class="page-head"><div class="eyebrow">Certificate</div><h1>Certificate</h1><p>Loading…</p></div>`;
  const c = certData.certificate, att = certData.attended, need = certData.threshold;
  if (!c) {
    const ready = att.length >= need, left = lessons.filter(l => !att.includes(l.id));
    return `<div class="page-head"><div class="eyebrow">Certificate</div><h1>${ready ? 'Your certificate is ready' : 'Not yet'}</h1>
      <p>${ready ? `Your facilitator has marked you present for ${att.length} sessions. Issue your certificate to get its verification code.` : `A certificate needs ${need} of ${lessons.length} sessions marked present by your facilitator. So far: ${att.length}.`}</p></div>
      ${ready ? '<div class="row"><button class="btn primary" id="issueCert">Issue my certificate</button></div><p class="msg" id="certMsg" role="status"></p>'
        : `<section class="panel"><h3>Sessions not yet marked</h3><ul class="list">${left.map(l => `<li>Session ${l.n} · ${esc(l.title)}</li>`).join('')}</ul><p class="small muted">If you attended a session that isn’t marked, ask your facilitator.</p></section>`}`;
  }
  const url = verifyURL(c.code);
  return `${c.status !== 'valid' ? '<p class="msg bad">This certificate has been revoked by the course team.</p>' : ''}
  <div class="row no-print"><button class="btn primary" data-print>Print or save as PDF</button><button class="btn" id="copyVerify">Copy verification link</button><a class="btn" href="#account">Back</a></div>
  <article class="cert printable" aria-label="Certificate of completion">
    <div class="cert-in"><div class="mark"><i></i>Leadership Lab</div>
      <p class="eyebrow">Certificate of completion</p><p class="cert-pre">This certifies that</p>
      <h1 class="cert-name">${esc(c.name)}</h1>
      <p class="cert-pre">attended ${c.sessions} sessions of</p><h2 class="cert-course">${esc(c.course)}</h2>
      ${c.className ? `<p class="cert-class">${esc(c.className)}</p>` : ''}
      <p class="cert-date">Completed ${longDate(c.completedOn)}</p>
      <div class="cert-foot"><div class="cert-verify">${qrSVG(url, { label: 'QR code to verify this certificate', cls: 'qr cert-qr' })}<div><b>Verify at</b><br><span class="mono">${esc(location.host)}/verify/${esc(c.code)}</span><br><span class="small">Code <b class="mono">${esc(c.code)}</b></span></div></div>
        <div class="cert-sign"><span><i></i>Facilitator</span></div></div></div>
  </article>`;
}
async function bindCertificate() {
  if (!certData) { try { certData = await call('/api/certificate'); } catch (err) { $('#view').innerHTML = `<p class="msg bad">${esc(err.message)}</p>`; return; } if (page === 'certificate') { renderPage(); } return; }
  $('#issueCert') && ($('#issueCert').onclick = async () => {
    try { certData = await call('/api/certificate', {}); renderPage(); toast('Certificate issued'); }
    catch (err) { $('#certMsg').className = 'msg bad'; $('#certMsg').textContent = err.message; }
  });
  $('#copyVerify') && ($('#copyVerify').onclick = async () => { const u = verifyURL(certData.certificate.code); try { await navigator.clipboard.writeText(u); toast('Verification link copied'); } catch { prompt('Verification link:', u); } });
}

// Self-assessment: ten behaviours rated 1-5, once at Session 01 and again at the 30-day check-in. Private to the
// participant; the class report shows averages over at least three people only.
let assessData = null;
const scaleFieldset = (name, legend, labels, value) => `<fieldset class="rating likert"><legend>${legend}</legend>${labels.map((t, j) => `<label><input type="radio" name="${name}" value="${j + 1}" ${value === j + 1 ? 'checked' : ''} required> <b>${j + 1}</b> <span>${esc(t)}</span></label>`).join('')}</fieldset>`;
function assessForm(phase, prev) {
  return `<form id="assessForm" class="list" data-phase="${phase}">${STATEMENTS.map((s, i) => `<div class="likert-row"><p class="likert-q"><b>${i + 1}.</b> ${esc(s.text)}</p>${scaleFieldset('s' + i, `<span class="sr">Statement ${i + 1}: how often?</span>`, SCALE, prev?.[i])}</div>`).join('')}
    <div class="row"><button class="btn primary">Save ${phase === 'baseline' ? 'my answers' : 'my 30-day answers'}</button></div><p class="msg" id="assessMsg" role="status"></p></form>`;
}
function assessHTML() {
  const head = `<div class="page-head"><div class="eyebrow">Self-assessment · private to you</div><h1>How often do you do these?</h1>
    <p>Rate each behaviour as it is today, from 1 (rarely) to 5 (consistently). Be honest: nobody else sees your answers. Your facilitator only ever sees class averages, and only when at least three people have answered.</p></div>`;
  if (!assessData) return head + '<p class="muted">Loading…</p>';
  const { baseline: b, followup: f } = assessData;
  if (!b) return head + `<section class="panel"><h3>Before the course</h3>${assessForm('baseline')}</section>`;
  const due = new Date(Date.parse(b.at) + 30 * 864e5), canFollow = Date.now() >= due.getTime() - 3 * 864e5 || doneCount() >= lessons.length;
  const compare = f ? `<div class="tbl-wrap flat"><table><caption class="sr">Your answers before and after</caption><thead><tr><th scope="col">Behaviour</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>
    ${STATEMENTS.map((s, i) => `<tr><td>${esc(s.text)}</td><td>${b.answers[i]}</td><td>${f.answers[i]} ${f.answers[i] > b.answers[i] ? '<span class="ok-t">▲</span>' : f.answers[i] < b.answers[i] ? '<span class="bad-t">▼</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  return head + `<section class="panel"><h3>Before the course</h3><p>Done on ${longDate(b.at)}.</p>
    ${f ? `<h3>After 30 days</h3><p>Done on ${longDate(f.at)}. Here is how your own ratings moved:</p>${compare}<p class="small muted">You can update your 30-day answers below.</p>${assessForm('followup', f.answers)}`
      : canFollow ? `<h3>After 30 days</h3><p>Rate the same ten behaviours again, as they are now.</p>${assessForm('followup')}`
      : `<p>Come back for the second round from ${longDate(due.toISOString())}, at your 30-day check-in.</p><details><summary>Change my first answers</summary>${assessForm('baseline', b.answers)}</details>`}</section>`;
}
async function bindAssess() {
  if (!assessData) { try { assessData = await call('/api/assessment'); } catch { assessData = { baseline: null, followup: null }; } if (page === 'assess') renderPage(); return; }
  const f = $('#assessForm'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const answers = STATEMENTS.map((_, i) => +(f.querySelector(`[name=s${i}]:checked`)?.value || 0));
    try { const r = await call('/api/assessment', { phase: f.dataset.phase, answers }); Object.assign(assessData, r); delete assessData.ok; renderPage(); toast('Self-assessment saved'); scrollTo(0, 0); }
    catch (err) { $('#assessMsg').className = 'msg bad'; $('#assessMsg').textContent = err.message; }
  };
}

// Anonymous course evaluation at the end of the final session.
let evalDone = null;
function evaluateHTML() {
  const head = `<div class="page-head"><div class="eyebrow">Course evaluation · anonymous</div><h1>How was the course?</h1>
    <p>Your answers are stored without your name or login, and your facilitator sees them only as totals once at least three people have responded.</p></div>`;
  if (evalDone === null) return head + '<p class="muted">Loading…</p>';
  if (evalDone) return head + '<section class="panel"><h3>Thank you</h3><p>Your evaluation has been sent. It can’t be changed or traced back to you.</p></section>';
  return head + `<section class="panel"><form id="evalForm" class="list">
    ${['relevance', 'pace', 'facilitator'].map(k => scaleFieldset(k, EVALUATION[k].q, EVALUATION[k].scale)).join('')}
    <div class="field"><label for="evImprove">${EVALUATION.improve.q}</label><textarea id="evImprove" rows="3" maxlength="1000" placeholder="Optional. Avoid names, so it stays anonymous."></textarea></div>
    <div class="row"><button class="btn primary">Send anonymously</button></div><p class="msg" id="evalMsg" role="status"></p></form></section>`;
}
async function bindEvaluate() {
  if (evalDone === null) { try { evalDone = (await call('/api/evaluation')).submitted; } catch { evalDone = false; } if (page === 'evaluate') renderPage(); return; }
  const f = $('#evalForm'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const v = k => +(f.querySelector(`[name=${k}]:checked`)?.value || 0);
    try { await call('/api/evaluation', { relevance: v('relevance'), pace: v('pace'), facilitator: v('facilitator'), improve: $('#evImprove').value }); evalDone = true; renderPage(); }
    catch (err) { $('#evalMsg').className = 'msg bad'; $('#evalMsg').textContent = err.message; }
  };
}

// My data and privacy: download everything, or delete the account.
function privacyHTML() {
  return `<div class="page-head"><div class="eyebrow">Your account</div><h1>My data and privacy</h1>
    <p>Everything Leadership Lab stores about you belongs to you. Download a copy at any time, or delete your account and all of your records.</p></div>
  <div class="grid2">
    <section class="panel"><h3>What is stored</h3><ul class="list small">
      <li><b>Account:</b> your name, login ID, class and a scrambled (hashed) password.</li>
      <li><b>Private:</b> your session notes, quiz answers, 30-day check-ins and self-assessment answers. Only you can see these.</li>
      <li><b>Seen by your facilitator:</b> attendance, quiz answers and your certificate. Check-ins and self-assessments appear only as class averages of at least three people.</li>
      <li><b>Anonymous:</b> your course evaluation is stored without your name, so it can’t be exported or deleted with your account.</li>
      <li><b>Retention:</b> two years after your class is archived, the class and its participants’ records are deleted automatically.</li></ul></section>
    <section class="panel"><h3>Download my data</h3><p class="small muted">Includes your notes, action plan, attendance, quiz answers, check-ins, self-assessments, live-poll answers and certificates.</p>
      <div class="row"><button class="btn primary" id="expJson">Download (JSON)</button><button class="btn" id="expMd">Download (readable document)</button></div><p class="msg" id="expMsg" role="status"></p></section>
  </div>
  <section class="panel danger-zone"><h3>Delete my account</h3>
    ${me?.locked ? '<p>This is a shared demo account, so it can’t be deleted here.</p>' : `<p>This permanently deletes your account and every record linked to it: notes, quiz answers, attendance, check-ins, self-assessments and certificates (their verification codes stop working). It can’t be undone.</p>
    <form id="delForm" class="list"><div class="form-row"><div class="field"><label for="delPw">Your password</label><input id="delPw" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="delConfirm">Type DELETE to confirm</label><input id="delConfirm" required autocomplete="off" pattern="DELETE"></div></div>
      <div class="row"><button class="btn danger">Delete my account permanently</button></div><p class="msg" id="delMsg" role="status"></p></form>`}</section>`;
}
function exportMarkdown(x) {
  const L = [`# Leadership Lab: my data`, '', `Exported ${new Date(x.exported).toLocaleString()} for ${x.account.name} (${x.account.id})${x.class ? `, ${x.class.name}` : ''}.`, ''];
  L.push('## Sessions', '');
  for (const l of lessons) {
    const s = x.sessions.find(r => r.lesson === l.id), a = x.attendance.find(r => r.lesson === l.id);
    if (!s && !a) continue;
    L.push(`### Session ${l.n}: ${l.title}`, '', a ? `Attended (marked ${longDate(a.markedAt)}).` : 'Attendance not marked.', '');
    if (s?.quizChoice !== undefined && s?.quizChoice !== null) L.push(`Quiz: ${l.scenario}`, `My answer: ${l.choices[s.quizChoice]}${s.quizChoice === l.correct ? ' (the strongest answer)' : ''}`, '');
    if (s?.note) L.push(`Note (${l.prompt}):`, '', s.note, '');
  }
  if (x.checkins.length) { L.push('## 30-day check-ins', ''); for (const c of x.checkins) L.push(`- ${longDate(c.at)}: follow-through ${c.rating}/5${c.helped ? `. Helped: ${c.helped}` : ''}${c.blocked ? `. In the way: ${c.blocked}` : ''}${c.next ? `. Next: ${c.next}` : ''}`); L.push(''); }
  for (const a of x.selfAssessment) { L.push(`## Self-assessment (${a.phase === 'baseline' ? 'before the course' : 'after 30 days'}, ${longDate(a.at)})`, '', ...a.answers.map(r => `- ${r.statement} **${r.rating}/5**`), ''); }
  if (x.certificates.length) { L.push('## Certificates', '', ...x.certificates.map(c => `- ${c.code} (${c.status}), completed ${c.completed_on}`), ''); }
  if (x.liveVotes.length) { L.push('## Live-poll answers', '', ...x.liveVotes.map(v => `- ${v.question}: ${v.answer ?? ''}`), ''); }
  if (x.evaluation) L.push('## Course evaluation', '', x.evaluation, '');
  return L.join('\n');
}
function bindPrivacy() {
  const get = async kind => {
    try { const x = await call('/api/me/export'); kind === 'json' ? download(`leadership-lab-${x.account.id}.json`, JSON.stringify(x, null, 2), 'application/json') : download(`leadership-lab-${x.account.id}.md`, exportMarkdown(x), 'text/markdown'); }
    catch (err) { $('#expMsg').className = 'msg bad'; $('#expMsg').textContent = err.message; }
  };
  $('#expJson').onclick = () => get('json'); $('#expMd').onclick = () => get('md');
  const f = $('#delForm'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    if ($('#delConfirm').value !== 'DELETE') return;
    if (!confirm('Last chance: delete your account and all of your records permanently?')) return;
    try { await call('/api/me/delete', { password: $('#delPw').value }); try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('ll-review'); } catch {} location.href = '/login'; }
    catch (err) { $('#delMsg').className = 'msg bad'; $('#delMsg').textContent = err.message; }
  };
}

// 30-day check-in: private, like notes. The second round of the self-assessment sits underneath.
let checkins = null;
function checkinHTML() {
  const last = checkins?.[checkins.length - 1];
  const current = last?.next || commitment();
  return `<div class="page-head"><div class="eyebrow">30-day check-in · private to you</div><h1>How did it go?</h1>
    <p>Look back at the commitment you made, be honest about how far you got, and set the next one. Your facilitator never sees what you write; at most they see how many people checked in and the class’s average rating.</p></div>
  <div class="grid2">
    <section class="panel"><h3>${last ? 'Your current commitment' : 'The commitment you made'}</h3>
      ${current ? `<p class="commit">${esc(current)}</p><p class="small muted">${last ? 'Set at your check-in on ' + longDate(last.at) : 'From Session 12'}</p>` : `<p class="muted">You have not written a commitment yet. Add one in <a href="#s/commitment/notes">Session 12 · Notes</a>, or set one below.</p>`}
      <form id="ciForm" class="list">
        <fieldset class="rating"><legend>How well did you follow through?</legend>
          ${[[1, 'Not at all'], [2, 'A little'], [3, 'Partly'], [4, 'Mostly'], [5, 'Fully']].map(([v, t]) => `<label><input type="radio" name="rating" value="${v}" required> <b>${v}</b> <span>${t}</span></label>`).join('')}</fieldset>
        <div class="field"><label for="ciHelped">What helped?</label><textarea id="ciHelped" rows="3" maxlength="1500"></textarea></div>
        <div class="field"><label for="ciBlocked">What got in the way?</label><textarea id="ciBlocked" rows="3" maxlength="1500"></textarea></div>
        <div class="field"><label for="ciNext">Your next commitment</label><textarea id="ciNext" rows="3" maxlength="1500" placeholder="One specific, observable action and when you will do it"></textarea></div>
        <div class="row"><button class="btn primary">Save check-in</button></div><p class="msg" id="ciMsg" role="status"></p></form></section>
    <section class="panel"><h3>Self-assessment, 30 days on</h3><p>Rate the same ten behaviours you rated at the start of the course, so you can see what changed.</p><div class="row"><a class="btn" href="#assess">Open the self-assessment</a></div>
      <h3>Earlier check-ins</h3><div id="ciList">${checkins ? ciListHTML() : '<p class="muted">Loading…</p>'}</div></section>
  </div>`;
}
function ciListHTML() {
  if (!checkins.length) return '<p class="muted">None yet. Your first check-in will appear here.</p>';
  return checkins.slice().reverse().map(c => `<div class="ci"><p><b>${longDate(c.at)}</b> · follow-through <b>${c.rating}/5</b></p>
    ${c.helped ? `<p class="small"><b>Helped:</b> ${esc(c.helped)}</p>` : ''}${c.blocked ? `<p class="small"><b>In the way:</b> ${esc(c.blocked)}</p>` : ''}${c.next ? `<p class="small"><b>Next:</b> ${esc(c.next)}</p>` : ''}</div>`).join('');
}
async function bindCheckin() {
  if (!checkins) {
    try { checkins = (await call('/api/checkins')).checkins; } catch { checkins = []; }
    if (page === 'checkin') { const box = $('#ciList'); if (box) box.innerHTML = ciListHTML(); }
    if (page === 'checkin' && checkins.length) { $('#view').innerHTML = checkinHTML(); }
  }
  const f = $('#ciForm'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const msg = $('#ciMsg');
    try {
      const r = await call('/api/checkins', { rating: +f.rating.value, helped: $('#ciHelped').value, blocked: $('#ciBlocked').value, next: $('#ciNext').value });
      checkins = r.checkins; $('#view').innerHTML = checkinHTML(); bindCheckin(); toast('Check-in saved');
    } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  };
}

// Review quiz: a shuffled mix of the session decision questions and the slide quick checks. Scores stay in this
// browser only, so retaking never changes the answers saved from class.
const REVIEW_KEY = 'll-review', REVIEW_N = 10;
let R = null;
function reviewPool() {
  const pool = lessons.map(l => ({ from: `Session ${l.n}`, q: l.scenario, o: l.choices, a: l.correct, why: l.reason }));
  const seen = new Set(pool.map(p => p.q));
  for (const l of lessons) for (const s of decks[l.id] || []) {
    if (s.t === 'check' && Array.isArray(s.o) && Number.isInteger(s.a) && !seen.has(s.q)) { seen.add(s.q); pool.push({ from: `Session ${l.n}`, q: s.q, o: s.o, a: s.a, why: s.why || '' }); }
  }
  return pool;
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function newReview() {
  const qs = shuffle(reviewPool()).slice(0, REVIEW_N).map(p => { const order = shuffle(p.o.map((_, j) => j)); return { ...p, order, pick: null }; });
  R = { qs, i: 0 };
}
const reviewHistory = () => { try { return JSON.parse(localStorage.getItem(REVIEW_KEY)) || []; } catch { return []; } };
function reviewHTML() {
  if (!R) newReview();
  const hist = reviewHistory();
  const head = `<div class="page-head"><div class="eyebrow">Review quiz · practice only</div><h1>Review</h1>
    <p>${REVIEW_N} questions drawn at random from the whole course, with the options shuffled. Retake it as often as you like: these scores stay on this device and never change the answers you gave in class.</p></div>`;
  if (R.i >= R.qs.length) {
    const right = R.qs.filter(q => q.pick === q.a).length;
    return `${head}<section class="panel"><h3>You chose the strongest answer ${right} of ${R.qs.length} times</h3>
      <ol class="list">${R.qs.map(q => `<li><p><b>${esc(q.from)}</b> ${esc(q.q)}</p><p class="small ${q.pick === q.a ? 'ok-t' : 'bad-t'}">${q.pick === q.a ? 'Strongest answer' : `You chose: ${esc(q.o[q.pick])}`}${q.pick === q.a ? '' : ` · Strongest: ${esc(q.o[q.a])}`}</p></li>`).join('')}</ol>
      <div class="row"><button class="btn primary" id="rvAgain">New set of questions</button></div>
      ${hist.length ? `<p class="small muted">Recent scores on this device: ${hist.slice(-8).map(h => `${h.right}/${h.n}`).join(' · ')}</p>` : ''}</section>`;
  }
  const q = R.qs[R.i], answered = q.pick !== null;
  return `${head}<section class="panel review"><p class="small muted">Question ${R.i + 1} of ${R.qs.length} · ${esc(q.from)}</p><h2 class="live-q">${esc(q.q)}</h2>
    <div class="live-opts" role="group" aria-label="Answers">${q.order.map((j, k) => `<button class="live-opt${answered && j === q.a ? ' right' : ''}${answered && j === q.pick && j !== q.a ? ' wrong' : ''}" data-rv="${j}" ${answered ? 'disabled' : ''}><b>${LETTERS[k]}</b> <span>${esc(q.o[j])}</span></button>`).join('')}</div>
    ${answered ? `<div class="why" role="status"><b>${q.pick === q.a ? 'Strongest answer.' : 'Not the strongest answer.'}</b> ${esc(q.why)}</div><div class="row"><button class="btn primary" id="rvNext">${R.i + 1 < R.qs.length ? 'Next question' : 'See results'}</button></div>` : ''}</section>`;
}
function bindReview() {
  $$('[data-rv]').forEach(b => b.onclick = () => { R.qs[R.i].pick = +b.dataset.rv; renderPage(); $('#rvNext')?.focus(); });
  const next = $('#rvNext');
  if (next) next.onclick = () => {
    R.i++;
    if (R.i >= R.qs.length) { const h = reviewHistory(); h.push({ at: new Date().toISOString(), right: R.qs.filter(q => q.pick === q.a).length, n: R.qs.length }); if (!sharedMode()) try { localStorage.setItem(REVIEW_KEY, JSON.stringify(h.slice(-30))); } catch {} }
    renderPage();
  };
  const again = $('#rvAgain'); if (again) again.onclick = () => { newReview(); renderPage(); };
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
  stopPolls();
  box.hidden = true; box.className = 'lesson'; box.innerHTML = ''; document.body.style.overflow = ''; L = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
function closeLesson() { location.hash = lastPage; }

function renderLesson() {
  const l = lessonOf(L.id), box = $('#lesson'), ph = phaseOf(l);
  if (l.mock) L.tab = 'class';
  box.hidden = false; document.body.style.overflow = 'hidden';
  box.className = 'lesson' + (L.mode === 'pres' ? ' pres' : L.mode === 'presenter' ? ' presenter' : '');
  box.innerHTML = `<div class="lesson-head"><div class="hrow"><div><div class="k">${l.mock ? 'For review · not yet in the course' : `Phase ${phaseNo(l)} · ${esc(ph.name)} · Session ${l.n} · ${l.minutes} min`}</div><h2 id="lessonTitle">${esc(l.title)}</h2></div><button class="x" id="closeLesson">Close</button></div>
    <div class="ltabs" role="tablist">${(l.mock ? TABS.filter(t => t[0] === 'class') : TABS).map(([id, label]) => `<button role="tab" aria-selected="${L.tab === id}" class="${L.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div></div>
    <div class="lesson-body">${({ plan: planTab, class: classTab, quiz: quizTab, notes: notesTab })[L.tab](l)}</div>`;
  $('#closeLesson').onclick = closeLesson;
  box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (!l.mock) location.hash = `s/${l.id}/${b.dataset.tab}`; });
  ({ plan: bindPlan, class: bindClass, quiz: bindQuiz, notes: bindNotes })[L.tab](l);
  fitFrames(box);
  if (L.tab === 'class') paintTimers();
  syncPoll(l);
  document.title = `${l.title} · Leadership Lab`;
}

function bindPlan(l) { $$('[data-goslide]').forEach(b => b.onclick = () => { L.slide = +b.dataset.goslide; L.step = ALL; location.hash = `s/${l.id}/class`; }); }

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
// Every slide is laid out on a fixed 1280×720 canvas, then scaled to fit its container and centred (letterboxed),
// the same approach as the Instructor Guide. Text sizes are real pixels on that canvas, so a slide looks the same on
// a laptop, a projector or a printed page. L.mode: 'normal' (Class tab), 'pres' (full screen), 'presenter'.
const CW = 1280, CH = 720;
const MOCK_ID = '_mockup';
const lessonOf = id => lessons.find(x => x.id === id) || (id === MOCK_ID ? { ...lessons.find(x => x.id === 'functional'), id: MOCK_ID, title: 'Slide design mock-ups', mock: true } : null);
const deckOf = l => decks[l.id];
const checksIn = l => deckOf(l).filter(s => s.t === 'check').length;
const scoreOf = (l, picks) => deckOf(l).reduce((n, s, i) => n + (s.t === 'check' && picks[i] === s.a ? 1 : 0), 0);
// How many clicks a slide takes to reveal fully (0 = shows at once). Diagrams and chevrons build part by part.
const stepsOf = s => s.t === 'points' ? s.items.length : s.t === 'scenario' && s.items ? s.items.length : s.t === 'discuss' && s.p ? 1
  : s.t === 'diagram' ? DIAGRAMS[s.d].steps(s) : s.t === 'flow' ? s.items.length : 0;
const ALL = 99;
// Phase accents, brightened for the navy slide background.
const PH_NAVY = { SELF: '#6E9FD8', PEOPLE: '#5FB3A9', PERFORMANCE: '#D49A5C', INTEGRATE: '#A68BD3', APPLY: '#6CBF8C' };
// The same accents, darkened for the light slide theme.
const PH_LIGHT = { SELF: '#2C5A8C', PEOPLE: '#2E7067', PERFORMANCE: '#8A5A2B', INTEGRATE: '#6A4C8C', APPLY: '#2F6B45' };
const celebrate = () => { try { return /[?&]confetti=1/.test(location.search) || localStorage.getItem('ll-confetti') === 'on'; } catch { return false; } };
const thumbLabel = (l, s) => s.t === 'cover' ? 'Title' : s.t === 'check' ? 'Quick check' : s.t === 'section' ? `${s.k}: ${s.h}` : s.h || s.k;
const sessLabel = l => l.mock ? esc(l.title) : `Session ${l.n} · ${esc(l.title)}`;

// Activity and discussion slides carry a countdown. Activities use the planned activity time; discussions use their
// own "min" or the time named in the prompt ("Two minutes in pairs"), otherwise two minutes.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };
// Every activity and discussion slide states its planned minutes (min in decks.js). A class can override them, and
// skip slides, through Customise deck: presenter view uses the overrides of the class being presented to, and
// participants those of their own class.
let presentDeck = {}, presentInfo = null;
const deckOv = l => (P ? P.deck : me?.facilitator ? presentDeck : me?.classDeck)?.[l.id] || null;
const skipped = (l, i) => !!deckOv(l)?.skip?.includes(i);
function timerMinutes(l, s, i, ov = deckOv(l)) {
  const base = (s.t === 'discuss' || (s.t === 'points' && s.k === 'Group practice')) ? s.min || 0 : 0;
  return base ? ov?.timers?.[i] ?? base : 0;
}
async function refreshPresentDeck() {
  if (!me?.facilitator) return;
  try {
    const d = await loadClasses(), c = d.classes.find(x => x.id === pollClass());
    presentDeck = c?.deck || {}; presentInfo = c ? { id: c.id, code: c.code, name: c.name } : null;
  } catch {}
}
// Slides that can run a live poll: quick checks, and discussion prompts that list answer options.
const pollOptions = s => s.t === 'check' ? s.o : s.t === 'discuss' && s.poll ? s.poll : null;
// Open-text polls: discussion slides marked open: true take short typed answers, shown as a word cloud or a list.
const isOpenPoll = s => s.t === 'discuss' && !!s.open && !s.poll;
const hasPoll = s => !!pollOptions(s) || isOpenPoll(s);
const voteURL = () => `${location.origin}/#live`;
// Word cloud: words from the visible answers, weighted by how often they appear; common words and slurs left out.
const STOP = new Set('a an and are as at be been being but by can could did do does doing for from had has have he her him his how i if in into is it its just me more most my no not of on or our out over own she so some such than that the their them then there these they this those to too under up us very was we were what when where which while who whom why will with would you your yours really also get got make made lot things thing people person someone something'.split(' '));
const MASK = /^(fuck|shit|bitch|bastard|asshole|cunt|dick|piss|wank|slut|whore)/i;
function cloudWords(entries, max = 32) {
  const tally = new Map();
  for (const e of entries) for (const w of (e.text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || [])) {
    const k = w.replace(/^['’-]+|['’-]+$/g, '');
    if (k.length < 3 || STOP.has(k) || MASK.test(k)) continue;
    tally.set(k, (tally.get(k) || 0) + e.count);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}
const cleanText = t => t.split(/(\s+)/).map(w => MASK.test(w) ? w[0] + '•'.repeat(Math.max(2, w.length - 1)) : w).join('');
function openBoardHTML(poll) {
  const entries = (poll?.entries || []).filter(e => !e.hidden);
  if (!entries.length) return '<p class="ot-empty">Answers appear here as people send them.</p>';
  if (poll.view === 'list') return `<ul class="ot-list">${entries.slice(0, 12).map(e => `<li class="${e.pinned ? 'pin' : ''}">${e.pinned ? icon('pin', 'ic') : ''}<span>${esc(cleanText(e.text))}</span>${e.count > 1 ? `<em>×${e.count}</em>` : ''}</li>`).join('')}</ul>`;
  const words = cloudWords(entries), top = words[0]?.[1] || 1;
  return `<div class="ot-cloud">${words.map(([w, n], j) => `<span style="--w:${(0.45 + 0.55 * n / top).toFixed(2)}" class="${j % 3 === 1 ? 'alt' : ''}">${esc(w)}</span>`).join('')}</div>`;
}
const pollId = (l, i) => `${l.id}:${i}`;

// Photo frame for a slot that has a real photo.
// Photos come from config/photos.json (built into photos.js). A slot without a photo uses the slide's text layout.
const photoOf = s => { const slot = s.photo && photos.enabled ? photos.slots[s.photo.id] : null; return slot ? { ...s.photo, ...slot } : null; };
function photoFrame(p, variant) {
  if (!p?.src) return '';
  const credit = p.credit ? `<figcaption>${esc(p.credit)}</figcaption>` : '';
  return `<figure class="ph ${variant}"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy">${credit}</figure>`;
}

// One slide. opts: i, picks, step (parts revealed), reveal ('hide' for the audience, 'ghost' for the presenter),
// still (preview or print: no interaction, everything shown), fit ('width', 'box', 'page' or a fixed scale).
function slideHTML(l, { i, picks = {}, step = ALL, reveal = 'hide', still = false, fit = 'width' }) {
  const d = deckOf(l), s = d[i], phase = PH_NAVY[s.ph || l.phase] ? s.ph || l.phase : 'SELF', ph = PH_NAVY[phase], phl = PH_LIGHT[phase];
  const mode = still ? 'still' : reveal;
  const vis = j => j < step ? '' : reveal === 'ghost' ? ' ghost' : ' hid';
  const kick = s.k ? `<div class="kick">${esc(s.k)}</div>` : '';
  const lede = s.p ? `<p class="lede">${esc(s.p)}</p>` : '';
  const marker = j => s.ic?.[j] ? icon(s.ic[j], 'ic n') : `<b class="n">${pad(j + (s.from || 1))}</b>`;
  const bullets = items => `<ul class="bul${s.ic ? ' iconic' : ''}">${items.map((t, j) => `<li class="${vis(j)}">${marker(j)} <span>${esc(t)}</span></li>`).join('')}</ul>`;
  const pic = photoOf(s), full = pic?.variant === 'full';
  let body;
  switch (s.t) {
    case 'cover': {
      const text = `<div class="cv-center"><div class="kick">Phase ${phaseNo(l)} · ${esc(phaseOf(l).name)} · Session ${l.n}</div><h1>${esc(l.title)}</h1><p class="lede">${esc(l.intro.split(/(?<=\.)\s/)[0])}</p><span class="bar"></span></div>`;
      body = pic && !full ? `<div class="split">${text}${photoFrame(pic, 'split')}</div>` : text; break;
    }
    case 'section': {
      const parts = s.parts || d.filter(x => x.t === 'section').map(x => x.h), idx = s.part ? s.part - 1 : Math.max(0, parts.indexOf(s.h));
      body = `<div class="sec-grid"><div class="sec-num">${idx + 1}</div><div class="sec-main"><div class="kick">Part ${idx + 1} of ${parts.length}</div><h2>${esc(s.h)}</h2>${lede}
        <ol class="parts">${parts.map((p, j) => `<li class="${j === idx ? 'on' : j < idx ? 'done' : ''}"><b>${j + 1}</b> <span>${esc(p)}</span></li>`).join('')}</ol></div></div>`; break;
    }
    case 'statement': body = `${kick}<div class="cv-center"><h2 class="big">${esc(s.h)}</h2>${lede}</div>`; break;
    case 'points': body = `${kick}<h2>${esc(s.h)}</h2>${bullets(s.items)}`; break;
    case 'cards': { const n = s.items.length, cols = n <= 3 ? n : n === 4 ? 2 : 3;
      body = `${kick}<h2>${esc(s.h)}</h2><div class="cv-cards${s.ic ? ' iconic' : ''}" style="--cols:${cols}">${s.items.map(([h, p], j) => `<div>${s.ic?.[j] ? icon(s.ic[j], 'ic card-ic') : ''}<b>${esc(h)}</b> <span>${esc(p)}</span></div>`).join('')}</div>`; break; }
    case 'flow': body = applyReveal(`${kick}<h2>${esc(s.h)}</h2>${flowHTML(s)}`, step, mode); break;
    case 'compare': body = `${kick}<h2>${esc(s.h)}</h2><div class="cv-cmp">${[s.a, s.b].map(([h, items], j) => `<div class="${j ? 'yes' : 'no'}"><b>${esc(h)}</b> <ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`; break;
    case 'discuss': {
      const opts = s.poll ? `<div class="pchart" data-pchart>${s.poll.map((o, j) => `<div class="prow"><span class="pl">${esc(o)}</span> <span class="pbar"><i data-vi="${j}"></i></span> <em data-vc="${j}">0</em></div>`).join('')}</div>` : '';
      const board = isOpenPoll(s) ? '<div class="ot" data-ot></div>' : '';
      body = `${kick}<div class="cv-center"><span class="badge">Discuss</span><h2 class="big">${esc(s.h)}</h2>${s.p ? `<p class="lede${vis(0)}">${esc(s.p)}</p>` : ''}${opts}${board}</div>`; break;
    }
    case 'scenario': body = `${kick}<h2>${esc(s.h)}</h2><div class="situ">${esc(s.p)}</div>${s.items ? bullets(s.items) : ''}`; break;
    case 'diagram': body = applyReveal(`${kick}<h2>${esc(s.h)}</h2><div class="dg dg-${s.d}${s.key ? ' with-key' : ''}"><div class="dg-art">${DIAGRAMS[s.d].html(s)}</div>${s.key ? `<ul class="dg-key">${s.key.map(([h, p], j) => `<li data-r="${Math.min(j, DIAGRAMS[s.d].steps(s) - 1)}"><b>${esc(h)}</b> <span>${esc(p)}</span></li>`).join('')}</ul>` : ''}</div>`, step, mode); break;
    case 'check': {
      const pick = picks[i];
      const opts = s.o.map((c, j) => {
        const cls = pick === undefined ? '' : j === s.a ? 'right' : j === pick ? 'wrong' : 'dim';
        return `<button class="opt-b ${cls}" ${still ? 'tabindex="-1"' : `data-qk="${j}"`} ${pick !== undefined || still ? 'disabled' : ''}><i class="vbar" data-vi="${j}"></i><b>${LETTERS[j]}</b> <span>${esc(c)}</span> <em class="vct" data-vc="${j}">0</em></button>`;
      }).join('');
      const fb = pick === undefined ? '' : `<div class="fb ${pick === s.a ? 'ok' : 'no'}" aria-live="polite"><b>${pick === s.a ? 'Strong response' : `The stronger answer is ${LETTERS[s.a]}`}</b> <span>${esc(s.why)}</span></div>`;
      body = `<div class="kick">Quick check</div><h2 class="q">${esc(s.q)}</h2><div class="opts">${opts}</div>${fb}`; break;
    }
    default: body = `<div class="kick">Reflection · ${esc(s.h)}</div><div class="cv-center"><h2 class="big">${esc(s.p)}</h2><p class="lede">Write one specific action: the situation, what you will do and when.</p></div>`;
  }
  const mins = still ? 0 : timerMinutes(l, s, i);
  const timer = mins ? `<div class="tmr" data-tmr data-total="${mins * 60}" role="timer" aria-label="Activity timer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" class="tmr-bg"/><circle cx="60" cy="60" r="50" class="tmr-fg" pathLength="1"/></svg><b class="tmr-t">${pad(mins)}:00</b><small class="tmr-l">timer</small></div>` : '';
  const live = hasPoll(s) && !still ? `<div class="live" data-live>${icon('smartphone', 'ic')} <span>${isOpenPoll(s) ? 'Answer' : 'Vote'} at <b>${esc(location.host)}/#live</b></span> <em data-lcount>0 responses</em></div>
    <div class="live-qr" data-liveqr>${qrSVG(voteURL(), { label: 'QR code to vote at ' + location.host + '/#live' })}<small>Scan to ${isOpenPoll(s) ? 'answer' : 'vote'}</small></div>` : '';
  // Join card: on Session 01's title slide, and on any slide when the presenter presses J, for the class being presented to.
  const cls = P ? P.cls : presentInfo, joinOn = !still && cls && (P ? P.join : L?.join);
  const join = !still && cls && (joinOn || (l.id === 'foundations' && i === 0)) ? `<div class="join-card${joinOn ? ' big' : ''}" data-join>${qrSVG(joinURL(cls.code), { label: `QR code to join ${cls.name}` })}<div><b>Join the class</b><span>Scan, or go to <b>${esc(location.host)}/join</b></span><span>Code <b class="mono">${esc(cls.code)}</b></span></div></div>` : '';
  const bg = full ? photoFrame(pic, 'full') : '';
  return `<div class="frame" data-fit="${fit}"><div class="canvas t-${s.t}${still ? ' still' : ''}${mins ? ' has-tmr' : ''}${bg ? ' has-photo' : ''}" style="--ph-d:${ph};--ph-l:${phl}" ${still ? 'aria-hidden="true"' : 'id="stage"'} data-si="${i}">
    ${bg}<div class="cv-body">${body}</div>${timer}${live}${join}
    <footer class="cv-foot"><span class="mark"><i></i>Leadership Lab</span><span class="sess">${sessLabel(l)}</span>${s.src ? `<span class="src">Source: ${esc(s.src)}</span>` : ''}${pic?.credit ? `<span class="src">Photo: ${esc(pic.credit)}</span>` : ''}<span class="num">${pad(i + 1)} / ${pad(d.length)}</span></footer></div></div>`;
}

// Scale every canvas to its container. Text that still does not fit shrinks a little (to 66% at most).
let printing = false;
function fitFrames(root = document) {
  root.querySelectorAll('.frame').forEach(f => {
    const cv = f.firstElementChild, host = f.parentElement, mode = f.dataset.fit;
    const k = mode === 'box' ? Math.min(host.clientWidth / CW, host.clientHeight / CH)
      : mode === 'width' ? host.clientWidth / CW
      : mode === 'page' ? (printing ? 1 : Math.min(1, (document.documentElement.clientWidth - 48) / CW)) : +mode;
    if (!(k > 0)) return;
    f.style.width = CW * k + 'px'; f.style.height = CH * k + 'px';
    cv.style.transform = `scale(${k})`;
    fitText(cv);
  });
}
function fitText(cv) {
  const body = cv.querySelector('.cv-body'); if (!body) return;
  let s = 1; cv.style.setProperty('--s', 1);
  while (body.scrollHeight > body.clientHeight + 1 && s > 0.66) { s = +(s - 0.04).toFixed(2); cv.style.setProperty('--s', s); }
}
window.addEventListener('resize', () => fitFrames());
document.fonts?.ready.then(() => fitFrames());
window.addEventListener('beforeprint', () => { printing = true; fitFrames(); });
window.addEventListener('afterprint', () => { printing = false; fitFrames(); });

function deckBar(l) {
  const d = deckOf(l), s = d[L.slide], last = L.slide === d.length - 1 && L.step >= stepsOf(s), n = checksIn(l);
  const tools = L.mode === 'pres'
    ? `<button class="btn ${L.notes ? 'on' : ''}" id="notesS">Notes</button><button class="btn" id="exitS">Exit full screen</button>`
    : L.mode === 'presenter' ? '' : '<button class="btn" id="presS">Present</button><button class="btn" id="pvS">Presenter view</button><button class="btn" id="printS">Print or PDF</button>';
  const more = L.step < stepsOf(s);
  const timer = timerMinutes(l, s, L.slide) ? '<span class="tmr-ctl"><button class="btn" id="tmrRun">Start timer</button><button class="btn" id="tmrReset" title="Reset the timer (R)">Reset</button><button class="btn" id="tmrAdd" title="Add a minute (+)">+1 min</button></span>' : '';
  const poll = L.mode === 'pres' ? pollControlsHTML(l, true) : '';
  return `<div class="deck-bar"><button class="btn" id="prevS" ${L.slide === 0 && L.step === 0 ? 'disabled' : ''}>Previous</button><div class="prog" aria-hidden="true"><i style="width:${(L.slide + 1) / d.length * 100}%"></i></div>
    ${n ? `<span class="score" title="Quick checks answered correctly">★ ${scoreOf(l, L.picks)} / ${n}</span>` : ''}${timer}${poll}${tools}
    <button class="btn primary" id="nextS">${more ? 'Reveal next' : last ? (L.mode === 'normal' && !l.mock ? 'To the quiz' : 'Finish') : 'Next'}</button></div>`;
}

function classTab(l) {
  if (L.mode === 'presenter') return presenterHTML(l);
  const d = deckOf(l), s = d[L.slide], pres = L.mode === 'pres', steps = stepsOf(s);
  return `<div class="stage-wrap" id="stageWrap">
    <div class="thumbs" role="group" aria-label="Slides">${d.map((x, i) => `<button class="${i === L.slide ? 'on' : ''}${skipped(l, i) ? ' skip' : ''}" data-slide="${i}" ${i === L.slide ? 'aria-current="true"' : ''}><b>${pad(i + 1)}</b> ${esc(thumbLabel(l, x))}${skipped(l, i) ? ' <small>(skipped for this class)</small>' : ''}</button>`).join('')}</div>
    <div class="stage-host${pres ? ' fill' : ''}">${slideHTML(l, { i: L.slide, picks: L.picks, step: L.step, reveal: pres ? 'hide' : 'ghost', fit: pres ? 'box' : 'width' })}</div>
    ${pres && L.notes ? `<div class="pres-notes"><b>Facilitator note</b> ${esc(s.n)}</div>` : ''}
    ${deckBar(l)}
    ${pres ? '' : `<div class="note-panel"><div class="eyebrow">Facilitator note</div><p>${esc(s.n)}</p>${steps ? `<p class="small muted">This slide reveals its points one at a time: ${Math.min(L.step, steps)} of ${steps} shown. Faded points are still to come.</p>` : ''}</div>
    <p class="small muted hint">← → or click the slide in full screen · F full screen · P presenter view</p>`}</div>`;
}

// ----- presenter view -----
const fmt = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
function elapsed() { return L.clock.run ? L.clock.acc + (Date.now() - L.clock.since) : L.clock.acc; }
function paceText(l) {
  const d = deckOf(l), plannedMs = l.minutes * 60000;
  const expected = plannedMs * L.slide / d.length, diff = elapsed() - expected, mins = Math.round(Math.abs(diff) / 60000);
  return { over: elapsed() > plannedMs, text: mins < 1 ? 'On pace' : diff > 0 ? `${mins} min behind` : `${mins} min ahead` };
}
function presenterHTML(l) {
  const d = deckOf(l), s = d[L.slide], next = d[L.slide + 1], pace = paceText(l), steps = stepsOf(s);
  const opt = s.t === 'check' ? s.o[s.a] : '', stop = /[.!?”"]$/.test(opt) ? '' : '.';
  const answer = s.t === 'check' ? `<div class="note ans"><b>Answer: ${LETTERS[s.a]}</b> ${esc(opt)}${stop} ${esc(s.why)}</div>` : '';
  return `<div class="pv">
    <div class="pv-top"><div class="ttl"><div class="k">Presenter view · ${sessLabel(l)}</div><b>${esc(l.title)}</b></div>
      <div class="pv-clock"><b id="pvClock">${fmt(elapsed())}</b><small>of ${l.minutes}:00</small><button class="btn sm" id="pvRun">${L.clock.run ? 'Pause' : 'Start'}</button><button class="btn sm" id="pvReset">Reset</button></div>
      <button class="btn sm" id="pvConf" aria-pressed="${celebrate()}">Confetti: ${celebrate() ? 'on' : 'off'}</button>
      <span class="pv-link ${L.linked ? 'on' : ''}" id="pvLink">${L.linked ? 'Projector window connected' : 'No projector window'}</span>
      <button class="btn sm primary" id="pvOpen">Open projector window</button><button class="btn sm" id="pvExit">Exit presenter view</button></div>
    <div class="pv-main">
      <div class="pv-cur stage-host fill">${slideHTML(l, { i: L.slide, picks: L.picks, step: L.step, reveal: 'ghost', fit: 'box' })}</div>
      <div class="pv-side">
        <section class="panel"><div class="pv-time ${pace.over ? 'over' : ''}"><span>Slide <b>${L.slide + 1}</b> of ${d.length}${steps ? ` · step ${Math.min(L.step, steps)} of ${steps}` : ''}</span><span id="pvPace">${pace.text}</span></div></section>
        <section class="panel"><h3>Speaker notes</h3><p class="pv-notes">${esc(s.n)}</p>${answer}</section>
        ${pollControlsHTML(l, false)}
        <section class="panel"><h3>Next</h3>${next ? `<div class="pv-next">${slideHTML(l, { i: L.slide + 1, picks: L.picks, still: true, fit: 'width' })}</div>` : '<p class="muted">End of the deck.</p>'}</section>
        <p class="pv-help">← → or Space to move; faded points are still hidden on the projector. Esc leaves presenter view.</p>
      </div>
    </div>
    ${deckBar(l)}
  </div>`;
}

// The projector window and the presenter view talk over a BroadcastChannel (same browser, same site).
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('ll-present') : null;
function broadcast() { if (chan && L && L.mode === 'presenter') chan.postMessage({ type: 'state', id: L.id, slide: L.slide, step: L.step, picks: L.picks, deck: presentDeck, cls: presentInfo, join: !!L.join }); }
let tick = null;
function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!L || L.mode !== 'presenter') { clearInterval(tick); return; }
    const c = $('#pvClock'); if (c) c.textContent = fmt(elapsed());
    const p = $('#pvPace'), pace = paceText(lessonOf(L.id));
    if (p) { p.textContent = pace.text; p.parentElement.classList.toggle('over', pace.over); }
  }, 1000);
}

// Moving forward reveals the next point first; moving back hides it again.
function stepForward(l) {
  const d = deckOf(l);
  if (L.step < stepsOf(d[L.slide])) { L.step++; return true; }
  let n = L.slide + 1;
  while (n < d.length && skipped(l, n)) n++;
  if (n < d.length) { L.slide = n; L.step = 0; }
  else return false;
  return true;
}
function stepBack(l) {
  const d = deckOf(l);
  if (L.step > 0 && L.step <= stepsOf(d[L.slide])) { L.step--; return true; }
  let n = L.slide - 1;
  while (n > 0 && skipped(l, n)) n--;
  if (n >= 0 && n < L.slide) { L.slide = n; L.step = stepsOf(d[L.slide]); }
  else return false;
  return true;
}
function bindClass(l) {
  const d = deckOf(l);
  const show = () => { renderLesson(); broadcast(); };
  $$('[data-slide]').forEach(b => b.onclick = () => { L.slide = +b.dataset.slide; L.step = ALL; show(); });
  $('#prevS').onclick = () => { if (stepBack(l)) show(); };
  $('#nextS').onclick = () => {
    if (stepForward(l)) return show();
    if (L.mode === 'pres') return exitPres();
    if (L.mode === 'presenter') return exitPresenter();
    if (!l.mock) location.hash = `s/${l.id}/quiz`;
  };
  $('#presS') && ($('#presS').onclick = () => { L.mode = 'pres'; renderLesson(); enterFullscreen(); });
  $('#pvS') && ($('#pvS').onclick = () => enterPresenter());
  $('#printS') && ($('#printS').onclick = () => window.open(`${location.origin}/#print/${l.id}/slides`, '_blank'));
  $('#exitS') && ($('#exitS').onclick = exitPres);
  $('#notesS') && ($('#notesS').onclick = () => { L.notes = !L.notes; renderLesson(); });
  if (L.mode === 'pres') $('#stage').onclick = e => { if (!e.target.closest('button')) $('#nextS').click(); };
  $$('[data-qk]').forEach(b => b.onclick = e => { e.stopPropagation(); pickAnswer(l, L.slide, +b.dataset.qk); });
  $('#tmrRun') && ($('#tmrRun').onclick = e => { e.stopPropagation(); timerAction(l, 'toggle'); });
  $('#tmrReset') && ($('#tmrReset').onclick = () => timerAction(l, 'reset'));
  $('#tmrAdd') && ($('#tmrAdd').onclick = () => timerAction(l, 'add'));
  bindPollControls();
  if (L.mode === 'presenter') {
    $('#pvRun').onclick = () => { if (L.clock.run) { L.clock.acc = elapsed(); L.clock.run = false; } else { L.clock.since = Date.now(); L.clock.run = true; } renderLesson(); };
    $('#pvReset').onclick = () => { L.clock = { acc: 0, since: Date.now(), run: L.clock.run }; renderLesson(); };
    $('#pvConf').onclick = () => { try { localStorage.setItem('ll-confetti', celebrate() ? 'off' : 'on'); } catch {} renderLesson(); };
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
// Correct answers always get a quiet highlight; confetti only when switched on (presenter view, Account, or ?confetti=1).
function confetti(el) {
  if (!el || !celebrate() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const colours = ['#E0AE4C', '#57C990', '#3BA3B0', '#F28C82', '#EEF2F8'];
  box.innerHTML = Array.from({ length: 60 }, () => `<i style="--x:${Math.random() * 100}%;--c:${colours[Math.floor(Math.random() * colours.length)]};--d:${1.2 + Math.random() * 1.4}s;--w:${Math.random() * .3}s;--dx:${(Math.random() - .5) * 200}px;--r:${(Math.random() - .5) * 720}deg"></i>`).join('');
  el.append(box); setTimeout(() => box.remove(), 3200);
}
function enterFullscreen(el = document.documentElement) { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
function exitPres() { if (!L) return; L.mode = 'normal'; L.notes = false; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); renderLesson(); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && L?.mode === 'pres') { L.mode = 'normal'; L.notes = false; renderLesson(); } });

// ----- activity timers -----
// One countdown per slide (L.timers[slide] = { total, left, endsAt }), painted four times a second. The projector
// receives the same state, so both screens count down together.
const fmtS = ms => { const t = Math.ceil(Math.max(0, ms) / 1000); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const timeLeft = t => t.endsAt ? Math.max(0, t.endsAt - Date.now()) : t.left;
function slideTimer(l, i = L.slide) {
  const mins = timerMinutes(l, deckOf(l)[i], i); if (!mins) return null;
  L.timers ||= {};
  return L.timers[i] ||= { total: mins * 60000, left: mins * 60000, endsAt: null };
}
function timerAction(l, action) {
  const t = slideTimer(l); if (!t) return;
  if (action === 'toggle') {
    if (t.endsAt) { t.left = timeLeft(t); t.endsAt = null; }
    else { if (t.left <= 0) t.left = t.total; t.endsAt = Date.now() + t.left; }
  } else if (action === 'reset') { t.left = t.total; t.endsAt = null; }
  else if (action === 'add') { t.total += 60000; if (t.endsAt) t.endsAt += 60000; else t.left += 60000; }
  paintTimers(); broadcastTimers();
}
function paintTimers() {
  const timers = P ? P.timers : L?.timers;
  $$('[data-tmr]').forEach(el => {
    const si = +el.closest('.canvas').dataset.si, t = timers?.[si], total = t ? t.total : +el.dataset.total * 1000;
    let left = t ? timeLeft(t) : total;
    if (t && t.endsAt && left === 0 && !P) { t.left = 0; t.endsAt = null; broadcastTimers(); }
    el.querySelector('.tmr-t').textContent = fmtS(left);
    el.querySelector('.tmr-fg').style.strokeDashoffset = (1 - left / total).toFixed(4);
    el.classList.toggle('run', !!t?.endsAt);
    el.classList.toggle('low', !!t?.endsAt && left <= 60000);
    el.classList.toggle('done', !!t && left === 0);
    el.querySelector('.tmr-l').textContent = !t || (!t.endsAt && left === total) ? 'timer' : left === 0 ? 'time' : t.endsAt ? 'left' : 'paused';
  });
  const run = $('#tmrRun'), t = L && !P ? L.timers?.[L.slide] : null;
  if (run) run.textContent = t?.endsAt ? 'Pause timer' : t && timeLeft(t) === 0 ? 'Restart timer' : t && t.left < t.total ? 'Resume timer' : 'Start timer';
}
setInterval(paintTimers, 250);
function broadcastTimers() { if (chan && L && L.mode === 'presenter') chan.postMessage({ type: 'timers', id: L.id, timers: L.timers || {} }); }

// ----- live polls, facilitator side -----
// In presenter view or full screen, a facilitator's quick-check and opening-question slides open a live poll for
// signed-in participants; moving to another slide closes it. Results are fetched every 1.5 seconds.
let pollLoop = null, pollBusy = false;
const canPoll = () => !!(me?.facilitator && L && (L.mode === 'presenter' || L.mode === 'pres'));
// Facilitators choose which class they are presenting to; each class has its own poll room.
const pollClass = () => { try { return localStorage.getItem('ll-present-class') || ''; } catch { return ''; } };
async function pollControl(action, poll, extra = {}) {
  try { return await call('/api/poll/control', { action, poll, classId: pollClass() || 'unassigned', ...extra }); }
  catch (e) { toast(e.message); return null; }
}
function syncPoll(l) {
  if (!canPoll()) { stopPolls(); return; }
  const s = deckOf(l)[L.slide], o = pollOptions(s), open = isOpenPoll(s), id = pollId(l, L.slide);
  if (o || open) {
    if (L.pollOpen !== id) {
      L.pollOpen = id; L.poll = { id, kind: open ? 'open' : 'choice', counts: (o || []).map(() => 0), entries: [], total: 0, locked: false, show: false, view: 'cloud', open: true };
      pollControl('open', open ? { id, q: s.pq || s.h, kind: 'open' } : { id, q: s.pq || s.q || s.h, o }).then(() => refreshPoll());
    }
    startPollLoop();
  } else if (L.pollOpen) { stopPolls(); }
  applyPoll(document, L.poll); updatePollControls(); broadcastPoll();
}
async function refreshPoll() {
  if (!L?.pollOpen || pollBusy) return;
  pollBusy = true;
  try {
    const r = await call('/api/poll/results?id=' + encodeURIComponent(L.pollOpen) + '&class=' + encodeURIComponent(pollClass() || 'unassigned'));
    if (L?.pollOpen === r.id) { L.poll = r; applyPoll(document, r); updatePollControls(); broadcastPoll(); }
  } catch {}
  pollBusy = false;
}
function startPollLoop() { if (!pollLoop) pollLoop = setInterval(refreshPoll, 1500); }
function stopPolls() {
  clearInterval(pollLoop); pollLoop = null;
  if (L?.pollOpen) { pollControl('close'); L.pollOpen = null; L.poll = null; broadcastPoll(); }
}
async function pollAction(action, extra) {
  if (!L?.pollOpen) return;
  await pollControl(action, { id: L.pollOpen }, extra);
  await refreshPoll();
}
function broadcastPoll() { if (chan && L && L.mode === 'presenter') chan.postMessage({ type: 'poll', id: L.id, poll: L.poll || null }); }
// Show the poll on the canvas: live badge, response count, and bars when results are shown.
function applyPoll(root, poll) {
  const deckId = P ? P.id : L?.id;
  root.querySelectorAll('.canvas:not(.still)').forEach(cv => {
    if (!cv.querySelector('[data-live]')) return;
    const on = !!poll && poll.id === `${deckId}:${cv.dataset.si}`;
    const wasShown = cv.dataset.show === '1';
    cv.dataset.live = on ? '1' : ''; cv.dataset.show = on && poll.show ? '1' : '';
    if (wasShown !== (cv.dataset.show === '1')) fitText(cv);
    if (!on) return;
    const total = poll.total || 0, max = Math.max(1, total);
    cv.querySelectorAll('[data-vi]').forEach(b => { b.style.width = `${((poll.counts?.[+b.dataset.vi] || 0) / max * 100).toFixed(1)}%`; });
    cv.querySelectorAll('[data-vc]').forEach(e => { e.textContent = poll.counts?.[+e.dataset.vc] || 0; });
    const ot = cv.querySelector('[data-ot]');
    if (ot && poll.show) { const h = openBoardHTML(poll); if (ot.dataset.h !== h) { ot.innerHTML = h; ot.dataset.h = h; } }
    cv.querySelector('[data-lcount]').textContent = `${total} response${total === 1 ? '' : 's'}${poll.locked ? ' · voting closed' : ''}`;
  });
}
function updatePollControls() {
  const p = L?.poll;
  const lock = $('#pollLock'), show = $('#pollShow'), count = $('#pollCount');
  if (lock) lock.textContent = p?.locked ? 'Unlock voting' : 'Lock voting';
  if (show) show.textContent = p?.show ? 'Hide results' : 'Show results';
  if (count) count.textContent = p ? `${p.total || 0} response${p.total === 1 ? '' : 's'}${p.locked ? ' · voting locked' : ''}` : 'Opening…';
  const view = $('#pollView'); if (view) view.textContent = p?.view === 'list' ? 'Show as word cloud' : 'Show as list';
  const mod = $('#pollMod');
  if (mod) {
    const h = p?.entries?.length ? `<p class="small"><b>Answers</b> (hidden ones never reach the projector or phones)</p><ul class="list small">${p.entries.map(e => `<li class="${e.hidden ? 'hid-e' : ''}">${e.pinned ? '📌 ' : ''}${esc(e.text)}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}
      <span class="mod-b"><button class="link" data-mod="${e.hidden ? 'show-entry' : 'hide-entry'}" data-key="${esc(e.key)}">${e.hidden ? 'Show' : 'Hide'}</button> · <button class="link" data-mod="${e.pinned ? 'unpin' : 'pin'}" data-key="${esc(e.key)}">${e.pinned ? 'Unpin' : 'Pin'}</button></span></li>`).join('')}</ul>` : '<p class="small muted">No answers yet.</p>';
    if (mod.dataset.h !== h) { mod.innerHTML = h; mod.dataset.h = h; }
  }
}
function pollControlsHTML(l, compact) {
  const s = deckOf(l)[L.slide];
  if (!me?.facilitator || !hasPoll(s)) return '';
  const btns = `<button class="btn sm" id="pollShow">Show results</button><button class="btn sm" id="pollLock">Lock voting</button>${compact ? '' : '<button class="btn sm danger" id="pollReset">Reset votes</button>'}`;
  const open = isOpenPoll(s);
  return compact ? btns : `<section class="panel"><h3>Live poll${open ? ' · open text' : ''}</h3><p class="small"><b id="pollCount">Opening…</b></p><p class="small muted">Participants ${open ? 'type a short answer' : 'vote'} at <b>${esc(location.host)}/#live</b> (or scan the code on the slide) while this slide is showing.</p>
    <div class="field"><label for="pollClassSel" class="small">Presenting to</label><select id="pollClassSel"><option value="">Participants with no class</option></select></div><div class="row">${btns}${open ? '<button class="btn sm" id="pollView">Show as list</button>' : ''}</div>
    <p class="small muted">Press <kbd>J</kbd> to put the class join code on the projector.</p>
    ${open ? '<div class="ot-mod" id="pollMod" aria-live="polite"></div>' : ''}</section>`;
}
function bindPollControls() {
  $('#pollShow') && ($('#pollShow').onclick = () => pollAction(L.poll?.show ? 'hide' : 'show'));
  $('#pollLock') && ($('#pollLock').onclick = () => pollAction(L.poll?.locked ? 'unlock' : 'lock'));
  $('#pollReset') && ($('#pollReset').onclick = () => { if (confirm('Clear every vote on this question?')) pollAction('reset'); });
  $('#pollView') && ($('#pollView').onclick = () => pollAction('view', { view: L.poll?.view === 'list' ? 'cloud' : 'list' }));
  $('#pollMod') && ($('#pollMod').onclick = e => { const b = e.target.closest('[data-mod]'); if (b) pollAction(b.dataset.mod, { entry: b.dataset.key }); });
  const sel = $('#pollClassSel');
  if (sel) loadClasses().then(d => {
    const cur = pollClass();
    sel.innerHTML = `<option value="">Participants with no class</option>` + d.classes.filter(c => c.status === 'active' || c.id === cur).map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    sel.onchange = () => {
      // Close the poll in the old class's room, then reopen this slide's poll in the new one.
      const was = L?.pollOpen; if (was) pollControl('close');
      try { localStorage.setItem('ll-present-class', sel.value); } catch {}
      if (was && L) L.pollOpen = null;
      refreshPresentDeck().then(() => { if (L) { renderLesson(); broadcast(); } });
      toast('Presenting to ' + (sel.selectedOptions[0]?.textContent || 'this class') + ': its polls, skipped slides and timers apply');
    };
  }).catch(() => {});
}

// ----- projector window: only the slide, letterboxed, following the presenter view -----
let P = null; // { id, slide, step, picks }
function renderProjector() {
  const l = lessonOf(P.id);
  document.body.className = 'projector';
  document.body.innerHTML = `<div class="proj stage-host fill">${slideHTML(l, { i: P.slide, picks: P.picks, step: P.step, reveal: 'hide', fit: 'box' })}</div>${P.hint ? '<div class="proj-hint" id="projHint">Click anywhere for full screen · ← → move slides</div>' : ''}`;
  document.title = `${l.title} · Projector`;
  fitFrames(); paintTimers(); applyPoll(document, P.poll);
  $$('[data-qk]').forEach(b => b.onclick = e => { e.stopPropagation(); chan?.postMessage({ type: 'pick', id: P.id, slide: P.slide, choice: +b.dataset.qk }); });
}
function startProjector(id) {
  P = { id, slide: 0, step: 0, picks: {}, hint: true, deck: {}, cls: null };
  renderProjector();
  document.addEventListener('click', () => { enterFullscreen(); P.hint = false; $('#projHint')?.remove(); });
  document.addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); chan?.postMessage({ type: 'nav', id: P.id, dir: 1 }); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); chan?.postMessage({ type: 'nav', id: P.id, dir: -1 }); }
  });
  if (!chan) { document.body.innerHTML = '<p style="color:#fff;padding:24px">This browser cannot link a projector window. Use Present (full screen) instead.</p>'; return; }
  chan.onmessage = ({ data }) => {
    if (data.type === 'state' && data.id === P.id) {
      const before = P.picks[data.slide], after = data.picks[data.slide];
      Object.assign(P, { slide: data.slide, step: data.step, picks: data.picks, deck: data.deck || {}, cls: data.cls || null, join: !!data.join }); renderProjector();
      if (before === undefined && after !== undefined && after === decks[P.id][P.slide].a) confetti($('#stage'));
    }
    if (data.type === 'timers' && data.id === P.id) { P.timers = data.timers; paintTimers(); }
    if (data.type === 'poll' && data.id === P.id) { P.poll = data.poll; applyPoll(document, P.poll); }
  };
  chan.postMessage({ type: 'hello', id });
  setInterval(() => chan.postMessage({ type: 'hello', id }), 4000);
}
// Presenter side: answer the projector.
let lastHello = 0;
if (chan) chan.addEventListener('message', ({ data }) => {
  if (P || !L || L.mode !== 'presenter' || data.id !== L.id) return;
  const l = lessonOf(L.id);
  if (data.type === 'hello') { lastHello = Date.now(); if (!L.linked) { L.linked = true; renderLesson(); } broadcast(); broadcastTimers(); broadcastPoll(); }
  if (data.type === 'nav') { if (data.dir > 0 ? stepForward(l) : stepBack(l)) { renderLesson(); broadcast(); } }
  if (data.type === 'pick' && data.slide === L.slide) pickAnswer(l, data.slide, data.choice);
});
setInterval(() => { if (L?.linked && Date.now() - lastHello > 10000) { L.linked = false; if (L.mode === 'presenter') renderLesson(); } }, 3000);

// ----- print and PDF: slides (one 16:9 page each) or handouts (thumbnail with notes, or with space to write) -----
function startPrint(id, mode) {
  const l = lessonOf(id), d = deckOf(l);
  if (!['slides', 'facilitator', 'participant'].includes(mode)) mode = 'slides';
  const thumb = i => slideHTML(l, { i, step: ALL, still: true, fit: '0.3' });
  const handout = d.map((s, i) => {
    const opt = s.t === 'check' ? s.o[s.a] : '';
    const right = mode === 'facilitator'
      ? `<p>${esc(s.n)}</p>${s.t === 'check' ? `<p><b>Answer: ${LETTERS[s.a]}</b> ${esc(opt)} ${esc(s.why)}</p>` : ''}`
      : '<div class="lines"><i></i><i></i><i></i><i></i></div>';
    return `<article class="ho"><div class="ho-thumb">${thumb(i)}</div><div class="ho-text"><div class="eyebrow">Slide ${i + 1} of ${d.length}</div><h3>${esc(thumbLabel(l, s))}</h3>${right}</div></article>`;
  }).join('');
  document.body.className = 'printing';
  document.body.innerHTML = `<div class="pr-bar no-print"><div><div class="eyebrow">Print or save as PDF</div><b>${sessLabel(l)}</b></div>
      <div class="row">${[['slides', 'Slides'], ['facilitator', 'Facilitator handout'], ['participant', 'Participant handout']].map(([m, t]) => `<a class="btn ${m === mode ? 'on' : ''}" href="#print/${id}/${m}">${t}</a>`).join('')}
      <button class="btn primary" data-print>Print or save as PDF</button></div></div>
    <style>@page { ${mode === 'slides' ? 'size: 1280px 720px; margin: 0' : 'size: A4 portrait; margin: 14mm'} }</style>
    <main class="pr pr-${mode}">${mode === 'slides' ? d.map((s, i) => `<section class="pp">${slideHTML(l, { i, step: ALL, still: true, fit: 'page' })}</section>`).join('')
      : `<header class="ho-head"><div class="eyebrow">${mode === 'facilitator' ? 'Facilitator handout' : 'Participant handout'}</div><h1>${esc(l.title)}</h1><p>${esc(l.intro)}</p></header>${handout}`}</main>`;
  document.title = `${l.title} · ${mode === 'slides' ? 'Slides' : 'Handout'}`;
  fitFrames();
}

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
// Attendance ("done") is marked by the facilitator; participants see it here but can't set it.
function notesTab(l) {
  const s = saved[l.id] || {};
  const status = s.done ? `<p class="chip ok">✓ Attendance marked by your facilitator${s.doneAt ? ` on ${fmtDate(s.doneAt)}` : ''}</p>`
    : `<p class="small muted">${me?.classId ? 'Your facilitator marks attendance for each session. It counts towards your certificate.' : 'Attendance is marked by a facilitator for people in a class.'}</p>`;
  const extra = l.id === 'foundations' && me && !me.facilitator ? `<section class="sec"><div class="eyebrow">Before you start</div><h3>Two-minute self-assessment</h3><p>Rate ten everyday leadership behaviours now; you rate them again at your 30-day check-in to see what changed. Your answers are private.</p><div class="row"><a class="btn primary" href="#assess">Open the self-assessment</a></div></section>`
    : l.id === 'commitment' && me && !me.facilitator ? `<section class="sec"><div class="eyebrow">Before you go</div><h3>Anonymous course evaluation</h3><p>Four quick questions. Your answers are not linked to your name.</p><div class="row"><a class="btn primary" href="#evaluate">Give feedback</a></div></section>` : '';
  return `<section class="sec"><div class="eyebrow">Make it yours</div><h3>${esc(l.prompt)}</h3>
    <div class="field"><label for="note">Private reflection</label><textarea id="note" maxlength="4000" placeholder="Write a concrete action or observation…">${esc(s.note)}</textarea></div>
    <p class="small muted" data-sync>${s.note ? 'Saved to your account' : 'Saves automatically to your account. Your facilitator never sees what you write.'}</p>
    ${status}</section>${extra}
  ${pager(l)}`;
}
function bindNotes(l) {
  $('#note').oninput = e => { update(l.id, { note: e.target.value || undefined }); queueSave(l.id, 900); };
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
  else if (e.key === 't' || e.key === 'T') timerAction(lessonOf(L.id), 'toggle');
  else if (e.key === 'r' || e.key === 'R') timerAction(lessonOf(L.id), 'reset');
  else if (e.key === '+' || e.key === '=') timerAction(lessonOf(L.id), 'add');
  else if ((e.key === 'v' || e.key === 'V') && L.poll) pollAction(L.poll.show ? 'hide' : 'show');
  else if ((e.key === 'l' || e.key === 'L') && L.poll) pollAction(L.poll.locked ? 'unlock' : 'lock');
  else if ((e.key === 'j' || e.key === 'J') && me?.facilitator) {
    if (!presentInfo) { toast('Choose the class you are presenting to (presenter view, Live poll panel) to show its join code.'); return; }
    L.join = !L.join; renderLesson(); broadcast();
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', () => { if (pending.size) flush(); });

// ---------- start ----------
async function start() {
  // /checkin is the short address printed on the action plan.
  if (location.pathname === '/checkin') history.replaceState(null, '', '/#checkin');
  const pm = location.hash.match(/^#proj\/([a-z_]+)/);
  if (pm && decks[pm[1]]) { startProjector(pm[1]); return; }
  route();
  try {
    const [user, data] = await Promise.all([call('/api/me'), call('/api/progress')]);
    me = user; saved = { ...data.progress };
    if (me.shared) { try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('ll-review'); } catch {} } else cache();
    await refreshPresentDeck();
    if (L) { shell(); renderLesson(); } else route();
  } catch (e) {
    if (e.message !== 'Signed out') setStatus('Offline: changes will sync later');
  }
}
start();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
