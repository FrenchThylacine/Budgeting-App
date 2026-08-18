import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { getDatabase } from "../db/index.js";
import { snapshotIdFor } from "../auth/middleware.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { createSeedBudgetSnapshot } from "../../../src/data/seedBudget.js";

/**
 * Reject structurally invalid snapshots before they reach the database. A
 * partially-shaped payload would otherwise wipe collections during the
 * targeted-delete pass, so shape is checked rather than assumed.
 */
function validateSnapshotPayload(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new AppError(400, "Invalid snapshot payload: expected an object");
  }
  const candidate = snapshot as Record<string, unknown>;

  if (!candidate.settings || typeof candidate.settings !== "object") {
    throw new AppError(400, "Invalid snapshot payload: missing settings object");
  }
  if (!Array.isArray(candidate.categories)) {
    throw new AppError(400, "Invalid snapshot payload: categories must be an array");
  }
  if (!candidate.years || typeof candidate.years !== "object" || Array.isArray(candidate.years)) {
    throw new AppError(400, "Invalid snapshot payload: years must be an object keyed by year");
  }
  for (const key of ["seasonalPresets", "scenarioPresets", "budgetApprovals", "auditLog"]) {
    if (candidate[key] !== undefined && !Array.isArray(candidate[key])) {
      throw new AppError(400, `Invalid snapshot payload: ${key} must be an array`);
    }
  }
  if (candidate.revision !== undefined && !Number.isFinite(Number(candidate.revision))) {
    throw new AppError(400, "Invalid snapshot payload: revision must be a finite number");
  }
}

const ALLOWED_CURRENCIES = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"] as const;
const ALLOWED_PERIOD_MODES = ["month", "week", "year"] as const;
const ALLOWED_DISPLAY_MODES = ["symbol", "code", "both"] as const;
const ALLOWED_ROUNDING_RULES = ["none", "nearest-1", "nearest-5", "nearest-10", "ceil-10"] as const;

export function validateSettingsPatch(patch: unknown): void {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new AppError(400, "Invalid settings patch: expected an object");
  }
  const candidate = patch as Record<string, unknown>;

  if (candidate.selectedYear !== undefined) {
    const yr = Number(candidate.selectedYear);
    if (!Number.isInteger(yr) || yr < 1900 || yr > 2200) {
      throw new AppError(400, "selectedYear must be a valid integer year");
    }
  }
  if (candidate.selectedMonth !== undefined) {
    const mo = Number(candidate.selectedMonth);
    if (!Number.isInteger(mo) || mo < 1 || mo > 12) {
      throw new AppError(400, "selectedMonth must be an integer between 1 and 12");
    }
  }
  if (candidate.selectedWeek !== undefined) {
    const wk = Number(candidate.selectedWeek);
    if (!Number.isInteger(wk) || wk < 1 || wk > 53) {
      throw new AppError(400, "selectedWeek must be an integer between 1 and 53");
    }
  }
  if (candidate.selectedWeekYear !== undefined) {
    const wkYr = Number(candidate.selectedWeekYear);
    if (!Number.isInteger(wkYr) || wkYr < 1900 || wkYr > 2200) {
      throw new AppError(400, "selectedWeekYear must be a valid integer year");
    }
  }
  if (candidate.selectedPeriodMode !== undefined) {
    if (!ALLOWED_PERIOD_MODES.includes(candidate.selectedPeriodMode as any)) {
      throw new AppError(400, `selectedPeriodMode must be one of: ${ALLOWED_PERIOD_MODES.join(", ")}`);
    }
  }
  if (candidate.baseCurrency !== undefined) {
    if (!ALLOWED_CURRENCIES.includes(candidate.baseCurrency as any)) {
      throw new AppError(400, `baseCurrency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`);
    }
  }
  if (candidate.monthlyBudgetCurrency !== undefined) {
    if (!ALLOWED_CURRENCIES.includes(candidate.monthlyBudgetCurrency as any)) {
      throw new AppError(400, `monthlyBudgetCurrency must be one of: ${ALLOWED_CURRENCIES.join(", ")}`);
    }
  }
  if (candidate.currencyDisplayMode !== undefined) {
    if (!ALLOWED_DISPLAY_MODES.includes(candidate.currencyDisplayMode as any)) {
      throw new AppError(400, `currencyDisplayMode must be one of: ${ALLOWED_DISPLAY_MODES.join(", ")}`);
    }
  }
  if (candidate.roundingRule !== undefined) {
    if (!ALLOWED_ROUNDING_RULES.includes(candidate.roundingRule as any)) {
      throw new AppError(400, `roundingRule must be one of: ${ALLOWED_ROUNDING_RULES.join(", ")}`);
    }
  }
  if (candidate.monthlyBudget !== undefined) {
    const mb = Number(candidate.monthlyBudget);
    if (!Number.isFinite(mb) || mb < 0) {
      throw new AppError(400, "monthlyBudget must be a non-negative number");
    }
  }
  if (candidate.darkMode !== undefined && typeof candidate.darkMode !== "boolean") {
    throw new AppError(400, "darkMode must be a boolean");
  }
  if (candidate.pilotIncludedInBudget !== undefined && typeof candidate.pilotIncludedInBudget !== "boolean") {
    throw new AppError(400, "pilotIncludedInBudget must be a boolean");
  }
  if (candidate.autoWalletRollupEnabled !== undefined && typeof candidate.autoWalletRollupEnabled !== "boolean") {
    throw new AppError(400, "autoWalletRollupEnabled must be a boolean");
  }
  if (candidate.autoWishlistFlushEnabled !== undefined && typeof candidate.autoWishlistFlushEnabled !== "boolean") {
    throw new AppError(400, "autoWishlistFlushEnabled must be a boolean");
  }
  if (candidate.promptBeforeMonthClose !== undefined && typeof candidate.promptBeforeMonthClose !== "boolean") {
    throw new AppError(400, "promptBeforeMonthClose must be a boolean");
  }
  if (candidate.liveClockEnabled !== undefined && typeof candidate.liveClockEnabled !== "boolean") {
    throw new AppError(400, "liveClockEnabled must be a boolean");
  }
  if (candidate.saveTimestampEnabled !== undefined && typeof candidate.saveTimestampEnabled !== "boolean") {
    throw new AppError(400, "saveTimestampEnabled must be a boolean");
  }
  if (candidate.ignoreNonBudgetSpending !== undefined && typeof candidate.ignoreNonBudgetSpending !== "boolean") {
    throw new AppError(400, "ignoreNonBudgetSpending must be a boolean");
  }
}

