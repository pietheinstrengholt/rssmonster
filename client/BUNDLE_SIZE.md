# Production bundle-size budgets

Run `npm run verify:build` to create a production build and check its initial
entry assets. When `dist` already contains a current production build,
`npm run check:bundle-size` runs the check without rebuilding.

The checker reads Vite's generated `.vite/manifest.json`, so it identifies the
entry JavaScript and CSS plus the `icons-vendor`, `vue-vendor`,
`axios-vendor`, and `bootstrap-vendor` chunks without relying on content hashes.
Both raw and gzip bytes are checked.

Budgets live in `bundle-size-budgets.json`. Update them intentionally only
after reviewing the production diff and recording a new clean-build baseline:

1. Run `npm run build` and `npm run check:bundle-size`.
2. Confirm that any increase is expected and that lazy-loading boundaries have
   not moved into the initial entry accidentally.
3. Adjust only the affected raw and gzip limits, retaining a small amount of
   headroom above the measured size.
4. Include the old size, new size, and reason for the increase in the change
   description.

The budgets are regression guards, not long-term performance targets. Larger
icon-system or Bootstrap CSS reductions should be handled as separately
measured changes.
