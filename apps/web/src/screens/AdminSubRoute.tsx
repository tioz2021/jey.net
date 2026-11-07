import { AdminFrame } from "@/components/admin/admin-frame";

import { AdminReportsScreen } from "@/components/admin/admin-reports-screen";
import { AdminErrorsScreen } from "@/components/admin/admin-errors-screen";
import { AdminSystemScreen } from "@/components/admin/admin-system-screen";
import { AdminAuditScreen } from "@/components/admin/admin-audit-screen";
import { AdminAnalyticsScreen } from "@/components/admin/admin-analytics-screen";
import { AdminPeople } from "@/components/admin/admin-people";
import { SiteAdminForm } from "@/components/admin/site-admin-form";

export function AdminSubRoute({ page }: { page: "reports" | "people" | "site" | "errors" | "system" | "audit" | "analytics" }) {
  return (
    <AdminFrame>
      {page === "reports" ? <AdminReportsScreen /> : null}
      {page === "people" ? <AdminPeople /> : null}
      {page === "site" ? <SiteAdminForm /> : null}
      {page === "errors" ? <AdminErrorsScreen /> : null}
      {page === "system" ? <AdminSystemScreen /> : null}
      {page === "audit" ? <AdminAuditScreen /> : null}
      {page === "analytics" ? <AdminAnalyticsScreen /> : null}
    </AdminFrame>
  );
}