export function createSnapshotRoutes(): Router {
  const router = Router();
  // Bound to the authenticated account's budget. `requireAuth` runs before
  // these routers are reached, so `snapshotIdFor` always has a value; it throws
  // rather than defaulting if that ever stops being true, because the default
  // would be another user's budget.
  const getService = (req: Request) => new BudgetService(getDatabase(), snapshotIdFor(req));

  /**
   * GET /api/snapshot
   * Load the active budget snapshot
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      const snapshot = await service.loadSnapshot();
      if (!snapshot) {
        throw new AppError(404, "No active snapshot found");
      }
      res.json(snapshot);
    }),
  );

  /**
   * GET /api/snapshot/revision
   * Cheap freshness probe. Clients poll this on focus to detect another
   * device's write without transferring the whole snapshot.
   */
  router.get(
    "/revision",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      const revision = await service.loadRevision();
      res.json({ revision });
    }),
  );

  /**
   * PUT /api/snapshot
   * Save the full snapshot.
   *
   * Optimistic concurrency is a compare-and-swap on `baseRevision`: the
   * revision the client last read from the server. The write is accepted only
   * when it still matches what is stored, and the server — not the client —
   * assigns the next revision.
   *
   * Trusting a client-supplied revision was unsafe: a device that edited while
   * offline increments its own counter freely, so it could return with a
   * higher number and overwrite work another device did in the meantime. A
   * client cannot inflate `baseRevision` to win, because a stale base is
   * exactly what gets rejected.
   */
  router.put(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const snapshot = req.body;
      validateSnapshotPayload(snapshot);

      const service = getService(req);
      const storedRevision = await service.loadRevision();

      // `baseRevision` may travel in the body or as a header, so a plain
      // fetch and an intermediary that strips unknown fields both work.
      const headerBase = req.get("x-base-revision");
      const rawBase = snapshot.baseRevision ?? (headerBase != null ? Number(headerBase) : undefined);
      const baseRevision = Number.isFinite(Number(rawBase)) ? Number(rawBase) : null;

      if (storedRevision != null && baseRevision != null && baseRevision !== storedRevision) {
        const current = await service.loadSnapshot();
        res.status(409).json({
          error: "Snapshot conflict",
          message: `Rejected stale write (based on revision ${baseRevision}, server is at ${storedRevision}).`,
          revision: storedRevision,
          snapshot: current,
        });
        return;
      }

      // Legacy clients send no baseRevision. Fall back to the previous
      // monotonic check so they keep working rather than silently clobbering.
      if (baseRevision == null) {
        const incomingRevision = Number(snapshot.revision);
        if (storedRevision != null && Number.isFinite(incomingRevision) && incomingRevision <= storedRevision) {
          const current = await service.loadSnapshot();
          res.status(409).json({
            error: "Snapshot conflict",
            message: `Rejected stale write (incoming revision ${incomingRevision}, stored revision ${storedRevision}).`,
            revision: storedRevision,
            snapshot: current,
          });
          return;
        }
      }

      const nextRevision = (storedRevision ?? 0) + 1;
      const toStore = { ...snapshot, revision: nextRevision };
      delete (toStore as Record<string, unknown>).baseRevision;

      await service.saveSnapshot(toStore);
      res.json({ success: true, message: "Snapshot saved", revision: nextRevision });
    }),
  );

  /**
   * PATCH /api/snapshot/settings
   * Update only the settings
   */
  router.patch(
    "/settings",
    asyncHandler(async (req: Request, res: Response) => {
      validateSettingsPatch(req.body);
      const service = getService(req);
      let snapshot = await service.getOrThrow();
      snapshot = await service.updateSettings(snapshot, req.body);
      res.json(snapshot.settings);
    }),
  );

  /**
   * POST /api/snapshot/reset
   * Reset to seed snapshot (for testing/dev)
   */
  router.post(
    "/reset",
    asyncHandler(async (req: Request, res: Response) => {
      if (process.env.NODE_ENV === "production") {
        throw new AppError(403, "Reset endpoint not available in production");
      }
      const service = getService(req);
      const seed = createSeedBudgetSnapshot();
      await service.saveSnapshot(seed);
      res.json({ success: true, message: "Snapshot reset to seed budget", revision: seed.revision ?? 1 });
    }),
  );

  return router;
}
