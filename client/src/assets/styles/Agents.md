# AGENTS.md

## Scope

Applies to `client/src/styles/`.

Follow the root `AGENTS.md` and `client/AGENTS.md` first.

Before changing styles, read the local `README.md`. It defines the styling architecture, theme tokens, semantic colors, and conventions for this directory.

## Working Rules

* Reuse existing tokens and variables before adding new ones.
* Do not hard-code colors when an appropriate token exists.
* Consider both light and dark mode.
* Prefer flexbox, grid, `gap`, and natural wrapping over positional hacks.
* Avoid unnecessary `!important`, negative margins, and arbitrary offsets.
* Keep shared styles generic; keep component-specific styling with the component when appropriate.
* Do not introduce duplicate utilities or competing theme variables.
* Preserve accessibility, contrast, and visible focus states.

## Final Standard

`read the README · reuse tokens · preserve themes · fix layout causes, not symptoms`