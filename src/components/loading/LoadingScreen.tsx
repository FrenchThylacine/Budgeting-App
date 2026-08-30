import React, { useEffect, useMemo, useRef, useState } from "react";
import { AircraftArt } from "../ui/Aircraft";
import { AIRCRAFT_IDS, DEFAULT_AIRCRAFT, ESCORT_AIRCRAFT, aircraftFor } from "../../domain/aircraft";

/**
 * The loading sequence
 * ====================
 *
 * A lead aircraft holds the centre of the screen while two Alpha Jets orbit it,
 * one trailing blue smoke and one red. When the application is ready they roll
 * out of the turn and form up behind the lead, a third joins them trailing
 * white, the three ribbons settle into a tricolour, and the whole formation
 * accelerates away to the right — taking the loading screen with it and leaving
 * the application behind.
 *
 * ─── Why this is driven by rAF and not by keyframes ──────────────────────────
 *
 * Everything else in this application animates in CSS, and should. This does
 * not, for one reason: the escorts have to leave the orbit *from wherever they
 * happen to be* the instant the data arrives. A CSS animation cannot be
 * interrupted and continued from its current value — swapping to a second
 * animation snaps the element to the new animation's first frame, which is a
 * visible jump on the one screen the user is guaranteed to look at. Either the
 * transition waits for the orbit to come round (up to a full revolution of
 * doing nothing while the data sits ready), or the position is a number this
 * component owns. It owns the number.
 *
 * The cost is one rAF loop over four elements writing `transform` and nothing
 * else — no layout, no paint, entirely on the compositor — and it stops the
 * moment the sequence finishes.
 *
 * ─── Why there is a floor on how fast it can go ──────────────────────────────
 *
 * A warm reload can be ready in 150ms. Playing a formation join in 150ms is not
 * a fast loading screen, it is a flicker. So the *narrative* has a fixed length
 * (join, settle, depart ≈ 1.5s) and only the orbit is elastic: a slow load
 * circles for as long as it takes, a fast one circles briefly and then leaves.
 * Nothing waits on the animation once the departure has started, because the
 * departure is what reveals the application.
 */

const ORBIT_RX = 190;
const ORBIT_RY = 78;
/** One revolution. Slow enough to read as a turn rather than a spin. */
const ORBIT_MS = 2600;
/** Long enough that the orbit is seen at all before it is broken off. */
const MIN_ORBIT_MS = 620;
const JOIN_MS = 900;
const SETTLE_MS = 340;
const DEPART_MS = 720;

type Phase = "orbit" | "join" | "settle" | "depart" | "done";

/**
 * Where each escort ends up, relative to the lead.
 *
 * Three abreast and slightly stepped, so the ribbons stack into horizontal
 * bands: blue above, white through the middle, red below. That is the shape the
 * Patrouille de France actually leaves in the sky, and it is the reason the
 * slots are a column rather than the diamond a formation would normally fly.
 */
const SLOTS = [
  { x: -118, y: -46, colour: "var(--boot-blue)", key: "blue" },
  { x: -132, y: 0, colour: "var(--boot-white)", key: "white" },
  { x: -118, y: 46, colour: "var(--boot-red)", key: "red" },
] as const;

/** Ease-out cubic: fast out of the turn, settling gently into the slot. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Ease-in quartic: the departure accelerates rather than translating. */
const easeIn = (t: number) => t * t * t * t;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
/** Shortest way round, so a heading never unwinds the long way. */
const mixAngle = (from: number, to: number, t: number) => {
  let delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
};

interface OrbitState {
  x: number;
  y: number;
  angle: number;
  scale: number;
  /** Above the lead on the near half of the ellipse, behind it on the far half. */
  front: boolean;
}

/**
 * One escort's position on the ellipse at a given angle.
 *
 * The heading is the tangent, not the radius — an aircraft flying a circle
 * points along its path. Getting this wrong is the single thing that makes an
 * orbiting aeroplane look like a spinning sticker.
 */
