import { FUNDING_KINDS, type FundingKind } from "./funding";

/**
 * The three status colours, and the one place they are turned into CSS
 * =====================================================================
 *
 * Who paid is the application's most-used visual state: it colours a figure on
 * a row, a segment of a bar, a slice of a donut, a column in the report. The
 * brief asks for it to be the reader's choice — some people cannot tell this
 * blue from that one, and some simply want their own.
 *
 * Two rules make that safe rather than a way to make the interface unreadable:
 *
 *  - **A chosen colour is a *fill*, never text.** The colour somebody picks is
 *    used for shapes — bar segments, donut arcs, glyphs on a tinted ground —
 *    and the *text* variant is derived from it by mixing toward the theme's own
 *    foreground. On a light theme that darkens it and on a dark theme it
 *    lightens it, so a pale yellow becomes readable text rather than invisible
 *    text. A browser without `color-mix` drops the declaration and inherits the
 *    theme's text colour, which is readable by definition.
 *  - **One derivation, two consumers.** The application and the printed report
 *    both need these as CSS. They get them from this function, so a report
 *    cannot end up using last month's palette — the kind of drift that has
 *    already cost this codebase a preview that lied and three copies of one
 *    badge.
 *
 * There is no table of defaults here on purpose. An unset kind is whatever the
 * active theme defines, and the picker reads that off the page rather than
 * keeping a second copy of every theme's palette in a second place.
 */

export type StatusColours = Partial<Record<FundingKind, string>>;

/** A six-digit hex colour, which is what an `<input type="color">` produces. */
export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Only the entries that are real colours, so a bad value cannot reach the CSS. */
export function sanitiseStatusColours(value: unknown): StatusColours {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const clean: StatusColours = {};
  for (const kind of FUNDING_KINDS) {
    if (isHexColour(source[kind])) clean[kind] = source[kind] as string;
  }
  return clean;
}

/**
 * Text that stays readable on the page's own background.
 *
 * Mixing toward the theme's foreground rather than picking black or white: the
 * result keeps the hue the reader chose, which is the point of choosing it.
 */
export function readableInk(colour: string): string {
  return `color-mix(in srgb, ${colour} 74%, var(--text-primary))`;
}

/** The same colour at low opacity, for a chip's ground. */
export function softFill(colour: string): string {
  return `color-mix(in srgb, ${colour} 16%, transparent)`;
}

/**
 * The custom properties for a set of chosen colours.
 *
 * Returns only the ones actually chosen, so an unset kind keeps whatever the
 * theme defines — themes are data here, and overriding a variable with its own
 * value is how a theme silently stops being switchable.
 */
export function statusColourVariables(colours: StatusColours): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const kind of FUNDING_KINDS) {
    const chosen = colours[kind];
    if (!isHexColour(chosen)) continue;
    variables[`--funding-${kind}`] = chosen;
    variables[`--funding-${kind}-text`] = readableInk(chosen);
    variables[`--funding-${kind}-soft`] = softFill(chosen);
  }
  return variables;
}

/** The same thing as a CSS declaration block, for the report's own stylesheet. */
export function statusColourCss(colours: StatusColours): string {
  return Object.entries(statusColourVariables(colours))
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}
