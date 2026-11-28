// Restores a snapshot written by the nightly backup (worker/backup.js) into the USERS namespace.
//
//   npm run restore-backup -- list [--local]                    list snapshots, newest first
//   npm run restore-backup -- <snapshot-key|latest|file.json>   show what a snapshot holds (dry run, the default)
//   npm run restore-backup -- latest --apply                    write it back to USERS
//
// Options: --local / --remote (default remote), --persist-to <dir> (local only),
//          --only user,class,code,progress,checkin   restore just these kinds of record
//          --out <file>                               also save the decrypted snapshot as JSON
//
// Encrypted snapshots need the same BACKUP_KEY in the environment: BACKUP_KEY=... npm run restore-backup -- latest
// Redacted snapshots (made while BACKUP_KEY was not set) have no password hashes, private notes or check-ins.
// Restoring one over live data replaces those records, so people must have their passwords reset and their notes
// are lost. Use them to recover into an empty namespace, or with --only class,code to bring back classes alone.
// Poll history is written to a file for reference; it is not loaded back into the poll rooms.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto as crypto, createHash } from 'node:crypto';

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const target = args.find((a, i) => !a.startsWith('--') && !['--persist-to', '--only', '--out'].includes(args[i - 1]));
if (!target) { console.error('Usage: npm run restore-backup -- <list|latest|snapshot:…|file.json> [--apply] [--local] [--only kinds] [--out file]'); process.exit(1); }
const where = flag('--local') ? ['--local', ...(opt('--persist-to') ? ['--persist-to', opt('--persist-to')] : [])] : ['--remote'];
const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
const listSnapshots = () => JSON.parse(wrangler('kv', 'key', 'list', '--binding=BACKUPS', '--prefix', 'snapshot:', ...where)).map(k => k.name).sort().reverse();

if (target === 'list') {
  for (const k of listSnapshots()) console.log(k);
  process.exit(0);
}

let raw;
if (target.endsWith('.json')) raw = readFileSync(target, 'utf8');
else {
  const key = target === 'latest' ? listSnapshots()[0] : target;
  if (!key) { console.error('No snapshots found.'); process.exit(1); }
  console.log(`Reading ${key}`);
  raw = wrangler('kv', 'key', 'get', '--binding=BACKUPS', ...where, key);
}
const snap = JSON.parse(raw);
let body;
if (snap.encrypted) {
  if (!process.env.BACKUP_KEY) { console.error('This snapshot is encrypted. Set BACKUP_KEY to the secret the Worker used.'); process.exit(1); }
  const fromB64u = s => Buffer.from(s, 'base64url');
  const key = await crypto.subtle.importKey('raw', createHash('sha256').update(process.env.BACKUP_KEY).digest(), 'AES-GCM', false, ['decrypt']);
  try { body = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(snap.iv) }, key, fromB64u(snap.data))).toString('utf8')); }
  catch { console.error('Could not decrypt: BACKUP_KEY does not match this snapshot.'); process.exit(1); }
} else body = { kv: snap.kv, polls: snap.polls };

const only = opt('--only')?.split(',').map(s => s.trim().replace(/:$/, ''));
const entries = Object.entries(body.kv).filter(([k]) => !only || only.includes(k.split(':')[0]));
const count = {};
for (const [k] of entries) count[k.split(':')[0]] = (count[k.split(':')[0]] || 0) + 1;
console.log(`Snapshot from ${snap.created} · ${snap.encrypted ? 'encrypted, complete' : 'redacted: no password hashes, notes or check-ins'}`);
console.log('Records to restore:', Object.entries(count).map(([k, n]) => `${k} ${n}`).join(', ') || 'none');
console.log('Poll rooms in snapshot:', Object.keys(body.polls || {}).length);
if (opt('--out')) { writeFileSync(opt('--out'), JSON.stringify(body, null, 2)); console.log(`Saved the snapshot contents to ${opt('--out')} (keep it private).`); }

if (!flag('--apply')) { console.log('\nDry run. Add --apply to write these records to the USERS namespace' + (where[0] === '--local' ? ' (local).' : ' (live).')); process.exit(0); }
if (!snap.encrypted && entries.some(([k]) => k.startsWith('user:') || k.startsWith('progress:')))
  console.warn('\nWarning: this redacted snapshot will replace accounts without passwords and progress without notes.');
const dir = mkdtempSync(join(tmpdir(), 'll-restore-'));
const file = join(dir, 'bulk.json');
writeFileSync(file, JSON.stringify(entries.map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) }))));
wrangler('kv', 'bulk', 'put', '--binding=USERS', ...where, file);
const pollsFile = join(dir, 'poll-history.json');
writeFileSync(pollsFile, JSON.stringify(body.polls || {}, null, 2));
console.log(`Restored ${entries.length} records. Poll history for reference: ${pollsFile}`);
