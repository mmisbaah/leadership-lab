# Leadership Lab

An interactive guide for a two-day leadership training course for working adults: twelve sessions in five phases (Self, People, Performance, Integrate, Apply), including functional leadership (task, team, individual), followership and team building. Each session has a facilitator plan with suggested timings, 25–30 class slides with speaker notes, quick checks and live polls, a decision quiz and a private notes page. A course plan lays out both days, and a Reference page collects the ten rules of followership, the leadership check sheet and the team checklists.

The look follows the Instructor Guide (training-guide.mellowpilot.com): neumorphic light theme and navy dark theme, Barlow Condensed, IBM Plex and Noto Sans Thaana fonts served from `public/assets/fonts`, styles in `public/css/app.css`.

The front end is plain ES modules with no build step (`public/`). A Cloudflare Worker (`worker/`) handles sign-in, classes, attendance, certificates, live polls, backups and health checks. People, classes and progress live in **Cloudflare D1** (schema in `migrations/`). Lesson content lives in `public/lessons.js`, slides in `public/decks.js`.

**First deployment, or setting up a new environment: follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).**

## Running it locally

```bash
npm ci
```

```bash
npm run db:migrate:local
```

```bash
npm run create-admin -- my_admin "My Name" --local
```

```bash
npm run dev
```

`create-admin` prints a password. The app runs at http://localhost:8787.

## Tests

`npm test` starts a throwaway local Worker with its own temporary D1 database and storage, seeds an admin, and runs everything in `tests/`:

- `content.test.mjs`: plans and quizzes, 25–30 slides per deck, an explicit timer on every activity and discussion slide that fits the session length, well-formed polls, the photo manifest, QR codes decoded back to their URL by an independent decoder, the self-assessment, the i18n dictionaries, the D1 schema, the CSP hash of the inline script, and the service-worker version.
- `api.test.mjs`: security headers, shared-computer cookies, class ownership and co-facilitators, joining and importing, attendance and certificates (including `/verify` and revocation), class-isolated choice and open-text polls with moderation, per-class deck changes, impact averages that stay hidden below three people, anonymous evaluations, data export and deletion, the two-year purge, backups and `/api/health`. A marker written into notes, check-ins and self-assessments must never appear in any facilitator response or redacted backup.
- `app.test.mjs` (Playwright): every page for facilitators and participants in both themes with no script errors or CSP violations; the attendance grid; certificates; the self-assessment, evaluation, check-in, `.ics` reminder and data export; shared-computer mode; presenter view with per-class skips and timers, vote and join QR codes, the open-text word cloud and list; the deck customiser; Dhivehi right-to-left layout; and a fit check on every slide.
- `a11y.test.mjs`: axe-core WCAG 2.1 A/AA audit of the sign-in, join, verification, participant, facilitator and presenter pages in light and dark themes.

Run one file with `npm test -- a11y`, or point the suite at a running server with `BASE_URL`, `ADMIN_ID` and `ADMIN_PW`. Playwright needs Chromium (`npx playwright install chromium`).

## Deploying

Pushes to `main` deploy through `.github/workflows/deploy.yml`. The workflow runs the tests, refuses to deploy while `wrangler.jsonc` still has the placeholder D1 id, applies D1 migrations, deploys, and checks the site. It needs the repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts, Workers KV Storage, **D1** and Account Settings on the account; Workers Routes on the zone) and `CLOUDFLARE_ACCOUNT_ID`.

Manual deploy: `npx wrangler deploy`. `npm run build` is a dry run that bundles the Worker and lists its bindings.

### Cloudflare bindings and secrets (`wrangler.jsonc`)

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 database `leadership-lab` | accounts, classes, co-facilitators, attendance, notes, quiz answers, check-ins, poll history, self-assessments, evaluations, certificates |
| `USERS` | KV namespace | sign-in lockouts, rate limits, alert throttling, the session signing key |
| `BACKUPS` | KV namespace | nightly snapshots of every D1 table (newest 30 kept) |
| `POLLS` → `PollRoom` | Durable Object | one live-poll room per class |
| `ASSETS` | Static assets | `public/` |
| `CERT_MIN_SESSIONS` | Variable (default `12`) | sessions a participant must be marked present for before a certificate is issued |
| Cron `17 2 * * *` | Cron Trigger | nightly backup, then the two-year retention purge |
| `BACKUP_KEY` | Secret | encrypts complete snapshots. Without it snapshots are redacted, an alert fires, and `/api/health` fails. Make one with `npm run generate-backup-key`. |
| `ALERT_WEBHOOK_URL` | Secret (optional) | JSON webhook for unhandled errors, failed backups and a missing backup key |

