# Column filter panel

The Content / By color tabs and numeric condition menus are described in
[Color and custom column filters](filter-conditions.md).

The column panel separates worksheet sorting from candidate-list sorting. The
top Ascending/Descending actions reorder worksheet rows. Sort by color opens a
menu of cell-fill and font colors; choosing a color moves matching rows to the
top. Its Custom sort action opens the multi-level Sort dialog. Name/Count and the
settings menu only reorder values in the panel. Worksheet sorting is disabled
when the filter range intersects merged cells.

Custom sort closes the filter panel and opens the Sort dialog with the current
filter column selected and Data has headers checked and locked. Opening or
cancelling the dialog does not reorder worksheet rows. The target is the opened
filter's full range, independent of the active cell. Copy, delete, move up and
move down act directly on their row in the Actions column.

The dialog supports adding, deleting, copying, and reordering conditions, sort
options, and choosing Cell color or Font color as the basis. For color levels,
choose a solid color and On top or On bottom; confirmation moves matching rows
together while other rows retain their relative order. Header and
structured-table total rows remain fixed. Color discovery and
execution share Core's table/direct/duplicate-highlight/conditional-format
layers and snapshot the colors before sorting. Gradient fills and icon sets are
not solid-color candidates.

The settings menu uses the shared menu components and exposes five switches:

- Show item counts controls occurrence counts beside individual values.
- Show total item count switches the single footer summary from distinct values
  to selected/all occurrence totals.
  These totals follow the search and other active column criteria; they do not
  sum numeric cell values. A vertically merged value contributes one item.
- Show filter criteria displays the current search, value selection, or condition
  on its own row directly above the footer buttons.
- Put checked items first uses the selection captured when values are opened.
  Changing a checkbox does not move the row under the pointer.
- Allow filtering merged cells controls candidate lookup and applied criteria.

Sort by count, descending and Sort by name, ascending update the same list order
as the adjacent sort buttons. They show mutually exclusive checkmarks for their
exact order; Name descending or Count ascending leaves both shortcuts unchecked.
Checkbox settings keep the menu open; sorting
closes it. Escape closes the settings menu before the parent filter panel.
Display and ordering changes preserve an edited search and value selection.
Short value lists shrink to their content; long lists retain the adaptive scroll
limit and load-more control.

Preferences are browser-wide, stored under `sheetcraft.filter.panel.settings` as a
version-1 record. The defaults show individual counts, hide totals/criteria,
retain normal name order, and allow merged-cell filtering. Preferences are not
part of the workbook snapshot. Invalid or unavailable browser storage falls
back to defaults.

## Merged-cell criteria

Applied `SheetFilter.allowMergedCells` is part of workbook state and supports
serialization and undo/redo. Reapplying or clearing criteria preserves it:

- `undefined` retains the legacy rule rejecting any merge in the filter range.
- `false` rejects merges intersecting data rows in criterion columns. A merge
  confined to headers or unrelated columns does not prevent filtering.
- `true` reads merged values from their top-left anchors. Overlapping merged row
  intervals in criterion columns form one connected block; any failed row hides
  the complete block. `SUBTOTAL` follows the same visibility rule.

Candidate counts apply other-column criteria to complete connected blocks over
the target and criterion columns. They count each target merge once and are
independent of merge storage order or which row fails a condition. Ordinary
filters without relevant merges retain the sparse-cell calculation path.

Core value-count/distinct-value APIs accept an optional `allowMergedCells`
option. `createSetSheetFilterCriteriaCommand` accepts the same option after its
column criteria. This product preference has no standard XLSX AutoFilter flag;
the applied Core behavior is preserved by the native workbook format. XLSX
import enables merged filtering when an accepted worksheet AutoFilter intersects
valid imported merges, preserving the criteria and complete merged row blocks
after an export/import round trip.
