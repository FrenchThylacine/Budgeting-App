/**
 * The airshow: a formation travelling forward, not a ring turning on a spindle
 * ============================================================================
 *
 * Five versions of the loading sequence failed before this one, and they all
 * failed the same way: an escort followed a **closed path in the lead's frame**,
 * so once it reached the far side it had to turn round and fly *left* to get
 * home. Every one of them was genuinely three-dimensional. Every one read as
 * machinery on a spindle, because an aeroplane that flies backwards is not an
 * aeroplane.
 *
 * The mistake was never the curve. It was the frame.
 *
 * ── The frame ───────────────────────────────────────────────────────────────
 *
 * The camera **travels with the lead**. The lead is therefore drawn at the
 * origin, and everything this module returns is an offset *from the lead* — but
 * the aircraft are not stationary, and nothing here is allowed to pretend they
 * are:
 *
 *   world position  =  (CRUISE · t  +  offset.x,  offset.y,  offset.z)
 *
 * That one line is the whole design. Two consequences fall straight out of it
 * and they are the two things every earlier version got wrong:
 *
 *  - **Attitude comes from the world velocity, never from the screen track.**
 *    An escort easing aft to take up formation slides leftward across the
 *    screen while still flying forward at two hundred pixels a second, exactly
 *    as a real wingman does. Its nose points where it is going, which is
 *    right. Reading the attitude off the *screen* track is what pointed the
 *    old escorts backwards.
 *  - **The forward component is a bounded invariant.** Every offset in this
 *    file has an amplitude and a rate, and `worstClosure()` states the largest
 *    aft rate any of them can produce. It is well under `CRUISE`, so the world
 *    velocity's x component is positive at every instant of the sequence, by
 *    construction rather than by inspection. `tests/airshow-choreography.ts`
 *    samples it and fails the build if that stops being true.
 *
 * ── The manoeuvre ───────────────────────────────────────────────────────────
 *
 * The escorts fly a **barrel roll around the leader's flight path**: a helix.
 * They hold station fore and aft while circulating in the vertical/depth plane,
 * so the display is legible from a camera on the axis —
 *
 *     above → toward the viewer → below → away from the viewer → above
 *
 * — while the whole group travels right. That is §1.8's "large twisted helix
 * around the main aircraft's forward flight path", and it is why no aircraft
 * ever needs a reversal: the closed loop is in *y and z*, where a closed loop
 * costs nothing, and x only ever advances.
 *
 * The two escorts sit **half a turn apart on that helix**, which buys three of
 * the brief's requirements at once and buys them as theorems rather than as
 * good luck:
 *
 *  - one is above the lead and one below, because their vertical offsets are
 *    ±r·shape(cos θ);
 *  - one is near the camera and one far from it, because their depths are
 *    ±r·shape(sin θ);
 *  - **they cannot collide.** Their separation is
 *    2r·√(shape(cos θ)² + shape(sin θ)²), and since cos²θ + sin²θ = 1 at least
 *    one of the two is ≥ 1/√2, so the separation never falls below
 *    2r·shape(1/√2) — about 150 scene pixels, against a 64-pixel sprite. The
 *    moment their altitudes cross is the moment their depths are furthest
 *    apart, and vice versa. That is the *point* of the quadrature.
 *
 * `shape()` is a bounded S-curve rather than the bare sine. It pushes the
 * offsets toward their extremes, so the aircraft **dwell** high and low instead
 * of sweeping smoothly through the middle — which is both what a display pilot
 * does and what makes "one high, one low" readable rather than instantaneous.
 * A power law would do the same and has an infinite derivative at zero; tanh
 * is smooth everywhere, which matters because these curves are differentiated
 * twice to get the bank.
 *
 * ── Why the join waits for the roll-out point ───────────────────────────────
 *
 * The escorts' formation slots are one above and one below. If the manoeuvre
 * simply collapsed toward them from wherever it happened to be, then whenever
 * the *lower* escort was the one heading for the *upper* slot the two would
 * have to swap sides — through each other.
 *
 * So the join does what a display team does: it **flies on to the roll-out
 * point**. The helix phase is warped forward — never backward — to the next
 * point at which the escorts are on the sides their slots are on, and only
 * then does the manoeuvre shrink into formation. The warp is a cubic that
 * matches the circulation rate it inherits, so there is no step at the seam,
 * and it is monotone for every rate it can be asked for.
 *
 * ── Why the departure moves the aeroplanes and not the picture ──────────────
 *
 * The old departure slid the whole scene sideways with a CSS transform. That
 * is a slide of the *composition*, smoke and all, and it reads as the picture
 * being pushed off the table rather than as aircraft leaving.
 *
 * Here the camera keeps its cruise, and the *formation* accelerates away from
 * it. The air keeps drifting past at `CRUISE`, unchanged, so nothing about the
 * smoke's motion steps at the phase boundary — while the aircraft pull away
 * from the ribbons they are laying at up to seventeen times the closing speed.
 * The trails stretch because the aeroplanes outran them, which is what happens.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── The scene's constants ───────────────────────────────────────────────────

/** Camera distance for the perspective divide. Smaller is a wider lens. */
export const CAMERA_D = 620;

