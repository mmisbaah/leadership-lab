// Builds a Worker entry that serves /public from memory instead of the Workers Assets service.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const walk = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const files = {};
for (const p of walk('public')) { const buf = readFileSync(p); files['/' + relative('public', p)] = { type: TYPES[extname(p)] || 'application/octet-stream', etag: '"' + createHash('sha256').update(buf).digest('hex').slice(0, 32) + '"', b64: buf.toString('base64') }; }
writeFileSync('.wrangler/inline/entry.js', `import app from '../../worker/index.js';
const FILES = ${JSON.stringify(files)};
const cache = new Map();
const body = p => { if (!cache.has(p)) cache.set(p, Uint8Array.from(atob(FILES[p].b64), c => c.charCodeAt(0))); return cache.get(p); };
const ASSETS = { async fetch(input) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (!FILES[p] && FILES[p + '.html']) p += '.html';
  if (!FILES[p]) p = '/index.html'; // single-page-application fallback
  // Same caching as Workers Assets: browsers always revalidate, and an unchanged file answers 304.
  const headers = { 'Content-Type': FILES[p].type, 'Cache-Control': 'public, max-age=0, must-revalidate', 'ETag': FILES[p].etag };
  const inm = typeof input === 'object' && input.headers ? input.headers.get('If-None-Match') : null;
  if (inm && inm.split(',').map(s => s.trim().replace(/^W\\\//, '')).includes(FILES[p].etag)) return new Response(null, { status: 304, headers });
  return new Response(body(p), { headers });
} };
export default { ...app, fetch: (req, env, ctx) => app.fetch(req, { ...env, ASSETS }, ctx) };
export { PollRoom } from '../../worker/index.js';
`);
const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
delete cfg.assets; delete cfg.$schema; cfg.main = 'entry.js';
writeFileSync('.wrangler/inline/wrangler.json', JSON.stringify(cfg, null, 2));
console.log(Object.keys(files).join(' '));
