# Test-case report

| | |
|---|---|
| Product | ExpressHub (Next.js 16, Prisma and Postgres, Stripe, Brevo) |
| Build under test | `main` at `48da479` (merge of PR #37) |
| Report date | 2026-11-22 |
| Prepared by | Claude Code, for the project owner |
| Scope | Everything in the repository: API, web app, courier and admin workspaces, email outbox, merchant API |
| Not in scope | Production data, real Stripe or Brevo accounts, physical devices |

Pass and fail statements below come from commands run in this session or from a named CI run.
Anything not run says "Not run" with the reason.

## 1. Verdict

**Functional quality: good. Release hygiene: needs two fixes before a customer-facing launch.**

- No automated test failed on `main`. No functional defect was found by the executed tests.
- Two repository-level risks are open: `main` has no branch protection, and Dependabot and code scanning are off (audit A-01, A-02).
- One documentation defect with a small behavioural risk: README claims an email idempotency key that the Brevo sender does not send (audit A-10).
- Several checks need a human or a real service and were not run (section 6).

A conditional go is reasonable once A-01 and A-02 are done and the manual checks in section 6 are signed off.

## 2. Environment

| Item | Value |
|---|---|
| OS | Linux 6.18 (WSL2) |
| Node, npm | v24.19.0, 11.17.0 |
| Playwright | 1.64.0, Chromium |
| Local database | Not used for this run. Postgres-backed suites were taken from CI |
| CI | GitHub Actions run 44986438589 on PR #37 (jobs `verify`, `integration`, `e2e`, all success) |
| Setup note | On `main`, `tests/labels.test.mjs` and `tsc` failed until `npm install` and `prisma generate` ran, because PR #37 added a dependency (`harfbuzzjs`) and earlier work added Prisma models. This is an expected fresh-checkout step, not a defect, and `npm run build` runs `prisma generate` |

## 3. Results at a glance

| Check | Command | Where | Result |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | local | Pass, 0 errors |
| Lint | `npx eslint .` | local | Pass, 0 errors, 26 warnings (React Compiler and effect advice) |
| Hard-coded UI strings | `npm run i18n:check` | local | Pass |
| Production build | `npm run build` | local | Pass |
| Unit tests | `node --test` per file, 34 files | local | **304 passed, 0 failed** |
| Mocked-API browser tests | `npx playwright test` (desktop and iPhone 13 profiles) | local | **68 passed**, 0 failed, 2.9 minutes |
| Postgres integration suites | `npm run test:*:integration`, 18 suites | CI | **18 of 18 passed** |
| Mocked-API browser tests | CI job `e2e` | CI | 68 passed |
| Full-stack E2E (real database, production build) | `npm run test:e2e` | CI | **34 passed** |
| Full-stack E2E subset: motion, labels, language, accessibility | `playwright.e2e.config.ts` | local, before merge | 24 passed (after one real bug was found and fixed, see section 5) |
| Help-chat evaluation | `tests/evals/help.eval.mjs` | not run | Needs a live AI model and key |
| Load test | `npm run test:load` (k6) | not run | k6 is not installed here. `ci.yml` does not run it. A manual-only workflow `load.yml` exists (audit A-04) |

Test counts differ slightly from the title counts in the inventory because of loops and projects: the browser suite repeats each test on two device profiles (32 titles, 68 runs), the E2E suite has parameterised tests (27 titles, 34 runs) and one unit file loops over cases (303 titles, 304 runs).

### Unit results by file

| File | Passed | Failed |
|---|---|---|
| `tests/ai-assistant.test.mjs` | 29 | 0 |
| `tests/ai-booking.test.mjs` | 10 | 0 |
| `tests/ai-dispatch.test.mjs` | 12 | 0 |
| `tests/ai-ops-brief.test.mjs` | 15 | 0 |
| `tests/analytics.test.mjs` | 10 | 0 |
| `tests/auth.test.mjs` | 10 | 0 |
| `tests/checkout-return.test.mjs` | 2 | 0 |
| `tests/count-up.test.mjs` | 5 | 0 |
| `tests/courier-location.test.mjs` | 9 | 0 |
| `tests/errors.test.mjs` | 7 | 0 |
| `tests/form-validation.test.mjs` | 3 | 0 |
| `tests/frontend-admin.test.mjs` | 4 | 0 |
| `tests/frontend-auth.test.mjs` | 16 | 0 |
| `tests/frontend-operations.test.mjs` | 6 | 0 |
| `tests/frontend-payments.test.mjs` | 6 | 0 |
| `tests/frontend-shipments.test.mjs` | 7 | 0 |
| `tests/frontend-workflows.test.mjs` | 4 | 0 |
| `tests/help.test.mjs` | 15 | 0 |
| `tests/i18n.test.mjs` | 7 | 0 |
| `tests/labels.test.mjs` | 8 | 0 |
| `tests/merchant.test.mjs` | 12 | 0 |
| `tests/notifications.test.mjs` | 16 | 0 |
| `tests/pagination.test.mjs` | 4 | 0 |
| `tests/payment-controller.test.mjs` | 7 | 0 |
| `tests/payments.test.mjs` | 7 | 0 |
| `tests/postman.test.mjs` | 6 | 0 |
| `tests/profile-photo.test.mjs` | 3 | 0 |
| `tests/proof.test.mjs` | 13 | 0 |
| `tests/query-cache.test.mjs` | 6 | 0 |
| `tests/rate-limit-diagnostics.test.mjs` | 1 | 0 |
| `tests/route-protection.test.mjs` | 8 | 0 |
| `tests/security.test.mjs` | 9 | 0 |
| `tests/shipment-import.test.mjs` | 14 | 0 |
| `tests/tracking.test.mjs` | 13 | 0 |
| **Total** | **304** | **0** |

### Integration suites (CI run 44986438589)

Each suite prints a summary line, quoted here from the CI log.

| Suite | What the passing line says it covered |
|---|---|
| auth | Registration, profile, duplicate email, concurrent rotation, replay rejection, logout, login, inactive account |
| users | Ownership, profile edits, validation, pagination and filtering, role and status guards, session revocation, soft-delete exclusion, audit logging |
| shipments | Pricing, snapshots, ownership, validation, assignment races, payment gate, lifecycle, confirmation, cancellation and return, pagination, audit, soft-delete exclusion |
| payments | Routes, ownership, idempotency, concurrent initiation, cancellation guard, exact pricing, mismatch rejection, webhook replay, stale observations, refunds, expiry, uncertain-provider recovery |
| admin | All five routes, current-role authorisation, aggregate semantics, exact currency totals, soft-delete rules, filters, stable audit paging, role audit and session revocation |
| lists | Combined search, status, payment and date filters, timezone boundaries, numeric sorting, tied pagination, role scopes, deletion exclusion, consistent query rejection across seven routes |
| soft-delete | Admin guards, reasons, active-work and payment gates, terminal archival, rollback, concurrent deletes, session revocation, hidden records, retained history |
| errors | JSON fallback across methods, HEAD semantics, route precedence, health failures, CORS rejection |
| notifications | Transactional enqueue, rollback, opt-out, idempotency, SKIP LOCKED concurrency, backoff, DEAD after max attempts, admin retry and dismissal |
| proof | Delivery gate, courier-only upload, image validation, EXIF stripping, replacement cleanup, viewer access rules, post-delivery lock, reassignment |
| labels | Owner, courier and admin access, 404 for others and archived, cancelled refusal, PDF headers, courier-scoped scan lookup |
| imports | Preview without creating, row problems with codes, duplicate warnings, access rules, file rejection, rate limit, atomic confirm, concurrency, error report round trip, expiry |
| help | pgvector and indexes present, cosine ordering, keyword search, operator-safe queries, fusion, upsert and delete |
| tracking | Public lookup, private-field exclusion, validation, page rendering, live SSE update, final end, soft-delete exclusion |
| courier location | Delivery-out gate, validation, single latest row, rounded public view, exact admin view, access rules, staleness, live stream, release on delivery |
| analytics | Dhaka day boundaries, previous period, on-time and percentile times, failures, net revenue with refunds, hubs, leaderboard, CSV export, admin-only access |
| merchant | Key hashing, allowlist and scopes, revocation, expiry, owner checks, key limit, URL vetting, encrypted secrets, transactional enqueue, fan-out, concurrent signed dispatch, dead letters, retry, rotation |
| dispatch | Workload, hub match and delivery record ranking, rules fallback, dashboard queue, eligibility (409, 404, 403), assignment through the existing endpoint |

## 4. Test cases

ID format: `TC-<module>-<n>`.
Type: U unit, I integration, B browser with mocked API, E full-stack end to end, M manual.
Result: Pass (local) was run in this session. Pass (CI) comes from the run above. Not run is stated with a reason.
Every row links back to a requirement in the [RTM](../requirements/rtm.md).

### Authentication and access (R-01 to R-10)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-AUTH-01 | Register with valid details | CUSTOMER created, no role choice | B, I | `browser/auth.spec.ts`, `auth.integration.mjs` | Pass |
| TC-AUTH-02 | Register with a password over the 72-byte limit (emoji) | Refused, and the request carries only name, email and password | B | `browser/auth.spec.ts` | Pass (local). No test submits a `role` in the body, so that is not covered |
| TC-AUTH-03 | Duplicate email | Refused with a clear code | I | `auth.integration.mjs` | Pass (CI) |
| TC-AUTH-04 | Sign in as an inactive account | Refused | I | `auth.integration.mjs` | Pass (CI) |
| TC-AUTH-05 | Refresh token used twice | Replay inside the 30 second grace window gives 401. Replay after it revokes every session of the user | U, I | `auth.integration.mjs` (the 401 within the grace window), `auth.test.mjs:152` (revoke-all, mocked) | Pass. Revoke-all is not covered against a real database |
| TC-AUTH-06 | Two refreshes at once | Exactly one wins | I | `auth.integration.mjs` | Pass (CI) |
| TC-AUTH-07 | Logout fails on the server | Local identity cleared, retry offered | B, U | `browser/auth.spec.ts`, `frontend-auth.test.mjs` | Pass (local) |
| TC-AUTH-08 | Customer opens `/admin` | Redirected to `/customer` | B, E | `browser/route-protection.spec.ts`, `e2e/role-guards.spec.ts` | Pass |
| TC-AUTH-09 | Signed out opens a protected page | Redirect to `/login?next=`, `next` only if the role may open it | U | `route-protection.test.mjs` | Pass (local) |
| TC-AUTH-10 | Page-session cookie lifetime | At most 24 hours | U | `route-protection.test.mjs:78` | Pass (local) |
| TC-AUTH-11 | Change email without the current password | Refused | I | `users.integration.mjs` | Pass (CI) |
| TC-AUTH-12 | Admin changes a role | Audit row written, sessions revoked | I | `users.integration.mjs`, `admin.integration.mjs` | Pass (CI) |
| TC-AUTH-13 | Hostile correlation id | Replaced with a generated id | U, I | `errors.test.mjs`, `errors.integration.mjs` | Pass |
| TC-AUTH-14 | Deactivated user with a still-valid token | Next API call refused | I | `users.integration.mjs` | Pass (CI) |
| TC-AUTH-15 | Passkey and 2FA sign-in | Not built (issue #33) | n/a | none | Not run: feature does not exist |

### Shipments (R-11 to R-21)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-SHP-01 | Customer books a shipment | Created with tracking number and price | E, I | `e2e/customer-booking.spec.ts`, `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-02 | Invalid booking fields | Field errors, nothing created | B, U | `browser/shipments.spec.ts`, `form-validation.test.mjs` | Pass |
| TC-SHP-03 | Customer opens another customer's shipment | 404 | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-04 | Courier opens an unassigned shipment | 404 | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-05 | Status skips a step | 409 | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-06 | Stale `expectedStatus` | 409 | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-07 | Pickup before payment is PAID | 409 | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-08 | Courier retries or returns from FAILED | 403 | I | `shipments.integration.mjs:156,187` | Pass (CI). No test has a courier send CANCELLED, although the code refuses it (`shipment.service.ts:277`) |
| TC-SHP-09 | Two admins assign at once | One assignment wins | I | `shipments.integration.mjs` | Pass (CI) |
| TC-SHP-10 | Archive a non-terminal shipment | Refused | I | `soft-delete.integration.mjs` | Pass (CI) |
| TC-SHP-11 | Filter by status, payment, date, sort | Correct rows, stable paging | I | `lists.integration.mjs` | Pass (CI) |
| TC-SHP-12 | CSV import preview then confirm | Nothing created until confirm, then once | E, I | `e2e/bulk-import.spec.ts`, `shipment-imports.integration.mjs` | Pass (CI) |
| TC-SHP-13 | CSV with bad rows, wrong type, oversize | Row codes, rejection | U, I | `shipment-import.test.mjs` | Pass |
| TC-SHP-14 | English label PDF | 4 x 6 inch, QR decodes to the public link | U | `labels.test.mjs` | Pass (local) |
| TC-SHP-15 | Bangla label (`?lang=bn`) | Bangla headings, names and addresses, conjuncts shaped | U, I | `labels.test.mjs`, `labels.integration.mjs` | Pass. Visual check of conjuncts done by eye on a rendered PNG |
| TC-SHP-16 | Label for cancelled or someone else's shipment | 409 or 404 | I | `labels.integration.mjs` | Pass (CI) |
| TC-SHP-17 | Courier looks up their own tracking number, then another's | Own opens, other gives "isn't assigned to you" | E | `e2e/labels.spec.ts` | Pass (CI and local) |
| TC-SHP-18 | Deliver with proof | Image validated, EXIF stripped, locked after delivery | I, E | `proof.integration.mjs`, `e2e/delivery-journey.spec.ts` | Pass (CI) |
| TC-SHP-19 | Proof viewed by another customer | 404 | I | `proof.integration.mjs` | Pass (CI) |
| TC-SHP-20 | Install the courier app | Installs and opens | M | none | Not run: needs a device |

### Payments (R-22 to R-28)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-PAY-01 | Start payment | Checkout session for the exact price | I, B | `payments.integration.mjs`, `browser/payments.spec.ts` | Pass |
| TC-PAY-02 | Same payment key sent twice | One checkout | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-03 | Webhook replayed | Applied once | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-04 | Webhook amount does not match | Rejected | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-05 | Cancel at Checkout | Shipment stays unpaid, not marked failed | U, B | `checkout-return.test.mjs`, `browser/payments.spec.ts` | Pass |
| TC-PAY-06 | Cancel a paid shipment | Refund sent outside the transaction, shipment cancelled | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-07 | Refund after pickup | 409 | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-08 | Stripe returns an uncertain result | Recovers without a double refund | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-09 | Courier opens a payment | 403 | I | `payments.integration.mjs` | Pass (CI) |
| TC-PAY-10 | Pay with a real card in Stripe test mode | PAID and email sent | M | none | Not run: needs a real Stripe test account |

### Tracking, location and operations (R-29 to R-34)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-TRK-01 | Open a tracking page | Timeline and progress in the viewer's time zone | E | `e2e/motion.spec.ts` | Pass (CI and local) |
| TC-TRK-02 | Unknown number | Not found, no leaks | I | `tracking.integration.mjs` | Pass (CI) |
| TC-TRK-03 | Status changes while the page is open | Updates without reload | I | `tracking.integration.mjs` | Pass (CI) |
| TC-TRK-04 | Delivered parcel | Truck at 90%, one confetti burst, pieces removed, none on reload | E | `e2e/motion.spec.ts` | Pass (local, after fix) |
| TC-TRK-05 | Reduced motion | Truck in place, no confetti | E | `e2e/motion.spec.ts` | Pass (local) |
| TC-TRK-06 | Courier location public view | Rounded, hidden when stale | I | `courier-location.integration.mjs` | Pass (CI) |
| TC-TRK-07 | Admin live map | Exact position, stale hidden | I | `courier-location.integration.mjs` | Pass (CI) |
| TC-TRK-08 | Real GPS on a phone | Position appears on the map | M | none | Not run: needs a device |
| TC-OPS-01 | Dispatch suggestions | Ranked couriers, rules fallback | I, E | `dispatch.integration.mjs`, `e2e/dispatch.spec.ts` | Pass (CI) |
| TC-OPS-02 | Analytics ranges and CSV | Dhaka day boundaries, totals match | I | `analytics.integration.mjs` | Pass (CI) |
| TC-OPS-03 | Rate gauge | Clamped from 0 to 100 | U | `analytics.test.mjs` | Pass (local) |
| TC-OPS-04 | Audit log paging | Stable | I | `admin.integration.mjs` | Pass (CI) |

### Notifications (R-35 to R-38)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-NOT-01 | Status change | Outbox row in the same transaction, rollback removes it | I | `notifications.integration.mjs` | Pass (CI) |
| TC-NOT-02 | Two dispatchers at once | No row sent twice | I | `notifications.integration.mjs` | Pass (CI) |
| TC-NOT-03 | Temporary then permanent failure | Backoff, then DEAD | U, I | `notifications.test.mjs`, `notifications.integration.mjs` | Pass |
| TC-NOT-04 | Customer opted out | Skipped | U, I | `notifications.test.mjs` | Pass |
| TC-NOT-05 | Failure text becomes a reason | Eight reason codes map correctly, both languages have wording | U | `notifications.test.mjs` | Pass (local) |
| TC-NOT-06 | Retry, Dismiss, Retry all, Dismiss all | State changes, audit written, non-admin 403 | I | `notifications.integration.mjs` | Pass (CI) |
| TC-NOT-07 | Failed-email panel in the browser | Buttons work, reason and details visible | B | none | Not run: no browser test exists (gap) |
| TC-NOT-08 | Send after the provider accepted but the SENT mark failed | Should not email twice | I | none | Not run: untested (audit A-10) |
| TC-NOT-09 | Real email through Brevo | Arrives | M | none | Not run: needs a Brevo key |

### Merchant API, AI and quality (R-39 to R-49)

| ID | Scenario | Expected | Type | Automation | Result |
|---|---|---|---|---|---|
| TC-MER-01 | Key with `shipments:read` tries to create | 403 | I | `merchant.integration.mjs` | Pass (CI) |
| TC-MER-02 | Key tries to create or revoke keys | `API_KEY_NOT_ALLOWED` | U, I | `merchant.test.mjs`, `merchant.integration.mjs` | Pass |
| TC-MER-03 | Webhook URL to a private address | Refused | U, I | `merchant.test.mjs` | Pass |
| TC-MER-04 | Webhook delivery fails | Retries, then dead letter, manual retry works | I | `merchant.integration.mjs` | Pass (CI) |
| TC-MER-05 | Signature check | `t=...,v1=HMAC` verifies, tampering fails | U | `merchant.test.mjs` | Pass (local) |
| TC-AI-01 | Help question covered by an article | Answer with citation | I | `help.integration.mjs`, `help.test.mjs` | Pass |
| TC-AI-02 | Help question quality across the case set | Meets the stored baseline | E (live model) | `evals/help.eval.mjs` | Not run: needs a live model |
| TC-AI-03 | Assistant for CUSTOMER and COURIER only | Admin refused | U | `ai-assistant.test.mjs` | Pass (local) |
| TC-AI-04 | Booking draft for a courier | Refused | U | `ai-booking.test.mjs:117` | Pass (local). Admin is not tested, although the code refuses it |
| TC-I18N-01 | Switch to Bangla and back | Text, dates, numbers switch, survive reload | E | `e2e/language.spec.ts` | Pass (CI and local) |
| TC-I18N-02 | Bangla headline rows | One row per line at 1415, 820 and 390 px | E | `e2e/language.spec.ts` | Pass (CI and local) |
| TC-I18N-03 | Both locale files match | Same keys and placeholders | U | `i18n.test.mjs` | Pass (local) |
| TC-A11Y-01 | Axe scan, 5 public pages and 3 signed-in pages | No serious violations | E | `e2e/accessibility.spec.ts` | Pass (CI and local) |
| TC-A11Y-02 | Screen reader walk-through | Sensible announcements | M | none | Not run: needs NVDA or VoiceOver |
| TC-PERF-01 | k6 load smoke test | Meets thresholds | Load | `tests/load/smoke.js`, manual workflow `.github/workflows/load.yml` | Not run: k6 is not installed here and the workflow is manual only (`workflow_dispatch`, needs a preview URL) |
| TC-XB-01 | Firefox and Safari | Works | M | none | Not run: E2E and browser suites use Chromium only |

The full list of every automated test title is in [test-inventory.md](test-inventory.md), generated from the files.

## 5. Defects and observations

| ID | Type | Description | Status |
|---|---|---|---|
| D-01 | Bug, fixed before merge | The tracking truck lost its position because GSAP `clearProps: "left"` removed the inline `left` that React had rendered. Found by the new E2E test (expected `90%`, got empty) and fixed in PR #37 | Fixed, regression test `e2e/motion.spec.ts` |
| D-02 | Doc defect | README line 327 claims the outbox row id is sent as the provider `Idempotency-Key`. The Brevo sender sends none | Open, audit A-10 |
| D-03 | Gap | No browser test for the failed-email panel (Retry all, reason text, details) | Open |
| D-04 | Risk | `main` unprotected, Dependabot and code scanning off | Open, audit A-01, A-02 |
| D-05 | Gap | Issue #26's load test is not part of CI. It exists only as a manual `workflow_dispatch` workflow | Open, audit A-04 |
| D-06 | Observation | Two URLs change a role (`/users/[id]/role` and `/admin/users/[id]/role`) with one shared handler | Info, RBAC G-1 |
| D-07 | Observation | `GET /payments` lists the caller's own payments even for an admin | Info, RBAC G-3 |

No functional defect remains open from the executed suites.

## 6. Not run, and why

| Check | Reason |
|---|---|
| Postgres integration suites locally | No local database was used. CI results are cited instead |
| Full E2E suite locally | Run in CI. Only a 24-test subset ran locally |
| Help-chat evaluation | Needs a live AI model and key |
| k6 load test | k6 not installed here, and the workflow is manual only |
| Real Stripe, Brevo, camera, GPS, printer, PWA install | Need real services or devices |
| Screen readers, Firefox, Safari, real phones | Need people and devices |

## 7. Gaps worth closing

| Priority | Gap | Why it matters |
|---|---|---|
| High | Branch protection and security scanning (audit A-01, A-02) | Red CI cannot block a merge, and the repo has had forged force-pushes |
| Medium | No code coverage measurement. There is no coverage tool in `package.json`, so the percentage of code exercised is unknown | Weak spots stay invisible |
| Medium | Browser test for the failed-email panel | New admin controls (Retry all) are only tested at service level |
| Medium | Test for a duplicate email after a lost SENT mark | Audit A-10 |
| Medium | Tests for the untested role rules found in review: courier sends CANCELLED, admin calls the booking draft, a `role` field in the register body, revoke-all against a real database | The code refuses these, but no test proves it |
| Medium | Schedule the manual k6 workflow, or say in issue #26 that it is manual | Issue #26 said "running in CI" |
| Low | Add Firefox and WebKit projects to the browser suite | Chromium only today |
| Low | Axe checks cover 8 pages. Add the shipment detail, payments, developer and admin users pages | More of the product under accessibility checks |

## 8. How to repeat this run

```bash
npm install && npx prisma generate
npx tsc --noEmit && npx eslint . && npm run i18n:check
npm test                          # unit suites
npm run build
npm run test:frontend:browser     # mocked API, desktop and mobile
# Needs Postgres and .env:
npm run test:auth:integration     # and the other :integration scripts
npm run test:e2e
node testing/tools/build-test-inventory.mjs   # refresh the inventory
```
