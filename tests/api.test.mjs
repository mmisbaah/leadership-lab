// Server behaviour against D1: security headers, shared-computer sessions, class ownership and co-facilitators,
// joining and importing, facilitator-marked attendance and verified certificates, live polls (choice and open text),
// per-class deck changes, anonymous impact figures, data export and deletion, retention, backups and health.
// Throughout: facilitators must never receive private notes, check-in text, individual self-assessments or evaluations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client, admin, uid, BASE } from './lib/client.mjs';
import { lessons } from '../public/lessons.js';

const SECRET = 'PRIVATE-' + Math.random().toString(36).slice(2);   // only ever written into private fields
const NOTE_FIELDS = /"note"|"helped"|"blocked"|"answers"|"improve"/;
let A, F1, F2, f1, f2, c1, c2, p1, p2;

async function join(code, name) {
  const id = uid('p'), pw = 'pass-' + id, c = new Client();
  const res = await c.req('/join', { method: 'POST', form: { code, name, login: id, password: pw, confirm: pw } });
  return { c, id, pw, res };
}
async function facilitator(name) {
  const id = uid('fac'), pw = 'fac-pass-' + id;
  assert.equal((await A.json('/api/users', { id, name, password: pw, role: 'facilitator' })).status, 201);
  return { id, pw, c: await new Client().login(id, pw) };
}
const markAll = (who, classId, lesson) => who.json('/api/attendance', { classId, lesson, present: true });

test('setup: an admin creates two facilitators; each creates a class they own', async () => {
  A = await admin();
  f1 = await facilitator('Facilitator One'); f2 = await facilitator('Facilitator Two');
  F1 = f1.c; F2 = f2.c;
  c1 = (await F1.json('/api/classes', { name: 'Test class one' })).data;
  c2 = (await F2.json('/api/classes', { name: 'Test class two', code: 'tst-' + Date.now().toString(36).slice(-4) })).data;
  assert.match(c1.code, /^[A-Z0-9]+-[A-Z0-9]{3}$/);
  assert.match(c2.code, /^TST-/);
  assert.equal(c1.owner, f1.id);
  assert.equal((await F1.json('/api/classes', { name: 'Dup', code: c2.code })).status, 409);
  assert.equal((await F1.json('/api/users', { id: uid('x'), name: 'X', password: 'xxxxxxxx', role: 'facilitator' })).status, 403, 'only admins create facilitators');
});

test('every response carries the security headers; cross-site POSTs are refused', async () => {
  for (const path of ['/', '/login', '/join', '/healthz', '/app.js', '/api/me', '/verify/LL-2026-AAAA-BBBB']) {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'.*frame-ancestors 'none'/, path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
    assert.ok(res.headers.get('referrer-policy'), path);
  }
  const res = await fetch(BASE + '/api/progress', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Cookie: F1.cookie }, body: '{}' });
  assert.equal(res.status, 403);
});

test('a shared-computer sign-in gets a session cookie that ends with the browser', async () => {
  const normal = await new Client().login(f1.id, f1.pw);
  assert.match(normal.lastSetCookie, /Max-Age=\d{6,}/);
  const shared = await new Client().login(f1.id, f1.pw, { shared: true });
  assert.doesNotMatch(shared.lastSetCookie, /Max-Age|Expires/i);
  assert.equal((await shared.json('/api/me')).data.shared, true);
  assert.equal((await normal.json('/api/me')).data.shared, false);
});

test('participants join with a code; bad, archived and retired codes are refused', async () => {
  p1 = await join(c1.code, 'Aishath One');
  const me = (await p1.c.json('/api/me')).data;
  assert.equal(me.classId, c1.id); assert.equal(me.className, 'Test class one'); assert.equal(me.facilitator, false);
  p2 = await join(c2.code.toLowerCase(), 'Ibrahim Two');
  assert.equal((await p2.c.json('/api/me')).data.classId, c2.id);
  assert.ok(!(await join('NOPE-123', 'X')).c.cookie);
  const c3 = (await F1.json('/api/classes', { name: 'Archived class' })).data;
  await F1.json('/api/classes/update', { id: c3.id, status: 'archived' });
  assert.ok(!(await join(c3.code, 'Y')).c.cookie, 'archived classes cannot be joined');
  const old = c1.code;
  c1 = (await F1.json('/api/classes/update', { id: c1.id, code: 'new' })).data;
  assert.ok(!(await join(old, 'Late')).c.cookie, 'a regenerated code retires the old one');
});

