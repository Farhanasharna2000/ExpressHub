# User stories

Stories are written from what ExpressHub does at commit `48da479`.
Each has an ID used by the [RTM](rtm.md), the GitHub issue that delivered it, and acceptance criteria in Given/When/Then form.
Roles: Visitor (not signed in), CUSTOMER, COURIER, ADMIN, and Merchant (a CUSTOMER using an API key).

## Visitor

### US-V01 Track a parcel without an account (issue #21)
As a recipient, I want to look up a parcel by tracking number so that I can see where it is without signing up.

- Given a valid tracking number, when I open `/track/<number>`, then I see the status, the five-step progress line and the history in my own time zone.
- Given a tracking number I typed with lowercase letters or spaces, when I submit the form, then it is normalised and the page opens.
- Given a number that does not exist, when I open its page, then I get a not-found page and no information about other parcels.
- Given the parcel is not yet delivered, when its status changes, then the page updates without a reload and a screen reader announces the change.
- Given the parcel is out for delivery and the courier shares location, then I see an approximate position only (rounded), never the exact one.
- Given the parcel is delivered, then no further live connection is kept open.

### US-V02 Get answers from the help centre (issues #25, #34)
As a visitor, I want to ask a question and get an answer based only on ExpressHub's help articles.

- Given a question covered by a help article, when I ask it, then the answer cites the article it used.
- Given a question the articles do not cover, then the assistant says it is not sure and does not invent an answer.
- Given more than 10 questions in the rate window, then further questions are refused with a rate-limit response.

### US-V03 Register and sign in (issues #3, #7, #8)
As a visitor, I want to create an account and sign in so that I can book parcels.

- Given valid details, when I register, then a CUSTOMER account is created and I cannot choose another role.
- Given a password shorter than the rule (counted in UTF-8 bytes), then registration is refused with a clear message.
- Given wrong credentials repeatedly, then sign-in is rate limited per account and per address rather than by one global bucket.
- Given I am signed out, when I open a protected page, then I am sent to `/login` and returned to that page after sign-in only if my role may open it.

### US-V04 Use the site in Bangla or English (issue #34)
As a visitor, I want to switch language so that I can read the site, dates and numbers my way.

- Given I choose বাংলা, then text, dates, times and numbers switch at once and the choice survives a reload.
- Given Bangla, then headline lines stay on one row at desktop, tablet and phone widths.

## CUSTOMER

### US-C01 Book a shipment (baseline in PR #1, plus #35)
As a customer, I want to book a parcel with pickup and delivery details so that a courier can collect it.

- Given valid sender, recipient and weight, when I submit, then a shipment is created with a tracking number and a price from the pricing rules.
- Given invalid or missing fields, then I see field-level errors and nothing is created.
- Given a double click on submit, then only one shipment is created.

### US-C02 Pay for a shipment (issues #4, #10, #15)
As a customer, I want to pay by card so that my shipment can be dispatched.

- Given an unpaid shipment, when I pay, then I am sent to Stripe Checkout for the exact price.
- Given I return from Stripe, then the page shows the real payment state, and a paid shipment shows PAID.
- Given I cancel Checkout, then the shipment stays unpaid and the payment is not marked failed.
- Given the same payment request is repeated, then only one checkout is created (idempotency).
- Given the payment is not PAID, then the shipment cannot be picked up.

### US-C03 Follow and manage my shipments (issues #16, #17)
As a customer, I want to list, filter and open my shipments so that I can see their state.

- Given I have shipments, when I filter by status, payment or date, then only matching shipments of mine appear, with stable paging.
- Given another customer's shipment id, when I open it, then I get 404.
- Given a shipment, then I see its timeline but not internal notes.

### US-C04 Cancel and get a refund (issues #4, #5)
As a customer, I want to cancel before pickup so that I am not charged for a parcel that never moves.

- Given my shipment is CREATED and paid, when I cancel, then it is cancelled and a Stripe refund is issued.
- Given a Checkout is still pending, then cancel is refused until it is resolved.
- Given the shipment has been picked up, then cancel and refund are refused.
- Given a refund is issued from Stripe, then the shipment is cancelled or unblocked to match.

### US-C05 Import many shipments from a spreadsheet (issue #35)
As a customer, I want to upload a CSV so that I can book many parcels at once.

- Given a valid CSV, when I upload it, then I see a preview and nothing is created yet.
- Given rows with problems, then each is listed with a code and I can download an error report.
- Given I confirm, then the valid rows are created exactly once, even if I press confirm twice.
- Given a wrong file type, an oversized file or too many uploads, then it is rejected.

### US-C06 Print a shipping label (issues #31, #37)
As a customer, I want a printable label with a QR code in my language.

- Given my shipment, when I press Print label, then I get a 4 x 6 inch PDF with the tracking number, parties, weight, hubs and a QR code to the public tracking page.
- Given Bangla names or addresses, then they print correctly, and with Bangla selected the headings and date are Bangla.
- Given someone else's shipment or a cancelled one, then I get 404 or a clear refusal.

### US-C07 See delivery proof (issue #24)
As a customer, I want to see who received my parcel and a photo or signature.

- Given my delivered shipment, then I can view the proof; anyone else gets 404.

### US-C08 Get email updates (issue #22)
As a customer, I want an email when my parcel is booked, picked up, out for delivery, delivered or failed, and I want to turn emails off.

