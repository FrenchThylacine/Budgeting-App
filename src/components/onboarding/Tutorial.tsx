import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { Thylacine, type ThylacinePose } from "./Thylacine";

/**
 * Which pose the guide strikes on each step.
 *
 * Not an attempt to point precisely at the control — the spotlight ring
 * already does that exactly, from the real DOM rect. The character's job is
 * tone: a wave hello, a thinking look on the two steps that are a nuance
 * rather than an action, a raised hand toward the step that is about to ask
 * the browser for something, a cheer at the end. Every task step defaults to
 * "pointing-right" for the same reason the tour fixes its motion direction
 * one way (see styles-extras.css) — one consistent gesture reads as "look
 * over here", where a different pose per step would read as a new signal
 * each time.
 */
const STEP_POSE: Record<string, ThylacinePose> = {
  welcome: "waving",
  dashboard: "explaining",
  currencies: "pointing-right",
  activities: "pointing-right",
  schedule: "thinking",
  spending: "pointing-right",
  funding: "explaining",
  wallet: "pointing-right",
  scenarios: "pointing-right",
  stats: "explaining",
  reports: "explaining",
  notifications: "pointing-up",
  done: "celebrating",
};

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

  /*
   * The control this step is about, lit up and kept in view
   * ------------------------------------------------------
   *
   * A tour that says "press Add activity" while the reader hunts for the button
   * is a tour that has described the application rather than taught it. The
   * step names its control; this finds it, scrolls it into view, and reports
   * where it is so the backdrop can cut a hole around it and the card can sit
   * beside it rather than on top of it.
   *
   * Re-measured on scroll and resize because the page moves underneath: a
   * spotlight pinned to stale coordinates is worse than none, since it points
   * confidently at the wrong thing.
   */
  const [spot, setSpot] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!step.anchor) {
      setSpot(null);
      return;
    }
    const selectors = Array.isArray(step.anchor) ? step.anchor : [step.anchor];
    const find = () => {
      for (const selector of selectors) {
        const found = document.querySelector(selector);
        if (found) return found;
      }
      return null;
    };
    let frame = 0;
    let lit: Element | null = null;
    const measure = () => {
      const target = find();
      lit = target;
      setSpot(target ? target.getBoundingClientRect() : null);
    };
    // After the tab switch this step asked for, not before it.
    const settle = window.setTimeout(() => {
      find()?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      measure();
    }, 420);
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    /*
     * The page changes shape underneath: an editor opens, a list grows, a
     * preferred selector starts matching. Watching the DOM is what lets the
     * spotlight move from "open the editor" to "here is the control" without
     * the reader pressing anything in the tour.
     */
    const observer = new MutationObserver(() => {
      const target = find();
      if (target !== lit) {
        target?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
        measure();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", track, true);
      window.removeEventListener("resize", track);
    };
  }, [step.anchor, index, reducedMotion]);

  /*
   * Done means done: the step advances itself.
   *
   * The reader has just performed the action the card asked for; making them
   * find Next afterwards is the slideshow reasserting itself. A short pause so
   * the result is visible — a new activity appearing in the list is the
   * confirmation — and then on.
   *
   * Only for task steps, and only forward: an explanation has nothing to
   * detect, and re-reading a finished step must not fling the reader onward.
   */
  const advancedFrom = useRef(new Set<number>());
  /*
   * What "done" looked like on arrival.
   *
   * A step whose task was already satisfied before the reader got there —
   * resuming a half-finished tour, or a seeded budget that already has
   * activities — has nothing to wait for, and auto-advancing would fling the
   * reader through several cards they never read. Those steps keep their Next
   * button; only a task completed *while the step is open* advances by itself.
   */
  const doneOnArrival = useRef(false);
  useEffect(() => {
    doneOnArrival.current = step.task ? taskDone(step.task, snapshot) : true;
    // Deliberately keyed on the step alone: this is a snapshot of the moment of
    // arrival, and re-running it when the data changes would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (!step.task || !done || doneOnArrival.current) return;
    if (advancedFrom.current.has(index)) return;
    if (index >= TUTORIAL_STEPS.length - 1) return;
    // Long enough to see the result of what was just done — a new row appearing
    // in the list is the confirmation — and short enough not to feel stuck.
    const timer = window.setTimeout(() => {
      advancedFrom.current.add(index);
      setIndex((current) => (current === index ? current + 1 : current));
    }, 900);
    return () => window.clearTimeout(timer);
    /*
     * Deliberately *not* keyed on the snapshot, and the flag is set when the
     * timer fires rather than when it is scheduled.
     *
     * Both are the same bug seen twice: saving the change the reader just made
     * writes a revision back into the snapshot within the 900ms, which re-ran
     * this effect, cleared the pending timer, found the step already marked as
     * advanced and scheduled nothing in its place. The tour sat on a completed
     * step for ever. `done` is a boolean, so it is the honest trigger here —
     * the snapshot changing for unrelated reasons is not news.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, index, step.task]);
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

  /*
   * Where the card goes.
   *
   * Beside the spotlight, on whichever side has room, and never over it — the
   * one rule that makes a guided step usable is that the instruction and the
   * control it names are visible at the same time.
   *
   * The card's own height is *measured* rather than assumed. A guess is how
   * this breaks: the card is one paragraph on one step and three on another,
   * and a fixed estimate puts a tall card straight over the button on a phone,
   * which is the exact failure the rule exists to prevent. With no anchor the
   * card keeps its default corner.
   */
  const [placement, setPlacement] = useState<React.CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!spot) {
      setPlacement(undefined);
      return;
    }
    const card = cardRef.current;
    if (!card) return;
    const gap = 16;
    const margin = 12;
    /*
     * `scrollHeight`, not `offsetHeight`.
     *
     * The DOM still carries the *previous* placement's `maxHeight` — this
     * effect is what is about to replace it, and the style prop reflects
     * last render, not this one. `offsetHeight` is capped by whatever that
     * old value happened to be, so a card growing into a step with more to
     * say measured itself against yesterday's ceiling: short enough to
     * measure "fits below", too tall once the new (larger) `maxHeight`
     * actually let it grow, and the card landed straight over the control
     * it was placed to avoid. `scrollHeight` is the content's own extent —
     * it does not know or care what `max-height` is currently applied — so
     * it reports the same number whether this is the first placement or the
     * hundredth.
     */
    const height = card.scrollHeight;
    const width = card.offsetWidth;
    const below = window.innerHeight - spot.bottom - gap - margin;
    const above = spot.top - gap - margin;

    // Below if it fits, above if it fits there instead, otherwise the roomier
    // side — where the card scrolls inside its own max-height rather than
    // growing over the control.
    const top =
      height <= below
        ? spot.bottom + gap
        : height <= above
          ? spot.top - gap - height
          : below >= above
            ? spot.bottom + gap
            : margin;

    const left = Math.min(Math.max(margin, spot.left), Math.max(margin, window.innerWidth - width - margin));
    setPlacement({
      top: Math.round(Math.max(margin, top)),
      left: Math.round(left),
      right: "auto",
      bottom: "auto",
      // When neither side fits, the card gets the room that is actually there.
      maxHeight: Math.round(Math.max(140, Math.max(below, above))),
    });
  }, [spot, index]);

  const cardPlacement = spot ? placement : undefined;

  return (
    <div className="tutorial-layer" role="presentation">
      {/* The backdrop, with a hole in it.

          Four panels rather than a box-shadow ring: a shadow large enough to
          dim a page bleeds over the cut-out on some engines, and the hole has
          to stay genuinely clear — the control inside it is the thing the
          reader is being asked to press, and it must remain clickable. These
          panels are `pointer-events: none` for the same reason. */}
      {spot && (
        <div className="tutorial-spotlight" aria-hidden="true">
          <div className="tutorial-shade" style={{ inset: `0 0 auto 0`, height: Math.max(0, spot.top - 8) }} />
          <div className="tutorial-shade" style={{ top: Math.max(0, spot.bottom + 8), left: 0, right: 0, bottom: 0 }} />
          <div className="tutorial-shade" style={{ top: Math.max(0, spot.top - 8), left: 0, width: Math.max(0, spot.left - 8), height: spot.height + 16 }} />
          <div className="tutorial-shade" style={{ top: Math.max(0, spot.top - 8), left: spot.right + 8, right: 0, height: spot.height + 16 }} />
          <div
            className="tutorial-ring"
            style={{
              top: Math.max(0, spot.top - 8),
              left: Math.max(0, spot.left - 8),
              width: spot.width + 16,
              height: spot.height + 16,
            }}
          />
        </div>
      )}
      <div
        ref={cardRef}
        style={cardPlacement}
        /* Stable hooks for the verification harness, like `data-tab` on the
           navigation. Which step is showing and whether its task is satisfied
           are the two things a walkthrough needs to assert, and reading them
           off the rendered card is how the harness checks the tour without
           being told anything by the tour. */
        data-step={step.id}
        data-task-done={step.task ? String(done) : "no-task"}
        className={`tutorial-card${reducedMotion ? "" : " tutorial-card-animated"}${spot ? " tutorial-card-anchored" : ""}`}
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

        <div className="tutorial-character-row">
          <Thylacine pose={STEP_POSE[step.id] ?? "neutral"} size={56} className="tutorial-character" />
          <h2 id={titleId} className="text-title tutorial-title">
            {t(step.titleKey)}
          </h2>
        </div>
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
