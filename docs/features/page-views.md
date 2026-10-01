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
rulers, and page gaps. A view-only 20-pixel desktop inset surrounds the paper;
its physical size is independent of percentage print scaling. Selection, navigation, editing, borders, and images
use that same coordinate projection. Paper margins and gaps do not select cells;
a selection crossing pages remains one logical range with separate visual
fragments. Allocated blank cells remain editable outside the printable range.

The top and left rulers sit outside the row/column headings, which paint only
their visible cell fragments. They share paper/content coordinates with the cells
and use millimetres, centimetres, or inches. Zero remains at the content origin;
margin ticks count back toward the paper edge. The selected rows and columns are
projected onto the ruler strips. Ruler margin markers remain available when the
paper margin handles are hidden; dragging shows a solid guide and a live value
in the selected unit, removed on release or cancellation. View controls toggle rulers, margin
handles, and page white space. Double-click a page edge to collapse or restore
its top/bottom white space; Enter/Space on that edge also works. Collapsing is
session state, preserves the active cell, and hides header/footer editing.

When margin handles are visible, all six physical margins can be dragged with
a live pagination preview. Release submits one Core command; Escape, pointer
cancellation, window blur, changing views/sheets, or becoming read-only discards
the draft. Arrow keys adjust by 0.1 mm and Shift+Arrow by 1 mm. Margins retain at
least 1 mm of printable body; header/footer offsets stay within their body margins.

Each page exposes left, center, and right header/footer fields. Empty sections
show a centered Add header/Add footer hint. Hovering or editing reveals the
three section outlines, with the active field highlighted. Header/footer tools
occupy a contextual tab in the existing Ribbon panel, preserving the paper
position instead of inserting another toolbar row. They support
multiline text and independent first, odd, and even page settings. The contextual
editor inserts page number, page count, sheet name, file name, date, and time
fields at the caret, and applies a font, point size, bold, italic, underline, or
color to the edited section. Fields use readable localized markers while editing;
XLSX control codes remain the stored representation. Imported mixed-format text
is previewed with its styles and preserved verbatim when left unedited. Editing a
section applies its chosen uniform format to that section.

Enter inserts a new line; Ctrl/Cmd+Enter or blur commits, and Escape discards the
draft. Header/footer options control first/odd/even variants, alignment with body
margins, and scaling with the document. Core rejects page-setting changes on
protected sheets. Freeze settings remain saved and take effect again in Normal view.

## Settings and persistence

Page Setup supports A4, A3, Letter, and Legal paper; portrait/landscape;
percentage scaling from 10 to 400; six margins in millimetres; a single local A1
print range; page order; and header/footer text. Leaving the range empty uses
the content extent. Settings are validated before applying the command.

Core V14 snapshots save `Sheet.pageSetup` including header/footer options.
V1-V12 snapshots receive default page settings; V13 receives default header/footer
options while preserving its existing text. Axis insert/delete/move commands transform the print range and manual
break positions. Sheet Engine owns pagination and paper projection without DOM
dependencies; Web owns Canvas painting, text fields, and pointer interaction.

XLSX import/export preserves supported paper, margin, scaling, page order,
print area, manual row/column breaks, first/odd/even header/footer text, behavior
flags, and supported text formatting.
Automatic XLSX breaks remain automatic. Supported header/footer fields and
literal ampersands retain their meaning when exported. Subtotal-owned row
breaks are merged with the sheet's explicit manual breaks.

The current contract does not include fit-to-page scaling, multiple print areas,
repeated print titles, header images, printer configuration, or PDF/browser
printing. Unsupported imported paper sizes, fit-to-page settings, and header
images are reported in the compatibility report.

Reference descriptions: [Excel page breaks](https://support.microsoft.com/en-us/excel/view-page-breaks)
and [WPS page break preview](https://www.wps.com/academy/how-to-view-page-break-preview-in-wps-spreadsheet-quick-tutorials-1861570/).
