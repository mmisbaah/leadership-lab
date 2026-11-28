// Static checks on the course content and the app shell. No server needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lessons } from '../public/lessons.js';
import { decks } from '../public/decks.js';
import { INDEX_SCRIPT_HASH, CSP } from '../worker/lib.js';
import { LESSON_IDS } from '../worker/db.js';
import { STATEMENTS, SCALE, EVALUATION } from '../public/assessment.js';
import { qrSVG } from '../public/qr.js';
import en from '../public/i18n/en.js';
import dv from '../public/i18n/dv.js';
import jsQR from 'jsqr';

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

test('every activity and discussion slide states its own timer, and open-text polls are well formed', () => {
  for (const l of lessons) decks[l.id].forEach((s, i) => {
    const timed = s.t === 'discuss' || (s.t === 'points' && s.k === 'Group practice');
    if (timed) assert.ok(Number.isInteger(s.min) && s.min >= 1 && s.min <= 60, `${l.id} slide ${i + 1}: needs an explicit min (minutes)`);
    else assert.equal(s.min, undefined, `${l.id} slide ${i + 1}: min only belongs on timed slides`);
    if (s.open) { assert.equal(s.t, 'discuss', `${l.id} slide ${i + 1}: open-text polls are discussion slides`); assert.ok(!s.poll, `${l.id} slide ${i + 1}: a slide is open text or multiple choice, not both`); }
  });
  const open = lessons.flatMap(l => decks[l.id].filter(s => s.open));
  assert.ok(open.length >= 10, 'open-text polls on the debriefs');
});

test('group practice and its debrief fit inside the session’s activity time', () => {
  for (const l of lessons) {
    const d = decks[l.id], gp = d.find(s => s.k === 'Group practice'), deb = d.find(s => s.t === 'discuss' && s.k === 'Debrief');
    const total = d.filter(s => s.min).reduce((a, s) => a + s.min, 0);
    assert.ok(total <= l.minutes, `${l.id}: timed slides add up to ${total} of ${l.minutes} minutes`);
    if (deb) assert.ok(gp.min > deb.min, `${l.id}: group practice should run longer than its debrief`);
  }
});

test('photo slots: public/photos.js matches config/photos.json, and every slot exists in the decks', async () => {
  const cfg = JSON.parse(read('config/photos.json'));
  const ids = lessons.flatMap(l => decks[l.id].filter(s => s.photo).map(s => s.photo.id));
  assert.deepEqual(Object.keys(cfg.slots).sort(), ids.sort());
  const { photos } = await import('../public/photos.js');
  const filled = Object.entries(cfg.slots).filter(([, s]) => s.src);
  assert.equal(photos.enabled, cfg.enabled !== false);
  assert.deepEqual(Object.keys(photos.slots).sort(), filled.map(([k]) => k).sort(), 'run npm run apply-photos');
  for (const [k, s] of filled) { assert.equal(photos.slots[k].src, s.src); assert.ok(existsSync(new URL('../public' + s.src, import.meta.url)), `${k}: ${s.src} missing`); }
});

test('QR codes decode back to the exact URL', () => {
  for (const text of ['https://leadership.mellowpilot.com/join?code=MNDF-26A', 'https://leadership.mellowpilot.com/#live', 'https://leadership.mellowpilot.com/verify/LL-2026-ABCD-EFGH']) {
    const svg = qrSVG(text), size = +svg.match(/viewBox="0 0 (\d+)/)[1], scale = 6, w = size * scale;
    const dark = new Set([...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(m => `${m[1]},${m[2]}`));
    const px = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const v = dark.has(`${Math.floor(x / scale)},${Math.floor(y / scale)}`) ? 0 : 255, o = (y * w + x) * 4; px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255; }
    assert.equal(jsQR(px, w, w)?.data, text);
  }
});

test('self-assessment and evaluation definitions', () => {
  assert.equal(STATEMENTS.length, 10);
  assert.equal(new Set(STATEMENTS.map(s => s.id)).size, 10);
  for (const s of STATEMENTS) assert.ok(LESSON_IDS.has(s.session), s.id);
  assert.equal(SCALE.length, 5);
  for (const k of ['relevance', 'pace', 'facilitator']) assert.equal(EVALUATION[k].scale.length, 5);
});

test('i18n: Dhivehi keys are a subset of English, and the Thaana font is bundled', () => {
  for (const k of Object.keys(dv)) assert.ok(k in en, `dv.js has unknown key ${k}`);
  for (const f of ['noto-sans-thaana-thaana-400-normal.woff2', 'noto-sans-thaana-thaana-700-normal.woff2']) assert.ok(existsSync(new URL('../public/assets/fonts/' + f, import.meta.url)));
  assert.match(read('public/css/app.css'), /html\[dir="rtl"\] \.rail/);
});

test('the D1 schema has every table the Worker and backups use', () => {
  const sql = read('migrations/0001_initial.sql');
  for (const t of ['users', 'classes', 'class_facilitators', 'enrollments_attendance', 'progress', 'quiz_responses', 'checkins', 'polls', 'poll_votes', 'self_assessments', 'course_evaluations', 'evaluation_submissions', 'certificates'])
    assert.match(sql, new RegExp(`CREATE TABLE ${t} \\(`), t);
  assert.doesNotMatch(sql.match(/CREATE TABLE course_evaluations \(([\s\S]*?)\);/)[1], /user_id/, 'evaluations must not store who answered');
});
