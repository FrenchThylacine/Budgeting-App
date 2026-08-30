/**
 * Generate every image the application ships, from the artwork in `assets/brand`.
 *
 *   node scripts/build-icons.mjs
 *
 * Needs ImageMagick (`magick`) on the PATH. The outputs are committed, so
 * nobody needs it to build or run the application.
 *
 * ─── What the sources are ────────────────────────────────────────────────────
 *
 *  - `app-icon-source.jpg`  the Budget OS mark: a Concorde over a euro sign on
 *                           a navy badge, under a tricolour band. Supplied as a
 *                           JPEG with its transparency already flattened onto a
 *                           checkerboard, which is why it is cut out rather
 *                           than used directly.
 *  - `concorde-source.jpg`  the three aircraft the loading sequence flies, each
 *  - `a350-source.jpg`      drawn nose-up on a watercolour sky.
 *  - `alphajet-source.jpg`
 *
 * Everything is derived here so that replacing an identity later is replacing
 * one file and re-running this.
 *
 * ─── Two framings for the badge, deliberately ────────────────────────────────
 *
 * A launcher icon sits among others and needs its own margin; a 16px browser
 * tab needs the mark to fill the tile. So the home-screen sizes keep a margin
 * and the tab sizes are trimmed to the artwork's own bounds. Each small size is
 * rendered from the full-resolution master rather than downsampled from one
 * large PNG — downsampling twice is what turns a mark into a smudge.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cutout, checkerboard, paleSky } from "./lib/cutout.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = resolve(root, "assets/brand");
const publicDir = resolve(root, "public");
const craftDir = resolve(publicDir, "craft");

const magick = (args) =>
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });

for (const file of ["app-icon-source.jpg", "concorde-source.jpg", "a350-source.jpg", "alphajet-source.jpg"]) {
  if (!existsSync(resolve(brand, file))) {
    console.error(`Missing artwork: ${resolve(brand, file)}`);
    process.exit(1);
  }
}

mkdirSync(craftDir, { recursive: true });
mkdirSync(resolve(publicDir, "brand"), { recursive: true });

// ─── The badge ───────────────────────────────────────────────────────────────

/**
 * The cleaned master: the supplied mark with the checkerboard flood-filled
 * away and the result trimmed to its own bounds. Committed, because it is what
 * every size below is rendered from and it is the file a designer would edit.
 */
const iconMaster = resolve(brand, "app-icon.png");
console.log("badge:", cutout(resolve(brand, "app-icon-source.jpg"), iconMaster, checkerboard()));

/**
 * The mark on a square canvas.
 *
 * `margin` is the share of the tile left empty on the longest side. The tab
 * icons take none of it; the launcher icons take a little, because an icon
 * that touches the edge of its tile looks cropped next to ones that do not.
 */
const square = (size, out, { margin = 0, background = "none", scale = 1, colors = 128 } = {}) => {
  const inner = Math.round(size * (1 - margin * 2) * scale);
  magick([
    iconMaster,
    "-filter", "Lanczos",
    "-resize", `${inner}x${inner}`,
    "-background", background,
    "-gravity", "center",
    "-extent", `${size}x${size}`,
    /*
     * Quantised, undithered. The mark is flat vector-style shading, so a
     * truecolour 512 costs 180 kB — more than the rest of the icon set put
     * together — for gradients nobody can resolve on a home screen. 128
     * colours is a quarter of that and indistinguishable side by side.
     * Dithering is off because it adds the noise PNG compresses worst, and on
     * this artwork made the file *larger* than truecolour.
     */
    "-dither", "None",
    "-colors", String(colors),
    "-strip",
    out,
  ]);
};

// Home screen and installed app. A modest margin, transparent ground: the
// badge carries its own white outline and looks wrong in a second frame.
square(512, resolve(publicDir, "icon-512.png"), { margin: 0.04 });
square(192, resolve(publicDir, "icon-192.png"), { margin: 0.04 });

/*
 * iOS composites an opaque background behind the touch icon and rounds the
 * result itself, so this one is flattened onto the badge's own navy. Left
 * transparent it renders on black, which turns the badge's navy into a hole.
 */
square(180, resolve(publicDir, "apple-touch-icon.png"), { margin: 0.02, background: "#13294F" });

/*
 * A maskable icon is cropped by the platform to whatever shape it likes, so its
 * content has to survive a circle. 66% on the badge's navy does.
 */
