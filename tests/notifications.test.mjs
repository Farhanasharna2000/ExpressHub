import "./helpers/typescript.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  dispatchNotifications, MAX_NOTIFICATION_ATTEMPTS, notificationTypeFor, retryDelayMs, trackingUrl, CLAIM_LEASE_MS,
} = await import("../services/notifications/dispatch.ts");
const { escapeHtml, renderNotification } = await import("../services/notifications/templates.ts");
const { PermanentSendError, brevoSender, consoleSender, configuredSender, isUndeliverableTestAddress, parseSender } = await import("../services/notifications/sender.ts");
const { appUrl, enqueueShipmentNotification } = await import("../services/notifications/outbox.ts");
const { hasCronSecret } = await import("../lib/http/cron-auth.ts");
const { listDeadNotificationsSchema, notificationIdSchema } = await import("../validators/notification.ts");
const { updateProfileSchema } = await import("../validators/user.ts");

const NOW = new Date("2026-11-17T06:00:00Z");
const TRACK = "EH-0123456789ABCDEF01234567";
const payload = { trackingNumber: TRACK, status: "PICKED_UP", occurredAt: "2026-11-17T05:59:00.000Z" };
const recipient = { name: "Rina", email: "rina@example.com", emailNotifications: true, active: true };

function harness({ claimed, recipientFor = () => recipient, send = async () => {} } = {}) {
  const calls = { sent: [], skipped: [], failed: [], emails: [], claim: null };
  const deps = {
    appUrl: "https://expresshub.example/",
    now: () => NOW,
    random: () => 0.5,
    sender: { name: "fake", async send(email) { calls.emails.push(email); await send(email); } },
    async claim(limit, now, leaseUntil) { calls.claim = { limit, now, leaseUntil }; return claimed; },
    async loadRecipient(id) { return recipientFor(id); },
    async markSent(id) { calls.sent.push(id); },
    async markSkipped(id, reason) { calls.skipped.push({ id, reason }); },
    async markFailed(id, update) { calls.failed.push({ id, ...update }); },
  };
  return { deps, calls };
}

test("only booking and the main status changes email the customer", () => {
  assert.equal(notificationTypeFor("CREATED", "CREATED"), "SHIPMENT_BOOKED");
  assert.equal(notificationTypeFor("STATUS_CHANGED", "PICKED_UP"), "SHIPMENT_PICKED_UP");
  assert.equal(notificationTypeFor("STATUS_CHANGED", "OUT_FOR_DELIVERY"), "SHIPMENT_OUT_FOR_DELIVERY");
  assert.equal(notificationTypeFor("STATUS_CHANGED", "DELIVERED"), "SHIPMENT_DELIVERED");
  assert.equal(notificationTypeFor("STATUS_CHANGED", "FAILED"), "SHIPMENT_FAILED");
  for (const [type, status] of [["STATUS_CHANGED", "IN_TRANSIT"], ["STATUS_CHANGED", "RETURNED"], ["COURIER_ASSIGNED", "CREATED"], ["CUSTOMER_CANCELLED", "CANCELLED"]]) {
    assert.equal(notificationTypeFor(type, status), null, `${type} ${status}`);
  }
});

test("retries back off exponentially with jitter and a cap", () => {
  assert.equal(retryDelayMs(1, () => 0), 30_000);
  assert.equal(retryDelayMs(1, () => 1), 60_000);
  assert.equal(retryDelayMs(2, () => 1), 120_000);
  assert.equal(retryDelayMs(4, () => 1), 480_000);
  assert.equal(retryDelayMs(30, () => 1), 6 * 60 * 60 * 1000);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const delay = retryDelayMs(attempt);
    const full = Math.min(60_000 * 2 ** (attempt - 1), 6 * 60 * 60 * 1000);
    assert.ok(delay >= full / 2 && delay <= full, `attempt ${attempt}: ${delay}`);
  }
});

test("templates escape user-supplied text in HTML and keep the text version plain", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  const email = renderNotification("SHIPMENT_DELIVERED", {
    recipientName: "<script>alert(1)</script>\r\nBcc: evil@example.com",
    trackingNumber: TRACK,
    trackingUrl: trackingUrl("https://expresshub.example/", TRACK),
    occurredAt: new Date("2026-11-17T05:59:00Z"),
  });
  assert.equal(email.html.includes("<script>"), false);
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(email.subject, `Your shipment has been delivered (${TRACK})`);
  assert.equal(/[\r\n]/.test(email.subject), false);
  assert.match(email.text, /Hi <script>alert\(1\)<\/script> Bcc: evil@example.com,/);
  assert.match(email.text, new RegExp(`https://expresshub.example/track/${TRACK}`));
  assert.match(email.text, /17 Nov 2026, 11:59/);
  assert.match(email.html, /lang="en"/);
});

