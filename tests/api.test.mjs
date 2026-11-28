// Server behaviour: security headers, classes and joining, bulk import, class-isolated live polls, the demo lock,
// check-ins, backups, and the rule that facilitators can never read private notes or check-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Client, admin, uid, BASE } from './lib/client.mjs';

const SECRET = 'PRIVATE-' + Math.random().toString(36).slice(2);   // written into notes and check-ins only
let A, c1, c2, p1, p2;

async function join(code, name) {
  const id = uid('p'), pw = 'pass-' + id;
  const c = new Client();
  const res = await c.req('/join', { method: 'POST', form: { code, name, login: id, password: pw, confirm: pw } });
  return { c, id, pw, res };
}

test('setup: facilitator signs in and creates two classes', async () => {
  A = await admin();
  c1 = (await A.json('/api/classes', { name: 'Test class one' })).data;
  c2 = (await A.json('/api/classes', { name: 'Test class two', code: 'tst-' + Date.now().toString(36).slice(-4) })).data;
  assert.ok(c1.id && /^[A-Z0-9]+-[A-Z0-9]{3}$/.test(c1.code), 'generated join code looks like TC-7KQ');
  assert.match(c2.code, /^TST-/, 'custom codes are upper-cased');
  const dup = await A.json('/api/classes', { name: 'Dup', code: c2.code });
  assert.equal(dup.status, 409);
});

test('every response carries the security headers', async () => {
  for (const path of ['/', '/login', '/join', '/healthz', '/app.js', '/api/me']) {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/, path);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
    assert.ok(res.headers.get('referrer-policy'), path);
  }
});

test('cross-site POSTs are refused', async () => {
  const res = await fetch(BASE + '/api/progress', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Cookie: A.cookie }, body: '{}' });
  assert.equal(res.status, 403);
});

test('participants join a class with its code; bad and archived codes are refused', async () => {
  const r1 = await join(c1.code, 'Aishath One'); p1 = r1;
  assert.ok(r1.c.cookie, 'joining signs the participant in');
  const me = (await r1.c.json('/api/me')).data;
  assert.equal(me.classId, c1.id); assert.equal(me.className, 'Test class one'); assert.equal(me.admin, false);
  p2 = await join(c2.code.toLowerCase(), 'Ibrahim Two');
  assert.equal((await p2.c.json('/api/me')).data.classId, c2.id, 'codes are case-insensitive');
  const bad = await join('NOPE-123', 'X');
  assert.ok(!bad.c.cookie); assert.match(await bad.res.text(), /not valid/);
  const c3 = (await A.json('/api/classes', { name: 'Archived class' })).data;
  await A.json('/api/classes/update', { id: c3.id, status: 'archived' });
  const arch = await join(c3.code, 'Y');
  assert.ok(!arch.c.cookie, 'archived classes cannot be joined');
  const dupe = new Client();
  const res = await dupe.req('/join', { method: 'POST', form: { code: c1.code, name: 'Dup', login: p1.id, password: 'whatever1', confirm: 'whatever1' } });
  assert.match(await res.text(), /already taken/);
});

test('regenerating a join code retires the old one', async () => {
  const old = c1.code;
  c1 = (await A.json('/api/classes/update', { id: c1.id, code: 'new' })).data;
  assert.notEqual(c1.code, old);
  assert.ok(!(await join(old, 'Late')).c.cookie);
});

test('bulk import creates accounts in the chosen class with passwords that work', async () => {
  const login = uid('imp');
  const r = await A.json('/api/classes/import', { id: c1.id, rows: [{ name: 'Mariyam Import', login, password: 'chosen-pass-1' }, { name: 'Hassan Generated' }, { name: '' }, { name: 'Clash', login }] });
  assert.equal(r.status, 200);
  const [a, b, skip, clash] = r.data.results;
  assert.equal(a.status, 'created'); assert.equal(a.id, login); assert.equal(a.password, 'chosen-pass-1');
  assert.equal(b.status, 'created'); assert.match(b.id, /^hassan\.generated/); assert.ok(b.password.length >= 8);
  assert.equal(skip.status, 'skipped'); assert.equal(clash.status, 'error');
  const c = await new Client().login(b.id, b.password);
  assert.equal((await c.json('/api/me')).data.classId, c1.id);
});

