# Changelog

## Versions

Semantic, and coarse on purpose. A version is a *release* — a set of changes
somebody could describe in one sentence — not a commit, so several sections
below share a number where they shipped together on the same day, and a day
with one small fix gets a patch rather than a new minor.

| Version | What it was |
| --- | --- |
| **5.1.0** | A tour that points at the button, a theme you build that cannot come out unreadable, and English found in the layer no dictionary check looks at |
| **5.0.0** | Ten destinations instead of eleven, a report you can read before you print it, and three bugs that were costing an account its data |
| **4.4.0** | The correction pass: the aeroplane was not where the arithmetic put it, a choreographed routine, and a legend instead of a paragraph |
| **4.3.0** | The audit pass: a rejoin that is a curve, one visual vocabulary, and twenty-three sentences nobody had translated |
| **4.2.0** | The refinement pass: currency semantics, the funding ambiguity, a cadence vocabulary, an aerobatic routine, half the pixels |
| **4.0.0** | The V4 pass: minimalism, the whole aircraft fleet, a real 3D loading sequence, funding correctness |
| **3.2.0** | One identity, five languages, no special categories |
| **3.0.0**–**3.1.0** | The financial model: who paid, real payment cycles, the wallet as a treasury |
| **2.0.0**–**2.1.0** | Accounts, Excel import, dedicated editors, scenarios, swipe, the first identity |
| **1.0.0**–**1.1.0** | The first working budget: activities, spending, wishlist, reports |
| **0.1.0**–**0.2.0** | Before it was an application |

## 5.1.0 — 2026-09-01 — Guards that look where the defects actually are

The whole release is one lesson repeated: *a guard only finds what it looks
at.* Three of this pass's checks were written because the brief named a
quality bar that nothing measured, and all three found something broken the
first time they ran.

### A tour that points at the button

It described the application and left you to find things. Each step now names
its control, lights it up, and waits for you to use it.

- A dimmed backdrop with a real hole in it — four panels rather than one
  shadow, so the control inside stays visible *and clickable*.
- The card beside the highlight, never over it, on whichever side has room,
  with its height measured rather than assumed. A guess is what puts a
  three-paragraph card over a button on a phone.
- The spotlight follows: it scrolls the control into view, re-measures on
  scroll and resize, and moves from "open the editor" to "here is the choice"
  as the page changes.
- Finishing the task advances the step by itself, read from application state.
  A step whose task was already done on arrival keeps its button instead of
  flinging you onward.

Walking the tour in a real browser found two defects: the currencies step
pointed at Settings while the control that pins one lives a group deeper, and
saving your change cancelled the advance timer and parked the tour on a
completed step for ever.

### English in the layer nothing checked

Every translation guard here read the dictionaries. A sentence that never
reaches a dictionary passes all of them, and thirteen were on screen: the
scenario preview's funding change, seven importer warnings and six importer
rejections, the trend chart's "Jan, Feb, Mar" and "W28", History's month
names — and an upcoming list calling `describeSchedule` with **no translator
at all**, printing "Day 15 monthly" on a French screen.

The cause was one shape repeated: an optional translator with an English
sentence beside every key, "for a test or an export". No export called any of
them, and the only code taking the English branch was the test asserting the
English. The translator is required now, so it is a thing that does not
compile rather than a thing to remember.

### Thirteen typefaces

Arial, Verdana, Trebuchet MS, Tahoma, Garamond, Palatino and Courier New join
the six families. Named, because somebody who wants Verdana wants Verdana, and
grouped by kind rather than sorted, because an alphabetical list interleaves
Arial with Courier.

### Ten themes, and one you build

Four more presets, and a custom theme: you choose three colours — the page,
the cards, the accent — and the other eleven tokens are derived by walking
toward the ink until each clears its contrast floor. Your blue stays your
blue; the words on it are legible because they were worked out to be. It
persists, and the printed report takes your accent onto paper while the paper
stays white.

Proved over ten hostile palettes in unit tests, and then through the real
picker in a browser, which found three more defects — the scheme was chosen by
a luminance cut-off while the ink was chosen by measurement, and the two
disagree exactly in the middle of the range.

### Statistics say which currencies the money was in

Every other figure converts, which answers "how much" and not "in what". Two
new blocks keep the recorded amounts — what was spent and what the wallet
holds, currency by currency — with the transaction count beside them, because
one $2,000 flight and forty €12 lunches otherwise make dollars look like the
currency this budget lives in.

### An aeroplane that cannot roll half a wingspan in one frame

Measured per rendered frame, the escorts' wings snapped from 0.450 span to
0.947 in sixteen milliseconds where the routine meets the rejoin. Fixed with a
finite roll rate — the drawn attitude chases the demanded one, carried across
frames and across phases — and a curvature estimated over a baseline long
enough to be smooth. Worst step per frame: 0.497 → 0.047.

### Tests that do not go red at midnight

Thirty-five store tests failed on the first of September with no change to any
of them: their August fixtures had become the past, and the store correctly
refuses to edit a closed month. They pin the clock now — mid-month, because a
machine ahead of UTC reads the 31st at 21:00Z as the first of the next month,
which is how the first attempt at the fix failed the same way.

1010 tests, 65 browser checks, and 12 more that walk the tour itself.

## 5.0.0 — 2026-08-31 — Fewer places, less text, and the data actually saving

### Three bugs that were costing an account its data

Found while checking that "Decide later" survives a reload. It did not, and
neither did anything else: the API was up, and the interface said "Offline —
this device only". It was reachable and refusing.

`wishlist_items.date_added` is NOT NULL and was the one column on its row
passed through raw while every neighbour is coerced. A single item without it —
from an import, an older client, or any path that does not go through
`addWishlistItem` — failed the **whole snapshot write**: every activity, every
transaction, the settings. Then the same shape twice more in `wallet_entries`,
found one failed write at a time: `month`, then `source`. Every NOT NULL column
on that row is coerced now, at both ends, and a database test pushes an
undated item and asserts the budget still saves.

And a hydration race: two loads can be in flight at once, and a *rejected*
earlier attempt could land after a successful later one, leaving the
application running on a default snapshot with the session intact. Settings
read back empty and nothing said why.

### Ten destinations instead of eleven

- **Currencies was never a place to go.** Which currencies to track and what
  the rates are is configuration; it had a permanent seat beside Dashboard and
  Spending. It is a group inside Settings.
- **The financial record was competing with the dashboard.** Closed periods,
  month closes, approvals and the audit trail are a record, and a record is
  something you consult while looking at the numbers. It is a collapsed section
  on Statistics.
- **The report became a tab**, because it was three buttons that each opened a
  finished document in a new window — commit to a window, then find out whether
  the range was the one you meant.

### The report, before it is printed

The preview *is* the report: the same `reportHtml` the print and the download
use, in an iframe. A React re-implementation of the model would be responsive
by construction and would also be two renderers for one document, and they
drift — a preview that lies is worse than none.

So the responsiveness is the report's own. Its stylesheet reflows below 720px,
the type stays readable, the tables scroll inside themselves, and `@media
print` is untouched, so the page that reaches a printer is the A4 one whatever
screen it was previewed on.

### Colour, typeface, and the one component that ignored both

The three funding colours and the typeface are the reader's. A chosen colour is
a **fill**, never text: the text shade is derived by mixing toward the theme's
foreground, so a pale yellow becomes readable pale-yellow text rather than an
invisible label. The application and the printed report take their palette from
one function, because two derivations is how a report prints last month's
colours.

One token carries the typeface — every rule that names a family names
`--font-sans` — except that `button`, `input`, `select` and `textarea` do not
inherit `font-family` at all. The navigation items are buttons, and with a face
chosen they alone stayed in the platform's Arial. Verified by sweeping every
element on all ten tabs.

### Less text, and states you can see

- **The `...` menu opened off-screen.** Measured: (1483, 1386) in a 1440×950
  viewport, on a row two-thirds down the list. `position: fixed` is relative to
  the viewport only while no ancestor has a transform — and rows here have two.
  It is portalled now, and a check compares where it is aimed with where the
  browser puts it.
- **`InfoDot`** carries what used to be printed: the schedule sentence, the
  reason an activity has no payment date, who pays. A fact that answers "why?"
  is not a fact the card shows.
- **Funding is a state, not a label.** A glyph by the name and the colour of
  the figure — which is the number the classification changes the meaning of —
  instead of a pill reading "◆ Paid by other · Dad".
- **The unscheduled banner is gone**, replaced by an amber mark on each
  affected row.
- The **activity figure carries its equivalent** in the display currency.

### Money

- **A scenario's budget is what its activities require**, from
  `personalMonthly`, so an activity somebody else pays for moves it and
  renaming one does not. Typing a figure is an override now, and the only case
  where one is stored.
- **The projection uses the financial model.** Recurring and activity-linked
  charges are events, not rates, so they are no longer extrapolated; and
  personal payments the schedule says fall later this month are added, because
  a charge the application already knows about is not a guess.
- **Rates refresh when the application opens**, not when the provider's clock
  says a new set exists — which left an app opened at 11:00 UTC holding
  yesterday's numbers all morning.
- **"Decide later" is remembered**, against the month it was given for, and the
  offer to move leftover budget is made on the day it is live rather than all
  month.

