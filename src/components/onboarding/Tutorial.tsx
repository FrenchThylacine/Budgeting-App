import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import {
  TUTORIAL_STEPS,
  completedOnboarding,
  postponedOnboarding,
  resumeStep,
  skippedOnboarding,
  taskDone,
  type TutorialTab,
} from "../../domain/tutorial";
import { notificationStatus, requestNotificationPermission } from "../../domain/notifications";
import { useTranslation } from "../../i18n/useTranslation";
import { Button } from "../ui/Button";

/**
 * The first-run tour.
 *
 * A small card over the app rather than a modal that hides it: each step
 * switches to the tab it is describing, so the thing being explained is
 * visible behind the words — and, on six of the thirteen steps, the reader is
 * asked to *do* it.
 *
 * ─── Why the tasks are the point ─────────────────────────────────────────────
 *
 * A tour that advances on Next is a slideshow. At the end of it somebody has
 * read twelve paragraphs about pinning a currency and has pinned none. So the
 * card states the task, watches the real snapshot for it, and unlocks Next when
 * it is genuinely done — the tick is the application's own state, never a flag
 * the tour sets for itself.
 *
 * **Skip this step is always there.** A tour that cannot be left is a trap, and
 * somebody who does not want a scenario should not have to invent one to reach
 * the end. The task is an invitation with a lock on the *default* path, not on
 * every path.
 *
 * ─── Three answers, not two ──────────────────────────────────────────────────
 *
 *  - **Finish / Skip** end the offer. The tour never reappears unasked.
 *  - **Decide later** defers it: nothing reopens by itself, and a single quiet
 *    reminder appears in the shell, resumable at the step it was left on.
 *
 * "Later" is offered on **every** step, not only the first. It used to be the
 * first card's alone, on the reasoning that somebody four steps in who leaves
 * means Skip — which had it backwards. Four steps in is exactly when there is
 * a place worth coming back to, and the only exit on offer was the one that
 * throws that place away.
 *
 * Closing the card — the × or Escape — is *later*, not Skip. A close button
 * means "not now"; ending the offer for good is a decision, and decisions get
 * a labelled button.
 *
 * Reduced motion is honoured by not adding the animation at all, and the
 * notification step asks the browser for real — it is the only step with an
 * action, and pressing its button is the user gesture every browser requires.
 */
