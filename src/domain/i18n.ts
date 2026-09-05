/**
 * Translation and locale formatting
 * =================================
 *
 * One dictionary per language, one lookup function, and no strings baked into
 * components. Adding a language is a file plus a row in `domain/languages.ts`;
 * it is never an edit to a component.
 *
 * Three things this module refuses to do, because each of them is a way of
 * assuming every language behaves like English:
 *
 *  1. **It does not build sentences by concatenation.** "You have " + n + "
 *     activities" cannot be translated into a language that puts the verb last
 *     or inflects the noun by number. Every string is whole, with named
 *     placeholders: `"You have {count} activities"`.
 *
 *  2. **It does not pluralise by `n === 1`.** That is correct for English and
 *     wrong for Arabic (six forms), Polish (four), French (zero is singular),
 *     Japanese (one form). `Intl.PluralRules` decides, and a key may carry
 *     `_zero`, `_one`, `_two`, `_few`, `_many` and `_other` variants — the
 *     dictionary supplies whichever its language actually needs.
 *
 *  3. **It does not format dates and numbers itself.** `Intl` does, against
 *     the chosen locale, so 1 234,56 and 1,234.56 and ١٬٢٣٤٫٥٦ are all just
 *     "the number" in the language the user picked.
 *
 * A missing key falls back to English and then to the key itself. Falling back
 * is deliberate and visible rather than throwing: a half-translated language
 * should show English words, not a blank interface.
 */
import { findLanguage, LANGUAGES } from "./languages";
import { en } from "../i18n/en";

/** The English dictionary is the key set: every other language is a subset. */
export type TranslationKey = keyof typeof en;
export type Dictionary = Partial<Record<TranslationKey, string>> & Record<string, string>;

export const FALLBACK_LANGUAGE = "en";

/**
 * English is bundled; every other language is fetched when it is chosen.
 *
 * Four dictionaries are about 25 kB gzipped, and four fifths of them are dead
 * weight for any given reader — bundling them all would put that on every
 * first paint to serve a preference most people never change. English has to
 * be synchronous because it is the fallback: a missing key in *any* language
 * resolves through it, so it can never itself be pending.
 *
 * The consequence is honest and small: for the fraction of a second between
 * choosing a language and its chunk arriving, the interface is in English
 * rather than blank. Nothing waits, nothing flashes empty, and the loaded
 * dictionary is cached for the rest of the session.
 */
const LOADERS: Record<string, () => Promise<Dictionary>> = {
  fr: () => import("../i18n/fr").then((module) => module.fr),
  es: () => import("../i18n/es").then((module) => module.es),
  de: () => import("../i18n/de").then((module) => module.de),
  ar: () => import("../i18n/ar").then((module) => module.ar),
};

export const DICTIONARIES: Record<string, Dictionary> = { en };

const inFlight = new Map<string, Promise<Dictionary | null>>();

/**
 * Fetch a language's strings, once.
 *
 * Resolves to the dictionary, or to null for a language that has none — which
 * is a real, supported state: it still sets the locale, and its strings fall
 * back to English. A failed chunk load is also null rather than a throw,
 * because an interface in English is a far better outcome than no interface.
 */
export function loadDictionary(code: string): Promise<Dictionary | null> {
  const language = findLanguage(code)?.code ?? FALLBACK_LANGUAGE;
  if (DICTIONARIES[language]) return Promise.resolve(DICTIONARIES[language]);
  const loader = LOADERS[language];
  if (!loader) return Promise.resolve(null);

  let pending = inFlight.get(language);
  if (!pending) {
    pending = loader()
      .then((dictionary) => {
        DICTIONARIES[language] = dictionary;
        return dictionary;
      })
      .catch(() => null);
    inFlight.set(language, pending);
  }
  return pending;
}

/** True once a language's strings are in memory and `t` will return them. */
export function isDictionaryLoaded(code: string): boolean {
  const language = findLanguage(code)?.code ?? FALLBACK_LANGUAGE;
  return DICTIONARIES[language] != null;
}

/**
 * The language actually in use, given a stored preference.
 *
 * Order: the stored preference, the browser's, then English. A stored value
 * that names no known language is ignored rather than honoured — the
 * alternative is an interface in a language that does not exist.
 */
export function resolveLanguage(stored: string | null | undefined, navigatorLanguages?: readonly string[]): string {
  const chosen = findLanguage(stored);
  if (chosen) return chosen.code;
  const candidates = navigatorLanguages ?? (typeof navigator !== "undefined" ? navigator.languages : undefined) ?? [];
  for (const candidate of candidates) {
    const match = findLanguage(candidate);
    if (match) return match.code;
  }
  return FALLBACK_LANGUAGE;
}

/** The dictionary for a language, or the closest one that exists. */
export function dictionaryFor(code: string): Dictionary {
  return (
    DICTIONARIES[code] ??
    DICTIONARIES[code.split("-")[0]] ??
    DICTIONARIES[FALLBACK_LANGUAGE]
  );
}

/** True when interface strings *exist* for this language, loaded or not. */
export function isTranslated(code: string): boolean {
  return LANGUAGES.some((language) => language.code === code && language.translated === true);
}

