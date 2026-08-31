import { describe, expect, it } from "vitest";
import {
  contrast,
  fadeToContrast,
  inkFor,
  luminance,
  mix,
  parseHex,
  reachContrast,
  toHex,
} from "../src/domain/colour";
import {
  DEFAULT_CUSTOM_THEME,
  customThemePreset,
  customThemeTokens,
  resolveThemePreset,
  sanitiseCustomTheme,
} from "../src/domain/customTheme";
import { CUSTOM_THEME_ID, DEFAULT_THEME, THEME_IDS } from "../src/domain/theme";
import type { ThemeTokens } from "../src/domain/theme";

/**
 * A theme somebody invents, that cannot come out unreadable
 * =========================================================
 *
 * The ten presets have their contrast measured by `theme-contrast.test.ts`. A
 * theme built in Settings cannot be measured in advance, because it does not
 * exist until it is built — so it is *constructed* safe instead: the reader
 * picks the page, the cards and the accent, and the other eleven tokens are
 * derived by walking toward the ink until each clears its floor.
 *
 * That claim is only worth anything if it holds for colours nobody thought
 * about. So the sweep below is deliberately hostile: mid greys where black and
 * white are equally bad, a page and a card that are nearly the same colour, a
 * yellow accent that no ink sits well on, pure black and pure white.
 */

const GROUNDS: (keyof ThemeTokens)[] = ["--bg", "--bg-elevated", "--bg-subtle", "--bg-inset"];
const TEXTS: (keyof ThemeTokens)[] = ["--text-primary", "--text-secondary", "--text-tertiary"];

const ratio = (a: string, b: string) => contrast(parseHex(a)!, parseHex(b)!);

/** Choices chosen to be awkward rather than pretty. */
const HOSTILE: { name: string; background: string; surface: string; accent: string }[] = [
  { name: "the default", ...DEFAULT_CUSTOM_THEME },
  { name: "mid grey on mid grey", background: "#808080", surface: "#858585", accent: "#808080" },
  { name: "page and card identical", background: "#123456", surface: "#123456", accent: "#123456" },
  { name: "pure white", background: "#FFFFFF", surface: "#FFFFFF", accent: "#FFFF00" },
  { name: "pure black", background: "#000000", surface: "#000000", accent: "#000000" },
  { name: "a yellow accent", background: "#FFFDF0", surface: "#FFFFFF", accent: "#FFE600" },
  { name: "a dark page with a dark accent", background: "#101010", surface: "#1A1A1A", accent: "#202020" },
  { name: "a saturated pink page", background: "#FF00AA", surface: "#FF33BB", accent: "#00FF00" },
  { name: "near-white on white", background: "#FEFEFE", surface: "#FDFDFD", accent: "#FEFEFE" },
  { name: "the darkest usable page", background: "#050505", surface: "#0A0A0A", accent: "#111111" },
];

