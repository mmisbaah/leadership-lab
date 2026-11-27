# Leadership Lab

An interactive guide for a two-day leadership training course for working adults: twelve sessions in five phases (Self, People, Performance, Integrate, Apply), including functional leadership (task, team, individual), followership and team building. Each session has a facilitator plan with suggested timings, class slides with a quick check, a decision quiz and a private notes page. A course plan lays out both days, and a Reference page collects the ten rules of followership, the leadership check sheet and the team checklists. Participants sign in, and their answers, notes and completed sessions are saved to their account.

The look follows the Instructor Guide (training-guide.mellowpilot.com): neumorphic light theme and navy dark theme, Barlow Condensed and IBM Plex fonts served from `public/assets/fonts`, styles in `public/css/app.css`.

Plain static site, no build step. Open `index.html` through any static server, e.g. `python3 -m http.server`, then visit http://localhost:8000. Lesson content lives in `lessons.js`.

## Presentations

Slides are drawn by `public/app.js` on a fixed 1280×720 canvas from the data in `public/decks.js`. Diagrams (`public/diagrams.js`) build step by step; icons are embedded from Lucide in `public/icons.js` (ISC licence, see the file header), so nothing loads from a CDN. Activity and discussion slides carry a countdown timer. Cover slides have photo slots: add a licensed photo by setting `photo.src` (and `photo.credit`) on the slide; until then a placeholder shows the intended subject and alt text.

## Live polls

Quick checks and opening questions become live polls when a facilitator presents them. Votes are held in the `PollRoom` Durable Object (binding `POLLS` in `wrangler.jsonc`), one vote per signed-in person. Participants vote on the **Live poll** page; facilitators show or hide results and lock voting from presenter view.

