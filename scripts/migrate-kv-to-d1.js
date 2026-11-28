// One-time move of accounts, classes, progress and check-ins from the old USERS KV records into D1.
//
//   node scripts/migrate-kv-to-d1.js                 dry run against the live namespaces (prints what it would do)
//   node scripts/migrate-kv-to-d1.js --apply         write to the live D1 database
//   node scripts/migrate-kv-to-d1.js --local --persist-to <dir> [--apply]
//
// Idempotent: every row is written with INSERT OR IGNORE, so running it twice changes nothing and never overwrites
// anything already edited in D1. KV records are left in place (delete them by hand once you are happy).
// Mapping: user:<id> → users (admin → role 'admin'); class:<id> → classes (owner kept if that account exists);
// progress:<id> → progress (notes) and quiz_responses (answers); checkin:<id> → checkins.
// Self-ticked "done" marks are NOT turned into attendance, because certificates now need facilitator-marked
// attendance: facilitators re-mark it on the Participants page. Old poll history stays in the PollRoom objects.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = f => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const where = args.includes('--local') ? ['--local', ...(opt('--persist-to') ? ['--persist-to', opt('--persist-to')] : [])] : ['--remote'];
const wrangler = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 });
const LESSONS = new Set(['foundations', 'functional', 'followership', 'communication', 'trust', 'feedback', 'teamwork', 'delegation', 'motivation', 'decisions', 'capstone', 'commitment']);

const keys = JSON.parse(wrangler('kv', 'key', 'list', '--binding=USERS', ...where)).map(k => k.name).filter(k => /^(user|class|progress|checkin):/.test(k));
console.log(`Found ${keys.length} KV records to migrate.`);
const dir = mkdtempSync(join(tmpdir(), 'll-migrate-'));
const kv = {};
for (let i = 0; i < keys.length; i += 100) {
  const f = join(dir, `keys-${i}.json`); writeFileSync(f, JSON.stringify(keys.slice(i, i + 100)));
  const got = JSON.parse(wrangler('kv', 'bulk', 'get', '--binding=USERS', ...where, f));
  for (const [k, raw] of Object.entries(got)) {
    const v = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;   // wrangler returns { key: { value } }
    if (v !== null && v !== undefined) { try { kv[k] = typeof v === 'string' ? JSON.parse(v) : v; } catch { kv[k] = v; } }
  }
}

const q = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sql = ['PRAGMA defer_foreign_keys = true;'];
const users = Object.entries(kv).filter(([k]) => k.startsWith('user:')).map(([, v]) => v).filter(u => u?.id && u.hash);
const classes = Object.entries(kv).filter(([k]) => k.startsWith('class:')).map(([, v]) => v).filter(c => c?.id && c.code);
const ids = new Set(users.map(u => u.id)), classIds = new Set(classes.map(c => c.id));
for (const c of classes)
  sql.push(`INSERT OR IGNORE INTO classes (id, name, code, owner_id, status, created, archived_at) VALUES (${q(c.id)}, ${q(c.name)}, ${q(c.code)}, ${q(ids.has(c.owner) ? c.owner : null)}, ${q(c.status === 'archived' ? 'archived' : 'active')}, ${q(c.created || new Date().toISOString())}, ${q(c.status === 'archived' ? new Date().toISOString() : null)});`);
for (const u of users)
  sql.push(`INSERT OR IGNORE INTO users (id, name, role, locked, class_id, hash, salt, iter, ver, joined, created) VALUES (${q(u.id)}, ${q(u.name || u.id)}, ${q(u.admin ? 'admin' : 'participant')}, ${u.locked ? 1 : 0}, ${q(classIds.has(u.classId) ? u.classId : null)}, ${q(u.hash)}, ${q(u.salt)}, ${u.iter || 100000}, ${u.ver || 1}, ${q(u.joined || 'migrated')}, ${q(u.created || new Date().toISOString())});`);
let notes = 0, answers = 0, checkins = 0;
for (const [k, p] of Object.entries(kv)) {
  const id = k.slice(k.indexOf(':') + 1);
  if (!ids.has(id)) continue;
  if (k.startsWith('progress:')) for (const [lesson, e] of Object.entries(p || {})) {
    if (!LESSONS.has(lesson)) continue;
    if (e.note) { notes++; sql.push(`INSERT OR IGNORE INTO progress (user_id, lesson_id, note, updated_at) VALUES (${q(id)}, ${q(lesson)}, ${q(String(e.note).slice(0, 4000))}, ${q(e.doneAt || new Date().toISOString())});`); }
    if (Number.isInteger(e.choice)) { answers++; sql.push(`INSERT OR IGNORE INTO quiz_responses (user_id, lesson_id, choice, answered_at) VALUES (${q(id)}, ${q(lesson)}, ${e.choice}, ${q(e.doneAt || new Date().toISOString())});`); }
  }
  if (k.startsWith('checkin:')) for (const c of Array.isArray(p) ? p : []) {
    if (!Number.isInteger(c.rating)) continue;
    checkins++;
    // No natural key, so skip a check-in already copied (same person and time).
    sql.push(`INSERT INTO checkins (user_id, at, rating, helped, blocked, next) SELECT ${q(id)}, ${q(c.at)}, ${c.rating}, ${q(c.helped)}, ${q(c.blocked)}, ${q(c.next)} WHERE NOT EXISTS (SELECT 1 FROM checkins WHERE user_id = ${q(id)} AND at = ${q(c.at)});`);
  }
}
console.log(`To write: ${classes.length} classes, ${users.length} accounts (${users.filter(u => u.admin).length} admins), ${notes} notes, ${answers} quiz answers, ${checkins} check-ins.`);
const file = join(dir, 'migrate.sql'); writeFileSync(file, sql.join('\n') + '\n');
if (!args.includes('--apply')) { console.log(`Dry run. SQL written to ${file} (contains password hashes: keep it private). Add --apply to run it.`); process.exit(0); }
wrangler('d1', 'execute', 'DB', ...where, '--file', file, '--yes');
console.log('Migration applied. Counts now in D1:');
console.log(wrangler('d1', 'execute', 'DB', ...where, '--command', "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM classes) AS classes, (SELECT COUNT(*) FROM progress) AS notes, (SELECT COUNT(*) FROM quiz_responses) AS answers, (SELECT COUNT(*) FROM checkins) AS checkins", '--json'));
