/**
 * The airshow, looked at as well as measured
 * ==========================================
 *
 * This repository has learned the same lesson four times: **a measurement can
 * be right while the picture is wrong.** The smoke was zero pixels from the
 * tailpipe and looked detached, because the aeroplane was not where the
 * arithmetic put it. The orbit was genuinely three-dimensional and read as
 * machinery. So the brief for this pass says it in as many words — inspect the
 * rendered animation, at 0%, 10%, … 100% — and this is the harness that does
 * it.
 *
 * The hard part is that an animation cannot be inspected while it plays. A
 * screenshot taken 40ms after the numbers it is compared against is a
 * screenshot of a different frame, and every "the smoke is detached" image
 * this project ever produced was exactly that.
 *
 * So the clock is **replaced**, before the application's first line runs:
 * `requestAnimationFrame` becomes a queue this script drains one frame at a
 * time, and `performance.now` reads a counter this script advances. The
 * sequence then runs deterministically, sixteen and two thirds milliseconds
 * per step, and at each decile the last frame drawn and the numbers read off
 * it describe the same instant — because they are the same instant.
 *
 * It writes a PNG per decile and prints a table of what each one contains.
 *
 *   node scripts/verify-airshow.mjs [--out DIR] [--url URL] [--headed]
 */
import { mkdirSync } from "node:fs";
import { launch } from "./lib/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const OUT = flag("--out", "artefacts/airshow");
const URL_ = flag("--url", "http://localhost:5173/");
const HEADED = args.includes("--headed");

/** One rendered frame at 60Hz. */
const FRAME_MS = 1000 / 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Installed before anything else on the page.
 *
 * `performance.now` is what the loading screen starts its clock from and what
 * every frame interval is measured against, so both it and the frame callback
 * have to come from the same counter. Everything else on the page keeps the
 * real clock; only the animation is stepped.
 */
const CLOCK = `
  (() => {
    let virtual = 0;
    let nextId = 1;
    let queue = [];
    const realNow = performance.now.bind(performance);
    performance.now = () => virtual;
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      queue.push({ id, callback });
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      queue = queue.filter((entry) => entry.id !== id);
    };
    window.__clock = {
      now: () => virtual,
      /** Advance one frame and run whatever was waiting for it. */
      step(ms) {
        virtual += ms;
        const due = queue;
        queue = [];
        for (const entry of due) entry.callback(virtual);
        return virtual;
      },
      pending: () => queue.length,
      real: realNow,
    };
  })();
`;

/** Everything worth knowing about the frame that is on the screen right now. */
const READ = `
  const screen = document.querySelector('.boot-screen');
  if (!screen) return { gone: true };
  const phase = screen.className.match(/boot-phase-([a-z]+)/)?.[1] ?? 'unknown';
  const parse = (node) => {
    if (!node) return null;
    // Doubled backslashes throughout: this is a JS template literal, so a
    // single backslash-d degrades to a plain d before Chrome sees the regex.
    const m = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px[^)]*\\)(?:\\s*rotate\\(([-\\d.]+)deg\\)\\s*scale\\(([\\d.]+)\\)\\s*scaleX\\(([\\d.]+)\\)\\s*scaleY\\(([\\d.]+)\\))?/.exec(node.style.transform ?? '');
    if (!m) return null;
    return {
      x: Number(m[1]),
      y: Number(m[2]),
      heading: m[3] === undefined ? 0 : Number(m[3]),
      scale: m[4] === undefined ? 1 : Number(m[4]),
      pitch: m[5] === undefined ? 1 : Number(m[5]),
      bank: m[6] === undefined ? 1 : Number(m[6]),
      layer: node.style.zIndex || '',
      opacity: Number(node.style.opacity || 1),
      // Where the artwork is actually drawn, as opposed to where the script
      // says it is. The only check here that crosses that boundary.
      drawn: (() => {
        const art = node.firstElementChild;
        if (!art) return null;
        const a = art.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        return [Math.round(a.x + a.width / 2 - b.x), Math.round(a.y + a.height / 2 - b.y)];
      })(),
    };
  };
  const escorts = [...document.querySelectorAll('.boot-escort')].map(parse);
  const leadNode = document.querySelector('.boot-lead');
  const leadShift = Number(/translate3d\\(([-\\d.]+)px/.exec(leadNode?.style.transform ?? '')?.[1] ?? 0);
  return { gone: false, phase, escorts, leadShift, clip: screen.style.clipPath || '' };
`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ headless: !HEADED, width: 1440, height: 900 });
  const page = await chrome.open("about:blank");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
  await page.goto(URL_);
  await page.waitFor("!!document.querySelector('.boot-screen') && !!window.__clock", {
    label: "the loading screen and the stepped clock",
  });

  /*
   * The application has to be genuinely ready before the display can break
   * off, and readiness happens on the *real* clock — a fetch, a hydration.
   * So the display is flown on the virtual clock until the page says it is
   * ready, and only then is the break-off allowed to happen. Without this the
   * sequence would break off at whatever moment the network happened to
   * settle, and no two runs would be comparable.
   */
  let elapsed = 0;
  const frames = [];
  const stepOnce = async () => {
    await page.evaluate("window.__clock.step(" + FRAME_MS + "); return true;");
    elapsed += FRAME_MS;
    const read = await page.evaluate(READ);
    frames.push({ at: elapsed, ...read });
    return read;
  };

  // Fly the display for its floor while the application loads for real.
  const floorFrames = Math.ceil(2600 / FRAME_MS);
  for (let i = 0; i < floorFrames; i++) {
    await stepOnce();
    // A real millisecond per frame, so React's own scheduler — which does not
    // use rAF — gets to run between them.
    if (i % 12 === 0) await sleep(12);
  }

  // Then run to the end, however long that takes.
  let guard = 0;
  while (guard++ < 1200) {
    const read = await stepOnce();
    if (read.gone) break;
    if (guard % 12 === 0) await sleep(8);
  }

  const total = elapsed;
  console.log(`The whole sequence ran in ${(total / 1000).toFixed(2)}s of animation time, ${frames.length} frames.\n`);

  // ── The pictures ───────────────────────────────────────────────────────────
  // Replayed from the start on a fresh load, stopping at each decile, because
  // a screenshot has to be of a frame that is still on the screen.
  const shots = [];
  for (const percent of [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]) {
    const target = Math.min(total - FRAME_MS, (total * percent) / 100);
    const shot = await capture(chrome, target, percent);
    shots.push(shot);
  }

  console.log("\n  %   t(ms)  phase     blue                     red                      white");
  for (const shot of shots) {
    const line = (e) =>
      e && e.opacity > 0.02
        ? `${String(Math.round(e.x)).padStart(5)},${String(Math.round(e.y)).padStart(5)} h${String(Math.round(e.heading)).padStart(4)}° z${e.layer} s${e.scale.toFixed(2)}`
        : "        —               ";
    console.log(
      `${String(shot.percent).padStart(3)} ${String(Math.round(shot.at)).padStart(6)}  ${(shot.phase ?? "gone").padEnd(9)} ${line(shot.escorts?.[0])} ${line(shot.escorts?.[1])} ${line(shot.escorts?.[2])}`,
    );
  }
  console.log(`\nPNGs in ${OUT}/`);

  await frameCost(chrome);
  await chrome.close();
}

