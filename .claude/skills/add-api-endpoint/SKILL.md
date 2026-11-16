---
name: add-api-endpoint
description: Add or change an ExpressHub REST endpoint under app/api/v1 following the route, validator, service and API docs conventions. Use when creating, editing or removing an API route.
---

# Add an API endpoint

Work through the layers in this order. Read a neighbouring route first and match it.

## 1. Validator (`validators/<domain>.ts`)

- Define a Zod schema with `.strict()` so unknown fields are rejected.
- Trim strings and set explicit `min` and `max` lengths.
- IDs use `z.cuid()`.
- Export the inferred type: `export type FooInput = z.infer<typeof fooSchema>;`.
- List endpoints reuse `paginationFields`, `searchQuery`, `sortOrder` and `dateRangeFields` from `validators/list-query.ts`.

## 2. Service (`services/<domain>.service.ts`)

- Keep `import "server-only";` at the top.
- Take the `AuthenticatedUser` as the first argument.
- Check roles with `requireRole(actor, "ADMIN", ...)`.
- Scope every query by ownership and `deletedAt: null`, like `scope()` in `shipment.service.ts`.
- Throw `AppError(status, message, "CODE")` for expected failures: 404 for missing or out-of-scope records, 409 for concurrent or invalid state changes.
- Wrap multi-row writes in `prisma.$transaction`. Write the `AuditLog` row inside the same transaction for admin actions and payment changes.
- Paginate with `paginateTransaction` from `lib/db/pagination.ts`.

## 3. Route (`app/api/v1/<path>/route.ts`)

```ts
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { handleRouteError, parseRequestBody } from "@/lib/auth/route-helpers";
import { successResponse } from "@/lib/http/responses";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const input = await parseRequestBody(request, fooSchema);
    const result = await createFoo(actor, input);
    return successResponse("Foo created successfully", { foo: result }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
```

- Dynamic params are a promise: `context: { params: Promise<{ id: string }> }`, then parse the ID with its schema.
- Keep the handler thin. No Prisma calls and no business rules in the route.
- Cookie-setting auth routes call `ensureAllowedCookieOrigin` and `checkAuthRateLimit`.

## 4. API docs

1. Add the path to `scripts/generate-api-docs.mjs` with its request schema, responses and an example.
2. Run `node scripts/generate-api-docs.mjs && node scripts/prepare-postman.mjs`.
3. Commit the regenerated `docs/openapi.json` and Postman collection together with the route.

## 5. Tests and checks

- Add unit coverage next to the matching suite in `tests/` (Node test runner, `node:assert/strict`).
- Add integration coverage in the matching `*.integration.mjs` when the change touches the database.
- Run the `verify-change` skill.
