/**
 * End-to-end verification, in a real Chrome, against a real database.
 *
 * The one thing this project has learned twice at cost: **unit tests do not
 * catch what the browser catches.** English month names inside a translated
 * sentence, a control an overlay was stealing the click from, an editor that
 * lost focus on the second keystroke — every one of those passed its unit tests
 * and was found by looking at the page.
 *
 * Those checks used to be driven by hand through DevTools, which meant they
 * were only run when somebody remembered and could be blocked entirely by a
 * stale browser process. This runs them.
 *
 * Usage — with the API and Vite already running:
 *   node scripts/verify-browser.mjs [--url http://localhost:5173] [--headed]
 *
 * Run it against a *freshly started* dev server: a few checks read the store
 * through a dynamic import, and Vite serves HMR-updated modules under a `?t=`
 * URL that would hand them a second, empty copy. There is a check for that.
 *
 * It creates its own account on every run, so it never touches existing data.
 * Exit code is 0 only if every check passed.
 */
import { launch } from "./lib/cdp.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const BASE = (arg("url", process.env.VERIFY_URL ?? "http://localhost:5173")).replace(/\/$/, "");
const HEADLESS = !argv.includes("--headed");

const results = [];
let currentGroup = "";

const group = (name) => {
  currentGroup = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
};

