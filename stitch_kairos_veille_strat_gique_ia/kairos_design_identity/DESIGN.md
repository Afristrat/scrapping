---
name: Kairos Design Identity
colors:
  surface: '#f8f9ff'
  surface-dim: '#ccdbf3'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d5e3fc'
  on-surface: '#0d1c2e'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#233144'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#9b3e3b'
  on-tertiary: '#ffffff'
  tertiary-container: '#ba5551'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ae'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#7f2928'
  background: '#f8f9ff'
  on-background: '#0d1c2e'
  surface-variant: '#d5e3fc'
typography:
  h1-6xl:
    fontFamily: Inter
    fontSize: 60px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.02em
  h2-4xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  h3-2xl:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  max-width-marketing: 1152px
  max-width-dashboard: 1280px
  gutter: 1.5rem
  margin-page: 2rem
  unit-base: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

This design system is engineered for a high-stakes B2B AI monitoring environment. It prioritizes clarity, reliability, and precision, reflecting the "Kairos" philosophy of acting at the opportune moment. The aesthetic is **Corporate / Modern**, utilizing a structured grid and a sophisticated color palette to instill confidence in enterprise clients.

The visual language avoids unnecessary flourish, focusing instead on data density and legible information architecture. It communicates a "French Tech" sensibility—elegant yet rigorous—striking a balance between innovative AI capabilities and stable enterprise software.

## Colors

The color strategy for this design system utilizes a foundation of **Slate** neutrals to maintain a sober, professional atmosphere. **Emerald** serves as the primary action color, symbolizing growth and system health—critical for a monitoring SaaS. **Blue** is reserved for secondary accents and informative callouts.

State-based colors (Orange for warnings, Red for errors) are calibrated for high visibility against the neutral background to ensure rapid incident response. All color combinations must adhere to WCAG AA/AAA standards, particularly for data visualization and critical status indicators.

## Typography

This design system exclusively employs **Inter** to leverage its exceptional legibility in data-heavy interfaces. Headings are characterized by a "tight" tracking setting and bold weights to create a commanding visual hierarchy.

For the French locale, typography must respect specific typesetting rules:

- Use non-breaking spaces before units and currencies (e.g., `124&nbsp;ms` or `599&nbsp;€`).
- Ensure proper capitalization in headlines, avoiding "Title Case" which is non-standard in French; use "Sentence case" instead.

## Layout & Spacing

The layout philosophy follows a rigid 12-column grid system.

- **Marketing surfaces** use a constrained `6xl` (1152px) container to focus the narrative and improve readability of long-form value propositions.
- **Dashboard surfaces** expand to `7xl` (1280px) to maximize the horizontal space available for multi-column data tables and time-series charts.

A 4px baseline grid ensures vertical rhythm. Elements are spaced using multiples of 4, primarily relying on 8px (small), 16px (medium), and 24px (large) increments to maintain a clean, organized structure.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and a disciplined use of shadows. Surfaces are layered from the background (Slate-50) to the foreground cards (White).

Depth is communicated via Tailwind-inspired ambient shadows:

- **Level 1 (sm):** Used for subtle separation of interactive elements like buttons.
- **Level 2 (md):** Default for standard UI cards and dropdown menus.
- **Level 3 (lg/xl):** Reserved for modals and primary Hero CTAs to create a sense of significant lift.

Focus states are never indicated by elevation alone; a `ring-emerald-500` must always be present to ensure accessibility for keyboard navigation.

## Shapes

This design system uses a precise, semi-rounded geometric language to balance approachability with professional rigor.

- **6px (md):** The standard radius for input fields, checkboxes, and small buttons.
- **8px (lg):** Used for standard buttons and list items.
- **12px (xl):** Applied to dashboard cards and containers to soften the density of the data.
- **16px (2xl):** Reserved exclusively for high-impact marketing elements and Hero CTAs.

This progression ensures that as elements increase in visual importance, their corners become subtly softer, drawing the eye naturally toward primary conversion points.

## Components

### Buttons

Primary buttons use a solid Emerald-600 background with white text. Secondary buttons utilize a Slate-100 background or a subtle border. All buttons must have a minimum height of 40px for touch-target compliance.

### Input Fields

Inputs use a Slate-200 border, which transitions to Emerald-500 on focus. Error states must include both a Red-600 border and a supportive icon for color-blind accessibility.

### Cards

Cards are the primary container for AI monitoring metrics. They feature a white background, a 12px (xl) radius, and a `shadow-sm` or `shadow-md` depending on their priority. Dashboard cards should have a consistent 24px internal padding.

### Chips & Status Indicators

Status indicators for AI health (e.g., "Active", "Learning", "Alert") use a light tinted background of the status color with high-contrast bold text. Example: An "Active" chip uses Emerald-50 background with Emerald-700 text.

### Data Tables

Tables are the heart of the monitoring SaaS. Use Slate-50 for zebra-striping to improve row scanning. Headers must be in `label-caps` typography to clearly distinguish from the data rows.