Verified and *not* changed, because they were already right: the yearly share
excludes paid-by-other (it was the heading that misled, and it is "What you pay
for, by activity" now); the wallet keeps 200 USD as 200 USD across a rate
change; the Dashboard, Wallet and Statistics all read one selector.

**934 tests across 53 files, 60 browser checks.**

## 4.4.0 — 2026-08-30 — The correction pass

### The aeroplane was not where the arithmetic put it

Three passes of "the smoke looks detached from the jets", and the smoke was
never the problem.

The escort artwork is a child of a zero-sized box that was supposed to centre
it. A grid item that overflows a zero-height area is aligned to the **start** of
that area, not its centre — so the image's top-left corner sat on the transform
origin and every Alpha Jet was drawn about forty pixels from the point all the
arithmetic used. And because the parent's `rotate` turns that offset with the
heading, the aeroplane also swung around its own flight path as it manoeuvred,
which is a fair part of why the motion never read as flying.

The CSS carried a comment asserting the opposite, and asserting that adding a
half-size translate would break it. Both halves were wrong; `offsetTop`
measured 0 on the page.

It survived three audits because every check compared numbers the script had
produced against other numbers the script had produced. A harness check now
compares the drawn artwork's centre with the origin the script positions.

### Choreography, not complexity

Four versions of the routine failed before this one, and each was *more*
mathematically elaborate than the last:

- **The six-turn corkscrew is gone.** It looped each jet 124px sideways every
  0.8s, and where a route flew near-vertical the frame it was applied in
  collapsed and the path tied a knot — the jet flew a tight loop and came out
  the way it went in.
- **Eight authored waypoints per jet**, evenly spaced on purpose. The route
  they replaced closed with a 46px leg between two 280px legs, and because the
  path is walked by arc length the aircraft *slowed down* there too, so both
  jets flew a visible curl at the same point on every pass.
- **Centripetal Catmull-Rom**, provably free of the cusps and overshoot that
  uniform parameterisation puts at a tight corner.
- **Walked by arc length at a speed that trades height for airspeed**,
  `v ∝ √(1 + drop/H)`. That is the whole of the momentum: the acceleration is a
  consequence of the path rather than an effect applied to it.
- **The rejoin is a cubic in scene coordinates.** It used to interpolate a
  *projected* position while the smoke draw re-applies perspective, so at
  break-off the ribbon was projected twice — ninety pixels between the aircraft
  and the smoke it had just laid. And a quadratic could hairpin. The second
  control point now sits left of the slot, so the curve arrives on the
  formation heading however it left the routine.
- **One pass is always seen.** The routine was 5.2s long with a 1.5s floor, so
  unless the load was slow nobody ever saw more than its first quarter.

Measured: 69–421px of track variation, 0px from the tailpipe to the smoke, 0px
between the sprite and its origin, the third jet in from −691px over 606px
flown, and a median frame of 8.3ms with nothing over 20ms.

The smoke gained the physics that was asked for: turbulence that *grows* with
age rather than being present at the nozzle, a per-puff bulk so the plume is
lumpy rather than a ribbon, and a gradient along each run so it fades as it
dissipates instead of being as solid where it is dying as where it is hot.

### A legend instead of a paragraph

`MarkLegend` lists only the symbols actually present in the data below it — a
month with no shared costs shows no funding glyph, a list of one-off purchases
shows no calendar — and renders nothing at all when everything on screen is
ordinary. `personal` is never listed: a key entry for "this is normal" is the
kind of completeness that makes a legend worth skipping.

Two contextual controls went with it. The transaction editor showed the funding
hint under every option including the default one, and rendered a *disabled*
activity selector with a sentence explaining why it was disabled — on every
transaction a new account records.

### Thirty-two sentences in English, and the sweep that should have come first

V4.3 added four rules to the hardcoded-English scanner and reported the
interface fully translated. This pass found three more blind spots, one screen
at a time, before doing the thing that should have been done first: a single
broad sweep for anything in a `.tsx` file that reads as an English sentence,
outside comments, keys, class lists, styles and paths.

The three shapes, each with live strings in it:

- **Prose following a JSX expression.** The multi-line rule required the
  previous line to end with an opening *tag*, so a sentence after a `{" "}` was
  invisible. Four strings, every one forming its plural by hand in English —
  `categor{y is / ies are}`, `{count} change{s}` — which is broken in the four
  other languages whatever the count.
- **A label after a self-closing tag**: `<Archive size={14} /> Archive`. An
  icon and a word is the commonest shape a button takes here, and the `>text<`
  rule cannot see it. Eleven of them: Cancel, Restore, Archive, Apply, Edit,
  Duplicate, Delete, Current, Buy — every one with a translated key already in
  the dictionary, unused.
- **Everything the sweep found that the rules still missed**: six hints in the
  activity editor's renewal-date field, two chart empty-state defaults, the
  category manager's submit labels, the scenario diff's "not set / enabled /
  disabled", the statistics' "previous period has no records", the transaction
  editor's subtitle, the sidebar's date-range note, two icon-field hints, and
  "OVER CAP" on the analytics bars — which had its own translated key sitting
  unused three lines above it.

Verified by driving all eleven tabs in French and walking the DOM for English:
none left.

### Two screens that explained themselves twice

The Categories tab carried "the **monthly cap** are read live … so changing
**them**" — a singular noun with a plural verb and pronoun, which is what
happens when one sentence is assembled from three dictionary fragments
concatenated around a bolded noun. One key and one sentence now, half the
length, with the archiving half moved onto the Archive button where somebody
about to archive something will meet it.

The Wishlist carried a card of three facts, two of which the filter chips six
inches above already printed: "Active items: 0" under a chip reading "Active
(0)". The total is the only thing there the chips cannot show, so it is the
only thing left — and it is a line rather than a card.

### Four exports nothing was reading

A dead-export sweep across every project in the repository, which matters
because the first version of it looked only at `src/` and confidently proposed
deleting a constant the server imports. `NanPolicy`, a union with one member
annotating nothing; `expiryFromNow` and `MINUTE_MS`; and `NeonSql`, which was
exported and never applied — and when it was finally applied to the one
function it was written for, the build rejected every call site, because the
callers pass `SqlDriver`. `query` is typed with the real contract now instead
of `any`.

**59 browser checks, 900 tests across 49 files, 82 of them against PostgreSQL.**

## 4.3.0 — 2026-08-30 — The audit pass

### A rejoin is a curve, not a chord

The routine reads as a manoeuvre, so the join had to stop reading as a state
change. Three faults, all from the same habit — interpolating a *position* and
leaving the aeroplane pointing wherever it already was.

The two escorts crossed to their slots in a straight line. They now fly a
quadratic curve whose control point sits ahead of them along the heading they
were released on, so they carry on out of the turn and bend onto the formation.
Heading comes from the curve's tangent and bank from its rate of turn, as the
routes already did; the last quarter levels the wings, so arriving in the slot
is the end of a turn rather than a jump to zero degrees on the next frame.

The third jet used to slide in from a point 210px left of its slot, at a fixed
attitude, and only started smoking once it was nearly there — an object
appearing beside the formation, not an aircraft joining it. It now enters from
900px out, off the frame, on its own curve, banked, nose on the path, trailing
smoke the whole way. Measured on the page: in from −883px, 806px flown.

And the smoke's head was being laid down correctly and then erased. Measured at
the backing store, the newest puff came out at an alpha of 53 out of 255, which
the canvas blur wiped against a dark sky — so the ribbon looked detached from
an aircraft it was one pixel behind. The core pass is denser and reaches
further back in age, the blur is two pixels rather than three, and the head now
measures 243. White is laid down thinner than blue and red: at equal alpha it
read as a searchlight beside two plumes of smoke.

### One vocabulary, one component

`FundingMark` is `CadenceMark`'s counterpart — one component for the three
funding kinds, in three variants. It replaces three hand-written copies of the
same three glyphs: the badge in the transaction list, the same badge in the
activity list, and the dashboard's chip, each spelling out the glyph, the
`data-funding` attribute and the tooltip key itself. A test now asserts there
is exactly one rendering of each mark.

### Twenty-three sentences nobody had translated

The scanner that reported the interface fully translated had five blind spots,
and there was live English in every one of them:

- a string given to an **object property** — `detail: "of monthly budget"` —
  which is the shape every `StatRow`, `Figure` and chart is configured with;
- **JSX text with a value in the middle of it**, on one line: `Last {count}
  {mode}s`, which formed its plural by gluing an "s" onto the raw enum, so
  every language read "Last 8 months";
- a **template literal opening with its interpolation**, so the capitalised
  word the rule looked for had nothing to be found in: `${amount} by others`,
  `vs ${period}`;
- a sentence starting with a **two-letter word**: "On this pace you end with
  ${amount} left." had been on the dashboard through two translation audits
  because "On" is a capital and *one* lowercase letter;
- a sentence handed **straight to a function**: `setNotice("That wishlist item
  no longer exists.")`, and two on the account screen telling somebody who has
  just changed their password about it in a language they may not read.

Twenty-nine keys in five languages. The five rules now run over the whole tree
and come back empty.

### Less on the screen

- **Two empty states that were whole cards.** "vs July 2026 / No data / Nothing
  recorded before this" was a card whose entire content was the absence of a
  comparison. "Last 8 months" was a caption under a sparkline that needs two
  points to be a line. Neither is rendered now. The dashboard is 156px shorter
  on a first month.
- **The same sentence twice.** The health card and the forecast chart both
  stated the projected end of the period. The chart's copy is gone — it was the
  untranslated one.
- **The period selector is gone from the three tabs the period does not
  govern.** A category is a category in August and in December; so is a
  currency; so is the dark-mode switch.
- **The Scenario Lab taught itself twice** on the one screen a new reader
  actually meets. The paragraph now appears only where the empty state is not.

### The harness reported success on a run that died

Everything ran inside a `try` whose only companion was a `finally`, so when a
single un-doubled backslash threw inside an evaluated block the run unwound
past every remaining check and printed "0/0 checks passed" with an exit code of
zero. It now catches, says so, and refuses to exit 0 on a run that stopped
early. The join check also no longer samples at a flat 40ms, which occasionally
caught two points and failed a correct animation.

**58 browser checks, 818 unit tests, 82 against PostgreSQL.**

## 4.2.0 — 2026-08-30 — The refinement pass

### The two "≈" lines answered each other's question

Under a **record**, the useful equivalent is the *display* currency — the one
every total on the page is already in. Under an **aggregate**, it is the
optional *second* currency, for somebody who earns in one and budgets in
another.

One function did both, keyed on the second currency. So a 150 000 LBP taxi in a
euro budget printed **"≈ $1.47"**: a currency the reader never asked about for
that figure, and one that nothing beside it was in. They are two functions now,
with two names, and the components that use them are called `Money` and `Total`.

The check that used to guard this asserted only that the *setting stored* —
which is exactly how the swap survived it. The new one asserts the negative:
choosing a second currency must not move a record onto it.

### The statistic was right and the page still read wrong

"Share of the yearly total" already listed only the activities you pay for,
against the total you pay. But the funding split beside it ended every column
with "· 43.0% of the total" — and on a column headed PAID BY OTHER, that reads
exactly like the statistic that must exclude it. **Two statistics, one word,
two different wholes.**

The three percentages became one measured bar with a glyph in each segment, and
the two wholes are named once each: "of all activity cost, whoever pays" and
"of what you pay for". Fixing the arithmetic would have changed nothing,
because the arithmetic was not what was wrong.

### A vocabulary for how often, instead of six ways of saying it

Six phrasings of "every month", all of them words — and on every recurring
transaction row, the stored enum value itself, capitalised by a CSS rule.

Seven cadences are named once now, each with a shape, a tone from a three-hue
palette and a word. The families carry most of the meaning: something on a
calendar the application knows, something counted by how often you turn up, or
something that happened once. The silhouettes differ rather than the details,
because at fourteen pixels two calendars are one calendar.

An activity row was three stacked lines under its name. It is one, and about a
third shorter.

### The escorts fly a routine

One circle at a constant rate reads as machinery however three-dimensional it
is. Three incommensurate harmonics ride on the ring — the plane rolls, the
track climbs, the radius breathes — at periods of 1, 1/1.7 and 1/2.3 of a
circuit, with the two jets phased apart so they weave rather than mirror.

And the smoke comes out of the back of the aeroplane. The emitter had no
heading at all through the roll-out, so for the whole of the join it left from
a point beside the aircraft. Measured off the sprite's own transform against
the nearest pixel of its own colour: **0px**. It still *looked* detached where
it was not — three pixels wide under a three-pixel blur — so the newest
quarter-second is drawn denser. The departure now grows out of the hold rather
than switching on.

### Less on screen at once

- **The statistics page was 5,103 pixels**; it opens at 1,794. Five of its
  seven sections are one press from open, and the heading *is* the control,
  because a chevron beside it is a target for a mouse and not for a thumb.
- **The dashboard: 1,865 → 1,332.** Its trend chart is now absent rather than
  an empty card, when there are fewer than two months to trend.
- **The activity editor: twenty-one fields in view to eight.** It showed five
  price fields at once, of which exactly one is ever read — four empty boxes
  beside the one that matters is not a form, it is a quiz. The price shown is
  the one the cost model reads; colour and icon moved behind a disclosure.
- Every wallet ledger row read "Train tickets · Train tickets".

### Found on the way

- **"Spending through 2,026"** — every numeric placeholder went through
  `Intl.NumberFormat`. A placeholder named `year` is a label now.
- **A 17px Retry** in the offline banner: the one control somebody reaches for
  when their work is not saving.
- **Four phone widths nobody had checked** — 360, 375, 412, 430. A layout that
  survives the ends can break in the middle.
- Nineteen more untranslated strings, and the **unused-key test** the plan has
  claimed since the translation pass, which found eight orphans immediately.

## 4.0.0 — 2026-08-30 — Less of everything, and a fleet

### "Share of the yearly total" counted money you do not pay

An activity somebody else funds took a percentage of a total it contributes
nothing to. A €600 gym alongside a €1,200 subscription a parent pays looked
like a third of the year instead of all of it.

The list and the denominator now move together: the chart shows the activities
**you** pay for, against **your** yearly total, with a chip saying how many
were left out and the funding split below answering the other question. Fixed
in `activityBudgetSummary`, so the report and the statistics page inherit it
rather than each hiding it separately. Six regression tests, where there had
been none.

### The transition flies the whole sheet

The supplied Flightradar24 icon sheet was used to trace three silhouettes from
the three hand-drawn aircraft. That is not what it is: it is two dozen aircraft,
and `scripts/extract-craft.mjs` now cuts every one of them out — flood-fill the
paper *and its drop shadows* from the border, label what survives, regroup the
components into icons by the layout's own geometry (which is what makes the
sleigh one icon and two neighbouring airliners two), drop the four that are not
aircraft, rotate each nose-right and fit it to one box.

Twenty-two white silhouettes, chosen in Settings, Concorde by default. The
loading screen keeps its own three drawings and its own preference: they answer
different questions, and one setting would either shrink the transition back to
three shapes or offer the loading screen nineteen aircraft it cannot draw.

### The escorts fly a real orbit, and leave real smoke

The Alpha Jets went round a flat ellipse in the screen plane — two stickers on
a turntable. The circle is now in a plane tilted 56° out of the screen, and
every depth cue comes off the same z: perspective from `D / (D − z)`, occlusion
from its sign, and a little aerial perspective on the far half of the turn. They
pass above the lead, under it, in front of its nose and away behind its tail.

The smoke was a CSS gradient bar pinned to the tail: straight, rigid, pointing
wherever the aeroplane pointed. Now each jet emits a particle a frame at its
tailpipe and the particle belongs to the air — it drifts back at the airspeed,
spreads on a square root, wanders on two slow frequencies and fades. Every
property that was asked for falls out of that one decision instead of being
animated separately: the ribbon follows the flight path because it *is* the
flight path, it billows because each puff ages, it lags on the roll-out because
a puff laid down 300ms ago is where the aircraft was 300ms ago — and three jets
holding station in still air leave three straight bands, blue, white and red.

It is drawn on two canvases, one behind the lead aircraft and one in front, so
a ribbon laid down behind it stays behind it while the jet that drew it comes
round the front. Median frame 8.3ms.

### A hundred and forty-three sentences that were never translated

The previous release reported the application translated. It was not. A hundred
and six user-facing strings were written in English directly in the JSX: every
swipe-action label, the whole sign-in screen, chart tooltips, editor titles,
empty states, "Delta unavailable", and the word "immutable" on a history row.

They survived because nothing looked for them — every check ran against the
*dictionaries*, and a sentence that never reaches a dictionary passes all of
them. There is now a test that reads the components instead, with an allowlist
of three: the product's name, one last-resort chart label, and a theme id in a
comment.

Then it learned two more shapes and found thirty-seven more. A sentence alone
between an opening and a closing tag over three lines — the password hint, the
suggested-budget caption, "Nothing is dated in the next 14 days", the import
dialog's own title. And a **template literal**, which is none of the shapes the
earlier rules look for: every chart's "Budget €1,400" reference line, the
wishlist's three view tabs, "Buy {item}", "Edit {name}" on four kinds of row.

The sign-in screen was showing the API's own English sentences verbatim, and
the session-expired banner was printing a raw `@auth.sessionExpired` — the
store writes a key rather than a sentence so the message can be said in
whatever language is chosen when it is *read*, and the card rendered it
unresolved. The API answers with a stable code; the client says it.

Each of the three shapes the guard knows about now has its own test, with a
case that must match and a case that must not, because a heuristic's real
failure mode is quietly matching nothing.

An English interface also headed a card **"VS JUILLET 2026"**: `periodComparison`
built its label without a locale, so `Intl` used the browser's.

### Less of everything

- **Every figure read "€ EUR 1,400"** — a symbol and its own ISO code, on a
  screen that states the display currency once at the top and never changes it.
  The default is the symbol now. "Both" stays for a budget whose two currencies
  share a symbol.
- **Six buttons per activity row became one and a menu.** Six activities meant
  thirty-six controls on screen for actions taken monthly at most. Editing
  stayed; reordering, duplicating, deactivating and deleting are one press away
  in an overflow menu — the correct distance for something used occasionally,
  and much better than the wrong distance for nothing at all.
- **Nine permanent controls at the foot of the navigation became two closed
  groups** — including a red **Reset all data** that was one press from every
  page in the application.
- **"· active" left every row that is not deactivated**, and "· normal" left
  every row whose season is the default: a column of the same word, on every
  line, saying nothing about any of them.
- **Four chart subtitles that described the chart above them** are gone, along
  with two section summaries and a heading that appeared twice twelve pixels
  apart.
- **The two sentences explaining money somebody else paid** became two chips.

### One vocabulary for who paid

The three funding states now have named tokens and one identity used everywhere:
the accent for money out of this budget, **blue** for somebody else's — it was
teal, which reads as turquoise and says nothing — and amber for money kept
outside it. Each carries a glyph and a word as well as a colour, so the states
survive greyscale and colour blindness, and the report's three inks are
separated by *lightness* as well as hue, which is now measured by a test: two
blues of the same weight are one grey on a laser printer.

### The report reads like a dashboard

A tinted hero band with the budget drawn as a **length** rather than as a
subtraction; a coloured tab on every section heading to scan by; the trend
chart hidden when there are fewer than two months to trend (it used to draw one
bar and eleven question marks); and the detail grid cut from thirteen cards to
nine by removing the three that repeated the funding table two sections above.

### And

- **About**, in Settings: what this is, which build, who it was built with.
- **Coherent versions.** The changelog had twenty date-headed sections and no
  version numbers; it now has both, and `package.json` says 4.0.0.
- Exchange rates refresh once when the application opens (3.2.0, below): the
  fetch existed, was tested, and had no caller anywhere in `src/`.

## 3.2.0 — 2026-08-29 — One identity, five languages, and no special categories

### The application speaks the reader's language, everywhere

The interface was translated. The *application* was not.

