import { Router, Request, Response } from "express";
import { BudgetService } from "../services/BudgetService.js";
import { getDatabase } from "../db/index.js";
import { snapshotIdFor } from "../auth/middleware.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { ALL_CURRENCY_CODES } from "../../../src/domain/currencies.js";
import { LANGUAGES } from "../../../src/domain/languages.js";
import { AIRCRAFT_IDS, FLEET_IDS } from "../../../src/domain/aircraft.js";
import { FONT_IDS } from "../../../src/domain/fonts.js";
import { CADENCE_ICON_CHOICES } from "../../../src/domain/cadence.js";
import { APPEARANCES, THEME_IDS } from "../../../src/domain/theme.js";

/**
 * Reject structurally invalid snapshots before they reach the database. A
 * partially-shaped payload would otherwise wipe collections during the
 * targeted-delete pass, so shape is checked rather than assumed.
 */
function validateSnapshotPayload(snapshot: unknown): void {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new AppError(400, "Invalid snapshot payload: expected an object");
  }
  const candidate = snapshot as Record<string, unknown>;

  if (!candidate.settings || typeof candidate.settings !== "object") {
    throw new AppError(400, "Invalid snapshot payload: missing settings object");
  }
  if (!Array.isArray(candidate.categories)) {
    throw new AppError(400, "Invalid snapshot payload: categories must be an array");
  }
  if (!candidate.years || typeof candidate.years !== "object" || Array.isArray(candidate.years)) {
    throw new AppError(400, "Invalid snapshot payload: years must be an object keyed by year");
  }
  for (const key of ["seasonalPresets", "scenarioPresets", "budgetApprovals", "auditLog"]) {
    if (candidate[key] !== undefined && !Array.isArray(candidate[key])) {
      throw new AppError(400, `Invalid snapshot payload: ${key} must be an array`);
    }
  }
  if (candidate.revision !== undefined && !Number.isFinite(Number(candidate.revision))) {
    throw new AppError(400, "Invalid snapshot payload: revision must be a finite number");
  }
}

/**
 * Settings a client is allowed to PATCH, and what each one must be.
 *
 * The route used to spread `req.body` straight into the stored settings. That
 * accepted any key with any value: `baseCurrency: {}` would have been written
 * and then formatted every amount in the app as `[object Object]`;
 * `monthlyBudget: "lots"` would have made every budget figure `NaN`; and a key
 * nobody has ever heard of would have been stored forever and synced to every
 * device. Financial settings decide what every number on every screen means,
 * so they are checked one at a time and anything unrecognised is refused
 * rather than quietly kept.
 */
/**
 * Imported from the client's own dataset rather than restated here.
 *
 * There were two lists of legal currency codes — this one and
 * `src/domain/currencies.ts` — and the moment the app learned about a hundred
 * and fifty more currencies, this one would have started rejecting perfectly
 * valid settings sent by its own client. One list, one place.
 */
const CURRENCY_CODES = new Set<string>(ALL_CURRENCY_CODES);

/** Language tags the client offers. Same argument as the currencies above. */
const LANGUAGE_CODES = new Set<string>(LANGUAGES.map((language) => language.code));

type SettingsFieldCheck = (value: unknown) => boolean;

const isBoolean: SettingsFieldCheck = (value) => typeof value === "boolean";
const isCurrency: SettingsFieldCheck = (value) => typeof value === "string" && CURRENCY_CODES.has(value);
const isFiniteNumber: SettingsFieldCheck = (value) => typeof value === "number" && Number.isFinite(value);
const isString: SettingsFieldCheck = (value) => typeof value === "string";
const isOneOf = (allowed: readonly string[]): SettingsFieldCheck => (value) =>
  typeof value === "string" && allowed.includes(value);
