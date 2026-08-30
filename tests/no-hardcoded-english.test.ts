/**
 * No English left in the components
 * =================================
 *
 * The previous pass added a thousand translation keys and reported the
 * application translated. It was not: a hundred and six user-facing strings
 * were still written in English directly in the JSX — swipe-action labels,
 * editor titles, chart tooltips, empty states, the whole authentication
 * screen, and the word "immutable" on a history row.
 *
 * They survived because nothing looked for them. Every check ran against the
 * *dictionaries* — no missing keys, no untranslated values, no unused keys —
 * and a sentence that never reached a dictionary passes all three.
 *
 * So this looks at the components instead. It is a heuristic, and it is a
 * heuristic with an allowlist, which is the only honest way to write it: the
 * point is not to prove a negative, it is to make adding the hundred and
 * seventh one fail out loud.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function componentFiles(dir = "src"): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...componentFiles(path));
    else if (path.endsWith(".tsx")) found.push(path);
  }
  return found;
}

/**
 * What is allowed to be English, and why.
 *
 * Every entry is a decision, not an exemption granted to make the test pass.
 */
const ALLOWED = new Map<string, string>([
  ["Budget OS", "the product's name, which is the same in every language"],
  ["Chart", "the last-resort accessible name for a chart given neither title nor label"],
  ["Alpine", "a theme id in a code comment"],
]);

/** The icon library's 244 keyword labels are a search index, not prose. */
const EXEMPT_FILES = [/IconPicker/];

interface Finding {
  file: string;
  line: number;
  text: string;
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of componentFiles()) {
    if (EXEMPT_FILES.some((pattern) => pattern.test(file))) continue;
    let inComment = false;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (inComment) {
          if (trimmed.includes("*/")) inComment = false;
          return;
        }
        if (trimmed.startsWith("/*")) {
          if (!trimmed.includes("*/")) inComment = true;
          return;
        }
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        const push = (text: string) => {
          if (ALLOWED.has(text.trim())) return;
          findings.push({ file, line: index + 1, text: text.trim() });
        };
        // Text sitting between two JSX tags.
        for (const match of line.matchAll(/>\s*([A-Z][A-Za-z][A-Za-z ,.'’!?%-]{2,})\s*</g)) push(match[1]);
        // A visible attribute given a literal.
        for (const match of line.matchAll(
          /\b(title|label|placeholder|aria-label|description|subtitle|alt|caption|note)=["']([A-Za-z][A-Za-z ,.'’!?%-]{3,})["']/g,
        )) {
          push(match[2]);
        }
        // The shape almost every one of them actually took: a ternary picking
        // between two English words rather than between two keys.
        for (const match of line.matchAll(/[?:]\s*"([A-Z][a-z]{2,}(?: [A-Za-z]+)*)"/g)) push(match[1]);
      });
  }
  return findings;
}

describe("the components carry no English of their own", () => {
  it("has no user-facing string written outside the dictionary", () => {
    const findings = scan();
    const report = findings.map((f) => `${f.file}:${f.line}  ${f.text}`).join("\n");
    expect(report).toBe("");
  });

  it("still detects one when it is added", () => {
    // The guard's own guard. A scanner that silently matches nothing would
    // pass this suite for ever while the interface drifted back into English.
    const line = '        <button title="Delete everything">Save changes</button>';
    const matches = [
      ...line.matchAll(/>\s*([A-Z][A-Za-z][A-Za-z ,.'’!?%-]{2,})\s*</g),
      ...line.matchAll(/\btitle=["']([A-Za-z][A-Za-z ,.'’!?%-]{3,})["']/g),
    ];
    expect(matches.map((m) => m[1])).toEqual(["Save changes", "Delete everything"]);
  });
});
