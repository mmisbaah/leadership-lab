// Shared helpers for the Leadership Lab Worker: responses, security headers, passwords, sessions and storage.

export const COOKIE = 'll_session';
export const SESSION_DAYS = 30;
export const ITERATIONS = 100000;
export const MAX_FAILS = 8;
export const LOCK_SECONDS = 900;
export const MIN_PASSWORD = 8;
export const NOTE_MAX = 4000;

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
export const INDEX_SCRIPT_HASH = "'sha256-NcUissmvTykr0+IHawT1CqhwzLD+5JXHEDS5wg+cUYk='";
// Inline style attributes (slide colours, bar widths) need style 'unsafe-inline'; scripts never do.
export const CSP = [
  // Cloudflare Web Analytics (enabled on the zone) injects its cookieless beacon; it is the only third-party script allowed.
  "default-src 'self'", `script-src 'self' ${INDEX_SCRIPT_HASH} https://static.cloudflareinsights.com`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", "connect-src 'self' https://cloudflareinsights.com", "manifest-src 'self'", "worker-src 'self'", "frame-ancestors 'none'",
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
// Shared-computer sessions (s: 1) last at most 12 hours and travel in a cookie with no Max-Age, so the browser drops
// it when it closes. Normal sessions last SESSION_DAYS.
export const SHARED_HOURS = 12;
export async function makeSession(env, user, shared = false) {
  const life = shared ? SHARED_HOURS * 36e5 : SESSION_DAYS * 864e5;
  const body = b64u(te.encode(JSON.stringify({ i: user.id, v: user.ver, x: Date.now() + life, ...(shared ? { s: 1 } : {}) })));
  return `${body}.${await sign(env, body)}`;
}
export async function readSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, mac] = m[1].split('.');
  if (!body || !mac || !same(mac, await sign(env, body))) return null;
  try { const s = JSON.parse(new TextDecoder().decode(unb64u(body))); return s.x > Date.now() ? s : null; } catch { return null; }
}
// maxAge null: a session cookie that ends when the browser closes.
export const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge === null ? '' : `; Max-Age=${maxAge}`}`;
export const sessionCookie = async (env, user, shared = false) => cookie(await makeSession(env, user, shared), shared ? null : SESSION_DAYS * 86400);

// ---------- KV (rate limits, sign-in lockouts, alert throttling) ----------
// People, classes and progress live in D1 (worker/db.js). KV keeps only short-lived counters.
export async function listKeys(env, prefix, ns = env.USERS) {
  const out = []; let cursor;
  do { const page = await ns.list({ prefix, cursor }); page.keys.forEach(k => out.push(k.name)); cursor = page.list_complete ? null : page.cursor; } while (cursor);
  return out;
}
// Simple fixed-window rate limit in KV (approximate; enough to slow down guessing).
export async function rateLimited(env, key, max, seconds) {
  const n = +(await env.USERS.get('rl:' + key) || 0);
  if (n >= max) return true;
  await env.USERS.put('rl:' + key, String(n + 1), { expirationTtl: Math.max(60, seconds) });
  return false;
}

// ---------- errors and alerts ----------
// Structured log line for every unhandled error, plus an optional POST to ALERT_WEBHOOK_URL (Slack, Teams, Discord
// or anything that accepts JSON). The same alert is sent at most once every 15 minutes.
export async function alert(env, title, detail = {}) {
  console.error(JSON.stringify({ level: 'error', title, ...detail, at: new Date().toISOString() }));
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    const key = 'alert:' + b64u(await crypto.subtle.digest('SHA-256', te.encode(title))).slice(0, 24);
    if (env.USERS && await env.USERS.get(key)) return;
    if (env.USERS) await env.USERS.put(key, '1', { expirationTtl: 900 });
    const text = `Leadership Lab: ${title}${detail.message ? `\n${detail.message}` : ''}${detail.path ? `\nPath: ${detail.path}` : ''}`;
    await fetch(env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text, title, ...detail }) });
  } catch (e) { console.error(JSON.stringify({ level: 'error', title: 'Alert webhook failed', message: String(e) })); }
}
