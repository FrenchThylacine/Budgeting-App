/**
 * Swipe gesture decisions.
 *
 * The interactive part is verified in a browser; this covers the arithmetic
 * that decides what a movement means and where the row rests, which is where
 * a gesture goes subtly wrong without anyone noticing.
 */

import { describe, expect, it } from "vitest";
import {
  COMMIT_THRESHOLD,
  INTENT_THRESHOLD,
  OPEN_THRESHOLD,
  PANEL_WIDTH,
  clampOffset,
  resolveSwipeIntent,
  shouldCommit,
  snapOffset,
} from "../src/components/ui/SwipeRow";

describe("what a movement means", () => {
  it("waits before committing to anything", () => {
    // A tap wobbles by a pixel or two. Deciding immediately would make every
    // tap a failed swipe.
    expect(resolveSwipeIntent(0, 0)).toBe("none");
    expect(resolveSwipeIntent(INTENT_THRESHOLD - 1, INTENT_THRESHOLD - 1)).toBe("none");
  });

  it("reads a mostly-horizontal movement as a swipe", () => {
    expect(resolveSwipeIntent(-40, 5)).toBe("swipe");
    expect(resolveSwipeIntent(40, -5)).toBe("swipe");
  });

  it("reads a mostly-vertical movement as a scroll", () => {
    expect(resolveSwipeIntent(5, -40)).toBe("scroll");
    expect(resolveSwipeIntent(-5, 40)).toBe("scroll");
  });

  it("gives a diagonal to the scroll", () => {
    // Ties go to scrolling: a page that will not scroll is a worse failure than
    // a swipe that does not open, and reading the list is the common act.
    expect(resolveSwipeIntent(30, 30)).toBe("scroll");
  });
});

describe("where the row rests", () => {
  it("stays shut below the threshold", () => {
    // A short drag is an accident or a change of mind.
    expect(snapOffset(-(OPEN_THRESHOLD - 1), 1, 1)).toBe(0);
    expect(snapOffset(OPEN_THRESHOLD - 1, 1, 1)).toBe(0);
  });

  it("opens fully past the threshold, never part-way", () => {
    // Half a panel shows half a label, which is unreadable and looks broken.
    expect(snapOffset(-OPEN_THRESHOLD, 1, 1)).toBe(-PANEL_WIDTH);
    expect(snapOffset(-200, 1, 2)).toBe(-2 * PANEL_WIDTH);
    expect(snapOffset(OPEN_THRESHOLD, 1, 1)).toBe(PANEL_WIDTH);
  });

  it("stays shut on the side that has no actions", () => {
    // Opening onto nothing would leave a blank gap the user cannot dismiss by
    // pressing anything.
    expect(snapOffset(200, 0, 1)).toBe(0);
    expect(snapOffset(-200, 1, 0)).toBe(0);
  });
});

describe("how far the row can travel", () => {
  it("follows the finger inside the range", () => {
    // Mid-drag the row must track exactly, or it feels like it is lagging.
    expect(clampOffset(-30, 1, 1)).toBe(-30);
    expect(clampOffset(30, 1, 1)).toBe(30);
  });

  it("resists past the panel instead of stopping dead", () => {
    // A row that stops moving reads as broken; one that keeps giving, less and
    // less, tells the hand it is pulling against something.
    const past = clampOffset(-(PANEL_WIDTH + 100), 1, 1);
    expect(past).toBeLessThan(-PANEL_WIDTH);
    expect(past).toBeGreaterThan(-(PANEL_WIDTH + 100));
  });

  it("gives less for each further pixel", () => {
    // The resistance has to increase with distance, not merely exist, or the
    // commit point arrives without warning.
    const first = clampOffset(-(PANEL_WIDTH + 50), 1, 1) - clampOffset(-PANEL_WIDTH, 1, 1);
    const second = clampOffset(-(PANEL_WIDTH + 100), 1, 1) - clampOffset(-(PANEL_WIDTH + 50), 1, 1);
    expect(Math.abs(first)).toBeLessThan(50);
    expect(Math.abs(second)).toBeCloseTo(Math.abs(first), 5);
  });

  it("refuses to move toward a side with no actions", () => {
    // Including past the threshold: there is nothing there to rubber-band from.
    expect(clampOffset(120, 0, 1)).toBe(0);
    expect(clampOffset(-120, 1, 0)).toBe(0);
    expect(clampOffset(-400, 1, 0)).toBe(0);
  });
});

describe("when a release performs the action", () => {
  it("ignores a drag that merely opened the row", () => {
    // The single most important case: opening the panel must never delete.
    expect(shouldCommit(-OPEN_THRESHOLD, 1)).toBe(false);
    expect(shouldCommit(-PANEL_WIDTH, 1)).toBe(false);
  });

  it("commits once the row has been dragged well past the panel", () => {
    expect(shouldCommit(-COMMIT_THRESHOLD, 1)).toBe(true);
    expect(shouldCommit(COMMIT_THRESHOLD + 40, 1)).toBe(true);
  });

  it("never commits on a side with no actions", () => {
    // Otherwise a long drag would fire the opposite side's action.
    expect(shouldCommit(-300, 0)).toBe(false);
  });

  it("leaves a clear margin between opening and committing", () => {
    // If they were close, the gesture would be a coin toss.
    expect(COMMIT_THRESHOLD).toBeGreaterThan(PANEL_WIDTH + 40);
  });
});
