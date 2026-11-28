// Leadership Lab Worker: sign-in, classes, progress, attendance, certificates, live polls, backups and health, in front
// of the static app in /public. People, classes and progress live in D1 (binding DB, schema in migrations/); live
// polls in the PollRoom Durable Object (one room per class); nightly snapshots in the BACKUPS KV namespace; sign-in
// lockouts and rate limits in the USERS KV namespace.
import {
  MAX_FAILS, LOCK_SECONDS, MIN_PASSWORD, COOKIE, unb64u, cleanId, validId, json, secure, same, hashPassword, newHash,
  readSession, cookie, sessionCookie, rateLimited, alert,
} from './lib.js';
import { getUser, publicUser, setPassword, getClass, first, certThreshold, attendedLessons } from './db.js';
import { loginPage, signedInPage, verifyPage } from './pages.js';
import { classesApi, handleJoin } from './classes.js';
import { participantApi } from './participant.js';
import { pollApi } from './polls.js';
import { listBackups, runBackup, purgeArchived, nightly, health } from './backup.js';

export { PollRoom } from './polls.js';

// Paths anyone may load without signing in.
const PUBLIC = new Set(['/healthz', '/favicon.ico', '/manifest.webmanifest', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png']);
const safeNext = n => typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/join') ? n : '/';
const version = async (env, url) => ((await (await env.ASSETS.fetch(new URL('/sw.js', url))).text()).match(/const VERSION = '([^']+)'/) || [])[1] || null;

async function login(request, env) {
  const form = await request.formData();
  const id = cleanId(form.get('login')), password = String(form.get('password') || ''), next = safeNext(form.get('next')), shared = form.get('shared') === '1';
  const failKey = 'fail:' + id, fails = +(await env.USERS.get(failKey) || 0);
  if (fails >= MAX_FAILS) return loginPage({ error: 'Too many wrong passwords for this login ID. Wait 15 minutes and try again.', id, next, shared });
  const user = validId(id) ? await getUser(env, id) : null;
  const salt = user?.salt ? unb64u(user.salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt, user?.iter);
  if (!user || !same(hash, user.hash)) {
    if (validId(id)) await env.USERS.put(failKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
    return loginPage({ error: 'That login ID and password don’t match.', id, next, shared });
  }
  if (fails) await env.USERS.delete(failKey);
  return signedInPage(next, await sessionCookie(env, user, shared));
}

async function api(request, env, user, session, path, url) {
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/api/me' && request.method === 'GET') {
    const c = user.classId ? await getClass(env, user.classId) : null;
    return json({
      ...publicUser(user), shared: !!session.s, className: c?.name || null, classCode: c?.code || null, classDeck: c?.deck || {},
      attended: (await attendedLessons(env, user.id)).map(a => a.lesson_id), threshold: certThreshold(env),
    });
  }

  if (path === '/api/password' && request.method === 'POST') {
    // Demo accounts are shared, so nobody signed in to one may change its password. A facilitator can still reset it.
    if (user.locked) return json({ error: 'This is a demo account, so its password can’t be changed.' }, 403);
    const { current = '', next = '' } = body;
    if (!same(await hashPassword(String(current), unb64u(user.salt), user.iter), user.hash)) return json({ error: 'Your current password is wrong.' }, 400);
    if (String(next).length < MIN_PASSWORD) return json({ error: `Use at least ${MIN_PASSWORD} characters.` }, 400);
    await setPassword(env, user.id, await newHash(String(next)));
    return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env, { ...user, ver: user.ver + 1 }, !!session.s) });
  }

  const own = await participantApi(request, env, user, path, body);
  if (own === null) return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });   // account deleted
  if (own) return own;

  if (path.startsWith('/api/poll/')) return pollApi(request, env, user, path, body, url);

  // Everything below is for facilitators; /api/admin is for admins only.
  if (!/^\/api\/(users|team|classes|attendance|certificates|admin)/.test(path)) return json({ error: 'Not found' }, 404);
  if (!user.facilitator) return json({ error: 'Only a facilitator can do that.' }, 403);
  if (path.startsWith('/api/admin')) {
    if (!user.admin) return json({ error: 'Only an admin can do that.' }, 403);
    if (path === '/api/admin/backups' && request.method === 'GET') return json({ backups: await listBackups(env), encrypted: !!env.BACKUP_KEY });
    if (path === '/api/admin/backup' && request.method === 'POST') return json(await runBackup(env));
    if (path === '/api/admin/maintenance' && request.method === 'POST' && body.task === 'retention') {
      const asOf = body.asOf ? new Date(body.asOf) : new Date();
      if (isNaN(asOf)) return json({ error: 'asOf is not a date.' }, 400);
      return json(await purgeArchived(env, asOf));
    }
    return json({ error: 'Not found' }, 404);
  }
  return classesApi(request, env, user, path, body, url);
}

async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname;
  const navigating = request.headers.get('Sec-Fetch-Mode') === 'navigate' || (request.headers.get('Accept') || '').includes('text/html');

  if (path === '/healthz') return json({ ok: true, version: await version(env, url) });
  if (path === '/api/health') { const h = await health(env, await version(env, url)); return json(h, h.ok ? 200 : 503); }
  if (PUBLIC.has(path)) return env.ASSETS.fetch(request);

  // Public certificate verification, rate-limited so codes can't be enumerated.
  if (path === '/verify' || path.startsWith('/verify/')) {
    const code = decodeURIComponent(path.slice(8) || url.searchParams.get('code') || '').trim().toUpperCase();
    if (path === '/verify' && code) return Response.redirect(new URL('/verify/' + encodeURIComponent(code), url), 303);
    if (!code) return verifyPage(null, '');
    if (await rateLimited(env, 'verify:' + (request.headers.get('CF-Connecting-IP') || 'local'), 60, 600)) return json({ error: 'Too many checks. Wait a few minutes.' }, 429);
    return verifyPage(/^LL-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? await first(env, 'SELECT * FROM certificates WHERE code = ?', code) : null, code);
  }

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
  if (path.startsWith('/api/')) return api(request, env, user, session, path, url);
  return env.ASSETS.fetch(request);
}

export default {
  // Every response, static files included, leaves with the security headers. Unhandled errors are logged as JSON
  // and sent to ALERT_WEBHOOK_URL when it is set.
  async fetch(request, env, ctx) {
    try { return secure(await handle(request, env)); }
    catch (e) {
      const p = new URL(request.url).pathname;
      ctx?.waitUntil?.(alert(env, 'Unhandled error', { message: String(e?.stack || e).slice(0, 2000), path: p, method: request.method }));
      return secure(json({ error: 'Something went wrong on the server. It has been logged.' }, 500));
    }
  },
  // Nightly backup and retention purge (schedule in wrangler.jsonc).
  async scheduled(event, env, ctx) { ctx.waitUntil(nightly(env)); },
};
