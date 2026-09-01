import { describe, expect, it } from "vitest";
import {
  CRUISE,
  DEPART_MS,
  DISPLAY_FLOOR_MS,
  ESCORTS,
  JOIN_MS,
  LAP_MS,
  SETTLE_MS,
  attitudeOf,
  project,
  sceneAt,
  shape,
  worstClosure,
} from "../src/domain/airshow";
import type { Vec3 } from "../src/domain/airshow";

/**
 * The airshow, sampled rather than described
 * ==========================================
 *
 * Every previous version of this animation was correct in prose and wrong on
 * the screen, and the reason was always the same: nothing sampled it. A
 * comment saying "the escorts never fly backwards" is a claim about a hundred
 * thousand frames, and a claim about a hundred thousand frames is a test.
 *
 * So this walks the whole sequence — **every break-off phase**, because the
 * routine breaks off whenever the application happens to be ready and the
 * geometry at that instant is the input to everything that follows — and
 * asserts the brief's requirements as numbers:
 *
 *   §1.2  the aircraft never point left
 *   §1.4  one escort above the lead and one below, at every instant
 *   §1.5  one near the camera and one far from it
 *   §1.6  no two aircraft ever converge
 *   §1.11 sampled densely, in 3D *and* projected
 *   §1.12 attitude follows velocity
 *   §1.13 a finite turn rate
 *   §1.18 the escorts fall back *behind* the lead
 *   §1.23 the formation flies out to the right
 *
 * The step is eight milliseconds, half a rendered frame at 60Hz, because a
 * sample that spans several drawn frames cannot tell a smooth roll from a cut.
 * That lesson cost this repository three passes.
 */

const END = JOIN_MS + SETTLE_MS + DEPART_MS;
const STEP = 8;
/** Break-offs across a full lap, so every phase of the display is tried. */
const BREAK_OFFS: number[] = [];
for (let at = DISPLAY_FLOOR_MS; at <= DISPLAY_FLOOR_MS + LAP_MS; at += 31) BREAK_OFFS.push(at);

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const signedHeading = (degrees: number) => ((degrees + 540) % 360) - 180;

/** Walk the whole sequence once per break-off, handing each frame to `visit`. */
function walk(visit: (frame: ReturnType<typeof sceneAt>, at: number, breakOff: number | null) => void): void {
  for (const breakOff of BREAK_OFFS) {
    for (let at = 0; at <= breakOff + END; at += STEP) {
      const broken = at >= breakOff ? breakOff : null;
      visit(sceneAt(at, broken), at, broken);
    }
  }
}

/** The same walk, but only over the display, which does not depend on break-off. */
function walkDisplay(visit: (frame: ReturnType<typeof sceneAt>, at: number) => void): void {
  for (let at = 0; at <= DISPLAY_FLOOR_MS + LAP_MS * 2; at += STEP) visit(sceneAt(at, null), at);
}

