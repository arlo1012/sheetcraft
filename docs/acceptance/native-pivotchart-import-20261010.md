# Native PivotChart import checkpoint — 2026-10-10

## Scope and status

Current bounded clustered-column import implementation plus the prerequisite DXF
ordering correction. WPS functional import/export validation passed. Final-code
Excel first opening passed without repair; refresh/save/reopen validation is in progress; the border-only control is
not treated as final product acceptance. The whole insert roadmap is unfinished.

## Checks

- Core manual-member prerequisite: 177 files / 2621 tests, Core types/build and
  Web typecheck passed in the previously published `32f0a5b` checkpoint.
- Initial XLSX full run: 75 files, 925 passed and 1 failed (926 total). Classic notes
  with an empty drawing directory regressed in the gate; the original directory
  exception was restored. Initial failure log retained as `xlsx-all-pre-review.log`.
- Subsequent import package run: 75 files / 950 tests passed (`xlsx-all-final.log`).
- After the shared DXF correction: four focused files / 90 tests passed
  (`dxf-import-focused.log`). Final full package rerun: 75 files / 951 tests passed (`xlsx-all-after-dxf.log`).
  XLSX typecheck/build, scoped lint and formatting passed (`import-final-types-lint.log`).
- Full Web typecheck passed (`web-types-final.log`); this is not all Web tests.
- Final independent import review did not complete. Its task was stopped by a
  content-risk tool response; it was not retried through another task or route.
  No completed final independent review or aggregate repository CI is claimed.

## Real WPS acceptance

Using the public XLSX decode/encode APIs on the committed `native-source-edited-stale`
producer, first opening `sc-import-stale.xlsx` showed source 110, cached north/apple
100 and grand total 520. Native PivotTable Analyze → Refresh updated table and
chart together to 110 and 530, preserving east/north/south and apple/pear order.
Save, close and reopen retained 110/530 and the native field pane. The synthetic
workbook window was then closed. The initially mistargeted cell selection was
undone and the source header verified before the actual validation began.

## Excel failure and single-factor diagnosis

The product-created `sc-import-refreshed.xlsx` opened with “Workbook repaired”,
read-only. Technical details named removed `/xl/styles.xml` (XML error, line 1,
column 0), repaired cell information in sheet1/sheet2 and repaired table1.

Single-factor `sc-import-border-control.xlsx` changed only the child order of one
four-sided DXF border in `xl/styles.xml`; all other parts remained byte-identical.
SHA-256: `b01ef5b25660ed00b0073426d6995814a8c0a7f7a8f15233ceb565701fc5a24b`.
It opened in normal Excel editing view, showed “Saved”, and had no repair banner.
This identifies the styles issue; final regenerated product acceptance is separate.

Final corrected public-API product `sc-import-final-refreshed.xlsx`: 11537 bytes,
SHA-256 `b4dc50b05b48fbbf49a22d37c09af55658d3f917d61d93cb947974c63bf866cc`.
The regenerated file opened in normal Excel editing view and showed “Saved” with
no repair banner. Final Excel refresh/save/reopen verification is pending here.

## Evidence and privacy

Only source, tests, the ordinary text records and logs are included in this
checkpoint. The original three sanitized WPS producers are already committed
under `evidence/wps-pivotchart-producer-20261010/`; no new GUI XLSX or screenshots
are published here. No account URLs, login cookies, browser profiles or credentials
are captured. Screenshots were observed locally and are not in Git.
