import { lessons, totalMinutes } from './lessons.js';

const CACHE_KEY = 'leadership-lab-v2';
const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let me = null;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { saved = {}; }
let current = 'overview', slideIndex = 0, slides = [];

// ---------- server ----------
async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

function cache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch {} }

let syncTimer = null, pending = new Set();
function setStatus(text) { const el = $('#syncStatus'); if (el) el.textContent = text; }
function queueSave(id, wait = 600) {
  cache();
  pending.add(id);
  setStatus('Saving…');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flush, wait);
}
async function flush() {
  const ids = [...pending]; pending.clear();
  try {
    for (const id of ids) await call('/api/progress', { lesson: id, entry: saved[id] || {} });
    setStatus('Saved to your account');
  } catch (e) {
    ids.forEach(id => pending.add(id));
    setStatus('Not saved yet — will retry');
    clearTimeout(syncTimer); syncTimer = setTimeout(flush, 5000);
  }
}
function update(id, patch) {
  saved[id] = { ...(saved[id] || {}), ...patch };
  Object.keys(saved[id]).forEach(k => saved[id][k] === undefined && delete saved[id][k]);
}

// ---------- shell ----------
const doneCount = () => lessons.filter(x => saved[x.id]?.done).length;

function nav() {
  const completed = doneCount();
  $('#navigation').innerHTML =
    `<button class="nav ${current === 'overview' ? 'active' : ''}" data-page="overview"><span class="num">⌂</span>Overview</button>
     <div class="side-label">Sessions</div>` +
    lessons.map(x => `<button class="nav ${current === x.id ? 'active' : ''}" data-page="${x.id}"><span class="num">${x.n}</span>${esc(x.title)}${saved[x.id]?.done ? '<span class="tick" aria-label="complete">✓</span>' : ''}</button>`).join('') +
    `<div class="side-label">Progress</div>
     <div class="side-progress"><div class="progress-track"><div class="progress-fill" style="width:${completed / lessons.length * 100}%"></div></div>
     <div class="mini on-dark">${completed} of ${lessons.length} complete</div></div>
     <div class="side-label">You</div>
     <button class="nav ${current === 'account' ? 'active' : ''}" data-page="account"><span class="num">◎</span>Your account</button>
     ${me?.admin ? `<button class="nav ${current === 'team' ? 'active' : ''}" data-page="team"><span class="num">☰</span>Participants</button>` : ''}`;
  document.querySelectorAll('#navigation [data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
}

function go(page) { if (location.hash.slice(1) === page) render(); else location.hash = page; }

function render() {
  const page = location.hash.slice(1) || 'overview';
  const lesson = lessons.find(l => l.id === page);
  current = lesson || ['account', 'team'].includes(page) ? page : 'overview';
  if (current === 'team' && !me?.admin) current = 'overview';
  $('#sidebar').classList.remove('open');
  nav();
  const c = $('#content');
  if (lesson) { c.innerHTML = lessonHTML(lesson); bindLesson(lesson); }
  else if (current === 'account') { c.innerHTML = accountHTML(); bindAccount(); }
  else if (current === 'team') { c.innerHTML = '<div class="eyebrow">Facilitator</div><h1>Participants</h1><p class="lede">Loading…</p>'; loadTeam(); }
  else { c.innerHTML = overviewHTML(); bindOverview(); }
  document.title = (lesson ? lesson.title + ' · ' : current === 'account' ? 'Your account · ' : current === 'team' ? 'Participants · ' : '') + 'Leadership Lab';
  scrollTo(0, 0);
  $('#content').focus({ preventScroll: true });
}

// ---------- overview ----------
function overviewHTML() {
  const done = doneCount();
  const next = lessons.find(x => !saved[x.id]?.done);
  const hours = Math.floor(totalMinutes / 60), mins = totalMinutes % 60;
  return `<div class="eyebrow">Interactive training guide</div>
  <div class="hero"><div>
    <h1>Lead with clarity.<br>Build trust.<br>Deliver together.</h1>
    <p class="lede">${me ? `Welcome, ${esc(me.name.split(' ')[0])}. ` : ''}A practical one-day leadership course. Work through nine sessions, practise decisions, and leave with one action you can use at work.</p>
    <div class="actions">
      <button class="btn gold" data-open="${next?.id || 'commitment'}">${done === lessons.length ? 'Review your commitment' : done ? 'Continue: ' + esc(next.title) : 'Start the course'}</button>
      <button class="btn secondary" id="presentIntro">Present overview</button>
    </div></div>
    <div class="art" aria-label="Self, People, Performance leadership framework"><div class="art-title">Leadership framework</div><div class="circle">LEAD<br>WITH<br>PURPOSE</div><div class="three"><span>Self</span><span>People</span><span>Performance</span></div></div>
  </div>
  <div class="stats"><span class="pill"><strong>9</strong> guided sessions</span><span class="pill"><strong>${hours} h ${mins} min</strong> of learning</span><span class="pill"><strong>09:00–16:00</strong> with breaks</span><span class="pill"><strong>${done}/9</strong> completed</span></div>
  <section class="section"><h2>The learning path</h2><div class="grid">${lessons.map(x => `<button class="card lesson-card ${saved[x.id]?.done ? 'is-done' : ''}" data-open="${x.id}"><small>${x.phase} · ${x.minutes} min${saved[x.id]?.done ? ' · ✓ done' : ''}</small><h3>${x.n} &nbsp; ${esc(x.title)}</h3><p>${esc(x.intro)}</p></button>`).join('')}</div></section>
  <section class="section"><div class="panel accent"><h2>How to use this guide</h2><div class="steps">
    <div class="step"><b>01 · Learn</b>Read the key idea and the three-step model.</div>
    <div class="step"><b>02 · Practise</b>Run the activity, choose a response, and discuss why.</div>
    <div class="step"><b>03 · Apply</b>Write a private note and mark the session complete.</div>
  </div><p class="mini" style="margin-top:16px">Your answers, notes and progress are saved to your account, so you can pick up on another device.</p></div></section>`;
}
function bindOverview() {
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => go(b.dataset.open));
  $('#presentIntro').onclick = () => startSlides(overviewSlides());
}
function overviewSlides() {
  return [
    { k: 'LEADERSHIP LAB', t: 'Lead with clarity. Build trust. Deliver together.', d: 'A practical one-day course in nine sessions.' },
    { k: 'THE FRAMEWORK', t: 'Self  →  People  →  Performance', d: 'Start with how you show up, then how you work with people, then how the team delivers.' },
    ...['SELF', 'PEOPLE', 'PERFORMANCE'].map(p => ({ k: p, t: p[0] + p.slice(1).toLowerCase(), d: lessons.filter(l => l.phase === p).map(l => `${l.n} ${l.title} (${l.minutes} min)`).join('  •  ') })),
    { k: 'BRINGING IT TOGETHER', t: 'Pressure Cooker and personal commitment', d: lessons.filter(l => ['INTEGRATE', 'APPLY'].includes(l.phase)).map(l => `${l.n} ${l.title} (${l.minutes} min)`).join('  •  ') },
    { k: 'HOW EACH SESSION WORKS', t: 'Learn  →  Practise  →  Apply', d: 'A key idea and model, a group activity and a decision scenario, then one personal action.' },
  ];
}

