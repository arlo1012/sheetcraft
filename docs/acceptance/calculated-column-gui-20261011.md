# Calculated columns: actual UI acceptance (2026-10-11)

## Status and tested environment

The new Core, Web and bounded native XLSX paths were exercised in the actual
Sheetcraft browser UI, local WPS Sheets 12.1.2.29182.AK.preread.sw, and Excel web.
All workbooks contained isolated synthetic test data. The cloud loopback service
was bound to 127.0.0.1:7200. The existing Excel session was available after an
ordinary page refresh. No login data was extracted or backed up.

The saved WPS copy has been decoded through the public XLSX adapter. After
specific confirmation of replacement/history clearing, the backed-up isolated
Sheetcraft workbook was replaced with that copy in the actual UI. The imported
exceptions, row inheritance, saved reload and later inheritance all passed.

## Actual Sheetcraft paths

The existing isolated test workbook was preserved. A new Sheet4 held the new
calculated-column scenarios, with Item / Qty / Result headings and quantities
2/3/4. Table3 used A1:C4; the Result data cells were initially truly blank.

1. Keyboard-entered C2 `=B2*2` filled C2:C4 to 4/6/8. One Undo reverted the
   user's input and automatic propagation together; Redo restored all three.
   This intentionally differs from the observed two-step native WPS Undo.
2. Native cell-editor paste of the same formula followed by Enter changed only
   C2; C3/C4 remained blank. Formula-bar paste likewise changed only C2.
   Keyboard-entered formula-bar input filled the initially empty column.
   External grid plain-text paste retained its existing literal-text protection.
3. Manual C3=99 and clearing C4 preserved those exceptions. The explicit
   whole-column dialog identified C2 as canonical anchor, C2:C4 as target, and
   explained replacement of values/formulas/blank exceptions/filtered members.
   Cancel left data unchanged.
4. Invalid `=B2*` kept the draft/workbook. Its initially generic failure message
   was corrected and rechecked in the actual UI. A corrected `=B2*3` explicitly
   produced 6/9/12 and closed the dialog.
5. Undo restored 4/99/blank and the earlier `=B2*2` template; Redo restored the
   replacement. After Undo, adding D/5 below the table inherited C5=10, proving
   that Undo restored the template as well as actual members.
6. Pasting `=B3*10` in the native editor made C3=30 only. Adding E/6 inherited
   C6=12 from the original template, not the pasted exception.
7. Save and ordinary page reload retained 4/30/blank/10/12. Adding F/7 afterward
   inherited C7=14, proving persisted template restoration.
8. A second table (Table4, E1:G4) started with 99 in G2 and blank G3/G4. Typing
   G3 `=F3*2` retained 99/6/blank, with no automatic backfill. Adding D/5 later
   inherited G5=10 from the canonical F2*2 template.

## Actual UI exports

The UI exported JSON and XLSX through its own file controls. Local inspection
found snapshot version 45, Table3 A1:C7 with B2*2 and Table4 E1:G5 with F2*2.
The XLSX had explicit calculated-column metadata for those two columns and none
for the two existing ordinary tables. Existing sheets were retained.

The first XLSX download wait timed out during a development rebuild. A fresh
stable menu interaction then exported the file successfully. The timeout remains
recorded; it is not counted as a successful download or a native-writer failure.

The local JSON and XLSX backups exist and are independently hashed. They and all
new raw producer workbooks/XML/screenshots remain outside Git. Source, tests,
reproducible synthetic generation code and this plain-text record are the intended
checkpoint material.

## Actual Excel web paths

The actual UI-generated XLSX was uploaded through the normal Excel file control,
using the existing signed-in session and the same browser tab.

- It opened with the expected 4/30/blank/10/12/14 Result members and the second
  table's 99/6/blank/10 exceptions, without a repair prompt.
- Changing B2 to 7 updated C2 to 14 while C3=30 and C4 blank remained.
- Appending G/8 to Table3 inherited C8=16. Appending E/6 to Table4 inherited G6=12
  while its existing 99 and blank exceptions remained.
