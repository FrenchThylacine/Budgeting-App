import { describe, expect, it } from "vitest";
import {
  isHexColour,
  readableInk,
  sanitiseStatusColours,
  statusColourCss,
  statusColourVariables,
} from "../src/domain/statusColours";

/**
 * A colour a reader chose is a fill, and never text
 * ================================================
 *
 * Letting somebody pick the colour of a status is letting them pick an
 * unreadable one. The rule that makes it safe is that the chosen value is used
 * for *shapes* — a bar segment, a donut arc, a glyph — and the text shade is
 * derived from it by mixing toward the theme's own foreground, which darkens it
 * on a light theme and lightens it on a dark one.
 *
 * The second rule is that the application and the printed report get their
 * palette from the same function. Two derivations of one palette is how a
 * report ends up printing last month's colours, which is the same failure this
 * codebase has already had as a preview that lied and as three copies of one
 * badge.
 */

describe("what counts as a colour", () => {
  it("accepts what a colour input produces", () => {
    expect(isHexColour("#1D6FE0")).toBe(true);
    expect(isHexColour("#abcdef")).toBe(true);
  });

  it("rejects everything else, including things that would parse as CSS", () => {
    // The stored settings are JSON from a server, so this is the boundary.
    for (const value of ["red", "#abc", "rgb(1,2,3)", "var(--accent)", "", null, undefined, 42, {}]) {
      expect(isHexColour(value), String(value)).toBe(false);
    }
  });

  it("drops anything that is not a colour rather than passing it through", () => {
    const clean = sanitiseStatusColours({
      personal: "#123456",
      other: "javascript:alert(1)",
      outside: "#ABCDEF",
      nonsense: "#000000",
    });
    expect(clean).toEqual({ personal: "#123456", outside: "#ABCDEF" });
  });

  it("survives a value that is not an object at all", () => {
    expect(sanitiseStatusColours(null)).toEqual({});
    expect(sanitiseStatusColours("blue")).toEqual({});
  });
});

describe("the variables", () => {
  it("derives a text shade rather than using the fill as text", () => {
    const variables = statusColourVariables({ other: "#7C3AED" });
    expect(variables["--funding-other"]).toBe("#7C3AED");
    expect(variables["--funding-other-text"]).toBe(readableInk("#7C3AED"));
    // Mixed toward the theme's foreground, so it follows light and dark.
    expect(variables["--funding-other-text"]).toContain("var(--text-primary)");
  });

  it("emits nothing for a kind the reader has not chosen", () => {
    /*
     * The important negative. Writing a variable for an unchosen kind would
     * pin it to whatever the theme happened to say at that moment, and the
     * theme would stop being switchable — silently, and only for that one
     * colour.
     */
    const variables = statusColourVariables({ other: "#7C3AED" });
    expect(Object.keys(variables).some((name) => name.includes("personal"))).toBe(false);
    expect(Object.keys(variables).some((name) => name.includes("outside"))).toBe(false);
  });

  it("emits all three channels for a chosen kind", () => {
    const variables = statusColourVariables({ outside: "#0F766E" });
    expect(Object.keys(variables).sort()).toEqual([
      "--funding-outside",
      "--funding-outside-soft",
      "--funding-outside-text",
    ]);
  });

  it("gives the report the same palette as the application", () => {
    const chosen = { other: "#7C3AED", outside: "#0F766E" };
    const css = statusColourCss(chosen);
    for (const [name, value] of Object.entries(statusColourVariables(chosen))) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });
});
