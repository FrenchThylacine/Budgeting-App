import React, { useEffect, useMemo, useRef, useState } from "react";
import { AircraftArt } from "../ui/Aircraft";
import { AIRCRAFT_IDS, DEFAULT_AIRCRAFT, ESCORT_AIRCRAFT, aircraftFor } from "../../domain/aircraft";

/**
 * The loading sequence
 * ====================
 *
 * A lead aircraft holds the centre of the screen while two Alpha Jets fly a
 * banked orbit around it — over the top, under the belly, in front of the nose
 * and away behind the tail — one trailing blue smoke and one red. When the
 * application is ready they roll out of the turn and form up behind the lead, a
 * third joins them trailing white, the three ribbons settle into a tricolour,
 * and the whole formation accelerates away to the right, taking the loading
 * screen with it and leaving the application behind.
 *
 * ─── The orbit is in three dimensions, not two ───────────────────────────────
 *
 * The first version flew an ellipse in the screen plane. Two aeroplanes going
 * round a flat racetrack: they passed left and right of the lead and changed
 * size a little, and the whole thing read as two stickers on a turntable.
 *
 * This one puts the circle in a **plane tilted 56° out of the screen**. The
 * escort's position is a real 3D point, and the three things that make depth
 * legible are all derived from its z:
 *
 *  - **Perspective.** `scale = D / (D − z)` — nearer is bigger, and the growth
 *    is hyperbolic rather than linear, which is what an eye reads as distance
 *    rather than as a zoom.
 *  - **Occlusion.** Positive z draws over the lead, negative z draws under it.
 *    Passing *behind* something is the strongest depth cue there is, and it is
 *    free.
 *  - **Aerial perspective.** Distance takes a little contrast out of the far
 *    half of the turn.
 *
 * The heading is the tangent of the *projected* path, computed by sampling the
 * curve a moment ahead, so the aeroplane points where it is actually going on
 * screen. An orbiting aircraft that does not do this looks like a spinning
 * sticker no matter how good the projection is.
 *
 * ─── The smoke is advected, not drawn behind the aircraft ────────────────────
 *
 * The trails were a CSS gradient bar pinned to the tail: straight, rigid, and
 * pointing wherever the aeroplane pointed. Real display smoke does none of
 * that — it is left *in the air*, and the air does not move with the aircraft.
 *
 * So each jet emits a particle per frame at its tailpipe, and from then on the
 * particle belongs to the sky: it drifts backwards at the airspeed, spreads,
 * fades and wanders. The ribbon is the polygon through those particles, and
 * every property the brief asks for falls out of that one decision rather than
 * being animated separately —
 *
 *  - it follows the flight path, because it *is* the flight path;
 *  - it curves through the turn and lags on the roll-out, because a particle
 *    laid down 300ms ago is where the aircraft was 300ms ago;
 *  - it billows, because each particle's width grows with its own age;
 *  - it wanders, because a little smooth noise is added as it ages;
 *  - and in formation it becomes three long parallel bands — blue, white, red —
 *    because three aircraft holding station in still air leave straight lines.
 *
 * It is drawn on two canvases, one behind the lead and one in front, and each
 * particle goes to the canvas its own z-sign chooses. That is what lets a
 * ribbon pass *through* the scene: the smoke laid down behind the aircraft
 * stays behind it while the aircraft comes round the front.
 *
 * ─── Why this is rAF and not keyframes ───────────────────────────────────────
 *
 * Everything else in this application animates in CSS, and should. This does
 * not, for one reason: the escorts have to leave the orbit *from wherever they
 * happen to be* the instant the data arrives. A CSS animation cannot be
 * interrupted and continued from its current value — swapping to a second
 * animation snaps the element to the new animation's first frame, which is a
 * visible jump on the one screen the user is guaranteed to look at.
 *
 * The cost is one loop over three sprites writing `transform`, plus two canvas
 * draws of six filled polygons. No layout, no reflow, and it stops the moment
 * the sequence finishes.
 *
 * ─── Why there is a floor on how fast it can go ──────────────────────────────
 *
 * A warm reload can be ready in 150ms. Playing a formation join in 150ms is not
 * a fast loading screen, it is a flicker. So the *narrative* has a fixed length
 * (join, settle, depart ≈ 2s) and only the orbit is elastic: a slow load
 * circles for as long as it takes, a fast one circles briefly and then leaves.
 */

