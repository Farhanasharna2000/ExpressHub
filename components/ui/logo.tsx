import { useId } from "react";

export interface LogoProps {
  /**
   * Visual variant:
   * - "icon": emblem only
   * - "full": emblem + "ExpressHub" typography
   * - "text": typography only
   */
  variant?: "icon" | "full" | "text";
  /**
   * Predefined size or numeric pixel dimension for the emblem.
   * "sm" = 24px, "md" = 32px (default), "lg" = 40px, "xl" = 48px.
   */
  size?: "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  /**
   * Accessibility label. When not provided and text is visible, the text provides the accessible name.
   */
  ariaLabel?: string;
}

const SIZES: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
};

export function Logo({
  variant = "full",
  size = "md",
  className = "",
  ariaLabel,
}: LogoProps) {
  const pixelSize = typeof size === "number" ? size : SIZES[size] ?? 32;
  const id = useId();

  if (variant === "text") {
    return (
      <span className={`inline-flex items-center font-extrabold tracking-tight select-none ${className}`.trim()}>
        <span className="text-foreground">Express</span>
        <span className="text-primary">Hub</span>
      </span>
    );
  }

  const emblem = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={pixelSize}
      height={pixelSize}
      fill="none"
      className="shrink-0 transition-transform duration-200 group-hover:scale-105"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#196547" />
          <stop offset="100%" stopColor="#0c3825" />
        </linearGradient>
        <linearGradient id={`${id}-top`} x1="6.5" y1="8.5" x2="25.5" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3dd69b" />
          <stop offset="100%" stopColor="#249c69" />
        </linearGradient>
        <linearGradient id={`${id}-left`} x1="6.5" y1="13.75" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e7854" />
          <stop offset="100%" stopColor="#15583d" />
        </linearGradient>
        <linearGradient id={`${id}-arrow`} x1="9" y1="22" x2="25" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d8ed99" />
          <stop offset="60%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Squircle base */}
      <rect width="32" height="32" rx="7.5" fill={`url(#${id}-bg)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" stroke="#d8ed99" strokeOpacity="0.25" strokeWidth="1" />

      {/* 3D Courier Parcel */}
      <polygon points="6.5,13.75 16,19 16,27 6.5,21.75" fill={`url(#${id}-left)`} />
      <polygon points="16,19 25.5,13.75 25.5,21.75 16,27" fill="#0d3f2b" />
      <polygon points="16,8.5 25.5,13.75 16,19 6.5,13.75" fill={`url(#${id}-top)`} />

      {/* Box seam lines */}
      <line x1="11.25" y1="11.125" x2="20.75" y2="16.375" stroke="#d8ed99" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="16" y1="19" x2="16" y2="27" stroke="#092d1f" strokeWidth="0.8" strokeOpacity="0.5" />

      {/* Soaring Express Arrow (↗) */}
      <g filter={`url(#${id}-shadow)`}>
        <path
          d="M 10 22 L 21.5 10.5 M 21.5 10.5 H 16.5 M 21.5 10.5 V 15.5"
          stroke={`url(#${id}-arrow)`}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="22" r="1.3" fill="#d8ed99" />
      </g>
    </svg>
  );

  if (variant === "icon") {
    return (
      <span
        className={`inline-flex items-center justify-center select-none ${className}`.trim()}
        aria-label={ariaLabel ?? "ExpressHub"}
        role={ariaLabel ? "img" : undefined}
      >
        {emblem}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 select-none group ${className}`.trim()}
      aria-label={ariaLabel ?? "ExpressHub"}
    >
      {emblem}
      <span className="font-extrabold tracking-tight text-[1.25rem] leading-none whitespace-nowrap">
        <span className="text-foreground">Express</span>
        <span className="text-primary">Hub</span>
      </span>
    </span>
  );
}
