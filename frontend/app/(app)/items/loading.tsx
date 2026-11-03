import { ListSkeleton, PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui";

export default function ItemsLoading() {
  return (
    <main>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <PageHeaderSkeleton />
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
        <ListSkeleton count={3} />
      </div>
    </main>
  );
}
