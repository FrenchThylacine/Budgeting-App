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
   * GET /api/snapshot/revision
   * Cheap freshness probe. Clients poll this on focus to detect another
   * device's write without transferring the whole snapshot.
   */
  router.get(
    "/revision",
    asyncHandler(async (_req: Request, res: Response) => {
      const service = getService();
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

      const service = getService();
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
