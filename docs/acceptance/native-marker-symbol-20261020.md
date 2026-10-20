# Ordinary line marker symbols — 2026-10-20

## Bounded contract

Ordinary line charts now support optional per-series `markerSymbol: "circle" |
"square"`. Marker visibility remains the existing independent `markers` boolean;
None does not become a competing shape value. Unset symbols retain the old circle
behavior, native XML bytes and minimum snapshot version. An explicit symbol uses
conditional snapshot V93; size-only documents continue to use V92. Explicit size
remains an exact integer from 2 through 72 points.

Core preserves dormant and hidden shape/size choices. The Web exposes Auto,
Circle and Square only for ordinary line charts, with independent reset and
command history. Hidden controls retain their choices and allow clearing the
explicit leaf. Visible squares use real rectangular geometry. Plotted screen/print markers use
the same point-to-CSS-pixel extent as circles (size × 4/3); legend/data-table keys
preserve circle/square shape at their independent normalized key sizes.
Other chart families do not gain symbol controls or native support in this slice.

Native import admits only circle, square and none with the existing strict size
and source rules. Circles remain implicit on import; squares restore the explicit
leaf. Unsupported triangle, diamond, automatic and arbitrary shapes, malformed
symbol leaves, unsupported families and lossy hidden/dormant state still fail
closed rather than silently changing shape. Existing line colors, widths,
axis titles and placement are not newly broadened.

## Actual WPS persistence experiment

WPS Sheets 12.1.2.29182 was operated on the dot cloud desktop with its existing
accepted isolated profile. No new agreement, installation or account access was
needed. The synthetic apple/pear workbook was copied from the prior verified
circle9 WPS-saved fixture, then edited through the actual Marker panel:

1. Circle9 → Square: the control retains Size9; saved XML is square/9.
2. Square9 → None: before closing, the disabled UI still shows square/9. Saved XML
   contains none and no size. With both series hidden, WPS writes family marker=0.
3. Close/reopen None: disabled Size is now6. Enabling Built-in produces square/6,
   not the original square/9.
4. Square6 → Circle: Size6 is retained and saved XML is circle/6.

These observations justify preserving latent state in project JSON but blocking
native export when that state would be discarded. The existing all-hidden WPS
family marker=0 import boundary remains deliberately unchanged.

See `evidence/native-marker-symbol-20261020/wps-persistence-inspection.json` for
file hashes and inspected symbols/sizes. The fixtures are synthetic; no screenshot,
profile, credential, installer, dependency or temporary WPS lockfile is published.

## Validation

Validation and end-to-end Web/WPS results are recorded below.
This is a scoped milestone, not a full-suite-green or Excel validation claim.
Excel Online and LibreOffice were not used.

### Web → JSON/XLSX → WPS → product readback

The production build was exercised in the dot cloud browser at port 7200. The
actual WPS square9 fixture imported with its chart present and no marker-shape
omission. Existing unrelated axis-text, stroke-geometry and marker-stroke warnings
remained visible; they were not suppressed.

- The Series: apple pane showed Square, 9 pt and 2 px line width. Its three blue
  SVG paths were genuine square paths with transformed width/height 12 CSS px.
- Selecting Circle changed those paths to arcs without changing the 12 px extent.
  The normal Undo button restored squares. Hiding markers retained disabled Square
  and 9 pt controls. Resetting only the shape cleared that leaf; Undo and re-enable
  restored Square/9 without changing the line width.
- Normal File → Export JSON downloaded project JSON with conditional V93, retained byte-for-byte as
  `web-square9.json.fixture` (the suffix prevents source formatters rewriting it).
  Reimport through File → Import JSON restored the same Square/9/2 controls.
- Normal File → Export XLSX, including its existing compatibility confirmation,
  downloaded `web-square9.xlsx`. It contains a native chart and drawing, not a
  picture. The XML has square/9 for apple and none for pear.
- WPS opened that exact download without a repair prompt. Its Marker panel showed
  Built-in square with Size 9. F12 Save As produced `web-square9-wps-saved.xlsx`;
  the saved XML still has square/9 and none. No repair or recovery dialog occurred.
- Both files decode to the same supported marker/size and 2 px/4 px line-width
  state, V93 project snapshots, and finite ECharts SVG with three 12×12 px squares.
  Native re-export/readback retains those supported fields. The synthetic chart's
  axis title styles and 640×400 geometry remain present.

`web-wps-readback.json` records file hashes, the supported styles, actual renderer
bounds and remaining compatibility warnings. Chart snapshot roundtrip is stable;
whole-workbook snapshot stability is checked after existing table-style color
case normalization. This is not a claim that unrelated native styling is lossless.
The Web's Auto choice means its legacy implicit circle, not WPS's automatic-shape
mode, which remains unsupported by the native reader.

### Automated checks and independent review

- Core focused marker/lifecycle/version tests: 6 files, 22 passing.
- Native focused symbol/size/line coverage: 4 files, 225 passing.
- Web focused marker consumers: 10 files, 350 passing. The final bounded aggregate,
  including adjacent short-chart/axis/legend/pane tests: 14 files, 445 passing.
- Core chart aggregate: 424 passing, 1 pre-existing failure across 35 files. The
  range-series promotion color-index mismatch is the previously recorded baseline.
- Native chart aggregate: 769 passing, 2 skipped, 2 pre-existing failures across
  26 files. Both failures concern unsupported title-source handling, not markers.
- Four broader Web files: 75 passing, 15 failures. Failure names exactly match the
  prior independently reproduced baseline; see `baseline-failure-comparison.json`.
- Final complete workspace typecheck and build pass with a 4 GB process-local Node
  heap. The build retains existing chunk-size/dynamic-import warnings. Two initial
  new test-fixture typing errors were corrected; the interrupted first build is not
  counted as a pass. Scoped formatting and lint checks pass.
- Independent static review against the frozen parent commit checked V93 raw
  presence gates, V92/default compatibility, native fail-closed behavior, hidden and
  dormant state, Web controls/history, square geometry, print and legend consumers.
  It found no blocking issue and independently inspected the actual WPS XML.

All heavy checks were serialized. No full-suite-green claim is made. Print-path
coverage is automated renderer coverage, not a claim of a physical printer test.

## Remaining boundary

WPS writes family marker=0 when every line series is hidden. That family-level
variant still intentionally fails closed; this slice only admits circle/square/none
under the existing supported ordinary-line structure. Automatic value-axis bounds,
headroom and tick intervals also remain a separately documented parity gap. No
triangle, diamond, automatic-symbol or blanket marker-shape acceptance was added.
