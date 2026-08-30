# DESIGN_SYSTEM.md

> This document defines the visual language of the Budgeting App.
> Every future UI component should follow this design system.

---

# Implemented system — 2026-08-15

The sections below describe the tokens that actually exist in `src/styles.css`. Use them; do not restyle individual components with ad-hoc values.

## Typography

One scale, defined once as CSS custom properties and consumed through the `.text-*` utilities. Headings and financial figures are tightened; body copy is not.

| Token | Utility | Use |
| --- | --- | --- |
| `--text-display` | `.text-display` | Page-level figure or period title |
| `--text-headline` | `.text-headline` | Card headline, large money |
| `--text-title` | `.text-title` | Section and card titles |
| `--text-body` | `.text-body` | Paragraphs |
| `--text-callout` | `.text-callout` | Dense UI text, list rows |
| `--text-caption` | `.text-caption` | Secondary explanation |
| `--text-footnote` | `.text-footnote` | Uppercase labels above values |

Weights (`--weight-regular` … `--weight-bold`), line heights (`--leading-tight/snug/normal`) and tracking (`--tracking-tight/snug/wide`) are tokens too.

**Financial figures use tabular numerals.** `.text-display`, `.text-headline`, `.metric-value`, `.money`, `.chart-value` and `strong` all set `font-variant-numeric: tabular-nums`, so amounts in a column line up and a changing value does not shift the elements next to it. Any new component showing money should carry `.money`.

## Colour

Semantic first: colour states a meaning, it does not decorate.

| Token | Meaning |
| --- | --- |
| `--accent` | Information, the current selection, neutral emphasis |
| `--success` | Healthy, positive, under budget |
| `--warning` | Approaching a limit, needs attention |
| `--danger` | Over budget, over cap, destructive |
| `--purple`, `--teal`, `--pink` | Analytical accents |

Each has a `-soft` companion for fills and tints. Dark mode redefines both: a light tint disappears against a dark surface, so dark values are lighter in hue and stronger in alpha to keep the same perceived emphasis.

### One colour cannot do two jobs

`--success`, `--warning`, `--danger` and `--purple` are **fill** values. They are right for a chart series, a progress bar or a badge tint, where contrast is judged against the shape beside them. As 13px text on a card they read at 2.4–4.2:1 — below the WCAG AA minimum of 4.5.

So each also has a `-text` variant: the same hue darkened until it clears 4.5 both on a card *and* on its own soft badge background. **Wherever the colour is the text, use the `-text` token**; wherever it is a fill, use the plain one. Priority badges, bucket labels, analytics figures, the pacing sentence and wallet debits all take the `-text` variant while their backgrounds keep the fill hue. In dark mode the two are the same value: a saturated hue on a dark ground already reads at 8:1 and above.

### The grey ramp is measured

`--text-primary` : `--text-secondary` : `--text-tertiary` read **15.6 : 6.7 : 4.9** against the page and **12.4 : 6.2 : 4.6** against `--bg-inset`, the darkest surface the app puts body text on. Every step clears AA on every ground.

This was not always true: tertiary was `#8D99AC`, which is 2.6:1 — the token behind every caption, footnote, hint and empty-state line in the application. The ramp is widened at the top rather than compressed at the bottom, so the three greys stay visibly distinct while all three remain legible.

### Grey on a tinted card, in dark mode

A status tint over a *dark* surface lightens it: `--success-soft` at 18% over `#121A28` lands about three times brighter than the bare card. The ramp above is measured against the untinted surfaces, so on a tinted one the two lower greys fall to **3.7–4.2 : 1**. Light mode is unaffected — there the ground is white and the same tint darkens it.

The fix is scoped rather than global: inside `.tone-card-*` and `.metric-card.tone-*` in dark mode only, the two greys are lifted and their gap widened slightly (1.26× luminance apart against 1.14× elsewhere), so the hierarchy survives the lift. Lifting the whole ramp would wash out every ordinary caption; weakening the tint would cost the tone cue it exists to give. Worst case after the change, over five hues on two surfaces: **4.52 : 1**.

**How to check a change.** Do not eyeball it. A script that walks every text node, composites what is behind it, and computes the real ratio takes minutes to write and is the only way to know.

**The script must composite gradients, not just background colours.** The previous sweep read `background-color` alone, so any element sitting on a `linear-gradient` — every tinted card, the historical banner, the metric tones — was measured against the page behind it instead. It reported zero failures while six real ones were on screen. Walk the ancestors, take every colour stop in the gradient, and score against the worst of them. The current sweep does, and reports zero failures across ten tabs in both themes.

Nudging a grey "a bit lighter" is exactly how the previous value got there.

