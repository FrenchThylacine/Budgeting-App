import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { getDatabase } from "../db/index.js";
import { snapshotIdFor } from "../auth/middleware.js";
import { asyncHandler, AppError, validateEnum, validateFiniteNumber, validateRequired } from "../middleware/errorHandler.js";
import type { BudgetCategory } from "../../../src/domain/types.js";

const categoryBuckets = ["general", "piloting", "personal", "wallet"] as const;

export function createCategoryRoutes(): Router {
  const router = Router();
  // Bound to the authenticated account's budget. `requireAuth` runs before
  // these routers are reached, so `snapshotIdFor` always has a value; it throws
  // rather than defaulting if that ever stops being true, because the default
  // would be another user's budget.
  const getService = (req: Request) => new BudgetService(getDatabase(), snapshotIdFor(req));

  /**
   * GET /api/categories
   * Get all categories
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      const snapshot = await service.getOrThrow();
      res.json(snapshot.categories);
    }),
  );

  /**
   * POST /api/categories
   * Add a new category
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      validateRequired(req.body, "name", "bucket", "color");

      const service = getService(req);
      let snapshot = await service.getOrThrow();

      const name = String(req.body.name).trim();
      if (!name) throw new AppError(400, "Category name cannot be empty");
      const bucket = validateEnum(req.body.bucket, "bucket", categoryBuckets);
      const color = String(req.body.color).trim();
      if (!color) throw new AppError(400, "Category color cannot be empty");

      const monthlyCap =
        req.body.monthlyCap != null ? validateFiniteNumber(req.body.monthlyCap, "monthlyCap", { min: 0 }) : undefined;

      if (req.body.parentId) {
        const parent = snapshot.categories.find((c) => c.id === req.body.parentId);
        if (!parent || parent.archived) throw new AppError(400, "Invalid parent category");
      }

      const newCategory: BudgetCategory = {
        id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        name,
        bucket,
        color,
        monthlyCap,
        notes: req.body.notes || "",
        archived: false,
        icon: req.body.icon || undefined,
        description: req.body.description || "",
        parentId: req.body.parentId || undefined,
      };

      snapshot.categories.push(newCategory);
      await service.commitServerChange(snapshot);

      res.status(201).json(newCategory);
    }),
  );

  /**
   * PATCH /api/categories/reorder
   * Reorder categories.
   *
   * Must stay registered before "/:id": Express matches in registration order,
   * so a later literal route is shadowed by the earlier parameter route and
   * would be answered with "Category not found: reorder".
   */
  router.patch(
    "/reorder",
    asyncHandler(async (req: Request, res: Response) => {
      validateRequired(req.body, "sourceId", "targetId");

      const service = getService(req);
      let snapshot = await service.getOrThrow();
      const { sourceId, targetId } = req.body;

      const cats = snapshot.categories;
      const sourceIndex = cats.findIndex((c) => c.id === sourceId);
      const targetIndex = cats.findIndex((c) => c.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        throw new AppError(404, "Source or target category not found");
      }

      const [source] = cats.splice(sourceIndex, 1);
      cats.splice(targetIndex, 0, source);

      await service.commitServerChange(snapshot);
      res.json(cats);
    }),
  );

  /**
   * PATCH /api/categories/:id
   * Update a category
   */
  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      let snapshot = await service.getOrThrow();
      const categoryId = req.params.id;

      const category = snapshot.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AppError(404, `Category not found: ${categoryId}`);
      }

      // Update allowed fields
      if (req.body.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name) throw new AppError(400, "Category name cannot be empty");
        category.name = name;
      }
      if (req.body.bucket !== undefined) category.bucket = validateEnum(req.body.bucket, "bucket", categoryBuckets);
      if (req.body.color !== undefined) {
        const color = String(req.body.color).trim();
        if (!color) throw new AppError(400, "Category color cannot be empty");
        category.color = color;
      }
      if (req.body.monthlyCap !== undefined) {
        category.monthlyCap =
          req.body.monthlyCap != null ? validateFiniteNumber(req.body.monthlyCap, "monthlyCap", { min: 0 }) : undefined;
      }
      if (req.body.notes !== undefined) category.notes = req.body.notes;
      if (req.body.archived !== undefined) category.archived = Boolean(req.body.archived);
      if (req.body.icon !== undefined) category.icon = req.body.icon;
      if (req.body.description !== undefined) category.description = req.body.description;
      if (req.body.parentId !== undefined) {
        if (req.body.parentId) {
          if (req.body.parentId === categoryId) {
            throw new AppError(400, "A category cannot be its own parent");
          }
          const parent = snapshot.categories.find((c) => c.id === req.body.parentId);
          if (!parent || parent.archived) throw new AppError(400, "Invalid parent category");
          // Categories nest one level deep; allowing a child as a parent
          // creates a cycle that any chain walk would loop on.
          if (parent.parentId) {
            throw new AppError(400, "Categories nest one level deep: the chosen parent is already a subcategory");
          }
        }
        category.parentId = req.body.parentId || undefined;
      }

      await service.commitServerChange(snapshot);
      res.json(category);
    }),
  );

  /**
   * PATCH /api/categories/:id/archive
   * Archive a category (soft-delete)
   */
  router.patch(
    "/:id/archive",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      let snapshot = await service.getOrThrow();
      const categoryId = req.params.id;

      const category = snapshot.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AppError(404, `Category not found: ${categoryId}`);
      }

      category.archived = true;
      await service.commitServerChange(snapshot);
      res.json(category);
    }),
  );

  return router;
}
