---
name: rssmonster-browser
description: Use Codex browser capabilities to inspect and validate the RSSMonster UI in a real browser. Use for frontend, UX, responsive, interaction, styling, and integration work where rendered behavior matters. Do not rely only on Vue/CSS code inspection when visual or interactive behavior needs verification.
---

# RSSMonster Browser

## Purpose

Use the browser to inspect RSSMonster as an actual running application.

This skill is intended primarily for:

- UX development
- frontend implementation
- responsive design
- visual regression checking
- interaction validation
- frontend/backend integration validation
- reproducing UI bugs
- verifying completed frontend work

Do not judge frontend correctness only from source code when the changed behavior can be validated in the browser.

The rendered application is the source of truth for visual and interaction behavior.

Use Codex's browser capability, such as `@Browser`, when available.

## Core principles

### Inspect the real application

For frontend or UX changes, open RSSMonster in the browser and verify the actual rendered result.

Do not conclude that a design is correct merely because:

- the Vue template looks correct;
- the CSS appears correct;
- the component compiles;
- tests pass;
- the intended classes are present.

Visual and interaction changes must be evaluated in the rendered application whenever practical.

### Do not assume local ports or URLs

Determine the actual local RSSMonster URLs from the repository and runtime configuration.

Inspect relevant configuration such as:

- package scripts
- Vite configuration
- environment files or templates
- server configuration
- client API configuration
- development proxy configuration
- existing documentation

Do not assume that the frontend runs on a particular port.

Do not assume that the API runs on a particular port.

Use the actual configured runtime values.

### Reuse running processes

Before starting additional development processes, determine whether RSSMonster is already running.

Prefer existing running:

- client development server
- Express server
- worker processes
- inference services

when they are sufficient for the requested browser validation.

Do not unnecessarily create duplicate development processes.

If a required process is not running, use the repository's existing scripts to start it.

Do not invent alternative startup commands when existing repository scripts already provide the required behavior.

### Preserve the browser session

Reuse the existing browser profile/session where possible.

Preserve:

- cookies
- local storage
- session storage
- authentication state
- application preferences

Do not clear browser storage unless explicitly required for the test.

Do not log the user out as part of ordinary browser validation.

Never store, infer, guess, or hard-code credentials.

If RSSMonster displays the login screen because authentication is required or the session has expired, stop at that point and ask the user to authenticate manually.

After authentication has been completed, continue using the same browser session.

## Browser procedure

### 1. Understand the requested behavior

Before opening the browser, determine what needs to be validated.

Identify:

- the requested feature or bug fix;
- the intended user workflow;
- the relevant page or component;
- important visual states;
- important interaction states;
- required desktop/mobile behavior;
- any explicit design reference provided by the user.

Do not broaden the task into a general UI redesign.

Use the requested design and agreed behavior as the acceptance criteria.

### 2. Inspect relevant application architecture

Before making assumptions about how to reach the feature, inspect the relevant existing code.

Where applicable inspect:

- Vue routes
- components
- stores
- composables
- API calls
- authentication behavior
- layout components
- responsive CSS
- application settings
- backend routes supporting the UI

Follow existing RSSMonster architecture and conventions.

Do not introduce new frontend architecture merely to make browser validation easier.

### 3. Determine runtime configuration

Find the actual local application URL and, where relevant, API URL.

Use repository configuration rather than assumptions.

Confirm that the required application processes are running.

If processes must be started:

- use existing package scripts;
- wait until startup has completed;
- confirm that the application responds before continuing.

If the repository exposes a health endpoint or equivalent startup indicator, use it where appropriate.

### 4. Open the application

Open the actual RSSMonster application in the browser.

Navigate directly to the relevant route when known.

Otherwise open the normal application entry point and navigate through the real UI.

Verify that the expected page actually rendered.

Do not treat a successful HTTP response alone as evidence that the application is usable.

### 5. Verify authentication state

Confirm that the application is in the expected authenticated state.

If the intended RSSMonster UI is visible, continue.

If the browser shows:

- the login page;
- an expired-session message;
- an authentication redirect;
- another state requiring credentials;

do not attempt to guess or recover credentials.

Ask the user to authenticate manually and preserve the session afterward.

### 6. Reproduce the real user workflow

Use the application as a user would.

For the feature being reviewed, perform the actual relevant interactions.

Examples include:

- opening an article
- switching folders
- expanding or collapsing UI elements
- clicking tags
- opening menus
- scrolling
- changing filters
- navigating between articles
- marking content read
- bookmarking
- triggering hover/focus states
- resizing the viewport
- opening dialogs
- testing empty/loading/error states

Do not validate only the initial static state when the feature is interactive.

### 7. Inspect visual quality

For UX work, inspect the actual rendered design.

Evaluate where relevant:

- visual hierarchy
- spacing
- alignment
- typography
- density
- icon sizing
- color emphasis
- borders
- shadows
- whitespace
- wrapping
- truncation
- overflow
- clipping
- scrollbar behavior
- state visibility
- consistency with nearby RSSMonster UI
- whether controls attract the intended amount of attention

Look for unintended changes outside the feature itself.

Pay attention to whether the new design still feels native to the existing RSSMonster interface.

### 8. Validate responsive behavior

If the changed UI can appear on multiple screen sizes, inspect relevant responsive states.

At minimum, where applicable, validate:

- normal desktop layout
- narrower desktop/tablet layout
- mobile layout

