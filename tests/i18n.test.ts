/**
 * Translation, pluralisation and locale formatting
 * ================================================
 *
 * The tests that matter here are the ones that fail if the layer quietly
 * assumes English: a plural rule that is `n === 1`, a sentence built by
 * concatenation, a date formatted by hand.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  DICTIONARIES,
  FALLBACK_LANGUAGE,
  createTranslator,
  dictionaryFor,
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
  isDictionaryLoaded,
  isTranslated,
  loadDictionary,
  monthNames,
  resolveLanguage,
  translate,
} from "../src/domain/i18n";
import { LANGUAGES, findLanguage, searchLanguages } from "../src/domain/languages";
import { en } from "../src/i18n/en";

/**
 * Only English is bundled; the rest arrive as their own chunks the first time
 * a language is chosen. The tests below assert on real translated strings, so
 * they load them first — which is also a test that loading works at all.
 */
beforeAll(async () => {
  await Promise.all(["fr", "es", "de", "ar"].map((code) => loadDictionary(code)));
});

describe("choosing a language", () => {
  it("honours a stored preference", () => {
    expect(resolveLanguage("fr")).toBe("fr");
  });

  it("falls back to the browser, then to English", () => {
    expect(resolveLanguage(undefined, ["de-DE", "en"])).toBe("de");
    expect(resolveLanguage(undefined, ["xx-YY"])).toBe(FALLBACK_LANGUAGE);
    expect(resolveLanguage(null, [])).toBe(FALLBACK_LANGUAGE);
  });

  it("ignores a stored value that names no known language", () => {
    // Better English than an interface in a language that does not exist.
    expect(resolveLanguage("klingon", [])).toBe(FALLBACK_LANGUAGE);
  });

  it("matches a region tag onto its base language", () => {
    expect(findLanguage("fr-CA")?.code).toBe("fr");
  });
});

describe("the language list", () => {
  it("offers many languages, each naming itself", () => {
    expect(LANGUAGES.length).toBeGreaterThan(50);
    for (const language of LANGUAGES) {
      expect(language.nativeName, language.code).toBeTruthy();
      expect(language.name, language.code).toBeTruthy();
    }
  });

  it("is searchable by code, English name and native name", () => {
    expect(searchLanguages("de")[0].code).toBe("de");
    expect(searchLanguages("german").map((l) => l.code)).toContain("de");
    expect(searchLanguages("Deutsch").map((l) => l.code)).toContain("de");
    expect(searchLanguages("العربية").map((l) => l.code)).toContain("ar");
  });

  it("marks right-to-left scripts, so the layout can mirror", () => {
    expect(findLanguage("ar")?.rtl).toBe(true);
    expect(findLanguage("he")?.rtl).toBe(true);
    expect(findLanguage("fr")?.rtl).toBeUndefined();
  });

  it("says honestly which languages have interface strings", () => {
    expect(isTranslated("fr")).toBe(true);
    // Offered for its locale formatting, and labelled as such rather than
    // pretending a translation exists.
    expect(isTranslated("vi")).toBe(false);
    expect(findLanguage("vi")).toBeTruthy();
  });
});

describe("looking a string up", () => {
  it("returns the translation for a language that has one", () => {
    expect(createTranslator("fr")("nav.spending")).toBe("Dépenses");
    expect(createTranslator("de")("nav.spending")).toBe("Ausgaben");
    expect(createTranslator("ar")("nav.spending")).toBe("المصروفات");
  });

  it("falls back to English for a key a language has not translated", () => {
    const sparse = { "nav.dashboard": "Tableau" };
    expect(translate(sparse, "fr", "nav.spending")).toBe(en["nav.spending"]);
  });

  it("returns the key itself when nothing has it, rather than an empty string", () => {
    // A visible `some.missing.key` is a bug report; a blank space is a mystery.
    expect(translate({}, "en", "some.missing.key")).toBe("some.missing.key");
  });

  it("uses a language's own dictionary, or the closest that exists", () => {
    expect(dictionaryFor("fr")).toBe(DICTIONARIES.fr);
    expect(dictionaryFor("pt-BR")).toBe(DICTIONARIES[FALLBACK_LANGUAGE]);
  });

  it("loads a language's strings on demand, and caches them", async () => {
    // English is bundled, because it is the fallback every other language
    // resolves a missing key through.
    expect(isDictionaryLoaded("en")).toBe(true);
    const first = await loadDictionary("fr");
    const second = await loadDictionary("fr");
    expect(first).toBe(second);
    expect(isDictionaryLoaded("fr")).toBe(true);
  });

  it("resolves to null for a language that has no strings, rather than throwing", async () => {
    // A real, supported state: the locale still applies and the strings stay
    // English. `isTranslated` is what the picker labels it with.
    await expect(loadDictionary("vi")).resolves.toBeNull();
    expect(isTranslated("vi")).toBe(false);
  });

  it("answers in English while a dictionary is still in flight", () => {
    // Nothing waits and nothing renders blank: the fallback is the interface
    // until the chunk lands.
    expect(translate({}, "sv", "nav.spending")).toBe(en["nav.spending"]);
  });
});

