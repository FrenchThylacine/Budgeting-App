import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService";
import { asyncHandler, AppError, validateRequired } from "../middleware/errorHandler";
import { getDatabase } from "../db";
import type { BudgetApproval } from "@/domain/types";

export function createApprovalRoutes(): Router {
  const router = Router();
  const getService = () => new BudgetService(getDatabase());

  /**
   * GET /api/approvals
   * Get all budget approvals
   */
  router.get(
    "/",
    asyncHandler((_req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.getOrThrow();
      res.json(snapshot.budgetApprovals || []);
    }),
  );

  /**
   * GET /api/approvals/:year/:month
   * Get approval for a specific month
   */
  router.get(
    "/:year/:month",
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      const snapshot = service.getOrThrow();
      const year = parseInt(String(req.params.year));
      const month = parseInt(String(req.params.month));

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
    asyncHandler((req: Request, res: Response) => {
      validateRequired(req.body, "year", "month", "suggestedAmount", "currency", "recurringTotal");

      const service = getService();
      let snapshot = service.getOrThrow();
      const year = parseInt(String(req.body.year));
      const month = parseInt(String(req.body.month));

      // Check if approval already exists for this month
      const existingApproval = (snapshot.budgetApprovals || []).find((a) => a.year === year && a.month === month);

      if (existingApproval && existingApproval.status === "approved") {
        throw new AppError(
          400,
          `Budget for month ${month}/${year} already approved. Cannot modify after approval.`,
        );
      }

      const newApproval: BudgetApproval = {
        id: `approval-${year}-${month}-${Date.now()}`,
        year: year,
        month: month,
        suggestedAmount: req.body.suggestedAmount,
        approvedAmount: req.body.approvedAmount || null,
        currency: req.body.currency,
        status: req.body.status || "rejected",
        recurringTotal: req.body.recurringTotal,
        createdAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        note: req.body.note || "",
      };

      if (!snapshot.budgetApprovals) {
        snapshot.budgetApprovals = [];
      }

      if (existingApproval) {
        // Update existing proposal
        Object.assign(existingApproval, newApproval);
        service.saveSnapshot(snapshot);
        res.json(existingApproval);
      } else {
        // Create new approval
        snapshot.budgetApprovals.push(newApproval);
        service.saveSnapshot(snapshot);
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
    asyncHandler((req: Request, res: Response) => {
      const service = getService();
      let snapshot = service.getOrThrow();
      const approvalId = req.params.id;

      const approval = (snapshot.budgetApprovals || []).find((a) => a.id === approvalId);
      if (!approval) {
        throw new AppError(404, `Approval not found: ${approvalId}`);
      }

      // Update allowed fields
      if (req.body.approvedAmount !== undefined) approval.approvedAmount = req.body.approvedAmount;
      if (req.body.status !== undefined) approval.status = req.body.status;
      if (req.body.note !== undefined) approval.note = req.body.note;
      if (req.body.decidedAt !== undefined) approval.decidedAt = req.body.decidedAt;

      service.saveSnapshot(snapshot);
      res.json(approval);
    }),
  );

  return router;
}

