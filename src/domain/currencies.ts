/**
 * The currency dataset
 * ====================
 *
 * ISO 4217 active codes, with the name, the symbol people actually recognise,
 * and the number of minor units the currency really has. Ten currencies were
 * hardcoded here before, which meant the app could not record a single amount
 * in any of the other one hundred and fifty.
 *
 * Two rules shape the table below.
 *
 * **Order is deliberate, not alphabetical.** The first ten entries are the ten
 * this application shipped with, in the order it shipped them. Everything a
 * budget written before this file existed relies on — the order of the tracked
 * list, the default pinned set — is therefore unchanged, and the rest of the
 * world is appended alphabetically behind them.
 *
 * **Decimals are a property of the currency.** The yen has none and the dinar
 * has three; formatting every currency to two is wrong in both directions —
 * "¥ 1 200,00" is not how a price is written in Japan, and rounding a Kuwaiti
 * amount to two decimals loses a real unit of money. `currencyDecimals` is the
 * single place that knows.
 */

export interface CurrencyDefinition {
  code: string;
  /** English name, for the searchable picker. */
  name: string;
  /** The symbol to print. Falls back to the code where there is no short one. */
  symbol: string;
  /** Minor units, per ISO 4217. */
  decimals: number;
}

/**
 * Every currency the application knows.
 *
 * The leading ten are the historical list, in their historical order — see the
 * note above. `as const` so `CurrencyCode` is the union of exactly these codes
 * rather than `string`: a typo in a code is then a compile error instead of an
 * amount that silently converts one-for-one.
 */
