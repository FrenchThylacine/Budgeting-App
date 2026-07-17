import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { getDatabase } from "../db";

export function createSnapshotRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService(getDatabase());

  /**
   * GET /api/snapshot
   * Load the active budget snapshot
   */
  router.get(
    "/",
    asyncHandler((_req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.loadSnapshot();
      if (!snapshot) {
        throw new AppError(404, "No active snapshot found");
      }
      res.json(snapshot);
    }),
  );

  /**
   * PUT /api/snapshot
   * Save the full snapshot
   */
  router.put(
    "/",
    asyncHandler((req: Request, res: Response) => {
      const snapshot = req.body;
      if (!snapshot || typeof snapshot !== "object") {
        throw new AppError(400, "Invalid snapshot payload");
      }

      const service = getService();
      service.saveSnapshot(snapshot);
      res.json({ success: true, message: "Snapshot saved" });
    }),
  );

  /**
   * PATCH /api/snapshot/settings
   * Update only the settings
   */
  router.patch(
    "/settings",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      snapshot = service.updateSettings(snapshot, req.body);
      res.json(snapshot.settings);
    }),
  );

  /**
   * POST /api/snapshot/reset
   * Reset to seed snapshot (for testing/dev)
   */
  router.post(
    "/reset",
    asyncHandler((_req: Request, res: Response) => {
      if (process.env.NODE_ENV === "production") {
        throw new AppError(403, "Reset endpoint not available in production");
      }
      // TODO: import and use createSeedBudgetSnapshot from frontend
      res.json({ success: true, message: "Reset would happen here" });
    }),
  );

  return router;
}