/*
 * Deliberately no way to run one check in isolation. The checks below are one
 * session: an account is created, a theme is chosen, a period is stepped
 * through. Skipping the setup and running the twelfth check alone would test
 * nothing and report a pass.
 */
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ group: currentGroup, name, ok: true, detail });
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[2m— ${detail}\x1b[0m` : ""}`);
  } catch (error) {
    results.push({ group: currentGroup, name, ok: false, detail: error.message });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      \x1b[31m${error.message}\x1b[0m`);
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const equal = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for the loading sequence to finish and the shell to be up. */
async function waitForApp(page) {
  await page.waitFor("!document.querySelector('.boot-screen')", { timeoutMs: 20000, label: "the loading screen to leave" });
}

/** Switch tab through the real navigation, and wait for the transition. */
async function openTab(page, tab) {
  await page.click(`.nav-item[data-tab="${tab}"], .mobile-nav-item[data-tab="${tab}"]`);
  await sleep(760); // the transition is 690ms end to end
  await page.waitFor(`!document.querySelector('.app-sweep')`, { label: `the ${tab} transition to finish` });
}

const chrome = await launch({ headless: HEADLESS });
const page = await chrome.open("about:blank");

const stamp = Number(process.env.VERIFY_STAMP ?? `${process.pid}${Math.floor(process.uptime() * 1000)}`);
const account = { email: `verify-${stamp}@example.test`, password: "verify-password-9042" };

try {
  // ── The loading sequence ───────────────────────────────────────────────────
  group("Loading sequence");

  await page.goto(BASE);

  const phases = [];
  /*
   * Sampled *while it plays*, because none of this exists afterwards. Two
   * things are recorded on the way past: whether an escort is ever drawn
   * behind the lead aircraft and ever in front of it (the depth), and the
   * order of the smoke bands once the formation is together (the tricolour).
   */
  const depth = new Set();
  let bands = null;
  /*
   * Two more things recorded on the way past, both of which the last pass
   * asserted in prose and neither of which anything measured:
   *
   *  - how far each escort's own smoke starts from its tailpipe, so "the
   *    smoke comes out of the back of the aeroplane" is a number;
   *  - how far the track wanders from a circle, so "an aerobatic routine, not
   *    a ring" is one too.
   */
  let emitterGap = null;
  const radii = [];
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const frame = await page.evaluate(`
      const screen = document.querySelector('.boot-screen');
      const phase = screen?.className.match(/boot-phase-(\\w+)/)?.[1] ?? 'gone';
      const layers = [...document.querySelectorAll('.boot-escort')].map((e) => e.style.zIndex).filter(Boolean);

      /*
       * The tailpipe, from the transform the sprite is actually drawn with,
       * against the newest smoke of the matching colour. Both are read off the
       * page — the transform string and the canvas pixels — so this measures
       * what is on screen rather than what the script intended.
       */
      let gap = null;
      const track = [];
      const escorts = [...document.querySelectorAll('.boot-escort')].slice(0, 2);
      const canvases = [...document.querySelectorAll('.boot-smoke')];
      if (phase === 'orbit' && escorts.length === 2 && canvases.length === 2) {
        const dpr = canvases[0].width / 1180;
        const columns = canvases.map((c) => c.getContext('2d').getImageData(0, 0, c.width, c.height));
        // One read per canvas per sample, shared by both escorts.
        const HUES = [(r, g, b) => b > r + 30, (r, g, b) => r > b + 30];
        const gaps = [];
        for (const [seat, escort] of escorts.entries()) {
          /* Every backslash is doubled below. This whole block is a JS
             template literal, so a single backslash-d degrades to a plain d
             and a single backslash-paren to a capture group before the browser
             ever sees the regex. The file header warns about exactly this; it
             caught the project out once before and it has just done it again.
             (And no backticks in here either — they would end the literal.) */
          const m = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px[^)]*\\)\\s*rotate\\(([-\\d.]+)deg\\)\\s*scale\\(([\\d.]+)\\)/.exec(escort.style.transform ?? '');
          if (!m) continue;
          const [cx, cy, deg, scale] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
          track.push(Math.hypot(cx, cy));
          const rad = (deg * Math.PI) / 180;
          const tx = cx - Math.cos(rad) * 28.16 * scale;
          const ty = cy - Math.sin(rad) * 28.16 * scale;
          /*
           * A window around the tailpipe, not the whole canvas.
           *
           * Scanning both 2360×1240 backing stores per sample took long enough
           * that the sequence finished during the first one, and the check
           * reported "never caught the escorts mid-routine" — a measurement
           * slow enough to miss what it measures.
           */
          const WINDOW = 70;
          const px0 = Math.max(0, Math.round((tx + 590 - WINDOW) * dpr));
          const px1 = Math.min(columns[0].width - 1, Math.round((tx + 590 + WINDOW) * dpr));
          const py0 = Math.max(0, Math.round((ty + 310 - WINDOW) * dpr));
          const py1 = Math.min(columns[0].height - 1, Math.round((ty + 310 + WINDOW) * dpr));
          let best = Infinity;
          for (const image of columns) {
            const data = image.data;
            for (let y = py0; y <= py1; y += 2) {
              for (let x = px0; x <= px1; x += 2) {
                const p = (y * image.width + x) * 4;
                if (data[p + 3] < 60) continue;
                if (!HUES[seat](data[p], data[p + 1], data[p + 2])) continue;
                const d = Math.hypot(x / dpr - 590 - tx, y / dpr - 310 - ty);
                if (d < best) best = d;
              }
            }
          }
          if (Number.isFinite(best)) gaps.push(Math.round(best));
        }
        if (gaps.length) gap = Math.max(...gaps);
      }
      let bands = null;
      if (phase === 'settle' || phase === 'depart') {
        const canvases = [...document.querySelectorAll('.boot-smoke')];
        if (canvases.length === 2) {
          const dpr = canvases[0].width / 1180;
          // A vertical cut just behind the formation's slots, where the three
          // ribbons are still parallel and have not yet spread into each other.
          const x = Math.round((1180 / 2 - 170) * dpr);
          const columns = canvases.map((c) => c.getContext('2d').getImageData(x, 0, 1, c.height).data);
          const rows = [];
          for (let y = 0; y < canvases[0].height; y += Math.round(2 * dpr)) {
            let best = null;
            for (const data of columns) {
              const p = y * 4;
              if (data[p + 3] < 12) continue;
              if (!best || data[p + 3] > best[3]) best = [data[p], data[p + 1], data[p + 2], data[p + 3]];
            }
            if (!best) continue;
            const hue = best[2] > best[0] + 18 ? 'blue' : best[0] > best[2] + 18 ? 'red' : 'white';
            rows.push({ y: Math.round(y / dpr - 310), hue });
          }
          const runs = [];
          for (const row of rows) {
            if (runs.at(-1)?.hue !== row.hue) runs.push({ hue: row.hue, from: row.y, to: row.y });
            else runs.at(-1).to = row.y;
          }
          bands = runs.filter((r) => r.to - r.from >= 4);
        }
      }
      return { phase, layers, bands, gap, track };
    `);
    if (phases.at(-1) !== frame.phase) phases.push(frame.phase);
    for (const layer of frame.layers) depth.add(layer);
    if (frame.gap != null) emitterGap = emitterGap == null ? frame.gap : Math.min(emitterGap, frame.gap);
    for (const radius of frame.track ?? []) radii.push(radius);
    // The three ribbons nearest the slots, once all three are laid down.
    if (frame.bands) {
      const near = frame.bands.filter((band) => band.from >= -80 && band.to <= 80);
      if (near.length === 3) bands = near;
    }
    if (frame.phase === "gone") break;
    await sleep(40);
  }

  await check("flies the whole sequence: orbit, join, settle, depart", () => {
    for (const expected of ["orbit", "join", "settle", "depart", "gone"]) {
      assert(phases.includes(expected), `never reached "${expected}" (saw ${phases.join(" → ")})`);
    }
    return phases.join(" → ");
  });

  /*
   * "Circle around" means depth, not a flat ellipse.
   *
   * The previous version moved two sprites round a racetrack in the screen
   * plane; they passed left and right of the lead and never once went behind
   * it. The z-index is the evidence that they do now: the escorts are drawn
   * under the lead on the far half of the turn and over it on the near half.
   */
  await check("the escorts pass both behind and in front of the lead", () => {
    assert(depth.has("1"), "no escort was ever drawn behind the lead aircraft");
    assert(depth.has("3"), "no escort was ever drawn in front of the lead aircraft");
    return "behind and in front";
  });

  await check("the smoke comes out of the back of the aeroplane", () => {
    /*
     * Measured from the sprite's own transform to the nearest pixel of its own
     * colour. The emitter used to be a bare `x - 26` with no heading at all
     * for the whole of the roll-out, so the exhaust sat beside the aircraft
     * rather than behind it — and the ribbon's head was thin enough under the
     * blur that it looked detached even where it was not.
     */
    assert(emitterGap != null, "never caught the escorts mid-routine");
    assert(emitterGap <= 26, `the smoke starts ${emitterGap}px from the tailpipe`);
    return `${emitterGap}px from the tailpipe`;
  });

  await check("the escorts fly a routine, not a ring", () => {
    // A circle has one radius. This one breathes, rolls and climbs, so the
    // distance from the lead has to vary by a real margin over a circuit.
    // The orbit is elastic: a warm load breaks it off at the 700ms floor, so
    // the sample count is small and the *variation* is the assertion.
    assert(radii.length >= 8, `only ${radii.length} samples of the track`);
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    assert(max - min > 40, `the track varies by only ${Math.round(max - min)}px — that is a ring`);
    return `${Math.round(min)}–${Math.round(max)}px from the lead`;
  });

  await check("the formation leaves a tricolour: blue, white, red", () => {
    assert(bands, "the three ribbons were never all parallel behind the formation");
    equal(bands.map((band) => band.hue).join(" "), "blue white red", "the bands, top to bottom");
    return bands.map((band) => `${band.hue}@${band.from}`).join(" · ");
  });

  await check("the Concorde is the default lead aircraft", async () => {
    // The overlay is gone by now, so this is read from the preference the
    // loading screen would have used.
    const stored = await page.evaluate("localStorage.getItem('boot-aircraft')");
    assert(stored === null || stored === "concorde", `boot-aircraft was ${stored}`);
    return "no stored preference → Concorde";
  });

  // ── Signing up ─────────────────────────────────────────────────────────────
  group("A brand-new account");

  await check("the sign-in card carries the new mark", async () => {
    const src = await page.evaluate("document.querySelector('.auth-card img')?.getAttribute('src') ?? 'none'");
    equal(src, "/brand/app-mark.png", "the mark on the sign-in card");
    const loaded = await page.evaluate(`
      const image = document.querySelector('.auth-card img');
      return image ? image.complete && image.naturalWidth > 0 : false;
    `);
    assert(loaded, "the mark did not decode");
    return src;
  });

  /*
   * The server's errors, in the reader's language.
   *
   * They were the server's own English sentences, shown verbatim — and the
   * session-expired banner was worse: the store writes a key rather than a
   * sentence so it can be said in whatever language is chosen when it is
   * *read*, and the sign-in card rendered the key. The API answers with a
   * stable code; the client says it.
   */
  await check("a failed sign-in is reported in the reader's language", async () => {
    await page.setValue("input[type=email]", `nobody-${stamp}@example.test`);
    await page.setValue("input[type=password]", "definitely-not-the-password");
    await page.click(".auth-submit");
    await page.waitFor("!!document.querySelector('.auth-banner-error')", { timeoutMs: 9000, label: "the error banner" });
    const banner = await page.evaluate("document.querySelector('.auth-banner-error')?.innerText.trim() ?? ''");
    assert(banner.length > 0, "a failed sign-in said nothing");
    assert(!banner.includes("@auth."), `a raw translation key reached the screen: ${banner}`);
    // The harness runs in French; the English wording must not be what shows.
    assert(!/incorrect email or password/i.test(banner), `the server's English reached the screen: ${banner}`);
    return banner;
  });

  await check("creates an account through the form", async () => {
    await page.evaluate(`
      const create = document.querySelector('[data-auth="signup"]');
      if (!create) throw new Error('No sign-up control');
      create.click();
      return true;
    `);
    await page.waitFor("document.querySelectorAll('input[type=password]').length === 2");
    await page.setValue("input[type=email]", account.email);
    await page.evaluate(`
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const field of document.querySelectorAll('input[type=password]')) {
        setter.call(field, ${JSON.stringify(account.password)});
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    `);
    await page.click(".auth-submit");
    await page.waitFor("!!document.querySelector('.app-shell')", { timeoutMs: 25000, label: "the app shell" });
    await waitForApp(page);
    return account.email;
  });

  /*
   * Several checks below reach into the store with a dynamic `import()`. That
   * only reads the *live* store if the module URL resolves to the instance the
   * application itself imported — and after an HMR update Vite serves the same
   * file under a `?t=` URL, so a bare import silently returns a second, empty
   * copy. That reads as "nothing was ever stored" and fails checks that are
   * actually passing (and would pass checks that are actually failing).
   *
   * `hydrated` is the tell: the live store has hydrated by now, a fresh copy
   * never will. Run against a freshly started dev server if this fails.
   */
  await check("the store the checks read is the one the page is using", async () => {
    const live = await page.evaluate(`
      const { useBudgetStore } = await import('/src/store/budgetStore.ts');
      return useBudgetStore.getState().hydrated;
    `);
    assert(live, "the imported store is a second module instance — restart the dev server");
    return "same module instance";
  });

  await check("the tour opens by itself, at step one", async () => {
    await page.waitFor("!!document.querySelector('.tutorial-card')", { timeoutMs: 8000, label: "the tour" });
    const heading = await page.evaluate(
      "document.querySelector('.tutorial-progress')?.textContent?.trim() ?? 'no tour'",
    );
    assert(heading !== "no tour", "the tour did not open for a new account");
    return heading;
  });

  /*
   * The tour teaches by asking, and remembers a "later".
   *
   * Both halves are checked here because both were claimed and neither had
   * ever been driven: that a task step really refuses to advance until the
   * work is done, and that "Decide later" leaves a resumable reminder rather
   * than either nagging or forgetting.
   */
  await check("a task step will not advance until the task is actually done", async () => {
    for (let i = 0; i < 3; i++) {
      await page.click(".tutorial-card .btn-primary");
      await sleep(600);
    }
    const state = await page.evaluate(`
      const card = document.querySelector('.tutorial-card');
      return {
        step: card?.querySelector('.tutorial-progress')?.textContent ?? '',
        hasTask: !!card?.querySelector('.tutorial-task'),
        locked: !!card?.querySelector('.btn-primary')?.disabled,
        escape: !!card?.querySelector('.tutorial-task button, .tutorial-foot-nav .btn-ghost'),
      };
    `);
    assert(state.hasTask, "three steps in and no step asks for anything");
    assert(state.locked, "the task step advances without the task being done");
    assert(state.escape, "a locked step with no way past it is a trap");
    return "locked, with a way past";
  });

  await check('"Decide later" is remembered, and is resumable', async () => {
    await page.evaluate(`
      const later = [...document.querySelectorAll('.tutorial-card .tutorial-foot-leave button')].at(-1);
      if (!later) throw new Error('no later button');
      later.click();
      return true;
    `);
    await sleep(600);
    assert(await page.evaluate("!document.querySelector('.tutorial-card')"), "the card stayed open");
    const reminder = await page.evaluate(
      "document.querySelector('.tutorial-reminder')?.innerText.replace(/\\n/g, ' · ') ?? ''",
    );
    assert(reminder.length > 0, "postponing left no reminder");
    // And it survives a reload without the tour reopening by itself.
    await page.goto(BASE);
    await waitForApp(page);
    await sleep(1200);
    const after = await page.evaluate(`
      return { card: !!document.querySelector('.tutorial-card'), reminder: !!document.querySelector('.tutorial-reminder') };
    `);
    assert(!after.card, "the tour reopened by itself after being postponed");
    assert(after.reminder, "the reminder did not survive a reload");
    return reminder.slice(0, 60);
  });

  await check("dismissing the reminder ends it for good", async () => {
    await page.evaluate(`
      const close = document.querySelector('.tutorial-reminder .btn-icon');
      if (!close) throw new Error('no dismiss button');
      close.click();
      return true;
    `);
    await sleep(500);
    await page.goto(BASE);
    await waitForApp(page);
    await sleep(1200);
    const after = await page.evaluate(`
      return { card: !!document.querySelector('.tutorial-card'), reminder: !!document.querySelector('.tutorial-reminder') };
    `);
    assert(!after.reminder, "the dismissed reminder came back");
    assert(!after.card, "the tour reopened after the reminder was dismissed");
    return "gone, and stays gone";
  });

  /*
   * Skip is not Later, and the difference is the whole point of having two.
   *
   * Later leaves a reminder (checked above). Skip is a refusal: the tour ends,
   * nothing reappears, and no reminder strip is left behind. The tour is
   * restarted from Settings to test it, which also exercises the replay
   * button — the only route back once somebody has said no.
   */
  await check("Skip refuses the tour outright, and leaves no reminder", async () => {
    await openTab(page, "settings");
    await page.click('.settings-group:nth-child(5)');
    await sleep(300);
    await page.evaluate(`
      const replay = document.querySelector('[data-action="replay-tutorial"]');
      if (!replay) throw new Error('no replay button in Settings');
      replay.click();
      return true;
    `);
    await page.waitFor("!!document.querySelector('.tutorial-card')", { timeoutMs: 6000, label: "the replayed tour" });
    await page.evaluate(`
      const skip = document.querySelector('.tutorial-foot-leave button');
      if (!skip) throw new Error('no skip button');
      skip.click();
      return true;
    `);
    await sleep(500);
    const after = await page.evaluate(`
      return { card: !!document.querySelector('.tutorial-card'), reminder: !!document.querySelector('.tutorial-reminder') };
    `);
    assert(!after.card, "the tour is still on screen after Skip");
    assert(!after.reminder, "Skip left a reminder, which is what Later is for");
    return "refused, no reminder";
  });

  // ── Themes ─────────────────────────────────────────────────────────────────
  group("Themes");

  await openTab(page, "settings");
  // Settings remembers which group is open, and the checks above leave it on
  // Account. Selecting the group explicitly means these checks do not depend
  // on what ran before them.
  await page.click('.settings-group:nth-child(1)');
  await sleep(250);

  await check("every preset applies, and paints the page it claims to", async () => {
    const observed = [];
    const ids = await page.evaluate(
      "Array.from(document.querySelectorAll('.theme-swatch')).map((b) => b.textContent.trim())",
    );
    assert(ids.length >= 6, `only ${ids.length} themes offered`);
    for (let index = 0; index < ids.length; index++) {
      await page.click(`.theme-grid .theme-swatch:nth-child(${index + 1})`);
      await sleep(160);
      const state = await page.evaluate(`
        const root = document.documentElement;
        const style = getComputedStyle(root);
        return {
          theme: root.dataset.theme,
          bg: style.getPropertyValue('--bg').trim(),
          body: getComputedStyle(document.body).backgroundColor,
        };
      `);
      assert(state.theme, `theme ${index} set no data-theme`);
      observed.push(`${state.theme}=${state.bg}`);
    }
    const unique = new Set(observed.map((entry) => entry.split("=")[1]));
    assert(unique.size >= 5, `themes share backgrounds: ${observed.join(", ")}`);
    return observed.join(", ");
  });

  await check("the deep-black theme refuses a light appearance", async () => {
    await page.click(".theme-grid .theme-swatch:nth-child(4)");
    await sleep(200);
    const state = await page.evaluate(`
      const disabled = Array.from(document.querySelectorAll('.segmented-item')).every((b) => b.disabled);
      return { dark: document.documentElement.classList.contains('dark'), disabled,
               bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() };
    `);
    assert(state.dark, "deep black did not force the dark appearance");
    assert(state.disabled, "the appearance control is still offered");
    equal(state.bg, "#000000", "the background");
    return "forced dark, control disabled, #000000";
  });

  await check("the choice survives a full reload", async () => {
    await page.click(".theme-grid .theme-swatch:nth-child(5)");
    await sleep(400);
    await page.goto(BASE);
    await waitForApp(page);
    const theme = await page.evaluate("document.documentElement.dataset.theme");
    equal(theme, "alpine", "the theme after a reload");
    return theme;
  });

  await check("back to the default", async () => {
    await openTab(page, "settings");
    await page.click(".theme-grid .theme-swatch:nth-child(1)");
    await sleep(300);
    equal(await page.evaluate("document.documentElement.dataset.theme"), "airfrance", "the theme");
    return "airfrance";
  });

  // ── The aircraft preference ────────────────────────────────────────────────
  group("Aircraft");

  await page.click('.settings-group:nth-child(1)');
  await sleep(250);

  await check("three aircraft fly the loading screen, each its own drawing", async () => {
    const sources = await page.evaluate(
      "Array.from(document.querySelectorAll('.aircraft-choice img')).map((i) => i.getAttribute('src'))",
    );
    equal(sources.length, 3, "loading aircraft offered");
    assert(new Set(sources).size === 3, `the drawings are not distinct: ${sources.join(", ")}`);
    const decoded = await page.evaluate(
      "Array.from(document.querySelectorAll('.aircraft-choice img')).every((i) => i.complete && i.naturalWidth > 0)",
    );
    assert(decoded, "a drawing failed to decode");
    return sources.join(", ");
  });

  /*
   * The whole sheet, not three of it.
   *
   * The previous pass shipped three silhouettes traced from the three
   * illustrations and called that "the supplied aircraft set". This checks the
   * thing that was actually asked for: every aircraft on the Flightradar24
   * sheet, cut out, white, and offered.
   */
  await check("the transition offers the whole fleet, in white", async () => {
    const fleet = await page.evaluate(`
      const tiles = [...document.querySelectorAll('.fleet-choice img')];
      return {
        count: tiles.length,
        distinct: new Set(tiles.map((i) => i.getAttribute('src'))).size,
        decoded: tiles.every((i) => i.complete && i.naturalWidth > 0),
        fromSheet: tiles.every((i) => (i.getAttribute('src') ?? '').startsWith('/craft/fleet/')),
        named: [...document.querySelectorAll('.fleet-choice')].every((b) => (b.getAttribute('aria-label') ?? '').length > 1),
      };
    `);
    assert(fleet.count >= 20, `only ${fleet.count} aircraft in the fleet`);
    equal(fleet.distinct, fleet.count, "every tile is a different aircraft");
    assert(fleet.decoded, "a silhouette failed to decode");
    assert(fleet.fromSheet, "a silhouette does not come from the extracted sheet");
    assert(fleet.named, "a silhouette has no accessible name");
    // White, measured off the pixels rather than assumed from the filename.
    const white = await page.evaluate(`
      const image = document.querySelector('.fleet-choice img');
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0, whitish = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        opaque++;
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) whitish++;
      }
      return { opaque, whitish };
    `);
    assert(white.opaque > 200, "the silhouette is empty");
    assert(white.whitish / white.opaque > 0.98, `only ${((white.whitish / white.opaque) * 100).toFixed(1)}% of the shape is white`);
    return `${fleet.count} aircraft, white`;
  });

  await check("choosing one changes the aircraft in the transition", async () => {
    await page.click('[data-fleet="turboprop"]');
    await sleep(300);
    await page.click('.nav-item[data-tab="dashboard"]');
    await sleep(120);
    const src = await page.evaluate(
      "document.querySelector('.app-sweep-craft img')?.getAttribute('src') ?? 'no craft'",
    );
    equal(src, "/craft/fleet/turboprop.png", "the transition aircraft");
    await sleep(800);
    return src;
  });

  await check("the loading aircraft is remembered for the next boot", async () => {
    await openTab(page, "settings");
    await page.click('[data-aircraft="a350"]');
    await sleep(300);
    equal(await page.evaluate("localStorage.getItem('boot-aircraft')"), "a350", "the stored boot aircraft");
    return "a350";
  });

  await check("back to the Concorde, in both places", async () => {
    await page.click('[data-aircraft="concorde"]');
    await page.click('[data-fleet="concorde"]');
    await sleep(300);
    const stored = await page.evaluate(`
      const { useBudgetStore } = await import('/src/store/budgetStore.ts');
      const s = useBudgetStore.getState().snapshot.settings;
      return [s.aircraft, s.transitionAircraft].join(",");
    `);
    equal(stored, "concorde,concorde", "the two aircraft preferences");
    return "concorde";
  });

  // ── The transition ─────────────────────────────────────────────────────────
  group("Transition");

  await check("always travels left to right, whichever way the tabs move", async () => {
    const observed = [];
    for (const tab of ["wallet", "dashboard"]) {
      await page.click(`.nav-item[data-tab="${tab}"]`);
      await sleep(90);
      const names = await page.evaluate(`
        const sweep = document.querySelector('.app-sweep');
        const panel = document.querySelector('.tab-panel');
        return {
          sweep: sweep ? getComputedStyle(sweep).animationName : 'none',
          craft: document.querySelector('.app-sweep-craft')
            ? getComputedStyle(document.querySelector('.app-sweep-craft')).animationName : 'none',
        };
      `);
      observed.push(`${tab}:${names.sweep}/${names.craft}`);
      await sleep(800);
    }
    for (const entry of observed) {
      assert(entry.includes("appSweepCover"), `the sweep did not cover from the left: ${entry}`);
      assert(entry.includes("craftRun"), `no aircraft ran: ${entry}`);
    }
    return observed.join(", ");
  });

  // ── The period selector ────────────────────────────────────────────────────
  group("Period selector");

  await check("its popover is on top of everything behind it", async () => {
    await page.click(".period-current");
    await sleep(260);
    const reachable = await page.evaluate(`
      const popover = document.querySelector('.period-panel');
      if (!popover) return { missing: true };
      const controls = Array.from(popover.querySelectorAll('button, select, input'));
      const blocked = [];
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!hit || !(control.contains(hit) || control === hit)) {
          blocked.push((control.textContent || control.className).trim().slice(0, 30));
        }
      }
      return { count: controls.length, blocked };
    `);
    assert(!reachable.missing, "the popover did not open");
    equal(reachable.blocked.length, 0, `controls intercepted: ${reachable.blocked.join(", ")}`);
    return `${reachable.count} controls, none intercepted`;
  });

  await check("the historical banner cannot steal the selector's press", async () => {
    // Go back a month so the banner appears, then reopen the selector over it.
    await page.click(".period-nav .period-step:first-child");
    await sleep(420);
    const banner = await page.evaluate("!!document.querySelector('.historical-banner')");
    assert(banner, "no historical banner after stepping back");

    await page.click(".period-current");
    await sleep(260);
    const opaque = await page.evaluate(`
      const band = document.querySelector('.historical-banner');
      const style = getComputedStyle(band);
      const overlapping = [];
      const popover = document.querySelector('.period-panel');
      if (popover) {
        const a = popover.getBoundingClientRect();
        const b = band.getBoundingClientRect();
        if (!(a.bottom < b.top || b.bottom < a.top)) {
          for (const control of popover.querySelectorAll('button, select')) {
            const rect = control.getBoundingClientRect();
            if (rect.width === 0) continue;
            if (rect.bottom < b.top || b.bottom < rect.top) continue;
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            if (!hit || !(control.contains(hit) || control === hit)) overlapping.push(control.textContent.trim());
          }
        }
      }
      return {
        pointerEvents: style.pointerEvents,
        background: style.backgroundColor,
        image: style.backgroundImage,
        overlapping,
      };
    `);
    equal(opaque.pointerEvents, "none", "the banner band's pointer-events");
    // Opaque means the *painted* result is opaque: a fully opaque
    // `background-color`, and no partially transparent stop in the gradient
    // over it. A translucent banner reads as a rendering fault rather than as
    // a state, which is what it used to be.
    const alpha = opaque.background.match(/rgba?\(([^)]+)\)/);
    const channels = alpha ? alpha[1].split(",").map((part) => Number(part)) : [];
    assert(channels.length === 3 || channels[3] === 1, `the banner colour is translucent: ${opaque.background}`);
    assert(!/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(opaque.image), `the banner gradient is translucent: ${opaque.image}`);
    equal(opaque.overlapping.length, 0, `controls over the banner were intercepted: ${opaque.overlapping.join(", ")}`);
    return `banner ${opaque.background}, pointer-events none`;
  });

  await check("returns to the current period in one press", async () => {
    await page.evaluate("document.body.click(); return true;");
    await sleep(200);
    await page.click(".period-jump");
    await sleep(500);
    const gone = await page.evaluate("!document.querySelector('.historical-banner')");
    assert(gone, "still in a historical period");
    return "back to today";
  });

  // ── Exchange rates ────────────────────────────────────────────────────────
  group("Exchange rates");

  /*
   * These run against the live provider. That is the point: a rate refresh
   * mocked at the fetch boundary proves the parser works, not that the
   * application asks anybody for rates when it opens — which is exactly the
   * thing that was missing.
   *
   * So the first check tolerates the network being down, and asserts the
   * property that actually matters in both cases: whatever the outcome, the
   * application must not claim to hold current rates that it does not hold.
   */
  await check("fetches rates on open, without anyone asking for them", async () => {
    await openTab(page, "currencies");
    const state = await page.evaluate(`
      const { useBudgetStore } = await import('/src/store/budgetStore.ts');
      const { rateFreshness } = await import('/src/domain/exchangeRates.ts');
      const rates = useBudgetStore.getState().snapshot.settings.exchangeRates;
      const f = rateFreshness(rates);
      return { count: Object.keys(rates.perEur ?? {}).length, source: rates.ratesSource ?? null,
               state: f.state, error: rates.ratesLastError ?? null, checked: rates.ratesCheckedAt ?? null };
    `);
    if (state.state === "current") {
      assert(state.count > 20, `only ${state.count} rates were stored`);
      equal(state.source, "open.er-api.com", "the rate source");
      return `${state.count} rates from ${state.source}`;
    }
    // The honest-failure path: a refusal is recorded, and nothing pretends.
    assert(state.checked, "a failed refresh left no record that it was attempted");
    equal(state.state, "failed", "the freshness state after a failed refresh");
    return `provider unreachable, reported as failed (${state.error})`;
  });

  await check("says so on the page rather than showing a rate it does not have", async () => {
    const shown = await page.evaluate(`
      const cards = [...document.querySelectorAll('.currency-card')];
      const base = cards.find((card) => card.querySelector('.currency-card-rate')?.textContent?.trim().length > 0);
      return { cards: cards.length,
               warnings: document.querySelectorAll('.currency-card-warning').length,
               rate: base?.querySelector('.currency-card-rate')?.textContent?.trim() ?? '' };
    `);
    assert(shown.cards >= 2, "fewer than two currencies are pinned");
    // Either every pinned currency converts, or the ones that cannot are
    // marked. A silent "—" with no warning is the failure this rules out.
    const dashes = await page.evaluate(
      "[...document.querySelectorAll('.currency-card-rate')].filter((el) => el.textContent.trim() === '—').length",
    );
    equal(dashes, shown.warnings, "unconvertible currencies without a warning");
    return `${shown.cards} cards, ${shown.warnings} marked unconvertible`;
  });

  await check("exchange mode is announced, not merely coloured", async () => {
    await page.click('[data-action="exchange-mode"]');
    await sleep(250);
    const mode = await page.evaluate(`
      const page = document.querySelector('.currency-page');
      const banner = document.querySelector('.exchange-banner');
      const toggle = document.querySelector('[data-action="exchange-mode"]');
      return { mode: page?.dataset.exchangeMode ?? null,
               words: banner?.innerText.trim() ?? '',
               tint: banner ? getComputedStyle(banner).backgroundColor : '',
               pressed: toggle?.getAttribute('aria-pressed') ?? null,
               unpins: document.querySelectorAll('.currency-card-unpin').length };
    `);
    equal(mode.mode, "on", "the page's exchange-mode state");
    equal(mode.pressed, "true", "the toggle's pressed state");
    assert(mode.words.length > 10, "the mode changed without saying so");
    // Orange, and measured rather than assumed: red clearly ahead of blue.
    const [r, g, b] = mode.tint.match(/[\d.]+/g).map(Number);
    assert(r > b + 20 && r >= g, `the overlay is not warm: ${mode.tint}`);
    equal(mode.unpins, 0, "unpin buttons still offered while exchanging");
    return `${mode.tint}, "${mode.words.split("\n")[0]}"`;
  });

  await check("two presses pick a pair and show its rate in both directions", async () => {
    const codes = await page.evaluate(
      "[...document.querySelectorAll('[data-currency]')].map((el) => el.dataset.currency)",
    );
    assert(codes.length >= 2, "fewer than two currencies to exchange");
    await page.click(`[data-currency="${codes[0]}"]`);
    await sleep(200);
    const first = await page.evaluate(
      `document.querySelector('[data-currency="${codes[0]}"]')?.getAttribute('aria-pressed')`,
    );
    equal(first, "true", "the first pick is not marked");
    await page.click(`[data-currency="${codes[1]}"]`);
    await sleep(350);
    const sheet = await page.evaluate(`
      const el = document.querySelector('[data-exchange-result]');
      return el ? { pair: el.dataset.exchangeResult, text: el.innerText.replace(/\\s+/g, ' ').trim() } : null;
    `);
    assert(sheet, "picking two currencies opened nothing");
    equal(sheet.pair, `${codes[0]}-${codes[1]}`, "the pair the sheet reports");
    assert(new RegExp(`1 ${codes[0]}`).test(sheet.text), `the sheet does not state the rate: ${sheet.text}`);
    return sheet.text.slice(0, 90);
  });

  await check("closing the pair resets the mode, ready for the next one", async () => {
    await page.click('.sheet-footer .btn-primary');
    await sleep(300);
    const after = await page.evaluate(`
      return { sheet: !!document.querySelector('[data-exchange-result]'),
               picked: document.querySelectorAll('.currency-card-selected').length };
    `);
    assert(!after.sheet, "the sheet stayed open");
    equal(after.picked, 0, "a currency is still selected after closing");
    await page.click('[data-action="exchange-mode"]');
    await sleep(250);
    const off = await page.evaluate("document.querySelector('.currency-page')?.dataset.exchangeMode");
    equal(off, "off", "exchange mode did not switch off");
    return "cleared, mode off";
  });

  // ── A real budget, built through the interface ─────────────────────────────
  group("Building a budget");

  /** A named field inside the open editor sheet. */
  const field = (name) => `[data-field="${name}"] input, [data-field="${name}"] select`;

  await check("creates the specification's gym: €20/session, 2 a week, paid every 10", async () => {
    await openTab(page, "activities");
    await page.click('[data-action="add-activity"]');
    await page.waitFor(`!!document.querySelector('${field("name")}')`, { label: "the activity editor" });

    await page.setValue(field("name"), "Gym");
    await page.setValue(field("costModel"), "sessionPack");
    await sleep(200);
    await page.setValue(field("pricePerSession"), "20");
    await page.setValue("[data-field='sessions'] input, [data-field='sessions'] select", "2");
    await page.setValue(field("sessionsPerPayment"), "10");
    await sleep(300);

    // The whole point of the model: one €200 payment, not two a week.
    const preview = await page.evaluate(
      "document.querySelector('.activity-estimate-headline')?.textContent?.trim() ?? ''",
    );
    assert(/200/.test(preview), `the estimate did not mention the €200 payment: ${preview}`);
    assert(/10/.test(preview), `the estimate did not mention the pack of 10: ${preview}`);
    return preview.slice(0, 90);
  });

  await check("saves it, and the card states the payment cycle rather than the sessions", async () => {
    await page.click(".sheet-footer .btn-primary");
    await page.waitFor('!document.querySelector(\'[data-field="name"]\')', { label: "the editor to close" });
    await sleep(500);
    const row = await page.evaluate(`
      const card = Array.from(document.querySelectorAll('.item-row, .activity-row')).find((node) => /Gym/.test(node.textContent));
      return card ? card.textContent.replace(/\\s+/g, ' ').trim() : 'not found';
    `);
    assert(row !== "not found", "the activity did not appear in the list");
    // The card's job is the *cadence* and the accrual — that a €200 charge does
    // not land twice a week. The amount itself belongs on the timeline, where
    // it is a dated payment rather than a monthly figure.
    assert(/10/.test(row), `the card does not state the pack size: ${row}`);
    assert(/177/.test(row), `the card does not state the monthly accrual: ${row}`);
    assert(!/\bavg\.|\/year\b|\/month\b/.test(row), `the card carries an untranslated unit: ${row}`);
    return row.slice(0, 120);
  });

  await check("the activity total reaches the summary", async () => {
    const total = await page.evaluate(
      "document.querySelector('.activity-summary')?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''",
    );
    assert(/\d/.test(total), "the summary shows no figures");
    return total.slice(0, 110);
  });

  await check("records a transaction, and it lands in the period", async () => {
    await openTab(page, "spending");
    await page.click('[data-action="add-spending"]');
    await page.waitFor(`!!document.querySelector('${field("amount")}')`, { label: "the transaction editor" });
    await page.setValue(field("amount"), "40");
    await page.setValue(field("note"), "Two sessions");
    await page.click(".sheet-footer .btn-primary");
    await sleep(700);
    const listed = await page.evaluate(`
      return Array.from(document.querySelectorAll('.item-row')).some((node) => /Two sessions/.test(node.textContent));
    `);
    assert(listed, "the transaction is not in the list");
    return "€40 recorded";
  });

  await check("money somebody else paid is recorded in full and charged to nothing", async () => {
    const before = await page.evaluate(`
      const value = document.querySelector('.funding-split-value');
      return value ? value.textContent.replace(/[^0-9.,]/g, '') : '';
    `);

    await page.click('[data-action="add-spending"]');
    await page.waitFor(`!!document.querySelector('${field("amount")}')`);
    await page.setValue(field("amount"), "200");
    await page.setValue(field("note"), "Dinner a friend paid for");
    await page.setValue(field("funding"), "shared");
    await page.click(".sheet-footer .btn-primary");
    await sleep(800);

    const split = await page.evaluate(`
      return Array.from(document.querySelectorAll('.funding-split-value')).map((n) => n.textContent.trim());
    `);
    assert(split.length >= 3, `the three-way split is not shown: ${split.join(" | ")}`);
    assert(split.some((value) => /200/.test(value)), `the €200 is not reported separately: ${split.join(" | ")}`);
    // The personal figure must not have moved.
    const personal = split[0].replace(/[^0-9]/g, "");
    assert(personal === before.replace(/[^0-9]/g, "") || /40/.test(split[0]),
      `the €200 was charged to the personal budget: ${split[0]}`);
    return split.join(" · ");
  });

  // ── The wallet ────────────────────────────────────────────────────────────
  group("Wallet");

  await check("records a budget allocation", async () => {
    await openTab(page, "wallet");
    await page.click('[data-action="allocate-budget"]');
    await page.waitFor(`!!document.querySelector('${field("allocationAmount")}')`, { label: "the allocation editor" });
    // Pre-filled with the month's planned requirement — the suggestion is a
    // one-press default and is never applied for the user, so it is typed over
    // here to prove the field is genuinely editable.
    await page.setValue(field("allocationAmount"), "600");
    await page.click(".sheet-footer .btn-primary");
    await sleep(900);
    const figures = await page.evaluate(`
      return Array.from(document.querySelectorAll('.wallet-balance-value, .metric-value')).map((n) => n.textContent.trim()).slice(0, 3);
    `);
    /*
     * The treasury arithmetic, end to end. €600 arrives; €40 of personal
     * spending has already been recorded and is charged against it; the €200
     * somebody else paid is charged against nothing. So the wallet holds 560,
     * 560 of it is still budget money, and none of it is personal.
     *
     * The first version of this check asserted "600 appears somewhere", which
     * would have passed on an app that ignored spending entirely.
     */
    // Strip the currency and the grouping, keep the decimal separator: the
    // locale writes "560,00", and dropping every non-digit turns that into
    // 56000.
    const amounts = figures.map((value) =>
      Math.round(Number(value.replace(/[^0-9,.]/g, "").replace(/[.\s](?=\d{3}\b)/g, "").replace(",", "."))),
    );
    equal(amounts[0], 560, `wallet balance (600 allocated − 40 spent): ${figures.join(" | ")}`);
    equal(amounts[1], 560, `budget remaining: ${figures.join(" | ")}`);
    equal(amounts[2], 0, `personal balance: ${figures.join(" | ")}`);
    return figures.join(" · ");
  });

  await check("three balances, not one", async () => {
    const figures = await page.evaluate(`
      return Array.from(document.querySelectorAll('.wallet-balance-value, .metric-value')).map((n) => n.textContent.trim()).slice(0, 3);
    `);
    equal(figures.length, 3, `wallet figures shown: ${figures.join(" | ")}`);
    return figures.join(" · ");
  });

  await check("resetting the wallet zeroes the money and leaves the records", async () => {
    const before = await page.evaluate(
      "return Array.from(document.querySelectorAll('.item-row')).length;",
    );
    await page.click('[data-action="reset-wallet"]');
    await page.waitFor('!!document.querySelector(\'[data-action="confirm-reset-wallet"]\')', {
      label: "the reset confirmation",
    });
    // Behind a confirmation, always: this is the one destructive control on the
    // page, and the check exists to prove it stays behind one.
    await page.click('[data-action="confirm-reset-wallet"]');
    await sleep(900);
    const figures = await page.evaluate(`
      return Array.from(document.querySelectorAll('.wallet-balance-value, .metric-value')).map((n) => n.textContent.replace(/[^0-9]/g, '')).slice(0, 3);
    `);
    assert(figures.every((value) => value === "" || Number(value) === 0), `the wallet is not zero: ${figures.join(" | ")}`);
    const after = await page.evaluate("return Array.from(document.querySelectorAll('.item-row')).length;");
    assert(after >= before, "the reset destroyed ledger rows instead of balancing them");
    return `zeroed, ${after} ledger rows kept`;
  });

  // ── The second currency ────────────────────────────────────────────────────
  group("Second currency");

  /*
   * Two equivalents, two questions.
   *
   * Under a **record** — a transaction in a currency of its own — the useful
   * equivalent is the *display* currency, the one every total on the page is
   * already in. Under an **aggregate**, it is the optional *second* currency,
   * for somebody who earns in one and budgets in another.
   *
   * One function answered both, keyed on the second currency, so a Lebanese
   * taxi in a euro budget printed "≈ $1.47" — a currency nothing beside it was
   * in. The check that used to live here only asserted that the setting
   * stored, which is why the swap survived it.
   */
  await check("records one in a currency that is not the display currency", async () => {
    // 150 000 LBP, the specification's own example, so the two equivalents
    // below have a real record to disagree about. Recorded *here* rather than
    // with the rest of the budget: the wallet's balances are asserted against
    // an exact figure, and one more transaction changes it.
    await openTab(page, "spending");
    await page.click('[data-action="add-spending"]');
    await page.waitFor(`!!document.querySelector('${field("amount")}')`);
    await page.setValue(field("amount"), "150000");
    await page.setValue(field("note"), "Taxi");
    await page.setValue(field("currency"), "LBP");
    await sleep(150);
    await page.click(".sheet-footer .btn-primary");
    await sleep(700);
    const shown = await page.evaluate(`
      const row = [...document.querySelectorAll('.item-row')].find((n) => /Taxi/.test(n.textContent ?? ''));
      return row ? row.querySelector('.money-pair, .item-amount, strong')?.textContent?.trim() ?? row.textContent.trim().slice(0, 60) : null;
    `);
    assert(shown, "the foreign transaction is not in the list");
    return shown.replace(/\s+/g, " ").slice(0, 60);
  });

  await check("a record in another currency is placed in the display currency", async () => {
    await openTab(page, "spending");
    const line = await page.evaluate(`
      const pair = [...document.querySelectorAll('.money-pair')]
        .find((el) => /LBP|L\\.L\\./.test(el.textContent ?? ''));
      if (!pair) return null;
      return {
        primary: pair.firstElementChild?.textContent?.trim() ?? '',
        secondary: pair.querySelector('.money-secondary')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
      };
    `);
    assert(line, "no foreign-currency transaction on screen to place");
    assert(/150/.test(line.primary), `the original is not the primary figure: ${line.primary}`);
    assert(/€|EUR/.test(line.secondary), `the equivalent is not in the display currency: ${line.secondary}`);
    return `${line.primary} ${line.secondary}`;
  });

  await check("the second currency is off until it is chosen", async () => {
    const totals = await page.evaluate(
      "document.querySelectorAll('.funding-split-value .money-secondary').length",
    );
    equal(totals, 0, "aggregate second-currency lines before one is chosen");
    return "no second line on the totals";
  });

  await check("choosing one puts it under the totals, and only the totals", async () => {
    await openTab(page, "settings");
    await page.click('.settings-group:nth-child(2)');
    await sleep(200);
    await page.waitFor("!!document.querySelector('[data-setting=secondaryCurrency]')");
    await page.setValue("[data-setting=secondaryCurrency]", "USD");
    await sleep(400);
    equal(
      await page.evaluate("document.querySelector('[data-setting=secondaryCurrency]').value"),
      "USD",
      "the stored second currency",
    );

    await openTab(page, "spending");
    const state = await page.evaluate(`
      const total = document.querySelector('.funding-split-value .money-secondary')?.textContent ?? '';
      const record = [...document.querySelectorAll('.money-pair')]
        .find((el) => /LBP|L\\.L\\./.test(el.textContent ?? ''))
        ?.querySelector('.money-secondary')?.textContent ?? '';
      return { total: total.replace(/\\s+/g, ' ').trim(), record: record.replace(/\\s+/g, ' ').trim() };
    `);
    assert(/\$|USD/.test(state.total), `the total does not carry the second currency: ${state.total}`);
    // And the record did **not** move to it.
    assert(
      state.record === "" || /€|EUR/.test(state.record),
      `the second currency reached a record: ${state.record}`,
    );
    return `total ${state.total} · record ${state.record}`;
  });



  // ── The report ────────────────────────────────────────────────────────────
  group("Report");

  await check("generates a self-contained report in the interface's language", async () => {
    const html = await page.evaluate(`
      const { buildPeriodReport, reportHtml } = await import('/src/domain/report.ts');
      const { createTranslator, loadDictionary } = await import('/src/domain/i18n.ts');
      const { useBudgetStore } = await import('/src/store/budgetStore.ts');
      await loadDictionary('fr');
      const t = createTranslator('fr');
      const snapshot = useBudgetStore.getState().snapshot;
      const report = buildPeriodReport(snapshot, 'month', new Date(), t);
      // Not truncated: the section headings sit after several kilobytes of
      // inline stylesheet, and a slice that stopped short reported a French
      // report as English.
      return reportHtml(report, (value) => value.toFixed(2), t);
    `);
    assert(html.startsWith("<!doctype html>"), "the report is not a document");
    assert(/<html lang="fr"/.test(html), "the report does not declare the language");
    assert(/Qui a payé/.test(html), "the report is not in French");
    assert(!/<(script|link)\b[^>]*\b(src|href)=/.test(html), "the report loads an external asset");
    return "French, self-contained";
  });


  /** Every tab the sweeps below visit. */
  const TABS = ["dashboard", "activities", "spending", "wishlist", "wallet", "analytics", "settings", "currencies"];

  // ── Responsive and accessible ─────────────────────────────────────────────
  group("Small screens");

  /*
   * The two properties a phone layout has to have, checked on every tab rather
   * than on the one that was being worked on: nothing may overflow sideways,
   * and no target may be smaller than a fingertip. Both were real defects here
   * before they were checks.
   */
  for (const width of [390, 320]) {
    await check(`no horizontal overflow and no target under 24px at ${width}px`, async () => {
      await page.resize(width, 780);
      const problems = [];
      for (const tab of TABS) {
        await page.click(`.mobile-nav-item[data-tab="${tab}"], .nav-item[data-tab="${tab}"]`).catch(async () => {
          // Below 768px the sidebar does not exist and some tabs live behind
          // "More"; drive those through the app's own navigation event.
          await page.evaluate(
            `window.dispatchEvent(new CustomEvent('budget-os:navigate', { detail: ${JSON.stringify(tab)} })); return true;`,
          );
        });
        await sleep(900);
        const found = await page.evaluate(`
          const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
          const small = [];
          for (const control of document.querySelectorAll('button, a[href], input, select, textarea, [role=button]')) {
            const rect = control.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;      // not rendered
            if (getComputedStyle(control).visibility === 'hidden') continue;
            if (rect.height >= 24 && rect.width >= 24) continue;
            /*
             * A small control inside a large label is a large target: the
             * label is the hit area, which is exactly why the checkboxes are
             * 18px inside a 32px row rather than 24px squares that would look
             * wrong beside 13px text.
             */
            const hit = control.closest('label');
            if (hit) {
              const outer = hit.getBoundingClientRect();
              if (outer.height >= 24 && outer.width >= 24) continue;
            }
            small.push((control.getAttribute('aria-label') || control.textContent || control.className).trim().slice(0, 40));
          }
          const unnamed = [];
          for (const control of document.querySelectorAll('button, a[href], [role=button]')) {
            const rect = control.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            const name = (control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent || '').trim();
            if (!name) unnamed.push(control.className.slice(0, 40));
          }
          return { overflow, small, unnamed };
        `);
        if (found.overflow > 1) problems.push(`${tab}: overflows by ${found.overflow}px`);
        if (found.small.length) problems.push(`${tab}: ${found.small.length} target(s) under 24px — ${found.small.slice(0, 3).join(", ")}`);
        if (found.unnamed.length) problems.push(`${tab}: ${found.unnamed.length} control(s) with no accessible name`);
      }
      equal(problems.length, 0, problems.join(" | "));
      return `${TABS.length} tabs clean`;
    });
  }

  await check("back to a desktop width", async () => {
    await page.resize(1440, 900);
    await sleep(500);
    return "1440px";
  });


  // ── Contrast, on the real page ────────────────────────────────────────────
  group("Contrast");

  /*
   * `tests/theme-contrast.test.ts` measures the *tokens*. This measures what is
   * actually on screen, which is not the same question: a caption on a tinted
   * card sits on a colour no token names, and the sweep that read
   * `background-color` alone once reported zero failures while six real ones
   * were visible — because every element on a gradient was scored against the
   * page behind it.
   */
  const contrastSweep = `
    const luminance = (r, g, b) => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const parse = (colour) => {
      const match = String(colour).match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((p) => parseFloat(p));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });
    /** Every gradient stop, so text on a gradient is scored against the gradient. */
    const stopsOf = (image) => {
      const found = [];
      for (const match of String(image).matchAll(/rgba?\\([^)]+\\)/g)) {
        const colour = parse(match[0]);
        if (colour) found.push(colour);
      }
      return found;
    };
    const groundsFor = (element) => {
      let grounds = [{ r: 255, g: 255, b: 255, a: 1 }];
      const chain = [];
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) chain.unshift(node);
      chain.unshift(document.documentElement);
      for (const node of chain) {
        const style = getComputedStyle(node);
        const layer = parse(style.backgroundColor);
        if (layer && layer.a > 0) grounds = grounds.map((g) => over(layer, g));
        const stops = style.backgroundImage === 'none' ? [] : stopsOf(style.backgroundImage);
        if (stops.length) {
          const next = [];
          for (const ground of grounds) for (const stop of stops) next.push(over(stop, ground));
          grounds = next.slice(0, 8);
        }
      }
      return grounds;
    };

    const failures = [];
    for (const element of document.querySelectorAll('body *')) {
      if (element.children.length > 0) continue;                 // leaves carry the text
      const text = (element.textContent || '').trim();
      if (!text) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const colour = parse(style.color);
      if (!colour) continue;
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      // WCAG: large text is 18.66px bold or 24px.
      const minimum = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      let worst = Infinity;
      for (const ground of groundsFor(element)) {
        const front = colour.a < 1 ? over(colour, ground) : colour;
        const a = luminance(front.r, front.g, front.b);
        const b = luminance(ground.r, ground.g, ground.b);
        worst = Math.min(worst, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
      }
      if (worst < minimum) {
        failures.push(text.slice(0, 34) + ' @' + worst.toFixed(2) + ' (needs ' + minimum + ')');
      }
    }
    return failures;
  `;

  for (const [themeIndex, themeName] of [[1, "Air France"], [4, "Deep black"]]) {
    await check(`every text node clears WCAG AA on every tab — ${themeName}`, async () => {
      await openTab(page, "settings");
      await page.click(`.theme-grid .theme-swatch:nth-child(${themeIndex})`);
      await sleep(400);
      const failures = [];
      for (const tab of TABS) {
        await page.click(`.nav-item[data-tab="${tab}"]`);
        await sleep(950);
        const found = await page.evaluate(contrastSweep);
        for (const entry of found) failures.push(`${tab}: ${entry}`);
      }
      equal(failures.length, 0, failures.slice(0, 6).join(" | "));
      return `${TABS.length} tabs, 0 failures`;
    });
  }

  await check("back to the default theme", async () => {
    await openTab(page, "settings");
    await page.click(".theme-grid .theme-swatch:nth-child(1)");
    await sleep(300);
    return "airfrance";
  });

  // ── Console hygiene ────────────────────────────────────────────────────────
  group("Console");

  await check("no uncaught errors anywhere in the run", () => {
    const real = page.pageErrors.filter(
      (error) =>
        // A 401 before sign-in is the application asking who you are.
        !/401/.test(error) && !/Failed to load resource/.test(error),
    );
    equal(real.length, 0, `errors: ${real.slice(0, 3).join(" | ")}`);
    return `${page.consoleMessages.length} console messages, 0 errors`;
  });
} finally {
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n\x1b[1m${results.length - failed.length}/${results.length} checks passed\x1b[0m` +
      (failed.length ? `\n\x1b[31m${failed.map((f) => `  ${f.group} → ${f.name}`).join("\n")}\x1b[0m` : ""),
  );
  await chrome.close();
  process.exit(failed.length ? 1 : 0);
}
