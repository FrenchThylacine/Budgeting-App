/**
 * The activity and spending cards, photographed
 * =============================================
 *
 * §3 of the V5.1 brief asks for a category outline "approximately 2px" and then
 * says, twice, that the final thickness is to be chosen **from the rendered
 * result**. §4 and §5 ask what the card as a whole reads as. None of that is a
 * question a unit test can answer, and this repository has been caught four
 * times by a measurement that was right about a picture that was wrong.
 *
 * So: a real account, real categories with their real colours, one activity and
 * one transaction per funding state, and a photograph of each list — plus the
 * measurements that go with it, taken from the same DOM in the same breath, so
 * "the outline is the category colour" is a number as well as a look.
 *
 *   node scripts/verify-cards.mjs [--url URL] [--out DIR]
 */
import { mkdirSync } from "node:fs";
import { launch } from "./lib/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const BASE = flag("--url", "http://localhost:5173").replace(/\/$/, "");
const OUT = flag("--out", "artefacts/cards");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The three funding states, and a schedule apiece.
 *
 * Deliberately one of each, because §5's question is what happens when the
 * three channels — outline, text colour, schedule icon — land on one card at
 * the same time.
 */
const SPECIMENS = [
  { name: "Physio", category: "Health", funding: "personal", cadence: "monthly" },
  { name: "Team lunch", category: "Food", funding: "other", cadence: "weekly" },
  { name: "Electricity", category: "Utilities", funding: "outside", cadence: "yearly" },
  { name: "Season ticket", category: "Transport", funding: "personal", cadence: "yearly" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = await launch({ headless: true, width: 1280, height: 1000 });
  const page = await chrome.open("about:blank");
  await page.goto(`${BASE}/`);
  await page.waitFor("!document.querySelector('.boot-screen')", { timeoutMs: 25000, label: "the loading screen to leave" });

  // ── A real account ─────────────────────────────────────────────────────────
  const stamp = `${process.pid}${Math.floor(process.uptime() * 1000)}`;
  await page.evaluate(`document.querySelector('[data-auth="signup"]').click(); return true;`);
  await page.waitFor("document.querySelectorAll('input[type=password]').length === 2");
  await page.setValue("input[type=email]", `cards-${stamp}@example.test`);
  await page.evaluate(`
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const field of document.querySelectorAll('input[type=password]')) {
      setter.call(field, 'verify-password-9042');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  `);
  await page.click(".auth-submit");
  await page.waitFor("!!document.querySelector('.app-shell')", { timeoutMs: 25000, label: "the app shell" });
  await page.waitFor("!!window.__budgetStoreInstance && window.__budgetStoreInstance.getState().hydrated", {
    timeoutMs: 20000,
    label: "the store to hydrate",
  });
  // The tour sits over everything; it is not what is being looked at here.
  // Skip the tour through its own control: it is a real piece of state, and
  // writing over the settings underneath it leaves the component mounted.
  await page.evaluate(`
    const skip = [...document.querySelectorAll('button')].find((b) => /passer|skip/i.test(b.textContent || ''));
    if (skip) skip.click();
    return true;
  `);
  await sleep(600);
  await page.evaluate(`
    for (const close of document.querySelectorAll('.tutorial-card button[aria-label], .tour-dismiss')) close.click();
    return true;
  `);
  await sleep(400);

  // ── The specimens, written through the real store ──────────────────────────
  await page.evaluate(`
    const store = window.__budgetStoreInstance.getState();
    const snapshot = store.snapshot;
    const year = snapshot.settings.selectedYear;
    const month = snapshot.settings.selectedMonth;
    const byName = (name) => snapshot.categories.find((c) => c.name.toLowerCase().startsWith(name.toLowerCase()));
    const specimens = ${JSON.stringify(SPECIMENS)};
    for (const [index, spec] of specimens.entries()) {
      const category = byName(spec.category) ?? snapshot.categories[index % snapshot.categories.length];
      store.addActivity({
        name: spec.name,
        categoryId: category.id,
        currency: snapshot.settings.baseCurrency,
        recurrenceType: spec.cadence,
        recurrenceInterval: 1,
        pricePerSession: null,
        pricePerPurchase: null,
        pricePerMonth: 40 + index * 15,
        estimatedCost: null,
        yearlyEstimate: null,
        costModel: 'monthly',
        active: true,
        visible: true,
        seasonalTag: '',
        notes: '',
        fundingSource: spec.funding,
      });
      store.addSpendingEntry({
        year,
        month,
        week: 1,
        date: year + '-' + String(month).padStart(2, '0') + '-1' + index,
        amount: 12 + index * 7,
        currency: snapshot.settings.baseCurrency,
        categoryId: category.id,
        recurrenceType: 'one-time',
        note: spec.name,
        source: spec.funding,
      });
    }
    return true;
  `);
  await sleep(500);

  /** What one list's cards actually are, read off the page. */
  const READ = `
    const rows = [...document.querySelectorAll('.item-row')];
    return rows.map((row) => {
      const style = getComputedStyle(row);
      const accent = style.getPropertyValue('--category-accent').trim();
      const name = row.querySelector('.text-callout')?.textContent?.trim() ?? '';
      // Every icon on the card, by its accessible name, so a funding icon
      // cannot hide behind a schedule one.
      const icons = [...row.querySelectorAll('svg')].map((svg) => ({
        label: svg.getAttribute('aria-label') || svg.parentElement?.getAttribute('aria-label') || '',
        hidden: svg.getAttribute('aria-hidden') === 'true',
        cls: svg.getAttribute('class') || '',
      }));
      return {
        name,
        funding: row.getAttribute('data-funding'),
        accent,
        borderWidth: style.borderTopWidth,
        borderColour: style.borderTopColor,
        nameColour: getComputedStyle(row.querySelector('.text-callout') ?? row).color,
        amountColour: (() => {
          const el = row.querySelector('.row-trailing strong, .activity-amount strong');
          return el ? getComputedStyle(el).color : null;
        })(),
        icons: icons.filter((icon) => icon.label),
        text: row.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160),
      };
    });
  `;

  const openTab = async (tab) => {
    await page.click(`.nav-item[data-tab="${tab}"], .mobile-nav-item[data-tab="${tab}"]`);
    await sleep(820);
  };

  const report = {};
  for (const tab of ["activities", "spending"]) {
    await openTab(tab);
    await sleep(250);
    report[tab] = await page.evaluate(READ);
    await page.screenshot(`${OUT}/${tab}.png`);
  }

  /*
   * And again on a dark ground.
   *
   * Half the rendered results are dark, and an outline chosen against white is
   * a different amount of contrast against near-black — `color-mix` with
   * `transparent` composites over whatever is behind it, so the same rule is a
   * different colour on the two. §3's "choose the thickness from the rendered
   * result" has two rendered results.
   */
  await page.evaluate(`
    window.__budgetStoreInstance.getState().updateSettings({ theme: 'midnight', appearance: 'dark' });
    return true;
  `);
  await sleep(700);
  for (const tab of ["activities", "spending"]) {
    await openTab(tab);
    await sleep(250);
    report[`${tab} (dark)`] = await page.evaluate(READ);
    await page.screenshot(`${OUT}/${tab}-dark.png`);
  }

  for (const [tab, rows] of Object.entries(report)) {
    console.log(`\n\x1b[1m${tab}\x1b[0m — ${rows.length} cards`);
    for (const row of rows) {
      console.log(
        `  ${row.name.padEnd(16)} funding=${String(row.funding).padEnd(8)} border=${row.borderWidth} ${row.borderColour}`,
      );
      console.log(`      accent=${row.accent || "(none)"}  name=${row.nameColour}  amount=${row.amountColour ?? "—"}`);
      console.log(`      labelled icons: ${row.icons.map((i) => i.label).join(" · ") || "(none)"}`);
    }
  }
  console.log(`\nPNGs in ${OUT}/`);
  await chrome.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
