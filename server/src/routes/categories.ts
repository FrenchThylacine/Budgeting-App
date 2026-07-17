import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";
import { asyncHandler, AppError, validateRequired } from "../middleware/errorHandler";
import { getDatabase } from "../db";
import type { BudgetCategory } from "@/domain/types";

export function createCategoryRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService(getDatabase());

  /**
   * GET /api/categories
   * Get all categories
   */
  router.get(
    "/",
    asyncHandler((_req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.getOrThrow();
      res.json(snapshot.categories);
    }),
  );

  /**
   * POST /api/categories
   * Add a new category
   */
  router.post(
    "/",
    asyncHandler((req: Request, res: Response) => {
      validateRequired(req.body, "name", "bucket", "color");

      const service = getService();
      let snapshot = service.getOrThrow();

      const newCategory: BudgetCategory = {
        id: `cat-${req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        name: req.body.name,
        bucket: req.body.bucket,
        color: req.body.color,
        monthlyCap: req.body.monthlyCap,
        notes: req.body.notes,
        archived: false,
      };

      snapshot.categories.push(newCategory);
      service.saveSnapshot(snapshot);

      res.status(201).json(newCategory);
    }),
  );

  /**
   * PATCH /api/categories/:id
   * Update a category
   */
  router.patch(
    "/:id",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const categoryId = req.params.id;

      const category = snapshot.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AppError(404, `Category not found: ${categoryId}`);
      }

      // Update allowed fields
      if (req.body.name !== undefined) category.name = req.body.name;
      if (req.body.color !== undefined) category.color = req.body.color;
      if (req.body.monthlyCap !== undefined) category.monthlyCap = req.body.monthlyCap;
      if (req.body.notes !== undefined) category.notes = req.body.notes;
      if (req.body.archived !== undefined) category.archived = req.body.archived;

      service.saveSnapshot(snapshot);
      res.json(category);
    }),
  );

  /**
   * PATCH /api/categories/:id/archive
   * Archive a category (soft-delete)
   */
  router.patch(
    "/:id/archive",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const categoryId = req.params.id;

      const category = snapshot.categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new AppError(404, `Category not found: ${categoryId}`);
      }

      category.archived = true;
      service.saveSnapshot(snapshot);
      res.json(category);
    }),
  );

  /**
   * PATCH /api/categories/reorder
   * Reorder categories
   */
  router.patch(
    "/reorder",
    asyncHandler((req: Request, res: Response) => {
      validateRequired(req.body, "sourceId", "targetId");

      const service = getService();
      let snapshot = service.getOrThrow();
      const { sourceId, targetId } = req.body;

      const cats = snapshot.categories;
      const sourceIndex = cats.findIndex((c) => c.id === sourceId);
      const targetIndex = cats.findIndex((c) => c.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        throw new AppError(404, "Source or target category not found");
      }

      const [source] = cats.splice(sourceIndex, 1);
      cats.splice(targetIndex, 0, source);

      service.saveSnapshot(snapshot);
      res.json(cats);
    }),
  );

  return router;
}
