# Worksheet page views

The View ribbon and status bar share three per-sheet view modes. View mode is
session state; paper settings belong to the workbook and are saved through Core
commands with undo/redo.

## Page break preview

The continuous editable grid shows the printable range, page numbers, and blue
page boundaries. Automatic boundaries are dashed; manual boundaries are solid.
Drag an internal boundary to a row or column edge to create or move a manual
break. Drag a manual boundary outside the print range to remove it. Page Setup
can reset all manual breaks and change the printable range. Hidden rows and
columns do not consume printable space; merged cells stay together.

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