test('facilitators see only their own classes; admins can switch to all', async () => {
  const mine = (await F2.json('/api/classes')).data.classes.map(c => c.id);
  assert.ok(mine.includes(c2.id)); assert.ok(!mine.includes(c1.id));
  assert.equal((await F2.json('/api/classes?scope=all')).data.scope, 'mine', 'facilitators cannot widen the scope');
  for (const [path, body] of [['/api/team?class=' + c1.id], ['/api/classes/report?id=' + c1.id], ['/api/attendance', { classId: c1.id, lesson: 'trust', present: true }],
    ['/api/classes/update', { id: c1.id, name: 'Hijack' }], ['/api/classes/deck', { id: c1.id, lesson: 'trust', skip: [3] }], ['/api/classes/import', { id: c1.id, rows: [{ name: 'X' }] }], ['/api/poll/control?', { action: 'open', classId: c1.id, poll: { id: 'trust:5', q: 'Q', o: ['a', 'b'] } }]])
    assert.equal((await F2.json(path.replace('?', path.includes('poll') ? '' : '?'), body)).status, 403, path);
  assert.equal((await F2.json('/api/team?class=unassigned')).status, 403);
  const all = (await A.json('/api/classes?scope=all')).data.classes.map(c => c.id);
  assert.ok(all.includes(c1.id) && all.includes(c2.id));
  const adminMine = (await A.json('/api/classes?scope=mine')).data.classes.map(c => c.id);
  assert.ok(!adminMine.includes(c1.id) && !adminMine.includes(c2.id), 'the admin does not run these classes, so "mine" leaves them out');
});

test('an owner adds and removes co-facilitators; only the owner can archive or change facilitators', async () => {
  assert.equal((await F1.json('/api/classes/facilitators', { id: c1.id, add: p1.id })).status, 400, 'participants cannot co-facilitate');
  assert.equal((await F1.json('/api/classes/facilitators', { id: c1.id, add: f2.id })).status, 200);
  assert.ok((await F2.json('/api/classes')).data.classes.some(c => c.id === c1.id && c.role === 'co-facilitator'));
  assert.equal((await F2.json('/api/team?class=' + c1.id)).status, 200);
  assert.equal((await F2.json('/api/classes/update', { id: c1.id, status: 'archived' })).status, 403);
  assert.equal((await F2.json('/api/classes/facilitators', { id: c1.id, add: f1.id })).status, 403);
  assert.equal((await F1.json('/api/classes/facilitators', { id: c1.id, remove: f2.id })).status, 200);
  assert.equal((await F2.json('/api/team?class=' + c1.id)).status, 403);
});

test('bulk import creates working accounts in the class', async () => {
  const login = uid('imp');
  const r = await F1.json('/api/classes/import', { id: c1.id, rows: [{ name: 'Mariyam Import', login, password: 'chosen-pass-1' }, { name: 'Hassan Generated' }, { name: '' }, { name: 'Clash', login }] });
  const [a, b, skip, clash] = r.data.results;
  assert.equal(a.status, 'created'); assert.equal(a.id, login);
  assert.equal(b.status, 'created'); assert.match(b.id, /^hassan\.generated/);
  assert.equal(skip.status, 'skipped'); assert.equal(clash.status, 'error');
  assert.equal((await (await new Client().login(b.id, b.password)).json('/api/me')).data.classId, c1.id);
});

