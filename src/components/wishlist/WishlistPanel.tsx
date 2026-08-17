import React, { useMemo, useState } from "react";
import { Check, ExternalLink, Link2Off, Pencil, Plus, Receipt, ShoppingBag, Trash2, X, Sparkles } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { todayDateInput } from "../../domain/dates";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  faviconUrl,
  itemDomain,
  itemIconDomain,
  normalizeItemUrl,
  parseItemUrl,
  purchaseDefaults,
  sortWishlistItems,
  wishlistCardBorder,
  wishlistCardGradient,
  wishlistItemAccent,
  withAlpha,
} from "../../domain/wishlist";
import type { WishlistLinkResult } from "../../domain/wishlist";
import { ActivityIcon, IconPicker } from "../ui/IconPicker";
import { seedCategoryIdOrFallback } from "../../domain/seedCategories";
import { SwipeRow } from "../ui/SwipeRow";
import { gesturesFor } from "../../domain/gestures";
import type { SwipeActionId } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import {
  formatDualMoney,
  parseAmount,
  valueToInput,
  wishlistPayloadFromDraft,
  wishlistToDraft,
  wishlistViewMatches,
} from "../../utils/formatters";
import type { WishlistDraft } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import type { CurrencyCode, SpendingEntry, WishlistItem } from "../../domain/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewFilter = "all" | "active" | "bought";

interface PurchaseDraft {
  amount: string;
  date: string;
  categoryId: string;
}

interface Notice {
  tone: "info" | "warning" | "success";
  message: string;
}

function emptyDraft(baseCurrency: string, wishlistCategoryId: string): WishlistDraft {
  return { ...wishlistToDraft(null), currency: baseCurrency, categoryId: wishlistCategoryId };
}

// ─── Favicon with a fallback that can never break the layout ─────────────────

/**
 * Site icon for a wishlist item.
 *
 * The favicon service answers for any domain, including ones with no icon, so
 * a failed load falls back to a neutral mark rather than leaving a broken
 * image box in the card. The image is never given a referrer: the wishlist
 * should not tell a third party which page the user is looking at.
 */
const ItemMark: React.FC<{ domain: string | null; accent: string; size?: number; icon?: string }> = ({
  domain,
  accent,
  size = 34,
  icon,
}) => {
  const [failed, setFailed] = useState(false);
  const showFavicon = domain != null && !failed;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: 10,
        background: withAlpha(accent, 0.18),
        border: `1px solid ${withAlpha(accent, 0.28)}`,
        overflow: "hidden",
      }}
    >
      {icon ? (
        // An explicit choice wins: many sites have no usable favicon, and some
        // return a placeholder that renders as something indistinguishable
        // from a broken image.
        <ActivityIcon name={icon} size={size - 16} color={accent} />
      ) : showFavicon ? (
        <img
          src={faviconUrl(domain, 64)}
          alt=""
          width={size - 14}
          height={size - 14}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{ display: "block", width: size - 14, height: size - 14, objectFit: "contain" }}
        />
      ) : (
        <ShoppingBag size={size - 18} color={accent} />
      )}
    </span>
  );
};

// ─── Shared edit form ────────────────────────────────────────────────────────

