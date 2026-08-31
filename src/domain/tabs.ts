/**
 * The application's destinations, named once
 * ==========================================
 *
 * This union was written out three times — in `App`, in `Sidebar` and in
 * `MobileNav` — and the three were kept in step by hand. They drifted the
 * first time a tab was added: the shell knew about it and the two navigations
 * did not, so the build reported "two different types with this name exist,
 * but they are unrelated", which is TypeScript describing a copy-paste.
 *
 * It lives in `domain` rather than beside a component because all three
 * importers are components and none of them owns it.
 *
 * `currencies` and `history` are deliberately absent. Choosing which currencies to track and
 * what the rates are is configuration, and it had a permanent seat in the
 * navigation beside Dashboard and Spending; it is a group inside Settings now. The
 * financial record was a fourth destination competing with the dashboard; it
 * is a section on Statistics, which is where somebody is already looking at
 * the numbers it explains.
 */
export type TabKey =
  | "dashboard"
  | "activities"
  | "spending"
  | "wishlist"
  | "wallet"
  | "analytics"
  | "scenarios"
  | "report"
  | "settings"
  | "categories";