A French user got a French navigation bar, a French activity editor — and an English report, English audit history, English sync messages, English chart titles, an English period heading directly above a French date range, and "August 2026" above "1 août 2026 – 31 août 2026". The architecture had been right since the translation layer was built; what was missing was coverage, and coverage is not something you can be *nearly* finished with. Somebody reads the page.

So: **1,054 keys, five languages, and a test that fails the build if any of them is short one.** Every language marked *translated* in the language list now genuinely is, and `tests/i18n.test.ts` asserts both directions — every key the source asks for exists, and every translated language covers the whole English key set. The reports are translated too, including their month names, their number formats and their `<html lang>`.

Three classes of string needed more than a dictionary lookup.

**Sentences built by concatenation.** `${money(price)}/session × ${count} sessions` cannot be translated into a language that orders those pieces differently. Every one of them is now a key with named values, which is why the activity preview, the schedule summary and the payment cycle all got rewritten rather than merely wrapped.

**Strings written into the database.** The audit trail stored "Added activity Padel". The wallet ledger stored "Budget for August 2026". Those rows outlive the session that wrote them, so the English was in PostgreSQL rather than on the screen — and writing the *current* language instead would give a budget a history in three languages, one per session. `src/domain/storedText.ts` is the answer: the store writes `@audit.activityAdded|name=Padel`, the interface resolves it at render time in the language being read *now*, and anything the user typed is passed through untouched because it never begins with `@`. Rows written before this keep their English sentence; rewriting saved records to change their wording would destroy history to fix a display.

The same defect had a second form. `AuditLog.historicalPeriod` stored `periodLabel(settings)` — a display string — so a record written in a French session read "juillet 2026" for ever, in every language. It stores `month:2026-07` now.

**Words in leaf modules.** `financialHealth` returned `grade: "Excellent"`, which was both a word shown to the user and the key a colour was looked up by — so translating it would have broken the colour. It returns `"excellent"` now, and the word comes from the dictionary.

### No category is special

At the owner's direction: *"Do not create special logic for piloting. Piloting is simply another activity which can be paid by me, someone else or outside the budget."*

`piloting` was a `BudgetCategory.bucket` value with powers no other category had. It had its own budget total; a setting decided whether that total joined the budget; its spending was subtracted from the denominator of every category share and given a `null` share of its own; the monthly plan excluded its activities; scenarios carried a boolean about it; and the spending editor kept an `isPiloting` flag in step with the category. All of that assumed a budget with a Piloting category in it, and asked one hard-coded question that the funding classification already answers for **every** activity.

It is all gone. Every category takes a share of the same total — which is why the shares no longer need a footnote explaining why they do not add up to 100. The stored fields stay declared and deprecated so records in the wild round-trip; nothing reads them.

The `bucket` field itself is no longer asked for. It was a required four-way choice on every category whose only behaviour was the one just deleted, which left a question nobody could answer without reading the source.

### A new identity, and three aircraft

The owner supplied a Budget OS badge — a Concorde over a euro sign, under a tricolour — and three aircraft illustrations. The badge arrived as a JPEG with its transparency already flattened onto a checkerboard, and the aircraft on a watercolour sky, so neither could be keyed out by colour: the badge's own outlines use the same near-black the checkerboard does, and the Concorde is as white as the brightest part of the sky. `scripts/lib/cutout.mjs` flood-fills inward from the border with a *predicate* rather than a seed colour, keeps only the largest connected shape for the aircraft — the A350 arrived with a speck below its tail that padded the finished asset by 40% of its height — and feathers the alpha so a JPEG's edge ramp dissolves instead of fringing.

Each aircraft is turned nose-right, because every animation in this application travels left to right and building that constant into the artwork keeps it out of the CSS. Two derivatives ship: the full-colour illustration for the loading sequence, and a flat white silhouette — taken from the artwork's own outline, not redrawn — for the tab transition.

**The loading screen is a formation.** The chosen aircraft holds the centre while two Alpha Jets orbit it, one trailing blue smoke and one red. When the data arrives they roll out of the turn and form up behind it, a third joins trailing white, the three ribbons settle into a tricolour, and the formation accelerates away to the right — taking the loading screen with it and uncovering the application.

It is the one animation here driven by `requestAnimationFrame`, for a reason worth stating: the escorts have to leave the orbit *from wherever they happen to be* the instant the data is ready. A CSS animation cannot be interrupted and continued from its current value — swapping to a second animation snaps the element to that animation's first frame, which is a visible jump on the one screen every user is guaranteed to look at. Either the transition waits for the orbit to come round, doing nothing while the data sits ready, or the position is a number the component owns.

The old A350 fin identity and the drawn airliner are deleted rather than left beside the new ones.

### Six themes, measured rather than eyeballed

Air France, Concorde, Paper, Deep black, Alpine and Plum, each with a light and a dark variant, plus a Light / Dark / **System** appearance that follows the operating system live.

The themes are **data**, not stylesheets — which is the whole point. `tests/theme-contrast.test.ts` walks every preset in both appearances and measures every text colour against every surface the application puts it on. A theme that drops below WCAG AA fails the build rather than being noticed six months later on a laptop in daylight. The same test asserts that the default preset and the stylesheet — which carries it so the app paints before any script runs — have not drifted apart.

### A tour that asks rather than tells

Six of the thirteen cards now wait for the reader to actually do the thing: pin a currency, add an activity, record a transaction, mark something as paid by somebody else, allocate a month's budget, save a scenario. The tick is read from the real snapshot, never from a flag the tour sets for itself.

**"Skip this step" sits beside every locked Next.** A tour that traps somebody is worse than one that teaches nothing, and a reader who does not want a scenario should not have to invent one to reach the end.

**"Decide later" is a third answer.** Skip is "no" and ends the offer; this is "not now" — the tour does not reopen by itself, and a single dismissible reminder appears instead, resumable at the step it was left on. Reopening the tour every time somebody says "not now" is exactly the behaviour the option exists to prevent.

### Rates that arrive on their own

Live exchange rates were fetched by exactly one thing: the *Update now* button in the Currencies tab. `fetchExchangeRates` was written, unit-tested and called from nowhere else, so a new account converted nothing until somebody went looking for that button.

They now refresh when the application opens — once per session, and only when the day's rates are actually due, because a fresh cache answers without touching the network. Nothing is stored unless something changed: an identical rate set written again is a revision bump and a sync to every other device, to record that nothing happened.

A refresh that fails is recorded rather than disguised. The attempt and its reason are stamped; the *updated* timestamp is not moved. The pair sheet then says the rates are stale, or that the last attempt failed, instead of presenting last week's numbers with today's confidence.

The defect underneath this one was invisible to the unit tests and obvious in a browser: under StrictMode the effect mounts, tears down and mounts again on the same fiber, so the once-per-session guard was already set when the second run arrived — and the first run's cleanup had cancelled the only fetch that was ever made.

### A second currency, honestly

An amount recorded in another currency can now show its equivalent underneath. The original stays the primary figure: a transaction of 150 000 LBP *is* a transaction of 150 000 LBP, and showing €1.35 in its place replaces what happened with an interpretation of it that changes every time the rate moves.

The line is absent whenever it would be a guess — no second currency configured, the amount already in it, or **no rate connecting the pair**. `rateToBase` falls back to 1:1 so the interface keeps rendering; printing that fallback under a real transaction would state "≈ €150,000" as calmly as it states a real rate.

### The report, rebuilt

Bright, sans-serif and scannable: a headline row of the four figures the report exists to give, the funding split as one proportional bar, then each section as a compact table. It used to be set in a serif and read as a broadsheet — dignified, and slow to scan — and its notes were four paragraphs explaining, at the foot of the page, facts the tables had already stated three times. Those facts now sit beside the numbers they qualify.

Black and white is still a tested property, not an intention. Every segment of the split bar keeps its border when a printer drops the fill and carries its own glyph and share *inside* it; the funding kinds keep ● ◆ ▲ and their written labels; "over cap" is a word in a box; the emphasised card is distinguished by border weight.

### Settings, in five groups rather than one column of eleven

Finding "dark mode" meant scrolling past the monthly budget, and finding the monthly budget meant scrolling past a seventy-six-entry language list. The groups are chosen by what the user is trying to do, and each fits on a screen.

The header lost five of its eight lines for the same reason: the period selector sits directly beneath it and states the mode, the period, the range, today's date and the way back to the present, so the header was repeating all of it. What is left is what only it can say.

### A browser harness, without Playwright

Every interesting defect this project has found was found in a browser, and every one of them passed its unit tests first. Those checks had always been driven by hand, which meant they ran when somebody remembered — and a stale Chrome process once blocked a whole session's verification.

`scripts/lib/cdp.mjs` is about two hundred lines: Node 22 ships a WebSocket client and Chrome ships a protocol, so a browser-automation dependency would be a hundred megabytes and a supply chain for `Runtime.evaluate` and `Page.captureScreenshot`. `scripts/verify-browser.mjs` drives it through the loading sequence, every theme, the aircraft, the transition's direction, the period selector's layering, building the specification's own gym, the funding split, the wallet and its reset, and the report — on a fresh account each run.

It found four defects on its first pass, all of which had passed the unit suite: `/month avg.` and `/year` hardcoded on the activity card, the loose English word "per" wedged between two controls where no translation could move it, "August 2026" above "1 août 2026", and "Mois En Cours" — three CSS rules applying `text-transform: capitalize` to text that used to be an interpolated lower-case English word.

### Removed

`budget-refactor-prompt/` (a snapshot of a version of the app from three refactors ago, kept as a prompt for another tool), `work/` (one-off import diagnostics and a Playwright script superseded by the harness above), `new_chat.md`, a Windows `.lnk` shortcut with an absolute path in it, the A350 identity assets, `FinMark`/`AircraftMark`, thirty dead translation keys, and the Tailwind classes on the error screen — which this project has never had Tailwind to resolve, so the one screen shown when something has already gone wrong was unstyled black text on white.

## 3.1.0 — 2026-08-22 — Two sessions a week is not two payments a week

### The gym problem

You go to the gym twice a week. It costs €20 a session. You pay for ten sessions at a time.

The application could describe the first two facts and had no way to express the third, so it did what software does when a field is missing: it assumed. Twice a week at €20 became €40 a week leaving your account, which is not what happens. What happens is €200, once, about every five weeks.

There are two different questions here and the app had been answering one of them twice. *What does this cost per month?* is an accrual — the figure you compare commitments with. *When does money actually leave?* is a dated series — the figure your bank statement shows. For a monthly subscription they coincide, which is why nothing noticed; for anything else they do not.

So there is a new cost model, **Per session, paid in blocks**, and a new leaf module — `src/domain/payments.ts` — that answers only the second question. The editor asks for the three facts separately: price per session, sessions per week or month, and how many sessions one payment covers. It shows you the result before you save:

> **€200,00 every 10 sessions ≈ €177,14/month avg., €2 086/year**
> About 8.86 sessions in August. That is one payment about every 5 weeks. The monthly figure spreads the pack across the month; the payment lands in one go.

The monthly figure is an accrual and is labelled `avg.` so it cannot be mistaken for a charge. The timeline shows the payment: one entry, €200, "2 / week · pay every 10 sessions (≈ every 5 weeks)". Not eight sessions at €20.

The payment amount is derived rather than stored. Ten sessions at €20 is €200 by arithmetic; a stored copy is a second answer that can drift from the first, and money that disagrees with itself is the worst thing this codebase can carry.

### A year is not twelve months

The same confusion, in its more common form. Nebula costs €60 a year. Navigraph costs €140 a year. Neither is a monthly subscription, and neither should ever produce a monthly charge.

**Fixed yearly** is now its own cost model. €60/year shows €60/year. It also shows "≈ €5,00/month avg.", because that is genuinely useful for comparing commitments — but the field is labelled *Monthly equivalent* and says, in the editor, "shown for comparison only. You are billed once a year — the app never creates a monthly charge for this."

The renewal date is the schedule, not a hint. Give it 14 September 2026 and the editor answers with the next three charges: **14 septembre 2026 · 14 septembre 2027 · 14 septembre 2028**. Change the date and every future charge follows it. Not 1 January. Not today plus 365 days.

Two details that took thought. A renewal date already in the past is rolled forward whole years rather than ignored — an annual charge that happened last year still happens this year, on the same date. And 29 February clamps to the 28th in a common year rather than rolling into March, which is what every subscription service does with it.

Where there is no date at all, the app says so instead of inventing one. An annual charge with no renewal date is listed as undated with its monthly average, and the editor explains that without a date the charge cannot be placed on a calendar. That has been this project's rule since the timeline was built and it still holds: **a date nobody entered is not a date.**

### The period selector, third time

It began as a permanent strip across the top of every page — a mode toggle, two dropdowns and two arrows, a third of the first viewport on a phone, for an action most sessions perform once. Then it became a collapsed widget in the header, which fixed the space and quietly cost the two things people need continuously: seeing which period you are on, and stepping through periods without opening anything.

It is now a bar under the header. Week / Month / Year as segments, an arrow either side, the period and its date range in the middle, today's date and one button back to the current period. Every frequent action is one press. The only thing behind a disclosure is jumping to an arbitrary period, and that disclosure is a month grid with a year stepper — a dropdown cannot show you where you are in a year at a glance.

On a phone it stacks, with the arrows at the outer edges where a thumb reaches them and the label between them on its own ground. Below 380px the date disappears: it is reference, and the button back to it is the action.

### Why the historical banner was eating clicks

Reported symptom: in historical mode, clicking near the period selector sometimes hit the banner instead.

The instinct is to raise a z-index. That would have worked, in the sense that the symptom would have stopped, and it would have left the real fault in place.

`.historical-period > *` gave **every** child of the main area `z-index: 1`. Each of them therefore became a stacking context — and the selector's popover, carefully set to `z-index: 40`, was sealed inside the header's layer where 40 means nothing relative to the header's siblings. The banner is a later sibling at the same z-index, so it painted over the entire header and took the presses.

The blanket `z-index` is gone. The children stay positioned, so they still clear the dashed contour, but a positioned element with `z-index: auto` paints in tree order in the same layer — which puts them above the contour and leaves the selector free to raise its own popover. The bar declares `isolation: isolate`. No number was increased.

Verified by hit-testing every popover control that physically overlaps the banner with `elementFromPoint`, and then by putting the old rule back and watching two of them get captured again.

### The banner itself

It was a translucent wash of amber, so the page showed through it — which reads as a rendering fault rather than a state, and made its own sentence the hardest text in the application to read. It is now an opaque deep-navy band in the app's own palette with the signature red as a hairline down its leading edge.

It is informational apart from one button, so the band takes `pointer-events: none` and only its button takes `auto`. It can neither steal a press aimed at something else nor block one aimed at itself. On a phone it stacks, instead of squeezing its sentence into a seven-line column beside a button that had all the width.

