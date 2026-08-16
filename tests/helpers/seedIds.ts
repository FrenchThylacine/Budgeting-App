import { seedCategoryId } from "../../src/domain/seedCategories";
import type { BudgetSnapshot, SeedCategoryKey } from "../../src/domain/types";

/**
 * The id a seeded category has *in this snapshot*.
 *
 * Tests used to write `"cat-piloting"` directly, which worked only because the
 * seed hardcoded its row ids — the very thing that made two budgets in one
 * database overwrite each other. Ids are now generated per budget, so a test
 * that wants "the piloting category" has to ask for it.
 */
export function catId(snapshot: BudgetSnapshot, key: SeedCategoryKey): string {
  const id = seedCategoryId(snapshot.categories, key);
  if (!id) throw new Error(`Seed category "${key}" is not present in this snapshot.`);
  return id;
}