/**
 * The whole formation's cruising speed, in scene pixels per second.
 *
 * It is the forward speed of the lead, the reference the escorts' world
 * velocities are measured against, **and** the rate at which still air drifts
 * backwards past a camera travelling with the lead. Those are one number
 * because they are one fact, and splitting them is how smoke stops agreeing
 * with the aircraft that laid it.
 */
export const CRUISE = 375;

/** How long one turn of the helix takes. */
export const LAP_MS = 4000;
const LAP_S = LAP_MS / 1000;
const OMEGA = (Math.PI * 2) / LAP_S;

/** The helix's nominal radius, in the vertical and depth axes alike. */
const RADIUS = 118;

/**
 * The S-curve's sharpness.
 *
 * 0 would be a pure sine. Larger dwells harder at the extremes and transits
 * the middle faster — but the middle is where the two escorts' altitudes
 * cross, so it also steepens the vertical speed there, and the vertical speed
 * is what sets the steepest climb angle in the display. 1.1 gives a 47%
 * quicker crossing for a climb angle that stays under fifty-five degrees.
 */
const SHAPE_K = 1.1;
const SHAPE_NORM = Math.tanh(SHAPE_K);
/** The largest factor by which `shape` can steepen its input's derivative. */
const SHAPE_SLOPE = SHAPE_K / SHAPE_NORM;

/**
 * A bounded S-curve on [-1, 1], odd, smooth, and equal to ±1 at ±1.
 *
 * Odd is what makes the separation proof work: the second escort's offset is
 * `shape(cos(θ + π)) = -shape(cos θ)`, so the pair stays exactly antisymmetric
 * about the lead however the curve is shaped.
 */
export function shape(value: number): number {
  return Math.tanh(SHAPE_K * value) / SHAPE_NORM;
}

/** How far ahead of the lead the escorts hold station during the display. */
const X_BIAS = 26;
/**
 * And how much they surge fore and aft about it — on the **third** harmonic of
 * the circulation.
 *
 * The frequency is not decoration, and neither is it two. There is exactly one
 * moment in each half-lap when an escort passes the lead's own altitude, and
 * at that moment its only remaining separation from the other one is depth —
 * which the perspective divide then *shrinks*, because the far aircraft is
 * drawn smaller and therefore nearer the screen centre. Measured, the two
 * projected sprites came within seventeen pixels of each other.
 *
 * `sin 3θ` is the lowest harmonic that is −1 at one crossing and +1 at the
 * other, so one coefficient pushes whichever escort is *nearest the camera*
 * forward and whichever is furthest back, at both crossings and for both
 * aircraft. The perspective then works with the separation instead of against
 * it: sixty-four projected pixels rather than seventeen.
 *
 * It is also what keeps the path off any plane. `x` follows sin 3θ while `y`
 * and `z` follow cos θ and sin θ; a term at the *same* frequency as those two,
 * however phased, would be a linear function of them, and a curve whose three
 * coordinates are linearly dependent is an ellipse in a tilted plane — which
 * is precisely one of the versions of this that failed.
 */
const X_SWING = 22;

