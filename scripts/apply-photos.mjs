// Turns config/photos.json into public/photos.js, which the slides read at runtime.
// Usage: npm run apply-photos    (tests/content.test.mjs fails if the two are out of step)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('config/photos.json', 'utf8'));
const slots = {};
for (const [id, s] of Object.entries(cfg.slots)) {
  if (!s.src) continue;
  if (!s.src.startsWith('/assets/photos/')) throw new Error(`${id}: photos must live in public/assets/photos/ (the Content Security Policy blocks other sites)`);
  if (!existsSync('public' + s.src)) throw new Error(`${id}: ${s.src} does not exist`);
  if (!s.alt) throw new Error(`${id}: needs alt text`);
  slots[id] = { src: s.src, credit: s.credit || '', alt: s.alt };
}
export const render = () => `// Generated from config/photos.json by npm run apply-photos. Do not edit by hand.\nexport const photos = ${JSON.stringify({ enabled: cfg.enabled !== false, slots }, null, 2)};\n`;
writeFileSync('public/photos.js', render());
console.log(`public/photos.js: ${Object.keys(slots).length} of ${Object.keys(cfg.slots).length} photo slots filled, photos ${cfg.enabled === false ? 'disabled' : 'enabled'}.`);
