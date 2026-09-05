import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Info, Plus, RotateCcw, Trash2, Wallet as WalletIcon, AlertTriangle, Pencil } from "lucide-react";
import { currencyOptionsFor, formatMoney } from "../../domain/currency";
import { monthName, todayDateInput, isLastDayOfMonth, monthKey } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import {
  budgetPeriods,
  leftoverBudget,
  monthlyBudgetPlan,
  walletState,
  type WalletMovement,
} from "../../domain/wallet";
import type { BudgetSnapshot, CurrencyCode, CurrencyDisplayMode, SwipeActionId, WalletEntry, WalletEntryType } from "../../domain/types";
import { useTranslation } from "../../i18n/useTranslation";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EditorSheet } from "../ui/EditorSheet";
import { EmptyState } from "../ui/EmptyState";
import { Field, FieldGroup } from "../ui/Field";
import { Section } from "../ui/Section";
import { Total } from "../ui/Money";
import { SwipeRow } from "../ui/SwipeRow";
import { resolveStoredText } from "../../domain/storedText";
import { gesturesFor } from "../../domain/gestures";

/**
 * The Wallet: actual money, as distinct from planned money
 * ========================================================
 *
 * This tab answers "how much do I have, and where did it go". The rest of the
 * application answers "how much should I plan for", and the two are related
 * only in that the second suggests a figure whose arrival the first can
 * record. They are never collapsed into one number, because they diverge the
 * moment a user has any money of their own.
 *
 * Three balances lead the page, in the order people ask about them:
 *
 *   **Wallet balance**   — every real movement. The one number a person means
 *                          when they ask how much money they have.
 *   **Remaining budget** — of that, how much is this budget's money.
 *   **Personal balance** — the rest. Derived, so it cannot disagree.
 *
 * The panel does no arithmetic: every figure comes from `domain/wallet.ts`.
 */

/** Ledger types the "record a movement" form offers, in the order it offers them. */
const MOVEMENT_TYPES: { value: WalletEntryType; labelKey: string }[] = [
  { value: "personal", labelKey: "wallet.typePersonal" },
  { value: "adjustment", labelKey: "wallet.typeAdjustment" },
  { value: "opening", labelKey: "wallet.typeOpening" },
];

const TYPE_LABEL: Record<WalletEntryType | "spending", string> = {
  opening: "wallet.typeOpening",
  personal: "wallet.typePersonal",
  budget: "wallet.typeBudget",
  rollover: "wallet.typeRollover",
  adjustment: "wallet.typeAdjustment",
  transfer: "wallet.typeTransfer",
  spending: "wallet.spendingMovement",
};

const TYPE_TONE: Record<WalletEntryType | "spending", "neutral" | "info" | "success" | "warning"> = {
  opening: "info",
  personal: "neutral",
  budget: "success",
  rollover: "info",
  adjustment: "neutral",
  transfer: "info",
  spending: "warning",
};

