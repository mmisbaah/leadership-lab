// Nightly maintenance (Cron Trigger in wrangler.jsonc): a snapshot of every D1 table to the BACKUPS KV namespace
// (newest RETAIN kept), then the retention purge. /api/health reports on both.
//
// With the BACKUP_KEY secret set, the whole snapshot is encrypted (AES-256-GCM, key = SHA-256 of BACKUP_KEY) and
// complete. Without it the snapshot leaves out password hashes, private notes, check-ins, self-assessments,
// evaluation comments and open-text votes, an alert is raised, and /api/health reports failure until the key is set.
// scripts/restore-backup.mjs restores a snapshot.
import { listKeys, b64u, te, alert } from './lib.js';
import { all, first, run, now } from './db.js';

// Restore order: parents before children (scripts/restore-backup.mjs relies on it).
export const TABLES = ['users', 'classes', 'class_facilitators', 'enrollments_attendance', 'progress', 'quiz_responses', 'checkins', 'polls', 'poll_votes',
  'self_assessments', 'course_evaluations', 'evaluation_submissions', 'certificates'];
export const RETAIN = 30;
export const RETENTION_DAYS = 730;
export const BACKUP_MAX_AGE_HOURS = 36;

async function aesKey(secret) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', te.encode(secret)), 'AES-GCM', false, ['encrypt']);
}
function redact(tables) {
  const out = { ...tables };
  out.users = tables.users.map(({ hash, salt, iter, ...u }) => ({ ...u, passwordRemoved: true }));
  out.progress = tables.progress.map(({ note, ...p }) => p);
  out.checkins = []; out.self_assessments = [];
  out.course_evaluations = tables.course_evaluations.map(({ improve, ...e }) => e);
  out.poll_votes = tables.poll_votes.map(({ text, ...v }) => v);
  return out;
}

export async function runBackup(env) {
  if (!env.BACKUPS) throw new Error('The BACKUPS namespace is not bound.');
  const tables = {};
  for (const t of TABLES) tables[t] = await all(env, `SELECT * FROM ${t}`);
  const created = now();
  const counts = Object.fromEntries(TABLES.map(t => [t, tables[t].length]));
  const encrypted = !!env.BACKUP_KEY;
  let payload;
  if (encrypted) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env.BACKUP_KEY), te.encode(JSON.stringify({ tables })));
    payload = { version: 2, created, counts, encrypted: true, alg: 'AES-256-GCM', iv: b64u(iv), data: b64u(data) };
  } else {
    payload = { version: 2, created, counts, encrypted: false, redacted: true, tables: redact(tables) };
    await alert(env, 'BACKUP_KEY is not set: tonight’s backup leaves out private notes, check-ins and passwords', {
      message: 'Run npm run generate-backup-key, then npx wrangler secret put BACKUP_KEY.' });
  }
  const key = 'snapshot:' + created, body = JSON.stringify(payload);
  await env.BACKUPS.put(key, body, { metadata: { created, encrypted, bytes: body.length, counts } });
  const old = (await listKeys(env, 'snapshot:', env.BACKUPS)).sort();
  for (const k of old.slice(0, Math.max(0, old.length - RETAIN))) await env.BACKUPS.delete(k);
  return { key, encrypted, bytes: body.length, counts };
}

export async function listBackups(env) {
  if (!env.BACKUPS) return [];
  const out = []; let cursor;
  do { const page = await env.BACKUPS.list({ prefix: 'snapshot:', cursor }); out.push(...page.keys.map(k => ({ key: k.name, ...(k.metadata || {}) }))); cursor = page.list_complete ? null : page.cursor; } while (cursor);
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

// Classes archived for more than RETENTION_DAYS are deleted with their participants and everything those people
// own (notes, attendance, check-ins, certificates ...). Facilitator accounts are kept.
export async function purgeArchived(env, asOf = new Date()) {
  const cutoff = new Date(asOf.getTime() - RETENTION_DAYS * 864e5).toISOString();
  const classes = await all(env, "SELECT id, name FROM classes WHERE status = 'archived' AND archived_at IS NOT NULL AND archived_at < ?", cutoff);
  let people = 0;
  for (const c of classes) {
    people += (await run(env, "DELETE FROM users WHERE class_id = ? AND role = 'participant'", c.id)).meta.changes;
    await run(env, 'DELETE FROM classes WHERE id = ?', c.id);
  }
  if (classes.length) console.log(JSON.stringify({ level: 'info', title: 'Retention purge', classes: classes.length, people }));
  return { classes: classes.length, people, cutoff };
}

export async function nightly(env) {
  try { await runBackup(env); } catch (e) { await alert(env, 'Nightly backup failed', { message: String(e?.stack || e) }); }
  try { await purgeArchived(env); } catch (e) { await alert(env, 'Retention purge failed', { message: String(e?.stack || e) }); }
}

// Health for uptime monitors: 200 when everything is fine, 503 with the failing checks otherwise.
export async function health(env, version) {
  const checks = { worker: true };
  try { checks.database = (await first(env, 'SELECT 1 AS ok')).ok === 1; } catch { checks.database = false; }
  checks.backupKey = !!env.BACKUP_KEY;
  let latest = null;
  try { latest = (await listBackups(env))[0] || null; } catch {}
  const age = latest ? (Date.now() - Date.parse(latest.created)) / 36e5 : null;
  checks.backupFresh = age !== null && age <= BACKUP_MAX_AGE_HOURS;
  checks.backupEncrypted = !!latest?.encrypted;
  const problems = [];
  if (!checks.database) problems.push('The database is not answering.');
  if (!checks.backupKey) problems.push('BACKUP_KEY is not set, so backups leave out private notes and check-ins. Run npm run generate-backup-key.');
  if (!checks.backupFresh) problems.push(latest ? `The newest backup is ${Math.round(age)} hours old.` : 'There is no backup yet.');
  return { ok: problems.length === 0, version, checks, lastBackup: latest?.created || null, backupAgeHours: age === null ? null : Math.round(age * 10) / 10, problems };
}
