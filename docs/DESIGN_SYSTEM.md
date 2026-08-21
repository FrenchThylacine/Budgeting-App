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

**How to check a change.** Do not eyeball it. A script that walks every text node, composites the translucent backgrounds behind it, and computes the real ratio takes minutes to write and is the only way to know; the last sweep covered ten tabs in both themes and reports zero failures. Nudging a grey "a bit lighter" is exactly how the previous value got there.

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

`--duration-fast/normal/slow` with `--ease-out`. Page and tab changes use a short translate-and-fade; the loading screen uses a pulsing brand mark and an indeterminate bar. Everything meaningful is wrapped in `@media (prefers-reduced-motion: reduce)`.

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

The header period control is compact: a three-way Month / Week / Year toggle sits above a single previous / selected period / next row. The selected period is the primary label, while mode and ISO year provide secondary context. On narrow screens the selector becomes full-width, keeps the mode targets equally sized, and preserves usable previous/next targets.

A historical selection is informational, not an error. The main content area receives a subtle dashed warning contour and a status banner; navigation remains outside the contour. Pages should not add duplicate global banners or independently decide whether a period is historical.

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

**Brand marks are not drawn.** Product and company names are trademarks, and a hand-drawn approximation of someone's logo is both worse than their own and misleading about who made it. The picker covers *kinds* of thing, with product names in the search keywords, and a wishlist item that needs a real brand mark gets one from the maker's own site through the separate brand link.

Icons should remain simple.

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
