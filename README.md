# ExpressHub

ExpressHub is a courier and logistics application built with Next.js 16, React 19,
TypeScript, PostgreSQL, and Prisma. Customers book and track shipments, couriers
manage assigned deliveries, and administrators oversee users, dispatch, payments,
and audit records.

## Project links

- [Application](https://express-hub-sepia.vercel.app)
- [Repository](https://github.com/sharnabetopia/ExpressHub)
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
| Rate limiting | Upstash Redis; process-local fallback in development |
| Testing | Node.js test runner and Playwright |

## Local setup

Use **Node.js 24** for the repository's native TypeScript test helpers, npm, and a
PostgreSQL database. Stripe test credentials are needed for payment workflows.

```bash
git clone https://github.com/sharnabetopia/ExpressHub.git
cd ExpressHub
npm ci
cp .env.example .env
```

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
| `RATE_LIMIT_IP_HEADER` | Optional trusted ingress header: `x-real-ip` or `x-forwarded-for`; ingress must overwrite it with a single IP |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint or local Stripe CLI listener |
| `STRIPE_SUCCESS_URL` | Default: `http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CANCEL_URL` | Default: `http://localhost:3000/checkout/cancel` |

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
npm run test:frontend
npm run test:auth
npm run test:security
npm run test:payments
npm run test:checkout-return
npm run test:errors
```

`test:frontend` covers frontend contracts and workflows, form validation, and query
cache behavior. `test:security` includes proxy redirects and cookie validation.
`test:payments` is a unit suite; database integration tests use separate commands.

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
lib/auth/             Token helpers and shared route-access policy
lib/client/           API client, query client, and action form schemas
services/             Database-backed business operations
validators/           Server request validation
prisma/               Schema, migrations, admin seed, and pricing seed
proxy.ts              Page-access checks and API CORS handling
docs/                 API specification, Postman collection, and implementation notes
tests/                Unit, database integration, and Playwright tests
```

## Author

**Farhana Sharna** — [@sharnabetopia](https://github.com/sharnabetopia) /
[@Farhanasharna2000](https://github.com/Farhanasharna2000)
