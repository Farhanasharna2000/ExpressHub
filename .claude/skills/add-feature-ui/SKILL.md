---
name: add-feature-ui
description: Add or change an ExpressHub page or client feature (customer, courier, admin or profile workspace) using the existing feature modules, UI kit, useResource and form patterns without changing the design. Use for any UI work under app/ or features/.
---

# Add a feature screen

## Where code goes

- `app/(dashboard)/<role>/.../page.tsx` stays thin: metadata plus the feature component, wrapped in `Suspense` with a `ResourceSkeleton` fallback.
- `features/<domain>/` holds the client component (`"use client"`) and `contracts.ts` for client schemas, labels, filter parsing and response types.
- Shared controls come from `components/ui/` and shells from `components/layout/`. Reuse them instead of adding new styling.

Example page:

```tsx
import { Suspense } from "react";
import { ShipmentListView } from "@/features/shipments/list";
import { ResourceSkeleton } from "@/components/ui/skeleton";
export const metadata = { title: "My shipments" };
export default function Page() {
  return <Suspense fallback={<ResourceSkeleton variant="list" label="Loading shipments…" />}><ShipmentListView /></Suspense>;
}
```

## Data

- Read data with `useResource<T>(path)` from `features/shipments/use-resource.ts`. It keys the cache by user, role and session revision.
- Call mutations through `useSession().store.api`. A successful mutation already invalidates cached resources (`api.onMutation` in `features/auth/session.ts`); call the hook's `reload()` only for an explicit refresh.
- Show errors with `errorMessage(error)` from `lib/client/api.ts` and feedback with `toast`.
- Keep list filters in the URL search params.
- Never store tokens or private records in `localStorage` or `sessionStorage`.

## Forms

- React Hook Form with `zodResolver`. Client schemas live in `contracts.ts` or `lib/client/form-schemas.ts` and mirror the server validator limits.
- Map server validation errors back to fields. Disable submit while pending.
- Label every input and announce errors, matching the existing accessible field pattern.

## Navigation and access

- New workspace links go in `components/layout/navigation.tsx`.
- Page access rules live in `lib/auth/route-access.ts` and `proxy.ts`. A client gate is not authorization; the API must still enforce the role.

## Design

Keep the existing green palette, spacing, typography and responsive layout. Do not restyle screens that the task does not mention.

## Checks

Run `npm run test:frontend`, then the `verify-change` skill. For layout changes, run the matching Playwright spec in `tests/browser/`.
