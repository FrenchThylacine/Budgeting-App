/**
 * Theme presets
 * =============
 *
 * A preset is a small map of CSS custom properties applied to the root element.
 * Not a stylesheet per theme, and not a class per theme, for one reason that
 * matters more than either: **the values are data, so they can be measured.**
 * `tests/theme-contrast.test.ts` walks every preset in both appearances and
 * asserts every text colour clears WCAG AA against every ground it is put on.
 * A theme that destroys contrast is a theme that fails a test, rather than one
 * somebody notices six months later on a laptop in daylight.
 *
 * The stylesheet still carries the default theme's tokens, so the application
 * paints correctly before any JavaScript runs and before a preference has been
 * loaded. `tests/theme-contrast.test.ts` also asserts that the `airfrance`
 * preset below and the stylesheet agree, so the two copies cannot drift.
 *
 * Only tokens that define *character* are overridden: the surfaces, the text
 * ramp, the accent and its contrast pair. Radii, spacing, type and the status
 * colours are the application's, not the theme's — a red that means "over
 * budget" must mean that in every theme.
 */

export interface ThemeTokens {
  "--bg": string;
  "--bg-elevated": string;
  "--bg-subtle": string;
  "--bg-inset": string;
  "--text-primary": string;
  "--text-secondary": string;
  "--text-tertiary": string;
  "--border": string;
  "--border-strong": string;
  "--separator": string;
  "--accent": string;
  "--accent-soft": string;
  "--accent-hover": string;
  "--accent-contrast": string;
}

