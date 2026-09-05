import React, { useEffect, useMemo, useRef, useState } from "react";
import { AircraftArt } from "../ui/Aircraft";
import { AIRCRAFT_IDS, DEFAULT_AIRCRAFT, ESCORT_AIRCRAFT, aircraftFor } from "../../domain/aircraft";
import {
  DEPART_MS,
  DISPLAY_FLOOR_MS,
  ESCORTS,
  JOIN_MS,
  PUFF_LIFE,
  SETTLE_MS,
  attitudeOf,
  clamp01,
  mix,
  project,
  sceneAt,
} from "../../domain/airshow";
import type { Stage, Vec3 } from "../../domain/airshow";

/**
 * The loading sequence
 * ====================
 *
 * A lead aircraft flies steadily to the right while two Alpha Jets fly a
 * coordinated three-dimensional display around its flight path — one high and
 * one low, one near the camera and one far from it, both always travelling
 * forward with it — one trailing blue smoke and one red. When the application
 * is ready they roll out of the manoeuvre and **fall back** into formation
 * behind the leader, a third joins from behind and to the left trailing white,
 * the three ribbons settle into a tricolour, and the whole formation
 * accelerates away to the right, leaving the application behind it.
 *
 * ─── Where the flying lives, and why it is not in this file ─────────────────
 *
 * All of the choreography — every position, velocity, acceleration and
 * attitude of all four aircraft at any instant — is in `domain/airshow.ts`,
 * as a pure function of two numbers. Not for tidiness. Five versions of this
 * animation shipped with the geometry inline, and every one of them was
 * described correctly in a comment and wrong on the screen, because a claim
 * about a hundred thousand frames cannot be checked by reading it.
 *
 * With the flying in a module that needs no DOM,
 * `tests/airshow-choreography.test.ts` samples the entire sequence at every
 * break-off phase and asserts the brief's requirements as numbers: no aircraft
 * ever points left, no two ever converge, none passes through the lead, one
 * escort is above and one below at every instant. That suite has found four
 * genuine defects that all the prose in the world had not.
 *
 * What is left here is the *rendering*: the perspective divide, the sprite
 * transforms, the depth ordering, and the smoke.
 *
 * ─── The three things that make the depth legible ──────────────────────────
 *
 *  - **Perspective.** `scale = D / (D − z)` — nearer is bigger, and the growth
 *    is hyperbolic rather than linear, which is what an eye reads as distance
 *    rather than as a zoom.
 *  - **Occlusion.** Positive z draws over the lead, negative z draws under it.
 *    Passing *behind* something is the strongest depth cue there is, and it is
 *    free.
 *  - **Aerial perspective.** Distance takes a little contrast out of the far
 *    half of the manoeuvre.
 *
 * ─── An aeroplane cannot change its attitude instantly ─────────────────────
 *
 * `attitudeOf` computes the bank a jet *should* be at from the acceleration
 * perpendicular to its flight path. That is the right demand, and it is not
 * the right thing to draw: it responds within a single frame, so anywhere the
 * demand moves quickly the wings would snap. Measured on the rendered frames
 * of an earlier version, they went from 0.450 span to 0.947 in one frame: half
 * a wingspan in sixteen milliseconds, which is not a roll but a cut.
 *
 * So the attitude that is drawn chases the attitude that is demanded, at a
 * finite rate. That is what a roll rate *is*, and one first-order filter buys
 * three things at once: no snap anywhere, a visible lag as the jet rolls into
 * a turn, and a wings-level rollout that trails the path instead of arriving
 * with it.
 *
 * ─── The smoke is advected, not drawn behind the aircraft ──────────────────
 *
 * The trails were once a CSS gradient bar pinned to the tail: straight, rigid,
 * and pointing wherever the aeroplane pointed. Real display smoke does none of
 * that — it is left *in the air*, and the air does not move with the aircraft.
 *
 * So each jet emits a particle per frame at its tailpipe, and from then on the
 * particle belongs to the sky: it drifts backwards at the airspeed, spreads,
 * fades and wanders. The ribbon is the polygon through those particles, and
 * every property the brief asks for falls out of that one decision rather than
 * being animated separately —
 *
 *  - it follows the flight path, because it *is* the flight path;
 *  - it curves through the manoeuvre and lags on the roll-out, because a
 *    particle laid down 300ms ago is where the aircraft was 300ms ago;
 *  - it billows, because each particle's width grows with its own age;
 *  - it wanders, because a little smooth noise is added as it ages;
 *  - it **stretches on the departure**, because the formation accelerates away
 *    from air that is still drifting past the camera at cruise — nothing about
 *    the smoke changes at all, and that is the point;
 *  - and in formation it becomes three long parallel bands — blue, white, red
 *    — because three aircraft holding station in still air leave straight
 *    lines.
 *
 * It is drawn on two canvases, one behind the lead and one in front, and each
 * particle goes to the canvas its own z-sign chooses. That is what lets a
 * ribbon pass *through* the scene: the smoke laid down behind the aircraft
 * stays behind it while the aircraft comes round the front.
 *
 * ─── Why this is rAF and not keyframes ──────────────────────────────────────
 *
 * Everything else in this application animates in CSS, and should. This does
 * not, for one reason: the escorts have to leave the display *from wherever
 * they happen to be* the instant the data arrives. A CSS animation cannot be
 * interrupted and continued from its current value — swapping to a second
 * animation snaps the element to the new animation's first frame, which is a
 * visible jump on the one screen the user is guaranteed to look at.
 *
 * The cost is one loop over four sprites writing `transform`, plus two canvas
 * draws of six filled polygons. No layout, no reflow, and it stops the moment
 * the sequence finishes.
 *
 * ─── Why there is a floor on how fast it can go ─────────────────────────────
 *
 * A warm reload can be ready in 150ms. Playing a formation join in 150ms is
 * not a fast loading screen, it is a flicker. So the *narrative* has a fixed
 * length (join, settle, depart) and only the display is elastic: a slow load
 * flies for as long as it takes, a fast one flies its floor and then leaves.
 */