- Excel displayed the saved state. Returning to its home page and reopening the
  same test document retained the updated members and exceptions.

Excel's public Download a copy control was attempted. The browser visibly reported
one 14.3 KB completed download, but the automation download event timed out and
no corresponding local file was found in the known download directory. A later
public-control attempt also timed out. No private URL, cookie or browser-profile
extraction was used. Excel GUI save/reopen is verified; an Excel-saved native copy
has not been locally parsed and is not claimed as adapter round-trip evidence.

## Confirmed WPS-saved copy import in the actual product UI

The original isolated product workbook had separate JSON and XLSX backups. After
the explicit confirmation, its current synthetic Sheet4 state was verified and
the local WPS-saved exception copy was selected through Import XLSX. The visible
Replace and import control disclosed replacing the saved local copy and clearing
Undo history. It was confirmed, and the Data sheet replaced the old isolated
workbook. No user file was involved.

- Initial imported values were 14 / 99 / blank / 10, matching the WPS-saved copy.
  Immediate Undo did not restore the prior Sheet4 workbook.
- Adding E/6 below the table inherited C6=12 while the 99/blank exceptions stayed.
- Save locally and an ordinary page reload retained the imported values and the
  added row. Adding F/7 afterward inherited C7=14, with old exceptions unchanged.
- A final UI JSON export was successfully captured locally. Its version was 45,
  Sales range A1:C7, canonical Result formula =B2*2, actual C3 literal 99 and C4
  blank, with C6=B6*2 and C7=B7*2. This backup remains local, outside Git.

During this delayed final step, the older browser test tabs showed Error 9. The
saved Excel test tab was closed, and a normal reload of the authorized local
HTTP page recovered the product UI. The two user pages were left untouched. This
transient cloud-browser failure is retained as environment evidence; no private
error-page DOM or security-warning bypass was used.

## Latest code checks and retained failures

- Core calculated-column foundation/lifecycle/structure: 3 files / 59 passed.
- Latest related Web group: 12 files / 142 passed, one worker.
- Latest related XLSX group: 10 files / 214 passed, including 50 native
  calculated-column cases, table totals, table filter ownership/buttons,
  structured-reference export, styles, Normal font and ZIP preflight.
- Earlier implementation and regression failures remain recorded in the feature
  checkpoints. Independent native review reproduced three failures before the
  ancestry-attribute and SPILL-template fixes; the first correction also exposed
  an AST-field mistake and a stale test table ID, both fixed before the passing
  run. These failures are retained, not replaced with a blanket green statement.
- Final Core/sheet-engine/XLSX types and all three package builds passed. The
  first serial full Web typecheck reported TS2367 on a generic target comparison.
  The dialog now takes its specific failure-message context explicitly; its
  3-file / 60-test regression group and the final complete Web typecheck pass.
  Final XLSX types/build and scoped lint/format (42 source/test files) pass.
  Unstaged source diff-check passes; frozen original logs retain their original
  whitespace.
- Full-repository tests and remote CI were not rerun. The earlier architecture
  baseline of 125 unchanged diagnostics remains a known separate result.

## Current boundaries

Unknown/native templates are never inferred from cells. Unproved array/spill/name
or cross-table formulas and namespace/semantic attributes omit only the template
with a located compatibility warning. Actual worksheet members remain intact.
Prefixed native filters still have a specifically reported existing reader limit.
Numeric-constant totals retain the prior explicit XLSX export restriction.

The original 23-file Core structural freeze was published and its exact tree
verified at 1b624740566470fcf4798d87387e06ea71753ed6. The later Web/native
48-file cumulative snapshot was frozen separately, retaining earlier snapshots
and failure evidence. That cumulative snapshot was published and verified at
f47042699ec6201f32b9582a82a8a54221f18fdf (tree
886903c769d064f145bfb1f99a9b6c664665e041), with no new code beyond its
frozen tested content. GUI replacement is complete. This report does
not assert full Insert completion, a full green CI run, or support for every
native calculated-column formula family.