test('certificates need facilitator-marked attendance, then verify publicly', async () => {
  // Participants can't mark themselves present: "done" in their own progress is ignored.
  await p1.c.json('/api/progress', { lesson: 'trust', entry: { done: true, choice: 1 } });
  assert.equal((await p1.c.json('/api/certificate', {})).status, 403);
  assert.equal((await p1.c.json('/api/attendance', { classId: c1.id, lesson: 'trust', present: true })).status, 403);
  for (const l of lessons.slice(0, -1)) assert.equal((await markAll(F1, c1.id, l.id)).status, 200);
  const almost = await p1.c.json('/api/certificate', {});
  assert.equal(almost.status, 403); assert.equal(almost.data.attended.length, lessons.length - 1);
  assert.equal((await F1.json('/api/attendance', { classId: c1.id, lesson: lessons.at(-1).id, userIds: [p1.id], present: true })).data.marked, 1);
  const cert = (await p1.c.json('/api/certificate', {})).data.certificate;
  assert.match(cert.code, /^LL-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(cert.name, 'Aishath One'); assert.equal(cert.className, 'Test class one'); assert.equal(cert.sessions, lessons.length);
  assert.equal((await p1.c.json('/api/certificate', {})).data.certificate.code, cert.code, 'issuing again returns the same certificate');
  const page = await fetch(BASE + '/verify/' + cert.code);
  const html = await page.text();
  assert.equal(page.status, 200); assert.match(html, /Certificate verified/); assert.match(html, /Aishath One/); assert.doesNotMatch(html, new RegExp(p1.id));
  assert.equal((await fetch(BASE + '/verify/LL-2026-ZZZZ-ZZZZ')).status, 404);
  assert.equal((await F2.json('/api/certificates/revoke', { code: cert.code })).status, 403);
  await F1.json('/api/certificates/revoke', { code: cert.code });
  assert.match(await (await fetch(BASE + '/verify/' + cert.code)).text(), /revoked/);
  await F1.json('/api/certificates/revoke', { code: cert.code, revoke: false });
  assert.match(await (await fetch(BASE + '/verify/' + cert.code)).text(), /Certificate verified/);
  const row = (await F1.json('/api/team?class=' + c1.id)).data.find(r => r.id === p1.id);
  assert.equal(row.attended.length, lessons.length); assert.equal(row.certificate.code, cert.code);
});

test('private notes, check-ins and self-assessments never reach a facilitator', async () => {
  await p1.c.json('/api/progress', { lesson: 'foundations', entry: { note: 'My note ' + SECRET, choice: 1 } });
  assert.equal((await p1.c.json('/api/checkins', { rating: 4, helped: 'helped ' + SECRET, blocked: SECRET, next: 'next ' + SECRET })).status, 200);
  assert.equal((await p1.c.json('/api/assessment', { phase: 'baseline', answers: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5] })).status, 200);
  assert.ok((await p1.c.json('/api/progress')).text.includes(SECRET), 'the owner sees their own note');
  const report = await F1.json('/api/classes/report?id=' + c1.id);
  assert.equal(report.data.members.find(m => m.id === p1.id).quiz.foundations, 1);
  for (const r of [await F1.json('/api/team?class=' + c1.id), report, await F1.json('/api/classes'), await A.json('/api/team?class=all'), await A.json('/api/classes/report?id=unassigned')]) {
    assert.ok(!r.text.includes(SECRET), 'a facilitator response leaked private text');
    assert.doesNotMatch(r.text, NOTE_FIELDS);
  }
  assert.equal(report.data.impact.assessment.statements[0].baseline, null, 'one answer is too few to show an average');
});