// ---------- lesson ----------
function lessonHTML(x) {
  const s = saved[x.id] || {};
  const idx = lessons.indexOf(x);
  return `<div class="eyebrow">${x.phase} / SESSION ${x.n}</div><h1>${esc(x.title)}</h1><p class="lede">${esc(x.intro)}</p>
  <div class="stats"><span class="pill">${x.minutes} min</span><span class="pill">Activity: <strong>${esc(x.activity)}</strong></span><span class="pill">${s.done ? '✓ Complete' : 'In progress'}</span></div>
  <div class="actions no-print"><button class="btn" id="presentBtn">Presentation view</button><button class="btn secondary" id="printBtn">Print this session</button></div>
  <section class="section"><h2>What you will be able to do</h2><div class="panel"><ul>${x.outcomes.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div></section>
  <section class="section"><h2>The simple model</h2><div class="steps">${x.model.map((t, i) => `<div class="step"><b>${String(i + 1).padStart(2, '0')}</b>${esc(t)}</div>`).join('')}</div></section>
  <section class="section"><span class="tag">GROUP PRACTICE</span><h2>${esc(x.activity)}</h2><div class="panel accent"><ol>${x.instructions.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div></section>
  <section class="section"><span class="tag">DECISION PRACTICE</span><h2>What would you do?</h2><div class="panel"><h3>${esc(x.scenario)}</h3>
    <div id="choices" role="group" aria-label="Choices">${x.choices.map((c, i) => `<button class="choice ${s.choice === i ? 'selected' : ''}" data-choice="${i}" aria-pressed="${s.choice === i}">${esc(c)}</button>`).join('')}</div>
    <div id="feedback" aria-live="polite">${s.choice !== undefined ? feedbackHTML(x, s.choice) : ''}</div></div></section>
  <section class="section"><h2>Make it yours</h2><div class="panel"><p>${esc(x.prompt)}</p>
    <label class="mini" for="note">Private reflection</label><textarea id="note" maxlength="4000" placeholder="Write a concrete action or observation…">${esc(s.note)}</textarea>
    <p class="mini" id="syncStatus">${s.note ? 'Saved to your account' : 'Saves automatically to your account. Your facilitator never sees what you write.'}</p>
    <div class="actions no-print">
      <button class="btn ${s.done ? 'secondary' : 'gold'}" id="completeBtn">${s.done ? 'Completed ✓ — undo' : 'Mark session complete'}</button>
      <button class="btn secondary" id="nextLesson">${idx < lessons.length - 1 ? 'Next session' : 'Back to overview'}</button>
    </div></div></section>`;
}
function feedbackHTML(x, i) {
  const good = i === x.correct;
  return `<div class="feedback ${good ? '' : 'caution'}"><strong>${good ? 'Strong response' : 'Consider another approach'}</strong><br>${esc(x.reason)}</div>`;
}
function bindLesson(x) {
  $('#presentBtn').onclick = () => startSlides(lessonSlides(x));
  $('#printBtn').onclick = () => window.print();
  $('#note').oninput = e => { update(x.id, { note: e.target.value || undefined }); queueSave(x.id, 900); };
  $('#completeBtn').onclick = () => {
    const done = !saved[x.id]?.done;
    update(x.id, { done: done || undefined, doneAt: done ? new Date().toISOString() : undefined });
    queueSave(x.id, 0);
    render();
  };
  $('#nextLesson').onclick = () => go(lessons[lessons.indexOf(x) + 1]?.id || 'overview');
  document.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
    const i = +b.dataset.choice;
    update(x.id, { choice: i });
    queueSave(x.id, 0);
    document.querySelectorAll('.choice').forEach(c => { c.classList.toggle('selected', c === b); c.setAttribute('aria-pressed', c === b); });
    $('#feedback').innerHTML = feedbackHTML(x, i);
  });
}
function lessonSlides(x) {
  return [
    { k: x.phase, t: x.title, d: x.intro },
    { k: 'OUTCOMES', t: 'Today’s goals', d: x.outcomes.join('  •  ') },
    { k: 'SIMPLE MODEL', t: x.model.join('  →  '), d: 'Discuss how each step appears in your work.' },
    { k: 'GROUP PRACTICE', t: x.activity, d: x.instructions.join('  •  ') },
    { k: 'DECISION PRACTICE', t: x.scenario, d: x.choices.map((a, i) => `${String.fromCharCode(65 + i)}. ${a}`).join('   ') },
    { k: 'REFLECTION', t: 'Apply it at work', d: x.prompt },
  ];
}