export interface TranslateParams {
  /** Selects the plural form and is available as `{count}`. */
  count?: number;
  [key: string]: string | number | null | undefined;
}

export type Translator = ((key: TranslationKey | string, params?: TranslateParams) => string) & {
  language: string;
  /** True when the script runs right to left. */
  rtl: boolean;
};

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules(FALLBACK_LANGUAGE);
    }
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/**
 * Look up one string.
 *
 * With a `count`, the plural category comes from `Intl.PluralRules` for the
 * *active* locale, and the suffixed key is tried before the bare one — so
 * `activities_one` / `activities_other` in English and `activities_zero`,
 * `_one`, `_two`, `_few`, `_many`, `_other` in Arabic all resolve from the
 * same call site. `_other` is the safety net, and it is what a language with
 * one form (Japanese, Turkish) supplies alone.
 */
export function translate(
  dictionary: Dictionary,
  locale: string,
  key: string,
  params?: TranslateParams,
): string {
  const fallback = DICTIONARIES[FALLBACK_LANGUAGE];
  const lookup = (candidate: string): string | undefined =>
    dictionary[candidate] ?? fallback[candidate as TranslationKey];

  let template: string | undefined;
  if (params && typeof params.count === "number") {
    const category = pluralRules(locale).select(params.count);
    template = lookup(`${key}_${category}`) ?? lookup(`${key}_other`);
  }
  template ??= lookup(key);
  // The key itself, not an empty string: a missing translation should be
  // obvious in the interface and greppable in a screenshot.
  if (template == null) return key;

  return interpolate(template, params, locale);
}

/**
 * Substitute `{named}` placeholders.
 *
 * Numbers go through `Intl.NumberFormat` for the active locale, so a count
 * inside a sentence is grouped and digit-shaped like every other number on the
 * screen. An unknown placeholder is left exactly as written rather than
 * becoming "undefined" — a visible `{total}` is a bug report; the word
 * "undefined" in a financial sentence is a support ticket.
 */
function interpolate(template: string, params: TranslateParams | undefined, locale: string): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value == null) return match;
    /*
     * A month number is a name, not a quantity.
     *
     * `storedText` sites that write a ledger row before a language exists
     * (see domain/storedText.ts) can only pass the month as a number — a
     * name baked in at write time would freeze that row in whatever
     * language was active the day it was written. `{month}` is therefore
     * the one placeholder resolved to a *word* here rather than formatted
     * as a number; every other caller that already has a localized label
     * (a full "September 2026" string, say) passes a string and is
     * untouched by this branch.
     */
    if (name === "month" && typeof value === "number") {
      return monthNames(locale)[value - 1] ?? String(value);
    }
    if (typeof value !== "number") return String(value);
    /*
     * A year is a label, not a quantity.
     *
     * Every other number here wants its locale's grouping — 1 234,56 — and
     * this one does not: the statistics page was headed "Spending through
     * 2,026". Keyed on the placeholder's *name* rather than on its magnitude,
     * because 2026 is not distinguishable from a sum of money by looking at
     * it, and a rule about what a value *is* belongs with its name.
     */
    const isYear = name === "year" || /Year$/.test(name);
    return formatNumber(value, locale, isYear ? { useGrouping: false } : {});
  });
}

/** Build a translator bound to one language. */
export function createTranslator(code: string): Translator {
  const language = findLanguage(code)?.code ?? FALLBACK_LANGUAGE;
  const dictionary = dictionaryFor(language);
  const translator = ((key: string, params?: TranslateParams) =>
    translate(dictionary, language, key, params)) as Translator;
  translator.language = language;
  translator.rtl = findLanguage(language)?.rtl === true;
  return translator;
}

// ─── Locale-aware formatting ─────────────────────────────────────────────────

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, options);
    } catch {
      formatter = new Intl.NumberFormat(FALLBACK_LANGUAGE, options);
    }
    numberFormatCache.set(cacheKey, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, locale: string, options: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return "—";
  return numberFormat(locale, options).format(value);
}

/** A percentage, with one decimal and the locale's own percent sign. */
export function formatPercent(value: number, locale: string, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return numberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

const dateFormatCache = new Map<string, Intl.DateTimeFormat>();

export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatCache.get(cacheKey);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, options);
    } catch {
      formatter = new Intl.DateTimeFormat(FALLBACK_LANGUAGE, options);
    }
    dateFormatCache.set(cacheKey, formatter);
  }
  return formatter.format(date);
}

/**
 * Join a list the way the language does: "a, b and c" / "a, b y c" / "أ وب وج".
 *
 * Hard-coding " and " is the same class of mistake as hard-coding a plural
 * rule, and it appears in exactly the same places — a list of category names
 * in a warning, a list of months in a report.
 */
export function formatList(items: string[], locale: string, type: "conjunction" | "disjunction" = "conjunction"): string {
  if (items.length === 0) return "";
  try {
    return new Intl.ListFormat(locale, { style: "long", type }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** Month names in the active locale, for pickers and axis labels. */
export function monthNames(locale: string, format: "long" | "short" = "long"): string[] {
  return Array.from({ length: 12 }, (_, index) =>
    formatDate(new Date(2021, index, 1), locale, { month: format }),
  );
}
