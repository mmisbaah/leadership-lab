// Facilitator API: classes, co-facilitators, rosters, attendance, bulk import, deck overrides and the class report.
// Facilitators see only the classes they own or co-facilitate; admins can ask for every class (?scope=all).
// Nothing here ever reads private notes, check-in text, individual self-assessments or evaluations: the report gets
// counts and averages over at least MIN_GROUP people from impact.js.
import { json, cleanId, validId, MIN_PASSWORD, newHash, randomPassword, sessionCookie, rateLimited } from './lib.js';
import {
  all, first, run, stmt, now, parse, getUser, publicUser, insertUser, setPassword, getClass, classByCode, mapClass,
  canManage, managedClassIds, isOwner, coFacilitators, LESSON_IDS, certThreshold,
} from './db.js';
import { joinPage, signedInPage } from './pages.js';
import { classImpact } from './impact.js';
import { lessons } from '../public/lessons.js';
import { decks } from '../public/decks.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const validCode = c => /^[A-Z0-9][A-Z0-9-]{2,15}$/.test(c);
export const cleanCode = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
const forbidden = () => json({ error: 'You don’t run this class. Ask its owner to add you as a co-facilitator.' }, 403);
const placeholders = n => Array(n).fill('?').join(', ');

async function uniqueCode(env, name) {
  const initials = (String(name).match(/[A-Za-z0-9]+/g) || ['LL']).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'LL';
  for (let i = 0; i < 20; i++) {
    const tail = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    const code = `${initials}-${tail}`;
    if (!await first(env, 'SELECT 1 FROM classes WHERE code = ?', code)) return code;
  }
  throw new Error('Could not make a unique join code. Try again.');
}
async function loginFrom(env, name, taken) {
  const base = String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40) || 'participant';
  for (let n = 0; n < 500; n++) {
    const id = n ? `${base}${n + 1}` : base;
    if (validId(id) && !taken.has(id) && !await first(env, 'SELECT 1 FROM users WHERE id = ?', id)) { taken.add(id); return id; }
  }
  throw new Error('Could not make a login ID for ' + name);
}
// Which participants a request may see: one class, every class the facilitator runs, or (admins) everyone.
async function scopeUsers(env, user, filter) {
  if (filter === 'unassigned') return user.admin ? all(env, "SELECT * FROM users WHERE class_id IS NULL ORDER BY name") : null;
  if (filter === 'all' && user.admin) return all(env, 'SELECT * FROM users ORDER BY name');
  if (filter === 'all' || filter === 'mine') {
    const ids = await managedClassIds(env, user);
    return ids.length ? all(env, `SELECT * FROM users WHERE class_id IN (${placeholders(ids.length)}) ORDER BY name`, ...ids) : [];
  }
  if (!await canManage(env, user, filter)) return null;
  return all(env, 'SELECT * FROM users WHERE class_id = ? ORDER BY name', filter);
}
// May this facilitator act on this person? Admins: anyone. Others: participants in a class they run.
async function canManageUser(env, user, target) {
  if (user.admin) return true;
  return target.role === 'participant' && !!target.classId && await canManage(env, user, target.classId);
}

