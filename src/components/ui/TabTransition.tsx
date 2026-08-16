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
 * 620ms was measurably too quick: the aircraft crossed a 1440px panel in
 * roughly a third of a second, which reads as a twitch and gives the
 * compositor a very high pixel rate to sustain. At this duration the same
 * distance is covered calmly, and the animation is cheaper per frame because
 * less changes between them.
 */
const SWEEP_MS = 1150;

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
          <span className="tab-sweep-glow" />
          <span className="tab-sweep-craft">
            {/* The contrail is drawn by the wrapper, so it stays attached to
                the aircraft without a second animated element to keep in sync. */}
            <AircraftMark size={44} />
          </span>
        </div>
      )}
      <div key={tabKey} className={`tab-panel${sweeping ? " tab-panel-arriving" : ""}`}>
        {children}
      </div>
    </div>
  );
};