describe("the display", () => {
  it("keeps one Alpha Jet above the lead and one below it, always", () => {
    /*
     * §1.4, and it is a theorem rather than a sample: the two escorts sit
     * exactly π apart on the ring, and the ring's vertical coordinate is an
     * *odd* function of the angle, so their altitudes are exact opposites.
     * They can only be on the same side of the lead if both are at zero, and
     * that is the one instant at which their depth separation is greatest.
     *
     * An earlier version drifted the whole display up and down for variety and
     * broke this on five per cent of frames, which is why it is asserted at
     * all rather than assumed from the algebra.
     */
    let sameSide = 0;
    let clearlySplit = 0;
    let total = 0;
    walkDisplay((frame) => {
      const [blue, red] = frame.escorts;
      total += 1;
      if (blue.offset.y * red.offset.y > 0) sameSide += 1;
      if (Math.abs(blue.offset.y - red.offset.y) > 120) clearlySplit += 1;
    });
    expect(sameSide).toBe(0);
    // And the split is *legible*, not merely non-zero, for most of the lap.
    expect(clearlySplit / total).toBeGreaterThan(0.6);
  });

  it("keeps one Alpha Jet in front of the other in depth", () => {
    // §1.5. The depth separation is in quadrature with the vertical one, so it
    // is widest exactly when the altitudes cross and vice versa.
    let clearlySplit = 0;
    let total = 0;
    walkDisplay((frame) => {
      const [blue, red] = frame.escorts;
      total += 1;
      if (Math.abs(blue.offset.z - red.offset.z) > 120) clearlySplit += 1;
    });
    expect(clearlySplit / total).toBeGreaterThan(0.6);
  });

  it("passes each escort both behind and in front of the lead", () => {
    // §1.15: occlusion is the strongest depth cue there is, and it is only
    // available if the depth actually changes sign.
    let behind = false;
    let ahead = false;
    walkDisplay((frame) => {
      for (const escort of frame.escorts.slice(0, 2)) {
        if (escort.offset.z < -60) behind = true;
        if (escort.offset.z > 60) ahead = true;
      }
    });
    expect(behind && ahead).toBe(true);
  });

  it("is not a plane: no two of the three axes determine the third", () => {
    /*
     * §1.3. A curve whose coordinates are three sinusoids of the *same*
     * frequency is an ellipse in a tilted plane however it is phased — which
     * is one of the versions of this that failed. The station term runs at the
     * third harmonic, so the curve does not lie in any plane.
     *
     * Measured by fitting the best plane through a lap and asking how far the
     * curve leaves it. A planar curve gives nought.
     */
    const points: Vec3[] = [];
    for (let at = 0; at < LAP_MS; at += 10) points.push(sceneAt(at, null).escorts[0].offset);
    const mean = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length, z: sum.z + p.z / points.length }), { x: 0, y: 0, z: 0 });
    // The smallest principal axis of the covariance is the plane's normal, and
    // its eigenvalue is the mean square departure from the plane. Found by
    // inverse iteration, which is four lines and enough for three dimensions.
    const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of points) {
      const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] += (d[i] * d[j]) / points.length;
    }
    // Power-iterate on the largest, deflate twice, and the remainder is the
    // out-of-plane variance.
    const trace = c[0] + c[4] + c[8];
    let vector = [0.3, 0.5, 0.81];
    for (let step = 0; step < 400; step++) {
      // (trace·I − C) has the *smallest* eigenvalue of C as its largest.
      const next = [0, 1, 2].map((i) => trace * vector[i] - (c[i * 3] * vector[0] + c[i * 3 + 1] * vector[1] + c[i * 3 + 2] * vector[2]));
      const norm = Math.hypot(next[0], next[1], next[2]);
      vector = next.map((v) => v / norm);
    }
    const outOfPlane = Math.sqrt(
      [0, 1, 2].reduce((sum, i) => sum + vector[i] * (c[i * 3] * vector[0] + c[i * 3 + 1] * vector[1] + c[i * 3 + 2] * vector[2]), 0),
    );
    // Scene pixels of departure from the best-fitting plane, RMS.
    expect(outOfPlane).toBeGreaterThan(12);
  });
});

