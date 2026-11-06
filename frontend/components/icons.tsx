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

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20h4" {...stroke()} />
    </svg>
  );
}

export function IconBellOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 10a6 6 0 0 1 9-5.2M18 10c0 5 2 6 2 6H8M10 20h4M3 3l18 18" {...stroke()} />
    </svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" {...stroke()} />
      <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M18 20a6 6 0 0 0-3-5.2" {...stroke()} />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke()} />
    </svg>
  );
}

export function IconSubscriptions(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" {...stroke()} />
      <path d="M3 20a6 6 0 0 1 12 0M16 17l2 2 3-4" {...stroke()} />
    </svg>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.5l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.7 1-1a5.5 5.5 0 0 0 0-7.7Z"
        {...stroke()}
      />
    </svg>
  );
}

export function IconHeartFilled(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.5l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.7 1-1a5.5 5.5 0 0 0 0-7.7Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3ZM19 15l.8 1.7L21.5 18l-1.7.8L19 20.5l-.8-1.7L16.5 18l1.7-.8L19 15Z" {...stroke()} />
    </svg>
  );
}

export function IconFeed(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h9M4 12h7M4 18h9" {...stroke()} />
      <path d="M17 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM17 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" {...stroke()} />
      <path d="M19 4v4M17 6h4" {...stroke()} />
    </svg>
  );
}

export function IconCollection(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 7.5h6l2 2h10v9H3z" {...stroke()} />
      <path d="M3 7.5V5h6l2 2" {...stroke()} />
    </svg>
  );
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

export function IconTv(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect height="12" rx="1" width="18" x="3" y="6" {...stroke()} />
      <path d="M8 21h8M12 18v3M8 3.5 12 6l4-2.5" {...stroke()} />
    </svg>
  );
}

export function IconAnime(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect height="13" rx="1.5" width="18" x="3" y="6" {...stroke()} />
      <path d="m9 10 5 2.5-5 2.5v-5Z" {...stroke()} />
      <path d="M18 3v3M16.5 4.5h3" {...stroke()} />
    </svg>
  );
}

export function IconGame(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 7h10a5 5 0 0 1 4.8 6.4l-1.5 5A2.5 2.5 0 0 1 17.9 20c-.8 0-1.5-.4-2-1l-1.3-1.6a2 2 0 0 0-1.6-.8h-2a2 2 0 0 0-1.6.8L8.1 19a2.6 2.6 0 0 1-2 1 2.5 2.5 0 0 1-2.4-1.6l-1.5-5A5 5 0 0 1 7 7Z" {...stroke()} />
      <path d="M8 11v4M6 13h4M16 12h.01M18 14h.01" {...stroke()} />
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
