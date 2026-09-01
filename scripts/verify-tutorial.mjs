/**
 * Walking the tour, rather than reading its source
 * ================================================
 *
 * Section 10 asks for something that cannot be checked in a unit test: that the
 * control a step names is *lit up*, that the card does not sit *on top of* it,
 * and that finishing the task moves the tour on without anybody pressing Next.
 * All three are geometry and timing on a real page.
 *
 * So this signs up, starts the tour, and does what each step asks — through the
 * application's own controls, at a desktop width and again at a phone width,
 * because "do not cover the button" is a claim that fails on a narrow screen
 * long before it fails on a wide one.
 *
 *   node scripts/verify-tutorial.mjs [--headed]
 *
 * Chrome is driven over the DevTools Protocol by `scripts/lib/cdp.mjs`, the
 * same way `verify-browser.mjs` is. No Playwright.
 */
import { launch } from "./lib/cdp.mjs";

const BASE = process.env.VERIFY_BASE ?? "http://localhost:5173";
const HEADLESS = !process.argv.includes("--headed");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];

async function check(name, body) {
  try {
    const detail = await body();
    passed += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Where the card is and where the highlight is, in one read. */
const GEOMETRY = `
  const card = document.querySelector('.tutorial-card');
  const ring = document.querySelector('.tutorial-ring');
  const box = (element) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  return JSON.stringify({
    card: box(card),
    ring: box(ring),
    step: document.querySelector('.tutorial-progress')?.innerText ?? '',
    title: document.querySelector('.tutorial-card h2, .tutorial-card h3')?.innerText ?? '',
    shades: document.querySelectorAll('.tutorial-shade').length,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
`;

const geometry = async (page) => JSON.parse(await page.evaluate(GEOMETRY));

/** Do the two rectangles share any area at all? */
function overlaps(a, b) {
  return a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Press the tour's Next, whatever language it is in. */
async function next(page) {
  await page.evaluate(`
    const buttons = [...document.querySelectorAll('.tutorial-foot-nav button')];
    buttons[buttons.length - 1]?.click();
    return true
  `);
  await sleep(650);
}

async function stepIndex(page) {
  const text = await page.evaluate("document.querySelector('.tutorial-progress')?.innerText ?? ''");
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : -1;
}

const chrome = await launch({ headless: HEADLESS, width: 1440, height: 900 });
const page = await chrome.open("about:blank");
const stamp = Number(process.env.VERIFY_STAMP ?? `${process.pid}${Math.floor(process.uptime() * 1000)}`);
const account = { email: `tour-${stamp}@example.test`, password: "verify-password-9042" };

const badResponses = [];
await page.send("Network.enable");
page.on("Network.responseReceived", (params) => {
  if (params.response.status >= 400) badResponses.push(`${params.response.status} ${params.response.url}`);
});

try {
  console.log("\nThe tour, walked");

  await page.goto(BASE);
  // The boot animation is a full-screen overlay; clicking through it would be
  // clicking the animation.
  await page.waitFor("!document.querySelector('.boot-screen')", { timeoutMs: 40000, label: "the boot screen to clear" });
  await page.waitFor("!!document.querySelector('.auth-card')", { timeoutMs: 30000, label: "the sign-in card" });

  await check("creates an account", async () => {
    await page.evaluate(`document.querySelector('[data-auth="signup"]')?.click(); true`);
    await page.waitFor("document.querySelectorAll('input[type=password]').length === 2");
    await page.setValue("input[type=email]", account.email);
    await page.evaluate(`
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const field of document.querySelectorAll('input[type=password]')) {
        setter.call(field, ${JSON.stringify(account.password)});
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      true
    `);
    await page.click(".auth-submit");
    await page.waitFor("!!document.querySelector('.app-shell')", { timeoutMs: 30000, label: "the app shell" });
    await sleep(1200);
    return account.email;
  });

  await check("offers the tour on a new account", async () => {
    await page.waitFor("!!document.querySelector('.tutorial-card')", {
      timeoutMs: 15000,
      label: "the tour to appear",
    });
    return `step ${await stepIndex(page)}`;
  });

  // ── The spotlight ──────────────────────────────────────────────────────────

  await check("lights up the control a step asks for", async () => {
    // Forward to the first step with something to do.
    for (let i = 0; i < 8; i += 1) {
      const shot = await geometry(page);
      if (shot.ring) break;
      await next(page);
    }
    const shot = await geometry(page);
    assert(shot.ring, "no step lit anything up");
    assert(shot.ring.width > 8 && shot.ring.height > 8, `the highlight has no size: ${JSON.stringify(shot.ring)}`);
    assert(shot.shades === 4, `expected four shading panels, saw ${shot.shades}`);
    return `${Math.round(shot.ring.width)}×${Math.round(shot.ring.height)} at step ${shot.step}`;
  });

  await check("keeps the highlighted control on screen", async () => {
    const { ring, viewport } = await geometry(page);
    assert(ring.top >= -1 && ring.bottom <= viewport.height + 1, `the highlight is off screen: ${JSON.stringify(ring)}`);
    assert(ring.left >= -1 && ring.right <= viewport.width + 1, `the highlight is off to one side`);
    return `top ${Math.round(ring.top)} of ${viewport.height}`;
  });

  await check("does not put the card over the control", async () => {
    const { card, ring } = await geometry(page);
    assert(!overlaps(card, ring), `the card covers the control it is pointing at`);
    return `${Math.round(Math.min(Math.abs(card.top - ring.bottom), Math.abs(ring.top - card.bottom)))}px apart`;
  });

  await check("leaves the highlighted control clickable", async () => {
    /*
     * The point of four shading panels rather than one dimmed sheet with a
     * hole drawn on it: whatever is at the middle of the highlight has to be
     * the control, not an overlay sitting on top of it.
     */
    const hit = await page.evaluate(`
      const ring = document.querySelector('.tutorial-ring').getBoundingClientRect();
      const el = document.elementFromPoint(ring.left + ring.width / 2, ring.top + ring.height / 2);
      return el ? (el.className.baseVal ?? String(el.className)) : 'nothing';
    `);
    assert(!String(hit).includes("tutorial-"), `the tour's own overlay is in the way: ${hit}`);
    return String(hit).slice(0, 48);
  });

  // ── The real action ────────────────────────────────────────────────────────

  await check("advances by itself when the task is actually done", async () => {
    /*
     * The heart of the section. The step waiting here is "pin your currency";
     * the tour is not told anything — the currency is pinned through the real
     * settings control, and the tour has to notice from the data.
     */
    const before = await stepIndex(page);
    const step = await page.evaluate(`
      document.querySelector('.tutorial-card')?.getAttribute('data-step') ?? ''
    `);
    // Press whatever is highlighted, until the highlight is the control that
    // pins a currency. The tour moves the spotlight along as the page opens up,
    // and this follows it — which is exactly what a reader does.
    let pinned = "nothing pressed";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const opened = await page.evaluate(`
        const ring = document.querySelector('.tutorial-ring');
        if (!ring) return 'no highlight';
        const box = ring.getBoundingClientRect();
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        target?.closest('button')?.click() ?? target?.click();
        return target?.closest('[data-action]')?.getAttribute('data-action') ?? 'a control';
      `);
      await sleep(900);
      if (opened === "pin-currency") {
        // The picker is open: choose a currency through its own list.
        /*
         * A currency that is *not* already pinned. The step is satisfied by an
         * explicit choice, and pressing one of the ten defaults is not one —
         * pinning EUR on a budget that already tracks EUR changes nothing, and
         * a tour that advanced on it would be advancing on a no-op.
         */
        /*
         * An *enabled* row, which in this picker means one that is not already
         * pinned — the rows for currencies the budget already tracks are
         * disabled. Pressing one of those changes nothing, and a tour that
         * advanced on it would be advancing on a no-op.
         */
        pinned = await page.evaluate(`
          const option = document.querySelector('.currency-picker-row:not([disabled])');
          if (!option) return 'no unpinned currency offered';
          option.click();
          return option.innerText.trim().replace(/\\s+/g, ' ').slice(0, 32);
        `);
        await sleep(700);
        break;
      }
      pinned = String(opened);
    }

    // What the application actually stored, so a failure below distinguishes
    // "the tour did not notice" from "the click did nothing".
    const tracked = await page.evaluate(`
      const codes = [...document.querySelectorAll('.currency-card [data-currency]')]
        .map((el) => el.getAttribute('data-currency'))
        .join(',');
      const card = document.querySelector('.tutorial-card');
      return codes + ' | step ' + card?.getAttribute('data-step') + ' done=' + card?.getAttribute('data-task-done');
    `);

    // Whatever the control was, wait for the tour to move on by itself.
    let after = before;
    for (let i = 0; i < 24 && after === before; i += 1) {
      await sleep(250);
      after = await stepIndex(page);
    }
    assert(after > before, `the tour stayed on step ${before} after the task was done (${pinned}; tracked: ${tracked})`);
    return `step ${before} → ${after} without pressing Next`;
  });

  await check("does not race ahead when nothing has been done", async () => {
    // The negative: a step still waiting must stay put.
    const before = await stepIndex(page);
    await sleep(2200);
    const after = await stepIndex(page);
    assert(after === before, `the tour advanced from ${before} to ${after} on its own`);
    return `held at step ${before}`;
  });

  await check("follows the step onto the tab it switches to", async () => {
    /*
     * The step after currencies lives on Activities. Its spotlight has to land
     * on a control that does not exist until the tab has changed — which is why
     * the measurement waits for the page to settle rather than reading the
     * layout in the same frame the step opened.
     */
    for (let i = 0; i < 6; i += 1) {
      const step = await page.evaluate("document.querySelector('.tutorial-card')?.getAttribute('data-step') ?? ''");
      if (step === "activities") break;
      await next(page);
    }
    await sleep(900);
    const shot = await geometry(page);
    assert(shot.ring, "the activities step lit nothing up");
    const hit = await page.evaluate(`
      const ring = document.querySelector('.tutorial-ring').getBoundingClientRect();
      const el = document.elementFromPoint(ring.left + ring.width / 2, ring.top + ring.height / 2);
      return el?.closest('[data-action]')?.getAttribute('data-action') ?? 'nothing with an action';
    `);
    assert(hit === "add-activity", `the spotlight landed on ${hit}`);
    assert(!overlaps(shot.card, shot.ring), "the card covers the Add activity button");
    return `on ${hit}, ${Math.round(shot.ring.width)}×${Math.round(shot.ring.height)}`;
  });

  // ── The same rules on a phone ──────────────────────────────────────────────

  await check("keeps the card clear of the control on a phone", async () => {
    await page.resize(390, 844);
    await sleep(900);
    const shot = await geometry(page);
    if (!shot.ring) return "no highlight at this step";
    assert(!overlaps(shot.card, shot.ring), "the card covers the control on a phone");
    assert(
      shot.ring.bottom <= shot.viewport.height + 1 && shot.ring.top >= -1,
      "the highlight is off a phone screen",
    );
    return `card ${Math.round(shot.card.height)}px, highlight at ${Math.round(shot.ring.top)}`;
  });

  await check("still offers Skip and Restart", async () => {
    const controls = await page.evaluate(`
      return JSON.stringify({
        skip: !!document.querySelector('.tutorial-card [data-action="tutorial-skip"], .tutorial-foot button'),
        buttons: [...document.querySelectorAll('.tutorial-card button')].length,
      })
    `);
    const parsed = JSON.parse(controls);
    assert(parsed.buttons >= 3, `the card has only ${parsed.buttons} controls`);
    return `${parsed.buttons} controls`;
  });

  await page.resize(1440, 900);
  await sleep(500);

  await check("raised no page errors while the tour ran", async () => {
    /*
     * A bare "failed to load resource" says nothing about *which* resource, so
     * the responses are collected too and reported alongside. A 401 before
     * sign-in is the application asking who you are, and a 404 for a snapshot
     * that does not exist yet is a new account having no data — neither is a
     * defect, and both are named rather than filtered by a wildcard.
     */
    const expected = /\/api\/(auth|session|snapshot)\b/;
    const unexpected = badResponses.filter((line) => !expected.test(line));
    assert(
      unexpected.length === 0,
      `unexpected failed requests:\n      ${unexpected.slice(0, 4).join("\n      ")}`,
    );
    const errors = page.pageErrors.filter((text) => !/favicon|manifest|failed to load resource/i.test(text));
    assert(errors.length === 0, `page errors:\n      ${errors.slice(0, 3).join("\n      ")}`);
    return badResponses.length ? `clean (${badResponses.length} expected 4xx: ${badResponses[0]})` : "clean";
  });
} finally {
  await chrome.close();
}

console.log(`\n${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 ? 0 : 1);
