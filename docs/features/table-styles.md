# Table styles and structured tables

Home → Table styles combines the supplied WPS quick gallery with Excel's full
Light/Medium/Dark catalog. The quick gallery has seven theme colors and 32
distinct templates (8 light, 16 medium, 8 dark) in four columns; selecting a color
recolors the complete group. A small switch on the right of the All presets
heading toggles this color-family view and the 60 Excel-inspired presets
(21 light, 28 medium, 11 dark) in seven columns. Both views include a Custom group; theme changes leave custom
styles unchanged. Preview cells show miniature text and
only the borders defined by each style. Hover uses the same subtle background as
conditional-formatting galleries, without an extra tile border; keyboard focus
uses the shared soft halo. The gallery scrolls while its theme controls and actions stay
visible.

The custom style editor reuses the Font, Border, and Fill controls used by
conditional formatting. It supports 13 table elements, row/column stripe sizes,
perimeter and internal borders, a live preview, and a workbook default style.
New table and PivotTable styles receive the first available numbered name. The
editor preview shows formatted cells in a grid and exposes the selected row or
column stripes, including larger stripe sizes. Confirming formatting preserves
the stripe size and updates fill, borders, font and text decorations immediately.
The two quick presets with a colored first column enable the First column option
when selected; the option can still be turned off afterward.
The presets are product definitions inspired by WPS/Excel. The Excel-style
catalog follows the built-in IDs and visual families; it does not claim identical
format definitions for every Excel version. WPS online style resources are not
downloaded or required by the product.

## Custom PivotTable styles

New PivotTable style is available beside New table style in the same menu. It
reuses the element editor and the Font, Border, and Fill tabs, with 25 PivotTable elements:
the whole table, headers, grand totals, alternating bands, three levels of row
and column subheadings/subtotals, blank rows, the first header cell, and report
filter labels/values. Each element can be formatted or cleared independently;
row and column band sizes and a grouped preview are available.

Saved PivotTable styles appear in a separate custom section. Selecting one opens
it for editing. Its workbook default is independent of the ordinary table
default, and library changes support undo/redo. This capability creates and
stores style definitions; creating and calculating PivotTables remains outside
the current implementation.

## Creating and editing a table

Applying a style inside an existing table changes its style. Applying a style to
an ordinary range opens Apply table style with an editable data-source range and
two modes. Apply the style only writes cell appearance without creating a table
or changing values, formulas, or filters. It accepts zero or multiple header rows;
row bands begin after those headers. Declared style fields replace existing fields,
while unrelated formatting such as number formats is retained.

Convert to a table and apply the style is selected by default, with My table has
headers and Filter buttons enabled. The two checkboxes can be changed independently.
Ctrl/Cmd+T uses the workbook's default style. When headers are absent,
Core inserts a header row above the data. Table ranges cannot overlap another
table or merged cells; names are unique across the workbook and defined names.

Table settings exposes the name, range, header/total rows, first/last-column
emphasis, row/column bands, and filter buttons. Selecting a cell in a structured
table reveals the contextual Table tools tab. It provides inline naming, a range
resize dialog, direct display-option checkboxes, quick style previews, the same
full style menu and settings dialog, remove duplicates, and convert to range.
Leaving the table hides the tab and restores the previous standard category.
Table-aware duplicate removal compares all table columns by default, excludes
the total row, and shrinks the table after removal; its header choice follows the
table. The entire action, including total-row relocation, supports one undo/redo.
Style-only ranges do not show this contextual tab.

Table filters remain independent
for multiple tables on one sheet and exclude total rows. Total formulas use
`SUBTOTAL`, so filtered rows do not contribute. A single cell edit immediately
below or to the right expands the table; Tab from its final data cell adds a
data row. Explicit range changes and row/column insertion/deletion also update
table metadata. Automatic calculated-column formula fill is not implemented.
An explicit table resize also resizes the stored filter to the new data range,
excluding totals. Criteria for columns remaining inside the range are retained;
criteria for removed columns are dropped. Existing advanced hidden-row intervals
are clipped to the new data range without moving their external criteria source.
Column-panel settings and merged-cell behavior for ordinary ranges are described
in [Column filter panel](filter-panel.md).

