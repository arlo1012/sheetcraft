# Data tools

The Data ribbon is implemented in `apps/web/src/modules/data-tools`. It composes
concrete Vue tools and dialogs; persistent edits run through Core commands.

## Available operations

- Sort ascending/descending or use several sort keys. A single cell resolves to
  its contiguous data region. Active filter headers stay fixed. Ambiguous all-text
  regions open the header setting before a quick sort moves rows.
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
- Split a selected single column using multiple delimiters or fixed widths.
  Preview the result, select General/Text for each output column, choose a
  destination column, and explicitly allow overwriting populated destinations.
- Remove duplicate rows using chosen key columns and a header setting. The dialog
  previews the number of rows to remove.
- Set or edit cell validation: whole/decimal numbers, dates, times, text length,
  literal or range/named-range lists, and custom formulas. Input messages,
  in-cell dropdowns, Stop/Warning/Information feedback, and partial rule removal
  are supported. Rejected direct edits retain their draft until retry/cancel;
  warning/information values require explicit acceptance.
- Group rows or columns, nest groups, collapse/expand or select outline levels.
  Subtotals insert SUBTOTAL formulas after contiguous groups and a grand total;
  Remove All removes their generated rows. Sort by the grouping column first
  when equal keys are not adjacent.

JSON snapshots use version 10 and retain filters, validation, outlines, and
subtotal metadata. XLSX import/export handles the supported filter conditions,
standard validation settings, and row/column outlines. Unsupported XLSX filter
forms retain import diagnostics. Subtotal formulas remain ordinary formulas in
XLSX; generated-row ownership is an idea10 snapshot feature.

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
