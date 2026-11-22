# Sequence diagrams

Six flows, each drawn from the code named under it.
Participants use the real route paths and service names.
Retry numbers are the constants in the code: email backoff roughly 1, 2, 4 and 8 minutes with 5 attempts, merchant webhooks 8 attempts.

## 1. Sign-in, refresh and reuse detection

Source: `services/auth.service.ts`, `lib/auth/require-user.ts`, `proxy.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant B as Browser
  participant P as proxy.ts
  participant A as /api/v1/auth
  participant DB as Postgres

  U->>B: Email and password
  B->>A: POST /auth/login
  A->>DB: Check account (active, not deleted)
  A->>DB: Store hashed refresh token
  A-->>B: Access token (body), refresh cookie, page-session cookie (24 h)
  B->>P: GET /customer (page session cookie)
  P-->>B: Allowed for the role, else redirect to own home
  Note over B,A: Later, the access token expires
  B->>A: POST /auth/refresh-token (cookie)
  A->>DB: Rotate: revoke old token, store new one
  A-->>B: New access token and refresh cookie
  Note over B,A: A stolen old token is replayed
  B->>A: POST /auth/refresh-token (old cookie)
  A->>DB: Token already revoked, past grace window
  A->>DB: Revoke every session of the user
  A-->>B: 401, signed out everywhere
```

## 2. Book and pay

Source: `services/shipment.service.ts` (`createShipment`), `services/payment.service.ts` (`initiatePayment`, `processStripeEvent`), `app/api/v1/payments/webhook`.

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant W as Web app
  participant API as API
  participant DB as Postgres
  participant S as Stripe

  C->>W: Fill booking form
  W->>API: POST /shipments (CUSTOMER)
  API->>DB: Transaction: shipment CREATED, price snapshot, CREATED event, email row
  API-->>W: 201 shipment with tracking number
  C->>W: Press Pay
  W->>API: POST /payments/initiate (Idempotency-Key)
  API->>DB: Find or create payment by hashed key
  API->>S: Create Checkout Session
  S-->>API: Session url
  API-->>W: Redirect url
  W->>S: Browser goes to Checkout
  C->>S: Pays by card
  S->>API: POST /payments/webhook (checkout.session.completed)
  API->>API: Verify stripe-signature
  API->>DB: Record event once (replay safe), amount must match
  API->>DB: Payment PAID, shipment paymentStatus PAID
  S-->>W: Redirect to STRIPE_SUCCESS_URL (/checkout/success?session_id=...)
  W->>API: GET payment
  API-->>W: PAID
  Note over W,API: /payments/return/success is a handler that redirects (303) to /checkout/success
  Note over S,API: Other events handled: async_payment_succeeded, async_payment_failed, expired, charge.refunded, refund.created, refund.updated, refund.failed
```

## 3. Assign, deliver and prove

Source: `assignCourier` and `updateShipmentStatus` in `shipment.service.ts`, `services/proof.service.ts`, `services/tracking-stream.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin
  actor K as Courier
  actor R as Recipient
  participant API as API
  participant DB as Postgres
  participant T as Public tracking page

  A->>API: GET /admin/dispatch/queue
  A->>API: POST /admin/dispatch/suggestions
  API-->>A: Ranked couriers with reasons (AI or rules)
  A->>API: PATCH /shipments/{id}/assign-courier
  API->>DB: Courier must be active COURIER, event and audit written
  R->>T: Open /track/{number}
  T->>API: GET /track/{number}/stream (SSE)
  K->>API: PATCH /shipments/{id}/status PICKED_UP (expectedStatus CREATED)
  API->>DB: Needs paymentStatus PAID and assigned active courier
  API->>DB: Update, event, audit, email row, webhook rows (one transaction)
  API-->>T: tracking event over SSE
  K->>API: PATCH status IN_TRANSIT, then OUT_FOR_DELIVERY
  opt Live location
    K->>API: POST /courier/location
    API-->>T: Rounded position
  end
  K->>API: POST /shipments/{id}/proof (photo, signature)
  API->>DB: Validate image, strip metadata, store
  K->>API: PATCH status DELIVERED
  API->>DB: Update, event, release courier location
  API-->>T: Final event, stream ends