// ---------- account ----------
function accountHTML() {
  return `<div class="eyebrow">Your account</div><h1>${esc(me?.name || '')}</h1><p class="lede">Signed in as <b>${esc(me?.id || '')}</b>${me?.admin ? ' · facilitator' : ''}.</p>
  <section class="section"><h2>Change your password</h2><div class="panel"><form id="pwForm" class="form">
    <label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" required>
    <label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required>
    <p class="mini">At least 8 characters.</p><div class="actions"><button class="btn">Change password</button></div><p class="msg" id="pwMsg" role="status"></p></form></div></section>
  <section class="section"><h2>Your progress</h2><div class="panel"><p>${doneCount()} of ${lessons.length} sessions complete. Starting over clears your answers, notes and completed sessions.</p>
    <div class="actions"><button class="btn secondary" id="resetBtn">Start over</button></div><p class="msg" id="resetMsg" role="status"></p></div></section>
  <section class="section"><div class="actions"><button class="btn secondary" id="logoutBtn">Sign out</button><a class="btn secondary" href="/login?switch=1">Switch account</a></div></section>`;
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
    try { await call('/api/progress', { reset: true }); saved = {}; cache(); render(); }
    catch (err) { $('#resetMsg').className = 'msg bad'; $('#resetMsg').textContent = err.message; }
  };
  $('#logoutBtn').onclick = async () => {
    await fetch('/logout', { method: 'POST' });
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    location.href = '/login';
  };
}

