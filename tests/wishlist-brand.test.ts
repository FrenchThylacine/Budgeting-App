/**
 * Purchase link versus brand link.
 *
 * These were one field, which forced a choice: point it at the shop and every
 * item from that shop looks identical, or point it at the manufacturer and the
 * link sends you somewhere you cannot buy. They are two different facts.
 */

import { describe, expect, it } from "vitest";
import { itemDomain, itemIconDomain, normalizeItemUrl, parseItemUrl } from "../src/domain/wishlist";
import { wishlistPayloadFromDraft, wishlistToDraft } from "../src/utils/formatters";
import type { WishlistItem } from "../src/domain/types";

function item(partial: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: "wish-1",
    name: "Rafale model",
    categoryId: "cat-1",
    actualPrice: 57.8,
    effectiveValue: 57.8,
    currency: "EUR",
    bought: false,
    inWishlist: true,
    priority: "medium",
    dateAdded: "2026-08-16T00:00:00.000Z",
    notes: "",
    active: true,
    ...partial,
  };
}

describe("which domain supplies the icon", () => {
  it("uses the brand when there is one", () => {
    const withBrand = item({
      url: "https://contrail-shop.example/products/rafale",
      brandUrl: "https://azurpoly.example",
    });
    expect(itemIconDomain(withBrand)).toBe("azurpoly.example");
  });

  it("falls back to the shop when there is no brand", () => {
    // Nothing changes for items that only ever had a purchase link.
    expect(itemIconDomain(item({ url: "https://contrail-shop.example/x" }))).toBe("contrail-shop.example");
  });

  it("falls back to the shop when the brand link is unusable", () => {
    const broken = item({ url: "https://shop.example/x", brandUrl: "not a url" });
    // A typo in the optional field must not cost the item the icon it had.
    expect(itemIconDomain(broken)).toBe("shop.example");
  });

  it("has no domain when neither link is set", () => {
    expect(itemIconDomain(item())).toBeNull();
  });

  it("never lets the brand replace the purchase link", () => {
    const withBrand = item({
      url: "https://contrail-shop.example/products/rafale",
      brandUrl: "https://azurpoly.example",
    });
    // The whole point: the icon changes, the destination does not.
    expect(parseItemUrl(withBrand.url)?.toString()).toBe("https://contrail-shop.example/products/rafale");
    expect(itemDomain(withBrand.url)).toBe("contrail-shop.example");
  });
});

describe("what the form stores", () => {
  it("normalises both links", () => {
    const draft = { ...wishlistToDraft(null), name: "Kit", url: "shop.example/x", brandUrl: "maker.example" };
    const payload = wishlistPayloadFromDraft(draft);
    // A bare host is what people type; both fields accept it as https.
    expect(payload.url).toBe("https://shop.example/x");
    expect(payload.brandUrl).toBe("https://maker.example/");
  });

  it("stores nothing for an empty brand field", () => {
    const draft = { ...wishlistToDraft(null), name: "Kit", url: "shop.example", brandUrl: "" };
    // Undefined rather than an empty string, so "no brand" is not mistaken for
    // a brand whose address happens to be blank.
    expect(wishlistPayloadFromDraft(draft).brandUrl).toBeUndefined();
  });

  it("refuses a dangerous scheme in either field", () => {
    // javascript: and data: must never reach an href or an img src.
    expect(normalizeItemUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeItemUrl("data:text/html,<script>")).toBeUndefined();
    const draft = {
      ...wishlistToDraft(null),
      name: "Kit",
      url: "javascript:alert(1)",
      brandUrl: "javascript:alert(2)",
    };
    const payload = wishlistPayloadFromDraft(draft);
    expect(payload.url).toBeUndefined();
    expect(payload.brandUrl).toBeUndefined();
  });

  it("round-trips an item's brand through the draft", () => {
    const original = item({ url: "https://shop.example/x", brandUrl: "https://maker.example/" });
    const draft = wishlistToDraft(original);
    expect(draft.brandUrl).toBe("https://maker.example/");
    expect(wishlistPayloadFromDraft(draft).brandUrl).toBe("https://maker.example/");
  });
});
