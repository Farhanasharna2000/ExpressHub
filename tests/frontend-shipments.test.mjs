import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {};', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (specifier.startsWith('@/')) return { url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) { if (url.endsWith('.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8'), { mode: 'transform' }), shortCircuit: true }; return next(url, context); },
});
const { bookingSchema, bookingPayload, emptyDraft, readShipmentQuery, localToISO, toLocalInput, money } = await import('../features/shipments/contracts.ts');
const { createShipmentSchema } = await import('../validators/shipment.ts');
const valid = { pickupContactName: 'Sender Name', pickupContactPhone: '0123456789', pickupAddress: '12 Pickup Street', deliveryContactName: 'Recipient Name', deliveryContactPhone: '0987654321', deliveryAddress: '34 Delivery Street', parcelWeightKg: 1.125 };

test('booking validation agrees with server field limits and precision', () => {
  for (const change of [{}, { parcelWeightKg: 0 }, { parcelWeightKg: -1 }, { parcelWeightKg: 1.0001 }, { parcelWeightKg: 10000000 }, { pickupContactName: 'A' }, { deliveryContactPhone: '1234' }, { pickupAddress: 'x'.repeat(501) }, { packageDescription: 'x'.repeat(1001) }, { pickupScheduledAt: '2000-01-01T00:00:00Z' }, { pickupScheduledAt: '2099-01-01T00:00:00+06:00' }, { price: 1 }]) {
    const input = { ...valid, ...change }; assert.equal(bookingSchema.safeParse(input).success, createShipmentSchema.safeParse(input).success, JSON.stringify(change));
  }
});
test('blank optional fields are omitted and booking submits accepted fields only', () => {
  const draft = { ...emptyDraft, ...Object.fromEntries(Object.entries(valid).map(([key, value]) => [key, String(value)])) };
  assert.deepEqual(bookingSchema.parse(bookingPayload(draft)), valid);
  assert.equal(bookingSchema.safeParse(bookingPayload({ ...draft, parcelWeightKg: '' })).success, false);
  assert.deepEqual(bookingPayload({ ...draft, parcelLengthCm: '12', parcelWidthCm: '10', parcelHeightCm: '5' }), valid);
  assert.equal(createShipmentSchema.safeParse(bookingPayload(draft)).success, true);
});
test('local time conversion preserves timezone and rejects invalid normalized dates', () => {
  const before = process.env.TZ; process.env.TZ = 'Asia/Dhaka';
  try { assert.equal(localToISO('2099-03-15T14:30'), '2099-03-15T08:30:00.000Z'); assert.equal(toLocalInput('2099-03-15T08:30:00.000Z'), '2099-03-15T14:30'); assert.throws(() => localToISO('2099-02-30T10:00')); assert.throws(() => localToISO('bad')); }
  finally { if (before) process.env.TZ = before; else delete process.env.TZ; }
});
test('URL filters preserve supported values and reject malformed and duplicate query parameters', () => {
  const value = readShipmentQuery(new URLSearchParams('page=2&limit=5&status=CREATED&paymentStatus=PENDING&sortBy=price&order=asc&q=Dhaka'));
  assert.equal(value.page, 2); assert.equal(value.limit, 5); assert.equal(value.q, 'Dhaka');
  for (const query of ['page=0', 'limit=101', 'page=1&page=2', 'status=FAKE', 'sortBy=password', 'unknown=1', 'from=2099-02-02T00:00:00Z&to=2099-01-01T00:00:00Z']) assert.throws(() => readShipmentQuery(new URLSearchParams(query)));
});
test('money displays server decimals without rounding or recomputing', () => { assert.equal(money('9999999999.99', 'BDT'), 'BDT 9999999999.99'); });

let lastQuery;
const event = { id: 'event', type: 'STATUS_CHANGED', fromStatus: 'CREATED', toStatus: 'PICKED_UP', publicNote: 'Collected', internalNote: 'Private operator note', actorId: 'courier', occurredAt: new Date() };
globalThis.prisma = { shipment: { async findFirst(query) {
  lastQuery = query;
  if (query.where.customerId === 'foreign' || query.where.courierId === 'foreign') return null;
  return { id: 'shipment', events: [Object.fromEntries(Object.keys(query.include.events.select).map(key => [key, event[key]]))] };
} } };
const { getShipment } = await import('../services/shipment.service.ts');
test('customer detail retains owner/deletion scope and excludes private event data', async () => {
  const result = await getShipment({ id: 'owner', role: 'CUSTOMER' }, 'shipment');
  assert.deepEqual(lastQuery.where, { deletedAt: null, customerId: 'owner', id: 'shipment' });
  assert.deepEqual(lastQuery.include.events.orderBy, [{ occurredAt: 'asc' }, { id: 'asc' }]);
  assert.equal('internalNote' in result.events[0], false); assert.equal('actorId' in result.events[0], false); assert.equal(result.events[0].publicNote, 'Collected');
  await assert.rejects(getShipment({ id: 'foreign', role: 'CUSTOMER' }, 'shipment'), { status: 404 });
});
test('courier detail is assignment-scoped and admin sees operator event fields', async () => {
  const courier = await getShipment({ id: 'courier', role: 'COURIER' }, 'shipment');
  assert.equal(lastQuery.where.courierId, 'courier'); assert.equal(courier.events[0].internalNote, 'Private operator note');
  await assert.rejects(getShipment({ id: 'foreign', role: 'COURIER' }, 'shipment'), { status: 404 });
  const admin = await getShipment({ id: 'admin', role: 'ADMIN' }, 'shipment'); assert.deepEqual(lastQuery.where, { deletedAt: null, id: 'shipment' }); assert.equal(admin.events[0].actorId, 'courier');
});