Use representative viewport sizes rather than relying only on CSS inspection.

Check for:

- horizontal overflow
- overlapping controls
- unexpected wrapping
- inaccessible actions
- clipped text
- excessive vertical space
- broken fixed/sticky elements
- incorrect breakpoints
- touch-target problems
- layouts that technically fit but become visually unusable

Do not require every possible viewport width unless the task specifically concerns complex responsive behavior.

### 9. Validate interaction states

Inspect relevant states beyond the default state.

Depending on the feature, check:

- default
- hover
- focus
- active
- selected
- expanded
- collapsed
- disabled
- loading
- empty
- error
- long-content
- many-items
- few-items

For overflow-related UI, intentionally inspect realistic edge cases.

Examples:

- long article titles
- many tags
- long tag names
- many sources
- unusually long feed names
- narrow viewports

Use actual application data when suitable examples already exist.

Do not fabricate persistent production data merely for visual testing unless explicitly required.

### 10. Inspect console errors

Inspect the browser console for errors relevant to the changed functionality.

Pay particular attention to:

- uncaught JavaScript exceptions
- Vue warnings
- failed component rendering
- undefined/null property access
- repeated error loops
- failed dynamic imports
- authentication errors
- API failures caused by the changed implementation

Do not fail the review merely because unrelated pre-existing console noise exists.

Distinguish clearly between:

- errors introduced by the implementation;
- relevant existing errors;
- unrelated pre-existing warnings.

### 11. Inspect network behavior when relevant

When the feature depends on backend communication, inspect relevant browser network activity.

Verify where appropriate:

- the intended request is sent;
- the correct endpoint is used;
- the request method is correct;
- payloads contain expected values;
- responses have expected status codes;
- errors are handled visibly and correctly;
- duplicate requests are not unintentionally generated.

Do not perform exhaustive network auditing when the feature is purely visual.

### 12. Re-test after implementation changes

If code is modified during the task, do not rely on the browser state from before the change.

Reload or refresh the relevant application state and repeat the affected workflow.

When hot-module reload is involved, ensure that the result being inspected represents the current implementation.

For stateful features, recreate the relevant interaction rather than assuming the old state remains valid.

### 13. Verify regressions around the changed area

Inspect nearby behavior likely to be affected by the change.

For example, when changing article metadata presentation, also verify that nearby:

- source information
- article controls
- timestamps
- tags
- recommendation indicators
- article body layout

still render correctly.

Keep regression checking focused on the affected area.

Do not turn browser validation into a full manual regression test of RSSMonster unless explicitly requested.

## Implementation guidance

When browser inspection reveals a problem and implementation changes are requested:

- inspect existing Vue components before changing architecture;
- follow existing component and CSS patterns;
- preserve existing comments;
- use ESM-only imports;
- keep logic focused and readable;
- prefer compact single-expression assignments where appropriate;
- avoid unnecessary abstractions;
- preserve existing behavior outside the requested change;
- add or update focused tests for material logic changes.

Do not implement speculative UX enhancements that were not requested.

If the visual implementation differs from a user-provided mockup or screenshot, prioritize the agreed design intent rather than mechanically reproducing accidental screenshot details.

## Using screenshots and visual references

When the user supplied a screenshot, mockup, or design reference:

1. inspect the reference carefully;
2. identify the intended hierarchy and behavior;
3. compare the running implementation against it;
4. verify the result in the browser after implementation.

Evaluate both:

- visual similarity where intentional;
- consistency with the existing RSSMonster design system.

A screenshot is evidence of the intended design, but existing RSSMonster conventions still matter unless the user explicitly asked to replace them.

## What counts as validated

Do not claim browser validation succeeded unless the relevant evidence was actually observed.

For a normal UX feature, success generally requires that:

- the application loaded;
- the expected authenticated state was available;
- the relevant page or component rendered;
- the requested workflow could be performed;
- the important interaction states behaved correctly;
- relevant responsive states were inspected;
- no relevant uncaught console errors occurred;
- relevant API requests succeeded when applicable;
- the rendered result matched the requested behavior.

If any of these could not be validated, state that clearly.

## Limitations

Never pretend to have visually inspected something that was not rendered in the browser.

If browser tooling is unavailable, say so and fall back to code/test review, clearly marking visual validation as incomplete.

If authentication prevents access, do not work around it by:

- bypassing production authentication;
- inventing credentials;
- altering user data;
- clearing session state.

Request manual authentication instead.

If required test data does not exist, explain which state could not be visually verified.

## Output

After browser validation, provide a concise report.

Use this structure when a formal browser review was requested:

# Browser Validation

## Result

**PASS**

or

**ISSUES FOUND**

## Validated

Summarize the actual workflows and states inspected.

Include relevant viewport categories, for example:

- desktop
- tablet/narrow desktop
- mobile

## Findings

List concrete visual, interaction, console, or network issues.

For each issue include:

- affected state or workflow
- observed behavior
- expected behavior
- severity where useful

Do not list speculative issues.

If none:

`None.`

## Console / Network

Summarize relevant console and API observations.

Do not include unrelated pre-existing noise unless it materially affects the feature.

## Limitations

List anything that could not actually be verified.

If none:

`None.`

## Conclusion

State whether the UX implementation behaves correctly in the actual running RSSMonster application.

End with exactly one of:

**Browser validation: PASS**

or

**Browser validation: ISSUES FOUND**