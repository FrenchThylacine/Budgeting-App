/**
 * Cut every aircraft out of the Flightradar24 icon sheet, as white silhouettes.
 *
 * The sheet is one 1280×720 JPEG of about two dozen yellow, black-outlined
 * aircraft on white paper, each with a soft drop shadow. The transition needs
 * them individually, in white, at 40-odd pixels — so the job is: find the
 * shapes, discard the shadows, keep the outlines, and never put the sheet
 * itself on screen.
 *
 * Why this is not `magick -crop`:
 *
 *  - **The grid is not a grid.** The rows hold 8, 9 and 9 icons at different
 *    pitches, and the shapes inside them range from a 40px microlight to a
 *    260px sleigh. A fixed lattice either clips a wingtip or pads every icon
 *    with its neighbours' whitespace.
 *  - **Several icons are more than one shape.** The sleigh is four (three
 *    reindeer and a sled), the satellite is three. Naïve component labelling
 *    returns those as separate "aircraft".
 *  - **The drop shadow is not background.** It is a grey ramp attached to the
 *    shape, and a silhouette painted white from a mask that includes it gains
 *    a soft lump on its lower right — visible at 40px as a smear.
 *
 * So: flood fill the paper *and its shadows* from the border with a neutral
 * predicate (grey and light, at any level — that is what a shadow is, and what
 * no part of a yellow aircraft is), label what survives, drop specks, then
 * regroup the survivors into icons by the layout's own geometry.
 *
 *   node scripts/extract-craft.mjs [--sheet <jpg>] [--out public/craft] [--contact]
 *
 * `--contact` also writes a labelled contact sheet, which is the only sane way
 * to check that shape #17 really is the one you think it is.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magick = (args) =>
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};

const SHEET = arg("sheet", "assets/brand/flightradar-icons-reference.jpg");
const OUT = arg("out", "public/craft/fleet");
/* A reference, not a shipped asset: `public/` is served verbatim, and nothing
   should be able to fetch the whole sheet from the running application. */
const CONTACT = arg("contact-out", "assets/brand/craft-contact.png");

/**
 * Paper, and everything the paper's light does.
 *
 * Neutral (the channels within 40 of each other) and not dark. A drop shadow
 * is exactly that at every level it passes through; a yellow fuselage never is
 * (its blue channel is 80+ below its red), and a black outline never is.
 */
const isPaper = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 140 && max - min <= 40;
};

/** The masthead. The logo is artwork too, and it is not an aircraft. */
const HEADER_HEIGHT = 170;

function readPixels(file) {
  const [width, height] = magick([file, "-format", "%w %h", "info:"]).toString().trim().split(" ").map(Number);
  const raw = join(tmpdir(), `craft-${process.pid}.rgba`);
  magick([file, "-depth", "8", `rgba:${raw}`]);
  const data = readFileSync(raw);
  unlinkSync(raw);
  return { width, height, data };
}

const { width, height, data } = readPixels(SHEET);

// ── 1. The paper, flooded from the border ───────────────────────────────────
const outside = new Uint8Array(width * height);
{
  const stack = [];
  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (outside[i]) return;
    const p = i * 4;
    if (!isPaper(data[p], data[p + 1], data[p + 2])) return;
    outside[i] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) { consider(x, 0); consider(x, height - 1); }
  for (let y = 0; y < height; y++) { consider(0, y); consider(width - 1, y); }
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    consider(x - 1, y); consider(x + 1, y); consider(x, y - 1); consider(x, y + 1);
  }
}
// The masthead is not a subject. Marked as background rather than cropped away
// so the coordinates below stay the sheet's own.
for (let y = 0; y < HEADER_HEIGHT; y++) for (let x = 0; x < width; x++) outside[y * width + x] = 1;

// ── 2. What survived, as components ─────────────────────────────────────────
const MIN_AREA = 60; // below this it is JPEG noise, not an aeroplane
const label = new Int32Array(width * height).fill(-1);
const parts = [];
for (let start = 0; start < label.length; start++) {
  if (outside[start] || label[start] >= 0) continue;
  const id = parts.length;
  const queue = [start];
  label[start] = id;
  let area = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  while (queue.length) {
    const at = queue.pop();
    area++;
    const x = at % width;
    const y = (at - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (outside[n] || label[n] >= 0) continue;
      label[n] = id;
      queue.push(n);
    }
  }
  parts.push({ id, area, minX, minY, maxX, maxY });
}

const kept = parts.filter((part) => part.area >= MIN_AREA);
if (argv.includes("--parts")) {
  for (const part of [...kept].sort((a, b) => a.minY - b.minY || a.minX - b.minX)) {
    console.log(`part area=${String(part.area).padStart(6)} x=${String(part.minX).padStart(4)}..${String(part.maxX).padStart(4)} y=${String(part.minY).padStart(3)}..${String(part.maxY).padStart(3)}`);
  }
  process.exit(0);
}

// ── 3. Components regrouped into icons ──────────────────────────────────────
/*
 * Rows first, by vertical overlap: the sheet is laid out in three bands, and
 * two shapes in the same band always overlap vertically while two shapes in
 * different bands never do. Then, within a row, merge left to right while the
 * horizontal gap stays under the pitch — which is what makes the sleigh's four
 * pieces one icon and keeps two neighbouring airliners two.
 */
const ROW_GAP = 60;
const centre = (part) => (part.minY + part.maxY) / 2;
const rows = [];
for (const part of [...kept].sort((a, b) => centre(a) - centre(b))) {
  const row = rows.at(-1);
  // Split where the *centres* jump, not where the boxes stop overlapping: one
  // tall icon in a band would otherwise chain its band into the next.
  if (row && centre(part) - centre(row.parts.at(-1)) <= ROW_GAP) row.parts.push(part);
  else rows.push({ parts: [part] });
}