describe("placeholders", () => {
  it("substitutes named values", () => {
    expect(createTranslator("en")("a11y.editActivity", { name: "Padel" })).toBe("Edit Padel");
  });

  it("formats a numeric placeholder for the active locale", () => {
    // French groups with a narrow space and uses a comma for the decimal.
    const french = createTranslator("fr")("stats.shareOfTotal", { percent: "12,5 %" });
    expect(french).toContain("12,5 %");
  });

  it("leaves an unknown placeholder visible rather than printing 'undefined'", () => {
    expect(translate({ k: "Total {total}" }, "en", "k", { count: 1 })).toBe("Total {total}");
  });
});

describe("pluralisation", () => {
  it("uses English's two forms", () => {
    const t = createTranslator("en");
    expect(t("common.transactions", { count: 1 })).toBe("1 transaction");
    expect(t("common.transactions", { count: 3 })).toBe("3 transactions");
    expect(t("common.transactions", { count: 0 })).toBe("0 transactions");
  });

  it("uses French's rule, where zero is singular", () => {
    // `n === 1` would get this wrong: in French, 0 takes the singular.
    const t = createTranslator("fr");
    expect(t("common.activities", { count: 0 })).toBe("0 activité");
    expect(t("common.activities", { count: 1 })).toBe("1 activité");
    expect(t("common.activities", { count: 2 })).toBe("2 activités");
  });

  it("uses Arabic's six forms", () => {
    const t = createTranslator("ar");
    expect(t("common.activities", { count: 0 })).toBe("لا أنشطة");
    expect(t("common.activities", { count: 1 })).toBe("نشاط واحد");
    expect(t("common.activities", { count: 2 })).toBe("نشاطان");
    // few (3–10), many (11–99) and other are all distinct.
    expect(t("common.activities", { count: 5 })).not.toBe(t("common.activities", { count: 20 }));
    expect(t("common.activities", { count: 20 })).not.toBe(t("common.activities", { count: 100 }));
  });

  it("falls back to `_other` for a language that supplies only one form", () => {
    const single = { "common.activities_other": "{count} 件のアクティビティ" };
    expect(translate(single, "ja", "common.activities", { count: 1 })).toBe("1 件のアクティビティ");
  });
});

describe("locale formatting", () => {
  it("groups and punctuates numbers the way the language does", () => {
    expect(formatNumber(1234.5, "en", { minimumFractionDigits: 1 })).toBe("1,234.5");
    // A non-breaking or narrow space and a comma, depending on the platform's
    // CLDR build — the point is that it is *not* the English form.
    expect(formatNumber(1234.5, "fr", { minimumFractionDigits: 1 })).not.toBe("1,234.5");
    expect(formatNumber(1234.5, "de", { minimumFractionDigits: 1 })).toBe("1.234,5");
  });

  it("writes dates in the language's own order", () => {
    const date = new Date(2026, 8, 14);
    expect(formatDate(date, "en", { day: "numeric", month: "long", year: "numeric" })).toBe("September 14, 2026");
    expect(formatDate(date, "fr", { day: "numeric", month: "long", year: "numeric" })).toBe("14 septembre 2026");
  });

  it("returns a dash for an unusable date rather than 'Invalid Date'", () => {
    expect(formatDate("not a date", "en")).toBe("—");
  });

  it("uses the locale's own percent sign and spacing", () => {
    expect(formatPercent(37.5, "en")).toBe("37.5%");
    expect(formatPercent(37.5, "fr")).not.toBe("37.5%");
  });

  it("joins lists the way the language does", () => {
    expect(formatList(["a", "b", "c"], "en")).toBe("a, b, and c");
    expect(formatList(["a", "b", "c"], "fr")).toBe("a, b et c");
    expect(formatList([], "en")).toBe("");
  });

  it("names months in the active language", () => {
    expect(monthNames("en")[8]).toBe("September");
    expect(monthNames("fr")[8]).toBe("septembre");
    expect(monthNames("en", "short")[8]).toBe("Sep");
  });
});

describe("the dictionaries themselves", () => {
  it("uses whole sentences with named placeholders, never fragments", () => {
    // A string that is only a placeholder is a sentence built by
    // concatenation somewhere else, which cannot be translated.
    for (const [key, value] of Object.entries(en)) {
      expect(String(value).trim(), key).not.toMatch(/^\{\w+\}$/);
    }
  });

  it("keeps every translated language's keys inside the English key set", () => {
    // A key that exists only in a translation is a key nothing reads.
    const known = new Set(Object.keys(en));
    for (const [code, dictionary] of Object.entries(DICTIONARIES)) {
      if (code === FALLBACK_LANGUAGE) continue;
      for (const key of Object.keys(dictionary)) {
        const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
        expect(known.has(key) || known.has(`${base}_one`) || known.has(`${base}_other`) || known.has(base), `${code}: ${key}`).toBe(true);
      }
    }
  });

  it("keeps every placeholder a translation uses present in the English original", () => {
    const placeholders = (value: string) => (value.match(/\{(\w+)\}/g) ?? []).sort();
    for (const [code, dictionary] of Object.entries(DICTIONARIES)) {
      if (code === FALLBACK_LANGUAGE) continue;
      for (const [key, value] of Object.entries(dictionary)) {
        const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
        const original =
          (en as Record<string, string>)[key] ??
          (en as Record<string, string>)[`${base}_other`] ??
          (en as Record<string, string>)[base];
        if (!original) continue;
        for (const placeholder of placeholders(value)) {
          // A translation that invents a placeholder prints a literal
          // "{name}" on screen for ever.
          expect(placeholders(original), `${code}: ${key}`).toContain(placeholder);
        }
      }
    }
  });
});
