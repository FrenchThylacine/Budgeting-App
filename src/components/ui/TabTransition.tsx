import React, { useEffect, useRef, useState } from "react";
import { AircraftMark } from "./AircraftMark";

interface TabTransitionProps {
  /** Changing this plays the transition. */
  tabKey: string;
  children: React.ReactNode;
}

/**
 * Long enough to read as a movement rather than a flicker.
 *
 * 620ms was too quick to read as a movement. 1150ms was too long once the
 * thing it was covering — a deferred panel being fetched, measured at
 * 190–370ms locally — was removed by warming those chunks in advance.
 *
 * Measured here at a median 8.3ms per frame with no frame over 20ms, so the
 * stutter people saw was the fetch, not the animation.
 */
const SWEEP_MS = 720;

/**
 * The transition between tabs.
 *
 * An aircraft crosses the panel trailing a banner, and the incoming page is
 * revealed behind it — the page arrives *with* the aircraft rather than merely
 * fading in.
 *
 * The animation is keyed on the content, not on a wrapper. Code splitting broke
 * an earlier version precisely because the wrapper mounted with a loading
 * placeholder inside it: the transition played over an empty box and the real
 * content then swapped in without remounting, so nothing ever animated.
 *
 * The whole thing is skipped under `prefers-reduced-motion`. A shape flying
 * across the screen on every navigation is exactly what that setting is for,
 * and the page still changes — it simply appears.
 */
export const TabTransition: React.FC<TabTransitionProps> = ({ tabKey, children }) => {
  const [sweeping, setSweeping] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    // No sweep on the first paint: nothing is being left behind, and greeting
    // someone with an animation before they have seen the app is noise.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    setSweeping(true);
    const timer = window.setTimeout(() => setSweeping(false), SWEEP_MS);
    return () => window.clearTimeout(timer);
  }, [tabKey]);

  return (
    <div className="tab-transition">
      {sweeping && (
        <div className="tab-sweep" aria-hidden="true">
          <span className="tab-sweep-route" />
          <span className="tab-sweep-craft">
            {/* Small, and running along the top edge. An aircraft crossing the
                middle of the page is a cartoon, and it covers exactly what was
                asked for. */}
            <AircraftMark size={22} variant="solid" hull="var(--accent)" />
          </span>
        </div>
      )}
      <div key={tabKey} className={`tab-panel${sweeping ? " tab-panel-arriving" : ""}`}>
        {children}
      </div>
    </div>
  );
};
