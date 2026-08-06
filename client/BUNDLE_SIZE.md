# Production bundle-size budgets

Run `npm run verify:build` to create a production build and check its initial
entry assets. When `dist` already contains a current production build,
`npm run check:bundle-size` runs the check without rebuilding.

The checker reads Vite's generated `.vite/manifest.json`, so it identifies the
entry JavaScript and CSS plus the stable `vue-vendor` and `axios-vendor` chunks
without relying on content hashes. It also follows
the entry's static imports recursively and budgets the complete initial
JavaScript graph. Both raw and gzip bytes are checked.

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
icon-system or design-system reductions should be handled as separately
measured changes.

## Bootstrap retirement guard

Run `npm run check:bootstrap-classes` to scan production Vue, JavaScript,
HTML, CSS and SCSS plus the Vite entry configuration. `npm run verify:build`
runs this fast source check before producing and measuring the bundle.

The guard recognizes static `class` attributes, simple string values inside
`:class` bindings, class strings returned by methods, and directly returned
arrow-function strings. It rejects every recognized Bootstrap component or
utility class, unresolved Bootstrap-looking class template, framework and
Bootswatch imports, Popper imports, `data-bs-*` attributes, `--bs-*` custom
properties and Bootstrap's global JavaScript component API. There is no legacy
allowlist or usage baseline.

The independent `bootstrap-icons` package and RSSMonster's generated icon
sprite remain allowed. New presentation code must use an RSSMonster-owned
primitive or component selector.

## Client production CSS baseline

This baseline was measured on 2026-07-30 from commit
`19543f9c78e71ea6dc144499ad8260132d775e22`. Client production sources matched
that commit; the unrelated uncommitted server change did not affect this build.
The build used Node.js 22.23.2, npm 10.9.8, and Vite 8.1.5 under WSL Ubuntu.

The bundle-size checker defines initial-entry CSS as the `css` array on the
manifest's `index.html` entry.

The icon component's scoped stylesheet is included in the entry CSS. The icon
sprite is build-time application code and no longer requires a separate icon
vendor chunk.

Gzip totals are the sum of independently compressed responses, matching how the
checker calls Node.js `gzipSync()` for each asset. No bundle-size budget was
changed when recording this baseline.

### Measurement procedure

1. Use the Node.js version required by `package.json`, then run `npm run build`
   from `client/`. This creates a clean Vite production output because the
   default `dist` directory is emptied before the build.
2. Run `npm run check:bundle-size`. Record the `Initial-entry CSS` result; the
   checker reads `dist/.vite/manifest.json` and compresses the emitted file with
   Node.js `gzipSync()`.
3. In `dist/.vite/manifest.json`, locate the record with
   `"src": "index.html"` and `"isEntry": true`. Its `css` array is the
   budgeted initial-entry CSS. Recursively inspect its `imports` for additional
   CSS in the initial graph.
4. Follow `dynamicImports` from the entry and from other dynamic entries.
   Records with `"isDynamicEntry": true` and a `css` array identify lazy CSS and
   its owning source module. Content hashes may change between builds, so use
   manifest relationships rather than matching filenames.
5. For an exact raw measurement, read each emitted asset as bytes. For the
   comparable gzip measurement, use Node.js `gzipSync(contents).byteLength`.
   The style-bearing modules listed above were cross-checked against the module
   sources in an otherwise identical Vite sourcemap build outside `dist`.

## Icon delivery boundary

Bootstrap Icons is independent from the retired Bootstrap framework. The Vite
plugin reads only the explicitly enumerated SVG files from `bootstrap-icons`
and emits the application sprite through `virtual:bootstrap-icons-sprite`.
There is no Bootstrap or Popper JavaScript vendor chunk.
