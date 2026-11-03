import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";

export default function TagsLoading() {
  return (
    <main>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <PageHeaderSkeleton />
        <RowsSkeleton count={7} />
      </div>
    </main>
  );
}
