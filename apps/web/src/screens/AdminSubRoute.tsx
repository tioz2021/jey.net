import { AdminFrame } from "@/components/admin/admin-frame";

import ReportsPage from "@/app/(app)/admin/reports/page";
import { AdminErrorsScreen } from "@/components/admin/admin-errors-screen";
import { AdminSystemScreen } from "@/components/admin/admin-system-screen";
import { AdminAuditScreen } from "@/components/admin/admin-audit-screen";
import { AdminAnalyticsScreen } from "@/components/admin/admin-analytics-screen";
import { AdminPeople } from "@/app/(app)/admin/people/admin-people";
import { SiteAdminForm } from "@/app/(app)/admin/site/site-admin-form";

export function AdminSubRoute({ page }: { page: "reports" | "people" | "site" | "errors" | "system" | "audit" | "analytics" }) {
  return (
    <AdminFrame>
      {page === "reports" ? <ReportsPage /> : null}
      {page === "people" ? <AdminPeople /> : null}
      {page === "site" ? <SiteAdminForm /> : null}
      {page === "errors" ? <AdminErrorsScreen /> : null}
      {page === "system" ? <AdminSystemScreen /> : null}
      {page === "audit" ? <AdminAuditScreen /> : null}
      {page === "analytics" ? <AdminAnalyticsScreen /> : null}
    </AdminFrame>
  );
}