test("a claimed notification is rendered, sent once with an idempotency key and marked sent", async () => {
  const { deps, calls } = harness({ claimed: [{ id: "n1", type: "SHIPMENT_PICKED_UP", attempts: 1, payload }] });
  const summary = await dispatchNotifications(deps, 7);
  assert.deepEqual(summary, { claimed: 1, sent: 1, skipped: 0, retrying: 0, dead: 0 });
  assert.equal(calls.claim.limit, 7);
  assert.equal(calls.claim.leaseUntil.getTime(), NOW.getTime() + CLAIM_LEASE_MS);
  assert.equal(calls.emails[0].to, recipient.email);
  assert.equal(calls.emails[0].idempotencyKey, "expresshub:notification:n1");
  assert.match(calls.emails[0].text, /https:\/\/expresshub\.example\/track\/EH-/);
  assert.deepEqual(calls.sent, ["n1"]);
});

test("opted-out, inactive or invalid notifications are skipped without sending", async () => {
  const claimed = [
    { id: "opted-out", type: "SHIPMENT_DELIVERED", attempts: 1, payload },
    { id: "inactive", type: "SHIPMENT_DELIVERED", attempts: 1, payload },
    { id: "missing", type: "SHIPMENT_DELIVERED", attempts: 1, payload },
    { id: "bad-payload", type: "SHIPMENT_DELIVERED", attempts: 1, payload: { trackingNumber: TRACK } },
  ];
  const recipients = {
    "opted-out": { ...recipient, emailNotifications: false },
    inactive: { ...recipient, active: false },
    missing: null,
    "bad-payload": recipient,
  };
  const { deps, calls } = harness({ claimed, recipientFor: (id) => recipients[id] });
  const summary = await dispatchNotifications(deps);
  assert.equal(summary.skipped, 4);
  assert.equal(calls.emails.length, 0);
  assert.deepEqual(calls.skipped.map((item) => item.reason), ["Recipient opted out", "Recipient unavailable", "Recipient unavailable", "Invalid payload"]);
});

test("a failed send is retried with backoff and becomes DEAD after the last attempt", async () => {
  const failing = async () => { throw new Error("socket hang up"); };
  const retrying = harness({ claimed: [{ id: "n2", type: "SHIPMENT_FAILED", attempts: 2, payload }], send: failing });
  assert.deepEqual(await dispatchNotifications(retrying.deps), { claimed: 1, sent: 0, skipped: 0, retrying: 1, dead: 0 });
  assert.equal(retrying.calls.failed[0].dead, false);
  assert.equal(retrying.calls.failed[0].nextAttemptAt.getTime(), NOW.getTime() + retryDelayMs(2, () => 0.5));
  assert.equal(retrying.calls.failed[0].error, "socket hang up");

  const last = harness({ claimed: [{ id: "n3", type: "SHIPMENT_FAILED", attempts: MAX_NOTIFICATION_ATTEMPTS, payload }], send: failing });
  assert.equal((await dispatchNotifications(last.deps)).dead, 1);
  assert.equal(last.calls.failed[0].dead, true);
  assert.equal(last.calls.sent.length, 0);

  const permanent = harness({
    claimed: [{ id: "n4", type: "SHIPMENT_FAILED", attempts: 1, payload }],
    send: async () => { throw new PermanentSendError("Brevo 400: invalid to"); },
  });
  assert.equal((await dispatchNotifications(permanent.deps)).dead, 1);
});

