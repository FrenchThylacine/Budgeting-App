import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { asyncHandler, AppError, validateDateInput, validateEnum, validateFiniteNumber, validateRequired } from "../middleware/errorHandler.js";
import type { SpendingEntry } from "../../../src/domain/types.js";
import { getIsoWeek } from "../../../src/domain/dates.js";

const currencies = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"] as const;
const recurrenceTypes = ["none", "weekly", "monthly", "yearly", "session", "purchase", "custom"] as const;

export function createSpendingRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService();

  /**
   * GET /api/spending/:year/:month
   * Get spending entries for a specific month
   */
  router.get(
    "/:year/:month",
    asyncHandler(async (_req: Request, res: Response) => {
      const service = getService();
      const snapshot = await service.getOrThrow();
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
    asyncHandler(async (req: Request, res: Response) => {
      validateRequired(req.body, "year", "month", "amount", "currency", "categoryId");

      const service = getService();
      let snapshot = await service.getOrThrow();

      const now = new Date().toISOString();
      const year = validateFiniteNumber(req.body.year, "year", { integer: true, min: 1 });
      const month = validateFiniteNumber(req.body.month, "month", { integer: true, min: 1 });
      if (month > 12) throw new AppError(400, "Field must be at most 12: month");
      const date = req.body.date === undefined ? new Date().toISOString().slice(0, 10) : validateDateInput(req.body.date, "date");
      const dateValue = new Date(`${date}T00:00:00Z`);
      if (dateValue.getUTCMonth() + 1 !== month) throw new AppError(400, "Date and month must match");
      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }
      const category = snapshot.categories.find((item) => item.id === req.body.categoryId);
      if (!category || category.archived) throw new AppError(400, "Invalid active category");

      const newEntry: SpendingEntry = {
        id: `spend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        year,
        month,
        week: getIsoWeek(dateValue),
        date,
        categoryId: req.body.categoryId,
        activityId: req.body.activityId || undefined,
        amount: validateFiniteNumber(req.body.amount, "amount"),
        currency: validateEnum(req.body.currency, "currency", currencies),
        recurrenceType: req.body.recurrenceType === undefined ? "none" : validateEnum(req.body.recurrenceType, "recurrenceType", recurrenceTypes),
        isPiloting: req.body.isPiloting === true,
        source: req.body.source || "personal",
        note: req.body.note || "",
        createdAt: now,
        updatedAt: now,
      };

      yearRecord.spendingEntries.push(newEntry);
      yearRecord.updatedAt = now;
      await service.commitServerChange(snapshot);

      res.status(201).json(newEntry);
    }),
  );

  /**
   * PATCH /api/spending/:id
   * Update a spending entry
   */
  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      let snapshot = await service.getOrThrow();
      const entryId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const entry = yearRecord.spendingEntries.find((e) => e.id === entryId);
        if (entry) {
          // Update allowed fields
          if (req.body.amount !== undefined) entry.amount = validateFiniteNumber(req.body.amount, "amount");
          if (req.body.currency !== undefined) entry.currency = validateEnum(req.body.currency, "currency", currencies);
          if (req.body.categoryId !== undefined) {
            const category = snapshot.categories.find((item) => item.id === req.body.categoryId);
            if (!category || category.archived) throw new AppError(400, "Invalid active category");
            entry.categoryId = req.body.categoryId;
          }
          if (req.body.source !== undefined) entry.source = req.body.source;
          if (req.body.note !== undefined) entry.note = req.body.note;
          if (req.body.isPiloting !== undefined) entry.isPiloting = req.body.isPiloting;
          if (req.body.activityId !== undefined) entry.activityId = req.body.activityId || undefined;
          if (req.body.recurrenceType !== undefined) entry.recurrenceType = validateEnum(req.body.recurrenceType, "recurrenceType", recurrenceTypes);
          if (req.body.date !== undefined) {
            entry.date = validateDateInput(req.body.date, "date");
            const date = new Date(`${entry.date}T00:00:00Z`);
            entry.month = date.getUTCMonth() + 1;
            entry.week = getIsoWeek(date);
            // The year must follow the date too, and the entry has to move to
            // the matching year record. Without this an entry re-dated across
            // a year boundary keeps a stale year and stays filed under the
            // wrong record, matching neither the client store's behaviour nor
            // the database's year grouping.
            entry.year = date.getUTCFullYear();
          }

          entry.updatedAt = new Date().toISOString();

          if (entry.year !== yearRecord.year) {
            const targetRecord = snapshot.years[String(entry.year)];
            if (!targetRecord) {
              throw new AppError(400, `No data for year ${entry.year}; cannot move entry into it`);
            }
            yearRecord.spendingEntries = yearRecord.spendingEntries.filter((e) => e.id !== entryId);
            targetRecord.spendingEntries.push(entry);
            targetRecord.updatedAt = entry.updatedAt;
          }

          yearRecord.updatedAt = entry.updatedAt;
          await service.commitServerChange(snapshot);
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
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      let snapshot = await service.getOrThrow();
      const entryId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const index = yearRecord.spendingEntries.findIndex((e) => e.id === entryId);
        if (index >= 0) {
          yearRecord.spendingEntries.splice(index, 1);
          yearRecord.updatedAt = new Date().toISOString();
          await service.commitServerChange(snapshot);
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