/** Camera distance for the perspective divide. Smaller is a wider lens. */
const CAMERA_D = 620;
/** One pass down the routine. Slow enough to read as flying, not spinning. */
const ROUTE_MS = 5200;
/** Long enough that the routine is seen at all before it is broken off. */
const MIN_ORBIT_MS = 1500;
const JOIN_MS = 1500;
const SETTLE_MS = 520;
const DEPART_MS = 820;

type Phase = "orbit" | "join" | "settle" | "depart" | "done";

/**
 * Where each escort ends up, relative to the lead.
 *
 * Three abreast and stepped, so the ribbons stack into horizontal bands: blue
 * above, white through the middle, red below. That is the shape the Patrouille
 * de France actually leaves in the sky, and it is why the slots are a column
 * rather than the diamond a formation would normally fly.
 */
const SLOTS = [
  { x: -120, y: -48, key: "blue", smoke: [96, 152, 232] },
  { x: -136, y: 0, key: "white", smoke: [246, 248, 252] },
  { x: -120, y: 48, key: "red", smoke: [228, 58, 70] },
] as const;

/** Ease-out cubic: fast out of the turn, settling gently into the slot. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Ease-in quartic: the departure accelerates rather than translating. */
const easeIn = (t: number) => t * t * t * t;
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
/** Shortest way round, so a heading never unwinds the long way. */
const mixAngle = (from: number, to: number, t: number) => {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta * t;
};

/** A point in the scene, before projection. x right, y down, z toward you. */
interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The routine
 * ===========
 *
 * This was a circle in a tilted plane, then a circle with three harmonics laid
 * over it. Both were genuinely three-dimensional and both still read as
 * machinery, for a reason no amount of perturbation fixes: a closed ring
 * traversed at a steady rate is a ring, and an eye recognises one immediately.
 *
 * The reference is the ATHOS A350 display — an A350 with the Patrouille de
 * France around it — and the thing that actually reads in a photograph of it
 * is not an orbit at all. It is **two enormous corkscrews**: a soloist on each
 * side carving a great helical arc right across the frame, passing in front of
 * the lead and away behind it, leaving a fat curling rope of smoke that wraps
 * the whole picture. The formation sits small and tight underneath.
 *
 * So the path is **authored**, not derived. Each escort has a route of six
 * waypoints laid out across the scene — high and behind, diving under, forward
 * across the nose, climbing away right, over the top, sweeping back — and a
 * Catmull-Rom spline runs through them. Choreography is a thing somebody
 * decides; it is not something that falls out of a sine.
 *
 * The two consequences that matter:
 *
 *  - the track is **big**. It leaves the aircraft far behind on both sides,
 *    which is what makes the smoke a sweeping arc rather than a halo;
 *  - the speed **varies**, because the spline is walked at a constant rate in
 *    parameter space while the waypoints are unevenly spaced. The jet
 *    accelerates down the long legs and eases through the tight corners, which
 *    is what an aeroplane does and a metronome does not.
 */
type Route = readonly Point3[];

/**
 * Blue: high and behind, dives under, forward across the nose, climbs away to
 * the right, over the top, sweeps back in behind.
 */
const ROUTE_A: Route = [
  { x: -340, y: -150, z: -170 },
  { x: -150, y: 55, z: 130 },
  { x: 130, y: 185, z: 165 },
  { x: 330, y: 25, z: -60 },
  { x: 190, y: -190, z: -175 },
  { x: -130, y: -150, z: -70 },
];

/**
 * Red: the same idea, entered from the other side and half a pass out of step,
 * so the two cross rather than mirror.
 */
const ROUTE_B: Route = [
  { x: 340, y: 160, z: -150 },
  { x: 130, y: -70, z: 140 },
  { x: -170, y: -195, z: 155 },
  { x: -330, y: -15, z: -70 },
  { x: -190, y: 175, z: -170 },
  { x: 150, y: 140, z: -60 },
];

const ROUTES: readonly Route[] = [ROUTE_A, ROUTE_B];

