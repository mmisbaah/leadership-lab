// A tiny HTTP client with a cookie jar, for talking to the Worker the way a browser would.
export const BASE = process.env.BASE_URL || 'http://127.0.0.1:8799';
export const ADMIN = { id: process.env.ADMIN_ID, pw: process.env.ADMIN_PW };

export class Client {
  constructor() { this.cookie = ''; }
  async req(path, { method = 'GET', body, form, headers = {} } = {}) {
    const h = { Accept: 'application/json', ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (method !== 'GET') h.Origin = BASE;
    let payload;
    if (form) { payload = new URLSearchParams(form); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) { const kv = c.split(';')[0]; if (kv.endsWith('=')) this.cookie = ''; else this.cookie = kv; }
    return res;
  }
  async json(path, body) {
    const res = await this.req(path, body === undefined ? {} : { method: 'POST', body });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, text };
  }
  async login(id, pw) {
    const res = await this.req('/login', { method: 'POST', form: { login: id, password: pw, next: '/' } });
    if (!this.cookie) throw new Error(`Sign-in failed for ${id} (${res.status})`);
    return this;
  }
}
export const admin = () => new Client().login(ADMIN.id, ADMIN.pw);
let n = 0;
export const uid = p => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;
