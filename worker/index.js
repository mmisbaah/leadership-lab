// Leadership Lab: sign-in, accounts and progress sync in front of the static app in /public.
// Accounts, sessions and progress live in the USERS KV namespace.

const COOKIE = 'll_session';
const SESSION_DAYS = 30;
const ITERATIONS = 100000;
const MAX_FAILS = 8;
const LOCK_SECONDS = 900;
const MIN_PASSWORD = 8;
const NOTE_MAX = 4000;
const LESSON_IDS = new Set(['foundations', 'functional', 'followership', 'communication', 'trust', 'feedback', 'teamwork', 'delegation', 'motivation', 'decisions', 'capstone', 'commitment']);
const PUBLIC = new Set(['/healthz', '/favicon.ico', '/manifest.webmanifest', '/assets/icon.svg', '/assets/icon-192.png', '/assets/icon-512.png']);

const te = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cleanId = e => String(e || '').trim().toLowerCase();
const validId = e => /^[a-z0-9._@-]{3,64}$/.test(e);
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY, ...extra } });

function same(a, b) {
  const x = te.encode(a), y = te.encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(x, y) : x.every((v, i) => v === y[i]);
}

async function hashPassword(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

async function newHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64u(salt), hash: await hashPassword(password, salt), iter: ITERATIONS };
}

let signingKey = null;
async function sessionKey(env) {
  if (signingKey) return signingKey;
  let raw = env.SESSION_SECRET ? te.encode(env.SESSION_SECRET) : null;
  if (!raw) {
    let stored = await env.USERS.get('config:session-key');
    if (!stored) {
      stored = b64u(crypto.getRandomValues(new Uint8Array(32)));
      await env.USERS.put('config:session-key', stored);
    }
    raw = unb64u(stored);
  }
  signingKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return signingKey;
}

const sign = async (env, data) => b64u(await crypto.subtle.sign('HMAC', await sessionKey(env), te.encode(data)));

async function makeSession(env, user) {
  const body = b64u(te.encode(JSON.stringify({ i: user.id, v: user.ver, x: Date.now() + SESSION_DAYS * 864e5 })));
  return `${body}.${await sign(env, body)}`;
}

async function readSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, mac] = m[1].split('.');
  if (!body || !mac || !same(mac, await sign(env, body))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return s.x > Date.now() ? s : null;
  } catch { return null; }
}

const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const getUser = async (env, id) => { const u = await env.USERS.get('user:' + id); return u ? JSON.parse(u) : null; };
const putUser = (env, u) => env.USERS.put('user:' + u.id, JSON.stringify(u));
const getProgress = async (env, id) => JSON.parse(await env.USERS.get('progress:' + id) || '{}');
const publicUser = u => ({ id: u.id, name: u.name, admin: !!u.admin, locked: !!u.locked, created: u.created });

