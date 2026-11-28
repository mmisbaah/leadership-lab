// Everything a person does with their own data: notes and quiz answers, check-ins, the self-assessment, the anonymous
// evaluation, their certificate, and exporting or deleting everything. Each endpoint reads and writes only the
// signed-in person's own rows.
import { json, same, hashPassword, unb64u, NOTE_MAX } from './lib.js';
import { all, first, run, stmt, now, parse, LESSON_IDS, COURSE_TITLE, getClass, attendedLessons, certThreshold, publicUser } from './db.js';
import { STATEMENTS } from '../public/assessment.js';

const CHECKIN_MAX = 60, TEXT_MAX = 1500;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const text = (v, max = TEXT_MAX) => String(v || '').trim().slice(0, max);
const rating = v => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

// Notes and quiz answers, with attendance (marked by a facilitator) shown as "done".
export async function ownProgress(env, user) {
  const [notes, quiz, att] = await Promise.all([
    all(env, 'SELECT lesson_id, note FROM progress WHERE user_id = ?', user.id),
    all(env, 'SELECT lesson_id, choice FROM quiz_responses WHERE user_id = ?', user.id),
    attendedLessons(env, user.id),
  ]);
  const p = {};
  const at = id => (p[id] ||= {});
  for (const r of notes) if (r.note && LESSON_IDS.has(r.lesson_id)) at(r.lesson_id).note = r.note;
  for (const r of quiz) if (LESSON_IDS.has(r.lesson_id)) at(r.lesson_id).choice = r.choice;
  for (const r of att) Object.assign(at(r.lesson_id), { done: true, doneAt: r.marked_at });
  return p;
}

