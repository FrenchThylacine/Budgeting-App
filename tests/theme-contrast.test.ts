// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPEARANCES,
  DEFAULT_THEME,
  THEME_PRESETS,
  applyTheme,
  clearTheme,
  resolveAppearance,
  themeFor,
  type ThemeTokens,
} from "../src/domain/theme";

/**
 * Themes are allowed to change how the application looks. They are not allowed
 * to make it unreadable, and "it looked fine on my screen" is not a check.
 *
 * Every text token is measured against every ground the application actually
 * puts it on, in both appearances, for every preset. The threshold is WCAG AA
 * for body text — 4.5 : 1 — because the smallest text in this application is
 * 12px and none of it is decorative.
 */

const MINIMUM = 4.5;

const CHANNEL = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function parse(colour: string): [number, number, number] {
  const hex = colour.trim();
  if (hex.startsWith("#")) {
    const digits = hex.slice(1);
    const full = digits.length === 3 ? digits.split("").map((d) => d + d).join("") : digits;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const match = hex.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Not a colour this test understands: ${colour}`);
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  return [parts[0], parts[1], parts[2]];
}

function luminance(colour: string): number {
  const [r, g, b] = parse(colour);
  return 0.2126 * CHANNEL(r) + 0.7152 * CHANNEL(g) + 0.0722 * CHANNEL(b);
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every surface a token of text is put on, in this application. */
const GROUNDS: (keyof ThemeTokens)[] = ["--bg", "--bg-elevated", "--bg-subtle", "--bg-inset"];
const TEXTS: (keyof ThemeTokens)[] = ["--text-primary", "--text-secondary", "--text-tertiary"];

describe("every theme preset, in both appearances", () => {
  for (const preset of THEME_PRESETS) {
    for (const appearance of preset.darkOnly ? (["dark"] as const) : (["light", "dark"] as const)) {
      const tokens = preset[appearance];

      it(`${preset.id} / ${appearance}: every text colour clears AA on every surface`, () => {
        const failures: string[] = [];
        for (const text of TEXTS) {
          for (const ground of GROUNDS) {
            const ratio = contrast(tokens[text], tokens[ground]);
            if (ratio < MINIMUM) failures.push(`${text} on ${ground} = ${ratio.toFixed(2)}`);
          }
        }
        expect(failures).toEqual([]);
      });

      it(`${preset.id} / ${appearance}: the accent is readable, and readable on`, () => {
        // As text: the accent is the colour of links, active navigation and
        // several figures, so it is held to the text threshold rather than to
        // the looser one for large shapes.
        expect(contrast(tokens["--accent"], tokens["--bg"])).toBeGreaterThanOrEqual(MINIMUM);
        expect(contrast(tokens["--accent"], tokens["--bg-elevated"])).toBeGreaterThanOrEqual(MINIMUM);
        // And as a fill: a primary button's label sits on it.
        expect(contrast(tokens["--accent-contrast"], tokens["--accent"])).toBeGreaterThanOrEqual(MINIMUM);
      });
    }
  }
});

describe("the default preset and the stylesheet agree", () => {
  /*
   * The stylesheet carries the default theme so the application paints
   * correctly before any script runs. That is a second copy of the same
   * numbers, and a second copy drifts — so it is compared rather than trusted.
   */
  const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

  const block = (selector: string): Record<string, string> => {
    const start = css.indexOf(selector);
    expect(start, `${selector} is missing from styles.css`).toBeGreaterThan(-1);
    const open = css.indexOf("{", start);
    const close = css.indexOf("\n}", open);
    const body = css.slice(open + 1, close);
    const values: Record<string, string> = {};
    for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      values[match[1]] = match[2].trim();
    }
    return values;
  };

  const preset = themeFor(DEFAULT_THEME);

  it("light", () => {
    const declared = block(":root {");
    for (const [name, value] of Object.entries(preset.light)) {
      expect(declared[name], `${name} in :root`).toBe(value);
    }
  });

  it("dark", () => {
    const declared = block(":root.dark {");
    for (const [name, value] of Object.entries(preset.dark)) {
      expect(declared[name], `${name} in :root.dark`).toBe(value);
    }
  });
});

describe("resolving an appearance", () => {
  const base = themeFor("airfrance");
  const black = themeFor("midnight");

  it("follows the explicit choice", () => {
    expect(resolveAppearance("dark", false, false, base)).toBe(true);
    expect(resolveAppearance("light", true, true, base)).toBe(false);
  });

  it("follows the system only when asked to", () => {
    expect(resolveAppearance("system", false, true, base)).toBe(true);
    expect(resolveAppearance("system", true, false, base)).toBe(false);
  });

  it("falls back to the legacy boolean when no appearance is stored", () => {
    expect(resolveAppearance(undefined, true, false, base)).toBe(true);
    expect(resolveAppearance(undefined, false, true, base)).toBe(false);
  });

  it("a dark-only theme is dark whatever is asked for", () => {
    for (const appearance of APPEARANCES) {
      expect(resolveAppearance(appearance, false, false, black)).toBe(true);
    }
  });

  it("an unknown theme id resolves to the default rather than throwing", () => {
    expect(themeFor("a-theme-from-the-future").id).toBe(DEFAULT_THEME);
    expect(themeFor(undefined).id).toBe(DEFAULT_THEME);
  });
});

describe("applying a theme", () => {
  it("writes every token, and clearing removes every one it wrote", () => {
    const root = document.createElement("html");
    applyTheme(root, themeFor("plum"), true);
    expect(root.dataset.theme).toBe("plum");
    expect(root.style.getPropertyValue("--accent")).toBe("#B99BFF");
    expect(root.style.getPropertyValue("--bg")).toBe("#0D0817");

    // Switching themes must leave nothing of the previous one behind, which is
    // only true because every preset declares the same key set.
    applyTheme(root, themeFor("alpine"), false);
    expect(root.style.getPropertyValue("--accent")).toBe("#0B6875");
    expect(root.style.getPropertyValue("--bg")).toBe("#EFF4F5");

    clearTheme(root);
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.dataset.theme).toBeUndefined();
  });
});
