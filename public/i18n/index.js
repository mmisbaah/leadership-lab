// Internationalisation: English (source) and Dhivehi (Thaana, right to left). t(key, vars) looks up the current
// locale's dictionary and falls back to English, so a partial translation never shows blanks.
import en from './en.js';
import dv from './dv.js';
import dvContent from './content/dv.js';

export const LOCALES = { en: { name: 'English', dir: 'ltr', dict: en }, dv: { name: 'ދިވެހި (Dhivehi)', dir: 'rtl', dict: dv, content: dvContent } };
let current = 'en';
try { const saved = localStorage.getItem('ll-locale'); if (LOCALES[saved]) current = saved; } catch {}

export const locale = () => current;
export const isRTL = () => LOCALES[current].dir === 'rtl';
export function t(key, vars = {}) {
  const s = LOCALES[current].dict[key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
// Share of English keys that have a translation in this locale (shown as a notice while incomplete).
export const coverage = (code = current) => { const keys = Object.keys(en); return keys.filter(k => LOCALES[code].dict[k]).length / keys.length; };
export function applyLocale(root = document.documentElement) {
  root.lang = current; root.dir = LOCALES[current].dir;
}
export function setLocale(code) {
  if (!LOCALES[code]) return;
  current = code;
  try { localStorage.setItem('ll-locale', code); } catch {}
  applyLocale();
}
// Merge reviewed content translations over the English course data (mutates in place, once, at start-up).
export function localiseContent(lessons, decks, statements) {
  const c = LOCALES[current].content; if (!c) return;
  for (const l of lessons) Object.assign(l, c.lessons?.[l.id] || {});
  for (const [id, slides] of Object.entries(c.decks || {})) for (const [i, f] of Object.entries(slides)) if (decks[id]?.[+i]) Object.assign(decks[id][+i], f);
  for (const s of statements) if (c.statements?.[s.id]) s.text = c.statements[s.id];
  if (Object.keys(c.decks || {}).length && typeof document !== 'undefined') document.documentElement.classList.add('rtl-content');
}
