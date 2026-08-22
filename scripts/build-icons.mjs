/**
 * Generate the application's icon set from the supplied artwork.
 *
 * The identity is the Air France A350 fin the owner supplied, kept at
 * `assets/brand/air-france-fin.jpg` — 1024×1024, the exact file, unmodified.
 * Everything the browser and the home screen use is derived from it here, so
 * replacing the identity later is replacing one file and re-running this.
 *
 *   node scripts/build-icons.mjs
 *
 * Needs ImageMagick (`magick`) on the PATH. The outputs are committed, so
 * nobody needs it to build or run the application.
 *
 * ─── Two framings, deliberately ──────────────────────────────────────────────
 *
 * The artwork carries a wide navy margin around the fin. That is right for a
 * 512px home-screen icon, which sits among others and needs its own breathing
 * room, and wrong for a 16px browser tab, where it spends a quarter of the
 * width on empty navy and leaves the fin too small to identify.
 *
 * So the large sizes use the artwork as supplied, and the small ones use a
 * square crop tightened to the fin's own bounds plus a modest margin. The crop
 * stays square — the fin is never squashed — and the small sizes get a light
 * unsharp pass, because Lanczos downsampling to 16px softens exactly the edges
 * that make the shape readable.
 *
 * The bounding box below was measured off the artwork rather than guessed; see
 * `--measure`, which re-derives it and prints what it finds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "assets/brand/air-france-fin.jpg");
const publicDir = resolve(root, "public");

if (!existsSync(source)) {
  console.error(`Missing artwork: ${source}`);
  process.exit(1);
}

const run = (command, args, options = {}) =>
  // 16 MB, because `--measure` asks ImageMagick for a full pixel dump and the
  // 1 MB default aborts it with ENOBUFS partway through.
  execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, ...options });
const magick = (args) => run("magick", args);

/**
 * The square crop taken around the fin: centred on its bounding box (measured
 * at x 120, y 172, 764×640), sized to 1.14× its longest side.
 */
const TIGHT = { size: 871, x: 66, y: 56 };

/** Re-derive the bounding box from the pixels, for when the artwork changes. */
function measure() {
  const dump = magick([source, "-resize", "256x256", "txt:-"]).toString().split("\n").slice(1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of dump) {
    const [coord, rest] = line.split(":");
    if (!rest) continue;
    const [x, y] = coord.split(",").map(Number);
    const [r, g, b] = rest.split("(")[1].split(")")[0].split(",").slice(0, 3).map(Number);
    // The ground is a deep navy; anything appreciably lighter or redder is fin.
    if (r > 60 || g > 70 || b > 130) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const scale = 1024 / 256;
  const box = {
    x: Math.round(minX * scale),
    y: Math.round(minY * scale),
    width: Math.round((maxX - minX) * scale),
    height: Math.round((maxY - minY) * scale),
  };
  const size = Math.round(Math.max(box.width, box.height) * 1.14);
  console.log("fin bounding box:", box);
  console.log("tight square crop:", {
    size,
    x: Math.round(box.x + box.width / 2 - size / 2),
    y: Math.round(box.y + box.height / 2 - size / 2),
  });
}

if (process.argv.includes("--measure")) {
  measure();
  process.exit(0);
}

mkdirSync(resolve(publicDir, "brand"), { recursive: true });

/**
 * The artwork as supplied, at a square size.
 *
 * Quantised to a 64-colour palette, undithered. The source is a JPEG with
 * smooth gradients, so a truecolour PNG of it is 181 kB — more than the rest
 * of the icon set put together — for shading nobody can resolve at 192 pixels;
 * 64 colours is 48 kB and visually identical side by side at 512. Undithered
 * deliberately: dithering adds the noise PNG compresses worst, and made the
 * file *larger* than truecolour.
 */
const full = (size, out) =>
  magick([
    source,
    "-filter", "Lanczos",
    "-resize", `${size}x${size}`,
    "-dither", "None",
    "-colors", "64",
    "-strip",
    out,
  ]);

/**
 * The artwork cropped to the fin, at a square size.
 *
 * `+repage` clears the crop's virtual canvas offset; without it the PNG keeps
 * an origin and some viewers render it displaced inside a larger frame.
 */
const cropped = (size, out) =>
  magick([
    source,
    "-crop", `${TIGHT.size}x${TIGHT.size}+${TIGHT.x}+${TIGHT.y}`,
    "+repage",
    "-filter", "Lanczos",
    "-resize", `${size}x${size}`,
    // Enough to bring back the fin's edges after downsampling, not enough to
    // ring: a haloed icon looks like a compression artefact.
    "-unsharp", "0x0.6+0.7+0.02",
    "-strip",
    out,
  ]);

// ─── Home screen and installed app: the artwork as supplied ──────────────────

for (const [size, file] of [
  [512, "icon-512.png"],
  [192, "icon-192.png"],
  [180, "apple-touch-icon.png"],
]) {
  full(size, resolve(publicDir, file));
}

/*
 * A maskable icon is cropped by the platform to whatever shape it likes — a
 * circle, a squircle, a rounded square — so its content has to sit inside the
 * middle 80%. The artwork's own margin is not enough: the fin runs from 12% to
 * 86% of the width, and a circular mask would shave its trailing edge. This
 * scales the whole thing to 64% and centres it on the artwork's own ground
 * colour, which survives every mask shape.
 */
magick([
  source,
  "-filter", "Lanczos",
  "-resize", "328x328",
  "-background", "#031E49",
  "-gravity", "center",
  "-extent", "512x512",
  "-dither", "None",
  "-colors", "64",
  "-strip",
  resolve(publicDir, "icon-maskable-512.png"),
]);

// ─── Browser tab: cropped to the fin ─────────────────────────────────────────

// Each size is rendered from the artwork at that size rather than downsampled
// from one large PNG — downsampling twice is what turns a fin into a smudge.
const icoParts = [16, 32, 48].map((size) => {
  const out = resolve(publicDir, `.ico-${size}.png`);
  cropped(size, out);
  return out;
});
magick([...icoParts, resolve(publicDir, "favicon.ico")]);
run("rm", icoParts);

// A hi-DPI tab icon, for browsers that prefer a PNG over the ICO's largest
// entry. 96 rather than 64 so a 2× display has real pixels to work with.
cropped(96, resolve(publicDir, "favicon-96.png"));
cropped(32, resolve(publicDir, "favicon-32.png"));

// ─── The mark the application itself draws ───────────────────────────────────

// Rendered at 30–34px in the sidebar and the sign-in card, so it takes the
// tight crop for the same reason the tab icon does. 128 rather than 512: the
// largest use is 34px, which is 102 on a 3× screen.
cropped(128, resolve(publicDir, "brand/fin.png"));

console.log("icons written to public/ from assets/brand/air-france-fin.jpg");
