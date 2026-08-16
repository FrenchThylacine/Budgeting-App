import React from "react";

interface AircraftMarkProps {
  size?: number;
  className?: string;
  /** Fuselage and wings. */
  hull?: string;
  /** The accent stripe along the fuselage and the engine cowlings. */
  accent?: string;
  title?: string;
}

/**
 * A wide-body airliner seen from above.
 *
 * Drawn here rather than taken from anywhere: this is an original silhouette in
 * the shape of a modern twin-engine wide-body, not a manufacturer's or an
 * airline's mark. No trademarked logo, livery or proprietary asset is
 * reproduced — the aviation feeling comes from the geometry and the palette,
 * which is what the identity actually needs.
 *
 * Nose points right, so it reads as travelling forward in a left-to-right
 * interface.
 */
export const AircraftMark: React.FC<AircraftMarkProps> = ({
  size = 64,
  className = "",
  hull = "currentColor",
  accent,
  title,
}) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    className={className}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    fill="none"
  >
    {/* Swept wings, drawn before the fuselage so the hull sits on top. */}
    <path d="M45 30.5 L25.5 7 L20 8.5 L37.5 31 Z" fill={hull} opacity="0.92" />
    <path d="M45 33.5 L25.5 57 L20 55.5 L37.5 33 Z" fill={hull} opacity="0.92" />

    {/* Tailplanes. */}
    <path d="M16 30.5 L8 19 L4.5 20.5 L12.5 31 Z" fill={hull} opacity="0.8" />
    <path d="M16 33.5 L8 45 L4.5 43.5 L12.5 33 Z" fill={hull} opacity="0.8" />

    {/* Fuselage: a long taper to a rounded nose. */}
    <path
      d="M58.5 32 C58.5 30.4 55.5 28.8 51 28.8 L11 28.8 C8.4 28.8 6.5 30.2 6.5 32 C6.5 33.8 8.4 35.2 11 35.2 L51 35.2 C55.5 35.2 58.5 33.6 58.5 32 Z"
      fill={hull}
    />

    {accent && (
      <>
        {/* A single stripe down the fuselage, the way a livery reads from
            above, and the engine cowlings. Two touches, not a repaint. */}
        <path d="M12 32 L54 32" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        <rect x="29" y="18.5" width="6.5" height="4" rx="2" fill={accent} />
        <rect x="29" y="41.5" width="6.5" height="4" rx="2" fill={accent} />
      </>
    )}
  </svg>
);
