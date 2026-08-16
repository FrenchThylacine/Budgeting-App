import { getDatabase } from "../db/index.js";
import { query as execQuery } from "../db/queryHelper.js";
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
  ScheduleOverride,
} from "../../../src/domain/types.js";

interface PendingQuery {
  text: string;
  params: unknown[];
}

/**
 * One-off schedule exceptions, stored as a JSON array.
 *
 * Entries without a usable date are dropped rather than throwing. The
 * alternative — one malformed override making the whole budget unloadable — is
 * a far worse failure than silently losing an exception, and the activity still
 * has its recurring rule.
 */
function parseScheduleOverrides(raw: unknown): ScheduleOverride[] | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const valid = parsed.filter(
      (entry): entry is ScheduleOverride =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.date === "string" &&
        ["skip", "move", "extra", "price"].includes(entry.kind),
    );
    return valid.length > 0 ? valid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Weekday sets are stored as a JSON array. A malformed value is treated as
 * "no schedule" rather than throwing: one bad row must not make the whole
 * snapshot unloadable.
 */
function parseWeekdays(raw: unknown): Activity["weekdays"] {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const days = parsed.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    return days.length > 0 ? (days as Activity["weekdays"]) : undefined;
  } catch {
    return undefined;
  }
}

export class SnapshotRepository {
  constructor(private sql = getDatabase()) {}

  private async query(sqlString: string, params: unknown[] = []): Promise<Record<string, any>[]> {
    return execQuery(this.sql, sqlString, params);
  }

  /** Build an unexecuted Neon query for batched transaction execution. */
  private buildQuery(text: string, params: unknown[]): unknown {
    const parts = text.split(/\$\d+/);
    const strings = Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
    return (this.sql as any)(strings, ...params);
  }

  /**
   * Execute all pending writes atomically. The Neon HTTP driver exposes
   * `sql.transaction([...])` which runs the batch inside one transaction.
   * When the driver (or a test double) has no transaction support, fall back
   * to sequential execution.
   */
  private async executeWrites(writes: PendingQuery[]): Promise<void> {
    const sqlAny = this.sql as any;
    if (typeof sqlAny.transaction === "function") {
      await sqlAny.transaction(writes.map((w) => this.buildQuery(w.text, w.params)));
      return;
    }
    for (const w of writes) {
      await this.query(w.text, w.params);
    }
  }

  /** Read only the stored revision counter (cheap concurrency check). */
  async loadRevision(snapshotId: string = "active"): Promise<number | null> {
    const rows = await this.query("SELECT revision FROM snapshots WHERE id = $1", [snapshotId]);
    if (!rows[0]) return null;
    const revision = Number(rows[0].revision);
    return Number.isFinite(revision) ? revision : 0;
  }

