"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import styles from "./Field.module.css";

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "value" | "defaultValue" | "onChange"> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
}

interface OptionView {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

function optionViews(children: ReactNode): OptionView[] {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
      return {
        value: String(props.value ?? ""),
        label: props.children,
        disabled: Boolean(props.disabled),
      };
    });
}

export function Select({
  label,
  hint,
  error,
  hideLabel = false,
  id,
  children,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listId = `${selectId}-listbox`;
  const labelId = `${selectId}-label`;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const options = optionViews(children);
  const firstValue = options[0]?.value ?? "";
  const [internal, setInternal] = useState(String(defaultValue ?? firstValue));
  const current = value !== undefined ? String(value) : internal;
  const selectedIndex = options.findIndex((option) => option.value === current);
  const selected = options[selectedIndex] ?? options[0];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(option: OptionView) {
    if (option.disabled) return;
    if (value === undefined) setInternal(option.value);
    setOpen(false);
    triggerRef.current?.focus();
    onChange?.({
      target: { value: option.value, name: name ?? "" },
      currentTarget: { value: option.value, name: name ?? "" },
    } as ChangeEvent<HTMLSelectElement>);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, selectedIndex));
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        let next = index;
        for (let step = 0; step < options.length; step += 1) {
          next = (next + direction + options.length) % options.length;
          if (!options[next]?.disabled) return next;
        }
        return index;
      });
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    } else if ((event.key === "Enter" || event.key === " ") && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className={`${styles.field} ${className ?? ""}`}>
      <span className={hideLabel ? "visually-hidden" : styles.label} id={labelId}>
        {label}
      </span>
      <div className={styles.selectRoot} ref={ref}>
        <button
          {...(rest as Record<string, unknown>)}
          aria-controls={listId}
          aria-describedby={describedBy || undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={error ? true : undefined}
          aria-labelledby={labelId}
          className={`${styles.selectTrigger} ${error ? styles.invalid : ""}`}
          disabled={disabled}
          id={selectId}
          onClick={() => {
            setOpen((currentOpen) => !currentOpen);
            setActiveIndex(Math.max(0, selectedIndex));
          }}
          onKeyDown={onKeyDown}
          ref={triggerRef}
          role="combobox"
          type="button"
        >
          <span className={styles.selectValue}>{selected?.label ?? ""}</span>
          <span aria-hidden="true" className={`${styles.selectChevron} ${open ? styles.selectChevronOpen : ""}`} />
        </button>
        {name ? <input name={name} type="hidden" value={current} /> : null}
        <ul
          aria-labelledby={labelId}
          className={`${styles.selectMenu} ${open ? styles.selectMenuOpen : ""}`}
          id={listId}
          role="listbox"
        >
          {options.map((option, index) => (
            <li
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === current}
              className={`${styles.selectOption} ${
                index === activeIndex ? styles.selectOptionActive : ""
              } ${option.value === current ? styles.selectOptionSelected : ""}`}
              key={`${option.value}-${index}`}
              onClick={() => choose(option)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              {option.label}
              {option.value === current ? <span aria-hidden="true">✓</span> : null}
            </li>
          ))}
        </ul>
      </div>
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