test('facilitators filter participants by class and can move people between classes', async () => {
  const inC1 = (await A.json('/api/team?class=' + c1.id)).data.map(r => r.id);
  assert.ok(inC1.includes(p1.id)); assert.ok(!inC1.includes(p2.id));
  const list = (await A.json('/api/classes')).data;
  assert.ok(list.classes.find(c => c.id === c1.id).members >= 3);
  const extra = await join(c2.code, 'Mover');
  await A.json('/api/users/class', { id: extra.id, classId: c1.id });
  assert.ok((await A.json('/api/team?class=' + c1.id)).data.some(r => r.id === extra.id));
  await A.json('/api/users/class', { id: extra.id, classId: null });
  assert.ok((await A.json('/api/team?class=unassigned')).data.some(r => r.id === extra.id));
});

test('participants cannot use any facilitator endpoint', async () => {
  for (const [path, body] of [['/api/team'], ['/api/classes'], ['/api/classes/report?id=' + c1.id], ['/api/admin/backups'], ['/api/classes', { name: 'x' }], ['/api/classes/import', { id: c1.id, rows: [{ name: 'x' }] }], ['/api/users', { id: 'zzz', name: 'z', password: '12345678' }], ['/api/admin/backup', {}]]) {
    assert.equal((await p1.c.json(path, body)).status, 403, path);
  }
});

test('private notes and check-ins never reach a facilitator, in any endpoint or export', async () => {
  await p1.c.json('/api/progress', { lesson: 'foundations', entry: { note: 'My note ' + SECRET, choice: 1, done: true } });
  await p1.c.json('/api/progress', { lesson: 'trust', entry: { note: SECRET, choice: 0 } });
  const ci = await p1.c.json('/api/checkins', { rating: 4, helped: 'helped ' + SECRET, blocked: SECRET, next: 'next ' + SECRET });
  assert.equal(ci.status, 200);
  // The owner sees their own.
  assert.ok((await p1.c.json('/api/progress')).text.includes(SECRET));
  assert.ok((await p1.c.json('/api/checkins')).text.includes(SECRET));
  // Facilitator views carry completion and quiz answers, never the text.
  const team = await A.json('/api/team?class=all');
  const row = team.data.find(r => r.id === p1.id);
  assert.deepEqual(row.done, ['foundations']); assert.equal(row.quizzes, 2);
  const report = await A.json('/api/classes/report?id=' + c1.id);
  const member = report.data.members.find(m => m.id === p1.id);
  assert.equal(member.progress.foundations.choice, 1); assert.equal(member.progress.foundations.done, true);
  for (const r of [team, report, await A.json('/api/classes'), await A.json('/api/classes/report?id=unassigned'), await A.json('/api/poll/history?class=' + c1.id)]) {
    assert.ok(!r.text.includes(SECRET), 'facilitator response leaked a private note');
    assert.ok(!/"note"|"helped"|"blocked"/.test(r.text), 'facilitator response has a note field');
  }
  // There is no way to ask for someone else's notes.
  assert.ok(!(await A.json('/api/progress?id=' + p1.id)).text.includes(SECRET));
  assert.ok(!(await A.json('/api/checkins?id=' + p1.id)).text.includes(SECRET));
});

