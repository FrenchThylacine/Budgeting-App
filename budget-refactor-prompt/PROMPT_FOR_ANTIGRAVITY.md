# PREMIUM UI/UX REFACTOR — Implementation Prompt for Antigravity

## 🎯 Mission
Transform the existing Budgeting App from a generic dashboard into a **premium commercial fintech application** inspired by Apple Wallet, Linear, Notion, and Copilot Money. 

**CRITICAL RULE: DO NOT modify any business logic. Only the presentation layer changes.**

## 📋 What NOT to Touch
- `src/domain/*` — ALL calculation, currency, date, import/export logic stays exactly as-is
- `src/store/budgetStore.ts` — Zustand store, state management, persistence logic
- `src/api/*` — API client and hooks
- `src/storage/*` — IndexedDB storage
- `src/data/seedBudget.ts` — Seed data
- `src/components/ErrorBoundary.tsx` — Keep as-is
- `src/components/Notifications.tsx` — Keep as-is
- `src/main.tsx` — Keep as-is
- `index.html` — Keep as-is
- `package.json` — No new dependencies needed (we use only CSS + existing Lucide + existing Recharts)

## 📁 Files to Create

### 1. NEW FILE: `src/styles.css` (COMPLETE REPLACEMENT)
Replace the ENTIRE existing `src/styles.css` with this new design system:

```css
/* =========================================================
   PREMIUM BUDGET APP — Design System
   Inspired by Apple, Linear, Notion, Copilot Money
   ========================================================= */

:root {
  /* Base */
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: "SF Mono", SFMono-Regular, ui-monospace, monospace;

  /* Colors — Light mode (calm, warm neutrals) */
  --bg: #F5F5F7;
  --bg-elevated: #FFFFFF;
  --bg-subtle: #FAFAFA;
  --bg-inset: #EEEEEF;

  --text-primary: #1D1D1F;
  --text-secondary: #6E6E73;
  --text-tertiary: #A1A1A6;
  --text-inverse: #FFFFFF;

  --border: rgba(0, 0, 0, 0.06);
  --border-strong: rgba(0, 0, 0, 0.1);
  --separator: rgba(0, 0, 0, 0.04);

  /* Accents — muted, professional */
  --accent: #0071E3;
  --accent-soft: rgba(0, 113, 227, 0.08);
  --accent-hover: #0077ED;

  --success: #34C759;
  --success-soft: rgba(52, 199, 89, 0.08);
  --warning: #FF9500;
  --warning-soft: rgba(255, 149, 0, 0.08);
  --danger: #FF3B30;
  --danger-soft: rgba(255, 59, 48, 0.08);
  --purple: #AF52DE;
  --purple-soft: rgba(175, 82, 222, 0.08);
  --teal: #5AC8FA;
  --teal-soft: rgba(90, 200, 250, 0.08);

  /* Shadows — layered, subtle */
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03);
  --shadow-lg: 0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
  --shadow-xl: 0 24px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.06);

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 350ms;

  /* Layout */
  --sidebar-width: 260px;
  --sidebar-collapsed: 72px;
  --header-height: 64px;
}

/* Dark mode — deep, calm */
.dark {
  --bg: #0C0E12;
  --bg-elevated: #16181D;
  --bg-subtle: #12141A;
  --bg-inset: #1C1E24;

  --text-primary: #F5F5F7;
  --text-secondary: #8E8E93;
  --text-tertiary: #636366;

  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.12);
  --separator: rgba(255, 255, 255, 0.05);

  --accent: #0A84FF;
  --accent-soft: rgba(10, 132, 255, 0.12);

  --shadow-xs: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.2);
  --shadow-lg: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
}

/* Scrollbar premium */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-tertiary); }

/* Typography utilities */
.text-display { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.text-headline { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.text-title { font-size: 1.125rem; font-weight: 600; line-height: 1.3; }
.text-body { font-size: 0.9375rem; font-weight: 400; line-height: 1.5; }
.text-callout { font-size: 0.875rem; font-weight: 500; line-height: 1.4; }
.text-caption { font-size: 0.8125rem; font-weight: 500; line-height: 1.4; color: var(--text-secondary); }
.text-footnote { font-size: 0.75rem; font-weight: 500; line-height: 1.4; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }

/* =========================================================
   LAYOUT
   ========================================================= */

.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
  transition: grid-template-columns var(--duration-slow) var(--ease-out);
}

.app-shell.sidebar-collapsed {
  grid-template-columns: var(--sidebar-collapsed) 1fr;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-4);
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  z-index: 10;
}

.main-area {
  min-width: 0;
  padding: var(--space-6) var(--space-8);
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}

/* =========================================================
   COMPONENTS — Cards
   ========================================================= */

.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out);
}

.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-5) var(--space-3);
}

.card-body {
  padding: var(--space-3) var(--space-5) var(--space-5);
}

.card-footer {
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--separator);
  background: var(--bg-subtle);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

/* Metric card — big number style */
.metric-card {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.metric-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.metric-value {
  font-size: clamp(1.5rem, 2.5vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.1;
}

.metric-value.positive { color: var(--success); }
.metric-value.negative { color: var(--danger); }
.metric-value.warning { color: var(--warning); }

.metric-delta {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-top: auto;
  padding-top: var(--space-2);
}

/* =========================================================
   COMPONENTS — Buttons
   ========================================================= */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}

.btn:active { transform: scale(0.97); }

.btn-primary {
  background: var(--accent);
  color: white;
  box-shadow: 0 1px 2px rgba(0,113,227,0.3);
}
.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
  background: var(--bg-inset);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.btn-secondary:hover { background: var(--bg-subtle); border-color: var(--border-strong); }

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}
.btn-ghost:hover { background: var(--bg-subtle); color: var(--text-primary); }

.btn-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.btn-danger:hover { background: rgba(255,59,48,0.15); }

.btn-icon {
  width: 36px;
  padding: 0;
  border-radius: var(--radius-md);
}

.btn-sm { height: 32px; padding: 0 var(--space-3); font-size: 0.8125rem; }
.btn-lg { height: 44px; padding: 0 var(--space-6); font-size: 0.9375rem; }

/* =========================================================
   COMPONENTS — Badges & Pills
   ========================================================= */

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.badge-neutral { background: var(--bg-inset); color: var(--text-secondary); }
.badge-info { background: var(--accent-soft); color: var(--accent); }
.badge-success { background: var(--success-soft); color: var(--success); }
.badge-warning { background: var(--warning-soft); color: var(--warning); }
.badge-danger { background: var(--danger-soft); color: var(--danger); }

/* =========================================================
   COMPONENTS — Progress
   ========================================================= */

.progress-track {
  width: 100%;
  height: 6px;
  background: var(--bg-inset);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width var(--duration-slow) var(--ease-out);
}

.progress-fill.success { background: var(--success); }
.progress-fill.warning { background: var(--warning); }
.progress-fill.danger { background: var(--danger); }

/* Circular progress */
.progress-ring {
  transform: rotate(-90deg);
}
.progress-ring-circle {
  transition: stroke-dashoffset var(--duration-slow) var(--ease-out);
}

/* =========================================================
   COMPONENTS — Forms
   ========================================================= */

.input, .select, .textarea {
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 0.9375rem;
  transition: all var(--duration-fast) var(--ease-out);
  outline: none;
}

.input:focus, .select:focus, .textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.textarea {
  height: auto;
  min-height: 100px;
  padding: var(--space-3);
  resize: vertical;
}

.label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

/* =========================================================
   COMPONENTS — Tables
   ========================================================= */

.table-container {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  position: sticky;
  top: 0;
  background: var(--bg-subtle);
  padding: var(--space-3) var(--space-4);
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.data-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--separator);
  color: var(--text-primary);
  vertical-align: middle;
}

.data-table tr:last-child td { border-bottom: none; }
.data-table tbody tr { transition: background var(--duration-fast); }
.data-table tbody tr:hover { background: var(--bg-subtle); }

/* =========================================================
   COMPONENTS — Modal
   ========================================================= */

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  padding: var(--space-5);
  animation: fadeIn var(--duration-normal) var(--ease-out);
}

.modal {
  width: min(640px, 100%);
  max-height: calc(100vh - var(--space-10));
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
  animation: slideUp var(--duration-normal) var(--ease-out);
}

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* =========================================================
   COMPONENTS — Empty State
   ========================================================= */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-12) var(--space-6);
  text-align: center;
  color: var(--text-secondary);
}

.empty-state-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--bg-subtle);
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}

/* =========================================================
   COMPONENTS — Toast / Notice
   ========================================================= */

.notice-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-6);
  background: var(--accent-soft);
  border: 1px solid rgba(0,113,227,0.15);
  border-radius: var(--radius-md);
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 500;
  animation: slideDown var(--duration-normal) var(--ease-out);
}

@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

/* =========================================================
   LAYOUT — Header
   ========================================================= */

.top-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-6);
  align-items: start;
  margin-bottom: var(--space-8);
}

.period-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.period-nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* =========================================================
   LAYOUT — Navigation
   ========================================================= */

.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent), var(--purple));
  display: grid;
  place-items: center;
  color: white;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-text strong {
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.brand-text span {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-tertiary);
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-section-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  padding: var(--space-3) var(--space-3) var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast);
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
}

.nav-item:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav-item .nav-icon {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.nav-item.active .nav-icon { opacity: 1; }

/* =========================================================
   DASHBOARD — Specific layouts
   ========================================================= */

.dashboard-grid {
  display: grid;
  gap: var(--space-5);
}

.dashboard-hero {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-5);
}

.dashboard-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-5);
}

.dashboard-row-reverse {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--space-5);
}

@media (max-width: 1200px) {
  .dashboard-hero { grid-template-columns: repeat(2, 1fr); }
  .dashboard-row, .dashboard-row-reverse { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .main-area { padding: var(--space-4); }
  .dashboard-hero { grid-template-columns: 1fr; }
  .top-header { grid-template-columns: 1fr; }
}

/* Historical period indicator */
.historical-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  margin-bottom: var(--space-6);
  background: var(--warning-soft);
  border: 1px solid rgba(255,149,0,0.15);
  border-radius: var(--radius-lg);
  color: var(--warning);
  font-size: 0.875rem;
  font-weight: 600;
}

/* Section divider */
.section-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-8) 0 var(--space-5);
}

.section-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--separator);
}

.section-divider-text {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* Budget health score */
.health-score {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: conic-gradient(var(--success) var(--score-deg), var(--bg-inset) var(--score-deg));
  position: relative;
}

.health-score::after {
  content: attr(data-score);
  position: absolute;
  inset: 4px;
  background: var(--bg-elevated);
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.875rem;
  font-weight: 700;
}

/* Activity / Item list */
.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast);
}

.item-row:hover {
  background: var(--bg-inset);
  transform: translateX(2px);
}

/* Quick add bar */
.quick-add-bar {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: var(--space-3);
  align-items: end;
  padding: var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-5);
}

/* Animations */
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }

/* Chart containers */
.chart-container {
  width: 100%;
  height: 280px;
}

/* Mobile bottom nav */
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: none;
  grid-template-columns: repeat(5, 1fr);
  padding: var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom));
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border);
  z-index: 40;
}

.dark .mobile-nav {
  background: rgba(12,14,18,0.85);
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-2);
  color: var(--text-tertiary);
  font-size: 0.625rem;
  font-weight: 600;
  border: none;
  background: transparent;
}

.mobile-nav-item.active { color: var(--accent); }

@media (max-width: 768px) {
  .mobile-nav { display: grid; }
  .main-area { padding-bottom: 80px; }
}

/* Page transitions */
.page-enter {
  animation: pageEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes pageEnter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Stagger children */
.stagger-children > * {
  opacity: 0;
  animation: pageEnter 0.3s ease-out forwards;
}

```

