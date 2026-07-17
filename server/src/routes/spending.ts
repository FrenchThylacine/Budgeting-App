import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";
import { asyncHandler, AppError, validateRequired } from "../middleware/errorHandler";
import { getDatabase } from "../db";
import type { SpendingEntry } from "@/domain/types";

export function createSpendingRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService(getDatabase());

  /**
   * GET /api/spending/:year/:month
   * Get spending entries for a specific month
   */
  router.get(
    "/:year/:month",
    asyncHandler((_req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.getOrThrow();
      const year = parseInt(String(_req.params.year));
      const month = parseInt(String(_req.params.month));

      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }

      const entries = yearRecord.spendingEntries.filter((e) => e.month === month);
      res.json(entries);
    }),
  );

  /**
   * POST /api/spending
   * Add a new spending entry
   */
  router.post(
    "/",
    asyncHandler((req: Request, res: Response) => {
      validateRequired(req.body, "year", "month", "amount", "currency", "categoryId");

      const service = getService();
      let snapshot = service.getOrThrow();

      const now = new Date().toISOString();
      const year = parseInt(req.body.year);
      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }

      const newEntry: SpendingEntry = {
        id: `spend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        year,
        month: req.body.month,
        week: req.body.week || 1,
        date: req.body.date || new Date().toISOString().split("T")[0],
        categoryId: req.body.categoryId,
        activityId: req.body.activityId,
        amount: req.body.amount,
        currency: req.body.currency,
        recurrenceType: req.body.recurrenceType || "none",
        isPiloting: req.body.isPiloting || false,
        source: req.body.source || "personal",
        note: req.body.note || "",
        createdAt: now,
        updatedAt: now,
      };

      yearRecord.spendingEntries.push(newEntry);
      yearRecord.updatedAt = now;
      service.saveSnapshot(snapshot);

      res.status(201).json(newEntry);
    }),
  );

  /**
   * PATCH /api/spending/:id
   * Update a spending entry
   */
  router.patch(
    "/:id",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const entryId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const entry = yearRecord.spendingEntries.find((e) => e.id === entryId);
        if (entry) {
          // Update allowed fields
          if (req.body.amount !== undefined) entry.amount = req.body.amount;
          if (req.body.currency !== undefined) entry.currency = req.body.currency;
          if (req.body.categoryId !== undefined) entry.categoryId = req.body.categoryId;
          if (req.body.source !== undefined) entry.source = req.body.source;
          if (req.body.note !== undefined) entry.note = req.body.note;
          if (req.body.isPiloting !== undefined) entry.isPiloting = req.body.isPiloting;
          if (req.body.activityId !== undefined) entry.activityId = req.body.activityId;
          if (req.body.date !== undefined) {
            entry.date = req.body.date;
            // Recalculate month/week from date
            const d = new Date(`${req.body.date}T00:00:00`);
            entry.month = d.getMonth() + 1;
          }

          entry.updatedAt = new Date().toISOString();
          yearRecord.updatedAt = entry.updatedAt;
          service.saveSnapshot(snapshot);
          found = true;
          res.json(entry);
          break;
        }
      }

      if (!found) {
        throw new AppError(404, `Spending entry not found: ${entryId}`);
      }
    }),
  );

  /**
   * DELETE /api/spending/:id
   * Delete a spending entry
   */
  router.delete(
    "/:id",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const entryId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const index = yearRecord.spendingEntries.findIndex((e) => e.id === entryId);
        if (index >= 0) {
          yearRecord.spendingEntries.splice(index, 1);
          yearRecord.updatedAt = new Date().toISOString();
          service.saveSnapshot(snapshot);
          found = true;
          res.json({ success: true, message: "Entry deleted" });
          break;
        }
      }

      if (!found) {
        throw new AppError(404, `Spending entry not found: ${entryId}`);
      }
    }),
  );

  return router;
}
