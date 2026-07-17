import type { BudgetSnapshot, SpendingEntry, Activity, BudgetCategory } from "../domain/types";

/**
 * API Client for the budget backend
 * Replaces direct IndexedDB access with HTTP calls
 */
export class BudgetApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.VITE_API_URL || "/api") {
    this.baseUrl = baseUrl;
  }

  /**
   * Load the active snapshot
   */
  async loadSnapshot(): Promise<BudgetSnapshot | null> {
    try {
      const response = await fetch(`${this.baseUrl}/snapshot`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Failed to load snapshot: ${response.statusText}`);
      return response.json();
    } catch (error) {
      console.error("Error loading snapshot:", error);
      throw error;
    }
  }

  /**
   * Save the snapshot
   */
  async saveSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/snapshot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) throw new Error(`Failed to save snapshot: ${response.statusText}`);
    } catch (error) {
      console.error("Error saving snapshot:", error);
      throw error;
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
    suggestedBudget: number;
    approvedBudget?: number;
    notes?: string;
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
    approvedBudget: number,
    notes?: string,
  ): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/approvals/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBudget, notes }),
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
      const response = await fetch(`${this.baseUrl}/approvals/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
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

