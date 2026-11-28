-- Leadership Lab: initial D1 schema. Apply with
--   npx wrangler d1 migrations apply leadership-lab --remote     (live)
--   npx wrangler d1 migrations apply leadership-lab --local      (wrangler dev)
-- Everything about a person cascades from users, so deleting a user removes all of their records, except anonymous
-- course evaluations, which carry no user id at all.

CREATE TABLE classes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL UNIQUE,              -- join code, e.g. MNDF-26A
  owner_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created        TEXT NOT NULL,
  archived_at    TEXT,                              -- set when archived; retention purges after 730 days
  deck_overrides TEXT NOT NULL DEFAULT '{}'         -- {"<lesson>": {"skip": [slide indexes], "timers": {"<index>": minutes}}}
);

CREATE TABLE users (
  id       TEXT PRIMARY KEY,                        -- login ID
  name     TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'facilitator', 'admin')),
  locked   INTEGER NOT NULL DEFAULT 0,              -- shared demo account: its password can't be changed by whoever signs in
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,   -- a participant's enrolment
  hash     TEXT NOT NULL,
  salt     TEXT NOT NULL,
  iter     INTEGER NOT NULL,
  ver      INTEGER NOT NULL DEFAULT 1,              -- bumping it ends every session for this user
  joined   TEXT,                                    -- 'code', 'import', 'added' or 'migrated'
  created  TEXT NOT NULL
);
CREATE INDEX users_class ON users(class_id);

-- Co-facilitators. The owner is classes.owner_id; this table holds everyone else who may run the class.
CREATE TABLE class_facilitators (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by TEXT,
  added_at TEXT NOT NULL,
  PRIMARY KEY (class_id, user_id)
);
CREATE INDEX class_facilitators_user ON class_facilitators(user_id);

-- Facilitator-marked attendance, one row per participant and session (enrolment itself is users.class_id).
CREATE TABLE enrollments_attendance (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  class_id  TEXT REFERENCES classes(id) ON DELETE CASCADE,
  present   INTEGER NOT NULL DEFAULT 1,
  marked_by TEXT,
  marked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX attendance_class ON enrollments_attendance(class_id);

-- Private reflections. Only ever returned to their owner.
CREATE TABLE progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL,
  note       TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE quiz_responses (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   TEXT NOT NULL,
  choice      INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

-- 30-day check-ins. Private: facilitators only ever see counts and averages over at least 3 people.
CREATE TABLE checkins (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      TEXT NOT NULL,
  rating  INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  helped  TEXT,
  blocked TEXT,
  next    TEXT
);
CREATE INDEX checkins_user ON checkins(user_id);

-- Closed live polls, archived from the PollRoom Durable Object when a poll closes.
CREATE TABLE polls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   TEXT REFERENCES classes(id) ON DELETE CASCADE,   -- NULL: participants with no class
  poll_key   TEXT NOT NULL,                                    -- "<lesson>:<slide index>"
  kind       TEXT NOT NULL DEFAULT 'choice' CHECK (kind IN ('choice', 'open')),
  question   TEXT NOT NULL,
  options    TEXT NOT NULL DEFAULT '[]',
  counts     TEXT NOT NULL DEFAULT '[]',
  entries    TEXT NOT NULL DEFAULT '[]',                       -- open text: grouped answers left visible by the facilitator
  total      INTEGER NOT NULL DEFAULT 0,
  opened_at  TEXT,
  closed_at  TEXT NOT NULL
);
CREATE INDEX polls_class ON polls(class_id, closed_at);

CREATE TABLE poll_votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice  INTEGER,
  text    TEXT,
  PRIMARY KEY (poll_id, user_id)
);

-- Before (Session 01) and after (30-day check-in) self-assessment. Private; reported only as class averages, n >= 3.
CREATE TABLE self_assessments (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase    TEXT NOT NULL CHECK (phase IN ('baseline', 'followup')),
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  answers  TEXT NOT NULL,                                      -- JSON array of 10 ratings, 1 to 5
  at       TEXT NOT NULL,
  PRIMARY KEY (user_id, phase)
);

-- Anonymous end-of-course evaluation: no user id, and a date rather than a time, so a response can't be traced back.
CREATE TABLE course_evaluations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id     TEXT REFERENCES classes(id) ON DELETE CASCADE,
  relevance    INTEGER NOT NULL CHECK (relevance BETWEEN 1 AND 5),
  pace         INTEGER NOT NULL CHECK (pace BETWEEN 1 AND 5),     -- 1 too slow, 3 about right, 5 too fast
  facilitator  INTEGER NOT NULL CHECK (facilitator BETWEEN 1 AND 5),
  improve      TEXT,
  submitted_on TEXT NOT NULL
);
-- Who has already submitted (to stop repeats). Kept apart from the answers, with no time or link to them.
CREATE TABLE evaluation_submissions (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  PRIMARY KEY (user_id, class_id)
);

-- Server-issued certificates. The code is public (printed on the certificate) and checked at /verify/<code>.
CREATE TABLE certificates (
  code         TEXT PRIMARY KEY,                               -- LL-2026-XXXX-XXXX
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id     TEXT REFERENCES classes(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  class_name   TEXT,
  course       TEXT NOT NULL,
  sessions     INTEGER NOT NULL,
  completed_on TEXT NOT NULL,
  issued_at    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
  revoked_at   TEXT,
  revoked_by   TEXT
);
CREATE INDEX certificates_user ON certificates(user_id);
