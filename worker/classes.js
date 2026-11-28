// Classes (cohorts): join codes, self-service joining, bulk import, and the facilitator report.
// KV keys: class:<id> → class record, code:<CODE> → class id. Participants carry classId on their user record.
import {
  json, getJSON, getUser, putUser, newHash, cleanId, validId, MIN_PASSWORD, listKeys, listUsers, getProgress,
  progressForFacilitator, publicUser, randomPassword, makeSession, cookie, SESSION_DAYS, rateLimited,
} from './lib.js';
import { joinPage, signedInPage } from './pages.js';
import { roomFetch } from './polls.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const validCode = c => /^[A-Z0-9][A-Z0-9-]{2,15}$/.test(c);
export const cleanCode = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
export const getClass = (env, id) => getJSON(env, 'class:' + id);
const putClass = (env, c) => env.USERS.put('class:' + c.id, JSON.stringify(c));

export async function listClasses(env) {
  const keys = await listKeys(env, 'class:');
  const all = (await Promise.all(keys.map(k => getJSON(env, k)))).filter(Boolean);
  return all.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}
// Human-friendly code: initials of the class name and three random characters, e.g. "LL-7KQ".
async function uniqueCode(env, name) {
  const initials = (String(name).match(/[A-Za-z0-9]+/g) || ['LL']).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'LL';
  for (let i = 0; i < 20; i++) {
    const tail = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    const code = `${initials}-${tail}`;
    if (!await env.USERS.get('code:' + code)) return code;
  }
  throw new Error('Could not make a unique join code. Try again.');
}
async function loginFrom(env, name, taken) {
  const base = String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40) || 'participant';
  for (let n = 0; n < 500; n++) {
    const id = n ? `${base}${n + 1}` : base;
    if (validId(id) && !taken.has(id) && !await getUser(env, id)) { taken.add(id); return id; }
  }
  throw new Error('Could not make a login ID for ' + name);
}

// ---------- facilitator API ----------
export async function classesApi(request, env, user, path, body, url) {
  if (path === '/api/classes' && request.method === 'GET') {
    const [classes, users] = await Promise.all([listClasses(env), listUsers(env)]);
    const count = id => users.filter(u => u.classId === id).length;
    return json({ classes: classes.map(c => ({ ...c, members: count(c.id) })), unassigned: users.filter(u => !u.classId && !u.admin).length });
  }
  if (path === '/api/classes' && request.method === 'POST') {
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return json({ error: 'Give the class a name.' }, 400);
    let code = body.code ? cleanCode(body.code) : await uniqueCode(env, name);
    if (!validCode(code)) return json({ error: 'A join code needs 3 to 16 letters, digits or dashes.' }, 400);
    if (await env.USERS.get('code:' + code)) return json({ error: `The join code ${code} is already in use.` }, 409);
    const c = { id: crypto.randomUUID().slice(0, 8), name, code, owner: user.id, status: 'active', created: new Date().toISOString() };
    await putClass(env, c); await env.USERS.put('code:' + code, c.id);
    return json(c, 201);
  }
  if (path === '/api/classes/update' && request.method === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'No such class.' }, 404);
    if (typeof body.name === 'string' && body.name.trim()) c.name = body.name.trim().slice(0, 80);
    if (body.status === 'active' || body.status === 'archived') c.status = body.status;
    if (body.code !== undefined) {
      const code = body.code === 'new' ? await uniqueCode(env, c.name) : cleanCode(body.code);
      if (!validCode(code)) return json({ error: 'A join code needs 3 to 16 letters, digits or dashes.' }, 400);
      if (code !== c.code) {
        if (await env.USERS.get('code:' + code)) return json({ error: `The join code ${code} is already in use.` }, 409);
        await env.USERS.delete('code:' + c.code); await env.USERS.put('code:' + code, c.id); c.code = code;
      }
    }
    await putClass(env, c);
    return json(c);
  }
  if (path === '/api/classes/import' && request.method === 'POST') {
    const c = await getClass(env, String(body.id || ''));
    if (!c) return json({ error: 'Choose a class to import into.' }, 404);
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 300) : [];
    if (!rows.length) return json({ error: 'Paste at least one participant.' }, 400);
    const taken = new Set(), results = [];
    for (const r of rows) {
      const name = String(r.name || '').trim().slice(0, 80);
      if (!name) { results.push({ status: 'skipped', error: 'No name' }); continue; }
      try {
        let id = cleanId(r.login);
        if (id) { if (!validId(id)) throw new Error(`“${id}” is not a valid login ID`); if (taken.has(id) || await getUser(env, id)) throw new Error(`Login ID “${id}” is already taken`); taken.add(id); }
        else id = await loginFrom(env, name, taken);
        const password = String(r.password || '').length >= MIN_PASSWORD ? String(r.password) : randomPassword();
        await putUser(env, { id, name, admin: false, locked: false, classId: c.id, ...await newHash(password), ver: 1, created: new Date().toISOString() });
        results.push({ status: 'created', name, id, password });
      } catch (e) { results.push({ status: 'error', name, error: e.message }); }
    }
    return json({ class: c, results });
  }
  if (path === '/api/classes/report' && request.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const c = id === 'unassigned' ? { id: 'unassigned', name: 'No class', code: null, status: 'active' } : await getClass(env, id);
    if (!c) return json({ error: 'No such class.' }, 404);
    const users = (await listUsers(env)).filter(u => (c.id === 'unassigned' ? !u.classId && !u.admin : u.classId === c.id));
    const members = await Promise.all(users.map(async u => ({ ...publicUser(u), progress: progressForFacilitator(await getProgress(env, u.id)) })));
    const history = env.POLLS ? (await (await roomFetch(env, c.id === 'unassigned' ? 'unassigned' : 'class:' + c.id, 'history', {})).json()).history || [] : [];
    return json({ class: c, generated: new Date().toISOString(), members, polls: history });
  }
  if (path === '/api/users/class' && request.method === 'POST') {
    const u = await getUser(env, cleanId(body.id));
    if (!u) return json({ error: 'No account with that login ID.' }, 404);
    if (body.classId && !await getClass(env, String(body.classId))) return json({ error: 'No such class.' }, 404);
    u.classId = body.classId ? String(body.classId) : null;
    await putUser(env, u);
    return json(publicUser(u));
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
  const classId = validCode(code) ? await env.USERS.get('code:' + code) : null;
  const c = classId ? await getClass(env, classId) : null;
  if (!c || c.status !== 'active') return again('That join code is not valid. Check it with your facilitator.');
  if (!name) return again('Enter your name.');
  if (!validId(id)) return again('Choose a login ID of 3 to 64 lowercase letters, digits or . _ - @, with no spaces.');
  if (password.length < MIN_PASSWORD) return again(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== confirm) return again('The two passwords do not match.');
  if (await getUser(env, id)) return again(`The login ID “${id}” is already taken. Choose another.`);
  const user = { id, name, admin: false, locked: false, classId: c.id, ...await newHash(password), ver: 1, created: new Date().toISOString(), joined: 'code' };
  await putUser(env, user);
  return signedInPage('/', cookie(await makeSession(env, user), SESSION_DAYS * 86400));
}
