# CLI Prompt: Fleet Dashboard UI — Light Theme, Reference-Matched

> Supersedes the earlier "futuristic dark UI" prompt. These references are light, clean SaaS dashboards — this brief follows that direction instead. Paste into your CLI coding agent once the backend/API exists; this is frontend/UI scope only.

---

## Role & Objective

You are a senior frontend engineer with strong product-design instincts. Redesign the UI of `[PROJECT_NAME]` to match the visual language of two reference dashboards:

- **Reference A (Tracking/Ops view)**: a fleet tracking interface — vehicle list with live status, a detail panel with tabs, an illustrated capacity gauge, a route map, and a cargo photo gallery.
- **Reference B (Overview/Analytics view)**: a KPI-driven dashboard — top metric cards with sparklines, a monthly bar chart, a radial score gauge, a composition breakdown bar, and a data table with status pills.

Goal: a light, clean, confident "ops software" aesthetic — dense with real information but never cluttered. Not flashy, not dark, not neon. Think functional-and-polished over dramatic.

---

## Color System

| Token | Value | Usage |
|---|---|---|
| `--bg-app` | `#f6f7fb` | Page background (soft off-white, not pure white) |
| `--bg-surface` | `#ffffff` | Cards, panels, sidebar |
| `--primary` | `#2f5eff` (blue) | Primary buttons, active nav item, links, chart accents |
| `--primary-soft` | `#eaf0ff` | Primary button hover backgrounds, selected-row tint |
| `--accent` | `#f0555f` (coral) | Secondary CTAs, selected-card border/highlight, key alerts |
| `--accent-soft` | `#fdeced` | Accent chip backgrounds |
| `--success` | `#22c55e` | "On Route" / healthy / on-time status |
| `--warning` | `#f5a524` | "Waiting" / attention-needed status |
| `--danger` | `#ef4444` | Exceptions / overdue / critical alerts |
| `--text-primary` | `#111827` | Headings, primary values |
| `--text-secondary` | `#6b7280` | Labels, captions, muted text |
| `--border` | `#e5e7eb` | Card borders, dividers |

**Decision point**: this treats blue as the brand color and coral as a secondary accent (matches your existing fleet-forge.com theme color). If you'd rather lead with coral as the primary brand color (closer to Reference A), swap `--primary` and `--accent` roles — everything else in this brief still applies.

Status colors (success/warning/danger) stay **fixed** regardless of which primary you choose — never let brand color double as a status color, or "On Route" vs "Alert" becomes ambiguous at a glance.

---

## Layout & Navigation

