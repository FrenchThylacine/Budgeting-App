import { afterEach, describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { getIsoWeek, todayDateInput, weekYear } from "../src/domain/dates";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  colorForSeed,
  comparePriority,
  faviconUrl,
  isActiveWishlistItem,
  isUsableAmount,
  itemDomain,
  normalizeItemUrl,
  parseItemUrl,
  priorityRank,
  purchaseDefaults,
  sortWishlistItems,
  wishlistCardGradient,
  wishlistItemAccent,
  withAlpha,
} from "../src/domain/wishlist";
import type { BudgetSnapshot, WishlistItem, WishlistPriority } from "../src/domain/types";
import { useBudgetStore } from "../src/store/budgetStore";
import { wishlistPayloadFromDraft, wishlistToDraft } from "../src/utils/formatters";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const YEAR_KEY = String(CURRENT_YEAR);

function makeItem(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: "wish-test",
    name: "Studio headphones",
    categoryId: "cat-wishlist",
    actualPrice: 120,
    effectiveValue: 120,
    currency: "EUR",
    bought: false,
    inWishlist: true,
    priority: "medium",
    dateAdded: NOW.toISOString(),
    notes: "",
    active: true,
    ...overrides,
  };
}

/**
 * A snapshot whose selected period is the real current one, so the store's
 * historical guard behaves the same whatever day the suite runs on.
 */
function currentPeriodSnapshot(items: WishlistItem[] = [makeItem()]): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.selectedPeriodMode = "month";
  snapshot.settings.selectedYear = CURRENT_YEAR;
  snapshot.settings.selectedMonth = NOW.getMonth() + 1;
  snapshot.settings.selectedWeek = getIsoWeek(NOW);
  snapshot.settings.selectedWeekYear = weekYear(NOW);

  snapshot.years[YEAR_KEY] = {
    year: CURRENT_YEAR,
    activities: [],
    spendingEntries: [],
    wishlistItems: items,
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  return snapshot;
}

function install(snapshot: BudgetSnapshot) {
  useBudgetStore.setState({
    snapshot,
    hydrated: true,
    undoStack: [],
    redoStack: [],
    historicalEditUnlocked: false,
  });
  return snapshot;
}

const store = () => useBudgetStore.getState();
const yearRecord = () => store().snapshot.years[YEAR_KEY];
const itemById = (id: string) => yearRecord().wishlistItems.find((item) => item.id === id);
const entryById = (id: string) =>
  Object.values(store().snapshot.years)
    .flatMap((record) => record.spendingEntries)
    .find((entry) => entry.id === id);
const allEntries = () =>
  Object.values(store().snapshot.years).flatMap((record) => record.spendingEntries);

afterEach(() => {
  install(createSeedBudgetSnapshot(NOW));
});

// ─── 1. Priority ordering (regression) ────────────────────────────────────────

