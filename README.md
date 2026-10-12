
# ExpressHub - Full-Stack Courier & Logistics Platform

ExpressHub is a full-stack courier and logistics management platform built with Next.js 16 (App Router), TypeScript, Prisma ORM, PostgreSQL, and Stripe Checkout.

The application provides a responsive web interface alongside a secure REST API.
It includes role-based workspaces for Customers, Couriers, and Administrators, real-time telemetry, live courier assignment, parcel tracking, audit logging, and verified Stripe Checkout integration.

## Tech Stack

- **Framework:** Next.js 16 (App Router with Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT, HttpOnly cookies, and bcryptjs
- **Validation:** Zod
- **Payment Gateway:** Stripe Checkout & signed webhooks
- **Rate Limiting:** Upstash Redis with local fallback
- **Styling:** shadcn/ui, Tailwind CSS v4, and ExpressHub CSS primitives
- **Testing:** Node.js native test runner & Playwright

## Frontend Workspaces & Routes

| Workspace | Route | Purpose & Key Features |
|---|---|---|
| Public | `/` | Responsive landing hero with brand logo, live courier delivery showcase, and feature highlights |
| Public | `/login`, `/register` | Authentication with in-memory tokens, HttpOnly cookie rotation, and UTF-8 password validation |
| Customer | `/customer` | Customer dashboard overview and recent bookings |
| Customer | `/customer/shipments` | Searchable shipment list with status filters, date range bounds, and pagination |
| Customer | `/customer/shipments/new` | Multi-step shipment booking wizard with dimensional validation and server pricing calculation |
| Customer | `/customer/shipments/[id]` | Shipment tracking timeline, recipient details, live Stripe payment button, and cancellation |
| Customer | `/customer/payments` | Caller-scoped payment transaction ledger with status filters and receipt details |
| Checkout | `/checkout/success`, `/checkout/cancel` | Verified Stripe return handler with session polling and recovery |
| Courier | `/courier` | Courier operations dashboard with active delivery KPIs and quick routes |
| Courier | `/courier/shipments` | Assigned shipment list with mobile-ready route cards and phone call links |
| Courier | `/courier/shipments/[id]` | Delivery operations screen with milestone status stepper and proof of delivery notes |
| Admin | `/admin` | Enterprise operations overview with real-time statistics and telemetry |
| Admin | `/admin/shipments` | System-wide shipment operations with courier assignment badges and filters |
| Admin | `/admin/shipments/[id]` | Full shipment inspection, active courier assignment control, and soft-delete archival |
| Admin | `/admin/users` | User directory with search, role filters, and active/inactive toggles |
| Admin | `/admin/users/[id]` | User profile inspection, role assignment, status toggling, and soft-delete archival |
| Admin | `/admin/audit-logs` | Immutable audit trail ledger with entity filters and state mutation JSON inspector |
| Shared | `/profile` | Authenticated profile viewer and name/phone editor |

## Demonstration Workflows

### 1. Customer Booking to Verified Payment
1. Register a new account at `/register` or sign in at `/login`.
2. Navigate to `/customer/shipments/new` and complete pickup, delivery, and parcel specifications.
3. Review estimated price and submit booking.
4. On the shipment detail page, click **Pay with Stripe Checkout**.
5. Complete payment in Stripe test mode.
6. The browser returns to `/checkout/success` where payment settlement is polled and verified.
7. Return to `/customer/shipments/[id]` to observe the confirmed **Payment Verified** badge.

### 2. Admin Assignment & Operational Dispatch
1. Sign in as an administrator at `/login` and navigate to `/admin`.
2. Inspect operational telemetry and shipment counts.
3. Open `/admin/shipments` and select an unassigned shipment.
4. In the **Courier Assignment** panel, select an active courier from the dropdown and click **Assign Courier**.
5. When delivery milestones require operational intervention, use the status control to update transit states.
6. Once terminal (`DELIVERED`, `RETURNED`, or `CANCELLED`), an eligible shipment can be archived with an audit reason.

### 3. Courier Delivery Execution
1. Sign in as a courier at `/login` and navigate to `/courier`.
2. Review assigned delivery stops and click **View & Update**.
3. Contact sender or recipient via one-click phone links.
4. When parcel is collected from sender, click **Mark as Picked up**.
5. Advance parcel to **Mark as In transit** and **Mark as Out for delivery**.
6. At delivery destination, click **Mark as Delivered**, enter delivery confirmation notes (e.g., handed to recipient at front door), and confirm.

## Project Structure

```text
ExpressHub/
├── app/
│   ├── (public)/              # Marketing landing, login, register
│   ├── (dashboard)/           # Authenticated role-based workspaces
│   │   ├── customer/          # Customer shipments and payment history
│   │   ├── courier/           # Courier assignments and delivery execution
│   │   ├── admin/             # Admin telemetry, users, shipments, and audit logs
│   │   └── profile/           # User profile management
│   ├── checkout/              # Stripe checkout success and cancel return views
│   ├── api/v1/                # REST API route handlers
│   │   ├── auth/              # Registration, login, token refresh, logout
│   │   ├── users/             # User directory and profile endpoints
│   │   ├── shipments/         # Booking, assignment, and status endpoints
│   │   ├── payments/          # Stripe checkout, webhook, and payment endpoints
│   │   └── admin/             # Dashboard telemetry and audit log endpoints
│   ├── layout.tsx             # Root layout and theme provider
│   └── globals.css            # Responsive styling, status badges, and layout tokens
├── components/
│   ├── layout/                # Page shells, headers, brand navigation
│   └── ui/                    # Reusable shadcn/ui and custom primitives
├── features/
│   ├── auth/                  # Authentication forms, session provider, token store
│   ├── shipments/             # Booking wizards, tables, assignment, transition controls
│   ├── payments/              # Stripe buttons, return views, payment contracts
│   ├── courier/               # Courier dashboard, assignment lists, delivery details
│   └── admin/                 # Admin telemetry, user directory, audit trail views
├── lib/
│   ├── auth/                  # JWT token helpers, password hashing, route guards
│   ├── client/                # Browser API client and error formatting helpers
│   ├── http/                  # HTTP response wrappers and CORS helpers
│   └── prisma.ts              # Database client singleton
├── services/                  # Business logic and database transaction services
├── validators/                # Zod schemas for request validation
├── prisma/                    # Database schema and seed scripts
└── tests/                     # Unit, workflow, and browser test suites
```

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js 20.9 or later
- npm
- PostgreSQL
- Git
- Postman
- Stripe CLI (for local webhook testing)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/ExpressHub.git
```

**2. Navigate to the project**

```bash
cd ExpressHub
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

```bash
cp .env.example .env
```

Update `.env` with your database, JWT, Stripe, and Redis credentials.

### Environment Configuration

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/expresshub?schema=public"

ALLOWED_ORIGIN="http://localhost:3000"

JWT_ACCESS_SECRET="your-secure-jwt-secret"

UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

ADMIN_NAME="Admin"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="your-secure-admin-password"

STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

STRIPE_SUCCESS_URL="http://localhost:3000/api/v1/payments/return/success?session_id={CHECKOUT_SESSION_ID}"
STRIPE_CANCEL_URL="http://localhost:3000/api/v1/payments/return/cancel"
```

**Security:** Never commit real environment credentials to GitHub.

## Database Setup

Generate Prisma Client:

```bash
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

Seed initial data:

```bash
npm run prisma:seed
```

Seed pricing data if required:

```bash
npm run prisma:seed:pricing
```

## Run the Application

Start the development server:

```bash
npm run dev
```

The backend will be available at:

```text
http://localhost:3000
```

### Frontend

The frontend now includes shadcn/ui sign-in and customer registration, session restoration, profile editing, sign-out, and role-gated workspaces. Open `/register` or `/login`; authenticated users land at `/customer`, `/courier`, or `/admin`. Edit account details at `/profile`.

Access tokens stay in memory; the existing HttpOnly refresh cookie restores the session. Configure `ALLOWED_ORIGIN` to match the browser origin exactly. Production sign-in requires HTTPS for the Secure cookie. Shipment, payment, and admin data screens remain shells for later phases.

See [the implementation flow](FRONTEND_IMPLEMENTATION_FLOW.md), [foundation notes](docs/frontend-foundation.md), and [authentication setup and tests](docs/frontend-auth.md). Run `npm run test:frontend` for the API/session tests and `npm run test:frontend:browser` for desktop/mobile browser coverage after installing Playwright's Chromium and building the app.

### Health Check

```http
GET /api/v1/health
```

URL:

```text
http://localhost:3000/api/v1/health
```

Use this endpoint to check server and database connectivity.

## API Documentation

Import [the Postman collection](docs/postman/ExpressHub.postman_collection.json) for runnable requests, authentication scripts and saved response examples. [The OpenAPI specification](docs/openapi.json) documents all 34 implemented method–endpoint combinations, including payment routes and compatibility aliases.

To regenerate both files from the documentation source:

```bash
node scripts/generate-api-docs.mjs
node --test tests/postman.test.mjs
```

Generation overwrites the exported documentation and resets collection variables to empty placeholders. Keep personal credentials in your local Postman workspace.

**Base URL:**

```text
http://localhost:3000/api/v1
```

### Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register user |
| POST | /auth/login | User login |
| POST | /auth/refresh-token | Refresh access token |
| POST | /auth/logout | Logout |

### Shipment APIs

Shipment endpoints provide operations for:

- Creating shipments
- Retrieving shipment details
- Tracking shipment status
- Managing shipments
- Assigning couriers
- Updating delivery progress

Access depends on the authenticated user's role.

### Payment APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /payments/initiate | Initiate Stripe Checkout |
| POST | /payments/create | Create Checkout session |
| GET | /payments/:paymentId | Retrieve payment details |
| GET | /payments | List own payment history |
| GET | /payments/my-payments | Alias for own payment history |
| POST | /payments/webhook | Receive Stripe webhook |
| GET | /payments/return/success | Informational Checkout return |
| GET | /payments/return/cancel | Informational Checkout cancellation return |

Checkout creation requires CUSTOMER authentication. Payment detail allows the paying customer or ADMIN; history returns only the caller's own payments for CUSTOMER or ADMIN. The webhook requires a Stripe signature. Return endpoints are public and never confirm or modify payments.

## Authentication

Protected endpoints use JWT Bearer authentication.

Example:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The login response provides an access token.

Include this token in protected API requests.

## Stripe Payment Integration

ExpressHub uses Stripe Checkout for secure online payments.

### Payment Flow

1. Customer logs in.
2. Customer creates a shipment.
3. Customer initiates Checkout.
4. Backend creates a Stripe Checkout session.
5. Customer completes payment on Stripe.
6. Stripe sends a signed webhook event.
7. Backend verifies the event.
8. Payment status is updated.

### Initiate Checkout

```http
POST /api/v1/payments/initiate
```

Headers:

```http
Authorization: Bearer YOUR_CUSTOMER_TOKEN
Content-Type: application/json
Idempotency-Key: YOUR_UNIQUE_UUID
```

Request body:

```json
{
  "shipmentId": "YOUR_SHIPMENT_ID"
}
```

The shipment must be eligible for payment.

### Local Stripe Webhook Testing

Run Stripe CLI:

```bash
stripe login
```

Forward webhook events to the backend:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copy the generated webhook signing secret into:

```env
STRIPE_WEBHOOK_SECRET="whsec_..."
```

Restart the backend after updating the environment variable.

**Important:** A successful Stripe redirect does not automatically prove that the payment was verified. The backend relies on verified webhook processing.

## Postman API Testing

The project can be tested using Postman.

### Testing Steps

1. Import `docs/postman/ExpressHub.postman_collection.json`.
2. Set collection `baseUrl` to `http://localhost:3000` (without `/api/v1`), and fill `email` and `password` locally.
3. Send **Log in** in the `auth` folder as a customer. The script saves `accessToken` and the role-specific token; Postman's cookie jar retains the refresh cookie.
4. Send **Book shipment** in `shipments`. Its script saves `shipmentId`.
5. Send **Prepare Stripe Checkout** in `payments` using either `/create` or `/initiate`. The script generates an `idempotencyKey` and saves `paymentId` and `checkoutUrl` from a successful response.
6. Open `checkoutUrl` and complete payment in your Stripe test environment. Forward signed events using the Stripe CLI command above; sending the illustrative webhook body alone will fail signature verification.
7. Send **Read payment** to check the verified status. A success redirect alone does not confirm payment.

Retries reuse the same idempotency key. A different shipment generates a new key; clear `idempotencyKey` explicitly when starting a new attempt for the same shipment after the previous attempt has settled unsuccessfully.

For user and courier operations, set `userId` and `courierId` explicitly and log in with the required role. To run the **Role access checks** folder, first log in separately as CUSTOMER, COURIER and ADMIN, then set `foreignShipmentId` to another customer's shipment. Send mutation requests individually in workflow order.

### Postman Collection Variables

| Variable | Description |
|----------|-------------|
| baseUrl | Server origin, e.g. `http://localhost:3000`; omit `/api/v1` |
| email, password | Credentials for the next login; fill locally |
| accessToken | JWT access token |
| customerToken, courierToken, adminToken | Automatically saved role tokens |
| userId | Target user for profile, role, status or deletion requests |
| courierId | Courier to assign; also populated by courier login |
| shipmentId | Created shipment ID |
| foreignShipmentId | Another customer's shipment for the access-denial check |
| paymentId | Created payment ID |
| checkoutUrl | Stripe Checkout URL |
| idempotencyKey | Unique payment request identifier |

Postman Environment setup is optional when collection variables are configured correctly.

## API Error Handling

The API uses standard HTTP status codes.

| Code | Meaning |
|------|---------|
| 200 | Successful request |
| 201 | Resource created |
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Resource not found |
| 409 | Conflict |
| 422 | Unprocessable entity |
| 429 | Too many requests |
| 500 | Internal server error |
| 502 | Upstream service error |
| 503 | Service unavailable |

## Security Features

- JWT authentication
- Role-based authorization
- bcrypt password hashing
- Zod input validation
- Protected API endpoints
- Stripe webhook signature verification
- Payment idempotency
- Rate limiting
- Environment-based secrets

## Available Commands

| Command | Description |
|---------|-------------|
| npm install | Install dependencies |
| npm run dev | Start development server |
| npm run build | Build production application |
| npm run start | Start production server |
| npm run prisma:generate | Generate Prisma Client |
| npm run prisma:migrate | Run database migrations |
| npm run prisma:seed | Seed database |
| npm run prisma:seed:pricing | Seed pricing records |
| npm run prisma:migrate:deploy | Deploy existing migrations |

## Deployment

Before deploying:

1. Configure production environment variables.
2. Set up PostgreSQL.
3. Apply Prisma migrations.
4. Configure Stripe production credentials.
5. Configure Stripe webhook endpoint.
6. Set appropriate CORS and rate-limiting settings.
7. Build and start the application.

Production build:

```bash
npm run build
npm run start
```

## Future Improvements

- Real-time shipment tracking
- Email and SMS notifications
- Courier location tracking
- Analytics and reporting
- Customer-facing dashboard
- Automated delivery notifications

## Author

**Farhana Sharna**

GitHub: [Farhanasharna2000](https://github.com/Farhanasharna2000)

## License

This project is intended for learning, development, and portfolio demonstration. No open-source license is granted unless a LICENSE file is added.
