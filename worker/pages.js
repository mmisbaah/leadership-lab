// Server-rendered pages: sign in, join a class with a code, and the hand-off page after signing in.
import { esc, html } from './lib.js';

const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#142440"/><circle cx="32" cy="32" r="19" fill="none" stroke="#C99A3E" stroke-width="3"/><path d="M25 21v22h15" fill="none" stroke="#F3D58F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const STYLE = `<style>
:root{--ink:#16213A;--ink2:#4F5B72;--paper:#E4E9F0;--card:#fff;--navy:#13223F;--gold:#7A570F;--bad:#A3312A;--line:#C9D1DC}
@media (prefers-color-scheme:dark){:root{--ink:#E5EAF2;--ink2:#A3AFC2;--paper:#0C1422;--card:#132036;--gold:#E0AE4C;--bad:#F08A80;--line:#2E3F5C}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;box-shadow:0 10px 30px rgba(20,36,64,.08)}
.brand{display:flex;gap:12px;align-items:center;margin-bottom:20px}.brand svg{width:44px;height:44px;flex:none}
.brand p{margin:0}.brand small{display:block;color:var(--gold);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700}.brand b{font-size:1.25rem}
h1{font-size:1.1rem;margin:0 0 4px}
label{display:block;font-weight:600;font-size:.86rem;margin:14px 0 6px}input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
button{margin-top:20px;width:100%;font:inherit;font-weight:700;padding:12px;border:0;border-radius:10px;background:var(--navy);color:#fff;cursor:pointer}
@media (prefers-color-scheme:dark){button{background:var(--gold);color:#142440}}
.err{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:.88rem;margin-bottom:6px}
p.note{color:var(--ink2);font-size:.85rem;margin:18px 0 0}p.note a{color:var(--gold);font-weight:600}
.hint{color:var(--ink2);font-size:.8rem;margin:4px 0 0}
label.check{display:flex;gap:10px;align-items:center;font-weight:600;margin:18px 0 0}label.check input{width:20px;height:20px;padding:0;margin:0;accent-color:var(--navy);flex:none}
</style>`;
const head = title => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Leadership Lab</title><meta name="theme-color" content="#142440"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest">${STYLE}</head><body><main>
<div class="brand">${MARK}<p><small>Leadership training</small><b>Leadership Lab</b></p></div>`;

export function loginPage({ error = '', id = '', next = '/', current = '', shared = false } = {}) {
  return html(`${head('Sign in')}<h1>Sign in</h1>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}">
<label for="login">Login ID</label><input id="login" name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${esc(id)}" ${id ? '' : 'autofocus'}>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required ${id ? 'autofocus' : ''}>
<label class="check"><input type="checkbox" name="shared" value="1" ${shared ? 'checked' : ''} aria-describedby="shared-hint"> This is a shared computer</label>
<p class="hint" id="shared-hint">You are signed out when the browser closes, and nothing is kept on this computer.</p>
<button type="submit">Sign in</button></form>
${current ? `<p class="note">You're signed in as <b>${esc(current)}</b>. Sign in with another login to switch, or <a href="/">go back to the course</a>.</p>` : ''}
<p class="note">Have a join code from your facilitator? <a href="/join">Create your account</a>.</p>
<p class="note">Forgot your password? Ask your facilitator.</p>
</main></body></html>`, 401);
}

export function joinPage({ error = '', code = '', name = '', id = '' } = {}) {
  return html(`${head('Join a class')}<h1>Join your class</h1><p class="hint">Use the join code your facilitator gave you to create your own login.</p>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<form method="post" action="/join">
<label for="code">Join code</label><input id="code" name="code" required autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(code)}" ${code ? '' : 'autofocus'} placeholder="e.g. LL-7KQ">
<label for="name">Your name</label><input id="name" name="name" required maxlength="80" autocomplete="name" value="${esc(name)}">
<label for="login">Choose a login ID</label><input id="login" name="login" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(id)}" aria-describedby="login-hint"><p class="hint" id="login-hint">3 to 64 lowercase letters, digits or . _ - @</p>
<label for="password">Choose a password</label><input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="pw-hint"><p class="hint" id="pw-hint">At least 8 characters.</p>
<label for="confirm">Type the password again</label><input id="confirm" name="confirm" type="password" required minlength="8" autocomplete="new-password">
<button type="submit">Create my account</button></form>
<p class="note">Already have a login? <a href="/login">Sign in</a>.</p>
</main></body></html>`, error ? 400 : 200);
}

// The session cookie goes on an ordinary page that then moves on, not on a redirect: several iPhone browsers can drop
// a cookie set on a redirect. A meta refresh moves on (no inline script, so the strict CSP holds).
export function signedInPage(next, setCookie) {
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing in…</title><meta http-equiv="refresh" content="0;url=${esc(next)}"><style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#E4E9F0;color:#16213A}a{color:#13223F}</style></head>
<body><main><p>Signing in… <a href="${esc(next)}">Continue</a></p></main></body></html>`, 200, { 'Set-Cookie': setCookie });
}

// Public certificate check: /verify/<code>. Shows only what is printed on the certificate itself.
export function verifyPage(cert, code) {
  const fmt = d => new Date(d + (d.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const body = !cert
    ? `<h1>Certificate not found</h1><div class="err" role="alert">No certificate has the code <b>${esc(code)}</b>. Check the code printed at the bottom of the certificate.</div>`
    : cert.status !== 'valid'
      ? `<h1>Certificate revoked</h1><div class="err" role="alert">Certificate <b>${esc(cert.code)}</b> was issued to ${esc(cert.name)} but has since been revoked by the course team.</div>`
      : `<h1>Certificate verified</h1><p class="ok" role="status">✔ This is a genuine Leadership Lab certificate.</p>
<dl><dt>Awarded to</dt><dd>${esc(cert.name)}</dd><dt>Course</dt><dd>${esc(cert.course)}</dd>${cert.class_name ? `<dt>Class</dt><dd>${esc(cert.class_name)}</dd>` : ''}
<dt>Sessions attended</dt><dd>${cert.sessions}</dd><dt>Completed</dt><dd>${fmt(cert.completed_on)}</dd><dt>Issued</dt><dd>${fmt(cert.issued_at)}</dd><dt>Code</dt><dd><code>${esc(cert.code)}</code></dd></dl>`;
  return html(`${head('Verify a certificate')}${body}
<form method="get" action="/verify"><label for="code">Check another code</label><input id="code" name="code" autocapitalize="characters" spellcheck="false" placeholder="LL-2026-XXXX-XXXX" required><button type="submit">Check</button></form>
<style>.ok{background:color-mix(in srgb,#1B7A4B 14%,transparent);color:#166A40;border-radius:10px;padding:10px 12px;font-weight:600}@media (prefers-color-scheme:dark){.ok{color:#4CC38A}}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:16px 0}dt{color:var(--ink2);font-size:.85rem}dd{margin:0;font-weight:600}code{font-size:.95em}</style>
</main></body></html>`, cert ? 200 : 404);
}