**Charts** use `--series-1` … `--series-8`, ordered so neighbouring series stay distinguishable, including for the most common colour-vision deficiencies — blue and orange lead, and red and green are never adjacent.

**Category and activity colours** are user data. A category's own colour drives its bar in every chart, and an activity's colour themes its whole card (tinted background, coloured icon chip, accent border), not just a dot.

**Status is never colour alone.** Metric cards pair a tinted rail with the value colour; charts pair colour with labels and shape; deltas add a direction icon.

## Surfaces

- `.card` — the standard container.
- `.tone-card-accent` / `-success` / `-warning` / `-danger` — a card with a soft directional gradient, used when the card itself carries a status.
- `.metric-card.tone-*` — adds a 3px semantic rail plus a soft wash.

## Charts

Dependency-free SVG in `src/components/charts/`. Shared rules:

- Gridlines and axis ticks come from `niceTicks`, which picks 1/2/5×10ⁿ steps from the data range. Never hardcode an interval: a 0–20,000 range must not produce 200 lines.
- Budget-related charts take a labelled reference line, drawn subtly (dashed, muted) so it guides without dominating: `──── Budget €2,000`.
- Missing data is drawn as missing — a broken line, a `?` marker, a dashed heatmap cell — never as zero. A recorded zero is drawn as a real zero.
- Every chart carries `role="img"` with a descriptive `aria-label`, and scrolls inside its own container rather than widening the page.

## Motion

`--duration-fast/normal/slow` with `--ease-out`. Everything meaningful is wrapped in `@media (prefers-reduced-motion: reduce)`.

### Motion runs left to right, always

Both the period change and the tab transition used to mirror the direction of travel: forward entered from the right, back from the left. It is defensible and it is not what this application wants. A motion whose direction changes is a second thing to read on every navigation, the period is already stated in three places, and — because the sweep and the arriving page derived their directions separately — on half of all navigations the aircraft flew one way while the page slid the other.

So the direction is fixed. `appSweepCover` grows from the left edge, `appSweepClear` leaves by the right, `pageArrive` and `periodShift` both start left of where they belong and travel right. The *data* still moves whichever way the arrow said; only the motion is standardised. Anything added here should travel the same way.

## Responsive

Verified at 320, 375, 834 and 844 px, in light and dark. Two rules prevent the recurring overflow bug: page-level grids use `minmax(0, 1fr)` tracks — an `auto`/`1fr` track is floored at its largest item's min-content, so a wide chart widens the whole page — and every scrollable wide element owns its own `overflow-x`.

---

# Philosophy

This application should feel like premium software.

Not flashy.

Not overloaded.

Not childish.

Instead it should feel:

• Calm
• Premium
• Elegant
• Fast
• Minimal
• Trustworthy
• Modern

Imagine Apple designed a finance application while taking inspiration from Linear, Copilot Money and Notion.

---

# Core Principles

Every design decision should answer:

- Is it easier to understand?
- Is it visually balanced?
- Is it consistent?
- Does it reduce cognitive load?
- Does it feel premium?

If the answer is "no", rethink the design.

---

# Design Inspirations

This project takes inspiration from the *qualities* of these products—not their appearance.

### Apple

- Typography
- Whitespace
- Hierarchy
- Fluid animations
- Simplicity
- Consistency

### Linear

- Component consistency
- Beautiful dark mode
- Motion
- Modern cards
- Sidebars
- Hover effects

### Notion

- Information hierarchy
- Clean layouts
- Readability

### Copilot Money

- Dashboard
- Analytics
- Financial summaries
- Category insights

### Monarch Money

- Budget overview
- Monthly planning
- Forecasting

### Revolut

- Financial polish
- Graphs
- Card layouts
- Statistics

---

# Colour Philosophy

Avoid saturated colours.

Prefer neutral tones.

Colour should communicate meaning.

Examples:

Primary

Blue

Secondary

Purple

Success

Green

Warning

Orange

Danger

Red

Information

Cyan

Neutral

Grey

Background

Very dark or very light depending on theme.

---

# Dark Mode

Dark mode should be the primary experience.

Requirements:

- Soft backgrounds
- No pure black
- High readability
- Comfortable contrast
- Smooth gradients
- Premium appearance

## Implementation status — 2026-08-10

Theme state is the persisted `settings.darkMode` value. The application applies it to `html.dark`, where the design tokens are defined, and sets the browser `color-scheme` so native controls follow the selected mode. The app shell, sidebar, cards, forms, dialogs, charts, and mobile navigation consume tokenized colors. The code compiles and builds; final browser checks for both themes and narrow mobile layouts remain required.

## Period selector and historical state