test('backups run on demand, and without BACKUP_KEY they leave out notes, check-ins and password hashes', async () => {
  const r = await A.json('/api/admin/backup', {});
  assert.equal(r.status, 200, r.text);
  assert.ok(r.data.key.startsWith('snapshot:')); assert.ok(r.data.counts.user >= 3);
  const list = await A.json('/api/admin/backups');
  assert.ok(list.data.backups.some(b => b.key === r.data.key));
  if (!process.env.TEST_PERSIST) return;   // only when the runner owns the local storage
  const snap = execFileSync('npx', ['wrangler', 'kv', 'key', 'get', '--binding=BACKUPS', '--local', '--persist-to', process.env.TEST_PERSIST, r.data.key], { encoding: 'utf8', env: { ...process.env } });
  const data = JSON.parse(snap);
  if (data.encrypted) { assert.ok(!snap.includes(SECRET)); return; }
  assert.equal(data.redacted, true);
  assert.ok(!snap.includes(SECRET), 'snapshot contains a private note');
  assert.ok(!/"hash"|"salt"/.test(snap), 'snapshot contains password hashes');
  assert.ok(data.kv['progress:' + p1.id].foundations.done, 'completion is kept');
});

test('live polls are separate for each class', async () => {
  const poll = { id: 'trust:5', q: 'Test poll?', o: ['Yes', 'No', 'Maybe'] };
  assert.equal((await p1.c.json('/api/poll/control', { action: 'open', poll })).status, 403, 'participants cannot run polls');
  assert.equal((await A.json('/api/poll/control', { action: 'open', poll, classId: c1.id })).status, 200);
  assert.equal((await p1.c.json('/api/poll/current')).data.active.id, 'trust:5');
  assert.equal((await p2.c.json('/api/poll/current')).data.active, null, 'the other class sees nothing');
  assert.equal((await p2.c.json('/api/poll/vote', { id: 'trust:5', choice: 0 })).status, 409);
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:5', choice: 2 })).status, 200);
  const res = await A.json('/api/poll/results?id=trust:5&class=' + c1.id);
  assert.deepEqual(res.data.counts, [0, 0, 1]);
  assert.equal((await A.json('/api/poll/results?id=trust:5&class=' + c2.id)).data.total, 0);
  assert.equal((await p1.c.json('/api/poll/results?id=trust:5')).status, 403, 'results stay hidden until shown');
  await A.json('/api/poll/control', { action: 'lock', classId: c1.id });
  assert.equal((await p1.c.json('/api/poll/vote', { id: 'trust:5', choice: 1 })).status, 423);
  await A.json('/api/poll/control', { action: 'close', classId: c1.id });
  const h1 = (await A.json('/api/poll/history?class=' + c1.id)).data.history;
  assert.equal(h1[0].id, 'trust:5'); assert.deepEqual(h1[0].counts, [0, 0, 1]);
  assert.equal((await A.json('/api/poll/history?class=' + c2.id)).data.history.length, 0);
  const report = (await A.json('/api/classes/report?id=' + c1.id)).data;
  assert.equal(report.polls[0].q, 'Test poll?');
  assert.equal((await A.json('/api/poll/control', { action: 'open', poll, classId: 'nope' })).status, 404);
});

test('demo accounts cannot change their own password, but a facilitator can reset it', async () => {
  const id = uid('demo');
  assert.equal((await A.json('/api/users', { id, name: 'Demo', password: 'demo-pass-1', locked: true, classId: c1.id })).status, 201);
  const d = await new Client().login(id, 'demo-pass-1');
  const r = await d.json('/api/password', { current: 'demo-pass-1', next: 'changed-pass-2' });
  assert.equal(r.status, 403);
  assert.equal((await A.json('/api/users', { id, password: 'reset-pass-3', replace: true })).status, 200);
  await new Client().login(id, 'reset-pass-3');
});

test('check-ins need a 1-5 rating and stay with their owner', async () => {
  assert.equal((await p2.c.json('/api/checkins', { rating: 9 })).status, 400);
  assert.equal((await p2.c.json('/api/checkins')).data.checkins.length, 0, 'p2 does not see p1’s check-ins');
});

test('removing a participant deletes their progress and check-ins too', async () => {
  const x = await join(c1.code, 'Leaver');
  await x.c.json('/api/checkins', { rating: 3 });
  assert.equal((await A.json('/api/users/remove', { id: x.id })).status, 200);
  assert.equal((await x.c.json('/api/me')).status, 401);
});
