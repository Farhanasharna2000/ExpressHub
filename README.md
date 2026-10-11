
# ExpressHub Backend API

ExpressHub is a courier and logistics management REST API built with Next.js App Router, TypeScript, Prisma ORM, and PostgreSQL.

The backend provides secure authentication, role-based authorization, shipment management, courier assignment, order tracking, administrative operations, and Stripe Checkout payment integration.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT & bcryptjs
- **Validation:** Zod
- **Payment Gateway:** Stripe Checkout
- **Rate Limiting:** Upstash Redis
- **API Testing:** Postman
- **Styling:** Tailwind CSS (Homepage)

## Key Features

### Authentication & Authorization
- User registration and login
- JWT-based authentication
- Access and refresh token support
- Password hashing
- Role-based access control
- Secure logout

### User Roles

The system supports three user roles:

| Role | Permissions |
|------|-------------|
| CUSTOMER | Create shipments, track orders, make payments |
| COURIER | View assigned shipments, update delivery status |
| ADMIN | Manage users, shipments, couriers, and system operations |

### Shipment Management
- Create shipment requests
- Retrieve shipment details
- Track shipment progress
- Manage shipment statuses
- Assign couriers
- Shipment history and tracking

### Payment Management
- Stripe Checkout integration
- Secure payment session creation
- Payment status tracking
- Payment verification through Stripe webhooks
- Idempotency protection

### Admin Management
- User management
- Shipment management
- Courier assignment
- Dashboard statistics
- Audit logs

## Project Structure

```text
ExpressHub/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── auth/
│   │       ├── users/
│   │       ├── shipments/
│   │       ├── payments/
│   │       ├── admin/
│   │       └── health/
│   ├── layout.tsx
│   └── page.tsx
├── lib/
├── services/
├── validators/
├── prisma/
├── tests/
├── public/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
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

### Backend Homepage

When the application starts successfully, the homepage displays:

```text
ExpressHub Backend

Successfully Running!
```

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
