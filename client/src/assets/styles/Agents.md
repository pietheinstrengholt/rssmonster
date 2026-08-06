# AGENTS.md

## Purpose

This folder contains the shared visual design system for RSSMonster.

`theme.css` defines the global color language, surface hierarchy, button colors, badge colors, dark mode
colors and reusable CSS variables. `../scss/global.scss` defines the shared application font stack.

When editing files in this folder, preserve the existing RSSMonster design direction:

* clean
* calm
* professional
* reading-focused
* modern SaaS feel
* low visual noise
* accessible contrast
* consistent semantic color usage

The design should feel closer to GitHub, Linear, Notion and Vercel than to a colorful dashboard.

---

# Core Design Intent

RSSMonster is a professional RSS reader. The interface should support long reading sessions and fast scanning of articles.

Colors should communicate meaning, not decoration.

Use the following semantic rules:

| Color Family | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| Orange       | brand identity and feed-related creation                    |
| Blue         | navigation, selected states, links and primary actions      |
| Green        | successful completion and confirmed success states          |
| Red / Pink   | favorites, warnings, errors and destructive states          |
| Gray / Navy  | content, metadata, surfaces and structural interface chrome |

This relationship is the default color language for both light and dark themes. A color should keep
the same meaning everywhere; changing theme may change its tone or contrast, but not its semantic
family. In particular, the brand remains orange in dark mode, primary actions remain blue, and green
must not become a generic accent for smart or AI features.

Purple, yellow, cyan and other accent families are not general-purpose UI semantics. Retain them only
for an established, domain-specific data signal that cannot be expressed by the core families, and do
not extend a legacy accent to new navigation, actions or structural UI. Prefer a core semantic token
when adding or revisiting a component.

Do not introduce new accent colors unless explicitly requested.

---

# General CSS Rules

* Prefer CSS variables over hard-coded colors.
* Do not duplicate colors across components when a shared variable already exists.
* Preserve existing comments.
* Preserve existing spacing, sizing, border radius, layout and typography unless the task explicitly asks to change them.
* Keep color changes scoped and intentional.
* Use compact, readable CSS.
* Avoid unnecessary wrappers or extra classes unless they improve maintainability.
* Do not use `!important` unless there is no reasonable alternative.
* Avoid pure black `#000000` and pure white surfaces in dark mode.
* Dark mode must be designed, not inverted.
* Ensure normal text meets WCAG AA contrast.

## Structural Tokens

`theme.css` owns both semantic color tokens and the small structural foundation used by shared
application controls and surfaces. Color tokens describe meaning and theme-dependent presentation;
structural tokens describe recurring control heights, radii, focus rings, shell dimensions, layers,
motion timing and default UI type.

Use `--control-height-compact` for dense secondary controls, `--control-height-default` for ordinary
buttons and fields, and `--control-height-touch` when a primary touch target needs the 44px minimum.
New shared controls should use these heights before introducing another fixed value.

Map stacking requirements to the semantic `--layer-*` scale. Do not add an arbitrary z-index when an
existing sticky, dropdown, overlay, dialog or notification layer describes the element's ownership.
Component-specific dimensions, media geometry, article-content typography and one-off animation
timing should remain local until they represent a repeated application concept.

RSSMonster intentionally uses semantic components and a small token vocabulary instead of a general
utility-class framework. Add a token only when multiple owners share the concept; do not create
spacing or sizing aliases merely to replace every literal.

---

# Typography

Typography provides most of the hierarchy in RSSMonster. It should remain quiet, compact and
comfortable during long reading sessions.

## Font Families

