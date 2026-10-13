import './helpers/typescript.mjs';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { QueryObserver } from '@tanstack/react-query';
const { createQueryClient, resourceOptions } = await import('../lib/client/query-client.ts');
const { ApiClient, ApiError } = await import('../lib/client/api.ts');
const { SessionStore } = await import('../features/auth/session.ts');
const clients = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });
const client = () => { const value = createQueryClient(); clients.push(value); return value; };
const ok = data => Response.json({ success: true, data });
const fail = status => Response.json({ success: false, message: 'Failed', errors: [] }, { status });
const user = { id: 'one', role: 'CUSTOMER', name: 'Customer', email: 'a@example.com', isActive: true };
function session(api) {
  const store = new SessionStore(api);
  clients.push(store.queryClient);
  store.snapshot = { status: 'authenticated', user, error: null, revision: 1 };
  api.token = 'test-token';
  return store;
}

test('equivalent resource queries deduplicate, cache fresh data, and separate filters', async () => {
  let calls = 0;
  const api = new ApiClient(async url => { calls++; return ok({ url }); });
  const cache = client();
  const first = resourceOptions(api, '/shipments?page=1&status=CREATED', 'one:CUSTOMER:1');
  const same = resourceOptions(api, '/shipments?status=CREATED&page=1', 'one:CUSTOMER:1');
  const [a, b] = await Promise.all([cache.fetchQuery(first), cache.fetchQuery(same)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await cache.fetchQuery(first);
  assert.equal(calls, 1);
  await cache.fetchQuery(resourceOptions(api, '/shipments?page=2&status=CREATED', 'one:CUSTOMER:1'));
  assert.equal(calls, 2);
  assert.equal(cache.getQueryData(resourceOptions(api, '/shipments?page=1&status=CREATED', 'two:CUSTOMER:1').queryKey), undefined);
});

test('unsubscribing cancels obsolete requests and never caches their late result', async () => {
  let signal;
  let finish;
  const api = new ApiClient(async (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  const cache = client();
  const options = resourceOptions(api, '/shipments?page=1', 'one:CUSTOMER:1');
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => {});
  assert.equal(signal.aborted, false);
  stop();
  assert.equal(signal.aborted, true);
  finish(ok({ private: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cache.getQueryData(options.queryKey), undefined);
});

test('successful mutations invalidate cached resources; failed writes do not', async () => {
  let status = 200;
  const store = session(new ApiClient(async () => status === 200 ? ok({ saved: true }) : fail(status)));
  const key = resourceOptions(store.api, '/shipments', 'one:CUSTOMER:1').queryKey;
  store.queryClient.setQueryData(key, { shipments: [] });
  status = 409;
  await assert.rejects(store.api.request('/shipments/one/status', { method: 'PATCH', body: {} }));
  assert.equal(store.queryClient.getQueryState(key).isInvalidated, false);
  status = 200;
  await store.api.request('/shipments/one/status', { method: 'PATCH', body: {} });
  assert.equal(store.queryClient.getQueryState(key).isInvalidated, true);
});

test('session clear and role changes erase private caches; sessions never share a cache', async () => {
  const store = session(new ApiClient(async () => ok({ user: { ...user, role: 'ADMIN' } })));
  const key = ['resources', 'one:CUSTOMER:1', '/shipments'];
  store.queryClient.setQueryData(key, { secret: true });
  const other = session(new ApiClient());
  assert.equal(other.queryClient.getQueryData(key), undefined);
  await store.revalidate();
  assert.equal(store.snapshot.user.role, 'ADMIN');
  assert.equal(store.queryClient.getQueryCache().getAll().length, 0);
  store.queryClient.setQueryData(key, { secret: true });
  store.clear();
  assert.equal(store.queryClient.getQueryCache().getAll().length, 0);
});

test('errors and Retry-After do not trigger automatic query retries', async () => {
  let calls = 0;
  const api = new ApiClient(async () => { calls++; return Response.json({ success: false, message: 'Slow down', errors: [] }, { status: 429, headers: { 'Retry-After': '60' } }); });
  const cache = client();
  const options = resourceOptions(api, '/shipments', 'one:CUSTOMER:1');
  await assert.rejects(cache.fetchQuery(options), error => error instanceof ApiError && error.status === 429);
  await assert.rejects(cache.fetchQuery(options));
  assert.equal(calls, 1);
});

test('background invalidation retains loaded data while fetching its replacement', async () => {
  let release;
  const api = new ApiClient(async () => new Promise(resolve => { release = () => resolve(ok({ value: 'fresh' })); }));
  const cache = client();
  const options = resourceOptions(api, '/shipments', 'one:CUSTOMER:1');
  cache.setQueryData(options.queryKey, { value: 'cached' });
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => {});
  const refresh = cache.invalidateQueries({ queryKey: options.queryKey });
  assert.equal(observer.getCurrentResult().isPending, false);
  assert.equal(observer.getCurrentResult().isFetching, true);
  assert.deepEqual(observer.getCurrentResult().data, { value: 'cached' });
  release();
  await refresh;
  assert.deepEqual(observer.getCurrentResult().data, { value: 'fresh' });
  stop();
});
