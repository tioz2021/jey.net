/** Small line drawings for empty states. Decorative: always aria-hidden. */

const common = {
  "aria-hidden": true as const,
  fill: "none",
  focusable: false as const,
  height: 88,
  viewBox: "0 0 120 88",
  width: 120,
};

export function RecordsIllustration() {
  return (
    <svg {...common}>
      <rect height="54" rx="1" stroke="currentColor" strokeWidth="1.5" width="36" x="18" y="14" />
      <rect height="54" rx="1" stroke="currentColor" strokeWidth="1.5" width="36" x="66" y="22" />
      <path d="M36 30v18M27 39h18" stroke="var(--color-accent)" strokeWidth="2" />
    </svg>
  );
}

export function TagsIllustration() {
  return (
    <svg {...common}>
      <path
        d="M22 42V24a2 2 0 0 1 2-2h18l24 24-20 20-24-24Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="34" cy="34" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M64 20h16l16 16-10 10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function StatsIllustration() {
  return (
    <svg {...common}>
      <path d="M18 16v56h84" stroke="currentColor" strokeWidth="1.5" />
      <path d="M32 62V44M48 62V32M64 62V50M80 62V26" stroke="var(--color-accent)" strokeWidth="6" />
      <path d="M24 22h20" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5" />
    </svg>
  );
}

export function SearchIllustration() {
  return (
    <svg {...common}>
      <circle cx="52" cy="38" r="20" stroke="currentColor" strokeWidth="1.5" />
      <path d="m67 53 18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M42 32h20M42 42h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIllustration() {
  return (
    <svg {...common}>
      <path d="M34 28h52l-5 44H39l-5-44Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 28h64M48 28v-8h24v8M50 40v20M70 40v20" stroke="currentColor" strokeWidth="1.5" />
      <path d="M86 20h14" stroke="var(--color-accent)" strokeWidth="2" />
    </svg>
  );
}
