# CSS ownership

RSSMonster co-locates application UI styles with the Vue component that owns them. Component styles should use `<style scoped>` by default. A component may use a narrowly targeted `:deep()` selector for HTML it renders dynamically or for an explicit child-component layout contract.

The existing global files have distinct responsibilities:

- `theme.css` owns global design tokens, semantic color aliases, and light/dark theme values. It should not contain feature layout.
- `../scss/global.scss` owns the cross-browser document baseline, global typography defaults, document sizing and overscroll behavior, and reusable application-control primitives.
- `../css/settings.css` owns the Settings overlay and feature-wide Settings shell. Its selectors stay under `.settings-surface`, except for the body scroll lock applied while the overlay is open.
- `../../components/articles/articleContentOverrides.css` is intentionally global. It contains tightly namespaced compatibility rules for sanitized publisher HTML inside article boundaries, where scoped selectors cannot reliably reach injected markup.

Feature and component selectors should not be added to a global file solely to share a visual value. Reuse tokens for values, a base component for repeated UI structure, or a feature stylesheet only when several components share the same layout contract.