### Everything moves the same way now

The period change and the tab transition both used to mirror the direction of travel: forward from the right, back from the left. It is a defensible idea and it was making two things worse. A motion whose direction changes is a second thing to read on every navigation, when the period is already stated in three places — and because the aircraft sweep and the arriving page derived their directions separately, on half of all navigations the plane flew one way while the page slid the other.

Left to right, every time. The data still moves whichever way the arrow said; only the motion is standardised. The tab ordering that fed the old logic is deleted rather than left unread.

### The identity is now the artwork

The A350 fin you supplied is in, as the master at `assets/brand/air-france-fin.jpg`, with `scripts/build-icons.mjs` deriving every size from it — favicon, ICO, Apple touch icon, 192, 512, maskable, and the mark in the sidebar.

Two framings, deliberately. The home-screen icons keep the artwork's own margin, which a launcher needs. The tab icons are cropped to the fin's measured bounding box, because at 16px that margin spends a quarter of the tile on empty navy and leaves the fin too small to recognise. Each small size is rendered from the 1024px original rather than downsampled twice — downsampling twice is exactly what turns a fin into a smudge.

The large icons are quantised to 64 colours: 48 kB against 181 kB truecolour, indistinguishable side by side at 512. Dithering was tried and made the files *larger*, because it adds precisely the noise PNG compresses worst.

The mark next to "Budget OS" is now the sidebar's collapse control. There were two things there before — a decorative logo that did nothing, and a 28px chevron at the far edge that did the work. They are one button now, with the chevron kept as the affordance. Collapsed to a 72px rail the mark is all that is left, and it is still the way back.

The tricolour is bigger — 108×5, up from 76×3, which was small enough to be taken for a rendering artefact. More importantly its three colours are now fixed literals, identical in both themes. Every band used to be a theme token and the middle one was swapped for a translucent white in dark mode, so it took the colour of whatever was behind it: the mark read as a navy rule with a red end and a hole in the middle.

### Activities can have real icons

Wishlist items could take an icon from the library, or from the maker's website, or fall back to the shop's. Activities had the library and nothing else. That was not a missing feature so much as a missing *module*: the resolution logic lived inside the wishlist panel as a private component, so there was nothing for an activity to reuse.

It is now `ui/EntityMark`, shared, with one order everywhere: a direct image link, then a library icon, then the source site's icon, then a neutral mark. Every network-fetched layer steps down to the next on error, so a dead link cannot render as a broken image.

The seller/brand distinction is preserved and extended. An activity's icon source is a field of its own, apart from any other link, exactly as a wishlist item's `brandUrl` is apart from its `url`. Where a thing is bought and who makes it are two different facts; one field for both forces a choice between an item that looks right and an item that buys right.

One thing this exposed. Because the chain falls through so gracefully, a link that 404s produced a perfectly reasonable-looking mark — while the editor cheerfully said "using the image you linked". The failure was invisible from the interface. The preview now reports the layer it actually rendered: *"That image did not load, so the site icon of navigraph.com is being used instead. Check the link."*

### The contrast sweep was measuring the wrong thing

The previous pass added a script that walks every text node and computes its real contrast ratio, and reported zero failures across ten tabs in both themes. It was reading `background-color` and nothing else — so every element sitting on a `linear-gradient` was scored against the page *behind* the card rather than the card. Every tinted metric card, every tone card, the historical banner.

With gradients composited, six real failures appeared.

Four were status colours used as text. `--success`, `--warning` and `--danger` are fill values, chosen to carry a chart series or a progress bar; as 13–17px type they read at 3.2, 2.5 and 3.6 to one. The grade colours, the metric tones, the month comparison and the history deltas had all taken the fill. They take the `-text` variants now.

The other two were greys on tinted cards in dark mode. A status tint over a *dark* surface lightens it — `--success-soft` at 18% over `#121A28` lands about three times brighter — and the grey ramp was measured against the untinted surfaces. The two lower greys fall to 3.7–4.2 : 1 there. Lifting the whole ramp would wash out every ordinary caption and weakening the tints would cost the tone cue, so the lift is scoped to tinted cards in dark mode, with the gap between the greys widened slightly so the hierarchy survives it. Worst case now, over five hues on two surfaces: 4.52 : 1.

Zero failures again — this time from a checker that can see the grounds it is measuring against.

### Smaller

- The live estimate in the activity editor formatted money with a hardcoded symbol mode while the card it previews used your setting, so the same number appeared two ways in one screen.
- The timeline's cadence line ran through a class that uppercases, so "pay every 10 sessions (≈ every 5 weeks)" was a sentence being shouted.
- The historical banner's button carried an inline `margin-left: auto`, which beats every stylesheet rule short of `!important` — so the phone layout could not stack it until the alignment moved into CSS where it belonged.
- `PeriodPopover` had no importer left. Deleted rather than kept beside its replacement.

## 3.0.0 — 2026-08-21 — Money someone else spent, and a caret that would not stay still

### The budget was charging you for other people's spending

There is a switch in Settings reading "Exclude non-budget payment sources from analytics". It was off by default. That single default meant a €200 dinner a friend paid for was charged to a €1,000 budget: remaining read €500 instead of €700, and the burn rate, the forecast, the category caps and the health score were every one of them wrong by the amount somebody else had paid.

Underneath, it was worse than a bad default. The check was written twice, in `calculations.ts` and in `analytics.ts` — and `calculateYear` did not apply it to `totalSpend` or `ytdTotal` at all, so the year-to-date figure on the dashboard disagreed with the month figure above it whenever anyone had marked a transaction as somebody else's.

Whether €200 you did not spend counts as your spending is not a matter of taste. It is now a rule with one definition, in `src/domain/funding.ts`, which imports nothing and which every budget selector filters through. The switch is gone.

The transaction is untouched: it keeps its full amount, stays in the ledger, and stays auditable. It is simply not charged to a budget it did not come out of, and the three figures are shown side by side where that matters — Personal / Paid by others / All transactions on Spending, a line on the dashboard's spending card, its own section and a plain-English note in every report.

Verified against the worked example, in a browser, against real PostgreSQL: €1,000 budget, €300 personal, €200 external, **€700 remaining**.

### Typing

Editing had a reputation in this project. Type one character into a wishlist item and the caret would jump back to the start of the field; type into any field but the first and focus would be snatched away to the first.

It was one line. `EditorSheet` set focus inside an effect that listed `onClose` in its dependencies. Every caller passes a fresh closure, and the draft lives in the parent's state — so a keystroke re-rendered the parent, which handed the sheet a new `onClose`, which tore the effect down and re-ran it, and the first thing it does is focus the sheet's first field.

The tempting fixes are all wrong. A `setTimeout` before focusing, a saved selection restored afterwards, a `useCallback` on every caller: the first two fight the symptom, and the third is a rule every future caller has to remember, failing silently when they forget. The effect is now genuinely a mount effect, with `onClose` read through a ref at call time. The caret is never moved in the first place.

It was never only the wishlist. The same bug was in the transaction editor, the activity editor and the category editor, and Scenarios shipped a bespoke modal carrying its own copy. Scenarios now uses the shared shell too.

`tests/editor-typing.test.tsx` types "Amazon Flight Simulator Hardware" one character at a time and asserts focus and caret after every one. It was written against the broken code first and confirmed to fail; a regression test that has never failed is a guess.

The wishlist editor had a second fault on top of the first. It was rendered *inside* the card being edited, which puts a `position: fixed` backdrop inside `.swipe-content` — and that element carries `will-change: transform`, which makes it the containing block for fixed descendants. The full-screen sheet was being laid out inside a 260px card and then clipped by the row's `overflow: hidden`. There is now one editor, at the panel root.

### The whole app moves when you change tab

The transition was a hairline and a 22px aircraft along the top of the content panel. It is now the application: a navy plane covers the viewport — over the sidebar and the header, not merely the content — a dashed route draws between a red departure node and a white arrival node, an airliner runs along it, and the new page enters from the direction the navigation moved.

The part that took the longest is invisible. React swaps the children the instant the tab changes, so without holding the outgoing tree the user catches a frame or two of the *new* page before the cover hides it, and the whole thing reads as a stutter rather than a departure. The outgoing page is now held until the screen is opaque.

690ms end to end, transform and opacity only, and skipped entirely under `prefers-reduced-motion` — a shape flying across the screen on every navigation is precisely what that setting exists for.

### A tab you can find

The app had no favicon at all. It has one now, and it is deliberately not the A350: at 16 pixels a wide-body seen from above is four grey smudges and a line. What survives at that size is one bold silhouette and two colours, so the mark is the part of an airliner that is a silhouette even in life — the swept fin — in navy with the signature red across its base. SVG, ICO, an apple-touch icon and a manifest, plus a real title, a description, two theme colours, and `noindex`, because a private financial tool has no business being in a search index.

### The identity reaches the phone

On a desktop the navy lives in the sidebar. A phone has no sidebar, so in practice the identity was desktop-only: the whole app was a white page with a navy button on it. The header is now a full-bleed deep-navy band with a blue glow, white type, and the red as a hairline at its foot — and it *reclaims* space rather than spending it, 241px down to 197px, by making one row do the work of two.

The tricolour signature ran the full width of the window, which its own source comment said it should not: full width it reads as a status bar or a loading indicator, which are the two meanings it must never carry. It is now a 76px centred tab, 56px on a phone.

### Every caption in the app failed the contrast minimum

Measured, not eyeballed. A script walked every text node on all ten tabs in both themes, composited the translucent backgrounds behind each one, and computed the real ratio against the computed font size and weight. Twenty elements failed.

`--text-tertiary` was 2.6:1 against the page — the token behind every caption, footnote, hint and empty-state line in the application. The grey ramp is now 15.6 : 6.7 : 4.9 and clears the minimum on the page, the card and the inset ground alike.

The status colours failed for a different reason: one colour was doing two jobs. `--success` at 2.9:1 and `--warning` at 2.5:1 are right as a chart series or a badge tint, where contrast is read against the shape beside them, and illegible as 13px text. They now have `-text` variants — the same hues darkened until they clear the minimum — and fills keep the saturated value.

Re-measured after: zero failures, ten tabs, both themes.

Checkboxes were the user agent's 13×13 default, below every touch-target guideline and visually lost beside 15px labels; they are 18px now, and they finally take the app's own accent colour instead of the platform's blue.

### Things that were there and could not be reached

**Seasonal presets.** Implemented, seeded, applicable — and called from nowhere at all. A real account is seeded with none, so the feature could not be used even in principle. Seasons now have a section in the Scenario Lab, and the way in is capture rather than a form: arrange the activities for summer, then name what you are already looking at.

**Notes against a month.** `monthlyNotes` has been in the model since the beginning. The loader returned a hardcoded `{}`, so anything written survived until the next read from the server and then vanished. It has a column now (migration 011), a store action, and a place in History — where a note is the one thing that still explains why March cost what it did a year later.

**A dashboard you arrange.** Seven sections, shown or hidden and moved up or down, stored with your budget so the arrangement follows you between devices. The health score and headline figures cannot be hidden, because a dashboard with no figures on it is a blank page rather than a simpler one.

### Things that were there and lied

**`POST /api/snapshot/reset`** answered `{"success": true, "message": "Reset would happen here"}` without touching anything. For a destructive endpoint that is the worst possible shape: a caller cannot tell it from a real reset, and the next thing it does is act on the belief that the data is gone. Nothing called it — the client's own Reset writes an empty snapshot through the guarded `PUT` path, which is revisioned, synced and undoable — so it is deleted rather than implemented. A second, unguarded way to erase a budget is not something this API should offer.

**`PATCH /api/snapshot/settings`** spread the request body straight into the stored settings. `baseCurrency: {}` would have been written and then formatted every amount in the app as `[object Object]`. `monthlyBudget: "lots"` would have made every figure `NaN`. A key nobody has ever heard of would have been stored forever and synced to every device. Each field is checked now, and unknown ones are refused.

**The link on a wishlist card** was labelled with the brand's domain and opened the seller's — the one place in the app where the text and the destination disagreed. The label names the destination now, and the brand is stated separately when it differs.

**Four settings** were stored, synced, and read by nothing. `liveClockEnabled` is wired, and turning it off stops the minute timer rather than merely hiding its output. `autoWalletRollupEnabled` and `promptBeforeMonthClose` are gone: the close-month dialog already asks every time, with the actual figure in front of the user, and a stored default for a permanent financial record is the wrong affordance. `nanPolicy` had exactly one legal value, which made an invariant look like a preference.

### Smaller, but not small

**Currencies you actually use.** Every amount field offered all ten, which is eight wrong answers for someone who deals in two. You choose the set now — but the display currency can never be untracked, nor can one that real records are denominated in, and a record keeps its own currency for editing even after it stops being tracked. The money was spent in it; rewriting the field would falsify the record.

**Reports for any window.** Presets for the last 30 days, the last 90, this quarter and year to date, plus two date fields. The interesting part is what a custom range refuses to say: the budget is set per month, so there is no budget figure to measure six weeks against, and prorating one would be a number nobody chose presented with the authority of a real one. It omits both and explains why.

**A renewal date the rule cannot know.** An annual subscription renews on the day it was bought. That is a fact about the past no recurrence rule contains, and a monthly charge with no day set has no derivable date at all. You can state the next one, and it overrides the calculated date in the timeline — but deliberately never touches a cost, because letting a typed date into the estimate would mean one keystroke could rewrite a year of budget figures.

**The wishlist's active total** was adding $600 and €40 into "€640".

**A wishlist item's name and its price** were competing for a 260px card, and the name lost: "Amazon Flight Simulator Hardware" rendered as "Amazon Fli…".

**Form controls had no `font-family`**, so every textarea in the app was set in the user agent's monospace next to sans-serif labels.

**52 more icons**, a flight-simulation group, and every name checked against the installed lucide build — searching "winwing", "navigraph", "rudder", "a350", "pesim", "theatre", "museum" or "arabic" now lands somewhere sensible. Brand marks are deliberately not drawn: they are trademarks, a hand-drawn approximation is worse than the real one and misleading about who made it, and the app already has the right answer in the separate brand link.

**Vendor code split from application code.** Everything landed in one 900 kB chunk, so a one-line fix invalidated React, the icon set and the store for every returning visitor. First load is unchanged; the cost of the *next* deploy drops from 222 kB to 94 kB.

### Verified

433 unit tests and 71 integration tests against a real PostgreSQL 17 database. Migrations 011 and 012 were run against a database that already held data — the upgrade path that once answered every request with 503 — and both are additive, with nothing dropped, truncated or rewritten. Browser work was driven through Chrome DevTools at 320px, 390px and 1440px in both themes.