export const CURRENCY_DEFINITIONS = [
  // ── The ten this app shipped with, in their original order ────────────────
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "LBP", name: "Lebanese Pound", symbol: "L.L.", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },

  // ── The rest of ISO 4217, alphabetically by code ──────────────────────────
  { code: "AFN", name: "Afghan Afghani", symbol: "؋", decimals: 2 },
  { code: "ALL", name: "Albanian Lek", symbol: "L", decimals: 2 },
  { code: "AMD", name: "Armenian Dram", symbol: "֏", decimals: 2 },
  { code: "ANG", name: "Netherlands Antillean Guilder", symbol: "ƒ", decimals: 2 },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$", decimals: 2 },
  { code: "AWG", name: "Aruban Florin", symbol: "ƒ", decimals: 2 },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "₼", decimals: 2 },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", symbol: "KM", decimals: 2 },
  { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", decimals: 2 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD", decimals: 3 },
  { code: "BIF", name: "Burundian Franc", symbol: "FBu", decimals: 0 },
  { code: "BMD", name: "Bermudian Dollar", symbol: "BD$", decimals: 2 },
  { code: "BND", name: "Brunei Dollar", symbol: "B$", decimals: 2 },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "BSD", name: "Bahamian Dollar", symbol: "B$", decimals: 2 },
  { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu.", decimals: 2 },
  { code: "BWP", name: "Botswanan Pula", symbol: "P", decimals: 2 },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br", decimals: 2 },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$", decimals: 2 },
  { code: "CDF", name: "Congolese Franc", symbol: "FC", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "COP", name: "Colombian Peso", symbol: "CO$", decimals: 2 },
  { code: "CRC", name: "Costa Rican Colón", symbol: "₡", decimals: 2 },
  { code: "CUP", name: "Cuban Peso", symbol: "₱", decimals: 2 },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "$", decimals: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2 },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj", decimals: 0 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$", decimals: 2 },
  { code: "DZD", name: "Algerian Dinar", symbol: "DA", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk", decimals: 2 },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", decimals: 2 },
  { code: "FJD", name: "Fijian Dollar", symbol: "FJ$", decimals: 2 },
  { code: "FKP", name: "Falkland Islands Pound", symbol: "FK£", decimals: 2 },
  { code: "GEL", name: "Georgian Lari", symbol: "₾", decimals: 2 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", decimals: 2 },
  { code: "GIP", name: "Gibraltar Pound", symbol: "£", decimals: 2 },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D", decimals: 2 },
  { code: "GNF", name: "Guinean Franc", symbol: "FG", decimals: 0 },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q", decimals: 2 },
  { code: "GYD", name: "Guyanaese Dollar", symbol: "G$", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
  { code: "HNL", name: "Honduran Lempira", symbol: "L", decimals: 2 },
  { code: "HTG", name: "Haitian Gourde", symbol: "G", decimals: 2 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimals: 2 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 2 },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "IQD", name: "Iraqi Dinar", symbol: "ID", decimals: 3 },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼", decimals: 2 },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr", decimals: 0 },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$", decimals: 2 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", decimals: 3 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "KGS", name: "Kyrgystani Som", symbol: "с", decimals: 2 },
  { code: "KHR", name: "Cambodian Riel", symbol: "៛", decimals: 2 },
  { code: "KMF", name: "Comorian Franc", symbol: "CF", decimals: 0 },
  { code: "KPW", name: "North Korean Won", symbol: "₩", decimals: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimals: 3 },
  { code: "KYD", name: "Cayman Islands Dollar", symbol: "CI$", decimals: 2 },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸", decimals: 2 },
  { code: "LAK", name: "Laotian Kip", symbol: "₭", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2 },
  { code: "LRD", name: "Liberian Dollar", symbol: "L$", decimals: 2 },
  { code: "LSL", name: "Lesotho Loti", symbol: "L", decimals: 2 },
  { code: "LYD", name: "Libyan Dinar", symbol: "LD", decimals: 3 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH", decimals: 2 },
  { code: "MDL", name: "Moldovan Leu", symbol: "L", decimals: 2 },
  { code: "MGA", name: "Malagasy Ariary", symbol: "Ar", decimals: 2 },
  { code: "MKD", name: "Macedonian Denar", symbol: "ден", decimals: 2 },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K", decimals: 2 },
  { code: "MNT", name: "Mongolian Tugrik", symbol: "₮", decimals: 2 },
  { code: "MOP", name: "Macanese Pataca", symbol: "MOP$", decimals: 2 },
  { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM", decimals: 2 },
  { code: "MUR", name: "Mauritian Rupee", symbol: "Rs", decimals: 2 },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf", decimals: 2 },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT", decimals: 2 },
  { code: "NAD", name: "Namibian Dollar", symbol: "N$", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "NIO", name: "Nicaraguan Córdoba", symbol: "C$", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", decimals: 3 },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/.", decimals: 2 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", decimals: 2 },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs", decimals: 2 },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", decimals: 2 },
  { code: "PYG", name: "Paraguayan Guarani", symbol: "₲", decimals: 0 },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR", decimals: 2 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", decimals: 2 },
  { code: "RSD", name: "Serbian Dinar", symbol: "дин", decimals: 2 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", decimals: 2 },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", decimals: 0 },
  { code: "SBD", name: "Solomon Islands Dollar", symbol: "SI$", decimals: 2 },
  { code: "SCR", name: "Seychellois Rupee", symbol: "SR", decimals: 2 },
  { code: "SDG", name: "Sudanese Pound", symbol: "SDG", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "SHP", name: "Saint Helena Pound", symbol: "£", decimals: 2 },
  { code: "SLE", name: "Sierra Leonean Leone", symbol: "Le", decimals: 2 },
  { code: "SOS", name: "Somali Shilling", symbol: "Sh", decimals: 2 },
  { code: "SRD", name: "Surinamese Dollar", symbol: "SR$", decimals: 2 },
  { code: "SSP", name: "South Sudanese Pound", symbol: "SSP", decimals: 2 },
  { code: "STN", name: "São Tomé and Príncipe Dobra", symbol: "Db", decimals: 2 },
  { code: "SVC", name: "Salvadoran Colón", symbol: "₡", decimals: 2 },
  { code: "SYP", name: "Syrian Pound", symbol: "S£", decimals: 2 },
  { code: "SZL", name: "Swazi Lilangeni", symbol: "E", decimals: 2 },
  { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2 },
  { code: "TJS", name: "Tajikistani Somoni", symbol: "SM", decimals: 2 },
  { code: "TMT", name: "Turkmenistani Manat", symbol: "m", decimals: 2 },
  { code: "TND", name: "Tunisian Dinar", symbol: "DT", decimals: 3 },
  { code: "TOP", name: "Tongan Paʻanga", symbol: "T$", decimals: 2 },
  { code: "TTD", name: "Trinidad & Tobago Dollar", symbol: "TT$", decimals: 2 },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", decimals: 2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", decimals: 2 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", decimals: 2 },
  { code: "UZS", name: "Uzbekistani Som", symbol: "so'm", decimals: 2 },
  { code: "VES", name: "Venezuelan Bolívar", symbol: "Bs.", decimals: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimals: 0 },
  { code: "VUV", name: "Vanuatu Vatu", symbol: "VT", decimals: 0 },
  { code: "WST", name: "Samoan Tala", symbol: "WS$", decimals: 2 },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", decimals: 0 },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$", decimals: 2 },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA", decimals: 0 },
  { code: "XPF", name: "CFP Franc", symbol: "₣", decimals: 0 },
  { code: "YER", name: "Yemeni Rial", symbol: "﷼", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", decimals: 2 },
  { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZiG", decimals: 2 },
] as const satisfies readonly CurrencyDefinition[];

/**
 * Every code the application accepts.
 *
 * A union rather than `string`, so a mistyped code is a compile error instead
 * of an amount that silently converts one-for-one.
 */
export type CurrencyCode = (typeof CURRENCY_DEFINITIONS)[number]["code"];

/** Canonical order: the historical ten, then the rest alphabetically. */
export const ALL_CURRENCY_CODES: CurrencyCode[] = CURRENCY_DEFINITIONS.map((entry) => entry.code);

const BY_CODE = new Map<string, CurrencyDefinition>(
  CURRENCY_DEFINITIONS.map((entry) => [entry.code, entry]),
);

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && BY_CODE.has(value);
}

