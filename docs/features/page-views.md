# Worksheet page views

The View ribbon and status bar share three per-sheet view modes. View mode is
session state; paper settings belong to the workbook and are saved through Core
commands with undo/redo.

## Page break preview

The continuous editable grid shows the printable range, page numbers, and blue
page boundaries. Automatic boundaries are dashed; manual boundaries are solid.
Hovering an internal boundary or any of the four print-area edges shows an
adjustment cursor. Dragging snaps to visible row/column boundaries and updates
page numbers, page boundaries, and the printable area continuously. Moving an
internal boundary outward lowers percentage print scale as needed so the larger
page band fits on the physical paper; the old automatic boundary does not remain.
Dragging an internal line to the final printable edge merges the final pages.
Moving a manual line out of the printable area in the perpendicular direction
removes it; automatic lines cannot be removed that way.

Dragging an outer edge expands or reduces the saved print area. All four corners
use diagonal adjustment cursors and move their row and column edges together. The area always
retains at least one cell. Non-printing cells use a uniform gray background with
no default gridlines, while their content, explicit formatting, selection, and
editing remain available. Hidden rows and columns do not consume printable
space; internal boundaries avoid splitting merged cells.

Preview changes stay local until release, which submits one undoable Core
command for the final range, scale, and breaks. Escape, pointer cancellation,
window blur, a view/sheet change, or becoming read-only discards the draft.
Targets requiring less than the supported 10 percent print scale are rejected.
Page Setup can reset all manual breaks and change the printable range.

## Page layout

Cells are projected onto separate paper rectangles with physical margins,
ruler marks, and page gaps. Selection, navigation, editing, borders, and images
use that same coordinate projection. Paper margins and gaps do not select cells;
a selection crossing pages remains one logical range with separate visual
fragments. Allocated blank cells remain editable outside the printable range.

Each page exposes left, center, and right header/footer fields. They display
`&P` as the page number, `&N` as the printed page count, `&A` as the sheet name,
and `&&` as a literal ampersand. Focus edits the source text; Enter or blur
commits, and Escape discards the draft. Core rejects page-setting changes on protected sheets. Freeze settings remain saved and take effect again in Normal view.

## Settings and persistence

Page Setup supports A4, A3, Letter, and Legal paper; portrait/landscape;
percentage scaling from 10 to 400; six margins in millimetres; a single local A1
print range; page order; and header/footer text. Leaving the range empty uses
the content extent. Settings are validated before applying the command.

Core V13 snapshots save `Sheet.pageSetup`; V1-V12 snapshots receive default
settings. Axis insert/delete/move commands transform the print range and manual
break positions. Sheet Engine owns pagination and paper projection without DOM
dependencies; Web owns Canvas painting, text fields, and pointer interaction.

XLSX import/export preserves supported paper, margin, scaling, page order,
print area, manual row/column breaks, and odd-page header/footer settings.
Automatic XLSX breaks remain automatic. Supported header/footer fields and
literal ampersands retain their meaning when exported. Subtotal-owned row
breaks are merged with the sheet's explicit manual breaks.

The current contract does not include fit-to-page scaling, multiple print areas,
repeated print titles, different first/even-page headers, header images or font
formatting, printer configuration, or PDF/browser printing. Unsupported imported
paper sizes, fit-to-page settings, and first/even headers are reported in the
compatibility report.

Reference descriptions: [Excel page breaks](https://support.microsoft.com/en-us/excel/view-page-breaks)
and [WPS page break preview](https://www.wps.com/academy/how-to-view-page-break-preview-in-wps-spreadsheet-quick-tutorials-1861570/).