describe("the whole sequence", () => {
  it("never lets an aircraft fly backwards", () => {
    /*
     * §1.2, and the single most important assertion in this file. The failure
     * it guards against is not exotic: every earlier version of this animation
     * had the escorts reach the far side of a closed path and turn round.
     *
     * Two claims, because one of them can hold while the other fails. The
     * *velocity* must keep a strong forward component, and the *drawn nose*
     * must stay on the right-hand side — the second is what a reader sees, and
     * it is computed through the perspective divide rather than from the
     * velocity directly.
     */
    let slowest = Infinity;
    let mostSideways = 0;
    walk((frame, _at, broken) => {
      for (const [seat, escort] of frame.escorts.entries()) {
        if (seat === 2 && broken === null) continue;
        slowest = Math.min(slowest, escort.velocity.x);
        mostSideways = Math.max(mostSideways, Math.abs(signedHeading(attitudeOf(escort).heading)));
      }
    });
    expect(slowest).toBeGreaterThan(CRUISE * 0.3);
    // Comfortably inside a right angle: a nose past 90° is one pointing left.
    expect(mostSideways).toBeLessThan(75);
  });

  it("states the worst closure as a property of the constants", () => {
    // Not a sample: the amplitudes and rates in the module, added up. If a
    // constant is ever changed to something the cruise cannot absorb, this
    // fails before any frame is drawn.
    expect(worstClosure()).toBeLessThan(CRUISE);
  });

  it("never lets two aircraft converge", () => {
    /*
     * §1.6 and §1.11. Every pair, every eight milliseconds, at every break-off
     * — in three dimensions and again as the reader sees them.
     *
     * The projected check is the one that earns its place. It found the surge
     * frequency, where the two escorts sat 236 scene pixels apart in depth and
     * seventeen pixels apart on the screen, because the perspective divide
     * draws the far one smaller and therefore nearer the middle.
     *
     * It is also the check that has to state what the brief actually asks for
     * rather than the easy version of it. §1.6 permits two projected positions
     * to become similar **when the depth difference is clearly legible**, and
     * forbids silhouettes that almost touch. Those are not the same rule, and
     * the difference is a real manoeuvre: the opposition pass, where the pair
     * crosses the leader's own station from opposite sides — one drawn behind
     * the lead's two-hundred-pixel silhouette and one in front of it, at
     * scales of 0.85 and 1.25. The two aeroplanes are nowhere near each other;
     * the *lead* is between them; and no reader could mistake it for one
     * aircraft. Refusing it would mean refusing the shot the whole depth
     * treatment exists to produce.
     *
     * So a close projected approach is allowed only when it is that, proved
     * three ways, and it is 0.2% of the sequence.
     */
    let closest = Infinity;
    let closeApproaches = 0;
    let unexplained = 0;
    let pairs = 0;
    walk((frame, _at, broken) => {
      const live = broken === null ? frame.escorts.slice(0, 2) : frame.escorts;
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const one = live[i].offset;
          const other = live[j].offset;
          pairs += 1;
          closest = Math.min(closest, distance(one, other));
          const a = project(one);
          const b = project(other);
          if (Math.hypot(a.x - b.x, a.y - b.y) >= 52) continue;
          closeApproaches += 1;
          const oppositeSides = one.z * other.z < 0 && Math.abs(one.z - other.z) > 150;
          const acrossTheLead = Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y)) < 105;
          const wellApart = distance(one, other) > 150;
          if (!(oppositeSides && acrossTheLead && wellApart)) unexplained += 1;
        }
      }
    });
    // The escort artwork is 64 pixels.
    expect(closest).toBeGreaterThan(90);
    expect(unexplained).toBe(0);
    // And the exception stays an exception rather than becoming the routine.
    expect(closeApproaches / pairs).toBeLessThan(0.01);
  });

  it("never lets an escort fly through the lead", () => {
    /*
     * The defect the polar roll-out exists to fix. The escorts display *ahead*
     * of the lead and form up *behind* it, so every one of them crosses the
     * leader's own station — and a straight line from a point on a ring to a
     * point near its centre goes through the middle. Sampled, that passed
     * within eight pixels of the lead aircraft.
     */
    let closest = Infinity;
    walk((frame, _at, broken) => {
      const live = broken === null ? frame.escorts.slice(0, 2) : frame.escorts;
      for (const escort of live) {
        closest = Math.min(closest, Math.hypot(escort.offset.x - frame.lead, escort.offset.y, escort.offset.z));
      }
    });
    expect(closest).toBeGreaterThan(80);
  });

  it("rolls at a finite rate", () => {
    /*
     * §1.13, measured through the same first-order roll filter the renderer
     * applies — because a demand is not a wing position. The filter's time
     * constant is what makes an impossible demand a possible roll, and the
     * assertion is on what is drawn.
     */
    const TAU = 150;
    let worstStep = 0;
    for (const breakOff of BREAK_OFFS) {
      const drawn = [1, 1, 1];
      for (let at = 0; at <= breakOff + END; at += STEP) {
        const frame = sceneAt(at, at >= breakOff ? breakOff : null);
        for (const [seat, escort] of frame.escorts.entries()) {
          if (seat === 2 && at < breakOff) continue;
          const k = 1 - Math.exp(-STEP / TAU);
          const next = drawn[seat] + (attitudeOf(escort).bank - drawn[seat]) * k;
          if (at > breakOff - 400) worstStep = Math.max(worstStep, Math.abs(next - drawn[seat]));
          drawn[seat] = next;
        }
      }
    }
    // Per eight milliseconds; the browser harness asserts the same thing per
    // rendered frame, against the pixels.
    expect(worstStep).toBeLessThan(0.06);
  });

  it("never swings its nose faster than an aeroplane can", () => {
    /*
     * §1.13's other half. The bank is filtered, so a jumpy demand still draws
     * a smooth roll — the heading is deliberately *not*, because a lagged nose
     * points where the aircraft is not going. So the heading has to be smooth
     * at source, and this is what says so: the largest change between two
     * eight-millisecond samples, over every aircraft and every break-off.
     *
     * It is the assertion that would catch a phase boundary being crossed with
     * a step in velocity, which is the shape every "it snapped" defect in this
     * animation has had.
     */
    let worst = 0;
    for (const breakOff of BREAK_OFFS) {
      const previous = [Number.NaN, Number.NaN, Number.NaN];
      for (let at = 0; at <= breakOff + END; at += STEP) {
        const frame = sceneAt(at, at >= breakOff ? breakOff : null);
        for (const [seat, escort] of frame.escorts.entries()) {
          if (seat === 2 && at < breakOff) continue;
          const heading = signedHeading(attitudeOf(escort).heading);
          if (Number.isFinite(previous[seat])) {
            worst = Math.max(worst, Math.abs(signedHeading(heading - previous[seat])));
          }
          previous[seat] = heading;
        }
      }
    }
    // Degrees per eight milliseconds. Ten is 1,250°/s, which no aeroplane
    // does; six is a brisk display pitch rate and this stays under it.
    expect(worst).toBeLessThan(6);
  });

  it("banks into the turns and returns to level", () => {
    let deepest = 1;
    let shallowest = 0;
    walk((frame, _at, broken) => {
      for (const [seat, escort] of frame.escorts.entries()) {
        if (seat === 2 && broken === null) continue;
        const { bank } = attitudeOf(escort);
        deepest = Math.min(deepest, bank);
        shallowest = Math.max(shallowest, bank);
      }
    });
    expect(deepest).toBeLessThan(0.8);
    expect(shallowest).toBeGreaterThan(0.98);
  });
});

