import React from "react";
import { Compass, X } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { dismissedReminder, shouldOfferReminder } from "../../domain/tutorial";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * The quiet reminder, for somebody who said "later".
 *
 * One line, dismissible, and it never comes back on its own once dismissed —
 * Settings still has the button, which is the difference between an offer and
 * nagging. It is deliberately not a dialog: interrupting a second time somebody
 * who has already asked not to be interrupted is the exact behaviour "Decide
 * later" exists to prevent.
 *
 * It renders nothing at all unless it is wanted, so the shell can mount it
 * unconditionally.
 */
export const TutorialReminder: React.FC<{ onResume: () => void }> = ({ onResume }) => {
  const { t } = useTranslation();
  const snapshot = useBudgetStore((state) => state.snapshot);
  const updateSettings = useBudgetStore((state) => state.updateSettings);

  if (!shouldOfferReminder(snapshot)) return null;

  return (
    <div className="tutorial-reminder" role="status">
      <Compass size={15} aria-hidden="true" />
      <span>{t("tutorial.reminder")}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onResume}>
        {t("tutorial.resume")}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        aria-label={t("common.dismiss")}
        onClick={() => updateSettings({ onboarding: dismissedReminder(snapshot.settings.onboarding) })}
      >
        <X size={14} />
      </button>
    </div>
  );
};
