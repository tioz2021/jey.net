/** The jey.net mark: the same "j" as the favicon, drawn inline. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <rect fill="var(--color-accent)" height="32" width="32" />
      <path
        d="M21 7v13a6 6 0 0 1-6 6h-4"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="square"
        strokeWidth="3"
      />
      <circle cx="21" cy="7" fill="#ffffff" r="2" />
    </svg>
  );
}
