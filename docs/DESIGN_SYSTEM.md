# DESIGN_SYSTEM.md

> This document defines the visual language of the Budgeting App.
> Every future UI component should follow this design system.

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