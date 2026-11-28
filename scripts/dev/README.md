# Development tools

- `build-inline.mjs`: fallback deploy build that serves `public/` from memory inside the Worker. Only needed where
  the Workers Assets upload is blocked (it was in the cloud session that built this app). Normal deploys use
  `npx wrangler deploy`. Run with `npm run deploy:inline`.
- `build-decks.mjs`: applies slide edit batches to `public/decks.js`, copying any shortened wording into the speaker
  notes. `deck-edits/` holds the batches that produced the current decks (already applied; do not re-run them).
- `dump.mjs`: lists slides that break the copy limits.
