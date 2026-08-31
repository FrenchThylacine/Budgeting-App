/**
 * One vocabulary, one component
 * =============================
 *
 * How often money moves, and who paid, are the two small visual languages this
 * application asks a reader to learn. A language is only worth learning if it
 * is the same everywhere — and the way it stops being the same is not a design
 * decision, it is a copy: a badge is written out by hand in a third panel, and
 * six months later that copy has a tooltip the other two never got.
 *
 * That had already happened once. `funding-badge` was spelled out in the
 * transaction list and again in the activity list, and the dashboard had its
 * own `funding-chip` beside them — three renderings of three glyphs.
 *
 * So the marks have exactly one implementation each, and this test says so:
 * the class names belong to `FundingMark` and `CadenceMark`, and to the
 * stylesheet that dresses them. Anywhere else is a fourth copy in the making.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CADENCE_ICON_CHOICES, CADENCE_META, cadenceIcon, type Cadence } from "../src/domain/cadence";
import { FUNDING_KINDS, FUNDING_META } from "../src/domain/funding";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}

/** The one file allowed to render each mark. */
const OWNER: Record<string, string> = {
  "funding-badge": "src/components/ui/FundingMark.tsx",
  "funding-chip": "src/components/ui/FundingMark.tsx",
  "cadence-mark": "src/components/ui/CadenceMark.tsx",
  "cadence-chip": "src/components/ui/CadenceMark.tsx",
};

describe("the visual vocabulary has one implementation", () => {
  for (const [mark, owner] of Object.entries(OWNER)) {
    it(`\`${mark}\` is rendered by ${owner.split("/").pop()} and nowhere else`, () => {
      const offenders = sourceFiles("src")
        .filter((path) => path !== owner)
        .filter((path) => new RegExp(`className=(\\{\`|")${mark}\\b`).test(readFileSync(path, "utf8")))
        .map((path) => path.replace(/^src\//, ""));
      expect(offenders, `a second rendering of ${mark}`).toEqual([]);
    });
  }
});

describe("the marks stay distinguishable without colour", () => {
  it("the three funding glyphs are distinct shapes", () => {
    const glyphs = FUNDING_KINDS.map((kind) => FUNDING_META[kind].glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("the seven cadence icons are distinct silhouettes", () => {
    const icons = Object.values(CADENCE_META).map((meta) => meta.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("every cadence carries a word as well as a shape and a tone", () => {
    for (const meta of Object.values(CADENCE_META)) {
      expect(meta.labelKey, `${meta.id} has no label`).toMatch(/^cadence\./);
      expect(meta.tone, `${meta.id} has no tone`).toMatch(/^var\(--cadence-/);
    }
  });

  it("the cadences share three tones, not seven", () => {
    const ids = Object.keys(CADENCE_META) as Cadence[];
    const tones = new Set(ids.map((id) => CADENCE_META[id].tone));
    expect(tones.size).toBe(3);
  });
});

describe("the payment-rhythm icons", () => {
  it("offers a default that is the one the table names", () => {
    /*
     * The picker shows the first choice as the default, and `CADENCE_META`
     * names the icon actually drawn when nobody has chosen. Two tables, one
     * fact — so they are asserted equal rather than kept in step by hand.
     */
    for (const [cadence, choices] of Object.entries(CADENCE_ICON_CHOICES)) {
      expect(choices[0], `${cadence}'s first choice`).toBe(
        CADENCE_META[cadence as Cadence].icon,
      );
    }
  });

  it("no longer represents a one-off payment with a bare dot", () => {
    // It did, and a two-pixel speck reads as a bullet point rather than as a
    // cadence — the one shape in the set that said nothing.
    expect(CADENCE_META.oneOff.icon).not.toBe("Dot");
  });

  it("falls back to the default rather than drawing nothing", () => {
    expect(cadenceIcon("monthly", { monthly: "NotAnIcon" })).toBe(CADENCE_META.monthly.icon);
    expect(cadenceIcon("monthly", {})).toBe(CADENCE_META.monthly.icon);
    expect(cadenceIcon("monthly", undefined)).toBe(CADENCE_META.monthly.icon);
  });

  it("honours a choice that is on the cadence's own list", () => {
    const alternative = CADENCE_ICON_CHOICES.monthly[1];
    expect(cadenceIcon("monthly", { monthly: alternative })).toBe(alternative);
  });

  it("refuses an icon borrowed from another cadence", () => {
    // Each list is the set of shapes that mean *that* rhythm. A ticket does not
    // mean "yearly", so choosing it there is ignored.
    expect(cadenceIcon("yearly", { yearly: "Ticket" })).toBe(CADENCE_META.yearly.icon);
  });
});
