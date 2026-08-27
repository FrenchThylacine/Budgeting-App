import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import {
  TUTORIAL_STEPS,
  completedOnboarding,
  skippedOnboarding,
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
 * visible behind the words. A wall of text in a dialog explains an interface
 * nobody can see while they read it.
 *
 * Three behaviours worth stating:
 *
 *  - **Leaving is one press, and it sticks.** Skip is a first-class control,
 *    not a grey link in a corner, and it records the same "settled" state that
 *    finishing does. The tour never reappears unasked afterwards.
 *  - **Reduced motion is honoured.** The card animates in unless the user has
 *    asked it not to, in which case it simply appears.
 *  - **The notification step asks the browser for real.** It is the only step
 *    with an action, and pressing its button is the user gesture every browser
 *    requires — see `domain/notifications.ts`.
 */
export const Tutorial: React.FC<{
  onNavigate: (tab: TutorialTab) => void;
  onClose: () => void;
}> = ({ onNavigate, onClose }) => {
  const { t } = useTranslation();
  const updateSettings = useBudgetStore((state) => state.updateSettings);
  const notifications = useBudgetStore((state) => state.snapshot.settings.notifications);

  const [index, setIndex] = useState(0);
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const step = TUTORIAL_STEPS[index];
  const isLast = index === TUTORIAL_STEPS.length - 1;

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  // Show the tab this step is about. Steps without one leave the view alone,
  // which is what a "welcome" or "reports" card should do.
  useEffect(() => {
    if (step.tab) onNavigate(step.tab);
  }, [step, onNavigate]);

  // Focus lands on the card so the keyboard can drive the tour immediately,
  // and Escape leaves it the same way Skip does.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        skip();
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
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={skip} aria-label={t("tutorial.skip")}>
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
          <Button variant="ghost" size="sm" onClick={skip}>
            {t("tutorial.skip")}
          </Button>
          <div className="tutorial-foot-nav">
            <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}>
              <ChevronLeft size={14} /> {t("tutorial.back")}
            </Button>
            {isLast ? (
              <Button variant="primary" size="sm" onClick={finish}>
                {t("tutorial.finish")}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setIndex((n) => n + 1)}>
                {t("tutorial.next")} <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
