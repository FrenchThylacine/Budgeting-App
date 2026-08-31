import {
  contrast,
  luminance,
  fadeToContrast,
  inkFor,
  mix,
  parseHex,
  reachContrast,
  toHex,
  type Rgb,
} from "./colour";
import { CUSTOM_THEME_ID, themeFor, type ThemePreset, type ThemeTokens } from "./theme";

/**
 * A theme the reader builds, that cannot be unreadable
 * ====================================================
 *
 * The six presets ship with their contrast measured by a test. A theme
 * somebody invents in Settings has no such test, and the obvious two answers
 * are both bad: let them choose every token and watch grey text land on a grey
 * card, or refuse the colours that would and hand back a picker that fights
 * them.
 *
 * So they choose **three things that carry the character** — the page, the
 * cards, and the accent — and every remaining token is *derived*, by walking
 * toward the ink until the contrast ratio clears its floor. The blue they
 * picked stays the blue they picked; the words on it are legible because they
 * were computed to be.
 *
 * Fourteen tokens from three choices, and the eleven derived ones are:
 *
 *  - the two remaining grounds, between the page and the cards;
 *  - three text shades, a ramp made by *fading* toward the ground rather than
 *    by darkening — three shades of near-black is not a hierarchy;
 *  - three borders and a separator, faded further still;
 *  - the accent's hover, its soft fill, and the ink that goes on top of it.
 *
 * Light and dark are the same derivation run twice: which direction "toward
 * the ink" points is decided by the reader's own background, so a dark page
 * derives light text without being told which mode it is in.
 */

/** What the reader actually chooses. Everything else follows from these. */
export interface CustomThemeChoice {
  /** The page behind everything. */
  background: string;
  /** Cards, sheets, the raised surfaces. */
  surface: string;
  /** Buttons, links, the selected state. */
  accent: string;
}

/**
 * The default the picker opens on.
 *
 * The application's own light theme, so the first thing the reader sees when
 * they open the custom pickers is what they were already looking at — and the
 * first colour they change is a deliberate change rather than a reset.
 */