test('impact: averages appear only from three people; change is paired; evaluations are anonymous', async () => {
  const people = [p1];
  for (let i = 0; i < 3; i++) people.push(await join(c1.code, 'Impact ' + i));
  // Baselines of 2 for everyone, follow-ups of 4 for three people: change +2.
  for (const p of people.slice(1)) await p.c.json('/api/assessment', { phase: 'baseline', answers: Array(10).fill(2) });
  const before = (await F1.json('/api/classes/report?id=' + c1.id)).data.impact.assessment;
  assert.equal(before.baselineCount, 4); assert.ok(before.statements[1].baseline !== null); assert.equal(before.statements[1].followup, null);
  assert.equal((await people[1].c.json('/api/assessment', { phase: 'followup', answers: Array(9).fill(4) })).status, 400, 'all ten statements are required');
  const newbie = await join(c1.code, 'No baseline');
  assert.equal((await newbie.c.json('/api/assessment', { phase: 'followup', answers: Array(10).fill(4) })).status, 400, 'follow-up needs a baseline');
  for (const p of people.slice(1, 3)) await p.c.json('/api/assessment', { phase: 'followup', answers: Array(10).fill(4) });
  assert.equal((await F1.json('/api/classes/report?id=' + c1.id)).data.impact.assessment.statements[1].change, null, 'two pairs are too few');
  await people[3].c.json('/api/assessment', { phase: 'followup', answers: Array(10).fill(4) });
  const after = (await F1.json('/api/classes/report?id=' + c1.id)).data.impact;
  assert.equal(after.assessment.statements[1].followup, 4); assert.equal(after.assessment.statements[1].change, 2); assert.equal(after.assessment.pairedCount, 3);
  // Follow-through: check-in counts and an average rating once three people have checked in.
  assert.equal(after.followThrough.checkedIn, 1); assert.equal(after.followThrough.averageRating, null);
  for (const p of people.slice(1, 3)) await p.c.json('/api/checkins', { rating: 2 });
  const ft = (await F1.json('/api/classes/report?id=' + c1.id)).data.impact.followThrough;
  assert.equal(ft.checkedIn, 3); assert.equal(ft.averageRating, Math.round((4 + 2 + 2) / 3 * 100) / 100);
  // Evaluation: hidden below three responses, one per person, no link to the person.
  await people[0].c.json('/api/evaluation', { relevance: 5, pace: 3, facilitator: 4, improve: 'More case studies' });
  assert.equal((await people[0].c.json('/api/evaluation', { relevance: 1, pace: 1, facilitator: 1 })).status, 409);
  await people[1].c.json('/api/evaluation', { relevance: 4, pace: 4, facilitator: 4 });
  let ev = (await F1.json('/api/classes/report?id=' + c1.id)).data.impact.evaluation;
  assert.equal(ev.count, 2); assert.equal(ev.relevance, null); assert.deepEqual(ev.comments, []);
  await people[2].c.json('/api/evaluation', { relevance: 3, pace: 3, facilitator: 5, improve: 'Longer breaks' });
  ev = (await F1.json('/api/classes/report?id=' + c1.id)).data.impact.evaluation;
  assert.equal(ev.count, 3); assert.equal(ev.relevance, 4); assert.deepEqual(ev.comments.sort(), ['Longer breaks', 'More case studies']);
  assert.ok(!(await people[0].c.json('/api/me/export')).text.includes('More case studies'), 'evaluations are not linked to the person');
});