The period control is a bar directly under the header — `layout/PeriodSelector.tsx`, styled in one block in `styles-extras.css`. It carries, in one line on a desktop: the Week / Month / Year segments, one step either way, the period with its date range, today's date, and one button back to the current period. Every frequent action is one press. Only "jump to an arbitrary period" is behind a disclosure, and that disclosure is a month grid with a year stepper rather than two native dropdowns — a dropdown cannot show where you are in a year at a glance.

It has been three things. A permanent open strip (a third of the first viewport on a phone, for an action most sessions perform once), then a collapsed widget in the header (which fixed the space and cost the two things people need continuously: seeing the period, and stepping through it without opening anything), and now this. If it is redesigned again, keep the two continuous jobs continuous.

On a phone it stacks: the segments, then the arrows at the outer edges with the label between them on its own inset ground, then the date and the current-period button. Below 380px the date is dropped — it is reference; the way back to it is the action.

### Layering, and why it is not a z-index

A historical selection is informational, not an error. The main area gets a dashed contour and an opaque banner; the selector sits above both.

That ordering used to be impossible. `.historical-period > *` gave every child of the main area `z-index: 1`, which made each of them a stacking context — trapping the selector's popover inside the header's layer — and let the banner, a later sibling at the same z-index, paint over the whole header and swallow the clicks. The children are still positioned so they clear the dashed contour, but they no longer carry a `z-index`; a positioned element with `z-index: auto` paints in tree order in the same layer. The bar raises itself with `isolation: isolate`.

**Do not fix a layering problem here by raising a number.** If something is underneath when it should be on top, find the stacking context that is trapping it.

### The historical banner is opaque and inert

It was a translucent wash of `--warning-soft`, so the page showed through — which reads as a rendering fault rather than a state, and made its own text the hardest to read in the application. It is now an opaque deep-navy band in the app's palette with the signature red as a hairline, in fixed values rather than theme tokens: it states the same fact in both themes and should look the same doing it.

`pointer-events: none` on the band, `auto` on its own controls. It is informational apart from one button, so it can neither steal a press aimed at the selector nor block one aimed at itself. Pages should not add duplicate global banners or independently decide whether a period is historical.

---

# Typography

Hierarchy should be immediately obvious.

Suggested scale:

Display

48px

Page Title

32px

Section Title

24px

Card Title

18px

Body

16px

Caption

13px

Metadata

12px

Numbers should be slightly bolder than surrounding text.

---

# Spacing

Spacing should remain consistent.

Suggested spacing scale:

4

8

12

16

20

24

32

40

48

64

Avoid arbitrary spacing values.

---

# Border Radius

Use soft rounded corners.

Cards

16px

Buttons

12px

Inputs

12px

Dialogs

20px

Charts

16px

The UI should feel modern without looking cartoonish.

---

# Elevation

Use subtle shadows.

Avoid excessive blur.

Cards should feel layered without floating.

Use elevation to communicate hierarchy.

---

# Icons

Use one icon set consistently.

Examples:

Lucide

Heroicons

Phosphor

Avoid mixing icon libraries.

### The icon picker

`src/components/ui/IconPicker.tsx` offers **244 icons across sixteen groups**, every one a real `lucide-react` export imported statically. That is deliberate rather than a name-to-namespace lookup: the bundler ships only the icons the picker offers, and an unknown or renamed name can never crash a render — `resolveIcon` falls back to a neutral mark. Stored records keep the icon *name*, not the component, so data survives a library upgrade.

An icon may appear in more than one group. A joystick is an arcade stick and it is a sidestick, and the groups are a way of browsing rather than a partition. The name index keeps the **first** occurrence, so what a stored name resolves to does not depend on declaration order, and grid keys are scoped per group.

**Brand marks are not drawn.** Product and company names are trademarks, and a hand-drawn approximation of someone's logo is both worse than their own and misleading about who made it. The picker covers *kinds* of thing, with product names in the search keywords, and a record that needs a real brand mark gets one from the maker's own site through the separate source link below.

Icons should remain simple.

### One mark resolver, one order, one fallback

`src/components/ui/EntityMark.tsx` resolves the mark for **both** wishlist items and activities, in one fixed order:

1. **A direct image link** — the most specific thing the user can state, so it wins.
2. **A library icon** — an explicit choice. It beats the site icon because many sites have none and some answer with a placeholder indistinguishable from a fault.
3. **The source site's icon.**
4. **A neutral fallback.**

Every network-fetched layer has an `onError` that steps down to the next, so a dead link can never render as a broken image. The failure flags reset when the URL changes, or editing a broken link into a working one would leave the mark broken until the component unmounted.

This used to be a private component inside the wishlist panel, which is why activities had a library icon and nothing else. A second implementation of the same job is how the two drift, and the drift always ends in a broken image — because only one of the copies has the net.

