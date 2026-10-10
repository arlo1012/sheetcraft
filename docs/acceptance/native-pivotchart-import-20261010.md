# Native PivotChart import checkpoint — 2026-10-10

## Scope and status

Current bounded clustered-column import implementation plus the prerequisite DXF
ordering correction. Final-code WPS and Excel functional
import/export, explicit refresh and save/close/reopen validation passed. The
border-only control is separate from the regenerated product acceptance. WPS
post-save reimport support was subsequently checked as described below. The whole insert roadmap is unfinished.

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
- Final variant Web typecheck also passed. Additional whole-repository architecture
  check failed initially with 129 diagnostics. Renaming a local native XML
  `location` variable in the new cache-layout module removed its three lexical
  browser-global false positives. The rerun still fails with 126 diagnostics on
  code lines already present in `32f0a5b` (checker unchanged), including existing
  local history/location names and TDesign selector/adapter findings. Exact logs
  and `boundary-baseline-proof.json` are retained. No aggregate check pass or
  clean whole-repository CI is claimed; unrelated diagnostics were not expanded
  into this feature's scope.
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
no repair banner. Editing source C2 from 110 to 120 left report/chart at 110/530;
native PivotTable → Refresh All updated the report to 120/540, followed by the
chart settling at 120. After autosave, returning to Excel Home closed the workbook
view; reopening the same file retained 120/540, field assignments and category
order. The test workbook view was closed back to Home. No local download of the
Excel-saved workbook is claimed.

The compiled public API recipe independently produced `sc-import-final-wps.xlsx`
(11534 bytes, initial SHA-256 `346cb7aa7d894279063e7f5ba3c3a2f9fa3f296b418114b67de5d200efd4473c`).
Real WPS first-open, edit 110→120, explicit Refresh, Ctrl+S, Ctrl+W and Recent-file
reopen likewise retained native chart north/apple 120 and report total 540. This
was repeated against the DXF-corrected code, not the earlier WPS run. Test closed.
WPS-saved local bytes SHA-256 `2a97fe01afd815472d108bc3714a761513a4926e071fc1bbb646a368ed350b59`.

## WPS-saved file reimport, failure and correction

Additional public-API decoding of that actual WPS-saved file initially failed with
`drawing-or-media`. Real XML difference: the inert WPS chart-properties GUID leaf
and a one-cell absolute frame (`a:off x=1660525 y=1320800`). After the narrowly scoped
leaf admission it still omitted the chart for “Unsupported one-cell frame
transform”. Both findings motivated the bounded post-save variant support; no
unknown drawing namespace was globally enabled.

The corrected decoder imported the actual saved file with linked categories
east/north/south, apple values 60/120/120, pear 70/80/90 and total 540. It reports
geometry approximation and native style omission. Reexporting through the compiled
public API produced `sc-import-post-wps.xlsx`, 11434 bytes, SHA-256
`b1d93405bfebfd2fce611f14a7eddf29b679486f8e96e7db9a05966669628a97`.
Decoding it again retained 120/540; changing source to 130 stayed cached at 120
until the explicit Core refresh changed chart/report to 130/550. Public-API proof
is `wps-saved-public-api-check.log`.

The synthetic post-save regressions use generated structure and a synthetic GUID,
not the new GUI file. Initial focused run had 85 pass / 3 fail, because the three
omission assertions expected undefined rather than Core's empty drawing array.
That test expectation was corrected without weakening the omission check; initial
log retained. Final variant-focused run: 2 files / 88 tests passed. Final full XLSX package:
75 files / 965 tests passed. XLSX types/build and scoped lint/format passed.
Logs are `wps-save-variant-focused-final.log`, `xlsx-all-after-wps-save-variant.log`
and `wps-save-variant-static.log`. After the final local-identifier rename,
`variant-final-static-focused.log` records types/build/scoped lint/format and
88 passing feature tests; the preceding full semantic-code run was 965 tests. The post-WPS-save reexport additionally opened
in normal Excel editing view without repair, with chart 120 and selected D8=540;
that view was closed to Home. No additional source mutation/reopen cycle was
performed on this last reexport because those flows were covered above.

## Evidence and privacy

Only source, tests, the ordinary text records and logs are included in this
checkpoint. The original three sanitized WPS producers are already committed
under `evidence/wps-pivotchart-producer-20261010/`; no new GUI XLSX or screenshots
are published here. No account URLs, login cookies, browser profiles or credentials
are captured. Screenshots were observed locally and are not in Git.