Use `--font-family` for application UI and article-reader chrome. It resolves to the native system
sans-serif stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Helvetica`, `Arial`,
and `sans-serif`) so the interface feels familiar on each platform and renders efficiently. Controls
inherit this family from the global stylesheet.

Do not add a display typeface for headings or branding. Use a monospace stack only for code, queries,
identifiers and other technical values where character alignment or distinction is meaningful; it is
not a general metadata or body-text treatment. Publisher article content may require compatibility
overrides, but application-owned UI should return to the shared system stack.

## Type Scale

Use the smallest size that remains readable for the element's role. The established application scale
has the following intent:

| Size     | Intended use                                                                 |
| -------- | ---------------------------------------------------------------------------- |
| 11px     | Eyebrows, compact badges, uppercase metric labels and tertiary annotations   |
| 12px     | Dense metadata, secondary table detail and compact supporting labels         |
| 13px     | Article metadata, helper text, secondary controls and settings descriptions  |
| 14px     | Default UI and reading text, form controls, buttons and ordinary body copy   |
| 15–16px  | Emphasized body copy, list titles and higher-priority controls               |
| 17–20px  | Section headings, dialog titles, expanded article titles and mobile headings |
| 21–24px  | Page, settings and article-content headings                                  |
| 26–28px  | Top-level page or empty-state headings used sparingly                        |

Sizes above 28px are reserved for functional icons or exceptional focal states, not routine page
headings or marketing-style hero text. Keep responsive reductions aligned with the same hierarchy.
For article reading text, pair 14px body copy with a relaxed line height around `1.5`–`1.65`; compact
labels and controls can use tighter line heights.

## Font Weights

| Weight | Intended use                                                                        |
| ------ | ----------------------------------------------------------------------------------- |
| 400    | Body copy, article content, descriptions and metadata                              |
| 500    | Navigation rows and modest emphasis that should remain quieter than a heading       |
| 600    | Selected navigation, labels, compact subheadings and emphasized metadata            |
| 700    | Buttons, article titles, section/page headings, metric values and strong UI emphasis |

Prefer these four weights. Existing `750` declarations are limited display emphasis; do not spread
that weight to routine UI, and prefer `700` for new work. Avoid using weight alone to communicate a
state when a semantic color, label or icon is also necessary.

---

# Hard-coded Color Guard

Run `npm run check:hard-coded-colors` when changing Vue styles or client CSS/SCSS. The guard scans
Vue `<style>` blocks and client-owned `.css`/`.scss` files. It excludes `theme.css`, because that file
is the semantic-token registry where exact light- and dark-mode values are defined.

The policy lives in `client/scripts/hard-coded-color-policy.js`:

* `HARD_CODED_COLOR_BASELINE` records legacy literal counts by file and normalized value. A new
  literal or an increased count fails the check.
* `APPROVED_COLOR_EXCEPTIONS` documents capped, durable exceptions in four categories:
  `publisher-platform-brand`, `article-content-compatibility`, `intentional-var-fallback`, and
  `other-reviewed-exception`.
* Every durable exception must remain narrowly matched, include a reason, and set the current maximum
  occurrence count. Do not add an exception merely to preserve an ordinary UI color.

On failure, use an existing semantic variable when its purpose and computed values match exactly. If
none exists, add a narrowly named token to `theme.css` with exact light- and dark-mode values. When a
migration removes literals, lower or remove the matching baseline entry in the same patch so
the reduced count becomes the new ceiling. Never raise a baseline merely to make the guard pass.

---

# Light Theme Palette

## Base Surfaces

```css
--bg-sidebar: #F8F9FA;
--bg-toolbar: #FEFEFE;
--bg-menu-item: #F3F4F6;
--bg-selected-soft: #E8F2FE;
--bg-page: #FFFFFF;
--bg-card: #FFFFFF;
```

## Text

```css
--text-primary: #111827;
--text-meta: #6B7280;
--text-secondary: #4B5563;
```

## Blue / Primary

```css
--color-primary: #2563EB;
--color-primary-hover: #1D4ED8;
--color-primary-active: #1E3A8A;
--color-primary-visited: #1E40AF;
--color-primary-soft: #E8F2FE;
--color-primary-text: #1D4ED8;
```

## Orange / Brand and Feed Creation

```css
--color-orange: #EA650D;
--color-orange-hover-text: #C2410C;
--color-orange-soft: #FFF1E8;
--color-orange-soft-hover: #FFE6D5;
--color-orange-border: #FFC4A3;
```

## Green / Successful Completion

```css
--color-green: #166534;
--color-green-hover-text: #14532D;
--color-green-soft: #EAF7EF;
--color-green-soft-hover: #DDF2E5;
--color-green-border: #B9DFC6;
```

---

# Sidebar Buttons

## Fresh Feeds

```css
background: #2563EB;
hover-background: #1D4ED8;
border: none;
color: #FFFFFF;
```

## Add New Feed

```css
background: #FFF1E8;
hover-background: #FFE6D5;
border: #FFC4A3;
color: #EA650D;
hover-color: #C2410C;
```

## Mark as Read

```css
background: #EAF7EF;
hover-background: #DDF2E5;
border: #B9DFC6;
color: #166534;
hover-color: #14532D;
```

---

# Article / Settings Badge Colors

These badge colors are also used in settings pages. Treat them as semantic colors, not article-only colors.
Several values below are legacy evaluative or domain-specific accents and do not expand the core color
relationship. Advertisement, sentiment, quality, writing and rule colors should be migration candidates
when their components are revisited; do not reuse those colors for unrelated UI.

## Light Mode

```css
/* Similar Articles */
--badge-similar-bg: #E8F2FE;
--badge-similar-text: #1D4ED8;

/* Duplicate Articles */
--badge-duplicate-bg: #FDF2F8;
--badge-duplicate-text: #BE185D;

/* Tags */
--badge-tag-bg: #F3F4F6;
--badge-tag-text: #4B5563;

/* Quality */
--badge-quality-bg: #EAF7EF;
--badge-quality-text: #1F5E3A;

/* Danger */
--badge-danger-bg: #FEEAEA;
--badge-danger-text: #B42318;

/* Ad Score */
--badge-ad-bg: #FFEDD5;
--badge-ad-text: #EA650D;

/* Sentiment */
--badge-sentiment-bg: #EEF2FF;
--badge-sentiment-text: #4338CA;

/* Writing */
--badge-writing-bg: #ECFDF5;
--badge-writing-text: #047857;

