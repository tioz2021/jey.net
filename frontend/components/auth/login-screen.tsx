import { Suspense } from "react";

import { LoginOptions } from "@/components/forms/login-options";
import { Logo } from "@/components/logo";
import { RedirectIfAuthenticated } from "@/components/redirect-if-authenticated";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import { AppLink } from "@/lib/navigation";

import styles from "./login-screen.module.css";

export function LoginScreen() {
  const { t } = useI18n();

  return (
    <div className={styles.wrapper}>
      <div className={styles.intro}>
        <Logo size={34} />
        <p className={styles.kicker}>jey.net</p>
        <h1 className={styles.title}>
          {t("auth.loginIntroTitle")}
        </h1>
        <p className={styles.lead}>
          {t("auth.loginLead")}
        </p>
      </div>

      <Card title={t("auth.loginTitle")}>
        {/* useSearchParams needs a Suspense boundary during prerendering. */}
        <Suspense fallback={null}>
          <RedirectIfAuthenticated />
          <LoginOptions />
        </Suspense>
      </Card>

      <p className={styles.footer}>
        {t("auth.noRegister")}
      </p>

      <p className={styles.footer}>
        <AppLink href="/privacy">{t("footer.privacy")}</AppLink>
        <span aria-hidden="true"> · </span>
        <AppLink href="/terms">{t("footer.terms")}</AppLink>
      </p>
    </div>
  );
}