**The preview reports the layer actually rendered, not the one requested.** A link that 404s used to leave the caption saying "using the image you linked" while the mark quietly showed something else, so the dead link stayed invisible until someone wondered why their logo never appeared. `EntityMark` reports its resolved layer up, and the caption says "That image did not load, so the site icon of *x* is being used instead."

**Where a thing is bought and who makes it are two facts.** A wishlist item keeps `url` (the shop) apart from `brandUrl` (the maker, which supplies the icon); an activity keeps `iconSourceUrl` apart from every other link. Never collapse them: one field for both forces a choice between an item that looks right and an item that buys right.

### The application mark

The identity is the Budget OS badge supplied by the owner — a Concorde over a euro sign under a tricolour band — mastered at `assets/brand/app-icon-source.jpg` and derived into every size by `scripts/build-icons.mjs`. It is referenced from exactly one constant, `APP_MARK_PATH` in `ui/AppMark.tsx`, so replacing it is editing one string.

The three aircraft (`assets/brand/{concorde,a350,alphajet}-source.jpg`) are cut off their sky by the same script, turned nose-right, and derived twice: as full-colour artwork for the loading sequence and as flat white silhouettes for the tab transition. `domain/aircraft.ts` is the single list; a component asks for a length in pixels and the aspect ratio comes from the asset, so nothing reflows as an image decodes.

Two framings, deliberately. The home-screen icons keep the artwork's own margin, which a launcher needs. The tab icons and the in-app mark are cropped to the fin's measured bounding box, because at 16px — or at the 30px the sidebar renders — the artwork's margin spends a quarter of the tile on empty navy. Each small size is rendered from the 1024px original rather than downsampled twice, which is what turns a fin into a smudge. The crop stays square; the fin is never squashed.

The mark is also the sidebar's collapse control. There used to be two things — a decorative logo that did nothing and a small chevron that collapsed the panel — so the largest, most obvious target in the panel was inert while the one that worked was 28 pixels at the far edge. They are one button now, with the chevron kept as the affordance that says what pressing it will do. Collapsed to a 72px rail the mark is all that remains, and it is still the way back.

### The tricolour

Three segments at the very top of the shell, 108×5 (84×4 on a phone). A signature, not a status bar: full width it would read as a loading indicator or browser chrome, which are the two meanings it must never carry. It was 76×3, which was small enough to be taken for a rendering artefact.

**Its three colours are fixed literals and identical in both themes.** Every band used to be a theme token, and the middle one was swapped for a translucent white in dark mode — so it took the colour of whatever was behind it, and the mark read as a navy rule with a red end and a gap in the middle. The middle band is a pale blue-grey rather than pure white, because on a white card pure white is a gap; it is opaque, so nothing behind it can change what it is.

---

# Animations

Animations should always have a purpose.

Recommended duration:

100ms

Quick feedback

200ms

Hover

300ms

Panels

400ms

Dialogs

500ms

Large transitions

Use easing.

Never linear motion.

---

# Buttons

Buttons should have:

Normal

Hover

Pressed

Focus

Disabled

Loading

Danger

Primary buttons should stand out.

Secondary buttons should remain subtle.

---

# Cards

Cards are the primary building block.

Each card should have:

Title

Content

Optional actions

Optional footer

Consistent padding

Consistent radius

Consistent spacing

---

# Forms

Forms should never overwhelm.

Group related fields.

Use progressive disclosure.

Inline validation.

Helpful placeholders.

Meaningful error messages.

---

# Charts

Charts should prioritise readability.

Avoid unnecessary decoration.

Recommended:

Line

Area

Bar

Stacked Bar

Donut

Heatmap

Sparkline

Every chart should answer a question.

---

# Dashboard

The dashboard should feel like a command centre.

Not a spreadsheet.

Each widget should provide actionable information.

Every metric should have context.

Example:

Budget Remaining

€1,250

↑ Better than last month

Instead of simply:

€1,250

---

# Mobile

Mobile should be designed separately.

Not simply resized.

Requirements:

Bottom-friendly navigation

Large touch targets

Comfortable spacing

No horizontal scrolling

Responsive charts

Collapsible cards

Sticky actions where appropriate

---

# Accessibility

Minimum touch target:

44px

Keyboard support

Visible focus

ARIA labels

High contrast

Reduced motion support

Colour should never be the only indicator.

---

# Consistency Rules

Never invent a new component if one already exists.

Reuse.

Extend.

Improve.

Consistency is more valuable than novelty.

---

# Final Goal

When someone opens the application, they should immediately think:

"This looks like a real commercial fintech product."

That feeling is more important than adding one more feature.