export async function classesApi(request, env, user, path, body, url) {
  const M = request.method;

  if (path === '/api/classes' && M === 'GET') {
    const everything = url.searchParams.get('scope') === 'all' && user.admin;
    const mine = new Set(await managedClassIds(env, user));
    const rows = await all(env, `SELECT c.*, o.name AS owner_name, (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id) AS members
      FROM classes c LEFT JOIN users o ON o.id = c.owner_id ORDER BY c.created DESC`);
    const facs = await all(env, 'SELECT f.class_id, u.id, u.name FROM class_facilitators f JOIN users u ON u.id = f.user_id ORDER BY u.name');
    const classes = rows.filter(r => everything || mine.has(r.id)).map(r => ({
      ...mapClass(r), ownerName: r.owner_name || null, members: r.members, mine: mine.has(r.id),
      role: r.owner_id === user.id ? 'owner' : mine.has(r.id) ? 'co-facilitator' : 'admin',
      facilitators: facs.filter(f => f.class_id === r.id).map(f => ({ id: f.id, name: f.name })),
    }));
    const unassigned = user.admin ? (await first(env, "SELECT COUNT(*) AS n FROM users WHERE class_id IS NULL AND role = 'participant'")).n : null;
    return json({ classes, unassigned, scope: everything ? 'all' : 'mine', threshold: certThreshold(env) });
  }

  if (path === '/api/classes' && M === 'POST') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return json({ error: 'Give the class a name.' }, 400);
    const code = body.code ? cleanCode(body.code) : await uniqueCode(env, name);
    if (!validCode(code)) return json({ error: 'A join code needs 3 to 16 letters, digits or dashes.' }, 400);
    if (await first(env, 'SELECT 1 FROM classes WHERE code = ?', code)) return json({ error: `The join code ${code} is already in use.` }, 409);
    const c = { id: crypto.randomUUID().slice(0, 8), name, code, owner: user.id, status: 'active', created: now(), deck: {} };
    await run(env, 'INSERT INTO classes (id, name, code, owner_id, status, created) VALUES (?, ?, ?, ?, ?, ?)', c.id, name, code, user.id, 'active', c.created);
    return json(c, 201);
  }

  if (path === '/api/classes/update' && M === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'No such class.' }, 404);
    if (!await canManage(env, user, c.id)) return forbidden();
    if (typeof body.name === 'string' && body.name.trim()) c.name = body.name.trim().slice(0, 80);
    if ((body.status === 'active' || body.status === 'archived') && body.status !== c.status) {
      if (!isOwner(user, c)) return json({ error: 'Only the class owner can archive or restore it.' }, 403);
      c.status = body.status; c.archivedAt = body.status === 'archived' ? now() : null;
    }
    if (body.code !== undefined) {
      const code = body.code === 'new' ? await uniqueCode(env, c.name) : cleanCode(body.code);
      if (!validCode(code)) return json({ error: 'A join code needs 3 to 16 letters, digits or dashes.' }, 400);
      if (code !== c.code && await first(env, 'SELECT 1 FROM classes WHERE code = ?', code)) return json({ error: `The join code ${code} is already in use.` }, 409);
      c.code = code;
    }
    await run(env, 'UPDATE classes SET name = ?, status = ?, archived_at = ?, code = ? WHERE id = ?', c.name, c.status, c.archivedAt, c.code, c.id);
    return json(c);
  }

  // Co-facilitators: the owner (or an admin) adds or removes facilitator accounts by login ID.
  if (path === '/api/classes/facilitators' && M === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'No such class.' }, 404);
    if (!isOwner(user, c)) return json({ error: 'Only the class owner can change its facilitators.' }, 403);
    if (body.add) {
      const f = await getUser(env, cleanId(body.add));
      if (!f) return json({ error: 'No account with that login ID.' }, 404);
      if (!f.facilitator) return json({ error: `${f.name} is a participant. Only facilitator accounts can co-facilitate.` }, 400);
      if (f.id === c.owner) return json({ error: `${f.name} already owns this class.` }, 400);
      await run(env, 'INSERT OR IGNORE INTO class_facilitators (class_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)', c.id, f.id, user.id, now());
    } else if (body.remove) {
      await run(env, 'DELETE FROM class_facilitators WHERE class_id = ? AND user_id = ?', c.id, cleanId(body.remove));
    } else if (body.owner && user.admin) {
      const o = await getUser(env, cleanId(body.owner));
      if (!o?.facilitator) return json({ error: 'The new owner needs a facilitator account.' }, 400);
      await run(env, 'UPDATE classes SET owner_id = ? WHERE id = ?', o.id, c.id);
    } else return json({ error: 'Say who to add or remove.' }, 400);
    return json({ ok: true, facilitators: await coFacilitators(env, c.id) });
  }

  // Per-class deck changes: skip slides and change activity timers for this cohort only.
  if (path === '/api/classes/deck' && M === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'No such class.' }, 404);
    if (!await canManage(env, user, c.id)) return forbidden();
    const lesson = String(body.lesson || '');
    if (!LESSON_IDS.has(lesson)) return json({ error: 'That isn’t a session in this course.' }, 400);
    const n = decks[lesson].length;
    const skip = [...new Set((Array.isArray(body.skip) ? body.skip : []).filter(i => Number.isInteger(i) && i > 0 && i < n))].sort((a, b) => a - b);
    if (skip.length >= n - 1) return json({ error: 'Keep at least the title slide and one other slide.' }, 400);
    const timers = {};
    for (const [k, v] of Object.entries(body.timers || {})) { const i = +k, m = +v; if (Number.isInteger(i) && i >= 0 && i < n && Number.isInteger(m) && m >= 1 && m <= 120) timers[i] = m; }
    const deck = { ...c.deck };
    if (skip.length || Object.keys(timers).length) deck[lesson] = { skip, timers }; else delete deck[lesson];
    await run(env, 'UPDATE classes SET deck_overrides = ? WHERE id = ?', JSON.stringify(deck), c.id);
    return json({ ok: true, deck });
  }

  if (path === '/api/classes/import' && M === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'Choose a class to import into.' }, 404);
    if (!await canManage(env, user, c.id)) return forbidden();
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
    if (!rows.length) return json({ error: 'Paste at least one participant.' }, 400);
    const taken = new Set(), results = [];
    for (const r of rows) {
      const name = String(r.name || '').trim().slice(0, 80);
      if (!name) { results.push({ status: 'skipped', error: 'No name' }); continue; }
      try {
        let id = cleanId(r.login);
        if (id) { if (!validId(id)) throw new Error(`“${id}” is not a valid login ID`); if (taken.has(id) || await first(env, 'SELECT 1 FROM users WHERE id = ?', id)) throw new Error(`Login ID “${id}” is already taken`); taken.add(id); }
        else id = await loginFrom(env, name, taken);
        const password = String(r.password || '').length >= MIN_PASSWORD ? String(r.password) : randomPassword();
        await insertUser(env, { id, name, role: 'participant', classId: c.id, ...await newHash(password), joined: 'import' }).run();
        results.push({ status: 'created', name, id, password });
      } catch (e) { results.push({ status: 'error', name, error: e.message }); }
    }
    return json({ class: c, results });
  }

  if (path === '/api/team' && M === 'GET') {
    const filter = url.searchParams.get('class') || 'mine';
    const users = await scopeUsers(env, user, filter);
    if (!users) return forbidden();
    if (!users.length) return json([]);
    const ids = users.map(u => u.id), ph = placeholders(ids.length);
    const [att, quiz, certs] = await Promise.all([
      all(env, `SELECT user_id, lesson_id, marked_at FROM enrollments_attendance WHERE present = 1 AND user_id IN (${ph})`, ...ids),
      all(env, `SELECT user_id, COUNT(*) AS n FROM quiz_responses WHERE user_id IN (${ph}) GROUP BY user_id`, ...ids),
      all(env, `SELECT user_id, code, status FROM certificates WHERE user_id IN (${ph}) ORDER BY issued_at`, ...ids),
    ]);
    return json(users.map(r => {
      const mine = att.filter(a => a.user_id === r.id && LESSON_IDS.has(a.lesson_id));
      const cert = certs.filter(c => c.user_id === r.id).pop();
      return {
        id: r.id, name: r.name, role: r.role, admin: r.role === 'admin', facilitator: r.role !== 'participant', locked: !!r.locked, classId: r.class_id || null, created: r.created,
        attended: mine.map(a => a.lesson_id), last: mine.map(a => a.marked_at).sort().pop() || null,
        quizzes: quiz.find(q => q.user_id === r.id)?.n || 0, certificate: cert ? { code: cert.code, status: cert.status } : null,
      };
    }));
  }

  // Attendance: mark one participant, or everyone in the class at once ("Mark all present"), for one session.
  if (path === '/api/attendance' && M === 'POST') {
    const classId = String(body.classId || ''), lesson = String(body.lesson || '');
    if (!await canManage(env, user, classId)) return forbidden();
    if (!LESSON_IDS.has(lesson)) return json({ error: 'That isn’t a session in this course.' }, 400);
    const members = (await all(env, "SELECT id FROM users WHERE class_id = ? AND role = 'participant'", classId)).map(r => r.id);
    const targets = Array.isArray(body.userIds) ? body.userIds.map(cleanId).filter(id => members.includes(id)) : members;
    if (!targets.length) return json({ error: 'No participants to mark.' }, 400);
    const at = now();
    await env.DB.batch(targets.map(id => body.present === false
      ? stmt(env, 'DELETE FROM enrollments_attendance WHERE user_id = ? AND lesson_id = ?', id, lesson)
      : stmt(env, `INSERT INTO enrollments_attendance (user_id, lesson_id, class_id, present, marked_by, marked_at) VALUES (?, ?, ?, 1, ?, ?)
          ON CONFLICT (user_id, lesson_id) DO UPDATE SET present = 1, class_id = excluded.class_id, marked_by = excluded.marked_by, marked_at = excluded.marked_at`, id, lesson, classId, user.id, at)));
    return json({ ok: true, marked: targets.length });
  }

  if (path === '/api/users/class' && M === 'POST') {
    const u = await getUser(env, cleanId(body.id));
    if (!u) return json({ error: 'No account with that login ID.' }, 404);
    const to = body.classId ? String(body.classId) : null;
    if (to && !await getClass(env, to)) return json({ error: 'No such class.' }, 404);
    if (!user.admin) {
      if (!await canManageUser(env, user, u) || !to || !await canManage(env, user, to)) return forbidden();
    }
    await run(env, 'UPDATE users SET class_id = ? WHERE id = ?', to, u.id);
    return json(publicUser({ ...u, classId: to }));
  }

  if (path === '/api/users' && M === 'POST') {
    const id = cleanId(body.id), name = String(body.name || '').trim().slice(0, 80), password = String(body.password || '');
    if (!validId(id)) return json({ error: 'The login ID needs 3 to 64 letters, digits or . _ - @, with no spaces.' }, 400);
    if (password.length < MIN_PASSWORD) return json({ error: `The password needs at least ${MIN_PASSWORD} characters.` }, 400);
    const old = await getUser(env, id);
    if (old && !body.replace) return json({ error: `The login ID “${id}” is already taken.` }, 409);
    if (!old && body.replace) return json({ error: 'No account with that login ID.' }, 404);
    if (old) {
      if (id === user.id) return json({ error: 'Change your own password under “Your account”.' }, 400);
      if (!await canManageUser(env, user, old)) return forbidden();
      await setPassword(env, id, await newHash(password));
      await env.USERS.delete('fail:' + id);
      return json(publicUser(old));
    }
    if (!name) return json({ error: 'Enter the participant’s name.' }, 400);
    const role = ['participant', 'facilitator', 'admin'].includes(body.role) ? body.role : body.admin === true ? 'admin' : 'participant';
    if (role !== 'participant' && !user.admin) return json({ error: 'Only an admin can create facilitator accounts.' }, 403);
    const classId = role === 'participant' && body.classId ? String(body.classId) : null;
    if (classId && !await canManage(env, user, classId)) return forbidden();
    if (!classId && role === 'participant' && !user.admin) return json({ error: 'Choose one of your classes for this participant.' }, 400);
    const record = { id, name, role, locked: body.locked === true, classId, ...await newHash(password), joined: 'added', created: now() };
    await insertUser(env, record).run();
    return json(publicUser({ ...record, admin: role === 'admin', facilitator: role !== 'participant' }), 201);
  }

  if (path === '/api/users/remove' && M === 'POST') {
    const id = cleanId(body.id);
    if (id === user.id) return json({ error: 'You can’t remove your own account here. Use “My data and privacy”.' }, 400);
    const u = await getUser(env, id);
    if (!u) return json({ error: 'No account with that login ID.' }, 404);
    if (!await canManageUser(env, user, u)) return forbidden();
    await run(env, 'DELETE FROM users WHERE id = ?', id);   // cascades to everything that person owns
    return json({ ok: true });
  }

  if (path === '/api/certificates/revoke' && M === 'POST') {
    const c = await first(env, 'SELECT * FROM certificates WHERE code = ?', String(body.code || '').toUpperCase());
    if (!c) return json({ error: 'No certificate with that code.' }, 404);
    if (!user.admin && !(c.class_id && await canManage(env, user, c.class_id))) return forbidden();
    const revoke = body.revoke !== false;
    await run(env, 'UPDATE certificates SET status = ?, revoked_at = ?, revoked_by = ? WHERE code = ?', revoke ? 'revoked' : 'valid', revoke ? now() : null, revoke ? user.id : null, c.code);
    return json({ ok: true, status: revoke ? 'revoked' : 'valid' });
  }

  if (path === '/api/classes/report' && M === 'GET') {
    const id = url.searchParams.get('id') || '';
    let c;
    if (id === 'unassigned') { if (!user.admin) return forbidden(); c = { id: 'unassigned', name: 'No class', code: null, status: 'active' }; }
    else { c = await getClass(env, id); if (!c) return json({ error: 'No such class.' }, 404); if (!await canManage(env, user, c.id)) return forbidden(); }
    const users = await all(env, c.id === 'unassigned' ? "SELECT * FROM users WHERE class_id IS NULL AND role = 'participant' ORDER BY name" : "SELECT * FROM users WHERE class_id = ? AND role = 'participant' ORDER BY name", ...(c.id === 'unassigned' ? [] : [c.id]));
    const ids = users.map(u => u.id), ph = placeholders(Math.max(1, ids.length));
    const [att, quiz, certs, polls] = await Promise.all([
      ids.length ? all(env, `SELECT user_id, lesson_id, marked_at FROM enrollments_attendance WHERE present = 1 AND user_id IN (${ph})`, ...ids) : [],
      ids.length ? all(env, `SELECT user_id, lesson_id, choice FROM quiz_responses WHERE user_id IN (${ph})`, ...ids) : [],
      ids.length ? all(env, `SELECT user_id, code, status, completed_on FROM certificates WHERE user_id IN (${ph})`, ...ids) : [],
      all(env, c.id === 'unassigned' ? 'SELECT * FROM polls WHERE class_id IS NULL ORDER BY closed_at DESC LIMIT 500' : 'SELECT * FROM polls WHERE class_id = ? ORDER BY closed_at DESC LIMIT 500', ...(c.id === 'unassigned' ? [] : [c.id])),
    ]);
    const members = users.map(u => ({
      id: u.id, name: u.name,
      attended: att.filter(a => a.user_id === u.id).map(a => ({ lesson: a.lesson_id, at: a.marked_at })),
      quiz: Object.fromEntries(quiz.filter(q => q.user_id === u.id).map(q => [q.lesson_id, q.choice])),
      certificate: certs.find(x => x.user_id === u.id) || null,
    }));
    return json({
      class: { id: c.id, name: c.name, code: c.code, status: c.status }, generated: now(), threshold: certThreshold(env), members,
      polls: polls.map(p => ({ id: p.poll_key, kind: p.kind, q: p.question, o: parse(p.options, []), counts: parse(p.counts, []), entries: parse(p.entries, []), total: p.total, openedAt: p.opened_at, closedAt: p.closed_at })),
      impact: await classImpact(env, c.id === 'unassigned' ? null : c.id, ids),
    });
  }

  return json({ error: 'Not found' }, 404);
}

