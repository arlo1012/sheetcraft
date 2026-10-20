# Ordinary line marker size acceptance — 2026-10-20

## Scope

Per-series `markerSizePt` is an optional exact integer from 2 through 72. The
shared Web numeric field edits points with step 1 and supports automatic reset,
owner leases, input-method composition, and command history. Explicit ordinary
line marker sizes render at points × 4/3 CSS pixels, including print. Absent
values preserve the existing Web default and native 5pt output bytes. Other
chart families may retain the leaf but do not gain native support in this slice.
Snapshots use version 92 only when the leaf is present; older envelopes reject it.

Native XLSX supports the proven ordinary rectangular line/circular-marker route.
Unsupported identities, dormant/source states, malformed sizes, and hidden
explicit sizes fail closed. Paint, outline, cap/join geometry, arbitrary symbols,
combination/area/radar charts and broad geometry are not newly supported.

## Actual WPS persistence experiment

WPS Sheets 12.1.2.29182 was operated through the cloud desktop UI using the
previously accepted isolated test profile; no new agreement or security setting
was changed. The synthetic two-series workbook has apple visible and pear hidden.

1. Built-in circle, Size 9, saves `<c:size val="9"/>`.
2. Switching apple to None and saving removes its size XML entirely.
3. Closing/reopening the None workbook displays disabled Size 6. Re-enabling
   Built-in produces square Size 6, not the original circle Size 9. The saved
   re-enabled file confirms `square` and `6`.

Consequently, Core retains a latent explicit size when hidden, but native export
must not silently discard it. The real all-hidden WPS file also writes family
marker=0; its existing import omission boundary is unchanged. Per-series None
without explicit latent size remains supported under the established family
marker=1 route.

## Actual Web → XLSX → WPS → saved XLSX verification

The current application ran at port 7200 in the dot cloud browser. The actual
WPS-authored 9pt fixture was imported through the normal file chooser. Its marker
size warning was absent, while unsupported outline/geometry warnings remained.

- Apple controls displayed 9pt. The increment button changed 9 to 10.
- The workbook Home → Undo action restored 9.
- Hiding markers retained the disabled value 9 and explanatory text.
- Reset remained available while hidden and cleared only the explicit size.
  Re-enabling displayed Auto; entering 9 restored the explicit override.
- The actual downloaded JSON uses version 92, apple size 9, apple markers true,
  pear markers false; deserialization and reserialization preserve version 92.
- The actual downloaded XLSX contains a native `xl/charts/chart1.xml`, not a
  picture fallback, with apple `circle`/`9` and pear `none`. The export retains a
  general compatibility warning for the chart; this is not a lossless whole-chart
  parity claim.
- WPS opens that XLSX normally. Its apple Marker panel visibly shows Built-in
  circle and Size 9. Saving a separate copy retains `circle`/`9` in OOXML.
- Sheetcraft reads both Web and WPS-saved outputs with size 9 and the same
  visibility and line widths (2px apple, 4px pear). A further native roundtrip
  preserves the styles and version 92.

Evidence is in `evidence/native-marker-size-20261020/`. The actual WPS source
fixtures live with native tests. No screenshots, credentials, profiles, installer
or dependencies are included in this acceptance evidence.

## Automated checks

- Core chart aggregate: 413 passed, 1 pre-existing colorIndex failure. The same
  failure reproduces from the c440759 source baseline.
- Native chart aggregate: 695 passed, 2 skipped, 2 pre-existing column-title
  failures. Native focused suite: 225 passed.
- Web changed chart files: 366 passed across 9 files.
- Independent contract review: no actionable blocker; 120 focused tests passed.
- Scoped format/lint for all 28 changed TS/Vue files: passed.
- Full workspace typecheck and production build: passed with process-local
  `NODE_OPTIONS=--max-old-space-size=4096`. Two earlier 6144-MiB attempts were
  killed at Web vue-tsc with exit 137 and no TypeScript diagnostic; these resource
  failures are recorded separately. Vite retains existing bundle-size and
  ineffective-dynamic-import warnings.

This is a scoped milestone, not a full-suite-green or Excel validation claim.
Excel Online and LibreOffice were not used.
