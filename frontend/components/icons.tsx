import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    "aria-hidden": true,
    fill: "none",
    focusable: false,
    height: size,
    viewBox: "0 0 24 24",
    width: size,
    ...rest,
  };
}

function stroke(extra?: Record<string, unknown>) {
  return {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    ...extra,
  };
}

export function IconList(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16M4 12h16M4 18h16" {...stroke()} />
    </svg>
  );
}

export function IconFilm(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect height="16" rx="1" width="18" x="3" y="4" {...stroke()} />
      <path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21" {...stroke()} />
    </svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" {...stroke()} />
      <path d="M5 4.5V22M9 6h6" {...stroke()} />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect height="16" rx="1" width="18" x="3" y="4" {...stroke()} />
      <circle cx="8.5" cy="9" r="1.5" {...stroke()} />
      <path d="m4 18 5-5 4 4 3-3 4 4" {...stroke()} />
    </svg>
  );
}

export function IconOther(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect height="7" rx="1" width="7" x="4" y="4" {...stroke()} />
      <rect height="7" rx="1" width="7" x="13" y="4" {...stroke()} />
      <rect height="7" rx="1" width="7" x="4" y="13" {...stroke()} />
      <rect height="7" rx="1" width="7" x="13" y="13" {...stroke()} />
    </svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8L3 11Z" {...stroke()} />
      <circle cx="7.5" cy="7.5" r="1.4" {...stroke()} />
    </svg>
  );
}

export function IconStats(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20V4M4 20h16" {...stroke()} />
      <path d="M8 20v-6M12 20V8M16 20v-9M20 20v-4" {...stroke()} />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h16M4 12h16M4 18h16" {...stroke()} />
      <circle cx="9" cy="6" r="2" fill="var(--color-bg)" {...stroke()} />
      <circle cx="15" cy="12" r="2" fill="var(--color-bg)" {...stroke()} />
      <circle cx="8" cy="18" r="2" fill="var(--color-bg)" {...stroke()} />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" {...stroke()} />
      <path d="M10 11v6M14 11v6" {...stroke()} />
    </svg>
  );
}
