import React, { useState } from "react";
import { Check, Copy, FlaskConical, Leaf, Pencil, Plus, Trash2 } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { isScenarioActive, scenarioActivityCount, scenarioDiff, scenarioProjection } from "../../domain/scenarios";
import { useTranslation } from "../../i18n/useTranslation";
import { formatMoney } from "../../domain/currency";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import { ScenarioEditor } from "./ScenarioEditor";
import { ScenarioApplyDialog } from "./ScenarioApplyDialog";
import type { ScenarioPreset } from "../../domain/types";

/**
 * Saved budget scenarios.
 *
 * Previously this listed the presets and offered a single "Apply" button.
 * Applying one silently rewrote the monthly budget, the piloting rule and every
 * category cap the scenario named, with nothing shown beforehand and no way to
 * create, edit, duplicate or delete a scenario at all — the seeded three were
 * all anyone could ever have.
 */
export const ScenarioLab: React.FC = () => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const presets = snapshot.scenarioPresets;
  const apply = useBudgetStore((s) => s.applyScenarioPreset);
  const duplicate = useBudgetStore((s) => s.duplicateScenarioPreset);
  const remove = useBudgetStore((s) => s.removeScenarioPreset);
  const capture = useBudgetStore((s) => s.captureScenarioPreset);
  const seasons = snapshot.seasonalPresets;
  const applySeason = useBudgetStore((s) => s.applySeasonalPreset);
  const captureSeason = useBudgetStore((s) => s.captureSeasonalPreset);
  const removeSeason = useBudgetStore((s) => s.removeSeasonalPreset);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const [editing, setEditing] = useState<ScenarioPreset | "new" | null>(null);
  const [applying, setApplying] = useState<ScenarioPreset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSeason, setConfirmSeason] = useState<string | null>(null);

  const activities = snapshot.years[String(snapshot.settings.selectedYear)]?.activities ?? [];
  const currentSeason = snapshot.settings.selectedSeason;

  const money = (value: number | null | undefined): string =>
    value == null ? "—" : formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode);

  return (
    <div className="page-enter">
      <Section
        title={t("nav.scenarios")}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!mutable}
              onClick={() => {
                const name = window.prompt("Name this snapshot of your current budget:", "Current setup");
                if (name?.trim()) capture(name.trim());
              }}
            >
              <Check size={14} /> {t("scenarios.saveCurrent")}
            </Button>
            <Button variant="primary" size="sm" disabled={!mutable} onClick={() => setEditing("new")}>
              <Plus size={14} /> {t("scenarios.new")}
            </Button>
          </div>
        }
      >
        <p className="text-note" style={{ marginBottom: 20 }}>
          {t("scenarios.intro")}
        </p>

        {presets.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={24} />}
            title={t("scenarios.empty")}
            description={t("scenarios.emptyBody")}
          />
        ) : (
          <div className="scenario-list">
            {presets.map((preset) => {
              const changes = scenarioDiff(snapshot, preset);
              const active = isScenarioActive(snapshot, preset);
              // Generic, and counted against the activities that exist rather
              // than against the ids the scenario happens to name.
              const count = scenarioActivityCount(snapshot, preset);
              const projection = scenarioProjection(snapshot, preset);
              return (
                <article
                  key={preset.id}
                  className={`scenario-card${active ? " scenario-card-active" : ""}${mutable ? " editable-row" : ""}`}
                  role={mutable ? "button" : undefined}
                  tabIndex={mutable ? 0 : undefined}
                  aria-label={mutable ? t("common.editNamed", { name: preset.name }) : undefined}
                  onClick={(event) => {
                    if (!mutable) return;
                    const target = event.target as HTMLElement;
                    // The card's own buttons apply, duplicate and delete; only
                    // a click on the card itself means "edit".
                    if (target.closest("button, a, input, select, textarea")) return;
                    if (window.getSelection()?.toString()) return;
                    setEditing(preset);
                  }}
                  onKeyDown={(event) => {
                    if (!mutable || event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditing(preset);
                    }
                  }}
                >
                  <header className="scenario-head">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="text-callout scenario-name">{preset.name}</h3>
                      {preset.notes && <p className="text-note scenario-notes">{preset.notes}</p>}
                    </div>
                    {active && (
                      <span className="scenario-badge" title={t("scenario.theseSettingsAreAlreadyIn")}>
                        <Check size={12} aria-hidden="true" /> {t("scenarios.inEffect")}
                      </span>
                    )}
                  </header>

                  <dl className="scenario-figures">
                    <div>
                      <dt className="text-footnote">{t("settings.budget")}</dt>
                      <dd className="money">{money(preset.monthlyBudget)}</dd>
                    </div>
                    {/* "X of Y activities enabled" — the generic replacement
                        for "piloting included / excluded", and it stays
                        current because it is recomputed against the live
                        activity list rather than stored on the scenario. */}
                    <div>
                      <dt className="text-footnote">{t("scenarios.activitiesSection")}</dt>
                      <dd>{t("scenarios.activityCount", { enabled: count.enabled, total: count.total })}</dd>
                    </div>
                    <div>
                      <dt className="text-footnote">{t("scenarios.personalMonthly")}</dt>
                      <dd className="money">{money(projection.personalMonthly)}</dd>
                    </div>
                    <div>
                      <dt className="text-footnote">{t("scenario.caps")}</dt>
                      <dd>{Object.keys(preset.categoryCaps ?? {}).length || "—"}</dd>
                    </div>
                  </dl>

                  {/* The gross and the two exclusions, so a scenario that
                      moves an activity onto somebody else's tab shows both
                      that the cost still exists and that it no longer lands
                      on this budget. */}
                  {(projection.otherFundedMonthly > 0 || projection.outsideBudgetMonthly > 0) && (
                    <p className="text-caption scenario-funding-note">
                      {t("scenarios.grossMonthly")} {money(projection.grossMonthly)} ·{" "}
                      {t("funding.other.short")} {money(projection.otherFundedMonthly)} ·{" "}
                      {t("funding.outside.short")} {money(projection.outsideBudgetMonthly)}
                    </p>
                  )}

                  <footer className="scenario-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      // Applying a scenario already in effect changes nothing;
                      // offering the button would suggest otherwise.
                      disabled={!mutable || active}
                      onClick={() => setApplying(preset)}
                    >
                      {active ? t("scenarios.alreadyApplied") : t("scenarios.applyChanges", { count: changes.length })}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!mutable} onClick={() => setEditing(preset)}>
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!mutable} onClick={() => duplicate(preset.id)}>
                      <Copy size={14} /> Duplicate
                    </Button>
                    {confirmDelete === preset.id ? (
                      <span className="scenario-confirm">
                        <span className="text-note">{t("scenarios.confirmDelete")}</span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            remove(preset.id);
                            setConfirmDelete(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!mutable}
                        onClick={() => setConfirmDelete(preset.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Seasons ────────────────────────────────────────────────────────
          A season is the *activity* half of the same idea: which of your
          recurring costs are running, and at what price. Lessons stop over
          the summer; heating stops in June. This was implemented, seeded and
          applicable from nowhere at all — and a real account is seeded with
          none, so the feature could never be used. Capturing is the way in:
          set the activities up, then name what you have. */}
      <Section
        title={t("scenario.seasons")}
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={!mutable || activities.length === 0}
            title={activities.length === 0 ? t("scenario.addActivitiesFirst") : undefined}
            onClick={() => {
              const name = window.prompt(t("scenario.nameThisArrangement", { count: activities.length }));
              if (!name?.trim()) return;
              captureSeason(name.trim(), name.trim().toLowerCase());
            }}
          >
            <Plus size={14} /> {t("scenario.saveCurrentAsASeason")}
          </Button>
        }
      >
        <p className="text-note" style={{ marginBottom: 20 }}>
          {t("scenario.aSeasonRemembersWhichActivities")}
        </p>

        {seasons.length === 0 ? (
          <EmptyState
            icon={<Leaf size={24} />}
            title={t("scenario.noSeasonsSaved")}
            description={t("scenario.pauseTheActivitiesThatStop")}
          />
        ) : (
          <div className="scenario-list">
            {seasons.map((season) => {
              const covered = Object.keys(season.activityOverrides ?? {}).filter((id) =>
                activities.some((activity) => activity.id === id),
              ).length;
              const active = currentSeason === season.season;
              return (
                <article key={season.id} className={`scenario-card${active ? " scenario-card-active" : ""}`}>
                  <header className="scenario-head">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="text-callout scenario-name">{season.name}</h3>
                      {season.notes && <p className="text-note scenario-notes">{season.notes}</p>}
                    </div>
                    {active && (
                      <span className="scenario-badge" title={t("scenario.thisSeasonIsCurrentlySelected")}>
                        <Check size={12} aria-hidden="true" /> Current
                      </span>
                    )}
                  </header>

                  <dl className="scenario-figures">
                    <div>
                      <dt className="text-footnote">{t("nav.activities")}</dt>
                      {/* Only the ones that still exist: an override naming a
                          deleted activity does nothing, and counting it would
                          promise a change that cannot happen. */}
                      <dd>{covered}</dd>
                    </div>
                    <div>
                      <dt className="text-footnote">{t("scenario.seasonTag")}</dt>
                      <dd>{season.season || "—"}</dd>
                    </div>
                  </dl>

                  <footer className="scenario-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!mutable || covered === 0}
                      title={covered === 0 ? "None of this season's activities still exist" : undefined}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Apply "${season.name}"?\n\nThis changes whether ${covered} activit${covered === 1 ? "y is" : "ies are"} running, and what they cost. Your transactions are untouched, and you can undo it.`,
                          )
                        ) {
                          applySeason(season.id);
                        }
                      }}
                    >
                      {t("scenario.applyToActivities", { count: covered })}
                    </Button>
                    {confirmSeason === season.id ? (
                      <span className="scenario-confirm">
                        <span className="text-note">{t("scenarios.confirmDelete")}</span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            removeSeason(season.id);
                            setConfirmSeason(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmSeason(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!mutable}
                        onClick={() => setConfirmSeason(season.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      {editing && (
        <ScenarioEditor
          preset={editing === "new" ? null : editing}
          snapshot={snapshot}
          onClose={() => setEditing(null)}
        />
      )}

      {applying && (
        <ScenarioApplyDialog
          preset={applying}
          snapshot={snapshot}
          onCancel={() => setApplying(null)}
          onConfirm={() => {
            apply(applying.id);
            setApplying(null);
          }}
        />
      )}
    </div>
  );
};
