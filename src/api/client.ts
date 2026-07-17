import type { BudgetSnapshot } from "../domain/types";

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
