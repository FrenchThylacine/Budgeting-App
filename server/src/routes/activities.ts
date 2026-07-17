import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";
import { asyncHandler, AppError, validateRequired } from "../middleware/errorHandler";
import { getDatabase } from "../db";
import type { Activity } from "@/domain/types";

export function createActivitiesRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService(getDatabase());

  /**
   * GET /api/activities/:year
   * Get activities for a specific year
   */
  router.get(
    "/:year",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.getOrThrow();
      const year = parseInt(String(req.params.year));

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
    asyncHandler((req: Request, res: Response) => {
      validateRequired(req.body, "year", "name", "categoryId", "currency", "recurrenceType");

      const service = getService();
      let snapshot = service.getOrThrow();
      const year = parseInt(req.body.year);

      const yearRecord = snapshot.years[String(year)];
      if (!yearRecord) {
        throw new AppError(404, `No data for year ${year}`);
      }

      const newActivity: Activity = {
        id: `act-${req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        name: req.body.name,
        categoryId: req.body.categoryId,
        currency: req.body.currency,
        recurrenceType: req.body.recurrenceType,
        recurrenceInterval: req.body.recurrenceInterval || 1,
        pricePerSession: req.body.pricePerSession || null,
        pricePerPurchase: req.body.pricePerPurchase || null,
        pricePerMonth: req.body.pricePerMonth || null,
        estimatedCost: req.body.estimatedCost || null,
        yearlyEstimate: req.body.yearlyEstimate || null,
        active: req.body.active !== false,
        visible: req.body.visible !== false,
        seasonalTag: req.body.seasonalTag || "normal",
        order: yearRecord.activities.length,
        notes: req.body.notes || "",
      };

      yearRecord.activities.push(newActivity);
      yearRecord.updatedAt = new Date().toISOString();
      service.saveSnapshot(snapshot);

      res.status(201).json(newActivity);
    }),
  );

  /**
   * PATCH /api/activities/:id
   * Update an activity
   */
  router.patch(
    "/:id",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const activityId = req.params.id;

      let found = false;
      for (const yearRecord of Object.values(snapshot.years)) {
        const activity = yearRecord.activities.find((a) => a.id === activityId);
        if (activity) {
          // Update allowed fields
          if (req.body.name !== undefined) activity.name = req.body.name;
          if (req.body.categoryId !== undefined) activity.categoryId = req.body.categoryId;
          if (req.body.currency !== undefined) activity.currency = req.body.currency;
          if (req.body.recurrenceType !== undefined) activity.recurrenceType = req.body.recurrenceType;
          if (req.body.recurrenceInterval !== undefined) activity.recurrenceInterval = req.body.recurrenceInterval;
          if (req.body.pricePerSession !== undefined) activity.pricePerSession = req.body.pricePerSession;
          if (req.body.pricePerPurchase !== undefined) activity.pricePerPurchase = req.body.pricePerPurchase;
          if (req.body.pricePerMonth !== undefined) activity.pricePerMonth = req.body.pricePerMonth;
          if (req.body.estimatedCost !== undefined) activity.estimatedCost = req.body.estimatedCost;
          if (req.body.yearlyEstimate !== undefined) activity.yearlyEstimate = req.body.yearlyEstimate;
          if (req.body.active !== undefined) activity.active = req.body.active;
          if (req.body.visible !== undefined) activity.visible = req.body.visible;
          if (req.body.seasonalTag !== undefined) activity.seasonalTag = req.body.seasonalTag;
          if (req.body.notes !== undefined) activity.notes = req.body.notes;

          yearRecord.updatedAt = new Date().toISOString();
          service.saveSnapshot(snapshot);
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
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
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
          service.saveSnapshot(snapshot);
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
