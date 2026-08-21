import React from "react";

/**
 * The application's identity mark: the A350 fin the owner supplied.
 *
 * **One reference, in one place.** The artwork is named exactly once, here, so
 * replacing it later is editing a single string rather than hunting through the
 * sidebar, the sign-in card and whatever else grew a copy. The master is
 * `assets/brand/air-france-fin.jpg`; `scripts/build-icons.mjs` derives this
 * file and every favicon size beside it.
 *
 * This one is the *cropped* framing — the artwork's own margin is right for a
 * home-screen icon and wrong at the 30px this renders at, where it would spend
 * a quarter of the tile on empty navy.
 */
export const FIN_ASSET_PATH = "/brand/fin.png";

interface FinMarkProps {
  size?: number;
  className?: string;
  /** Names the mark for assistive technology. Omitted, it is decorative. */
  title?: string;
}

/**
 * The mark, with a drawn net under it.
 *
 * The file ships with the build, so it is rendered directly rather than probed
 * first: waiting for a probe would show the fallback and then replace it, and
 * this appears in the shell's top-left corner where a visible swap is the first
 * thing anyone sees. If the file is ever missing or fails to decode, `onError`
 * falls back to the inline drawing below — so the application cannot render a
 * broken image in place of its own logo.
 */
export const FinMark: React.FC<FinMarkProps> = ({ size = 26, className = "", title }) => {
  const [failed, setFailed] = React.useState(false);

  if (failed) return <FinGlyph size={size} className={className} title={title} />;

  return (
    <img
      src={FIN_ASSET_PATH}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={size}
      height={size}
      className={className}
      // Both dimensions are set so nothing reflows while it loads; the artwork
      // is square.
      style={{ display: "block", objectFit: "contain" }}
      onError={() => setFailed(true)}
    />
  );
};

/**
 * The same silhouette, drawn inline.
 *
 * Deliberately a *simplification* rather than a second attempt at the artwork:
 * it exists to be legible when the real file is unavailable, and a detailed
 * reproduction that only ever appears in a failure case is code nobody looks at
 * again. Swept fin, navy band, red outline — the three things that make the
 * shape recognisable at any size.
 */
export const FinGlyph: React.FC<FinMarkProps> = ({ size = 26, className = "", title }) => (
  <svg
    viewBox="50 43 410 410"
    width={size}
    height={size}
    className={className}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <rect x="50" y="43" width="410" height="410" fill="#14264F" />
    <path
      d="M74 404 L322 92 Q328 84 340 84 L430 84 Q444 84 441 96 L358 404 Q356 412 346 412 L82 412 Q70 412 74 404 Z"
      fill="#F4F7FC"
    />
    <path d="M97.5 431.2 L560.2 -150.9 L608.7 -112.3 L146 469.8 Z" fill="#0E2350" />
    <path d="M310.6 412 L420.7 273.6 L355.8 412 Z" fill="#E4002B" />
    <path
      d="M74 404 L322 92 Q328 84 340 84 L430 84 Q444 84 441 96 L358 404 Q356 412 346 412 L82 412 Q70 412 74 404 Z"
      fill="none"
      stroke="#E4002B"
      strokeWidth="18"
      strokeLinejoin="round"
    />
  </svg>
);