/*
 * 12 pixels.
 *
 * Measured, not guessed: on this sheet the widest gap *inside* an icon is one
 * pixel (the sleigh's traces, the satellite's panel slivers) and the narrowest
 * gap *between* two icons is seventeen (the glider and the balloon). Anything
 * in between separates them correctly; 26 chained five airliners into one
 * 710-pixel "aircraft".
 */
const MERGE_GAP = 12;
const icons = [];
for (const row of rows) {
  let current = null;
  for (const part of row.parts.sort((a, b) => a.minX - b.minX)) {
    if (current && part.minX - current.maxX <= MERGE_GAP) {
      current.parts.push(part);
      current.minX = Math.min(current.minX, part.minX);
      current.maxX = Math.max(current.maxX, part.maxX);
      current.minY = Math.min(current.minY, part.minY);
      current.maxY = Math.max(current.maxY, part.maxY);
    } else {
      current = {
        parts: [part],
        minX: part.minX, maxX: part.maxX, minY: part.minY, maxY: part.maxY,
        row: rows.indexOf(row), column: 0,
      };
      current.column = icons.filter((other) => other.row === current.row).length;
      icons.push(current);
    }
  }
}

// ── 4. One white silhouette per icon ────────────────────────────────────────
/*
 * Names, by position on the sheet.
 *
 * Keyed on the grid coordinate rather than on the emitted order, so the map
 * still reads as a description of the artwork if the geometry above is ever
 * retuned. `null` means "extracted, not shipped": the sleigh, the station, the
 * capsule and the satellite are on the sheet and are not aircraft — at 40px in
 * a page transition they read as a smudge, a ladder and two rectangles.
 *
 * The names are classes, not type certificates. The sheet's icons are generic
 * by design (FR24 draws one shape per category, not per model), and claiming
 * "Boeing 747" for a shape that is equally an A340 would be a caption that
 * lies. Two are unmistakable and are named: the ogival delta with the needle
 * nose is Concorde, and the tailless delta is a delta.
 */
const NAMES = [
  [null, null, "helicopter", "glider", "balloon", null, null, "drone"],
  ["superjumbo", "jumbo", "quadjet", "widebody", "longhaul", "airliner", "narrowbody", "twinjet", "regional"],
  ["shorthaul", "freighter", "trijet", "midsize", "turboprop-heavy", "turboprop", "light", "delta", "concorde"],
];

mkdirSync(OUT, { recursive: true });
const PAD = 2;
const manifest = [];

for (const [index, icon] of icons.entries()) {
  const name = NAMES[icon.row]?.[icon.column] ?? null;
  if (!name) continue;
  const ids = new Set(icon.parts.map((part) => part.id));
  const x0 = Math.max(0, icon.minX - PAD);
  const y0 = Math.max(0, icon.minY - PAD);
  const w = Math.min(width - 1, icon.maxX + PAD) - x0 + 1;
  const h = Math.min(height - 1, icon.maxY + PAD) - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const source = (y0 + y) * width + (x0 + x);
      const target = (y * w + x) * 4;
      if (!ids.has(label[source])) continue;
      // White, everywhere the shape is. The source's own yellow and black are
      // discarded on purpose: the transition draws one flat silhouette, and a
      // two-tone icon reads as a smudge at 40px.
      out[target] = out[target + 1] = out[target + 2] = 255;
      out[target + 3] = 255;
    }
  }
  const raw = join(tmpdir(), `craft-icon-${process.pid}.rgba`);
  writeFileSync(raw, out);
  const file = join(OUT, `${name}.png`);
  magick([
    "-depth", "8", "-size", `${w}x${h}`, `rgba:${raw}`,
    // Alpha only: the shape stays white, its edge stops being a staircase.
    "-channel", "A", "-blur", "0x0.6", "-level", "30%,70%", "+channel",
    "-trim", "+repage",
    /*
     * Nose right, and one size.
     *
     * The sheet draws every aircraft from above with its nose at the top; this
     * application's convention — set by the three hand-drawn craft and by every
     * animation in it — is nose right, so that a rotation of zero means
     * "travelling the way this application moves". Baking the quarter turn into
     * the asset keeps it out of the CSS, where it would be a transform on a
     * bitmap composited on every frame of every navigation.
     *
     * Then fit each into the same 160px box. The sheet's shapes run from a
     * 36-pixel satellite to a 199-pixel Concorde; without this the picker would
     * offer a balloon five times the size of a business jet.
     */
    "-rotate", "90", "-resize", "160x160", "-strip", file,
  ]);
  unlinkSync(raw);
  const [tw, th] = magick([file, "-format", "%w %h", "info:"]).toString().trim().split(" ").map(Number);
  manifest.push({ id: name, index, width: tw, height: th });
}

manifest.sort((a, b) => a.id.localeCompare(b.id));
console.log(`${manifest.length} of ${icons.length} shapes shipped to ${OUT}`);
console.log("\nCatalogue for src/domain/aircraft.ts:\n");
for (const entry of manifest) {
  console.log(`  { id: "${entry.id}", width: ${entry.width}, height: ${entry.height} },`);
}

if (argv.includes("--contact")) {
  /*
   * A contact sheet, on a dark ground because the silhouettes are white.
   * Named, because every naming decision is "which one is that".
   */
  magick([
    "montage", ...manifest.map((entry) => join(OUT, `${entry.id}.png`)),
    "-tile", "6x", "-geometry", "150x150+8+8", "-background", "#101418",
    "-fill", "white", "-pointsize", "15", "-label", "%t",
    CONTACT,
  ]);
  console.log(`\ncontact sheet: ${CONTACT}`);
}