/** A month, week or year index: whole, positive, and inside a sane range. */
const isIndex = (min: number, max: number): SettingsFieldCheck => (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const SETTINGS_FIELDS: Record<string, SettingsFieldCheck> = {
  selectedYear: isIndex(1970, 3000),
  selectedMonth: isIndex(1, 12),
  selectedWeek: isIndex(1, 53),
  selectedWeekYear: isIndex(1970, 3000),
  selectedPeriodMode: isOneOf(["month", "week", "year"]),
  selectedSeason: isString,
  baseCurrency: isCurrency,
  monthlyBudgetCurrency: isCurrency,
  trackedCurrencies: (value) =>
    Array.isArray(value) && value.length > 0 && value.every((code) => typeof code === "string" && CURRENCY_CODES.has(code)),
  currencyDisplayMode: isOneOf(["symbol", "code", "both"]),
  // `null` clears the second currency, which is a legal thing to want; every
  // other value has to be a currency this application knows.
  secondaryCurrency: (value) => value === null || isCurrency(value),
  /*
   * The reader's own status colours, and the month they last deferred the
   * leftover-budget question in.
   *
   * Both are settings the client writes, so both belong here — the whole
   * snapshot goes through `PUT`, which does not consult this table, but a
   * field the granular route would reject is a field that has quietly stopped
   * being a setting.
   *
   * Colours are checked as six-digit hex rather than "some string": this value
   * reaches a stylesheet, and the one thing that must never arrive there is
   * arbitrary text.
   */
  statusColours: (value) =>
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).every(
      ([kind, colour]) =>
        ["personal", "other", "outside"].includes(kind) &&
        typeof colour === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(colour),
    ),
  /**
   * The three colours a reader's own theme is built from.
   *
   * The same rule as `statusColours` and for the same reason: these reach a
   * stylesheet. Exactly three keys, each a six-digit hex — no extras, because
   * an unexpected key here would be a token nobody derived and nobody checked
   * the contrast of.
   */
  customTheme: (value) => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length !== 3) return false;
    return entries.every(
      ([part, colour]) =>
        ["background", "surface", "accent"].includes(part) &&
        typeof colour === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(colour),
    );
  },
  // "YYYY-MM", the month the deferral was given for.
  leftoverDeferredFor: (value) => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
  // An id from the font table, never a CSS stack: this value reaches a
  // stylesheet, and the table is the only thing allowed to say what a font is.
  fontChoice: isOneOf(FONT_IDS),
  // A map of cadence to icon name. Both sides are checked against the tables
  // rather than accepted as strings: these values choose a component, and an
  // unknown one would render nothing at all.
  cadenceIcons: (value) =>
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).every(
      ([cadence, icon]) =>
        cadence in CADENCE_ICON_CHOICES &&
        typeof icon === "string" &&
        (CADENCE_ICON_CHOICES as Record<string, readonly string[]>)[cadence].includes(icon),
    ),
  language: (value) => typeof value === "string" && LANGUAGE_CODES.has(value),
  appearance: isOneOf(APPEARANCES),
  themePreset: isOneOf(THEME_IDS),
  aircraft: isOneOf(AIRCRAFT_IDS),
  transitionAircraft: isOneOf(FLEET_IDS),
  roundingRule: isOneOf(["none", "nearest-1", "nearest-5", "nearest-10", "ceil-10"]),
  monthlyBudget: isFiniteNumber,
  autoWishlistFlushEnabled: isBoolean,
  liveClockEnabled: isBoolean,
  saveTimestampEnabled: isBoolean,
  darkMode: isBoolean,
  // Structured values are checked for shape rather than field by field: their
  // own contents are validated where they are used, and the point here is to
  // refuse a string or a number where an object belongs.
  exchangeRates: (value) => value != null && typeof value === "object" && !Array.isArray(value),
  gestures: (value) => value != null && typeof value === "object" && !Array.isArray(value),
  // Both are small objects whose contents are validated where they are used;
  // the point here is to refuse a string or a number where an object belongs,
  // and to refuse a shape the reader could not make sense of.
  notifications: (value) =>
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["unasked", "enabled", "declined", "unsupported"].includes(String((value as { choice?: unknown }).choice)),
  onboarding: (value) =>
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isFinite(Number((value as { version?: unknown }).version)),
  dashboard: (value) =>
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry != null &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string" &&
        typeof (entry as { visible?: unknown }).visible === "boolean",
    ),
};

export function validateSettingsPatch(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "Invalid settings payload: expected an object");
  }
  const patch = body as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    // `lastUpdated` is stamped by the server on every write; accepting one from
    // a client would let a device claim its stale copy was the newest.
    if (key === "lastUpdated") continue;
    const check = SETTINGS_FIELDS[key];
    if (!check) throw new AppError(400, `Invalid settings payload: unknown field "${key}"`);
    if (!check(value)) throw new AppError(400, `Invalid settings payload: bad value for "${key}"`);
    clean[key] = value;
  }

  if (Object.keys(clean).length === 0) {
    throw new AppError(400, "Invalid settings payload: nothing to update");
  }
  return clean;
}

