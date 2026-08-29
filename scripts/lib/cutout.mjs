/**
 * Cut a subject out of a flat background, by flood fill rather than by colour.
 *
 * Every piece of artwork this project was given is a JPEG: the icon arrived
 * with its transparency already flattened onto a checkerboard, and the three
 * aircraft arrived on a pale watercolour sky. Both need the same thing — the
 * background gone, the subject intact — and neither can be done by "make this
 * colour transparent", for two reasons that matter:
 *
 *  - The aircraft contain the background's own colours. The Concorde is white
 *    and so is the sky's brightest area; the icon's aircraft is outlined in the
 *    same near-black the checkerboard uses. A global colour replacement
 *    punches holes through the subject.
 *  - JPEG has no flat colours. Every edge is a ramp of intermediate values, so
 *    a hard threshold leaves either a halo of background or a chewed outline.
 *
 * So: flood fill inward from the border, using a predicate rather than a single
 * colour (the checkerboard is two greys, and a watercolour sky is a hundred),
 * then feather the resulting alpha by one pixel so the JPEG's edge ramp
 * dissolves instead of fringing.
 *
 * ImageMagick does the decoding and encoding; the fill is here because
 * `-floodfill` takes one seed colour and one fuzz, which is exactly the thing
 * that does not work.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const magick = (args) =>
  execFileSync("magick", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });

/** Read an image as raw RGBA bytes, with its dimensions. */
function readPixels(file) {
  const size = magick([file, "-format", "%w %h", "info:"]).toString().trim().split(" ").map(Number);
  const raw = join(tmpdir(), `cutout-${process.pid}-${Math.abs(size[0] * 31 + size[1])}.rgba`);
  magick([file, "-depth", "8", `rgba:${raw}`]);
  const data = readFileSync(raw);
  unlinkSync(raw);
  return { width: size[0], height: size[1], data };
}

/**
 * A neutral grey darker than `maxLevel` — the transparency checkerboard.
 *
 * Neutrality is the whole test. The badge's darkest navy is (19,41,80): as
 * dark as the checkerboard's lighter squares and nothing like as grey, so
 * "dark" alone would eat it and "grey" alone would eat the aircraft's
 * highlights.
 */
export const checkerboard = (maxLevel = 96, tolerance = 16) => (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= maxLevel && max - min <= tolerance;
};

/** A pale sky: bright, and no more than faintly blue. */
export const paleSky = () => (r, g, b) => {
  if (b < 150) return false; // the sky is never dark, and never yellow
  // Watercolour, so allow a wide range of blues, but reject anything with real
  // colour in it — the Alpha Jet's own blue is saturated, the sky's is not.
  const saturation = b - Math.min(r, g);
  return r >= 150 && g >= 170 && saturation <= 48 && b >= g && g >= r - 12;
};

/**
 * Remove everything reachable from the border that satisfies `isBackground`.
 *
 * Four-connected. Eight would leak through the one-pixel diagonal gaps JPEG
 * leaves in a thin outline, and a leak here empties the middle of the subject.
 */
export function cutout(inputFile, outputFile, isBackground, { feather = true, trim = true, largestOnly = false } = {}) {
  const { width, height, data } = readPixels(inputFile);
  const outside = new Uint8Array(width * height);
  const stack = [];

  const consider = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (outside[i]) return;
    const p = i * 4;
    if (!isBackground(data[p], data[p + 1], data[p + 2])) return;
    outside[i] = 1;
    stack.push(x, y);
  };

  for (let x = 0; x < width; x++) { consider(x, 0); consider(x, height - 1); }
  for (let y = 0; y < height; y++) { consider(0, y); consider(width - 1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    consider(x - 1, y);
    consider(x + 1, y);
    consider(x, y - 1);
    consider(x, y + 1);
  }

  /*
   * Keep only the biggest thing left.
   *
   * Each aircraft is one aeroplane, and each source is a JPEG of a drawing on
   * paper: a stray mark, a smudge, a rogue pixel of the artist's own signature
   * survives the flood fill as its own island, and one island in the corner is
   * enough to defeat every subsequent `-trim`. The A350 arrived with exactly
   * that — a speck below the tail that padded the finished asset by 40% of its
   * height with empty space.
   *
   * Off by default, because it is *wrong* for the badge: a mark can legitimately
   * be several separate shapes.
   */
  if (largestOnly) {
    const label = new Int32Array(width * height).fill(-1);
    let best = -1;
    let bestSize = 0;
    let next = 0;
    for (let start = 0; start < label.length; start++) {
      if (outside[start] || label[start] >= 0) continue;
      const id = next++;
      let size = 0;
      const queue = [start];
      label[start] = id;
      while (queue.length) {
        const at = queue.pop();
        size++;
        const x = at % width;
        const y = (at - x) / width;
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
      if (size > bestSize) { bestSize = size; best = id; }
    }
    for (let i = 0; i < label.length; i++) if (label[i] !== best) outside[i] = 1;
  }

  for (let i = 0; i < outside.length; i++) {
    if (outside[i]) {
      const p = i * 4;
      // Zero the colour too. A transparent pixel that still carries the
      // background's colour bleeds it back when the image is scaled, which is
      // exactly what produces a grey halo around a downsampled icon.
      data[p] = data[p + 1] = data[p + 2] = data[p + 3] = 0;
    }
  }

  const raw = join(tmpdir(), `cutout-out-${process.pid}.rgba`);
  writeFileSync(raw, data);
  const args = ["-depth", "8", "-size", `${width}x${height}`, `rgba:${raw}`];
  if (feather) {
    // One pixel of blur on alpha alone, then levelled back: it dissolves the
    // JPEG ramp without softening the shape. `-level` re-sharpens what the
    // blur spread, so the result is an antialiased edge rather than a fade.
    args.push("-channel", "A", "-blur", "0x0.8", "-level", "25%,75%", "+channel");
  }
  if (trim) args.push("-trim", "+repage");
  args.push("-strip", outputFile);
  magick(args);
  unlinkSync(raw);

  const kept = magick([outputFile, "-format", "%w %h", "info:"]).toString().trim();
  return { width, height, cropped: kept };
}
