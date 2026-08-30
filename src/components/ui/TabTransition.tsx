import React, { useEffect, useRef, useState } from "react";
import { AircraftSilhouette } from "./Aircraft";
import { useBudgetStore } from "../../store/budgetStore";

interface TabTransitionProps {
  /** Changing this plays the transition. */
  tabKey: string;
  children: React.ReactNode;
}

/**
 * Timing.
 *
 * 260ms to cover, 130ms held, 300ms to clear: 690ms end to end. Long enough to
 * read as a movement of the whole application rather than a flicker, short
 * enough that a person switching tabs repeatedly is never waiting on it. The
 * cover is the fast half deliberately — the eye forgives a quick departure and
 * notices a slow arrival, so the reveal gets the longer, eased half.
 */
const COVER_MS = 260;
const HOLD_MS = 130;
const CLEAR_MS = 300;
const TOTAL_MS = COVER_MS + HOLD_MS + CLEAR_MS;

type Phase = "idle" | "covering" | "clearing";

/**
 * The transition between tabs.
 *
 * A navy plane sweeps across the whole application — over the sidebar, the
 * header and the content, not merely over the panel — carrying a route line and
 * a small aircraft along it. The outgoing page is still underneath while it
 * covers; the incoming page is revealed as it clears.
 *
 * **The direction is fixed: left to right, every time.** It used to mirror the
 * navigation — down the sidebar entered from the right, up from the left — and
 * a motion that changes direction is a second thing to read on every single
 * navigation. One direction reads as the application's own movement rather than
 * as an assertion about where you were, and it means the cover, the aircraft
 * and the arriving page all travel the same way instead of the plane flying one
 * way and the page the other.
 *
 * Two things this must get right, both of which earlier versions got wrong:
 *
 *  - **The outgoing page has to stay put while the cover arrives.** React swaps
 *    `children` the instant the tab changes, so without freezing them the user
 *    catches a frame or two of the *new* page before the cover hides it, and
 *    the effect reads as a stutter rather than a departure. `heldChildren`
 *    keeps the outgoing tree mounted until the screen is opaque.
 *
 *  - **The animation must not play over a loading placeholder.** Code splitting
 *    broke a previous version exactly that way: the wrapper mounted with a
 *    Suspense fallback inside it, the transition played over an empty box, and
 *    the real content arrived afterwards without remounting. The panels are
 *    warmed in advance now (see `preloadPanels` in App), and the swap happens
 *    while the screen is covered either way.
 *
 * The whole thing is skipped under `prefers-reduced-motion`: a shape flying
 * across the screen on every navigation is precisely what that setting exists
 * for, and the page still changes — it simply appears.
 */
export const TabTransition: React.FC<TabTransitionProps> = ({ tabKey, children }) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [shownKey, setShownKey] = useState(tabKey);
  /**
   * The aircraft, taken straight from settings.
   *
   * Subscribed narrowly rather than to the whole snapshot: this component is
   * mounted for the lifetime of the session and re-rendering it on every
   * financial edit would restart nothing but would cost a render of the whole
   * panel tree beneath it.
   */
  const aircraft = useBudgetStore((state) => state.snapshot.settings.transitionAircraft);

  /**
   * The tree currently on screen, and the newest one the parent has produced.
   *
   * The parent stops producing the outgoing tab's element the moment the tab
   * changes, so it has to be captured on the render *before* that — which is
   * what assigning during render (rather than in an effect) achieves.
   */
  const heldChildren = useRef<React.ReactNode>(children);
  const latestChildren = useRef<React.ReactNode>(children);
  latestChildren.current = children;
  if (tabKey === shownKey) heldChildren.current = children;

  const firstRender = useRef(true);

  useEffect(() => {
    // No sweep on the first paint: nothing is being left behind, and greeting
    // someone with an animation before they have seen the app is noise.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      heldChildren.current = latestChildren.current;
      setShownKey(tabKey);
      setPhase("idle");
      return;
    }

    setPhase("covering");
    // Swap under the cover, at the moment the screen is fully opaque.
    const swap = window.setTimeout(() => {
      heldChildren.current = latestChildren.current;
      setShownKey(tabKey);
      setPhase("clearing");
    }, COVER_MS + HOLD_MS);
    const done = window.setTimeout(() => setPhase("idle"), TOTAL_MS);

    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(done);
      // A tab changed again mid-transition: land on the newest one rather than
      // leaving the screen showing whichever tab the cancelled timer was for.
      heldChildren.current = latestChildren.current;
      setShownKey(tabKey);
    };
  }, [tabKey]);

  const covering = phase === "covering";
  const clearing = phase === "clearing";

  return (
    <div className="tab-transition">
      {phase !== "idle" && (
        <div
          className={`app-sweep${covering ? " app-sweep-covering" : ""}${clearing ? " app-sweep-clearing" : ""}`}
          aria-hidden="true"
        >
          {/* Route, waypoints and aircraft. A flight between two points is the
              whole metaphor: you left one place and arrived at another. */}
          <div className="app-sweep-route">
            <span className="app-sweep-node app-sweep-node-from" />
            <span className="app-sweep-line" />
            <span className="app-sweep-node app-sweep-node-to" />
            <span className="app-sweep-craft">
              <AircraftSilhouette id={aircraft} size={34} />
            </span>
          </div>
        </div>
      )}

      <div key={shownKey} className={`tab-panel${clearing ? " tab-panel-arriving" : ""}`}>
        {heldChildren.current}
      </div>
    </div>
  );
};