### 2. NEW FILE: `src/utils/formatters.ts`
Extract ALL helper functions from the original `App.tsx` into this file:

```typescript
import type { BudgetSnapshot, Settings, Activity, ActivityDraft, WishlistItem, WishlistDraft, BudgetCategory } from "../domain/types";
import { normalizeAmount, formatMoney } from "../domain/currency";
import { monthName } from "../domain/dates";

export function statusLabel(status: string): string {
  switch (status) {
    case "value": return "Recorded";
    case "zero": return "No spend";
    case "pending": return "Pending";
    case "nan": return "Closed";
    default: return status;
  }
}

interface FormatOptions {
  showSign?: boolean;
  decimals?: number;
}

export function formatDualMoney(
  value: number | null | undefined,
  settings: Settings,
  options: FormatOptions = {}
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = formatMoney(value, settings.baseCurrency, settings.currencyDisplayMode);
  if (options.showSign && value > 0) return `+${formatted}`;
  return formatted;
}

export function isViewingCurrentMonth(settings: Settings): boolean {
  const now = new Date();
  return settings.selectedYear === now.getFullYear() && settings.selectedMonth === now.getMonth() + 1;
}

export function isViewingHistoricalPeriod(settings: Settings): boolean {
  const now = new Date();
  if (settings.selectedYear < now.getFullYear()) return true;
  if (settings.selectedYear === now.getFullYear() && settings.selectedMonth < now.getMonth() + 1) return true;
  return false;
}

export function activityToDraft(activity: Activity | null, snapshot: BudgetSnapshot): ActivityDraft {
  return {
    name: activity?.name ?? "",
    categoryId: activity?.categoryId ?? snapshot.categories[0]?.id ?? "cat-spending",
    currency: activity?.currency ?? snapshot.settings.baseCurrency,
    recurrenceType: activity?.recurrenceType ?? "monthly",
    recurrenceInterval: activity?.recurrenceInterval ?? 1,
    pricePerSession: valueToInput(activity?.pricePerSession),
    pricePerPurchase: valueToInput(activity?.pricePerPurchase),
    pricePerMonth: valueToInput(activity?.pricePerMonth),
    estimatedCost: valueToInput(activity?.estimatedCost),
    yearlyEstimate: valueToInput(activity?.yearlyEstimate),
    active: activity?.active ?? true,
    visible: activity?.visible ?? true,
    seasonalTag: activity?.seasonalTag ?? "",
    notes: activity?.notes ?? "",
  };
}

export function activityPayloadFromDraft(draft: ActivityDraft): Omit<Activity, "id" | "order"> {
  return {
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    currency: draft.currency,
    recurrenceType: draft.recurrenceType,
    recurrenceInterval: draft.recurrenceInterval,
    pricePerSession: parseAmount(draft.pricePerSession),
    pricePerPurchase: parseAmount(draft.pricePerPurchase),
    pricePerMonth: parseAmount(draft.pricePerMonth),
    estimatedCost: parseAmount(draft.estimatedCost),
    yearlyEstimate: parseAmount(draft.yearlyEstimate),
    active: draft.active,
    visible: draft.visible,
    seasonalTag: draft.seasonalTag,
    notes: draft.notes,
  };
}

export function wishlistToDraft(item: WishlistItem | null): WishlistDraft {
  return {
    name: item?.name ?? "",
    categoryId: item?.categoryId ?? "",
    actualPrice: valueToInput(item?.actualPrice),
    currency: item?.currency ?? "EUR",
    priority: item?.priority ?? "medium",
    notes: item?.notes ?? "",
    inWishlist: item?.inWishlist ?? true,
    active: item?.active ?? true,
  };
}

export function valueToInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

export function parseAmount(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const parsed = typeof input === "string" ? parseFloat(input.replace(/,/g, "")) : input;
  return Number.isFinite(parsed) ? parsed : null;
}

export function activityPrimaryCostLabel(activity: Activity): string {
  if (activity.pricePerMonth != null) return "/month";
  if (activity.pricePerSession != null) return "/session";
  if (activity.pricePerPurchase != null) return "/purchase";
  if (activity.yearlyEstimate != null) return "/year";
  if (activity.estimatedCost != null) return "estimated";
  return "";
}

export function activityPrimaryCost(activity: Activity, snapshot: BudgetSnapshot): string {
  const val =
    activity.pricePerMonth ??
    activity.pricePerSession ??
    activity.pricePerPurchase ??
    activity.yearlyEstimate ??
    activity.estimatedCost ??
    0;
  return formatMoney(val, activity.currency, snapshot.settings.currencyDisplayMode);
}

export function matchesActivityFilters(activity: Activity, filters: { search?: string; categoryId?: string }): boolean {
  if (filters.search && !activity.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && activity.categoryId !== filters.categoryId) return false;
  return true;
}

export function matchesEntryFilters(entry: { note?: string; categoryId?: string; activityId?: string }, filters: { search?: string; categoryId?: string; activityId?: string }): boolean {
  if (filters.search && !(entry.note ?? "").toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && entry.categoryId !== filters.categoryId) return false;
  if (filters.activityId && entry.activityId !== filters.activityId) return false;
  return true;
}

export function matchesWishlistFilters(item: WishlistItem, filters: { search?: string; categoryId?: string }): boolean {
  if (filters.search && !item.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.categoryId && item.categoryId !== filters.categoryId) return false;
  return true;
}

export function wishlistViewMatches(item: WishlistItem, view: "all" | "active" | "bought"): boolean {
  if (view === "active") return item.active && item.inWishlist && !item.bought;
  if (view === "bought") return item.bought;
  return true;
}

export function priorityRank(p: string): number {
  const map: Record<string, number> = { low: 1, medium: 2, high: 3, dream: 4 };
  return map[p] ?? 0;
}

export function sortActivities(
  a: Activity,
  b: Activity,
  sortBy: "order" | "name" | "cost",
  estimateMap: Map<string, { monthlyBase: number }>
): number {
  if (sortBy === "order") return a.order - b.order;
  if (sortBy === "name") return a.name.localeCompare(b.name);
  const ea = estimateMap.get(a.id)?.monthlyBase ?? 0;
  const eb = estimateMap.get(b.id)?.monthlyBase ?? 0;
  return eb - ea;
}

export function getCategoryIcon(category: BudgetCategory): string {
  return category.icon ?? "Circle";
}

export function getCategoryColor(category: BudgetCategory): string {
  return category.color ?? "#64748B";
}

```

