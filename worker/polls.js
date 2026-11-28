// Live polls. Each class has its own room (a Durable Object named "class:<id>"; people without a class use
// "unassigned"). Two kinds: multiple choice, and open text (short answers shown as a word cloud or a list, which the
// facilitator can hide or pin). When a poll closes, its result and votes are archived to D1 for the class report.
import { DurableObject } from 'cloudflare:workers';
import { json } from './lib.js';
import { canManage } from './db.js';

export const OPEN_MAX = 140;
export const roomFetch = (env, name, op, data) =>
  env.POLLS.get(env.POLLS.idFromName(name)).fetch('https://poll-room/' + op, { method: 'POST', body: JSON.stringify({ ...data, room: name }) });
export const roomForUser = user => (user.classId ? 'class:' + user.classId : 'unassigned');

export async function pollApi(request, env, user, path, body, url) {
  if (!env.POLLS) return json({ error: 'Live polls are not set up on this server.' }, 501);
  const ask = async (room, op, data) => { const r = await roomFetch(env, room, op, data); return json(await r.json(), r.status); };
  if (path === '/api/poll/current' && request.method === 'GET') return ask(roomForUser(user), 'current', { user: user.id });
  if (path === '/api/poll/vote' && request.method === 'POST')
    return ask(roomForUser(user), 'vote', { user: user.id, id: String(body.id || ''), choice: body.choice, text: typeof body.text === 'string' ? body.text : undefined });
  // Facilitator endpoints name the class they are presenting to; they must run it. Anyone else stays in their room.
  const requested = String((request.method === 'GET' ? url.searchParams.get('class') : body.classId) || '');
  let room = roomForUser(user);
  if (user.facilitator) {
    if (requested && requested !== 'unassigned') {
      if (!await canManage(env, user, requested)) return json({ error: 'You don’t run this class.' }, 403);
      room = 'class:' + requested;
    } else room = 'unassigned';
  }
  if (path === '/api/poll/results' && request.method === 'GET') return ask(room, 'results', { id: url.searchParams.get('id') || '', admin: !!user.facilitator });
  if (path === '/api/poll/control' && request.method === 'POST') {
    if (!user.facilitator) return json({ error: 'Only a facilitator can run a live poll.' }, 403);
    return ask(room, 'control', { action: String(body.action || ''), poll: body.poll || null, entry: body.entry ? String(body.entry) : null, view: body.view });
  }
  return json({ error: 'Not found' }, 404);
}

// Group open answers that say the same thing ("Listens!" and "listens").
export const normalise = t => String(t).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();

