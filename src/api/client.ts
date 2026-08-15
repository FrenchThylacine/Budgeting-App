import type { BudgetSnapshot, SpendingEntry, Activity, BudgetCategory } from "../domain/types";

/**
 * Thrown when the server rejects a snapshot write because another device
 * already stored a newer revision. Carries the current server snapshot so
 * the caller can adopt it instead of overwriting it.
 */
export class SnapshotConflictError extends Error {
  constructor(
    public readonly serverSnapshot: BudgetSnapshot | null,
    public readonly serverRevision: number | null = null,
  ) {
    super("Snapshot conflict: the server holds a newer revision.");
    this.name = "SnapshotConflictError";
  }
}

/**
 * The API could not be reached at all (offline, server down, bad routing).
 * Distinct from a rejected write: the caller must not report "saved".
 */
export class ApiUnavailableError extends Error {
  constructor(public readonly cause: unknown) {
    super("The budget API is unreachable.");
    this.name = "ApiUnavailableError";
  }
}

function defaultBaseUrl(): string {
  try {
    const fromEnv = import.meta.env?.VITE_API_URL as string | undefined;
    if (fromEnv) return fromEnv;
  } catch {
    /* import.meta.env unavailable (tests) */
  }
  return "/api";
}

/**
 * API Client for the budget backend
 * Replaces direct IndexedDB access with HTTP calls
 */
