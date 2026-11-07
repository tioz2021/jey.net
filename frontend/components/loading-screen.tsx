"use client";

import { useEffect, useState } from "react";

import styles from "./loading-screen.module.css";

/** A quiet skeleton that appears only if loading takes longer than 250 ms. */
export function LoadingScreen() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <main aria-busy="true" className={styles.page}>
      <div className={styles.heading} />
      <div className={styles.card} />
      <div className={styles.card} />
    </main>
  );
}
