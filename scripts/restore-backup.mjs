// Restores a nightly snapshot (worker/backup.js) into the D1 database.
//
//   npm run restore-backup -- list [--local]                    list snapshots, newest first
//   npm run restore-backup -- <snapshot-key|latest|file.json>   show what a snapshot holds (dry run, the default)
//   npm run restore-backup -- latest --apply                    write it back to D1
//
// Options: --local / --remote (default remote), --persist-to <dir> (local only),
//          --only users,classes,...   restore just these tables (names as in migrations/0001_initial.sql)
//          --out <file>               also save the decrypted snapshot as JSON (keep it private)
//
// Encrypted snapshots (BACKUP_KEY set on the Worker) are complete; restoring one replaces matching rows.
// Encrypted snapshots need the same key: BACKUP_KEY=... npm run restore-backup -- latest --apply
// Redacted snapshots (made without BACKUP_KEY) lack password hashes, notes, check-ins and self-assessments, so they
// are restored with INSERT OR IGNORE: rows already in D1 are never overwritten, and accounts that have to be recreated
// get an unusable password that a facilitator must reset.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto as crypto, createHash, randomBytes } from 'node:crypto';

const TABLES = ['users', 'classes', 'class_facilitators', 'enrollments_attendance', 'progress', 'quiz_responses', 'checkins', 'polls', 'poll_votes',
  'self_assessments', 'course_evaluations', 'evaluation_submissions', 'certificates'];
const args = process.argv.slice(2);
const flag = f => args.includes(f), opt = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const target = args.find((a, i) => !a.startsWith('--') && !['--persist-to', '--only', '--out'].includes(args[i - 1]));
if (!target) { console.error('Usage: npm run restore-backup -- <list|latest|snapshot:…|file.json> [--apply] [--local] [--only tables] [--out file]'); process.exit(1); }
const where = flag('--local') ? ['--local', ...(opt('--persist-to') ? ['--persist-to', opt('--persist-to')] : [])] : ['--remote'];
const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
const listSnapshots = () => JSON.parse(wrangler('kv', 'key', 'list', '--binding=BACKUPS', '--prefix', 'snapshot:', ...where)).map(k => k.name).sort().reverse();

if (target === 'list') { for (const k of listSnapshots()) console.log(k); process.exit(0); }

let raw;
if (target.endsWith('.json')) raw = readFileSync(target, 'utf8');
else {
  const key = target === 'latest' ? listSnapshots()[0] : target;
  if (!key) { console.error('No snapshots found.'); process.exit(1); }
  console.log(`Reading ${key}`);
  raw = wrangler('kv', 'key', 'get', '--binding=BACKUPS', ...where, key);
}
const snap = JSON.parse(raw);
if (snap.version !== 2) { console.error('This snapshot is from the old KV storage (version 1). Restore it with git checkout ab7acce -- scripts/restore-backup.mjs, then run scripts/migrate-kv-to-d1.js.'); process.exit(1); }
let tables;
if (snap.encrypted) {
  if (!process.env.BACKUP_KEY) { console.error('This snapshot is encrypted. Set BACKUP_KEY to the secret the Worker used.'); process.exit(1); }
  const b = s => Buffer.from(s, 'base64url');
  const key = await crypto.subtle.importKey('raw', createHash('sha256').update(process.env.BACKUP_KEY).digest(), 'AES-GCM', false, ['decrypt']);
  try { tables = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(snap.iv) }, key, b(snap.data))).toString('utf8')).tables; }
  catch { console.error('Could not decrypt: BACKUP_KEY does not match this snapshot.'); process.exit(1); }
} else tables = snap.tables;

const only = opt('--only')?.split(',').map(s => s.trim());
const chosen = TABLES.filter(t => (!only || only.includes(t)) && tables[t]?.length);
console.log(`Snapshot from ${snap.created} · ${snap.encrypted ? 'encrypted, complete' : 'redacted: no password hashes, notes, check-ins or self-assessments'}`);
console.log('Rows to restore:', chosen.map(t => `${t} ${tables[t].length}`).join(', ') || 'none');
if (opt('--out')) { writeFileSync(opt('--out'), JSON.stringify({ created: snap.created, tables }, null, 2)); console.log(`Saved the snapshot contents to ${opt('--out')} (keep it private).`); }
if (!flag('--apply')) { console.log('\nDry run. Add --apply to write these rows to D1' + (where[0] === '--local' ? ' (local).' : ' (live).')); process.exit(0); }

const q = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const verb = snap.encrypted ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
const sql = ['PRAGMA defer_foreign_keys = true;'];
for (const t of chosen) for (const row of tables[t]) {
  const r = { ...row }; delete r.passwordRemoved;
  if (t === 'users' && !r.hash) Object.assign(r, { hash: '!reset-' + randomBytes(9).toString('base64url'), salt: 'AAAAAAAAAAAAAAAAAAAAAA', iter: 100000 });
  const cols = Object.keys(r);
  sql.push(`${verb} INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(c => q(r[c])).join(', ')});`);
}
const dir = mkdtempSync(join(tmpdir(), 'll-restore-')), file = join(dir, 'restore.sql');
writeFileSync(file, sql.join('\n') + '\n');
wrangler('d1', 'execute', 'DB', ...where, '--file', file, '--yes');
console.log(`Restored ${sql.length - 1} rows into D1${snap.encrypted ? '' : ' (existing rows kept; recreated accounts need a password reset)'}.`);