/** Ease-in cubic: the departure accelerates rather than translating. */
const easeIn = (t: number) => t * t * t;

/**
 * A smootherstep, for the reveal: it has to start and finish without a visible
 * edge, and an ordinary smoothstep leaves one at both ends.
 */
const smootherstep = (t: number) => {
  const u = clamp01(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

type Phase = Stage | "gone";

/**
 * The time constant of the roll filter: how long to cover 63% of the remaining
 * error. 150ms is a brisk display roll; slower reads as a heavy aeroplane and
 * hides the choreography.
 */
const ROLL_TAU_MS = 150;

interface Attitude {
  heading: number;
  bank: number;
  pitch: number;
}

/**
 * The drawn attitude of one aircraft, chasing its demanded attitude.
 *
 * Heading is deliberately *not* filtered: the nose points along the velocity,
 * and lagging it would point the aeroplane somewhere it is not going — which
 * is the very thing the world-velocity heading exists to avoid. Only the two
 * attitudes that come from a *derivative* are smoothed, because a derivative
 * of a piecewise curve is what has the steps in it.
 */
class Attitudes {
  private bank: number[] = [1, 1, 1];
  private pitch: number[] = [1, 1, 1];

  smooth(index: number, demanded: Attitude, dtMs: number): Attitude {
    // Exponential, so the response is the same whatever the frame interval —
    // a dropped frame must not produce a bigger step than two good ones.
    const k = 1 - Math.exp(-Math.max(0, dtMs) / ROLL_TAU_MS);
    this.bank[index] += (demanded.bank - this.bank[index]) * k;
    this.pitch[index] += (demanded.pitch - this.pitch[index]) * k;
    return { heading: demanded.heading, bank: this.bank[index], pitch: this.pitch[index] };
  }
}

/**
 * One transform chain, drawn once and emitted from once
 * =====================================================
 *
 * The brief's complaint is that the smoke looks detached from the aircraft, and
 * the answer is not a better offset — it is that there should only be one
 * chain. Every phase used to build its own `transform` string and then, near
 * it, call `tailpipe()` with what it hoped were the same values. That is two
 * derivations of one fact, and the two had already drifted:
 *
 *   the sprite is drawn `rotate(h) scale(s) scaleX(pitch)`, so `scaleX`
 *   compresses it **along its own nose-to-tail axis** — and the emitter never
 *   applied `pitch` at all. On a jet crossing the camera at pitch 0.65 and
 *   scale 1.4 the drawn exhaust sat about fourteen pixels ahead of the point
 *   the smoke was coming from. Measured at the tailpipe the gap was zero; the
 *   tailpipe was in the wrong place.
 *
 * So this function is the chain, and it is the only one: position → rotation →
 * scale and depth → tailpipe → emitter. Both outputs come from the same four
 * numbers, and nothing else in the file is allowed to compute either half.
 */
const ESCORT_LENGTH = 64;
/**
 * How far behind centre the exhaust sits, as a fraction of the drawn length —
 * measured off the artwork rather than guessed, which is where it actually is
 * once the drawing's transparent margin is taken off.
 */
const TAILPIPE = ESCORT_LENGTH * 0.44;

interface Sprite {
  /** What the element is drawn with. */
  transform: string;
  /** The exhaust, in scene coordinates, ready to emit from. */
  emitter: Vec3;
}

function spriteAt(
  point: Vec3,
  heading: number,
  options: { scale?: number; bank?: number; pitch?: number } = {},
): Sprite {
  const projected = project(point);
  const scale = options.scale ?? projected.scale;
  const bank = options.bank ?? 1;
  const pitch = options.pitch ?? 1;
  const radians = (heading * Math.PI) / 180;

  /*
   * Scene space and screen space cancel exactly here, which is why the emitter
   * can be expressed in scene coordinates at all: the sprite is drawn at
   * `scene × scale` and rotated in screen space, so a screen offset of
   * `TAILPIPE × pitch × scale` along the heading is a scene offset of
   * `TAILPIPE × pitch`. The puff then carries this point's own `z`, so when it
   * is drawn it is divided by the same perspective the aircraft was.
   */
  const reach = TAILPIPE * pitch;
  return {
    transform:
      `translate3d(${projected.x.toFixed(2)}px, ${projected.y.toFixed(2)}px, 0) ` +
      `rotate(${heading.toFixed(2)}deg) scale(${scale.toFixed(3)}) ` +
      `scaleX(${pitch.toFixed(3)}) scaleY(${bank.toFixed(3)})`,
    emitter: {
      x: point.x - Math.cos(radians) * reach,
      y: point.y - Math.sin(radians) * reach,
      z: point.z,
    },
  };
}

/**
 * One puff of smoke.
 *
 * Laid down at the tailpipe and thereafter owned by the air: `x`/`y` are scene
 * coordinates it keeps as the aircraft flies away from it.
 */
interface Puff {
  x: number;
  y: number;
  z: number;
  /** Seconds since it was emitted. Drives width, fade and wander. */
  age: number;
  /** A fixed per-puff offset, so the wander is smooth along the ribbon. */
  seed: number;
}


/**
 * How opaque a puff of the plume is at a given age.
 *
 * It reaches **zero** at the end of a puff's life, and that matters more than
 * the shape of the curve. The previous version faded to half — so the oldest
 * puff was still half-painted at its widest, and every ribbon ended in a blunt
 * rectangle a third of the way across the screen. Smoke does not end. It
 * disperses until there is nothing left of it, and the exponent is what makes
 * the last third of the ribbon do that rather than simply get thinner.
 */
const PLUME = (age: number, alpha: number) => alpha * Math.pow(1 - clamp01(age / PUFF_LIFE), 1.45);

/** How long the still-hot core of the plume lasts. */
const CORE_LIFE = 0.85;
/** And its opacity: bright at the nozzle, gone by the time it has spread. */
const CORE = (age: number, ink: number) => 0.95 * ink * Math.pow(1 - clamp01(age / CORE_LIFE), 1.2);

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

/**
 * The canvas box, centred on the scene origin.
 *
 * Wide enough to hold a ribbon of `CRUISE × PUFF_LIFE` scene pixels **and** to
 * keep drawing the head of it while the formation accelerates out of frame:
 * an aircraft past the canvas edge with the reveal still in progress is an
 * aeroplane flying with no smoke coming out of it, which is exactly the defect
 * this whole file exists to avoid.
 */
const CANVAS_W = 1560;
const CANVAS_H = 640;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ ready, onFinished, caption, aircraft }) => {
  const lead = aircraftFor(aircraft);
  const leadRef = useRef<HTMLDivElement>(null);
  const escortRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("display");

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );

  /*
   * `ready` is read through a ref inside the loop.
   *
   * The loop is started once, on mount, and must not be torn down and restarted
   * when the prop flips — restarting it resets the clock, which restarts the
   * display from zero at exactly the moment it should be breaking off.
   */
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    /*
     * Reduced motion: the formation is simply *there*, and the screen leaves as
     * soon as the data does. Aircraft flying in circles is precisely what that
     * setting exists to stop, and the sequence carries no information the
     * caption does not.
     */
    if (reduced) {
      for (const [index, node] of escortRefs.current.entries()) {
        const slot = ESCORTS[index]?.slot;
        if (!node || !slot) continue;
        const placed = project(slot);
        node.style.transform = `translate3d(${placed.x.toFixed(2)}px, ${placed.y.toFixed(2)}px, 0) scale(${placed.scale.toFixed(3)})`;
        node.style.opacity = "1";
      }
      setPhase("settle");
      return;
    }

    const back = backRef.current?.getContext("2d") ?? null;
    const front = frontRef.current?.getContext("2d") ?? null;
    // A device-pixel-ratio backing store, capped: a phone at DPR 3 would be
    // drawing nine times the pixels for a difference nobody can see on a
    // blurred ribbon.
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    for (const canvas of [backRef.current, frontRef.current]) {
      if (!canvas) continue;
      canvas.width = Math.round(CANVAS_W * dpr);
      canvas.height = Math.round(CANVAS_H * dpr);
    }
    for (const context of [back, front]) {
      if (!context) continue;
      context.setTransform(dpr, 0, 0, dpr, (CANVAS_W / 2) * dpr, (CANVAS_H / 2) * dpr);
      context.lineJoin = "round";
      context.lineCap = "round";
    }

    /** Three ribbons, in seat order: blue, red, and the white that joins late. */
    const trails: Puff[][] = [[], [], []];
    /**
     * Where each tailpipe was last frame.
     *
     * At the fast end of the display an escort covers thirty or forty scene
     * pixels between frames, and one puff per frame leaves the ribbon starting
     * a visible gap behind the aeroplane that is drawing it. The gap is filled
     * by walking from the previous tailpipe to this one.
     */
    const lastTail: (Puff | null)[] = [null, null, null];
    let raf = 0;
    let last = performance.now();
    const start = last;
    /*
     * The attitude filter, one per run.
     *
     * It carries the three aircraft's current bank and pitch across frames and
     * across phases, which is exactly why it lives out here: the point is that
     * the roll-out starts from the attitude the display ended at, rather than
     * from whatever the roll-out demands in its first frame.
     */
    const attitudes = new Attitudes();
    /** When the display was broken off. Null while it is still flying. */
    let breakOff: number | null = null;
    let current: Phase = "display";
    /*
     * A clock the wander is sampled against.
     *
     * The seed has to vary *slowly* along the ribbon: seeding each puff from
     * its index gave neighbours a large phase difference, so the "turbulence"
     * came out as a zigzag with corners in it rather than as smoke. Sampling a
     * clock means two puffs emitted a frame apart are a frame apart in the
     * noise as well.
     */
    let emitClock = 0;

    const setPhaseOnce = (next: Phase) => {
      if (current === next) return;
      current = next;
      setPhase(next);
    };

    /**
     * Move every puff, and retire the ones that have blown away.
     *
     * The whole sky slides backwards at the airspeed. That is the trick the
     * rest of the effect rests on: the aircraft never has to "draw" a trail,
     * and three jets holding formation in still air leave three straight lines
     * without a single line of code that knows about formations.
     */
    const advect = (dt: number, speed: number) => {
      for (const trail of trails) {
        let write = 0;
        for (let read = 0; read < trail.length; read++) {
          const puff = trail[read];
          puff.age += dt;
          if (puff.age > PUFF_LIFE) continue;
          puff.x -= speed * dt;
          /*
           * Turbulence, and it *grows*.
           *
           * Straight out of the nozzle the smoke is still a coherent jet
           * moving faster than the air around it; it is only once it has slowed
           * to the air's speed that it starts to roll over and curl. So the
           * disturbance is scaled by `curl`, which is nothing at the exhaust
           * and everything by the time the puff is a second old — which is why
           * the ribbon is a clean line where it leaves the aircraft and a
           * billowing rope by the time it reaches the edge of the frame.
           *
           * Two frequencies on each axis and all of it deterministic, seeded
           * per puff: `Math.random` here would make the ribbon shimmer from
           * frame to frame instead of drift.
           */
          const curl = Math.min(1, puff.age / 0.9);
          puff.x += Math.sin(puff.age * 1.7 + puff.seed * 1.3) * 8 * curl * dt;
          puff.y +=
            (Math.sin(puff.age * 2.3 + puff.seed) * 5.5 +
              Math.cos(puff.age * 3.1 + puff.seed * 2.1) * 7.5 * curl -
              // And it rises, slowly, once it is no longer being driven.
              5 * curl) *
            dt;
          trail[write++] = puff;
        }
        trail.length = write;
      }
    };

    /**
     * Draw one ribbon, split by depth.
     *
     * The polygon is built by walking up one side of the centreline and back
     * down the other, with the half-width taken from each puff's own age — so
     * the ribbon is a fine line at the tailpipe and a soft billow at the far
     * end, which is the shape smoke actually makes.
     *
     * The split is what sells the depth: a run of puffs with z < 0 is drawn on
     * the canvas *under* the lead aircraft and a run with z > 0 on the one over
     * it, so a ribbon laid down behind the lead stays behind it.
     */
    const drawTrail = (
      trail: Puff[],
      colour: readonly number[],
      /** Opacity as a function of the puff's own age. See `PLUME` below. */
      fadeAt: (age: number) => number,
      spread: number,
      youngerThan = Infinity,
    ) => {
      if (youngerThan !== Infinity) trail = trail.filter((puff) => puff.age <= youngerThan);
      if (trail.length < 3) return;

      /*
       * Which side of the lead each puff is on, with hysteresis.
       *
       * A bare `z >= 0` was fine for a ring, which crosses the plane twice a
       * lap. The corkscrew crosses it six times a pass *and* wobbles either
       * side of it, so the ribbon was being chopped into runs two puffs long
       * — and a run shorter than three has no polygon, so it was dropped.
       * That is what detached the smoke from the aeroplane: the newest end of
       * it was simply not being drawn.
       *
       * A puff only changes side when it is decisively on the other one.
       */
      const DEADBAND = 14;
      const sides: boolean[] = [];
      let side = trail[0].z >= 0;
      for (const puff of trail) {
        if (puff.z > DEADBAND) side = true;
        else if (puff.z < -DEADBAND) side = false;
        sides.push(side);
      }

      let runStart = 0;
      for (let index = 1; index <= trail.length; index++) {
        const ends = index === trail.length || sides[index] !== sides[runStart];
        if (!ends) continue;
        // One extra puff of overlap, so consecutive runs meet rather than
        // leaving a hairline gap where the ribbon crosses the lead.
        const run = trail.slice(runStart, Math.min(index + 1, trail.length));
        const runSide = sides[runStart];
        runStart = index;
        if (run.length < 2) continue;
        const context = runSide ? front : back;
        if (!context) continue;

        const upper: [number, number][] = [];
        const lower: [number, number][] = [];
        for (let i = 0; i < run.length; i++) {
          const puff = run[i];
          const previous = run[Math.max(0, i - 1)];
          const next = run[Math.min(run.length - 1, i + 1)];
          const dx = next.x - previous.x;
          const dy = next.y - previous.y;
          const length = Math.hypot(dx, dy) || 1;
          // Perpendicular to the local direction of travel.
          const nx = -dy / length;
          const ny = dx / length;
          const life = puff.age / PUFF_LIFE;
          const scale = project(puff).scale;
          /*
           * Thin at the nozzle, billowing as it decays — and the growth is on
           * a square root, because a plume spreads quickly at first and then
           * slows. Linear growth gives a wedge, which reads as a banner.
           */
          /*
           * The floor matters more than the growth.
           *
           * The ribbon is drawn into the backing store correctly — measured at
           * three pixels from the tailpipe at worst — and then the element is
           * blurred for softness, which is enough to erase a
           * head only a few pixels wide. So the newest smoke is *thick*: it is
           * the part that has not had time to spread yet, and it is the part
           * that has to read as attached to the aeroplane.
           */
          /*
           * And the plume is lumpy. A single smooth profile is a ribbon; real
           * smoke has fatter and thinner passages along it, because it did not
           * all leave the aircraft into the same air. `bulk` is a slow function
           * of the puff's own seed, so the lumps travel *with* the smoke rather
           * than flickering along it, and it only takes effect as the puff
           * ages — at the nozzle there is nothing to be lumpy yet.
           */
          const bulk = 1 + 0.42 * Math.sin(puff.seed * 0.9) * Math.sqrt(life);
          const half = (2.6 + 36 * Math.sqrt(life) * spread * bulk) * scale;
          // Two frequencies, both slow: one long undulation and one shorter
          // ripple on top of it. A single sine reads as a sine.
          const wander =
            (Math.sin(puff.seed * 1.7) * 5.2 + Math.sin(puff.seed * 4.3 + 1.7) * 2.1) * life;
          const px = puff.x * scale;
          const py = puff.y * scale + wander;
          upper.push([px + nx * half, py + ny * half]);
          lower.push([px - nx * half, py - ny * half]);
        }

        /*
         * Drawn as quadratic curves through the midpoints rather than as line
         * segments. The polygon has one vertex per frame, so at 60fps a turn
         * puts a visible corner every few pixels; running the curve through
         * the midpoints turns that chain of corners into one smooth edge for
         * the price of the same number of points.
         */
        const edge = (points: [number, number][]) => {
          for (let i = 1; i < points.length - 1; i++) {
            const [cx, cy] = points[i];
            const mx = (points[i][0] + points[i + 1][0]) / 2;
            const my = (points[i][1] + points[i + 1][1]) / 2;
            context.quadraticCurveTo(cx, cy, mx, my);
          }
          const last = points[points.length - 1];
          context.lineTo(last[0], last[1]);
        };

        context.beginPath();
        context.moveTo(upper[0][0], upper[0][1]);
        edge(upper);
        lower.reverse();
        context.lineTo(lower[0][0], lower[0][1]);
        edge(lower);
        context.closePath();
        /*
         * The ribbon fades along its own length rather than all at once.
         *
         * Every pass used to be one flat alpha, so a plume was as solid where
         * it was dissipating as it was at the nozzle — which is what made the
         * trails read as painted stripes. A linear gradient from the oldest
         * puff in this run to the newest is an approximation on a curved
         * ribbon and an entirely convincing one, for the price of one gradient
         * per pass instead of one fill per puff.
         */
        const oldest = run[0];
        const newest = run[run.length - 1];
        const from = project(oldest);
        const to = project(newest);
        const fade = context.createLinearGradient(
          oldest.x * from.scale,
          oldest.y * from.scale,
          newest.x * to.scale,
          newest.y * to.scale,
        );
        const tint = `${colour[0]}, ${colour[1]}, ${colour[2]}`;
        /*
         * Five stops, not two, and they follow the age curve rather than a
         * straight line between the run's ends.
         *
         * Two stops interpolate the opacity *linearly*, which is fine for a
         * linear fade and wrong for every one of the curves below — and the
         * curves are the point. Rendered and looked at, the two-stop version
         * put a hard-edged bright bar at the head of every ribbon and a blunt
         * rectangle at the tail: the brief's "three perfectly straight digital
         * bars", exactly the thing §1.22 says not to draw. Five stops for one
         * gradient object is free.
         */
        for (let stop = 0; stop <= 4; stop++) {
          const t = stop / 4;
          const age = mix(oldest.age, newest.age, t);
          fade.addColorStop(t, `rgba(${tint}, ${fadeAt(age).toFixed(4)})`);
        }
        context.fillStyle = fade;
        context.fill();
      }
    };

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a gap of seconds, and an
      // unclamped step would teleport the smoke off the screen in one frame.
      const dt = Math.min(0.05, (now - last) / 1000);
      // The same interval in milliseconds, for the attitude filter, and
      // clamped the same way and for the same reason.
      const dtMs = dt * 1000;
      last = now;
      const elapsed = now - start;

      /*
       * The break-off is decided here and nowhere else, and it is *recorded*
       * rather than acted on: every position after it is a pure function of
       * when it happened, so the roll-out inherits the exact geometry and the
       * exact circulation rate the display was flying at. That is what makes
       * the seam invisible, and it is why this is one number rather than a
       * pile of captured state.
       */
      if (breakOff === null && readyRef.current && elapsed >= DISPLAY_FLOOR_MS) breakOff = elapsed;

      const frame = sceneAt(elapsed, breakOff);
      setPhaseOnce(frame.stage);

      const emit: { x: number; y: number; z: number; index: number }[] = [];
      for (const [seat, aircraft] of frame.escorts.entries()) {
        const attitude = attitudes.smooth(seat, attitudeOf(aircraft), dtMs);
        const sprite = spriteAt(aircraft.offset, attitude.heading, {
          bank: attitude.bank,
          pitch: attitude.pitch,
        });
        const node = escortRefs.current[seat];
        if (node) {
          node.style.transform = sprite.transform;
          // Occlusion, from the depth itself: behind the lead under it, in
          // front of the lead over it. No visibility toggles, no teleports.
          node.style.zIndex = aircraft.offset.z >= 0 ? "3" : "1";
          /*
           * Aerial perspective, and the third jet's arrival, in one number.
           *
           * Distance takes a little contrast out of the far half of the
           * manoeuvre. The joining aircraft additionally fades up over the
           * first sixth of its run — inline rather than as a CSS delay,
           * because a delay knows nothing about where the aeroplane is.
           */
          const far = 0.68 + 0.32 * clamp01((aircraft.offset.z + 190) / 380);
          node.style.opacity = (far * (seat === 2 ? clamp01(aircraft.arrival / 0.16) : 1)).toFixed(3);
        }
        emit.push({ ...sprite.emitter, index: seat });
      }

      /*
       * The lead flies out with them.
       *
       * This is the whole of §1.23, and it replaces a `translate3d(165vw)` on
       * the scene: that moved the *picture* — smoke, canvases and all — which
       * reads as the composition being pushed off the table rather than as
       * aeroplanes leaving. Here the camera holds its cruise and the formation
       * accelerates away from it, so the air keeps drifting past at exactly
       * the rate it always did and the ribbons stretch because the aircraft
       * outran them.
       */
      const leadNode = leadRef.current;
      if (leadNode) {
        leadNode.style.transform = `translate(-50%, -50%) translate3d(${frame.lead.toFixed(2)}px, 0, 0)`;
      }

      if (frame.stage === "depart" || frame.stage === "done") {
        const departed = elapsed - (breakOff ?? 0) - JOIN_MS - SETTLE_MS;
        const t = clamp01(departed / DEPART_MS);
        // The overlay leaves by the right edge, uncovering the application in
        // the same direction everything else in this app travels — and it
        // follows the aeroplanes out rather than running to its own clock.
        const root = rootRef.current;
        if (root) root.style.clipPath = `inset(0 0 0 ${(smootherstep((t - 0.12) / 0.88) * 100).toFixed(2)}%)`;
        if (frame.stage === "done") {
          setPhaseOnce("gone");
          finishedRef.current();
          return;
        }
      }

      advect(dt, frame.drift);
      emitClock += dt;
      for (const point of emit) {
        const previous = lastTail[point.index];
        const seed = emitClock * 2.6 + point.index * 5.3;
        // Fill the gap the aircraft's own speed opens between frames, so the
        // ribbon starts at the exhaust rather than a few pixels behind it.
        if (previous) {
          const gap = Math.hypot(point.x - previous.x, point.y - previous.y);
          // An escort covers forty or fifty scene pixels between frames in the
          // display and nearer ninety on the way out. Under-filling that
          // leaves the ribbon starting visibly behind the aeroplane.
          const steps = Math.min(24, Math.floor(gap / 6));
          for (let step = 1; step <= steps; step++) {
            const k = step / (steps + 1);
            trails[point.index].push({
              x: mix(previous.x, point.x, k),
              y: mix(previous.y, point.y, k),
              z: mix(previous.z, point.z, k),
              age: dt * (1 - k),
              seed,
            });
          }
        }
        const puff: Puff = { x: point.x, y: point.y, z: point.z, age: 0, seed };
        trails[point.index].push(puff);
        lastTail[point.index] = puff;
      }

      back?.clearRect(-CANVAS_W / 2, -CANVAS_H / 2, CANVAS_W, CANVAS_H);
      front?.clearRect(-CANVAS_W / 2, -CANVAS_H / 2, CANVAS_W, CANVAS_H);
      // Two passes per ribbon: a wide, faint halo and a tighter core. Together
      // with the blur on the canvas itself that is what reads as smoke rather
      // than as a painted stripe — and it is six fills a frame, not six
      // hundred.
      for (let index = 0; index < trails.length; index++) {
        // §1.17: the colour belongs to the *aircraft*, and follows it whatever
        // it does. It used to be read off the slot the jet happened to be
        // heading for, which is a colour that could be reassigned by a change
        // of formation.
        const colour = ESCORTS[index].smoke;
        /*
         * White reads far brighter than blue or red against a navy sky — at
         * equal alpha the third ribbon came out as a searchlight beam beside
         * two plumes of smoke. The tricolour is meant to be three of the same
         * material, so the white one is laid down thinner.
         */
        const ink = ESCORTS[index].key === "white" ? 0.85 : 1;
        // Four passes, widest and faintest first: a plume has an outside that
        // is nearly air and an inside that is nearly paint, and one polygon
        // cannot be both.
        drawTrail(trails[index], colour, (age) => PLUME(age, 0.07 * ink), 1.45);
        drawTrail(trails[index], colour, (age) => PLUME(age, 0.13 * ink), 1);
        drawTrail(trails[index], colour, (age) => PLUME(age, 0.26 * ink), 0.52);
        /*
         * A dense core over the newest quarter-second.
         *
         * The ribbon is correct at the head — the emitter puts the first puff
         * within four pixels of the tailpipe, measured — but at that age it is
         * three pixels wide under the canvas blur, so the first sixty
         * pixels of it are effectively invisible and the smoke *looks* as
         * though it starts somewhere behind the aeroplane. This is the part
         * that is still hot.
         */
        /*
         * The hot core. Measured at the backing store, the head was coming out
         * at an alpha of 53 out of 255 — which the canvas blur erased against
         * a dark sky, and which is why the smoke read as detached from
         * aircraft it was in fact one pixel behind.
         *
         * It used to be a flat alpha over everything younger than half a
         * second, and the polygon simply *stopped* there: a bright bar with a
         * squared-off end, sitting on top of a plume. Looked at, that is
         * precisely the "digital bar" the brief rules out. The alpha now falls
         * to nothing by the age the polygon ends at, so the core dissolves
         * into the plume around it instead of ending.
         */
        drawTrail(trails[index], colour, (age) => CORE(age, ink), 0.2, CORE_LIFE);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  /* Reduced motion has no departure to finish on, so it ends on the data. */
  useEffect(() => {
    if (!reduced || !ready) return;
    const timer = window.setTimeout(() => onFinished(), 200);
    return () => window.clearTimeout(timer);
  }, [reduced, ready, onFinished]);

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
        <div className="boot-scene">
          {/* The smoke laid down on the far side of the lead. */}
          <canvas ref={backRef} className="boot-smoke boot-smoke-back" style={{ width: CANVAS_W, height: CANVAS_H }} />

          {/*
            All three escorts exist in the DOM from the first frame, in seat
            order — blue, red, white — which is the order everything else in
            this file uses. The third is simply invisible until it flies in:
            creating it at the moment it appears would decode its image mid
            animation, and a frame dropped there is the one frame everybody
            sees.
          */}
          {ESCORTS.map((escort, seat) => (
            <div
              key={escort.key}
              ref={(node) => {
                escortRefs.current[seat] = node;
              }}
              className={`boot-escort boot-escort-${escort.key}${escort.key === "white" ? " boot-escort-late" : ""}`}
              style={{ opacity: escort.key === "white" ? 0 : undefined }}
            >
              <AircraftArt id={ESCORT_AIRCRAFT.id} size={64} className="boot-escort-art" />
            </div>
          ))}

          <div className="boot-lead" ref={leadRef}>
            <AircraftArt id={lead.id} size={200} className="boot-lead-art" />
          </div>

          {/* And the smoke on this side of it. */}
          <canvas ref={frontRef} className="boot-smoke boot-smoke-front" style={{ width: CANVAS_W, height: CANVAS_H }} />
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
