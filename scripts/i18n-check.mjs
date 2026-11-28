// Reports how much of the UI and course content has a Dhivehi translation, and any keys in dv.js that no longer
// exist in en.js. Usage: npm run i18n-check
import en from '../public/i18n/en.js';
import dv from '../public/i18n/dv.js';
import content from '../public/i18n/content/dv.js';
import { lessons } from '../public/lessons.js';

const keys = Object.keys(en), done = keys.filter(k => dv[k]), stale = Object.keys(dv).filter(k => !(k in en));
console.log(`UI strings: ${done.length} of ${keys.length} translated (${Math.round(done.length / keys.length * 100)}%).`);
if (stale.length) console.log('Keys in dv.js that are not in en.js:', stale.join(', '));
console.log(`Sessions with translated plan text: ${Object.keys(content.lessons).length} of ${lessons.length}.`);
console.log(`Slides with translated text: ${Object.values(content.decks).reduce((n, d) => n + Object.keys(d).length, 0)}.`);
const missing = keys.filter(k => !dv[k]);
if (missing.length && process.argv.includes('--list')) console.log('Untranslated:', missing.join(', '));
