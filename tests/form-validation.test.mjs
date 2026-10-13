import './helpers/typescript.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { authFormSchema, profileFormFields } = await import('../features/auth/validation.ts');
const { bookingFormSchema, bookingPayload, emptyDraft } = await import('../features/shipments/contracts.ts');
const { archiveFormSchema, transitionFormSchema } = await import('../lib/client/form-schemas.ts');

test('auth forms normalize optional fields and enforce registration password rules', () => {
  assert.deepEqual(authFormSchema(false).parse({ email: ' A@EXAMPLE.COM ', password: 'x', name: '', phone: '' }), { email: 'a@example.com', password: 'x' });
  const input = { name: ' Alex ', email: ' A@EXAMPLE.COM ', password: 'secure-password', phone: '  ' };
  assert.equal(authFormSchema(true).parse(input).phone, undefined);
  assert.equal(authFormSchema(true).parse(input).name, 'Alex');
  assert.equal(authFormSchema(true).safeParse({ ...input, password: 'short' }).success, false);
  assert.equal(authFormSchema(true).safeParse({ ...input, password: '😀'.repeat(19) }).success, false);
  assert.equal(profileFormFields.parse({ name: 'Alex', email: 'a@example.com', phone: '' }).phone, null);
});

test('booking validates only the current step and preserves local input until payload conversion', () => {
  const draft = { ...emptyDraft, pickupContactName: 'Alex', pickupContactPhone: '12345', pickupAddress: 'Street 1' };
  assert.equal(bookingFormSchema(0).safeParse(draft).success, true);
  assert.equal(bookingFormSchema(1).safeParse(draft).success, false);
  Object.assign(draft, { deliveryContactName: 'Recipient', deliveryContactPhone: '54321', deliveryAddress: 'Street 2', parcelWeightKg: '1.125', pickupScheduledAt: '2099-03-15T14:30' });
  assert.deepEqual(bookingFormSchema().parse(draft), draft);
  assert.equal(bookingPayload(draft).parcelWeightKg, 1.125);
  assert.equal(bookingPayload(draft).pickupScheduledAt, new Date(draft.pickupScheduledAt).toISOString());
  for (const parcelWeightKg of ['', '0', '1.0001']) assert.equal(bookingFormSchema(2).safeParse({ ...draft, parcelWeightKg }).success, false);
  for (const pickupScheduledAt of ['invalid', '2000-01-01T00:00', '2099-02-30T12:00']) {
    const result = bookingFormSchema().safeParse({ ...draft, pickupScheduledAt });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some(issue => issue.path[0] === 'pickupScheduledAt'));
  }
});

test('action dialogs validate trimmed required text and length limits', () => {
  assert.equal(archiveFormSchema('A reason').safeParse({ reason: '  a ' }).success, false);
  assert.equal(archiveFormSchema('A reason').safeParse({ reason: 'x'.repeat(1001) }).success, false);
  assert.equal(transitionFormSchema(true).safeParse({ note: '  ' }).success, false);
  assert.equal(transitionFormSchema(false).safeParse({ note: '' }).success, true);
  assert.equal(transitionFormSchema(false).safeParse({ note: 'x' }).success, false);
  assert.equal(transitionFormSchema(false).safeParse({ note: 'x'.repeat(1001) }).success, false);
});