export function createSnapshotRoutes(): Router {
  const router = Router();
  // Bound to the authenticated account's budget. `requireAuth` runs before
  // these routers are reached, so `snapshotIdFor` always has a value; it throws
  // rather than defaulting if that ever stops being true, because the default
  // would be another user's budget.
  const getService = (req: Request) => new BudgetService(getDatabase(), snapshotIdFor(req));

  /**
   * GET /api/snapshot
   * Load the active budget snapshot
   */
  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      const snapshot = await service.loadSnapshot();
      if (!snapshot) {
        throw new AppError(404, "No active snapshot found");
      }
      res.json(snapshot);
    }),
  );

  /**
   * GET /api/snapshot/revision
   * Cheap freshness probe. Clients poll this on focus to detect another
   * device's write without transferring the whole snapshot.
   */
  router.get(
    "/revision",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      const revision = await service.loadRevision();
      res.json({ revision });
    }),
  );

  /**
   * PUT /api/snapshot
   * Save the full snapshot.
   *
   * Optimistic concurrency is a compare-and-swap on `baseRevision`: the
   * revision the client last read from the server. The write is accepted only
   * when it still matches what is stored, and the server — not the client —
   * assigns the next revision.
   *
   * Trusting a client-supplied revision was unsafe: a device that edited while
   * offline increments its own counter freely, so it could return with a
   * higher number and overwrite work another device did in the meantime. A
   * client cannot inflate `baseRevision` to win, because a stale base is
   * exactly what gets rejected.
   */
  router.put(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const snapshot = req.body;
      validateSnapshotPayload(snapshot);

      const service = getService(req);
      const storedRevision = await service.loadRevision();

      // `baseRevision` may travel in the body or as a header, so a plain
      // fetch and an intermediary that strips unknown fields both work.
      const headerBase = req.get("x-base-revision");
      const rawBase = snapshot.baseRevision ?? (headerBase != null ? Number(headerBase) : undefined);
      const baseRevision = Number.isFinite(Number(rawBase)) ? Number(rawBase) : null;

      if (storedRevision != null && baseRevision != null && baseRevision !== storedRevision) {
        const current = await service.loadSnapshot();
        res.status(409).json({
          error: "Snapshot conflict",
          message: `Rejected stale write (based on revision ${baseRevision}, server is at ${storedRevision}).`,
          revision: storedRevision,
          snapshot: current,
        });
        return;
      }

      // Legacy clients send no baseRevision. Fall back to the previous
      // monotonic check so they keep working rather than silently clobbering.
      if (baseRevision == null) {
        const incomingRevision = Number(snapshot.revision);
        if (storedRevision != null && Number.isFinite(incomingRevision) && incomingRevision <= storedRevision) {
          const current = await service.loadSnapshot();
          res.status(409).json({
            error: "Snapshot conflict",
            message: `Rejected stale write (incoming revision ${incomingRevision}, stored revision ${storedRevision}).`,
            revision: storedRevision,
            snapshot: current,
          });
          return;
        }
      }

      const nextRevision = (storedRevision ?? 0) + 1;
      const toStore = { ...snapshot, revision: nextRevision };
      delete (toStore as Record<string, unknown>).baseRevision;

      await service.saveSnapshot(toStore);
      res.json({ success: true, message: "Snapshot saved", revision: nextRevision });
    }),
  );

  /**
   * PATCH /api/snapshot/settings
   * Update only the settings
   */
  router.patch(
    "/settings",
    asyncHandler(async (req: Request, res: Response) => {
      const service = getService(req);
      let snapshot = await service.getOrThrow();
      snapshot = await service.updateSettings(snapshot, validateSettingsPatch(req.body));
      res.json(snapshot.settings);
    }),
  );

  /*
   * There is deliberately no POST /api/snapshot/reset.
   *
   * There used to be one, and it answered `{ success: true, message: "Reset
   * would happen here" }` without touching anything. An endpoint that reports
   * success for a destructive operation it did not perform is the worst
   * possible shape for one: a caller has no way to tell it from a real reset,
   * and the next thing it does is act on the belief that the data is gone.
   *
   * Nothing called it — the client's own "Reset" writes an empty snapshot
   * through the ordinary guarded PUT path, so the reset is revisioned,
   * synced, and undoable like any other change. That is the right way to do
   * it, and a second, unguarded path to erase a budget is not something this
   * API should offer at all.
   */

  return router;
}