square(512, resolve(publicDir, "icon-maskable-512.png"), { margin: 0, scale: 0.66, background: "#13294F" });

// Browser tab: no margin at all. At 16px every pixel spent on air is a pixel
// the mark does not have.
const icoParts = [16, 32, 48].map((size) => {
  const out = resolve(publicDir, `.ico-${size}.png`);
  magick([
    iconMaster,
    "-filter", "Lanczos",
    "-resize", `${size}x${size}`,
    "-background", "none",
    "-gravity", "center",
    "-extent", `${size}x${size}`,
    // Lanczos to 16px softens exactly the edges that make a shape readable.
    // Enough unsharp to bring them back, not enough to ring.
    "-unsharp", "0x0.6+0.7+0.02",
    "-strip",
    out,
  ]);
  return out;
});
magick([...icoParts, resolve(publicDir, "favicon.ico")]);
for (const part of icoParts) rmSync(part);

square(96, resolve(publicDir, "favicon-96.png"));
square(32, resolve(publicDir, "favicon-32.png"));

// The mark the application itself draws, in the sidebar and on the sign-in
// card. Largest use is 40px, which is 120 on a 3× screen.
square(160, resolve(publicDir, "brand/app-mark.png"));

// ─── The aircraft ────────────────────────────────────────────────────────────

/**
 * Each aircraft, cut off its sky and turned nose-right.
 *
 * Nose-right because every animation in the application travels left to right,
 * so a rotation of zero means "flying the way this app moves" and the CSS never
 * has to carry a constant offset. The artwork is drawn nose-up, hence the 90°.
 *
 * `width` is chosen from the largest place each is rendered, times three for a
 * high-density screen: the lead aircraft reaches ~190px, the escorts ~64px.
 */
const craft = [
  { source: "concorde-source.jpg", out: "concorde.png", width: 560 },
  { source: "a350-source.jpg", out: "a350.png", width: 560 },
  { source: "alphajet-source.jpg", out: "alphajet.png", width: 260 },
];

for (const { source, out, width } of craft) {
  const cleaned = resolve(brand, out.replace(".png", "-cutout.png"));
  const result = cutout(resolve(brand, source), cleaned, paleSky(), { largestOnly: true });
  magick([
    cleaned,
    "-rotate", "90",
    // Trim again after the rotation with a little fuzz: the first trim is
    // exact, and a feathered edge leaves a rim of alpha 1–2 that an exact trim
    // treats as content.
    "-fuzz", "4%",
    "-trim", "+repage",
    "-filter", "Lanczos",
    "-resize", `${width}x`,
    // 128 colours, undithered. These are flat illustrations with a handful of
    // hues; truecolour spends four times the bytes on gradients nobody can
    // resolve at 190px, and dithering adds exactly the noise PNG compresses
    // worst.
    "-dither", "None",
    "-colors", "128",
    "-strip",
    resolve(craftDir, out),
  ]);
  /*
   * The same shape as a flat white icon, for the full-screen transition.
   *
   * Derived from the artwork's own alpha rather than redrawn: the brief asked
   * for the supplied aircraft treated as white silhouettes, and tracing them by
   * hand would produce a *different* aeroplane that merely resembled the one
   * that was supplied. `-alpha extract` is the outline the cut-out already
   * found; levelling it clips the feathered rim so the icon has a hard edge,
   * and it is then used as the alpha of a solid white fill.
   */
  magick([
    cleaned,
    "-rotate", "90",
    "-fuzz", "4%",
    "-trim", "+repage",
    "-filter", "Lanczos",
    "-resize", "192x",
    "-alpha", "extract",
    // Blur-then-level closes the one-pixel nicks JPEG noise leaves along a
    // drawn outline, without rounding off a winglet or a tailplane.
    "-blur", "0x1.2",
    "-level", "42%,58%",
    "-write", "mpr:mask",
    "+delete",
    "(", "mpr:mask", "-fill", "white", "-colorize", "100", ")",
    "mpr:mask",
    "-alpha", "off",
    "-compose", "copy_opacity",
    "-composite",
    "-strip",
    resolve(craftDir, out.replace(".png", "-silhouette.png")),
  ]);

  rmSync(cleaned);
  const size = magick([resolve(craftDir, out), "-format", "%w×%h", "info:"]).toString();
  console.log(`craft ${out}: ${size} (source ${result.cropped} nose-up)`);
}

console.log("icons and aircraft written to public/");
