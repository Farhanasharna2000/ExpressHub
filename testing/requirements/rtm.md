# Requirements traceability matrix (RTM)

Each requirement traces to a user story ([user-stories.md](user-stories.md)), the GitHub issue or PR that delivered it, the code that implements it, and the tests that check it.

How to read the status column:

- **Verified** means a named automated test covers it and that test passed in this audit (local run) or in CI run 44986438589 on PR #37.
- **Partial** means some of the behaviour is tested and the gap is named.
- **Manual only** means no automated test exists.
- **Not built** means the requirement was written but not implemented.

Test paths are relative to `tests/`.
Integration tests (`*.integration.mjs`) need Postgres and were verified through CI, not locally.
Unit tests were run locally (34 files, 304 tests, 0 failures) and in CI.
Browser tests (mocked API) passed locally (68 of 68) and in CI.
Full-stack E2E passed in CI (34 of 34), and a 24-test subset passed locally before the merge.

## Authentication, sessions and users

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-01 | Register as a CUSTOMER only, with password rules | US-V03 | PR #1 | `services/auth.service.ts`, `validators/auth` | `auth.test.mjs`, `auth.integration.mjs`, `browser/auth.spec.ts`, `frontend-auth.test.mjs` | Verified |
| R-02 | Sign-in is rate limited per account and address, not one global bucket | US-V03 | #3 | `lib/rate-limit.ts`, `lib/auth/route-helpers.ts` | `security.test.mjs:68-73` (account and address keys). `rate-limit-diagnostics.test.mjs` only classifies error reasons | Verified |
| R-03 | Refresh tokens rotate, and reuse revokes every session | US-V03, US-X01 | #8 | `services/auth.service.ts` (`rotateRefreshToken` from line 159, grace window at 146) | `auth.test.mjs:152` (revoke-all, mocked), `auth.integration.mjs` (concurrent rotation, replay gives 401 inside the grace window) | Partial: revoke-all is not tested against a real database |
| R-04 | Changing email needs the current password | US-V03 | #7 | `services/user.service.ts:93-103` | `users.integration.mjs` | Verified |
| R-05 | Pages are role-protected and return users to an allowed page only | US-V03 | PR #1 | `proxy.ts`, `lib/auth/route-access.ts` | `route-protection.test.mjs`, `browser/route-protection.spec.ts`, `e2e/role-guards.spec.ts` | Verified |
| R-06 | Page-session role cookie is short lived (24 hours) | US-X01 | #20 | `lib/auth/tokens.ts:131` | `route-protection.test.mjs:78` (asserts at most 24 hours) | Verified |
| R-07 | Admin changes role, status or deletes users, with audit and session revocation | US-A03 | PR #1 | `services/user.service.ts`, `app/api/v1/users/[id]/*` | `users.integration.mjs`, `admin.integration.mjs`, `browser/admin.spec.ts` | Verified |
| R-08 | Passkey sign-in and authenticator-app two-factor | (none) | #33 | none | none | Not built (closed as skipped) |
| R-09 | Client-supplied correlation ids are validated before use | US-X01 | #18 | `lib/http/errors.ts:27-32` | `errors.test.mjs`, `errors.integration.mjs` | Verified |
| R-10 | HTML pages carry a Content-Security-Policy | US-X01 | #9 | `next.config.ts` | `security.test.mjs` | Verified |

