import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";

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

export function createSnapshotRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService();

  /**
   * GET /api/snapshot
   * Load the active budget snapshot
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      const service = getService();
      const snapshot = await service.loadSnapshot();
      if (!snapshot) {
        throw new AppError(404, "No active snapshot found");
      }
      res.json(snapshot);
    }),
  );

  /**
   * PUT /api/snapshot
   * Save the full snapshot.
   *
   * Optimistic concurrency: when the payload carries a `revision` counter and
   * the stored snapshot already has an equal or newer revision, the write is
   * rejected with 409 and the current server snapshot is returned so the
   * stale client can rebase instead of silently overwriting newer data.
   */
  router.put(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const snapshot = req.body;
      validateSnapshotPayload(snapshot);

      const service = getService();

      const incomingRevision = Number(snapshot.revision);
      if (Number.isFinite(incomingRevision)) {
        const storedRevision = await service.loadRevision();
        if (storedRevision != null && incomingRevision <= storedRevision) {
          const current = await service.loadSnapshot();
          res.status(409).json({
            error: "Snapshot conflict",
            message: `Rejected stale write (incoming revision ${incomingRevision}, stored revision ${storedRevision}).`,
            snapshot: current,
          });
          return;
        }
      }

      await service.saveSnapshot(snapshot);
      res.json({ success: true, message: "Snapshot saved" });
    }),
  );

  /**
   * PATCH /api/snapshot/settings
   * Update only the settings
   */
  router.patch(
    "/settings",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
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
    asyncHandler(async (_req: Request, res: Response) => {
      if (process.env.NODE_ENV === "production") {
        throw new AppError(403, "Reset endpoint not available in production");
      }
      res.json({ success: true, message: "Reset would happen here" });
    }),
  );

  return router;
}
