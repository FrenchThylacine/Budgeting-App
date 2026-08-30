import React from "react";

/**
 * The application's identity mark.
 *
 * **One reference, in one place.** The artwork is named exactly once, here, so
 * replacing it later is editing a single string rather than hunting through the
 * sidebar, the sign-in card and whatever else grew a copy. The master is
 * `assets/brand/app-icon-source.jpg`; `scripts/build-icons.mjs` cleans it and
 * derives this file and every favicon size beside it.
 */
export const APP_MARK_PATH = "/brand/app-mark.png";

interface AppMarkProps {
  size?: number;
  className?: string;
  /** Names the mark for assistive technology. Omitted, it is decorative. */
  title?: string;
}

/**
 * The mark, with a drawn net under it.
 *
 * Rendered directly rather than probed: the file ships with the build, and this
 * appears in the shell's top-left corner where showing a fallback and then
 * swapping it is the first thing anyone would see. `onError` covers the case
 * that actually matters — a missing or undecodable file — so the application
 * can never render a broken image in place of its own logo.
 */
export const AppMark: React.FC<AppMarkProps> = ({ size = 28, className = "", title }) => {
  const [failed, setFailed] = React.useState(false);

  if (failed) return <AppGlyph size={size} className={className} title={title} />;

  return (
    <img
      src={APP_MARK_PATH}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={size}
      height={size}
      className={className}
      style={{ display: "block", objectFit: "contain" }}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};

/**
 * The same idea, drawn inline: a navy badge under a tricolour band, with the
 * euro sign the mark is built around.
 *
 * Deliberately not a reproduction of the illustration. Three things make the
 * mark recognisable at any size — the rounded navy tile, the flag along its
 * top, and the red € — and those are the three things here.
 */
export const AppGlyph: React.FC<AppMarkProps> = ({ size = 28, className = "", title }) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    className={className}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <defs>
      <clipPath id="app-glyph-tile">
        <rect x="3" y="3" width="58" height="58" rx="14" />
      </clipPath>
    </defs>
    <rect x="3" y="3" width="58" height="58" rx="14" fill="#13294F" stroke="#FFFFFF" strokeWidth="3" />
    <g clipPath="url(#app-glyph-tile)">
      <rect x="3" y="3" width="19.4" height="9" fill="#1F2E6E" />
      <rect x="22.4" y="3" width="19.2" height="9" fill="#F4F7FC" />
      <rect x="41.6" y="3" width="19.4" height="9" fill="#E4002B" />
    </g>
    <text
      x="32"
      y="46"
      textAnchor="middle"
      fontSize="38"
      fontWeight="700"
      fontFamily="Georgia, 'Times New Roman', serif"
      fill="#D81F2A"
    >
      €
    </text>
  </svg>
);