/**
 * Catmull-Rom through the waypoints, wrapped into a loop.
 *
 * Chosen over a Bézier because it *passes through* its control points: the
 * waypoints above are the choreography, and a curve that merely approximates
 * them is a different display. `u` is the position along the whole route, in
 * turns.
 */
/**
 * How wide the corkscrew is, and how many turns it makes in one pass.
 *
 * The sweeping arc alone was smooth, and the thing that reads in a photograph
 * of this display is not a smooth arc — it is a *rope*: the soloist rolls
 * continuously as it travels, so the smoke it leaves is a helix. Six turns
 * across a pass is enough to be unmistakable and few enough that each loop is
 * still separately visible.
 */
const CORKSCREW_R = 62;
const CORKSCREW_TURNS = 6;

/** The spline alone, before the roll is added. */
function splinePoint(route: Route, u: number): Point3 {
  const n = route.length;
  const scaled = ((u % 1) + 1) % 1 * n;
  const i = Math.floor(scaled);
  const t = scaled - i;
  const p0 = route[(i - 1 + n) % n];
  const p1 = route[i % n];
  const p2 = route[(i + 1) % n];
  const p3 = route[(i + 2) % n];

  const t2 = t * t;
  const t3 = t2 * t;
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);

  return {
    x: axis(p0.x, p1.x, p2.x, p3.x),
    y: axis(p0.y, p1.y, p2.y, p3.y),
    z: axis(p0.z, p1.z, p2.z, p3.z),
  };
}

/**
 * The route, with the roll on it.
 *
 * The offset is applied in the plane perpendicular to travel, which is what
 * makes it a helix rather than a wobble: the aircraft is always going *along*
 * the rope, never across it. The radius eases to nothing at the corners, where
 * a full-width roll would fight the turn.
 */
function routePoint(route: Route, u: number): Point3 {
  const centre = splinePoint(route, u);
  const ahead = splinePoint(route, u + 0.01);
  const dx = ahead.x - centre.x;
  const dy = ahead.y - centre.y;
  const dz = ahead.z - centre.z;
  const length = Math.hypot(dx, dy, dz) || 1;

  // Two vectors across the direction of travel. The first is the horizontal
  // normal; the second completes the frame. Degenerate only if the aircraft
  // were flying exactly along the y axis, which no waypoint asks for.
  const nx = -dy / length;
  const ny = dx / length;
  const bx = ny * (dz / length);
  const by = -nx * (dz / length);
  const bz = (nx * (dy / length) - ny * (dx / length));

  const angle = u * CORKSCREW_TURNS * Math.PI * 2;
  const radius = CORKSCREW_R;
  const c = Math.cos(angle) * radius;
  const sn = Math.sin(angle) * radius;

  return {
    x: centre.x + nx * c + bx * sn,
    y: centre.y + ny * c + by * sn,
    z: centre.z + bz * sn,
  };
}

