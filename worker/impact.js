// Class-level impact figures for the report. Individual answers never leave this file: every average needs at least
// MIN_GROUP people behind it, evaluation comments are shown only once MIN_GROUP evaluations exist (and in random
// order), and check-in text is never read at all.
import { all, parse } from './db.js';
import { STATEMENTS, MIN_GROUP } from '../public/assessment.js';

const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null;
const enough = xs => xs.length >= MIN_GROUP;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function classImpact(env, classId, memberIds) {
  const ph = Array(Math.max(1, memberIds.length)).fill('?').join(', ');
  const [sa, ci, ev] = await Promise.all([
    memberIds.length ? all(env, `SELECT user_id, phase, answers FROM self_assessments WHERE user_id IN (${ph})`, ...memberIds) : [],
    memberIds.length ? all(env, `SELECT user_id, rating, at FROM checkins WHERE user_id IN (${ph}) ORDER BY at`, ...memberIds) : [],
    classId ? all(env, 'SELECT relevance, pace, facilitator, improve FROM course_evaluations WHERE class_id = ?', classId)
      : all(env, 'SELECT relevance, pace, facilitator, improve FROM course_evaluations WHERE class_id IS NULL'),
  ]);

  // Self-assessment: averages per statement before and after, and the change for people who answered both.
  const base = new Map(), follow = new Map();
  for (const r of sa) (r.phase === 'baseline' ? base : follow).set(r.user_id, parse(r.answers, []));
  const paired = [...base.keys()].filter(id => follow.has(id));
  const statements = STATEMENTS.map((s, i) => {
    const b = [...base.values()].map(a => a[i]).filter(Number.isInteger);
    const f = [...follow.values()].map(a => a[i]).filter(Number.isInteger);
    const d = paired.map(id => [base.get(id)[i], follow.get(id)[i]]).filter(([x, y]) => Number.isInteger(x) && Number.isInteger(y)).map(([x, y]) => y - x);
    return { id: s.id, text: s.text, baseline: enough(b) ? avg(b) : null, followup: enough(f) ? avg(f) : null, change: enough(d) ? avg(d) : null };
  });
  const assessment = { minGroup: MIN_GROUP, baselineCount: base.size, followupCount: follow.size, pairedCount: paired.length, statements };

  // Follow-through: how many people checked in, and their latest self-rating, averaged.
  const latest = new Map();
  for (const r of ci) latest.set(r.user_id, r.rating);
  const ratings = [...latest.values()];
  const followThrough = {
    enrolled: memberIds.length, checkedIn: latest.size, rate: memberIds.length ? Math.round(latest.size / memberIds.length * 100) : 0,
    averageRating: enough(ratings) ? avg(ratings) : null, minGroup: MIN_GROUP,
  };

  // Anonymous evaluation.
  const n = ev.length, show = n >= MIN_GROUP;
  const evaluation = {
    count: n, minGroup: MIN_GROUP,
    relevance: show ? avg(ev.map(e => e.relevance)) : null,
    facilitator: show ? avg(ev.map(e => e.facilitator)) : null,
    pace: show ? avg(ev.map(e => e.pace)) : null,
    paceCounts: show ? [1, 2, 3, 4, 5].map(v => ev.filter(e => e.pace === v).length) : null,
    comments: show ? shuffle(ev.map(e => (e.improve || '').trim()).filter(Boolean)) : [],
  };
  return { assessment, followThrough, evaluation };
}
