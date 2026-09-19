# Data tools

The Data ribbon is implemented in `apps/web/src/modules/data-tools`. It composes
concrete Vue tools and dialogs; persistent edits run through Core commands.

## Available operations

- Sort ascending/descending or use several sort keys. A single cell resolves to
  its contiguous data region. Active filter headers stay fixed. Ambiguous all-text
  regions open the header setting before a quick sort moves rows. Custom sorting
  supports cell values, fill colors and font colors. Color levels place a chosen
  color at the top or bottom. Value levels also support custom sequences through
  Order > Custom list: choose a built-in sequence or enter one item per line,
  add/edit/delete user lists, and confirm. Built-in lists remain read-only.
  User lists are versioned local preferences;
  cancelling the list editor discards library changes. Each sort level captures
  its own sequence, with forward/reverse order and the case-sensitivity option.
  Unlisted values follow listed ones and use normal ordering among themselves.
  Sorting moves cell content and styles through the existing undo/redo command.
- Filter from column headers using searched values or text, number, and date
  conditions. Clear removes conditions and retains the buttons; Filter toggles
  the complete filter. Reapply recalculates the sheet.
  The column menu also offers table sorting, typed value ordering, occurrence
  counts, invert selection and duplicate-value selection. Counts honor other
  columns' criteria while ignoring the current column's criterion. List ordering
  only rearranges the menu; its top sorting actions move the table's rows.
  Search matches every whitespace-separated keyword. Apply commits checked
  search results; clearing the search restores the remaining draft selections.
  Selecting every available value clears that column's restriction, so later
  values remain visible. Long lists render in batches, while bulk selection
  always applies to every matching value.
- Advanced Filter is available from the Filter split menu. Choose in-place
  filtering or copy results (including headers) to another location, optionally
  retaining only unique complete records. All three reference fields support
  grid picking, qualified sheet references and defined names. A copied result
  starts at the destination's top-left cell; overwriting requires explicit opt-in.
  Criteria headers match list headers; conditions in a row use AND and separate
  rows use OR. Repeated headers support multiple bounds for one column.
  Comparison operators and `*`, `?`, `~` wildcards are supported; plain text is
  a case-insensitive prefix, while `=text` is an exact match. A blank criteria
  row matches everything. An omitted criteria range allows unique-only filtering.
  In-place results are a saved snapshot: Reapply reads the criteria again;
  Show All clears the result while preserving manually hidden rows. Both modes
  participate in undo/redo. Formula criteria are currently rejected explicitly;
  formulas in the source list are evaluated. List and criteria rectangles are
  limited to 1,000,000 cells. Clear advanced filtering before structural edits
  to the filtered sheet or a sheet containing its criteria.
- Split a selected single column using multiple delimiters or fixed widths.
  Preview the result, select General/Text for each output column, choose a
  destination column, and explicitly allow overwriting populated destinations.
- Remove duplicate rows using chosen key columns and a header setting. The dialog
  previews the number of rows to remove.
- Duplicate items groups six selection-scoped operations and error-check options. Set Highlight
  Duplicates creates a dynamic duplicate-owned overlay, using evaluated nonblank
  values in the selection and preserving the cells' base fill and text styles.
  Clear Highlight Duplicates removes only those duplicate-owned highlight rules.
  Count Repetitions accepts a rectangular selection of any width and summarizes
  each distinct nonblank value across the entire selection in a new worksheet,
  with Value and Count columns. Values occurring once are included, including
  titles when selected; empty cells are ignored. Results retain first-appearance
  order, leave the source unchanged, and support one-step undo/redo.
  Reject Duplicate Entries creates a
  duplicate-owned selection rule that rejects a direct edit, paste, or fill when
  its prospective batch would contain an already-present nonblank value. Direct
  editing shows a warning beside the cell and retains the draft. Re-entering an
  unchanged duplicate value with Enter also requires its own confirmation. Pressing an
  unmodified Enter again confirms only that exact pending input as one undoable
  edit; changing the draft, closing the notice, or changing the applicable rule
  requires a fresh warning. Tab, blur, save, paste and fill never confirm the
  exception, and other data-validation rules still apply. The duplicate rule
  stays in place and the entered duplicate remains eligible for an error marker. Clear
  Reject Limit removes only those duplicate-owned rejection rules. Remove
  Duplicates retains the first matching row according to the selected key
  columns and removes later matches.
  Existing violations of Reject Duplicate Entries show cell-corner markers
  (green by default) and a warning menu for the active cell. The menu can ignore
  all issues in the current selection,
  ignore all current issues on the worksheet, focus the formula bar, or open
  error-check options. Ignoring only hides the warning; rejection remains active.
  Error-check options have a background-check master switch, an indicator-color
  picker (Automatic follows the theme), and an independent duplicate-entry rule
  switch. Other WPS-style error-check rules are disabled TODO placeholders; their
  detectors are not implemented. These switches only control warnings, never
  command-time duplicate-entry rejection. Settings and clearing the current
  worksheet's ignored warnings stay in a local draft until Confirm; Cancel,
  Escape and closing the dialog discard that draft.
  Settings and ignored issues persist in this browser, with ignored issues scoped
  to workbook, worksheet, cell, value and rule. Version 1 preferences migrate with
  the old enabled state and ignored issues preserved. Changed or resolved issues
  discard their ignored state. Error-check options remain available from the
  Duplicate items menu when checks are off.