export const DEFAULT_CUSTOM_THEME: CustomThemeChoice = {
  background: "#F4F6FB",
  surface: "#FFFFFF",
  accent: "#1D6FE0",
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * A stored custom theme, or the default.
 *
 * Settings arrive as JSON from a server, so this is a boundary: anything that
 * is not three hex colours is not a theme, and the safe answer is the default
 * rather than a page painted with whatever the string happened to be.
 */
export function sanitiseCustomTheme(value: unknown): CustomThemeChoice {
  if (!value || typeof value !== "object") return DEFAULT_CUSTOM_THEME;
  const record = value as Record<string, unknown>;
  const pick = (key: keyof CustomThemeChoice) => {
    const candidate = record[key];
    return typeof candidate === "string" && HEX.test(candidate.trim())
      ? candidate.trim()
      : DEFAULT_CUSTOM_THEME[key];
  };
  return { background: pick("background"), surface: pick("surface"), accent: pick("accent") };
}

/**
 * Contrast floors, and why each one is what it is.
 *
 * AA for body text is 4.5:1 and AA for large text and UI components is 3:1.
 * Primary text is held to 7:1 — AAA — because it carries the figures somebody
 * is making a decision from, and because a ramp needs headroom above the floor
 * or its three shades collapse into one.
 */
const PRIMARY_RATIO = 7;
const SECONDARY_RATIO = 4.8;
const TERTIARY_RATIO = 4.5;
/*
 * 4.5, not 3.
 *
 * 3:1 is the AA floor for a *UI component* — an outline, a filled bar — and
 * the accent is used for those. It is also used as **text**: a section
 * heading, the count on the active tab, a link. The browser check found six
 * such nodes at 2.83, so the accent is held to the text ratio, which costs a
 * little saturation and buys the difference between a legible heading and a
 * decorative one.
 */
const ACCENT_RATIO = 4.5;
const BORDER_RATIO = 1.25;
const STRONG_BORDER_RATIO = 1.6;

/**
 * Build the fourteen tokens from the three choices.
 *
 * Every text ratio is measured against the **least forgiving** ground, not
 * against the page: text sits on cards and inset wells too, and a shade that
 * clears 4.5 on the page and 3.9 on a card is a shade that fails where it is
 * mostly read.
 */
export function customThemeTokens(choice: CustomThemeChoice): ThemeTokens {
  const background = parseHex(choice.background) ?? parseHex(DEFAULT_CUSTOM_THEME.background)!;
  const surface = parseHex(choice.surface) ?? parseHex(DEFAULT_CUSTOM_THEME.surface)!;
  const accent = parseHex(choice.accent) ?? parseHex(DEFAULT_CUSTOM_THEME.accent)!;

  const ink = inkFor(background);

  /*
   * The four grounds.
   *
   * Subtle sits between the page and a card; inset is a well, one step past
   * the page *away* from the card, so a field looks recessed on a light theme
   * and on a dark one without either being special-cased.
   */
  const subtle = mix(background, surface, 0.5);
  const inset = mix(background, ink, 0.05);
  const grounds = [background, surface, subtle, inset];

  /** The worst case among every surface text can land on. */
  const against = (colour: Rgb, ratio: number) =>
    grounds.reduce((worst, ground) => reachContrast(worst, ground, ratio, ink), colour);

  /*
   * The ink is tinted with the accent before it is pushed to its ratio.
   *
   * Pure black text on a green page is a browser default, not a theme. Every
   * shipped preset uses a near-black carrying a trace of its own hue — plum's
   * is `#1B1229` — and a twelfth of the accent produces the same effect from
   * the reader's colour. The push to 7:1 happens afterwards, so the tint can
   * never cost contrast.
   */
  const primary = against(mix(ink, accent, 0.12), PRIMARY_RATIO);
  // Faded toward the page rather than darkened: the ramp has to be visible.
  const secondary = grounds.reduce(
    (shade, ground) => (contrast(shade, ground) < SECONDARY_RATIO ? reachContrast(shade, ground, SECONDARY_RATIO, ink) : shade),
    fadeToContrast(primary, background, SECONDARY_RATIO),
  );
  const tertiary = grounds.reduce(
    (shade, ground) => (contrast(shade, ground) < TERTIARY_RATIO ? reachContrast(shade, ground, TERTIARY_RATIO, ink) : shade),
    fadeToContrast(primary, background, TERTIARY_RATIO),
  );

  /*
   * Borders are not text and must not be held to a text ratio — a 4.5:1 border
   * is a black box around every card. They are faded until they are just
   * visible, which is what a border is for.
   */
  const border = fadeToContrast(primary, background, BORDER_RATIO);
  const borderStrong = fadeToContrast(primary, background, STRONG_BORDER_RATIO);
  const separator = fadeToContrast(primary, background, 1.15);

  /*
   * The accent has two jobs and therefore two derived forms: it fills buttons
   * (so the ink on top of it must be readable) and it tints text and outlines
   * (so it must clear 3:1 on every ground). The reader's colour is used as-is
   * whenever it already does both.
   */
  /*
   * The soft fill first, because the accent has to be readable *on* it.
   *
   * An accent-tinted chip with accent-coloured text is a shape this
   * application uses in several places — the active tab's count, a section
   * heading's badge — and it is the pair the browser check caught: a #323217
   * accent on a #757571 chip is 2.83:1. Deriving the fill from the reader's
   * raw accent and then pushing the accent against it closes the loop.
   */
  const accentSoft = mix(background, accent, 0.14);
  const accentUsable = [...grounds, accentSoft].reduce(
    (colour, ground) => reachContrast(colour, ground, ACCENT_RATIO, ink),
    accent,
  );
  const accentContrast = reachContrast(inkFor(accentUsable), accentUsable, 4.5);
  const accentHover = mix(accentUsable, ink, 0.18);

  return {
    "--bg": toHex(background),
    "--bg-elevated": toHex(surface),
    "--bg-subtle": toHex(subtle),
    "--bg-inset": toHex(inset),
    "--text-primary": toHex(primary),
    "--text-secondary": toHex(secondary),
    "--text-tertiary": toHex(tertiary),
    "--border": toHex(border),
    "--border-strong": toHex(borderStrong),
    "--separator": toHex(separator),
    "--accent": toHex(accentUsable),
    "--accent-soft": toHex(accentSoft),
    "--accent-hover": toHex(accentHover),
    "--accent-contrast": toHex(accentContrast),
  };
}

/**
 * Three swatches for the theme picker's tile.
 *
 * The same three the reader chose, in the same order every other preset uses:
 * ground, surface, accent.
 */
export function customThemeSwatch(choice: CustomThemeChoice): [string, string, string] {
  const tokens = customThemeTokens(choice);
  return [tokens["--bg"], tokens["--bg-elevated"], tokens["--accent"]];
}


/**
 * The reader's theme, in the shape everything else already understands.
 *
 * A `ThemePreset` like the ten that ship, so `applyTheme`, the picker tile and
 * the printed report need to know nothing about where its colours came from.
 *
 * `light` and `dark` hold the same palette, and `darkOnly` is set when the
 * chosen background is a dark one. That is not a limitation worked around: the
 * reader picked *one* background, so there is one scheme, and inventing a
 * second palette they never chose is exactly what "Deep black" refuses to do
 * in the other direction. Which scheme it is follows from their colour — a
 * dark page derives light text without anybody setting a switch.
 */
export function customThemePreset(choice: CustomThemeChoice): ThemePreset {
  const tokens = customThemeTokens(choice);
  const background = parseHex(tokens["--bg"])!;
  return {
    id: CUSTOM_THEME_ID,
    labelKey: "theme.custom",
    /*
     * The scheme follows the **ink**, not a luminance cut-off.
     *
     * These two disagree in the middle of the range, and the browser check
     * caught it: a mid grey page sits at 0.216 luminance — "dark" by a
     * cut-off — while black is the ink that reads on it. The application duly
     * switched to the dark scheme and put the dark-scheme status colours,
     * which are pale, next to dark derived text. Forty text nodes failed AA.
     * The ink is the answer to the same question, and it is the one the rest
     * of this file already uses.
     */
    darkOnly: toHex(inkFor(background)) === "#ffffff",
    swatch: [tokens["--bg"], tokens["--bg-elevated"], tokens["--accent"]],
    light: tokens,
    dark: tokens,
  };
}

/**
 * The theme to paint, given what the reader has chosen.
 *
 * One place where "custom" is turned into a palette, so no caller has to
 * remember that one of the eleven ids is not in `THEME_PRESETS`. Everything
 * that paints — the application, the picker, the printed report — goes through
 * here and gets a `ThemePreset` either way.
 */
export function resolveThemePreset(themePreset: string | null | undefined, customTheme: unknown): ThemePreset {
  if (themePreset === CUSTOM_THEME_ID) return customThemePreset(sanitiseCustomTheme(customTheme));
  return themeFor(themePreset);
}

/**
 * The status colours, re-shaded for a theme the reader built.
 *
 * The application's own rule is that a red meaning "over budget" means that in
 * every theme: the hue belongs to the status, not to the theme. But the *shade*
 * cannot: the shipped greens and ambers come in a light set and a dark set, and
 * a page somebody chose is not obliged to be either. On a mid grey both sets
 * fail — the light ones are too dark to separate, the pale ones too light.
 *
 * So the hue is kept and the shade is computed, exactly as every other token
 * here is. Each colour is pushed toward the theme's ink until it clears 4.5:1
 * on the least forgiving surface, which leaves a recognisable green recognisably
 * green and legible on the page it is actually printed on.
 *
 * Returned as a variable map, applied after `applyTheme` for the same reason the
 * reader's own status colours are: the last write wins, and this must be it.
 */
export function customStatusTextTokens(choice: CustomThemeChoice): Record<string, string> {
  const tokens = customThemeTokens(choice);
  const grounds = [
    parseHex(tokens["--bg"])!,
    parseHex(tokens["--bg-elevated"])!,
    parseHex(tokens["--bg-subtle"])!,
    parseHex(tokens["--bg-inset"])!,
  ];
  const ink = inkFor(grounds[0]);

  const readable = (hex: string) => {
    const colour = parseHex(hex);
    if (!colour) return hex;
    /*
     * Against the four surfaces *and* against this status's own soft fill.
     *
     * Every one of these colours appears as text inside a chip tinted with
     * itself — an "over budget" pill, a funding badge — and a shade measured
     * only against the page is a shade that fails inside its own chip. The
     * fill is built with the same recipe the stylesheet uses, a seventh of the
     * hue over the ground.
     */
    const soft = mix(grounds[0], colour, 0.14);
    return toHex(
      [...grounds, soft].reduce((shade, ground) => reachContrast(shade, ground, 4.5, ink), colour),
    );
  };

  /*
   * The hues, taken from the light set. Which set they come from does not
   * matter — the shade is recomputed either way — and taking them from one
   * place means there is one list to keep in step with the stylesheet.
   */
  const HUES: Record<string, string> = {
    "--success-text": "#0F6B39",
    "--warning-text": "#9A4A08",
    "--danger-text": "#B3261E",
    "--purple-text": "#7C3AED",
    "--teal-text": "#0E7490",
    "--funding-other-text": "#1A5FBF",
    // The three cadence colours, which are the same shape: a hue on a chip
    // tinted with itself. The browser check found the session-pack one at
    // 1.86:1 on a mid grey page.
    "--cadence-recurring": "#3F5C93",
    "--cadence-counted": "#4E5A70",
    "--cadence-once": "#59606E",
  };

  const variables: Record<string, string> = {};
  for (const [name, hue] of Object.entries(HUES)) variables[name] = readable(hue);

  /*
   * The chips those three sit in.
   *
   * Shipped as `rgba(…, 0.12)` over whichever ground happens to be behind
   * them, which is a fill nobody can measure in advance. Here they are solid
   * mixes over the reader's page, so the pair — the hue and the chip it is
   * printed on — is the pair that was measured above.
   */
  for (const cadence of ["recurring", "counted", "once"]) {
    const hue = parseHex(HUES[`--cadence-${cadence}`])!;
    variables[`--cadence-${cadence}-soft`] = toHex(mix(grounds[0], hue, 0.14));
  }
  // Outside-budget follows warning, as it does in the stylesheet.
  variables["--funding-outside-text"] = variables["--warning-text"];
  // Personal follows the accent, which is already derived and already safe.
  variables["--funding-personal-text"] = tokens["--accent"];
  return variables;
}
