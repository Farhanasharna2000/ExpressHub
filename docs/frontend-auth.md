# Phase 2: API client and authentication

## Implemented

- Same-origin `/api/v1` JSON client, typed success/error envelopes, Bearer access tokens, structured validation errors, query serialization, and cancellable list requests.
- One coordinated refresh for expired-token responses, at most one protected request retry, and no recursive login/refresh retries. Network failures and conflict responses never automatically repeat mutations. `Retry-After` prevents early resubmission to the affected endpoint.
- Access tokens exist only in memory. The backend's HttpOnly refresh cookie restores the session; `/users/me` supplies the current role and active state before rendering authenticated content. Neither localStorage nor sessionStorage stores tokens or private records.
- Shared dashboard gate, role-specific navigation, safe local return destinations, and account revalidation on route changes, focus, visibility, and every minute while visible. A changed role clears outstanding requests and remounts private views. The API still enforces authorization on every request; a browser gate is not a server security boundary.
- Login, customer-only registration, editable profile, announced validation errors, pending states, password visibility controls, and sign-out. Browser password validation counts UTF-8 bytes just like the server. Blank profile phone values become null.
- Sign-out clears local identity immediately, waits for any cookie rotation, then revokes the server session. A failed revocation shows a retry notice. No private response cache is retained.
- Official shadcn/ui components (Radix, Tailwind v4, Lucide icons) are committed under `components/ui`. Existing wrappers use these components; ExpressHub's green palette and responsive layouts remain. Add more components with `npx shadcn@latest add <component>`.

The shipment, payment, and admin data screens remain shells for later phases. Checkout return integration remains Phase 4. Do not add private server-rendered data underneath the client gate without separate server authorization.

## Local setup

Use the existing environment and database setup in the README. `ALLOWED_ORIGIN` must match the browser's exact origin; the default development origin is `http://localhost:3000`. The cookie is Secure in production, so use HTTPS for deployed sign-in. No new public environment variables or secret exposure are needed.

Run `npm run dev`. Register at `/register` or sign in at `/login`. Registration always creates a Customer. Existing Courier/Admin accounts land at `/courier` and `/admin`; a Customer lands at `/customer`. The shared profile is `/profile`.

## Verification

- `npm run typecheck`
- `npm run build` (in environments that block Turbopack's PostCSS worker port, use `npm run build -- --webpack`)
- `npm run test:frontend`: 15 focused API/session/validation tests with a controlled fetch transport, including refresh concurrency, stale-response suppression, role changes, logout races, safe redirects, and byte-length validation.
- Existing auth/payment/checkout-return/error/security unit suites can run with `NODE_ENV=test`, `UPSTASH_REDIS_REST_URL=`, and `UPSTASH_REDIS_REST_TOKEN=` to select the existing local test limiter.
- `npx playwright install --with-deps chromium`, then `npm run test:frontend:browser` after building. Playwright starts the production server on port 3100. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to an existing compatible Chromium binary.

The browser suite mocks API responses to verify desktop/mobile interactions independently of database/provider availability. It is not proof of live database, cookie rotation, Redis, or Stripe integration. Real service-backed authorization and auth integration suites remain necessary against a configured development/test database. Do not run fixture-creating integration suites against production.

Component setup references: [shadcn manual installation](https://ui.shadcn.com/docs/installation/manual) and the installed Next.js guides in `node_modules/next/dist/docs/`.

Completed in this implementation: TypeScript; production Webpack build; all 15 focused frontend tests; all 20 desktop/mobile browser checks; and the five existing auth/payment/checkout-return/error/security unit suites. Registration screenshots were visually reviewed at desktop/mobile sizes. The default Turbopack build was blocked by the environment's PostCSS worker port restriction. No live database-backed integration suites were run.