export interface ThemePreset {
  id: string;
  /** Translation key for the name shown in Settings. */
  labelKey: string;
  /**
   * Some themes only make sense one way round.
   *
   * "Deep black" is an OLED theme: its whole point is that the background is
   * the absence of light. There is no light version of that idea, and inventing
   * one would produce a seventh theme wearing the sixth one's name. The
   * appearance control says so rather than silently ignoring the choice.
   *
   * The theme the reader builds is the same situation arrived at differently:
   * they chose one background, so there is one scheme, and which one it is
   * follows from the colour they picked rather than from a switch.
   */
  darkOnly?: boolean;
  /** Three colours for the picker: ground, surface, accent. */
  swatch: [string, string, string];
  light: ThemeTokens;
  dark: ThemeTokens;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    /*
     * The default, and the identity the application was built around: deep navy
     * ink, the signature red kept as a mark rather than as an interactive
     * colour. These values are the ones in `styles.css`; the test keeps them
     * that way.
     */
    id: "airfrance",
    labelKey: "theme.airfrance",
    swatch: ["#F2F4F7", "#FFFFFF", "#002157"],
    light: {
      "--bg": "#F2F4F7",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#F8F9FB",
      "--bg-inset": "#E8ECF2",
      "--text-primary": "#0B1B33",
      "--text-secondary": "#4A5769",
      "--text-tertiary": "#606B7A",
      "--border": "rgba(11, 27, 51, 0.08)",
      "--border-strong": "rgba(11, 27, 51, 0.14)",
      "--separator": "rgba(11, 27, 51, 0.05)",
      "--accent": "#002157",
      "--accent-soft": "rgba(0, 33, 87, 0.08)",
      "--accent-hover": "#003C8F",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#080D17",
      "--bg-elevated": "#121A28",
      "--bg-subtle": "#0D1421",
      "--bg-inset": "#1A2434",
      "--text-primary": "#EEF2F8",
      "--text-secondary": "#93A1B8",
      "--text-tertiary": "#8B98AD",
      "--border": "rgba(255, 255, 255, 0.09)",
      "--border-strong": "rgba(255, 255, 255, 0.16)",
      "--separator": "rgba(255, 255, 255, 0.06)",
      "--accent": "#6BA5FF",
      "--accent-soft": "rgba(107, 165, 255, 0.16)",
      "--accent-hover": "#8CBAFF",
      "--accent-contrast": "#08101F",
    },
  },
  {
    /*
     * The livery of the aircraft on the icon: warm white, carbon, and the
     * orange flash along the wing.
     */
    id: "concorde",
    labelKey: "theme.concorde",
    swatch: ["#F6F3EF", "#FFFFFF", "#A8480B"],
    light: {
      "--bg": "#F6F3EF",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#FBF9F6",
      "--bg-inset": "#EDE7E0",
      "--text-primary": "#1B1815",
      "--text-secondary": "#514B44",
      "--text-tertiary": "#655D54",
      "--border": "rgba(27, 24, 21, 0.09)",
      "--border-strong": "rgba(27, 24, 21, 0.16)",
      "--separator": "rgba(27, 24, 21, 0.06)",
      "--accent": "#A8480B",
      "--accent-soft": "rgba(168, 72, 11, 0.10)",
      "--accent-hover": "#C25610",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#12100E",
      "--bg-elevated": "#1E1B18",
      "--bg-subtle": "#171412",
      "--bg-inset": "#2A2520",
      "--text-primary": "#F6F2ED",
      "--text-secondary": "#B3A99C",
      "--text-tertiary": "#A79C8E",
      "--border": "rgba(255, 246, 235, 0.10)",
      "--border-strong": "rgba(255, 246, 235, 0.18)",
      "--separator": "rgba(255, 246, 235, 0.06)",
      "--accent": "#F58A3C",
      "--accent-soft": "rgba(245, 138, 60, 0.16)",
      "--accent-hover": "#FFA663",
      "--accent-contrast": "#1B1004",
    },
  },
  {
    /*
     * Nothing but paper and ink. No hue anywhere the application does not need
     * one, so the numbers and the status colours are the only colour on screen.
     */
    id: "paper",
    labelKey: "theme.paper",
    swatch: ["#FFFFFF", "#FFFFFF", "#1C1C1F"],
    light: {
      "--bg": "#FAFAFA",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#FCFCFC",
      "--bg-inset": "#F1F1F2",
      "--text-primary": "#18181B",
      "--text-secondary": "#4B4B52",
      "--text-tertiary": "#5F5F67",
      "--border": "rgba(0, 0, 0, 0.10)",
      "--border-strong": "rgba(0, 0, 0, 0.18)",
      "--separator": "rgba(0, 0, 0, 0.06)",
      "--accent": "#1C1C1F",
      "--accent-soft": "rgba(28, 28, 31, 0.07)",
      "--accent-hover": "#38383E",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#161618",
      "--bg-elevated": "#1F1F22",
      "--bg-subtle": "#1A1A1C",
      "--bg-inset": "#2A2A2E",
      "--text-primary": "#F4F4F5",
      "--text-secondary": "#A9A9B2",
      "--text-tertiary": "#9E9EA7",
      "--border": "rgba(255, 255, 255, 0.10)",
      "--border-strong": "rgba(255, 255, 255, 0.18)",
      "--separator": "rgba(255, 255, 255, 0.06)",
      "--accent": "#E8E8EA",
      "--accent-soft": "rgba(232, 232, 234, 0.12)",
      "--accent-hover": "#FFFFFF",
      "--accent-contrast": "#161618",
    },
  },
  {
    id: "midnight",
    labelKey: "theme.midnight",
    darkOnly: true,
    swatch: ["#000000", "#0B0B0F", "#5B9DFF"],
    // A dark-only theme still declares a light map: the type demands it, and a
    // caller that forces the wrong appearance gets something readable rather
    // than an empty map and the previous theme's leftovers.
    light: {
      "--bg": "#000000",
      "--bg-elevated": "#0B0B0F",
      "--bg-subtle": "#050508",
      "--bg-inset": "#16161C",
      "--text-primary": "#FFFFFF",
      "--text-secondary": "#A3A3AE",
      "--text-tertiary": "#9797A2",
      "--border": "rgba(255, 255, 255, 0.12)",
      "--border-strong": "rgba(255, 255, 255, 0.22)",
      "--separator": "rgba(255, 255, 255, 0.07)",
      "--accent": "#5B9DFF",
      "--accent-soft": "rgba(91, 157, 255, 0.16)",
      "--accent-hover": "#85B6FF",
      "--accent-contrast": "#00060F",
    },
    dark: {
      "--bg": "#000000",
      "--bg-elevated": "#0B0B0F",
      "--bg-subtle": "#050508",
      "--bg-inset": "#16161C",
      "--text-primary": "#FFFFFF",
      "--text-secondary": "#A3A3AE",
      "--text-tertiary": "#9797A2",
      "--border": "rgba(255, 255, 255, 0.12)",
      "--border-strong": "rgba(255, 255, 255, 0.22)",
      "--separator": "rgba(255, 255, 255, 0.07)",
      "--accent": "#5B9DFF",
      "--accent-soft": "rgba(91, 157, 255, 0.16)",
      "--accent-hover": "#85B6FF",
      "--accent-contrast": "#00060F",
    },
  },
  {
    id: "alpine",
    labelKey: "theme.alpine",
    swatch: ["#EFF4F5", "#FFFFFF", "#0B6875"],
    light: {
      "--bg": "#EFF4F5",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#F7FAFA",
      "--bg-inset": "#E2EBED",
      "--text-primary": "#0C1F24",
      "--text-secondary": "#3F565C",
      "--text-tertiary": "#4F666C",
      "--border": "rgba(12, 31, 36, 0.09)",
      "--border-strong": "rgba(12, 31, 36, 0.16)",
      "--separator": "rgba(12, 31, 36, 0.05)",
      "--accent": "#0B6875",
      "--accent-soft": "rgba(11, 104, 117, 0.10)",
      "--accent-hover": "#0E8091",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#041417",
      "--bg-elevated": "#0D2226",
      "--bg-subtle": "#081A1D",
      "--bg-inset": "#153036",
      "--text-primary": "#E9F4F6",
      "--text-secondary": "#93AFB5",
      "--text-tertiary": "#8AA6AD",
      "--border": "rgba(226, 245, 248, 0.10)",
      "--border-strong": "rgba(226, 245, 248, 0.18)",
      "--separator": "rgba(226, 245, 248, 0.06)",
      "--accent": "#41C9DC",
      "--accent-soft": "rgba(65, 201, 220, 0.16)",
      "--accent-hover": "#6DDCEC",
      "--accent-contrast": "#03181C",
    },
  },
  {
    id: "plum",
    labelKey: "theme.plum",
    swatch: ["#F5F2FA", "#FFFFFF", "#5B21B6"],
    light: {
      "--bg": "#F5F2FA",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#FAF8FD",
      "--bg-inset": "#EBE5F4",
      "--text-primary": "#1B1229",
      "--text-secondary": "#4E455E",
      "--text-tertiary": "#605670",
      "--border": "rgba(27, 18, 41, 0.09)",
      "--border-strong": "rgba(27, 18, 41, 0.16)",
      "--separator": "rgba(27, 18, 41, 0.05)",
      "--accent": "#5B21B6",
      "--accent-soft": "rgba(91, 33, 182, 0.09)",
      "--accent-hover": "#6D2BD4",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#0D0817",
      "--bg-elevated": "#1A1230",
      "--bg-subtle": "#120C22",
      "--bg-inset": "#261A42",
      "--text-primary": "#F1ECFA",
      "--text-secondary": "#A79BC0",
      "--text-tertiary": "#9E92B8",
      "--border": "rgba(240, 235, 250, 0.10)",
      "--border-strong": "rgba(240, 235, 250, 0.18)",
      "--separator": "rgba(240, 235, 250, 0.06)",
      "--accent": "#B99BFF",
      "--accent-soft": "rgba(185, 155, 255, 0.16)",
      "--accent-hover": "#CDB6FF",
      "--accent-contrast": "#150A28",
    },
  },
  {
    id: "forest",
    labelKey: "theme.forest",
    swatch: ["#F1F6F1", "#FFFFFF", "#1B6E3C"],
    light: {
      "--bg": "#F1F6F1",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#F8FBF8",
      "--bg-inset": "#E5EAE5",
      "--text-primary": "#030D07",
      "--text-secondary": "#5D6560",
      "--text-tertiary": "#636A65",
      "--border": "#D3D9D4",
      "--border-strong": "#BBC2BC",
      "--separator": "#DFE5DF",
      "--accent": "#1B6E3C",
      "--accent-soft": "#D3E3D8",
      "--accent-hover": "#165A31",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#080F0A",
      "--bg-elevated": "#122015",
      "--bg-subtle": "#0D1810",
      "--bg-inset": "#141B16",
      "--text-primary": "#ECFAF1",
      "--text-secondary": "#848E88",
      "--text-tertiary": "#7E8982",
      "--border": "#1F2721",
      "--border-strong": "#303832",
      "--separator": "#19211B",
      "--accent": "#5FD98A",
      "--accent-soft": "#142B1C",
      "--accent-hover": "#7CE09F",
      "--accent-contrast": "#000000",
    },
  },
  {
    id: "ember",
    labelKey: "theme.ember",
    swatch: ["#FBF3EE", "#FFFFFF", "#B5451B"],
    light: {
      "--bg": "#FBF3EE",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#FDF9F7",
      "--bg-inset": "#EEE7E2",
      "--text-primary": "#160803",
      "--text-secondary": "#6C615C",
      "--text-tertiary": "#6E645F",
      "--border": "#DED6D1",
      "--border-strong": "#C7BEB9",
      "--separator": "#EAE1DC",
      "--accent": "#B5451B",
      "--accent-soft": "#F1DBD0",
      "--accent-hover": "#943916",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#140B07",
      "--bg-elevated": "#241511",
      "--bg-subtle": "#1C100C",
      "--bg-inset": "#201713",
      "--text-primary": "#FFF2ED",
      "--text-secondary": "#908581",
      "--text-tertiary": "#8A807B",
      "--border": "#2C221E",
      "--border-strong": "#433935",
      "--separator": "#261C18",
      "--accent": "#FF9466",
      "--accent-soft": "#351E14",
      "--accent-hover": "#FFA782",
      "--accent-contrast": "#000000",
    },
  },
  {
    id: "steel",
    labelKey: "theme.steel",
    swatch: ["#EEF1F4", "#FFFFFF", "#3F5B72"],
    light: {
      "--bg": "#EEF1F4",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#F7F8FA",
      "--bg-inset": "#E2E5E8",
      "--text-primary": "#080B0E",
      "--text-secondary": "#5F6265",
      "--text-tertiary": "#626568",
      "--border": "#D1D4D7",
      "--border-strong": "#BABDC0",
      "--separator": "#DDE0E3",
      "--accent": "#3F5B72",
      "--accent-soft": "#D6DCE2",
      "--accent-hover": "#344B5D",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#0A0E12",
      "--bg-elevated": "#161C23",
      "--bg-subtle": "#10151B",
      "--bg-inset": "#161A1E",
      "--text-primary": "#F2F6FA",
      "--text-secondary": "#84888C",
      "--text-tertiary": "#82868A",
      "--border": "#212529",
      "--border-strong": "#33373B",
      "--separator": "#1B1F23",
      "--accent": "#8FB6D6",
      "--accent-soft": "#1D262D",
      "--accent-hover": "#A3C3DD",
      "--accent-contrast": "#000000",
    },
  },
  {
    id: "graphite",
    labelKey: "theme.graphite",
    swatch: ["#F5F5F5", "#FFFFFF", "#2B2B2B"],
    light: {
      "--bg": "#F5F5F5",
      "--bg-elevated": "#FFFFFF",
      "--bg-subtle": "#FAFAFA",
      "--bg-inset": "#E9E9E9",
      "--text-primary": "#050505",
      "--text-secondary": "#636363",
      "--text-tertiary": "#686868",
      "--border": "#D7D7D7",
      "--border-strong": "#BFBFBF",
      "--separator": "#E3E3E3",
      "--accent": "#2B2B2B",
      "--accent-soft": "#D9D9D9",
      "--accent-hover": "#232323",
      "--accent-contrast": "#FFFFFF",
    },
    dark: {
      "--bg": "#0B0B0B",
      "--bg-elevated": "#181818",
      "--bg-subtle": "#121212",
      "--bg-inset": "#171717",
      "--text-primary": "#FAFAFA",
      "--text-secondary": "#868686",
      "--text-tertiary": "#848484",
      "--border": "#232323",
      "--border-strong": "#353535",
      "--separator": "#1D1D1D",
      "--accent": "#D6D6D6",
      "--accent-soft": "#272727",
      "--accent-hover": "#DDDDDD",
      "--accent-contrast": "#000000",
    },
  },
];

