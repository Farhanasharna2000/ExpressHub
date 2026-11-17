# ExpressHub

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
| Shared — `/profile` | Contact details and profile photo upload or removal |
| Public tracking — `/track` | Anyone with a tracking number follows the delivery live, without an account (see [Public tracking](#public-tracking)) |
| AI assistant | Customers and couriers ask about their shipments and payments in plain English or Bangla (see [AI shipment assistant](#ai-shipment-assistant)) |
| AI booking | Customers describe a parcel in their own words and the booking form fills itself for review (see [AI booking from a description](#ai-booking-from-a-description)) |
| AI operations brief | Admins get a daily AI summary of failed, delayed and unassigned shipments with next steps, shown beside the figures it used (see [Daily operations brief](#daily-operations-brief)) |

The interface includes responsive navigation, URL-based filtering and pagination,
accessible field errors, toast feedback, and loading skeletons for lists, details,
and dashboards.

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
| `GEMINI_API_KEY` | Gemini API key from Google AI Studio (free tier available); required when the provider is `gemini` |
| `AI_MODEL` | Optional model override; defaults to `claude-opus-5-5` or `gemini-3.1-flash-lite` |

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
```

The payment integration suite uses PostgreSQL with an injected payment provider;
it does not charge a card or contact Stripe. The error integration suite uses a
production test server and an intentionally unreachable database.

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
features/ai/          AI assistant panel
lib/auth/             Token helpers and shared route-access policy
lib/client/           API client, query client, and action form schemas
services/             Database-backed business operations
services/ai/          AI assistant loop, read-only tools, prompts, and configuration
validators/           Server request validation
prisma/               Schema, migrations, admin seed, and pricing seed
proxy.ts              Page-access checks and API CORS handling
docs/                 OpenAPI specification and Postman collection
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