Not deployed. Nothing here is verified in production.

## 2.1.0 — 2026-08-17 — Three rules that had never once applied

Three pieces of this app were written, committed, and never ran.

**The touch rule that hid per-row buttons.** `@media (hover: none) and (pointer: coarse) { .swipe-row .row-actions { display: none } }` has been in the stylesheet since swipe was added. Every row container also carried an inline `style={{ display: "flex" }}`, and an inline style outranks any stylesheet rule. So every phone kept showing the Edit and Delete buttons that the swipe gesture exists to replace — the entire point of the gesture, silently undone by six characters of JSX. Found by looking at a phone-width screenshot, not by reading the CSS.

Fixing it broke something else immediately: the transaction amount lived *inside* that container, so hiding it took the figure with it. The amount now sits in `.row-trailing`, which stays.

**Change password.** A server route, an API wrapper, a store action, an error path — complete, tested at the edges, and reachable from nowhere in the interface. A signed-in user could not change their own password without going through "forgot password" and their own inbox. There is now an Account section in Settings, and a matching change-email endpoint beside it.

**Disabled buttons.** `.btn` had no `:disabled` styling at all. Close Month on a closed period, the reorder arrows at the ends of a list, Approve with nothing to approve: each one looked exactly as pressable as a live button and did nothing when pressed. Nothing tells a user less.

### The swipe now has weight

The gesture only ever revealed a panel. It now behaves like something being dragged: 1:1 with the finger to the edge of the panel, then rubber-banding at 45% so it keeps responding while the distance starts to cost something. Past 150px of travel the row arms — the action takes the full width, its label moves to the edge you can actually see, and letting go performs it. Let go earlier and it snaps open or shut as before.

The threshold is measured against raw finger travel rather than the damped offset, because the user is reasoning about how far they dragged, not about how far the row moved. Destructive actions still confirm.

That label placement is not a detail. Centred in a panel that is four-fifths hidden behind the row, it left a wordless block of red at the exact moment the user needs to be told what letting go will do.

### The dashboard stops apologising

A new account opened on eight cards, each explaining that it had no data. That is not a dashboard, it is a list of things the app cannot tell you yet. A blank account now gets three ways to start — import a spreadsheet, add recurring expenses, log a transaction — each going straight to the right place. Everything returns the moment there is something to compute from.

The reference material below the fold went behind collapsible sections, closed by default under 900px. They unmount rather than hide: a chart that is merely invisible still measures and re-renders for someone who chose not to look at it.

The suggested-budget card no longer appears when the suggestion is zero. Approving it wrote a permanent, uneditable record stating that the month's budget was zero — with no recurring expenses there is no suggestion, which is not the same as a suggestion of nothing.

And the Save button is gone. It stamped `lastUpdated` to force a write, which implied work was unsaved until you pressed it — never true — and cost a full row on a phone. The sync badge states what has actually reached the server.

### Air France, quieter

The tab transition flew a 44px aircraft through the middle of the page. It is now a hairline route across the top with a 22px aircraft along it, 720ms: noticed, not watched, and it no longer covers what you asked to see.

A tricolour rule sits above the whole application and inside the sign-in card. Its middle band is a pale blue-grey rather than white — on a white card, white is a gap, and a rule broken in the middle reads as a rendering fault instead of a flag.

Changing period now moves the page in the direction time moved. Forward slides in from the right, back from the left, driven by a period ordinal, because the arrows know their direction but the month and year dropdowns can jump anywhere.

The drawn airliner replaced the last Lucide `Plane`. On the first-run card it sits on a navy medallion: the livery is white, and a white aircraft on a white card is a navy fin and a red line.

### Editors say what their fields are

The transaction editor labelled its fields with `aria-label` and `placeholder` only. A screen reader was served. A sighted user saw a box reading "Budget" and another reading "One-off", with nothing to say that the first meant who paid and the second how often it repeats — and a `<select>` has no placeholder to lose in the first place.

The wishlist form became a sheet like the others, and its icon section now previews the mark the item will carry and names where it came from. That chain has four steps and any of them can fail quietly.

### The real aircraft

The A350 artwork you supplied is now the aircraft. Background flood-filled away from the borders, trimmed, turned nose-right, and held at 512px — the largest place it appears is 132px, which is 396px on a 3× screen. As a paletted PNG it is 33 KB, four times smaller than 32-bit and indistinguishable at the sizes used.

It carries the loading screen and the first-run card. The 34px brand marks and the 22px craft in the tab transition stay on the drawn version: an illustration with a fuselage this detailed is mush at that size, where a silhouette is all anyone can see anyway. The drawing also remains the `onError` fallback, so a missing file cannot produce a broken image.

Putting it on the loading screen exposed a defect in the route line underneath: its travelling highlight animates a full width past each end, and the track was `overflow: visible`, so it drew a bright streak clear off the side of the screen.

### Icons

84 to 192, across 15 groups. Four are new: Aviation, Gaming, Shopping & services, Outdoors. Every name was checked against the installed lucide build before being written — an icon that does not exist renders as the fallback, so the picker would have offered a choice that silently did nothing. Measured cost: 13.2 KB gzipped, 193.2 → 206.4 KB.

## 2.0.4 — 2026-08-16 — The stutter was a download, not an animation

### Measured before changing anything

The transition was reported as laggy twice. Profiling one tab switch gave a **median frame of 8.3 ms and not a single frame over 20 ms** — the animation was never dropping frames.

The delay was the deferred panels. Splitting them out cut the first load by 40%, but it moved the cost to the moment a tab opens: **190–370 ms locally**, and considerably worse over a real network. That lands exactly while the transition plays, so a chunk being fetched looked like an animation stuttering.

**The panels are now fetched while the browser is idle**, once something is on screen. Sequentially, so warming the cache never competes with a request someone is waiting on, and failures are swallowed — a warm-up must never surface.

| Tab | before | after |
|---|---|---|
| Analytics | 210 ms | **41 ms** |
| Scenarios | 372 ms | **20 ms** |
| History | 188 ms | **17 ms** |
| Settings | — | **22 ms** |

The loading bar no longer appears at all. With the wait removed, the transition is **880 ms** rather than 1150: that duration existed to cover a fetch that no longer happens.

### Tap to edit, on everything

Wishlist items, wallet entries and scenarios now open their editor when tapped, joining activities, transactions and categories. Every list in the app behaves the same way.

Each is a real button to a screen reader, responds to Enter and Space, and ignores clicks that landed on its own controls or that finished a text selection — so "apply this scenario" and "select this text" do not become "edit".

**Verification** — `npx tsc -b` clean · **435 tests passing**, 65 against real PostgreSQL 17 · both builds clean. Frame cadence re-measured after the change: median 8.3 ms, worst 10.4 ms, zero frames over 20 ms.


## 2.0.3 — 2026-08-16 — A proper aircraft, calmer motion, bolder colour

### The mark is now an airliner

A twin-aisle wide-body seen from above, in a blue-white-red livery: swept tapered wings with upturned tips, engines slung ahead of the leading edge on visible pylons, a rounded nose with a darkened flight deck, a small tailplane close to the tail, and a navy fin with a red flash.

It took three attempts. The first was a generic silhouette; the second used bezier curves for the wings and **they crossed over themselves** — a curve one control point away from wrong is not worth the realism at 44 pixels, where the silhouette is all anyone can see. Straight edges throughout now, and it reads as an airliner down to the sidebar size.

The airline's logo and wordmark are trademarks and are deliberately not drawn.

### The transition is slower, and cheaper per frame

620 ms was measurably too quick: the aircraft crossed a 1440 px panel in about a third of a second, which reads as a twitch — and gives the compositor a very high pixel rate to sustain, which is where the stutter came from.

- **1150 ms**, on one easing curve that leaves calmly, covers the distance and settles without overshoot.
- **The `drop-shadow` filter is gone.** It was recomputed every frame across the whole panel. Only `transform` animates now, on promoted layers.
- The hard gradient band, which read as a bar sliding past, is replaced by a soft wash travelling ahead of the aircraft and a **contrail** drawn by the aircraft's own element — so there is no second animated thing to keep in sync.

### Selection is unmistakable

- **Light mode**: brand navy block, white label, **red icon**.
- **Dark mode**: white block, navy label, **red icon**. Navy on near-black would disappear, so the block inverts — the red is constant in both, and that is what carries the identity.

### More motion, and less clutter on a phone

- Sheets rise from the bottom edge on a phone and scale in on a desktop, which is where each visually comes from.
- Lists arrive in a short stagger, capped at eight rows — beyond that the last row waits noticeably for no benefit.
- **On touch devices the per-row icon buttons are gone.** They were ~34 px targets crowded at the edge of a card, competing for width the content needed; the swipe panel gives the same actions a full-height target and tapping the row opens the editor. Scoped to touch-only, so a mouse or keyboard keeps every control.

### Wishlist items can use the icon library

Many sites have no usable favicon, and some return a placeholder indistinguishable from a broken image. An icon chosen from the library now **overrides** anything derived from a URL, because an explicit choice should win. Migration `010`.

**Verification** — `npx tsc -b` clean · **435 tests passing**, 65 against real PostgreSQL 17 · both builds clean.


## 2.0.2 — 2026-08-16 — One interaction model everywhere

### Editing is a dedicated editor, on every entity

Activities, transactions and categories all open a **dedicated editor** now — a centred dialog on a large screen, a full-screen sheet on a phone — and **the whole row opens it**. The small icon buttons stop being the only way in.

Spending's form used to stand permanently open above the list, occupying a large block of every visit to record something most visits do not record. It now opens on demand, and a row opens it already filled in.

Category editing unfolded inside the list, pushing every category below it out of view. Inside a sheet the form's own buttons are suppressed and the actions live in the sticky footer — two sets of buttons would be two places to look for the same thing.

### Swipe is configurable, and it is everywhere

Wishlist, activities **and** transactions all carry swipe actions, and **Settings → Gestures** decides what each direction does.

That is configurable rather than fixed because the destructive action is the one people genuinely disagree about: some want Delete under the thumb, others want it nowhere near it. A gesture that removes something you did not mean to touch is not recovered by picking a cleverer default.

- Each list offers only actions it can actually perform — "Buy" is absent from transactions, because a control that does nothing is worse than no control.
- Turning a direction off is always available.
- An empty preference means "use the defaults"; storing a full copy up front would freeze today's defaults into an account forever. A stored value that names only one direction still gets the default for the other, rather than silently disabling it.
- The gesture still only **reveals**. The revealed button is the second, deliberate tap, and it is a real button in the DOM for a keyboard.

**Verification** — `npx tsc -b` clean · **435 tests passing**, 65 against real PostgreSQL 17 · both builds clean. In a browser: the gesture settings persist to PostgreSQL, changing one changes what the wishlist reveals, and a transaction row opens the editor already filled in.


## 2.0.1 — 2026-08-16 — Dedicated editors, a clean start, and a header that gets out of the way

### A new account starts empty

Signing up used to hand you the demo budget — someone else's gym membership, someone else's wishlist — and, for the very first account, whatever budget existed before accounts did. Both are wrong: you then delete ten things before recording the first real one, with no way to tell afterwards which figures were yours.

Every account now starts with **categories and nothing else**. Categories are the structure a budget needs to record anything; everything representing a decision or a transaction starts empty. Data from before accounts existed is recovered by **importing** it — a deliberate act with a preview, not a side effect of signing up.

### Editing is no longer another card

Tapping an activity opens a **dedicated editor**: a centred dialog on a large screen, a full-screen sheet on a phone. The whole card opens it, so the small icon buttons stop being the only way in.

Editing used to unfold inside the card, pushing the rest of the list out of view; on a phone the fields ended up in a column narrower than their own labels and the save button was often below the fold. The footer is now sticky, and the page behind cannot scroll while a sheet covers it.

Season, notes and visibility sit behind **Advanced**. Recurrence, schedule and prices stay visible — the schedule fields already appear only when the chosen cost model needs them, so hiding them would have hidden exactly what the user had just asked for.

### The period selector is a widget, not a fixture

It occupied the most valuable strip of every page — a mode toggle, two dropdowns and two arrows — to serve an action most sessions perform once. On a phone it took a third of the first viewport before any figure appeared.

It is now a compact pill stating the selected period, which is the part needed continuously. The controls open on demand, and a selection that is **not** the real current period is marked without opening anything.

### The tab transition was broken by code splitting

The animation still existed, but lazily loaded panels made it useless: the wrapper mounted with the loading placeholder inside it, the transition played over an empty box, and the real content then swapped in without remounting. The animation now lives on the content itself, so it fires when the content actually arrives.

### Also

- Excel import is reachable from **Settings → Data**, where anyone looking for it would go first. The flow was extracted into one component rather than duplicated.

**Verification** — `npx tsc -b` clean · **427 tests passing**, 65 against real PostgreSQL 17 · both builds clean. Checked in a browser at 1440 px: the period selector collapses and opens, the tab animation runs on real content, the activity editor opens from the card.


## 2.0.0 — 2026-08-16 — Swipe actions

### The gesture reveals; it never acts

Swiping a wishlist item or an activity slides the card aside to expose its actions. **The swipe itself does nothing.** A gesture that deletes on release has no confirmation and no way to see what it is about to do, which is the wrong shape for an action that destroys a financial record. Revealing gives a visible target, a second deliberate tap, and a label to read first.

- **Wishlist**: swipe left for Delete, right for Buy.
- **Activities**: swipe left to Hide or Show.

### The accessible alternative is the same control

The revealed buttons are real buttons in the DOM at all times — reachable with Tab, announced normally, named for the row they act on ("Delete: Steam Frame"). Nothing here is available only to a finger. They leave the tab order while hidden, so Tab never stops on a control nobody can see, and the same actions remain on the card itself.

Escape closes an open row, and so does a tap anywhere outside it, so a revealed Delete cannot sit waiting to be hit by accident.

### Choices that make it behave

- **Touch only.** A mouse drag across a card is far more often a text selection or the start of a scroll; hijacking it would break both. On a pointer device the panels are not rendered at all — verified: a mouse drag moves nothing.
- **Vertical intent wins ties.** The page must stay scrollable through a list of swipeable rows, which is most of what anyone does with one. A page that will not scroll is a worse failure than a swipe that does not open.
- **The row snaps fully open or fully shut**, never part-way, where half a label is unreadable and looks broken.
- **Gesture state lives in refs, not in `useState`.** Pointer events for one gesture can arrive within a single tick, and a state flag read inside those handlers is still the value from the last render — so the first moves of every swipe were being dropped. Found by driving the gesture in a browser.
- On the activity cards it coexists with drag-to-reorder: that is mouse-driven, and `dragstart` never fires from a finger.

