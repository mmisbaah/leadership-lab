// Scheduled backups. A Cron Trigger (see wrangler.jsonc) writes a dated snapshot of accounts, classes, progress,
// check-ins and each class's poll history to the BACKUPS KV namespace and keeps the newest RETAIN snapshots.
// With the BACKUP_KEY secret set, the whole snapshot is encrypted (AES-256-GCM, key = SHA-256 of BACKUP_KEY).
// Without it, sensitive fields are left out: password hashes, private notes and check-ins.
// scripts/restore-backup.mjs restores a snapshot.
import { listKeys, b64u, te } from './lib.js';
import { roomFetch } from './polls.js';

const PREFIXES = ['user:', 'class:', 'code:', 'progress:', 'checkin:'];
export const RETAIN = 30;

async function aesKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', te.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
}
function redact(kv) {
  const out = {};
  for (const [k, v] of Object.entries(kv)) {
    if (k.startsWith('checkin:')) continue;
    if (k.startsWith('user:')) { const { hash, salt, iter, ...rest } = v; out[k] = { ...rest, passwordRemoved: true }; continue; }
    if (k.startsWith('progress:')) { out[k] = Object.fromEntries(Object.entries(v).map(([l, e]) => { const { note, ...keep } = e; return [l, keep]; })); continue; }
    out[k] = v;
  }
  return out;
}

export async function runBackup(env) {
  if (!env.BACKUPS) throw new Error('The BACKUPS namespace is not bound.');
  const kv = {};
  for (const prefix of PREFIXES) {
    for (const key of await listKeys(env, prefix)) {
      const v = await env.USERS.get(key);
      if (v !== null) { try { kv[key] = JSON.parse(v); } catch { kv[key] = v; } }
    }
  }
  const polls = {};
  if (env.POLLS) {
    const rooms = ['unassigned', ...Object.keys(kv).filter(k => k.startsWith('class:')).map(k => 'class:' + k.slice(6))];
    for (const room of rooms) { try { polls[room] = await (await roomFetch(env, room, 'export', {})).json(); } catch { /* skip */ } }
  }
  const created = new Date().toISOString();
  const counts = Object.fromEntries(PREFIXES.map(p => [p.slice(0, -1), Object.keys(kv).filter(k => k.startsWith(p)).length]));
  const encrypted = !!env.BACKUP_KEY;
  let payload;
  if (encrypted) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env.BACKUP_KEY), te.encode(JSON.stringify({ kv, polls })));
    payload = { version: 1, created, counts, encrypted: true, alg: 'AES-256-GCM', iv: b64u(iv), data: b64u(data) };
  } else {
    payload = { version: 1, created, counts, encrypted: false, redacted: true, kv: redact(kv), polls };
  }
  const key = 'snapshot:' + created;
  const body = JSON.stringify(payload);
  await env.BACKUPS.put(key, body, { metadata: { created, encrypted, bytes: body.length, counts } });
  // Retention: keep the newest RETAIN snapshots.
  const all = (await listKeys(env, 'snapshot:', env.BACKUPS)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - RETAIN))) await env.BACKUPS.delete(old);
  return { key, encrypted, bytes: body.length, counts };
}

export async function listBackups(env) {
  if (!env.BACKUPS) return [];
  const out = []; let cursor;
  do { const page = await env.BACKUPS.list({ prefix: 'snapshot:', cursor }); out.push(...page.keys.map(k => ({ key: k.name, ...(k.metadata || {}) }))); cursor = page.list_complete ? null : page.cursor; } while (cursor);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}
