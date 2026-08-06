# AGENTS.md — RSSMonster Client

## Frontend architecture summary

The RSSMonster client is a Vue 3 application with an app-owned styling system. Bootstrap and Bootswatch have been removed, along with obsolete imports, unused CSS, dead overrides, and unnecessary negative spacing. New frontend work must continue this direction rather than recreating framework-like utility classes or introducing another general-purpose CSS framework.

Frontend implementation should prioritize:

* Semantic, accessible HTML and native interactive elements
* Clear Vue component and stylesheet ownership
* Scoped component styles by default
* Global styles only for tokens, resets, article-content compatibility, and genuinely shared primitives
* Reusable but narrowly defined controls such as buttons, icon buttons, dialogs, dropdowns, form fields, tags, and badges
* CSS Grid, Flexbox, and normal document flow instead of positional corrections
* Responsive behavior across mobile, hybrid tablet, and desktop layouts
* Consistent light and dark themes driven exclusively by the resolved `data-theme`
* Visible `:focus-visible` states that remain distinct from selected states
* A small semantic token system for colors, controls, radii, shell dimensions, layers, and motion
* Incremental refactoring that preserves the current visual identity and behavior

The main application experiences—mobile, expanded, and Reader mode—must feel like variants of one frontend system rather than independent implementations. Shared presentation patterns should be consolidated when this reduces duplication and improves consistency, but specialized article, toolbar, gesture, and responsive behavior should remain local when abstraction would make the code harder to understand.

Reserve `#app` for the Vue mount element. Use semantic component classes for application surfaces. Import feature-wide styles once at their owning feature boundary and contain global feature selectors beneath a stable root class.

Do not suppress keyboard focus, implement actions using clickable `div` or `span` elements, mix operating-system media queries with resolved theme selectors, introduce undocumented z-index values, or compensate for layout problems with arbitrary offsets and negative spacing.

Changes to shell dimensions, scroll ownership, responsive transitions, publisher-provided article content, or shared visual primitives require careful validation in light and dark mode at representative mobile, tablet, and desktop widths. Prefer focused, evidence-based changes over broad visual rewrites.

## Scope

These instructions apply to the `client` folder.

RSSMonster uses Vue 3 with Single-File Components. Prefer clear ownership, local cohesion, and reusable abstractions without unnecessarily spreading one component across many files.

## Vue components

Use `.vue` Single-File Components for UI features.

Keep together by default:

* The component template
* Component-specific state and behavior
* Component-specific styling

Prefer `<script setup>` for new components.

Keep templates semantic, accessible, and easy to scan. Avoid unnecessary wrapper elements and deeply nested markup.

Split a component when it contains multiple independent responsibilities, not merely because it has become long.

## JavaScript

Keep small, component-specific behavior inside the `.vue` file.

Extract logic when it is:

* Reused by multiple components
* Complex enough to have an independent responsibility
* Unrelated to rendering or component orchestration

Use composables for reusable reactive logic.

Use services for API communication and domain-specific request handling.

Do not create utility functions or composables for trivial one-line component behavior.

Prefer compact single-expression assignments where they remain readable.

## CSS

Keep component-owned styles with the component.

Use scoped styles by default for feature components.

Use shared stylesheets only for genuinely global concerns, including:

* Design tokens
* Theme variables
* Resets
* Typography
* Shared utilities
* Application-level layout

Settings components share their established styles through `src/assets/css/settings.css`. Reuse and extend that stylesheet for Settings-wide patterns instead of duplicating them across individual Settings components.

Use `src/assets/styles/theme.css` as the shared color palette and semantic-token registry. Prefer its existing CSS variables over hard-coded colors or component-specific color definitions. The colocated
`src/assets/styles/Agents.md` contains more detailed theming, semantic-color, dark-mode, typography, and hard-coded-color instructions; follow it for all UI and styling changes.

Do not move all CSS into global stylesheets.

Avoid broad selectors that unintentionally affect unrelated components. Prefer clear component class names over styling raw HTML elements globally.

Reuse existing tokens and shared patterns before introducing new values.

Support both light and dark mode for all visual changes.

## Reuse

Prefer reusable Vue components for repeated visual and interactive patterns.

Do not solve repeated UI patterns only through duplicated markup or large shared CSS selectors.

Before introducing a new component, composable, utility, or style abstraction, verify that it represents a real reusable responsibility.

## Changes

Preserve existing comments unless they are no longer accurate.

Follow the existing project structure and naming conventions.

Avoid unrelated refactoring while implementing a focused change.

Keep changes maintainable, accessible, responsive, and consistent with the existing RSSMonster design.