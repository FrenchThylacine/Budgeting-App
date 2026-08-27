import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { getDatabase } from "../db/index.js";
import { snapshotIdFor } from "../auth/middleware.js";
import { asyncHandler, AppError, validateEnum, validateFiniteNumber, validateRequired } from "../middleware/errorHandler.js";
import type { Activity, CostModel } from "../../../src/domain/types.js";
import type { FundingKind } from "../../../src/domain/funding.js";
import { ALL_CURRENCY_CODES } from "../../../src/domain/currencies.js";

/**
 * Imported rather than restated.
 *
 * This list used to be the same ten codes written out by hand, which would
 * have started rejecting perfectly valid activities the moment the client
 * learned about the rest of ISO 4217. One list, one place — the same fix the
 * settings route needed.
 */
const currencies = ALL_CURRENCY_CODES;
const recurrenceTypes = ["none", "weekly", "monthly", "yearly", "session", "purchase", "custom"] as const;
const costModels = ["auto", "perSession", "schedule", "fixed", "sessionPack", "fixedYearly"] as const;
const fundingKinds = ["personal", "other", "outside"] as const;
const sessionPeriods = ["week", "month"] as const;

/** `YYYY-MM-DD`, or nothing. A half-typed date is not a date. */
function validateDateInput(value: unknown, field: string): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T12:00:00Z`))) {
    throw new AppError(400, `Invalid ${field}: expected a YYYY-MM-DD date`);
  }
  return text;
}

/** ISO weekdays, 1 = Monday … 7 = Sunday. Duplicates and rubbish dropped. */
function validateWeekdays(value: unknown, field: string): Activity["weekdays"] {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new AppError(400, `Invalid ${field}: expected an array of ISO weekdays`);
  const days = [...new Set(value.map(Number))].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length > 0 ? (days.sort((a, b) => a - b) as Activity["weekdays"]) : undefined;
}

/**
 * The fields the two write routes share, applied to a draft activity.
 *
 * Written once rather than twice: POST and PATCH drifting apart is exactly how
 * these routes ended up handling a subset of the model in the first place —
 * `costModel` had never been accepted by either of them, so an activity
 * created through the API could not use any of the cost models the app has had
 * for a year.
 */
function applyOptionalFields(target: Activity, body: Record<string, any>, partial: boolean): void {
  const has = (field: string) => !partial || body[field] !== undefined;

  if (has("costModel") && body.costModel != null) {
    const model = validateEnum(body.costModel, "costModel", costModels) as CostModel;
    // `auto` is the absence of a cost model; storing it would only add noise.
    target.costModel = model === "auto" ? undefined : model;
  } else if (body.costModel === null) {
    target.costModel = undefined;
  }

  if (has("fundingSource") && body.fundingSource != null) {
    const kind = validateEnum(body.fundingSource, "fundingSource", fundingKinds) as FundingKind;
    // `personal` is the default and is stored as absent, so "never chosen" and
    // "chosen to be the default" stay one state.
    target.fundingSource = kind === "personal" ? undefined : kind;
  } else if (body.fundingSource === null) {
    target.fundingSource = undefined;
  }

  if (has("fundedBy")) {
    const name = body.fundedBy == null ? "" : String(body.fundedBy).trim();
    // Only meaningful for "paid by other", and never kept against any other
    // funding kind — the same rule the editor follows.
    target.fundedBy = name && target.fundingSource === "other" ? name : undefined;
  }

  if (has("sessionsPerMonth")) {
    target.sessionsPerMonth =
      body.sessionsPerMonth != null ? validateFiniteNumber(body.sessionsPerMonth, "sessionsPerMonth", { min: 0 }) : null;
  }
  if (has("sessionsPerPeriod")) {
    target.sessionsPerPeriod =
      body.sessionsPerPeriod != null ? validateFiniteNumber(body.sessionsPerPeriod, "sessionsPerPeriod", { min: 0 }) : null;
  }
  if (has("sessionPeriod") && body.sessionPeriod != null) {
    const period = validateEnum(body.sessionPeriod, "sessionPeriod", sessionPeriods);
    // `week` is the default, stored as absent so an older row keeps meaning it.
    target.sessionPeriod = period === "month" ? "month" : undefined;
  }
  if (has("sessionsPerPayment")) {
    target.sessionsPerPayment =
      body.sessionsPerPayment != null
        ? validateFiniteNumber(body.sessionsPerPayment, "sessionsPerPayment", { integer: true, min: 1 })
        : null;
  }
  if (has("weekdays")) target.weekdays = validateWeekdays(body.weekdays, "weekdays");
  if (has("dayOfMonth")) {
    if (body.dayOfMonth == null) {
      target.dayOfMonth = null;
    } else {
      const day = validateFiniteNumber(body.dayOfMonth, "dayOfMonth", { integer: true, min: 1 });
      // The upper bound is checked here because `validateFiniteNumber` has no
      // `max`: a day of 40 is not a day, and silently keeping it would produce
      // a schedule that never fires.
      if (day > 31) throw new AppError(400, "Invalid dayOfMonth: must be between 1 and 31");
      target.dayOfMonth = day;
    }
  }
  if (has("startDate")) target.startDate = validateDateInput(body.startDate, "startDate");
  if (has("nextRenewalDate")) target.nextRenewalDate = validateDateInput(body.nextRenewalDate, "nextRenewalDate");
  if (has("icon")) target.icon = body.icon ? String(body.icon) : undefined;
  if (has("color")) target.color = body.color ? String(body.color) : undefined;
}

export function createActivitiesRoutes(): Router {
  const router = Router();
  // Bound to the authenticated account's budget. `requireAuth` runs before
  // these routers are reached, so `snapshotIdFor` always has a value; it throws
  // rather than defaulting if that ever stops being true, because the default
  // would be another user's budget.
  const getService = (req: Request) => new BudgetService(getDatabase(), snapshotIdFor(req));

  /**
   * GET /api/activities/:year
   * Get activities for a specific year
   */
  router.get(
    "/:year",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
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

      const service = getService(req);
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

      // Cost model, funding, schedule and payment-cycle fields. These routes
      // handled a subset of the model and silently dropped the rest.
      applyOptionalFields(newActivity, req.body, false);

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
      const service = getService(req);
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
          applyOptionalFields(activity, req.body, true);

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
      const service = getService(req);
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
