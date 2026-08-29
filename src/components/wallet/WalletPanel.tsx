import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Info, Plus, RotateCcw, Trash2, Wallet as WalletIcon } from "lucide-react";
import { currencyOptionsFor, formatMoney } from "../../domain/currency";
import { monthName, todayDateInput } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import {
  budgetPeriods,
  leftoverBudget,
  monthlyBudgetPlan,
  walletState,
  type WalletMovement,
} from "../../domain/wallet";
import type { CurrencyCode, CurrencyDisplayMode, WalletEntryType } from "../../domain/types";
import { useTranslation } from "../../i18n/useTranslation";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EditorSheet } from "../ui/EditorSheet";
import { EmptyState } from "../ui/EmptyState";
import { Field, FieldGroup } from "../ui/Field";
import { Section } from "../ui/Section";
import { resolveStoredText } from "../../domain/storedText";

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
  const add = useBudgetStore((s) => s.addWalletEntry);
  const remove = useBudgetStore((s) => s.removeWalletEntry);
  const resetWallet = useBudgetStore((s) => s.resetWallet);
  const allocateBudget = useBudgetStore((s) => s.allocateBudget);
  const transferBudgetToPersonal = useBudgetStore((s) => s.transferBudgetToPersonal);
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
   * "Decide later" is a real answer.
   *
   * Dismissing the leftover prompt hides it for the session and changes
   * nothing about the money — which is the whole promise: leftover budget is
   * never swept away, and never nagged about twice in one sitting.
   */
  const [leftoverDismissed, setLeftoverDismissed] = useState(false);

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
        <p className="text-note" style={{ margin: "0 0 14px" }}>{t("wallet.subtitle")}</p>

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
            <div className="money wallet-balance-value">{money(wallet.walletBalance)}</div>
            <div className="text-caption">{t("wallet.walletBalanceHint")}</div>
          </div>

          <div className="wallet-balance" data-tone="budget">
            <div className="text-footnote">{t("wallet.budgetRemaining")}</div>
            <div className="money wallet-balance-value">{money(wallet.budgetRemaining)}</div>
            <div className="text-caption">{t("wallet.budgetRemainingHint")}</div>
          </div>

          <div className="wallet-balance" data-tone="personal">
            <div className="text-footnote">{t("wallet.personalBalance")}</div>
            <div className="money wallet-balance-value">{money(wallet.personalBalance)}</div>
            <div className="text-caption">{t("wallet.personalBalanceHint")}</div>
          </div>
        </div>

        {/* The planning figure, kept visually apart from the three balances so
            it can never be read as money in hand. */}
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

        {/* Leftover budget, surfaced rather than swept away. */}
        {leftover > 0 && !leftoverDismissed && mutable && (
          <div className="wallet-leftover" role="status">
            <div>
              <strong>{t("wallet.leftoverTitle", { amount: money(leftover) })}</strong>
              <p className="text-caption" style={{ margin: "4px 0 0" }}>{t("wallet.leftoverBody")}</p>
            </div>
            <div className="wallet-leftover-actions">
              <Button variant="secondary" size="sm" onClick={() => setLeftoverOpen(true)}>
                {t("wallet.leftoverTransfer")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLeftoverDismissed(true)}>
                {t("wallet.leftoverLater")}
              </Button>
            </div>
          </div>
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
            {wallet.movements.map((movement) => (
              <MovementRow
                key={movement.id}
                movement={movement}
                mutable={mutable}
                displayCurrency={snapshot.settings.baseCurrency}
                displayMode={snapshot.settings.currencyDisplayMode}
                money={money}
                formatDate={formatDate}
                t={t}
                onDelete={() => {
                  if (movement.spendingId) return;
                  if (window.confirm(t("spending.confirmDelete"))) remove(movement.id);
                }}
              />
            ))}
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
            transferBudgetToPersonal(leftover);
            setNotice(t("wallet.transferDone", { amount: money(leftover) }));
            setLeftoverOpen(false);
            setAllocationOpen(true);
          }}
          onKeep={() => {
            setLeftoverOpen(false);
            setLeftoverDismissed(true);
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
const MovementRow: React.FC<{
  movement: WalletMovement;
  mutable: boolean;
  displayCurrency: CurrencyCode;
  displayMode: CurrencyDisplayMode;
  money: (value: number) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  onDelete: () => void;
}> = ({ movement, mutable, displayCurrency, displayMode, money, formatDate, t, onDelete }) => {
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
          <Badge tone={TYPE_TONE[movement.kind]}>{t(TYPE_LABEL[movement.kind])}</Badge>
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
        {mutable && !movement.spendingId && (
          <div className="row-actions">
            <Button size="sm" variant="ghost" icon onClick={onDelete} aria-label={t("common.delete")}>
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
}> = ({ onClose, onSubmit }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [currency, setCurrency] = useState<CurrencyCode>(settings.baseCurrency);
  const [date, setDate] = useState(todayDateInput());
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<WalletEntryType>("personal");

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed !== 0 && source.trim() !== "" && date !== "";

  return (
    <EditorSheet
      title={t("wallet.addMovement")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" form="wallet-movement-form" disabled={!valid}>
            {t("common.add")}
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
          <Field label={t("common.total")} span>
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
