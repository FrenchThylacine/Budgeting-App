import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { asyncHandler, AppError, validateEnum, validateFiniteNumber, validateRequired } from "../middleware/errorHandler.js";
import type { Activity } from "../../../src/domain/types.js";

const currencies = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"] as const;
const recurrenceTypes = ["none", "weekly", "monthly", "yearly", "session", "purchase", "custom"] as const;

export function createActivitiesRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService();

  /**
   * GET /api/activities/:year
   * Get activities for a specific year
   */
  router.get(
    "/:year",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      const snapshot = await service.getOrThrow();
      const year = validateFiniteNumber(req.params.year, "year", { integer: true, min: 1 });

      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }

      res.json(yearRecord.activities);
    }),
  );

  /**
   * POST /api/activities
   * Add a new activity (recurring expense)
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      validateRequired(req.body, "year", "name", "categoryId", "currency", "recurrenceType");

      const service = getService();
      let snapshot = await service.getOrThrow();
      const year = validateFiniteNumber(req.body.year, "year", { integer: true, min: 1 });

      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }

      const category = snapshot.categories.find((c) => c.id === req.body.categoryId);
      if (!category || category.archived) {
        throw new AppError(400, "Invalid active category reference");
      }

      const name = String(req.body.name).trim();
      if (!name) throw new AppError(400, "Activity name cannot be empty");

      const currency = validateEnum(req.body.currency, "currency", currencies);
      const recurrenceType = validateEnum(req.body.recurrenceType, "recurrenceType", recurrenceTypes);
      const recurrenceInterval = req.body.recurrenceInterval != null
        ? validateFiniteNumber(req.body.recurrenceInterval, "recurrenceInterval", { integer: true, min: 1 })
        : 1;

      const newActivity: Activity = {
        id: `act-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        name,
        categoryId: req.body.categoryId,
        currency,
        recurrenceType,
        recurrenceInterval,
        pricePerSession: req.body.pricePerSession != null ? validateFiniteNumber(req.body.pricePerSession, "pricePerSession", { min: 0 }) : null,
        pricePerPurchase: req.body.pricePerPurchase != null ? validateFiniteNumber(req.body.pricePerPurchase, "pricePerPurchase", { min: 0 }) : null,
        pricePerMonth: req.body.pricePerMonth != null ? validateFiniteNumber(req.body.pricePerMonth, "pricePerMonth", { min: 0 }) : null,
        estimatedCost: req.body.estimatedCost != null ? validateFiniteNumber(req.body.estimatedCost, "estimatedCost", { min: 0 }) : null,
        yearlyEstimate: req.body.yearlyEstimate != null ? validateFiniteNumber(req.body.yearlyEstimate, "yearlyEstimate", { min: 0 }) : null,
        active: req.body.active !== false,
        visible: req.body.visible !== false,
        seasonalTag: req.body.seasonalTag || "normal",
        order: yearRecord.activities.length,
        notes: req.body.notes || "",
      };

      yearRecord.activities.push(newActivity);
      yearRecord.updatedAt = new Date().toISOString();
      await service.commitServerChange(snapshot);

      res.status(201).json(newActivity);
    }),
  );

  /**
   * PATCH /api/activities/:id
   * Update an activity
   */
  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      let snapshot = await service.getOrThrow();
      const activityId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const activity = yearRecord.activities.find((a) => a.id === activityId);
        if (activity) {
          // Update allowed fields
          if (req.body.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) throw new AppError(400, "Activity name cannot be empty");
            activity.name = name;
          }
          if (req.body.categoryId !== undefined) {
            const category = snapshot.categories.find((c) => c.id === req.body.categoryId);
            if (!category || category.archived) throw new AppError(400, "Invalid active category reference");
            activity.categoryId = req.body.categoryId;
          }
          if (req.body.currency !== undefined) activity.currency = validateEnum(req.body.currency, "currency", currencies);
          if (req.body.recurrenceType !== undefined) activity.recurrenceType = validateEnum(req.body.recurrenceType, "recurrenceType", recurrenceTypes);
          if (req.body.recurrenceInterval !== undefined) {
            activity.recurrenceInterval = validateFiniteNumber(req.body.recurrenceInterval, "recurrenceInterval", { integer: true, min: 1 });
          }
          if (req.body.pricePerSession !== undefined) {
            activity.pricePerSession = req.body.pricePerSession != null ? validateFiniteNumber(req.body.pricePerSession, "pricePerSession", { min: 0 }) : null;
          }
          if (req.body.pricePerPurchase !== undefined) {
            activity.pricePerPurchase = req.body.pricePerPurchase != null ? validateFiniteNumber(req.body.pricePerPurchase, "pricePerPurchase", { min: 0 }) : null;
          }
          if (req.body.pricePerMonth !== undefined) {
            activity.pricePerMonth = req.body.pricePerMonth != null ? validateFiniteNumber(req.body.pricePerMonth, "pricePerMonth", { min: 0 }) : null;
          }
          if (req.body.estimatedCost !== undefined) {
            activity.estimatedCost = req.body.estimatedCost != null ? validateFiniteNumber(req.body.estimatedCost, "estimatedCost", { min: 0 }) : null;
          }
          if (req.body.yearlyEstimate !== undefined) {
            activity.yearlyEstimate = req.body.yearlyEstimate != null ? validateFiniteNumber(req.body.yearlyEstimate, "yearlyEstimate", { min: 0 }) : null;
          }
          if (req.body.active !== undefined) activity.active = Boolean(req.body.active);
          if (req.body.visible !== undefined) activity.visible = Boolean(req.body.visible);
          if (req.body.seasonalTag !== undefined) activity.seasonalTag = String(req.body.seasonalTag);
          if (req.body.notes !== undefined) activity.notes = String(req.body.notes);

          yearRecord.updatedAt = new Date().toISOString();
          await service.commitServerChange(snapshot);
          found = true;
          res.json(activity);
          break;
        }
      }

      if (!found) {
        throw new AppError(404, `Activity not found: ${activityId}`);
      }
    }),
  );

  /**
   * DELETE /api/activities/:id
   * Delete an activity
   */
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      let snapshot = await service.getOrThrow();
      const activityId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const index = yearRecord.activities.findIndex((a) => a.id === activityId);
        if (index >= 0) {
          yearRecord.activities.splice(index, 1);
          // Reorder activities
          yearRecord.activities.forEach((a, i) => {
            a.order = i;
          });
          yearRecord.updatedAt = new Date().toISOString();
          await service.commitServerChange(snapshot);
          found = true;
          res.json({ success: true, message: "Activity deleted" });
          break;
        }
      }

      if (!found) {
        throw new AppError(404, `Activity not found: ${activityId}`);
      }
    }),
  );

  return router;
}