interface EditFormProps {
  draft: WishlistDraft;
  onChange: (patch: Partial<WishlistDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  submitLabel: string;
}

const EditForm: React.FC<EditFormProps> = ({ draft, onChange, onSave, onCancel, submitLabel }) => {
  const urlError = draft.url.trim().length > 0 && normalizeItemUrl(draft.url) == null;
  const brandUrlError = draft.brandUrl.trim().length > 0 && normalizeItemUrl(draft.brandUrl) == null;
  const valid = draft.name.trim().length > 0 && !urlError && !brandUrlError;
  const accent = wishlistItemAccent({
    id: "draft",
    name: draft.name || "draft",
    url: normalizeItemUrl(draft.url),
    color: draft.color,
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSave();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--bg-inset)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        display: "grid",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          required
          placeholder="Item name *"
          aria-label="Item name"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ flex: "2 1 160px", minWidth: 120 }}
          autoFocus
        />
        <input
          className="input"
          type="number"
          step="any"
          min="0"
          placeholder="Price (optional)"
          aria-label="Price"
          value={draft.actualPrice}
          onChange={(e) => onChange({ actualPrice: e.target.value })}
          style={{ flex: "1 1 110px", minWidth: 100 }}
        />
        <select
          className="select"
          aria-label="Currency"
          value={draft.currency}
          onChange={(e) => onChange({ currency: e.target.value })}
          style={{ flex: "1 1 80px", minWidth: 70 }}
        >
          {CURRENCY_OPTIONS.map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
        <select
          className="select"
          aria-label="Priority"
          value={draft.priority}
          onChange={(e) => onChange({ priority: e.target.value as WishlistItem["priority"] })}
          style={{ flex: "1 1 110px", minWidth: 100 }}
        >
          {PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          // Deliberately not type="url": that makes the browser demand a
          // scheme, so "store.com/product" — which this very placeholder
          // suggests, and which parseItemUrl is written to accept as https —
          // was silently rejected and the form refused to submit with no
          // message the user could act on. inputMode still brings up the right
          // keyboard, and the app's own validation is stricter anyway: it also
          // rejects javascript: and data:, which type="url" happily accepts.
          type="text"
          inputMode="url"
          placeholder="Link (optional) — e.g. store.com/product"
          aria-label="Product link"
          value={draft.url}
          onChange={(e) => onChange({ url: e.target.value })}
          style={{
            flex: "3 1 180px",
            minWidth: 140,
            borderColor: urlError ? "var(--danger)" : undefined,
          }}
        />
        <label
          className="text-caption"
          style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}
        >
          Colour
          <input
            type="color"
            aria-label="Item colour"
            value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : accent}
            onChange={(e) => onChange({ color: e.target.value })}
            style={{ width: 34, height: 34, border: "none", background: "none", cursor: "pointer", padding: 2 }}
          />
        </label>
        {draft.color && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ color: "" })}>
            Auto colour
          </Button>
        )}
      </div>

      {urlError && (
        <div className="text-caption" style={{ color: "var(--danger)" }}>
          Enter a valid web address (http or https only).
        </div>
      )}

      {/* Behind a disclosure: most items are bought and branded by the same
          site, so asking everyone for a second link would tax the common case
          to serve the uncommon one. */}
      <details className="wishlist-advanced">
        <summary>
          <Sparkles size={13} aria-hidden="true" />
          <span>Different brand for the icon</span>
        </summary>
        <p className="text-note" style={{ margin: "6px 0 8px" }}>
          Use this when the maker is not the shop — a model kit bought from a marketplace, an add-on
          sold on one store and built by another. The purchase link above is never changed.
        </p>
        <input
          className="input"
          type="text"
          inputMode="url"
          placeholder="Brand site — e.g. manufacturer.com"
          aria-label="Brand site for the icon"
          value={draft.brandUrl}
          onChange={(e) => onChange({ brandUrl: e.target.value })}
          style={{ width: "100%", borderColor: brandUrlError ? "var(--danger)" : undefined }}
        />

        <div style={{ marginTop: 12 }}>
          <IconPicker
            value={draft.icon || undefined}
            accent={draft.color || undefined}
            label="Or pick an icon"
            onChange={(name) => onChange({ icon: name ?? "" })}
          />
          <p className="text-note" style={{ margin: "6px 0 0" }}>
            Overrides the site icon. Use it when the site has none, or when the one it returns is
            not recognisable.
          </p>
        </div>
        {brandUrlError && (
          <div className="text-caption" style={{ color: "var(--danger)", marginTop: 6 }}>
            Enter a valid web address (http or https only).
          </div>
        )}
      </details>

      <textarea
        className="input"
        placeholder="Notes (optional)"
        aria-label="Notes"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        rows={2}
        style={{ resize: "vertical", minWidth: 0, height: "auto", padding: 10 }}
      />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={draft.inWishlist}
          onChange={(e) => onChange({ inWishlist: e.target.checked })}
        />
        In wishlist
      </label>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!valid}>
          <Check size={14} /> {submitLabel}
        </Button>
      </div>
    </form>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export const WishlistPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addWishlistItem);
  const update = useBudgetStore((s) => s.updateWishlistItem);
  const remove = useBudgetStore((s) => s.removeWishlistItem);
  const recordPurchase = useBudgetStore((s) => s.recordWishlistPurchase);
  const setBought = useBudgetStore((s) => s.setWishlistItemBought);
  const unlinkPurchase = useBudgetStore((s) => s.unlinkWishlistPurchase);
  const findLinkedEntry = useBudgetStore((s) => s.findLinkedSpendingEntry);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const { settings } = snapshot;
  const allItems: WishlistItem[] = snapshot.years[String(settings.selectedYear)]?.wishlistItems ?? [];
  // Category ids are generated per budget, so the wishlist category has to be
  // looked up by its seed key rather than assumed to be the literal
  // "cat-wishlist". That id only ever belonged to the first budget created.
  const gestures = gesturesFor(settings, "wishlist");

  /** Build the panel for one configured action, or nothing when it is off. */
  const swipeActionsFor = (action: SwipeActionId, item: WishlistItem, enabled: boolean) => {
    if (!enabled || action === "none") return [];
    switch (action) {
      case "delete":
        return [{ label: "Delete", icon: <Trash2 size={18} />, destructive: true, onAction: () => remove(item.id) }];
      case "buy":
        // Buying something already bought is not an action, so the panel is
        // simply absent rather than present and inert.
        return item.bought ? [] : [{ label: "Buy", icon: <ShoppingBag size={18} />, onAction: () => startPurchase(item) }];
      case "edit":
        return [{ label: "Edit", icon: <Pencil size={18} />, onAction: () => startEdit(item) }];
      default:
        return [];
    }
  };

  const wishlistCategoryId =
    seedCategoryIdOrFallback(snapshot.categories, "cat-wishlist") ?? "";

  const [view, setView] = useState<ViewFilter>("active");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState<WishlistDraft>(() => emptyDraft(settings.baseCurrency, wishlistCategoryId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WishlistDraft | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Urgent first, dream last, bought at the bottom.
  const filteredItems = useMemo(
    () => sortWishlistItems(allItems.filter((item) => wishlistViewMatches(item, view))),
    [allItems, view],
  );

  const activeItems = useMemo(() => allItems.filter((item) => wishlistViewMatches(item, "active")), [allItems]);
  const boughtItems = useMemo(() => allItems.filter((item) => item.bought), [allItems]);

  const activeTotal = useMemo(
    () => activeItems.reduce((sum, item) => sum + (item.actualPrice ?? 0), 0),
    [activeItems],
  );

  const categoryOptions = useMemo(
    () => snapshot.categories.filter((category) => !category.archived),
    [snapshot.categories],
  );

  /** Entries by id, so rendering N cards does not re-scan every year. */
  const entriesById = useMemo(() => {
    const map = new Map<string, SpendingEntry>();
    for (const record of Object.values(snapshot.years)) {
      for (const entry of record.spendingEntries) map.set(entry.id, entry);
    }
    return map;
  }, [snapshot.years]);

  // --- Handlers ---

  const resetForms = () => {
    setEditingId(null);
    setEditDraft(null);
    setPurchasingId(null);
    setPurchaseDraft(null);
  };

  const handleAdd = () => {
    if (!addDraft.name.trim()) return;
    add({
      ...wishlistPayloadFromDraft(addDraft),
      categoryId: addDraft.categoryId || wishlistCategoryId,
      currency: addDraft.currency as CurrencyCode,
      bought: false,
      active: true,
    });
    setAddDraft(emptyDraft(settings.baseCurrency, wishlistCategoryId));
    setShowAddForm(false);
    setView("active");
    setNotice(null);
  };

  const startEdit = (item: WishlistItem) => {
    resetForms();
    setEditingId(item.id);
    setEditDraft(wishlistToDraft(item));
  };

  const saveEdit = () => {
    if (!editingId || !editDraft || !editDraft.name.trim()) return;
    update(editingId, {
      ...wishlistPayloadFromDraft(editDraft),
      currency: editDraft.currency as CurrencyCode,
    });
    resetForms();
  };

  const handleDelete = (item: WishlistItem) => {
    const linked = findLinkedEntry(item.id);
    const warning = linked
      ? `\n\nThe linked transaction (${formatMoney(linked.amount, linked.currency, settings.currencyDisplayMode)} on ${linked.date}) stays in your spending.`
      : "";
    if (window.confirm(`Delete "${item.name}" from your wishlist?${warning}`)) {
      remove(item.id);
      resetForms();
    }
  };

  /** Explains an outcome instead of letting the UI silently do nothing. */
  const reportResult = (result: WishlistLinkResult, item: WishlistItem): void => {
    switch (result.status) {
      case "created":
        setNotice({ tone: "success", message: `Recorded the purchase of ${item.name} in your spending.` });
        resetForms();
        break;
      case "already-linked":
        setNotice({
          tone: "warning",
          message: `${item.name} is already linked to a transaction — showing it instead of adding a second one.`,
        });
        setExpandedLinkId(item.id);
        resetForms();
        break;
      case "unlinked":
        setNotice({
          tone: "info",
          message: result.spendingId
            ? `${item.name} is no longer marked bought. The transaction it was linked to is still in your spending — delete it there if it was a mistake.`
            : `${item.name} is no longer marked bought.`,
        });
        break;
      case "locked":
        setNotice({ tone: "warning", message: "This period is historical and read-only." });
        break;
      case "invalid-amount":
        setNotice({ tone: "warning", message: "Enter an amount before recording this purchase (0 is allowed)." });
        break;
      case "not-found":
        setNotice({ tone: "warning", message: "That item no longer exists." });
        break;
      default:
        setNotice(null);
    }
  };

  const startPurchase = (item: WishlistItem) => {
    setNotice(null);
    // Never a second transaction for the same item: if the link still
    // resolves, show that entry rather than opening the form.
    const linked = findLinkedEntry(item.id);
    if (linked) {
      reportResult({ status: "already-linked", spendingId: linked.id }, item);
      return;
    }
    const defaults = purchaseDefaults(item, todayDateInput());
    resetForms();
    setPurchasingId(item.id);
    setPurchaseDraft({
      amount: valueToInput(defaults.amount),
      date: defaults.date,
      categoryId: defaults.categoryId || wishlistCategoryId,
    });
  };

  const submitPurchase = (item: WishlistItem) => {
    if (!purchaseDraft) return;
    const amount = parseAmount(purchaseDraft.amount);
    if (amount == null) {
      setNotice({ tone: "warning", message: "Enter an amount before recording this purchase (0 is allowed)." });
      return;
    }
    reportResult(
      recordPurchase(item.id, {
        amount,
        date: purchaseDraft.date,
        categoryId: purchaseDraft.categoryId,
        currency: item.currency,
        note: item.name,
      }),
      item,
    );
  };

  const markBoughtOnly = (item: WishlistItem) => {
    const result = setBought(item.id, true);
    resetForms();
    if (result.status === "updated") {
      setNotice({ tone: "info", message: `${item.name} is marked bought. No transaction was recorded.` });
    } else {
      reportResult(result, item);
    }
  };

  const markNotBought = (item: WishlistItem) => {
    const linked = findLinkedEntry(item.id);
    if (
      linked &&
      !window.confirm(
        `"${item.name}" is linked to a transaction of ${formatMoney(linked.amount, linked.currency, settings.currencyDisplayMode)} on ${linked.date}.\n\nUnmark it as bought and unlink them? The transaction stays in your spending — delete it there if it never happened.`,
      )
    ) {
      return;
    }
    reportResult(setBought(item.id, false), item);
    setExpandedLinkId(null);
  };

  const unlinkOnly = (item: WishlistItem) => {
    reportResult(unlinkPurchase(item.id), item);
    setExpandedLinkId(null);
  };

  // --- View tab button ---
  const viewTabStyle = (tab: ViewFilter) =>
    ({
      padding: "4px 12px",
      borderRadius: "var(--radius-full)",
      border: "1px solid var(--border)",
      background: view === tab ? "var(--accent-soft)" : "transparent",
      color: view === tab ? "var(--accent)" : "var(--text-secondary)",
      fontWeight: view === tab ? 600 : 400,
      fontSize: 13,
      cursor: "pointer",
    }) as React.CSSProperties;

  const noticeTone = {
    info: { background: "var(--accent-soft)", color: "var(--accent)" },
    success: { background: "var(--success-soft)", color: "var(--success)" },
    warning: { background: "var(--warning-soft)", color: "var(--warning)" },
  };

  return (
    <div className="page-enter" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <Section title="Wishlist">
        {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 0 }}>
            {(["active", "all", "bought"] as ViewFilter[]).map((tab) => (
              <button key={tab} type="button" style={viewTabStyle(tab)} onClick={() => setView(tab)}>
                {tab === "active"
                  ? `Active (${activeItems.length})`
                  : tab === "bought"
                    ? `Bought (${boughtItems.length})`
                    : `All (${allItems.length})`}
              </button>
            ))}
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }} />
          {mutable && !showAddForm && (
            <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={14} /> Add item
            </Button>
          )}
        </div>

        {notice && (
          <div
            role="status"
            className="text-caption"
            style={{
              ...noticeTone[notice.tone],
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              marginTop: 10,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Add form */}
        {mutable && showAddForm && (
          <div style={{ marginTop: 12 }}>
            <EditForm
              draft={addDraft}
              onChange={(patch) => setAddDraft((draft) => ({ ...draft, ...patch }))}
              onSave={handleAdd}
              onCancel={() => {
                setShowAddForm(false);
                setAddDraft(emptyDraft(settings.baseCurrency, wishlistCategoryId));
              }}
              submitLabel="Add item"
            />
          </div>
        )}
      </Section>

      {/* Item cards */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title={
            view === "active"
              ? "No active wishlist items"
              : view === "bought"
                ? "Nothing bought yet"
                : "Your wishlist is empty"
          }
          description="Save future purchases without mixing them with monthly spending."
        />
      ) : (
        <div
          style={{
            display: "grid",
            // `min(...)` keeps a single column from demanding more width than
            // the screen has, so a 320px phone never scrolls sideways.
            gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {filteredItems.map((item) => {
            const accent = wishlistItemAccent(item);
            // Two different facts: what the item looks like, and where it is
            // bought. The icon follows the brand when there is one; the link
            // always opens the shop.
            const domain = itemIconDomain(item);
            const href = parseItemUrl(item.url)?.toString();
            const priority = PRIORITY_META[item.priority] ?? PRIORITY_META.low;
            const isEditing = editingId === item.id;
            const isPurchasing = purchasingId === item.id;
            const linked: SpendingEntry | null = item.linkedSpendingId
              ? (entriesById.get(item.linkedSpendingId) ?? null)
              : null;
            const showLink = expandedLinkId === item.id && linked != null;

            return (
              <SwipeRow
                key={item.id}
                label={item.name}
                // Right-to-left reveals the destructive action, matching the
                // platform convention people already have.
                // Which action sits on each side is a preference: some people
                // want Delete under the thumb, others want it nowhere near it.
                trailing={swipeActionsFor(gestures.trailing, item, mutable && !isEditing)}
                leading={swipeActionsFor(gestures.leading, item, mutable && !isEditing)}
              >
              <div
                className={mutable && !isEditing ? "editable-row" : undefined}
                role={mutable && !isEditing ? "button" : undefined}
                tabIndex={mutable && !isEditing ? 0 : undefined}
                aria-label={mutable && !isEditing ? `Edit ${item.name}` : undefined}
                onClick={(event) => {
                  if (!mutable || isEditing) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, select, textarea")) return;
                  if (window.getSelection()?.toString()) return;
                  startEdit(item);
                }}
                onKeyDown={(event) => {
                  if (!mutable || isEditing || event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    startEdit(item);
                  }
                }}
                style={{
                  display: "grid",
                  gap: 10,
                  alignContent: "start",
                  padding: 14,
                  minWidth: 0,
                  borderRadius: "var(--radius-lg)",
                  border: `1px solid ${wishlistCardBorder(accent)}`,
                  background: wishlistCardGradient(accent),
                  boxShadow: "var(--shadow-xs)",
                  opacity: item.bought ? 0.72 : 1,
                }}
              >
                {/* Header: mark, name, price */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                  <ItemMark domain={domain} accent={accent} icon={item.icon} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="text-callout"
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        textDecoration: item.bought ? "line-through" : "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </div>
                    {/* `domain` and `href` come from the same validated URL, so
                        the link is only ever http(s). */}
                    {domain && href && (
                      <a
                        className="text-caption"
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          maxWidth: "100%",
                          color: "var(--text-secondary)",
                          textDecoration: "none",
                          overflow: "hidden",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {domain}
                        </span>
                        <ExternalLink size={11} style={{ flexShrink: 0 }} />
                      </a>
                    )}
                  </div>
                  <strong style={{ fontSize: 14, whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                    {item.actualPrice != null
                      ? formatMoney(item.actualPrice, item.currency, settings.currencyDisplayMode)
                      : "—"}
                  </strong>
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    className="badge"
                    style={{ background: priority.soft, color: priority.color }}
                    title={priority.hint}
                  >
                    {priority.label}
                  </span>
                  {item.bought && (
                    <span className="badge badge-success">
                      {item.datePurchased
                        ? `Bought ${new Date(item.datePurchased).toLocaleDateString()}`
                        : "Bought"}
                    </span>
                  )}
                  {linked && (
                    <button
                      type="button"
                      className="badge badge-info"
                      onClick={() => setExpandedLinkId(showLink ? null : item.id)}
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}
                      aria-expanded={showLink}
                    >
                      <Receipt size={11} /> {showLink ? "Hide transaction" : "View transaction"}
                    </button>
                  )}
                  {!item.inWishlist && <span className="badge badge-neutral">Not in wishlist</span>}
                </div>

                {item.notes && (
                  <div
                    className="text-caption"
                    style={{ color: "var(--text-secondary)", overflowWrap: "anywhere" }}
                  >
                    {item.notes}
                  </div>
                )}

                {/* Linked transaction detail */}
                {showLink && linked && (
                  <div
                    className="text-caption"
                    style={{
                      display: "grid",
                      gap: 2,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-inset)",
                      color: "var(--text-secondary)",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {formatMoney(linked.amount, linked.currency, settings.currencyDisplayMode)} · {linked.date}
                    </span>
                    <span style={{ overflowWrap: "anywhere" }}>
                      {snapshot.categories.find((category) => category.id === linked.categoryId)?.name ??
                        "Uncategorized"}
                      {linked.note ? ` · ${linked.note}` : ""}
                    </span>
                    <span>Find it in Spending to edit or delete it.</span>
                  </div>
                )}

                {/* Purchase form */}
                {mutable && isPurchasing && purchaseDraft && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitPurchase(item);
                    }}
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: 10,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-inset)",
                      minWidth: 0,
                    }}
                  >
                    <div className="text-caption" style={{ color: "var(--text-secondary)" }}>
                      Record this as spending
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <input
                        className="input"
                        type="number"
                        step="any"
                        required
                        aria-label="Purchase amount"
                        placeholder="Amount"
                        value={purchaseDraft.amount}
                        onChange={(e) =>
                          setPurchaseDraft((draft) => (draft ? { ...draft, amount: e.target.value } : draft))
                        }
                        style={{ flex: "1 1 120px", minWidth: 90 }}
                      />
                      <input
                        className="input"
                        type="date"
                        required
                        aria-label="Purchase date"
                        value={purchaseDraft.date}
                        onChange={(e) =>
                          setPurchaseDraft((draft) => (draft ? { ...draft, date: e.target.value } : draft))
                        }
                        // Wide enough that the native control never clips the
                        // year; on a narrow card it wraps to its own row.
                        style={{ flex: "1 1 155px", minWidth: 150 }}
                      />
                    </div>
                    <select
                      className="select"
                      aria-label="Purchase category"
                      value={purchaseDraft.categoryId}
                      onChange={(e) =>
                        setPurchaseDraft((draft) => (draft ? { ...draft, categoryId: e.target.value } : draft))
                      }
                      style={{ minWidth: 0 }}
                    >
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <div className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                      Amount is in {item.currency}.
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <Button type="button" variant="ghost" size="sm" onClick={resetForms}>
                        Cancel
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => markBoughtOnly(item)}>
                        Just mark bought
                      </Button>
                      <Button type="submit" variant="primary" size="sm">
                        <Check size={14} /> Record purchase
                      </Button>
                    </div>
                  </form>
                )}

                {/* Actions */}
                {mutable && !isPurchasing && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {!item.bought ? (
                      <Button size="sm" variant="secondary" onClick={() => startPurchase(item)}>
                        <ShoppingBag size={14} /> Buy
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markNotBought(item)}
                        title="Unmark as bought"
                      >
                        <X size={14} /> Not bought
                      </Button>
                    )}
                    {linked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => unlinkOnly(item)}
                        aria-label="Unlink transaction"
                        title="Unlink the transaction, keeping both records"
                      >
                        <Link2Off size={14} />
                      </Button>
                    )}
                    <div style={{ flex: "1 1 0", minWidth: 0 }} />
                    <span className="row-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      onClick={() => (isEditing ? resetForms() : startEdit(item))}
                      aria-label={isEditing ? "Cancel edit" : "Edit item"}
                      title={isEditing ? "Cancel" : "Edit"}
                    >
                      {isEditing ? <X size={14} /> : <Pencil size={14} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      onClick={() => handleDelete(item)}
                      aria-label="Delete wishlist item"
                      title="Delete"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={14} />
                    </Button>
                    </span>
                  </div>
                )}

                {/* Inline edit form */}
                {isEditing && editDraft && (
                  <EditForm
                    draft={editDraft}
                    onChange={(patch) => setEditDraft((draft) => (draft ? { ...draft, ...patch } : draft))}
                    onSave={saveEdit}
                    onCancel={resetForms}
                    submitLabel="Save changes"
                  />
                )}
              </div>
              </SwipeRow>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {allItems.length > 0 && (
        <div className="card card-body" style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Active items: </span>
            <strong>{activeItems.length}</strong>
          </div>
          {activeTotal > 0 && (
            <div>
              <span style={{ color: "var(--text-secondary)" }}>Active total: </span>
              <strong>{formatDualMoney(activeTotal, settings)}</strong>
            </div>
          )}
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Bought: </span>
            <strong>{boughtItems.length}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
