import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freezeClockAt } from "./lib/clock";

// These fixtures are dated August 2026; the store refuses to edit a month
// that has ended, so the clock says mid-August too — mid-month rather than the
// 31st, because a date at the edge of a month lands in the next one in a
// timezone ahead of UTC. See `tests/lib/clock.ts`.
freezeClockAt("2026-08-15T09:00:00Z");

/**
 * A write made while the load was still in the air
 * ================================================
 *
 * Hydration replaces the whole snapshot and can take a network round trip.
 * Somebody who opens the application and immediately changes something is
 * making a legitimate, *newer* write against a snapshot that is about to be
 * thrown away:
 *
 *   1. hydration starts;  2. the user edits;  3. hydration lands and overwrites.
 *
 * Neither obvious answer is right, which is why this needed a mechanism rather
 * than a rule about who wins. Letting the remote win discards the user's
 * change — that is the bug. Letting the local snapshot win is *worse*: during a
 * first load the local snapshot is the empty one, so keeping it would replace
 * the account's entire budget with a blank sheet containing a single edit.
 *
 * What survives is neither snapshot but the **mutation**, re-applied to
 * whatever hydration brought back. These tests hold both ends of that: the
 * user's change is present afterwards, *and* the account's data is still there.
 */

const remoteSnapshot = vi.hoisted(() => ({ current: null as unknown }));
const loadDelay = vi.hoisted(() => ({ ms: 0 }));

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>("../src/api/client");
  return {
    ...actual,
    getApiClient: () => ({
      loadSnapshot: async () => {
        if (loadDelay.ms > 0) await new Promise((resolve) => setTimeout(resolve, loadDelay.ms));
        return remoteSnapshot.current;
      },
      // The store persists after a replay; nothing here needs to observe it.
      saveSnapshot: async () => ({ revision: 99 }),
      loadRevision: async () => 1,
    }),
  };
});

// No IndexedDB in Node, and the store already treats its absence as normal.
vi.mock("../src/storage/idb", () => ({
  loadSnapshot: async () => null,
  saveSnapshot: async () => undefined,
  deleteSnapshot: async () => undefined,
}));

const { useBudgetStore } = await import("../src/store/budgetStore");
const { createSeedBudgetSnapshot } = await import("../src/data/seedBudget");
const { createEmptyBudgetSnapshot } = await import("../src/data/seedBudget");

const NOW = new Date("2026-08-31T12:00:00Z");

/** The account's real budget, as the server holds it. */
function serverBudget() {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.revision = 7;
  const year = String(snapshot.settings.selectedYear);
  snapshot.years[year].activities = [
    {
      id: "server-activity",
      name: "Gym",
      categoryId: snapshot.categories[0].id,
      pricePerMonth: 50,
      currency: "EUR",
      recurrenceType: "monthly",
      recurrenceInterval: 1,
      active: true,
      visible: true,
      order: 0,
      notes: "",
      costModel: "fixed",
    },
  ] as never;
  return snapshot;
}