async function issueCertificate(env, user) {
  const existing = await first(env, 'SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC LIMIT 1', user.id);
  if (existing) return existing;
  const att = await attendedLessons(env, user.id), need = certThreshold(env);
  if (att.length < need) return null;
  const c = user.classId ? await getClass(env, user.classId) : null;
  const completed = att.map(a => a.marked_at).sort().pop().slice(0, 10);
  for (let i = 0; i < 5; i++) {
    const r = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    const code = `LL-${completed.slice(0, 4)}-${r.slice(0, 4)}-${r.slice(4)}`;
    const res = await run(env, `INSERT OR IGNORE INTO certificates (code, user_id, class_id, name, class_name, course, sessions, completed_on, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, code, user.id, c?.id || null, user.name, c?.name || null, COURSE_TITLE, att.length, completed, now());
    if (res.meta.changes) return first(env, 'SELECT * FROM certificates WHERE code = ?', code);
  }
  throw new Error('Could not issue a certificate code. Try again.');
}
const certOut = c => c && ({ code: c.code, name: c.name, className: c.class_name, course: c.course, sessions: c.sessions, completedOn: c.completed_on, issuedAt: c.issued_at, status: c.status });

export async function participantApi(request, env, user, path, body) {
  const M = request.method;

  if (path === '/api/progress') {
    if (M === 'GET') return json({ progress: await ownProgress(env, user) });
    if (M !== 'POST') return json({ error: 'Not found' }, 404);
    if (body.reset === true) {
      await env.DB.batch([stmt(env, 'DELETE FROM progress WHERE user_id = ?', user.id), stmt(env, 'DELETE FROM quiz_responses WHERE user_id = ?', user.id)]);
      return json({ ok: true, progress: await ownProgress(env, user) });
    }
    const lesson = String(body.lesson || '');
    if (!LESSON_IDS.has(lesson)) return json({ error: 'That isn’t a session in this course.' }, 400);
    const e = body.entry || {};
    if (typeof e.note === 'string' && e.note.length > NOTE_MAX) return json({ error: `Keep a note under ${NOTE_MAX} characters.` }, 400);
    const ops = [];
    const note = typeof e.note === 'string' ? e.note.trim() : '';
    ops.push(note ? stmt(env, `INSERT INTO progress (user_id, lesson_id, note, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, lesson_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`, user.id, lesson, e.note.slice(0, NOTE_MAX), now())
      : stmt(env, 'DELETE FROM progress WHERE user_id = ? AND lesson_id = ?', user.id, lesson));
    ops.push(Number.isInteger(e.choice) && e.choice >= 0 && e.choice < 6 ? stmt(env, `INSERT INTO quiz_responses (user_id, lesson_id, choice, answered_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, lesson_id) DO UPDATE SET choice = excluded.choice, answered_at = excluded.answered_at`, user.id, lesson, e.choice, now())
      : stmt(env, 'DELETE FROM quiz_responses WHERE user_id = ? AND lesson_id = ?', user.id, lesson));
    await env.DB.batch(ops);   // attendance ("done") is set by a facilitator only, so it is ignored here
    return json({ ok: true, progress: await ownProgress(env, user) });
  }

  if (path === '/api/checkins') {
    const list = async () => all(env, 'SELECT at, rating, helped, blocked, next FROM checkins WHERE user_id = ? ORDER BY id', user.id);
    if (M === 'GET') return json({ checkins: await list() });
    if (M !== 'POST') return json({ error: 'Not found' }, 404);
    const r = rating(body.rating);
    if (!r) return json({ error: 'Rate how well you followed through, from 1 to 5.' }, 400);
    await run(env, 'INSERT INTO checkins (user_id, at, rating, helped, blocked, next) VALUES (?, ?, ?, ?, ?, ?)', user.id, now(), r, text(body.helped), text(body.blocked), text(body.next));
    await run(env, `DELETE FROM checkins WHERE user_id = ?1 AND id NOT IN (SELECT id FROM checkins WHERE user_id = ?1 ORDER BY id DESC LIMIT ${CHECKIN_MAX})`, user.id);
    return json({ ok: true, checkins: await list() });
  }

  if (path === '/api/assessment') {
    const rows = await all(env, 'SELECT phase, answers, at FROM self_assessments WHERE user_id = ?', user.id);
    const out = Object.fromEntries(rows.map(r => [r.phase, { answers: parse(r.answers, []), at: r.at }]));
    if (M === 'GET') return json({ baseline: out.baseline || null, followup: out.followup || null });
    if (M !== 'POST') return json({ error: 'Not found' }, 404);
    const phase = body.phase === 'followup' ? 'followup' : body.phase === 'baseline' ? 'baseline' : null;
    const answers = Array.isArray(body.answers) ? body.answers.map(rating) : [];
    if (!phase) return json({ error: 'Say whether this is the first or the 30-day self-assessment.' }, 400);
    if (answers.length !== STATEMENTS.length || answers.some(a => !a)) return json({ error: `Rate all ${STATEMENTS.length} statements from 1 to 5.` }, 400);
    if (phase === 'followup' && !out.baseline) return json({ error: 'Complete the first self-assessment (Session 01) before the 30-day one.' }, 400);
    await run(env, `INSERT INTO self_assessments (user_id, phase, class_id, answers, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, phase) DO UPDATE SET answers = excluded.answers, at = excluded.at, class_id = excluded.class_id`, user.id, phase, user.classId, JSON.stringify(answers), now());
    return json({ ok: true, [phase]: { answers, at: now() } });
  }

  // Anonymous evaluation: the answers carry the class and a date only; a separate marker stops repeat submissions.
  if (path === '/api/evaluation') {
    const key = user.classId || '';
    const done = !!await first(env, 'SELECT 1 FROM evaluation_submissions WHERE user_id = ? AND class_id = ?', user.id, key);
    if (M === 'GET') return json({ submitted: done });
    if (M !== 'POST') return json({ error: 'Not found' }, 404);
    if (done) return json({ error: 'You have already sent your evaluation for this course. Thank you.' }, 409);
    const rel = rating(body.relevance), pace = rating(body.pace), fac = rating(body.facilitator);
    if (!rel || !pace || !fac) return json({ error: 'Answer the three rating questions.' }, 400);
    await env.DB.batch([
      stmt(env, 'INSERT INTO course_evaluations (class_id, relevance, pace, facilitator, improve, submitted_on) VALUES (?, ?, ?, ?, ?, ?)', user.classId, rel, pace, fac, text(body.improve, 1000), now().slice(0, 10)),
      stmt(env, 'INSERT INTO evaluation_submissions (user_id, class_id) VALUES (?, ?)', user.id, key),
    ]);
    return json({ ok: true, submitted: true });
  }

  if (path === '/api/certificate') {
    const att = await attendedLessons(env, user.id), need = certThreshold(env);
    if (M === 'GET') {
      const c = await first(env, 'SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC LIMIT 1', user.id);
      return json({ certificate: certOut(c), attended: att.map(a => a.lesson_id), threshold: need });
    }
    if (M !== 'POST') return json({ error: 'Not found' }, 404);
    const c = await issueCertificate(env, user);
    if (!c) return json({ error: `Your facilitator has marked ${att.length} of the ${need} sessions needed for a certificate.`, attended: att.map(a => a.lesson_id), threshold: need }, 403);
    return json({ certificate: certOut(c), attended: att.map(a => a.lesson_id), threshold: need });
  }

  if (path === '/api/me/export' && M === 'GET') {
    const [cls, progress, attendance, checkins, assessments, certificates, votes] = await Promise.all([
      user.classId ? getClass(env, user.classId) : null,
      Promise.all([all(env, 'SELECT lesson_id, note, updated_at FROM progress WHERE user_id = ?', user.id), all(env, 'SELECT lesson_id, choice, answered_at FROM quiz_responses WHERE user_id = ?', user.id)])
        .then(([n, q]) => [...LESSON_IDS].map(id => ({ lesson_id: id, ...n.find(r => r.lesson_id === id), ...q.find(r => r.lesson_id === id) })).filter(r => r.note || Number.isInteger(r.choice))),
      all(env, 'SELECT lesson_id, marked_at FROM enrollments_attendance WHERE user_id = ? AND present = 1 ORDER BY marked_at', user.id),
      all(env, 'SELECT at, rating, helped, blocked, next FROM checkins WHERE user_id = ? ORDER BY id', user.id),
      all(env, 'SELECT phase, answers, at FROM self_assessments WHERE user_id = ?', user.id),
      all(env, 'SELECT code, class_name, completed_on, issued_at, status FROM certificates WHERE user_id = ?', user.id),
      all(env, 'SELECT p.question, p.closed_at, v.choice, v.text, p.options FROM poll_votes v JOIN polls p ON p.id = v.poll_id WHERE v.user_id = ? ORDER BY p.closed_at', user.id),
    ]);
    const evaluated = !!await first(env, 'SELECT 1 FROM evaluation_submissions WHERE user_id = ?', user.id);
    return json({
      exported: now(), account: publicUser(user), class: cls ? { name: cls.name, code: cls.code } : null,
      sessions: progress.map(r => ({ lesson: r.lesson_id, note: r.note, noteUpdated: r.updated_at, quizChoice: r.choice, quizAnswered: r.answered_at })),
      attendance: attendance.map(a => ({ lesson: a.lesson_id, markedAt: a.marked_at })),
      checkins, selfAssessment: assessments.map(a => ({ phase: a.phase, at: a.at, answers: STATEMENTS.map((s, i) => ({ statement: s.text, rating: parse(a.answers, [])[i] })) })),
      certificates, liveVotes: votes.map(v => ({ question: v.question, at: v.closed_at, answer: v.text ?? parse(v.options, [])[v.choice] ?? null })),
      evaluation: evaluated ? 'You sent an anonymous course evaluation. It is not linked to your account, so it is not included here and stays after deletion.' : null,
    }, 200, { 'Content-Disposition': `attachment; filename="leadership-lab-${user.id}.json"` });
  }

  if (path === '/api/me/delete' && M === 'POST') {
    if (user.locked) return json({ error: 'This is a shared demo account, so it can’t be deleted here.' }, 403);
    if (!same(await hashPassword(String(body.password || ''), unb64u(user.salt), user.iter), user.hash)) return json({ error: 'That password is wrong.' }, 400);
    if (user.admin && (await first(env, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")).n <= 1) return json({ error: 'You are the only admin. Make someone else an admin first.' }, 400);
    await run(env, 'UPDATE classes SET owner_id = NULL WHERE owner_id = ?', user.id);
    await run(env, 'DELETE FROM users WHERE id = ?', user.id);   // cascades to every record that belongs to this person
    return null;   // the caller clears the session cookie
  }

  return undefined;
}
