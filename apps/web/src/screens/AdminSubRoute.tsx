import { AdminFrame } from "@/components/admin/admin-frame";

import ReportsPage from "@/app/(app)/admin/reports/page";
import { AdminErrorsScreen } from "@/components/admin/admin-errors-screen";
import { AdminSystemScreen } from "@/components/admin/admin-system-screen";
import { AdminPeople } from "@/app/(app)/admin/people/admin-people";
import { SiteAdminForm } from "@/app/(app)/admin/site/site-admin-form";

export function AdminSubRoute({ page }: { page: "reports" | "people" | "site" | "errors" | "system" }) {
  return (
    <AdminFrame>
      {page === "reports" ? <ReportsPage /> : null}
      {page === "people" ? <AdminPeople /> : null}
      {page === "site" ? <SiteAdminForm /> : null}
      {page === "errors" ? <AdminErrorsScreen /> : null}
      {page === "system" ? <AdminSystemScreen /> : null}
    </AdminFrame>
  );
}
