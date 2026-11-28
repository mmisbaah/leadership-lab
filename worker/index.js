// Leadership Lab: sign-in, classes, accounts, progress, check-ins, live polls and backups in front of the static
// app in /public. Accounts, classes, progress and check-ins live in the USERS KV namespace; live polls in the
// PollRoom Durable Object (one room per class); scheduled snapshots in the BACKUPS KV namespace.
import {
  MAX_FAILS, LOCK_SECONDS, MIN_PASSWORD, NOTE_MAX, LESSON_IDS, SESSION_DAYS, COOKIE, unb64u, cleanId, validId, json, secure,
  same, hashPassword, newHash, makeSession, readSession, cookie, getJSON, getUser, putUser, getProgress, publicUser, listUsers,
  progressForFacilitator,
} from './lib.js';
import { loginPage, signedInPage } from './pages.js';
import { classesApi, handleJoin, getClass } from './classes.js';
import { pollApi } from './polls.js';
import { runBackup, listBackups } from './backup.js';

export { PollRoom } from './polls.js';

// Paths anyone may load without signing in.
const PUBLIC = new Set(['/healthz', '/favicon.ico', '/manifest.webmanifest', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png']);
const CHECKIN_MAX = 60, CHECKIN_TEXT = 1500;

const safeNext = n => typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/join') ? n : '/';

async function login(request, env) {
  const form = await request.formData();
  const id = cleanId(form.get('login')), password = String(form.get('password') || ''), next = safeNext(form.get('next'));
  const failKey = 'fail:' + id, fails = +(await env.USERS.get(failKey) || 0);
  if (fails >= MAX_FAILS) return loginPage({ error: 'Too many wrong passwords for this login ID. Wait 15 minutes and try again.', id, next });
  const user = validId(id) ? await getUser(env, id) : null;
  const salt = user?.salt ? unb64u(user.salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt, user?.iter);
  if (!user || !user.hash || !same(hash, user.hash)) {
    if (validId(id)) await env.USERS.put(failKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
    return loginPage({ error: 'That login ID and password don’t match.', id, next });
  }
  if (fails) await env.USERS.delete(failKey);
  return signedInPage(next, cookie(await makeSession(env, user), SESSION_DAYS * 86400));
}

function cleanEntry(raw) {
  const e = {};
  if (typeof raw?.note === 'string' && raw.note.trim()) e.note = raw.note.slice(0, NOTE_MAX);
  if (Number.isInteger(raw?.choice) && raw.choice >= 0 && raw.choice < 6) e.choice = raw.choice;
  if (raw?.done === true) { e.done = true; e.doneAt = typeof raw.doneAt === 'string' ? raw.doneAt.slice(0, 30) : new Date().toISOString(); }
  return e;
}
function cleanCheckin(raw) {
  const t = v => String(v || '').trim().slice(0, CHECKIN_TEXT);
  const rating = Number.isInteger(raw?.rating) && raw.rating >= 1 && raw.rating <= 5 ? raw.rating : null;
  if (!rating) return null;
  return { at: new Date().toISOString(), rating, helped: t(raw.helped), blocked: t(raw.blocked), next: t(raw.next) };
}

async function api(request, env, user, path, url) {
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/api/me' && request.method === 'GET') {
    const c = user.classId ? await getClass(env, user.classId) : null;
    return json({ ...publicUser(user), className: c?.name || null });
  }

  if (path === '/api/password' && request.method === 'POST') {
    // Demo accounts are shared, so nobody signed in to one may change its password. A facilitator can still reset it.
    if (user.locked) return json({ error: 'This is a demo account, so its password can’t be changed.' }, 403);
    const { current = '', next = '' } = body;
    if (!same(await hashPassword(String(current), unb64u(user.salt), user.iter), user.hash)) return json({ error: 'Your current password is wrong.' }, 400);
    if (String(next).length < MIN_PASSWORD) return json({ error: `Use at least ${MIN_PASSWORD} characters.` }, 400);
    const updated = { ...user, ...await newHash(String(next)), ver: user.ver + 1 };
    await putUser(env, updated);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(await makeSession(env, updated), SESSION_DAYS * 86400) });
  }

  // Your own progress (with your private notes). Only ever your own.
  if (path === '/api/progress') {
    const key = 'progress:' + user.id;
    const progress = await getProgress(env, user.id);
    if (request.method === 'GET') return json({ progress });
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
    if (body.reset === true) { await env.USERS.delete(key); return json({ ok: true, progress: {} }); }
    const lesson = String(body.lesson || '');
    if (!LESSON_IDS.has(lesson)) return json({ error: 'That isn’t a session in this course.' }, 400);
    if (typeof body.entry?.note === 'string' && body.entry.note.length > NOTE_MAX) return json({ error: `Keep a note under ${NOTE_MAX} characters.` }, 400);
    const entry = cleanEntry(body.entry);
    if (Object.keys(entry).length) progress[lesson] = entry; else delete progress[lesson];
    if (Object.keys(progress).length) await env.USERS.put(key, JSON.stringify(progress)); else await env.USERS.delete(key);
    return json({ ok: true, progress });
  }

  // 30-day check-ins: private to the participant, like notes. No facilitator endpoint reads them.
  if (path === '/api/checkins') {
    const key = 'checkin:' + user.id, list = await getJSON(env, key, []);
    if (request.method === 'GET') return json({ checkins: list });
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
    const entry = cleanCheckin(body);
    if (!entry) return json({ error: 'Rate how well you followed through, from 1 to 5.' }, 400);
    list.push(entry); while (list.length > CHECKIN_MAX) list.shift();
    await env.USERS.put(key, JSON.stringify(list));
    return json({ ok: true, checkins: list });
  }

  if (path.startsWith('/api/poll/')) return pollApi(request, env, user, path, body, url, async id => !!await getClass(env, id));

  // Everything below is for facilitators only.
  if (!/^\/api\/(users|team|classes|admin)/.test(path)) return json({ error: 'Not found' }, 404);
  if (!user.admin) return json({ error: 'Only a facilitator can manage accounts.' }, 403);

  if (path.startsWith('/api/classes') || path === '/api/users/class') return classesApi(request, env, user, path, body, url);

  if (path === '/api/team' && request.method === 'GET') {
    const filter = url.searchParams.get('class') || 'all';
    const users = (await listUsers(env)).filter(u => filter === 'all' || (filter === 'unassigned' ? !u.classId : u.classId === filter));
    const rows = await Promise.all(users.map(async u => {
      const p = progressForFacilitator(await getProgress(env, u.id));
      const done = Object.entries(p).filter(([, v]) => v.done).map(([k]) => k);
      const last = Object.values(p).map(v => v.doneAt || '').sort().pop() || null;
      return { ...publicUser(u), done, quizzes: Object.values(p).filter(v => Number.isInteger(v.choice)).length, last };
    }));
    return json(rows);
  }

  if (path === '/api/users' && request.method === 'POST') {
    const id = cleanId(body.id), name = String(body.name || '').trim().slice(0, 80), password = String(body.password || '');
    if (!validId(id)) return json({ error: 'The login ID needs 3 to 64 letters, digits or . _ - @, with no spaces.' }, 400);
    if (password.length < MIN_PASSWORD) return json({ error: `The password needs at least ${MIN_PASSWORD} characters.` }, 400);
    const old = await getUser(env, id);
    if (old && !body.replace) return json({ error: `The login ID “${id}” is already taken.` }, 409);
    if (!old && body.replace) return json({ error: 'No account with that login ID.' }, 404);
    if (!old && !name) return json({ error: 'Enter the participant’s name.' }, 400);
    if (old && id === user.id) return json({ error: 'Change your own password under “Your account”.' }, 400);
    const classId = old ? old.classId || null : (body.classId && await getClass(env, String(body.classId)) ? String(body.classId) : null);
    const record = {
      id, name: name || old.name, admin: old ? old.admin : body.admin === true, locked: old ? !!old.locked : body.locked === true, classId,
      ...await newHash(password), ver: (old?.ver || 0) + 1, created: old?.created || new Date().toISOString(),
    };
    await putUser(env, record);
    await env.USERS.delete('fail:' + id);
    return json(publicUser(record), old ? 200 : 201);
  }

  if (path === '/api/users/remove' && request.method === 'POST') {
    const id = cleanId(body.id);
    if (id === user.id) return json({ error: 'You can’t remove your own account.' }, 400);
    if (!await getUser(env, id)) return json({ error: 'No account with that login ID.' }, 404);
    await Promise.all(['user:', 'progress:', 'checkin:'].map(p => env.USERS.delete(p + id)));
    return json({ ok: true });
  }

  if (path === '/api/admin/backups' && request.method === 'GET') return json({ backups: await listBackups(env), encrypted: !!env.BACKUP_KEY });
  if (path === '/api/admin/backup' && request.method === 'POST') {
    try { return json(await runBackup(env)); } catch (e) { return json({ error: e.message }, 500); }
  }

  return json({ error: 'Not found' }, 404);
}

