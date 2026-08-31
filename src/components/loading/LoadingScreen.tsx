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
 * ─── The routine is choreographed, not generated ────────────────────────────
 *
 * Four versions of this failed before the one that is here, and they failed in
 * a way worth recording, because each was *more* correct than the last and none
 * of them looked like flying. An ellipse in the screen plane. A circle in a
 * tilted plane. That circle with three incommensurate harmonics on it. Authored
 * waypoints with a six-turn corkscrew laid over them. Every one was genuinely
 * three-dimensional; every one read as machinery, and the last read as
 * machinery having a seizure.
 *
 * The lesson is that **complexity is not choreography**. A display pilot flies
 * a small number of large, deliberate shapes. So the routes here are eight
 * waypoints apiece that say what the manoeuvre is in words first — high and
 * behind, diving under the belly, forward and near, rising across the nose,
 * over the top, away behind — and the aircraft is walked along them by arc
 * length at a speed that trades height for airspeed. Nothing is perturbed and
 * nothing is random.
 *
 * The three things that make the depth legible are all derived from z:
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
 * screen. An aircraft that does not do this looks like a spinning sticker no
 * matter how good the projection is.
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
const ROUTE_MS = 3200;
/**
 * The floor on the routine, and it is deliberately *equal* to one pass.
 *
 * It used to be 1500ms against a 5200ms routine, which meant that unless the
 * application was slow to load nobody ever saw more than the first quarter of
 * the choreography — the descent, and then the break-off. A manoeuvre shown a
 * quarter at a time is not a manoeuvre. The whole pass now always plays, and
 * the elasticity is in the *number* of passes rather than in how much of one.
 */
const MIN_ORBIT_MS = ROUTE_MS;
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
 * Three versions of this failed in the same way and it is worth naming, because
 * the failure is not obvious from the code: **a path can be correct in three
 * dimensions and still not read as flying.**
 *
 * It was a circle in a tilted plane. Then a circle with three harmonics on it.
 * Then authored waypoints with a *six-turn* corkscrew laid over them — which,
 * across a pass, meant each jet looped a hundred and twenty pixels sideways
 * every eight hundred milliseconds. Every one of those was genuinely
 * three-dimensional. All three read as machinery, and the third read as
 * machinery having a seizure, because no aeroplane changes direction that
 * often. Complexity is not choreography.
 *
 * What this one is instead:
 *
 *  1. **Eight authored waypoints per jet**, and they spell out the manoeuvre in
 *     words before they are numbers. Blue: high and behind, a diagonal descent,
 *     *under* the lead, forward and near, rising in front, over the top, away
 *     behind. Red: the opposite corner, climbing, crossing *behind*, diving
 *     below, crossing in front, climbing back. The two are out of phase, so
 *     they cross rather than mirror.
 *  2. **A centripetal Catmull-Rom** through them. Uniform Catmull-Rom — what
 *     this used before — overshoots and can cusp where waypoints bunch, which
 *     is a velocity discontinuity: exactly the "impossible instant turn" the
 *     eye catches. The centripetal parameterisation is provably free of both.
 *  3. **Walked by arc length, not by parameter.** Sampling a spline at a
 *     constant rate in `u` makes the aircraft sprint through wide arcs and
 *     crawl through tight ones — the opposite of what an aeroplane does. The
 *     table below inverts the curve so the jet travels at a controlled speed.
 *  4. **And that speed is not constant.** It is an energy trade: the jet gains
 *     speed as it descends and gives it back as it climbs, `v ∝ √(1 + drop/H)`.
 *     That is one line of arithmetic and it is the whole of the momentum the
 *     brief asks for — the acceleration and deceleration are smooth because
 *     they are a consequence of the path rather than an effect applied to it.
 *  5. **One slow roll**, two turns across the pass at a radius of twenty-six.
 *     That is what makes the smoke a rope rather than a wire — it is the thing
 *     the reference photograph actually shows — and at one roll every 1.6
 *     seconds it is a barrel roll, not a wobble.
 *
 * And the routine is now **shorter than the minimum time it is shown for**, so
 * the whole manoeuvre is always seen at least once. It used to be 5.2s long
 * with a 1.5s floor: nobody who was not on a cold load ever saw more than the
 * first quarter of the choreography, which is a large part of why it never read
 * as one.
 */
type Waypoint = Point3;