  async loadSnapshot(snapshotId: string = "active"): Promise<BudgetSnapshot | null> {
    const rows = await this.query("SELECT * FROM snapshots WHERE id = $1", [snapshotId]);
    const row = rows[0];

    if (!row) return null;

    const settings = JSON.parse(row.settings);
    const categories = await this.loadCategories(snapshotId);
    const seasonalPresets = await this.loadSeasonalPresets(snapshotId);
    const scenarioPresets = await this.loadScenarioPresets(snapshotId);
    const budgetApprovals = await this.loadBudgetApprovals(snapshotId);
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
      revision: row.revision != null ? Number(row.revision) : 0,
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
    const writes: PendingQuery[] = [];

    // Resolve stable year-row ids up front so every write below can be
    // batched into a single transaction.
    const yearIds = new Map<number, { id: string; exists: boolean }>();
    for (const yearRecord of Object.values(snapshot.years)) {
      const existing = await this.query(
        "SELECT id FROM years WHERE snapshot_id = $1 AND year = $2",
        [snapshotId, yearRecord.year],
      );
      if (existing.length > 0) {
        yearIds.set(yearRecord.year, { id: existing[0].id, exists: true });
      } else {
        yearIds.set(yearRecord.year, { id: `year-${snapshotId}-${yearRecord.year}`, exists: false });
      }
    }

    // Snapshot upsert (revision participates in optimistic concurrency).
    writes.push({
      text: `
      INSERT INTO snapshots (id, version, revision, settings, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        version = EXCLUDED.version,
        revision = EXCLUDED.revision,
        settings = EXCLUDED.settings,
        updated_at = EXCLUDED.updated_at
    `,
      params: [snapshotId, snapshot.version, snapshot.revision ?? 0, JSON.stringify(snapshot.settings), now, now],
    });

    // Categories
    for (const category of snapshot.categories) {
      writes.push({
        text: `
        INSERT INTO categories
        (id, snapshot_id, name, bucket, color, monthly_cap, notes, archived, icon, description, parent_id, seed_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          bucket = EXCLUDED.bucket,
          color = EXCLUDED.color,
          monthly_cap = EXCLUDED.monthly_cap,
          notes = EXCLUDED.notes,
          archived = EXCLUDED.archived,
          icon = EXCLUDED.icon,
          description = EXCLUDED.description,
          parent_id = EXCLUDED.parent_id,
          seed_key = EXCLUDED.seed_key
        WHERE categories.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [
          category.id,
          snapshotId,
          category.name,
          category.bucket,
          category.color,
          category.monthlyCap ?? null,
          category.notes ?? null,
          category.archived === true,
          category.icon ?? null,
          category.description ?? null,
          category.parentId ?? null,
          category.seedKey ?? null,
        ],
      });
    }
    // Dropping categories has to wait until the rows that point at them have
    // been rewritten.
    //
    // `activities.category_id`, `spending_entries.category_id` and
    // `wishlist_items.category_id` are all ON DELETE RESTRICT, and PostgreSQL
    // checks them statement by statement rather than at commit. Deleting a
    // category here — before the year writes below replace the activities that
    // reference it — aborts the whole transaction with a bare foreign-key
    // error. That is exactly what happens when a budget's category set is
    // wholly replaced, which is what an Excel import or a reset to seed does.
    const catIds = snapshot.categories.map((c) => c.id);
    const deleteRemovedCategories: PendingQuery =
      catIds.length > 0
        ? {
            text: `DELETE FROM categories WHERE snapshot_id = $1 AND id NOT IN (${catIds.map((_, i) => `$${i + 2}`).join(", ")})`,
            params: [snapshotId, ...catIds],
          }
        : { text: "DELETE FROM categories WHERE snapshot_id = $1", params: [snapshotId] };

    // Years and nested data
    for (const yearRecord of Object.values(snapshot.years)) {
      const yearInfo = yearIds.get(yearRecord.year)!;
      this.collectYearWrites(writes, snapshotId, yearRecord, yearInfo, now);
    }
    const activeYearNums = Object.values(snapshot.years).map((y) => y.year);
    if (activeYearNums.length > 0) {
      writes.push({
        text: `DELETE FROM years WHERE snapshot_id = $1 AND year NOT IN (${activeYearNums.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [snapshotId, ...activeYearNums],
      });
    }

    // Safe now: every row that could reference a category has been rewritten,
    // and dropping a year cascades to its children.
    writes.push(deleteRemovedCategories);

    // Presets
    for (const preset of snapshot.seasonalPresets) {
      writes.push({
        text: `
        INSERT INTO seasonal_presets
        (id, snapshot_id, name, season, activity_overrides, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          season = EXCLUDED.season,
          activity_overrides = EXCLUDED.activity_overrides,
          notes = EXCLUDED.notes
        WHERE seasonal_presets.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [preset.id, snapshotId, preset.name, preset.season, JSON.stringify(preset.activityOverrides), preset.notes],
      });
    }
    const seasonalIds = snapshot.seasonalPresets.map((p) => p.id);
    if (seasonalIds.length > 0) {
      writes.push({
        text: `DELETE FROM seasonal_presets WHERE snapshot_id = $1 AND id NOT IN (${seasonalIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [snapshotId, ...seasonalIds],
      });
    } else {
      writes.push({ text: "DELETE FROM seasonal_presets WHERE snapshot_id = $1", params: [snapshotId] });
    }

    for (const preset of snapshot.scenarioPresets) {
      writes.push({
        text: `
        INSERT INTO scenario_presets
        (id, snapshot_id, name, monthly_budget, pilot_included_in_budget, category_caps, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          monthly_budget = EXCLUDED.monthly_budget,
          pilot_included_in_budget = EXCLUDED.pilot_included_in_budget,
          category_caps = EXCLUDED.category_caps,
          notes = EXCLUDED.notes
        WHERE scenario_presets.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [
          preset.id,
          snapshotId,
          preset.name,
          preset.monthlyBudget ?? null,
          preset.pilotIncludedInBudget === true,
          preset.categoryCaps ? JSON.stringify(preset.categoryCaps) : null,
          preset.notes,
        ],
      });
    }
    const scenarioIds = snapshot.scenarioPresets.map((p) => p.id);
    if (scenarioIds.length > 0) {
      writes.push({
        text: `DELETE FROM scenario_presets WHERE snapshot_id = $1 AND id NOT IN (${scenarioIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [snapshotId, ...scenarioIds],
      });
    } else {
      writes.push({ text: "DELETE FROM scenario_presets WHERE snapshot_id = $1", params: [snapshotId] });
    }

    // Budget approvals are historical records: upsert only, never delete.
    for (const approval of snapshot.budgetApprovals) {
      writes.push({
        text: `
        INSERT INTO budget_approvals
        (id, snapshot_id, year, month, suggested_amount, approved_amount, currency, status, recurring_total, note, created_at, decided_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          suggested_amount = EXCLUDED.suggested_amount,
          approved_amount = EXCLUDED.approved_amount,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          recurring_total = EXCLUDED.recurring_total,
          note = EXCLUDED.note,
          decided_at = EXCLUDED.decided_at
        WHERE budget_approvals.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [
          approval.id,
          snapshotId,
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
        ],
      });
    }

    // Audit log (append-style upsert; historical rows are preserved).
    for (const log of snapshot.auditLog) {
      writes.push({
        text: `
        INSERT INTO audit_log
        (id, snapshot_id, type, summary, metadata, historical_edit, historical_period, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          summary = EXCLUDED.summary,
          metadata = EXCLUDED.metadata,
          historical_edit = EXCLUDED.historical_edit,
          historical_period = EXCLUDED.historical_period
        WHERE audit_log.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [
          log.id,
          snapshotId,
          log.type,
          log.summary,
          log.metadata ? JSON.stringify(log.metadata) : null,
          log.historicalEdit === true,
          log.historicalPeriod ?? null,
          log.createdAt,
        ],
      });
    }

    await this.executeWrites(writes);
  }

  private collectYearWrites(
    writes: PendingQuery[],
    snapshotId: string,
    yearRecord: YearRecord,
    yearInfo: { id: string; exists: boolean },
    now: string,
  ): void {
    const yearId = yearInfo.id;

    if (!yearInfo.exists) {
      writes.push({
        text: `
        INSERT INTO years (id, snapshot_id, year, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
        WHERE years.snapshot_id = EXCLUDED.snapshot_id
      `,
        params: [yearId, snapshotId, yearRecord.year, yearRecord.createdAt, now],
      });
    } else {
      writes.push({ text: "UPDATE years SET updated_at = $1 WHERE id = $2", params: [now, yearId] });
    }

    // Activities - Upsert and delete missing
    for (const activity of yearRecord.activities) {
      writes.push({
        text: `
        INSERT INTO activities
        (id, year_id, name, category_id, currency, recurrence_type, recurrence_interval,
         price_per_session, price_per_purchase, price_per_month, estimated_cost, yearly_estimate,
         active, visible, seasonal_tag, "order", notes,
         icon, color, cost_model, sessions_per_month, weekdays, day_of_month, start_date,
         schedule_overrides,
         created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category_id = EXCLUDED.category_id,
          currency = EXCLUDED.currency,
          recurrence_type = EXCLUDED.recurrence_type,
          recurrence_interval = EXCLUDED.recurrence_interval,
          price_per_session = EXCLUDED.price_per_session,
          price_per_purchase = EXCLUDED.price_per_purchase,
          price_per_month = EXCLUDED.price_per_month,
          estimated_cost = EXCLUDED.estimated_cost,
          yearly_estimate = EXCLUDED.yearly_estimate,
          active = EXCLUDED.active,
          visible = EXCLUDED.visible,
          seasonal_tag = EXCLUDED.seasonal_tag,
          "order" = EXCLUDED."order",
          notes = EXCLUDED.notes,
          icon = EXCLUDED.icon,
          color = EXCLUDED.color,
          cost_model = EXCLUDED.cost_model,
          sessions_per_month = EXCLUDED.sessions_per_month,
          weekdays = EXCLUDED.weekdays,
          day_of_month = EXCLUDED.day_of_month,
          start_date = EXCLUDED.start_date,
          schedule_overrides = EXCLUDED.schedule_overrides,
          updated_at = EXCLUDED.updated_at
        WHERE activities.year_id = EXCLUDED.year_id
      `,
        params: [
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
          activity.active === true,
          activity.visible === true,
          activity.seasonalTag,
          activity.order,
          activity.notes || "",
          activity.icon ?? null,
          activity.color ?? null,
          activity.costModel ?? null,
          activity.sessionsPerMonth ?? null,
          // Weekday sets are small and read as a unit, so JSON keeps the
          // schema simple without needing a join table.
          activity.weekdays && activity.weekdays.length > 0 ? JSON.stringify(activity.weekdays) : null,
          activity.dayOfMonth ?? null,
          activity.startDate ?? null,
          // Overrides are a small list read as a unit with the activity, so
          // JSON keeps the schema simple without a join table — the same
          // reasoning as weekdays above.
          activity.scheduleOverrides && activity.scheduleOverrides.length > 0
            ? JSON.stringify(activity.scheduleOverrides)
            : null,
          now,
          now,
        ],
      });
    }
    const actIds = yearRecord.activities.map((a) => a.id);
    if (actIds.length > 0) {
      writes.push({
        text: `DELETE FROM activities WHERE year_id = $1 AND id NOT IN (${actIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [yearId, ...actIds],
      });
    } else {
      writes.push({ text: "DELETE FROM activities WHERE year_id = $1", params: [yearId] });
    }

    // Spending entries - Upsert and delete missing
    for (const entry of yearRecord.spendingEntries) {
      writes.push({
        text: `
        INSERT INTO spending_entries
        (id, year_id, month, week, date, category_id, activity_id, amount, currency,
         recurrence_type, is_piloting, source, note, wishlist_item_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          month = EXCLUDED.month,
          week = EXCLUDED.week,
          date = EXCLUDED.date,
          category_id = EXCLUDED.category_id,
          activity_id = EXCLUDED.activity_id,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          recurrence_type = EXCLUDED.recurrence_type,
          is_piloting = EXCLUDED.is_piloting,
          source = EXCLUDED.source,
          note = EXCLUDED.note,
          wishlist_item_id = EXCLUDED.wishlist_item_id,
          updated_at = EXCLUDED.updated_at
        WHERE spending_entries.year_id = EXCLUDED.year_id
      `,
        params: [
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
          entry.isPiloting === true,
          entry.source || "personal",
          entry.note ?? null,
          entry.wishlistItemId ?? null,
          entry.createdAt,
          entry.updatedAt,
        ],
      });
    }
    const spendIds = yearRecord.spendingEntries.map((e) => e.id);
    if (spendIds.length > 0) {
      writes.push({
        text: `DELETE FROM spending_entries WHERE year_id = $1 AND id NOT IN (${spendIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [yearId, ...spendIds],
      });
    } else {
      writes.push({ text: "DELETE FROM spending_entries WHERE year_id = $1", params: [yearId] });
    }

    // Wishlist items - Upsert and delete missing
    for (const item of yearRecord.wishlistItems) {
      writes.push({
        text: `
        INSERT INTO wishlist_items
        (id, year_id, name, category_id, actual_price, effective_value, currency,
         bought, in_wishlist, priority, date_added, date_purchased, notes, active,
         url, brand_url, icon, color, linked_spending_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          category_id = EXCLUDED.category_id,
          actual_price = EXCLUDED.actual_price,
          effective_value = EXCLUDED.effective_value,
          currency = EXCLUDED.currency,
          bought = EXCLUDED.bought,
          in_wishlist = EXCLUDED.in_wishlist,
          priority = EXCLUDED.priority,
          date_added = EXCLUDED.date_added,
          date_purchased = EXCLUDED.date_purchased,
          notes = EXCLUDED.notes,
          active = EXCLUDED.active,
          url = EXCLUDED.url,
          brand_url = EXCLUDED.brand_url,
          icon = EXCLUDED.icon,
          color = EXCLUDED.color,
          linked_spending_id = EXCLUDED.linked_spending_id,
          updated_at = EXCLUDED.updated_at
        WHERE wishlist_items.year_id = EXCLUDED.year_id
      `,
        params: [
          item.id,
          yearId,
          item.name,
          item.categoryId,
          item.actualPrice ?? null,
          item.effectiveValue ?? null,
          item.currency,
          item.bought === true,
          item.inWishlist === true,
          item.priority,
          item.dateAdded,
          item.datePurchased ?? null,
          item.notes ?? null,
          item.active === true,
          item.url ?? null,
          item.brandUrl ?? null,
          item.icon ?? null,
          item.color ?? null,
          item.linkedSpendingId ?? null,
          now,
          now,
        ],
      });
    }
    const wishIds = yearRecord.wishlistItems.map((i) => i.id);
    if (wishIds.length > 0) {
      writes.push({
        text: `DELETE FROM wishlist_items WHERE year_id = $1 AND id NOT IN (${wishIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [yearId, ...wishIds],
      });
    } else {
      writes.push({ text: "DELETE FROM wishlist_items WHERE year_id = $1", params: [yearId] });
    }

    // Wallet entries - Upsert and delete missing
    for (const entry of yearRecord.walletEntries) {
      writes.push({
        text: `
        INSERT INTO wallet_entries (id, year_id, month, amount, currency, source, type, note, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          month = EXCLUDED.month,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          source = EXCLUDED.source,
          type = EXCLUDED.type,
          note = EXCLUDED.note
        WHERE wallet_entries.year_id = EXCLUDED.year_id
      `,
        params: [
          entry.id,
          yearId,
          entry.month,
          entry.amount,
          entry.currency,
          entry.source,
          entry.type,
          entry.note ?? null,
          entry.createdAt,
        ],
      });
    }
    const walletIds = yearRecord.walletEntries.map((e) => e.id);
    if (walletIds.length > 0) {
      writes.push({
        text: `DELETE FROM wallet_entries WHERE year_id = $1 AND id NOT IN (${walletIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [yearId, ...walletIds],
      });
    } else {
      writes.push({ text: "DELETE FROM wallet_entries WHERE year_id = $1", params: [yearId] });
    }

    // Closed months - Upsert and delete missing
    for (const record of yearRecord.closedMonths) {
      writes.push({
        text: `
        INSERT INTO closed_months (id, year_id, month, status, spend_total, delta, rollover_wallet_entry_id, confirmed_at, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          month = EXCLUDED.month,
          status = EXCLUDED.status,
          spend_total = EXCLUDED.spend_total,
          delta = EXCLUDED.delta,
          rollover_wallet_entry_id = EXCLUDED.rollover_wallet_entry_id,
          confirmed_at = EXCLUDED.confirmed_at,
          note = EXCLUDED.note
        WHERE closed_months.year_id = EXCLUDED.year_id
      `,
        params: [
          record.id,
          yearId,
          record.month,
          record.status,
          record.spendTotal ?? null,
          record.delta ?? null,
          record.rolloverWalletEntryId ?? null,
          record.confirmedAt,
          record.note ?? null,
        ],
      });
    }
    const closedIds = yearRecord.closedMonths.map((r) => r.id);
    if (closedIds.length > 0) {
      writes.push({
        text: `DELETE FROM closed_months WHERE year_id = $1 AND id NOT IN (${closedIds.map((_, i) => `$${i + 2}`).join(", ")})`,
        params: [yearId, ...closedIds],
      });
    } else {
      writes.push({ text: "DELETE FROM closed_months WHERE year_id = $1", params: [yearId] });
    }
  }

  private async loadYearRecord(yearId: string): Promise<YearRecord | null> {
    const yearRows = await this.query("SELECT * FROM years WHERE id = $1", [yearId]);
    const yearRow = yearRows[0];

    if (!yearRow) return null;

    const year = Number(yearRow.year);

    const activities = await this.query('SELECT * FROM activities WHERE year_id = $1 ORDER BY "order"', [yearId]);
    const spendingEntries = await this.query("SELECT * FROM spending_entries WHERE year_id = $1", [yearId]);
    const wishlistItems = await this.query("SELECT * FROM wishlist_items WHERE year_id = $1", [yearId]);
    const walletEntries = await this.query("SELECT * FROM wallet_entries WHERE year_id = $1", [yearId]);
    const closedMonths = await this.query("SELECT * FROM closed_months WHERE year_id = $1", [yearId]);

    return {
      year,
      activities: activities.map((a) => this.parseActivity(a)),
      spendingEntries: spendingEntries.map((e) => this.parseSpendingEntry(e, year)),
      wishlistItems: wishlistItems.map((i) => this.parseWishlistItem(i)),
      walletEntries: walletEntries.map((e) => this.parseWalletEntry(e, year)),
      closedMonths: closedMonths.map((r) => this.parseMonthCloseRecord(r, year)),
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
      seedKey: r.seed_key ?? undefined,
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

  /**
   * Approvals belonging to one budget.
   *
   * This used to read the whole table with no WHERE clause, which was harmless
   * while exactly one budget existed and a straight cross-account disclosure of
   * permanent financial records the moment a second one did.
   */
  private async loadBudgetApprovals(snapshotId: string): Promise<BudgetApproval[]> {
    const rows = await this.query(
      "SELECT * FROM budget_approvals WHERE snapshot_id = $1 ORDER BY decided_at DESC",
      [snapshotId],
    );

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
      historicalEdit: r.historical_edit === true || r.historical_edit === 1,
      historicalPeriod: r.historical_period ?? undefined,
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
      icon: row.icon ?? undefined,
      color: row.color ?? undefined,
      costModel: row.cost_model ?? undefined,
      sessionsPerMonth: row.sessions_per_month != null ? Number(row.sessions_per_month) : undefined,
      weekdays: parseWeekdays(row.weekdays),
      dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : undefined,
      startDate: row.start_date ?? undefined,
      scheduleOverrides: parseScheduleOverrides(row.schedule_overrides),
    };
  }

  private parseSpendingEntry(row: any, year: number): SpendingEntry {
    return {
      id: row.id,
      year,
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
      wishlistItemId: row.wishlist_item_id ?? undefined,
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
      url: row.url ?? undefined,
      brandUrl: row.brand_url ?? undefined,
      icon: row.icon ?? undefined,
      color: row.color ?? undefined,
      linkedSpendingId: row.linked_spending_id ?? undefined,
    };
  }

  private parseWalletEntry(row: any, year: number): WalletEntry {
    return {
      id: row.id,
      year,
      month: Number(row.month),
      amount: Number(row.amount),
      currency: row.currency,
      source: row.source,
      type: row.type,
      note: row.note ?? "",
      createdAt: row.created_at,
    };
  }

  private parseMonthCloseRecord(row: any, year: number): MonthCloseRecord {
    return {
      id: row.id,
      year,
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
