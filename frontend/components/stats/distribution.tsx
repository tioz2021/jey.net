import Link from "next/link";

import styles from "./distribution.module.css";

export interface DistributionRow {
  label: string;
  count: number;
  href?: string;
}

export function Distribution({
  rows,
  total,
}: {
  rows: DistributionRow[];
  total: number;
}) {
  return (
    <section className={styles.section}>

      <ul className={styles.list}>
        {rows.map((row) => {
          const share = total > 0 ? Math.round((row.count / total) * 100) : 0;

          return (
            <li key={row.label}>
              {(() => {
                const content = (
                  <>
                    <span className={styles.label}>{row.label}</span>
                    <span
                      className={styles.track}
                      role="img"
                      aria-label={`${row.label}: ${row.count} (${share}%)`}
                    >
                      <span
                        className={styles.fill}
                        style={{ width: `${share}%` }}
                      />
                    </span>
                    <span className={styles.count}>
                      {row.count}
                      <span className={styles.share}> · {share}%</span>
                    </span>
                  </>
                );

                const description = `${row.label}: ${row.count} (${share}%)`;

                return row.href ? (
                  <Link className={styles.row} href={row.href} title={description}>
                    {content}
                  </Link>
                ) : (
                  <div className={styles.row} title={description}>
                    {content}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