## Shipments

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-11 | Customer books a shipment, price from pricing rules, one shipment per submit | US-C01 | PR #1 | `services/shipment.service.ts:94`, `lib/pricing-quote.ts` | `shipments.integration.mjs`, `frontend-shipments.test.mjs`, `browser/shipments.spec.ts`, `e2e/customer-booking.spec.ts` | Verified |
| R-12 | Lists and search are scoped by role and support filters, sort and stable paging | US-C03 | PR #1, UI in #16, #17 | `services/shipment.service.ts:35,162`, `lib/http/shipment-list` | `lists.integration.mjs`, `pagination.test.mjs` | Verified |
| R-13 | Status moves only along allowed transitions, with an optimistic `expectedStatus` | US-K01 | PR #1 | `services/shipment.service.ts:20,257` | `shipments.integration.mjs` | Verified |
| R-14 | Role limits on status: customer cancels only, courier forward only, admin retry and return | US-K01, US-A04 | PR #1 | `services/shipment.service.ts:269-280` | `shipments.integration.mjs` | Verified |
| R-15 | Admin assigns an active courier; paid shipment needed to leave CREATED | US-A02 | PR #1 | `services/shipment.service.ts:207` (assignment), payment gate at `:314` | `shipments.integration.mjs` (assignment races, payment gate) | Verified |
| R-16 | Admin archives terminal shipments only, history kept | US-A04 | PR #1, dialog guard in #13 | `services/shipment.service.ts:393` | `soft-delete.integration.mjs`, `browser/admin.spec.ts` | Verified |
| R-17 | Bulk CSV import with preview, row errors and atomic confirm | US-C05 | #35 | `services/shipment-import.service.ts`, `lib/shipment-import.ts` | `shipment-import.test.mjs`, `shipment-imports.integration.mjs`, `e2e/bulk-import.spec.ts` | Verified |
| R-18 | Shipping label PDF with QR, role scoped, in English or Bangla | US-C06 | #31, PR #37 | `lib/labels/*`, `services/label.service.ts` | `labels.test.mjs`, `labels.integration.mjs`, `e2e/labels.spec.ts` | Verified. Printed output on a real printer is Manual only |
| R-19 | Courier scans a label or pasted link and opens only their own delivery | US-K03 | #31 | `services/label.service.ts:49`, `features/courier/scan-contracts.ts` | `labels.test.mjs`, `labels.integration.mjs`, `e2e/labels.spec.ts` | Verified. Live camera scan is Manual only |
| R-20 | Proof of delivery: courier uploads, images validated and stripped, locked after delivery, role-scoped viewing | US-K02, US-C07 | #24 | `services/proof.service.ts`, `lib/delivery-proof.ts` | `proof.test.mjs`, `proof.integration.mjs`, `e2e/delivery-journey.spec.ts` | Verified |
| R-21 | Courier app is installable | US-K05 | #24 | PWA manifest and service worker | none found | Manual only |

## Payments

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-22 | Pay by Stripe Checkout, idempotent, exact price | US-C02 | PR #1, #15 | `services/payment.service.ts:147`, `payment.controller.ts` | `payments.test.mjs`, `payment-controller.test.mjs`, `payments.integration.mjs`, `browser/payments.spec.ts` | Verified. A real card payment is Manual only |
| R-23 | Webhook is signature checked, replay safe, ignores stale events | US-C02 | PR #1 | `app/api/v1/payments/webhook`, `processStripeEvent` | `payments.integration.mjs` (webhook replay, stale observations) | Verified |
| R-24 | Payment return pages show the real state and never mark a cancelled checkout as failed | US-C02 | #15 | `app/api/v1/payments/return/*`, `checkout-return` | `checkout-return.test.mjs`, `browser/payments.spec.ts` | Verified |
| R-25 | Unknown payment errors are not mapped to 404 or 409 by message text | US-C02 | #10 | `services/payment.controller.ts` | `payments.test.mjs`, `payment-controller.test.mjs` | Verified |
| R-26 | Refunds are sent to Stripe outside the database transaction, with recovery | US-C04 | #4 | `reserveRefund`, `sendRefund`, `applyRefund` | `payments.integration.mjs` (refunds, uncertain-provider recovery) | Verified |
| R-27 | A refunded payment cancels or unblocks its shipment; refund only before pickup or after cancel | US-C04, US-A04 | #5 | `services/payment.service.ts:788-830` | `payments.integration.mjs`, `shipments.integration.mjs` | Verified |
| R-28 | `PaymentGateway.createRefund` is required, never faked | US-C04 | #19 | `lib/payments/*:53` | `payments.test.mjs` | Verified |

## Tracking, courier and operations

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-29 | Public tracking by number with no private fields, live updates, time zone aware | US-V01 | #21 | `services/tracking.service.ts`, `tracking-stream.ts`, `features/tracking/*` | `tracking.test.mjs`, `tracking.integration.mjs`, `e2e/motion.spec.ts` | Verified |
| R-30 | Courier shares live location opt in; public view rounded, admin exact, stale hidden | US-K04, US-A06 | #29 | `services/courier-location.service.ts`, `lib/courier-location.ts` | `courier-location.test.mjs`, `courier-location.integration.mjs`, `e2e/live-location.spec.ts` | Verified. Real GPS is Manual only |
| R-31 | Admin dispatch suggestions with rules fallback, assignment via the normal endpoint | US-A02 | #32 | `services/dispatch.service.ts`, `lib/dispatch/*` | `ai-dispatch.test.mjs`, `dispatch.integration.mjs`, `e2e/dispatch.spec.ts` | Verified |
| R-32 | Admin analytics with previous-period compare, Dhaka days and CSV export | US-A01 | #23 | `services/analytics.service.ts` | `analytics.test.mjs`, `analytics.integration.mjs`, `browser/admin.spec.ts` | Verified |
| R-33 | Ops brief ages delayed shipments by last event | US-A08 | #11 | `services/ai/ops-brief*` | `ai-ops-brief.test.mjs` | Verified |
| R-34 | Audit log records role, status, assignment, refund, notification and key changes | US-A07 | PR #1 | `AuditLog` writes in services | `admin.integration.mjs`, `notifications.integration.mjs`, `merchant.integration.mjs` | Verified |

