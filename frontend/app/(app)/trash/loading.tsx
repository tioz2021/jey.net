import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";

export default function TrashLoading() {
  return (
    <main>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <PageHeaderSkeleton />
        <RowsSkeleton count={4} />
      </div>
    </main>
  );
}