function orbitAt(theta: number): OrbitState {
  const radians = (theta * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    x: ORBIT_RX * cos,
    y: ORBIT_RY * sin,
    // atan2 of the derivative of the ellipse. Degrees, screen coordinates
    // (y grows downwards), and the artwork points nose-right at zero.
    angle: (Math.atan2(ORBIT_RY * cos, -ORBIT_RX * sin) * 180) / Math.PI,
    // Nearer the viewer on the lower half, so it grows a little there.
    scale: 0.8 + 0.26 * ((sin + 1) / 2),
    front: sin > 0,
  };
}

export interface LoadingScreenProps {
  /** True once the application behind this can actually be shown. */
  ready: boolean;
  /** Called when the departure has finished and the overlay can unmount. */
  onFinished: () => void;
  /** What is being waited for, already translated. */
  caption: string;
  /** The lead aircraft. Unknown values fall back to the Concorde. */
  aircraft?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ ready, onFinished, caption, aircraft }) => {
  const lead = aircraftFor(aircraft);
  const sceneRef = useRef<HTMLDivElement>(null);
  const escortRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("orbit");

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  /*
   * `ready` is read through a ref inside the loop.
   *
   * The loop is started once, on mount, and must not be torn down and restarted
   * when the prop flips — restarting it resets the clock, which restarts the
   * orbit from zero at exactly the moment it should be breaking off.
   */
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    /*
     * Reduced motion: the formation is simply *there*, and the screen leaves as
     * soon as the data does. A shape flying in circles is precisely what that
     * setting exists to stop, and the sequence carries no information the
     * caption does not.
     */
    if (reduced) {
      for (const [index, node] of escortRefs.current.entries()) {
        const slot = SLOTS[index];
        if (node && slot) node.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
      }
      setPhase("settle");
      return;
    }

    let frame = 0;
    const start = performance.now();
    /** When the orbit was broken off. Null while it is still turning. */
    let breakOff: number | null = null;
    /** Each escort's state at the moment it broke off, for the interpolation. */
    let released: OrbitState[] = [];
    let current: Phase = "orbit";

    const setPhaseOnce = (next: Phase) => {
      if (current === next) return;
      current = next;
      setPhase(next);
    };

    const tick = (now: number) => {
      const elapsed = now - start;

      if (breakOff === null) {
        const theta = (elapsed / ORBIT_MS) * 360;
        for (let index = 0; index < 2; index++) {
          const state = orbitAt(theta + index * 180);
          const node = escortRefs.current[index];
          if (node) {
            node.style.transform =
              `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) ` +
              `rotate(${state.angle.toFixed(2)}deg) scale(${state.scale.toFixed(3)})`;
            node.style.zIndex = state.front ? "3" : "1";
          }
        }
        if (readyRef.current && elapsed >= MIN_ORBIT_MS) {
          breakOff = now;
          released = [orbitAt(theta), orbitAt(theta + 180)];
          setPhaseOnce("join");
        }
        frame = requestAnimationFrame(tick);
        return;
      }

      const since = now - breakOff;

      if (since < JOIN_MS) {
        const t = easeOut(clamp01(since / JOIN_MS));
        for (let index = 0; index < 2; index++) {
          const from = released[index];
          const slot = SLOTS[index === 0 ? 0 : 2];
          const node = escortRefs.current[index];
          if (!node) continue;
          node.style.transform =
            `translate3d(${mix(from.x, slot.x, t).toFixed(2)}px, ${mix(from.y, slot.y, t).toFixed(2)}px, 0) ` +
            `rotate(${mixAngle(from.angle, 0, t).toFixed(2)}deg) scale(${mix(from.scale, 1, t).toFixed(3)})`;
          node.style.zIndex = "1";
        }
        frame = requestAnimationFrame(tick);
        return;
      }

      // Locked into the slots from here on; the scene moves as one body.
      for (let index = 0; index < 2; index++) {
        const slot = SLOTS[index === 0 ? 0 : 2];
        const node = escortRefs.current[index];
        if (node) node.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
      }

      if (since < JOIN_MS + SETTLE_MS) {
        setPhaseOnce("settle");
        frame = requestAnimationFrame(tick);
        return;
      }

      const departed = since - JOIN_MS - SETTLE_MS;
      setPhaseOnce("depart");
      const t = clamp01(departed / DEPART_MS);
      const scene = sceneRef.current;
      const root = rootRef.current;
      if (scene) scene.style.transform = `translate3d(${(easeIn(t) * 165).toFixed(2)}vw, 0, 0)`;
      // The overlay leaves by the right edge, uncovering the application in the
      // same direction everything else in this app travels.
      if (root) root.style.clipPath = `inset(0 0 0 ${(easeIn(Math.max(0, t - 0.18) / 0.82) * 100).toFixed(2)}%)`;

      if (t >= 1) {
        setPhaseOnce("done");
        finishedRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  /* Reduced motion has no departure to finish on, so it ends on the data. */
  useEffect(() => {
    if (!reduced || !ready) return;
    const timer = window.setTimeout(() => onFinished(), 200);
    return () => window.clearTimeout(timer);
  }, [reduced, ready, onFinished]);

  const joined = phase !== "orbit";

  return (
    <div
      ref={rootRef}
      className={`boot-screen boot-phase-${phase}`}
      role="status"
      aria-live="polite"
      aria-label={caption}
    >
      <div className="boot-sky" aria-hidden="true" />
      <div className="boot-stage" aria-hidden="true">
        <div className="boot-scene" ref={sceneRef}>
          {/*
            The third jet exists in the DOM from the start and is invisible
            until it is wanted: creating it at the moment it appears would
            decode its image mid-animation, and a frame dropped there is the
            one frame everybody sees.
          */}
          {SLOTS.map((slot, index) => {
            // Slots 0 and 2 belong to the two orbiting jets; slot 1 is the
            // one that joins, and is the only one placed by CSS.
            const orbiting = index !== 1;
            const escortIndex = index === 0 ? 0 : index === 2 ? 1 : 2;
            return (
              <div
                key={slot.key}
                ref={(node) => {
                  escortRefs.current[escortIndex] = node;
                }}
                className={`boot-escort boot-escort-${slot.key}${orbiting ? "" : " boot-escort-late"}${joined ? " is-joined" : ""}`}
                style={
                  orbiting
                    ? { ["--trail-colour" as string]: slot.colour }
                    : {
                        ["--trail-colour" as string]: slot.colour,
                        transform: `translate3d(${slot.x}px, ${slot.y}px, 0)`,
                      }
                }
              >
                <span className="boot-trail" />
                <AircraftArt id={ESCORT_AIRCRAFT.id} size={64} className="boot-escort-art" />
              </div>
            );
          })}

          <div className="boot-lead">
            <AircraftArt id={lead.id} size={200} className="boot-lead-art" />
          </div>
        </div>
      </div>

      <div className="boot-caption-block">
        <div className="boot-title">Budget OS</div>
        <div className="boot-caption">{caption}</div>
      </div>
    </div>
  );
};

/**
 * The lead aircraft to fly before the account's own preference is known.
 *
 * The loading screen runs *before* the snapshot exists, so the stored setting
 * is not available to it — which is exactly when it is needed. The last chosen
 * aircraft is therefore mirrored into `localStorage`, purely as a hint: a
 * missing, unreadable or unrecognised value flies the Concorde, which is the
 * default anyway.
 */
export const BOOT_AIRCRAFT_KEY = "boot-aircraft";

export function rememberBootAircraft(id: string | undefined): void {
  try {
    if (id && AIRCRAFT_IDS.includes(id)) localStorage.setItem(BOOT_AIRCRAFT_KEY, id);
  } catch {
    /* A private window that refuses storage still gets the default. */
  }
}

export function recallBootAircraft(): string {
  try {
    const stored = localStorage.getItem(BOOT_AIRCRAFT_KEY);
    if (stored && AIRCRAFT_IDS.includes(stored)) return stored;
  } catch {
    /* noop */
  }
  return DEFAULT_AIRCRAFT;
}