// ---------- joining with a code (no sign-in needed) ----------
export async function handleJoin(request, env) {
  if (request.method !== 'POST') return joinPage({ code: cleanCode(new URL(request.url).searchParams.get('code') || '') });
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const f = await request.formData();
  const code = cleanCode(f.get('code')), name = String(f.get('name') || '').trim().slice(0, 80), id = cleanId(f.get('login'));
  const password = String(f.get('password') || ''), confirm = String(f.get('confirm') || '');
  const again = error => joinPage({ error, code, name, id });
  if (await rateLimited(env, 'join:' + ip, 20, 900)) return again('Too many attempts from this network. Wait 15 minutes and try again.');
  const c = validCode(code) ? await classByCode(env, code) : null;
  if (!c || c.status !== 'active') return again('That join code is not valid. Check it with your facilitator.');
  if (!name) return again('Enter your name.');
  if (!validId(id)) return again('Choose a login ID of 3 to 64 lowercase letters, digits or . _ - @, with no spaces.');
  if (password.length < MIN_PASSWORD) return again(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== confirm) return again('The two passwords do not match.');
  if (await first(env, 'SELECT 1 FROM users WHERE id = ?', id)) return again(`The login ID “${id}” is already taken. Choose another.`);
  const user = { id, name, role: 'participant', classId: c.id, ...await newHash(password), ver: 1, joined: 'code', created: now() };
  await insertUser(env, user).run();
  return signedInPage('/', await sessionCookie(env, user, f.get('shared') === '1'));
}
