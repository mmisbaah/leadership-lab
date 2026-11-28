// Shared helpers for the Leadership Lab Worker: responses, security headers, passwords, sessions and storage.

export const COOKIE = 'll_session';
export const SESSION_DAYS = 30;
export const ITERATIONS = 100000;
export const MAX_FAILS = 8;
export const LOCK_SECONDS = 900;
export const MIN_PASSWORD = 8;
export const NOTE_MAX = 4000;
export const LESSON_IDS = new Set(['foundations', 'functional', 'followership', 'communication', 'trust', 'feedback', 'teamwork', 'delegation', 'motivation', 'decisions', 'capstone', 'commitment']);

export const te = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const cleanId = e => String(e || '').trim().toLowerCase();
export const validId = e => /^[a-z0-9._@-]{3,64}$/.test(e);
const PW_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const randomPassword = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => PW_CHARS[b % PW_CHARS.length]).join('');

// ---------- security headers ----------
// The app's only inline script is the theme bootstrap in public/index.html; it is allowed by hash, not by
// 'unsafe-inline'. tests/content.test.mjs fails if the script changes without this hash being updated.
export const INDEX_SCRIPT_HASH = "'sha256-i40WxYyvg/cZgDXRxXCn/kbBFKn8WHoAjVgmTLCFCUE='";
// Inline style attributes (slide colours, bar widths) need style 'unsafe-inline'; scripts never do.
export const CSP = [
  "default-src 'self'", `script-src 'self' ${INDEX_SCRIPT_HASH}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'",
  "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');
export const SECURITY = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000',
};
// Add the security headers to any response, including static assets.
export function secure(response) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY)) r.headers.set(k, v);
  return r;
}
export const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY, ...extra } });
export const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY, ...extra } });

// ---------- passwords and sessions ----------
export function same(a, b) {
  const x = te.encode(a), y = te.encode(b);
  if (x.length !== y.length) return false;
  return crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(x, y) : x.every((v, i) => v === y[i]);
}
export async function hashPassword(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export async function newHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64u(salt), hash: await hashPassword(password, salt), iter: ITERATIONS };
}
let signingKey = null;
async function sessionKey(env) {
  if (signingKey) return signingKey;
  let raw = env.SESSION_SECRET ? te.encode(env.SESSION_SECRET) : null;
  if (!raw) {
    let stored = await env.USERS.get('config:session-key');
    if (!stored) { stored = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.USERS.put('config:session-key', stored); }
    raw = unb64u(stored);
  }
  signingKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return signingKey;
}
const sign = async (env, data) => b64u(await crypto.subtle.sign('HMAC', await sessionKey(env), te.encode(data)));
export async function makeSession(env, user) {
  const body = b64u(te.encode(JSON.stringify({ i: user.id, v: user.ver, x: Date.now() + SESSION_DAYS * 864e5 })));
  return `${body}.${await sign(env, body)}`;
}
export async function readSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, mac] = m[1].split('.');
  if (!body || !mac || !same(mac, await sign(env, body))) return null;
  try { const s = JSON.parse(new TextDecoder().decode(unb64u(body))); return s.x > Date.now() ? s : null; } catch { return null; }
}
export const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- storage ----------
export const getJSON = async (env, key, fallback = null) => { const v = await env.USERS.get(key); return v ? JSON.parse(v) : fallback; };
export const getUser = (env, id) => getJSON(env, 'user:' + id);
export const putUser = (env, u) => env.USERS.put('user:' + u.id, JSON.stringify(u));
export const getProgress = (env, id) => getJSON(env, 'progress:' + id, {});
export const publicUser = u => ({ id: u.id, name: u.name, admin: !!u.admin, locked: !!u.locked, classId: u.classId || null, created: u.created });
export async function listKeys(env, prefix, ns = env.USERS) {
  const out = []; let cursor;
  do { const page = await ns.list({ prefix, cursor }); page.keys.forEach(k => out.push(k.name)); cursor = page.list_complete ? null : page.cursor; } while (cursor);
  return out;
}
export async function listUsers(env) {
  const ids = (await listKeys(env, 'user:')).map(k => k.slice(5));
  const users = (await Promise.all(ids.map(id => getUser(env, id)))).filter(Boolean);
  return users.sort((a, b) => a.name.localeCompare(b.name));
}
// What a facilitator may see of someone's progress: completion and quiz answers only. Private notes and
// reflections never leave this function, so no facilitator endpoint can read, list or export them.
export function progressForFacilitator(p) {
  const out = {};
  for (const [lesson, e] of Object.entries(p || {})) {
    if (!LESSON_IDS.has(lesson)) continue;
    const v = {};
    if (e.done) { v.done = true; v.doneAt = e.doneAt || null; }
    if (Number.isInteger(e.choice)) v.choice = e.choice;
    out[lesson] = v;
  }
  return out;
}
// Simple fixed-window rate limit in KV (approximate; enough to slow down guessing).
export async function rateLimited(env, key, max, seconds) {
  const n = +(await env.USERS.get('rl:' + key) || 0);
  if (n >= max) return true;
  await env.USERS.put('rl:' + key, String(n + 1), { expirationTtl: Math.max(60, seconds) });
  return false;
}
