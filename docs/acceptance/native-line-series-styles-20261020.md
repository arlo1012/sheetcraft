# Native line series width and marker visibility — 2026-10-20

Base: `0ee7e18b933619d5d375c03a7e3c950256fdda9e`. This is a bounded ordinary,
primary, nonstacked straight-line I/O correction, not complete chart parity.
There is no Core schema, snapshot version, global renderer default, or axis-range
heuristic change.

## Behavior and boundaries

- Import explicit native line widths as CSS-pixel `strokeWidth` using EMU / 9525.
  Recover supported filled-circle visibility and explicit `none` into the existing
  per-series `markers` field. Bind styles to stable physical row/column identities,
  not display names or series ordinal alone.
- Export active, representable per-series width/visibility through the native line
  writer and the real Web export preflight. Dormant/unmatched bindings, opposite
  direction/header bindings, source/filter/Pivot states, color overrides, secondary
  axes, smoothing, zero or nonrepresentable widths, and unsupported leaves remain
  fail-closed.
- Admit the observed empty WPS `a:sp3d contourW` leaf only at the ordinary line
  series shape, with its sole contour width equal to the bounded sibling line
  width. Reject companion-style occurrences, extra attributes, child payload,
  mismatched widths, duplicate shapes, and duplicate contour leaves.
- Preserve baseline chart-with-warning behavior when a series shape is absent or
  empty. An independently representable explicit marker `none` must still survive,
  without inventing width or paint.
- Unsupported marker shapes and invalid native sizes retain chart omission with
  precise diagnostics. Native marker size/outline/paint and line cap/join geometry
  are not silently declared equivalent to the renderer.

## Historical real-app acceptance

The preserved WPS-authored synthetic fruit-data fixture has apple 1.5 pt with
filled circles and pear 3 pt with no markers, encoded as 19050 and 38100 EMU.
It is included at
`packages/xlsx-io/src/tests/charts/fixtures/wps-native-line-series-styles.xlsx`,
SHA-256 `841ece9d3dde9bfa9dc446504ab417b1741ea0e13626d0bb898b581a1d2bae01`.

Historical normal Web UI testing imported that file, observed 2 px / 4 px controls
and circle / none, edited apple to 3 px, exercised undo, exported through the
compatibility confirmation, and opened the actual download in WPS. WPS showed
apple 2.25 pt and pear 3 pt without an observed repair prompt. A fresh WPS Save As
and normal Web reimport preserved 3 px / 4 px and circle / none. This was an actual
GUI roundtrip, distinct from the mocked-worker action regression.

The original 14-file candidate and historical evidence were preserved unchanged
in a verified recovery checkpoint. Fresh review before publication corrected two
admission defects and independent marker-none recovery, and updated capability
entry and axis-title assertions for the newly recovered series state.

## Fresh verification

- Verified the recovery archive SHA-256
  `1f24974224309b0ceb7c6a9552f7973f364362ff7cef0a0d965d6c3f7e08ed96`,
  all 6,503 packaged file hashes, and all 4,960 restored project files. The 11
  existing frozen source base blobs match the remote base tree; the three new
  frozen paths were absent there.
- Corrected line-style regression: 33 tests passed, including exact-location,
  companion, duplicate-contour/shape, absent-shape, and marker-none cases.
- All native chart tests: 618 passed, two failed, two skipped across 24 files.
  The two failures are the unchanged `native-column-options.test.ts` cases
  “does not invent generated labels from wrong-index native title” and
  “does not invent generated labels from expression native title”. Their fixture
  replacement does not change the XML, failing at line 177 before decoding.
  Running the same cases on the restored base reproduces both failures; the
  baseline comparison has 90 passes and these two failures. They are not fixed
  or presented as green here.
- Web: 282 tests passed across native-WPS SVG rendering, chart source editing,
  clipboard-source handling, and real action/export preflight with a mocked
  worker. This is not a new actual-worker GUI run.
- Formatting and lint passed for all 15 touched TypeScript files.
- Full serial production build passed: Core, sheet-engine, XLSX I/O, Web
  `vue-tsc`/Node TypeScript, and Vite. The first attempt reached the default
  Node 2 GiB heap limit; a process-local 6 GiB limit completed successfully.
  Existing large-chunk and ineffective-dynamic-import warnings remain.
- Fresh default synthetic native line XML is byte-identical to the base:
  3,806 bytes, SHA-256
  `8fa8381001f87000e23e926391dfd75fdd9ed059724022475686973869c62412`.
- Re-decoded and re-encoded the unchanged archived actual WPS authored file and
  actual WPS GUI saveback: 2/4 px and edited 3/4 px respectively, circle/none,
  stable series IDs, and second-import styles all survive. Existing geometry
  warnings remain visible.

## Remaining limits

- Marker size, marker outline, and cap/join geometry are not fully represented.
  No marker-size implementation is included here.
- Same-name/different-native-color palette equivalence is not added.
- Existing automatic axis maximum differences, including Web 120 versus WPS 140,
  are unchanged.
- No new Excel Online validation or fresh desktop WPS GUI run is claimed by this
  restoration/publication step. The actual archived WPS input/saveback bytes are
  rechecked programmatically, and historical GUI evidence is labeled above.
- No full repository suite or CI-green claim. Generated runtime bundles,
  dependencies, screenshots, credentials, and unrelated baseline fixes are not
  part of the source publication.