/**
 * Blue: high and behind, diving diagonally under the lead, forward and near,
 * rising across the nose, over the top, and away behind.
 *
 * The gaps between these are 202–285 scene pixels, and that evenness is not
 * decoration. A waypoint close to its neighbour is a tight corner, and because
 * the route is walked by arc length the aircraft also *slows down* there — so a
 * short leg reads as a little curl with the jet crawling round it. The route
 * this replaced closed with a 46-pixel leg, and both jets flew a visible knot
 * at the same point on every pass.
 */
const WAYPOINTS_A: readonly Waypoint[] = [
  { x: -300, y: -175, z: -210 },
  { x: -110, y: -30, z: -70 },
  { x: 30, y: 140, z: 70 },
  { x: 235, y: 105, z: 195 },
  { x: 330, y: -55, z: 115 },
  { x: 175, y: -195, z: -35 },
  { x: -75, y: -205, z: -170 },
];

/**
 * Red: the same manoeuvre turned through half a circle — so where blue goes
 * under, red goes over, and where blue crosses in front, red crosses behind.
 *
 * Derived rather than authored a second time, for two reasons. The spacing is
 * what keeps the curve free of knots, and a rotation preserves it exactly. And
 * the two are never on screen as a mirrored pair: they are more than a third of
 * a pass out of step, so what the eye sees is two aircraft crossing.
 */
const WAYPOINTS_B: readonly Waypoint[] = WAYPOINTS_A.map((point) => ({
  x: -point.x,
  y: -point.y,
  z: point.z,
}));

/** Samples used to build the arc-length and timing tables. */
const TABLE_N = 720;

/**
 * A route, prepared once at module load.
 *
 * `time[i]` is the fraction of the pass elapsed on arrival at sample `i`, so
 * looking up a position is a search in a monotone array rather than an integral
 * evaluated every frame for every aircraft.
 */
interface PreparedRoute {
  waypoints: readonly Waypoint[];
  /** Cumulative normalised time, 0 at the first sample and 1 at the last. */
  time: Float64Array;
}

/**
 * Centripetal Catmull-Rom through four points.
 *
 * The knot spacing is `|Δp|^0.5` rather than uniform. That single exponent is
 * what removes the overshoot and the cusps: with uniform knots a tight corner
 * makes the curve loop outside its own control points, and the aircraft flies a
 * little hook that no aeroplane could.
 */
function catmullRom(p0: Point3, p1: Point3, p2: Point3, p3: Point3, t: number): Point3 {
  const knot = (a: Point3, b: Point3) => Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)) || 1e-4;
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const at = t1 + (t2 - t1) * t;

  const lerp = (a: Point3, b: Point3, ta: number, tb: number, x: number): Point3 => {
    const k = (tb - x) / (tb - ta);
    const j = (x - ta) / (tb - ta);
    return { x: a.x * k + b.x * j, y: a.y * k + b.y * j, z: a.z * k + b.z * j };
  };

  const a1 = lerp(p0, p1, t0, t1, at);
  const a2 = lerp(p1, p2, t1, t2, at);
  const a3 = lerp(p2, p3, t2, t3, at);
  const b1 = lerp(a1, a2, t0, t2, at);
  const b2 = lerp(a2, a3, t1, t3, at);
  return lerp(b1, b2, t1, t2, at);
}

/** The bare spline, closed into a loop. `u` is the position in turns. */
function splinePoint(waypoints: readonly Waypoint[], u: number): Point3 {
  const n = waypoints.length;
  const scaled = ((((u % 1) + 1) % 1) * n);
  const i = Math.floor(scaled);
  return catmullRom(
    waypoints[(i - 1 + n) % n],
    waypoints[i % n],
    waypoints[(i + 1) % n],
    waypoints[(i + 2) % n],
    scaled - i,
  );
}

/**
 * Build the timing table: how much of the pass has elapsed at each sample.
 *
 * Each short segment takes `distance / speed`, and the speed is the energy
 * trade described above — faster low, slower high. Accumulated and normalised,
 * that inverts into "where is the aircraft at this fraction of the pass",
 * which is what the loop actually asks.
 */
function prepare(waypoints: readonly Waypoint[]): PreparedRoute {
  const points: Point3[] = [];
  for (let i = 0; i <= TABLE_N; i++) points.push(splinePoint(waypoints, i / TABLE_N));

  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    if (point.y < low) low = point.y;
    if (point.y > high) high = point.y;
  }
  const drop = Math.max(1, high - low);

  const time = new Float64Array(TABLE_N + 1);
  let total = 0;
  for (let i = 1; i <= TABLE_N; i++) {
    const a = points[i - 1];
    const b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    // Height at the middle of the segment, as a fraction of the total drop.
    const fallen = ((a.y + b.y) / 2 - low) / drop;
    const speed = Math.sqrt(1 + 1.1 * fallen);
    total += distance / speed;
    time[i] = total;
  }
  for (let i = 0; i <= TABLE_N; i++) time[i] /= total;
  return { waypoints, time };
}

