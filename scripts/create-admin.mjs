// Creates a facilitator or admin account in the D1 database.
// Usage: npm run create-admin -- <login-id> "<Full name>" [--role admin|facilitator] [--local [--persist-to <dir>]] [--quiet]
// Prints the generated password once. Needs wrangler to be signed in (or CLOUDFLARE_API_TOKEN set) unless --local.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const [id, name, ...rest] = process.argv.slice(2);
const opt = f => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : null);
if (!id || !name) { console.error('Usage: npm run create-admin -- <login-id> "<Full name>" [--role admin|facilitator] [--local]'); process.exit(1); }
if (!/^[a-z0-9._@-]{3,64}$/.test(id)) { console.error('Login ID: 3–64 lowercase letters, digits or . _ - @'); process.exit(1); }
const role = opt('--role') || 'admin';
if (!['admin', 'facilitator'].includes(role)) { console.error('--role must be admin or facilitator'); process.exit(1); }

const b64u = buf => Buffer.from(buf).toString('base64url');
const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const hash = b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const sql = `INSERT INTO users (id, name, role, hash, salt, iter, ver, joined, created) VALUES (${q(id)}, ${q(name)}, ${q(role)}, ${q(hash)}, ${q(b64u(salt))}, 100000, 1, 'added', ${q(new Date().toISOString())})
  ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, hash = excluded.hash, salt = excluded.salt, iter = excluded.iter, ver = users.ver + 1;`;
const where = rest.includes('--local') ? ['--local', ...(opt('--persist-to') ? ['--persist-to', opt('--persist-to')] : [])] : ['--remote'];
const quiet = rest.includes('--quiet');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', ...where, '--command', sql], { stdio: quiet ? 'ignore' : 'inherit' });
if (quiet) { console.log(password); process.exit(0); }
console.log(`\n${role === 'admin' ? 'Admin' : 'Facilitator'} account ready.\n  Login ID: ${id}\n  Password: ${password}\nSign in and change the password under "Your account".`);
