// Creates the first facilitator account in the USERS KV namespace.
// Usage: npm run create-admin -- <login-id> "<Full name>" [--local [--persist-to <dir>]] [--quiet]
// Prints the generated password once. Needs wrangler to be signed in (or CLOUDFLARE_API_TOKEN set) unless --local.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const [id, name, ...rest] = process.argv.slice(2);
if (!id || !name) { console.error('Usage: npm run create-admin -- <login-id> "<Full name>" [--local]'); process.exit(1); }
if (!/^[a-z0-9._@-]{3,64}$/.test(id)) { console.error('Login ID: 3–64 lowercase letters, digits or . _ - @'); process.exit(1); }

const b64u = buf => Buffer.from(buf).toString('base64url');
const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const hash = b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
const record = { id, name, admin: true, salt: b64u(salt), hash, iter: 100000, ver: 1, created: new Date().toISOString() };

const persist = rest.includes('--persist-to') ? ['--persist-to', rest[rest.indexOf('--persist-to') + 1]] : [];
const quiet = rest.includes('--quiet');
execFileSync('npx', ['wrangler', 'kv', 'key', 'put', '--binding=USERS', rest.includes('--local') ? '--local' : '--remote', ...persist, `user:${id}`, JSON.stringify(record)], { stdio: quiet ? 'ignore' : 'inherit' });
if (quiet) { console.log(password); process.exit(0); }
console.log(`\nFacilitator account created.\n  Login ID: ${id}\n  Password: ${password}\nSign in and change the password under "Your account".`);
