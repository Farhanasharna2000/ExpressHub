# ExpressHub

[![CI](https://github.com/Farhanasharna2000/ExpressHub/actions/workflows/ci.yml/badge.svg)](https://github.com/Farhanasharna2000/ExpressHub/actions/workflows/ci.yml)

ExpressHub is a courier and logistics application built with Next.js 16, React 19,
TypeScript, PostgreSQL, and Prisma. Customers book and track shipments, couriers
manage assigned deliveries, and administrators oversee users, dispatch, payments,
and audit records.

## Project links

- [Application](https://express-hub-sepia.vercel.app)
- [Repository](https://github.com/Farhanasharna2000/ExpressHub)
- [API health endpoint](https://express-hub-sepia.vercel.app/api/v1/health)
- [OpenAPI specification](docs/openapi.json)
- [Postman collection](docs/postman/ExpressHub.postman_collection.json)

## Features

| Workspace | Features |
| --- | --- |
| Customer — `/customer` | Shipment booking, searchable shipment history, tracking events, cancellation of eligible shipments, Stripe Checkout, and payment history |
| Courier — `/courier` | Assigned shipments, delivery metrics, contact details, and shipment status transitions with required completion or failure notes |
| Admin — `/admin` | Operations dashboard, shipment and user directories, courier assignment, role and activity management, archival, and audit logs |
| Shared — `/profile` | Contact details, profile photo upload or removal, and shipment email preference |
| Public tracking — `/track` | Anyone with a tracking number follows the delivery live, without an account (see [Public tracking](#public-tracking)) |
| AI assistant | Customers and couriers ask about their shipments and payments in plain English or Bangla (see [AI shipment assistant](#ai-shipment-assistant)) |
| AI booking | Customers describe a parcel in their own words and the booking form fills itself for review (see [AI booking from a description](#ai-booking-from-a-description)) |
| AI operations brief | Admins get a daily AI summary of failed, delayed and unassigned shipments with next steps, shown beside the figures it used (see [Daily operations brief](#daily-operations-brief)) |
| Email notifications | Customers get an email when a shipment is booked, picked up, out for delivery, delivered or fails, sent reliably through a transactional outbox (see [Shipment email notifications](#shipment-email-notifications)) |
| Admin analytics | Bookings, deliveries, net revenue, on-time rate, delivery times and courier performance by day or week, compared with the previous period, with CSV export (see [Admin analytics](#admin-analytics)) |
| Proof of delivery | Couriers confirm delivery with a photo and/or the recipient's signature from an installable, offline-tolerant courier app (see [Proof of delivery](#proof-of-delivery-and-the-courier-app)) |
| Help centre and AI help chat | Public help articles at `/help`, and a help chat that answers only from them with cited sources, measured by an evaluation suite (see [AI help chat](#ai-help-chat)) |

The interface includes responsive navigation, URL-based filtering and pagination,
accessible field errors, toast feedback, and loading skeletons for lists, details,
and dashboards.

### Motion

GSAP (`gsap` and `@gsap/react`, set up once in `lib/gsap.ts`) animates the screens people
see first: the home page hero and its delivery route, metric count-ups and scroll reveals;
the public tracking timeline, including live updates; KPI count-ups on the admin, courier
and analytics dashboards; the "Delivery confirmed" checkmark after proof of delivery; and the
help centre list and new help chat answers. framer-motion keeps the smaller hover and enter
effects elsewhere, and the two never animate the same element.

Every GSAP animation runs inside a `prefers-reduced-motion: no-preference` media query,
and framer-motion follows the same setting through `MotionConfig`. With reduced motion,
or without JavaScript, content renders in its final state. Count-ups write to the existing
text node, give way to fresh data, and always finish on the exact rendered figure.

### Forms and validation

React Hook Form manages authentication, profile, shipment booking, and admin and
shipment action inputs. Zod schemas validate values through `@hookform/resolvers`.
Server-side validation remains authoritative.

Booking has four stages: **Pickup → Delivery → Parcel → Review**. Each stage validates
its own fields, retains entered values when navigating back, and maps server errors
to the relevant field. Parcel inputs include weight, an optional description, and
an optional future pickup time in the device's timezone. The final price is shown
on the shipment detail page after booking.

### Data fetching and loading states

TanStack Query backs the shared `useResource` hook and the courier selector. Each
session owns an in-memory cache with:

- 30-second freshness and five-minute garbage collection for inactive queries.
- Keys containing account, role, session revision, endpoint, and normalized filters.
- Request deduplication, cancellation, and stale-data refetching on focus or reconnect.
- Resource invalidation after successful API mutations.
- Cache clearing on logout and identity or role changes.

Automatic query retries are disabled. The API client handles access-token refresh
and `Retry-After` cooldowns. Initial loads use accessible skeletons with reduced-motion
support; background refreshes retain loaded content and announce “Updating…”.
Private query data and access tokens are not persisted to browser storage. Checkout
verification retains its bounded polling flow.

### Authentication and route protection

Next.js 16 uses **`proxy.ts`**, the renamed middleware convention. It protects
`/admin`, `/customer`, `/courier`, `/profile`, and `/checkout`, including nested routes.
Missing, expired, or invalid page cookies redirect to `/login?next=...`, preserving
the destination and query parameters. Requests for another role's workspace redirect
to the signed role's home. Login and registration stay reachable for session recovery.

| Credential | Purpose |
| --- | --- |
| JWT access token | In-memory bearer credential for API requests; expires after 15 minutes |
| `expresshub_refresh` | Rotating HTTP-only refresh cookie, scoped to `/api/v1/auth` |
| `expresshub_page_session` | Signed HTTP-only cookie scoped to `/` for optimistic page-access checks |

Cookies use `SameSite=Lax` and `Secure` in production. Page-session cookies use a
separate audience and token purpose from API tokens. Login, registration, refresh,
and current-user responses issue them; successful logout and rejected refresh
sessions clear them. Existing sessions without a page cookie recover through the
login page's refresh flow.

Page checks do not replace authorization. The client session guard and database-backed
API checks enforce current roles, active accounts, ownership, and revocation. API
CORS handling remains separate from page redirects.

## AI shipment assistant

Customers and couriers open **Ask assistant** in their workspace and ask questions such
as "Where is my latest parcel?" or "Why did my delivery fail?". The model answers by calling
read-only tools that run the existing shipment and payment services as the signed-in
user, so it can only see what that user could already open in the app.

Two providers share the same tools, limits and audit trail: Claude (`AI_PROVIDER=anthropic`,
the default) and Google Gemini (`AI_PROVIDER=gemini`), which has a free tier for demos.

```mermaid
sequenceDiagram
    participant UI as Assistant panel
    participant API as POST /api/v1/ai/assistant
    participant Loop as Assistant service
    participant Claude as Claude or Gemini API
    participant Svc as Shipment and payment services
    participant DB as PostgreSQL
    UI->>API: visible chat text + bearer token
    API->>API: requireUser, validate, per-user rate limit
    API->>Loop: runAssistant(actor, messages)
    Loop->>Svc: preload the user's 5 newest shipments
    loop up to 4 model turns, only when more data is needed
        Loop->>Claude: cached prompt + tools + conversation
        Claude-->>Loop: tool_use (find_shipments, get_shipment, get_shipment_payments)
        Loop->>Svc: call as the signed-in actor
        Svc->>DB: role- and owner-scoped query
        Loop-->>Claude: compact tool results
    end
    Claude-->>Loop: final answer
    Loop->>DB: audit record (tool names, ids, token counts)
    API-->>UI: reply + links to the shipments it mentions
```

| Concern | How it is handled |
| --- | --- |
| Authorization | Tools take no user id. Each tool calls `getShipment`, `listShipments` or `listMyPayments` with the signed-in actor, which scope by role and ownership. Couriers cannot read payments. |
| Data exposure | A record outside the user's scope returns the same "not found" result as a missing one. Tool results are compact summaries without internal notes, phone numbers or other users' ids. |
| Prompt injection | The client sends only visible text; tool calls and results are rebuilt on the server. Tool inputs are strict JSON schemas validated again with Zod. The prompt treats tool and user text as data. |
| Read-only | No tool writes data. The assistant links to the right page for booking, paying, cancelling or status updates. |
| Speed | The user's 5 newest shipments are preloaded into the request, so common questions such as "Where is my latest parcel?" need one model call. Tools are called only for older shipments, timelines or payments. Gemini 3 models run with low thinking. |
| Abuse and cost | 20 requests per user per 15 minutes, input length limits, and at most 4 model turns per request. On Claude: low effort for chat and prompt caching on the stable system prompt and tool definitions. |
| Reliability | A 45-second provider timeout and provider errors mapped to `AI_BUSY`, `AI_UNAVAILABLE` or `AI_UPSTREAM_ERROR`. Claude refusals use the server-side fallback on supported models; Gemini safety blocks return a polite refusal. |
| Audit | Every request writes an `AI_ASSISTANT_QUERY` audit record with the model, prompt version, tools used, record ids and token usage. Message text is never stored. |
| Feature flag | Off by default. With `AI_ENABLED` unset or no API key, the panel is hidden and the endpoint returns `503 AI_UNAVAILABLE`; the rest of the app is unaffected. |

Gemini's free tier has small daily request limits (check yours at https://ai.dev/rate-limit), and Google may use free-tier prompts to improve
its products, so use demo data only with it.

Code: `services/ai/` (assistant loops, tools, prompt, configuration), `validators/ai.ts`,
`app/api/v1/ai/`, and `features/ai/`. Tests: `npm run test:ai`.

## AI booking from a description

On **Book a shipment**, customers can type or paste a description such as "Send a 2 kg box of
books from Rina, 01700000000, Gulshan 1, Dhaka to Rahim, 01800000000, Agrabad, Chattogram,
pickup tomorrow at 10am" and click **Fill the form**. English, Bangla and Banglish all work.

- One structured-output call (`POST /api/v1/ai/booking-draft`) returns the form fields as JSON
  against a strict schema, on Claude or Gemini.
- Every value is re-checked with the same validator the booking API uses. Invalid or unstated
  values are left empty and listed as still needed; the model is told never to invent names,
  phone numbers or addresses.
- Relative times such as "tomorrow 10am" are resolved in Bangladesh time and shown in the
  customer's device timezone.
- The AI never books. The form opens on the first step that still needs input, or on Review
  when everything is filled, and the customer submits it as usual.
- Customers only, 10 drafts per user per 15 minutes, and an `AI_BOOKING_DRAFT` audit record
  with field names and token counts, never the text.

## Public tracking

Anyone with a tracking number can open `/track/EH-…` (or use **Track a parcel** on the home
page) and watch the delivery timeline update live, without signing in. Customers share the link
with **Copy tracking link** on their shipment page.

- `GET /api/v1/track/{trackingNumber}` returns only the tracking number, status, booking and
  delivery dates, and public timeline events (booked, status changes, hub arrivals with the hub
  name, delivery attempts, cancellation). Names, phones, addresses, price, notes, internal IDs,
  courier assignment and admin corrections never leave the server: the response is built from a
  narrow Prisma `select` and parsed with a strict Zod schema (`validators/track.ts`), so an extra
  field fails instead of leaking.
- `GET /api/v1/track/{trackingNumber}/stream` is a Server-Sent Events stream. It sends the current
  state, then checks the database every 5 seconds and pushes a frame only when the timeline
  changes, with a heartbeat every 25 seconds. It ends on a final status (delivered, returned,
  cancelled) or after 270 seconds, inside Vercel's 300-second function limit; the page then
  reconnects with backoff and shows **Reconnecting…** meanwhile.
- The page is rendered on the server for a fast first view, marked `noindex`, and times are
  shown in Bangladesh time so server and browser render the same text. Status changes are
  announced to screen readers through a polite live region.
- Lookups are rate limited per client (60 per 15 minutes, 30 stream connections). Tracking
  numbers carry 96 random bits, so they cannot be guessed.

Code: `services/tracking.service.ts`, `services/tracking-stream.ts`, `app/api/v1/track/`,
`app/(public)/track/` and `features/tracking/`. Tests: `npm run test:tracking` and
`npm run test:tracking:integration`.

## Daily operations brief

On the admin dashboard, **Daily operations brief** turns today's figures into a short summary
and up to four suggested next steps, for example "4 paid shipments are waiting for a courier".

- The server collects the figures (`getOperationsFacts` in `services/admin.service.ts`): status
  counts, today's bookings and deliveries, failed shipments, shipments with no update for 48 hours,
  paid shipments with no courier and pending payments. Examples carry tracking numbers and ages
  only, never customer names, phones or addresses.
- The model receives the figures as data and returns a strict JSON brief. Every number in the text
  is checked against the figures; anything not found is flagged on screen instead of shown as fact.
- The card shows the exact figures and the shipments to check, linked to their detail pages, next to
  the text.
- One brief per admin per Bangladesh day, saved in an `AI_OPS_BRIEF` audit record that doubles as the
  cache. Opening the dashboard again costs nothing; **Refresh brief** prepares a new one (3 per 15
  minutes). `GET /api/v1/ai/ops-brief` reads the saved brief and never calls the provider.

## Shipment email notifications

Customers get an email when a shipment is booked, picked up, out for delivery, delivered or
fails. Each email links to the public tracking page. Customers can turn them off in **Profile**.

Emails are sent through a **transactional outbox**, so a status change and its email can never
disagree:

1. The shipment change and a `notification_outbox` row are written in the **same database
   transaction** (`record()` in `services/shipment.service.ts`). If the change rolls back, so does
   the email. A unique key per (shipment, type, event) makes enqueueing idempotent.
2. Right after the API response, Next.js `after()` runs the dispatcher, so the request is never
   slowed down by the email provider.
3. The dispatcher claims due rows in one statement with `FOR UPDATE SKIP LOCKED` and a 5-minute
   lease, so several dispatchers can run at once without sending a row twice. Emails are sent
   outside any transaction, with the row id as the provider's `Idempotency-Key`.
4. Failures are retried with exponential backoff and jitter (about 1, 2, 4 and 8 minutes). After
   5 attempts, or a permanent provider rejection, the row is marked `DEAD` and appears on the admin
   dashboard with a **Retry** button.
5. `GET /api/v1/internal/notifications/dispatch` is the retry sweeper, protected by `CRON_SECRET`.
   `vercel.json` schedules it once a day, the most the Vercel Hobby plan allows. On Vercel Pro,
   change the schedule to every few minutes (for example `*/5 * * * *`) for faster retries.

Without `RESEND_API_KEY`, emails are only logged with a masked address, so local development
needs no email account.

```
status change ──▶ [ shipment + event + outbox row ]  (one transaction)
                          │
              after() ────┤──── daily cron sweeper
                          ▼
        claim (SKIP LOCKED) ──▶ send ──▶ SENT
                                  └──▶ FAILED (backoff) ──▶ … ──▶ DEAD ──▶ admin Retry
```

## Admin analytics

Admins open **Analytics** (`/admin/analytics`) to see how the business is doing over
the last 7, 30 or 90 days, or any range up to 366 days, grouped by day or by week.

| Figure | How it is calculated |
| --- | --- |
| Shipments booked | Non-archived shipments created in the range |
| Delivered | Shipments delivered in the range |
| Net revenue | BDT received (by payment date) minus full refunds (by refund date), kept as exact decimal strings |
| On time | Share of deliveries made within 72 hours of the first pickup; deliveries without a recorded pickup are not timed |
| Median / p90 delivery time | `percentile_cont` over the same pickup-to-delivery hours |
| Failure rate | Failed deliveries ÷ (delivered + failed) |

Each figure is compared with the same number of days immediately before (percentage
change for counts and revenue, a difference in points or hours for rates and times).
The page also shows a booked-vs-delivered chart, a net revenue chart, a courier
leaderboard and the busiest origin hubs, and **Export CSV** downloads the series.

How it works:

- `services/analytics.service.ts` aggregates in PostgreSQL with `$queryRaw`
  (`date_trunc` on timestamps converted with `AT TIME ZONE 'Asia/Dhaka'`), so day and
  week boundaries follow Bangladesh time. All queries share one repeatable-read snapshot.
- Results are cached for five minutes per range in Upstash, or in memory when Upstash is
  not configured.
- Charts use Recharts, loaded with `next/dynamic` so the library is only downloaded on
  this page. A visually hidden table carries the same numbers for screen readers.
- CSV cells that a spreadsheet could run as a formula (`=`, `+`, `-`, `@`, tab, carriage
  return) are prefixed with an apostrophe; plain numbers, including negative amounts, are kept.

Scaling note: at the current data size PostgreSQL scans these small tables directly. As
volume grows, add indexes on `shipments("deliveredAt")`, `payments("paidAt")`,
`payments("refundedAt")` and `shipment_events("toStatus", "occurredAt")`, which back the
range filters used here.

## Proof of delivery and the courier app

A shipment can be marked **Delivered** only after the assigned courier captures proof at the door:
a photo of the parcel and/or the recipient's signature, plus the name of the person who received it.
Customers and admins see the proof on the shipment page.

- **Server rule.** `updateShipmentStatus` refuses `DELIVERED` with `409 PROOF_REQUIRED` unless a
  proof exists from the courier currently assigned, so a proof from an earlier courier never counts.
  This applies to admins too.
- **Upload.** `POST /api/v1/shipments/{id}/proof` (multipart, assigned courier only, only while the
  shipment is out for delivery). The server reads the real image type from the file bytes
  (JPEG, PNG or WebP), allows up to 2 MB per image, and strips EXIF, XMP, IPTC and text metadata,
  including GPS location, with a small parser in `lib/delivery-proof.ts`. No image library is needed.
- **Browser.** Photos are downscaled to at most 1600 px and re-encoded on a canvas before upload,
  which also drops the camera's metadata. The signature pad uses pointer events (finger, stylus or
  mouse); keyboard users can type the recipient's name instead, which is drawn as the signature.
- **Viewing.** Images are served by `GET /api/v1/shipments/{id}/proof/photo` and `/signature` to the
  owning customer, the assigned courier and admins only (others get 404), with
  `Cache-Control: private`. Shipment responses include a summary, never storage keys.
- **Storage.** Images go through a `ProofStorage` interface (`services/storage/proof-storage.ts`).
  The default driver stores them in Postgres (`stored_files`), so the app works on Vercel with no
  extra service; an S3-compatible driver can implement the same three methods.

**Installable courier app.** `/courier` has a web app manifest and a service worker (`public/sw.js`,
scope `/courier`, registered in production builds only). The worker caches static assets and the
courier page shell for offline start; API responses, which contain names, phones and addresses,
are never cached.

**Offline deliveries.** If the phone has no connection when the courier confirms delivery, the
proof (including the images) is saved in IndexedDB and a **Waiting to upload** banner appears. It
uploads automatically when the connection returns, every minute while items are waiting, or on
**Upload now**. Each upload is safe to repeat: a delivery already completed counts as done. The
device's capture time is kept (within 7 days, and never in the future). Background Sync is not used
because the access token lives only in page memory, so uploads run from the open courier app.
Queued items belong to the courier who captured them; another account on the same phone never sends them.

## AI help chat

Public pages show a **Help** button. Visitors ask a question and get a short answer built only
from the help articles in `docs/help/`, with links to the exact sections it used. The same
articles are published as the help centre at `/help`.

```text
question ──► Gemini embedding (768 d, RETRIEVAL_QUERY)
          ├─► pgvector cosine search (HNSW index) ──┐
          └─► Postgres full-text search (GIN) ──────┴─► reciprocal rank fusion ─► top 5 sources
                                                                                    │
            answer + cited sources ◄── citation check ◄── Claude or Gemini (strict JSON) ◄┘
```

- **Grounded:** the model receives the sources as data inside `<context>` and must return
  `{answer, citations, confident}`. Citations are limited by the schema to the labels of the sources
  actually sent and checked again in code. If no source is relevant (vector similarity below 0.6
  and no keyword match), the model is not confident, or nothing valid is cited, the visitor gets a
  fixed fallback pointing to the help centre instead of a guess.
- **Private and cheap:** the chat cannot see shipments or accounts. Questions are limited to 500
  characters, 10 per 15 minutes per visitor and 300 per day across all visitors. Each question is
  audited as `AI_HELP_QUERY` with the question length (never its text), the chunks used and token usage, and no actor.
- **Indexing:** `npm run help:index` splits each article into heading-aware chunks (about 400
  tokens, short overlap), embeds new or changed chunks with `gemini-embedding-001` and removes chunks
  of deleted articles. Run it after editing `docs/help/` and after deploying to a new database.
- **Requirements:** `AI_ENABLED=true`, the provider key, and `GEMINI_API_KEY` even when
  `AI_PROVIDER=anthropic`, because embeddings always use Gemini. The database needs the `vector`
  extension (pgvector 0.5+; Neon, Supabase and most managed Postgres include it). The widget hides
  itself until the articles are indexed.

### Evaluating answer quality

`npm run eval:help` runs `tests/evals/help.cases.json` against the live models: 25 in-scope
questions (one in Bangla), 5 out-of-scope questions and 3 prompt-injection attempts. An LLM judge
checks every answer against the sources it was given. The run fails below the thresholds.

Baseline (18 Nov 2026, `gemini-3.1-flash-lite` for answers and judging, `gemini-embedding-001`):

| Metric | What it measures | Score | Threshold |
| --- | --- | --- | --- |
| Retrieval hit@5 | In-scope questions whose top sources include an expected article | 1.00 | 0.90 |
| Answer rate | In-scope questions answered rather than given the fallback | 1.00 | 0.80 |
| Citation accuracy | Answers that cite an expected article | 1.00 | 0.85 |
| Refusal accuracy | Out-of-scope and injection questions given the fallback | 1.00 | 0.90 |
| Faithfulness | Answers whose every claim the judge found in the sources | 0.96 | 0.85 |

The one answer marked unfaithful called the proof viewers "ExpressHub admins" where the source says
"admins"; the judge is deliberately strict.

It calls the AI provider, so it is run by hand rather than in CI. `npm run test:help` covers
the same logic offline.

## Technology

| Area | Implementation |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| Forms | React Hook Form, Zod, `@hookform/resolvers` |
| Client data | TanStack Query, React Context session provider, shared REST client |
| UI | Tailwind CSS 4, Radix UI, shadcn-style components, Lucide icons, Framer Motion |
| Database | PostgreSQL, Prisma 5 |
| Authentication | JWT, rotating refresh tokens, bcryptjs |
| Payments | Stripe Checkout and signed webhooks |
| AI | Claude API (`@anthropic-ai/sdk`) with tool use and prompt caching, or Google Gemini (`@google/genai`) with function calling |
| Rate limiting | Upstash Redis; process-local fallback in development |
| Testing | Node.js test runner and Playwright |

## Local setup

Use **Node.js 24** for the repository's native TypeScript test helpers, npm, and a
PostgreSQL database. Stripe test credentials are needed for payment workflows.

```bash
git clone https://github.com/Farhanasharna2000/ExpressHub.git
cd ExpressHub
npm ci
cp .env.example .env
git config core.hooksPath .githooks
```

The last command enables the repository's commit hooks (see [Contributing](#contributing)).

Edit `.env` before initializing the database. Generate a signing secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set the generated value as `JWT_ACCESS_SECRET`, configure `DATABASE_URL`, and fill
in the three `ADMIN_*` values. Then run:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed:pricing
npm run prisma:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000).

The pricing seed creates a **100 BDT flat delivery rule** with no additional weight
fee. It refuses overlapping custom rules. The admin seed creates only the initial
administrator and refuses to promote an existing non-admin account. Register customer
accounts through `/register`; an administrator can assign the courier role afterward.

### Environment variables

Use [.env.example](.env.example) as the configuration template. Keep real credentials
in your local environment or deployment secret settings.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `ALLOWED_ORIGIN` | Exact frontend origin for CORS; `http://localhost:3000` locally |
| `JWT_ACCESS_SECRET` | Signing secret of at least 32 bytes for access tokens and page-session cookies |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin seed inputs; password must be at least 12 characters and at most 72 UTF-8 bytes |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Required for production rate limiting; leave both empty for the local development limiter |
| `RATE_LIMIT_IP_HEADER` | Optional trusted ingress header: `x-real-ip` or `x-forwarded-for`; ingress must overwrite it with a single IP. When empty, Vercel deployments use `x-real-ip`; other hosts share one anonymous bucket for login and register. Refresh and logout are limited per session, and login is also limited per account |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint or local Stripe CLI listener |
| `STRIPE_SUCCESS_URL` | Default: `http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CANCEL_URL` | Default: `http://localhost:3000/checkout/cancel` |
| `AI_ENABLED` | Set to `true` to turn on the AI shipment assistant; off by default |
| `AI_PROVIDER` | `anthropic` (default) or `gemini` |
| `ANTHROPIC_API_KEY` | Claude API key; required when the provider is `anthropic` |
| `GEMINI_API_KEY` | Gemini API key from Google AI Studio (free tier available); required when the provider is `gemini`, and for the help chat's embeddings with either provider |
| `AI_MODEL` | Optional model override; defaults to `claude-opus-5-5` or `gemini-3.1-flash-lite` |
| `APP_URL` | Public site URL used for tracking links in emails; falls back to `ALLOWED_ORIGIN` |
| `RESEND_API_KEY`, `NOTIFICATIONS_FROM` | Resend API key and verified sender (for example `ExpressHub <no-reply@yourdomain.com>`); without both, emails are only logged |
| `CRON_SECRET` | At least 16 random characters; Vercel Cron sends it as a bearer token to the notification sweeper |

Production rate limiting fails closed if Upstash is unavailable or unconfigured.
There is no process-local production fallback.

### Demo accounts

The login UI includes buttons using these demo credentials. They work only when the
matching active accounts have been provisioned in the connected database; the seed
command does not create this complete set.

| Role | Email | Password | Workspace |
| --- | --- | --- | --- |
| Admin | `admin@gmail.com` | `ExpressHub123!` | `/admin` |
| Customer | `customer@gmail.com` | `ExpressHub123!` | `/customer` |
| Courier | `courier@gmail.com` | `ExpressHub123!` | `/courier` |

Use separate credentials for non-demo accounts.

## Booking and payment workflow

1. Sign in as a customer and open `/customer/shipments/new`.
2. Complete pickup, delivery, and parcel details, then review and create the shipment.
3. Check the server-calculated price on its detail page and choose **Pay with Stripe**.
4. Complete test-mode Checkout. The return page checks payment status; a redirect
   alone does not confirm payment. Signed webhook processing updates settlement.
5. As an admin, assign an active courier to an eligible shipment.
6. As that courier, progress through pickup, transit, out-for-delivery, and delivery.
   Operational transitions require confirmed payment and an assigned courier.

For local webhook delivery, run the Stripe CLI listener in another terminal:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copy the listener's signing secret into `STRIPE_WEBHOOK_SECRET` and restart the app.
`npm run stripe:check` checks configured Stripe test credentials and, for public
return URLs, webhook subscriptions. A delivered event is still needed to verify
end-to-end settlement.

## Build and deployment

```bash
npm run build
npm run start
```

The build generates Prisma Client before compiling Next.js. If a restricted
environment prevents Turbopack from binding its local worker port, the supported
webpack build can be used:

```bash
npm run build -- --webpack
```

Configure production environment variables, apply migrations with
`npm run prisma:migrate:deploy`, and use HTTPS for production cookie handling.
Set the allowed origin, Stripe return URLs, and webhook endpoint to the deployment's
actual addresses. Apply seeds deliberately against the intended database.

## Testing

Tests are layered from fast and isolated to slow and realistic:

| Layer | Command | What it covers | Runs in CI |
| --- | --- | --- | --- |
| Unit | `npm test` | Services, validators and UI contracts with mocked clients; no database or network | Yes |
| Integration | `npm run test:<area>:integration` | API routes and services against a real PostgreSQL database | Yes |
| Browser, mocked API | `npm run test:frontend:browser` | UI states and flows on desktop and mobile with a mocked API | Yes |
| End-to-end | `npm run test:e2e` | Full user journeys against a production build and a real database, plus axe accessibility checks | Yes |
| Load | `npm run test:load` | 50 virtual users against a deployment, with latency and error thresholds | Manual |

### Type checking and unit tests

```bash
npm run typecheck
npm test
```

`npm test` runs every unit suite below in turn; each can also be run on its own:

```bash
npm run test:frontend
npm run test:auth
npm run test:security
npm run test:payments
npm run test:checkout-return
npm run test:pagination
npm run test:errors
npm run test:ai
npm run test:tracking
npm run test:notifications
npm run test:analytics
npm run test:proof
npm run test:misc
```

`test:misc` checks that every API route is documented in the OpenAPI/Postman files,
profile photo validation and rate limit diagnostics.

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, `npm test` and the
production build on every push and pull request to `main`.

`test:frontend` covers frontend contracts and workflows, form validation, and query
cache behavior. `test:security` includes proxy redirects and cookie validation.
`test:payments` is a unit suite; database integration tests use separate commands.
`test:ai` covers the assistant (both providers), booking drafts and the operations brief with mocked clients: request validation, tool
authorization, the tool loop limits, refusals and audit records. It needs no API key.
`test:tracking` checks that the public tracking shape cannot carry private fields and covers
the live stream: change detection, final status, heartbeats, timeouts and disconnects.
`test:analytics` covers range validation, Bangladesh day and week buckets, rate and change
calculations, CSV formula escaping, the cache and admin-only access.
`test:proof` covers image type detection, metadata stripping, size limits, the viewing rules,
multipart limits and the courier upload queue (retry, permanent failure and already-delivered).
`test:help` covers article chunking, rank fusion, the similarity threshold, citation checks,
fallbacks, input limits, prompt-injection handling and incremental indexing, with no network calls.

If the auth unit test picks up external Upstash settings, run it with an isolated
local limiter (Bash):

```bash
NODE_ENV=test UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= npm run test:auth
```

### Browser and HTTP checks

```bash
npx playwright install --with-deps chromium
npm run build
npm run test:frontend:browser
```

Playwright starts a dedicated production server at `http://127.0.0.1:3100` with an
isolated signing secret and runs desktop and mobile Chromium projects. Keep port
3100 free. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing compatible browser.
On Linux, an error mentioning `libnspr4.so` indicates missing browser system dependencies.

The proxy HTTP tests do not launch a browser:

```bash
npm run test:frontend:browser -- tests/browser/route-protection.spec.ts --project=desktop
```

### Database integration tests

Point `DATABASE_URL` at a dedicated development/test database with migrations applied.
These suites create and remove fixtures; run them individually.

```bash
npm run test:auth:integration
npm run test:users:integration
npm run test:shipments:integration
npm run test:payments:integration
npm run test:admin:integration
npm run test:lists:integration
npm run test:soft-delete:integration
npm run test:errors:integration
npm run test:tracking:integration
npm run test:notifications:integration
npm run test:analytics:integration
npm run test:proof:integration
npm run test:help:integration
```

The help integration suite needs the `vector` extension. It checks the HNSW and full-text
indexes, cosine ordering and keyword search with fixture vectors, without calling Gemini.

The analytics integration suite seeds shipments, events and payments in March 2031 (a
window no other data uses) and asserts every figure exactly, including shipments booked
either side of Bangladesh midnight and a refund in a later period.

The payment integration suite uses PostgreSQL with an injected payment provider;
it does not charge a card or contact Stripe. The error integration suite uses a
production test server and an intentionally unreachable database.

### End-to-end tests

```bash
npx playwright install --with-deps chromium
npm run build
npm run test:e2e
```

The suite (`tests/e2e/`, `playwright.e2e.config.ts`) starts a production server on port
3200 against the database in `DATABASE_URL` and covers:

- a new customer registering, booking a shipment and being sent to Stripe Checkout;
- an admin assigning a paid shipment, the courier delivering it with photo proof, and the
  customer and the public tracking page showing it as delivered;
- role guards for customers, couriers and anonymous visitors;
- axe accessibility checks (WCAG 2.1 A and AA) on public pages, the booking form and the
  admin and courier workspaces. Serious and critical violations fail the run.

Stripe is never contacted: the payment start call and the hosted Checkout page are
intercepted in the browser. Production builds need Upstash for rate limiting, so global
setup starts a small in-memory stand-in on port 3299 instead of contacting Upstash.

`prisma/seed-e2e.mjs` creates users on the reserved `expresshub.test` domain, a hub and, only
if no active rule already prices the test weight, a pricing rule. Global setup and teardown
remove only those records. Tests sign in by creating their own refresh token rather than
sharing a saved login, because refresh tokens rotate and a reused token revokes every
session. Journeys run one at a time and pass three times in a row
(`npm run test:e2e -- --repeat-each=3`) without retries.

Browsers run with reduced motion, which also checks that the app honours that setting, so
axe scans settled pages rather than colours caught mid-animation.

### Load test

```bash
BASE_URL=https://<preview-deployment> npm run test:load
```

`tests/load/smoke.js` needs the [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)
binary. It ramps to 50 virtual users over about two minutes against health, public tracking
and, when `ACCESS_TOKEN` is set, the shipment list. It fails if p95 latency reaches 500 ms
or more than 1% of requests fail. Set `TRACKING_NUMBER` to a real tracking number to include
a successful tracking lookup.

The **Load test** workflow (`.github/workflows/load.yml`) runs it from GitHub Actions: open
Actions, choose **Load test**, then **Run workflow**, and enter an `https://` URL. It never
runs automatically. Point it at a preview deployment rather than production, since the
rate limits will throttle the virtual users.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

| Job | Steps |
| --- | --- |
| `verify` | Typecheck, lint, unit tests and production build |
| `integration` | Migrates a `pgvector/pgvector:pg17` service database, builds, then runs every integration suite |
| `e2e` | Migrates and seeds the same database image, builds, then runs the mocked browser suite and the end-to-end suite; Playwright reports and traces are uploaded when a test fails |

Each job starts from an empty database, so tests never depend on local data. Secrets are
placeholders, and AI, Stripe, Resend and Upstash are never contacted. Third-party actions
are pinned to full commit SHAs and the workflows only have read access to the repository.

## Project structure

```text
app/                  App Router pages, layouts, loading/error boundaries, and API routes
components/layout/    Workspace shells and navigation
components/ui/        Shared controls, dialogs, notifications, and skeletons
features/auth/        Forms, session provider, and session lifecycle
features/shipments/   Booking, lists, details, actions, and useResource
features/payments/    Checkout initiation, return verification, and payment views
features/admin/       Operations dashboard, users, shipments, and audit views
features/courier/     Assigned delivery dashboard and workflows
features/ai/          AI assistant panel and public help widget
features/help/        Help centre article rendering
lib/auth/             Token helpers and shared route-access policy
lib/client/           API client, query client, and action form schemas
services/             Database-backed business operations
services/ai/          AI assistant loop, read-only tools, prompts, and configuration
validators/           Server request validation
prisma/               Schema, migrations, admin seed, and pricing seed
proxy.ts              Page-access checks and API CORS handling
docs/                 OpenAPI specification, Postman collection and help articles (docs/help)
tests/                Unit, database integration, and Playwright tests
.claude/              Claude Code project skills and agents
.githooks/            Commit hooks that keep history free of tool attribution
```

## Contributing

- Keep changes scoped: validators in `validators/`, business rules in `services/`,
  thin route handlers in `app/api/v1/`, UI in `features/`.
- Before opening a pull request, run `npm run lint`, `npm run typecheck`, and the
  unit suites listed under [Testing](#testing).
- Write short, human-style commit messages. The hooks in `.githooks/` remove
  `Co-Authored-By` and tool-generated footers and reset a tool-set author to your
  own git identity. Enable them once per clone with `git config core.hooksPath .githooks`.

## Author

**Farhana Sharna** — [@Farhanasharna2000](https://github.com/Farhanasharna2000)
