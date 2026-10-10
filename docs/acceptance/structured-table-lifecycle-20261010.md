# Structured-table lifecycle acceptance — WIP, 2026-10-10

Baseline: `da661700c08654acfaf77985da10cea47cf92390` (tree
`f74c16780723ced32b47d469212e3c98de542552`). This checkpoint repairs two defects
observed in the real Sheetcraft UI. The complete structured-table and target-app
matrix is still in progress. It does not implement calculated-column autofill.

## Bounded matrix and stopping condition

Use one synthetic product workbook, three small table sources (populated headers,
populated without headers, and an empty range), and a converted-range version.
Cover creation/cancel, names and structured references, one style and display
toggle, filters and totals, explicit resize, single edits below/right, final-cell
Tab, representative undo/redo, JSON/local reload, XLSX export/import and
convert-to-range. Open/edit/save/close/reopen the formal exports in WPS and the
existing authenticated Excel web session; formally import the WPS-saved result.

Each existing entry gets one meaningful success path; interrupted creation and
the two observed failures get targeted recovery checks. Do not multiply all
style presets, every filter operator or arbitrary layouts. Stop once this matrix
is established or a concrete approval/app limitation blocks a dependent step.
Retain untested variants explicitly. Separately observe four small WPS native
calculated-column scenarios (first formula in blank column, existing values and
exceptions, added row, paste and undo) only to propose a later contract.

## Actual Sheetcraft UI evidence to this checkpoint

The source is served by a Vite process launched in the dot cloud desktop terminal
and bound only to `127.0.0.1:7200`. The execution-shell process could not be reached
by that browser; it was stopped after the desktop process was confirmed ready.
The unsupported browser internal error page was not read. Ordinary navigation to
the exact HTTP address succeeded. No public service or Sites deployment was used.

The isolated source was typed/pasted through real UI controls:

| Region | Qty | Price | Amount   |
| ------ | --- | ----- | -------- |
| North  | 2   | 10    | `=B2*C2` |
| South  | 3   | 20    | `=B3*C3` |
| North  | 4   | 5     | `=B4*C4` |

Plain clipboard formula text is literal in the existing paste contract; the three
formulas were then committed through the real formula bar. No hidden workbook
mutation, application-global injection or fabricated GUI assertion was used.

- Populated `A1:D4` creation defaulted to headers/filter checked. Cancel/reopen/OK
  created the table; actual undo removed its contextual tab and redo restored it.
- `F1 =SUM(Table1[Amount])` displayed 100. Real inline rename to `Sales` rewrote
  its source to `=SUM(Sales[Amount])`. Header `Amount→Net` rewrote it to
  `=SUM(Sales[Net])`, still 100.
- Filtering Region to North and enabling totals displayed
  `D5 =SUBTOTAL(109,D2:D4)` = 40. A real JSON download was locally saved before
  destructive boundary testing. It contains only this synthetic table.
- **Initial defect 1:** `D2 =[@Qty]*[@Price]` displayed 20; renaming `Qty→Units`
  left its source unchanged and displayed `#REF!`. Undoing the header recovered
  it. **Formal fix recheck:** the same UI rename now rewrites the source to
  `=[@Units]*[@Price]` and still displays 20.
- **Initial defect 2:** a North-filtered table resized `A1:D4→A1:D3` and closed
  its dialog, but Export JSON produced no download and displayed “File operation
  failed / The file could not be exported. Your workbook is still here.” The
  stored filter kept the old end row. Undo did not repair that invalid state.
  **Formal fix recheck:** the same resize downloads JSON successfully. The actual
  exported version-43 snapshot has both table and filter range `A1:D3`, with the
  North criterion retained. UI Undo/Redo changed `F1` 100↔80. Explicit local save
  and stable browser reload retained `F1=80`, `D2=20` and the renamed source.

