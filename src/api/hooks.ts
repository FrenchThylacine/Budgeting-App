/**
 * React hooks for API operations
 * These wrap the BudgetApiClient to provide a convenient interface for components
 */

import { useEffect, useState, useCallback } from "react";
import { getApiClient } from "./client";
import type {
  BudgetSnapshot,
  SpendingEntry,
  Activity,
  BudgetCategory,
} from "../domain/types";

/**
 * Hook to load spending entries for a month
 */
export function useSpendingEntries(year: number, month: number) {
  const [entries, setEntries] = useState<SpendingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getApiClient()
      .getSpendingEntries(year, month)
      .then(setEntries)
      .catch((err) => {
        setError(err);
        console.error("Failed to load spending entries:", err);
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  const addEntry = useCallback((entry: Omit<SpendingEntry, "id" | "createdAt" | "updatedAt">) => {
    return getApiClient()
      .addSpendingEntry(entry)
      .then((newEntry) => {
        setEntries((prev) => [...prev, newEntry]);
        return newEntry;
      });
  }, []);

  const updateEntry = useCallback((id: string, patch: Partial<SpendingEntry>) => {
    return getApiClient()
      .updateSpendingEntry(id, patch)
      .then((updated) => {
        setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
        return updated;
      });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    return getApiClient()
      .deleteSpendingEntry(id)
      .then(() => {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      });
  }, []);

  return { entries, loading, error, addEntry, updateEntry, deleteEntry };
}

/**
 * Hook to load all categories
 */
export function useCategories() {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getApiClient()
      .getCategories()
      .then(setCategories)
      .catch((err) => {
        setError(err);
        console.error("Failed to load categories:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const addCategory = useCallback((cat: Omit<BudgetCategory, "id">) => {
    return getApiClient()
      .addCategory(cat)
      .then((newCat) => {
        setCategories((prev) => [...prev, newCat]);
        return newCat;
      });
  }, []);

  const updateCategory = useCallback((id: string, patch: Partial<BudgetCategory>) => {
    return getApiClient()
      .updateCategory(id, patch)
      .then((updated) => {
        setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
        return updated;
      });
  }, []);

  const archiveCategory = useCallback((id: string) => {
    return getApiClient()
      .archiveCategory(id)
      .then((updated) => {
        setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
        return updated;
      });
  }, []);

  return { categories, loading, error, addCategory, updateCategory, archiveCategory };
}

/**
 * Hook to load activities for a year
 */
export function useActivities(year: number) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getApiClient()
      .getActivities(year)
      .then(setActivities)
      .catch((err) => {
        setError(err);
        console.error("Failed to load activities:", err);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const addActivity = useCallback((activity: Omit<Activity, "id" | "order">) => {
    return getApiClient()
      .addActivity(activity)
      .then((newActivity) => {
        setActivities((prev) => [...prev, newActivity]);
        return newActivity;
      });
  }, []);

  const updateActivity = useCallback((id: string, patch: Partial<Activity>) => {
    return getApiClient()
      .updateActivity(id, patch)
      .then((updated) => {
        setActivities((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      });
  }, []);

  const deleteActivity = useCallback((id: string) => {
    return getApiClient()
      .deleteActivity(id)
      .then(() => {
        setActivities((prev) => prev.filter((a) => a.id !== id));
      });
  }, []);

  return { activities, loading, error, addActivity, updateActivity, deleteActivity };
}

/**
 * Hook to load and manage budget approvals
 */
export function useApprovals(year: number) {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getApiClient()
      .getApprovals(year)
      .then(setApprovals)
      .catch((err) => {
        setError(err);
        console.error("Failed to load approvals:", err);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const proposeApproval = useCallback(
    (approval: {
      year: number;
      month: number;
      suggestedAmount: number;
      approvedAmount?: number;
      notes?: string;
      currency: string;
      recurringTotal: number;
    }) => {
      return getApiClient()
        .proposeApproval(approval)
        .then((newApproval) => {
          setApprovals((prev) => {
            const filtered = prev.filter(
              (a) => !(a.year === newApproval.year && a.month === newApproval.month),
            );
            return [...filtered, newApproval];
          });
          return newApproval;
        });
    },
    [],
  );

  const approveApproval = useCallback((id: string, approvedAmount: number, notes?: string) => {
    return getApiClient()
      .approveApproval(id, approvedAmount, notes)
      .then((updated) => {
        setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      });
  }, []);

  const rejectApproval = useCallback((id: string, reason?: string) => {
    return getApiClient()
      .rejectApproval(id, reason)
      .then((updated) => {
        setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      });
  }, []);

  return {
    approvals,
    loading,
    error,
    proposeApproval,
    approveApproval,
    rejectApproval,
  };
}
