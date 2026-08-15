import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { asyncHandler, AppError, validateEnum, validateFiniteNumber, validateRequired } from "../middleware/errorHandler.js";
import type { BudgetApproval } from "../../../src/domain/types.js";

const currencies = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"] as const;
const approvalStatuses = ["approved", "rejected"] as const;

export function createApprovalRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService();

  /**
   * GET /api/approvals
   * Get all budget approvals
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      const service = getService();
      const snapshot = await service.getOrThrow();
      res.json(snapshot.budgetApprovals || []);
    }),
  );

  /**
   * GET /api/approvals/:year/:month
   * Get approval for a specific month
   */
  router.get(
    "/:year/:month",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      const snapshot = await service.getOrThrow();
      const year = validateFiniteNumber(req.params.year, "year", { integer: true, min: 1 });
      const month = validateFiniteNumber(req.params.month, "month", { integer: true, min: 1 });
      if (month > 12) throw new AppError(400, "Month must be between 1 and 12");

      const approval = (snapshot.budgetApprovals || []).find((a) => a.year === year && a.month === month);
      if (!approval) {
        return res.json(null);
      }

      res.json(approval);
    }),
  );

  /**
   * POST /api/approvals
   * Create or propose a new budget approval
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      validateRequired(req.body, "year", "month", "suggestedAmount", "currency", "recurringTotal");

      const service = getService();
      let snapshot = await service.getOrThrow();
      const year = validateFiniteNumber(req.body.year, "year", { integer: true, min: 1 });
      const month = validateFiniteNumber(req.body.month, "month", { integer: true, min: 1 });
      if (month > 12) throw new AppError(400, "Month must be between 1 and 12");

      const suggestedAmount = validateFiniteNumber(req.body.suggestedAmount, "suggestedAmount", { min: 0 });
      const recurringTotal = validateFiniteNumber(req.body.recurringTotal, "recurringTotal", { min: 0 });
      const currency = validateEnum(req.body.currency, "currency", currencies);
      const approvedAmount = req.body.approvedAmount != null
        ? validateFiniteNumber(req.body.approvedAmount, "approvedAmount", { min: 0 })
        : null;

      const status = req.body.status ? validateEnum(req.body.status, "status", approvalStatuses) : "rejected";

      // Check if approval already exists for this month
      const existingApproval = (snapshot.budgetApprovals || []).find((a) => a.year === year && a.month === month);

      if (existingApproval && existingApproval.status === "approved") {
        throw new AppError(
          400,
          `Budget for month ${month}/${year} already approved. Cannot modify after approval.`,
        );
      }

      const newApproval: BudgetApproval = {
        id: existingApproval ? existingApproval.id : `approval-${year}-${month}-${Date.now()}`,
        year,
        month,
        suggestedAmount,
        approvedAmount,
        currency,
        status,
        recurringTotal,
        createdAt: existingApproval ? existingApproval.createdAt : new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        note: req.body.note || "",
      };

      if (!snapshot.budgetApprovals) {
        snapshot.budgetApprovals = [];
      }

      if (existingApproval) {
        // Update existing proposal
        Object.assign(existingApproval, newApproval);
        await service.commitServerChange(snapshot);
        res.json(existingApproval);
      } else {
        // Create new approval
        snapshot.budgetApprovals.push(newApproval);
        await service.commitServerChange(snapshot);
        res.status(201).json(newApproval);
      }
    }),
  );

  /**
   * PATCH /api/approvals/:id
   * Update an approval (approve or reject)
   */
  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService();
      let snapshot = await service.getOrThrow();
      const approvalId = req.params.id;

      const approval = (snapshot.budgetApprovals || []).find((a) => a.id === approvalId);
      if (!approval) {
        throw new AppError(404, `Approval not found: ${approvalId}`);
      }

      if (approval.status === "approved") {
        throw new AppError(400, "Approved budgets are immutable historical records.");
      }

      // Update allowed fields
      if (req.body.approvedAmount !== undefined) {
        approval.approvedAmount = req.body.approvedAmount != null
          ? validateFiniteNumber(req.body.approvedAmount, "approvedAmount", { min: 0 })
          : null;
      }
      if (req.body.status !== undefined) {
        approval.status = validateEnum(req.body.status, "status", approvalStatuses);
      }
      if (req.body.note !== undefined) approval.note = String(req.body.note);
      if (req.body.decidedAt !== undefined) approval.decidedAt = String(req.body.decidedAt);

      await service.commitServerChange(snapshot);
      res.json(approval);
    }),
  );

  return router;
}
