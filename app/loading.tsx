import { ResourceSkeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div id="main-content">
      <ResourceSkeleton variant="list" />
    </div>
  );
}
