/**
 * Colour arithmetic, so contrast is computed rather than hoped for
 * ===============================================================
 *
 * `domain/theme.ts` ships presets whose contrast is *measured* by a test. A
 * theme the reader builds themselves cannot be measured in advance, because it
 * does not exist until they build it — so it has to be **constructed** safe
 * instead: they choose the character, and every text and border colour is
 * derived from their choice by walking toward the ink until the contrast ratio
 * clears the threshold.
 *
 * That is the whole reason this file is arithmetic rather than a palette. A
 * picker that lets somebody choose grey text on a grey card is a picker that
 * produces an unreadable budget, and refusing their colour is not much better
 * than allowing it. Deriving from it is the third answer: the reader's blue
 * stays blue, and the words on it stay legible.
 *
 * Everything here is sRGB and WCAG 2.1 relative luminance — the same maths the
 * contrast test uses, deliberately, so the two cannot disagree about what
 * "AA" means.
 *
 * No DOM: this module is compiled by the server's TypeScript project too,
 * because the API validates a stored custom theme with it.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** `#rgb` and `#rrggbb`, and nothing else — the shape a colour input produces. */
export function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) => clamp255(value).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG 2.1 relative luminance. */
export function luminance(colour: Rgb): number {
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * `amount` of `b` mixed into `a`, in plain sRGB.
 *
 * Not a perceptual space. This is used to *step* a colour toward another one
 * while a contrast ratio is being measured, and the measurement is what decides
 * when to stop — so a fancier interpolation would change how many steps it
 * takes and nothing about the answer.
 *
 * The channels are rounded to whole bytes, which matters more than it looks.
 * A ratio measured on a fractional colour and then written out as hex is a
 * ratio measured on a colour nobody will see: the first derived theme built
 * this way produced tertiary text at 4.501 that rounded to 4.49 on the page,
 * and failed the contrast test by a hundredth. Quantising here means the
 * measurement is taken on exactly the colour that ships.
 */
export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: clamp255(a.r + (b.r - a.r) * t),
    g: clamp255(a.g + (b.g - a.g) * t),
    b: clamp255(a.b + (b.b - a.b) * t),
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Which of black or white reads better on this ground.
 *
 * The threshold is not 0.5: luminance is not lightness, and a mid green
 * (`#4CAF50`) has a luminance around 0.44 while looking distinctly light. So
 * the two candidates are compared directly rather than guessed at from a
 * cut-off, which is one line longer and right in the cases that matter.
 */
export function inkFor(ground: Rgb): Rgb {
  return contrast(BLACK, ground) >= contrast(WHITE, ground) ? BLACK : WHITE;
}

/**
 * `colour`, stepped toward `ink` until it clears `ratio` against `ground`.
 *
 * Returns the *first* colour that clears it, so a choice that already does is
 * returned untouched — the reader's accent stays their accent whenever it can.
 * When even the ink itself cannot reach the ratio, the ink is returned: that is
 * the best this ground allows, and it is the honest answer rather than a
 * failure the caller has to handle at the point where a colour is needed.
 *
 * Stepped in fortieths. Finer steps move the answer by less than a hex digit;
 * coarser ones overshoot and turn a chosen colour into flat black.
 */
export function reachContrast(colour: Rgb, ground: Rgb, ratio: number, ink = inkFor(ground)): Rgb {
  if (contrast(colour, ground) >= ratio) return colour;
  for (let step = 1; step <= 40; step += 1) {
    const candidate = mix(colour, ink, step / 40);
    if (contrast(candidate, ground) >= ratio) return candidate;
  }
  return ink;
}

/**
 * `colour`, stepped *toward the ground* until it no longer exceeds `ratio`.
 *
 * The mirror of the above, and the one that makes a text ramp possible.
 * Secondary and tertiary text are meant to recede; deriving them by darkening
 * produces three shades of the same near-black and a hierarchy nobody can see.
 * They are derived by fading instead, and the fade stops at the floor.
 */
export function fadeToContrast(colour: Rgb, ground: Rgb, ratio: number): Rgb {
  let last = colour;
  for (let step = 1; step <= 40; step += 1) {
    const candidate = mix(colour, ground, step / 40);
    if (contrast(candidate, ground) < ratio) return last;
    last = candidate;
  }
  return last;
}

/** True when `foreground` on `ground` clears WCAG AA for body text. */
export function clearsAA(foreground: Rgb, ground: Rgb): boolean {
  return contrast(foreground, ground) >= 4.5;
}
