# Frontend foundation (Phase 1)

Historical Phase 1 notes: Phase 2 now adds authentication and profile APIs and migrates controls to shadcn/ui/Tailwind. Workspace shells are now role-gated. See [current implementation](frontend-auth.md).

The public pages and workspace shells use the existing Next.js App Router, React, TypeScript, and plain CSS. No styling dependencies or external fonts are required. Start with `npm run dev` and open `/`.

## Scope

All routes in section 3 of `FRONTEND_IMPLEMENTATION_FLOW.md` now have page shells, including dynamic shipment, user, and payment detail routes and both Checkout returns. The home page links to each role's workspace preview. Detail shells accept any ID but do not assert that a record exists; real lookup and not-found handling belong to the API integration phases.

Workspace previews are intentionally public, contain no private data, and perform no API requests. The role passed to a shell selects navigation only; it is not authorization. Phase 2 must add session restoration and verified role checks before loading private data. Forms are disabled and labeled as previews. Checkout returns never claim payment success or failure.

## Shared components

- `components/ui/primitives.tsx`: buttons, links, cards, labeled inputs/selects with hint and error associations, shipment/payment badges, empty/error/loading presentations, and a generic table with mobile list cards.
- `components/ui/interactive.tsx`: controlled pagination using server metadata and a controlled native dialog (modal focus, Escape, and close handling). Callers own open state and mutation state.
- `components/layout`: public header/footer, role navigation, mobile menu, dashboard structure, and reusable static page shells.
- `app/globals.css`: color/spacing tokens, system typography, focus indicators, responsive layouts, and reduced-motion support.
- `types/api.ts`: browser-safe role/status/envelope/pagination primitives, with no Prisma or server imports.
- Root `loading.tsx`, `error.tsx`, and `not-found.tsx` supply shared route feedback. Errors are presented without leaking exception messages.

## Reviewed integration contracts

Sources: `docs/openapi.json`, `validators/*.ts`, `lib/http/responses.ts`, `lib/http/shipment-list.ts`, and shipment service permissions/transitions. The installed Next.js layouts/pages, Server/Client Components, CSS, and error-handling guides were reviewed before implementation.

- Same-origin base: `/api/v1`. Success: `{ success: true, message, data }`; failure: `{ success: false, message, errors }`. Preserve structured errors and HTTP status. Rate limits supply `Retry-After`.
- Single records are wrapped (`data.user`, `data.shipment`, `data.payment`); lists use their resource key (`users`, `shipments`, `payments`, `auditLogs`) plus `data.pagination: { page, limit, total, totalPages }`. Empty lists can have zero total pages. Decimal money/weight/dimension fields serialize as strings. Do not invent statistics from a list page.
- Pagination: page defaults to 1 (maximum 1,000,000), limit to 20 (maximum 100). Query schemas are strict. Dates require ISO timestamps with explicit offsets; `from <= to`. Search is trimmed, 1–100 characters.
- Shipments: `q`, `status`, `paymentStatus`, `from`, `to`, `sortBy` (`createdAt`, `updatedAt`, `price`), `order` (`asc`, `desc`). Customers see owned records, couriers assigned records, admins all non-deleted records. Admin `my-shipments` is still owner-scoped.
- Users: admin-only list with `q`, `role`, string `isActive` (`true`/`false`), `sortBy` (`createdAt`, `name`, `email`), `order`.
- Payments: customer/admin history is always caller-scoped; supports `status` and `shipmentId`, fixed newest-first order. Detail allows payer/admin, not courier. Initiation needs an owned CREATED shipment and UUID `Idempotency-Key`; checkoutUrl may be null. Only signed provider events settle payments.
- Audits: admin-only; exact actor/entity/shipment/payment/action filters, date range, and sort by `createdAt`/`action`. System actors may be null. Statistics come only from `/admin/dashboard-stats`.
- Registration only creates CUSTOMER. Name: 2–100 characters; email: maximum 254; optional phone: 5–30; password: minimum 12 characters and maximum 72 UTF-8 bytes. Refresh token stays in the HttpOnly cookie; access token is for memory in Phase 2.
- Booking: contact names 2–100, phones 5–30, addresses 5–500, description 1–1000. Positive weight has 0.001 kg precision; dimensions have 0.01 cm precision and must all be supplied or all omitted. Optional pickup must be in the future. Quote is server-owned.
- Mutations: status updates require `expectedStatus`; DELIVERED, FAILED, RETURNED require a note. Assignment requires `expectedCourierId`, including null. Assignment is CREATED/FAILED only. Dispatch requires paid status and an active courier; FAILED retries/returns are admin-only. Pending checkout can block cancellation. Archival requires a reason and preserves historical records. Recover from 409 by reloading the record.

## Verification

Run `npm run build` (regenerates route types after moving the home page), then `npm run typecheck`. Smoke-check all documented frontend URLs and a missing URL. Shared component keyboard behavior and mobile layouts should also be checked in a browser before release. Full authenticated workflow tests remain for the corresponding implementation phases; the shells require no backend services to render.

Completed checks: production build, TypeScript, HTTP smoke checks for all 21 planned routes plus a 404, and the existing auth/payment/checkout-return/error/security unit suites. Unit suites were run with `NODE_ENV=test` and empty Upstash variables to use the existing local test limiter; configured Redis was unavailable on the first auth run. No environment file was changed. Browser visual/keyboard checks and service-backed integration suites were not run for this static foundation.