export const DEFAULT_THEME = "airfrance";

/**
 * The id of the theme the reader builds.
 *
 * Not a preset in `THEME_PRESETS`, because its colours do not exist until
 * somebody chooses them — `domain/customTheme.ts` derives the whole palette
 * from three of them. It is listed here so the API can accept the id and the
 * picker can offer the tile beside the ten that ship.
 */
export const CUSTOM_THEME_ID = "custom";
export const THEME_IDS: readonly string[] = [
  ...THEME_PRESETS.map((preset) => preset.id),
  CUSTOM_THEME_ID,
];

export function themeFor(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}

/** How the application chooses between the light and dark maps. */
export type Appearance = "light" | "dark" | "system";
export const APPEARANCES: readonly Appearance[] = ["light", "dark", "system"];

/**
 * Resolve an appearance preference to an actual answer.
 *
 * `system` follows the operating system, which is why this takes the media
 * query result rather than reading it: the caller subscribes to changes, and a
 * function that reads the query itself would answer correctly once and then
 * be wrong for the rest of the session.
 */
export function resolveAppearance(
  appearance: Appearance | undefined,
  darkMode: boolean,
  systemPrefersDark: boolean,
  theme: ThemePreset,
): boolean {
  if (theme.darkOnly) return true;
  const choice = appearance ?? (darkMode ? "dark" : "light");
  if (choice === "system") return systemPrefersDark;
  return choice === "dark";
}

/**
 * The part of an element this module actually touches.
 *
 * Deliberately structural rather than `HTMLElement`. The API validates theme
 * ids against `THEME_IDS` from this same file, so `domain/theme.ts` is
 * compiled by the server's TypeScript project as well — and that project has
 * no DOM library, so a single reference to a browser global fails the server
 * build while the frontend build stays green. A real element satisfies this.
 */
export interface ThemeTarget {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * Write a theme onto an element.
 *
 * Every token in the map is set, and nothing else is touched. Removing the
 * previous theme's properties is unnecessary because the maps have identical
 * key sets — which the type guarantees, and which is the reason the map is a
 * fixed interface rather than `Record<string, string>`.
 */
export function applyTheme(root: ThemeTarget, theme: ThemePreset, dark: boolean): void {
  const tokens = dark ? theme.dark : theme.light;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  root.setAttribute("data-theme", theme.id);
}

export function clearTheme(root: ThemeTarget): void {
  for (const name of Object.keys(THEME_PRESETS[0].light)) root.style.removeProperty(name);
  root.removeAttribute("data-theme");
}
