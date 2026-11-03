import { DashboardSkeleton, PageHeaderSkeleton } from "@/components/skeletons";

export default function DashboardLoading() {
  return (
    <main>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <PageHeaderSkeleton />
        <DashboardSkeleton />
      </div>
    </main>
  );
}
