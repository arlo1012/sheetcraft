# Structured-table header/filter continuation — WIP, 2026-10-10

Parent checkpoint: `5e823043b80d4aa7b84456322b68562e79bbdcfb`.
This source/text checkpoint preserves the next actual UI findings while native
XLSX target-app acceptance remains open. It does not implement calculated columns.
Read the prior lifecycle record for its two initial failures and Web guard timeouts.

## Actual product UI

The same isolated synthetic workbook was used through normal controls. No workbook
state was injected through JavaScript. Creation without source headers generated
Column1/Column2 and preserved Alpha/10 and Beta/20; an empty A1 source produced
Column1 plus a blank data row. The three final tables had distinct workbook names.
Below-table and right-table single edits expanded the rectangle, the right edge
received Column5, and actual undo/redo restored the prior ranges. Added formula
cells stayed blank until explicitly entered; no automatic calculated-column fill
is claimed. Unfiltered final-cell Tab added a row and activated its first cell.
On the North-filtered table, Tab added row 6 but selection advanced to A7 because
its new blank row was filtered out. This exact observed behavior is retained.

Hiding headers on a generated-header table with an empty stored filter initially
made local save/export/history fail: table and filter bounds disagreed. The formal
fix recheck preserves successful header off/on, actual JSON download, Undo/Redo,
and browser-local save. The range/filter now shift together. Totals-only changes
also normalize a readable older filter that had included the totals row.

Conversion to range removed only Sales, kept its appearance/data, exposed the
formerly filtered South row, changed the local selector to `=B2*C2` and the named
sum to `=SUM(D2:D6)`, and retained 121. Undo restored the table/reference/filter;
Redo removed them again. Formal three-table JSON and XLSX exports and a converted
XLSX were downloaded through real controls and kept locally. A first 15-second
XLSX download-observer timeout is a retained harness finding; a fresh event with
45-second budget completed. It is not reported as a product pass or repair.

A Medium5 gallery click happened earlier, but the subsequent source-watcher reload
restored the saved Medium2 configuration. The actual final downloaded JSON and
native table parts prove Medium2, not Medium5 persistence. First-column and bands
were visible. A stable style-change persistence recheck remains to be completed.

## Advanced-filter safety boundary

The existing filter model requires a logical header and cannot hide its first row.
Removing a table header would shift an advanced-hidden first data row to that
unrepresentable row. The command now rejects this operation before mutation,
including combined header/totals changes. The existing cell-shift rejection for
advanced-criteria source sheets now also sees table-owned filters, preserving
actual external source cells instead of moving them while retaining stale pointers.

Other proven advanced hidden rows shift once with the table data and are clipped
to valid bounds. A real criteria source on another sheet stays unchanged. Existing
snapshot versions remain unchanged. The two unrepresentable cases are explicit
limitations, not fully supported header operations. The table UI presents a
localized explanation, keeps settings/draft and history, and permits correcting
that draft. No new filter geometry or source-guessing rules are introduced.

## Actual target-app results so far

- WPS opened the formal product XLSX with three native tables, the North filter,
  generated headers, totals, style/bands and blank appended row. Editing B2 2→3
  changed D2 to 30, filtered total D7 to 71, and F1 to 131. Save As, close and
  reopen preserved these values. A separate local WPS result is retained.
- A further real defect remains: Sheet2 Filter buttons=false still shows arrows
  in WPS. The existing writer places hiddenButton on tableColumn; the WPS saved
  version drops that attribute. Native WPS Data→Filter off removes autoFilter
  and hides arrows. The local single-factor producer is retained, not uploaded.
  Microsoft's FilterColumn documentation places hiddenButton/showButton on
  filterColumn: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.filtercolumn?view=openxml-3.0.1.
  A formal bounded writer/reader fix and both-app recheck are still pending.
- Excel web accepted actual uploads of both the formal product and WPS-saved
  variant, but each opened with Workbook repaired/read-only. Technical details
  explicitly report a repaired table in `/xl/tables/table1.xml`. This is a failed
  acceptance result. No edit/repaired-copy flow is counted as original-file
  success. The common table defect still needs a native producer and single-factor
  isolation. WPS success alone does not establish Excel compatibility.

All GUI XLSX/JSONs, raw producer XML, screenshots, browser document identifiers,
account details and authentication state remain local and excluded from this Git
checkpoint. Only code, focused synthetic regressions and plain operation/check
records are published. The earlier denied final Replace and import JSON action
was never executed and is not claimed as a recovery step.

## Checks

Adjacent text evidence preserves the initial 2 header-visibility failures, its
16-case fixed file, an expanded related run with 102 passed/1 failed, and the
corrected 103-pass reruns. That old assertion expected the filter to include the
totals row; the updated assertion checks the data-only bounds and serialization.
The safety review additionally reproduced the first-hidden-row loss and moving
criteria-source risk before the guards were added. Its read-only review is not
GUI acceptance.

Final related Core: 8 files / 120 passed, including header off/on, advanced masks,
nonzero starts, totals combinations, atomic rejection, real external source,
old total-inclusive snapshot, and undo/redo. Core types/build and final scoped lint/format/diff passed. The complete Web
typecheck and scoped Web table run produced no terminal result during the observed
output stall; only these two assistant-owned checks were interrupted and exited 130. Their partial logs are retained with an interrupted suffix. Neither is
counted as passed. The command response recovered afterward, which does not prove
a resource cause. Later serial checks completed: actual rejected-command file 3/3, complete owned
Web table suite 8 files / 112 passed, and complete Web typecheck passed. The original
interrupted logs are preserved separately. No root-cause claim is inferred from
the successful serial runs. The earlier combined Web run still contains
two unchanged 5-second close/navigation timeouts; this continuation does not
replace that failed run. Whole-Insert, full-repository CI and complete dual-app
structured-table acceptance are not claimed.

## Next bounded work

Resolve the native filter-button and Excel table1 repair causes, verify formal
product exports in both apps, import the WPS-saved result through normal product
UI subject to any required final replacement approval, and complete the four
WPS-only calculated-column observations. Choose any automatic propagation contract
separately. More native chart types remain paused.