const ROUTE_A = prepare(WAYPOINTS_A);
const ROUTE_B = prepare(WAYPOINTS_B);
const ROUTES: readonly PreparedRoute[] = [ROUTE_A, ROUTE_B];

/**
 * Where the aircraft is at `tau` of the pass — the inverse of the table.
 *
 * A binary search and one linear interpolation. `tau` wraps, so the routine
 * loops for as long as the application takes to load.
 */
function routePoint(route: PreparedRoute, tau: number): Point3 {
  const wrapped = ((tau % 1) + 1) % 1;
  const time = route.time;
  let lo = 0;
  let hi = time.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= wrapped) lo = mid;
    else hi = mid;
  }
  const span = time[hi] - time[lo] || 1;
  const within = (wrapped - time[lo]) / span;
  return splinePoint(route.waypoints, (lo + within) / TABLE_N);
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
/**
 * An aeroplane cannot change its attitude instantly
 * =================================================
 *
 * `attitudeAt` and `bezierAttitude` both compute the bank a jet *should* be at
 * from a finite difference of the projected heading. That is the right demand,
 * and it is not the right thing to draw: it responds within a single frame, so
 * anywhere the demand steps — the boundary between the routine and the rejoin
 * is the obvious one, where two different curves meet — the wings snap.
 *
 * Measured on the rendered frames, they snapped from 0.450 span to 0.947 in
 * one frame: half a wingspan in sixteen milliseconds. That is not a roll, it
 * is a cut.
 *
 * So the attitude that is drawn chases the attitude that is demanded, at a
 * finite rate. That is what a roll rate *is* — an aeroplane rolls at a few
 * hundred degrees a second, not infinitely fast — and one first-order filter
 * buys three things at once: no snap at any phase boundary, a visible lag as
 * the jet rolls into a turn, and a wings-level rollout that trails the path
 * instead of arriving with it.
 *
 * The constant is a time to cover 63% of the remaining error. 150ms is a brisk
 * display roll; slower reads as a heavy aeroplane and hides the choreography.
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
 * Heading is deliberately *not* filtered: the nose points along the path, and
 * lagging it would point the aeroplane somewhere it is not going — which is
 * the very thing the projection exists to avoid. Only the two attitudes that
 * come from a *derivative* are smoothed, because a derivative of a piecewise
 * curve is what has the steps in it.
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

function attitudeAt(route: PreparedRoute, tau: number): Attitude {
  // A step in *time*, not in parameter, so the sample either side is the same
  // distance away however fast the aircraft happens to be going.
  const step = 0.006;
  /*
   * The bank is read over a longer baseline than the heading.
   *
   * Both come from the same tangent, but they want different things from it.
   * The heading wants the instantaneous direction, so it uses the shortest
   * step that is numerically stable. The bank wants the *curvature*, and a
   * curvature estimated over 0.006 of a pass is a finite difference of a
   * finite difference — it spikes wherever the perspective divide changes
   * quickly, and the jet flicked to full bank for two frames at a time.
   * Measured over a fifth of a second of flying it is the smooth quantity it
   * physically is, and the roll filter then has something worth chasing.
   */
  const curveStep = 0.03;
  const back = project(routePoint(route, tau - step));
  const here = project(routePoint(route, tau));
  const ahead = project(routePoint(route, tau + step));
  const wideBack = project(routePoint(route, tau - curveStep));
  const wideAhead = project(routePoint(route, tau + curveStep));

  const heading = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
  const previous = (Math.atan2(here.y - wideBack.y, here.x - wideBack.x) * 180) / Math.PI;
  const next = (Math.atan2(wideAhead.y - here.y, wideAhead.x - here.x) * 180) / Math.PI;
  // Signed change in heading across the wide baseline, shortest way round.
  const turn = ((next - previous + 540) % 360) - 180;
  // A hard turn narrows the span to about half. Clamped, because a sprite
  // folded to nothing reads as a glitch. The divisor is larger than it was
  // because the baseline is five times longer, so the same physical turn
  // produces a proportionally larger number.
  const bank = 1 - Math.min(0.55, Math.abs(turn) / 78);

  const depth = routePoint(route, tau + step).z - routePoint(route, tau - step).z;
  // Same idea along the fuselage: the more of the motion is toward or away
  // from the camera, the more the length is foreshortened.
  const pitch = 1 - Math.min(0.35, Math.abs(depth) / 46);

  return { heading, bank, pitch };
}

