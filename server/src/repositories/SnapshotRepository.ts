import { getDatabase } from "../db/client";
import type {
  BudgetSnapshot,
  Activity,
  SpendingEntry,
  WishlistItem,
  WalletEntry,
  BudgetCategory,
  MonthCloseRecord,
  BudgetApproval,
  AuditLog,
  YearRecord,
  Settings,
  SeasonalPreset,
  ScenarioPreset,
} from "@/domain/types";

export class SnapshotRepository {
  constructor(private db = getDatabase()) {}

  loadSnapshot(snapshotId: string = "active"): BudgetSnapshot | null {
    const row = this.db
      .prepare("SELECT * FROM snapshots WHERE id = ?")
      .get(snapshotId) as any;

    if (!row) return null;

    const settings = JSON.parse(row.settings);
    const categories = this.loadCategories(snapshotId);
    const seasonalPresets = this.loadSeasonalPresets(snapshotId);
    const scenarioPresets = this.loadScenarioPresets(snapshotId);
    const budgetApprovals = this.loadBudgetApprovals();
    const auditLog = this.loadAuditLog(snapshotId);

    const yearsData = this.db
      .prepare("SELECT id, year FROM years WHERE snapshot_id = ?")
      .all(snapshotId) as any[];

    const years: Record<string, YearRecord> = {};
    for (const yearRow of yearsData) {
      const yearRecord = this.loadYearRecord(yearRow.id);
      if (yearRecord) {
        years[String(yearRecord.year)] = yearRecord;
      }
    }

    return {
      version: row.version,
      settings,
      categories,
      years,
      seasonalPresets,
      scenarioPresets,
      budgetApprovals,
      auditLog,
    };
  }

  saveSnapshot(snapshot: BudgetSnapshot, snapshotId: string = "active"): void {
    const txn = this.db.transaction(() => {
      const now = new Date().toISOString();

      // Upsert snapshot
      this.db
        .prepare(
          `
        INSERT OR REPLACE INTO snapshots (id, version, settings, created_at, updated_at)
        VALUES (?, ?, ?, 
          COALESCE((SELECT created_at FROM snapshots WHERE id = ?), ?),
          ?
        )
      `,
        )
        .run(snapshotId, snapshot.version, JSON.stringify(snapshot.settings), snapshotId, now, now);

      // Categories
      for (const category of snapshot.categories) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO categories
          (id, snapshot_id, name, bucket, color, monthly_cap, notes, archived)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            category.id,
            snapshotId,
            category.name,
            category.bucket,
            category.color,
            category.monthlyCap ?? null,
            category.notes ?? null,
            category.archived ? 1 : 0,
          );
      }

      // Years and nested data
      for (const yearRecord of Object.values(snapshot.years)) {
        this.saveYearRecord(snapshotId, yearRecord, now);
      }

      // Presets
      for (const preset of snapshot.seasonalPresets) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO seasonal_presets
          (id, snapshot_id, name, season, activity_overrides, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          )
          .run(preset.id, snapshotId, preset.name, preset.season, JSON.stringify(preset.activityOverrides), preset.notes);
      }

