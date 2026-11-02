import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The root has no page of its own: a visitor with a session goes to the
 * catalogue, everyone else to the login form.
 */
export default async function RootPage() {
  const cookieStore = await cookies();

  redirect(cookieStore.has("jey_session") ? "/items" : "/login");
}
