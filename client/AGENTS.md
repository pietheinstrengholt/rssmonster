# AGENTS.md

## Scope

Applies to `client/`.

Follow the root `AGENTS.md` first. This file adds frontend-specific rules only.

RSSMonster uses Vue 3 + Vite and supports desktop, tablet, mobile, light mode, and dark mode.

## Commands

```bash
cd client
npm test
npm run lint
npm run build
```

Prefer focused tests first:

```bash
npx vitest run path/to/test.js
```

Use `npm run verify:build` for broader production-impacting frontend changes.

## Before Editing

Inspect the target component, its parent/callers, related composables/services, relevant tests, and affected layout modes before changing behavior.

Do not assume a component is used only in the currently visible screen.

## Architecture

Follow existing Vue 3 patterns.

Typical responsibilities:

`components → rendering/interaction`
`composables → reusable reactive behavior`
`services → API and non-visual application logic`

Reuse existing services, composables, utilities, and shared components before creating new ones.

Do not extract code merely to reduce `.vue` file size.

## Vue

* Prefer Single File Components.
* Preserve existing props, events, and slots unless the task requires changing them.
* Inspect callers before changing component contracts.
* Prefer computed state over duplicated derived state.
* Avoid watchers when computed state or explicit event flow is clearer.
* Keep side effects out of computed properties.
* Clean up timers, listeners, observers, and subscriptions.
* Keep local behavior local; do not introduce global state unnecessarily.

## API Integration

* Use existing service modules for API calls where available.
* Do not duplicate request or response-normalization logic in components.
* Handle relevant loading, empty, success, and error states.
* Verify the backend contract before assuming new response fields exist.

## Reader Modes

RSSMonster has distinct Reader, Expanded, tablet, and mobile experiences.
Before changing reader behavior, determine which layouts use the component and which modes are in scope.
Do not leak Reader-only features into Expanded or Mobile unless explicitly intended.

## Responsive Design

* Prefer existing breakpoints and layout logic.
* Prefer CSS for layout behavior.
* Use JavaScript layout detection only when interaction behavior requires it.
* Avoid duplicate breakpoint definitions.
* Check intermediate tablet sizes, including portrait and landscape.
* Preserve touch behavior when changing pointer/desktop interactions.

## CSS and Design

Use existing tokens, variables, utilities, and component patterns.

Prefer flexbox, grid, `gap`, and natural wrapping.

Avoid:

* unnecessary `!important`;
* negative-margin hacks;
* arbitrary positional offsets;
* duplicated hard-coded colors;
* global CSS for local problems;
* fixed dimensions that break responsive layouts.

Fix the underlying layout constraint rather than masking it.

RSSMonster should remain clean, calm, professional, reading-focused, and low-noise.

## Theme and colors

Theme is a first-class concern in RSSMonster. All UI changes must consider both light and dark mode. There is an an `AGENTS.md` file in styles/ that describes theme tokens and variables. Reuse existing semantic tokens before introducing new colors.
Consider both light and dark mode for themed UI changes.
Don't use hardcoded colors in components. Reuse existing semantic tokens before introducing new colors.
Do not duplicate theme values inside components when shared variables already exist.

## Accessibility

Use semantic elements.

Interactive controls must preserve keyboard access, focus states, accessible names, and disabled/loading behavior.

Use `<button>` for button behavior.

Icon-only controls need an accessible name.

## Article Content

Do not recreate article-content transformations in UI components.

Reuse canonical article fields and existing content services.

Preserve existing sanitization and rendering boundaries for article HTML.

## Performance

Avoid:

* expensive work in render paths;
* repeated article parsing;
* unnecessary deep watchers;
* duplicated reactive state;
* API calls triggered repeatedly by renders;
* large client-side filtering when server-side support already exists.

Do not remove existing lazy or incremental rendering behavior without understanding why it exists.

## Testing

Add focused regression tests when behavior changes and an established test pattern exists.

Prioritize:

* component contracts;
* conditional rendering;
* interactions;
* API states;
* layout-mode conditions;
* composable/service logic.

For visual-only changes that cannot be reliably automated, state what requires manual validation.

## Final Standard

Prefer:

`reuse existing patterns · preserve layout boundaries · CSS before JS for layout · local state before global state · accessibility by default`

Frontend changes should feel native to RSSMonster, not like generic Vue code added in isolation.