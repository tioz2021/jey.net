import Link from "next/link";

import { LEGAL } from "@/lib/i18n/legal";
import type { Locale } from "@/lib/i18n";

import styles from "@/app/(public)/legal.module.css";

const CONTACT = "https://github.com/tioz2021/jey.net/issues";

export function LegalArticle({
  page,
  locale,
}: {
  page: "privacy" | "terms";
  locale: Locale;
}) {
  const content = LEGAL[page][locale];

  return (
    <article className={styles.page}>
      <h1 className={styles.title}>{content.title}</h1>
      <p className={styles.updated}>{content.updated}</p>

      {content.blocks.map((block, index) => {
        if (block.kind === "h2") {
          return <h2 key={index}>{block.text}</h2>;
        }
        if (block.kind === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "note") {
          return (
            <p className={styles.note} key={index}>
              {block.text}{" "}
              <Link href={content.relatedHref}>{content.related}</Link>.
            </p>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}

      <p>
        <a href={CONTACT} rel="noreferrer" target="_blank">
          {content.contact}
        </a>
      </p>
    </article>
  );
}