```

## 4. Email outbox

Source: `services/notifications/outbox.ts`, `dispatch.ts`, `sender.ts`, `app/api/v1/internal/notifications/dispatch`.

```mermaid
sequenceDiagram
  autonumber
  participant SVC as Shipment service
  participant DB as Postgres
  participant D as Dispatcher
  participant BR as Brevo
  participant CR as Vercel cron
  actor AD as Admin

  SVC->>DB: Same transaction as the status change: insert NotificationOutbox PENDING
  SVC-->>SVC: after() response: start dispatcher
  D->>DB: Claim due rows (FOR UPDATE SKIP LOCKED, attempts + 1, 5-minute lease)
  D->>D: Skip if recipient opted out, inactive or payload invalid
  D->>BR: POST /v3/smtp/email (api-key, X-ExpressHub-Notification trace header with the row id)
  Note over D,BR: A reserved test address (example.com and similar) returns early inside the sender, so that row is marked SENT without an email
  alt Accepted
    D->>DB: SENT
  else Temporary error: 429, 5xx, network error or timeout
    D->>DB: FAILED, next attempt with backoff
  else Permanent 4xx or 5 attempts used
    D->>DB: DEAD
  end
  CR->>D: Daily sweep with CRON_SECRET picks up anything due
  AD->>DB: GET /admin/notifications lists DEAD
  AD->>DB: Retry, Retry all, Dismiss or Dismiss all (audited)
  Note over D,BR: Brevo has no idempotency key. The trace header is for support only, so duplicates are limited by the lease and the SENT mark (audit finding A-10)
```

## 5. Merchant API and signed webhooks

Source: `lib/auth/require-user.ts`, `lib/merchant/api-keys.ts`, `services/developer.service.ts`, `services/webhooks/*`.

```mermaid
sequenceDiagram
  autonumber
  actor M as Merchant (CUSTOMER)
  participant API as API
  participant DB as Postgres
  participant WD as Webhook dispatcher
  participant EP as Merchant endpoint

  M->>API: POST /developer/api-keys (session only)
  API->>DB: Store hash and prefix, scopes, expiry
  API-->>M: Full key shown once (eh_live_...)
  M->>API: POST /developer/webhooks (key, webhooks:manage)
  API->>API: Reject private and internal URLs
  API->>DB: Store endpoint, encrypted secret
  M->>API: POST /shipments (key, shipments:write)
  API->>API: Route must be on the allowlist and scope must match
  API->>DB: Create shipment as the key's owner, enqueue WebhookDelivery rows in the same transaction
  WD->>DB: Claim due deliveries
  WD->>EP: POST event with signature t=timestamp,v1=HMAC-SHA256(timestamp.body)
  alt 2xx
    WD->>DB: Delivered
  else Error
    WD->>DB: Retry with backoff, up to 8 attempts, then dead letter
  end
  M->>API: POST /developer/webhook-deliveries/{id}/retry
  M->>API: POST /developer/api-keys (with a key)
  API-->>M: 403 API_KEY_NOT_ALLOWED
```

## 6. Cancel and refund

Source: `updateShipmentStatus`, `reserveRefund`, `sendRefund`, `applyRefund`, `initiateRefund` in the services.

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer or Admin
  participant API as API
  participant DB as Postgres
  participant S as Stripe

  C->>API: PATCH /shipments/{id}/status CANCELLED (expectedStatus CREATED)
  API->>DB: Transaction: no PENDING checkout allowed
  alt Shipment was paid
    API->>DB: reserveRefund: mark refund pending, keep shipment open
    API->>S: refunds.create (idempotency key), outside the transaction
    S-->>API: Refund
    API->>DB: applyRefund: payment REFUNDED and shipment CANCELLED only if the refund succeeded, else payment stays REFUND_PENDING
    Note over API,DB: If the Stripe call fails, releaseRefund puts the payment back to PAID
  else Not paid
    API->>DB: Shipment CANCELLED, event and audit
  end
  API-->>C: Updated shipment
  Note over S,API: A refund started from the Stripe dashboard arrives as charge.refunded and cancels or unblocks the shipment the same way
  C->>API: POST /payments/{id}/refund
  API-->>C: 409 once the shipment is in progress or delivered
```