test('live polls are separate per class, and open-text answers are grouped and moderated', async () => {
  const poll = { id: 'trust:5', q: 'Test poll?', o: ['Yes', 'No', 'Maybe'] };
  assert.equal((await p1.c.json('/api/poll/control', { action: 'open', poll })).status, 403);
  assert.equal((await F1.json('/api/poll/control', { action: 'open', poll, classId: c1.id })).status, 200);
  assert.equal((await p1.c.json('/api/poll/current')).data.active.id, 'trust:5');
  assert.equal((await p2.c.json('/api/poll/current')).data.active, null);
  assert.equal((await p2.c.json('/api/poll/vote', { id: 'trust:5', choice: 0 })).status, 409);
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:5', choice: 2 })).status, 200);
  assert.deepEqual((await F1.json('/api/poll/results?id=trust:5&class=' + c1.id)).data.counts, [0, 0, 1]);
  assert.equal((await p1.c.json('/api/poll/results?id=trust:5')).status, 403, 'results stay hidden until shown');
  await F1.json('/api/poll/control', { action: 'lock', classId: c1.id });
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:5', choice: 1 })).status, 423);
  // Opening an open-text poll archives the first poll.
  const open = { id: 'trust:21', q: 'One word for trust?', kind: 'open' };
  assert.equal((await F1.json('/api/poll/control', { action: 'open', poll: open, classId: c1.id })).status, 200);
  assert.equal((await p1.c.json('/api/poll/current')).data.active.kind, 'open');
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:21', text: '' })).status, 400);
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:21', text: 'x'.repeat(141) })).status, 400);
  const voters = [p1, ...(await Promise.all([join(c1.code, 'V1'), join(c1.code, 'V2')]))];
  await voters[0].c.json('/api/poll/vote', { id: 'trust:21', text: 'Honesty' });
  await voters[1].c.json('/api/poll/vote', { id: 'trust:21', text: 'honesty!' });
  await voters[2].c.json('/api/poll/vote', { id: 'trust:21', text: 'Rude thing' });
  let r = (await F1.json('/api/poll/results?id=trust:21&class=' + c1.id)).data;
  assert.equal(r.kind, 'open'); assert.equal(r.total, 3);
  assert.deepEqual(r.entries.map(e => [e.key, e.count]), [['honesty', 2], ['rude thing', 1]]);
  await F1.json('/api/poll/control', { action: 'hide-entry', entry: 'rude thing', classId: c1.id });
  await F1.json('/api/poll/control', { action: 'pin', entry: 'honesty', classId: c1.id });
  await F1.json('/api/poll/control', { action: 'show', classId: c1.id });
  const seen = (await voters[1].c.json('/api/poll/results?id=trust:21')).data;
  assert.deepEqual(seen.entries.map(e => e.key), ['honesty'], 'hidden answers never reach participants');
  assert.ok((await F1.json('/api/poll/results?id=trust:21&class=' + c1.id)).data.entries.find(e => e.key === 'rude thing').hidden);
  await F1.json('/api/poll/control', { action: 'close', classId: c1.id });
  const polls = (await F1.json('/api/classes/report?id=' + c1.id)).data.polls;
  const ot = polls.find(p => p.id === 'trust:21'), mc = polls.find(p => p.id === 'trust:5');
  assert.equal(ot.kind, 'open'); assert.deepEqual(ot.entries.map(e => e.text), ['Honesty'], 'archived without hidden answers');
  assert.deepEqual(mc.counts, [0, 0, 1]);
  assert.ok(!(await F2.json('/api/classes/report?id=' + c2.id)).data.polls.length, 'the other class has no polls');
  assert.ok((await p1.c.json('/api/me/export')).data.liveVotes.some(v => v.answer === 'Honesty'), 'a person’s own votes are in their export');
});

test('per-class deck changes are saved for that class and reach its participants', async () => {
  assert.equal((await F1.json('/api/classes/deck', { id: c1.id, lesson: 'nope', skip: [1] })).status, 400);
  const r = await F1.json('/api/classes/deck', { id: c1.id, lesson: 'trust', skip: [4, 5, 0, 999], timers: { 3: 5, 19: 15, 2: 0 } });
  assert.deepEqual(r.data.deck.trust, { skip: [4, 5], timers: { 3: 5, 19: 15 } }, 'slide 0 and out-of-range values are dropped');
  assert.deepEqual((await p1.c.json('/api/me')).data.classDeck.trust.skip, [4, 5]);
  assert.deepEqual((await p2.c.json('/api/me')).data.classDeck, {}, 'other classes keep the standard deck');
  await F1.json('/api/classes/deck', { id: c1.id, lesson: 'trust', skip: [], timers: {} });
  assert.deepEqual((await p1.c.json('/api/me')).data.classDeck, {});
});

test('demo accounts cannot change their password or delete themselves; check-ins are validated', async () => {
  const id = uid('demo');
  assert.equal((await F1.json('/api/users', { id, name: 'Demo', password: 'demo-pass-1', locked: true, classId: c1.id })).status, 201);
  const d = await new Client().login(id, 'demo-pass-1');
  assert.equal((await d.json('/api/password', { current: 'demo-pass-1', next: 'changed-pass-2' })).status, 403);
  assert.equal((await d.json('/api/me/delete', { password: 'demo-pass-1' })).status, 403);
  assert.equal((await F1.json('/api/users', { id, password: 'reset-pass-3', replace: true })).status, 200);
  await new Client().login(id, 'reset-pass-3');
  assert.equal((await p2.c.json('/api/checkins', { rating: 9 })).status, 400);
  assert.equal((await p2.c.json('/api/checkins')).data.checkins.length, 0);
});

