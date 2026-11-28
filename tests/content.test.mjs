// Static checks on the course content and the app shell. No server needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lessons } from '../public/lessons.js';
import { decks } from '../public/decks.js';
import { LESSON_IDS, INDEX_SCRIPT_HASH, CSP } from '../worker/lib.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the server knows exactly the sessions the app teaches', () => {
  assert.deepEqual([...LESSON_IDS].sort(), lessons.map(l => l.id).sort());
});

test('every session has a complete plan and a valid decision question', () => {
  for (const l of lessons) {
    for (const k of ['id', 'n', 'title', 'intro', 'scenario', 'reason', 'prompt', 'activity']) assert.ok(l[k], `${l.id}: missing ${k}`);
    assert.ok(l.choices.length >= 2 && l.choices.length <= 6, `${l.id}: choices`);
    assert.ok(Number.isInteger(l.correct) && l.correct >= 0 && l.correct < l.choices.length, `${l.id}: correct index`);
    assert.ok(l.minutes > 0, `${l.id}: minutes`);
  }
});

test('every session deck has 25 to 30 slides, and every quick check and poll is well formed', () => {
  for (const l of lessons) {
    const d = decks[l.id];
    assert.ok(Array.isArray(d), `${l.id}: no deck`);
    assert.ok(d.length >= 25 && d.length <= 30, `${l.id}: ${d.length} slides`);
    d.forEach((s, i) => {
      assert.ok(s.t, `${l.id} slide ${i + 1}: no type`);
      if (s.t === 'check') {
        assert.ok(s.q && Array.isArray(s.o) && s.o.length >= 2, `${l.id} slide ${i + 1}: check needs q and options`);
        assert.ok(Number.isInteger(s.a) && s.a >= 0 && s.a < s.o.length, `${l.id} slide ${i + 1}: answer index`);
        assert.ok(s.o.length <= 8 && s.o.every(o => o.length <= 160), `${l.id} slide ${i + 1}: poll limits`);
      }
      if (s.photo?.src) assert.ok(s.photo.src.startsWith('/assets/'), `${l.id} slide ${i + 1}: photos must be served from /assets (CSP img-src 'self')`);
      if (s.photo) assert.ok(s.photo.alt, `${l.id} slide ${i + 1}: photo needs alt text`);
    });
  }
});

test('the CSP hash matches the inline theme script in index.html', () => {
  const html = read('public/index.html');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(scripts.length, 1, 'index.html should have exactly one inline script');
  const hash = `'sha256-${createHash('sha256').update(scripts[0]).digest('base64')}'`;
  assert.equal(hash, INDEX_SCRIPT_HASH, 'update INDEX_SCRIPT_HASH in worker/lib.js');
  assert.ok(CSP.includes(hash));
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(CSP), 'scripts must never be allowed inline');
});

test('the service worker version matches the cache-busting query strings, and its shell files exist', () => {
  const sw = read('public/sw.js'), html = read('public/index.html');
  const version = sw.match(/const VERSION = '([^']+)'/)[1];
  const vs = [...html.matchAll(/\?v=([\w-]+)/g)].map(m => m[1]);
  assert.ok(vs.length >= 2);
  for (const v of vs) assert.equal(v, version, 'bump ?v= in index.html together with VERSION in sw.js');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell) assert.ok(existsSync(new URL('../public' + (f === '/' ? '/index.html' : f), import.meta.url)), `missing ${f}`);
});