### Health and alerts

- `/healthz` is a liveness check that always answers with the version.
- `/api/health` is the readiness check for uptime monitors. It returns 200 only when D1 answers, `BACKUP_KEY` is set and the newest backup is under 36 hours old; otherwise 503 with the problems listed.
- Every unhandled error is logged as one JSON line (Workers Logs) and, when `ALERT_WEBHOOK_URL` is set, posted to it, at most once every 15 minutes per error.

## Roles, classes and attendance

There are three kinds of account. **Participants** take the course. **Facilitators** run their own classes. **Admins** see every class, create facilitator accounts and manage backups.

- The Participants page opens on **my classes**: classes you own or co-facilitate. Admins can switch to all classes.
- A class owner adds or removes **co-facilitators** by login ID. Only the owner (or an admin) can archive a class or change its facilitators.
- Participants join with the class code at `/join` (or by scanning the QR code on the class card or on Session 01's title slide), or the facilitator imports a CSV.
- **Attendance** is marked by facilitators on the class roster: tick boxes per person and session, or press a session number to mark everyone present. Participants can't mark themselves.
- **Certificates** are issued by the server once enough sessions are marked present. Each carries a code like `LL-2026-7KQ2-M9XD` and a QR code; anyone can check it at `/verify/<code>`, which shows only the name, class, course and dates. Facilitators can revoke and reinstate certificates.

## Presenting

- **Presenter view** (`P`) keeps notes, timers and the next slide on your laptop while a projector window shows the slides. Choose **Presenting to** in the Live poll panel: that class's polls, skipped slides and timer changes then apply.
- **Timers**: every activity and discussion slide has its own planned minutes (`min` in `public/decks.js`). `T` starts or pauses, `R` resets, `+` adds a minute.
- **Customise deck** (from the Participants page) lets a facilitator skip slides and change timers for one class, without editing code.
- **Live polls**: opening questions and quick checks are multiple choice. Debriefs are **open text**: participants type a short answer, and the projector shows a word cloud (common words and slurs filtered) or a list. Facilitators can hide or pin answers, and hidden answers never reach the projector or phones. Each poll slide shows a QR code for the vote page.
- **`J`** shows the class join code and a large QR code on the projector.

## Measuring impact (anonymous to facilitators)

- **Self-assessment**: ten everyday behaviours rated 1–5 at Session 01 and again at the 30-day check-in (`public/assessment.js`).
- **Anonymous evaluation** at the end of Session 12: relevance, pace, facilitator, one thing to improve. Stored with the class and a date only, never the person.
- **Follow-through**: how many participants did a 30-day check-in, and their average self-rating.
- The class report shows all three as class figures, and only when at least three people have answered. Individual answers, notes and check-in text never leave the participant.

## For participants after the course

- **Action plan**: their commitment and notes, printable, with an **Add to calendar (.ics)** button for the 30-day check-in.
- **30-day check-in** at `/checkin`.
- **Review quiz**: kept on the device, and never changes the in-class answers.
- **Certificate**.
- **My data and privacy**: download everything as JSON or a readable document, or delete the account and every linked record.
- **Shared computer**: tick "This is a shared computer" at sign-in. The session ends when the browser closes, and nothing personal is stored in the browser.

## Data retention and backups

- Classes archived for more than **two years** are deleted automatically with their participants and everything they own. Facilitator accounts stay.
- `npm run restore-backup -- list` / `latest` / `latest --apply` restores a snapshot into D1. Encrypted snapshots need `BACKUP_KEY` in the environment.
- `npm run migrate-kv-to-d1` moved the original KV accounts into D1 (idempotent; dry run unless `--apply`).

## Photos

The 13 photo slots are listed in `config/photos.json`. Put a licensed photo in `public/assets/photos/`, set its `src` and `credit`, and run `npm run apply-photos`. Slots without a photo use the slide's text layout, and `"enabled": false` hides every photo. Photos must be served from the app itself, because the Content Security Policy blocks images from other sites.

## Dhivehi

The app has an English/Dhivehi switch (Account → Language). Dhivehi switches the layout to right to left and uses the bundled Noto Sans Thaana font. Nothing has been machine-translated:

- UI strings live in `public/i18n/en.js`, and translations go in `public/i18n/dv.js`.
- Reviewed course text goes in `public/i18n/content/dv.js`.
- Anything without a translation shows in English.
- `npm run i18n-check` reports coverage.

## Content review

`npm run export-content` writes `docs/content-review.md`: every session plan, quiz question with its strongest answer and rationale, notes prompt, slide, speaker note, timer and poll type, plus the self-assessment statements and evaluation questions, in one document for a subject-matter reviewer.
