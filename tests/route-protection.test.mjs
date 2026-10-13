import './helpers/typescript.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server.js';
process.env.JWT_ACCESS_SECRET = 'route-protection-test-secret-at-least-32-bytes';
const { proxy, config } = await import('../proxy.ts');
const tokens = await import('../lib/auth/tokens.ts');
const { setRefreshCookie, clearRefreshCookie } = await import('../lib/auth/route-helpers.ts');
const { safeReturnUrl } = await import('../lib/auth/route-access.ts');
const request = (path, token) => new NextRequest(`https://expresshub.test${path}`, {
  headers: token ? { cookie: `${tokens.pageSessionCookie.name}=${token}` } : {},
});
const session = role => tokens.signPageSession({ userId: 'user-1', role });

test('anonymous visitors redirect before protected pages render, retaining query strings', () => {
  for (const path of ['/admin', '/admin/users/123', '/courier/shipments', '/customer/shipments?q=Dhaka&page=2', '/profile', '/checkout/success?session_id=cs_test']) {
    const response = proxy(request(path));
    assert.equal(response.status, 307);
    const target = new URL(response.headers.get('location'));
    assert.equal(target.pathname, '/login');
    assert.equal(target.searchParams.get('next'), path);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('signed roles may enter only their workspace, shared profile, and customer checkout', () => {
  for (const role of ['ADMIN', 'CUSTOMER', 'COURIER']) {
    const token = session(role);
    for (const path of [`/${role.toLowerCase()}`, `/${role.toLowerCase()}/shipments`, '/profile']) {
      assert.equal(proxy(request(path, token)).headers.get('x-middleware-next'), '1');
    }
    for (const other of ['ADMIN', 'CUSTOMER', 'COURIER'].filter(value => value !== role)) {
      assert.equal(proxy(request(`/${other.toLowerCase()}`, token)).headers.get('location'), `https://expresshub.test/${role.toLowerCase()}`);
    }
    const checkout = proxy(request('/checkout/cancel', token));
    assert.equal(checkout.status, role === 'CUSTOMER' ? 200 : 307);
  }
});

test('tampered, expired, wrong-purpose and malformed cookies are rejected and cleared', () => {
  const valid = session('ADMIN');
  const claims = jwt.decode(valid);
  const invalid = [valid + 'tampered', 'invalid', tokens.signAccessToken({ userId: 'u', role: 'ADMIN' }),
    ...[{ exp: 1 }, { role: 'OWNER' }, { sub: '' }, { aud: 'other' }, { tokenType: 'access' }, { exp: undefined }]
      .map(change => jwt.sign(JSON.parse(JSON.stringify({ ...claims, ...change })), process.env.JWT_ACCESS_SECRET)),
    jwt.sign(claims, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS384' })];
  for (const token of invalid) {
    const response = proxy(request('/admin', token));
    assert.match(response.headers.get('location'), /\/login\?next=/);
    assert.equal(response.cookies.get(tokens.pageSessionCookie.name).maxAge, 0);
  }
  assert.throws(() => tokens.verifyAccessToken(valid));
});

test('auth pages and public assets stay reachable and API behavior is preserved', () => {
  for (const path of ['/', '/login', '/register', '/icon.svg', '/_next/static/chunk.js', '/administrator']) {
    assert.equal(proxy(request(path, session('CUSTOMER'))).headers.get('x-middleware-next'), '1');
  }
  assert.equal(proxy(request('/api/v1/users/me')).headers.get('location'), null);
  assert.equal(proxy(request('/api/v1/users/me')).headers.get('vary'), 'Origin');
  assert.ok(config.matcher.includes('/checkout/:path*'));
});

test('auth cookie lifecycle issues and clears both cookies without broadening refresh scope', () => {
  const response = NextResponse.json({});
  setRefreshCookie(response, 'opaque-refresh', tokens.signAccessToken({ userId: 'user-1', role: 'COURIER' }));
  const page = response.cookies.get(tokens.pageSessionCookie.name);
  assert.equal(page.path, '/');
  assert.equal(page.httpOnly, true);
  assert.deepEqual(tokens.verifyPageSession(page.value), { userId: 'user-1', role: 'COURIER' });
  assert.equal(response.cookies.get(tokens.refreshTokenCookie.name).path, '/api/v1/auth');
  clearRefreshCookie(response);
  for (const name of [tokens.pageSessionCookie.name, tokens.refreshTokenCookie.name]) assert.equal(response.cookies.get(name).maxAge, 0);
});

test('return URLs remain constrained to the signed role', () => {
  for (const url of ['https://evil.test', '//evil.test', '/admin', '/customer/../admin', '/customer/%2e%2e/admin']) assert.equal(safeReturnUrl(url, 'CUSTOMER'), '/customer');
  assert.equal(safeReturnUrl('/customer/shipments?q=Dhaka%20City&page=2', 'CUSTOMER'), '/customer/shipments?q=Dhaka%20City&page=2');
});
