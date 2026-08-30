/**
 * Text that is written to the database and read back in whatever language the
 * reader is using at the time.
 *
 * ─── The problem ─────────────────────────────────────────────────────────────
 *
 * The store writes sentences into permanent records: "Added activity Padel"
 * into the audit trail, "Budget for August 2026" into the wallet ledger. Those
 * rows outlive the session that wrote them, and the store has no language —
 * it is called from a Zustand action, not from a component with a translator.
 *
 * Writing the sentence in English froze it: a French user who changed the
 * language afterwards still read English history, because the English was in
 * PostgreSQL rather than on the screen. Writing it in the *current* language
 * would be worse — a budget would end up with a history in three languages,
 * one per session, and nothing could ever put it right.
 *
 * ─── The answer ──────────────────────────────────────────────────────────────
 *
 * The store writes a **sigil**: `@key` for a fixed string, or
 * `@key|name=value` for one with substitutions. The interface resolves it at
 * render time, in the language being read *now*.
 *
 * Anything the user typed is stored exactly as typed and never begins with `@`,
 * so it passes through untouched. That is the whole point: their words are
 * never run through a dictionary, and a translation never rewrites a note.
 *
 * A row written before this existed carries a finished English sentence. It
 * keeps it. Rewriting saved records to change their wording would destroy
 * history in order to fix a display, which is a worse bug than the one it
 * fixes.
 */

export type StoredTextParams = Record<string, string | number | null | undefined>;

const SIGIL = "@";

/**
 * Encode a translation key and its values into one storable string.
 *
 * Values are percent-encoded, so a category called "Food | Drink" or an
 * activity called "50=50 split" cannot break the parse. Keys never need it.
 */
export function storedText(key: string, params?: StoredTextParams): string {
  const parts = [key];
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value == null) continue;
    parts.push(`${name}=${encodeURIComponent(String(value))}`);
  }
  return SIGIL + parts.join("|");
}

/** True when a stored string is a sigil rather than something a user wrote. */
export function isStoredText(value: string): boolean {
  return value.startsWith(SIGIL);
}

/**
 * Resolve a stored string for display.
 *
 * Two encodings are understood, and both have to be:
 *
 *  - `@key|name=value` — what `storedText` writes.
 *  - `@key|first|second` — the positional form the wallet ledger used before
 *    this module existed, whose one key takes a month and a year. Rows in that
 *    form are already in people's databases.
 */
export function resolveStoredText(
  value: string,
  t: (key: string, params?: StoredTextParams) => string,
): string {
  if (!value || !isStoredText(value)) return value;
  const [key, ...rest] = value.slice(SIGIL.length).split("|");
  if (rest.length === 0) return t(key);

  if (rest.every((part) => part.includes("="))) {
    const params: StoredTextParams = {};
    for (const part of rest) {
      const index = part.indexOf("=");
      params[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
    }
    return t(key, params).trim();
  }

  // Legacy positional: month, then year.
  return t(key, { month: rest[0] ?? "", year: rest[1] ?? "" }).trim();
}
