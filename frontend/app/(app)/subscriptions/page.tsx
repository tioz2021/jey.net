import { redirect } from "next/navigation";

/** The subscriptions list now lives on the People page. */
export default function SubscriptionsPage() {
  redirect("/people");
}