### 3. NEW FILES: `src/components/ui/*` — Design System Atoms
Create these 7 UI primitive components:

**`src/components/ui/Card.tsx`**
```tsx
import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, className = "", hover = false, onClick, style }) => (
  <div className={`card ${hover ? "card-hover" : ""} ${className}`} onClick={onClick} style={style}>
    {children}
  </div>
);

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`card-header ${className}`}>{children}</div>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`card-body ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`card-footer ${className}`}>{children}</div>
);

```

**`src/components/ui/Metric.tsx`**
```tsx
import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricProps {
  label: string;
  value: string | number;
  prefix?: React.ReactNode;
  delta?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  detail?: string;
  children?: React.ReactNode;
}

export const Metric: React.FC<MetricProps> = ({ label, value, prefix, delta, tone = "neutral", detail, children }) => {
  const toneClass = tone === "positive" ? "positive" : tone === "negative" ? "negative" : tone === "warning" ? "warning" : "";
  return (
    <div className="metric-card card">
      <div className="metric-label">
        {prefix}
        {label}
      </div>
      <div className={`metric-value ${toneClass}`}>{value}</div>
      {delta && (
        <div className="metric-delta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {tone === "positive" ? <TrendingUp size={14} /> : tone === "negative" ? <TrendingDown size={14} /> : <Minus size={14} />}
          {delta}
        </div>
      )}
      {detail && <div className="metric-delta">{detail}</div>}
      {children}
    </div>
  );
};

