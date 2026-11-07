import { AdminRedirect } from "@/components/legacy/admin-redirect";
export function AdminRedirectRoute({ target }: { target: string }) {
  return <AdminRedirect target={target} />;
}
