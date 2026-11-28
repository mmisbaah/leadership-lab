// D1 data access: people, classes, permissions. Every query is parameterised.
import { lessons } from '../public/lessons.js';

export const LESSON_IDS = new Set(lessons.map(l => l.id));
export const COURSE_TITLE = 'Leadership Lab: a practical two-day leadership course';
export const now = () => new Date().toISOString();
export const all = async (env, sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results;
export const first = (env, sql, ...b) => env.DB.prepare(sql).bind(...b).first();
export const run = (env, sql, ...b) => env.DB.prepare(sql).bind(...b).run();
export const stmt = (env, sql, ...b) => env.DB.prepare(sql).bind(...b);
export const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

// ---------- people ----------
export function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, role: r.role, admin: r.role === 'admin', facilitator: r.role !== 'participant', locked: !!r.locked,
    classId: r.class_id || null, hash: r.hash, salt: r.salt, iter: r.iter, ver: r.ver, created: r.created, joined: r.joined || null,
  };
}
export const getUser = async (env, id) => mapUser(await first(env, 'SELECT * FROM users WHERE id = ?', id));
export const publicUser = u => ({ id: u.id, name: u.name, role: u.role, admin: u.admin, facilitator: u.facilitator, locked: u.locked, classId: u.classId, created: u.created });
export const insertUser = (env, u) => stmt(env,
  'INSERT INTO users (id, name, role, locked, class_id, hash, salt, iter, ver, joined, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  u.id, u.name, u.role || 'participant', u.locked ? 1 : 0, u.classId || null, u.hash, u.salt, u.iter, u.ver || 1, u.joined || null, u.created || now());
export const setPassword = (env, id, h) => run(env, 'UPDATE users SET hash = ?, salt = ?, iter = ?, ver = ver + 1 WHERE id = ?', h.hash, h.salt, h.iter, id);

// ---------- classes ----------
export function mapClass(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, code: r.code, owner: r.owner_id || null, status: r.status, created: r.created, archivedAt: r.archived_at || null, deck: parse(r.deck_overrides, {}) };
}
export const getClass = async (env, id) => mapClass(await first(env, 'SELECT * FROM classes WHERE id = ?', id));
export const classByCode = async (env, code) => mapClass(await first(env, 'SELECT * FROM classes WHERE code = ?', code));

// Who may run a class: an admin, its owner, or a co-facilitator.
export async function canManage(env, user, classId) {
  if (!user?.facilitator || !classId) return false;
  if (user.admin) return !!await first(env, 'SELECT 1 FROM classes WHERE id = ?', classId);
  return !!await first(env, `SELECT 1 FROM classes c WHERE c.id = ?1 AND (c.owner_id = ?2 OR EXISTS
    (SELECT 1 FROM class_facilitators f WHERE f.class_id = c.id AND f.user_id = ?2))`, classId, user.id);
}
export async function managedClassIds(env, user) {
  const rows = await all(env, `SELECT id FROM classes WHERE owner_id = ?1 UNION SELECT class_id AS id FROM class_facilitators WHERE user_id = ?1`, user.id);
  return rows.map(r => r.id);
}
export const isOwner = (user, c) => user.admin || c.owner === user.id;
export const coFacilitators = (env, classId) => all(env,
  'SELECT u.id, u.name, u.role FROM class_facilitators f JOIN users u ON u.id = f.user_id WHERE f.class_id = ? ORDER BY u.name', classId);

// ---------- attendance ----------
export const attendedLessons = async (env, userId) =>
  (await all(env, 'SELECT lesson_id, marked_at FROM enrollments_attendance WHERE user_id = ? AND present = 1', userId)).filter(r => LESSON_IDS.has(r.lesson_id));
export const certThreshold = env => Math.min(lessons.length, Math.max(1, parseInt(env.CERT_MIN_SESSIONS, 10) || lessons.length));