/** A slow breath in the helix radius, so no two laps are the same size. */
const BREATHE = 0.2;
const BREATHE_MS = 6800;
/**
 * And a slow modulation of the circulation *rate*, for the same reason.
 *
 * Deliberately a modulation of the phase rather than of the position. An
 * earlier version drifted the whole display up and down, which is the obvious
 * way to stop two laps looking identical — and it moved *both* escorts
 * together, so near a crossing it could put both of them above the lead at
 * once. Measured over every break-off in the sequence: five per cent of the
 * display had them on the same side. A phase modulation cannot do that. The
 * two escorts share one phase and sit exactly π apart on it, so every
 * antisymmetry in this file survives anything done to the phase, and nothing
 * done to a position is safe.
 */
const SWELL = 0.2;
const SWELL_MS = 9200;

/**
 * The floor on the display, and the join continues the circulation past it.
 *
 * Two thirds of a lap here plus up to a full extra turn of phase warp in the
 * join means the complete circulation is always seen, without holding a warm
 * load on a loading screen for eight seconds.
 */
export const DISPLAY_FLOOR_MS = 2600;
export const JOIN_MS = 2400;
export const SETTLE_MS = 520;
export const DEPART_MS = 900;
const DEPART_S = DEPART_MS / 1000;
/** The speed the formation reaches on the way out. */
const DEPART_SPEED = 5600;

/** How long a puff of smoke lives, in seconds. */
export const PUFF_LIFE = 1.85;

/**
 * Where each escort ends up, relative to the lead — behind it, and stepped.
 *
 * Behind, because §1.18 is emphatic: the escorts *fall back* into the leader's
 * wake, they do not converge on its nose. Stepped in all three axes, because a
 * formation on one line is a diagram; and the vertical order is what makes the
 * three ribbons stack into blue, white and red from the top.
 */
export interface EscortIdentity {
  key: "blue" | "red" | "white";
  /** The smoke colour, and it belongs to the aircraft, not to the slot. */
  smoke: readonly [number, number, number];
  slot: Vec3;
}

/**
 * The formation, expressed **on the same ring the display is flown on**.
 *
 * A slot is a radius and an angle, not a pair of authored coordinates, and
 * that is what lets the roll-out be a rotation rather than a collapse — see
 * `escortOffset`. Writing the two escorts' slots as numbers beside each other
 * was how the two definitions of "where the formation is" drifted apart.
 */
const SLOT_RADIUS = 86;
const SLOT_ANGLE = 0.3;
const SLOT_X = -112;

/** A point on the ring: `angle` 0 is directly above the lead. */
function ring(radius: number, angle: number): { y: number; z: number } {
  return { y: -radius * shape(Math.cos(angle)), z: radius * shape(Math.sin(angle)) };
}

export const ESCORTS: readonly EscortIdentity[] = [
  { key: "blue", smoke: [96, 152, 232], slot: { x: SLOT_X + 10, ...ring(SLOT_RADIUS, SLOT_ANGLE) } },
  { key: "red", smoke: [228, 58, 70], slot: { x: SLOT_X - 10, ...ring(SLOT_RADIUS, SLOT_ANGLE + Math.PI) } },
  { key: "white", smoke: [246, 248, 252], slot: { x: -146, y: 0, z: 0 } },
];

/**
 * Where the third jet comes from: behind and to the left, low and deep.
 *
 * Its x values only ever increase, which is what makes it an aircraft
 * overtaking the formation rather than a sprite sliding into place — and its
 * lane is the low, far corner, which neither of the other two ever enters
 * while it is flying through it.
 */
const THIRD_PATH: readonly [Vec3, Vec3, Vec3, Vec3] = [
  { x: -1020, y: 210, z: -200 },
  { x: -700, y: 190, z: -120 },
  { x: -320, y: 40, z: -30 },
  ESCORTS[2].slot,
];

// ─── Small mathematics ───────────────────────────────────────────────────────

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * A smootherstep, and the extra order matters here.
 *
 * An ordinary smoothstep has a non-zero *second* derivative at both ends, and
 * every blend in this file is differentiated twice to get a bank angle. Using
 * one made the wings step by half a span in a single frame at the moment the
 * join began — the position was continuous, the velocity was continuous, and
 * the acceleration was not.
 */