test("enqueue writes one idempotent outbox row only for notifiable events of opted-in customers", async () => {
  const writes = [];
  const tx = (optedIn) => ({
    user: { async findUnique() { return { emailNotifications: optedIn }; } },
    notificationOutbox: { async createMany(args) { writes.push(args); return { count: 1 }; } },
  });
  const shipment = { id: "s1", customerId: "u1", trackingNumber: TRACK };
  const occurredAt = new Date("2026-11-17T05:59:00Z");
  await enqueueShipmentNotification(tx(true), shipment, { id: "e1", type: "STATUS_CHANGED", toStatus: "DELIVERED", occurredAt });
  await enqueueShipmentNotification(tx(true), shipment, { id: "e2", type: "STATUS_CHANGED", toStatus: "IN_TRANSIT", occurredAt });
  await enqueueShipmentNotification(tx(false), shipment, { id: "e3", type: "STATUS_CHANGED", toStatus: "DELIVERED", occurredAt });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].skipDuplicates, true);
  assert.deepEqual(writes[0].data, [{
    type: "SHIPMENT_DELIVERED", shipmentId: "s1", eventId: "e1", recipientUserId: "u1",
    payload: { trackingNumber: TRACK, status: "DELIVERED", occurredAt: occurredAt.toISOString() },
  }]);
});

test("the cron secret check is exact, constant-length and rejects weak secrets", () => {
  const secret = "s".repeat(32);
  assert.equal(hasCronSecret(`Bearer ${secret}`, secret), true);
  assert.equal(hasCronSecret(`Bearer ${secret}x`, secret), false);
  assert.equal(hasCronSecret(secret, secret), false);
  assert.equal(hasCronSecret(null, secret), false);
  assert.equal(hasCronSecret("Bearer short", "short"), false);
  assert.equal(hasCronSecret("Bearer ", undefined), false);
});