interface Projected {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Perspective divide. `z` is kept, because occlusion and fog both need it. */
function project(point: Point3): Projected {
  const scale = CAMERA_D / (CAMERA_D - point.z);
  return { x: point.x * scale, y: point.y * scale, z: point.z, scale };
}

/**
 * The attitude of an aircraft at a point on its route.
 *
 * Three things, all read off the same tangent, because an aeroplane's attitude
 * *is* its direction of travel:
 *
 *  - **heading**, from the tangent of the *projected* path, so the nose points
 *    where the shape is actually going on screen;
 *  - **bank**, from the rate at which that heading is changing. A sprite drawn
 *    from above shows a roll as a loss of span, so a turn compresses it across
 *    the wings — hard left and hard right both narrow it, which is what a bank
 *    looks like from above;
 *  - **pitch**, from how much of the velocity is going into or out of the
 *    screen. A climb toward the camera foreshortens the fuselage, so the
 *    length compresses.
 *
 * Without these the sprites slide sideways at a fixed attitude, which is the
 * single thing that most makes an animated aeroplane look like a sticker.
 */
interface Attitude {
  heading: number;
  bank: number;
  pitch: number;
}

function attitudeAt(route: Route, u: number): Attitude {
  const step = 0.004;
  const back = project(routePoint(route, u - step));
  const here = project(routePoint(route, u));
  const ahead = project(routePoint(route, u + step));

  const heading = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
  const previous = (Math.atan2(here.y - back.y, here.x - back.x) * 180) / Math.PI;
  // Signed change in heading over one step, shortest way round.
  const turn = ((heading - previous + 540) % 360) - 180;
  // A hard turn narrows the span to about half. Clamped, because the spline's
  // corners can be sharp and a sprite folded to nothing reads as a glitch.
  const bank = 1 - Math.min(0.55, Math.abs(turn) / 26);

  const depth = routePoint(route, u + step).z - routePoint(route, u - step).z;
  // Same idea along the fuselage: the more of the motion is toward or away
  // from the camera, the more the length is foreshortened.
  const pitch = 1 - Math.min(0.35, Math.abs(depth) / 46);

  return { heading, bank, pitch };
}

/**
 * A rejoin is a curve, not a chord
 * ================================
 *
 * An aeroplane leaving a manoeuvre to take up station does not cut across the
 * sky in a straight line to its slot: it carries on along the heading it is
 * already on, and *bends* onto the formation. Interpolating position linearly
 * gave the opposite — the nose pointing one way while the aircraft slid
 * another, which is the sticker problem again, this time in the join.
 *
 * So each rejoin is a quadratic Bézier whose control point sits ahead of the
 * release point along the heading the aircraft was already flying. The tangent
 * of that curve then gives the heading for free, and its rate of change gives
 * the bank, exactly as `attitudeAt` does for the routes.
 */
interface Flat {
  x: number;
  y: number;
}

function bezier(from: Flat, control: Flat, to: Flat, t: number): Flat {
  const k = 1 - t;
  return {
    x: k * k * from.x + 2 * k * t * control.x + t * t * to.x,
    y: k * k * from.y + 2 * k * t * control.y + t * t * to.y,
  };
}

/** The heading of that curve at `t`, in degrees, from its derivative. */
function bezierHeading(from: Flat, control: Flat, to: Flat, t: number): number {
  const dx = 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x);
  const dy = 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** How far ahead of the release point the rejoin curve reaches before bending. */
const REJOIN_LEAD = 190;

/**
 * Where the third jet comes from.
 *
 * Off the bottom-left corner, well outside the frame, on a curve that brings it
 * up and across into the slot. It used to start 210px to the left of its slot
 * and slide over in a straight line at a fixed attitude, which is not a join —
 * it is an object appearing near the formation and then being next to it.
 */
const THIRD_ENTRY: Flat = { x: -900, y: 300 };
const THIRD_CONTROL: Flat = { x: -420, y: 330 };

/**
 * The Alpha Jet is drawn 64px long, nose-right, centred on the point the script
 * positions. Its tailpipe sits a little behind the centre — 0.44 of the length,
 * measured off the artwork rather than guessed, which is where the exhaust
 * actually is once the drawing's transparent margin is taken off.
 */
const ESCORT_LENGTH = 64;
const TAILPIPE = ESCORT_LENGTH * 0.44;

/**
 * Where the smoke comes out.
 *
 * Scene coordinates in, scene coordinates out, and the heading is the one the
 * sprite is actually rotated by — which is the *screen* heading, because that
 * is what a CSS `rotate` applies. The two spaces cancel: the sprite is drawn at
 * `scene × scale` and rotated in screen space, so a screen-space offset of
 * `TAILPIPE × scale` is a scene-space offset of exactly `TAILPIPE`.
 *
 * It used to be a bare `x - 26` in the join and formation phases — no heading
 * at all — so for the whole of the roll-out, while the aeroplane was still
 * turning, the smoke came out of a point beside it rather than out of the back
 * of it. That is the "not quite from the exhaust" this fixes.
 */
function tailpipe(point: Point3, headingDegrees: number, index: number) {
  const radians = (headingDegrees * Math.PI) / 180;
  return {
    x: point.x - Math.cos(radians) * TAILPIPE,
    y: point.y - Math.sin(radians) * TAILPIPE,
    z: point.z,
    index,
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

/** How long a puff lives. Longer is a longer ribbon and more to draw. */
const PUFF_LIFE = 2.4;
/** Airspeed, in scene pixels per second: how fast the smoke falls behind. */
const CRUISE = 132;
/** And on the way out, when the formation lights the burners. */
const DEPART_SPEED = 2100;

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

/** The canvas box, centred on the scene origin. Wide enough for the ribbons. */
const CANVAS_W = 1180;
const CANVAS_H = 620;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ ready, onFinished, caption, aircraft }) => {
  const lead = aircraftFor(aircraft);
  const sceneRef = useRef<HTMLDivElement>(null);
  const escortRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
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
     * soon as the data does. Aircraft flying in circles is precisely what that
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

    /** Three ribbons: two orbiting, one that joins late. */
    const trails: Puff[][] = [[], [], []];
    /**
     * Where each tailpipe was last frame.
     *
     * At the fast end of the routine an escort covers thirty or forty scene
     * pixels between frames, and one puff per frame leaves the ribbon starting
     * a visible gap behind the aeroplane that is drawing it. The gap is filled
     * by walking from the previous tailpipe to this one.
     */
    const lastTail: (Puff | null)[] = [null, null, null];
    let frame = 0;
    let last = performance.now();
    const start = last;
    /** When the orbit was broken off. Null while it is still turning. */
    let breakOff: number | null = null;
    /** Each escort's projected state when it broke off, for the interpolation. */
    let released: { projected: Projected; heading: number }[] = [];
    let current: Phase = "orbit";
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
          // Smoke rises and spreads a little as it decays, and wanders on the
          // disturbed air behind the aircraft. Deterministic — `Math.random`
          // here would make the ribbon shimmer instead of drift.
          puff.y += Math.sin(puff.age * 2.3 + puff.seed) * 5.5 * dt;
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
    const drawTrail = (trail: Puff[], colour: readonly number[], alpha: number, spread: number, youngerThan = Infinity) => {
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
          const half = (5.5 + 34 * Math.sqrt(life) * spread) * scale;
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
        context.fillStyle = `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${alpha})`;
        context.fill();
      }
    };

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a gap of seconds, and an
      // unclamped step would teleport the smoke off the screen in one frame.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;

