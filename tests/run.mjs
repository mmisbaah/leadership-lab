// Test runner: starts a throwaway local Worker (wrangler dev with its own temporary storage), seeds a facilitator
// account, runs every tests/*.test.mjs file against it, then stops the server.
// Set BASE_URL, ADMIN_ID and ADMIN_PW to run the suite against a server you started yourself instead.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.mjs')).sort()
  .filter(f => !process.argv[2] || f.includes(process.argv[2])).map(f => join('tests', f));
const env = { ...process.env, NO_PROXY: '*', no_proxy: '*' };
let server = null;

if (!env.BASE_URL) {
  const persist = mkdtempSync(join(tmpdir(), 'll-test-'));
  const port = 8900 + Math.floor(Math.random() * 90);
  env.ADMIN_ID = 'test_admin';
  env.TEST_PERSIST = persist;
  env.ADMIN_PW = execFileSync('node', ['scripts/create-admin.mjs', env.ADMIN_ID, 'Test Facilitator', '--local', '--persist-to', persist, '--quiet'], { cwd: root, env, encoding: 'utf8' }).trim().split('\n').pop();
  server = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', persist, '--log-level', 'warn'], { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'], detached: true });
  env.BASE_URL = `http://127.0.0.1:${port}`;
  const until = Date.now() + 90_000;
  for (;;) {
    try { if ((await fetch(env.BASE_URL + '/healthz')).ok) break; } catch {}
    if (Date.now() > until) { console.error('The local server did not start.'); stop(); process.exit(1); }
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`Local server ready at ${env.BASE_URL}`);
}
function stop() { if (server) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} server = null; } }
process.on('SIGINT', () => { stop(); process.exit(130); });

const run = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], { cwd: root, env, stdio: 'inherit' });
run.on('exit', code => { stop(); process.exit(code ?? 1); });
