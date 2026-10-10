# Structured-table matrix closure — bounded acceptance, 2026-10-10

Baseline: `659aa745b5dc8ba0d789888d508ecbfc978f7038`. This final text-only
continuation closes the agreed representative existing-table matrix. It does not
implement calculated columns or establish compatibility for every table layout.
Read the lifecycle, header, totals and filter-button records for original failures,
formal fixes and exact test runs. No production code changed in this continuation.

## Existing user paths exercised

| Path                                | Actual evidence and boundary                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create / cancel / undo / redo       | Populated headers, populated source without headers, and empty source; generated headers preserve first data values; unique workbook table names.                                                                                                                |
| Rename / structured references      | Table and column names update local implicit selectors and dependent explicit named formulas; actual values remain correct. Selector punctuation escaping remains an inherited limitation.                                                                       |
| Style / display                     | One Medium5 style, first-column and row bands; actual saved JSON before and after stable reload is identical. Not every preset or toggle combination was tested.                                                                                                 |
| Filtering / totals                  | Representative North/Alpha filters, hidden buttons with active criterion, generated totals, actual Undo/Redo; ordinary label/SUM/custom/blank totals exercised in both target apps. Numeric literal totals are explicitly blocked.                               |
| Explicit resize / header visibility | Filtered shrink, header off/on, consistent data-only filter bounds, saved snapshots and Undo/Redo; unsafe advanced-filter row changes are atomically refused.                                                                                                    |
| Below / right expansion / Tab       | Existing single-edit expansion and generated right header; unfiltered final-cell Tab adds a row. Product filtered Tab adds a row but selection advances beyond the hidden new row. Multi-cell paste growth and automatic calculated-column fill are not claimed. |
| Convert to range                    | Actual UI Undo/Redo; table/filter removed, appearance retained, references become ordinary A1/ranges. Both native apps retain the former South row, D2 =B2*C2 =20 and dependent F1 =121.                                                                         |
| Local / JSON persistence            | Real save and downloads, stable reload, public snapshot validation. No recovery through the earlier denied JSON replacement is claimed.                                                                                                                          |
| XLSX export / target apps           | Formal actual UI output opens editable without Excel repair; both Excel web and WPS edit 10→11, save-close-reopen retaining filter, hidden buttons and totals. Separate ordinary mixed-total lifecycle passed.                                                   |
| Native import into Sheetcraft       | Actual WPS-saved synthetic XLSX selected through Import XLSX, confirmed, displayed and exported as JSON; two native tables, converted Sheet1, Alpha11, subtotal11, hidden arrows and original subtotal formula retained.                                         |

## Last three actual UI checks

### Stable Medium5

Sheet2 Table1 was explicitly changed through the style gallery to Medium5, saved
locally and exported before reload. The existing saved fixture was then ordinarily
reloaded, and actual Export JSON was repeated. Both snapshots were identical,
SHA256 `03e99e6cc72bdd1a70e65fe067391307dbe6248cd9a476f90f6d86c8e77d4424`.
They contain `table-wps-medium-5`, its full style elements, unchanged table/filter
bounds, Alpha criterion and hidden buttons. The earlier watcher-interrupted
Medium2 result remains in the historical record; it is not retroactively changed.

### Native import

The current document contained only the isolated synthetic table workbook and had
separate written JSON backups, including the just-verified Medium5 copy. Normal
Import XLSX selected its already-saved WPS result and the new native replacement
confirmation was accepted. This was a different, authorized native test action;
the earlier denied final JSON replacement was never executed or retried.

The real UI displayed Alpha11, subtotal11, filtered rows and no arrows. Table tools
showed Table1 headers/totals/bands on and Filter buttons off. Actual post-import
JSON, snapshot43, SHA256
`e9f11d19324b4fe7bcc27276684f4a88c67f4523ee873f8c8509c2beb0e75d39`,
retains both tables and converted Sheet1, normalized text-equals Alpha criterion
and exact B5 SUBTOTAL109 formula. WPS itself had populated previously blank A5
with SUBTOTAL109 yielding0. That producer-created content is retained, not called
lossless equivalence to the original blank. Earlier public decode reports retain
vendor feature-omitted and formula-cache-discarded warnings.

### Advanced-filter rejection / draft / history

Normal cell inputs added D1=Column1 and D2=Beta. Actual Advanced Filter used
A1:B4 and D1:D2. Its Beta mask intersected the existing Alpha table filter, so all
data rows became hidden; this is not presented as a visible Beta-only result.
The stored advanced mask hides the first data row and blank last data row.

Table settings Header row off → OK was refused with the visible explanation:
the active advanced filter cannot preserve that row change and data is unchanged.
The table toolbar still had Header row checked; the modal retained the unchecked
draft and remained available to correct or cancel. Cancel and actual JSON export
proved headers, bounds, totals, criteria source and contents stayed intact.
One actual Undo then removed the advanced-filter command, exposing Alpha11 and
subtotal11, proving the refused command did not enter history. Redo and another
real export restored an identical snapshot, SHA256
`7d1891b52546fe396f2201a0e6b9c1d4eb40e5b04b28957bc98bac22a092f7fb`.
The final ordinary filter state was restored with Undo and explicitly saved.

## Calculated-column observation and decision

The bounded WPS-only observations and proposed decision are in
`structured-table-calculated-column-candidate-20261010.md`. They are evidence for
a future product contract, not implementation or Excel acceptance. Automatic
overwriting/propagation remains absent from Sheetcraft. No snapshot migration was
made; `SheetTableColumn` still stores only ID/name.

## Stop condition / residual limits

The agreed representative matrix and bounded WPS observations have reached their
stop condition. More native chart types and arbitrary table permutations remain
paused. Important retained limits:

- Literal numeric constants in a total row cannot be exported to XLSX in the
  currently proved target path. The precise location-bearing compatibility block
  preserves Core contents; JSON remains available. Numeric formula results work.
- Unsupported advanced-filter row/source changes are refused, not fully supported.
- Partial/malformed native filter-button visibility cannot fit the global boolean;
  import warns and uses a conservative visible state.
- Existing totals/resize shifting and regeneration rules are unchanged; custom
  totals are not guaranteed to survive every resize. Multi-cell paste growth,
  selector punctuation escaping, all styles/operators and advanced-filter native
  roundtrip were not added to the matrix.
- The product's filtered Tab focus behavior differs from the unfiltered path;
  WPS in this observation did not add a row on final-cell Tab at all.
- Calculated-column template/exception persistence, native I/O and autofill await
  an explicit product decision. A wholly empty column's default propagation and
  other native-app variants were not established by the mixed-value observation.

No new tests/builds were needed for this text/GUI-only continuation. Latest code
checks remain the exact659aa results: full XLSX81files/1158tests passed, scoped
types/forced build/static checks passed, and the unchanged125 architecture findings
still fail the aggregate. Earlier first failures, interrupted checks and Web guard
timeouts remain preserved. This is not whole-repository CI or whole-Insert completion.

All new actual XLSX/JSON/XML/screenshots stay local. This checkpoint publishes only
the operation record and bounded acceptance/decision text, with no account or
browser identifiers, authentication state, proprietary menu geometry or raw files.