/* Tag Rule */
--badge-tag-rule-bg: #F5EEFD;
--badge-tag-rule-text: #6D28D9;
```

## Dark Mode

```css
/* Similar Articles */
--badge-similar-bg: #1E3A5F;
--badge-similar-text: #93C5FD;

/* Duplicate Articles */
--badge-duplicate-bg: #4A1433;
--badge-duplicate-text: #F9A8D4;

/* Tags */
--badge-tag-bg: #2A2F3A;
--badge-tag-text: #D1D5DB;

/* Quality */
--badge-quality-bg: #173D2A;
--badge-quality-text: #86EFAC;

/* Danger */
--badge-danger-bg: #4A1F1F;
--badge-danger-text: #FCA5A5;

/* Ad Score */
--badge-ad-bg: #5C2A14;
--badge-ad-text: #FDBA74;

/* Sentiment */
--badge-sentiment-bg: #252C63;
--badge-sentiment-text: #A5B4FC;

/* Writing */
--badge-writing-bg: #123F35;
--badge-writing-text: #6EE7B7;

/* Tag Rule */
--badge-tag-rule-bg: #35205F;
--badge-tag-rule-text: #C4B5FD;
```

---

# Dark Theme Palette

Dark mode should use layered surfaces.

```css
--dark-bg-page: #0B0F14;
--dark-bg-sidebar: #11161D;
--dark-bg-toolbar: #161C24;
--dark-bg-card: #1A202C;
--dark-bg-hover: #222836;
--dark-border: #2A3342;

--dark-text-primary: #E5E7EB;
--dark-text-body: #D1D5DB;
--dark-text-meta: #9CA3AF;
--dark-text-muted: #6B7280;
```

## Dark Sidebar Selected State

```css
background: #1E3A8A;
color: #FFFFFF;
icon-color: #FFFFFF;
```

Non-selected Categories, All Feeds, and Top Tags rows use the same dark hover surface:

```css
background: var(--toolbar-search-hover-background-dark);
```

## Dark Hyperlinks

```css
--color-link: #60A5FA;
--color-link-hover: #93C5FD;
--color-link-visited: #3B82F6;
--color-link-active: #2563EB;
```

## Shared Icons and Switches

Use the established shared treatments instead of defining visually equivalent component variants.

### Primary dialog and form icons

Dialog title icons and related primary form icons use the soft primary surface in light mode and the
darker primary surface in dark mode. Keep the foreground primary blue unless the icon communicates a
different semantic meaning.

```css
/* Light */
background: var(--color-primary-soft);
color: var(--color-primary);

/* Dark */
background: var(--color-primary-surface-dark);
color: var(--color-primary);
```

### Settings insight icons

Settings section intro icons should reuse `.settings-insight-icon` from `assets/css/settings.css`.
The shared treatment owns the 42px square container, 12px radius, 20px glyph, and dark-mode surface.
Do not create a section-specific intro-icon class when the icon has the same informational purpose.

### Preference switches

Use `--preferences-switch-track` for the neutral off-state track shared by preference controls. It
resolves to `#CBD5E1` in light mode and `#4B5563` in dark mode. A feature-specific token may alias it
when that alias clarifies ownership, but must not duplicate the values.

---

# Dark Sidebar Buttons

## Fresh Feeds

Keep the primary blue consistent across light and dark mode.

```css
background: #2563EB;
hover-background: #1D4ED8;
border: none;
color: #FFFFFF;
```

## Add New Feed

```css
background: #3A2A21;
hover-background: #4A3428;
border: #7A4D38;
color: #EA650D;
hover-color: #FFBE9D;
```

## Mark as Read

```css
background: #1E3D2B;
hover-background: #274F36;
border: #3A7A55;
color: #4ADE80;
hover-color: #D1FAE5;
```

---

# Implementation Guidance

When adding or changing styles:

1. First check whether a suitable variable already exists.
2. If a new color is needed, add it as a semantic variable.
3. Do not hard-code badge colors in Vue components.
4. Do not create component-specific color systems unless the component has a truly unique semantic role.
5. Keep light and dark variables paired.
6. In dark mode, prefer darker backgrounds with brighter text.
7. Badges should be quieter than buttons.
8. Buttons should clearly read as interactive.
9. Metadata should never compete with article titles.
10. Article text should remain comfortable for long reading sessions.

For dark rules inside a scoped Vue style block, include the complete selector inside `:global(...)`:

```css
:global(:root[data-theme='dark'] .component-element) {
  background: var(--dark-surface-token);
}
```

Do not split the global root from its scoped descendant. The production CSS compiler can otherwise
drop the descendant selector, causing the light-mode declaration to remain active in dark mode.

---

# Expected Result

The UI should feel consistent across:

* article list
* article cards
* sidebar
* desktop toolbar
* mobile toolbar
* settings pages
* smart folders
* feeds overview
* scores settings
* actions settings
* dialogs
* badges
* buttons
* empty states

The dark theme should feel like a native, polished dark UI rather than an inverted light theme.
