import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NicknameForm } from "@/components/forms/nickname-form";
import { Card, PageHeader } from "@/components/ui";
import { backendFetch } from "@/lib/server-api";
import type { UserResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Выбор ника — jey.net",
  robots: { index: false, follow: false },
};

export default async function WelcomePage() {
  const response = await backendFetch("/me");

  if (!response.ok) {
    redirect("/login");
  }

  const { user } = (await response.json()) as UserResponse;

  return (
    <main>
      <PageHeader
        subtitle="Так вас будут видеть на публичном профиле. Потом можно изменить в настройках."
        title="Как вас называть?"
      />
      <Card>
        <NicknameForm initial={user.display_name} />
      </Card>
    </main>
  );
}
