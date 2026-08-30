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
