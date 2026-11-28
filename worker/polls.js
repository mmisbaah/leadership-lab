// Live polls. Each class has its own poll room (a Durable Object named "class:<id>"; people without a class use
// "unassigned"), so facilitators running different classes at the same time never collide, and repeat runs stay
// separate. Durable Objects are strongly consistent, so simultaneous votes are never lost.
import { DurableObject } from 'cloudflare:workers';
import { json } from './lib.js';

export const roomFetch = (env, name, op, data) =>
  env.POLLS.get(env.POLLS.idFromName(name)).fetch('https://poll-room/' + op, { method: 'POST', body: JSON.stringify(data) });

// Which room a request belongs to: participants always use their own class; facilitators say which class they
// are presenting to (checked against the class list by the caller).
export const roomForUser = user => (user.classId ? 'class:' + user.classId : 'unassigned');

export async function pollApi(request, env, user, path, body, url, classExists) {
  if (!env.POLLS) return json({ error: 'Live polls are not set up on this server.' }, 501);
  const ask = async (room, op, data) => { const r = await roomFetch(env, room, op, data); return json(await r.json(), r.status); };
  if (path === '/api/poll/current' && request.method === 'GET') return ask(roomForUser(user), 'current', { user: user.id });
  if (path === '/api/poll/vote' && request.method === 'POST') return ask(roomForUser(user), 'vote', { user: user.id, id: String(body.id || ''), choice: body.choice });
  // Facilitator endpoints name the class; anyone else is held to their own room.
  const requested = String((request.method === 'GET' ? url.searchParams.get('class') : body.classId) || '');
  let room = roomForUser(user);
  if (user.admin) {
    if (requested && requested !== 'unassigned' && !await classExists(requested)) return json({ error: 'No such class.' }, 404);
    room = requested && requested !== 'unassigned' ? 'class:' + requested : 'unassigned';
  }
  if (path === '/api/poll/results' && request.method === 'GET') return ask(room, 'results', { id: url.searchParams.get('id') || '', admin: !!user.admin });
  if (path === '/api/poll/history' && request.method === 'GET') {
    if (!user.admin) return json({ error: 'Only a facilitator can see poll history.' }, 403);
    return ask(room, 'history', {});
  }
  if (path === '/api/poll/control' && request.method === 'POST') {
    if (!user.admin) return json({ error: 'Only a facilitator can run a live poll.' }, 403);
    return ask(room, 'control', { action: String(body.action || ''), poll: body.poll || null });
  }
  return json({ error: 'Not found' }, 404);
}

const HISTORY_MAX = 500;
export class PollRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = { active: null, polls: {}, votes: {}, history: [] };
    ctx.blockConcurrencyWhile(async () => { this.s = { history: [], ...((await ctx.storage.get('s')) || this.s) }; });
  }
  tally(id) {
    const poll = this.s.polls[id], votes = Object.values(this.s.votes[id] || {});
    const counts = (poll?.o || []).map((_, j) => votes.filter(v => v === j).length);
    return { id, counts, total: votes.length };
  }
  // Closing a poll (or moving to another) keeps a dated copy of its result for the class report.
  archive() {
    const a = this.s.active; if (!a) return;
    const t = this.tally(a.id);
    this.s.history.push({ id: a.id, q: a.q, o: a.o, counts: t.counts, total: t.total, openedAt: a.openedAt || null, closedAt: new Date().toISOString() });
    if (this.s.history.length > HISTORY_MAX) this.s.history.splice(0, this.s.history.length - HISTORY_MAX);
  }
  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1), d = await request.json().catch(() => ({})), s = this.s, a = s.active;
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    const save = () => this.ctx.storage.put('s', s);
    if (op === 'current') {
      if (!a) return reply({ active: null });
      return reply({ active: { id: a.id, q: a.q, o: a.o, locked: a.locked, show: a.show }, myVote: s.votes[a.id]?.[d.user] ?? null, results: a.show ? this.tally(a.id) : null });
    }
    if (op === 'vote') {
      if (!a || a.id !== d.id) return reply({ error: 'This poll has closed.' }, 409);
      if (a.locked) return reply({ error: 'Voting is closed for this question.' }, 423);
      if (!Number.isInteger(d.choice) || d.choice < 0 || d.choice >= a.o.length) return reply({ error: 'Choose one of the options.' }, 400);
      (s.votes[a.id] ||= {})[d.user] = d.choice;
      await save();
      return reply({ ok: true, myVote: d.choice });
    }
    if (op === 'results') {
      if (!s.polls[d.id]) return reply({ id: d.id, counts: [], total: 0, open: false });
      const open = a?.id === d.id;
      if (!d.admin && !(open && a.show)) return reply({ error: 'Results are not being shown.' }, 403);
      return reply({ ...this.tally(d.id), open, locked: open ? a.locked : true, show: open ? a.show : false });
    }
    if (op === 'history') return reply({ history: s.history.slice().reverse() });
    if (op === 'export') return reply(s);
    if (op === 'control') {
      const { action, poll } = d;
      if (action === 'open') {
        const ok = poll && typeof poll.id === 'string' && poll.id.length <= 80 && typeof poll.q === 'string' && Array.isArray(poll.o)
          && poll.o.length >= 2 && poll.o.length <= 8 && poll.o.every(x => typeof x === 'string' && x.length <= 160);
        if (!ok) return reply({ error: 'That poll is not valid.' }, 400);
        s.polls[poll.id] = { q: poll.q.slice(0, 300), o: poll.o };
        if (a?.id !== poll.id) { this.archive(); s.active = { id: poll.id, q: s.polls[poll.id].q, o: poll.o, locked: false, show: false, openedAt: new Date().toISOString() }; }
      } else if (action === 'close') { this.archive(); s.active = null; }
      else if (['lock', 'unlock', 'show', 'hide'].includes(action)) {
        if (!a) return reply({ error: 'No poll is open.' }, 409);
        if (action === 'lock' || action === 'unlock') a.locked = action === 'lock'; else a.show = action === 'show';
      } else if (action === 'reset') {
        const id = poll?.id || a?.id; if (id) delete s.votes[id];
      } else return reply({ error: 'Unknown action.' }, 400);
      await save();
      return reply({ active: s.active, results: s.active ? this.tally(s.active.id) : null });
    }
    return reply({ error: 'Not found' }, 404);
  }
}
