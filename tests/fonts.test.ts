import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_FONT, FONTS, FONT_IDS, fontFor, fontStack } from "../src/domain/fonts";

/**
 * A typeface that reaches every word
 * ==================================
 *
 * The choice is one CSS variable, and that is the whole design: every rule in
 * the stylesheets names `--font-sans`, so overriding it moves headings,
 * figures, forms, the navigation and the printed report together. The failure
 * this guards against is the ordinary one — a component that names a family of
 * its own and so stays behind when everything else changes.
 *
 * The second rule is that nothing is downloaded. A budget must not wait on a
 * font server, and a face that arrives late reflows the page under the reader,
 * so every stack is fonts that already exist on the machine and ends in a
 * generic family.
 */

describe("the list", () => {
  it("offers the named faces somebody would ask for", () => {
    /*
     * Named, not abstract. "Neutral" and "Bookish" describe an intent; a reader
     * who wants Verdana wants Verdana. The original six keep their ids because
     * an id is what a saved budget stores.
     */
    const named = FONTS.map((font) => font.stack.split(",")[0].replace(/"/g, "").trim());
    for (const face of [
      "Arial",
      "Verdana",
      "Trebuchet MS",
      "Tahoma",
      "Garamond",
      "Palatino",
      "Times New Roman",
      "Georgia",
      "Comic Sans MS",
      "Courier New",
    ]) {
      expect(named, `${face} is not offered`).toContain(face);
    }
  });

  it("keeps every id a saved budget could be holding", () => {
    // Renaming one would silently reset the font of everybody who chose it.
    for (const id of ["system", "grotesque", "serif", "slab", "rounded", "mono"]) {
      expect(FONT_IDS, `${id} was dropped or renamed`).toContain(id);
    }
  });

  it("has no duplicate ids and no duplicate stacks", () => {
    expect(new Set(FONT_IDS).size).toBe(FONTS.length);
    expect(new Set(FONTS.map((font) => font.stack)).size).toBe(FONTS.length);
  });

  it("ends every stack in a generic family, so the worst case is the platform's own", () => {
    const generics = ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"];
    for (const font of FONTS) {
      const last = font.stack.split(",").pop()!.trim();
      expect(generics, `${font.id} ends in "${last}", which is a file rather than a fallback`).toContain(last);
    }
  });

  it("downloads nothing", () => {
    // A stack is a list of names. A url() in one is a font request, and a font
    // request is a page that reflows when it lands.
    for (const font of FONTS) {
      expect(font.stack).not.toMatch(/url\(|https?:/);
    }
  });

  it("names every face it can, so the intent survives a platform that lacks one", () => {
    // "Comic Sans MS" is not on a Mac and "Chalkboard SE" is. One name plus a
    // generic is a choice that silently becomes the default on half of them.
    for (const font of FONTS) {
      expect(font.stack.split(",").length, `${font.id} names too few faces`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("resolving a choice", () => {
  it("leaves the variable alone when nothing has been chosen", () => {
    /*
     * `null` rather than the system stack, deliberately. Writing the default
     * back pins the token to whatever it said at that moment, and a theme that
     * overrides it stops being able to.
     */
    expect(fontStack(undefined)).toBeNull();
    expect(fontStack(DEFAULT_FONT)).toBeNull();
  });

  it("returns the stack for a chosen face", () => {
    expect(fontStack("verdana")).toContain("Verdana");
    expect(fontStack("courier")).toContain("Courier New");
  });

  it("ignores a value that is not a font", () => {
    // Settings arrive as JSON from a server, so this is a boundary.
    expect(fontStack("'; background: url(evil)")).toBeNull();
    expect(fontStack("helvetica")).toBeNull();
    expect(fontFor("nonsense").id).toBe(DEFAULT_FONT);
  });
});

describe("applied consistently", () => {
  /**
   * The architectural claim, checked rather than asserted in a comment.
   *
   * One exception is allowed and named: the error screen prints a stack trace,
   * and a stack trace is monospace whatever the reader chose.
   */
  it("names no family in the stylesheets except through the token", () => {
    const offenders: string[] = [];
    for (const file of ["src/styles.css", "src/styles-extras.css"]) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const match = line.match(/^\s*font-family:\s*(.+);/);
          if (!match) return;
          const value = match[1].trim();
          if (value === "var(--font-sans)" || value === "var(--font-mono)" || value === "inherit") return;
          if (line.includes("--font-sans:") || line.includes("--font-mono:")) return;
          offenders.push(`${file}:${index + 1}  ${value}`);
        });
    }
    expect(offenders, `a rule names a family instead of the token:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("gives the report the reader's face too", () => {
    // The report is a separate document with its own stylesheet, so it is the
    // one surface that cannot inherit the token and has to be handed the stack.
    const report = readFileSync("src/domain/report.ts", "utf8");
    expect(report).toContain("options.fontStack");
  });
});