export class PollRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = { active: null, polls: {}, votes: {}, mod: {}, history: [] };
    ctx.blockConcurrencyWhile(async () => { this.s = { history: [], mod: {}, ...((await ctx.storage.get('s')) || this.s) }; });
  }
  tally(id, forAudience = false) {
    const poll = this.s.polls[id], votes = this.s.votes[id] || {};
    if (poll?.kind === 'open') {
      const groups = new Map(), mod = this.s.mod[id] || {};
      for (const t of Object.values(votes)) {
        const key = normalise(t); if (!key) continue;
        const g = groups.get(key) || { key, text: t, count: 0 };
        g.count++; groups.set(key, g);
      }
      let entries = [...groups.values()].map(g => ({ ...g, hidden: !!mod[g.key]?.h, pinned: !!mod[g.key]?.p }))
        .sort((a, b) => (b.pinned - a.pinned) || (b.count - a.count) || a.text.localeCompare(b.text));
      if (forAudience) entries = entries.filter(e => !e.hidden);
      return { id, kind: 'open', entries, total: Object.keys(votes).length };
    }
    const vs = Object.values(votes);
    return { id, kind: 'choice', counts: (poll?.o || []).map((_, j) => vs.filter(v => v === j).length), total: vs.length };
  }
  // A closing poll is written to D1 (with each person's vote) for the class report and personal data exports.
  async archive(room) {
    const a = this.s.active; if (!a) return;
    const t = this.tally(a.id, true), votes = this.s.votes[a.id] || {};
    const closedAt = new Date().toISOString();
    this.s.history.push({ id: a.id, q: a.q, o: a.o, kind: a.kind, counts: t.counts || [], total: t.total, openedAt: a.openedAt || null, closedAt });
    if (this.s.history.length > 100) this.s.history.splice(0, this.s.history.length - 100);
    if (!this.env.DB || !t.total) return;
    const classId = room?.startsWith('class:') ? room.slice(6) : null;
    try {
      const row = await this.env.DB.prepare(`INSERT INTO polls (class_id, poll_key, kind, question, options, counts, entries, total, opened_at, closed_at)
        VALUES ((SELECT id FROM classes WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(classId, a.id, a.kind, a.q, JSON.stringify(a.o || []), JSON.stringify(t.counts || []), JSON.stringify((t.entries || []).map(({ text, count, pinned }) => ({ text, count, pinned }))), t.total, a.openedAt || null, closedAt).first();
      const ins = this.env.DB.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, user_id, choice, text) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)');
      const rows = Object.entries(votes).map(([u, v]) => ins.bind(row.id, u, a.kind === 'open' ? null : v, a.kind === 'open' ? v : null, u));
      for (let i = 0; i < rows.length; i += 50) await this.env.DB.batch(rows.slice(i, i + 50));
    } catch (e) { console.error(JSON.stringify({ level: 'error', title: 'Poll archive failed', message: String(e) })); }
  }
  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1), d = await request.json().catch(() => ({})), s = this.s, a = s.active;
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    const save = () => this.ctx.storage.put('s', s);
    const pub = x => x && { id: x.id, q: x.q, o: x.o, kind: x.kind || 'choice', locked: x.locked, show: x.show, view: x.view || 'cloud' };
    if (op === 'current') {
      if (!a) return reply({ active: null });
      return reply({ active: pub(a), myVote: s.votes[a.id]?.[d.user] ?? null, results: a.show ? this.tally(a.id, true) : null });
    }
    if (op === 'vote') {
      if (!a || a.id !== d.id) return reply({ error: 'This poll has closed.' }, 409);
      if (a.locked) return reply({ error: 'Voting is closed for this question.' }, 423);
      if (a.kind === 'open') {
        const t = String(d.text || '').replace(/\s+/g, ' ').trim();
        if (!t) return reply({ error: 'Type a short answer first.' }, 400);
        if (t.length > OPEN_MAX) return reply({ error: `Keep it under ${OPEN_MAX} characters.` }, 400);
        (s.votes[a.id] ||= {})[d.user] = t;
      } else {
        if (!Number.isInteger(d.choice) || d.choice < 0 || d.choice >= a.o.length) return reply({ error: 'Choose one of the options.' }, 400);
        (s.votes[a.id] ||= {})[d.user] = d.choice;
      }
      await save();
      return reply({ ok: true, myVote: s.votes[a.id][d.user] });
    }
    if (op === 'results') {
      if (!s.polls[d.id]) return reply({ id: d.id, counts: [], entries: [], total: 0, open: false });
      const open = a?.id === d.id;
      if (!d.admin && !(open && a.show)) return reply({ error: 'Results are not being shown.' }, 403);
      return reply({ ...this.tally(d.id, !d.admin), open, locked: open ? a.locked : true, show: open ? a.show : false, view: open ? a.view || 'cloud' : 'cloud' });
    }
    if (op === 'history') return reply({ history: s.history.slice().reverse() });
    if (op === 'export') return reply(s);
    if (op === 'control') {
      const { action, poll } = d;
      if (action === 'open') {
        const kind = poll?.kind === 'open' ? 'open' : 'choice';
        const ok = poll && typeof poll.id === 'string' && poll.id.length <= 80 && typeof poll.q === 'string' && (kind === 'open'
          || (Array.isArray(poll.o) && poll.o.length >= 2 && poll.o.length <= 8 && poll.o.every(x => typeof x === 'string' && x.length <= 160)));
        if (!ok) return reply({ error: 'That poll is not valid.' }, 400);
        s.polls[poll.id] = { q: poll.q.slice(0, 300), o: kind === 'open' ? [] : poll.o, kind };
        if (a?.id !== poll.id) { await this.archive(d.room); s.active = { id: poll.id, q: s.polls[poll.id].q, o: s.polls[poll.id].o, kind, locked: false, show: false, view: 'cloud', openedAt: new Date().toISOString() }; }
      } else if (action === 'close') { await this.archive(d.room); s.active = null; }
      else if (['lock', 'unlock', 'show', 'hide'].includes(action)) {
        if (!a) return reply({ error: 'No poll is open.' }, 409);
        if (action === 'lock' || action === 'unlock') a.locked = action === 'lock'; else a.show = action === 'show';
      } else if (action === 'view') {
        if (!a) return reply({ error: 'No poll is open.' }, 409);
        a.view = d.view === 'list' ? 'list' : 'cloud';
      } else if (['hide-entry', 'show-entry', 'pin', 'unpin'].includes(action)) {
        if (!a || a.kind !== 'open' || !d.entry) return reply({ error: 'No open-text answer to change.' }, 409);
        const m = ((s.mod[a.id] ||= {})[d.entry] ||= {});
        if (action === 'hide-entry') m.h = 1; else if (action === 'show-entry') delete m.h; else if (action === 'pin') m.p = 1; else delete m.p;
      } else if (action === 'reset') {
        const id = poll?.id || a?.id; if (id) { delete s.votes[id]; delete s.mod[id]; }
      } else return reply({ error: 'Unknown action.' }, 400);
      await save();
      return reply({ active: pub(s.active), results: s.active ? this.tally(s.active.id) : null });
    }
    return reply({ error: 'Not found' }, 404);
  }
}