## Notifications

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-35 | Email is queued in the same transaction as the event, sent once, retried with backoff, DEAD after 5 | US-C08 | #22 | `services/notifications/*` | `notifications.test.mjs`, `notifications.integration.mjs` | Verified. Duplicate send after a lost SENT mark is not tested (audit A-10) |
| R-36 | Opt-out and inactive recipients are skipped | US-C08 | #22 | `services/notifications/dispatch.ts` | `notifications.test.mjs`, `notifications.integration.mjs` | Verified |
| R-37 | Admin sees failed emails with a plain reason, and can retry, retry all, dismiss, dismiss all | US-A05 | PR #37 | `features/admin/failed-notifications.tsx`, `failed-email-reason.ts`, `outbox.ts` | `notifications.test.mjs` (reason mapping, wording), `notifications.integration.mjs` (service) | Partial: no browser test of the panel itself |
| R-38 | A real email reaches an inbox through Brevo | US-C08 | #22 | `services/notifications/sender.ts` | none (CI never contacts Brevo) | Manual only |

## Merchant, AI, language and quality

| Req | Requirement | Story | Issue or PR | Code | Tests | Status |
|---|---|---|---|---|---|---|
| R-39 | Merchant API keys: hashed, scoped, allowlisted routes, never manage keys | US-C10 | #30 | `lib/merchant/api-keys.ts`, `lib/auth/require-user.ts` | `merchant.test.mjs`, `merchant.integration.mjs` | Verified |
| R-40 | Signed webhooks with SSRF-safe URLs, retries, dead letters, secret rotation | US-C10 | #30 | `services/webhooks/*`, `lib/merchant/webhook-signature.ts` | `merchant.test.mjs`, `merchant.integration.mjs` | Verified |
| R-41 | Help chat answers only from help articles and cites them | US-V02 | #25 | `services/ai/help*.ts`, `lib/help-articles.ts` | `help.test.mjs`, `help.integration.mjs`, `evals/help.eval.mjs` | Partial: the eval needs a live model and was not run |
| R-42 | AI booking draft and assistant stay within role and tools | US-C09 | PR #1 | `services/ai/*` | `ai-assistant.test.mjs`, `ai-booking.test.mjs` | Verified |
| R-43 | No assistant send on Enter while an input method is composing | US-C09 | #14 | `features/ai/assistant-panel.tsx:135` | none found | Manual only |
| R-44 | Bangla and English interface with Bangla dates, numbers and no hard-coded text | US-V04 | #34 | `messages/*.json`, `lib/i18n/*` | `i18n.test.mjs`, `npm run i18n:check`, `e2e/language.spec.ts` | Verified |
| R-45 | Key pages have no serious accessibility violations | US-X02 | #16, #26 | axe checks | `e2e/accessibility.spec.ts` | Verified |
| R-46 | Motion is off with reduced motion, and pages render in their final state | US-X02 | #27, #28, PR #37 | `lib/gsap.ts`, `features/home/hero-showpiece.ts`, `features/tracking/*` | `e2e/motion.spec.ts`, `count-up.test.mjs`, `tracking.test.mjs` | Verified |
| R-47 | A load test runs in CI | US-X03 | #26 | `tests/load/smoke.js`, `.github/workflows/load.yml` | manual workflow only | Partial: exists but is manual (audit A-04) |
| R-48 | CI blocks merging on red | US-X03 | #6 | `.github/workflows/ci.yml` | CI runs, but `main` has no protection | Partial (audit A-01) |
| R-49 | API documentation matches the routes | US-X03 | PR #1 | `scripts/generate-api-docs.mjs`, `docs/openapi.json` | `postman.test.mjs` | Verified |

## Coverage summary

Counted from the status column of the 49 requirements above.

| Status | Count | Requirements |
|---|---|---|
| Verified | 40 | Everything not listed below |
| Partial | 5 | R-03 (revoke-all not tested against a real database), R-37 (no browser test of the failed-email panel), R-41 (eval needs a live model, not run), R-47 (load test is manual only), R-48 (CI runs but `main` is unprotected) |
| Manual only | 3 | R-21, R-38, R-43 |
| Not built | 1 | R-08 (closed as skipped) |

Several "Verified" rows carry a manual-only sub-check noted in their status text, such as a real card payment, a real camera scan, real GPS and a physical printer.
Those checks are listed in the test-case report as "Not run".

## Trace by issue

Every closed issue appears above, except these that carry no separate requirement: #6 (R-48), #12 (default model, `.env.example:25`, no behaviour test), and #27 (animation polish, R-46).
Issue #33 traces to R-08 and is not built.