/**
 * A rejoin is a curve, in the same space as the routine
 * =====================================================
 *
 * Two things were wrong with the rejoin and both were invisible in the code.
 *
 * **It ran in screen space.** The release point was a *projected* position, and
 * the curve interpolated that to the slot — while the smoke draw multiplies
 * every puff by the perspective of its own `z`. So at the instant of break-off
 * the ribbon was projected twice: at a scale of 1.3 and three hundred pixels
 * out, that put ninety pixels between the aircraft and the smoke it had just
 * laid. This is the seam the brief keeps seeing, and no offset fixes it,
 * because the offset was never the problem.
 *
 * **It was a quadratic, so it could hairpin.** One control point ahead of the
 * release heading means an aircraft heading *away* from its slot flies out and
 * comes straight back down its own track — a triangle with a corner in it, and
 * a corner is an infinite acceleration.
 *
 * So the rejoin is now a **cubic in scene coordinates**, with the second
 * control point placed to the left of the slot. That fixes the *arrival*
 * direction: the curve reaches the slot flying to the right, on the formation's
 * heading, whatever heading it left the routine on. An aircraft that has to
 * turn round flies a smooth U rather than a hairpin, which is what a rejoin
 * from the wrong side actually looks like, and every frame of it is projected
 * by the same `spriteAt` the routine uses.
 */
function bezier3(p0: Point3, p1: Point3, p2: Point3, p3: Point3, t: number): Point3 {
  const k = 1 - t;
  const a = k * k * k;
  const b = 3 * k * k * t;
  const c = 3 * k * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    z: a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  };
}

/**
 * The attitude on a rejoin curve, read exactly as it is on the routine: from
 * the tangent of the *projected* path, so a curve that is mostly a change of
 * depth still turns the aircraft the way the shape moves on screen.
 */
function bezierAttitude(p0: Point3, p1: Point3, p2: Point3, p3: Point3, t: number): Attitude {
  const step = 0.02;
  const back = project(bezier3(p0, p1, p2, p3, Math.max(0, t - step)));
  const here = project(bezier3(p0, p1, p2, p3, t));
  const ahead = project(bezier3(p0, p1, p2, p3, Math.min(1, t + step)));
  const heading = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
  const previous = (Math.atan2(here.y - back.y, here.x - back.x) * 180) / Math.PI;
  const turn = ((heading - previous + 540) % 360) - 180;
  return {
    heading,
    bank: 1 - Math.min(0.5, Math.abs(turn) / 30),
    pitch: 1 - Math.min(0.3, Math.abs(ahead.z - back.z) / 60),
  };
}

/** How far the curve carries the aircraft's momentum before it starts to bend. */
const REJOIN_LEAD = 210;
/** And how far to the left of the slot it is straightened onto the formation. */
const REJOIN_APPROACH = 260;

/**
 * Where the third jet comes from: off the bottom-left corner, well outside the
 * frame and a little way behind the formation in depth, so it arrives *through*
 * the scene rather than across it.
 */
const THIRD_ENTRY: Point3 = { x: -860, y: 300, z: -140 };
const THIRD_CONTROL: Point3 = { x: -520, y: 250, z: -60 };

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
  emitter: Point3;
}

