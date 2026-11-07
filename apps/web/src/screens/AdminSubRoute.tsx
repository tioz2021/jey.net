import { AdminFrame } from "@/components/admin/admin-frame";

import ReportsPage from "@/app/(app)/admin/reports/page";
import { AdminPeople } from "@/app/(app)/admin/people/admin-people";
import { SiteAdminForm } from "@/app/(app)/admin/site/site-admin-form";

export function AdminSubRoute({ page }: { page: "reports" | "people" | "site" }) {
  return (
    <AdminFrame>
      {page === "reports" ? <ReportsPage /> : null}
      {page === "people" ? <AdminPeople /> : null}
      {page === "site" ? <SiteAdminForm /> : null}
    </AdminFrame>
  );
}