**Verification** — `npx tsc -b` clean · **421 tests passing**, 65 against real PostgreSQL 17 · both builds clean. Driven with touch emulation at 390 px: a swipe opens the panel, the revealed Delete removes the item and it reaches PostgreSQL, Hide toggles an activity's visibility and persists, a vertical drag leaves the row alone, and Escape closes it. At 1440 px the panels are absent and a mouse drag does nothing.


## 2.0.0 — 2026-08-16 — Where an item is bought, and what it looks like

### One field could not carry both facts

A wishlist item's `url` was the purchase link *and* the source of its icon. That forced a choice with no good answer: point it at the shop and every item bought there looks identical, or point it at the manufacturer and the link sends you somewhere you cannot buy.

They are two different facts, so they are now two fields. `brandUrl` supplies the icon; `url` is still where the item is bought and is **never** replaced. When there is no brand link, the icon falls back to the purchase link exactly as before, so nothing changes for items that only ever had one.

The field sits behind a disclosure — most items are bought and branded by the same site, and asking everyone for a second link would tax the common case to serve the uncommon one. Migration `009` persists it.

### A form that refused what its own placeholder suggested

Both link fields were `type="url"`, so the browser demanded a scheme. Typing `store.com/product` — which the placeholder literally proposes, and which `parseItemUrl` is written to accept as https — made the browser block submission with a message the form never showed.

The fields are now `type="text"` with `inputMode="url"`. The keyboard is unchanged, and the app's own validation is stricter than the browser's anyway: it rejects `javascript:` and `data:`, which `type="url"` accepts.

**Verification** — `npx tsc -b` clean · **411 tests passing**, 65 against real PostgreSQL 17 · both builds clean. Driven in a browser: an item bought from one domain and branded by another stores both links, draws its icon from the brand, and still links to the shop.


## 2.0.0 — 2026-08-16 — Scenarios you can see, build and undo

### Applying a scenario was destructive and silent

One button, and clicking it rewrote the monthly budget, the piloting rule and every category cap the scenario named — with nothing shown beforehand. The only way to learn what a scenario contained was to apply it and compare, and the only way back was undo, if you noticed in time.

Applying now opens a preview: each setting that changes, with the current value struck through and the new one beside it. It states plainly that **nothing recorded is touched** — spending, activities and history stay as they are — and that the change is undoable.

- **A scenario already in effect is marked**, and its Apply button is disabled. Applying the same one twice is visibly a no-op rather than an action with an unknown result.
- **A scenario restating what is already true reports no changes.** Float drift is tolerated: a budget of `600 / 1.19` stored and reloaded is not bit-identical to the same division done again, and a hundredth of a currency unit is below anything the app displays.
- **A cap for a category that no longer exists is named**, rather than silently dropped — otherwise the scenario quietly does less than it says.

### Scenarios can finally be created

There was no way to add, edit, duplicate or delete one. The three seeded scenarios were all anyone could ever have, which made the whole feature ornamental.

- **Save current** captures the budget, the piloting rule and every cap that is set — the way people actually build scenarios: "save where I am before I try something." Re-applying a captured scenario is a verified no-op.
- Create from scratch, edit, duplicate, and delete with an inline confirmation.
- **An empty cap field means "leave that category alone". Zero means a real cap of nothing.** Collapsing the two would make it impossible to write a scenario that does not touch a category — and it is the same distinction the rest of the app makes between missing and zero. Verified end to end: a cap of 0 entered in the editor survives to PostgreSQL.
- A duplicate copies its caps rather than sharing the object, so editing the copy cannot reach into the original.

**Verification** — `npx tsc -b` clean · **400 tests passing**, 63 against real PostgreSQL 17 · both builds clean. Driven in a browser against real data: the seeded "Balanced" scenario is correctly detected as already in effect; applying "Tight Month" previews two changes, persists them, and moves the badge; creating a scenario with a zero cap round-trips; deleting asks first.


## 2.0.0 — 2026-08-16 — One-off exceptions to a recurring schedule

### "Just this once", without corrupting the rest of the year

A week is skipped, a lesson moves, an extra session happens, one occurrence costs something different. Recording any of that by editing the recurring rule rewrites **every other month the rule produces**, including closed ones.

Exceptions now apply to a single date and leave the rule untouched: **skip**, **move**, **extra**, and **price**. They are created from the dashboard timeline, on the occurrence itself, because that is where the user is looking when they find out.

The design rule is that everything derives from one function. `occurrenceDatesBetween` is the single place the rule and its exceptions are combined; the monthly count, the monthly and yearly estimates and the timeline are all expressed on top of it. An override cannot be honoured in one view and ignored in another — which in a financial app is simply a wrong number. `calculations.ts` needed no changes at all.

Decisions worth stating, each one a test:

- **A skipped week lowers the month by exactly one occurrence**, and leaves every other month alone.
- **A move crosses month boundaries with its cost.** Moving 30 March to 1 April takes the money out of March and puts it into April, rather than losing it.
- **A move with no destination is a skip.** The user said it does not happen then; leaving it in place is the one outcome they ruled out.
- **Zero is a real price.** A free session totals as zero. An *unstated* price is not zero: the month then reports that its total cannot be derived, rather than quietly understating itself.
- **An exception to a rule that does not exist is not a schedule.** An `extra` on an unscheduled activity used to appear on the timeline while contributing to no total — found by a test, and now returns nothing.
- Exceptions go through `updateActivity`, so they inherit the closed-period guard and land on the undo stack.

Migration `008` persists them. The repository writes a fixed column list, so a field added to the model but not to the schema, the upsert *and* the parser is silently dropped on the next round-trip — the failure migration 005 existed to fix. There is a round-trip test against real PostgreSQL, and removing the column from the upsert fails it.

### Two things found while testing rather than by the suite

- **Icon-only buttons had no accessible name.** Undo, redo and the theme toggle carried a `title` and nothing else. `title` produces a mouse tooltip; several screen readers ignore it outright, so those buttons announced nothing at all. `Button` now derives an `aria-label` from it, which fixes all ten without touching a call site.
- **`.text-footnote` uppercases its content** — correct for a micro-label like `REMAINING`, and wrong for the sentences I had put in it, which came out shouting. A `.text-note` class now carries small explanatory prose in sentence case.

**Verification** — `npx tsc -b` clean · **388 tests passing**, 63 against real PostgreSQL 17 · both builds clean. Driven end to end in a browser: skip an occurrence → the timeline drops it → the committed monthly falls from €442.68 to €410.32, exactly one session → the override reaches PostgreSQL → undo restores both the figure and the database.


## 2.0.0 — 2026-08-16 — Identity, and a dashboard that answers a different question

### An Air France identity, without touching your colours

The interface palette moves to deep navy (`#002157`) with the signature red as a **mark, not an interactive colour**. The red appears on the brand gradient and nowhere else: it is a shade away from `--danger`, and a red button would read as a warning rather than as a brand. Keeping the two apart is what lets both stay legible.

Neutrals are cooled so the navy reads as a deepening of the same family rather than a foreign hue, and headings take navy ink instead of near-black.

**Colours you chose are untouched.** Activity, category and wishlist colours come from your data and are applied inline; changing interface tokens cannot reach them. The colour pickers still offer the same swatches.

Two details that a single palette swap usually gets wrong:

- **`--accent-contrast`.** The primary button used a fixed white label. The accent is near-black navy in light mode and a pale blue in dark mode, so one of the two was always going to fail contrast. The label now follows the background.
- **The brand mark uses fixed values**, deliberately not redefined for dark mode. Letting a logo follow the theme turned the navy-and-red gradient into blue-and-pink. Interface tokens lighten on a dark ground because text must stay readable; a logo is the same mark everywhere.

### "Upcoming recurring" now shows what is actually coming up

It listed the five most expensive recurring activities — no dates, no chronology, the same five every month. It answered *what costs the most*, which the budget card already answers, rather than *what is about to happen*, which nothing did.

It is now a dated timeline across the next 14 days, grouped by day, with relative labels where they help (`Today`, `Tomorrow`, a weekday) and the full date where they do not.

The honest parts:

- **Activities with no schedule are not given invented dates.** A monthly subscription with no day set has no knowable date. They appear in a separate, collapsed group that says why — which is also the only way the omission ever gets fixed.
- **A per-occurrence price is shown only when it can be derived.** A monthly charge falling on one day of the month costs its monthly price on that day; that is arithmetic. Dividing a monthly total by a number of weekly sessions nobody entered is not, so those show a dash.
- Costs in the undated group are labelled `avg/mo`, because a yearly subscription is not a monthly charge even when it divides neatly.
- A twice-weekly activity alone fills a fortnight, so the list stops at five days and says how many occurrences it left out.

### The first load is 40% smaller

| | before | after |
|---|---|---|
| Initial JavaScript | 1,216 kB | **739 kB** |
| gzipped | 276 kB | **188 kB** |

- `xlsx` — the largest dependency at 429 kB — is loaded only when a file is actually opened or exported. It was previously downloaded and parsed before the **sign-in screen** could paint, on every visit, for a library most sessions never use.
- Analytics, Scenarios, History, Categories and Settings load when opened. The Suspense fallback holds the page height so switching tabs does not collapse the layout, and it stops animating for anyone who has asked the system to reduce motion.

**Verification** — `npx tsc -b` clean · **367 tests passing**, 61 against real PostgreSQL 17 · both builds clean · checked in a browser at 1440 and 390 px, in both themes, with no horizontal overflow.


## 2.0.0 — 2026-08-16 — Excel import

### The importer existed but was wired to nothing, and did not work

`importBudgetWorkbook` had never been reachable: there was no file input anywhere in the application. Run against the real workbook for the first time, it also turned out to be substantially wrong.

| Expected | Imported |
|---|---|
| 8 activities | **6** — Gym and Arabic lost |
| 14 wishlist items | **12** — the two most expensive lost |
| Weeks 1→33 | **11→33** — the first ten lost |
| 5 years (2026–2030) | **1** — the rest silently deleted by the save's targeted-delete pass |
| Balance €339.39 | **0** |

Two causes. Cells were addressed by hardcoded row number, and the sheet was read with `blankrows: false` — which drops empty rows, so every index below the workbook's first blank separator row was off by two. And `parseAmount` could not read `"€339.39"`, so an unknown balance became a *stated zero*, which is a different and wrong number rather than a missing one.

### Rewritten around header detection

`domain/workbookImport.ts` locates everything by its header text: the `Activities` row, the `What I want` column, the `Year` row and the label under each year that says which of its three columns is USD and which is EUR. Blank rows, inserted columns and moved metadata no longer matter. Verified against the real file: 8 activities, 14 wishlist items, 5 years, 48 transactions, balance €339.39, and a spending total of **€2,399.48** against the **€2,399.47** the sheet computes for itself.

- **Missing stays missing.** Empty cells, `N/A` and `NaN` produce nothing; `0` is kept, because a week with no spending is a fact the user recorded. A corrupted `parseAmount` that returns 0 for unknown fails four tests.
- **Failures are loud.** A missing sheet names the sheets the file does contain; a missing `Activities` or `Year` header is an error. The old code fell back to the first sheet in the workbook and to the seed's own activities, presenting invented data as if it had been read from the file.
- **Identifiers are generated per import**, not derived from the file. They are primary keys in tables shared by every account, so two people importing the same workbook would otherwise collide on every row — the defect migration 006 exists to prevent.
- Weeks 53–55, which the sheet prints as layout for every year, are skipped with one aggregated note rather than fifteen.
- The monthly block below the weekly one is deliberately not imported; it restates the same figures and reading both would double every amount.

### An import now shows what it will destroy, first

An import **replaces** the budget: the save deletes anything absent from the incoming snapshot. A preview dialog now states that plainly, with a before/after count of years, categories, activities, transactions, wishlist items and wallet entries, an explicit warning naming any year that will be deleted, the file's own notes, a one-click backup, and a confirmation checkbox that keeps the destructive button disabled until it is ticked. The import goes through `importSnapshot`, so it lands on the undo stack — verified in the browser: import, then undo, and the previous budget returns.

### Also

- `scripts/create-account.ts` creates or resets an account from the command line. It is not a back door: the password goes through the same scrypt hashing and the account has no elevated rights. The only rule it relaxes is the password minimum, and only when the database is on localhost — against anything else it refuses with an explanation.
- The superseded importer and the ten helpers only it used were deleted rather than left beside the replacement; `importExport.ts` drops from 400 to 121 lines.

**Verification** — `npx tsc -b` clean · **355 tests passing**, 61 against real PostgreSQL 17 · both builds clean · the full round trip driven in a browser: file → preview → confirm → store → API → PostgreSQL → read back → undo.


## 2.0.0 — 2026-08-16 — Accounts

### Email and password sign-in, with the data model made safe for it first

Adding accounts to this schema would have destroyed data. Three defects had to be fixed before a single line of authentication was written, all confirmed against a real PostgreSQL 17 server rather than a mock.

- **`budget_approvals` had no owner column**, and the repository read it with `SELECT * FROM budget_approvals` — no `WHERE` clause at all. Every budget would have loaded every other budget's approvals, which this project treats as permanent financial records.
- **Every seed identifier was hardcoded** (`cat-health`, `act-gym`, `wish-1`, …). Those are primary keys in tables shared by all budgets, so two seeded budgets collided on every row, and `ON CONFLICT (id) DO UPDATE` rewrote the existing row while leaving `snapshot_id` pointing at the original owner. The second account created would have taken over the first one's data on its first save. Identifiers are now generated per budget; a new `seedKey` carries the stable identity the app matches on, so the nine places that referenced those literals still resolve.
- **Category deletion was ordered before the rows that reference it.** Found by the new tests and live regardless of accounts: `activities.category_id`, `spending_entries.category_id` and `wishlist_items.category_id` are `ON DELETE RESTRICT`, and PostgreSQL checks those statement by statement rather than at commit — so replacing a budget's whole category set aborted the transaction with a bare foreign-key error. That is exactly what an Excel import or a reset to seed does.

Every `ON CONFLICT (id) DO UPDATE` now carries `WHERE <table>.<owner> = EXCLUDED.<owner>`, so a cross-budget identifier collision can never rewrite another account's row under any circumstances.

### How authentication works