/**
 * What the sequence costs, on the real clock.
 *
 * Everything above runs on a *replaced* clock, which is what makes it
 * inspectable and also what makes it say nothing whatever about performance —
 * a frame stepped by a script takes as long as the script waits. §1.24 is a
 * separate question and needs a separate run: load the page normally, record
 * the interval between rendered frames, and see whether it holds sixty.
 */
async function frameCost(chrome) {
  const page = await chrome.open("about:blank");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__frames = [];
      const raf = window.requestAnimationFrame.bind(window);
      let previous = null;
      let seen = false;
      const watch = (now) => {
        const showing = !!document.querySelector('.boot-screen');
        if (showing) {
          seen = true;
          if (previous !== null) window.__frames.push(now - previous);
          previous = now;
        }
        // Keep looking until the screen has been up and gone again: this runs
        // before React has mounted anything at all, so a plain "stop when it
        // is not there" stops on the first frame and reports nothing.
        if (!seen || showing) raf(watch);
      };
      raf(watch);
    `,
  });
  await page.goto(URL_);
  await page.waitFor("!document.querySelector('.boot-screen')", { timeoutMs: 30000, label: "the sequence to end" });
  const frames = JSON.parse(await page.evaluate("JSON.stringify(window.__frames ?? [])"));
  if (frames.length === 0) {
    console.log("\nFrame cost: no frames recorded.");
    return;
  }
  const slow = frames.filter((ms) => ms > 20).length;
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  console.log(
    `\nFrame cost on the real clock: ${frames.length} frames, median ${at(0.5).toFixed(1)}ms, ` +
      `p99 ${at(0.99).toFixed(1)}ms, worst ${sorted.at(-1).toFixed(1)}ms, ${slow} over 20ms.`,
  );
}

/** Load again, step to `target`, and photograph the frame that is showing. */
async function capture(chrome, target, percent) {
  const page = await chrome.open("about:blank");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
  await page.goto(URL_);
  await page.waitFor("!!window.__clock", { label: "the stepped clock" });
  let at = 0;
  let read = null;
  while (at < target) {
    await page.evaluate("window.__clock.step(" + FRAME_MS + "); return true;");
    at += FRAME_MS;
    if (Math.round(at / FRAME_MS) % 12 === 0) await sleep(10);
  }
  // Let React paint the class it was told about on the last frame, then shoot.
  await sleep(140);
  read = await page.evaluate(READ);
  const name = `${OUT}/${String(percent).padStart(3, "0")}pc.png`;
  await page.screenshot(name);
  await page.close?.();
  return { percent, at, ...read };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
