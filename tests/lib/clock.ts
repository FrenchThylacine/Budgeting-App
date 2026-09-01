import { afterAll, beforeEach, vi } from "vitest";

/**
 * A fixed today, for tests that are not about today
 * =================================================
 *
 * The store refuses to edit a period that has already ended unless historical
 * editing is unlocked — which is correct behaviour, and it makes any test that
 * writes into "the current month" depend on the wall clock.
 *
 * These tests were written in August against fixtures dated August. On the
 * first of September thirty-five of them failed, none of them because anything
 * had changed: August had simply become the past, and the store started doing
 * exactly what it is supposed to do. A suite that goes red overnight teaches
 * people to ignore it.
 *
 * So the files whose fixtures name a month pin the clock to that month. The
 * behaviour under test — a recurrence surviving an edit, a wallet principal
 * staying 200 USD — has nothing to do with what today's date is, and saying so
 * out loud is better than picking fixture dates that drift ahead of the
 * calendar and quietly rot again next year.
 *
 * Tests that *are* about the passage of time do not use this: they pass their
 * own `now` to the function they are testing, which is why every date-aware
 * function in `domain` takes one.
 *
 * Pin to the *middle* of the month, never to its last day. A machine three
 * hours ahead of UTC reads `2026-08-31T21:00:00Z` as the first of September,
 * and the guard this exists to satisfy asks a local question — which is how a
 * first attempt at this fix still failed, on the same two tests, for the same
 * reason.
 */
export function freezeClockAt(iso: string): void {
  /*
   * `beforeEach`, not `beforeAll`.
   *
   * Two of these files already call `vi.useRealTimers()` in their own
   * `afterEach` — left over from when they faked timers themselves — which
   * quietly undid a one-off pin after the first test and left the rest running
   * on the wall clock. Re-applying it before every test is both cheap and
   * immune to whatever else a file does to its timers.
   */
  beforeEach(() => {
    vi.useFakeTimers({
      // Timers themselves are left alone: only the clock is pinned. Faking
      // `setTimeout` here would hang every test that awaits a real one.
      toFake: ["Date"],
      now: new Date(iso),
      shouldAdvanceTime: false,
    });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}
