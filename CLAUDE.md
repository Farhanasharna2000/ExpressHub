@AGENTS.md

# ExpressHub

Courier and logistics app. Customers book, pay for and track shipments, couriers work assigned deliveries, and admins run dispatch, users, payments and audit logs.

Stack: Next.js 16 App Router (Turbopack), React 19, TypeScript (strict), PostgreSQL with Prisma 5, Zod 4, TanStack Query, React Hook Form, Tailwind CSS 4 with shadcn-style components, Stripe Checkout, Upstash rate limiting. Node.js 24, npm.

## Commands

```bash
npm run dev                    # local server on http://localhost:3000
npm run lint                   # ESLint, must report 0 errors
npm run typecheck              # tsc --noEmit
npm run test:frontend          # frontend contracts, forms, query cache
npm run test:auth              # prefix UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= to stay local
npm run test:security          # proxy redirects and cookie validation
npm run test:payments
npm run test:checkout-return
npm run test:errors
npm run test:ai                # AI assistant (Claude and Gemini), clients mocked, no key needed
npm run build                  # prisma generate + next build
npm run test:frontend:browser  # Playwright, needs a build, uses port 3100
```

`npm run test:*:integration` suites need a dedicated test database in `DATABASE_URL`.
They create and delete rows, so never point them at a shared or production database.

## Architecture

Requests flow in one direction. Keep each layer to its job.

| Layer | Path | Responsibility |
| --- | --- | --- |
| Proxy | `proxy.ts` | Page access redirects and API CORS (`ALLOWED_ORIGIN`). Not an authorization boundary. |
| Route handler | `app/api/v1/**/route.ts` | `requireUser`, parse params and body with a validator, call one service, return `successResponse`. Errors go to `handleRouteError`. |
| Validator | `validators/*.ts` | Zod schemas with `.strict()`. Export inferred input types. |
| Service | `services/*.service.ts` | `import "server-only"`. Business rules, `requireRole`, ownership scoping, Prisma transactions, audit log rows. |
| Errors | `lib/http/errors.ts` | Throw `AppError(status, message, CODE)`. Never return ad hoc error JSON. |
| Client API | `lib/client/api.ts` | Same-origin `/api/v1` client, in-memory access token, refresh, `Retry-After`. |
| Features | `features/<domain>/` | Client UI per domain. `contracts.ts` holds client schemas, labels and types. Data loads through `useResource`. |
| UI kit | `components/ui/`, `components/layout/` | Shared controls and shells. Reuse before adding new ones. |

## Rules

- Do not change behavior, API contracts or visual design unless the task asks for it.
- Authorization lives on the server. Services scope reads and writes by role and ownership; client gates and `proxy.ts` are convenience only.
- Shipment status changes follow the `transitions` map in `services/shipment.service.ts` and keep the expected-status concurrency check.
- Amounts are `Prisma.Decimal`. Convert with `amountInMinorUnits` for Stripe and never do money math with JavaScript numbers.
- Stripe webhooks verify signatures and stay idempotent through the `PaymentWebhookEvent` ledger.
- Records are soft deleted with `deletedAt`. Queries filter `deletedAt: null`.
- Admin actions, role and status changes and payment state changes write an `AuditLog` row inside the same transaction.
- Tokens stay in memory or HTTP-only cookies. Never put tokens or private records in `localStorage` or `sessionStorage`.
- Schema changes need a new Prisma migration in `prisma/migrations/`. Never edit an applied migration.
- When you add, remove or rename an API route, update `scripts/generate-api-docs.mjs`, then run `node scripts/generate-api-docs.mjs && node scripts/prepare-postman.mjs`. `tests/postman.test.mjs` fails on undocumented routes.
- Never read, print or commit `.env`. Add new variables to `.env.example` and the README table.
- AI code lives in `services/ai/`. Assistant tools stay read-only, take no user id, and call existing services with the signed-in actor. Never store message text in audit records. Bump `ASSISTANT_PROMPT_VERSION` when the prompt changes. Claude (`assistant.service.ts`) and Gemini (`gemini-assistant.service.ts`) share the tools, limits and audit; change both loops together. Booking drafts (`booking-draft.service.ts`) only pre-fill the form: never create shipments from AI output, and re-check every field with `createShipmentSchema`. The operations brief (`ops-brief.service.ts`) only sends figures and tracking numbers, never customer names, phones or addresses; keep the number check (`unverifiedNumbers`) and the one-brief-per-day cache. Keep `npm run test:ai` passing with the clients mocked. The help chat (`help.service.ts`) answers only from retrieved help chunks: keep the similarity threshold, the citation check (`validateCitations`) and the fallback, and never give it shipment or account data. After editing `docs/help/`, run `npm run help:index`; check quality with `npm run eval:help`. Prisma cannot model the pgvector HNSW index, so delete any `DROP INDEX "help_chunks_embedding_hnsw_idx"` that `prisma migrate dev` generates.
- The dev URL must match `ALLOWED_ORIGIN`. A 403 `ORIGIN_NOT_ALLOWED` on login usually means the app runs on another port or host.

## Before finishing a change

1. `npm run lint` and `npm run typecheck` pass.
2. Run the unit suites for the area you touched, and `npm run test:frontend` for UI changes.
3. Report real results. If a suite needs a database or browser that is not available, say so.

## Git

- Commit only when asked. Branch from `main` for features.
- Short, human-style commit messages in the imperative mood, for example `Fix courier filter reset`.
- Never add `Co-Authored-By` lines or tool footers, and never set an AI tool as author or co-author.
- `.githooks/` enforces this. Enable it once per clone with `git config core.hooksPath .githooks`.

## Project skills and agents

- Skills in `.claude/skills/`: `add-api-endpoint`, `add-feature-ui`, `prisma-schema-change`, `verify-change`.
- Agents in `.claude/agents/`: `code-reviewer` (read-only review), `test-runner` (runs checks and writes tests, never changes app code), `security-auditor` (read-only review of auth, payments and data exposure).
