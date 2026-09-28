# Style Reference
> Quiet Workshop: A calm, paper-warm application surface, anchored by a single single dark accent that marks every action worth taking.

**Theme:** light

This app is a production tool, not a marketing page. The interface is built for long sessions: dense, readable, low-noise. A warm linen canvas (#FAF9F5) replaces the harsh black of dashboard clichés and replaces flat white as well — paper, not screen. Type is set in dark warm ink (#2D2F2A) rather than pure black, which keeps long-form scanning comfortable. Hierarchy is built from layered off-white surfaces, hairline stone borders, and disciplined spacing. Interaction is signalled by one color and one color only: **Charcoal #2F3130**, a deep warm charcoal that means "this is the action." Every other element steps back so that primary intent is unmistakable. There is no neon, no gradient flourishes, no decorative chrome — the visual identity is the restraint itself.

## Tokens — Colors

### Neutrals (Surfaces & Text)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Linen | `#FAF9F5` | `--color-linen` | App canvas — the base page background. Warm off-white, never pure white. |
| Paper | `#FFFFFF` | `--color-paper` | Elevated surfaces (cards, modals, popovers, dropdown menus). |
| Mist | `#F2F1EC` | `--color-mist` | Subtle fill — table row hover, secondary buttons at rest, input backgrounds. |
| Stone | `#E5E3DD` | `--color-stone` | Default hairline border for cards, inputs, dividers between regions. |
| Pebble | `#CFCDC6` | `--color-pebble` | Stronger border for emphasized separation, disabled control outlines, table column dividers. |
| Slate | `#7C7B75` | `--color-slate` | Tertiary text — metadata, timestamps, helper text, inactive icons. |
| Graphite | `#4A4945` | `--color-graphite` | Secondary text — table column headers, form labels, breadcrumbs. |
| Ink | `#2D2F2A` | `--color-ink` | Primary text and primary icons. Warm dark, deliberately not black. |

### Accent (Charcoal — the single action color)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Charcoal | `#2F3130` | `--color-charcoal` | The brand accent. Primary buttons, active nav item, focused field outline, links, selected state, key icons. **This is the only color used for primary action.** |
| Charcoal Deep | `#1F2120` | `--color-charcoal-deep` | Hover/pressed state for Charcoal elements. |
| Charcoal Soft | `#EDECE6` | `--color-charcoal-soft` | Accent-tinted background — selected row fill, active nav item background, info callout fill. |
| Basalt | `#5C5B55` | `--color-basalt` | Secondary accent for icons, chart series, low-emphasis links inside accent-tinted areas. |
| Ash | `#B3B1A9` | `--color-ash` | Decorative-only accent — chart secondary series, illustrations. Not for text or interactive UI. |

### Semantic

| Name | Value | Token | Role |
|------|-------|-------|------|
| Success | `#2D7A4F` | `--color-success` | Confirmation toasts, success icons, "completed" badge text. Distinct from Charcoal — Charcoal is action, Success is outcome. |
| Success Soft | `#E4F0E8` | `--color-success-soft` | Success badge background, positive callout fill. |
| Warning | `#B57B2E` | `--color-warning` | Caution states, pending warnings. |
| Warning Soft | `#F6EBD7` | `--color-warning-soft` | Warning badge background, caution callout fill. |
| Danger | `#A8423A` | `--color-danger` | Destructive action label, error icon, validation error text. |
| Danger Soft | `#F4E0DD` | `--color-danger-soft` | Destructive callout fill, error toast background. |
| Info | `#5C5B55` | `--color-info` | Informational icons (reuses Basalt for cohesion). |

Data-encoding colours (the official DPE/GES label colours, the score ramp, the verify-link hues) are not accents: the hue carries a value, not an action, so they are exempt from the single-accent rule.

## Tokens — Typography

### Inter — Primary UI typeface · `--font-inter`
- **Substitute:** Inter Variable, system-ui
- **Weights:** 400, 500, 600
- **Sizes:** 11px, 12px, 13px, 14px, 15px, 18px, 22px, 28px
- **Line height:** 1.00, 1.30, 1.40, 1.50
- **Letter spacing:** -0.18, -0.12, -0.08, 0
- **OpenType features:** `"cv01", "ss03", "tnum"` (tabular numerals for tables and metrics)
- **Role:** All UI — headings, body, labels, buttons, navigation. Tight tracking on display sizes; neutral tracking on body to preserve scan-ability in long forms and tables.

### JetBrains Mono — Monospaced typeface · `--font-mono`
- **Substitute:** ui-monospace, SFMono-Regular
- **Weights:** 400, 500
- **Sizes:** 12px, 13px
- **Line height:** 1.50
- **Role:** IDs, codes, API keys, structured data fields, log output, technical metadata.

### Type Scale

| Role | Size | Line Height | Letter Spacing | Weight | Token |
|------|------|-------------|----------------|--------|-------|
| micro | 11px | 1.4 | 0 | 500 | `--text-micro` |
| caption | 12px | 1.4 | -0.08px | 400 | `--text-caption` |
| body | 14px | 1.5 | -0.08px | 400 | `--text-body` |
| body-strong | 14px | 1.5 | -0.08px | 500 | `--text-body-strong` |
| body-lg | 15px | 1.5 | -0.08px | 400 | `--text-body-lg` |
| heading-sm | 18px | 1.4 | -0.12px | 600 | `--text-heading-sm` |
| heading | 22px | 1.3 | -0.18px | 600 | `--text-heading` |
| heading-lg | 28px | 1.3 | -0.18px | 600 | `--text-heading-lg` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** compact (designed for information-dense application views)

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 2 | 2px | `--spacing-2` |
| 4 | 4px | `--spacing-4` |
| 6 | 6px | `--spacing-6` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |

### Border Radius

| Element | Value |
|---------|-------|
| pill | 9999px |
| tags | 3px |
| cards | 8px |
| badges | 4px |
| inputs | 6px |
| buttons | 6px |
| modal | 10px |
| default | 6px |

### Shadows

Shadows are tinted toward Charcoal (warm dark grey) rather than pure black, to stay consistent with the warm light theme.

| Name | Value | Token |
|------|-------|-------|
| xs | `rgba(45, 47, 42, 0.04) 0px 1px 2px 0px` | `--shadow-xs` |
| sm | `rgba(45, 47, 42, 0.06) 0px 1px 3px 0px, rgba(45, 47, 42, 0.04) 0px 1px 2px -1px` | `--shadow-sm` |
| md | `rgba(45, 47, 42, 0.08) 0px 4px 8px -2px, rgba(45, 47, 42, 0.04) 0px 2px 4px -2px` | `--shadow-md` |
| lg | `rgba(45, 47, 42, 0.10) 0px 12px 24px -6px, rgba(45, 47, 42, 0.05) 0px 4px 8px -4px` | `--shadow-lg` |
| ring | `rgba(45, 47, 42, 0.16) 0px 0px 0px 3px` | `--shadow-ring` (focus ring) |
| inset | `rgba(229, 227, 221, 1) 0px 0px 0px 1px inset` | `--shadow-inset` (subtle inner border) |

### Layout

- **App shell:** one full-height main region (`h-svh`) — no sidebar, no top bar, no account UI; the results view splits it into list, map and detail
- **Section gap:** 24px
- **Card padding:** 16px (default), 12px (compact list cards), 24px (modal/page header)
- **Form row gap:** 16px
- **Element gap:** 8px
- **Table row height:** 36px (default), 32px (dense)

## Components

### Primary Button — `Charcoal`
**Role:** The single primary action per view.

Solid `Charcoal` background (#2F3130), `Linen` text (#FAF9F5), Inter 500 at 14px, 6px border-radius, padding 8px 14px. Hover: `Charcoal Deep` (#1F2120). Focus: 3px `Charcoal` 16%-alpha ring. Disabled: 50% opacity, no hover. Use exactly one per view — typically "Save", "Run", "Apply", "Create".

### Secondary Button
**Role:** Non-primary commits and dismissive actions.

`Paper` (#FFFFFF) background, `Ink` text, 1px `Stone` (#E5E3DD) border, 6px border-radius, padding 8px 14px. Hover: `Mist` (#F2F1EC) background. Use for "Cancel", "Back", and secondary commits alongside the primary button.

### Ghost Button
**Role:** Toolbar actions, inline controls, table-row actions.

Transparent background, `Graphite` (#4A4945) text or icon, 6px border-radius, padding 6px 10px. Hover: `Mist` background, text becomes `Ink`. No border at rest.

### Danger Button
**Role:** Destructive commits (delete, revoke, archive).

`Danger` (#A8423A) text on `Paper` background, 1px `Danger` border at 30% alpha, 6px border-radius. Hover: `Danger Soft` (#F4E0DD) fill. Filled `Danger` variant only inside confirmation modals.

### Input Field
**Role:** All text inputs, including search, form fields, and inline editors.

`Paper` background, `Ink` text, 1px `Stone` border, 6px border-radius, padding 8px 12px, 14px text. Placeholder: `Slate` (#7C7B75). Hover: border becomes `Pebble` (#CFCDC6). Focus: border becomes `Charcoal`, plus 3px `Charcoal` 16%-alpha ring. Error: border `Danger`, helper text `Danger`. Disabled: `Mist` background, `Slate` text.

### Select / Dropdown Trigger
**Role:** Inline dropdowns, filter pills, column selectors.

Identical to Input Field, but with a 12px `Graphite` chevron icon at the right edge, 8px from the border.

### Search Input
**Role:** Global and scoped search.

`Mist` background, no border, 6px border-radius, padding 6px 10px 6px 32px (16px `Slate` search icon at left). On focus: `Paper` background, 1px `Stone` border, `Charcoal` focus ring.

### Section Header
**Role:** Grouping label inside panels and cards.

`Slate` text, 11px Inter 500, uppercase, letter-spacing +0.4px, padding 8px 8px 4px. Non-interactive.

### Default Card
**Role:** Standard content container.

`Paper` background, 1px `Stone` border, 8px border-radius, `--shadow-xs`, 16px padding. Header row (if present): bottom-aligned with 1px `Stone` divider, 12px below.

### Inline List Row
**Role:** Repeating data rows inside cards or tables.

36px min-height, 8px horizontal padding inside parent, `Ink` primary text, `Slate` secondary text. Hover: `Mist` background. Selected: `Charcoal Soft` background, persists across blur. Bottom 1px `Stone` divider between rows.

### Data Table
**Role:** Structured records.

`Paper` background, 1px `Stone` outer border, 8px border-radius, `--shadow-xs`. Header row: `Mist` background, `Graphite` text, 11px Inter 500 uppercase, 32px height. Body rows: 36px height, `Ink` text, 1px `Stone` bottom divider, hover `Mist`. Numeric columns: right-aligned, `--font-mono` 13px with tabular numerals.

### Badge
**Role:** Status, category, count.

Pill or 4px-radius rectangle, padding 2px 8px, 11px Inter 500. Variants by semantic background + on-color text:
- **Neutral:** `Mist` bg, `Graphite` text
- **Accent:** `Charcoal Soft` bg, `Charcoal` text
- **Success:** `Success Soft` bg, `Success` text
- **Warning:** `Warning Soft` bg, `Warning` text
- **Danger:** `Danger Soft` bg, `Danger` text

### Toast / Inline Alert
**Role:** Transient notifications and inline status callouts.

`Paper` background, left 3px accent bar in semantic color, 1px `Stone` border on remaining edges, 8px border-radius, `--shadow-md`, 12px 16px padding. Icon 16px in semantic color, title `Ink` 14px 500, body `Graphite` 13px 400.

### Modal / Dialog
**Role:** Confirmations, focused tasks, destructive verifications.

`Paper` background, 10px border-radius, `--shadow-lg`, 480px default width (640px for forms). Backdrop: `Ink` at 40% alpha. Header padding 20px 24px with 1px `Stone` bottom divider. Footer padding 16px 24px with `Mist` background and right-aligned button row.

### Tabs
**Role:** Switching views within a page.

Horizontal row, `Graphite` text 14px 500, padding 8px 12px, no border at rest. Hover: text `Ink`. **Active:** text `Ink`, 2px `Charcoal` underline flush to the row's bottom edge.

### Empty State
**Role:** No-content placeholder inside cards, tables, or full pages.

Centered stack, 48px line-illustration in `Ash`, heading `Ink` 18px 600, body `Graphite` 14px 400 max-width 360px, single Primary Button below. No card chrome — sits directly on parent surface.

### Keyboard Shortcut Hint
**Role:** Affordance for power users.

`--font-mono` 11px, `Slate` text, 1px `Stone` border, `Paper` background, 3px border-radius, padding 1px 5px. Always inline-end of the row it belongs to.

## Do's and Don'ts

### Do
- Use `Linen` (#FAF9F5) for the app canvas and `Paper` (#FFFFFF) for elevated surfaces — never pure black, never harsh white.
- Reserve `Charcoal` (#2F3130) exclusively for primary action, active state, focus ring, and links. If everything is Charcoal, nothing is.
- Keep text in `Ink` (#2D2F2A). It reads as black but is a warm dark grey that pairs with `Linen` and avoids the cold flatness of #000.
- Build hierarchy through three layered surfaces (`Linen` canvas → `Paper` card → `Mist` inner block) rather than through shadow depth.
- Use `tabular-nums` (via `--font-inter` OpenType features) for any numeric column in a table so digits align vertically.
- Pair every destructive button with a confirmation modal — destructive actions never commit on a single click in primary chrome.
- Use 6px radius for inputs/buttons, 8px for cards, 10px for modals. Hold these three values; do not invent new ones.
- Apply the 3px `Charcoal`-tinted focus ring (`--shadow-ring`) on every interactive element that can receive keyboard focus.

### Don't
- Don't introduce a second saturated accent. `Charcoal` is the only action color. Success/Warning/Danger are outcome states, not interaction signals.
- Don't use `#000000` anywhere — not in text, not in borders, not in shadows. The palette has no black by design.
- Don't use a dark-theme variant of this system. This is a light-mode product; a separate dark theme must be designed end-to-end, not derived by inversion.
- Don't stack more than two elevation levels (`--shadow-xs` on cards, `--shadow-md`/`--shadow-lg` on overlays). The system is flat-leaning; floating chrome is exceptional, not decorative.
- Don't use Charcoal for badges, chart fills, or icons that are not interactive — readers learn to scan for it as "the place to click."
- Don't apply gradients to surfaces. Single solid fills only; the warmth of `Linen` is the texture.
- Don't write body copy in `Slate` (#7C7B75) — it is reserved for tertiary metadata. Body copy is `Ink` or `Graphite`.
- Don't pad rows for visual breathing room — the system is compact. Use 36px row height and 8px element gaps as defaults.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Linen Canvas | `#FAF9F5` | Application background, panel background, page base. |
| 1 | Paper Card | `#FFFFFF` | Cards, tables, modals, popovers, dropdown menus, primary content containers. |
| 2 | Mist Fill | `#F2F1EC` | Hover backgrounds, table header rows, modal footers, search inputs, inset blocks within cards. |
| 3 | Charcoal Soft Accent | `#EDECE6` | Selected row, active nav item, accent-tinted info block. |

## Elevation

- **Resting card:** `--shadow-xs` — barely there, just enough to separate from canvas.
- **Hovered or focused card:** `--shadow-sm`.
- **Dropdown / Popover:** `--shadow-md` + 1px `Stone` border.
- **Modal:** `--shadow-lg` + backdrop at `Ink` 40% alpha.
- **Focus ring (all interactive elements):** `--shadow-ring` (3px `Charcoal` 16% alpha) — replaces browser default.

## Imagery

This is a working tool. Imagery is functional, never decorative. Empty states use simple line illustrations in a single `Ash` (#B3B1A9) stroke on `Linen` — no fills, no shadows, no character art. Iconography is a single stroke set at 16px and 20px, 1.5px stroke weight, rounded joins, `Slate` (#7C7B75) at rest, `Graphite` (#4A4945) on hover, `Charcoal` (#2F3130) when active or selected. Charts use `Charcoal` for the primary series, `Basalt` and `Ash` for additional series; no rainbow palettes. Avatars are square with 4px corner radius, never circular, to match the rectilinear language of the rest of the UI. Product screenshots — when used internally for docs — sit inside a 1px `Stone` border with 8px radius and `--shadow-sm`, on a `Mist` mat.

## Layout

The app shell is a single full-height region on `Linen`: no sidebar, no top bar and no account UI (no sign-in, avatar, settings, paywall or language switcher) — the tool is the home page. The page owns its layout inside that region. The listing form sits centred in one column. The results view is a three-panel workspace: listing and candidates on the left, the map in the centre, the selected result's detail on the right — floating over the map as a `Paper` card between `lg` and `xl`, a bottom sheet below `lg`. The left column and the docked detail are flush, full-height columns divided by 1px `Stone` borders. The document never scrolls; each column scrolls on its own. Within a panel, vertical rhythm is set by `--section-gap` (24px) between blocks, with 16px between rows inside a card. Sticky elements (panel headers, table headers) get a 1px `Stone` bottom border instead of a shadow.

## Agent Prompt Guide

Quick Color Reference:
- canvas: #FAF9F5 (Linen)
- surface: #FFFFFF (Paper)
- subtle fill: #F2F1EC (Mist)
- border: #E5E3DD (Stone)
- text primary: #2D2F2A (Ink — warm dark, not black)
- text secondary: #4A4945 (Graphite)
- text tertiary: #7C7B75 (Slate)
- accent / primary action: #2F3130 (Charcoal)
- accent hover: #1F2120 (Charcoal Deep)
- accent tint: #EDECE6 (Charcoal Soft)

Example Component Prompts:
- **Primary button:** `Charcoal` background (#2F3130), `Linen` text (#FAF9F5), Inter 500 at 14px with -0.08px tracking, 6px border-radius, padding 8px 14px. Hover: background `Charcoal Deep` (#1F2120). Focus: 3px `Charcoal` 16%-alpha ring.
- **Default card:** `Paper` background (#FFFFFF), 1px `Stone` border (#E5E3DD), 8px border-radius, `rgba(45, 47, 42, 0.04) 0px 1px 2px 0px` shadow, 16px padding. Title: Inter 600 at 18px in `Ink` (#2D2F2A). Body: Inter 400 at 14px in `Ink` with `Graphite` (#4A4945) secondary copy.
- **Data table row:** `Paper` background, 36px height, 1px `Stone` bottom divider, `Ink` text Inter 400 at 14px. Numeric columns right-aligned in JetBrains Mono 13px with `tnum`. Hover: `Mist` (#F2F1EC) background. Selected: `Charcoal Soft` background.
- **Input field (focused):** `Paper` background, `Ink` text 14px, 1px `Charcoal` border, 3px `Charcoal` 16%-alpha focus ring, 6px border-radius, padding 8px 12px.
- **Status badge — success:** `Success Soft` background (#E4F0E8), `Success` text (#2D7A4F) Inter 500 at 11px, 4px border-radius, padding 2px 8px.

## Similar Brands

- **Linear (light counterpart)** — Compact information density, single-accent discipline, restrained typography.
- **Height** — Calm productivity tooling with warm neutrals and a single brand accent against off-white surfaces.
- **Basecamp** — Paper-tone backgrounds, generous text contrast, decision to avoid pure black for type.
- **Things 3** — Plain surfaces, one accent, no gradients; trust in spacing and type for hierarchy.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Neutrals */
  --color-linen: #FAF9F5;
  --color-paper: #FFFFFF;
  --color-mist: #F2F1EC;
  --color-stone: #E5E3DD;
  --color-pebble: #CFCDC6;
  --color-slate: #7C7B75;
  --color-graphite: #4A4945;
  --color-ink: #2D2F2A;

  /* Accent (Charcoal) */
  --color-charcoal: #2F3130;
  --color-charcoal-deep: #1F2120;
  --color-charcoal-soft: #EDECE6;
  --color-basalt: #5C5B55;
  --color-ash: #B3B1A9;

  /* Semantic */
  --color-success: #2D7A4F;
  --color-success-soft: #E4F0E8;
  --color-warning: #B57B2E;
  --color-warning-soft: #F6EBD7;
  --color-danger: #A8423A;
  --color-danger-soft: #F4E0DD;
  --color-info: #5C5B55;

  /* Typography — Font Families */
  --font-inter: 'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Typography — Scale */
  --text-micro: 11px;
  --leading-micro: 1.4;
  --tracking-micro: 0;
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: -0.08px;
  --text-body: 14px;
  --leading-body: 1.5;
  --tracking-body: -0.08px;
  --text-body-lg: 15px;
  --leading-body-lg: 1.5;
  --tracking-body-lg: -0.08px;
  --text-heading-sm: 18px;
  --leading-heading-sm: 1.4;
  --tracking-heading-sm: -0.12px;
  --text-heading: 22px;
  --leading-heading: 1.3;
  --tracking-heading: -0.18px;
  --text-heading-lg: 28px;
  --leading-heading-lg: 1.3;
  --tracking-heading-lg: -0.18px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-2: 2px;
  --spacing-4: 4px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Layout */
  --inspector-width: 320px;
  --content-max: 1280px;
  --section-gap: 24px;
  --card-padding: 16px;
  --element-gap: 8px;
  --row-height: 36px;
  --row-height-dense: 32px;

  /* Border Radius */
  --radius-tags: 3px;
  --radius-badges: 4px;
  --radius-inputs: 6px;
  --radius-buttons: 6px;
  --radius-cards: 8px;
  --radius-modal: 10px;
  --radius-pill: 9999px;
  --radius-default: 6px;

  /* Shadows (Charcoal-tinted, never pure black) */
  --shadow-xs: rgba(45, 47, 42, 0.04) 0px 1px 2px 0px;
  --shadow-sm: rgba(45, 47, 42, 0.06) 0px 1px 3px 0px, rgba(45, 47, 42, 0.04) 0px 1px 2px -1px;
  --shadow-md: rgba(45, 47, 42, 0.08) 0px 4px 8px -2px, rgba(45, 47, 42, 0.04) 0px 2px 4px -2px;
  --shadow-lg: rgba(45, 47, 42, 0.10) 0px 12px 24px -6px, rgba(45, 47, 42, 0.05) 0px 4px 8px -4px;
  --shadow-ring: rgba(45, 47, 42, 0.16) 0px 0px 0px 3px;
  --shadow-inset: #E5E3DD 0px 0px 0px 1px inset;

  /* Surfaces */
  --surface-canvas: #FAF9F5;
  --surface-card: #FFFFFF;
  --surface-subtle: #F2F1EC;
  --surface-accent: #EDECE6;
}
```

### Tailwind v4

```css
@theme {
  /* Neutrals */
  --color-linen: #FAF9F5;
  --color-paper: #FFFFFF;
  --color-mist: #F2F1EC;
  --color-stone: #E5E3DD;
  --color-pebble: #CFCDC6;
  --color-slate: #7C7B75;
  --color-graphite: #4A4945;
  --color-ink: #2D2F2A;

  /* Accent */
  --color-charcoal: #2F3130;
  --color-charcoal-deep: #1F2120;
  --color-charcoal-soft: #EDECE6;
  --color-basalt: #5C5B55;
  --color-ash: #B3B1A9;

  /* Semantic */
  --color-success: #2D7A4F;
  --color-success-soft: #E4F0E8;
  --color-warning: #B57B2E;
  --color-warning-soft: #F6EBD7;
  --color-danger: #A8423A;
  --color-danger-soft: #F4E0DD;

  /* Typography */
  --font-inter: 'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Type Scale */
  --text-micro: 11px;
  --leading-micro: 1.4;
  --tracking-micro: 0;
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: -0.08px;
  --text-body: 14px;
  --leading-body: 1.5;
  --tracking-body: -0.08px;
  --text-body-lg: 15px;
  --leading-body-lg: 1.5;
  --text-heading-sm: 18px;
  --leading-heading-sm: 1.4;
  --tracking-heading-sm: -0.12px;
  --text-heading: 22px;
  --leading-heading: 1.3;
  --tracking-heading: -0.18px;
  --text-heading-lg: 28px;
  --leading-heading-lg: 1.3;
  --tracking-heading-lg: -0.18px;

  /* Spacing */
  --spacing-2: 2px;
  --spacing-4: 4px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Radius */
  --radius-tags: 3px;
  --radius-badges: 4px;
  --radius-inputs: 6px;
  --radius-buttons: 6px;
  --radius-cards: 8px;
  --radius-modal: 10px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-xs: rgba(45, 47, 42, 0.04) 0px 1px 2px 0px;
  --shadow-sm: rgba(45, 47, 42, 0.06) 0px 1px 3px 0px, rgba(45, 47, 42, 0.04) 0px 1px 2px -1px;
  --shadow-md: rgba(45, 47, 42, 0.08) 0px 4px 8px -2px, rgba(45, 47, 42, 0.04) 0px 2px 4px -2px;
  --shadow-lg: rgba(45, 47, 42, 0.10) 0px 12px 24px -6px, rgba(45, 47, 42, 0.05) 0px 4px 8px -4px;
  --shadow-ring: rgba(45, 47, 42, 0.16) 0px 0px 0px 3px;
}
```