// ---------- facilitator ----------
async function loadTeam() {
  let rows;
  try { rows = await call('/api/team'); }
  catch (err) { $('#content').innerHTML = `<h1>Participants</h1><p class="msg bad">${esc(err.message)}</p>`; return; }
  const when = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '–';
  $('#content').innerHTML = `<div class="eyebrow">Facilitator</div><h1>Participants</h1>
  <p class="lede">${rows.length} account${rows.length === 1 ? '' : 's'}. You see each person’s progress and how many notes they wrote, but not what the notes say.</p>
  <div class="table-wrap"><table class="team"><thead><tr><th>Name</th><th>Login ID</th><th>Progress</th><th>Notes</th><th>Last completed</th><th></th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${esc(r.name)}${r.admin ? ' <span class="tag small">facilitator</span>' : ''}</td><td>${esc(r.id)}</td>
    <td><div class="dots" title="${r.done.length} of 9">${lessons.map(l => `<span class="${r.done.includes(l.id) ? 'on' : ''}" title="${esc(l.title)}"></span>`).join('')}</div> ${r.done.length}/9</td>
    <td>${r.notes}</td><td>${when(r.last)}</td>
    <td class="row-actions">${r.id === me.id ? '<span class="mini">you</span>' : `<button class="link" data-reset="${esc(r.id)}">New password</button> <button class="link danger" data-remove="${esc(r.id)}" data-name="${esc(r.name)}">Remove</button>`}</td></tr>`).join('')}
  </tbody></table></div>
  <section class="section"><h2>Add a participant</h2><div class="panel"><form id="addForm" class="form grid-form">
    <div><label for="nName">Name</label><input id="nName" required maxlength="80" placeholder="e.g. Aishath Ali"></div>
    <div><label for="nId">Login ID</label><input id="nId" required autocapitalize="none" spellcheck="false" placeholder="e.g. aishath"></div>
    <div><label for="nPw">Starting password</label><input id="nPw" required minlength="8" placeholder="8+ characters"></div>
    <label class="check"><input type="checkbox" id="nAdmin"> Facilitator (can manage accounts)</label>
    <div class="actions"><button class="btn">Add account</button><button type="button" class="btn secondary" id="genPw">Suggest a password</button></div>
    <p class="msg" id="addMsg" role="status"></p></form></div></section>`;
  const pw = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  $('#genPw').onclick = () => { $('#nPw').value = pw(); };
  $('#addForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#addMsg');
    try {
      const id = $('#nId').value.trim().toLowerCase(), password = $('#nPw').value;
      await call('/api/users', { id, name: $('#nName').value, password, admin: $('#nAdmin').checked });
      await loadTeam();
      const m = $('#addMsg'); m.className = 'msg ok'; m.textContent = `Account created. Give them login ID “${id}” and password “${password}”.`;
    } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
  };
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    const password = prompt(`New password for ${b.dataset.reset} (at least 8 characters):`, pw());
    if (!password) return;
    try { await call('/api/users', { id: b.dataset.reset, password, replace: true }); alert(`Password changed. Their new password is: ${password}`); loadTeam(); }
    catch (err) { alert(err.message); }
  });
  document.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
    if (!confirm(`Remove ${b.dataset.name}? Their progress and notes are deleted too.`)) return;
    try { await call('/api/users/remove', { id: b.dataset.remove }); loadTeam(); }
    catch (err) { alert(err.message); }
  });
}

// ---------- presentation ----------
function startSlides(list) { slides = list; slideIndex = 0; renderSlide(); $('#presentation').classList.add('show'); document.body.style.overflow = 'hidden'; $('#nextSlide').focus(); }
function renderSlide() {
  const s = slides[slideIndex];
  $('#slideKicker').textContent = s.k; $('#slideTitle').textContent = s.t; $('#slideText').textContent = s.d;
  $('#slideCount').textContent = `${slideIndex + 1} / ${slides.length}`;
  $('#prevSlide').disabled = slideIndex === 0;
  $('#nextSlide').textContent = slideIndex === slides.length - 1 ? 'Finish' : 'Next';
}
function closeSlides() { $('#presentation').classList.remove('show'); document.body.style.overflow = ''; }
$('#prevSlide').onclick = () => { if (slideIndex) { slideIndex--; renderSlide(); } };
$('#nextSlide').onclick = () => { if (slideIndex < slides.length - 1) { slideIndex++; renderSlide(); } else closeSlides(); };
$('#closeSlide').onclick = closeSlides;
document.addEventListener('keydown', e => {
  if (!$('#presentation').classList.contains('show')) return;
  if (e.key === 'Escape') closeSlides();
  if (e.key === 'ArrowRight') $('#nextSlide').click();
  if (e.key === 'ArrowLeft') $('#prevSlide').click();
});
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', () => { if (pending.size) flush(); });

// ---------- start ----------
async function start() {
  render();
  try {
    const [user, data] = await Promise.all([call('/api/me'), call('/api/progress')]);
    me = user;
    saved = { ...data.progress };
    cache();
    $('#who').textContent = me.name;
    render();
  } catch (e) {
    if (e.message !== 'Signed out') $('#who').textContent = 'Offline — changes will sync later';
  }
}
start();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
