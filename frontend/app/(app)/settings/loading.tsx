import { PageHeaderSkeleton, SettingsSkeleton } from "@/components/skeletons";

export default function SettingsLoading() {
  return (
    <main>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <PageHeaderSkeleton />
        <SettingsSkeleton />
      </div>
    </main>
  );
}
