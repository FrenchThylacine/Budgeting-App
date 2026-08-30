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
 */
export type TabKey =
  | "dashboard"
  | "activities"
  | "spending"
  | "wishlist"
  | "wallet"
  | "analytics"
  | "scenarios"
  | "history"
  | "report"
  | "settings"
  | "categories"
  | "currencies";
