import React, { useMemo, useState } from "react";
import { Check, ExternalLink, Link2Off, Pencil, Plus, Receipt, ShoppingBag, Trash2, X } from "lucide-react";
import { currencyOptionsFor, formatMoney, normalizeAmount } from "../../domain/currency";
import { todayDateInput } from "../../domain/dates";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  itemDomain,
  itemIconSourceUrl,
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
import { EntityMark, MarkFields } from "../ui/EntityMark";
import { AdvancedFields, EditorSheet } from "../ui/EditorSheet";
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
import { Field, FieldGroup } from "../ui/Field";
import { Section } from "../ui/Section";
import type { BudgetCategory, CurrencyCode, SpendingEntry, WishlistItem } from "../../domain/types";
import { useTranslation } from "../../i18n/useTranslation";

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

/*
 * The item's mark comes from the shared resolver in `ui/EntityMark`, which the
 * activity editor uses too: image link, then library icon, then site icon,
 * then a neutral fallback, with each network-fetched layer stepping down to the
 * next when it fails. It used to live here as a private component, which is why
 * activities had no equivalent at all.
 */

// ─── Shared edit form ────────────────────────────────────────────────────────

interface EditFormProps {
  /** Names the sheet, so an edit is never mistaken for a new item. */
  title: string;
  /** Selectable categories, passed in so the form stays free of the store. */
  categories: BudgetCategory[];
  /** Selectable currencies, already including the draft's own. */
  currencies: CurrencyCode[];
  draft: WishlistDraft;
  onChange: (patch: Partial<WishlistDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  submitLabel: string;
}

const EditForm: React.FC<EditFormProps> = ({ title, categories, currencies, draft, onChange, onSave, onCancel, submitLabel }) => {
  const { t } = useTranslation();
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

  /* A sheet rather than a form unfolding inside the list. The inline version
     pushed every item below it out of view, and on a phone its Save button sat
     under the fold with nothing to say it was there. */
  return (
    <EditorSheet
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X size={14} /> Cancel
          </Button>
          <Button type="submit" variant="primary" form="wishlist-editor-form" disabled={!valid}>
            <Check size={14} /> {submitLabel}
          </Button>
        </>
      }
    >
    <form
      id="wishlist-editor-form"
      onSubmit={handleSubmit}
      style={{ display: "grid", gap: 20, minWidth: 0 }}
    >
      {/* Labelled fields, in the same shell and with the same grid as the
          activity and transaction editors. This form used to carry its labels
          in `placeholder` alone, which vanish the moment anything is typed —
          so an item being edited showed four boxes with values in them and
          nothing to say what any of them meant. */}
      <FieldGroup title={t("wishlist.item")}>
        <Field label={t("activities.fieldName")} span>
          <input
            className="input"
            required
            placeholder={t("wishlist.azurPolyA350")}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label={t("wishlist.price")} hint={t("common.optional")}>
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder="—"
            value={draft.actualPrice}
            onChange={(e) => onChange({ actualPrice: e.target.value })}
          />
        </Field>
        <Field label={t("spending.currency")}>
          <select
            className="select"
            value={draft.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
          >
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </Field>
        <Field label={t("wishlist.priority")} hint={t(PRIORITY_META[draft.priority as WishlistItem["priority"]]?.hintKey ?? "priority.low.hint")}>
          <select
            className="select"
            value={draft.priority}
            onChange={(e) => onChange({ priority: e.target.value as WishlistItem["priority"] })}
          >
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {t(PRIORITY_META[priority].labelKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("spending.category")}>
          <select
            className="select"
            value={draft.categoryId}
            onChange={(e) => onChange({ categoryId: e.target.value })}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>

      <FieldGroup title={t("wishlist.whereToBuyIt")}>
        <Field
          label={t("wishlist.sellerLink")}
          span
          hint={
            urlError ? (
              <span style={{ color: "var(--danger-text)" }}>{t("wishlist.enterAValidWebAddress")}</span>
            ) : (
              "The shop this is bought from. Opened by the link on the card."
            )
          }
        >
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
            placeholder={t("wishlist.contrailComProductsAzurPoly")}
            value={draft.url}
            onChange={(e) => onChange({ url: e.target.value })}
            style={{ borderColor: urlError ? "var(--danger)" : undefined }}
          />
        </Field>
      </FieldGroup>

      {/* The shared mark controls: a library icon and a preview in view, with
          the image link and the maker's site one tap behind them. The seller
          link above is never touched by any of it, which is the whole reason
          the brand link exists as a second field. */}
      <MarkFields
        source={{ icon: draft.icon, iconUrl: draft.iconUrl, sourceUrl: draft.brandUrl }}
        // The shop, when the brand field is empty. Preview only: filling this
        // into the field would silently make the seller the brand.
        sourceFallbackUrl={draft.url}
        accent={draft.color || accent}
        fallback={<ShoppingBag size={22} color={draft.color || accent} />}
        sourceLabel="Maker's site"
        sourcePlaceholder="azurpoly.com"
        sourceHint={t("wishlist.useThisWhenTheMaker")}
        onChange={(patch) =>
          onChange({
            ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
            ...(patch.iconUrl !== undefined ? { iconUrl: patch.iconUrl } : {}),
            // "Reset the icon" clears the brand link too, which is what the
            // control says; the seller link is a different fact and stays.
            ...(patch.sourceUrl !== undefined ? { brandUrl: patch.sourceUrl } : {}),
          })
        }
      />

      <AdvancedFields label={t("activity.colour")}>
        <FieldGroup title={t("settings.appearance")}>
          <Field label={t("activity.colour")} group>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                aria-label={t("wishlist.itemColour")}
                value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : accent}
                onChange={(e) => onChange({ color: e.target.value })}
                style={{ width: 40, height: 34, border: "none", background: "none", cursor: "pointer", padding: 2 }}
              />
              {draft.color ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ color: "" })}>
                  {t("wishlist.resetToAutomatic")}
                </Button>
              ) : (
                <span className="text-caption">{t("wishlist.derivedFromTheSeller")}</span>
              )}
            </div>
          </Field>
        </FieldGroup>
      </AdvancedFields>

      <FieldGroup title={t("activity.notes")}>
        <Field label={t("activity.notes")} span hint={t("wishlist.anythingWorthRememberingAboutThis")}>
          <textarea
            className="input"
            placeholder={t("common.optional")}
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
            style={{ resize: "vertical", minWidth: 0, height: "auto", padding: 10 }}
          />
        </Field>
        <Field label={t("wishlist.visibility")} span group>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={draft.inWishlist}
              onChange={(e) => onChange({ inWishlist: e.target.checked })}
            />
            {t("wishlist.showInTheWishlist")}
          </label>
        </Field>
      </FieldGroup>

    </form>
    </EditorSheet>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export const WishlistPanel: React.FC = () => {
  const { t, formatDate } = useTranslation();
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
        // `handleDelete`, not `remove`: the swipe and the card's Delete button
        // are the same action and must behave identically. This called `remove`
        // directly, so the *gesture* — the route with no second target to aim
        // at and no undo on a phone — deleted without the confirmation, and
        // without the warning that a linked transaction stays behind, that the
        // deliberate button click showed.
        return [{ label: t("common.delete"), icon: <Trash2 size={18} />, destructive: true, onAction: () => handleDelete(item) }];
      case "buy":
        // Buying something already bought is not an action, so the panel is
        // simply absent rather than present and inert.
        return item.bought ? [] : [{ label: t("wishlist.buy"), icon: <ShoppingBag size={18} />, onAction: () => startPurchase(item) }];
      case "edit":
        return [{ label: t("common.edit"), icon: <Pencil size={18} />, onAction: () => startEdit(item) }];
      default:
        return [];
    }
  };

  const wishlistCategoryId =
    seedCategoryIdOrFallback(snapshot.categories, "cat-wishlist") ?? "";

  const [view, setView] = useState<ViewFilter>("active");
  /**
   * One editor for the whole panel, held at the panel root.
   *
   * It used to be rendered *inside* the card being edited, which put a
   * `position: fixed` backdrop inside `.swipe-content` — an element carrying
   * `will-change: transform`, which makes it the containing block for fixed
   * descendants. The full-screen sheet was therefore laid out inside a 260px
   * card and then clipped by `.swipe-row { overflow: hidden }`. Hoisting it out
   * also means the editor is not unmounted and remounted when the list
   * re-sorts, re-filters or re-renders underneath it.
   */
  const [editorId, setEditorId] = useState<"new" | string | null>(null);
  const [draft, setDraft] = useState<WishlistDraft | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const editingItem = editorId && editorId !== "new" ? allItems.find((item) => item.id === editorId) ?? null : null;
  const purchasingItem = purchasingId ? allItems.find((item) => item.id === purchasingId) ?? null : null;

  // Urgent first, dream last, bought at the bottom.
  const filteredItems = useMemo(
    () => sortWishlistItems(allItems.filter((item) => wishlistViewMatches(item, view))),
    [allItems, view],
  );

  const activeItems = useMemo(() => allItems.filter((item) => wishlistViewMatches(item, "active")), [allItems]);
  const boughtItems = useMemo(() => allItems.filter((item) => item.bought), [allItems]);

  /**
   * Converted to the base currency before adding up.
   *
   * Summing `actualPrice` raw added a $600 yoke to a €40 add-on and reported
   * €640 — a number that is not a total of anything. `normalizeAmount` is the
   * same conversion the rest of the app uses, so this figure now agrees with
   * `summarizeWishlist` instead of contradicting it.
   */
  const activeTotal = useMemo(
    () => activeItems.reduce((sum, item) => sum + normalizeAmount(item.actualPrice, item.currency, settings), 0),
    [activeItems, settings],
  );

  /** True when the list holds more than one currency, so the total needs saying so. */
  const activeIsMixedCurrency = useMemo(
    () => new Set(activeItems.map((item) => item.currency)).size > 1,
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
    setEditorId(null);
    setDraft(null);
    setPurchasingId(null);
    setPurchaseDraft(null);
  };

  const startAdd = () => {
    resetForms();
    setEditorId("new");
    setDraft(emptyDraft(settings.baseCurrency, wishlistCategoryId));
    setNotice(null);
  };

  const startEdit = (item: WishlistItem) => {
    resetForms();
    setEditorId(item.id);
    setDraft(wishlistToDraft(item));
  };

  /**
   * One commit point for both add and edit.
   *
   * The draft is edited freely and locally; nothing is written to the snapshot
   * — and therefore nothing is queued for the server — until this runs.
   */
  const saveEditor = () => {
    if (!draft || !draft.name.trim() || !editorId) return;
    if (editorId === "new") {
      add({
        ...wishlistPayloadFromDraft(draft),
        categoryId: draft.categoryId || wishlistCategoryId,
        currency: draft.currency as CurrencyCode,
        bought: false,
        active: true,
      });
      setView("active");
    } else {
      update(editorId, {
        ...wishlistPayloadFromDraft(draft),
        currency: draft.currency as CurrencyCode,
      });
    }
    setNotice(null);
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
    success: { background: "var(--success-soft)", color: "var(--success-text)" },
    warning: { background: "var(--warning-soft)", color: "var(--warning-text)" },
  };

  return (
    <div className="page-enter" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <Section title={t("nav.wishlist")}>
        {!mutable && <div className="historical-banner">{t("common.readOnly")}</div>}

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
          {mutable && (
            <Button variant="primary" size="sm" onClick={startAdd}>
              <Plus size={14} /> {t("wishlist.addItem")}
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
              aria-label={t("a11y.dismissMessage")}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

      </Section>

      {/* The one editor, at the panel root rather than inside a card. */}
      {mutable && editorId && draft && (
        <EditForm
          title={editorId === "new" ? t("wishlist.newItem") : t("common.editNamed", { name: editingItem?.name ?? t("common.thatItem") })}
          categories={categoryOptions}
          currencies={currencyOptionsFor(settings, draft.currency as CurrencyCode)}
          draft={draft}
          onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
          onSave={saveEditor}
          onCancel={resetForms}
          submitLabel={t(editorId === "new" ? "wishlist.addItem" : "common.saveChanges")}
        />
      )}

      {/* Recording a purchase is its own task, so it gets the same shell. */}
      {mutable && purchasingItem && purchaseDraft && (
        <EditorSheet
          title={`Buy ${purchasingItem.name}`}
          subtitle={`Records a transaction in ${purchasingItem.currency} and marks the item bought.`}
          onClose={resetForms}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={resetForms}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={() => markBoughtOnly(purchasingItem)}>
                {t("wishlist.justMarkBought")}
              </Button>
              <Button type="submit" variant="primary" form="wishlist-purchase-form">
                <Check size={14} /> {t("wishlist.recordPurchase")}
              </Button>
            </>
          }
        >
          <form
            id="wishlist-purchase-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitPurchase(purchasingItem);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
              gap: 12,
            }}
          >
            <Field label={`Amount (${purchasingItem.currency})`}>
              <input
                className="input"
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={purchaseDraft.amount}
                onChange={(e) => setPurchaseDraft((current) => (current ? { ...current, amount: e.target.value } : current))}
              />
            </Field>
            <Field label={t("spending.date")}>
              <input
                className="input"
                type="date"
                required
                value={purchaseDraft.date}
                onChange={(e) => setPurchaseDraft((current) => (current ? { ...current, date: e.target.value } : current))}
              />
            </Field>
            <Field label={t("spending.category")} span>
              <select
                className="select"
                value={purchaseDraft.categoryId}
                onChange={(e) =>
                  setPurchaseDraft((current) => (current ? { ...current, categoryId: e.target.value } : current))
                }
              >
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </form>
        </EditorSheet>
      )}

      {/* Item cards */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title={
            view === "active"
              ? t("wishlist.noneActive")
              : view === "bought"
                ? t("wishlist.noneBought")
                : t("wishlist.empty")
          }
          description={t("wishlist.saveFuturePurchasesWithoutMixing")}
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
            // bought. The mark follows the brand when there is one (and the
            // item's own icon or image link before that); the link always
            // opens the shop.
            // The link's *label* must name where the link goes. It used to be
            // labelled with the icon's domain, so an item branded "azurpoly.com"
            // and sold on Contrail showed a link reading "azurpoly.com" that
            // opened contrail.com — the one place in the app where the text and
            // the destination disagreed.
            const sellerDomain = itemDomain(item.url);
            const brandDomain = itemDomain(item.brandUrl);
            const href = parseItemUrl(item.url)?.toString();
            const priority = PRIORITY_META[item.priority] ?? PRIORITY_META.low;
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
                trailing={swipeActionsFor(gestures.trailing, item, mutable)}
                leading={swipeActionsFor(gestures.leading, item, mutable)}
              >
              <div
                className={mutable ? "editable-row" : undefined}
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? `Edit ${item.name}` : undefined}
                onClick={(event) => {
                  if (!mutable) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, select, textarea")) return;
                  if (window.getSelection()?.toString()) return;
                  startEdit(item);
                }}
                onKeyDown={(event) => {
                  if (!mutable || event.target !== event.currentTarget) return;
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
                  <EntityMark
                    source={{ icon: item.icon, iconUrl: item.iconUrl, sourceUrl: itemIconSourceUrl(item) }}
                    accent={accent}
                    fallback={<ShoppingBag size={16} color={accent} />}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="text-callout"
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        textDecoration: item.bought ? "line-through" : "none",
                        // Wraps to two lines rather than truncating. On a 260px
                        // card "Amazon Flight Simulator Hardware" became
                        // "Amazon Fli…", which names nothing — and the card has
                        // the vertical room the ellipsis was saving.
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        overflowWrap: "anywhere",
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </div>
                    {/* `sellerDomain` and `href` come from the same validated
                        URL, so the label always names the destination and the
                        link is only ever http(s). */}
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", minWidth: 0 }}>
                      {sellerDomain && href && (
                        <a
                          className="text-caption"
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={`Buy from ${sellerDomain}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            maxWidth: "100%",
                            color: "var(--text-secondary)",
                            textDecoration: "none",
                            overflow: "hidden",
                            // An 18px-tall link is a poor target on a phone,
                            // and this one leaves the app for a shop.
                            padding: "4px 0",
                            minHeight: 26,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sellerDomain}
                          </span>
                          <ExternalLink size={11} style={{ flexShrink: 0 }} />
                        </a>
                      )}
                      {/* Named only when it differs, so the common case — shop
                          and maker are the same — stays a single line. */}
                      {brandDomain && brandDomain !== sellerDomain && (
                        <span
                          className="text-caption"
                          style={{ color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={`Brand: ${brandDomain}`}
                        >
                          by {brandDomain}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price and state.

                    The price sits here rather than beside the name: on a
                    260px card the two competed, and the name — which is the
                    thing being identified — lost, truncating to "Amazon
                    Fli…". A price is short and fixed-width; a name is not. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <strong className="money" style={{ fontSize: 15, color: "var(--text-primary)", marginRight: 2 }}>
                    {item.actualPrice != null
                      ? formatMoney(item.actualPrice, item.currency, settings.currencyDisplayMode)
                      : "—"}
                  </strong>
                  <span
                    className="badge"
                    style={{ background: priority.soft, color: priority.color }}
                    title={t(priority.hintKey)}
                  >
                    {t(priority.labelKey)}
                  </span>
                  {item.bought && (
                    <span className="badge badge-success">
                      {item.datePurchased
                        ? t("wishlist.boughtOn", { date: formatDate(item.datePurchased) })
                        : t("wishlist.bought")}
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
                      <Receipt size={11} /> {t(showLink ? "wishlist.hideTransaction" : "wishlist.viewTransaction")}
                    </button>
                  )}
                  {!item.inWishlist && <span className="badge badge-neutral">{t("wishlist.notInWishlist")}</span>}
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
                    <span>{t("wishlist.findItInSpendingTo")}</span>
                  </div>
                )}

                {/* Actions */}
                {mutable && (
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
                        title={t("wishlist.unmarkAsBought")}
                      >
                        <X size={14} /> {t("wishlist.notBought")}
                      </Button>
                    )}
                    {linked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => unlinkOnly(item)}
                        aria-label={t("wishlist.unlinkTransaction")}
                        title={t("wishlist.unlinkTheTransactionKeepingBoth")}
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
                      onClick={() => startEdit(item)}
                      aria-label={`Edit ${item.name}`}
                      title={t("common.edit")}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon
                      onClick={() => handleDelete(item)}
                      aria-label={t("wishlist.deleteWishlistItem")}
                      title={t("common.delete")}
                      style={{ color: "var(--danger-text)" }}
                    >
                      <Trash2 size={14} />
                    </Button>
                    </span>
                  </div>
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
            <span style={{ color: "var(--text-secondary)" }}>{t("wishlist.activeItems")} </span>
            <strong>{activeItems.length}</strong>
          </div>
          {activeTotal > 0 && (
            <div>
              <span style={{ color: "var(--text-secondary)" }}>{t("wishlist.activeTotal")} </span>
              <strong>{formatDualMoney(activeTotal, settings)}</strong>
              {activeIsMixedCurrency && (
                <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                  {" "}
                  · converted from {new Set(activeItems.map((item) => item.currency)).size} currencies
                </span>
              )}
            </div>
          )}
          <div>
            <span style={{ color: "var(--text-secondary)" }}>{t("wishlist.bought")} </span>
            <strong>{boughtItems.length}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
