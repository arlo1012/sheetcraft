# Ordinary line hidden markers — 2026-10-20

## Bounded fix

Actual WPS all-hidden ordinary line charts now import rather than losing the
entire chart. The reader requires a single explicit family `c:marker` Boolean
leaf (`0`, `1`, `false`, or `true`) and still proves each series' explicit
circle/square/none symbol and supported size. Family false is not a hide-all
instruction: an explicit square or circle remains visible. Missing family or
series markers, malformed flags, automatic/unsupported shapes, per-point
geometry, smoothing and other unsupported source semantics remain fail-closed.

This is a reader boundary expansion, not a new Core setting. The native writer's
existing family=1 output and explicit per-series marker encoding are unchanged.
Core still preserves hidden explicit shape/size in project JSON, while lossy
native exports remain blocked before resources are accessed. No global
`presentation.lineMarkers` export admission, new symbol, or schema version was
added. Default visible-circle XML remains byte-for-byte unchanged. Explicit
symbols remain V93; size-only remains V92; the all-hidden fixture uses V91.

A renderer regression was also reproduced: ECharts substitutes a circle for a
hidden line's legend symbol. Ordinary hidden line series now use the existing
Combo plain-line legend override. Visible/default circles and squares, identities,
line widths, legend allocation, data-table dimensions and print budgets are unchanged.

## Real WPS evidence and precedence

WPS Sheets 12.1.2.29182 was operated on the dot cloud desktop using the existing
accepted profile. No new installation, agreement, account access or app setting
change was needed. Excel Online and LibreOffice were not used.

Before editing source, the old decoder returned zero charts and a chart-part
feature-omitted issue for `wps-symbol-none.xlsx` from the previous marker-symbol
milestone. Actual WPS opened it without repair and showed both colored lines with
no points. Reopening and Save As produced `wps-all-hidden-resaved.xlsx`, retaining
family=0 and two explicit none series, without size or shape guesses.

A controlled copy of the WPS square9/none workbook changed only family=1 to 0.
WPS still displayed all three blue squares and no green points. Save As normalized
the family flag back to 1, leaving square/9 and none untouched. Both controlled
input and actual saved output are retained. This independently establishes
series override precedence rather than assuming it from the Boolean's name.
Microsoft likewise documents that Office ignores this family flag when deciding
marker visibility: [MS-OE376 §2.1.1260](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/4909f516-3a14-4afd-bb65-684190566117).

The controlled ZIP copy retains directory entries, which the existing reader
reports as feature-omitted paths. Those packaging warnings are not suppressed or
mistaken for chart loss; tests assert the chart part itself is retained.

## Web → JSON/XLSX → WPS → readback

The rebuilt production app ran in the dot cloud browser at port 7200.

- Normal File → Import XLSX retained the real all-hidden chart. Six existing
  style warnings remained visible. Both lines were visible, with zero point paths.
- The apple pane showed markers unchecked, Auto shape/size disabled and width 2.
  Show → Hide → Undo → Undo produced 3 → 0 → 3 → 0 blue point paths. Green points
  stayed hidden. No explicit size or symbol was invented by re-enabling defaults.
- Normal JSON export and reimport preserved the all-hidden state and V91. The
  exact browser download is `web-all-hidden.json.fixture`.
- Normal XLSX export, after its existing compatibility confirmation, produced
  `web-all-hidden.xlsx`: a native chart/drawing, two explicit none series and
  the writer's unchanged family=1. It is not a screenshot fallback.
- Actual WPS opened that exact download without a repair prompt, displayed both
  lines with no points and saved `web-all-hidden-wps-saved.xlsx`. WPS changed the
  family flag to 0, retaining both explicit none series.
- Product readback of all five experiment/download files has finite SVG geometry,
  correct point counts, retained line widths and source identities, stable chart
  snapshots and stable supported native chart re-export. Mixed square state stays
  V93; all-hidden stays V91. Remaining style warnings are recorded honestly.

See `evidence/native-hidden-markers-20261020/web-wps-readback.json` for SHA-256
hashes, inspected marker XML, decoded state, point counts and compatibility issues.
Only synthetic test data is included; no screenshots, profile, installer,
credentials or WPS lockfiles are published.

## Verification

- Native focused: 4 files, 226 passing, including 33 new hidden-marker cases.
- Native chart aggregate: 802 passing, 2 skipped, the same 2 previously documented
  native title-source baseline failures, across 27 files.
- Core chart aggregate: 424 passing, the same range-series promotion color-index
  baseline failure, across 35 files. No Core files changed.
- Web focused actual SVG/Canvas tests: 2 files, 39 passing. Three new cases cover
  all-hidden/mixed imports, real point/line painting, plain legend/table keys and print.
- Expanded Web aggregate: 15 files, 469 passing, 1 previously documented baseline
  failure (the Percent/Percentage error-message assertion). It matches the existing
  15-failure baseline record from the broader four-file check; those unrelated
  failures were not fixed or reclassified.
- Final workspace typecheck and complete production build pass. Scoped formatting
  and lint pass. Heavy checks were serialized with a 4 GB process-local Node heap.
  Existing chunk-size/dynamic-import build warnings remain. Initial new-test typing
  and happy-dom fixture-path issues were corrected; failed intermediate checks
  are not counted as passes. The Canvas recorder calls fill on zero-area open
  legend-line paths, so the final regression checks their geometry, not call count.
- Independent review approved both production changes, per-series precedence,
  Boolean/shape guards, unchanged defaults/versions and scope. Review did not
  substitute for the runtime checks above.

This is not a full-suite-green, physical-printer, Excel or remote-CI-green claim.
The auto-axis heuristic and unrelated baseline failures are untouched. The prior
marker-symbol report's all-hidden family=0 boundary is superseded by this report.

## Remaining boundaries

Missing family/series marker nodes and unsupported automatic/triangle/diamond
symbols remain explicit unsupported import cases rather than inferred defaults.
Latent explicit marker geometry remains project-persisted and native-export
blocked when WPS would discard it. Separately documented automatic axis bounds,
headroom and tick-interval parity remain unresolved.
