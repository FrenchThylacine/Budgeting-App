import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bell,
  Coins,
  Database,
  Languages,
  Palette,
  Pointer,
  RefreshCw,
  Search,
  UserRound,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { trackedCurrencies } from "../../domain/currency";
import { FUNDING_KINDS, type FundingKind } from "../../domain/funding";
import { isHexColour } from "../../domain/statusColours";
import { formatDateTime } from "../../domain/dates";
import { LANGUAGES, findLanguage, searchLanguages } from "../../domain/languages";
import { resolveLanguage } from "../../domain/i18n";
import { AIRCRAFT, DEFAULT_AIRCRAFT, DEFAULT_FLEET_CRAFT, FLEET } from "../../domain/aircraft";
import { THEME_PRESETS, themeFor } from "../../domain/theme";
import {
  declineNotifications,
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "../../domain/notifications";
import { restartedOnboarding } from "../../domain/tutorial";
import { useTranslation } from "../../i18n/useTranslation";
import { Button } from "../ui/Button";
import { EditorSheet } from "../ui/EditorSheet";
import { AircraftArt, AircraftSilhouette } from "../ui/Aircraft";
import { AppMark } from "../ui/AppMark";
import { useBudgetStore } from "../../store/budgetStore";
import type { Appearance } from "../../domain/theme";
import type { CurrencyCode, CurrencyDisplayMode, RoundingRule } from "../../domain/types";
import { ACTION_DESCRIPTION_KEYS, ACTION_LABEL_KEYS, AVAILABLE_ACTIONS, gesturesFor } from "../../domain/gestures";
import { ImportControl } from "../data/ImportControl";
import { AccountSettings } from "./AccountSettings";
import { Section } from "../ui/Section";
import { SyncStatus } from "../layout/SyncStatus";
import { resolveStoredText } from "../../domain/storedText";

/**
 * Settings, in five groups rather than as one column of eleven.
 *
 * The previous version was a single page you scrolled: account, language,
 * currency, budget, year-end, appearance, sync, gestures, notifications, help,
 * data — in that order, every one of them always expanded. Finding "dark mode"
 * meant scrolling past the monthly budget, and finding the monthly budget meant
 * scrolling past the language list.
 *
 * The groups are chosen by *what the user is trying to do*, not by which part
 * of the code owns the setting: everything that changes how the application
 * looks is in one place, everything about money is in another. Each group fits
 * on a screen, which is the actual measure.
 */
type GroupId = "general" | "money" | "interaction" | "data" | "account";

const GROUPS: { id: GroupId; labelKey: string; icon: LucideIcon }[] = [
  { id: "general", labelKey: "settings.groupGeneral", icon: Palette },
  { id: "money", labelKey: "settings.groupMoney", icon: Coins },
  { id: "interaction", labelKey: "settings.groupInteraction", icon: Pointer },
  { id: "data", labelKey: "settings.groupData", icon: Database },
  { id: "account", labelKey: "settings.groupAccount", icon: UserRound },
];

const DISPLAY_MODES: { value: CurrencyDisplayMode; labelKey: string }[] = [
  { value: "symbol", labelKey: "settings.formatSymbol" },
  { value: "code", labelKey: "settings.formatCode" },
  { value: "both", labelKey: "settings.formatBoth" },
];

const ROUNDING_RULES: { value: RoundingRule; labelKey: string }[] = [
  { value: "none", labelKey: "settings.roundNone" },
  { value: "nearest-1", labelKey: "settings.roundNearest1" },
  { value: "nearest-5", labelKey: "settings.roundNearest5" },
  { value: "nearest-10", labelKey: "settings.roundNearest10" },
  { value: "ceil-10", labelKey: "settings.roundCeil10" },
];

const APPEARANCE_CHOICES: { value: Appearance; labelKey: string }[] = [
  { value: "light", labelKey: "settings.appearanceLight" },
  { value: "dark", labelKey: "settings.appearanceDark" },
  { value: "system", labelKey: "settings.appearanceSystem" },
];

export const SettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [group, setGroup] = useState<GroupId>("general");

  return (
    <div className="page-enter settings-page">
      <nav className="settings-groups" aria-label={t("settings.title")}>
        {GROUPS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`settings-group${group === id ? " is-active" : ""}`}
            aria-current={group === id ? "page" : undefined}
            onClick={() => setGroup(id)}
          >
            <Icon size={16} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {group === "general" && <GeneralSettings />}
        {group === "money" && <MoneySettings />}
        {group === "interaction" && <InteractionSettings />}
        {group === "data" && <DataSettings />}
        {group === "account" && <AccountGroup />}
      </div>
    </div>
  );
};

