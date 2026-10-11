# Deferred export-warning work in progress

Base `ca10c80f2a403995be349f5287d91d25626a17bf`. This is a recoverable regression
specification checkpoint, not a completed export-warning fix. Product code has not
changed. Symbol's full desktop-aligned capability and layout now take priority.

The two `.pending` files preserve exact test bytes at the pause. They are outside
the live test include/type roots so a known red WIP does not alter current product
checks. `manifest.json` identifies their original paths and SHA256/size. To resume
this work, copy them to those original paths, then run the focused Web tests and
implement the minimum existing controller/feedback-dialog changes.

The original run is `../../../acceptance/evidence/xlsx-export-warnings-20261011/baseline.log`:
16 tests,8 genuine failures/8 passes. Failures prove warning payload discarded,
warning GUI absent, and a cancellation after worker resolution or while an already
initiated download is pending can publish late success. Passing cases include
block/no download, download failure, disposal, existing no-warning UI and import
confirmation behavior. There is no completed warning GUI or type/build claim.

Minimum intended contract: download succeeds first, then the existing XLSX feedback
Dialog shows warning code/count and exact reported locations; total is sum(count),
not issue length/position length. Native reports cap each code at10 locations and
may have none; identify unlisted occurrences accurately. Preserve block handling,
no-warning success, encrypted exported key and filenames, and no late success after
cancel/disposal. A started browser download cannot be recalled by dismissing a dialog.
No native format or persistent settings changes are needed. Import policy is unchanged.

Later update `docs/xlsx-io.md`, `docs/insert/wps-alignment.md`, current scope/handoff
and the historical API-versus-GUI warning correction. Existing icon/equation raw
workbook exports remain local; this checkpoint contains only source/test/text.
