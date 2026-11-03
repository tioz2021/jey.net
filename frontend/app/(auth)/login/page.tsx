import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginOptions } from "@/components/forms/login-options";
import { RedirectIfAuthenticated } from "@/components/redirect-if-authenticated";
import { Card } from "@/components/ui";
import { translate } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Вход — jey.net",
};

export default async function LoginPage() {
  const locale = await getServerLocale();

  return (
    <div className={styles.wrapper}>
      <Card title={translate(locale, "auth.loginTitle")}>
        {/* useSearchParams needs a Suspense boundary during prerendering. */}
        <Suspense fallback={null}>
          <RedirectIfAuthenticated />
          <LoginOptions />
        </Suspense>
      </Card>
      <p className={styles.footer}>
        {translate(locale, "auth.noRegister")}
      </p>

      <p className={styles.footer}>
        <Link href="/privacy">{translate(locale, "footer.privacy")}</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms">{translate(locale, "footer.terms")}</Link>
      </p>
    </div>
  );
}
