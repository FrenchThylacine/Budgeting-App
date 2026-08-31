import { createTranslator } from "../../src/domain/i18n";

/**
 * A real translator, for tests that assert on wording
 * ===================================================
 *
 * Several domain functions used to take an *optional* translator and carry an
 * English sentence beside every key "for a test or an export". There was no
 * such caller: every screen passes one, and the only code that ever took the
 * other branch was the test asserting the English it produced. So the fallback
 * was a second, unmaintained copy of the wording — kept alive by the test that
 * checked it, and duly found in an audit as untranslated text.
 *
 * The translator is required now, and tests use this. It is the application's
 * own English dictionary, not a stub, which makes these assertions stronger
 * than they were: a key that goes missing fails here rather than silently
 * falling through to a hard-coded string that agreed with the assertion.
 *
 * English is bundled rather than loaded on demand — it is the fallback every
 * other language falls back *to* — so no awaiting is needed.
 */
export const t = createTranslator("en");