describe("the formation", () => {
  it("puts every escort behind the lead, not beside its nose", () => {
    // §1.18 and §1.21: they fall *back*.
    for (const escort of ESCORTS) expect(escort.slot.x).toBeLessThan(-90);
    // Stepped in all three axes rather than strung along one line.
    const ys = ESCORTS.map((e) => e.slot.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThan(40);
    expect(ys[2] - ys[1]).toBeGreaterThan(40);
    expect(new Set(ESCORTS.map((e) => e.slot.z)).size).toBe(3);
    // Blue above, white through the middle, red below: the tricolour, top to
    // bottom, and it is the slot order that produces it.
    expect(ESCORTS.map((e) => e.key)).toEqual(["blue", "red", "white"]);
    expect(ESCORTS[0].slot.y).toBeLessThan(ESCORTS[2].slot.y);
    expect(ESCORTS[2].slot.y).toBeLessThan(ESCORTS[1].slot.y);
  });

  it("flies the third jet in from behind and to the left", () => {
    // §1.20, and the assertion that matters is that it *travels*: it used to
    // be placed 210 pixels from its slot and slid in.
    const frame = sceneAt(DISPLAY_FLOOR_MS, DISPLAY_FLOOR_MS);
    expect(frame.escorts[2].offset.x).toBeLessThan(-700);
    expect(frame.escorts[2].offset.y).toBeGreaterThan(100);

    // And that its station only ever advances — an overtake, never a reversal.
    let previous = -Infinity;
    for (let at = DISPLAY_FLOOR_MS; at <= DISPLAY_FLOOR_MS + JOIN_MS; at += STEP) {
      const x = sceneAt(at, DISPLAY_FLOOR_MS).escorts[2].offset.x;
      expect(x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = x;
    }
    expect(previous).toBeCloseTo(ESCORTS[2].slot.x, 0);
  });

  it("leaves to the right by flying, not by sliding the picture", () => {
    /*
     * §1.23. The old departure translated the whole scene — smoke, canvases
     * and all — which reads as the picture being pushed off the table. Here
     * the camera holds its cruise and the formation accelerates away from it,
     * so the air keeps drifting past at exactly the rate it always did and the
     * ribbons stretch because the aeroplanes outran them.
     */
    const breakOff = DISPLAY_FLOOR_MS;
    const start = breakOff + JOIN_MS + SETTLE_MS;
    const before = sceneAt(start, breakOff);
    const after = sceneAt(start + DEPART_MS, breakOff);
    expect(before.lead).toBe(0);
    expect(after.lead).toBeGreaterThan(1200);
    // The air's motion is untouched by any of it.
    expect(before.drift).toBe(CRUISE);
    expect(after.drift).toBe(CRUISE);
    // And every aircraft goes with it, monotonically, to the right.
    let previous = -Infinity;
    for (let at = start; at <= start + DEPART_MS; at += STEP) {
      const frame = sceneAt(at, breakOff);
      expect(frame.lead).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = frame.lead;
      for (const escort of frame.escorts) expect(escort.velocity.x).toBeGreaterThan(0);
    }
  });
});

describe("the shaping curve", () => {
  it("is odd, bounded and monotone, which is what the separation proof needs", () => {
    expect(shape(0)).toBeCloseTo(0, 12);
    expect(shape(1)).toBeCloseTo(1, 12);
    expect(shape(-1)).toBeCloseTo(-1, 12);
    let previous = -Infinity;
    for (let v = -1; v <= 1.0001; v += 0.001) {
      expect(shape(v)).toBeCloseTo(-shape(-v), 10);
      expect(shape(v)).toBeGreaterThan(previous);
      previous = shape(v);
    }
    // And it pushes toward the extremes, which is what makes "one high, one
    // low" a state the aircraft dwell in rather than pass through.
    expect(shape(0.5)).toBeGreaterThan(0.5);
  });
});
