# ExpressHub - Modern Courier & Logistics Platform

ExpressHub is an enterprise-grade, full-stack courier and logistics management application built with **Next.js 16 (App Router)**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and **Stripe Checkout**. 

The platform provides a responsive, accessible web experience featuring three distinct role-based workspaces (**Admin**, **Customer / User**, and **Courier / Provider**), dynamic Framer Motion animations, telemetry analytics, interactive delivery milestone tracking, and end-to-end verified online payments.

---

## 🌐 Live Deployment & Repository

- **Live Frontend URL:** [https://express-hub-sepia.vercel.app](https://express-hub-sepia.vercel.app)
- **GitHub Repository:** [https://github.com/sharnabetopia/ExpressHub](https://github.com/sharnabetopia/ExpressHub)
- **API Health Endpoint:** [https://express-hub-sepia.vercel.app/api/v1/health](https://express-hub-sepia.vercel.app/api/v1/health)

---

## 📋 Evaluation Requirements Compliance Matrix

| Requirement | Implementation Details | Status |
|---|---|:---:|
| **Next.js App Router Architecture** | Built strictly with Next.js App Router (`layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`). Proper server/client boundaries with justified `"use client"` directives and Server Component metadata exports. | ✅ Compliant |
| **Modern UI/UX & Responsiveness** | Mobile-first, fully responsive design using Tailwind CSS v4, shadcn/ui and Radix UI primitives, Lucide icons, and Framer Motion micro-interactions. | ✅ Compliant |
| **Authentication & Authorization** | JWT access tokens, HttpOnly cookie rotation, bcryptjs password hashing, role-guarded routes, and conditional UI rendering across 3 distinct roles. | ✅ Compliant |
| **One-Click Role Login** | Dedicated structured layout on `/login` featuring distinct, one-click **"Demo Login"** buttons for **Admin**, **User (Customer)**, and **Provider (Courier)**. | ✅ Compliant |
| **API Integration & State Management** | Centralized REST client, global session state management via React Context, resilient error handling, status feedback, and retry backoff. | ✅ Compliant |
| **Form Handling & Validation** | Zod schema validation on all inputs (matching backend rules with strict UTF-8 password limits, email formatting, and parcel dimensions). | ✅ Compliant |
| **Payment Integration** | Real **Stripe Checkout** test-mode integration (`PayWithStripeButton`), session redirect, polling return verification (`/checkout/success`, `/checkout/cancel`), and signed webhook processing. No simulated payments. | ✅ Compliant |
| **Meaningful Commits** | Over 22 descriptive frontend commits adhering to conventional commit standards (`feat:`, `fix:`, `ui:`). | ✅ Compliant |
| **Demo Credentials** | Full working demo credentials provided for evaluation for all 3 roles, accessible via 1-click buttons or manual entry. | ✅ Compliant |
| **Production Deployment** | Working live production frontend and backend deployed on Vercel with remote pooled PostgreSQL database. | ✅ Compliant |

---

## 🔑 Demo Evaluation Credentials & One-Click Role Login

The application provides a dedicated **One-Click Role Login** interface on the [Login Page](https://express-hub-sepia.vercel.app/login) allowing evaluators to sign in instantly with a single click.

| Role | Demo Button | Demo Email | Demo Password | Default Workspace | Key Capabilities |
|---|---|---|---|---|---|
| **Admin** | **Demo Login: Admin** | `admin@gmail.com` | `ExpressHub123!` | `/admin` | Operational telemetry, user management, courier dispatch & audit trail |
| **User (Customer)** | **Demo Login: User** | `customer@gmail.com` | `ExpressHub123!` | `/customer` | Multi-step booking wizard, live parcel tracking & Stripe Checkout payments |
| **Provider (Courier)** | **Demo Login: Provider** | `courier@gmail.com` | `ExpressHub123!` | `/courier` | Assigned route list, delivery status stepper & proof of delivery notes |

> 💡 **Quick Evaluation Tip:** Visit [`/login`](https://express-hub-sepia.vercel.app/login) and click any of the 3 role buttons (**"Demo Login: Admin"**, **"Demo Login: User"**, or **"Demo Login: Provider"**). The system will automatically populate credentials, establish a verified session, and redirect you directly to the respective workspace.

---

## 🚀 Role-Based Workspaces & Key Features

### 👑 1. Administrator Workspace (`/admin`)
- **Operations Telemetry:** Real-time analytics displaying total parcels, active transit deliveries, completed shipments, and revenue volume.
- **Shipment Management:** Filterable directory of all system shipments with courier assignment controls and terminal archival.
- **User Directory:** Filterable user management view allowing administrators to inspect profiles, assign roles, toggle account activity, and safely archive users.
- **Immutable Audit Trail:** Chronological ledger of state transitions, actor tracking, and JSON mutation inspectors.

### 📦 2. Customer Workspace (`/customer`)
- **Dashboard Overview:** Quick-access metrics showing active deliveries, recent bookings, and pending payments.
- **Shipment Booking Wizard (`/customer/shipments/new`):** 3-step shipment booking wizard with dimensional validation, pickup scheduling, and server-calculated dynamic pricing.
- **Parcel Tracking & Detail (`/customer/shipments/[id]`):** Real-time milestone tracker, route information, recipient contacts, and integrated Stripe Checkout.
- **Payment Transaction Ledger (`/customer/payments`):** Caller-scoped ledger of all Stripe transactions, payment receipts, and settlement status.

### 🚚 3. Courier Workspace (`/courier`)
- **Active Dispatch Overview:** Assigned stops, pending collections, and quick route actions.
- **Route Cards & Operations (`/courier/shipments`):** Mobile-optimized cards featuring one-click phone links for senders and recipients.
- **Milestone Stepper (`/courier/shipments/[id]`):** Transition controls for advancing shipments (*Picked Up* → *In Transit* → *Out for Delivery* → *Delivered*) with mandatory delivery proof notes.

---

## 🛠️ Demonstration Workflows

### Workflow 1: Customer Booking to Verified Stripe Payment
1. Open [`/login`](https://express-hub-sepia.vercel.app/login) and click **"Demo Login: User"**.
2. Navigate to **Book Parcel** (`/customer/shipments/new`).
3. Complete sender pickup, recipient delivery, and parcel specifications (weight, dimensions).
4. Review calculated pricing and confirm booking.
5. On the shipment detail page, click **Pay with Stripe Checkout**.
6. Enter standard Stripe test credentials (e.g. `4242 4242 4242 4242`).
7. Upon successful payment, Stripe redirects to `/checkout/success` where the transaction is polled, verified, and settled.
8. View the confirmed **Payment Verified** badge on the shipment detail screen.

### Workflow 2: Admin Courier Assignment & Operations
1. Open [`/login`](https://express-hub-sepia.vercel.app/login) and click **"Demo Login: Admin"**.
2. Navigate to **Shipments** (`/admin/shipments`) and select an unassigned shipment.
3. Open the **Courier Assignment** panel, choose an active courier from the dropdown, and click **Assign Courier**.
4. Observe the courier status badge update in real time.
5. Inspect the immutable audit log under **Audit Logs** (`/admin/audit-logs`) to verify the actor event recorded.

### Workflow 3: Courier Delivery Milestone Progression
1. Open [`/login`](https://express-hub-sepia.vercel.app/login) and click **"Demo Login: Provider"**.
2. Navigate to **My Deliveries** (`/courier/shipments`) to view assigned parcels.
3. Click **View & Update** on an assigned shipment.
4. Advance the delivery status sequentially:
   - Click **Mark as Picked up**
   - Click **Mark as In transit**
   - Click **Mark as Out for delivery**
   - Click **Mark as Delivered**, input delivery confirmation notes (e.g., *"Handed to recipient in person"*), and confirm.
5. The shipment transitions to terminal `DELIVERED` status with all timestamps captured.

---

## 💻 Tech Stack & Architecture

- **Frontend Framework:** Next.js 16 (App Router with Turbopack)
- **Programming Language:** TypeScript
- **Styling & Components:** Tailwind CSS v4, Radix UI Primitives, shadcn/ui components, Framer Motion
- **Database & ORM:** PostgreSQL with Prisma ORM
- **Authentication:** JWT (JSON Web Tokens), HttpOnly Refresh Cookies, bcryptjs
- **State Management & Data Fetching:** React Context (`SessionProvider`), Custom REST client with retry backoff & AbortController
- **Payment Processing:** Stripe Checkout API & cryptographic webhook signature validation
- **Rate Limiting:** Upstash Redis with distributed sliding window & local fallback
- **Testing:** Node.js native test runner & Playwright

---

## 📁 Project Structure

```text
ExpressHub/
├── app/
│   ├── (public)/              # Landing page, /login with 1-Click Demo Login, /register
│   ├── (dashboard)/           # Authenticated role-based workspaces
│   │   ├── admin/             # Operations telemetry, users, shipments, audit logs
│   │   ├── customer/          # Bookings, shipment list, details, payments
│   │   ├── courier/           # Assigned deliveries, milestone updater
│   │   └── profile/           # Account profile & photo editor
│   ├── checkout/              # Stripe checkout success & cancel return handlers
│   ├── api/v1/                # REST API route handlers
│   │   ├── auth/              # Register, login, refresh-token, logout
│   │   ├── shipments/         # Creation, assignment, status transitions, search
│   │   ├── payments/          # Stripe checkout session initiation, webhooks
│   │   ├── users/             # User directory, profile updates
│   │   └── admin/             # Dashboard telemetry, audit logs
│   ├── layout.tsx             # Root layout & theme providers
│   ├── loading.tsx            # Global loading fallback
│   ├── error.tsx              # Error boundary with recovery action
│   └── globals.css            # Responsive layout tokens, status badge styles
├── components/
│   ├── layout/                # Shells, navigation headers, sidebars
│   └── ui/                    # Buttons, Cards, Badges, Dialogs, Motion components
├── features/
│   ├── auth/                  # 1-Click demo forms, session store, token refresh
│   ├── shipments/             # Booking wizards, lists, trackers, assignment
│   ├── payments/              # Stripe checkout buttons, transaction ledgers
│   ├── courier/               # Delivery operations, route cards
│   └── admin/                 # Stats cards, user tables, audit log inspectors
├── prisma/
│   ├── schema.prisma          # PostgreSQL relational schema
│   ├── seed.mjs               # Admin account seed script
│   └── seed-pricing.mjs       # Dynamic shipping pricing rules seed
└── tests/                     # 40+ unit, integration, and security tests
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root based on the following template:

| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/expresshub?schema=public` |
| `ALLOWED_ORIGIN` | Permitted frontend origin for CORS | `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | Secret key for signing JWT access tokens | `64-character-hex-secret` |
| `STRIPE_SECRET_KEY` | Stripe secret API key (Test Mode) | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `STRIPE_SUCCESS_URL` | Stripe checkout success redirect URL | `http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CANCEL_URL` | Stripe checkout cancellation return URL | `http://localhost:3000/checkout/cancel` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for distributed rate limiting | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | `your-upstash-token` |

---

## 🏃 Getting Started Locally

### 1. Prerequisites
- Node.js (v20 or higher)
- PostgreSQL database
- Git

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/sharnabetopia/ExpressHub.git
cd ExpressHub

# Install dependencies
npm install
```

### 3. Database Migration & Seeding
```bash
# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate:deploy

# Seed pricing rules and initial admin
npm run prisma:seed:pricing
npm run prisma:seed
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running the Test Suite

The project includes comprehensive test suites across frontend and backend workflows:

```bash
# Run all frontend integration and workflow tests
npm run test:frontend

# Run authentication and security tests
npm run test:auth
npm run test:security

# Run Stripe payment integration tests
npm run test:payments

# Run TypeScript typecheck
npm run typecheck
```

---

## Page route protection

Next.js 16 uses `proxy.ts` for middleware. The proxy protects `/admin`, `/customer`,
`/courier`, `/profile`, and `/checkout` (including nested routes), while preserving
API CORS handling. Missing, expired, or invalid page cookies redirect to
`/login?next=...`; a different role redirects to its own workspace. Login and
registration remain accessible so expired or revoked sessions can recover without
redirect loops.

`expresshub_page_session` is a signed, HTTP-only, SameSite=Lax cookie scoped to `/`
(Secure in production). It uses `JWT_ACCESS_SECRET` with a separate audience and
purpose from API access tokens. Login, registration, refresh, and current-user
responses issue it; logout and rejected refresh sessions clear it. Existing sessions
without this cookie recover through the login page's normal refresh flow.

This cookie provides optimistic navigation checks only. It cannot refresh a session
or authenticate an API request. The client session guard and database-backed API
checks remain authoritative for revocation, disabled accounts, and current roles.
The refresh cookie remains scoped to `/api/v1/auth`.

Run `npm run test:security` for route and cookie checks. The request-level Playwright
checks in `tests/browser/route-protection.spec.ts` exercise the production proxy
without launching a browser.

## 👤 Author

**Farhana Sharna**  
- **GitHub:** [@sharnabetopia](https://github.com/sharnabetopia) / [@Farhanasharna2000](https://github.com/Farhanasharna2000)