Convert to range retains cell values and the effective table appearance, removes
the table and its filters, and rewrites its structured references to A1. Creation,
settings, style-library changes, conversion, and table/column renaming use Core
commands and support undo/redo, including formulas on other sheets.

## Formula and display contracts

`Sheet.tables` stores table identities, ranges, column identities/names, display
options, a style definition, and filter criteria. `Workbook.tableStyles` stores
reusable custom definitions; `defaultTableStyleId` selects the default.
`Workbook.pivotTableStyles` and `defaultPivotTableStyleId` store the separate
PivotTable style library. Custom style names are unique within each library.

Structured references support a named column (`=SUM(Table1[Amount])`), column
ranges, `#Data`, `#All`, `#Headers`, `#Totals`, and the current row
(`=[@Amount]`). Named references resolve across sheets. Table and column renames
rewrite formula sources, while range changes invalidate calculation dependencies.
Column renames rewrite implicit selectors such as `[@Amount]` only in formulas
whose cell is inside that owning table. Explicitly named references still rewrite
across sheets; strings, another table's selectors and implicit references outside
the table are not guessed. Entering one formula still edits just that cell.
These selectors do not add general Excel implicit-intersection `@` support.

Canvas resolves structured-table formatting first, followed by direct cell formatting,
duplicate highlights, and conditional formatting. Applying a table style does not
write it into every cell in structured-table mode; style-only application and
conversion to an ordinary range materialize the appearance in cell styles.
Custom styles with the same ID update tables using that definition.

## Persistence and XLSX

Tables were introduced in snapshot version 13. Current snapshots use version 43,
or version 44 when explicit manual PivotTable ordering is present; older table
snapshots remain readable. Pre-table versions migrate to an empty table model.
Table metadata and both custom/default style libraries survive local autosave and
JSON reload; runtime calculation caches and editor drafts remain transient.
Snapshots contain plain objects suitable for IndexedDB structured cloning.

XLSX uses native table parts, worksheet relationships, `tableStyleInfo`, table
filters, and custom differential style definitions alongside conditional-format
DXFs. Product presets export as explicit custom definitions to preserve selected
theme colors. The 60 known Excel built-in style IDs map to their corresponding
product preset on import; unrecognized IDs use an approximate product style.
WPS theme styles export as explicit custom definitions, preserving element
colors after XLSX reload. Per-column filter-button visibility is represented by one table
flag. Complex date groups, dynamic/top-N/color filters, and dedicated OOXML total
function/label metadata remain outside the supported subset; total cell formulas
are retained.

Custom PivotTable styles use native `<tableStyle pivot="1" table="0">`
definitions and `defaultPivotStyle` in `styles.xml`, sharing the differential
format pool with table styles and conditional formatting. These definitions
survive XLSX import/export independently of PivotTable data/cache parts.
Styles marked for both tables and PivotTables import into both libraries.
Matching definitions re-export together; if edits make their shared elements
differ, the PivotTable definition gets a distinct export name. Built-in
`PivotStyle` defaults retain their names but are not materialized as product
element definitions.

Interaction references: the supplied WPS screenshots and
[Excel table formatting](https://support.microsoft.com/en-us/excel/format-an-excel-table),
[Excel preset identifiers](https://learn.microsoft.com/en-us/javascript/api/excel/excel.table?view=excel-js-preview),
and [WPS theme recoloring](https://www.wps.cn/learning/course/detail/id/335038.html).
PivotTable style references:
[WPS custom PivotTable styles](https://www.wps.cn/learning/course/detail/id/14134),
[Excel PivotTable formatting](https://support.microsoft.com/en-us/excel/design-the-layout-and-format-of-a-pivottable),
and [Excel style elements](https://learn.microsoft.com/en-us/office/vba/api/excel.xltablestyleelementtype).
