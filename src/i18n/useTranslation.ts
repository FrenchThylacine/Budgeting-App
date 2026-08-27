import { useEffect, useMemo, useState } from "react";
import { useBudgetStore } from "../store/budgetStore";
import { setNumberLocale } from "../domain/currency";
import { findLanguage } from "../domain/languages";
import {
  createTranslator,
  isDictionaryLoaded,
  loadDictionary,
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
  monthNames,
  resolveLanguage,
  type Translator,
} from "../domain/i18n";

/**
 * The one hook components use for text.
 *
 * It reads the chosen language from settings — so the choice syncs across
 * devices like every other preference — and returns a translator bound to it
 * along with locale-aware formatters. Components never import a dictionary and
 * never see a language code.
 *
 * The side effects (document `lang`, `dir`, and the locale every
 * `toLocaleString` in the app uses) are applied here rather than in a provider
 * because there is exactly one source for them and no component needs to know
 * they happened.
 */
export interface Localisation {
  t: Translator;
  language: string;
  rtl: boolean;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number, digits?: number) => string;
  formatList: (items: string[], type?: "conjunction" | "disjunction") => string;
  monthNames: (format?: "long" | "short") => string[];
}

export function useTranslation(): Localisation {
  const stored = useBudgetStore((state) => state.snapshot.settings.language);
  const language = useMemo(() => resolveLanguage(stored), [stored]);
  const rtl = findLanguage(language)?.rtl === true;

  /*
   * Fetch the chosen language's strings, then re-render.
   *
   * Only English is bundled — see `loadDictionary`. Until the chunk arrives
   * the translator answers in English rather than in blanks, and `ready`
   * flips once, which is what turns the loaded dictionary into visible text.
   * A language that has no dictionary resolves immediately, so its locale
   * formatting is live from the first frame.
   */
  const [ready, setReady] = useState(() => isDictionaryLoaded(language));
  useEffect(() => {
    if (isDictionaryLoaded(language)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void loadDictionary(language).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // `ready` is in the dependency list precisely so the translator is rebuilt
  // — and every consumer re-rendered — the moment the strings land.
  const t = useMemo(() => createTranslator(language), [language, ready]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    // `dir` on the root, not a CSS class: the browser's own bidi algorithm,
    // form controls, scrollbars and text selection all key off it, and none of
    // them can be persuaded by a stylesheet alone.
    root.dir = rtl ? "rtl" : "ltr";
    // Every `toLocaleString` in the app — money, dates, counts — answers to one
    // locale rather than to the browser's on one screen and the chosen
    // language's on another.
    setNumberLocale(language);
    return () => {
      root.dir = "ltr";
      setNumberLocale(undefined);
    };
  }, [language, rtl]);

  return useMemo(
    () => ({
      t,
      language,
      rtl,
      formatDate: (value, options) => formatDate(value, language, options),
      formatNumber: (value, options) => formatNumber(value, language, options),
      formatPercent: (value, digits) => formatPercent(value, language, digits),
      formatList: (items, type) => formatList(items, language, type),
      monthNames: (format) => monthNames(language, format),
    }),
    [t, language, rtl],
  );
}