- Given a status change, then an email is queued in the same database transaction and sent once.
- Given I turned emails off, then none are sent.
- Given a temporary failure, then sending is retried with backoff.

### US-C09 Get AI help to book (no dedicated issue; part of the baseline)
As a customer, I want to describe a parcel in words and get a draft booking.

- Given a description, then I get a draft I can edit, and nothing is created until I submit the form.

### US-C10 Integrate as a merchant (issue #30)
As a merchant, I want API keys and signed webhooks so that my shop can create shipments and hear about them.

- Given I create a key, then I see it once, and only a hash is stored.
- Given a key with `shipments:read`, then it can read my shipments and cannot create or cancel.
- Given any key, then it can never create or revoke keys, and cannot reach payments, labels, proof, imports, admin or AI.
- Given a webhook URL, then private and internal addresses are refused.
- Given a shipment event, then a signed delivery is sent, retried on failure, and dead letters can be retried by me.

## COURIER

### US-K01 Work my deliveries (baseline in PR #1)
As a courier, I want to see only my assigned shipments and move them forward.

- Given assigned and paid shipments, then I can mark picked up, in transit, out for delivery, delivered or failed in that order.
- Given a shipment assigned to someone else, then I get 404.
- Given a skipped step or a stale page, then I get a 409 and must reload.
- Given I try to cancel or retry a failed shipment, then I get 403.

### US-K02 Prove delivery (issue #24)
As a courier, I want to capture a photo and signature when I deliver.

- Given an out-for-delivery shipment assigned to me, when I submit proof, then the image is validated, stripped of location metadata and stored, and delivery completes.
- Given a delivered shipment, then proof can no longer be replaced.

### US-K03 Scan a parcel (issue #31)
As a courier, I want to scan the label so that I can open the delivery fast.

- Given a QR code or a pasted tracking link, then I land on my delivery.
- Given a parcel not assigned to me, then I see "isn't assigned to you".

### US-K04 Share my live location (issue #29)
As a courier, I want to share my position while out for delivery, and stop at any time.

- Given I opt in, then my latest position is stored as a single row, and stops when I stop or deliver.
- Given the position is stale, then it is not shown.

### US-K05 Use the installable app (issue #24)
As a courier, I want to install ExpressHub on my phone.

- Given a supported browser, then the courier app can be installed and opens on my workspace.

## ADMIN

### US-A01 See the operation at a glance (issues #23, #11)
As an admin, I want dashboards and analytics so that I can run the business.

- Given a date range, then I see bookings, deliveries, revenue, on-time rate, median delivery time and failure rate, with the previous period compared.
- Given day boundaries, then they follow Dhaka time.
- Given I export, then I get a CSV that matches the screen.
- Given delayed shipments, then they are aged by their last event.

### US-A02 Assign couriers fast (issue #32)
As an admin, I want suggestions for a waiting shipment so that I assign in one click.

- Given a paid shipment without a courier, then I see ranked suggestions with a short reason each.
- Given the AI is unavailable, then a rules-based ranking is used.
- Given I assign, then the existing assignment rules apply (409, 404, 403 as before).

### US-A03 Manage users (issues #7, #8, #20)
As an admin, I want to change roles, deactivate and delete users.

- Given a role or status change, then the user's sessions are revoked and an audit record is written.
- Given a deactivated user's token, then the next call is refused.

### US-A04 Manage all shipments and refunds (issues #4, #5, #13)
As an admin, I want to cancel, return and archive shipments and issue refunds.

- Given FAILED, then I can retry or return; only admins can.
- Given a shipment in progress, then a refund is refused.
- Given an archive, then only terminal shipments can be archived and history is kept.

### US-A05 Deal with failed emails (issues #22, #37)
As an admin, I want to see why emails failed and fix them.

- Given failed emails, then each shows a plain reason and fix hint, with the raw error under details.
- Given Retry, Retry all, Dismiss or Dismiss all, then rows change state and an audit record is written.

### US-A06 Watch couriers live (issue #29)
As an admin, I want a live map of couriers with their open deliveries.

- Given fresh positions, then I see exact positions; stale ones are hidden.

### US-A07 Audit what happened (baseline in PR #1)
As an admin, I want a searchable audit log.

- Given actions such as role change, assignment, refund, dismissal or key change, then each appears with actor, time and details.

### US-A08 Get an AI operations brief (issue #11)
As an admin, I want a short brief of what needs attention.

- Given current data, then the brief lists delays and failures with counts from the database.

## Cross-cutting

### US-X01 Be safe by default (issues #2, #8, #9, #18, #20)
As the business, I want secure defaults so that a mistake does not expose data.

- Given any HTML page, then a Content-Security-Policy applies.
- Given a refresh token is reused, then every session for that user is revoked.
- Given a correlation id from a client, then it is validated before it is echoed.
- Given a page session, then the role cookie lives 24 hours (down from 30 days).

### US-X02 Be accessible and motion-safe (issues #16, #26, #27, #28)
As a user with assistive technology or reduced motion, I want the product to work.

- Given an axe scan of key pages, then there are no serious violations.
- Given reduced motion, then pages render in their final state and nothing animates.

### US-X03 Be fast and tested in CI (issues #6, #26)
As the team, I want automated gates before deploy.

- Given a pull request, then lint, typecheck, unit, integration, mocked browser and full-stack tests run in CI. Whether a red run blocks merging depends on GitHub branch protection, which has not been confirmed (see the audit).