- **Passwords are hashed with scrypt** from `node:crypto` — no native module to compile, which matters on Vercel where a binding that fails to load takes the deployment down. The cost parameters are stored inside each hash, so raising them later does not invalidate anyone; a stale hash is upgraded quietly on the next successful sign-in.
- **Sessions are opaque random tokens, stored hashed**, in an `HttpOnly` / `SameSite=Lax` cookie. Opaque rather than JWT because they must be *revocable*: signing out ends the session immediately, and a password reset invalidates every session that existed before it. A database dump yields no usable session.
- **Password reset** links work once and expire in 30 minutes. Sent through Resend's HTTP API — called with `fetch`, so no SDK dependency is added. `forgot-password` answers identically whether or not the address has an account, and whether or not mail was actually sent: any variation would turn it into a way to enumerate accounts.
- **Rate limiting lives in the database**, because serverless instances share no memory — an in-process counter resets on every cold start and would cap nothing.
- **CORS is now an allowlist.** It was `origin: "*"` with `credentials: true`, a combination browsers reject outright, so the session cookie would never have been sent at all.
- **`SIGNUP_INVITE_CODE`** (optional): when set, signup requires it. A personal finance app on a public URL otherwise lets anyone create an account.

The **first account created adopts the budget that already existed**, so introducing accounts does not orphan the data the app was already holding.

### The offline cache is now per account

IndexedDB used a single slot named `active`. With accounts that is a leak: sign out, sign in as someone else, lose the network for a moment, and the app would hydrate the previous person's budget and present it as the current account's. The cache is keyed by account, signing out clears **every** cached budget on the device, and a 401 is now a distinct error that the store refuses to serve from cache — previously any failed request fell through to it.

### Two bugs found by testing in a real browser

- **The API client's request wrapper called itself**, so every request recursed until the stack overflowed. The whole suite stayed green: the integration tests drive Express over HTTP and never touch that class. It surfaced only as a permanent "Offline" badge, because the overflow was caught and reported as an unreachable API. `tests/api-client.test.ts` now covers it.
- **`classList.toggle("dark", undefined)` flips the class rather than clearing it**, so a snapshot stored without `darkMode` inverted the theme on every run of the effect — leaving a dark page with light-scheme form controls.

### Verification

`npx tsc -b` clean · **330 tests passing**, 61 of them against a real PostgreSQL 17 server · both builds clean. The new isolation and authentication suites were each re-run against the previous code and fail there, so they measure the fixes rather than merely accompanying them. The full flow was then driven in a real browser: sign up, sign in, two accounts in isolated contexts confirming neither can see the other's budget, sign out clearing the cache, and a 375 px viewport with no horizontal overflow.


## 2.0.0 — 2026-08-16 — Accounts, import, editors and an identity

### Multi-device synchronization was broken. This is the fix.

Testing in a normal window and a private window showed changes not syncing. The cause was not the conflict guard — it was that **an unreachable API was silently indistinguishable from a successful save**.

Both `loadSnapshot` and `saveSnapshot` caught API failures and fell through to IndexedDB. A browser with a broken or unconfigured backend therefore looked exactly like a healthy one, while each browser quietly accumulated its own private dataset. Nothing in the UI ever said otherwise.

- **The server is now authoritative whenever reachable**, and IndexedDB is an explicit offline cache. Hydration asks the server first, so a device never boots from a stale cache and then overwrites newer remote data.
- **Persistence state is visible**: `Saved`, `Saving…`, `Offline — this device only`, `Sync conflict`, `Sync failed`, each with a Retry action, in the header and in Settings. "API unavailable" is never presented as "saved".
- **Returning to a tab re-checks the server**, so a change made on another device appears without a manual reload (`GET /api/snapshot/revision` is a cheap probe).

### The concurrency guard was itself unsafe

The previous scheme trusted a client-supplied `revision` and accepted anything higher than stored. A device that edited while offline keeps incrementing its own counter, so it could reconnect with a larger number and **overwrite whatever the other device had done in the meantime**.

Writes are now a compare-and-swap on `baseRevision` — the revision the client last read — and the **server** assigns the next revision. A client cannot inflate its way to winning, because a stale base is exactly what gets rejected. Legacy requests without `baseRevision` keep the old monotonic check so they still work.

Verified end to end with two isolated browser contexts against a live PostgreSQL database: A wrote → B read it → B edited → A saw the edit on focus without reloading → a stale write from A was rejected with B's data intact. Then with the server stopped: the UI reported Offline, and Retry after restart delivered the change.

### New fields were being silently dropped

The repository writes a **fixed column list**, so several model fields never survived a round-trip. Migration `005` adds them and the integration suite now has a round-trip test per group: activity `icon`/`color`/`costModel`/`sessionsPerMonth`/`weekdays`/`dayOfMonth`/`startDate`, wishlist `url`/`color`/`linkedSpendingId`, and spending `wishlistItemId`.

### Analytics are now charts, not number walls

A dependency-free SVG chart library (`src/components/charts/`): line, bar, stacked bar, donut, heatmap, sparkline, horizontal bars, and a large gauge. Every chart is theme-aware, accessible (`role="img"` with a description), and scrolls inside its own container.

- **Intelligent gridlines.** `niceTicks` picks 1/2/5×10ⁿ steps from the data range — a 0–20,000 range produces five lines, not two hundred.
- **Labelled budget reference lines** on budget-related charts, drawn subtly so they guide without dominating.
- Both the Analytics page and the Dashboard were rebuilt chart-led: spending trend, budget vs actual, cumulative forecast against the budget ceiling, category bars with cap markers, category evolution, recurring/one-off donut, daily heatmap, and period comparisons.
- **Missing data is drawn as missing** — broken lines, `?` markers, dashed cells — never as a fabricated zero.

### Budget health became the centrepiece

A composite 0–100 score with its contributing factors shown as bars, rendered in a large gauge. The score corrects an honesty bug found while building it: `budgetPacing` reports spend 0 for a period with *no records*, which scored an empty month as perfect adherence. A period we know nothing about now earns no factor at all.

### Recurring expenses became flexible

Four cost models: `auto` (unchanged legacy inference), `perSession` (price × sessions per month), `schedule` (price × **real occurrences in that calendar month** — some months have five Mondays), and `fixed`. Yearly figures follow the same model rather than assuming monthly × 12. Activities gained a searchable, categorised icon picker (84 lucide icons across 11 categories) and a colour that themes the entire card, not just a dot.

### Currency

- **Live exchange rates** from a keyless public provider, cached with a staleness window, with a manual override that a refresh never overwrites and a fallback that leaves existing rates untouched when the provider is unreachable.
- **Fixed a silent conversion fault**: `rateToBase` returned `1` for any pair it did not know, so a GBP amount was counted as if it were EUR. Rates now pivot through EUR when provider data exists, non-positive rates are ignored rather than zeroing amounts, and `canConvert` lets callers detect the fallback instead of trusting it.

### Reports

Printable monthly and annual reports, generated from the same shared selectors as the screen, opened in a new window with a print/save-as-PDF action (falling back to a download if pop-ups are blocked). Self-contained HTML with no external assets, user text escaped, and unknown months marked rather than drawn as empty bars.

### Typography and colour

A single type scale defined as tokens and consumed through `.text-*` utilities, with **tabular numerals on every financial figure** so amounts align in columns and a changing value does not shift its neighbours. Semantic colours were strengthened and given a coordinated eight-colour chart series ordered for colour-vision safety; dark mode redefines both hue and alpha, because a light tint disappears on a dark surface. Status is never carried by colour alone.

### Also fixed

- **Period navigation**: a "Go to current month/week/year" action that appears only when you are not there, and the header now states the selected period's full date range alongside the real current period, so a historical view can never be mistaken for today.
- The header showed an ISO week number in month mode that often belonged to a different month.
- `createSeedBudgetSnapshot()` returned the shared module-level `defaultCategories` array, so adding a category mutated the seed for every snapshot created afterwards in the same process.
- A lucide `Map` icon import shadowed the global `Map` constructor and crashed the app with "Map is not a constructor".
- New loading screen and tab transitions, both respecting `prefers-reduced-motion`.

## 1.1.0 — 2026-08-15 (later)

### Consent-gated historical editing, a real audit trail, and working category caps

#### Editing a closed period

Closed periods were strictly read-only, which made a late receipt or a miscategorised expense impossible to correct. They are now editable through a deliberate, audited path:

- The historical banner offers **Edit this period**, opening a consent dialog that states the consequences and requires an explicit acknowledgement before the confirm button enables.
- While unlocked the banner switches to a danger state naming the period, with a one-click **Relock**.
- Every period-bound change is recorded in the audit trail flagged as a historical edit, along with the period it rewrote.
- **Approved budgets stay immutable.** The override unlocks data, never decision records, so `recordBudgetApproval` checks the period directly rather than the override.
- The unlock is session-only: never persisted, never synced to another device, and cleared automatically as soon as the period changes.

#### History panel rebuilt — the audit trail was invisible

The panel was 11 lines showing a 12-month list. The store keeps **300 audit entries**; exactly one was visible anywhere in the app (the latest, in the header).

- Four sections: Periods, Month closes, Budget approvals, Audit trail.
- **Fixed a real bug: budget approvals never rendered.** The old code was `{approvals.length === 0 && <EmptyState/>}` with no else branch, so approvals showed an empty state when empty and nothing at all when populated. Their amounts, decisions, and dates had never been visible.
- Month close records — status, final total, delta, rollover — are surfaced for the first time.
- Audit trail with type filters, a dedicated "Historical edits" filter, and a banner counting changes that rewrote a closed period.

#### Category caps now do something

`monthlyCap` was editable and stored but read by **no calculation anywhere** — setting a cap had no effect.

- Cap tracking added to the shared analytics selectors: usage percentage, remaining headroom, and breach detection.
- The analytics category breakdown shows spend against cap with a colour-coded bar and an "Over cap" badge; without a cap it still shows share of spending.
- The dashboard surfaces a breach alert naming each category and the amount over.
- Caps apply in month mode only — comparing a year's spend against a monthly cap would report a false breach.
- A cap of `0` is honoured as a real limit ("spend nothing here"), not treated as unset.

#### Wallet and Settings

- **The wallet showed no balance.** It was computed and displayed on other pages but not on the Wallet panel itself. It now leads with wallet, personal, rollover, and opening balances, gains entry-type selection (previously hardcoded to `personal`), notes, inline editing (`updateWalletEntry` existed but nothing called it), month names instead of `month 7`, and a base-currency equivalent for foreign-currency entries.
- **Settings exposed 5 of 20 fields.** Most notably `monthlyBudgetCurrency` was missing, so the budget amount was interpreted in a currency the user could neither see nor change. Added currency format, rounding rule, budget currency, year-end wishlist behaviour, save-timestamp, and editable exchange rates — which previously could only be changed by importing a spreadsheet through a UI that does not exist.

#### Ctrl+Z no longer breaks typing

The global handler called `preventDefault()` on Ctrl+Z and then did nothing, disabling native undo inside every text field while providing no undo of its own — despite the header advertising the shortcut. It now performs undo/redo and stays out of the way while the user is typing.

#### Testing

94 tests (up from 81), including 13 new ones covering the historical-editing override, audit flagging, auto-relock, approval immutability under override, and category cap behaviour. Two new database integration tests confirm the audit flags round-trip through PostgreSQL (migration `004-add-audit-historical-edit`) and that omitting the audit log from a payload cannot erase it.

## 1.1.0 — 2026-08-15

### Verified persistence against a real database, shared analytics, and mobile repairs

#### Persistence — five defects found by testing against real PostgreSQL

The persistence layer had only ever been tested with a mocked driver, so SQL-level faults went unnoticed. Running it against a live PostgreSQL server surfaced five failures, all fixed:

- **Multi-statement DDL.** `initializeSchema` grouped `CREATE TABLE` with `CREATE INDEX` in single tagged templates; the Neon HTTP driver executes one command per call, so schema creation failed outright. Every statement is now its own template.
- **Integers bound to BOOLEAN columns.** Flags were written as `1`/`0`, which PostgreSQL rejects for `BOOLEAN` (SQLite tolerated it). All flags now bind real booleans.
- **Corrupted entry years.** `parseSpendingEntry` recovered the year from the year-row id suffix, but those ids embed `Date.now()`, so every loaded entry received a nonsensical year that fell back to a hard-coded `2026`. The year now comes from the `years` table.
- **Non-atomic saves.** Statements ran one by one, so a mid-save failure left the database partly written. All writes are collected and executed in a single `sql.transaction([...])` batch.
- **Historical records exposed to deletion.** Budget approvals and audit rows took part in the delete pass; both are now upsert-only.

#### Multi-device synchronization

- Added `snapshots.revision` (migration `003-add-snapshot-revision`), a counter incremented by each client commit.
- `PUT /api/snapshot` rejects a write whose revision is not newer than the stored one with **409 Conflict**, returning the current server snapshot. The client adopts it and asks the user to re-apply their change instead of silently overwriting a newer device's data.
- Verified in the browser across two isolated sessions: device A wrote, device B read it, device B edited, device A saw the edit, and a stale write from device A was rejected without data loss.

#### The server could not actually run

`npm run server:build` only proved that `tsc` emitted files. The output had never been executable:

- Relative imports lacked the `.js` extensions Node's ESM loader requires, and `@/domain/*` was emitted verbatim with nothing to resolve it. Both are now real relative paths.
- `server:prod` pointed at `dist/index.js`, which does not exist (the emitted path is `dist/server/src/index.js`).
- `server:dev` invoked `ts-node`, which is not a dependency. It now uses `tsx`, which is.
- `/api/health` required the database, so a misconfigured database looked identical to a dead server. It now answers `503 degraded` with the reason, and API errors name the missing `DATABASE_URL` instead of returning an opaque 500.

#### Analytics — one shared calculation layer

- Added `src/domain/analytics.ts` holding every period-aware selector. The Dashboard and the Analytics page now read from it instead of maintaining separate, divergent implementations.
- **The Dashboard previously ignored the global period selector**, always reporting the selected month even in week or year mode. It now follows the selected period everywhere.
- New figures: median and largest transaction, daily average, projected end-of-period total, required daily pace to stay on budget, and previous-period comparison (including across year boundaries).
- Weekly trend charts now show a window containing the selected week; previously they always rendered weeks 1–12 and hid the current week for most of the year.
- Missing periods render as `?` or "No data" and never as a fabricated zero.

#### Data-loss fixes

- **Editing any transaction reset its recurrence to one-off.** `SpendingPanel` hardcoded `recurrenceType: "none"` on both add and edit, so changing an unrelated field silently destroyed the recurrence of a recurring expense. Recurrence is now an editable field and is preserved.
- Category `bucket` and `monthlyCap` are read live by budget calculations, so changing them rewrites how past periods are reported. Both are now locked while a historical period is selected, and the misleading "does not change historical records" note has been corrected.
- Category parent assignment now rejects self-parenting and cycles in both the store and the API.
- `PATCH /api/spending/:id` now recalculates the year and moves the entry into the matching year record when its date crosses a year boundary, matching the client store.
- `PATCH /api/categories/reorder` was permanently shadowed by `PATCH /:id` and always answered "Category not found: reorder". It is now registered first.
- Transactions dated with `new Date().toISOString()` used the **UTC** date, so east of UTC an entry made after midnight was filed to the previous day — and on the 1st of a month, to the previous month and budget period. Local calendar dates are now used.

