import React from "react";
import { aircraftFor, type AircraftId } from "../../domain/aircraft";

interface AircraftProps {
  /** Which aeroplane. An unknown id falls back to the first. */
  id?: AircraftId | string;
  /** Length on screen, in pixels. The height follows from the asset's aspect. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Names the mark for assistive technology. Omitted, it is decorative. */
  title?: string;
}

/**
 * A generic airliner, drawn.
 *
 * This is the net under every image below, and nothing else. It is deliberately
 * a *simplification* rather than a second attempt at any of the three
 * illustrations: it exists so that a missing or undecodable asset renders an
 * aeroplane instead of a broken image, and a detailed reproduction that only
 * ever appears in a failure case is code nobody reads again.
 *
 * Nose right, like the artwork, so a fallback does not fly backwards.
 */
export const AircraftGlyph: React.FC<AircraftProps & { fill?: string }> = ({
  size = 64,
  className = "",
  style,
  title,
  fill = "currentColor",
}) => (
  <svg
    viewBox="0 0 128 64"
    width={size}
    height={size / 2}
    className={className}
    style={style}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    fill={fill}
  >
    {/* Fuselage: rounded nose at the right, tapering cone at the left. */}
    <path d="M6 32 L20 27.5 L108 26.6 C120 26.6 126 29 126 32 C126 35 120 37.4 108 37.4 L20 36.5 Z" />
    {/* Wing, swept back from a root at 60% of the length. */}
    <path d="M78 29 L44 6 L37 8 L58 30 Z" />
    <path d="M78 35 L44 58 L37 56 L58 34 Z" />
    {/* Tailplane. */}
    <path d="M24 29.5 L12 15 L8 17 L18 30.6 Z" />
    <path d="M24 34.5 L12 49 L8 47 L18 33.4 Z" />
    {/* Engines, slung ahead of the leading edge. */}
    <rect x="60" y="12" width="16" height="7" rx="3.5" />
    <rect x="60" y="45" width="16" height="7" rx="3.5" />
  </svg>
);

/**
 * The full-colour illustration.
 *
 * Rendered directly rather than probed first: it ships with the build, so
 * waiting for a probe to succeed would show the drawing and then replace it —
 * a visible swap on the loading screen, which is the one place this appears
 * before anything else has painted. `onError` catches the case that matters.
 */
export const AircraftArt: React.FC<AircraftProps> = ({ id, size = 180, className = "", style, title }) => {
  const craft = aircraftFor(id);
  const [failed, setFailed] = React.useState(false);
  // Reset when the aircraft changes, so choosing a different one recovers from
  // a previous failure instead of staying on the fallback for the session.
  React.useEffect(() => setFailed(false), [craft.id]);

  if (failed) return <AircraftGlyph size={size} className={className} style={style} title={title} />;

  return (
    <img
      src={craft.art}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      // Both dimensions are set from the asset's real aspect, so nothing
      // reflows as it decodes.
      width={Math.round(size)}
      height={Math.round(size / craft.aspect)}
      className={className}
      style={{ display: "block", ...style }}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};

/**
 * The flat white silhouette, for the tab transition.
 *
 * White is baked into the asset rather than applied as a filter: `filter:
 * brightness(0) invert(1)` on an image is a per-frame composite of a bitmap,
 * and this one is animated across the whole viewport on every navigation.
 */
export const AircraftSilhouette: React.FC<AircraftProps> = ({ id, size = 30, className = "", style, title }) => {
  const craft = aircraftFor(id);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [craft.id]);

  if (failed) return <AircraftGlyph size={size} className={className} style={style} title={title} fill="#FFFFFF" />;

  return (
    <img
      src={craft.silhouette}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={Math.round(size)}
      height={Math.round(size / craft.aspect)}
      className={className}
      style={{ display: "block", ...style }}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};