export function currencyDefinition(code: string): CurrencyDefinition | undefined {
  return BY_CODE.get(code);
}

/** The currency's own name, for pickers and reports. */
export function currencyName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}

/** Minor units. Two is only the *most common* answer, never the assumed one. */
export function currencyDecimals(code: string): number {
  return BY_CODE.get(code)?.decimals ?? 2;
}

/**
 * Search the whole dataset by code or name.
 *
 * Code matches rank first — somebody typing "CHF" wants the franc, not every
 * currency whose name happens to contain those letters — then a name prefix,
 * then anything containing the query. Case- and accent-insensitive, so "cordoba"
 * finds the córdoba.
 */
export function searchCurrencies(query: string, codes: readonly string[] = ALL_CURRENCY_CODES): CurrencyCode[] {
  const needle = fold(query);
  if (!needle) return codes.filter(isCurrencyCode);

  const scored: { code: CurrencyCode; rank: number }[] = [];
  for (const code of codes) {
    if (!isCurrencyCode(code)) continue;
    const definition = BY_CODE.get(code)!;
    const foldedCode = fold(code);
    const foldedName = fold(definition.name);
    let rank: number | null = null;
    if (foldedCode === needle) rank = 0;
    else if (foldedCode.startsWith(needle)) rank = 1;
    else if (foldedName.startsWith(needle)) rank = 2;
    else if (foldedName.includes(needle)) rank = 3;
    else if (fold(definition.symbol) === needle) rank = 4;
    if (rank != null) scored.push({ code, rank });
  }
  // Stable within a rank: the canonical order is preserved, so the list does
  // not reshuffle as the query is typed.
  return scored.sort((a, b) => a.rank - b.rank).map((entry) => entry.code);
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