// ─── General: language, theme, aircraft ──────────────────────────────────────

const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const update = useBudgetStore((s) => s.updateSettings);
  const theme = themeFor(settings.themePreset);
  const appearance: Appearance = settings.appearance ?? (settings.darkMode ? "dark" : "light");

  return (
    <>
      <Section title={t("settings.language")}>
        <div className="card card-body settings-card">
          <LanguageSelector />
        </div>
      </Section>

      <Section title={t("settings.theme")}>
        <div className="card card-body settings-card">
          {/* Swatches rather than a dropdown of names: "Alpine" means nothing
              until you have seen it, and three colours say the whole thing. */}
          <div className="theme-grid" role="radiogroup" aria-label={t("settings.theme")}>
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={preset.id === theme.id}
                className={`theme-swatch${preset.id === theme.id ? " is-active" : ""}`}
                onClick={() => update({ themePreset: preset.id })}
              >
                <span className="theme-swatch-colours" aria-hidden="true">
                  {preset.swatch.map((colour, index) => (
                    <span key={index} style={{ background: colour }} />
                  ))}
                </span>
                <span className="text-callout">{t(preset.labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="settings-row">
            <span className="text-callout">{t("settings.appearance")}</span>
            <div className="segmented" role="radiogroup" aria-label={t("settings.appearance")}>
              {APPEARANCE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={appearance === choice.value}
                  className={`segmented-item${appearance === choice.value ? " active" : ""}`}
                  disabled={theme.darkOnly}
                  onClick={() =>
                    // Both are written. `darkMode` is what every snapshot
                    // before `appearance` existed carries, and anything still
                    // reading it — an older client, an export — must not be
                    // told the opposite of what is on screen.
                    update({
                      appearance: choice.value,
                      darkMode: choice.value === "system" ? settings.darkMode : choice.value === "dark",
                    })
                  }
                >
                  {t(choice.labelKey)}
                </button>
              ))}
            </div>
          </div>
          {theme.darkOnly && <p className="text-note settings-note">{t("settings.themeDarkOnly")}</p>}
        </div>
      </Section>

      {/* Who-paid, in the reader's own colours.

          Three swatches rather than a palette editor: these are the states the
          application actually uses colour to say, and every other colour in it
          belongs to the theme. The text shade is derived rather than chosen —
          a reader picking a pale yellow should get readable pale-yellow text,
          not an invisible label and a support question. */}
      <Section title={t("settings.statusColours")}>
        <div className="card card-body settings-card">
          <div className="status-colour-row">
            {FUNDING_KINDS.map((kind) => (
              <StatusColourField key={kind} kind={kind} />
            ))}
          </div>
          <p className="text-note settings-note">{t("settings.statusColoursHint")}</p>
        </div>
      </Section>

      {/* Two aeroplanes, two questions, no prose.
          The pictures are the explanation: one row shows the drawings the
          loading sequence flies, the other the silhouettes the transition
          flies. The paragraph that used to sit above them said, in a sentence,
          what a thumbnail says instantly. */}
      <Section title={t("settings.aircraft")}>
        <div className="card card-body settings-card">
          <div className="settings-stack">
            <span className="text-footnote">{t("settings.aircraftLoading")}</span>
            <div className="aircraft-grid" role="radiogroup" aria-label={t("settings.aircraftLoading")}>
              {AIRCRAFT.map((craft) => {
                const active = (settings.aircraft ?? DEFAULT_AIRCRAFT) === craft.id;
                return (
                  <button
                    key={craft.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`aircraft-choice${active ? " is-active" : ""}`}
                    data-aircraft={craft.id}
                    onClick={() => update({ aircraft: craft.id })}
                  >
                    <AircraftArt id={craft.id} size={92} />
                    <span className="text-caption">{t(craft.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-stack">
            <span className="text-footnote">{t("settings.aircraftTransition")}</span>
            {/* Twenty-two tiles, named only to a screen reader. A grid of
                shapes is read by looking at it; twenty-two captions would be a
                wall of words describing pictures that are already there. */}
            <div className="fleet-grid" role="radiogroup" aria-label={t("settings.aircraftTransition")}>
              {FLEET.map((craft) => {
                const active = (settings.transitionAircraft ?? DEFAULT_FLEET_CRAFT) === craft.id;
                return (
                  <button
                    key={craft.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(craft.labelKey)}
                    title={t(craft.labelKey)}
                    className={`fleet-choice${active ? " is-active" : ""}`}
                    data-fleet={craft.id}
                    onClick={() => update({ transitionAircraft: craft.id })}
                  >
                    <AircraftSilhouette id={craft.id} size={34} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("settings.interfaceExtras")}>
        <div className="card card-body settings-card">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.liveClockEnabled !== false}
              onChange={(e) => update({ liveClockEnabled: e.target.checked })}
            />
            <span>
              {t("settings.liveClock")}
              <span className="text-note">{t("settings.liveClockHint")}</span>
            </span>
          </label>
        </div>
      </Section>
    </>
  );
};

// ─── Money ───────────────────────────────────────────────────────────────────

const MoneySettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const update = useBudgetStore((s) => s.updateSettings);
  const tracked = trackedCurrencies(settings);

  return (
    <>
      <Section title={t("settings.budget")}>
        <div className="card card-body settings-card">
          <div className="settings-pair">
            <label className="field">
              <span className="field-label">{t("settings.monthlyBudget")}</span>
              <input
                className="input"
                data-setting="monthlyBudget"
                type="number"
                step="any"
                min="0"
                value={settings.monthlyBudget}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) update({ monthlyBudget: value });
                }}
              />
            </label>

            {/* The budget amount is stored in this currency and converted for
                display. Without this control the number was interpreted in a
                currency the user could neither see nor change. */}
            <label className="field">
              <span className="field-label">{t("settings.budgetCurrency")}</span>
              <select
                className="select"
                data-setting="monthlyBudgetCurrency"
                value={settings.monthlyBudgetCurrency}
                onChange={(e) => update({ monthlyBudgetCurrency: e.target.value as CurrencyCode })}
              >
                {tracked.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>

          {/* The old "Include Piloting in the monthly budget total" checkbox is
              gone. It assumed every budget has an activity called Piloting,
              could ask exactly one question about exactly one hard-coded thing,
              and did nothing for anyone who does not fly. What an activity
              costs the budget is now decided by its own funding — see the
              Activities tab. */}
          <p className="text-note settings-note">{t("settings.fundingRule")}</p>
        </div>
      </Section>

      <Section title={t("settings.currencyDisplay")}>
        <div className="card card-body settings-card">
          {/* Currencies moved out.

              Which currencies a budget deals in, and what they are worth
              against each other, are one subject; they used to be two screens —
              a chip list here and an "Exchange rates" category further down,
              neither of which said anything about the other. Both live in the
              Currencies tab, and this keeps only what is genuinely display. */}
          <div className="settings-crosslink">
            <Coins size={16} aria-hidden="true" />
            <div>
              <div className="text-callout">{t("currencies.pinned")}</div>
              <p className="text-note settings-note">{t("currencies.pinnedHint")}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("budget-os:navigate", { detail: "currencies" }))}
            >
              {t("nav.currencies")} <ArrowRight size={14} />
            </Button>
          </div>

          <div className="settings-pair">
            <label className="field">
              <span className="field-label">{t("settings.displayCurrency")}</span>
              <select
                className="select"
                data-setting="baseCurrency"
                value={settings.baseCurrency}
                onChange={(e) => update({ baseCurrency: e.target.value as CurrencyCode })}
              >
                {tracked.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>

            {/*
              The second currency.

              Off by default and off for every budget that has never set it: an
              extra line under every amount is a cost, and it only pays for
              itself if you genuinely think in two currencies.
            */}
            <label className="field">
              <span className="field-label">{t("settings.secondaryCurrency")}</span>
              <select
                className="select"
                data-setting="secondaryCurrency"
                value={settings.secondaryCurrency ?? ""}
                onChange={(e) =>
                  update({ secondaryCurrency: e.target.value ? (e.target.value as CurrencyCode) : undefined })
                }
              >
                <option value="">{t("settings.secondaryCurrencyOff")}</option>
                {tracked
                  .filter((currency) => currency !== settings.baseCurrency)
                  .map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
              </select>
            </label>
          </div>
          <p className="text-note settings-note">{t("settings.secondaryCurrencyHint")}</p>

          <div className="settings-pair">
            <label className="field">
              <span className="field-label">{t("settings.currencyFormat")}</span>
              <select
                className="select"
                data-setting="currencyDisplayMode"
                value={settings.currencyDisplayMode}
                onChange={(e) => update({ currencyDisplayMode: e.target.value as CurrencyDisplayMode })}
              >
                {DISPLAY_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{t(mode.labelKey)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">{t("settings.rounding")}</span>
              <select
                className="select"
                data-setting="roundingRule"
                value={settings.roundingRule}
                onChange={(e) => update({ roundingRule: e.target.value as RoundingRule })}
              >
                {ROUNDING_RULES.map((rule) => (
                  <option key={rule.value} value={rule.value}>{t(rule.labelKey)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Section>

      <Section title={t("settings.yearEnd")}>
        <div className="card card-body settings-card">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.autoWishlistFlushEnabled}
              onChange={(e) => update({ autoWishlistFlushEnabled: e.target.checked })}
            />
            <span>
              {t("settings.wishlistCarry")}
              <span className="text-note">{t("settings.wishlistCarryHint")}</span>
            </span>
          </label>

          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.saveTimestampEnabled}
              onChange={(e) => update({ saveTimestampEnabled: e.target.checked })}
            />
            <span>{t("settings.saveTimestamp")}</span>
          </label>
        </div>
      </Section>
    </>
  );
};

// ─── Interaction: gestures and notifications ─────────────────────────────────

const InteractionSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const update = useBudgetStore((s) => s.updateSettings);

  return (
    <>
      <Section title={t("notifications.title")}>
        <NotificationSettings />
      </Section>

      <Section title={t("settings.gestures")}>
        <div className="card card-body settings-card">
          <p className="text-note settings-note">{t("settings.gesturesHint")}</p>
          <div className="gesture-grid">
            {(["wishlist", "activities", "spending"] as const).map((surface) => {
              const current = gesturesFor(settings, surface);
              return (
                <div key={surface} className="gesture-row">
                  <span className="text-callout gesture-surface">{t(`nav.${surface}`)}</span>
                  {(["trailing", "leading"] as const).map((direction) => (
                    <label key={direction} className="gesture-choice">
                      <span className="text-footnote">
                        {direction === "trailing" ? t("settings.swipeLeft") : t("settings.swipeRight")}
                      </span>
                      <select
                        className="select"
                        value={current[direction]}
                        onChange={(event) =>
                          update({
                            gestures: {
                              ...settings.gestures,
                              [surface]: { ...current, [direction]: event.target.value },
                            },
                          })
                        }
                      >
                        {AVAILABLE_ACTIONS[surface].map((action) => (
                          <option key={action} value={action}>{t(ACTION_LABEL_KEYS[action])}</option>
                        ))}
                      </select>
                      {/* "Hide" and "Deactivate" are one keystroke apart in a
                          list and worlds apart in what they do to the budget,
                          so the chosen one says which it is — where the choice
                          is made, and only for the two that need it. */}
                      {ACTION_DESCRIPTION_KEYS[current[direction]] && (
                        <span className="text-note gesture-note">
                          {t(ACTION_DESCRIPTION_KEYS[current[direction]]!)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );
};

// ─── Data: import and sync ───────────────────────────────────────────────────

const DataSettings: React.FC = () => {
  const { t } = useTranslation();
  const lastSyncedAt = useBudgetStore((s) => s.lastSyncedAt);
  const syncError = useBudgetStore((s) => s.syncError);
  const pendingLocalChanges = useBudgetStore((s) => s.pendingLocalChanges);
  const syncNow = useBudgetStore((s) => s.syncNow);
  const retrySync = useBudgetStore((s) => s.retrySync);

  return (
    <>
      <Section title={t("settings.sync")}>
        <div className="card card-body settings-card">
          <div className="settings-row">
            <SyncStatus />
            <span className="text-caption">
              {lastSyncedAt ? t("settings.syncLast", { when: formatDateTime(lastSyncedAt) }) : t("settings.syncNever")}
            </span>
          </div>
          {syncError && <div className="text-caption" style={{ color: "var(--warning-text)" }}>{resolveStoredText(syncError, t)}</div>}
          <p className="text-note settings-note">{t("settings.syncHint")}</p>
          <div className="settings-actions">
            <Button variant="secondary" size="sm" onClick={() => void syncNow({ force: true })}>
              <RefreshCw size={14} /> {t("settings.syncNow")}
            </Button>
            {pendingLocalChanges && (
              <Button variant="primary" size="sm" onClick={() => void retrySync()}>
                {t("settings.sendLocal")}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title={t("settings.import")}>
        <p className="text-note settings-note" style={{ marginBottom: 12 }}>{t("settings.importHint")}</p>
        <ImportControl />
      </Section>
    </>
  );
};

// ─── Account and help ────────────────────────────────────────────────────────

const AccountGroup: React.FC = () => {
  const { t } = useTranslation();
  const update = useBudgetStore((s) => s.updateSettings);

  return (
    <>
      <AccountSettings />

      <Section title={t("settings.help")}>
        <div className="card card-body settings-card">
          <p className="text-note settings-note">{t("settings.replayTutorialHint")}</p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              data-action="replay-tutorial"
              onClick={() => {
                // Clearing both marks is what makes the tour run from the
                // start rather than resuming where it was abandoned, and the
                // event brings the card back without a reload.
                update({ onboarding: restartedOnboarding() });
                window.dispatchEvent(new CustomEvent("budget-os:replay-tutorial"));
              }}
            >
              {t("settings.replayTutorial")}
            </Button>
          </div>
        </div>
      </Section>

      <About />
    </>
  );
};

/**
 * About: what this is, which build, and who made it.
 *
 * Deliberately short. An About page is read once, by somebody checking a
 * version number before reporting something — so the version is the first
 * thing on it and the prose is four lines. The credits are there because the
 * application was genuinely built with those tools and saying so is more
 * honest than an empty "© 2026".
 */
const About: React.FC = () => {
  const { t } = useTranslation();
  // Substituted at build time from `package.json`; falls back rather than
  // throwing in a context that has no define (a test renderer, say).
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "—";

  return (
    <Section title={t("settings.about")}>
      <div className="card card-body settings-card about-card">
        <div className="about-head">
          <AppMark size={40} />
          <div>
            <div className="text-callout" style={{ fontWeight: 600 }}>
              Budget OS
            </div>
            <div className="text-caption">{t("about.tagline")}</div>
          </div>
          <span className="chip chip-muted about-version">v{version}</span>
        </div>

        <dl className="about-facts">
          <div>
            <dt className="text-footnote">{t("about.builtWith")}</dt>
            <dd>Claude · Codex · ChatGPT · Gemini · Copilot</dd>
          </div>
          <div>
            <dt className="text-footnote">{t("about.yourData")}</dt>
            <dd>{t("about.yourDataValue")}</dd>
          </div>
        </dl>

        <div className="about-links">
          <a className="btn btn-secondary btn-sm" href="https://github.com/FrenchThylacine/Budgeting-App" target="_blank" rel="noreferrer noopener">
            <ExternalLink size={14} /> {t("about.source")}
          </a>
        </div>
      </div>
    </Section>
  );
};

/**
 * A searchable language list.
 *
 * Seventy-six entries cannot be a `<select>`: a native dropdown of that length
 * is unusable with a thumb and unsearchable without one. This is a button that
 * opens a filtered list, searchable by English name, native name or code, with
 * the language's own name as the primary label — the person looking for
 * "Deutsch" should not have to know it is filed under G.
 *
 * Languages without bundled strings are offered and labelled as such. They are
 * not a lie: choosing one really does change how every date, number and amount
 * on screen is written, because that is the locale rather than the dictionary.
 */
const LanguageSelector: React.FC = () => {
  const { t } = useTranslation();
  const stored = useBudgetStore((s) => s.snapshot.settings.language);
  const update = useBudgetStore((s) => s.updateSettings);
  const active = resolveLanguage(stored);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLanguages(query), [query]);
  const current = findLanguage(active) ?? LANGUAGES[0];

  return (
    <>
      <button type="button" className="language-trigger" onClick={() => setOpen(true)}>
        <Languages size={16} aria-hidden="true" />
        <span className="language-trigger-text">
          <span className="language-native">{current.nativeName}</span>
          <span className="text-caption">{current.name}</span>
        </span>
        <span className="text-caption language-trigger-badge">
          {current.translated ? t("settings.languageTranslated") : t("settings.languageFormattingOnly")}
        </span>
      </button>

      {open && (
        <EditorSheet
          title={t("settings.language")}
          subtitle={t("settings.languageHint")}
          onClose={() => setOpen(false)}
          footer={
            <Button type="button" variant="primary" onClick={() => setOpen(false)}>
              {t("common.done")}
            </Button>
          }
        >
          <div className="language-picker">
            <label className="currency-picker-search">
              <Search size={15} aria-hidden="true" />
              <input
                className="input"
                type="search"
                autoFocus
                placeholder={t("settings.languageSearch")}
                aria-label={t("settings.languageSearch")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <ul className="language-list" aria-label={t("a11y.languageList")}>
              {results.map((language) => (
                <li key={language.code}>
                  <button
                    type="button"
                    className={`language-row${language.code === active ? " language-row-active" : ""}`}
                    aria-current={language.code === active ? "true" : undefined}
                    onClick={() => {
                      update({ language: language.code });
                      setOpen(false);
                    }}
                  >
                    <span className="language-row-text">
                      {/* The language names itself first. `lang` and `dir` on
                          the element so a right-to-left name renders correctly
                          inside a left-to-right list. */}
                      <span
                        className="language-native"
                        lang={language.code}
                        dir={language.rtl ? "rtl" : "ltr"}
                      >
                        {language.nativeName}
                      </span>
                      <span className="text-caption">{language.name}</span>
                    </span>
                    <span className="text-caption language-row-badge">
                      {language.translated ? t("settings.languageTranslated") : t("settings.languageFormattingOnly")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </EditorSheet>
      )}
    </>
  );
};

/**
 * Notification permission, honestly reported.
 *
 * Five states, each with a different correct thing to say and a different
 * correct control to offer — which is why this is a component and not a
 * checkbox. A checkbox cannot express "your browser has blocked this and I
 * cannot ask again".
 */
const NotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useBudgetStore((s) => s.snapshot.settings.notifications);
  const update = useBudgetStore((s) => s.updateSettings);
  const [note, setNote] = useState<string | null>(null);
  const status = notificationStatus(settings);

  const ask = async () => {
    const result = await requestNotificationPermission();
    update({ notifications: result.settings });
    setNote(
      result.outcome === "granted"
        ? t("notifications.enabled")
        : result.outcome === "unsupported"
          ? t("notifications.unsupported")
          : result.outcome === "denied" || result.outcome === "already-denied"
            ? t("notifications.blocked")
            : t("notifications.declined"),
    );
  };

  return (
    <div className="card card-body settings-card">
      <p className="text-note settings-note">{t("notifications.body")}</p>

      <div className="settings-actions">
        {status.state === "granted" ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const shown = showNotification(t("notifications.testTitle"), t("notifications.testBody"));
                setNote(shown ? t("notifications.testSent") : t("notifications.blocked"));
              }}
            >
              <Bell size={14} /> {t("notifications.test")}
            </Button>
            {/* Turning them off in the app is a real choice we can honour:
                the browser permission stays granted (only the user can revoke
                that), and nothing is sent while this is off. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update({ notifications: declineNotifications() });
                setNote(t("notifications.declined"));
              }}
            >
              {t("notifications.disable")}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" disabled={!status.canRequest} onClick={() => void ask()}>
            <Bell size={14} /> {t("notifications.enable")}
          </Button>
        )}
      </div>

      <div className="text-caption" role="status">
        {note ??
          (status.state === "granted"
            ? t("notifications.enabled")
            : status.state === "denied"
              ? t("notifications.blocked")
              : status.state === "unsupported"
                ? t("notifications.unsupported")
                : status.state === "declined"
                  ? t("notifications.declined")
                  : "")}
      </div>
    </div>
  );
};


/**
 * One status colour.
 *
 * The input needs a concrete hex to show, and an unchosen kind has none —
 * its colour is whatever the active theme defines. So the swatch reads the
 * *computed* value off the page rather than this file keeping a second copy of
 * every theme's palette, which is how a palette and its copy stop agreeing.
 */
const StatusColourField: React.FC<{ kind: FundingKind }> = ({ kind }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const update = useBudgetStore((state) => state.updateSettings);
  const chosen = settings.statusColours?.[kind];
  const [themeValue, setThemeValue] = useState("#000000");

  useEffect(() => {
    if (chosen) return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--funding-${kind}`).trim();
    if (isHexColour(raw)) setThemeValue(raw);
  }, [kind, chosen, settings.themePreset, settings.darkMode, settings.appearance]);

  const set = (value: string | undefined) => {
    const next: Partial<Record<FundingKind, string>> = { ...(settings.statusColours ?? {}) };
    if (value) next[kind] = value;
    else delete next[kind];
    update({ statusColours: next });
  };

  return (
    <div className="status-colour-field">
      <span className="text-footnote">{t(`funding.${kind}.short`)}</span>
      <div className="status-colour-controls">
        <input
          type="color"
          aria-label={t(`funding.${kind}.short`)}
          value={chosen ?? themeValue}
          onChange={(event) => set(event.target.value)}
        />
        {chosen && (
          <Button variant="ghost" size="sm" onClick={() => set(undefined)}>
            {t("settings.resetColour")}
          </Button>
        )}
      </div>
    </div>
  );
};