      let speed = CRUISE;
      const emit: { x: number; y: number; z: number; index: number }[] = [];

      if (breakOff === null) {
        /*
         * Both escorts walk their own route at the same rate, half a pass out
         * of step, so their tracks cross rather than mirror.
         */
        const u = elapsed / ROUTE_MS;
        for (let index = 0; index < 2; index++) {
          const route = ROUTES[index];
          const at = u + index * 0.37;
          const point = routePoint(route, at);
          const projected = project(point);
          const attitude = attitudeAt(route, at);
          const node = escortRefs.current[index];
          if (node) {
            node.style.transform =
              `translate3d(${projected.x.toFixed(2)}px, ${projected.y.toFixed(2)}px, 0) ` +
              `rotate(${attitude.heading.toFixed(2)}deg) scale(${projected.scale.toFixed(3)}) ` +
              `scaleX(${attitude.pitch.toFixed(3)}) scaleY(${attitude.bank.toFixed(3)})`;
            node.style.zIndex = point.z >= 0 ? "3" : "1";
            // Aerial perspective: the far half of the pass loses a little
            // contrast, the way distance actually works.
            node.style.opacity = (0.68 + 0.32 * clamp01((point.z + 190) / 380)).toFixed(3);
          }
          emit.push(tailpipe(point, attitude.heading, index));
        }
        if (readyRef.current && elapsed >= MIN_ORBIT_MS) {
          breakOff = now;
          released = [0, 1].map((index) => {
            const at = u + index * 0.37;
            return { projected: project(routePoint(ROUTES[index], at)), heading: attitudeAt(ROUTES[index], at).heading };
          });
          setPhaseOnce("join");
        }
      } else {
        const since = now - breakOff;

        if (since < JOIN_MS) {
          const t = easeOut(clamp01(since / JOIN_MS));
          for (let index = 0; index < 2; index++) {
            const from = released[index];
            const slot = SLOTS[index === 0 ? 0 : 2];
            // Carry on along the release heading, then bend onto the slot.
            const radians = (from.heading * Math.PI) / 180;
            const control = {
              x: from.projected.x + Math.cos(radians) * REJOIN_LEAD,
              y: from.projected.y + Math.sin(radians) * REJOIN_LEAD,
            };
            const here = bezier(from.projected, control, slot, t);
            const heading = bezierHeading(from.projected, control, slot, t);
            // Bank out of the turn as the curve straightens: the rate of turn
            // is largest at the start of the rejoin and nothing at the slot.
            const ahead = bezierHeading(from.projected, control, slot, Math.min(1, t + 0.05));
            const turn = ((ahead - heading + 540) % 360) - 180;
            const bank = 1 - Math.min(0.45, Math.abs(turn) / 30);
            // The last quarter of the rejoin levels the nose onto the
            // formation heading, so arriving in the slot is the end of a turn
            // rather than a jump to zero degrees on the next frame.
            const settled = mixAngle(heading, 0, easeOut(clamp01((t - 0.75) / 0.25)));
            const node = escortRefs.current[index];
            if (node) {
              node.style.transform =
                `translate3d(${here.x.toFixed(2)}px, ${here.y.toFixed(2)}px, 0) ` +
                `rotate(${settled.toFixed(2)}deg) scale(${mix(from.projected.scale, 1, t).toFixed(3)}) ` +
                `scaleY(${bank.toFixed(3)})`;
              node.style.zIndex = "1";
              node.style.opacity = "1";
            }
            // The same heading the sprite is rotated by — so the exhaust stays
            // at the back of the aeroplane through the whole roll-out rather
            // than only once it is level.
            emit.push(tailpipe({ ...here, z: mix(from.projected.z, 0, t) }, settled, index));
          }

          /*
           * The third jet flies in from outside the frame on its own curve,
           * arriving as the other two roll out. It is on the wing the whole
           * way — trailing smoke, nose on the curve, banking out of its turn —
           * because a formation gaining an aircraft is a thing you watch
           * happen, not a thing you find has happened.
           */
          const third = escortRefs.current[2];
          const slot = SLOTS[1];
          const arrival = easeOut(clamp01(since / (JOIN_MS * 0.94)));
          const here = bezier(THIRD_ENTRY, THIRD_CONTROL, slot, arrival);
          const heading = bezierHeading(THIRD_ENTRY, THIRD_CONTROL, slot, arrival);
          const ahead = bezierHeading(THIRD_ENTRY, THIRD_CONTROL, slot, Math.min(1, arrival + 0.05));
          const turn = ((ahead - heading + 540) % 360) - 180;
          const settled = mixAngle(heading, 0, easeOut(clamp01((arrival - 0.7) / 0.3)));
          if (third) {
            third.style.transform =
              `translate3d(${here.x.toFixed(2)}px, ${here.y.toFixed(2)}px, 0) ` +
              `rotate(${settled.toFixed(2)}deg) ` +
              `scaleY(${(1 - Math.min(0.45, Math.abs(turn) / 30)).toFixed(3)})`;
            // Inline, so the fade is tied to the distance flown rather than to
            // a CSS delay that knows nothing about where the aircraft is.
            third.style.opacity = clamp01(arrival / 0.18).toFixed(3);
          }
          emit.push(tailpipe({ ...here, z: 0 }, settled, 2));
        } else {
          // Locked into the slots from here on; the scene moves as one body.
          for (let index = 0; index < 3; index++) {
            const slot = SLOTS[index === 0 ? 0 : index === 1 ? 2 : 1];
            const node = escortRefs.current[index];
            if (node) node.style.transform = `translate3d(${slot.x}px, ${slot.y}px, 0)`;
            emit.push(tailpipe({ x: slot.x, y: slot.y, z: 0 }, 0, index));
          }

          if (since < JOIN_MS + SETTLE_MS) {
            setPhaseOnce("settle");
            /*
             * The hold is not a pause, it is a run-up.
             *
             * The formation used to sit at cruise for 420ms and then leave at
             * a stroke, which is what made the departure read as a state
             * change rather than as the end of a manoeuvre. The airspeed now
             * builds through the hold — a quarter of the way to the burners —
             * so the ribbons are already stretching before anything moves.
             */
            speed = mix(CRUISE, DEPART_SPEED, 0.25 * easeIn(clamp01((since - JOIN_MS) / SETTLE_MS)));
          } else {
            const departed = since - JOIN_MS - SETTLE_MS;
            setPhaseOnce("depart");
            const t = clamp01(departed / DEPART_MS);
            // Picks up exactly where the hold left it.
            speed = mix(mix(CRUISE, DEPART_SPEED, 0.25), DEPART_SPEED, easeIn(t));
            const scene = sceneRef.current;
            const root = rootRef.current;
            if (scene) scene.style.transform = `translate3d(${(easeIn(t) * 165).toFixed(2)}vw, 0, 0)`;
            // The overlay leaves by the right edge, uncovering the application
            // in the same direction everything else in this app travels.
            if (root) root.style.clipPath = `inset(0 0 0 ${(easeIn(Math.max(0, t - 0.18) / 0.82) * 100).toFixed(2)}%)`;
            if (t >= 1) {
              setPhaseOnce("done");
              finishedRef.current();
              return;
            }
          }
        }
      }

