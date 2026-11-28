# Deployment checklist

Run these in order the first time. After that, merging to `main` deploys automatically.

## 1. Cloudflare API token

The GitHub Actions token needs these permissions, all on the account that holds leadership.mellowpilot.com:

| Scope | Permission |
| --- | --- |
| Account | Workers Scripts: Edit |
| Account | Workers KV Storage: Edit |
| Account | **D1: Edit** (new: the app now stores people and classes in D1) |
| Account | Account Settings: Read |
| Zone (mellowpilot.com) | Workers Routes: Edit |

## 2. Create the D1 database (once)

```bash
npx wrangler d1 create leadership-lab
```

Copy the `database_id` it prints into `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`, and commit that change. CI refuses to deploy while the placeholder is there.

## 3. Create the tables

```bash
npx wrangler d1 migrations apply leadership-lab --remote
```

CI runs the same command before every deploy, so future migrations in `migrations/` apply themselves.

## 4. Move the existing accounts from KV to D1

```bash
npm run migrate-kv-to-d1
```

```bash
npm run migrate-kv-to-d1 -- --apply
```

The first command is a dry run that prints what it would copy. The second writes it. Running it again changes nothing. Old self-ticked "session complete" marks are not carried over: certificates now depend on attendance that a facilitator marks.

## 5. Secrets

```bash
npm run generate-backup-key
```

```bash
npx wrangler secret put BACKUP_KEY
```

Save the key in a password manager first. Until `BACKUP_KEY` is set, nightly backups leave out notes and check-ins, an alert is raised, and `/api/health` returns 503.

Optional, for alerts on server errors and failed backups (Slack, Teams, Discord or any JSON webhook):

```bash
npx wrangler secret put ALERT_WEBHOOK_URL
```

## 6. GitHub secrets

In the repository, open Settings → Secrets and variables → Actions and add `CLOUDFLARE_API_TOKEN` (the token from step 1) and `CLOUDFLARE_ACCOUNT_ID`.

## 7. Merge into `main` and watch the first run

```bash
git fetch origin && git checkout main && git merge --ff-only origin/claude/leadership-lab-1qxxzy && git push origin main
```

Then open the repository's **Actions** tab. The run tests first (content, API, browser and accessibility suites), applies D1 migrations, deploys, and checks `/healthz`.

Afterwards:

- `https://leadership.mellowpilot.com/healthz` should report the new version.
- `https://leadership.mellowpilot.com/api/health` should return `"ok": true` once `BACKUP_KEY` is set and the first backup has run. Use "Back up now" on the Participants page to avoid waiting for the nightly run.
- Point an uptime monitor at `/api/health`. It returns 503 when the database is down, the key is missing, or the newest backup is more than 36 hours old.

## Day-to-day

| Task | Command |
| --- | --- |
| Run all tests | `npm test` |
| Add a facilitator or admin | `npm run create-admin -- <login> "<Name>" --role facilitator` |
| Fill a photo slot | edit `config/photos.json`, then `npm run apply-photos` |
| List or restore backups | `npm run restore-backup -- list`, then `npm run restore-backup -- latest --apply` |
| Content review document | `npm run export-content` |
| Dhivehi translation coverage | `npm run i18n-check` |