async function listUsers(env) {
  const ids = [];
  let cursor;
  do {
    const page = await env.USERS.list({ prefix: 'user:', cursor });
    page.keys.forEach(k => ids.push(k.name.slice(5)));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const users = (await Promise.all(ids.map(id => getUser(env, id)))).filter(Boolean);
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#142440"/><circle cx="32" cy="32" r="19" fill="none" stroke="#C99A3E" stroke-width="3"/><path d="M25 21v22h15" fill="none" stroke="#F3D58F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function loginPage({ error = '', id = '', next = '/', current = '' } = {}) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Leadership Lab</title><meta name="theme-color" content="#142440"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest">
<style>
:root{--ink:#16213A;--ink2:#56627A;--paper:#E4E9F0;--card:#fff;--navy:#13223F;--gold:#8E6512;--bad:#A3312A;--line:#D5DBE3}
@media (prefers-color-scheme:dark){:root{--ink:#E5EAF2;--ink2:#A3AFC2;--paper:#0C1422;--card:#132036;--gold:#E0AE4C;--bad:#F08A80;--line:#24324A}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;box-shadow:0 10px 30px rgba(20,36,64,.08)}
.brand{display:flex;gap:12px;align-items:center;margin-bottom:20px}.brand svg{width:44px;height:44px;flex:none}
.brand small{display:block;color:var(--gold);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700}.brand b{font-size:1.25rem}
label{display:block;font-weight:600;font-size:.86rem;margin:14px 0 6px}input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink)}
input:focus{outline:2px solid var(--gold);outline-offset:1px}button{margin-top:20px;width:100%;font:inherit;font-weight:700;padding:12px;border:0;border-radius:10px;background:var(--navy);color:#fff;cursor:pointer}
@media (prefers-color-scheme:dark){button{background:var(--gold);color:#142440}}
.err{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:.88rem;margin-bottom:6px}
p.note{color:var(--ink2);font-size:.82rem;margin:18px 0 0}p.note a{color:var(--gold);font-weight:600}
</style></head><body><main>
<div class="brand">${MARK}<div><small>Leadership training</small><b>Leadership Lab</b></div></div>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}">
<label for="login">Login ID</label><input id="login" name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${esc(id)}" ${id ? '' : 'autofocus'}>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required ${id ? 'autofocus' : ''}>
<button type="submit">Sign in</button></form>
${current ? `<p class="note">You're signed in as <b>${esc(current)}</b>. Sign in with another login to switch, or <a href="/">go back to the course</a>.</p>` : ''}
<p class="note">No login yet, or forgot your password? Ask your facilitator.</p>
</main></body></html>`, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY } });
}

function signedInPage(next, setCookie) {
  const to = JSON.stringify(next).replace(/</g, '\\u003c');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing in…</title><meta http-equiv="refresh" content="0;url=${esc(next)}"><style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#E4E9F0;color:#16213A}</style></head>
<body><p>Signing in… <a href="${esc(next)}">Continue</a></p><script>location.replace(${to})</script></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': setCookie, ...SECURITY } });
}

const safeNext = n => typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/';

async function login(request, env) {
  const form = await request.formData();
  const id = cleanId(form.get('login')), password = String(form.get('password') || ''), next = safeNext(form.get('next'));
  const failKey = 'fail:' + id, fails = +(await env.USERS.get(failKey) || 0);
  if (fails >= MAX_FAILS) return loginPage({ error: 'Too many wrong passwords for this login ID. Wait 15 minutes and try again.', id, next });
  const user = validId(id) ? await getUser(env, id) : null;
  const salt = user ? unb64u(user.salt) : new Uint8Array(16);
  const hash = await hashPassword(password, salt, user?.iter || ITERATIONS);
  if (!user || !same(hash, user.hash)) {
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

async function api(request, env, user, path) {
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  if (path === '/api/me' && request.method === 'GET') return json(publicUser(user));

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

  if (!path.startsWith('/api/users') && path !== '/api/team') return json({ error: 'Not found' }, 404);
  if (!user.admin) return json({ error: 'Only a facilitator can manage accounts.' }, 403);

  if (path === '/api/team' && request.method === 'GET') {
    const users = await listUsers(env);
    const rows = await Promise.all(users.map(async u => {
      const p = await getProgress(env, u.id);
      const done = Object.entries(p).filter(([, v]) => v.done).map(([k]) => k);
      const last = Object.values(p).map(v => v.doneAt || '').sort().pop() || null;
      return { ...publicUser(u), done, notes: Object.values(p).filter(v => v.note).length, last };
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
    const record = {
      id, name: name || old.name, admin: old ? old.admin : body.admin === true, locked: old ? !!old.locked : body.locked === true,
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
    await env.USERS.delete('user:' + id);
    await env.USERS.delete('progress:' + id);
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
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
    if (path.startsWith('/api/')) return api(request, env, user, path);
    return env.ASSETS.fetch(request);
  },
};
