# Process flow: swimlane

End-to-end life of a parcel, from booking to delivery, with cancellation and refund.
Lanes are Customer, Admin, Courier, System (ExpressHub) and Stripe.
Mermaid has no native swimlane type, so each lane is a `subgraph` and arrows cross between them.
Status names and rules come from `services/shipment.service.ts:20` and `services/payment.service.ts`.

## Main flow

```mermaid
flowchart TB
  subgraph CUS["Customer"]
    direction TB
    c1([Start]) --> c2["Book shipment<br/>(form, AI draft or CSV import)"]
    c3["Pay by card"]
    c4["Return to ExpressHub<br/>and see PAID"]
    c5["Track parcel<br/>(account or public link)"]
    c6["Receive delivery email<br/>and view proof"]
    c7["Cancel before pickup"]
  end

  subgraph SYS["System (ExpressHub)"]
    direction TB
    s1["Create shipment<br/>status CREATED, price from rules,<br/>event and email queued in one transaction"]
    s2["Create Stripe Checkout<br/>(idempotent)"]
    s3["Verify webhook signature,<br/>mark payment and shipment PAID"]
    s4{"Payment PAID<br/>and courier active?"}
    s5["Record status change,<br/>write audit, queue email and webhooks"]
    s6["Stream update to tracking page"]
    s7["Reserve refund,<br/>cancel shipment"]
  end

  subgraph STR["Stripe"]
    direction TB
    t1["Hosted Checkout"]
    t2["Send checkout.session.completed"]
    t3["Issue refund"]
  end

  subgraph ADM["Admin"]
    direction TB
    a1["See paid shipment in dispatch queue"]
    a2["Pick courier<br/>(AI or rules suggestion)"]
    a3["Retry failed delivery<br/>or mark RETURNED"]
    a4["Review failed emails,<br/>analytics, audit log"]
  end

  subgraph COU["Courier"]
    direction TB
    k1["See assigned delivery"]
    k2["Scan label QR<br/>mark PICKED_UP"]
    k3["Mark IN_TRANSIT"]
    k4["Mark OUT_FOR_DELIVERY<br/>(share live location, optional)"]
    k5{"Delivered?"}
    k6["Capture photo and signature,<br/>mark DELIVERED"]
    k7["Mark FAILED"]
  end

  c2 --> s1 --> c3 --> s2 --> t1 --> t2 --> s3 --> c4
  s3 --> a1 --> a2 --> k1
  c4 --> c5
  k1 --> k2 --> s4
  s4 -- "yes" --> s5
  s4 -- "no, 409" --> a1
  s5 --> k3 --> k4 --> k5
  k5 -- "yes" --> k6 --> s5
  k5 -- "no" --> k7 --> s5
  s5 --> s6 --> c5
  k7 --> a3
  a3 -- "retry" --> k3
  a3 -- "return" --> s5
  k6 --> c6 --> c8([End])
  s5 --> a4

  c1 -.-> c7
  c7 --> s7
  s7 -- "paid" --> t3 --> c9([Refunded and CANCELLED])
  s7 -- "not paid" --> c10([CANCELLED, no refund])
```

## Status lifecycle

Only these moves are allowed.
Each request must also send the status it believes is current, and a mismatch gives 409.

```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> PICKED_UP: courier or admin, payment PAID
  CREATED --> CANCELLED: customer (own) or admin, refund if paid
  PICKED_UP --> IN_TRANSIT
  IN_TRANSIT --> OUT_FOR_DELIVERY
  OUT_FOR_DELIVERY --> DELIVERED: proof required
  OUT_FOR_DELIVERY --> FAILED
  FAILED --> IN_TRANSIT: admin retry
  FAILED --> RETURNED: admin
  DELIVERED --> [*]
  RETURNED --> [*]
  CANCELLED --> [*]
```

## Who does what

| Step | Customer | Admin | Courier | System | Stripe |
|---|---|---|---|---|---|
| Book | Starts | | | Creates shipment | |
| Pay | Pays | | | Creates session, confirms from webhook | Hosts Checkout, sends event |
| Assign | | Chooses courier | | Validates courier is active | |
| Pickup to delivery | Watches | Monitors | Moves status | Records, audits, notifies | |
| Proof | Views | Views | Uploads | Validates, strips metadata, locks after delivery | |
| Failure | | Retries or returns | Marks FAILED | Records | |
| Cancel | Before pickup | Before pickup (status CREATED) | Not allowed | Reserves refund, cancels | Refunds |
| Email | Receives | Retries or dismisses failures | | Outbox sends | |
