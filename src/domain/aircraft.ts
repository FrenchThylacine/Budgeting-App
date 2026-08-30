/**
 * The aircraft the application flies.
 *
 * Three, because three were drawn for it. Each is a real aeroplane rendered
 * from directly above and turned nose-right, so a rotation of zero means
 * "travelling the way this application moves" — every animation here runs left
 * to right, and building that constant into the artwork keeps it out of the CSS.
 *
 * Two derivatives ship for each: the full-colour illustration, which carries
 * the livery and is what the loading sequence uses at 180px and up, and a flat
 * white silhouette for the tab transition, where the craft is 30px across and
 * a livery would be noise. The silhouettes are taken from the illustrations'
 * own outlines rather than redrawn — see `scripts/build-icons.mjs`.
 *
 * `aspect` is width ÷ height of the asset, so a caller states the length it
 * wants on screen and the height follows. Wrong values here do not merely look
 * wrong: they make the image box disagree with the image, which reflows the
 * page as each asset decodes.
 */
export const AIRCRAFT = [
  {
    id: "concorde",
    /** Translation key for the name shown in Settings. */
    labelKey: "aircraft.concorde",
    art: "/craft/concorde.png",
    silhouette: "/craft/concorde-silhouette.png",
    aspect: 560 / 266,
  },
  {
    id: "a350",
    labelKey: "aircraft.a350",
    art: "/craft/a350.png",
    silhouette: "/craft/a350-silhouette.png",
    aspect: 560 / 587,
  },
  {
    id: "alphajet",
    labelKey: "aircraft.alphajet",
    art: "/craft/alphajet.png",
    silhouette: "/craft/alphajet-silhouette.png",
    aspect: 260 / 202,
  },
] as const;

export type AircraftId = (typeof AIRCRAFT)[number]["id"];
export type AircraftDefinition = (typeof AIRCRAFT)[number];

export const AIRCRAFT_IDS: readonly string[] = AIRCRAFT.map((craft) => craft.id);

/**
 * The default, everywhere: Concorde.
 *
 * Stated once so the loading sequence, the transition, the settings panel and
 * the server's validation cannot drift into three different opinions about
 * what an account that has never chosen sees.
 */
export const DEFAULT_AIRCRAFT: AircraftId = "concorde";

/**
 * Resolve a stored value to an aircraft.
 *
 * An unknown id falls back rather than throwing: a preference synced from a
 * version that knows an aircraft this one does not should show *an* aeroplane,
 * not an error boundary.
 */
export function aircraftFor(id: string | null | undefined): AircraftDefinition {
  return AIRCRAFT.find((craft) => craft.id === id) ?? AIRCRAFT[0];
}

/**
 * The escort, in the loading sequence: always the Alpha Jet.
 *
 * Not a preference. The formation being evoked is the Patrouille de France,
 * which flies Alpha Jets; letting the escorts be Concordes would be a different
 * picture wearing the same name.
 */
export const ESCORT_AIRCRAFT = aircraftFor("alphajet");

/**
 * The fleet, for the tab transition.
 *
 * Twenty-two silhouettes cut from the Flightradar24 icon sheet by
 * `scripts/extract-craft.mjs` — every flying thing on it, minus the sleigh, the
 * space station, the capsule and the satellite, which are on the sheet and are
 * not aircraft.
 *
 * Separate from `AIRCRAFT` above, because the two answer different questions.
 * The loading sequence shows one aeroplane at 200px in full colour and there
 * are exactly three of those drawings; the transition shows one at 34px in flat
 * white, where a livery is noise and variety is the whole point. Merging the
 * two lists would offer a Concorde illustration in a picker whose other
 * twenty-one entries have no illustration, and a silhouette in a sequence built
 * around artwork.
 *
 * `width`/`height` are the assets' real pixel dimensions, each fitted to the
 * same 160px box so no aircraft is five times another; a caller states the box
 * it wants and `fitWithin` does the arithmetic. Wrong numbers here reflow the
 * page as each image decodes.
 *
 * The names are classes rather than type certificates. The sheet draws one
 * shape per category, not per model — a caption reading "Boeing 747" over a
 * shape that is equally an A340 would be a lie with a serial number on it. The
 * two that are unmistakable are named.
 */
export const FLEET = [
  { id: "concorde", labelKey: "fleet.concorde", width: 160, height: 66 },
  { id: "delta", labelKey: "fleet.delta", width: 160, height: 121 },
  { id: "superjumbo", labelKey: "fleet.superjumbo", width: 152, height: 160 },
  { id: "jumbo", labelKey: "fleet.jumbo", width: 150, height: 160 },
  { id: "quadjet", labelKey: "fleet.quadjet", width: 160, height: 135 },
  { id: "freighter", labelKey: "fleet.freighter", width: 160, height: 143 },
  { id: "widebody", labelKey: "fleet.widebody", width: 160, height: 150 },
  { id: "longhaul", labelKey: "fleet.longhaul", width: 160, height: 153 },
  { id: "airliner", labelKey: "fleet.airliner", width: 160, height: 152 },
  { id: "twinjet", labelKey: "fleet.twinjet", width: 160, height: 144 },
  { id: "narrowbody", labelKey: "fleet.narrowbody", width: 160, height: 132 },
  { id: "shorthaul", labelKey: "fleet.shorthaul", width: 160, height: 147 },
  { id: "midsize", labelKey: "fleet.midsize", width: 160, height: 147 },
  { id: "regional", labelKey: "fleet.regional", width: 160, height: 112 },
  { id: "trijet", labelKey: "fleet.trijet", width: 160, height: 121 },
  { id: "turboprop-heavy", labelKey: "fleet.turbopropHeavy", width: 154, height: 160 },
  { id: "turboprop", labelKey: "fleet.turboprop", width: 160, height: 120 },
  { id: "light", labelKey: "fleet.light", width: 126, height: 160 },
  { id: "glider", labelKey: "fleet.glider", width: 70, height: 160 },
  { id: "helicopter", labelKey: "fleet.helicopter", width: 160, height: 116 },
  { id: "drone", labelKey: "fleet.drone", width: 160, height: 154 },
  { id: "balloon", labelKey: "fleet.balloon", width: 160, height: 128 },
] as const;

export type FleetId = (typeof FLEET)[number]["id"];
export type FleetCraft = (typeof FLEET)[number];

export const FLEET_IDS: readonly string[] = FLEET.map((craft) => craft.id);

/** Concorde here too, so the transition and the loading screen agree. */
export const DEFAULT_FLEET_CRAFT: FleetId = "concorde";

export function fleetCraftFor(id: string | null | undefined): FleetCraft {
  return FLEET.find((craft) => craft.id === id) ?? FLEET[0];
}

export function fleetSilhouette(craft: FleetCraft): string {
  return `/craft/fleet/${craft.id}.png`;
}

/**
 * The size to draw a silhouette at, to fit a square box without distortion.
 *
 * Returned rather than left to `object-fit`, because the `<img>` needs real
 * width and height attributes: without them the box is zero until the bitmap
 * decodes, and the transition's aircraft jumps into place mid-flight.
 */
export function fitWithin(craft: FleetCraft, box: number): { width: number; height: number } {
  const scale = box / Math.max(craft.width, craft.height);
  return { width: Math.round(craft.width * scale), height: Math.round(craft.height * scale) };
}
