"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FeedBadge } from "@/components/feed-badge";
import { LanguageSwitch } from "@/components/language-switch";
import {
  IconCollection,
  IconFeed,
  IconList,
  IconPeople,
  IconSparkles,
} from "@/components/icons";
import { useI18n } from "@/lib/locale-context";
import type { TranslationKey } from "@/lib/i18n";

import styles from "./mobile-menu.module.css";

const SECTIONS: Array<{
  href: string;
  labelKey: TranslationKey;
  Icon: typeof IconList;
}> = [
  { href: "/items", labelKey: "nav.items", Icon: IconList },
  { href: "/collections", labelKey: "nav.collections", Icon: IconCollection },
  { href: "/feed", labelKey: "nav.feed", Icon: IconFeed },
  { href: "/recommendations", labelKey: "nav.recommendations", Icon: IconSparkles },
  { href: "/people", labelKey: "nav.people", Icon: IconPeople },
];

/** Compact section menu for tablets and phones. */
export function MobileMenu() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={styles.wrap}>
      <button
        aria-controls="mobile-sections"
        aria-expanded={open}
        aria-label={t("nav.menu")}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className={styles.lines} />
      </button>

      {open ? (
        <div className={styles.panel} id="mobile-sections">
          <div className={styles.language}>
            <LanguageSwitch />
          </div>

          <nav aria-label={t("nav.menu")} className={styles.sections}>
            {SECTIONS.map(({ href, labelKey, Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`${styles.link} ${active ? styles.active : ""}`}
                  href={href}
                  key={href}
                  title={
                    href === "/feed"
                      ? t("nav.feedHint")
                      : href === "/recommendations"
                        ? t("nav.recommendationsHint")
                        : undefined
                  }
                >
                  <Icon size={16} />
                  {t(labelKey)}
                  {href === "/feed" ? <FeedBadge /> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