      for (const preset of snapshot.scenarioPresets) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO scenario_presets
          (id, snapshot_id, name, monthly_budget, pilot_included_in_budget, category_caps, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            preset.id,
            snapshotId,
            preset.name,
            preset.monthlyBudget ?? null,
            preset.pilotIncludedInBudget ? 1 : 0,
            preset.categoryCaps ? JSON.stringify(preset.categoryCaps) : null,
            preset.notes,
          );
      }

      // Budget approvals
      for (const approval of snapshot.budgetApprovals) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO budget_approvals
          (id, year, month, suggested_amount, approved_amount, currency, status, recurring_total, note, created_at, decided_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          )
          .run(
            approval.id,
            approval.year,
            approval.month,
            approval.suggestedAmount,
            approval.approvedAmount ?? null,
            approval.currency,
            approval.status,
            approval.recurringTotal,
            approval.note,
            approval.createdAt,
            approval.decidedAt,
          );
      }

      // Audit log
      for (const log of snapshot.auditLog) {
        this.db
          .prepare(
            `
          INSERT OR REPLACE INTO audit_log
          (id, snapshot_id, type, summary, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          )
          .run(log.id, snapshotId, log.type, log.summary, log.metadata ? JSON.stringify(log.metadata) : null, log.createdAt);
      }
    });

    txn();
  }

  private saveYearRecord(snapshotId: string, yearRecord: YearRecord, now: string): void {
    let yearId = this.db
      .prepare("SELECT id FROM years WHERE snapshot_id = ? AND year = ?")
      .get(snapshotId, yearRecord.year) as any;

    if (!yearId) {
      const id = `year-${snapshotId}-${yearRecord.year}-${Date.now()}`;
      this.db
        .prepare(
          `
        INSERT INTO years (id, snapshot_id, year, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
        )
        .run(id, snapshotId, yearRecord.year, yearRecord.createdAt, now);
      yearId = { id };
    } else {
      this.db
        .prepare("UPDATE years SET updated_at = ? WHERE id = ?")
        .run(now, yearId.id);
    }

    // Activities
    this.db.prepare("DELETE FROM activities WHERE year_id = ?").run(yearId.id);
    for (const activity of yearRecord.activities) {
      this.db
        .prepare(
          `
        INSERT INTO activities
        (id, year_id, name, category_id, currency, recurrence_type, recurrence_interval,
         price_per_session, price_per_purchase, price_per_month, estimated_cost, yearly_estimate,
         active, visible, seasonal_tag, \`order\`, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          activity.id,
          yearId.id,
          activity.name,
          activity.categoryId,
          activity.currency,
          activity.recurrenceType,
          activity.recurrenceInterval,
          activity.pricePerSession,
          activity.pricePerPurchase,
          activity.pricePerMonth,
          activity.estimatedCost,
          activity.yearlyEstimate,
          activity.active ? 1 : 0,
          activity.visible ? 1 : 0,
          activity.seasonalTag,
          activity.order,
          activity.notes,
        now,
        now
        );
    }

    // Spending entries
    this.db.prepare("DELETE FROM spending_entries WHERE year_id = ?").run(yearId.id);
    for (const entry of yearRecord.spendingEntries) {
      this.db
        .prepare(
          `
        INSERT INTO spending_entries
        (id, year_id, month, week, date, category_id, activity_id, amount, currency,
         recurrence_type, is_piloting, source, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          entry.id,
          yearId.id,
          entry.month,
          entry.week,
          entry.date,
          entry.categoryId,
          entry.activityId ?? null,
          entry.amount,
          entry.currency,
          entry.recurrenceType,
          entry.isPiloting ? 1 : 0,
          entry.source ?? "personal",
          entry.note,
          entry.createdAt,
          entry.updatedAt,
        );
    }

    // Wishlist items
    this.db.prepare("DELETE FROM wishlist_items WHERE year_id = ?").run(yearId.id);
    for (const item of yearRecord.wishlistItems) {
      this.db
        .prepare(
          `
        INSERT INTO wishlist_items
        (id, year_id, name, category_id, actual_price, effective_value, currency,
         bought, in_wishlist, priority, date_added, date_purchased, notes, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          item.id,
          yearId.id,
          item.name,
          item.categoryId,
          item.actualPrice,
          item.effectiveValue,
          item.currency,
          item.bought ? 1 : 0,
          item.inWishlist ? 1 : 0,
          item.priority,
          item.dateAdded,
          item.datePurchased ?? null,
          item.notes,
          item.active ? 1 : 0,
          now,
          now,
        );
    }

    // Wallet entries
    this.db.prepare("DELETE FROM wallet_entries WHERE year_id = ?").run(yearId.id);
    for (const entry of yearRecord.walletEntries) {
      this.db
        .prepare(
          `
        INSERT INTO wallet_entries
        (id, year_id, month, amount, currency, source, type, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(entry.id, yearId.id, entry.month, entry.amount, entry.currency, entry.source, entry.type, entry.note, entry.createdAt);
    }

    // Closed months
    this.db.prepare("DELETE FROM closed_months WHERE year_id = ?").run(yearId.id);
    for (const record of yearRecord.closedMonths) {
      this.db
        .prepare(
          `
        INSERT INTO closed_months
        (id, year_id, month, status, spend_total, delta, rollover_wallet_entry_id, confirmed_at, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          record.id,
          yearId.id,
          record.month,
          record.status,
          record.spendTotal,
          record.delta,
          record.rolloverWalletEntryId ?? null,
          record.confirmedAt,
          record.note,
        );
    }
  }

  private loadYearRecord(yearId: string): YearRecord | null {
    const yearRow = this.db
      .prepare("SELECT * FROM years WHERE id = ?")
      .get(yearId) as any;

    if (!yearRow) return null;

    const activities = this.db
      .prepare("SELECT * FROM activities WHERE year_id = ? ORDER BY `order`")
      .all(yearId) as any[];

    const spendingEntries = this.db
      .prepare("SELECT * FROM spending_entries WHERE year_id = ?")
      .all(yearId) as any[];

    const wishlistItems = this.db
      .prepare("SELECT * FROM wishlist_items WHERE year_id = ?")
      .all(yearId) as any[];

    const walletEntries = this.db
      .prepare("SELECT * FROM wallet_entries WHERE year_id = ?")
      .all(yearId) as any[];

    const closedMonths = this.db
      .prepare("SELECT * FROM closed_months WHERE year_id = ?")
      .all(yearId) as any[];

    return {
      year: yearRow.year,
      activities: activities.map((a) => this.parseActivity(a)),
      spendingEntries: spendingEntries.map((e) => this.parseSpendingEntry(e)),
      wishlistItems: wishlistItems.map((i) => this.parseWishlistItem(i)),
      walletEntries: walletEntries.map((e) => this.parseWalletEntry(e)),
      closedMonths: closedMonths.map((r) => this.parseMonthCloseRecord(r)),
      monthlyNotes: {}, // TODO: implement monthly notes table if needed
      createdAt: yearRow.created_at,
      updatedAt: yearRow.updated_at,
    };
  }

  private loadCategories(snapshotId: string): BudgetCategory[] {
    const rows = this.db
      .prepare("SELECT * FROM categories WHERE snapshot_id = ? ORDER BY name")
      .all(snapshotId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      bucket: r.bucket,
      color: r.color,
      monthlyCap: r.monthly_cap,
      notes: r.notes,
      archived: r.archived === 1,
    }));
  }

  private loadSeasonalPresets(snapshotId: string): SeasonalPreset[] {
    const rows = this.db
      .prepare("SELECT * FROM seasonal_presets WHERE snapshot_id = ?")
      .all(snapshotId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      season: r.season,
      activityOverrides: JSON.parse(r.activity_overrides),
      notes: r.notes,
    }));
  }

  private loadScenarioPresets(snapshotId: string): ScenarioPreset[] {
    const rows = this.db
      .prepare("SELECT * FROM scenario_presets WHERE snapshot_id = ?")
      .all(snapshotId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      monthlyBudget: r.monthly_budget,
      pilotIncludedInBudget: r.pilot_included_in_budget === 1,
      categoryCaps: r.category_caps ? JSON.parse(r.category_caps) : undefined,
      notes: r.notes,
    }));
  }

  private loadBudgetApprovals(): BudgetApproval[] {
    const rows = this.db
      .prepare("SELECT * FROM budget_approvals ORDER BY decided_at DESC LIMIT 120")
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      suggestedAmount: r.suggested_amount,
      approvedAmount: r.approved_amount,
      currency: r.currency,
      status: r.status,
      recurringTotal: r.recurring_total,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      note: r.note,
    }));
  }

  private loadAuditLog(snapshotId: string): AuditLog[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_log WHERE snapshot_id = ? ORDER BY created_at DESC LIMIT 500")
      .all(snapshotId) as any[];

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      summary: r.summary,
      createdAt: r.created_at,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  private parseActivity(row: any): Activity {
    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      currency: row.currency,
      recurrenceType: row.recurrence_type,
      recurrenceInterval: row.recurrence_interval,
      pricePerSession: row.price_per_session,
      pricePerPurchase: row.price_per_purchase,
      pricePerMonth: row.price_per_month,
      estimatedCost: row.estimated_cost,
      yearlyEstimate: row.yearly_estimate,
      active: row.active === 1,
      visible: row.visible === 1,
      seasonalTag: row.seasonal_tag,
      order: row.order,
      notes: row.notes,
    };
  }

  private parseSpendingEntry(row: any): SpendingEntry {
    return {
      id: row.id,
      year: row.year_id, // Note: should be parsed from year_id relationship
      month: row.month,
      week: row.week,
      date: row.date,
      categoryId: row.category_id,
      activityId: row.activity_id,
      amount: row.amount,
      currency: row.currency,
      recurrenceType: row.recurrence_type,
      isPiloting: row.is_piloting === 1,
      source: row.source,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseWishlistItem(row: any): WishlistItem {
    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      actualPrice: row.actual_price,
      effectiveValue: row.effective_value,
      currency: row.currency,
      bought: row.bought === 1,
      inWishlist: row.in_wishlist === 1,
      priority: row.priority,
      dateAdded: row.date_added,
      datePurchased: row.date_purchased,
      notes: row.notes,
      active: row.active === 1,
    };
  }

  private parseWalletEntry(row: any): WalletEntry {
    return {
      id: row.id,
      year: row.year_id, // Note: should be parsed from year_id relationship
      month: row.month,
      amount: row.amount,
      currency: row.currency,
      source: row.source,
      type: row.type,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  private parseMonthCloseRecord(row: any): MonthCloseRecord {
    return {
      id: row.id,
      year: row.year_id, // Note: should be parsed from year_id relationship
      month: row.month,
      status: row.status,
      spendTotal: row.spend_total,
      delta: row.delta,
      rolloverWalletEntryId: row.rollover_wallet_entry_id,
      confirmedAt: row.confirmed_at,
      note: row.note,
    };
  }
}
