import { getDatabase } from "../db";
import { query as execQuery } from "../db/queryHelper";
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
  SeasonalPreset,
  ScenarioPreset,
} from "@/domain/types";

export class SnapshotRepository {
  constructor(private sql = getDatabase()) {}

  private async query(sqlString: string, params: unknown[] = []): Promise<Record<string, any>[]> {
    return execQuery(this.sql, sqlString, params);
  }

  async loadSnapshot(snapshotId: string = "active"): Promise<BudgetSnapshot | null> {
    const rows = await this.query("SELECT * FROM snapshots WHERE id = $1", [snapshotId]);
    const row = rows[0];

    if (!row) return null;

    const settings = JSON.parse(row.settings);
    const categories = await this.loadCategories(snapshotId);
    const seasonalPresets = await this.loadSeasonalPresets(snapshotId);
    const scenarioPresets = await this.loadScenarioPresets(snapshotId);
    const budgetApprovals = await this.loadBudgetApprovals();
    const auditLog = await this.loadAuditLog(snapshotId);

    const yearsData = await this.query("SELECT id, year FROM years WHERE snapshot_id = $1", [snapshotId]);

    const years: Record<string, YearRecord> = {};
    for (const yearRow of yearsData) {
      const yearRecord = await this.loadYearRecord(yearRow.id);
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

  async saveSnapshot(snapshot: BudgetSnapshot, snapshotId: string = "active"): Promise<void> {
    const now = new Date().toISOString();

    // Upsert snapshot
    await this.query(`
      INSERT INTO snapshots (id, version, settings, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        version = EXCLUDED.version,
        settings = EXCLUDED.settings,
        updated_at = EXCLUDED.updated_at
    `, [snapshotId, snapshot.version, JSON.stringify(snapshot.settings), now, now]);

    // Categories
    for (const category of snapshot.categories) {
      await this.query(`
        INSERT INTO categories
        (id, snapshot_id, name, bucket, color, monthly_cap, notes, archived, icon, description, parent_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          bucket = EXCLUDED.bucket,
          color = EXCLUDED.color,
          monthly_cap = EXCLUDED.monthly_cap,
          notes = EXCLUDED.notes,
          archived = EXCLUDED.archived,
          icon = EXCLUDED.icon,
          description = EXCLUDED.description,
          parent_id = EXCLUDED.parent_id
      `, [
        category.id,
        snapshotId,
        category.name,
        category.bucket,
        category.color,
        category.monthlyCap ?? null,
        category.notes ?? null,
        category.archived ? 1 : 0,
        category.icon ?? null,
        category.description ?? null,
        category.parentId ?? null,
      ]);
    }

    // Years and nested data
    for (const yearRecord of Object.values(snapshot.years)) {
      await this.saveYearRecord(snapshotId, yearRecord, now);
    }

    // Presets
    for (const preset of snapshot.seasonalPresets) {
      await this.query(`
        INSERT INTO seasonal_presets
        (id, snapshot_id, name, season, activity_overrides, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          season = EXCLUDED.season,
          activity_overrides = EXCLUDED.activity_overrides,
          notes = EXCLUDED.notes
      `, [preset.id, snapshotId, preset.name, preset.season, JSON.stringify(preset.activityOverrides), preset.notes]);
    }

    for (const preset of snapshot.scenarioPresets) {
      await this.query(`
        INSERT INTO scenario_presets
        (id, snapshot_id, name, monthly_budget, pilot_included_in_budget, category_caps, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          monthly_budget = EXCLUDED.monthly_budget,
          pilot_included_in_budget = EXCLUDED.pilot_included_in_budget,
          category_caps = EXCLUDED.category_caps,
          notes = EXCLUDED.notes
      `, [
        preset.id,
        snapshotId,
        preset.name,
        preset.monthlyBudget ?? null,
        preset.pilotIncludedInBudget ? 1 : 0,
        preset.categoryCaps ? JSON.stringify(preset.categoryCaps) : null,
        preset.notes,
      ]);
    }

    // Budget approvals
    for (const approval of snapshot.budgetApprovals) {
      await this.query(`
        INSERT INTO budget_approvals
        (id, year, month, suggested_amount, approved_amount, currency, status, recurring_total, note, created_at, decided_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          suggested_amount = EXCLUDED.suggested_amount,
          approved_amount = EXCLUDED.approved_amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          recurring_total = EXCLUDED.recurring_total,
          note = EXCLUDED.note,
          decided_at = EXCLUDED.decided_at
      `, [
        approval.id,
        approval.year,
        approval.month,
        approval.suggestedAmount,
        approval.approvedAmount ?? null,
        approval.currency,
        approval.status,
        approval.recurringTotal,
        approval.note ?? null,
        approval.createdAt,
        approval.decidedAt,
      ]);
    }

    // Audit log
    for (const log of snapshot.auditLog) {
      await this.query(`
        INSERT INTO audit_log
        (id, snapshot_id, type, summary, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          summary = EXCLUDED.summary,
          metadata = EXCLUDED.metadata
      `, [log.id, snapshotId, log.type, log.summary, log.metadata ? JSON.stringify(log.metadata) : null, log.createdAt]);
    }
  }

  private async saveYearRecord(snapshotId: string, yearRecord: YearRecord, now: string): Promise<void> {
    const existingYears = await this.query("SELECT id FROM years WHERE snapshot_id = $1 AND year = $2", [snapshotId, yearRecord.year]);
    let yearId: string;

    if (existingYears.length === 0) {
      yearId = `year-${snapshotId}-${yearRecord.year}-${Date.now()}`;
      await this.query(`
        INSERT INTO years (id, snapshot_id, year, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [yearId, snapshotId, yearRecord.year, yearRecord.createdAt, now]);
    } else {
      yearId = existingYears[0].id;
      await this.query("UPDATE years SET updated_at = $1 WHERE id = $2", [now, yearId]);
    }

    // Activities
    await this.query("DELETE FROM activities WHERE year_id = $1", [yearId]);
    for (const activity of yearRecord.activities) {
      await this.query(`
        INSERT INTO activities
        (id, year_id, name, category_id, currency, recurrence_type, recurrence_interval,
         price_per_session, price_per_purchase, price_per_month, estimated_cost, yearly_estimate,
         active, visible, seasonal_tag, "order", notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
        activity.id,
        yearId,
        activity.name,
        activity.categoryId,
        activity.currency,
        activity.recurrenceType,
        activity.recurrenceInterval,
        activity.pricePerSession ?? null,
        activity.pricePerPurchase ?? null,
        activity.pricePerMonth ?? null,
        activity.estimatedCost ?? null,
        activity.yearlyEstimate ?? null,
        activity.active ? 1 : 0,
        activity.visible ? 1 : 0,
        activity.seasonalTag,
        activity.order,
        activity.notes || "",
        now,
        now,
      ]);
    }

    // Spending entries
    await this.query("DELETE FROM spending_entries WHERE year_id = $1", [yearId]);
    for (const entry of yearRecord.spendingEntries) {
      await this.query(`
        INSERT INTO spending_entries
        (id, year_id, month, week, date, category_id, activity_id, amount, currency,
         recurrence_type, is_piloting, source, note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        entry.id,
        yearId,
        entry.month,
        entry.week,
        entry.date,
        entry.categoryId,
        entry.activityId ?? null,
        entry.amount,
        entry.currency,
        entry.recurrenceType,
        entry.isPiloting ? 1 : 0,
        entry.source || "personal",
        entry.note ?? null,
        entry.createdAt,
        entry.updatedAt,
      ]);
    }

    // Wishlist items
    await this.query("DELETE FROM wishlist_items WHERE year_id = $1", [yearId]);
    for (const item of yearRecord.wishlistItems) {
      await this.query(`
        INSERT INTO wishlist_items
        (id, year_id, name, category_id, actual_price, effective_value, currency,
         bought, in_wishlist, priority, date_added, date_purchased, notes, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        item.id,
        yearId,
        item.name,
        item.categoryId,
        item.actualPrice ?? null,
        item.effectiveValue ?? null,
        item.currency,
        item.bought ? 1 : 0,
        item.inWishlist ? 1 : 0,
        item.priority,
        item.dateAdded,
        item.datePurchased ?? null,
        item.notes ?? null,
        item.active ? 1 : 0,
        now,
        now,
      ]);
    }

    // Wallet entries
    await this.query("DELETE FROM wallet_entries WHERE year_id = $1", [yearId]);
    for (const entry of yearRecord.walletEntries) {
      await this.query(`
        INSERT INTO wallet_entries (id, year_id, month, amount, currency, source, type, note, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        entry.id,
        yearId,
        entry.month,
        entry.amount,
        entry.currency,
        entry.source,
        entry.type,
        entry.note ?? null,
        entry.createdAt,
      ]);
    }

    // Closed months
    await this.query("DELETE FROM closed_months WHERE year_id = $1", [yearId]);
    for (const record of yearRecord.closedMonths) {
      await this.query(`
        INSERT INTO closed_months (id, year_id, month, status, spend_total, delta, rollover_wallet_entry_id, confirmed_at, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        record.id,
        yearId,
        record.month,
        record.status,
        record.spendTotal ?? null,
        record.delta ?? null,
        record.rolloverWalletEntryId ?? null,
        record.confirmedAt,
        record.note ?? null,
      ]);
    }
  }

  private async loadYearRecord(yearId: string): Promise<YearRecord | null> {
    const yearRows = await this.query("SELECT * FROM years WHERE id = $1", [yearId]);
    const yearRow = yearRows[0];

    if (!yearRow) return null;

    const activities = await this.query('SELECT * FROM activities WHERE year_id = $1 ORDER BY "order"', [yearId]);
    const spendingEntries = await this.query("SELECT * FROM spending_entries WHERE year_id = $1", [yearId]);
    const wishlistItems = await this.query("SELECT * FROM wishlist_items WHERE year_id = $1", [yearId]);
    const walletEntries = await this.query("SELECT * FROM wallet_entries WHERE year_id = $1", [yearId]);
    const closedMonths = await this.query("SELECT * FROM closed_months WHERE year_id = $1", [yearId]);

    return {
      year: yearRow.year,
      activities: activities.map((a) => this.parseActivity(a)),
      spendingEntries: spendingEntries.map((e) => this.parseSpendingEntry(e)),
      wishlistItems: wishlistItems.map((i) => this.parseWishlistItem(i)),
      walletEntries: walletEntries.map((e) => this.parseWalletEntry(e)),
      closedMonths: closedMonths.map((r) => this.parseMonthCloseRecord(r)),
      monthlyNotes: {},
      createdAt: yearRow.created_at,
      updatedAt: yearRow.updated_at,
    };
  }

  private async loadCategories(snapshotId: string): Promise<BudgetCategory[]> {
    const rows = await this.query("SELECT * FROM categories WHERE snapshot_id = $1 ORDER BY name", [snapshotId]);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      bucket: r.bucket,
      color: r.color,
      monthlyCap: r.monthly_cap ?? undefined,
      notes: r.notes ?? undefined,
      archived: r.archived === 1 || r.archived === true,
      icon: r.icon ?? undefined,
      description: r.description ?? undefined,
      parentId: r.parent_id ?? undefined,
    }));
  }

  private async loadSeasonalPresets(snapshotId: string): Promise<SeasonalPreset[]> {
    const rows = await this.query("SELECT * FROM seasonal_presets WHERE snapshot_id = $1", [snapshotId]);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      season: r.season,
      activityOverrides: JSON.parse(r.activity_overrides),
      notes: r.notes ?? undefined,
    }));
  }

  private async loadScenarioPresets(snapshotId: string): Promise<ScenarioPreset[]> {
    const rows = await this.query("SELECT * FROM scenario_presets WHERE snapshot_id = $1", [snapshotId]);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      monthlyBudget: r.monthly_budget ?? undefined,
      pilotIncludedInBudget: r.pilot_included_in_budget === 1 || r.pilot_included_in_budget === true,
      categoryCaps: r.category_caps ? JSON.parse(r.category_caps) : undefined,
      notes: r.notes ?? undefined,
    }));
  }

  private async loadBudgetApprovals(): Promise<BudgetApproval[]> {
    const rows = await this.query("SELECT * FROM budget_approvals ORDER BY decided_at DESC");

    return rows.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      suggestedAmount: r.suggested_amount,
      approvedAmount: r.approved_amount ?? null,
      currency: r.currency,
      status: r.status,
      recurringTotal: r.recurring_total,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      note: r.note ?? undefined,
    }));
  }

  private async loadAuditLog(snapshotId: string): Promise<AuditLog[]> {
    const rows = await this.query("SELECT * FROM audit_log WHERE snapshot_id = $1 ORDER BY created_at DESC LIMIT 500", [snapshotId]);

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
      recurrenceInterval: Number(row.recurrence_interval),
      pricePerSession: row.price_per_session != null ? Number(row.price_per_session) : null,
      pricePerPurchase: row.price_per_purchase != null ? Number(row.price_per_purchase) : null,
      pricePerMonth: row.price_per_month != null ? Number(row.price_per_month) : null,
      estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : null,
      yearlyEstimate: row.yearly_estimate != null ? Number(row.yearly_estimate) : null,
      active: row.active === 1 || row.active === true,
      visible: row.visible === 1 || row.visible === true,
      seasonalTag: row.seasonal_tag,
      order: Number(row.order),
      notes: row.notes || "",
    };
  }

  private parseSpendingEntry(row: any): SpendingEntry {
    return {
      id: row.id,
      year: Number(row.year_id.split("-").pop()) || 2026,
      month: Number(row.month),
      week: Number(row.week),
      date: row.date,
      categoryId: row.category_id,
      activityId: row.activity_id ?? undefined,
      amount: Number(row.amount),
      currency: row.currency,
      recurrenceType: row.recurrence_type,
      isPiloting: row.is_piloting === 1 || row.is_piloting === true,
      source: row.source,
      note: row.note ?? "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseWishlistItem(row: any): WishlistItem {
    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      actualPrice: row.actual_price != null ? Number(row.actual_price) : null,
      effectiveValue: row.effective_value != null ? Number(row.effective_value) : 0,
      currency: row.currency,
      bought: row.bought === 1 || row.bought === true,
      inWishlist: row.in_wishlist === 1 || row.in_wishlist === true,
      priority: row.priority,
      dateAdded: row.date_added,
      datePurchased: row.date_purchased ?? undefined,
      notes: row.notes ?? "",
      active: row.active === 1 || row.active === true,
    };
  }

  private parseWalletEntry(row: any): WalletEntry {
    return {
      id: row.id,
      year: Number(row.year_id.split("-").pop()) || 2026,
      month: Number(row.month),
      amount: Number(row.amount),
      currency: row.currency,
      source: row.source,
      type: row.type,
      note: row.note ?? "",
      createdAt: row.created_at,
    };
  }

  private parseMonthCloseRecord(row: any): MonthCloseRecord {
    return {
      id: row.id,
      year: Number(row.year_id.split("-").pop()) || 2026,
      month: Number(row.month),
      status: row.status,
      spendTotal: row.spend_total != null ? Number(row.spend_total) : null,
      delta: row.delta != null ? Number(row.delta) : null,
      rolloverWalletEntryId: row.rollover_wallet_entry_id ?? undefined,
      confirmedAt: row.confirmed_at,
      note: row.note ?? "",
    };
  }
}
