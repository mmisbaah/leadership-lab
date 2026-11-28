# Leadership Lab

An interactive guide for a two-day leadership training course for working adults: twelve sessions in five phases (Self, People, Performance, Integrate, Apply), including functional leadership (task, team, individual), followership and team building. Each session has a facilitator plan with suggested timings, class slides with a quick check, a decision quiz and a private notes page. A course plan lays out both days, and a Reference page collects the ten rules of followership, the leadership check sheet and the team checklists. Participants sign in, and their answers, notes and completed sessions are saved to their account.

The look follows the Instructor Guide (training-guide.mellowpilot.com): neumorphic light theme and navy dark theme, Barlow Condensed and IBM Plex fonts served from `public/assets/fonts`, styles in `public/css/app.css`.

The front end is plain ES modules with no build step (`public/`). A Cloudflare Worker (`worker/`) handles sign-in, classes, progress, check-ins, live polls and backups. Lesson content lives in `public/lessons.js`, slides in `public/decks.js`.

## Running it locally

```bash
npm ci
npm run create-admin -- my_admin "My Name" --local     # prints a password
npm run dev                                           # http://localhost:8787
```

## Tests

`npm test` starts a throwaway local Worker with its own temporary storage, seeds a facilitator, and runs everything in `tests/`:

- `content.test.mjs`: every session's plan and quiz, 25–30 slides per deck, valid quick checks and polls, the CSP hash of the inline script in `index.html`, and the service-worker version.
- `api.test.mjs`: security headers, cross-site POST blocking, classes and join codes, bulk import, class filters, facilitator-only endpoints, class-isolated live polls, the demo-account lock, check-ins, backups, and **note privacy**: a marker written into notes and check-ins must never appear in any facilitator response or in a redacted backup.
- `app.test.mjs` (Playwright): every page in both themes with no script errors or CSP violations, class creation and import through the UI, the class report and its CSV, the review quiz, certificate gating, the check-in, presenter/projector sync and the timer, and a fit check on every slide.
- `a11y.test.mjs`: axe-core WCAG 2.1 A/AA audit of the sign-in, join, participant, facilitator and presenter pages in light and dark themes.

Playwright needs a Chromium build: `npx playwright install chromium` the first time. Run one file with `npm test -- a11y`, or point the suite at a running server with `BASE_URL`, `ADMIN_ID` and `ADMIN_PW`.

## Deploying

Pushes to `main` deploy automatically through `.github/workflows/deploy.yml` after the tests pass. The workflow needs two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with **Workers Scripts: Edit**, **Workers KV Storage: Edit**, **Account Settings: Read** (account) and **Workers Routes: Edit** (zone mellowpilot.com) |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

Manual deploy from any checkout: `npx wrangler deploy` (with `CLOUDFLARE_API_TOKEN` set or after `npx wrangler login`). `npm run build` does a dry run that bundles the Worker and lists its bindings. `npm run deploy:inline` is a fallback that embeds `public/` in the Worker for environments where the assets upload is blocked.

### Cloudflare bindings (all in `wrangler.jsonc`)

| Binding | Type | Purpose |
| --- | --- | --- |
| `USERS` | KV namespace | accounts, classes, join codes, progress, private notes, check-ins |
| `BACKUPS` | KV namespace | nightly snapshots (newest 30 kept) |
| `POLLS` → `PollRoom` | Durable Object (SQLite, migration `v1`) | one live-poll room per class, with poll history |
| `ASSETS` | Static assets | `public/` |
| Cron `17 2 * * *` | Cron Trigger | daily backup at 02:17 UTC |
| `BACKUP_KEY` | Secret (optional) | encrypts whole snapshots; set with `npx wrangler secret put BACKUP_KEY` |

Without `BACKUP_KEY`, snapshots leave out password hashes, private notes and check-ins. With it, snapshots are complete and AES-256-GCM encrypted; keep a copy of the key somewhere safe, or the backups can't be read.

## Classes, privacy and reports

Facilitators create classes on the **Participants** page. Each class has a join code (e.g. `MNDF-26A`); participants sign up themselves at `/join`, or the facilitator pastes or uploads a CSV of names (login ID and password optional) and downloads the generated logins. Archiving a class stops its code working. Live polls run in a separate room for each class: in presenter view, choose **Presenting to**.

The **Class report** shows enrolment, completion per session, answers chosen for every quiz question, each participant's results and the live-poll history, with CSV export and a print layout.

Private notes and 30-day check-ins are only ever returned to their owner. No facilitator endpoint, report, export or redacted backup includes them; `tests/api.test.mjs` checks this.

## After the course

Each participant has an **Action plan** (their commitment and notes, printable), a **30-day check-in** at `/checkin` (rate follow-through, what helped, what got in the way, next commitment), a **Review quiz** (a shuffled mix of decision questions and quick checks with explanations; scores stay on the device and never touch the class answers) and a printable **Certificate**, available once all twelve sessions are complete.

## Backups and content review

- `npm run restore-backup -- list` lists snapshots; `npm run restore-backup -- latest` shows what one holds; add `--apply` to write it back (`--only class,code` to restore just some records, `--local` for local storage). Encrypted snapshots need `BACKUP_KEY` in the environment.
- `npm run export-content` writes `docs/content-review.md`: every session plan, quiz, notes prompt, slide and speaker note in one document for a subject-matter reviewer.

## Presentations

Slides are drawn by `public/app.js` on a fixed 1280×720 canvas from the data in `public/decks.js`. Diagrams (`public/diagrams.js`) build step by step; icons are embedded from Lucide in `public/icons.js` (ISC licence, see the file header), so nothing loads from a CDN. Activity and discussion slides carry a countdown timer. Some slides have photo slots: put a licensed photo in `public/assets/photos/`, set `photo.src` (e.g. `/assets/photos/briefing.jpg`) and `photo.credit` on the slide. Until then the slide uses its text-only layout. Photos must be served from the app itself; the Content Security Policy blocks images from other sites.

## Live polls

Quick checks and opening questions become live polls when a facilitator presents them. Votes are held in the `PollRoom` Durable Object (binding `POLLS` in `wrangler.jsonc`), one room per class and one vote per signed-in person. Participants vote on the **Live poll** page; facilitators show or hide results and lock voting from presenter view.