describe("wishlist priority ordering", () => {
  it("ranks high first and dream last", () => {
    // "dream" is an aspiration, not a claim on this month's budget: it must
    // never outrank something the user actually plans to buy.
    expect([...PRIORITY_ORDER]).toEqual(["high", "medium", "low", "dream"]);
    expect(priorityRank("high")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
    expect(priorityRank("low")).toBeLessThan(priorityRank("dream"));
    expect(priorityRank("dream")).toBe(PRIORITY_ORDER.length - 1);
  });

  it("sorts a mixed list most to least urgent", () => {
    const priorities: WishlistPriority[] = ["dream", "low", "high", "medium"];
    const items = priorities.map((priority, index) =>
      makeItem({ id: `wish-${index}`, name: `Item ${index}`, priority }),
    );

    expect(sortWishlistItems(items).map((item) => item.priority)).toEqual([
      "high",
      "medium",
      "low",
      "dream",
    ]);
  });

  it("never places a dream above a high priority item", () => {
    const dream = makeItem({ id: "a", name: "Aaa cabin", priority: "dream" });
    const high = makeItem({ id: "b", name: "Zzz laptop", priority: "high" });

    expect(sortWishlistItems([dream, high])[0].id).toBe("b");
    expect(comparePriority("dream", "high")).toBeGreaterThan(0);
    expect(comparePriority("high", "dream")).toBeLessThan(0);
  });

  it("sinks bought items and breaks ties by name", () => {
    const items = [
      makeItem({ id: "1", name: "Bravo", priority: "high", bought: true }),
      makeItem({ id: "2", name: "Charlie", priority: "low" }),
      makeItem({ id: "3", name: "Alpha", priority: "low" }),
    ];

    expect(sortWishlistItems(items).map((item) => item.id)).toEqual(["3", "2", "1"]);
  });

  it("gives an unknown priority the lowest rank instead of the highest", () => {
    expect(priorityRank("someday")).toBeGreaterThan(priorityRank("dream"));
    expect(priorityRank(undefined)).toBeGreaterThan(priorityRank("dream"));
  });

  it("colours priorities by meaning, in the readable variant of each hue", () => {
    // The badge sets its label *in* the colour, so these are the `-text`
    // tokens: the saturated fill values read at 2.4–4.2 against the badge's
    // own tinted background, which is under the minimum for 12px type. The
    // soft backgrounds stay on the fill hue, which is what they are for.
    expect(PRIORITY_META.high.color).toBe("var(--danger-text)");
    expect(PRIORITY_META.medium.color).toBe("var(--warning-text)");
    expect(PRIORITY_META.low.color).toBe("var(--accent)");
    expect(PRIORITY_META.dream.color).toBe("var(--purple-text)");

    expect(PRIORITY_META.high.soft).toBe("var(--danger-soft)");
    expect(PRIORITY_META.medium.soft).toBe("var(--warning-soft)");
    expect(PRIORITY_META.dream.soft).toBe("var(--purple-soft)");
  });
});

// ─── 2. Visual identity: URLs, favicons, colour ───────────────────────────────

describe("wishlist visual identity", () => {
  it("accepts http and https links only", () => {
    expect(parseItemUrl("https://www.amazon.de/dp/B01")?.protocol).toBe("https:");
    expect(parseItemUrl("http://shop.example.com")?.protocol).toBe("http:");
    expect(parseItemUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(parseItemUrl("JavaScript:alert(1)")).toBeNull();
    expect(parseItemUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(parseItemUrl("file:///etc/passwd")).toBeNull();
    expect(parseItemUrl("not a url at all")).toBeNull();
    expect(parseItemUrl("")).toBeNull();
    expect(parseItemUrl(undefined)).toBeNull();
  });

  it("treats a bare host as https and strips www for display", () => {
    expect(parseItemUrl("store.example.com/product")?.protocol).toBe("https:");
    expect(itemDomain("https://www.amazon.de/dp/B01")).toBe("amazon.de");
    expect(itemDomain("store.example.com/product")).toBe("store.example.com");
    expect(itemDomain("javascript:alert(1)")).toBeNull();
  });

  it("never stores an unsafe link on an item", () => {
    const draft = { ...wishlistToDraft(makeItem()), url: "javascript:alert(1)" };
    expect(wishlistPayloadFromDraft(draft).url).toBeUndefined();

    const safe = { ...wishlistToDraft(makeItem()), url: "amazon.de/dp/B01" };
    expect(wishlistPayloadFromDraft(safe).url).toBe("https://amazon.de/dp/B01");
  });

  it("builds a favicon URL for the domain", () => {
    expect(faviconUrl("amazon.de")).toBe("https://www.google.com/s2/favicons?domain=amazon.de&sz=64");
    expect(faviconUrl("shop.example.com", 32)).toContain("sz=32");
  });

  it("uses the item's colour, falling back to a stable colour per domain", () => {
    expect(wishlistItemAccent(makeItem({ color: "#123ABC" }))).toBe("#123ABC");
    // Not a hex value: ignored rather than injected into a style.
    expect(wishlistItemAccent(makeItem({ color: "red; background:url(x)" }))).toMatch(/^#[0-9A-F]{6}$/i);

    const first = wishlistItemAccent(makeItem({ id: "a", name: "One", url: "https://amazon.de/x" }));
    const second = wishlistItemAccent(makeItem({ id: "b", name: "Two", url: "https://www.amazon.de/y" }));
    expect(first).toBe(second);
    expect(colorForSeed("amazon.de")).toBe(first);
  });

  it("keeps the card background a wash over the theme surface", () => {
    const gradient = wishlistCardGradient("#0071E3");
    // The theme's own surface stays underneath, so text contrast is whatever
    // the theme designed in both light and dark mode.
    expect(gradient).toContain("var(--bg-elevated)");
    expect(gradient).toContain("rgba(0, 113, 227, 0.16)");
    expect(withAlpha("#0071E3", 0.16)).toBe("rgba(0, 113, 227, 0.16)");
    expect(withAlpha("var(--danger)", 0.2)).toBe("color-mix(in srgb, var(--danger) 20%, transparent)");
  });
});

// ─── 3. Purchase defaults ─────────────────────────────────────────────────────

describe("purchase defaults", () => {
  it("prefills from the item and today's local date", () => {
    const today = todayDateInput();
    const defaults = purchaseDefaults(makeItem({ actualPrice: 0 }), today);
    expect(defaults).toEqual({
      amount: 0,
      currency: "EUR",
      categoryId: "cat-wishlist",
      date: today,
      note: "Studio headphones",
    });
  });

  it("treats 0 as a real amount and null as missing", () => {
    expect(isUsableAmount(0)).toBe(true);
    expect(isUsableAmount(null)).toBe(false);
    expect(isUsableAmount(undefined)).toBe(false);
    expect(isUsableAmount(Number.NaN)).toBe(false);
  });

  it("only offers items still waiting to be bought", () => {
    expect(isActiveWishlistItem(makeItem())).toBe(true);
    expect(isActiveWishlistItem(makeItem({ bought: true }))).toBe(false);
    expect(isActiveWishlistItem(makeItem({ inWishlist: false }))).toBe(false);
    expect(isActiveWishlistItem(makeItem({ active: false }))).toBe(false);
  });
});

// ─── 4. Link lifecycle through the store ──────────────────────────────────────

describe("recording a wishlist purchase", () => {
  it("creates the spending entry and links both sides", () => {
    install(currentPeriodSnapshot());

    const result = store().recordWishlistPurchase("wish-test");
    expect(result.status).toBe("created");
    const spendingId = result.status === "created" ? result.spendingId : "";

    const entry = entryById(spendingId)!;
    expect(entry.amount).toBe(120);
    expect(entry.currency).toBe("EUR");
    expect(entry.categoryId).toBe("cat-wishlist");
    expect(entry.date).toBe(todayDateInput());
    expect(entry.year).toBe(Number(todayDateInput().slice(0, 4)));
    expect(entry.wishlistItemId).toBe("wish-test");
    expect(entry.note).toBe("Studio headphones");

    const item = itemById("wish-test")!;
    expect(item.bought).toBe(true);
    expect(item.linkedSpendingId).toBe(spendingId);
    expect(item.datePurchased).toBeTruthy();
    // A bought item no longer competes for the budget.
    expect(item.effectiveValue).toBe(0);
  });

  it("records the purchase in the audit trail", () => {
    install(currentPeriodSnapshot());
    store().recordWishlistPurchase("wish-test");

    const latest = store().snapshot.auditLog[0];
    expect(latest.type).toBe("spending");
    expect(latest.summary).toContain("Studio headphones");
  });

  it("treats a price of 0 as a real purchase", () => {
    install(currentPeriodSnapshot([makeItem({ actualPrice: 0, effectiveValue: 0 })]));

    const result = store().recordWishlistPurchase("wish-test");
    expect(result.status).toBe("created");
    expect(allEntries()).toHaveLength(1);
    expect(allEntries()[0].amount).toBe(0);
  });

  it("refuses to guess an amount when the item has no price", () => {
    install(currentPeriodSnapshot([makeItem({ actualPrice: null, effectiveValue: null })]));

    expect(store().recordWishlistPurchase("wish-test").status).toBe("invalid-amount");
    expect(allEntries()).toHaveLength(0);
    expect(itemById("wish-test")!.bought).toBe(false);
  });

  it("applies overrides from the spending form", () => {
    install(currentPeriodSnapshot());

    const result = store().recordWishlistPurchase("wish-test", {
      amount: 99.5,
      date: "2026-03-04",
      categoryId: "cat-spending",
      currency: "USD",
      note: "Black Friday",
      isPiloting: true,
      source: "shared",
    });
    expect(result.status).toBe("created");

    const entry = entryById(result.status === "created" ? result.spendingId : "")!;
    expect(entry.amount).toBe(99.5);
    expect(entry.date).toBe("2026-03-04");
    expect(entry.year).toBe(2026);
    expect(entry.month).toBe(3);
    expect(entry.categoryId).toBe("cat-spending");
    expect(entry.currency).toBe("USD");
    expect(entry.note).toBe("Black Friday");
    expect(entry.isPiloting).toBe(true);
    expect(entry.source).toBe("shared");
  });
});

describe("no duplicate purchases", () => {
  it("offers the existing entry instead of writing a second one", () => {
    install(currentPeriodSnapshot());

    const first = store().recordWishlistPurchase("wish-test");
    const second = store().recordWishlistPurchase("wish-test");

    expect(second.status).toBe("already-linked");
    expect(second.status === "already-linked" && second.spendingId).toBe(
      first.status === "created" ? first.spendingId : "",
    );
    expect(allEntries()).toHaveLength(1);
  });

  it("repairs a dangling link rather than refusing forever", () => {
    install(currentPeriodSnapshot([makeItem({ linkedSpendingId: "spend-that-vanished" })]));

    const result = store().recordWishlistPurchase("wish-test");
    expect(result.status).toBe("created");
    expect(itemById("wish-test")!.linkedSpendingId).toBe(
      result.status === "created" ? result.spendingId : "",
    );
    expect(allEntries()).toHaveLength(1);
  });

  it("refuses to link a second transaction to an already-linked item", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const linkedId = created.status === "created" ? created.spendingId : "";

    store().addSpendingEntry({
      id: "spend-other",
      year: CURRENT_YEAR,
      month: NOW.getMonth() + 1,
      week: getIsoWeek(NOW),
      date: todayDateInput(),
      categoryId: "cat-spending",
      amount: 42,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Unrelated",
    });

    const result = store().linkSpendingToWishlistItem("spend-other", "wish-test");
    expect(result.status).toBe("already-linked");
    expect(result.status === "already-linked" && result.spendingId).toBe(linkedId);
    expect(entryById("spend-other")!.wishlistItemId).toBeUndefined();
    expect(itemById("wish-test")!.linkedSpendingId).toBe(linkedId);
  });
});

describe("linking an existing transaction", () => {
  it("links both sides and marks the item bought", () => {
    install(currentPeriodSnapshot());
    store().addSpendingEntry({
      id: "spend-manual",
      year: CURRENT_YEAR,
      month: NOW.getMonth() + 1,
      week: getIsoWeek(NOW),
      date: "2026-05-06",
      categoryId: "cat-spending",
      amount: 118,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Headphones",
    });

    const result = store().linkSpendingToWishlistItem("spend-manual", "wish-test");
    expect(result.status).toBe("linked");
    expect(entryById("spend-manual")!.wishlistItemId).toBe("wish-test");

    const item = itemById("wish-test")!;
    expect(item.bought).toBe(true);
    expect(item.linkedSpendingId).toBe("spend-manual");
    expect(item.datePurchased?.slice(0, 10)).toBe("2026-05-06");
  });

  it("unlinks when the selector is cleared, keeping both records", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const spendingId = created.status === "created" ? created.spendingId : "";

    const result = store().linkSpendingToWishlistItem(spendingId, null);
    expect(result.status).toBe("unlinked");
    expect(entryById(spendingId)).toBeDefined();
    expect(entryById(spendingId)!.wishlistItemId).toBeUndefined();
    expect(itemById("wish-test")!.linkedSpendingId).toBeUndefined();
  });

  it("moves a link from one item to another without leaving a stale owner", () => {
    install(
      currentPeriodSnapshot([
        makeItem({ id: "wish-a", name: "Item A" }),
        makeItem({ id: "wish-b", name: "Item B" }),
      ]),
    );
    const created = store().recordWishlistPurchase("wish-a");
    const spendingId = created.status === "created" ? created.spendingId : "";

    expect(store().linkSpendingToWishlistItem(spendingId, "wish-b").status).toBe("linked");

    expect(itemById("wish-a")!.linkedSpendingId).toBeUndefined();
    expect(itemById("wish-b")!.linkedSpendingId).toBe(spendingId);
    expect(entryById(spendingId)!.wishlistItemId).toBe("wish-b");
  });
});

describe("unlinking and un-marking bought", () => {
  it("keeps the spending entry when the link is broken", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const spendingId = created.status === "created" ? created.spendingId : "";

    const result = store().unlinkWishlistPurchase("wish-test");
    expect(result.status).toBe("unlinked");
    expect(result.status === "unlinked" && result.spendingId).toBe(spendingId);

    // The money was really spent: only the user may remove that record.
    expect(entryById(spendingId)).toBeDefined();
    expect(entryById(spendingId)!.wishlistItemId).toBeUndefined();
    expect(itemById("wish-test")!.linkedSpendingId).toBeUndefined();
  });

  it("un-marking bought unlinks both sides and restores the wishlist value", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const spendingId = created.status === "created" ? created.spendingId : "";

    const result = store().setWishlistItemBought("wish-test", false);
    expect(result.status).toBe("unlinked");
    // The caller is told which entry survived, so the UI can surface it.
    expect(result.status === "unlinked" && result.spendingId).toBe(spendingId);

    const item = itemById("wish-test")!;
    expect(item.bought).toBe(false);
    expect(item.linkedSpendingId).toBeUndefined();
    expect(item.datePurchased).toBeUndefined();
    expect(item.effectiveValue).toBe(120);
    expect(entryById(spendingId)).toBeDefined();
    expect(entryById(spendingId)!.wishlistItemId).toBeUndefined();
  });

  it("marks bought without inventing a transaction", () => {
    install(currentPeriodSnapshot());

    expect(store().setWishlistItemBought("wish-test", true).status).toBe("updated");
    expect(allEntries()).toHaveLength(0);
    const item = itemById("wish-test")!;
    expect(item.bought).toBe(true);
    expect(item.linkedSpendingId).toBeUndefined();
  });
});

