import './helpers/typescript.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { profilePhotoSchema } = await import('../lib/profile-photo.ts');
const { updateProfileSchema } = await import('../validators/user.ts');
const { profileFields } = await import('../features/auth/validation.ts');
const { parseRequestBody } = await import('../lib/auth/route-helpers.ts');
const { SessionStore } = await import('../features/auth/session.ts');
const { ApiClient } = await import('../lib/client/api.ts');
const avatar = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(20000);
const profile = { name: 'Test User', email: 'test@example.com', phone: null, avatar };

test('profile photo contract accepts removal and bounded JPEG data, rejecting URLs and other content', () => {
  for (const value of [null, undefined, avatar]) assert.equal(profilePhotoSchema.safeParse(value).success, true);
  for (const value of ['https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,invalid', avatar + 'A'.repeat(280000)]) assert.equal(profilePhotoSchema.safeParse(value).success, false);
  assert.deepEqual(profileFields.parse(profile), updateProfileSchema.parse(profile));
  assert.equal(updateProfileSchema.safeParse({ ...profile, role: 'ADMIN' }).success, false);
});
test('profile request limit allows a photo without increasing the default request limit', async () => {
  const request = () => new Request('http://localhost/api/v1/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  assert.equal((await parseRequestBody(request(), updateProfileSchema, 300 * 1024)).avatar, avatar);
  await assert.rejects(parseRequestBody(request(), updateProfileSchema), /too large/);
});
test('saved profile photo is restored in session and can be removed', async () => {
  let current = { ...profile, id: 'user-1', role: 'CUSTOMER', isActive: true };
  const api = new ApiClient(async (url, options) => {
    if (options.method === 'PATCH') current = { ...current, ...JSON.parse(options.body) };
    return Response.json({ success: true, data: { user: current } });
  });
  api.token = 'test-token';
  const store = new SessionStore(api);
  await store.updateProfile(profile);
  await store.revalidate();
  assert.equal(store.snapshot.user.avatar, avatar);
  await store.updateProfile({ ...profile, avatar: null });
  assert.equal(store.snapshot.user.avatar, null);
});