beforeEach(() => {
  loadDelay.ms = 0;
  remoteSnapshot.current = null;
  useBudgetStore.setState({
    snapshot: createEmptyBudgetSnapshot(NOW),
    hydrated: false,
    undoStack: [],
    redoStack: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a change made while hydration is in flight", () => {
  it("survives the hydration that lands after it", async () => {
    /*
     * The exact sequence from the brief: an old hydration snapshot plus a
     * newer local mutation must leave the new local state in place.
     */
    remoteSnapshot.current = serverBudget();
    loadDelay.ms = 60;

    const hydrating = useBudgetStore.getState().hydrate();

    // The user changes something while the load is still out.
    useBudgetStore.getState().updateSettings({ monthlyBudget: 1234 });
    expect(useBudgetStore.getState().snapshot.settings.monthlyBudget).toBe(1234);

    await hydrating;

    // The user's newer write is still there...
    expect(useBudgetStore.getState().snapshot.settings.monthlyBudget).toBe(1234);
    // ...and it did not cost the account its budget.
    const year = String(useBudgetStore.getState().snapshot.settings.selectedYear);
    expect(useBudgetStore.getState().snapshot.years[year].activities.map((a) => a.id)).toContain(
      "server-activity",
    );
  });

  it("keeps the account's data when nothing was changed during the load", async () => {
    // The control: with no local write, hydration is simply hydration.
    remoteSnapshot.current = serverBudget();
    loadDelay.ms = 30;
    await useBudgetStore.getState().hydrate();

    const state = useBudgetStore.getState();
    const year = String(state.snapshot.settings.selectedYear);
    expect(state.hydrated).toBe(true);
    expect(state.snapshot.years[year].activities).toHaveLength(1);
  });

  it("replays a creation with the id the interface is already holding", async () => {
    /*
     * A recipe that creates something calls a random id generator. Replaying it
     * naively produces a *different* id, and an editor open on the new row
     * would be pointing at something that no longer exists. The ids are taped
     * on the way through and played back.
     */
    remoteSnapshot.current = serverBudget();
    loadDelay.ms = 60;

    const hydrating = useBudgetStore.getState().hydrate();
    useBudgetStore.getState().addActivity({
      name: "Added during the load",
      categoryId: "cat-health",
      pricePerMonth: 10,
      currency: "EUR",
      recurrenceType: "monthly",
      recurrenceInterval: 1,
      active: true,
      visible: true,
      notes: "",
    } as never);

    const year = String(useBudgetStore.getState().snapshot.settings.selectedYear);
        const idBefore = useBudgetStore
      .getState()
      .snapshot.years[year].activities.find((a) => a.name === "Added during the load")?.id;
    expect(idBefore).toBeTruthy();

    await hydrating;

    const after = useBudgetStore.getState().snapshot.years[year].activities;
    const replayed = after.find((a) => a.name === "Added during the load");
    expect(replayed, "the new activity did not survive hydration").toBeDefined();
    expect(replayed!.id, "the replay generated a different id").toBe(idBefore);
    // And the server's own activity is still beside it.
    expect(after.map((a) => a.id)).toContain("server-activity");
  });

  it("does not resurrect something the user deleted during the load", async () => {
    /*
     * The failure mode a field-by-field merge would have. The user deletes the
     * activity the server is about to send back; re-applying the *recipe*
     * removes it from the server's copy too, where merging two objects would
     * have brought it back.
     */
    const server = serverBudget();
    remoteSnapshot.current = server;
    loadDelay.ms = 60;

    // The device already has the row, so the user can delete it.
    const local = createEmptyBudgetSnapshot(NOW);
    const localYear = String(local.settings.selectedYear);
    local.years[localYear].activities = server.years[String(server.settings.selectedYear)].activities.slice();
    useBudgetStore.setState({ snapshot: local });

    const hydrating = useBudgetStore.getState().hydrate();
    useBudgetStore.getState().removeActivity("server-activity");
    await hydrating;

    const year = String(useBudgetStore.getState().snapshot.settings.selectedYear);
    expect(
      useBudgetStore.getState().snapshot.years[year].activities.map((a) => a.id),
    ).not.toContain("server-activity");
  });

  it("applies several queued changes in the order they were made", async () => {
    remoteSnapshot.current = serverBudget();
    loadDelay.ms = 60;

    const hydrating = useBudgetStore.getState().hydrate();
    useBudgetStore.getState().updateSettings({ monthlyBudget: 100 });
    useBudgetStore.getState().updateSettings({ monthlyBudget: 200 });
    useBudgetStore.getState().updateSettings({ monthlyBudget: 300 });
    await hydrating;

    // Last write wins, which it only does if the order was preserved.
    expect(useBudgetStore.getState().snapshot.settings.monthlyBudget).toBe(300);
  });

  it("stops queueing once the load has landed", async () => {
    // A change made *after* hydration must not be queued for a load that has
    // already finished — it would be re-applied by the next one.
    remoteSnapshot.current = serverBudget();
    await useBudgetStore.getState().hydrate();
    useBudgetStore.getState().updateSettings({ monthlyBudget: 555 });

    remoteSnapshot.current = serverBudget();
    await useBudgetStore.getState().hydrate();

    // The second hydration replaced the snapshot and had nothing queued, so the
    // budget is the server's again rather than 555 re-applied.
    expect(useBudgetStore.getState().snapshot.settings.monthlyBudget).not.toBe(555);
  });
});