describe("deleting a linked record", () => {
  it("clears the wishlist link when the transaction is deleted", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const spendingId = created.status === "created" ? created.spendingId : "";

    store().removeSpendingEntry(spendingId);

    expect(entryById(spendingId)).toBeUndefined();
    const item = itemById("wish-test")!;
    expect(item).toBeDefined();
    // No dangling reference left behind.
    expect(item.linkedSpendingId).toBeUndefined();
    expect(store().findLinkedSpendingEntry("wish-test")).toBeNull();
  });

  it("clears the transaction's link when the wishlist item is deleted", () => {
    install(currentPeriodSnapshot());
    const created = store().recordWishlistPurchase("wish-test");
    const spendingId = created.status === "created" ? created.spendingId : "";

    store().removeWishlistItem("wish-test");

    expect(itemById("wish-test")).toBeUndefined();
    expect(entryById(spendingId)).toBeDefined();
    expect(entryById(spendingId)!.wishlistItemId).toBeUndefined();
  });
});

describe("historical protection", () => {
  it("refuses every linking action while a closed period is locked", () => {
    const snapshot = currentPeriodSnapshot();
    snapshot.settings.selectedYear = CURRENT_YEAR - 1;
    snapshot.settings.selectedMonth = 1;
    install(snapshot);

    expect(store().isCurrentPeriodMutable()).toBe(false);
    expect(store().recordWishlistPurchase("wish-test").status).toBe("locked");
    expect(store().setWishlistItemBought("wish-test", true).status).toBe("locked");
    expect(store().unlinkWishlistPurchase("wish-test").status).toBe("locked");
    expect(store().linkSpendingToWishlistItem("spend-any", "wish-test").status).toBe("locked");

    expect(allEntries()).toHaveLength(0);
    expect(itemById("wish-test")!.bought).toBe(false);
  });

  it("allows a purchase once history is explicitly unlocked, and flags it", () => {
    const snapshot = currentPeriodSnapshot();
    snapshot.settings.selectedYear = CURRENT_YEAR - 1;
    snapshot.settings.selectedMonth = 1;
    install(snapshot);
    useBudgetStore.setState({ historicalEditUnlocked: true });

    const result = store().recordWishlistPurchase("wish-test", { date: `${CURRENT_YEAR - 1}-01-15` });
    expect(result.status).toBe("created");

    const latest = store().snapshot.auditLog[0];
    expect(latest.historicalEdit).toBe(true);
    expect(latest.summary).toContain("historical edit");
  });
});

describe("missing records", () => {
  it("reports a missing item or entry instead of throwing", () => {
    install(currentPeriodSnapshot());
    expect(store().recordWishlistPurchase("wish-nope").status).toBe("not-found");
    expect(store().unlinkWishlistPurchase("wish-nope").status).toBe("not-found");
    expect(store().setWishlistItemBought("wish-nope", true).status).toBe("not-found");
    expect(store().linkSpendingToWishlistItem("spend-nope", "wish-test").status).toBe("not-found");
    expect(store().findLinkedSpendingEntry("wish-nope")).toBeNull();
  });

  it("reports nothing to unlink when an item was never linked", () => {
    install(currentPeriodSnapshot());
    const result = store().unlinkWishlistPurchase("wish-test");
    expect(result.status).toBe("unlinked");
    expect(result.status === "unlinked" && result.spendingId).toBeUndefined();
  });
});
