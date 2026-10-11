import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
registerHooks({
  resolve(specifier, context, next) { if (specifier.startsWith('@/')) return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true }; return next(specifier, context); },
  load(url, context, next) { if (url.endsWith('.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }), shortCircuit: true }; return next(url, context); },
});
const { ApiClient, ApiError, queryString, latestRequest, fieldErrors } = await import('../lib/client/api.ts');
const { SessionStore, safeReturnUrl } = await import('../features/auth/session.ts');
const { registrationFields, profileFields } = await import('../features/auth/validation.ts');
const user = { id: 'one', role: 'CUSTOMER', name: 'Test User', email: 'test@example.com', phone: null, isActive: true };
const ok = data => Response.json({ success: true, message: 'OK', data });
const fail = (status, headers) => Response.json({ success: false, message: 'Failed', errors: [{ path: 'email', message: 'Already used' }] }, { status, headers });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('serializes queries and sends JSON, bearer, cookie credentials and no-store', async () => {
  const api = new ApiClient(async (url, options) => { assert.equal(url, '/api/v1/example?page=2&isActive=false&q=a+b'); assert.equal(options.headers.get('authorization'), 'Bearer token'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.body, '{"name":"Test"}'); return ok({ done: true }); });
  api.token = 'token'; assert.deepEqual(await api.request('/example', { method: 'PATCH', body: { name: 'Test' }, query: { page: 2, isActive: false, q: 'a b', omit: undefined } }), { done: true });
  assert.equal(queryString({ empty: '', nil: null }), '');
});
test('simultaneous 401s coordinate one refresh, including late old-token responses', async () => {
  const late = deferred(); let refreshes = 0;
  const api = new ApiClient(async (url, options) => { if (options.headers.get('authorization') === 'Bearer old') { if (url.endsWith('late')) await late.promise; return fail(401); } return ok({ done: true }); });
  api.token = 'old'; api.onRefresh = async () => { refreshes++; api.token = 'new'; };
  const first = api.request('/first'); const second = api.request('/late'); await first; late.resolve(); await second;
  assert.equal(refreshes, 1);
});
test('refresh failure expires session and does not retry login or refresh', async () => {
  let requests = 0, expired = 0;
  const api = new ApiClient(async () => { requests++; return fail(401); });
  api.onRefresh = async () => { throw new ApiError(401, 'Expired'); }; api.onExpired = () => { expired++; api.clear(); };
  await assert.rejects(api.request('/private'), { status: 401 }); assert.equal(expired, 1); assert.equal(requests, 1);
  await assert.rejects(api.request('/auth/login'), { status: 401 }); assert.equal(expired, 1);
});
test('a protected request retries at most once', async () => {
  let requests = 0, refreshes = 0;
  const api = new ApiClient(async () => { requests++; return fail(401); }); api.onRefresh = async () => { refreshes++; };
  await assert.rejects(api.request('/private'), { status: 401 }); assert.equal(requests, 2); assert.equal(refreshes, 1);
});
test('429 preserves structured errors and honors Retry-After without resending', async () => {
  let requests = 0; const api = new ApiClient(async () => { requests++; return fail(429, { 'Retry-After': '30' }); });
  await assert.rejects(api.raw('/auth/login'), e => e.status === 429 && e.retryAt > Date.now() && fieldErrors(e).email === 'Already used');
  await assert.rejects(api.raw('/auth/login'), { status: 429 }); assert.equal(requests, 1);
});
test('network failure and 409 mutations are not automatically retried', async () => {
  for (const status of [0, 403, 404, 409, 500, 503]) {
    let requests = 0; const api = new ApiClient(async () => { requests++; if (!status) throw new TypeError('network'); return fail(status); });
    await assert.rejects(api.request('/shipments', { method: 'POST', body: {} }), { status }); assert.equal(requests, 1);
  }
});
test('superseded lists and cleared sessions discard late responses', async () => {
  const gate = deferred(); const api = new ApiClient(async () => { await gate.promise; return ok({ private: true }); });
  const latest = latestRequest(api); const first = latest.run('/list'); const second = latest.run('/list'); api.clear(); gate.resolve();
  await assert.rejects(first, { name: 'AbortError' }); await assert.rejects(second, { name: 'AbortError' });
});
test('restoration is coordinated and verifies /users/me before publishing a user', async () => {
  const requests = []; const api = new ApiClient(async url => { requests.push(url); return ok(url.endsWith('refresh-token') ? { accessToken: 'new' } : { user }); });
  const store = new SessionStore(api); await Promise.all([store.restore(), store.restore()]);
  assert.deepEqual(requests, ['/api/v1/auth/refresh-token', '/api/v1/users/me']); assert.equal(store.snapshot.status, 'authenticated');
});
test('login uses the current profile role, not the login payload role', async () => {
  const api = new ApiClient(async url => ok(url.endsWith('login') ? { accessToken: 'new', user: { ...user, role: 'ADMIN' } } : { user }));
  const store = new SessionStore(api); const current = await store.authenticate('login', {}); assert.equal(current.role, 'CUSTOMER');
});
test('role changes invalidate private UI and deactivation clears the session', async () => {
  let current = user; const api = new ApiClient(async url => url.endsWith('refresh-token') ? fail(401) : ok({ user: current }));
  const store = new SessionStore(api); api.token = 'token'; await store.revalidate(); const revision = store.snapshot.revision;
  current = { ...user, role: 'COURIER' }; await store.revalidate(); assert.equal(store.snapshot.user.role, 'COURIER'); assert.ok(store.snapshot.revision > revision);
  current = { ...user, isActive: false }; await store.revalidate(); assert.equal(store.snapshot.user, null); assert.equal(api.token, null);
});
test('403 profile revalidation terminates without recursion or deadlock', async () => {
  const store = new SessionStore(new ApiClient(async () => fail(403))); store.api.token = 'token'; await store.revalidate(); assert.equal(store.snapshot.status, 'error');
});
test('logout waits for cookie rotation, discards stale user, and revokes session', async () => {
  const gate = deferred(); const calls = [];
  const api = new ApiClient(async url => { calls.push(url); if (url.endsWith('refresh-token')) { await gate.promise; return ok({ accessToken: 'new' }); } return ok(null); });
  const store = new SessionStore(api); const restore = store.restore(); const logout = store.logout(); assert.equal(store.snapshot.user, null); gate.resolve(); await Promise.all([restore, logout]);
  assert.equal(store.snapshot.status, 'anonymous'); assert.equal(api.token, null); assert.ok(calls.at(-1).endsWith('/auth/logout'));
});
test('failed logout still clears local identity', async () => {
  const store = new SessionStore(new ApiClient(async () => fail(503))); store.api.token = 'token'; await assert.rejects(store.logout(), { status: 503 }); assert.equal(store.snapshot.user, null); assert.equal(store.api.token, null);
});
test('return destinations stay local and role permitted', () => {
  for (const value of ['//evil.com', 'https://evil.com', '/\\evil.com', '/admin', '/customer/../../admin', '/customer/%2fadmin', '/customerish', '/login']) assert.equal(safeReturnUrl(value, 'CUSTOMER'), '/customer');
  assert.equal(safeReturnUrl('/customer/shipments?page=2', 'CUSTOMER'), '/customer/shipments?page=2'); assert.equal(safeReturnUrl('/profile', 'COURIER'), '/profile');
});
test('browser validation matches UTF-8 password limits and optional phone rules', () => {
  const input = { name: ' Test User ', email: ' TEST@EXAMPLE.COM ', password: 'abcdefghijkl' };
  assert.equal(registrationFields.parse(input).email, 'test@example.com');
  assert.equal(registrationFields.safeParse({ ...input, password: '😀'.repeat(19) }).success, false);
  assert.equal(registrationFields.safeParse({ ...input, role: 'ADMIN' }).success, false);
  assert.equal(profileFields.safeParse({ name: 'Test', email: 'test@example.com', phone: null }).success, true);
});