- Left sidebar, white background, full-height, ~260px wide (expanded — collapsible to icon-only rail on smaller screens, matching Reference B's collapse behavior).
- Top of sidebar: user avatar + name + email (or org name for multi-tenant switching).
- Nav items with icon + label; active item gets a filled pill background in `--primary-soft` with `--primary` text/icon (Reference A's red active-pill pattern, in blue).
- Support nested/grouped nav items with a badge count (e.g. "Requests (4)" expanding to Trucks / Cargos / Repair / Drivers / Reports) — this pattern from Reference A works well for an ops tool with many sub-sections.
- Primary CTA button pinned at sidebar bottom (e.g. "Create New Request" / "Create Order") — full-width, `--primary` filled, rounded.
- Top bar: search input with a keyboard-shortcut hint (⌘K), notification bell with unread badge, chat/messages icon, all right-aligned.

---

## KPI Cards (top of main dashboard)

4–5 cards in a row, each containing:
- Small colored icon badge (rounded square, tinted background matching the metric's theme color)
- Metric label (muted, small)
- Large value (bold, primary text color)
- Inline mini sparkline chart (last 30/90 days trend) — green if trending favorably, red/amber if not
- One-line comparison text ("+13% vs last month")

Map to fleet-relevant metrics instead of e-commerce ones:

| Card | Metric |
|---|---|
| Active Shipments | count, sparkline of daily volume |
| On-Time Delivery Rate | %, sparkline of trend |
| Avg Delivery Time | hours/days, sparkline |
| Fleet Utilization | %, sparkline |
| Open Exceptions/Alerts | count, sparkline (flag red if rising) |

---

## Charts Section

- **Monthly volume bar chart** — bar-per-month, hover tooltip showing exact value + date (Reference B's "$32,849 on Aug 2024" tooltip pattern). Use for shipment volume or revenue by month. Selected/hovered bar gets `--primary` fill, others neutral gray.
- **Radial score gauge** — large center number + label (e.g. "On-Time Score: 82.6%" / "Fleet Health"), thick arc in `--primary`, remaining arc in light gray. Include a one-line status interpretation below ("Your on-time rate is strong") and a timestamp ("Refreshed [time]").
- **Composition breakdown bar** — horizontal segmented bar showing category split (e.g. vehicle types: Trucks / Vans / Bikes, or delivery channel mix), each segment colored distinctly, with a legend + counts above.

---

## Tracking / Live Ops View (Reference A, most detailed screen)

**Middle column — vehicle list:**
- Filter pills by partner/carrier/depot, each showing a count badge, wrap to multiple rows.
- Segmented toggle: Active / Inactive / All, each with a count.
- Vehicle cards in a grid: vehicle ID, status badge with colored dot (On Route = success green, Waiting = warning/danger depending on context), countdown timer to arrival, compact list of upcoming waypoints, small vehicle-type illustration or icon.
- Selected card gets an `--accent` (coral) border to stand out from the rest — this is the one place coral does heavy lifting even with blue as primary.

**Right column — detail panel for selected vehicle:**
- Header: vehicle ID, live status badge, "Call Driver" and "Chat with Driver" buttons (outline + filled respectively).
- Tab bar: Shipping Info / Vehicle Info / Documents / Company / Billing.
- Capacity visualization: illustrated vehicle graphic with a fill overlay showing load percentage + large percentage label — this is a distinctive, memorable element, keep it.
- Route section: ETA countdown, "Change Route" button, map with route path drawn, waypoint pins, current position marker.
- Cargo photo reports: horizontal gallery of photos tagged by waypoint with timestamp/location, plus an "Add Photo" upload tile.

---

## Data Table Pattern (Orders/Shipments list)

- Sortable column headers (small up/down chevrons).
- Destination column pairs a small flag/location icon with the place name.
- Status column uses a pill badge — soft-tinted background, colored text, matching semantic status colors (not brand colors).
- Row-level overflow menu (⋮) on the right for quick actions.
- Search + filter controls above the table, right-aligned.

---

## Component & Interaction Details Worth Copying

- Date-range selector styled as a button with a calendar icon, showing the resolved range as text.
- "Public link" / share-style secondary button next to the primary CTA.
- Soft shadows only (`0 1px 2px rgba(0,0,0,0.04)` to `0 4px 12px rgba(0,0,0,0.06)`), never hard drop-shadows.
- Rounded corners throughout: 12–16px on cards, 8–10px on buttons/inputs, fully rounded (pill) on filter tags and status badges.
- Icons: consistent line-icon set (`lucide-react`) — same stroke width across the whole app, no mixing icon styles.

---

## Accessibility & Usability Guardrails

- Status must never be color-only — pair every colored dot/pill with a text label.
- Maintain WCAG AA contrast for all text, including muted `--text-secondary` on `--bg-surface`.
- Sparkline/gauge charts need an accessible text alternative (aria-label with the actual value) since they're decorative-adjacent.

---

## Tech Stack (unchanged from before, no dark-mode-specific dependencies needed)

- React 18 + Vite + Tailwind (existing) — define the color tokens above as Tailwind theme extensions, not inline hex values scattered through components.
- `recharts` for the bar chart, radial gauge, and sparklines — all themeable to match this palette.
- `lucide-react` for icons.
- `framer-motion` — light use only: card hover lift, tab underline slide, number count-up on KPI cards. Skip the heavier glow/pulse animations from the earlier dark-theme brief; this aesthetic reads as understated, not dramatic.
- Map: Mapbox GL or Leaflet with a **light** map style (not the dark style suggested in the earlier prompt) — thin gray streets, colored route line matching `--accent` or `--primary`.

---

## Build Order

1. Establish the color tokens + base layout shell (sidebar + top bar) — confirm before continuing.
2. KPI card row + monthly bar chart + radial gauge on the main dashboard.
3. Tracking/live-ops view (list + detail panel) — this is the most component-heavy screen, budget the most time here.
4. Orders/shipments data table.
5. Polish pass: hover states, loading skeletons, empty states, responsive collapse of the sidebar.

Confirm each phase's result with me before moving to the next.