async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname;
  const navigating = request.headers.get('Sec-Fetch-Mode') === 'navigate' || (request.headers.get('Accept') || '').includes('text/html');

  if (path === '/healthz') {
    const sw = await (await env.ASSETS.fetch(new URL('/sw.js', url))).text();
    return json({ ok: true, version: (sw.match(/const VERSION = '([^']+)'/) || [])[1] || null });
  }
  if (PUBLIC.has(path)) return env.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.headers.get('Origin') !== url.origin) return json({ error: 'Request blocked' }, 403);

  if (path === '/login') {
    if (request.method === 'POST') return login(request, env);
    const current = await readSession(env, request);
    if (current && !url.searchParams.has('switch')) return Response.redirect(new URL('/', url), 303);
    return loginPage({ next: safeNext(url.searchParams.get('next')), current: current?.i || '' });
  }
  if (path === '/join') return handleJoin(request, env);
  if (path === '/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });

  const session = await readSession(env, request);
  let user = null;
  if (session && (navigating || path.startsWith('/api/'))) {
    user = await getUser(env, session.i);
    if (!user || user.ver !== session.v) user = null;
  }
  const signedIn = session && (user || !(navigating || path.startsWith('/api/')));
  if (!signedIn) {
    const ended = (request.headers.get('Cookie') || '').includes(COOKIE + '=');
    const clear = ended ? { 'Set-Cookie': cookie('', 0) } : {};
    if (path.startsWith('/api/')) return json({ error: 'Sign in first' }, 401, clear);
    if (navigating) {
      const r = loginPage({ next: path + url.search, error: ended ? 'Your session has ended. Sign in again.' : '' });
      Object.entries(clear).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    return new Response('Sign in first', { status: 401, headers: { 'Cache-Control': 'no-store', ...clear } });
  }
  if (path.startsWith('/api/')) return api(request, env, user, path, url);
  return env.ASSETS.fetch(request);
}

export default {
  // Every response, static files included, leaves with the security headers.
  async fetch(request, env) { return secure(await handle(request, env)); },
  // Daily snapshot (schedule in wrangler.jsonc).
  async scheduled(event, env, ctx) { ctx.waitUntil(runBackup(env)); },
};