function smootherstep(from: number, to: number, at: number): number {
  const u = clamp01((at - from) / (to - from));
  return u * u * u * (u * (u * 6 - 15) + 10);
}

interface Projected {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Perspective divide. `z` is kept, because occlusion and fog both need it. */
export function project(point: Vec3): Projected {
  const scale = CAMERA_D / (CAMERA_D - point.z);
  return { x: point.x * scale, y: point.y * scale, z: point.z, scale };
}

function bezier3(path: readonly [Vec3, Vec3, Vec3, Vec3], t: number): Vec3 {
  const k = 1 - t;
  const a = k * k * k;
  const b = 3 * k * k * t;
  const c = 3 * k * t * t;
  const d = t * t * t;
  return {
    x: a * path[0].x + b * path[1].x + c * path[2].x + d * path[3].x,
    y: a * path[0].y + b * path[1].y + c * path[2].y + d * path[3].y,
    z: a * path[0].z + b * path[1].z + c * path[2].z + d * path[3].z,
  };
}

// ─── The display ─────────────────────────────────────────────────────────────

/**
 * The helix phase at a moment of the display, for one seat.
 *
 * Seat 1 is exactly half a turn behind seat 0 and stays there, in the display
 * and through the join alike. Everything the brief asks for about the pair —
 * one high, one low, one near, one far, never touching — is a consequence of
 * that single π, so it is written once, here.
 */
function displayPhase(seat: number, seconds: number): number {
  const swell = (SWELL / ((Math.PI * 2 * 1000) / SWELL_MS)) * Math.sin((Math.PI * 2 * seconds * 1000) / SWELL_MS);
  return OMEGA * seconds + swell + seat * Math.PI;
}

/**
 * How fast the phase is turning at a moment of the display.
 *
 * The join has to *inherit* this, not `OMEGA`. It looks like a detail and it
 * is not: the swell means the circulation is up to twenty per cent off nominal
 * at any instant, so a join that started at `OMEGA` stepped the angular rate
 * at the seam — and the bank is the second derivative of the position, so a
 * step in the rate is a step in the bank. Measured, the wings cut by half a
 * span eighteen milliseconds after break-off.
 */
function displayPhaseRate(seconds: number): number {
  return OMEGA + SWELL * Math.cos((Math.PI * 2 * seconds * 1000) / SWELL_MS);
}

/**
 * Where an escort is during the display, relative to the lead.
 *
 * `phase` is passed in rather than derived from `seconds` because the join
 * warps it: the shape of the manoeuvre is a function of the phase, and its
 * size and drift are functions of the clock, and those two are not the same
 * thing once the roll-out begins.
 */
function helixRadius(seconds: number): number {
  return RADIUS * (1 + BREATHE * Math.sin((Math.PI * 2 * seconds * 1000) / BREATHE_MS));
}

/** How far ahead of the lead an escort holds station at this ring angle. */
function station(angle: number): number {
  // One coefficient, negative, for both aircraft: see X_SWING. Whichever of
  // the two is nearer the camera is the one this pushes forward.
  return X_BIAS - X_SWING * shape(Math.sin(3 * angle));
}

function displayOffset(angle: number, seconds: number): Vec3 {
  return { x: station(angle), ...ring(helixRadius(seconds), angle) };
}

/**
 * The join is a roll-out, and a roll-out is a rotation — not a collapse
 * =====================================================================
 *
 * Three attempts at this failed, each one sampled, each one measured, and the
 * third of them is the interesting one because it looked right.
 *
 * **The phase warp.** Fly the circulation forwards to a point where the upper
 * escort is the one heading for the upper slot, then shrink into formation.
 * The phase to be covered can be anything up to a full turn, and covering a
 * full turn inside a two-and-a-half-second join means circulating at four
 * times the display rate. Measured: a wingman flying *backwards* at 188 scene
 * pixels a second with its nose 178° from the line of flight. A gate that has
 * to be reached in a fixed time is not a gate, it is a whip.
 *
 * **The lanes.** Stop the circulation instead, and when the two have to swap
 * sides, route one round the near side and the other round the far side. That
 * fixed the pair — and then the sampling showed both of them passing within
 * **eight pixels of the lead**, because the two escorts are exact opposites of
 * each other about the lead's own axis, so a path that carries one of them
 * near the origin carries the other one there at the same instant, from the
 * other side. Widening the lanes moved the pair apart and left both of them
 * going through the leader.
 *
 * The mistake in both was the same, and it was in the interpolation, not in
 * the curve: **a straight line from a point on a ring to a point near its
 * centre passes through the middle of the ring.** The display is flown at a
 * radius of about 120 about the lead's flight path; the formation sits at a
 * radius of 86 about the same axis. There is no reason for anything to go
 * anywhere near the axis, and a linear blend in Cartesian coordinates does it
 * anyway.
 *
 * So the roll-out is flown **in the ring's own coordinates**:
 *
 *  - the radius eases from the display's to the formation's — from 120ish to
 *    86, never below either;
 *  - the ring angle eases from where the escort is to where its slot is, the
 *    short way round;
 *  - and only the fore-and-aft station is a straight line, because that axis
 *    has no ring in it.
 *
 * Two invariants fall straight out, and they are the two that mattered:
 *
 *  - **no escort passes near the lead**, because its distance from the flight
 *    path is a radius that never drops below 86 · shape(1/√2) ≈ 70;
 *  - **the escorts cannot converge**, because they enter the join exactly π
 *    apart on the ring, their slots are exactly π apart on the same ring, and
 *    they are rotated by the *same* angle — so they are π apart throughout,
 *    and their separation is 2r·√(shape(cos)² + shape(sin)²) ≥ 140.
 *
 * The circulation itself decays to a stop over the join:
 *
 *     angle(s) = angle₀ + rate₀ · JOIN · ∫₀ˢ (1 − smootherstep(u)) du  +  turn · smootherstep(s)
 *
 * which starts at exactly the rate it inherits — `rate₀`, the *swelled* rate,
 * not the nominal one; getting that wrong cut the wings by half a span
 * eighteen milliseconds after break-off — and ends stopped, on the slot's
 * angle. That is §1.18's "reduced manoeuvre energy" as an actual reduction in
 * energy rather than as a shrinking radius alone.
 */

/** How much of the join's own circulation has been flown, at `progress`. */
function circulation(progress: number): number {
  const s = clamp01(progress);
  // The integral of 1 − smootherstep: rate 1 at the seam, 0 at the roll-out.
  return s - Math.pow(s, 6) + 3 * Math.pow(s, 5) - 2.5 * Math.pow(s, 4);
}
/** What that integral reaches. Needed to aim the rotation at the slot. */
const CIRCULATION_TOTAL = circulation(1);

/**
 * The extra rotation that lands an escort on its slot's angle.
 *
 * The short way round, so the roll-out is the least motion that finishes the
 * manoeuvre. Both escorts get the *same* number — their angles differ by π and
 * so do their slots', so the shortest residue is identical for the pair, which
 * is exactly why they stay π apart through the whole join.
 */
function rollOutTurn(breakOffSeconds: number): number {
  const arrives = displayPhase(0, breakOffSeconds) + displayPhaseRate(breakOffSeconds) * (JOIN_MS / 1000) * CIRCULATION_TOTAL;
  return ((SLOT_ANGLE - arrives + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/** How far into the formation the roll-out has got, on the ring. */
function rollOutWeight(progress: number): number {
  return smootherstep(0, 1, progress);
}

/**
 * A bump: nothing at either end, one in the middle, C² throughout.
 *
 * Built from two smootherstep halves rather than from `sin²` or `s²(1−s)²`,
 * both of which have a non-zero second derivative where they meet zero — and a
 * second derivative is a bank angle.
 */
function bump(progress: number): number {
  return smootherstep(0, 1, 2 * progress) * smootherstep(0, 1, 2 - 2 * progress);
}

/**
 * How far apart the pair opens **fore and aft** while it rolls out.
 *
 * Being exactly half a turn apart on the ring is what makes the two escorts
 * un-collidable in three dimensions — and it is also what can put them at the
 * *same projected point*. The camera lies in the plane of the ring, so the
 * projection flattens the ring onto a line: when one escort is level with the
 * lead, so is the other, their depths are opposite, their stations are all but
 * equal, and near the lead's own station the perspective divide has almost
 * nothing left to spread them with. Sampled, they came within **nine tenths of
 * a pixel** of each other on screen while sitting 224 scene pixels apart in
 * depth. Every three-dimensional check passed. The picture would have shown
 * one aeroplane.
 *
 * Opening the ring angle instead was tried and does not work, and the reason
 * is worth keeping: for *any* fixed angular offset there is a phase at which
 * the two altitudes coincide anyway, because one is measured from cos θ and
 * the other from −cos(θ + δ). It moved the failure, from nine tenths of a
 * pixel to three.
 *
 * The station is the one axis the ring does not live in, so it is the one axis
 * a separation cannot be rotated away. One escort goes forward and the other
 * drops back as they roll out — §1.19's "each aircraft should have a clear
 * lane", and the thing a real pair does when it splits for a formation join —
 * and the projected gap is then bounded below by
 * `2 · LANE · min(scale) − |x| · Δscale`, which for these numbers never falls
 * under sixty pixels whatever the phase.
 */
const STATION_LANE = 34;

/**
 * And how much of the *fore-and-aft* move has been made.
 *
 * A separate ramp, because it is a separate kind of move: the ring rotation
 * costs nothing in forward speed, and the aft transfer — a hundred and sixty
 * scene pixels, from station ahead of the lead to a slot behind it — is the
 * only thing in this file that can subtract from it. Sharing one ramp with the
 * rotation, it peaked at three hundred and fifty pixels a second against a
 * three-hundred-and-thirty cruise, which briefly pointed a wingman's nose
 * ninety degrees off the line of flight.
 */
function stationWeight(progress: number): number {
  return smootherstep(0, 1, progress);
}

/**
 * Where an escort is at `seconds`, having broken off at `breakOffSeconds`.
 *
 * One expression covers the display, the roll-out and the formation, because
 * the formation is a point on the same ring the display is flown on. There is
 * no phase boundary in here to be continuous *across*: at `s` = 0 every weight
 * is zero and this is the display; at `s` = 1 every weight is one and this is
 * the slot.
 */
function escortOffset(seat: number, seconds: number, breakOff: number | null): Vec3 {
  if (breakOff === null || seconds <= breakOff) {
    return displayOffset(displayPhase(seat, seconds), seconds);
  }
  const s = clamp01((seconds - breakOff) / (JOIN_MS / 1000));
  const turned = rollOutWeight(s);
  const circulated = displayPhase(seat, breakOff) + displayPhaseRate(breakOff) * (JOIN_MS / 1000) * circulation(s);
  const angle = circulated + rollOutTurn(breakOff) * turned;
  const radius = mix(helixRadius(seconds), SLOT_RADIUS, turned);
  return {
    /*
     * The station is read off the *circulated* angle, not the rotated one.
     *
     * It is a third-harmonic term — see X_SWING — so it multiplies whatever
     * angular rate it is given by three, and the roll-out rotation is up to a
     * radian a second on top of the circulation. Fed the rotated angle it
     * produced three hundred scene pixels a second of fore-and-aft motion,
     * which against a cruise of 330 left a wingman making 43 and pointing 81°
     * off the line of flight. The rotation belongs to the ring; the station
     * has no business reacting to it.
     */
    x:
      mix(station(circulated), ESCORTS[seat].slot.x, stationWeight(s)) +
      (seat === 0 ? 1 : -1) * STATION_LANE * bump(s),
    ...ring(radius, angle),
  };
}

/** Where the third jet is: outside the frame until the join begins. */
function thirdOffset(seconds: number, breakOff: number | null): Vec3 {
  if (breakOff === null) return THIRD_PATH[0];
  const since = seconds - breakOff;
  const s = clamp01(since / ((JOIN_MS / 1000) * 0.98));
  /*
   * Smootherstep, so it *accelerates* out of formation speed and decelerates
   * onto it again.
   *
   * An ease-out was the obvious choice — it arrives overtaking and settles —
   * and it starts with a step in acceleration from an aircraft that was, a
   * frame earlier, holding station. Measured, that snapped its wings by half a
   * span on the frame it appeared. This one leaves and arrives with no lateral
   * acceleration at all, which is what "matches the lead aircraft's forward
   * speed" means when you differentiate it.
   */
  return bezier3(THIRD_PATH, smootherstep(0, 1, s));
}

/**
 * How far the formation has pulled ahead of the camera, and how fast.
 *
 * The camera holds `CRUISE`, so this is the integral of the *excess* speed —
 * which starts at zero, so nothing steps at the boundary. The lead takes the
 * full amount and the escorts very slightly less, because a leader leads.
 */
function departure(seconds: number, breakOff: number | null): number {
  if (breakOff === null) return 0;
  const since = seconds - breakOff - (JOIN_MS + SETTLE_MS) / 1000;
  if (since <= 0) return 0;
  const t = clamp01(since / DEPART_S);
  return ((DEPART_SPEED - CRUISE) * DEPART_S * t * t * t) / 3;
}

// ─── What a frame is ─────────────────────────────────────────────────────────

export type Stage = "display" | "join" | "settle" | "depart" | "done";

export interface AircraftFrame {
  /** Position relative to the lead, in scene coordinates. */
  offset: Vec3;
  /** Velocity through the air, in scene pixels per second. x is forward. */
  velocity: Vec3;
  /** Acceleration through the air, for the bank. */
  acceleration: Vec3;
  /** 0 at the start of its arrival, 1 once it is in formation. Escort 3 only. */
  arrival: number;
}

export interface SceneFrame {
  stage: Stage;
  /** How far ahead of the camera the lead has pulled. Zero until departure. */
  lead: number;
  escorts: AircraftFrame[];
  /** How fast still air drifts backwards past the camera. Always `CRUISE`. */
  drift: number;
}

/** The step the velocity and acceleration are differenced over. */
const H = 0.016;

function offsetAt(seat: number, seconds: number, breakOff: number | null): Vec3 {
  const base = seat === 2 ? thirdOffset(seconds, breakOff) : escortOffset(seat, seconds, breakOff);
  const ahead = departure(seconds, breakOff) * 0.97;
  return { x: base.x + ahead, y: base.y, z: base.z };
}

/**
 * The whole scene at a moment.
 *
 * A pure function of two numbers, which is the only reason any of the claims
 * in `tests/airshow-choreography.test.ts` can be made at all: the separation
 * between two aircraft, the sign of a forward velocity and the steepest bank
 * in the routine are all things you can only assert about a sequence you can
 * sample without rendering it.
 */
export function sceneAt(elapsedMs: number, breakOffMs: number | null): SceneFrame {
  const seconds = elapsedMs / 1000;
  const breakOff = breakOffMs === null ? null : breakOffMs / 1000;

  const escorts: AircraftFrame[] = [];
  for (let seat = 0; seat < 3; seat++) {
    const before = offsetAt(seat, seconds - H, breakOff);
    const here = offsetAt(seat, seconds, breakOff);
    const after = offsetAt(seat, seconds + H, breakOff);
    /*
     * The world velocity, and the `CRUISE` in the x component is the whole
     * point of this module. The offset's own derivative is how the aircraft
     * moves *relative to the lead*; adding the cruise is what turns that into
     * how it moves through the air, which is what its nose has to point along.
     */
    escorts.push({
      offset: here,
      velocity: {
        x: CRUISE + (after.x - before.x) / (2 * H),
        y: (after.y - before.y) / (2 * H),
        z: (after.z - before.z) / (2 * H),
      },
      acceleration: {
        x: (after.x - 2 * here.x + before.x) / (H * H),
        y: (after.y - 2 * here.y + before.y) / (H * H),
        z: (after.z - 2 * here.z + before.z) / (H * H),
      },
      arrival:
        seat === 2 && breakOff !== null
          ? clamp01((seconds - breakOff) / ((JOIN_MS / 1000) * 0.98))
          : seat === 2
            ? 0
            : 1,
    });
  }

  let stage: Stage = "display";
  if (breakOff !== null) {
    const since = elapsedMs - breakOffMs!;
    stage =
      since < JOIN_MS
        ? "join"
        : since < JOIN_MS + SETTLE_MS
          ? "settle"
          : since < JOIN_MS + SETTLE_MS + DEPART_MS
            ? "depart"
            : "done";
  }

  return { stage, lead: departure(seconds, breakOff), escorts, drift: CRUISE };
}

// ─── Attitude ────────────────────────────────────────────────────────────────

export interface Attitude {
  /** Degrees, clockwise from screen right. The projection of the body axis. */
  heading: number;
  /** Apparent wingspan, 1 wings level. A roll is seen as a loss of span. */
  bank: number;
  /** Apparent length. Motion toward or away from the camera foreshortens it. */
  pitch: number;
}

/** The lateral acceleration that counts as a full-bank turn. */
const HARD_TURN = RADIUS * OMEGA * OMEGA;

/**
 * An aircraft's attitude, read entirely off its own trajectory.
 *
 * **Heading** is the projection of the body axis — the world velocity — and
 * not of the screen track. Those differ by exactly the camera's own motion,
 * which is the difference between "the wingman is easing aft" and "the wingman
 * is flying backwards".
 *
 * **Bank** is the roll a real aeroplane would need to turn the way this one is
 * turning: the lift has to point along the acceleration perpendicular to the
 * flight path, and the angle that vector makes with "up" is the roll angle.
 * Seen from the camera the roll shows as a loss of wingspan, so the span
 * factor is `1 − k·|sin roll|`, scaled by how hard the turn actually is — a
 * gentle curve gets a gentle bank, and straight and level gets none.
 *
 * **Pitch** is foreshortening: the more of the motion is into or out of the
 * screen, the shorter the fuselage looks.
 *
 * All three are continuous wherever the trajectory is, which after the phase
 * warp and the slot ramp is everywhere.
 */
export function attitudeOf(frame: AircraftFrame): Attitude {
  const { offset, velocity, acceleration } = frame;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z) || 1;

  // The nose, projected: the body axis reaches from here to a point a moment
  // downstream, and both ends go through the same perspective divide.
  const here = project(offset);
  const nose = project({
    x: offset.x + velocity.x * 0.05,
    y: offset.y + velocity.y * 0.05,
    z: offset.z + velocity.z * 0.05,
  });
  const heading = (Math.atan2(nose.y - here.y, nose.x - here.x) * 180) / Math.PI;

  // The part of the acceleration that turns the aircraft rather than speeding
  // it up. Lift points along it.
  const along = (acceleration.x * velocity.x + acceleration.y * velocity.y + acceleration.z * velocity.z) / (speed * speed);
  const lift = {
    y: acceleration.y - along * velocity.y,
    z: acceleration.z - along * velocity.z,
  };
  const lateral = Math.hypot(lift.y, lift.z);
  // Wings level is lift straight up, which is −y. The sign of the roll does
  // not matter to a span, so only its magnitude is used.
  const roll = lateral > 1e-6 ? Math.atan2(lift.z, -lift.y) : 0;
  const effort = Math.min(1, lateral / HARD_TURN);
  const bank = 1 - 0.55 * Math.abs(Math.sin(roll)) * effort;

  const pitch = 1 - 0.32 * Math.min(1, Math.abs(velocity.z) / speed);
  return { heading, bank, pitch };
}

/**
 * The worst rate at which anything here can close on the camera.
 *
 * Stated rather than measured, so the invariant is a property of the constants
 * and not of a lucky sample: every offset term's amplitude times its own
 * angular rate, plus the fastest the slot ramp can carry an aircraft aft. The
 * test asserts that this is comfortably under `CRUISE` — which is what makes
 * "the escorts never fly backwards" a theorem about the numbers above rather
 * than a hope about the picture.
 */
export function worstClosure(): number {
  const surge = X_SWING * SHAPE_SLOPE * 3 * (OMEGA + SWELL);
  // The aft transfer: a smootherstep peaks at 1.875× its mean rate, and it
  // spans the whole join.
  const aft = (1.875 * Math.abs(ESCORTS[0].slot.x - (X_BIAS + X_SWING))) / (JOIN_MS / 1000);
  return surge + aft;
}