- Set or edit cell validation: whole/decimal numbers, dates, times, text length,
  literal or range/named-range lists, and custom formulas. Input messages,
  in-cell dropdowns, Stop/Warning/Information feedback, and partial rule removal
  are supported. Rejected direct edits retain their draft until retry/cancel;
  warning/information values require explicit acceptance.
- Group rows or columns, nest groups, collapse/expand or select outline levels.
  Subtotals insert SUBTOTAL formulas after contiguous groups and a grand total;
  Remove All removes their generated rows. Sort by the grouping column first
  when equal keys are not adjacent.

JSON snapshots use version 11 and retain filters, validation, outlines,
subtotal metadata, and duplicate-owned rules. Duplicate document operations are
undoable; browser-only error-check preferences do not enter workbook history. XLSX import/export handles the supported filter conditions, standard
validation settings, and row/column outlines. XLSX export reports that
duplicate-owned highlight/rejection rules were omitted because it does not map
them to a superficially similar conditional-formatting or validation rule.
Unsupported XLSX filter forms retain import diagnostics. Subtotal formulas
remain ordinary formulas in XLSX; generated-row ownership is an idea10 snapshot
feature.
Advanced filter rules and result intervals persist in JSON. XLSX export retains
the hidden-result rows and reports loss of advanced-filter semantics: criteria
cannot be reapplied after import, and formulas distinguishing filtered rows from
manually hidden rows (such as SUBTOTAL/AGGREGATE) can recalculate differently.

## TODO

- [ ] Add the WPS-style “将统计内容生成图表插入” option to duplicate-count
      summaries. The count dialog currently shows a disabled, unchecked TODO
      checkbox. Once workbook chart support is available, create the chart from
      the generated Value/Count table on the result worksheet, and include it in
      the same undo/redo operation and document persistence.
- [ ] Support sorting by conditional formatting icons (条件格式图标).
      The Sort On selector shows this as a disabled TODO option until icon-set
      rules and their evaluated cell icons are available. Then offer icons from
      the selected column, support placing the chosen icon on top or bottom, and
      integrate with multi-level priorities, header protection and undo/redo.

## Integration boundaries

`packages/core` owns the runtime-neutral data model, operations, validation and
history. `packages/xlsx-io` owns OOXML conversion. The grid combines manual
visibility, filtering and collapsed outlines, using the current workbook
calculation context for rendering, clipboard, format painter and autofill.

Dialogs capture their target after flushing the editor. Workbook replacement,
sheet changes, busy state and protection invalidate stale actions. Replacing
part of a validation range retains and rebases the unaffected rule fragments.

Text-to-columns targets the selected cells within one column. Remove duplicates
compacts its selected rectangle. These operations reject incompatible merged,
filtered or overlapping structural data instead of partially mutating it.
Advanced external data connections, what-if analysis and collaborative services
are outside this implementation.

## Acceptance sample

Use the File menu to import a workbook containing:

| Team | Amount | Code      |
| ---- | ------ | --------- |
| B    | 30     | 003,beta  |
| A    | 10     | 001,alpha |
| A    | 20     | 002,gamma |
| A    | 20     | 002,gamma |
| B    | 40     | 004,delta |

1. Select B2 and sort ascending; Amount stays in B1 and B2 becomes 10. Enable
   Filter, apply Amount greater than 20, clear the condition, then turn it off.
   In the column menu, check the value counts, select duplicates and invert them.
   Search for a value and apply it; clear that column's condition, then use the
   top sort action while the active cell is outside the filtered range.
2. Select C2:C6 and split on comma into E. Set the first result column to Text;
   its leading zeros remain. Undo the operation once to restore the source state.
3. Select the table and remove duplicates using all columns; one row is removed.
   Undo, then change the selected key columns and verify the preview count.
4. Apply whole-number validation 1–10 to one cell. Enter 12, retry with 8, then
   undo. Change the rule to a list and verify choosing a value in the grid.
5. Select rows and group, collapse, navigate past the hidden rows, and expand.
   Sort by Team, add subtotals for Amount, remove them and undo removal.
6. Save/reload JSON and export/import XLSX to inspect supported persistent state.
7. Enter `Amount` in E1 and `>=20` in E2. Open Filter > Advanced Filter with
   A1:C6 as the list and E1:E2 as criteria. Select unique records: the 10 row
   and second identical 20 row are hidden. Change the criterion to `>=30` and
   Reapply. Show All restores the rows. Repeat in copy mode to H1, verify the
   header plus matching records, then undo. Use each field's picker and cancel
   a pick to confirm its prior draft remains unchanged.

## Verification notes (2026-09-16)

Core, Sheet Engine and XLSX suites passed during implementation. Focused Web
regressions cover edit rejection, visibility, toolbar wiring, captured targets,
filter conditions, split types, duplicate counts, validation fragments and
preview reactivity. Production build and Web lint passed. Independent reviews
were run for Core operations and Web integration; their findings were fixed.

The full Web run also exposed existing failures in named-range save callback
expectations, old context-menu selectors, sheet-tab selectors, zoom and the
persistence feedback label. The corresponding unchanged source/tests reproduce
on an isolated `d89c8a81` baseline; the snapshot-version assertion was updated for
this change. Repository boundary checks still flag pre-existing history/menu/
TDesign-adapter paths. These checks are not reported as passing.
