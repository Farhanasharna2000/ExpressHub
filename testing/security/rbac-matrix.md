# RBAC matrix

Built from the code at commit `48da479`.
Sources: `proxy.ts`, `lib/auth/route-access.ts`, `lib/auth/require-user.ts`, `lib/merchant/api-keys.ts`, and the `requireRole` calls in `services/` and `services/payment.controller.ts`.
Where a route has no role check of its own, the service decides, and the table says how.

Legend: Y = allowed, own = only their own records, assigned = only shipments assigned to them, rounded = location rounded for privacy, "-" = refused (403 or 404 as noted).

## 1. Roles and principals

| Principal | How it authenticates | Notes |
|---|---|---|
| Visitor | Nothing | Public pages, public tracking, help chat, sign-in and registration |
| CUSTOMER | Bearer access token (session) | Also the owner of merchant API keys and webhooks |
| COURIER | Bearer access token (session) | Sees only assigned deliveries |
| ADMIN | Bearer access token (session) | Full operational access, cannot use courier-only endpoints |
| Merchant API key | Bearer key starting `eh_live_`, resolves to the CUSTOMER who owns it | Limited to an allowlist and scopes, see section 5 |
| Stripe | `stripe-signature` header | Webhook only |
| Cron | `CRON_SECRET` | Email dispatch sweeper only |

A page session cookie (`expresshub_page_session`, role claim, 24 hours, `PAGE_SESSION_TTL_SECONDS` in `lib/auth/tokens.ts:131`) protects pages only.
API calls always re-read the user from the database, so a deactivated or deleted account is refused at once even with a valid token (`lib/auth/require-user.ts`).

## 2. Pages

Rule from `permittedPath`: a signed-in user may open `/profile`, their own role home (`/customer`, `/courier`, `/admin`) and anything below it, plus `/checkout/success` and `/checkout/cancel` for CUSTOMER.
Any other protected page redirects to the user's own home.
Signed-out visitors are sent to `/login?next=...`, and the `next` value is accepted only if the role may open it (`safeReturnUrl`).

| Page | Visitor | CUSTOMER | COURIER | ADMIN |
|---|---|---|---|---|
| `/`, `/help`, `/help/[slug]`, `/track`, `/track/[trackingNumber]`, `/login`, `/register` | Y | Y | Y | Y |
| `/profile` | - | Y | Y | Y |
| `/customer`, `/customer/shipments`, `/customer/shipments/new`, `/customer/shipments/[id]`, `/customer/shipments/import`, `/customer/payments`, `/customer/payments/[id]`, `/customer/developer` | - | Y | - | - |
| `/checkout/success`, `/checkout/cancel` | - | Y | - | - |
| `/courier`, `/courier/shipments`, `/courier/shipments/[id]`, `/courier/scan` | - | - | Y | - |
| `/admin`, `/admin/shipments`, `/admin/shipments/[id]`, `/admin/users`, `/admin/users/[id]`, `/admin/analytics`, `/admin/audit-logs`, `/admin/couriers/live` | - | - | - | Y |

Verified by `tests/route-protection.test.mjs`, `tests/browser/route-protection.spec.ts` and `tests/e2e/role-guards.spec.ts`.

## 3. API routes

Every one of the 65 route files under `app/api/v1` appears once. Outside `v1` there are only `app/api/health` and the catch-all `app/api/[[...path]]`, which returns the JSON 404.

### Authentication and session