      advect(dt, speed);
      emitClock += dt;
      for (const point of emit) {
        const previous = lastTail[point.index];
        const seed = emitClock * 2.6 + point.index * 5.3;
        // Fill the gap the aircraft's own speed opens between frames, so the
        // ribbon starts at the exhaust rather than a few pixels behind it.
        if (previous) {
          const gap = Math.hypot(point.x - previous.x, point.y - previous.y);
          // The routine is much larger than the old ring, so an escort can
          // cover forty or fifty scene pixels between frames. Under-filling
          // that leaves the ribbon starting visibly behind the aeroplane.
          const steps = Math.min(16, Math.floor(gap / 7));
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
        const colour = SLOTS[index === 0 ? 0 : index === 1 ? 2 : 1].smoke;
        /*
         * White reads far brighter than blue or red against a navy sky — at
         * equal alpha the third ribbon came out as a searchlight beam beside
         * two plumes of smoke. The tricolour is meant to be three of the same
         * material, so the white one is laid down thinner.
         */
        const ink = index === 2 ? 0.62 : 1;
        // Four passes, widest and faintest first: a plume has an outside that
        // is nearly air and an inside that is nearly paint, and one polygon
        // cannot be both.
        drawTrail(trails[index], colour, 0.07 * ink, 1.45);
        drawTrail(trails[index], colour, 0.13 * ink, 1);
        drawTrail(trails[index], colour, 0.26 * ink, 0.52);
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
        // The hot core. Measured at the backing store, the head was coming out
        // at an alpha of 53 out of 255 — which the canvas blur erased against a
        // dark sky, and which is why the smoke read as detached from aircraft
        // it was in fact one pixel behind. It now measures 243.
        drawTrail(trails[index], colour, 0.92 * ink, 0.18, 0.5);
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
          {/* The smoke laid down on the far side of the lead. */}
          <canvas ref={backRef} className="boot-smoke boot-smoke-back" style={{ width: CANVAS_W, height: CANVAS_H }} />

          {/*
            The third jet exists in the DOM from the start and is invisible
            until it is wanted: creating it at the moment it appears would
            decode its image mid-animation, and a frame dropped there is the
            one frame everybody sees.
          */}
          {SLOTS.map((slot, index) => {
            // Slots 0 and 2 belong to the two orbiting jets; slot 1 is the one
            // that joins, and is the only one placed by CSS until it does.
            const orbiting = index !== 1;
            const escortIndex = index === 0 ? 0 : index === 2 ? 1 : 2;
            return (
              <div
                key={slot.key}
                ref={(node) => {
                  escortRefs.current[escortIndex] = node;
                }}
                className={`boot-escort boot-escort-${slot.key}${orbiting ? "" : " boot-escort-late"}${joined ? " is-joined" : ""}`}
                style={orbiting ? undefined : { transform: `translate3d(${slot.x - 210}px, ${slot.y + 96}px, 0)` }}
              >
                <AircraftArt id={ESCORT_AIRCRAFT.id} size={64} className="boot-escort-art" />
              </div>
            );
          })}

          <div className="boot-lead">
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
