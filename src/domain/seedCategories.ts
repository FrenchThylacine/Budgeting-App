import type { BudgetCategory, SeedCategoryKey } from "./types";

/**
 * The categories every new budget starts with.
 *
 * This is a template, not data: `id` is assigned per budget when the snapshot
 * is created, because `categories.id` is a primary key shared by every budget
 * in the database. Only `seedKey` is stable, and it is what the rest of the app
 * matches on.
 */
export const SEED_CATEGORIES: {
  seedKey: SeedCategoryKey;
  name: string;
  bucket: BudgetCategory["bucket"];
  color: string;
}[] = [
  { seedKey: "cat-health", name: "Health", bucket: "general", color: "#16A34A" },
  { seedKey: "cat-learning", name: "Learning", bucket: "general", color: "#2563EB" },
  { seedKey: "cat-piloting", name: "Piloting", bucket: "piloting", color: "#F59E0B" },
  { seedKey: "cat-utilities", name: "Utilities", bucket: "general", color: "#0D9488" },
  { seedKey: "cat-software", name: "Software", bucket: "general", color: "#7C3AED" },
  { seedKey: "cat-tech", name: "Tech & Gear", bucket: "personal", color: "#E11D48" },
  { seedKey: "cat-other", name: "Other", bucket: "general", color: "#64748B" },
  { seedKey: "cat-spending", name: "Imported Spending", bucket: "general", color: "#475569" },
  { seedKey: "cat-wallet", name: "Wallet", bucket: "wallet", color: "#0891B2" },
  { seedKey: "cat-wishlist", name: "Wishlist", bucket: "personal", color: "#DB2777" },
];

/**
 * Build a fresh set of seed categories with ids unique to one budget.
 *
 * Every call returns new objects. The previous export was a shared module-level
 * array, so adding a category to a snapshot mutated the constant and leaked
 * into the next snapshot created in the same process.
 */
export function createSeedCategories(makeId: (seedKey: SeedCategoryKey) => string): BudgetCategory[] {
  return SEED_CATEGORIES.map((template) => ({
    id: makeId(template.seedKey),
    seedKey: template.seedKey,
    name: template.name,
    bucket: template.bucket,
    color: template.color,
  }));
}

/**
 * Find the category a seed key refers to.
 *
 * Falls back to matching the id because budgets created before seed keys
 * existed still carry the key value as their row id. Migration 006 backfills
 * `seed_key` for exactly those rows, so this fallback is belt-and-braces rather
 * than the primary path.
 */
export function findSeedCategory(
  categories: readonly BudgetCategory[],
  seedKey: SeedCategoryKey,
): BudgetCategory | undefined {
  return (
    categories.find((category) => category.seedKey === seedKey) ??
    categories.find((category) => category.id === seedKey)
  );
}

/**
 * Resolve a seed key to a usable category id.
 *
 * Returns `undefined` rather than inventing an id when the category is absent
 * and there is nothing to fall back to. Every caller writes this value into a
 * foreign key, and `activities.category_id` and `spending_entries.category_id`
 * are both `ON DELETE RESTRICT` — a fabricated id fails the whole transaction
 * with an opaque constraint error instead of a message anyone can act on.
 */
export function seedCategoryId(
  categories: readonly BudgetCategory[],
  seedKey: SeedCategoryKey,
): string | undefined {
  return findSeedCategory(categories, seedKey)?.id;
}

/**
 * Resolve a seed key, falling back to `cat-other` and then to the first
 * category present. For the display and import paths where "some category" is
 * genuinely better than failing.
 */
export function seedCategoryIdOrFallback(
  categories: readonly BudgetCategory[],
  seedKey: SeedCategoryKey,
): string | undefined {
  return (
    seedCategoryId(categories, seedKey) ??
    seedCategoryId(categories, "cat-other") ??
    categories[0]?.id
  );
}