describe("the arithmetic", () => {
  it("reads the shape a colour input produces, and nothing else", () => {
    expect(parseHex("#1D6FE0")).toEqual({ r: 29, g: 111, b: 224 });
    expect(parseHex("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    for (const bad of ["red", "#ab", "rgb(1,2,3)", "var(--accent)", "", "#12345g"]) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });

  it("agrees with the contrast test about black on white", () => {
    // 21:1 is the definition. If this drifts, every other number here is wrong.
    expect(contrast(parseHex("#000000")!, parseHex("#FFFFFF")!)).toBeCloseTo(21, 5);
    expect(contrast(parseHex("#777777")!, parseHex("#777777")!)).toBeCloseTo(1, 5);
  });

  it("picks the ink by measuring, not by a lightness cut-off", () => {
    /*
     * The case a `luminance > 0.5` test gets wrong. A mid green looks light
     * and sits at about 0.44, so a cut-off puts white text on it — where black
     * reads better.
     */
    const green = parseHex("#4CAF50")!;
    expect(luminance(green)).toBeLessThan(0.5);
    expect(toHex(inkFor(green))).toBe("#000000");
    expect(toHex(inkFor(parseHex("#000000")!))).toBe("#ffffff");
  });

  it("leaves a colour alone when it already clears the ratio", () => {
    const white = parseHex("#FFFFFF")!;
    const navy = parseHex("#12326B")!;
    expect(toHex(reachContrast(navy, white, 4.5))).toBe(toHex(navy));
  });

  it("returns the ink when even the ink cannot reach the ratio", () => {
    // Honest rather than throwing: white on white is the best a white ground
    // allows, and the caller needs a colour, not an exception.
    const white = parseHex("#FFFFFF")!;
    expect(toHex(reachContrast(white, white, 21))).toBe("#000000");
  });

  it("measures the colour it will actually emit", () => {
    /*
     * Fractional channels are the subtle version of this bug. A ratio computed
     * on `rgb(87.3, …)` and then written out as hex is a ratio for a colour
     * nobody sees — the first theme derived this way produced tertiary text at
     * 4.501 that rounded to 4.49 on the page.
     */
    const mixed = mix(parseHex("#000000")!, parseHex("#FFFFFF")!, 1 / 3);
    expect(Number.isInteger(mixed.r)).toBe(true);
    expect(mixed).toEqual(parseHex(toHex(mixed)));
  });

  it("fades toward the ground without dropping below the floor", () => {
    const ground = parseHex("#FFFFFF")!;
    const faded = fadeToContrast(parseHex("#000000")!, ground, 4.5);
    expect(contrast(faded, ground)).toBeGreaterThanOrEqual(4.5);
    // And it really did fade: a ramp that returns the input is not a ramp.
    expect(toHex(faded)).not.toBe("#000000");
  });
});

describe("every theme a reader could build", () => {
  for (const choice of HOSTILE) {
    describe(choice.name, () => {
      const tokens = customThemeTokens(choice);

      it("clears AA for every text shade on every surface", () => {
        const failures: string[] = [];
        for (const text of TEXTS) {
          for (const ground of GROUNDS) {
            const value = ratio(tokens[text], tokens[ground]);
            if (value < 4.5) failures.push(`${text} on ${ground} = ${value.toFixed(2)}`);
          }
        }
        expect(failures).toEqual([]);
      });

      it("keeps the accent usable as a fill and as a tint", () => {
        // Two jobs: text goes on top of it, and it is put on top of the page.
        expect(ratio(tokens["--accent-contrast"], tokens["--accent"])).toBeGreaterThanOrEqual(4.5);
        for (const ground of GROUNDS) {
          expect(ratio(tokens["--accent"], tokens[ground]), `accent on ${ground}`).toBeGreaterThanOrEqual(3);
        }
      });

      it("emits fourteen real colours and no CSS", () => {
        const values = Object.values(tokens);
        expect(values).toHaveLength(14);
        for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/);
      });

      it("keeps the reader's own three colours", () => {
        // Derivation is for the tokens they did not choose. Silently correcting
        // the ones they did is a picker that argues with them.
        expect(tokens["--bg"].toLowerCase()).toBe(choice.background.toLowerCase());
        expect(tokens["--bg-elevated"].toLowerCase()).toBe(choice.surface.toLowerCase());
      });

      it("produces a ramp rather than three of the same shade", () => {
        const shades = new Set(TEXTS.map((text) => tokens[text]));
        // Two is enough to be a hierarchy; the floors can legitimately collide
        // on a ground that leaves almost no room, and one shade cannot.
        expect(shades.size).toBeGreaterThanOrEqual(2);
      });

      it("draws borders that are visible without being boxes", () => {
        const border = ratio(tokens["--border"], tokens["--bg"]);
        expect(border).toBeGreaterThan(1);
        expect(border, "a 4.5:1 border is a black box around every card").toBeLessThan(4.5);
        expect(ratio(tokens["--border-strong"], tokens["--bg"])).toBeGreaterThanOrEqual(border);
      });
    });
  }
});

describe("the preset it becomes", () => {
  it("takes its scheme from the background rather than from a switch", () => {
    /*
     * The reader picked one background, so there is one scheme. Deep black
     * refuses to invent a light version of itself for the same reason.
     */
    expect(customThemePreset({ ...DEFAULT_CUSTOM_THEME, background: "#0B0B0B" }).darkOnly).toBe(true);
    expect(customThemePreset({ ...DEFAULT_CUSTOM_THEME, background: "#FFFFFF" }).darkOnly).toBe(false);
  });

  it("holds the same palette in both maps, so appearance cannot change it", () => {
    const preset = customThemePreset(DEFAULT_CUSTOM_THEME);
    expect(preset.light).toEqual(preset.dark);
  });

  it("is offered by the same id the API accepts", () => {
    expect(THEME_IDS).toContain(CUSTOM_THEME_ID);
  });
});

describe("what arrives from the server", () => {
  it("keeps three valid colours", () => {
    const stored = { background: "#101010", surface: "#202020", accent: "#3AB0FF" };
    expect(sanitiseCustomTheme(stored)).toEqual(stored);
  });

  it("replaces anything that is not a colour, part by part", () => {
    // A stored theme with one bad field keeps the two good ones: throwing the
    // whole palette away would lose work over a typo.
    expect(sanitiseCustomTheme({ background: "#101010", surface: "javascript:alert(1)", accent: "#3AB0FF" })).toEqual({
      background: "#101010",
      surface: DEFAULT_CUSTOM_THEME.surface,
      accent: "#3AB0FF",
    });
  });

  it("survives a value that is not an object at all", () => {
    for (const bad of [null, undefined, "blue", 42, []]) {
      expect(sanitiseCustomTheme(bad)).toEqual(DEFAULT_CUSTOM_THEME);
    }
  });
});

describe("resolving what to paint", () => {
  it("gives a preset for a preset id", () => {
    expect(resolveThemePreset(DEFAULT_THEME, undefined).id).toBe(DEFAULT_THEME);
  });

  it("gives the derived theme for the custom id", () => {
    const preset = resolveThemePreset(CUSTOM_THEME_ID, { background: "#0A0A0A", surface: "#141414", accent: "#FF7A00" });
    expect(preset.id).toBe(CUSTOM_THEME_ID);
    expect(preset.light["--bg"]).toBe("#0a0a0a");
  });

  it("falls back rather than painting nothing for an unknown id", () => {
    expect(resolveThemePreset("a theme that does not exist", undefined).id).toBe(DEFAULT_THEME);
  });
});
