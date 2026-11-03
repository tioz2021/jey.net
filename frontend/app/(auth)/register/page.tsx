import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Вход — jey.net",
  robots: { index: false, follow: false },
};

/** Registration now happens on the first Google sign-in. */
export default function RegisterPage() {
  redirect("/login");
}