```

**`src/components/ui/Badge.tsx`**
```tsx
import React from "react";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, tone = "neutral", className = "" }) => (
  <span className={`badge badge-${tone} ${className}`}>{children}</span>
);

```

**`src/components/ui/Progress.tsx`**
```tsx
import React from "react";

interface ProgressProps {
  value: number;
  max?: number;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, max = 100, tone = "neutral", className = "" }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`progress-track ${className}`}>
      <div className={`progress-fill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export const CircularProgress: React.FC<{ value: number; size?: number; stroke?: number; tone?: string }> = ({
  value,
  size = 64,
  stroke = 5,
  tone = "var(--accent)",
}) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        stroke="var(--bg-inset)"
        strokeWidth={stroke}
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="progress-ring-circle"
        stroke={tone}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
      />
    </svg>
  );
};

```

**`src/components/ui/Section.tsx`**
```tsx
import React from "react";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, children, className = "", action }) => (
  <section className={className}>
    {title && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="text-title">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);

```

**`src/components/ui/EmptyState.tsx`**
```tsx
import React from "react";
import { Package } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon || <Package size={24} />}</div>
    <div className="text-callout" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{title}</div>
    {description && <div className="text-caption" style={{ maxWidth: 320 }}>{description}</div>}
    {action && <div style={{ marginTop: 8 }}>{action}</div>}
  </div>
);

```

**`src/components/ui/Button.tsx`**
```tsx
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = "secondary", 
  size = "md", 
  icon = false,
  children, 
  className = "",
  ...props 
}) => {
  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  const iconClass = icon ? "btn-icon" : "";
  return (
    <button className={`btn btn-${variant} ${sizeClass} ${iconClass} ${className}`} {...props}>
      {children}
    </button>
  );
};

```

### 4. NEW FILES: `src/components/layout/*`

**`src/components/layout/Sidebar.tsx`**
```tsx
import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import {
  LayoutDashboard, ListTodo, Receipt, Gift, Wallet, BarChart3,
  FlaskConical, History, Settings, Tags, ChevronLeft, ChevronRight,
  Plane, FileSpreadsheet, Download, FileJson, RefreshCw
} from "lucide-react";
import { exportCurrentYearToExcel, exportAllYearsToExcel, exportJson } from "../../domain/importExport";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const navItems: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "activities", label: "Activities", icon: ListTodo },
  { key: "spending", label: "Spending", icon: Receipt },
  { key: "wishlist", label: "Wishlist", icon: Gift },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "scenarios", label: "Scenarios", icon: FlaskConical },
  { key: "history", label: "History", icon: History },
  { key: "categories", label: "Categories", icon: Tags },
  { key: "settings", label: "Settings", icon: Settings },
];

export const Sidebar: React.FC<{
  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const resetToSeed = useBudgetStore((s) => s.resetToSeed);

  const overviewItems = navItems.slice(0, 6);
  const systemItems = navItems.slice(6);

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="nav-brand">
        <div className="brand-icon">
          <Plane size={20} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="brand-text">
            <strong>Budget OS</strong>
            <span>Personal Finance</span>
          </div>
        )}
        <button
          className="btn btn-ghost btn-icon"
          style={{ marginLeft: "auto" }}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">Overview</div>}
        {overviewItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? item.label : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <nav className="nav-section">
        {!collapsed && <div className="nav-section-title">System</div>}
        {systemItems.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activeTab === item.key ? "active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={collapsed ? item.label : undefined}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="nav-section" style={{ marginTop: "auto" }}>
          <div className="nav-section-title">Data</div>
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportCurrentYearToExcel(snapshot)}>
              <FileSpreadsheet size={14} /> Export Year
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportAllYearsToExcel(snapshot)}>
              <Download size={14} /> Export All
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportJson(snapshot)}>
              <FileJson size={14} /> Backup JSON
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (window.confirm("Reset all data to seed budget? This cannot be undone.")) void resetToSeed();
              }}
            >
              <RefreshCw size={14} /> Reset
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

```

**`src/components/layout/MobileNav.tsx`**
```tsx
import React from "react";
import { LayoutDashboard, Receipt, Wallet, BarChart3, Settings } from "lucide-react";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const mobileTabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "spending", label: "Spend", icon: Receipt },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "analytics", label: "Stats", icon: BarChart3 },
  { key: "settings", label: "More", icon: Settings },
];

export const MobileNav: React.FC<{ activeTab: TabKey; setActiveTab: (t: TabKey) => void }> = ({ activeTab, setActiveTab }) => (
  <nav className="mobile-nav" aria-label="Mobile navigation">
    {mobileTabs.map((t) => (
      <button
        key={t.key}
        className={`mobile-nav-item ${activeTab === t.key ? "active" : ""}`}
        onClick={() => setActiveTab(t.key)}
        aria-current={activeTab === t.key ? "page" : undefined}
      >
        <t.icon size={20} />
        <span>{t.label}</span>
      </button>
    ))}
  </nav>
);

```

**`src/components/layout/Header.tsx`**
```tsx
import React from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear } from "../../domain/calculations";
import { monthName, weeksInIsoYear } from "../../domain/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  ChevronLeft, ChevronRight, Sun, Moon, Undo2, Redo2, Save, Wallet,
  Calendar, Clock
} from "lucide-react";
import type { BudgetCalculation } from "../../domain/types";

export const Header: React.FC<{
  calculation: BudgetCalculation;
  setRolloverOpen: (v: boolean) => void;
}> = ({ calculation, setRolloverOpen }) => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const selectYear = useBudgetStore((s) => s.selectYear);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);

  const currentYear = snapshot.settings.selectedYear;
  const maxWeeks = weeksInIsoYear(currentYear);
  const yearOptions = Array.from(
    new Set([currentYear - 1, currentYear, currentYear + 1, 2026, 2027, 2028, 2029, 2030, ...Object.keys(snapshot.years).map(Number)])
  ).sort((a, b) => a - b);

  const latestAudit = snapshot.auditLog[0];

  function moveMonth(delta: number) {
    let nextMonth = snapshot.settings.selectedMonth + delta;
    let nextYear = currentYear;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedMonth: nextMonth });
  }

  function moveWeek(delta: number) {
    let nextWeek = snapshot.settings.selectedWeek + delta;
    let nextYear = currentYear;
    if (nextWeek < 1) { nextYear -= 1; nextWeek = weeksInIsoYear(nextYear); }
    if (nextWeek > maxWeeks) { nextYear += 1; nextWeek = 1; }
    if (nextYear !== currentYear) selectYear(nextYear);
    updateSettings({ selectedWeek: nextWeek });
  }

  const status = calculation.selectedMonthSpend.status;
  const statusTone = status === "nan" ? "danger" : status === "pending" ? "warning" : "success";

  return (
    <header className="top-header">
      <div>
        <div className="text-footnote" style={{ marginBottom: 4 }}>Current Period</div>
        <h1 className="text-display" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          {monthName(calculation.month)} {calculation.year}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={statusTone}>{status === "value" ? "Active" : status === "zero" ? "No Spend" : status === "pending" ? "Pending" : "Closed"}</Badge>
          <span className="text-caption">Week {calculation.week}{snapshot.settings.selectedSeason ? ` · ${snapshot.settings.selectedSeason}` : ""}</span>
        </div>
        {latestAudit && (
          <div className="text-caption" style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} /> Last: {latestAudit.summary}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
        <div className="period-nav">
          <Button variant="ghost" icon onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </Button>
          <select
            className="select"
            style={{ width: "auto", minWidth: 120 }}
            value={snapshot.settings.selectedMonth}
            onChange={(e) => updateSettings({ selectedMonth: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>
            ))}
          </select>
          <Button variant="ghost" icon onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </Button>

          <select
            className="select"
            style={{ width: "auto", minWidth: 80 }}
            value={currentYear}
            onChange={(e) => selectYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <Button variant="ghost" icon onClick={() => moveWeek(-1)} aria-label="Previous week">
            <ChevronLeft size={18} />
          </Button>
          <span className="text-caption" style={{ minWidth: 60, textAlign: "center" }}>W{snapshot.settings.selectedWeek}</span>
          <Button variant="ghost" icon onClick={() => moveWeek(1)} aria-label="Next week">
            <ChevronRight size={18} />
          </Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" icon onClick={() => updateSettings({ darkMode: !snapshot.settings.darkMode })} title="Toggle theme">
            {snapshot.settings.darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Button variant="ghost" icon onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 size={17} />
          </Button>
          <Button variant="ghost" icon onClick={redo} title="Redo (Ctrl+Y)">
            <Redo2 size={17} />
          </Button>
          <Button variant="secondary" onClick={() => updateSettings({ lastUpdated: new Date().toISOString() })}>
            <Save size={16} /> Save
          </Button>
          <Button variant="primary" onClick={() => setRolloverOpen(true)}>
            <Wallet size={16} /> Close Month
          </Button>
        </div>
      </div>
    </header>
  );
};

```

### 5. NEW FILE: `src/components/dashboard/Dashboard.tsx`
This is the NEW dashboard with premium cards, health score, and analytics:

```tsx
import React, { useMemo } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { calculateYear, calculateSuggestedMonthlyBudget } from "../../domain/calculations";
import { isViewingCurrentMonth, isViewingHistoricalPeriod } from "../../utils/formatters";
import { formatDualMoney } from "../../utils/formatters";
import { Metric } from "../ui/Metric";
import { Progress, CircularProgress } from "../ui/Progress";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { Section } from "../ui/Section";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";
import {
  Wallet, Zap, PiggyBank, AlertCircle, ArrowRight, Calendar,
  TrendingUp, TrendingDown, Activity, CreditCard, BarChart3
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const snapshot = useBudgetStore((state) => state.snapshot);
  const recordBudgetApproval = useBudgetStore((state) => state.recordBudgetApproval);
  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const suggestion = useMemo(() => calculateSuggestedMonthlyBudget(snapshot), [snapshot]);

  const isHistorical = isViewingHistoricalPeriod(snapshot.settings);
  const isCurrent = isViewingCurrentMonth(snapshot.settings);

  const spent = calculation.selectedMonthSpend.total ?? 0;
  const budget = calculation.monthlyBudgetBase;
  const remaining = calculation.delta ?? 0;
  const progress = budget > 0 ? (spent / budget) * 100 : 0;

  const healthScore = useMemo(() => {
    if (budget <= 0) return 0;
    const ratio = remaining / budget;
    if (ratio > 0.3) return Math.min(100, 70 + ratio * 30);
    if (ratio > 0) return Math.min(70, 30 + ratio * 130);
    return Math.max(0, 30 + ratio * 30);
  }, [remaining, budget]);

  const healthTone = healthScore > 70 ? "success" : healthScore > 30 ? "warning" : "danger";
  const healthMessage =
    healthScore > 70 ? "Excellent — spending is well controlled" :
    healthScore > 30 ? "Caution — monitor your spending" :
    "Critical — immediate action recommended";

  const existingApproval = snapshot.budgetApprovals.find(
    (a) => a.year === snapshot.settings.selectedYear && a.month === snapshot.settings.selectedMonth
  );

  const handleApproveBudget = (status: "approved" | "rejected") => {
    recordBudgetApproval({
      year: snapshot.settings.selectedYear,
      month: snapshot.settings.selectedMonth,
      suggestedAmount: suggestion.suggestedAmount,
      approvedAmount: status === "approved" ? suggestion.suggestedAmount : null,
      currency: snapshot.settings.baseCurrency,
      status,
      recurringTotal: suggestion.recurringTotal,
      note: status === "approved" ? "Approved from dashboard" : "Rejected from dashboard",
    });
  };

  return (
    <div className="dashboard-grid page-enter">
      {/* Historical Banner */}
      {isHistorical && (
        <div className="historical-banner">
          <AlertCircle size={18} />
          <span>You are viewing a historical period. Data is read-only.</span>
        </div>
      )}

      {/* HERO: 3 main metrics */}
      <div className="dashboard-hero">
        <Metric
          label="Current Budget"
          value={formatDualMoney(budget, snapshot.settings)}
          tone="neutral"
          detail="Approved monthly budget"
          prefix={<Wallet size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label="Remaining"
          value={formatDualMoney(remaining, snapshot.settings, { showSign: true })}
          tone={remaining < 0 ? "negative" : remaining < budget * 0.2 ? "warning" : "positive"}
          detail={remaining < 0 ? "Over budget" : `${Math.round((remaining / budget) * 100)}% left`}
          prefix={<PiggyBank size={16} style={{ opacity: 0.6 }} />}
        />
        <Metric
          label="Monthly Spending"
          value={formatDualMoney(spent, snapshot.settings)}
          tone="neutral"
          detail={`${calculation.selectedMonthSpend.entryCount} transactions`}
          prefix={<Zap size={16} style={{ opacity: 0.6 }} />}
        />
      </div>

      {/* SECOND ROW: Health + Side cards */}
      <div className="dashboard-row">
        <Card>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <CircularProgress
                  value={healthScore}
                  size={72}
                  stroke={6}
                  tone={`var(--${healthTone})`}
                />
                <div style={{
                  position: "absolute", inset: 0, display: "grid", placeItems: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: `var(--${healthTone})`
                }}>
                  {Math.round(healthScore)}
                </div>
              </div>
              <div>
                <div className="text-title">Budget Health</div>
                <div className="text-caption" style={{ marginTop: 4 }}>{healthMessage}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="text-caption">Budget used</span>
                  <span className="text-callout" style={{ fontWeight: 600 }}>{Math.round(progress)}%</span>
                </div>
                <Progress
                  value={spent}
                  max={budget}
                  tone={progress > 100 ? "danger" : progress > 80 ? "warning" : "success"}
                />
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                padding: 12, background: "var(--bg-subtle)", borderRadius: 12, marginTop: 4
              }}>
                <div>
                  <div className="text-footnote">General</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.generalBudget, snapshot.settings)}
                  </div>
                </div>
                <div>
                  <div className="text-footnote">Piloting</div>
                  <div className="text-callout" style={{ fontWeight: 600, marginTop: 2 }}>
                    {formatDualMoney(calculation.pilotingBudget, snapshot.settings)}
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <CreditCard size={14} /> Savings & Wallet
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.wallet.personalWalletTotal, snapshot.settings)}
              </div>
              <div className="text-caption">Personal wallet balance</div>
              {calculation.wallet.rolloverTotal !== 0 && (
                <div className="text-caption" style={{ marginTop: 4 }}>
                  Rollover: {formatDualMoney(calculation.wallet.rolloverTotal, snapshot.settings, { showSign: true })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={14} /> Recurring Costs
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.generalBudget, snapshot.settings)}
              </div>
              <div className="text-caption">{calculation.activityEstimates.length} active activities</div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="text-footnote" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <BarChart3 size={14} /> YTD Spending
              </div>
              <div className="text-headline" style={{ marginBottom: 4 }}>
                {formatDualMoney(calculation.ytdTotal, snapshot.settings)}
              </div>
              <div className="text-caption">Year to date total</div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Budget Suggestion */}
      {isCurrent && !existingApproval && (
        <Card style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <CardBody>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 16
            }}>
              <div>
                <div className="text-title">Suggested Monthly Budget</div>
                <div className="text-caption" style={{ marginTop: 4 }}>
                  Based on {calculation.activityEstimates.filter(a => a.activity.active && a.activity.visible).length} active recurring expenses
                  {suggestion.recurringTotal > 0 && ` · Total recurring: ${formatDualMoney(suggestion.recurringTotal, snapshot.settings)}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="text-headline">{formatDualMoney(suggestion.suggestedAmount, snapshot.settings)}</div>
                <Button variant="primary" onClick={() => handleApproveBudget("approved")}>
                  Approve <ArrowRight size={16} />
                </Button>
                <Button variant="ghost" onClick={() => handleApproveBudget("rejected")}>
                  Skip
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {existingApproval && (
        <Card>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="text-title">
                  {existingApproval.status === "approved" ? "Budget Approved" : "Budget Suggestion Rejected"}
                </div>
                <div className="text-caption" style={{ marginTop: 4 }}>
                  {monthName(existingApproval.month)} {existingApproval.year} · Suggested: {formatDualMoney(existingApproval.suggestedAmount, snapshot.settings)}
                </div>
              </div>
              <Badge tone={existingApproval.status === "approved" ? "success" : "neutral"}>
                {existingApproval.status === "approved" ? "Approved" : "Rejected"}
              </Badge>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ANALYTICS SECTION */}
      <div className="section-divider">
        <span className="section-divider-text">Analytics</span>
      </div>

      <div className="dashboard-row">
        <Card>
          <CardBody>
            <div className="text-footnote" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp size={14} /> Monthly Trend
            </div>
            <MonthlyTrendChart data={calculation.monthlyTrend} settings={snapshot.settings} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-footnote" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingDown size={14} /> Category Breakdown
            </div>
            {calculation.categoryTotals.length === 0 ? (
              <EmptyState
                title="No spending yet"
                description="Add transactions to see your category breakdown"
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {calculation.categoryTotals.slice(0, 6).map((cat) => {
                  const maxTotal = calculation.categoryTotals[0].total || 1;
                  return (
                    <div key={cat.categoryId}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                        <span className="text-callout" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: "50%", background: cat.color,
                            display: "inline-block", flexShrink: 0
                          }} />
                          {cat.categoryName}
                        </span>
                        <span className="text-callout" style={{ fontWeight: 600 }}>
                          {formatDualMoney(cat.total, snapshot.settings)}
                        </span>
                      </div>
                      <Progress value={cat.total} max={maxTotal} tone="neutral" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* UPCOMING RECURRING */}
      <div className="section-divider">
        <span className="section-divider-text">Upcoming Recurring</span>
      </div>

      <div className="item-list stagger-children">
        {calculation.activityEstimates
          .filter((est) => est.activity.active && est.activity.visible)
          .slice(0, 6)
          .map((est, i) => (
            <div key={est.activity.id} className="item-row" style={{ animationDelay: `${i * 50}ms` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: "var(--bg-inset)",
                  display: "grid", placeItems: "center"
                }}>
                  <Calendar size={16} style={{ color: "var(--text-tertiary)" }} />
                </div>
                <div>
                  <div className="text-callout" style={{ fontWeight: 600 }}>{est.activity.name}</div>
                  <div className="text-footnote">
                    {est.activity.recurrenceType} · Every {est.activity.recurrenceInterval}x
                    {est.activity.seasonalTag ? ` · ${est.activity.seasonalTag}` : ""}
                  </div>
                </div>
              </div>
              <div className="text-callout" style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                {formatDualMoney(est.monthlyBase, snapshot.settings)}
                <span className="text-footnote" style={{ marginLeft: 4 }}>/mo</span>
              </div>
            </div>
          ))}
        {calculation.activityEstimates.filter((e) => e.activity.active && e.activity.visible).length === 0 && (
          <EmptyState title="No active activities" description="Add recurring activities to track your budget" />
        )}
      </div>

      {/* WEEKLY TREND MINI */}
      <div className="section-divider">
        <span className="section-divider-text">Weekly Overview</span>
      </div>

      <Card>
        <CardBody>
          <WeeklyTrendChart data={calculation.weeklyTrend} settings={snapshot.settings} currentWeek={calculation.week} />
        </CardBody>
      </Card>
    </div>
  );
};

/* Simple bar chart using divs - no external lib needed for basic viz */
function MonthlyTrendChart({ data, settings }: { data: Array<{ label: string; total: number | null; status: string }>; settings: any }) {
  const values = data.map((d) => d.total ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div className="chart-container" style={{ display: "flex", alignItems: "flex-end", gap: 6, paddingTop: 20 }}>
      {data.map((d, i) => {
        const pct = (values[i] / max) * 100;
        const isCurrent = d.status !== "nan" && d.status !== "pending";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: "100%", height: `${pct}%`, minHeight: 4, maxHeight: "100%",
              background: isCurrent ? "var(--accent)" : "var(--bg-inset)",
              borderRadius: "4px 4px 0 0", transition: "height 0.5s ease-out", opacity: isCurrent ? 1 : 0.4
            }} />
            <span className="text-footnote" style={{ fontSize: "0.625rem" }}>{d.label.slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyTrendChart({ data, settings, currentWeek }: { data: Array<{ label: string; total: number | null }>; settings: any; currentWeek: number }) {
  const values = data.map((d) => d.total ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, paddingTop: 10 }}>
      {data.slice(0, Math.min(data.length, 12)).map((d, i) => {
        const pct = (values[i] / max) * 100;
        const isCurrent = i + 1 === currentWeek;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: "100%", height: `${pct}%`, minHeight: 2,
              background: isCurrent ? "var(--accent)" : "var(--bg-inset)",
              borderRadius: 3, transition: "height 0.5s ease-out"
            }} />
            <span className="text-footnote" style={{ fontSize: "0.6rem" }}>W{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

```

### 6. NEW FILES: Page Placeholders (to be filled with original logic)
Create these files. They currently contain placeholders — you must migrate the FULL logic from the original `App.tsx` into each one, adapting the JSX to use the new design system classes (`.card`, `.btn`, `.data-table`, `.metric-card`, etc.):

- `src/components/activity/ActivityPanel.tsx`
- `src/components/spending/SpendingPanel.tsx`
- `src/components/wishlist/WishlistPanel.tsx`
- `src/components/wallet/WalletPanel.tsx`
- `src/components/analytics/AnalyticsPanel.tsx`
- `src/components/scenarios/ScenarioLab.tsx`
- `src/components/history/HistoryPanel.tsx`
- `src/components/settings/SettingsPanel.tsx`
- `src/components/categories/CategoryManager.tsx`

### 7. NEW FILES: Modals
- `src/components/modals/RolloverDialog.tsx`
- `src/components/modals/ActivityEditor.tsx`
- `src/components/modals/WishlistEditor.tsx`

## 📄 File to Replace: `src/App.tsx`
Replace the entire `src/App.tsx` with this lightweight shell:

```tsx
import React, { useState, useMemo, useEffect } from "react";
import { useBudgetStore } from "./store/budgetStore";
import { calculateYear } from "./domain/calculations";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileNav } from "./components/layout/MobileNav";
import { Header } from "./components/layout/Header";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ActivityPanel } from "./components/activity/ActivityPanel";
import { SpendingPanel } from "./components/spending/SpendingPanel";
import { WishlistPanel } from "./components/wishlist/WishlistPanel";
import { WalletPanel } from "./components/wallet/WalletPanel";
import { AnalyticsPanel } from "./components/analytics/AnalyticsPanel";
import { ScenarioLab } from "./components/scenarios/ScenarioLab";
import { HistoryPanel } from "./components/history/HistoryPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { CategoryManager } from "./components/categories/CategoryManager";
import { RolloverDialog } from "./components/modals/RolloverDialog";
import { Notifications } from "./components/Notifications";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isViewingHistoricalPeriod } from "./utils/formatters";

type TabKey = "dashboard" | "activities" | "spending" | "wishlist" | "wallet" | "analytics" | "scenarios" | "history" | "settings" | "categories";

const SIDEBAR_PREF_KEY = "sidebar-collapsed";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) === "true"; } catch { return false; }
  });
  const [notice, setNotice] = useState("");
  const [rolloverOpen, setRolloverOpen] = useState(false);

  const snapshot = useBudgetStore((s) => s.snapshot);
  const hydrated = useBudgetStore((s) => s.hydrated);
  const hydrate = useBudgetStore((s) => s.hydrate);

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarCollapsed)); } catch { /* noop */ }
  }, [sidebarCollapsed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        // undo handled by buttons
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!hydrated) {
    return (
      <div style={{
        display: "grid", placeItems: "center", height: "100vh", color: "var(--text-secondary)", background: "var(--bg)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="brand-icon" style={{ width: 56, height: 56 }}>
            <span style={{ fontSize: 28 }}>✈</span>
          </div>
          <div className="text-callout">Loading your finances...</div>
        </div>
      </div>
    );
  }

  const tabs: Record<TabKey, React.ReactNode> = {
    dashboard: <Dashboard />,
    activities: <ActivityPanel />,
    spending: <SpendingPanel />,
    wishlist: <WishlistPanel />,
    wallet: <WalletPanel />,
    analytics: <AnalyticsPanel />,
    scenarios: <ScenarioLab />,
    history: <HistoryPanel />,
    settings: <SettingsPanel />,
    categories: <CategoryManager />,
  };

  const isHistorical = isViewingHistoricalPeriod(snapshot.settings);

  return (
    <ErrorBoundary>
      <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${snapshot.settings.darkMode ? "dark" : ""}`}>
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        <main className={`main-area ${isHistorical ? "historical-period" : ""}`}>
          {notice && (
            <div className="notice-bar">
              <span>{notice}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}

          <Header calculation={calculation} setRolloverOpen={setRolloverOpen} />

          {tabs[activeTab]}
        </main>

        <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {rolloverOpen && (
          <RolloverDialog
            onClose={() => setRolloverOpen(false)}
            calculation={calculation}
          />
        )}

        <Notifications />
      </div>
    </ErrorBoundary>
  );
}

```

## 🔧 Migration Strategy for Each Page Component

For each of the 9 page components above, follow this process:

1. **Copy the original component function** from the old `App.tsx` (e.g., `function ActivityPanel(...)`)
2. **Move it** to the new file (e.g., `src/components/activity/ActivityPanel.tsx`)
3. **Update imports** — replace relative imports from within App.tsx with proper imports from `../../store/budgetStore`, `../../domain/calculations`, `../../utils/formatters`, etc.
4. **Replace CSS classes** using this mapping:
   - `.summary-card` → `.metric-card` or `.card` + `.card-body`
   - `.primary-button` → `.btn.btn-primary`
   - `.command-button`, `.soft-button` → `.btn.btn-secondary`
   - `.icon-button` → `.btn.btn-ghost.btn-icon`
   - `.danger-soft` → `.btn.btn-danger`
   - `.data-table` → keep `.data-table` but inside `.table-container`
   - `.modal` → keep `.modal` but inside `.modal-backdrop`
   - `.empty-state` → use `<EmptyState />` component or keep `.empty-state`
   - `.badge.*` → use `<Badge tone="...">` component
   - `.progress-track` → use `<Progress />` component
   - `.editor-form` → keep but ensure inputs use `.input`, `.select`, `.textarea`, `.label`
   - `.activity-card`, `.wishlist-card`, `.settings-card`, `.chart-panel`, `.history-card` → `.card` + `.card-body`
   - `.section-toolbar` → use `<Section title="...">` component or custom flex layout
   - `.quick-add`, `.spending-add` → `.quick-add-bar`
   - `.budget-suggestion` → `.card` with inline border style
   - `.notice` → `.notice-bar`
   - `.historical-label` → `.historical-banner`
5. **Remove any inline styles** that conflict with the design system, keep only structural ones (grid, flex, gap)
6. **Ensure all `useBudgetStore` hooks** use the correct import path
7. **Ensure all domain imports** use the correct import path

## 🎨 Design System Quick Reference

### Colors (semantic)
- Success: `#34C759` (green)
- Warning: `#FF9500` (orange)
- Danger: `#FF3B30` (red)
- Accent: `#0071E3` (blue)
- Purple: `#AF52DE`
- Teal: `#5AC8FA`

### Spacing
Use the CSS custom property scale: `--space-1` (4px) through `--space-12` (48px)

### Cards
```tsx
<Card>
  <CardBody>...</CardBody>
</Card>
```
Add `hover` prop for interactive cards: `<Card hover>`

### Buttons
```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost" icon><Icon /></Button>
<Button variant="danger">Delete</Button>
```

### Badges
```tsx
<Badge tone="success">Active</Badge>
<Badge tone="warning">Pending</Badge>
<Badge tone="danger">Overdue</Badge>
<Badge tone="info">New</Badge>
<Badge tone="neutral">Draft</Badge>
```

### Progress
```tsx
<Progress value={spent} max={budget} tone="success" />
```

### Metrics
```tsx
<Metric
  label="Remaining"
  value={formatDualMoney(remaining, settings)}
  tone={remaining < 0 ? "negative" : "positive"}
  detail="23% left"
  prefix={<Icon />}
/>
```

## 📱 Responsive Breakpoints
- **> 1200px**: Full sidebar (260px), Dashboard 3-col hero, 2-col rows
- **768-1200px**: Collapsed sidebar (72px), Dashboard 2-col hero, 1-col rows
- **< 768px**: Hidden sidebar, Mobile bottom nav appears, single column everything

## ✅ Checklist Before Committing

- [ ] `src/styles.css` is completely replaced with the new design system
- [ ] All new UI components exist in `src/components/ui/`
- [ ] All new layout components exist in `src/components/layout/`
- [ ] `src/components/dashboard/Dashboard.tsx` is fully implemented with health score, metrics, charts, recurring list
- [ ] `src/App.tsx` is the new lightweight shell (under 200 lines)
- [ ] All 9 page components are migrated from old App.tsx with full logic preserved
- [ ] All 3 modals are migrated from old App.tsx
- [ ] `src/utils/formatters.ts` contains all extracted helper functions
- [ ] No business logic was modified in `src/domain/`, `src/store/`, `src/api/`, `src/storage/`
- [ ] Dark mode works (toggle the `.dark` class on the shell)
- [ ] Mobile bottom nav appears below 768px
- [ ] Sidebar collapses correctly
- [ ] No TypeScript errors
- [ ] All original features still work (add/edit/delete for activities, spending, wishlist, wallet, etc.)

## 🆘 If Something Breaks

1. **Check imports first** — the new file structure means import paths changed
2. **Check CSS classes** — old classes like `.primary-button` no longer exist; use `.btn.btn-primary`
3. **Check that `useBudgetStore` is imported** from `../../store/budgetStore` (not relative to old location)
4. **The original `App.tsx` logic is your source of truth** — copy functions verbatim, only change the JSX/presentation

---

## 📦 File Tree After Refactor

```
src/
├── App.tsx                          # NEW — lightweight shell
├── main.tsx                         # UNCHANGED
├── styles.css                       # NEW — complete design system
├── vite-env.d.ts                    # UNCHANGED
├── domain/                          # UNCHANGED
│   ├── calculations.ts
│   ├── currency.ts
│   ├── dates.ts
│   ├── importExport.ts
│   ├── types.ts
│   └── types.d.ts
├── store/                           # UNCHANGED
│   └── budgetStore.ts
├── api/                             # UNCHANGED
│   ├── client.ts
│   └── hooks.ts
├── storage/                         # UNCHANGED
│   └── idb.ts
├── data/                            # UNCHANGED
│   └── seedBudget.ts
├── utils/                           # NEW
│   └── formatters.ts                # Extracted from old App.tsx
├── components/
│   ├── ui/                          # NEW — design system atoms
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Progress.tsx
│   │   ├── Metric.tsx
│   │   ├── Section.tsx
│   │   └── EmptyState.tsx
│   ├── layout/                      # NEW
│   │   ├── Sidebar.tsx
│   │   ├── MobileNav.tsx
│   │   └── Header.tsx
│   ├── dashboard/                   # NEW
│   │   └── Dashboard.tsx
│   ├── activity/                    # MIGRATED from App.tsx
│   │   └── ActivityPanel.tsx
│   ├── spending/                    # MIGRATED from App.tsx
│   │   └── SpendingPanel.tsx
│   ├── wishlist/                    # MIGRATED from App.tsx
│   │   └── WishlistPanel.tsx
│   ├── wallet/                      # MIGRATED from App.tsx
│   │   └── WalletPanel.tsx
│   ├── analytics/                   # MIGRATED from App.tsx
│   │   └── AnalyticsPanel.tsx
│   ├── scenarios/                   # MIGRATED from App.tsx
│   │   └── ScenarioLab.tsx
│   ├── history/                     # MIGRATED from App.tsx
│   │   └── HistoryPanel.tsx
│   ├── settings/                    # MIGRATED from App.tsx
│   │   └── SettingsPanel.tsx
│   ├── categories/                  # MIGRATED from App.tsx
│   │   └── CategoryManager.tsx
│   ├── modals/                      # MIGRATED from App.tsx
│   │   ├── RolloverDialog.tsx
│   │   ├── ActivityEditor.tsx
│   │   └── WishlistEditor.tsx
│   ├── ErrorBoundary.tsx            # UNCHANGED
│   └── Notifications.tsx            # UNCHANGED
```

---

**Remember: The goal is to make the app look and feel like a $50/month fintech product. Every pixel should feel intentional. Every animation should be smooth. Every card should breathe. Do not rush. Do not cut corners. Preserve all functionality while elevating the presentation to premium standards.**