export const Tutorial: React.FC<{
  onNavigate: (tab: TutorialTab) => void;
  onClose: () => void;
}> = ({ onNavigate, onClose }) => {
  const { t } = useTranslation();
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const snapshot = useBudgetStore((state) => state.snapshot);
  const notifications = snapshot.settings.notifications;

  const [index, setIndex] = useState(() => resumeStep(snapshot.settings.onboarding));
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  /**
   * Steps whose task the reader chose to pass over.
   *
   * Session state, not stored: skipping a task is a decision about this run of
   * the tour, and a stored one would silently unlock the task next time the
   * tour was replayed from Settings.
   */
  const [skippedTasks, setSkippedTasks] = useState<Record<string, true>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const step = TUTORIAL_STEPS[index];
  const isLast = index === TUTORIAL_STEPS.length - 1;

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  const done = step.task ? taskDone(step.task, snapshot) : true;
  const passed = step.task ? Boolean(skippedTasks[step.id]) : false;
  const canAdvance = done || passed;

  // Show the tab this step is about. Steps without one leave the view alone,
  // which is what a "welcome" or "reports" card should do.
  useEffect(() => {
    if (step.tab) onNavigate(step.tab);
  }, [step, onNavigate]);

  // Focus lands on the card so the keyboard can drive the tour immediately,
  // and Escape leaves it the same way the × does: postponed, not refused.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        later();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = () => {
    updateSettings({ onboarding: completedOnboarding(index) });
    onClose();
  };

  const skip = () => {
    updateSettings({ onboarding: skippedOnboarding(index) });
    onClose();
  };

  const later = () => {
    updateSettings({ onboarding: postponedOnboarding(index) });
    onClose();
  };

  const status = notificationStatus(notifications);

  /**
   * The only place the tour touches the browser.
   *
   * Reached by a press, which is what makes the prompt legal, and after a card
   * that has just explained what the notifications are for — which is what
   * makes it reasonable. The answer is stored either way, so the app does not
   * ask again on the next visit.
   */
  const askForNotifications = async () => {
    const result = await requestNotificationPermission();
    updateSettings({ notifications: result.settings });
    setPermissionNote(
      result.outcome === "granted"
        ? t("notifications.enabled")
        : result.outcome === "unsupported"
          ? t("notifications.unsupported")
          : result.outcome === "already-denied" || result.outcome === "denied"
            ? t("notifications.blocked")
            : t("notifications.declined"),
    );
  };

  return (
    <div className="tutorial-layer" role="presentation">
      <div
        ref={cardRef}
        className={`tutorial-card${reducedMotion ? "" : " tutorial-card-animated"}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-label={t("a11y.tutorialDialog")}
        tabIndex={-1}
      >
        <header className="tutorial-head">
          <span className="text-footnote tutorial-progress">
            {t("tutorial.progress", { current: index + 1, total: TUTORIAL_STEPS.length })}
          </span>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={later} aria-label={t("tutorial.later")}>
            <X size={16} />
          </button>
        </header>

        {/* A progress bar with a real value, so "how much of this is left" is
            answerable at a glance rather than after counting cards. */}
        <div
          className="tutorial-track"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={TUTORIAL_STEPS.length}
        >
          <div
            className="tutorial-track-fill"
            style={{ width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>

        <h2 id={titleId} className="text-title tutorial-title">
          {t(step.titleKey)}
        </h2>
        <p className="text-body tutorial-body">{t(step.bodyKey)}</p>

        {step.task && (
          <div className={`tutorial-task${done ? " is-done" : ""}`} role="status">
            <span className="tutorial-task-mark" aria-hidden="true">
              {done ? <Check size={14} /> : <span className="tutorial-task-dot" />}
            </span>
            <span>{t(done ? `tutorial.task.${step.task}.done` : `tutorial.task.${step.task}`)}</span>
          </div>
        )}

        {step.action === "request-notifications" && (
          <div className="tutorial-action">
            <Button
              variant="secondary"
              size="sm"
              disabled={!status.canRequest}
              onClick={() => void askForNotifications()}
            >
              <Bell size={14} /> {t("notifications.enable")}
            </Button>
            <span className="text-caption" role="status">
              {permissionNote ??
                (status.state === "granted"
                  ? t("notifications.enabled")
                  : status.state === "denied"
                    ? t("notifications.blocked")
                    : status.state === "unsupported"
                      ? t("notifications.unsupported")
                      : "")}
            </span>
          </div>
        )}

        <footer className="tutorial-foot">
          <div className="tutorial-foot-leave">
            <Button variant="ghost" size="sm" onClick={skip}>
              {t("tutorial.skip")}
            </Button>
            <Button variant="ghost" size="sm" onClick={later}>
              {t("tutorial.later")}
            </Button>
          </div>
          <div className="tutorial-foot-nav">
            <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}>
              <ChevronLeft size={14} /> {t("tutorial.back")}
            </Button>
            {/* The escape hatch. A locked Next with no way past it is a trap,
                and somebody who does not want a scenario should not have to
                invent one to reach the end of the tour. */}
            {step.task && !canAdvance && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSkippedTasks((current) => ({ ...current, [step.id]: true }))}
              >
                {t("tutorial.skipTask")}
              </Button>
            )}
            {isLast ? (
              <Button variant="primary" size="sm" onClick={finish}>
                {t("tutorial.finish")}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!canAdvance}
                onClick={() => setIndex((n) => n + 1)}
              >
                {t("tutorial.next")} <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
