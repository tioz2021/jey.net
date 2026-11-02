"use client";

import { useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";

import styles from "./Field.module.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Select({
  label,
  hint,
  error,
  id,
  children,
  className,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className={`${styles.control} ${error ? styles.invalid : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </select>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