export class BudgetApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = defaultBaseUrl()) {
    this.baseUrl = baseUrl;
  }

  /**
   * Load the active snapshot
   */
  async loadSnapshot(): Promise<BudgetSnapshot | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/snapshot`);
    } catch (error) {
      // Network-level failure: the API is unreachable, which is different
      // from the API answering "no snapshot yet".
      throw new ApiUnavailableError(error);
    }
    if (response.status === 404) return null;
    if (response.status >= 500) throw new ApiUnavailableError(new Error(response.statusText));
    if (!response.ok) throw new Error(`Failed to load snapshot: ${response.statusText}`);
    return response.json();
  }

  /** Cheap freshness probe used to detect another device's write. */
  async loadRevision(): Promise<number | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/snapshot/revision`);
    } catch (error) {
      throw new ApiUnavailableError(error);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new ApiUnavailableError(new Error(response.statusText));
    const body = await response.json();
    const revision = Number(body?.revision);
    return Number.isFinite(revision) ? revision : null;
  }

  /**
   * Save the snapshot
   */
  /**
   * Persist the snapshot with a compare-and-swap on `baseRevision` — the
   * revision this client last read from the server. Returns the revision the
   * server assigned, which becomes the caller's new base.
   */
  async saveSnapshot(snapshot: BudgetSnapshot, baseRevision: number | null = null): Promise<number | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/snapshot`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(baseRevision != null ? { "x-base-revision": String(baseRevision) } : {}),
        },
        body: JSON.stringify(baseRevision != null ? { ...snapshot, baseRevision } : snapshot),
      });
    } catch (error) {
      throw new ApiUnavailableError(error);
    }

    if (response.status === 409) {
      let serverSnapshot: BudgetSnapshot | null = null;
      let serverRevision: number | null = null;
      try {
        const body = await response.json();
        serverSnapshot = body?.snapshot ?? null;
        serverRevision = Number.isFinite(Number(body?.revision)) ? Number(body.revision) : null;
      } catch {
        /* body unavailable */
      }
      throw new SnapshotConflictError(serverSnapshot, serverRevision);
    }

    if (response.status >= 500) throw new ApiUnavailableError(new Error(response.statusText));
    if (!response.ok) throw new Error(`Failed to save snapshot: ${response.statusText}`);

    try {
      const body = await response.json();
      const revision = Number(body?.revision);
      return Number.isFinite(revision) ? revision : null;
    } catch {
      return null;
    }
  }

  /**
   * Update only settings
   */
  async updateSettings(patch: Partial<any>): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/snapshot/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(`Failed to update settings: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error updating settings:", error);
      throw error;
    }
  }

  /**
   * Get spending entries for a month
   */
  async getSpendingEntries(year: number, month: number): Promise<SpendingEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/spending/${year}/${month}`);
      if (!response.ok) throw new Error(`Failed to load spending: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading spending:", error);
      return [];
    }
  }

  /**
   * Add a spending entry
   */
  async addSpendingEntry(entry: Omit<SpendingEntry, "id" | "createdAt" | "updatedAt">): Promise<SpendingEntry> {
    try {
      const response = await fetch(`${this.baseUrl}/spending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!response.ok) throw new Error(`Failed to add spending: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error adding spending:", error);
      throw error;
    }
  }

  /**
   * Update a spending entry
   */
  async updateSpendingEntry(id: string, patch: Partial<SpendingEntry>): Promise<SpendingEntry> {
    try {
      const response = await fetch(`${this.baseUrl}/spending/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(`Failed to update spending: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error updating spending:", error);
      throw error;
    }
  }

  /**
   * Delete a spending entry
   */
  async deleteSpendingEntry(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/spending/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`Failed to delete spending: ${response.statusText}`);
    } catch (error) {
      console.error("Error deleting spending:", error);
      throw error;
    }
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<BudgetCategory[]> {
    try {
      const response = await fetch(`${this.baseUrl}/categories`);
      if (!response.ok) throw new Error(`Failed to load categories: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading categories:", error);
      return [];
    }
  }

  /**
   * Add a category
   */
  async addCategory(category: Omit<BudgetCategory, "id">): Promise<BudgetCategory> {
    try {
      const response = await fetch(`${this.baseUrl}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category),
      });
      if (!response.ok) throw new Error(`Failed to add category: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error adding category:", error);
      throw error;
    }
  }

  /**
   * Update a category
   */
  async updateCategory(id: string, patch: Partial<BudgetCategory>): Promise<BudgetCategory> {
    try {
      const response = await fetch(`${this.baseUrl}/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(`Failed to update category: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error updating category:", error);
      throw error;
    }
  }

  /**
   * Archive a category
   */
  async archiveCategory(id: string): Promise<BudgetCategory> {
    return this.updateCategory(id, { archived: true });
  }

  /**
   * Get activities for a year
   */
  async getActivities(year: number): Promise<Activity[]> {
    try {
      const response = await fetch(`${this.baseUrl}/activities/${year}`);
      if (!response.ok) throw new Error(`Failed to load activities: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading activities:", error);
      return [];
    }
  }

  /**
   * Add an activity
   */
  async addActivity(activity: Omit<Activity, "id" | "order">): Promise<Activity> {
    try {
      const response = await fetch(`${this.baseUrl}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity),
      });
      if (!response.ok) throw new Error(`Failed to add activity: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error adding activity:", error);
      throw error;
    }
  }

  /**
   * Update an activity
   */
  async updateActivity(id: string, patch: Partial<Activity>): Promise<Activity> {
    try {
      const response = await fetch(`${this.baseUrl}/activities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(`Failed to update activity: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error updating activity:", error);
      throw error;
    }
  }

  /**
   * Delete an activity
   */
  async deleteActivity(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/activities/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`Failed to delete activity: ${response.statusText}`);
    } catch (error) {
      console.error("Error deleting activity:", error);
      throw error;
    }
  }

  /**
   * Get budget approvals for a year
   */
  async getApprovals(year: number): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals/${year}`);
      if (!response.ok) throw new Error(`Failed to load approvals: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading approvals:", error);
      return [];
    }
  }

  /**
   * Get approval for a specific month
   */
  async getApprovalForMonth(year: number, month: number): Promise<any | null> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals/${year}/${month}`);
      if (!response.ok) throw new Error(`Failed to load approval: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading approval:", error);
      return null;
    }
  }

  /**
   * Create or propose a budget approval
   */
  async proposeApproval(approval: {
    year: number;
    month: number;
    suggestedAmount: number;
    approvedAmount?: number;
    notes?: string;
    currency: string;
    recurringTotal: number;
  }): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approval),
      });
      if (!response.ok) throw new Error(`Failed to propose approval: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error proposing approval:", error);
      throw error;
    }
  }

  /**
   * Approve a budget
   */
  async approveApproval(
    id: string,
    approvedAmount: number,
    notes?: string,
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedAmount, status: "approved", decidedAt: new Date().toISOString(), note: notes }),
      });
      if (!response.ok) throw new Error(`Failed to approve: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error approving:", error);
      throw error;
    }
  }

  /**
   * Reject a budget
   */
  async rejectApproval(id: string, reason?: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", decidedAt: new Date().toISOString(), note: reason }),
      });
      if (!response.ok) throw new Error(`Failed to reject: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error rejecting:", error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let apiClient: BudgetApiClient | null = null;

export function getApiClient(): BudgetApiClient {
  if (!apiClient) {
    apiClient = new BudgetApiClient();
  }
  return apiClient;
}

export function setApiClient(client: BudgetApiClient): void {
  apiClient = client;
}

