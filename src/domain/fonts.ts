/**
 * The typeface, as a choice
 * =========================
 *
 * One variable does the whole job. Every rule in this application's stylesheets
 * that names a family names `--font-sans` — there is exactly one exception, the
 * error screen's stack trace, which is monospace because a stack trace is — so
 * overriding that token changes headings, labels, figures, forms, popovers, the
 * navigation and the report together. That is not luck; it is why the token
 * exists, and it is what makes "do not let one component fall back to
 * monospace" a property of the architecture rather than a thing to check.
 *
 * ─── Why these ───────────────────────────────────────────────────────────────
 *
 * Every stack ends in a generic family and contains only fonts that ship with
 * Windows, macOS or a common Linux distribution. Nothing is downloaded: a
 * budget should not wait on a font server, and a typeface that arrives late
 * reflows the page under the reader.
 *
 * The stacks are deliberately long. "Comic Sans MS" is not on a Mac by
 * default and "Chalkboard SE" is; naming both means the *intent* survives
 * rather than the exact file, and the generic at the end means the worst case
 * is the platform's own default rather than nothing.
 *
 * The list is grouped rather than sorted: the system default, then the
 * sans-serifs, the serifs, the two with a voice of their own, and monospace
 * last. Somebody picking a typeface is comparing like with like, and an
 * alphabetical list interleaves Arial with Courier.
 *
 * The first six ids are the original ones and keep their names, because an id
 * is what a saved budget stores. Renaming `grotesque` to `helvetica` would
 * silently reset the font of every reader who had chosen it.
 */

export type FontId =
  | "system"
  | "grotesque"
  | "arial"
  | "verdana"
  | "trebuchet"
  | "tahoma"
  | "serif"
  | "slab"
  | "garamond"
  | "palatino"
  | "rounded"
  | "mono"
  | "courier";

export interface FontOption {
  id: FontId;
  /** Translation key for the name shown in Settings. */
  labelKey: string;
  /** What the option is for, in one clause. */
  hintKey: string;
  stack: string;
}

const SYSTEM_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

export const FONTS: readonly FontOption[] = [
  {
    id: "system",
    labelKey: "font.system",
    hintKey: "font.systemHint",
    stack: SYSTEM_STACK,
  },
  {
    id: "grotesque",
    labelKey: "font.grotesque",
    hintKey: "font.grotesqueHint",
    stack: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
  },
  {
    id: "arial",
    labelKey: "font.arial",
    hintKey: "font.arialHint",
    stack: 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif',
  },
  {
    id: "verdana",
    labelKey: "font.verdana",
    hintKey: "font.verdanaHint",
    stack: 'Verdana, Geneva, "DejaVu Sans", Tahoma, sans-serif',
  },
  {
    id: "trebuchet",
    labelKey: "font.trebuchet",
    hintKey: "font.trebuchetHint",
    stack: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", Tahoma, sans-serif',
  },
  {
    id: "tahoma",
    labelKey: "font.tahoma",
    hintKey: "font.tahomaHint",
    stack: 'Tahoma, Verdana, Geneva, "DejaVu Sans", sans-serif',
  },
  {
    id: "serif",
    labelKey: "font.serif",
    hintKey: "font.serifHint",
    stack: '"Times New Roman", Times, "Liberation Serif", Georgia, serif',
  },
  {
    id: "slab",
    labelKey: "font.slab",
    hintKey: "font.slabHint",
    stack: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
  },
  {
    id: "garamond",
    labelKey: "font.garamond",
    hintKey: "font.garamondHint",
    stack: 'Garamond, "EB Garamond", "Apple Garamond", "Times New Roman", serif',
  },
  {
    id: "palatino",
    labelKey: "font.palatino",
    hintKey: "font.palatinoHint",
    stack: 'Palatino, "Palatino Linotype", "Book Antiqua", "URW Palladio L", serif',
  },
  {
    id: "rounded",
    labelKey: "font.rounded",
    hintKey: "font.roundedHint",
    // The playful one the brief asks for, named twice so the intent survives a
    // platform that has one and not the other.
    stack: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", "Segoe Print", cursive',
  },
  {
    id: "mono",
    labelKey: "font.mono",
    hintKey: "font.monoHint",
    stack: '"SF Mono", SFMono-Regular, ui-monospace, "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "courier",
    labelKey: "font.courier",
    hintKey: "font.courierHint",
    stack: '"Courier New", Courier, "Nimbus Mono PS", monospace',
  },
];

export const DEFAULT_FONT: FontId = "system";

export function fontFor(id: string | undefined): FontOption {
  return FONTS.find((font) => font.id === id) ?? FONTS[0];
}

/**
 * The stack for a chosen font, or `null` when the reader has not chosen.
 *
 * `null` rather than the system stack on purpose: an unset choice must leave
 * the token alone so the stylesheet — and any theme that overrides it — keeps
 * deciding. Writing the default back is how a variable stops being overridable.
 */
export function fontStack(id: string | undefined): string | null {
  if (!id || id === DEFAULT_FONT) return null;
  const found = FONTS.find((font) => font.id === id);
  return found ? found.stack : null;
}

/** The ids, for the server's settings validator. */
export const FONT_IDS: readonly string[] = FONTS.map((font) => font.id);