test('participants export everything they own, and can delete their account', async () => {
  const x = (await p1.c.json('/api/me/export')).data;
  assert.equal(x.account.id, p1.id);
  assert.ok(x.sessions.find(s => s.lesson === 'foundations').note.includes(SECRET));
  assert.equal(x.attendance.length, lessons.length);
  assert.equal(x.checkins.length, 1); assert.equal(x.selfAssessment[0].answers.length, 10); assert.equal(x.certificates.length, 1);
  assert.doesNotMatch(JSON.stringify(x), /"hash"|"salt"/);
  const code = x.certificates[0].code;
  assert.equal((await p1.c.json('/api/me/delete', { password: 'wrong' })).status, 400);
  assert.equal((await p1.c.json('/api/me/delete', { password: p1.pw })).status, 200);
  assert.equal((await p1.c.json('/api/me')).status, 401);
  assert.equal((await fetch(BASE + '/verify/' + code)).status, 404, 'their certificate goes too');
  await assert.rejects(new Client().login(p1.id, p1.pw));
  assert.equal((await F1.json('/api/classes/report?id=' + c1.id)).data.impact.evaluation.count, 3, 'anonymous evaluations stay');
});

test('removing a participant deletes their records; facilitators can only remove their own participants', async () => {
  const x = await join(c1.code, 'Leaver');
  await x.c.json('/api/checkins', { rating: 3 });
  assert.equal((await F2.json('/api/users/remove', { id: x.id })).status, 403);
  assert.equal((await F1.json('/api/users/remove', { id: x.id })).status, 200);
  assert.equal((await x.c.json('/api/me')).status, 401);
});

test('classes archived for more than two years are purged with their participants', async () => {
  const c = (await F1.json('/api/classes', { name: 'Old cohort' })).data;
  const old = await join(c.code, 'Old participant');
  await F1.json('/api/classes/update', { id: c.id, status: 'archived' });
  assert.equal((await F1.json('/api/admin/maintenance', { task: 'retention' })).status, 403, 'admins only');
  const now = await A.json('/api/admin/maintenance', { task: 'retention' });
  assert.equal(now.data.classes, 0);
  const later = await A.json('/api/admin/maintenance', { task: 'retention', asOf: new Date(Date.now() + 731 * 864e5).toISOString() });
  assert.ok(later.data.classes >= 1); assert.ok(later.data.people >= 1);
  assert.equal((await old.c.json('/api/me')).status, 401);
  assert.ok(!(await A.json('/api/classes?scope=all')).data.classes.some(x => x.id === c.id));
  assert.ok((await new Client().login(f1.id, f1.pw)).cookie, 'facilitator accounts are kept');
});

test('backups: facilitators cannot run them; without BACKUP_KEY they are redacted and health fails', async () => {
  assert.equal((await F1.json('/api/admin/backups')).status, 403);
  const before = await fetch(BASE + '/api/health');
  const h = await before.json();
  assert.equal(h.checks.database, true);
  const r = await A.json('/api/admin/backup', {});
  assert.equal(r.status, 200, r.text);
  assert.ok(r.data.counts.users >= 3);
  const after = await (await fetch(BASE + '/api/health')).json();
  assert.equal(after.checks.backupFresh, true);
  if (!after.checks.backupKey) {
    assert.equal(after.ok, false); assert.match(after.problems.join(' '), /BACKUP_KEY/);
    assert.equal((await fetch(BASE + '/api/health')).status, 503);
  }
  if (!process.env.TEST_PERSIST) return;
  const snap = execFileSync('npx', ['wrangler', 'kv', 'key', 'get', '--binding=BACKUPS', '--local', '--persist-to', process.env.TEST_PERSIST, r.data.key], { encoding: 'utf8', env: { ...process.env } });
  const data = JSON.parse(snap);
  if (data.encrypted) { assert.ok(!snap.includes('Facilitator One')); return; }
  assert.equal(data.version, 2); assert.equal(data.redacted, true);
  assert.doesNotMatch(snap, /"hash"|"salt"/);
  assert.equal(data.tables.checkins.length, 0); assert.equal(data.tables.self_assessments.length, 0);
  assert.ok(data.tables.users.some(u => u.id === f1.id));
  assert.ok(!snap.includes('Longer breaks'), 'evaluation comments are left out');
});
