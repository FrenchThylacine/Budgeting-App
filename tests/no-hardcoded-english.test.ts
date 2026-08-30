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

/**
 * Does this line read as a sentence rather than as code?
 *
 * Shared by the scanner and by the test that checks the scanner, so the two
 * cannot drift — which is the failure mode a heuristic guard actually has.
 */
export function isProse(line: string): boolean {
  return (
    /^[A-Z][^<>=;(){}[\]]*[A-Za-z.!?”"…']$/.test(line) &&
    /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(line)
  );
}

/**
 * English inside a template literal, with its interpolations elided.
 *
 * Exported for the same reason `isProse` is: the test that proves this rule
 * works has to run the rule, not a copy of it. A copy is what let the digit
 * case slip past — the scanner was fixed and its test was not.
 */
export function templateEnglish(line: string): string[] {
  /*
   * `[a-z]+`, not `[a-z]{2,}`.
   *
   * The prefix before the first interpolation cannot contain a `$`, so the
   * capitalised word this rule looks for has to appear in that prefix — and
   * requiring three letters meant a sentence opening with a two-letter word
   * did not have one. `` `On this pace you end ${amount} over budget.` `` sat
   * on the dashboard, in English, through two translation audits for exactly
   * that reason: "On" is a capital and one lowercase letter.
   */
  return [...line.matchAll(/`([^`$]*[A-Z][a-z]+[^`]*)`/g)]
    .map((match) => match[1].replace(/\$\{[^}]*\}/g, "…").trim())
    .filter((text) => /^[A-Z][A-Za-z0-9 ,.'’!?%()·…-]{3,}$/.test(text));
}

/**
 * Three more shapes, each of which hid something through the audit before this
 * one. They are separate exported functions for the same reason `isProse` is:
 * the tests below run the rules themselves rather than copies of them.
 */

/**
 * A string given to an object property.
 *
 * `{ label: t("stats.burnRate"), detail: "of monthly budget" }` — half of one
 * line translated and half of it not. The attribute rule above only sees
 * `name="value"` in JSX, and every `StatRow`, `Figure` and chart in this
 * application is configured with objects.
 */
export function propertyEnglish(line: string): string[] {
  const pattern =
    /\b(label|detail|title|description|placeholder|message|hint|emptyMessage|caption|ariaLabel|alt|footer|subtitle|note)\s*:\s*"([A-Za-z][A-Za-z0-9 ,.'’!?%()-]{6,})"/g;
  return [...line.matchAll(pattern)]
    .map((match) => match[2])
    .filter((text) => /[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(text));
}

/**
 * JSX text with a value in the middle of it, all on one line.
 *
 * `<span>Last {count} {mode}s</span>` — a sentence, an interpolation and a
 * plural formed by gluing an "s" onto an enum. The `>text<` rule cannot see it
 * because of the braces, and the prose-on-its-own-line rule cannot see it
 * because it is not on its own line.
 */
export function jsxWithHoles(line: string): string[] {
  // Any number of holes, not one: "Last {count} {mode}s" has two, and a
  // pattern that allowed a single interpolation read straight past it.
  return [...line.matchAll(/>((?:[^<>{}]|\{[^{}]*\})*\{[^{}]*\}(?:[^<>{}]|\{[^{}]*\})*)</g)]
    .map((match) => match[1].replace(/\{[^}]*\}/g, "…").trim())
    .filter((text) => /[A-Za-z]{3,}/.test(text) && /^[A-Z…]/.test(text) && !/[=;()]/.test(text));
}

/**
 * A template literal that *opens* with its interpolation.
 *
 * `` `${amount} by others` `` and `` `vs ${period}` `` are sentences too, and
 * `templateEnglish` cannot see them: the capitalised word it looks for has to
 * come before the first `$`, and here there is nothing before it. What gives
 * these away instead is an English function word standing on its own between
 * the holes.
 */
const FUNCTION_WORDS = /(^|\s)(vs|of|per|and|or|in|on|to|from|with|at|by|for|the|an?)\s/;

export function templateGlue(line: string): string[] {
  return [...line.matchAll(/`([^`]*\$\{[^`]*)`/g)]
    .map((match) => match[1].replace(/\$\{[^}]*\}/g, "…").trim())
    .filter(
      (text) =>
        FUNCTION_WORDS.test(` ${text} `) && /[A-Za-z]{2,}/.test(text) && !/[<>=;/]/.test(text) && !text.includes("--"),
    );
}

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
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
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
          /\b(title|label|placeholder|aria-label|ariaLabel|description|subtitle|alt|caption|note|valueText)=["']([A-Za-z][A-Za-z0-9 ,.'’!?%-]{3,})["']/g,
        )) {
          push(match[2]);
        }
        // The shape almost every one of them actually took: a ternary picking
        // between two English words rather than between two keys — and its
        // cousin, a `||` fallback at the end of a chain, which is where
        // `|| "Transaction"` sat on every swipeable row.
        for (const match of line.matchAll(/(?:[?:]|\|\||\?\?)\s*"([A-Z][a-z]{2,}(?: [A-Za-z']+)*[.!?]?)"/g)) push(match[1]);

        /*
         * A sentence on its own line, between an opening and a closing tag.
         *
         * This is the shape the single-line rules cannot see, and it hid
         * "No icon matches “{query}”." in the icon picker through the whole
         * of the previous audit. The test is: the line before opened an
         * element, and this line is prose — words, punctuation and possibly
         * an interpolation, but no tag and no code.
         */
        /*
         * A template literal with English in it.
         *
         * `` `Active (${n})` `` is a sentence with a hole in it, and the three
         * wishlist tabs sat in exactly that shape through two audits — invisible
         * to the quote-based rules above because it uses backticks, and to the
         * JSX-text rule because it is an expression.
         */
        for (const literal of templateEnglish(line)) push(literal);
        for (const text of propertyEnglish(line)) push(text);
        for (const text of jsxWithHoles(line)) push(text);
        for (const text of templateGlue(line)) push(text);

        const previous = index > 0 ? lines[index - 1].trim() : "";
        // Interpolations are removed first: a sentence with a value in the
        // middle of it is still a sentence, and leaving the braces in is what
        // made an earlier version of this rule blind to the one case it was
        // written for.
        const bare = trimmed.replace(/\{[^}]*\}/g, "…");
        if (previous.endsWith(">") && !previous.endsWith("/>") && isProse(bare)) push(bare);
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

  it("catches English inside a template literal", () => {
    /*
     * The third shape, and the one that hid thirty of them: backticks. Not a
     * quoted string, not JSX text, not a ternary between two words — a
     * sentence with a hole in it, which every rule written before this one
     * looked straight past.
     */
    const literal = templateEnglish;

    expect(literal("label: `Budget ${money(base)}`")).toEqual(["Budget …"]);
    expect(literal("title={`Buy ${item.name}`}")).toEqual(["Buy …"]);
    expect(literal("title={`Archived (${n})`}")).toEqual(["Archived (…)"]);
    // A digit at the end used to stop the match dead.
    expect(literal("ariaLabel={`Budget health ${score} out of 100`}")).toEqual(["Budget health … out of 100"]);

    // A sentence opening with a two-letter word. The prefix before the first
    // interpolation is the only place this rule can find a capitalised word,
    // and demanding three letters of it meant this one had none — which is
    // how it stayed on the dashboard in English through two audits.
    expect(literal("`On this pace you end with ${money(left)} left.`")).toEqual([
      "On this pace you end with … left.",
    ]);

    // Not a template literal of code, a path, or a class list.
    expect(literal("className={`card ${active ? \"is-active\" : \"\"}`}")).toEqual([]);
    expect(literal("`/craft/fleet/${craft.id}.png`")).toEqual([]);
  });

  it("catches the three shapes that survived the last audit", () => {
    /*
     * Every one of these was live in the application when this test was
     * written, and every one of them had been read past by the rules above.
     * Eighteen strings in five components — dialogs, captions, notices — and
     * the suite was reporting the interface fully translated.
     */
    expect(propertyEnglish('  detail: "of monthly budget",')).toEqual(["of monthly budget"]);
    expect(propertyEnglish('  label: t("stats.burnRate"),')).toEqual([]);
    // A class name or an id is not prose, and neither is one word.
    expect(propertyEnglish('  title: "Dashboard",')).toEqual([]);

    expect(jsxWithHoles("<span>Last {recentBars.length} {mode}s</span>")).toEqual(["Last … …s"]);
    expect(jsxWithHoles('<span>{t("stats.spentPeriod", { period })}</span>')).toEqual([]);

    expect(templateGlue("`${money(total)} by others`")).toEqual(["… by others"]);
    expect(templateGlue("`vs ${comparison.previousLabel}`")).toEqual(["vs …"]);
    // Code, paths and class lists still say nothing.
    expect(templateGlue("`translate3d(${x}px, ${y}px, 0)`")).toEqual([]);
    expect(templateGlue("`/craft/fleet/${craft.id}.png`")).toEqual([]);
  });

  it("catches a sentence on its own line, which the first rules cannot see", () => {
    /*
     * The exact shape that survived the previous audit: prose alone between an
     * opening and a closing tag, over three lines. Written as its own case
     * because it is the one the single-line patterns are blind to, and a rule
     * added without a test for it is a rule nobody knows is broken.
     */
    const strip = (line: string) => line.replace(/\{[^}]*\}/g, "…");

    // The interpolation has to be removed before the shape is tested. Leaving
    // the braces in is what made the first version of this rule blind to the
    // one case it was written for, and this line is why the seven that came
    // after it were found at all.
    expect(isProse(strip("No icon matches “{query}”."))).toBe(true);
    expect(isProse(strip("Nothing is dated in the next {horizonDays} days."))).toBe(true);
    expect(isProse(strip("Replace your budget with {preview.fileName}?"))).toBe(true);

    // And it does not fire on the ordinary case of an expression on its own
    // line, which is most of what sits between two tags.
    expect(isProse(strip('{t("icons.noMatch", { query })}'))).toBe(false);
    expect(isProse(strip("{heldChildren.current}"))).toBe(false);
    expect(isProse(strip("<Icon size={14} />"))).toBe(false);
  });
});
