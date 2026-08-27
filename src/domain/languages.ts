/**
 * The languages the selector offers.
 *
 * Two facts per entry, and they are deliberately separate:
 *
 *  - **`nativeName`** is how the language names itself. A language list that
 *    reads "German, Spanish, Arabic" is only useful to somebody who already
 *    reads English — which is exactly the person who does not need the list.
 *  - **`translated`** says whether the interface strings exist for it. A
 *    language without them still sets the *locale*: dates, numbers, currency
 *    grouping and plural rules all follow it, and the strings fall back to
 *    English. That is a real, useful state, and the picker labels it rather
 *    than pretending a translation exists.
 *
 * `rtl` drives `dir="rtl"` on the document, so an Arabic or Hebrew interface
 * lays out correctly rather than being English with different words in it.
 */

export interface LanguageDefinition {
  /** BCP 47 tag, used verbatim as the `Intl` locale. */
  code: string;
  /** English name, so the list is searchable in English too. */
  name: string;
  /** The language's own name for itself. */
  nativeName: string;
  /** True when the script runs right to left. */
  rtl?: boolean;
  /** True when interface strings are bundled for this language. */
  translated?: boolean;
}

export const LANGUAGES: LanguageDefinition[] = [
  { code: "en", name: "English", nativeName: "English", translated: true },
  { code: "fr", name: "French", nativeName: "Français", translated: true },
  { code: "es", name: "Spanish", nativeName: "Español", translated: true },
  { code: "de", name: "German", nativeName: "Deutsch", translated: true },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true, translated: true },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "sq", name: "Albanian", nativeName: "Shqip" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ" },
  { code: "hy", name: "Armenian", nativeName: "Հայերեն" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca" },
  { code: "eu", name: "Basque", nativeName: "Euskara" },
  { code: "be", name: "Belarusian", nativeName: "Беларуская" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "bs", name: "Bosnian", nativeName: "Bosanski" },
  { code: "bg", name: "Bulgarian", nativeName: "Български" },
  { code: "my", name: "Burmese", nativeName: "မြန်မာ" },
  { code: "ca", name: "Catalan", nativeName: "Català" },
  { code: "zh-Hans", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-Hant", name: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "et", name: "Estonian", nativeName: "Eesti" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "gl", name: "Galician", nativeName: "Galego" },
  { code: "ka", name: "Georgian", nativeName: "ქართული" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "is", name: "Icelandic", nativeName: "Íslenska" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша" },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ku", name: "Kurdish", nativeName: "Kurdî" },
  { code: "lo", name: "Lao", nativeName: "ລາວ" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "mt", name: "Maltese", nativeName: "Malti" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "mn", name: "Mongolian", nativeName: "Монгол" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली" },
  { code: "nb", name: "Norwegian Bokmål", nativeName: "Norsk bokmål" },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "sr", name: "Serbian", nativeName: "Српски" },
  { code: "si", name: "Sinhala", nativeName: "සිංහල" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "so", name: "Somali", nativeName: "Soomaali" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbekcha" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "cy", name: "Welsh", nativeName: "Cymraeg" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
];

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code.toLowerCase(), language]));

export function findLanguage(code: string | null | undefined): LanguageDefinition | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  return BY_CODE.get(lower) ?? BY_CODE.get(lower.split("-")[0]);
}

/**
 * Search by code, English name or native name.
 *
 * A selector with seventy-six entries is unusable without one, and somebody
 * looking for their own language will type its native name at least as often
 * as its English one — so both are searched, accent-folded, and an exact code
 * ranks first.
 */
export function searchLanguages(query: string): LanguageDefinition[] {
  const needle = fold(query);
  if (!needle) return LANGUAGES;
  const scored: { language: LanguageDefinition; rank: number }[] = [];
  for (const language of LANGUAGES) {
    const code = fold(language.code);
    const name = fold(language.name);
    const native = fold(language.nativeName);
    let rank: number | null = null;
    if (code === needle) rank = 0;
    else if (name.startsWith(needle) || native.startsWith(needle)) rank = 1;
    else if (code.startsWith(needle)) rank = 2;
    else if (name.includes(needle) || native.includes(needle)) rank = 3;
    if (rank != null) scored.push({ language, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).map((entry) => entry.language);
}

function fold(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
