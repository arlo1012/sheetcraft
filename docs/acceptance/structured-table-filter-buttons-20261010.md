# Structured-table filter buttons — bounded acceptance, 2026-10-10

Parent checkpoint: `380cbed1096f297d24711ba57d765a941d51bf4f`. Scope is the
existing whole-table Filter buttons option and its native I/O, within the table
acceptance matrix. Snapshot43 and Core model are unchanged.

## Isolated native cause

The earlier buttons-off export wrote hiddenButton on tableColumn; WPS still
showed header arrows. An actual WPS Data Filter-off producer removed autoFilter
and showed no arrows. Removing autoFilter is unsuitable when active criteria must
remain, so a single-factor control moved the flags to filterColumn instead.
All other archive entries were unchanged. That same local control opened correctly
in actual WPS and Excel: no Sheet2 arrows, table and values retained, editable
without Excel repair. This is separate from the formal implementation below.

The standard [FilterColumn attributes](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.filtercolumn?view=openxml-3.0.1)
place hiddenButton/showButton on filterColumn, not tableColumn.

## Writer and reader contract

- Buttons off plus an existing filter writes hiddenButton1 for all columns on
  filterColumn. It retains actual criteria bodies and emits self-closing columns
  where no criterion exists. It never drops an active filter to hide arrows.
- A visible-button header table with null Core filter receives an unfiltered native
  autoFilter over its data/header range, excluding totals. It does not mutate the
  Core input. Its imported filter can be an equivalent empty-column filter.
- Buttons off with no filter needs no autoFilter. A native table with no autoFilter
  imports with buttons off, matching the observed WPS producer.
- Standard all-hidden flags import as false. The earlier product's misplaced
  tableColumn flags remain readable, but are never written again. Known
  showButton0/false is also parsed as off in focused synthetic regressions.
- Partial/malformed/duplicate native button flags cannot fit Core's global boolean;
  they warn at TableName.filterButtonVisibility and use the conservative visible
  state. No partial per-column visibility support is claimed.
- Empty visibility-only filterColumn elements, paired or self-closing, do not
  create an empty allow-list that would hide every data row. Unknown filter child
  handling continues through the existing compatibility mechanism.
- Duplicate active Core filter criteria are rejected, never silently collapsed.
  No new calculated-column, sorting or filtering UI is added.

## Actual product and target-app acceptance

Actual Sheetcraft enabled buttons on its existing synthetic Sheet2 table, selected
Alpha only with the real filter menu (Beta/blanks excluded), then disabled buttons
in Table settings. The table kept the criterion, hid rows3/4, showed subtotal10 and
no arrows. Actual Undo restored both arrows; Redo hid them while retaining the
filter. Save locally and normal reload retained this state.

Actual ExportJSON and ExportXLSX completed. The formal XLSX is an actual product
UI export, not API regeneration:7009B, SHA256
`98d124fa8f5c5c9609b2fb807268370b77a42f804a436cdf928c56e13a742fe3`.
Its native table metadata contains Alpha criteria plus both hidden button flags;
there are no misplaced tableColumn flags. The successful download event produced
a captured local file. A redundant normal browser save dialog was later closed;
the captured export remained intact.

Actual Excel and WPS each opened this formal file correctly, with hidden arrows,
only Alpha visible, total10 and no Excel repair. Real B2 edit10→11 recalculated
total11. Save, close and reopen retained values, criteria and hidden buttons in
each application. Public decode of the actual WPS save retains buttonsfalse,
criteria normalized to textEqualsAlpha, and exact B5 SUBTOTAL109 formula. WPS vendor
feature-omitted and13 formula-cache-discarded warnings remain; warning-free or
byte-identical native roundtrip is not claimed.

The converted Sheet1 was also checked in both target apps: the formerly filtered
South row is visible, no table arrows/context remains, D2 is ordinary =B2*C2 and20,
SUMF1 is121, and appearance persists. This closes the bounded converted-range
native lifecycle, not the outstanding product native import GUI.

## Checks and preserved failures

- Initial button regression:5 failed/1 passed, preserved.
- First related run:52 passed/1 failed on an old no-autoFilter expectation; it was
  corrected to require an unfiltered header range and no migrated criteria.
- Related7files/88tests passed before the final duplicate fixture.
- First full run:1154 passed/3 failed. Two old pivot cache fixtures had numeric
  literal totals, now correctly blocked; their cache-isolation positive fixtures
  now use explicit SUM formulas, and a separate literal-total rejection regression
  preserves the new contract. The third failure was the new test trying to
  serialize intentionally invalid duplicate filter metadata; it now checks raw
  source metadata preservation and the existing validation rejection.
- Focused failure-fixture recheck:2files/37tests passed.
- Final full XLSX suite: **81 files,1158 tests passed**, one worker,71.79 seconds.
- Full XLSX test types, forced package build with actual emitted code checked,
  scoped lint/format and whitespace passed. Full Web types passed in380cbed; this
  filter patch does not change Web files, and did not repeat unrelated guard runs.
- A fresh boundary check still fails with125 findings, exactly matching the earlier
  finding set (0 added/0 removed). Earlier header/guard/timeouts/interrupted logs
  remain. This is not a whole-repository CI claim.

All new actual XLSX/JSON/XML/screenshots remain local. Only source, reproducible
synthetic regression structure and textual evidence are saved to Git.

## Remaining bounded table matrix

Later text-only closure is recorded in `structured-table-matrix-20261010.md`.
The pending list below describes this original checkpoint, not that later state.

Stable Medium5 UI persistence, actual native import into the product, explicit
advanced-filter atomic-rejection UI and bounded WPS calculated-column observations
remain open. Numeric literal total-row XLSX incompatibility remains an explicit
location-bearing block; JSON backup is available. No full table/Insert completion,
calculated-column fill contract or support for partial native button visibility
is asserted.