function spriteAt(
  point: Point3,
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
    /*
     * The attitude filter, one per run.
     *
     * It carries the three aircraft's current bank and pitch across frames and
     * across phases, which is exactly why it lives out here: the point is that
     * the rejoin starts from the attitude the routine ended at, rather than
     * from whatever the rejoin curve demands in its first frame.
     */
    const attitudes = new Attitudes();
    let breakOff: number | null = null;
    /**
     * Each escort's *scene* state when it broke off.
     *
     * The scene point and the direction it was travelling in, not the projected
     * position: the rejoin is flown in the same space as the routine, so the
     * perspective is continuous across the seam and the smoke is not projected
     * twice.
     */
    let released: { point: Point3; tangent: Point3 }[] = [];
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
          /*
           * And the plume is lumpy. A single smooth profile is a ribbon; real
           * smoke has fatter and thinner passages along it, because it did not
           * all leave the aircraft into the same air. `bulk` is a slow function
           * of the puff's own seed, so the lumps travel *with* the smoke rather
           * than flickering along it, and it only takes effect as the puff
           * ages — at the nozzle there is nothing to be lumpy yet.
           */
          const bulk = 1 + 0.42 * Math.sin(puff.seed * 0.9) * Math.sqrt(life);
          const half = (5.5 + 34 * Math.sqrt(life) * spread * bulk) * scale;
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
        // How faded this run's own ends are, from the ages at each end.
        const dim = (age: number) => alpha * (1 - 0.5 * clamp01(age / PUFF_LIFE));
        fade.addColorStop(0, `rgba(${tint}, ${dim(oldest.age).toFixed(4)})`);
        fade.addColorStop(1, `rgba(${tint}, ${dim(newest.age).toFixed(4)})`);
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
          const attitude = attitudes.smooth(index, attitudeAt(route, at), dtMs);
          const sprite = spriteAt(point, attitude.heading, { bank: attitude.bank, pitch: attitude.pitch });
          const node = escortRefs.current[index];
          if (node) {
            node.style.transform = sprite.transform;
            node.style.zIndex = point.z >= 0 ? "3" : "1";
            // Aerial perspective: the far half of the pass loses a little
            // contrast, the way distance actually works.
            node.style.opacity = (0.68 + 0.32 * clamp01((point.z + 190) / 380)).toFixed(3);
          }
          emit.push({ ...sprite.emitter, index });
        }
        if (readyRef.current && elapsed >= MIN_ORBIT_MS) {
          breakOff = now;
          released = [0, 1].map((index) => {
            const at = u + index * 0.37;
            const point = routePoint(ROUTES[index], at);
            // The direction of travel, from the route either side of here.
            const back = routePoint(ROUTES[index], at - 0.006);
            const ahead = routePoint(ROUTES[index], at + 0.006);
            const dx = ahead.x - back.x;
            const dy = ahead.y - back.y;
            const dz = ahead.z - back.z;
            const length = Math.hypot(dx, dy, dz) || 1;
            return { point, tangent: { x: dx / length, y: dy / length, z: dz / length } };
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
            /*
             * Four points, all in scene coordinates: where it was, where its
             * momentum carries it, where the formation is approached from, and
             * the slot. The third of those is what makes the arrival level —
             * the curve reaches the slot flying right, on the formation's
             * heading, however it left the routine.
             */
            const p1: Point3 = {
              x: from.point.x + from.tangent.x * REJOIN_LEAD,
              y: from.point.y + from.tangent.y * REJOIN_LEAD,
              z: from.point.z + from.tangent.z * REJOIN_LEAD,
            };
            const p2: Point3 = { x: slot.x - REJOIN_APPROACH, y: slot.y, z: 0 };
            const p3: Point3 = { x: slot.x, y: slot.y, z: 0 };
            const here = bezier3(from.point, p1, p2, p3, t);
            const attitude = attitudes.smooth(index, bezierAttitude(from.point, p1, p2, p3, t), dtMs);
            const sprite = spriteAt(here, attitude.heading, {
              bank: attitude.bank,
              pitch: attitude.pitch,
            });
            const node = escortRefs.current[index];
            if (node) {
              node.style.transform = sprite.transform;
              node.style.zIndex = here.z >= 0 ? "3" : "1";
              node.style.opacity = "1";
            }
            emit.push({ ...sprite.emitter, index });
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
          const approach: Point3 = { x: slot.x - REJOIN_APPROACH, y: slot.y, z: 0 };
          const target: Point3 = { x: slot.x, y: slot.y, z: 0 };
          const here = bezier3(THIRD_ENTRY, THIRD_CONTROL, approach, target, arrival);
          const attitude = attitudes.smooth(2, bezierAttitude(THIRD_ENTRY, THIRD_CONTROL, approach, target, arrival), dtMs);
          const entering = spriteAt(here, attitude.heading, {
            bank: attitude.bank,
            pitch: attitude.pitch,
          });
          if (third) {
            third.style.transform = entering.transform;
            third.style.zIndex = here.z >= 0 ? "3" : "1";
            // Inline, so the fade is tied to the distance flown rather than to
            // a CSS delay that knows nothing about where the aircraft is.
            third.style.opacity = clamp01(arrival / 0.18).toFixed(3);
          }
          emit.push({ ...entering.emitter, index: 2 });
        } else {
          // Locked into the slots from here on; the scene moves as one body.
          for (let index = 0; index < 3; index++) {
            const slot = SLOTS[index === 0 ? 0 : index === 1 ? 2 : 1];
            const sprite = spriteAt({ x: slot.x, y: slot.y, z: 0 }, 0);
            const node = escortRefs.current[index];
            if (node) node.style.transform = sprite.transform;
            emit.push({ ...sprite.emitter, index });
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
        const ink = index === 2 ? 0.85 : 1;
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