test("the Brevo sender posts a verified single sender and classifies errors", async () => {
  const requests = [];
  const fakeFetch = (status) => async (url, init) => { requests.push({ url, init }); return new Response(status < 300 ? '{"messageId":"m"}' : '{"code":"x"}', { status }); };
  const email = { to: "rina@mail.co", subject: "Booked", html: "<p>h</p>", text: "t", idempotencyKey: "n1" };
  await brevoSender("xkeysib-1", "ExpressHub <owner@gmail.com>", fakeFetch(201)).send(email);
  assert.equal(requests[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(requests[0].init.headers["api-key"], "xkeysib-1");
  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.sender, { name: "ExpressHub", email: "owner@gmail.com" });
  assert.deepEqual(body.to, [{ email: "rina@mail.co" }]);
  assert.equal(body.subject, "Booked");
  assert.equal(body.htmlContent, "<p>h</p>");
  assert.equal(body.textContent, "t");
  assert.equal(body.headers["X-ExpressHub-Notification"], "n1");
  // Bad sender, bad address or a wrong key will not fix themselves; rate limits and outages might.
  for (const status of [400, 401]) await assert.rejects(brevoSender("k", "a@b.co", fakeFetch(status)).send(email), PermanentSendError, String(status));
  for (const status of [429, 500, 503]) await assert.rejects(brevoSender("k", "a@b.co", fakeFetch(status)).send(email), (error) => !(error instanceof PermanentSendError), String(status));
});

test("reserved test addresses are never sent to a real provider", async () => {
  for (const address of ["a@example.com", "a@example.org", "e2e-admin@expresshub.test", "x@foo.invalid", "x@mail.example", "x@localhost"]) {
    assert.equal(isUndeliverableTestAddress(address), true, address);
  }
  for (const address of ["a@gmail.com", "a@examples.com", "a@example.com.bd", "a@testing.io"]) {
    assert.equal(isUndeliverableTestAddress(address), false, address);
  }
  let calls = 0;
  const counting = async () => { calls += 1; return new Response("{}", { status: 201 }); };
  const email = { to: "rina@example.com", subject: "S", html: "", text: "", idempotencyKey: "k" };
  await brevoSender("k", "a@b.co", counting).send(email);
  assert.equal(calls, 0);
});

test("the sender address may include a display name", () => {
  assert.deepEqual(parseSender("ExpressHub <owner@gmail.com>"), { name: "ExpressHub", email: "owner@gmail.com" });
  assert.deepEqual(parseSender('"Express Hub" <owner@gmail.com>'), { name: "Express Hub", email: "owner@gmail.com" });
  assert.deepEqual(parseSender("owner@gmail.com"), { name: undefined, email: "owner@gmail.com" });
});

test("Brevo is used when its key and sender are both set", () => {
  const from = { NOTIFICATIONS_FROM: "ExpressHub <owner@gmail.com>" };
  assert.equal(configuredSender({ ...from, BREVO_API_KEY: "b" }).name, "brevo");
  // Missing pieces fall back to logging instead of failing every send.
  assert.equal(configuredSender({ BREVO_API_KEY: "b" }).name, "console");
  assert.equal(configuredSender(from).name, "console");
  assert.equal(configuredSender({ ...from, BREVO_API_KEY: "   " }).name, "console");
});

test("without a provider, emails are only logged with a masked address", async () => {
  assert.equal(configuredSender({}).name, "console");
  assert.equal(configuredSender({ BREVO_API_KEY: "k", NOTIFICATIONS_FROM: "a@b.c" }).name, "brevo");
  const lines = [];
  await consoleSender((line) => lines.push(line)).send({ to: "rina@example.com", subject: "Hello", html: "", text: "", idempotencyKey: "k" });
  assert.equal(lines[0].includes("rina@example.com"), false);
  assert.match(lines[0], /ri\*\*\*@example\.com/);
});

test("app URL, request validation and the profile preference", () => {
  assert.equal(appUrl({ APP_URL: "https://app.example" }), "https://app.example");
  assert.equal(appUrl({ ALLOWED_ORIGIN: "https://origin.example" }), "https://origin.example");
  assert.equal(appUrl({}), "http://localhost:3000");
  // Trailing slashes and paths are dropped so links never double up.
  assert.equal(appUrl({ APP_URL: "https://app.example/" }), "https://app.example");
  // Locally the configured value is used as is, even localhost.
  assert.equal(appUrl({ APP_URL: "http://localhost:3000" }), "http://localhost:3000");
  // On Vercel a local or private address never reaches a QR code or email: Vercel's
  // production domain (given without a scheme) or the allowed origin is used instead.
  const vercel = { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "express-hub.vercel.app" };
  assert.equal(appUrl({ ...vercel, APP_URL: "http://localhost:3000" }), "https://express-hub.vercel.app");
  assert.equal(appUrl({ ...vercel, APP_URL: "http://192.168.1.20:3000" }), "https://express-hub.vercel.app");
  assert.equal(appUrl({ ...vercel }), "https://express-hub.vercel.app");
  assert.equal(appUrl({ VERCEL: "1", APP_URL: "http://127.0.0.1:3000", ALLOWED_ORIGIN: "https://shop.example" }), "https://shop.example");
  assert.equal(appUrl({ ...vercel, APP_URL: "https://express-hub-sepia.vercel.app" }), "https://express-hub-sepia.vercel.app");
  assert.equal(notificationIdSchema.safeParse("not-an-id").success, false);
  assert.deepEqual(listDeadNotificationsSchema.parse({}), { page: 1, limit: 10 });
  assert.equal(listDeadNotificationsSchema.safeParse({ status: "SENT" }).success, false);
  assert.deepEqual(updateProfileSchema.parse({ emailNotifications: false }), { emailNotifications: false });
  assert.equal(updateProfileSchema.safeParse({ emailNotifications: "no" }).success, false);
});

test("a failed email's raw error becomes a reason the admin can act on", async () => {
  const { failureReason } = await import("../features/admin/failed-email-reason.ts");
  assert.equal(failureReason(null), "unknown");
  assert.equal(failureReason("Brevo 401: {\"message\":\"Key not found\"}"), "badKey");
  assert.equal(failureReason("Brevo 401: We have detected you are using an unrecognised IP address 1.2.3.4"), "ipBlocked");
  assert.equal(failureReason("Brevo 403: Authorised IPs only"), "ipBlocked");
  assert.equal(failureReason("Brevo 400: sender is not valid"), "senderNotVerified");
  assert.equal(failureReason("Brevo 400: invalid email address"), "badRecipient");
  assert.equal(failureReason("Brevo 400: something odd"), "unknown");
  assert.equal(failureReason("Brevo 429: too many requests"), "quotaOrLimit");
  assert.equal(failureReason("Brevo 503: unavailable"), "providerDown");
  assert.equal(failureReason("TypeError: fetch failed"), "network");
  assert.equal(failureReason("The operation was aborted due to timeout"), "network");
  assert.equal(failureReason("something else entirely"), "unknown");
});

test("every failure reason has English and Bangla wording", async () => {
  const { readFileSync } = await import("node:fs");
  for (const locale of ["en", "bn"]) {
    const reasons = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).admin.notifications.reason;
    for (const code of ["ipBlocked", "badKey", "senderNotVerified", "badRecipient", "quotaOrLimit", "providerDown", "network", "unknown"]) {
      assert.ok(reasons[code]?.title && reasons[code]?.hint, `${locale} ${code}`);
    }
  }
});