| Route | Method | Visitor | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|---|
| `/auth/register` | POST | Y | - | - | - | Rate limited. Creates CUSTOMER only |
| `/auth/login` | POST | Y | Y | Y | Y | Rate limited per account and address |
| `/auth/refresh-token` | POST | Y (cookie) | Y | Y | Y | Rotation, reuse revokes every session (issue #8) |
| `/auth/logout` | POST | Y (cookie) | Y | Y | Y | Revokes the refresh token |
| `/users/me` | GET, PATCH | - | Y | Y | Y | Own profile. Email change needs current password (issue #7) |

### Users (admin)

| Route | Method | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|
| `/users` | GET | - | - | Y | |
| `/users/[id]` | GET | own record | own record | Y | Another user's id gives 404, not 403 (`user.service.ts:75` throws `notFound`) |
| `/users/[id]` | DELETE | - | - | Y | Soft delete, revokes sessions |
| `/users/[id]/role` | PATCH | - | - | Y | Audited, revokes sessions |
| `/users/[id]/status` | PATCH | - | - | Y | Audited, revokes sessions |
| `/admin/users/[id]/role` | PATCH | - | - | Y | Alias that re-exports the `/users/[id]/role` handler, so the rules are identical |

### Shipments

| Route | Method | Visitor | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|---|
| `/shipments` | POST | - | Y | - | - | `requireRole(user, "CUSTOMER")` at `shipment.service.ts:101`. API key scope `shipments:write` |
| `/shipments` | GET | - | own | assigned | all | `scope()` at `shipment.service.ts:35`. Scope `shipments:read` |
| `/shipments/my-shipments` | GET | - | own | assigned | own (as customer) | `mine` flag |
| `/shipments/search` | GET | - | own | assigned | all | Same scoping as the list |
| `/shipments/[id]` | GET | - | own | assigned | Y | Internal notes and actor ids hidden from customers (`shipment.service.ts:149`) |
| `/shipments/[id]` | DELETE | - | - | - | Y | Soft delete, terminal shipments only |
| `/shipments/[id]/assign-courier` | PATCH | - | - | - | Y | `shipment.service.ts:214` |
| `/shipments/[id]/status` | PATCH | - | cancel own, before pickup | forward steps only | Y | See section 4 |
| `/shipments/[id]/label` | GET | - | own | assigned | Y | Others get 404. Cancelled shipments get 409 |
| `/shipments/[id]/courier-location` | GET | - | own, rounded | assigned, exact | Y, exact | Only while OUT_FOR_DELIVERY and fresh |
| `/shipments/[id]/proof` | POST | - | - | assigned | - | `proof.service.ts:38`, COURIER only |
| `/shipments/[id]/proof/photo` | GET | - | own | assigned | Y | `canViewProof` in `lib/delivery-proof.ts:152` |
| `/shipments/[id]/proof/signature` | GET | - | own | assigned | Y | Same rule |
| `/shipments/imports` | POST | - | Y | - | - | CUSTOMER only (`shipment-import.service.ts:31`) |
| `/shipments/imports/[id]`, `/errors`, `/confirm` | GET, GET, POST | - | own import | - | - | |

### Courier

| Route | Method | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|
| `/courier/stats` | GET | - | own figures | all figures | `requireRole(actor, "COURIER", "ADMIN")` |
| `/courier/location` | POST, DELETE | - | Y | - | Opt-in live location |
| `/courier/shipments/by-tracking/[trackingNumber]` | GET | - | assigned only | - | Used by the scanner. Others get 404 |

### Payments

| Route | Method | Visitor | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|---|
| `/payments/initiate` | POST | - | own shipment | - | - | `payment.controller.ts:111` |
| `/payments` | GET | - | own | - | own payments only | `listMyPayments` filters `payerId: actor.id`, see gap G-3 |
| `/payments/[id]` | GET | - | own | - | Y | Courier refused (`payment.service.ts:92`) |
| `/payments/[id]/refund` | POST | - | own, only CREATED or CANCELLED shipments | - | Y, not while in progress | `payment.service.ts:788` |
| `/payments/return/success`, `/payments/return/cancel` | GET | Y | Y | Y | Y | Redirect handlers after Stripe checkout |
| `/payments/webhook` | POST | Stripe signature | | | | Signature verified, replay safe |

### Public tracking

| Route | Method | Who | Notes |
|---|---|---|---|
| `/track/[trackingNumber]` | GET | Anyone | Private fields excluded, courier position rounded |
| `/track/[trackingNumber]/stream` | GET | Anyone | Server-sent events, ends on final status |
| `/health` | GET | Anyone | Health check |

### Admin operations

| Route | Method | ADMIN only | Notes |
|---|---|---|---|
| `/admin/dashboard-stats` | GET | Y | |
| `/admin/shipments` | GET | Y | |
| `/admin/audit-logs` | GET | Y | |
| `/admin/analytics`, `/admin/analytics/export` | GET | Y | CSV export |
| `/admin/couriers/live` | GET | Y | Exact positions |
| `/admin/dispatch/queue` | GET | Y | |
| `/admin/dispatch/suggestions` | POST | Y | AI or rules fallback |
| `/admin/notifications` | GET | Y | Failed emails |
| `/admin/notifications/[id]/retry`, `/[id]/dismiss`, `/retry-all`, `/dismiss-all` | POST | Y | Audited |

### AI

| Route | Method | Visitor | CUSTOMER | COURIER | ADMIN | Notes |
|---|---|---|---|---|---|---|
| `/ai/help` | GET, POST | Y | Y | Y | Y | Anonymous, rate limited (10 per window), answers only from help articles |
| `/ai/assistant` | POST | - | Y | Y | - | `ASSISTANT_ROLES` in `assistant.service.ts:14` |
| `/ai/booking-draft` | POST | - | Y | - | - | `booking-draft.service.ts:84` |
| `/ai/ops-brief` | GET, POST | - | - | - | Y | |
| `/ai/status` | GET | - | Y | Y | Y | Any signed-in user. Reports which AI features are on for the caller, so a courier sees `assistant` only |

### Developer (merchant) tools

| Route | Method | CUSTOMER session | API key | Others | Notes |
|---|---|---|---|---|---|
| `/developer/api-keys` | GET, POST | Y | - | - | `requireSession` rejects keys with `API_KEY_NOT_ALLOWED` |
| `/developer/api-keys/[id]` | DELETE | Y | - | - | A key can never create or revoke keys |
| `/developer/webhooks` | GET, POST | Y | `webhooks:manage` | - | |
| `/developer/webhooks/[id]` | PATCH, DELETE | Y | `webhooks:manage` | - | |
| `/developer/webhooks/[id]/rotate-secret`, `/test`, `/deliveries` | POST, POST, GET | Y | `webhooks:manage` | - | |
| `/developer/webhook-deliveries/[id]/retry` | POST | Y | `webhooks:manage` | - | |

### System

| Route | Method | Who | Notes |
|---|---|---|---|
| `/internal/notifications/dispatch` | GET, POST | Cron (`CRON_SECRET`) | Not callable with a user token |

## 4. Shipment status rules by role

Transitions from `services/shipment.service.ts:20`.
A request must also carry `expectedStatus` that matches the current status, or it gets 409.
For every move except CANCELLED and RETURNED, the payment must be PAID and the shipment must have an active assigned courier, whoever asks, admin included (`shipment.service.ts:314-331`).
DELIVERED also needs delivery proof for every role (`:333-345`).

| From | To | CUSTOMER | COURIER | ADMIN |
|---|---|---|---|---|
| CREATED | PICKED_UP | - | Y (assigned, payment PAID) | Y |
| CREATED | CANCELLED | Y (own, no pending checkout, refunds if paid) | - | Y |
| PICKED_UP | IN_TRANSIT | - | Y | Y |
| IN_TRANSIT | OUT_FOR_DELIVERY | - | Y | Y |
| OUT_FOR_DELIVERY | DELIVERED | - | Y (proof required) | Y |
| OUT_FOR_DELIVERY | FAILED | - | Y | Y |
| FAILED | IN_TRANSIT (retry) | - | - | Y |
| FAILED | RETURNED | - | - | Y |
| DELIVERED, RETURNED, CANCELLED | any | - | - | - (terminal) |

Customers get 403 for any status other than CANCELLED.
Couriers get 403 for cancellation and for anything from FAILED (`shipment.service.ts:277`).

## 5. Merchant API key scopes

`lib/merchant/api-keys.ts:46` is an allowlist: a route not listed rejects API keys.
A key acts as the CUSTOMER that owns it and so inherits the same ownership scoping.

| Scope | Routes |
|---|---|
| `shipments:read` | GET `/shipments`, `/shipments/my-shipments`, `/shipments/search`, `/shipments/[id]` |
| `shipments:write` | POST `/shipments`, PATCH `/shipments/[id]/status` |
| `webhooks:manage` | All `/developer/webhooks*` routes and `/developer/webhook-deliveries/[id]/retry` |
| (none, so a key is rejected) | Everything not listed above: key management, payments, labels, proof, imports, admin, AI, users, auth, courier routes, `DELETE /shipments/[id]`, assign-courier and courier-location |

Keys are stored as hashes, can expire or be revoked, and one account may hold a limited number of active keys.

## 6. Cross-cutting controls

| Control | Where |
|---|---|
| Origin allowlist and CORS | `proxy.ts` (`ALLOWED_ORIGIN`) |
| Page redirect by role | `proxy.ts` `protectPage` |
| User re-read on every API call | `requireUser` |
| Per-user rate limit | `lib/auth/require-user.ts:110`: 300 requests per 15 minutes for sessions (default window in `lib/rate-limit.ts:45`), 120 per minute for API keys. Some routes add their own limit through `lib/http/user-rate-limit.ts` |
| Optimistic status check | `expectedStatus` on status changes |
| Audit log | Role, status, assignment, refund, notification and key changes write `AuditLog` rows |
| CSP and security headers | `next.config.ts` |

## 7. Gaps and observations

| ID | Observation | Severity | Evidence |
|---|---|---|---|
| G-1 | Two URLs change a user's role (`/users/[id]/role` and the alias `/admin/users/[id]/role`). They share one handler, so behaviour is identical, but docs and tests should name one | Info | `app/api/v1/admin/users/[id]/role/route.ts` |
| G-2 | No route lets an ADMIN create a COURIER account. Role changes happen through `/users/[id]/role` on an existing user | Info | route list |
| G-3 | `GET /payments` returns the caller's own payments even for ADMIN, so an admin has no list of all payments through this route | Low | `payment.service.ts:109` |
| G-4 | Passkeys and two-factor sign-in are not implemented, although issue #33 describes them (closed as skipped) | Info | `github-issue-audit.md` |
| G-5 | Rate-limit and role behaviour is verified by integration suites that need Postgres, so a local run without a database cannot confirm it | Info | `test-case-report.md` |
