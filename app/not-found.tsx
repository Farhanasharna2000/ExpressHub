import { PublicShell } from "@/components/layout/shells";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
export default function NotFound() {
  return (
    <PublicShell>
      <EmptyState
        title="This page is off the route"
        description="The page could not be found. Head home to find your next step."
        action={<ButtonLink href="/">Back to home</ButtonLink>}
      />
    </PublicShell>
  );
}