export const WalletPanel: React.FC = () => {
  const { t, formatDate, monthNames } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const add = useBudgetStore((s) => s.addWalletEntry);
  const remove = useBudgetStore((s) => s.removeWalletEntry);
  const updateWalletEntry = useBudgetStore((state) => state.updateWalletEntry);
  const resetWallet = useBudgetStore((s) => s.resetWallet);
  const allocateBudget = useBudgetStore((s) => s.allocateBudget);
  const sweepBudgetToPersonal = useBudgetStore((s) => s.sweepBudgetToPersonal);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const wallet = useMemo(() => walletState(snapshot), [snapshot]);
  const periods = useMemo(() => budgetPeriods(snapshot), [snapshot]);
  const plan = useMemo(() => monthlyBudgetPlan(snapshot), [snapshot]);
  const leftover = useMemo(() => leftoverBudget(snapshot), [snapshot]);

  const [allocationOpen, setAllocationOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [leftoverOpen, setLeftoverOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * "Decide later" is a real answer, and it is remembered.
   *
   * It used to be component state, so the banner came back on the next reload
   * — which is the opposite of remembering a decision. It is stored against
   * the *month* it was given for, because deferring is an answer about this
   * month's leftover and next month's is a new question.
   */
  const deferredFor = snapshot.settings.leftoverDeferredFor;
  const thisMonth = monthKey();
  const deferred = deferredFor === thisMonth;

  /*
   * And it is only asked on the day it is live.
   *
   * The offer to move leftover budget into personal money used to sit on the
   * wallet all month, which makes it a permanent notice rather than a
   * decision. The month's leftover is only final on the month's last day, so
   * that is the day it asks. On any other day the money is simply still
   * budget, and there is nothing to decide.
   */
  const monthEnds = isLastDayOfMonth();

  /** The entry currently open for editing, or null. */
  const [editingEntry, setEditingEntry] = useState<WalletEntry | null>(null);

  /*
   * The same gesture preferences the other lists read, for a surface that is
   * now offered in Settings alongside them. Turning swipe off there turns it
   * off here.
   */
  const walletGestures = gesturesFor(snapshot.settings, "wallet");

  const walletSwipe = (
    action: SwipeActionId,
    editable: boolean,
    onEdit: () => void,
    onDelete: () => void,
  ) => {
    if (!editable || action === "none") return [];
    if (action === "delete") {
      return [{ label: t("common.delete"), icon: <Trash2 size={18} />, destructive: true, onAction: onDelete }];
    }
    if (action === "edit") {
      return [{ label: t("common.edit"), icon: <Pencil size={18} />, onAction: onEdit }];
    }
    return [];
  };
  const hasLeftover = leftover > 0 && mutable;
  const askNow = hasLeftover && monthEnds && !deferred;
  const deferredMark = hasLeftover && monthEnds && deferred;

  const money = (value: number | null | undefined) => formatDualMoney(value, snapshot.settings);
  // Through `Intl`, not the English-only `monthName()`: "Prévu pour August"
  // is an English word in a French sentence.
  const localMonth = (month: number) => monthNames()[month - 1] ?? monthName(month);
  const monthLabel = localMonth(snapshot.settings.selectedMonth);

  return (
    <div className="page-enter wallet-page" style={{ display: "grid", gap: 20 }}>
      <Section
        title={t("wallet.title")}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              size="sm"
              data-action="allocate-budget"
              disabled={!mutable}
              onClick={() => {
                // The natural second moment to reconcile leftover budget: just
                // before more arrives, when the two amounts are about to be
                // mixed together.
                if (leftover > 0) setLeftoverOpen(true);
                else setAllocationOpen(true);
              }}
            >
              <Plus size={14} /> {t("wallet.addAllocation")}
            </Button>
            <Button variant="secondary" size="sm" disabled={!mutable} onClick={() => setMovementOpen(true)}>
              <ArrowDownLeft size={14} /> {t("wallet.addMovement")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-action="reset-wallet"
              disabled={!mutable}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw size={14} /> {t("wallet.reset")}
            </Button>
          </div>
        }
      >

        {!mutable && <div className="historical-banner">{t("common.readOnly")}</div>}

        {notice && (
          <div role="status" className="text-caption wallet-notice">
            <Info size={14} aria-hidden="true" /> {notice}
          </div>
        )}

        {/* The three balances. Three cards, never two and never one: the wallet
            holds one pile of money, and the other two say how much of it is
            already spoken for. */}
        <div className="wallet-balances">
          <div className="wallet-balance wallet-balance-primary">
            <div className="text-footnote">
              <WalletIcon size={13} aria-hidden="true" /> {t("wallet.walletBalance")}
            </div>
            <div className="money wallet-balance-value"><Total amount={wallet.walletBalance} /></div>
            <div className="text-caption">{t("wallet.walletBalanceHint")}</div>
          </div>

          <div className="wallet-balance" data-tone="budget">
            <div className="text-footnote">{t("wallet.budgetRemaining")}</div>
            <div className="money wallet-balance-value"><Total amount={wallet.budgetRemaining} /></div>
            <div className="text-caption">{t("wallet.budgetRemainingHint")}</div>
          </div>

          <div className="wallet-balance" data-tone="personal">
            <div className="text-footnote">{t("wallet.personalBalance")}</div>
            <div className="money wallet-balance-value"><Total amount={wallet.personalBalance} /></div>
            <div className="text-caption">{t("wallet.personalBalanceHint")}</div>
          </div>
        </div>

        {/* The planning figure, kept visually apart from the three balances so
            it can never be read as money in hand — and absent when there is
            nothing to plan. A card reading "planned: €0.00, a plan, not money
            you have" is three lines about the absence of a number. */}
        {(plan.suggested > 0 || plan.requirement > 0 || plan.unscheduledCount > 0) && (
        <div className="wallet-plan">
          <div>
            <div className="text-footnote">{t("wallet.plannedBudget", { month: monthLabel })}</div>
            <div className="money wallet-plan-value">{money(plan.suggested)}</div>
            <div className="text-caption">
              {t("wallet.requirement", { amount: money(plan.requirement) })}
              {plan.unscheduledCount > 0
                ? ` · ${t("activities.unscheduled", { count: plan.unscheduledCount })}`
                : ""}
            </div>
          </div>
          <p className="text-note wallet-plan-note">{t("wallet.plannedBudgetHint")}</p>
        </div>
        )}

        {/* Leftover budget, surfaced rather than swept away — on the day the
            question is live, and once. */}
        {askNow && (
          <div className="wallet-leftover" role="status">
            <div>
              <strong>{t("wallet.leftoverTitle", { amount: money(leftover) })}</strong>
              <p className="text-caption" style={{ margin: "4px 0 0" }}>{t("wallet.leftoverBody")}</p>
            </div>
            <div className="wallet-leftover-actions">
              <Button variant="secondary" size="sm" onClick={() => setLeftoverOpen(true)}>
                {t("wallet.leftoverTransfer")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateSettings({ leftoverDeferredFor: thisMonth })}
              >
                {t("wallet.leftoverLater")}
              </Button>
            </div>
          </div>
        )}

        {/* Deferred, not forgotten.

            The banner is gone for the month, and the decision is still one
            press away — an amber mark rather than a notice that reappears
            every time the tab is opened. */}
        {deferredMark && (
          <p className="wallet-deferred">
            <button type="button" className="info-dot" data-tone="warning" onClick={() => setLeftoverOpen(true)}>
              <AlertTriangle size={13} aria-hidden="true" />
            </button>
            <button type="button" className="wallet-deferred-text" onClick={() => setLeftoverOpen(true)}>
              {t("wallet.leftoverDeferred", { amount: money(leftover) })}
            </button>
          </p>
        )}

        <div className="wallet-flows">
          <span className="text-caption">
            <ArrowDownLeft size={13} aria-hidden="true" /> {t("wallet.moneyInTotal")} {money(wallet.moneyIn)}
          </span>
          <span className="text-caption">
            <ArrowUpRight size={13} aria-hidden="true" /> {t("wallet.moneyOutTotal")} {money(wallet.moneyOut)}
          </span>
        </div>
      </Section>

      {/* Budget month by month. `carriedIn` is the point of the table: a month
          ending does not consume money, so September starts with whatever
          August did not spend. */}
      {periods.length > 0 && (
        <Section title={t("wallet.allocationHistory")}>
          <div className="card card-body wallet-periods-wrap">
            <table className="wallet-periods">
              <thead>
                <tr>
                  <th>{t("common.month")}</th>
                  <th className="num">{t("wallet.carriedIn")}</th>
                  <th className="num">{t("wallet.allocated")}</th>
                  <th className="num">{t("wallet.spent")}</th>
                  <th className="num">{t("wallet.transferred")}</th>
                  <th className="num">{t("wallet.remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={`${period.year}-${period.month}`}>
                    <td>{`${localMonth(period.month)} ${period.year}`}</td>
                    <td className="num">{money(period.carriedIn)}</td>
                    <td className="num">{money(period.allocated)}</td>
                    <td className="num">{money(period.spent)}</td>
                    <td className="num">{period.transferred > 0 ? money(period.transferred) : "—"}</td>
                    <td className="num wallet-period-remaining">{money(period.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title={t("wallet.ledger")}>
        {wallet.movements.length === 0 ? (
          <EmptyState title={t("wallet.ledgerEmpty")} description={t("wallet.ledgerEmptyBody")} />
        ) : (
          <div className="item-list">
            {wallet.movements.map((movement) => {
              /*
               * A movement that came from a transaction is edited where it was
               * written — in Spending — so the ledger never offers two places
               * to change one fact.
               */
              const editable = mutable && !movement.spendingId;
              const onDelete = () => {
                if (!editable) return;
                if (window.confirm(t("spending.confirmDelete"))) remove(movement.id);
              };
              const onEdit = () => {
                if (!editable) return;
                const entry = walletEntryById(snapshot, movement.id);
                if (entry) setEditingEntry(entry);
              };
              return (
                <SwipeRow
                  key={movement.id}
                  label={resolveStoredText(movement.label, t)}
                  trailing={walletSwipe(walletGestures.trailing, editable, onEdit, onDelete)}
                  leading={walletSwipe(walletGestures.leading, editable, onEdit, onDelete)}
                >
                  <MovementRow
                    movement={movement}
                    mutable={editable}
                    displayCurrency={snapshot.settings.baseCurrency}
                    displayMode={snapshot.settings.currencyDisplayMode}
                    money={money}
                    formatDate={formatDate}
                    t={t}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </SwipeRow>
              );
            })}
          </div>
        )}
      </Section>

      {allocationOpen && (
        <AllocationSheet
          suggested={plan.suggested}
          monthLabel={monthLabel}
          onClose={() => setAllocationOpen(false)}
          onSubmit={(input) => {
            allocateBudget(input);
            setAllocationOpen(false);
          }}
        />
      )}

      {editingEntry && (
        <MovementSheet
          editing={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSubmit={(input) => {
            /*
             * Written back exactly as typed: the amount in the currency chosen
             * here, the sign from the direction, the date as given. Nothing is
             * converted on the way in, so an edit cannot reprice an entry.
             */
            updateWalletEntry(editingEntry.id, {
              amount: input.direction === "out" ? -Math.abs(input.amount) : Math.abs(input.amount),
              currency: input.currency,
              date: input.date,
              year: Number(input.date.slice(0, 4)),
              month: Number(input.date.slice(5, 7)),
              source: input.source,
              note: input.note,
              type: input.type,
            });
            setEditingEntry(null);
          }}
        />
      )}

      {movementOpen && (
        <MovementSheet
          onClose={() => setMovementOpen(false)}
          onSubmit={(input) => {
            add({
              year: Number(input.date.slice(0, 4)),
              month: Number(input.date.slice(5, 7)),
              date: input.date,
              // The sign *is* the direction, so the two can never disagree.
              amount: input.direction === "out" ? -Math.abs(input.amount) : Math.abs(input.amount),
              currency: input.currency,
              source: input.source,
              type: input.type,
              note: input.note,
            });
            setMovementOpen(false);
          }}
        />
      )}

      {leftoverOpen && (
        <LeftoverSheet
          amount={leftover}
          money={money}
          onClose={() => setLeftoverOpen(false)}
          onTransfer={() => {
            /*
             * The *sweep*, not a transfer of the converted figure.
             *
             * `leftover` is the claim converted into the display currency, and
             * it is the right number to *say* — the sheet is asking about it
             * in the reader's own money. It is the wrong number to *write*: a
             * cancellation has to be denominated the way the entries it
             * cancels are, or the two sides stop netting the next time the
             * rate provider answers. The sweep writes one entry per currency
             * the claim is actually held in.
             */
            sweepBudgetToPersonal();
            setNotice(t("wallet.transferDone", { amount: money(leftover) }));
            setLeftoverOpen(false);
            setAllocationOpen(true);
          }}
          onKeep={() => {
            setLeftoverOpen(false);
            // Keeping it as budget is the same answer as "decide later": the
            // money does not move, and the question is settled for this month.
            updateSettings({ leftoverDeferredFor: thisMonth });
            setAllocationOpen(true);
          }}
        />
      )}

      {resetOpen && (
        <EditorSheet
          title={t("wallet.resetConfirmTitle")}
          subtitle={`${t("wallet.walletBalance")}: ${money(wallet.walletBalance)}`}
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                data-action="confirm-reset-wallet"
                onClick={() => {
                  const written = resetWallet();
                  setNotice(written == null ? t("wallet.resetAlreadyZero") : t("wallet.resetDone"));
                  setResetOpen(false);
                }}
              >
                <RotateCcw size={14} /> {t("wallet.resetConfirmAction")}
              </Button>
            </>
          }
        >
          <p className="text-body">{t("wallet.resetConfirmBody")}</p>
        </EditorSheet>
      )}
    </div>
  );
};

/** One movement. Spending rows are read-only here: they belong to Spending. */

/**
 * The stored entry behind a movement row.
 *
 * `WalletMovement` is a projection for display — it carries a converted figure
 * and a resolved label — and editing must act on the record, not on the view of
 * it. Searched across every year because the ledger is continuous.
 */
function walletEntryById(snapshot: BudgetSnapshot, entryId: string): WalletEntry | null {
  for (const record of Object.values(snapshot.years)) {
    const found = record.walletEntries.find((entry) => entry.id === entryId);
    if (found) return found;
  }
  return null;
}

const MovementRow: React.FC<{
  movement: WalletMovement;
  mutable: boolean;
  displayCurrency: CurrencyCode;
  displayMode: CurrencyDisplayMode;
  money: (value: number) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ movement, mutable, displayCurrency, displayMode, money, formatDate, t, onEdit, onDelete }) => {
  const out = movement.direction === "out";
  const isTransfer = movement.kind === "transfer";

  return (
    <div className="item-row wallet-row" data-direction={movement.direction}>
      <span className={`wallet-row-arrow${out ? " wallet-row-arrow-out" : ""}`} aria-hidden="true">
        {out ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
      </span>
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        <div className="text-callout wallet-row-title">
          {resolveStoredText(movement.label, t)}
          {/* The badge names the *exception*, not the rule.
              "Budget spending" sat on every outgoing row — a column of the
              same two words down the whole ledger, beside a red minus figure
              that had already said it. The rows that are not ordinary budget
              spending are the ones worth marking. */}
          {movement.kind !== "spending" && (
            <Badge tone={TYPE_TONE[movement.kind]}>{t(TYPE_LABEL[movement.kind])}</Badge>
          )}
        </div>
        <div className="text-footnote">
          {formatDate(movement.date, { day: "numeric", month: "short", year: "numeric" })}
          {movement.note ? <span className="user-text"> · {resolveStoredText(movement.note, t)}</span> : ""}
        </div>
      </div>
      <div className="row-trailing">
        <div style={{ textAlign: "right" }}>
          <strong className={out ? "wallet-amount-out" : "wallet-amount-in"}>
            {/* A transfer is neither in nor out: it carries no sign, so nobody
                reads it as cash arriving or leaving. */}
            {isTransfer ? "" : out ? "−" : "+"}
            {formatMoney(movement.amountNative, movement.currency, displayMode)}
          </strong>
          {movement.currency !== displayCurrency && (
            <div className="text-footnote">≈ {money(movement.amountBase)}</div>
          )}
        </div>
        {mutable && (
          /* The same two controls, in the same order, as a transaction row:
             the treasury is a ledger and should not have an interaction
             language of its own. */
          <div className="row-actions">
            <Button size="sm" variant="ghost" icon onClick={onEdit} aria-label={t("common.edit")} title={t("common.edit")}>
              <Pencil size={15} />
            </Button>
            <Button size="sm" variant="ghost" icon onClick={onDelete} aria-label={t("common.delete")} title={t("common.delete")}>
              <Trash2 size={15} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Recording budget money that has actually arrived.
 *
 * The suggestion is offered as a one-press default and never applied for the
 * user: the app calculating that €600 is needed is not evidence that €600 was
 * received, and a treasury that assumes otherwise is fiction.
 */
const AllocationSheet: React.FC<{
  suggested: number;
  monthLabel: string;
  onClose: () => void;
  onSubmit: (input: { amount: number; currency: CurrencyCode; date: string; note: string }) => void;
}> = ({ suggested, monthLabel, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [currency, setCurrency] = useState<CurrencyCode>(settings.monthlyBudgetCurrency ?? settings.baseCurrency);
  const [date, setDate] = useState(todayDateInput());
  const [note, setNote] = useState("");

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && date !== "";

  return (
    <EditorSheet
      title={t("wallet.addAllocationTitle")}
      subtitle={t("wallet.addAllocationHint")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="wallet-allocation-form" disabled={!valid}>
            {t("common.add")}
          </Button>
        </>
      }
    >
      <form
        id="wallet-allocation-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit({ amount: parsed, currency, date, note });
        }}
        style={{ display: "grid", gap: 20 }}
      >
        <FieldGroup title={t("wallet.plannedBudget", { month: monthLabel })}>
          <Field label={t("wallet.allocationAmount")} name="allocationAmount">
            <input
              className="input"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label={t("spending.currency")}>
            <select
              className="select"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
            >
              {currencyOptionsFor(settings, currency).map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </Field>
          <Field label={t("wallet.allocationDate")}>
            <input
              className="input"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label={t("wallet.allocationNote")} span>
            <input
              className="input"
              placeholder={t("common.optional")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {suggested > 0 && (
            <Field
              label={t("wallet.plannedBudget", { month: monthLabel })}
              span
              group
              hint={t("wallet.plannedBudgetHint")}
            >
              <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(String(suggested))}>
                {t("wallet.allocationSuggested", {
                  amount: formatMoney(suggested, settings.baseCurrency, settings.currencyDisplayMode),
                })}
              </Button>
            </Field>
          )}
        </FieldGroup>
      </form>
    </EditorSheet>
  );
};

/** Any other money movement: the user's own money in, or cash out. */
const MovementSheet: React.FC<{
  /**
   * The entry being edited, or nothing when one is being created.
   *
   * Editing loads the values *as stored* — the amount in its own currency, the
   * direction from its sign, the date, the type. The display currency is not
   * consulted anywhere in here, which is the point: opening an entry to change
   * its note must not be a way to quietly reprice it.
   */
  editing?: WalletEntry | null;
  onClose: () => void;
  onSubmit: (input: {
    amount: number;
    direction: "in" | "out";
    currency: CurrencyCode;
    date: string;
    source: string;
    note: string;
    type: WalletEntryType;
  }) => void;
}> = ({ editing, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const [amount, setAmount] = useState(editing ? String(Math.abs(editing.amount)) : "");
  const [direction, setDirection] = useState<"in" | "out">(
    editing ? (editing.amount < 0 ? "out" : "in") : "in",
  );
  const [currency, setCurrency] = useState<CurrencyCode>(editing?.currency ?? settings.baseCurrency);
  const [date, setDate] = useState(editing?.date ?? todayDateInput());
  const [source, setSource] = useState(editing?.source ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [type, setType] = useState<WalletEntryType>(editing?.type ?? "personal");

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed !== 0 && source.trim() !== "" && date !== "";

  return (
    <EditorSheet
      title={editing ? t("wallet.editMovement") : t("wallet.addMovement")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="wallet-movement-form" disabled={!valid}>
            {editing ? t("common.saveChanges") : t("common.add")}
          </Button>
        </>
      }
    >
      <form
        id="wallet-movement-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSubmit({ amount: parsed, direction, currency, date, source: source.trim(), note, type });
        }}
        style={{ display: "grid", gap: 20 }}
      >
        <FieldGroup title={t("wallet.ledger")}>
          {/* Direction is a choice, not a minus sign the user has to remember
              to type. The sign is written from it. */}
          <Field label={t("wallet.direction")} span group>
            <div className="wallet-direction" role="group" aria-label={t("wallet.direction")}>
              <button
                type="button"
                className={`chip${direction === "in" ? " active" : ""}`}
                aria-pressed={direction === "in"}
                onClick={() => setDirection("in")}
              >
                <ArrowDownLeft size={14} /> {t("wallet.moneyIn")}
              </button>
              <button
                type="button"
                className={`chip${direction === "out" ? " active" : ""}`}
                aria-pressed={direction === "out"}
                onClick={() => setDirection("out")}
              >
                <ArrowUpRight size={14} /> {t("wallet.moneyOut")}
              </button>
            </div>
          </Field>
          <Field label={t("spending.amount")}>
            <input
              className="input"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label={t("spending.currency")}>
            <select
              className="select"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
            >
              {currencyOptionsFor(settings, currency).map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </Field>
          <Field label={t("spending.date")}>
            <input
              className="input"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label={t("wallet.movementType")}>
            <select
              className="select"
              value={type}
              onChange={(event) => setType(event.target.value as WalletEntryType)}
            >
              {MOVEMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("wallet.entryLabel")} span>
            <input
              className="input"
              required
              placeholder={t("wallet.salaryCashWithdrawal")}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </Field>
          <Field label={t("spending.note")} span>
            <input
              className="input"
              placeholder={t("common.optional")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </form>
    </EditorSheet>
  );
};

/**
 * What to do with leftover budget.
 *
 * Three answers, and none of them is taken for the user: transfer it, keep it
 * as budget money, or decide later. Nothing is deleted and nothing is reset by
 * the passing of a month.
 */
const LeftoverSheet: React.FC<{
  amount: number;
  money: (value: number) => string;
  onClose: () => void;
  onTransfer: () => void;
  onKeep: () => void;
}> = ({ amount, money, onClose, onTransfer, onKeep }) => {
  const { t } = useTranslation();
  return (
    <EditorSheet
      title={t("wallet.leftoverTitle", { amount: money(amount) })}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("wallet.leftoverLater")}
          </Button>
          <Button type="button" variant="secondary" onClick={onKeep}>
            {t("wallet.leftoverKeep")}
          </Button>
          <Button type="button" variant="primary" onClick={onTransfer}>
            {t("wallet.leftoverTransfer")}
          </Button>
        </>
      }
    >
      <p className="text-body">{t("wallet.leftoverBody")}</p>
      <p className="text-note" style={{ marginTop: 12 }}>{t("wallet.transferNote")}</p>
    </EditorSheet>
  );
};