#### Mobile

- Fixed horizontal overflow at 320–430 px. Grid tracks default to `auto`/`1fr`, which are floored at the largest item's min-content, so wide charts widened the whole page. All page grids now use `minmax(0, ...)`. Verified zero overflow across all ten views at 320 px and 375 px, plus landscape and tablet.
- **Wishlist, Activities, Categories, History and Scenarios were unreachable on mobile** — the "More" tab opened Settings directly. Added a More sheet exposing all six sections.

#### Colour and accessibility

- Semantic tinted rails and soft washes on metric cards; category bars now use each category's own colour.
- Status is carried by rail, value colour, and icon together, so it never depends on hue alone. Progress bars expose `role="progressbar"` with values and labels, and charts carry descriptive `aria-label`s.
- Strengthened dark-mode semantic tints, which were washing out against dark surfaces at 8% alpha.

#### Testing and tooling

- 81 tests (up from 31), including `db-integration` and `api-integration` suites that exercise real PostgreSQL — schema, migrations, transaction rollback, boolean round-trips, approval immutability, conflict rejection, and zero-preservation. Each suite owns a PostgreSQL schema so they stay isolated in parallel.
- `setDatabase()` injection seam plus `scripts/dev-server-local-pg.mjs` let the backend run and be tested without a Neon account (`npm run server:dev:pg`, `npm run test:db`).
- Vite now proxies `/api` so development exercises the real API path rather than falling back to IndexedDB.
- Removed dead code: `ActivityEditor`, `WishlistEditor`, `src/api/hooks.ts` (all zero-importer), the unused `recharts` dependency, and stale compiled artifacts committed under `src/domain/`.

## 1.0.1 — 2026-08-11

### Analytics panel rebuilt, wishlist editing, and category editing

#### Analytics — real data, period-aware, with charts and burn rate

- Rebuilt `AnalyticsPanel.tsx` from the ground up (previously a minimal 85-line placeholder).
- All analytics now read exclusively from real `snapshot.years[*].spendingEntries` via the same period-filtering logic as the Spending panel: month, ISO week, and year modes all produce correct entry sets.
- New sections: KPI metrics row (total spend, budget remaining, average transaction, burn rate %); Budget vs Actual with progress bar and colour-coded delta (month mode); Recurring vs non-recurring split with percentages; SVG sparkline bar chart for 12-month and up to 26-week trends; Category breakdown with per-category progress bars (piloting correctly excluded from share %); Savings & Wallet section (wallet total + wishlist active total).
- Historical period detection banner (read-only notice when `isHistoricalPeriod` is true).
- Zero spend is preserved as €0; pending/missing periods show '?' in the chart. No fake data or mock values.
- No external chart libraries — charts use inline SVG with `viewBox` for mobile responsiveness.
- Added `tests/analytics-filtering.test.ts` with 7 regression tests: month/week/year period isolation, zero-value preservation, piloting bucket separation, recurring vs non-recurring split accuracy, and cross-month year total. Vitest suite: **7 files, 31 tests, all passing**.

#### Wishlist — full editing workflow

- Completely rewrote `WishlistPanel.tsx` (previously all minified onto one line with no edit capability).
- View filter tabs with live counts: Active / All / Bought.
- Add form with all WishlistItem fields: name, price, currency, priority (low/medium/high/dream), notes, inWishlist.
- Inline edit form per-item: pre-loaded with existing values, saves via `store.updateWishlistItem`, validates name non-empty, price if present is finite ≥ 0. Cancel without saving does not mutate state.
- Mark-bought button, delete with `window.confirm`, priority colour dots, truncated notes preview.
- Summary footer: active count, active value total, bought count.
- All controls hidden in historical/read-only periods (`isCurrentPeriodMutable() === false`).
- Mobile: all flex layouts use `flexWrap`, inputs have `minWidth` constraints.

#### Categories — full editing workflow

- Completely rewrote `CategoryManager.tsx` (previously only add/archive with no edit capability).
- Inline edit form per-category with all `BudgetCategory` fields: name, bucket (General/Piloting/Personal/Wallet), colour picker, monthly cap, parent category (1-level), description, icon name, notes.
- Patch flows through `store.updateCategory` — existing spending and activity records are not touched.
- Archive / Restore: archiving soft-hides the category; restoring via `updateCategory({ archived: false })`.
- Archived categories collapsible section (expand/collapse toggle).
- Referential-integrity note shown to users.
- Parent category select excludes self and already-archived categories.

#### Builds and tests

- Frontend build: ✅ 1616 modules, zero TypeScript errors (bundle-size advisory only, pre-existing).
- Server build: ✅ 0 errors.
- Test suite: ✅ 31/31 tests passing across 7 files.

## 1.0.0 — 2026-08-10

### Safe targeted snapshot persistence and API validation hardening

- Refactored `SnapshotRepository.ts` to replace destructive whole-table deletions (`DELETE FROM <table_name> WHERE year_id = $1`) with targeted `ON CONFLICT (id) DO UPDATE SET ...` upsert queries and selective deletion of removed IDs (`id NOT IN (...)`). This protects audit history, foreign keys (`spending_entries.activity_id`), and concurrent write safety.
- Hardened Category, Activity, and Approval API routes with input validation (`validateFiniteNumber`, `validateEnum`, `validateRequired`, category-reference validation, recurrence interval bounds, and non-negative amount checks).
- Enforced approved-budget immutability across `POST /api/approvals` and `PATCH /api/approvals/:id` so approved monthly budgets cannot be overwritten.
- Added automated unit tests for API validation helpers and `SnapshotRepository` targeted upsert persistence. Vitest suite now has 6 test files and 24 passing tests; frontend and server TypeScript builds compile cleanly.

### Global period navigation and analytics repair

- Redesigned the header into a compact Month / Week / Year control with previous/next navigation and a clear selected-period label. The control now treats ISO weeks as first-class periods rather than a cosmetic month selector.
- Added an explicit persisted ISO week-year alongside the calendar year. This keeps week 1 and week 53 correct across New Year, prevents month/week state from contradicting itself, and makes changing between period modes predictable.
- Centralized period labels, navigation, current-period comparison, and historical detection in one domain module. Historical state now produces one application-level banner and a non-blocking contour around the main content, so major tabs use the same source of truth instead of duplicating month-only checks.
- Repaired Spending and Analytics filtering to use the active global month, ISO week, or year and to collect weekly entries across the two calendar-year records a boundary week can span. Transaction creation now records its calendar year from the entered date, and date edits relocate a transaction to the correct year record when necessary.
- Analytics continues to calculate money through the existing currency normalization path, excludes Piloting from standard category-share percentages, and labels that exclusion instead of presenting it as ordinary spend.
- Added ISO regression coverage for New Year boundaries, prior-week historical mode, week-53 navigation, mode transitions, and store-level historical-write guards. The suite now has 4 files and 19 passing tests; frontend and server builds also pass. Visual/mobile verification remains open.

### Spending API validation

- Added shared Express validators for finite numeric inputs, calendar dates, and fixed-value enums.
- Applied them to spending creation and updates so `NaN`, invalid dates, mismatched date/month values, archived or unknown categories, unsupported currencies, and unsupported recurrence types fail with a structured client error instead of entering persisted data.
- Retained zero as a valid amount. Transaction date edits now update both the stored month and ISO week, keeping weekly and monthly calculations aligned after an edit.
- `npm run test`, `npm run build`, and `npm run server:build` passed after the API change.

### Theme and deployment architecture audit

#### Theme-system repair

- Moved the dark-theme token scope from an app-shell-only class to `html.dark`, which is where page background, browser-native form controls, and all descendants consistently inherit the selected theme.
- Synchronised `settings.darkMode` with `document.documentElement` and its `color-scheme` property. This preserves the persisted setting while making native inputs and browser chrome follow the selected mode.
- Added a tokenized application background and replaced stale `--line-strong` and `--muted` references in modal and auxiliary styles with the active design-system tokens. This removes undefined CSS values that could render inconsistently in dark mode.

#### Deployment preparation

- Split Express initialization from the local listener: `server/src/app.ts` creates the reusable application, while `server/src/index.ts` starts it only for local development.
- Added `api/[...path].ts` as the Vercel Functions entrypoint and `vercel.json` for the Vite production build. This keeps local `server:dev` behavior intact while enabling Vercel to serve the REST API.
- Added the API directory to frontend TypeScript validation so the serverless entrypoint is checked by `npm run build`.

#### Verification

- `npm run test`, `npm run build`, and `npm run server:build` passed after these changes. The production build has an existing chunk-size warning only.
- Browser/mobile theme checks, authenticated Vercel deployment, and live Neon durability tests remain unverified because this environment lacks an approved local server execution path and a `DATABASE_URL`.

## 0.2.0 — 2026-08-09

### Core workflow restoration and financial safeguards

#### User-facing changes

- Restored the formerly empty **Spending** view. Users can now add, edit, search, and delete transactions for the selected month. Amount `0` remains accepted as a real entered amount; it is not treated as absent data.
- Restored **Recurring activities** management. Users can add, edit, and remove recurring costs, select their category/currency/recurrence, and record monthly or session costs used by budget suggestions and forecasts.
- Restored **Categories**, **Wallet**, **Wishlist**, **Analytics**, **History**, **Scenarios**, and **Settings** screens. These expose the already-existing store capabilities rather than presenting an empty migration notice.
- Added a usable month-close dialog. It explains the calculated month-end delta, requires the user to choose whether that delta enters the wallet, and refuses rollover when a period remains missing instead of coercing missing data to zero.
- Historical months are now read-only for activities, transactions, wishlist items, wallet entries, month closing, and budget approvals. Controls in the active views reflect this restriction.

#### Data-integrity and backend changes

- Added store-level guards around period-bound mutations so navigating to a past month cannot silently change its transactions, close records, or related entries.
- Prevented local duplicate approval writes when the selected period already has an approved budget.
- Changed `PATCH /api/approvals/:id` to reject all writes to an already approved budget. This preserves approved budgets as immutable historical records.
- Updated the JSON-to-database migration helper to await `SnapshotRepository.saveSnapshot`, ensuring the command does not report success before the Neon write completes.
- Corrected the migration helper documentation to name Neon PostgreSQL rather than the retired SQLite implementation.

#### Documentation and maintenance

- Replaced `implementation_plan.md` with a live tracker containing in-progress work, verified completions, remaining work, and discovered issues. It now records that runtime verification is still pending.
- Added the project continuity documents to version control and updated `README.md` plus `docs/AI_CONTEXT.md` with the current implemented scope and the Neon/IndexedDB persistence limitation.

#### Verification and deployment impact

- `git diff --check` passed before commit; no whitespace errors were found.
- Automated tests, frontend build, server build, database persistence checks, and browser/mobile checks were **not run** because Node.js/npm is unavailable in the execution environment.
- No database migration needs to be applied for this client-workflow restoration. A configured `DATABASE_URL` is still required to verify server-side persistence.
- The commit is local until GitHub authentication is available; the repository is one commit ahead of `origin/main`.

## 0.1.0 — 2026-07-31

### Phase 1 & 2: Neon PostgreSQL Backend Migration
- Fully replaced SQLite (`better-sqlite3`) with Neon PostgreSQL (`@neondatabase/serverless`).
- Updated database schema initialization and created migration `002-add-category-metadata` for `icon`, `description`, and `parent_id` columns.
- Converted `SnapshotRepository` to run async PostgreSQL-compliant queries using `ON CONFLICT (id) DO UPDATE SET ...` syntax.
- Converted `BudgetService` and all Express API routes (`/api/snapshot`, `/api/spending`, `/api/categories`, `/api/activities`, `/api/approvals`) to handle async promises.
- Removed 120-item restriction on budget approvals to preserve approval history indefinitely in database and frontend Zustand store.

### Phase 3: Domain Model & Calculation Enhancements
- Added `icon`, `description`, and `parentId` optional fields to `BudgetCategory` type.
- Added `ignoreNonBudgetSpending` option to `Settings` interface and seed data defaults.
- Updated `summarizeCategories` and `summarizePeriod` calculations in `calculations.ts` to respect non-budget spending filtering while preserving Piloting bucket visibility.

### Phase 4: Commercial Premium UI/UX Refactor
- Refactored single-file presentation into a modular component directory structure (`src/components/dashboard`, `src/components/layout`, `src/components/activity`, `src/components/spending`, `src/components/wishlist`, `src/components/wallet`, `src/components/analytics`, `src/components/categories`, `src/components/scenarios`, `src/components/history`, `src/components/settings`, `src/components/modals`, `src/components/ui`).
- Introduced a brand new Design System (`src/styles.css`) inspired by Apple Wallet, Linear, Notion, and Copilot Money featuring calm neutrals, glassmorphism, responsive grid containers, and smooth micro-interactions.
- Added dedicated `MobileNav` bottom bar for mobile devices and small screens.
- Enhanced Category Manager with custom color picker, description editor, subcategory assignment, and drag-and-drop reordering.
- Added metric cards on Dashboard for burn rate, daily average spending, projected month-end forecast, and projected savings.
- Enhanced historical mode with sticky banner and read-only indicators.

---

## 2026-07-11

- Added local startup support and one-click launch helper for Windows.
- Included `Budget App.lnk` shortcut file in the repository root for easy deployment to Desktop.
- Improved the mobile and tablet UI with responsive layout changes and compact period navigation.
- Added clearer README instructions for running the app locally and accessing it from a phone.
- Verified all existing tests pass and confirmed the production build succeeds.
- Preserved budget calculations, recurring expense logic, and data persistence.

### 2026-07-11 — Launcher & installer (follow-up)
- Added installer script: `scripts/install-launcher.ps1` — copies GUI and batch to Desktop and creates a Desktop shortcut that runs the GUI via PowerShell.
- Enhanced repo launcher with tray icon, port polling timer, LAN auto-open, and balloon notifications: `scripts/launch-gui.ps1`.
- Improved repo batch launcher to auto-open browser and support LAN preview: `scripts/launch-desktop.bat`.
- Local Desktop GUI updated at `C:\Users\iyadf\Desktop\Budget-Launcher-GUI.ps1` (not tracked by default). Use the installer to sync.

### 2026-07-11 — Desktop GUI tracked & local build
- Added repo-tracked copy of Desktop GUI launcher: `scripts/desktop-launcher-gui.ps1`.
- Performed local production build (tsc + vite build); `dist/` produced successfully.
