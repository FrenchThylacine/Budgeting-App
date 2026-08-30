/**
 * Every key in the dictionary is asked for by the application
 * ===========================================================
 *
 * The plan has claimed "0 unused keys" since the translation pass. Nothing
 * checked it: the suite verified that every key the source *asks for* exists,
 * which is the other direction, and a key that stops being asked for simply
 * sits there — translated five times, carried in every bundle, and read by the
 * next person as a description of a feature that no longer exists.
 *
 * Two shapes have to be understood or this test is useless:
 *
 *  - `t("stats.activityShare")` — a literal, which is most of them;
 *  - `` t(`funding.${kind}.short`) `` — a *family*, where the key is built at
 *    run time. Those are matched on the literal part of the template, so
 *    `funding.other.short` counts as used because something asks for
 *    `funding.` + something + `.short`.
 *
 * A key that is genuinely dead should be deleted, not exempted. The allowlist
 * below is for keys reached by a mechanism this scanner cannot see, and each
 * entry says which one.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { en } from "../src/i18n/en";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(path) && !path.includes("/i18n/")) found.push(path);
  }
  return found;
}

/** Keys reached by a mechanism the scanner cannot follow. */
const ALLOWED = new Map<string, string>([
  ["health.grade.at-risk", "built from a HealthGrade union whose member has a hyphen"],
]);

const source = [...sourceFiles("src"), ...sourceFiles("server/src")]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/**
 * The literal fragments of every key the source mentions.
 *
 * A template's fixed parts are kept as fragments, so `funding.` and `.short`
 * both count and any key containing them in order is considered reachable.
 */
const literals = new Set<string>();
const prefixes: string[] = [];
for (const match of source.matchAll(/["'`]([a-z][A-Za-z0-9_.-]*)["'`]/g)) literals.add(match[1]);
for (const match of source.matchAll(/`([a-z][A-Za-z0-9_.-]*)\$\{[^}]*\}([A-Za-z0-9_.-]*)`/g)) {
  prefixes.push(match[1]);
}

function reachable(key: string): boolean {
  if (ALLOWED.has(key)) return true;
  if (literals.has(key)) return true;
  // A plural family: `count.of.things_one` is asked for as `count.of.things`.
  const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
  if (base !== key && (literals.has(base) || prefixes.some((p) => base.startsWith(p)))) return true;
  return prefixes.some((prefix) => key.startsWith(prefix));
}

describe("the dictionary describes the application", () => {
  it("has no key the source never asks for", () => {
    const orphans = Object.keys(en).filter((key) => !reachable(key));
    expect(orphans.join("\n")).toBe("");
  });

  it("recognises both shapes, so it cannot pass by seeing nothing", () => {
    // The guard's own guard, as with the English scanner: a matcher that
    // matched everything would report zero orphans for ever.
    expect(literals.size).toBeGreaterThan(400);
    expect(prefixes.length).toBeGreaterThan(3);
    expect(reachable("this.key.is.not.in.the.source.at.all")).toBe(false);
  });
});