An attempted recovery Import JSON selected the local synthetic backup, but its
final Replace and import action was denied and was not retried by another route.
After source watcher/HMR reload, the page presented its valid browser-saved copy
with `A1:D4`; that actual state was re-inspected before the fix recheck. No claim
is made that the denied final import executed. Browser after-reload input was
batched too early once and wrote `F1` into A1; it was visibly detected and undone.
Subsequent checks used the stable rendered page. Selector/deadline errors are
harness findings, not product passes or separate product defects.

## Code scope

- Parser-confirmed column renaming accepts an optional proven owning-table name.
  Cell-command traversal supplies it only from the formula cell's actual table
  membership, matching the existing implicit-reference resolver. Explicit named
  references still use their own table; strings/other tables/outside selectors
  stay untouched. It does not fill other cells or introduce a column-formula model.
- Both explicit resize command paths realign an existing table-owned filter to
  the resulting data bounds, excluding totals. Surviving absolute-column criteria
  and options are retained; excluded columns are removed, advanced hidden intervals
  clipped, and external criteria source retained. A one-row headerless range cannot
  hold the existing filter model's mandatory header+data range, so its filter is
  cleared. Unfiltered tables remain unfiltered. Rejection happens before mutation;
  history captures the valid previous state.

## Checks and retained failures

See the adjacent text-only evidence directory. Local GUI JSONs/raw files and all
screenshots are excluded from Git publication.

- Initial new Core file: 9 failed / 1 passed. The first run included an incorrect
  test-fixture value kind (`text` instead of `string`); its separate corrected run
  still had the same 9 actual expectation failures / 1 pass. Both logs are retained.
- First fixed new file: 10/10 passed. Extended related Core: 7 files / 100 passed,
  including 14 new lifecycle cases plus one new parser context case.
- Core strict typecheck/build and scoped formatter/linter/diff checks passed.
  Initial formatting failures for two files remain in their original log.
- XLSX table/style focused suite: 3 files / 30 passed.
- Web table plus real workspace entrypoint suite: **119 passed / 2 failed** across
  9 files / 121 tests. The two unchanged reentrant close/navigation cases timed out
  at their original 5,000 ms deadline; earlier phase results do not replace this
  current failed run. An isolated default-deadline diagnostic rerun is recorded
  separately: **2 passed / 8 skipped**, unchanged 5,000 ms deadline, 3.05 seconds
  of test execution. This establishes that the focused recheck passed; it does not
  prove a resource cause or replace the failed combined run. No timeout increase
  is used to hide a failure.
- Architecture aggregate remains failed with **125 prior diagnostics**, exact
  diagnostic lines unchanged, added 0 / removed 0. No all-repository/full Core/full Web/full XLSX
  CI-green claim is made.
- An independent read-only review found no blocking regression in these two fixes.
  It did flag the inherited verbatim-caption escaping limitation below. It ran no
  tests or GUI; its finding is not an independent acceptance result.

## Remaining matrix and existing limitations

No-header/empty creation, style/display controls, all growth paths, conversion,
formal target-app lifecycle and WPS calculated-column observations are pending
after this WIP checkpoint. Existing source/DOM tests are not substituted for them.

Totals enable shifts following cells down within table columns; totals disable
clears totals without pulling following cells up. Totals-enabled shrinking may
replace the new bottom data row, and resizing regenerates SUBTOTAL formulas rather
than preserving custom total labels/functions. These are existing Core contracts,
not an Excel/WPS parity claim. Single-edit automatic growth excludes totals and
multi-cell paste; Tab is a separate resize/history action. Current column-name
rewriting inserts captions verbatim, so names containing selector punctuation
(for example a colon/comma/bracket) can remain ambiguous. This inherited limitation
was not expanded into a speculative new parser feature here.

Calculated-column first-formula propagation, replacing occupied values, exception
tracking, later edits, added-row fill and paste behavior have no complete product
contract. `SheetTableColumn` still stores only ID/name. Native table parts do not
yet retain dedicated calculated-column or totals-function/label metadata. Pie and
further chart families are paused while the existing table workflow is accepted.
