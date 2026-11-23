"use client";

import { useEffect, useRef, useState } from "react";

import { useCssStyle } from "@/lib/use-css-style";

import styles from "./fast-tooltip.module.css";

type TooltipState = {
  text: string;
  left: number;
  top: number;
  below: boolean;
};

const SHOW_DELAY_MS = 120;

export function FastTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    function restore() {
      if (current.current) {
        const text = current.current.dataset.fastTooltip;
        if (text) current.current.setAttribute("title", text);
        delete current.current.dataset.fastTooltip;
      }
      current.current = null;
    }

    function hide() {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      restore();
      setTooltip(null);
    }

    function show(target: HTMLElement, text: string) {
      const rect = target.getBoundingClientRect();
      const below = rect.top < 46;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2, 28),
        window.innerWidth - 28,
      );
      setTooltip({
        text,
        left,
        top: below ? rect.bottom + 8 : rect.top - 8,
        below,
      });
    }

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("[title]");
      if (!target || target === current.current) return;
      const text = target.getAttribute("title")?.trim();
      if (!text) return;
      if (current.current) {
        if (current.current.contains(target)) return;
        hide();
      }
      current.current = target;
      target.dataset.fastTooltip = text;
      target.removeAttribute("title");
      timer.current = window.setTimeout(() => {
        timer.current = null;
        if (current.current === target) show(target, text);
      }, SHOW_DELAY_MS);
    }

    function onPointerOut(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[title], [data-fast-tooltip]");
      if (!target || !current.current) return;
      const related = event.relatedTarget as Node | null;
      if (related && current.current.contains(related)) return;
      hide();
    }

    function onViewportChange() {
      hide();
    }

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", hide);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", hide);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      hide();
    };
  }, []);

  const tooltipRef = useCssStyle<HTMLDivElement>({ left: tooltip?.left, top: tooltip?.top });

  if (!tooltip) return null;

  return (
    <div
      className={`${styles.tooltip} ${tooltip.below ? styles.below : ""}`}
      ref={tooltipRef}
      role="tooltip"
    >
      {tooltip.text}
    </div>
  );
}
