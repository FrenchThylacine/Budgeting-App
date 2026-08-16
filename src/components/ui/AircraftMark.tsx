import React from "react";

interface AircraftMarkProps {
  size?: number;
  className?: string;
  /**
   * `livery` paints it white with a navy tail and a red flash.
   * `solid` paints the whole airframe one colour, for small marks where the
   * detail would turn to mush.
   */
  variant?: "livery" | "solid";
  /** Used by `solid`. */
  hull?: string;
  title?: string;
}

/**
 * A twin-aisle airliner seen from above, in a blue-white-red livery.
 *
 * Proportioned after a modern wide-body: a long slender fuselage, a
 * high-sweep wing with an upturned tip, engines slung well forward of the
 * wing on pylons, and a swept tailplane. Those proportions are what make it
 * read as an airliner rather than as a paper plane.
 *
 * Straight edges throughout. An earlier version used bezier curves for the
 * wings and they crossed over themselves — a curve that is one control point
 * away from wrong is not worth the realism at 44 pixels, where the silhouette
 * is all anyone can see.
 *
 * The livery is blue, white and red because that is the identity the app uses.
 * The airline's logo and wordmark are trademarks and are deliberately not
 * drawn; at this size they would be an illegible smudge in any case.
 */
export const AircraftMark: React.FC<AircraftMarkProps> = ({
  size = 64,
  className = "",
  variant = "livery",
  hull = "currentColor",
  title,
}) => {
  const solid = variant === "solid";
  const body = solid ? hull : "#F6F9FF";
  const shade = solid ? hull : "#C9D8EC";
  const navy = solid ? hull : "#002157";
  const red = solid ? hull : "#E4002B";

  return (
    <svg
      viewBox="0 0 120 100"
      width={size}
      height={(size * 100) / 120}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {/* ── Wings ──────────────────────────────────────────────────────────
          Real chord at the root tapering to the tip, and a sweep of roughly
          40°. A wing drawn as a thin blade reads as a dart; the taper is what
          makes it an airliner. */}
      <polygon points="72,46 40,12 34,14 52,47" fill={body} />
      <polygon points="72,54 40,88 34,86 52,53" fill={body} />
      {/* Upturned tips. */}
      <polygon points="40,12 37.5,4 33,6.5 34,14" fill={shade} />
      <polygon points="40,88 37.5,96 33,93.5 34,86" fill={shade} />

      {/* ── Engines ────────────────────────────────────────────────────────
          Slung ahead of the leading edge at roughly 40% span, which is where
          they sit and why the pylon is visible in front of the wing. */}
      <rect x="55" y="29" width="4.5" height="5" fill={shade} />
      <rect x="55" y="66" width="4.5" height="5" fill={shade} />
      <rect x="57" y="25.5" width="17" height="8" rx="4" fill={navy} />
      <rect x="57" y="66.5" width="17" height="8" rx="4" fill={navy} />
      {!solid && (
        <>
          <rect x="70.5" y="25.5" width="3.5" height="8" rx="1.75" fill={shade} />
          <rect x="70.5" y="66.5" width="3.5" height="8" rx="1.75" fill={shade} />
        </>
      )}

      {/* ── Tailplane ──────────────────────────────────────────────────────
          Small, and close to the tail. Oversizing it turns the aircraft into
          a biplane at a glance. */}
      <polygon points="26,47.5 14,33 10.5,35 20,48.4" fill={body} />
      <polygon points="26,52.5 14,67 10.5,65 20,51.6" fill={body} />

      {/* ── Vertical fin, seen from above ─────────────────────────────────
          Edge-on from directly above, so it is drawn as a slim swept shape
          rather than a broad triangle. The navy and the red flash are the
          whole livery, in the one place this view can show it. */}
      <polygon points="30,50 11,44.5 8,50 11,55.5" fill={navy} />
      {!solid && <polygon points="24,50 14.5,47.4 13,50 14.5,52.6" fill={red} />}

      {/* ── Fuselage ──────────────────────────────────────────────────────
          Rounded nose, tapering tail cone. Drawn last so it sits over the
          wing roots, which is what it does. */}
      <path
        d="M12 50 L20 45.6 L96 44.6 C106 44.6 111 47 111 50 C111 53 106 55.4 96 55.4 L20 54.4 Z"
        fill={body}
      />
      {/* A darker strip along the lower edge, so the tube reads as round. */}
      <path
        d="M20 54.4 L96 55.4 C104 55.4 108.5 53.8 110.2 52 C107.5 53 102 53.6 96 53.6 L20 52.8 Z"
        fill={shade}
        opacity="0.8"
      />

      {!solid && (
        <>
          {/* Cheatline and flight deck: two touches, which is all this size
              can carry without becoming noise. */}
          <rect x="30" y="48.4" width="72" height="1.5" rx="0.75" fill={navy} opacity="0.9" />
          <rect x="30" y="50.6" width="66" height="1.1" rx="0.55" fill={red} opacity="0.85" />
          <path d="M104 46.4 C108 47.2 110.4 48.6 111 50 C110.4 51.4 108 52.8 104 53.6 Z" fill={navy} opacity="0.6" />
        </>
      )}
    </svg>
  );
};
