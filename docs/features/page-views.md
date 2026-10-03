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
fragments. Page layout has its own compact editable range, beginning with the
content, print range, and current selection. An empty sheet starts with one paper.
The final paper bands include all whole rows and columns that fit; these blank
cells stay virtual and do not enlarge the saved print range or workbook content.
Navigation expands to the required paper. Outward wheel input at a scroll edge
adds one complete paper band on that axis, while returning to page layout drops
unused extra papers. Ordinary grid allocation remains independent. Canvas cells,
headers, and selection fragments are still enumerated only for the viewport.

The top and left rulers are 18px strips outside the 36 by 22px headings; the current visible
page also shows compact top and bottom markers. They share paper/content coordinates
with cells and use millimetres, centimetres, or inches. Zero remains at the content
origin; margin ticks count back toward the paper edge. Dragging shows a solid guide
and a live value, removed on release or cancellation. View controls toggle rulers,
margin handles, and page white space. Double-click a page edge, or use Enter/Space
on that edge, to collapse or restore white space. Collapsing is session state,
preserves the active cell, and hides page-only header/footer markers without deleting
stored header/footer content.

When margin handles are visible, all six physical margins can be dragged with
a live pagination preview. Release submits one Core command; Escape, pointer
cancellation, window blur, changing views/sheets, or becoming read-only discards
the draft. Arrow keys adjust by 0.1 mm and Shift+Arrow by 1 mm. Margins retain at
least 1 mm of printable body. Top and bottom margins can reach zero; reducing them
shrinks the corresponding header/footer offset in the same undoable change.

Each page renders static left, center, and right header/footer previews. Empty
sections may show a compact Add header/Add footer marker when there is enough paper
space; zero or constrained top/bottom margins hide both marker and content to avoid
overlapping worksheet cells. Page Setup owns editing: selecting a marker opens its Header/Footer tab.
Selecting a preview section or Custom Header/Footer opens the corresponding editor. The custom dialog confirms
into the outer local draft; only confirming Page Setup submits one Core command.
Canceling either dialog discards that dialog's changes. The custom editor uses a compact
row of field buttons above three side-by-side sections; A opens the same detailed
font panel used by cell formatting, with family/style/size lists, underline, color,
effects, and preview. Header/footer sizes are 1-409 points; accounting underline is
not offered. Font changes apply only after that dialog confirms. First/even tabs
appear when their variants are enabled or targeted.
The editor supports first/odd/even variants,
multiline text, formatting, and page number, page count, sheet name, file name, date,
and time fields. Readable localized markers are used in the dialog; XLSX control codes
remain stored. Imported mixed-format text is previewed with its styles and remains
verbatim when unedited. Edited sections use the selected uniform text format and the shared color palette. Enter
inserts a line; Ctrl/Cmd+Enter confirms, while Cancel/Escape discards the dialog draft.
Core rejects page-setting changes on protected sheets. Freeze settings remain saved
and take effect again in Normal view.

This follows WPS Spreadsheet's page-layout flow of Add Header/Add Footer to Page
Setup and Custom Header/Footer ([WPS guidance](https://bbs.wps.cn/topic/10938)).

## Settings and persistence

Page Setup has four concrete tabs:

- Page: portrait/landscape, percentage scaling from 10 to 400, fit-to-page presets
  or custom page counts (zero leaves that axis unrestricted), A4/A3/Letter/Legal
  or custom paper dimensions in millimetres, print quality, and automatic or
  explicit first-page number.
- Margins: six margin fields arranged around a paper preview, point/millimetre/
  centimetre/inch input units, and horizontal/vertical centering. Values are
  always stored in millimetres; the preview reflects centering and margins.
- Header/Footer: separate three-part previews, presets, Custom Header/Footer,
  and first-page/odd-even/scale/alignment options.
- Sheet: one local A1 print area, rows to repeat at top and bottom, columns to
  repeat at left, printed gridlines/headings/black-and-white, comment and error
  display modes, page order, and manual-break reset. Reference inputs reuse the
  worksheet picker and return local ranges; cross-sheet references are rejected.

Leaving the print area empty uses the content extent. The dialog validates the
complete local draft before applying one undoable Core command.

Core V14 snapshots save `Sheet.pageSetup` including these options. Missing fields
in earlier V14 snapshots receive defaults without a snapshot version change.
V1-V12 snapshots receive default page settings; V13 receives default header/footer
options while preserving its existing text. Axis insert/delete/move commands
transform the print range, manual breaks, and repeated-title ranges. Sheet Engine
owns pagination and paper projection without DOM dependencies; Web owns Canvas
painting, text fields, and pointer interaction.

XLSX import/export preserves supported/custom paper dimensions, margins,
percentage and fit scaling, first-page number, quality, printing flags, centering,
top/left print titles, page order, print area, manual breaks, and supported
first/odd/even header/footer text and formatting. Automatic XLSX breaks remain
automatic. Supported header/footer fields and literal ampersands retain their
meaning when exported. Subtotal-owned row breaks are merged with explicit breaks.
Bottom repeated rows remain saved in Core and produce an XLSX compatibility
notice because the standard print-title definition cannot represent them.

Fit page counts, first-page number, quality, repeated titles, centering, and the
Sheet printing options are saved settings for later printing work. Current page
views continue using percentage scaling and do not render those printing options.
Custom paper dimensions already affect the existing paper projection. Printer
selection, actual printing, print preview, multiple print areas, header images,
and PDF/browser printing remain outside this implementation.

Reference descriptions: [Excel page breaks](https://support.microsoft.com/en-us/excel/view-page-breaks)
and [WPS page break preview](https://www.wps.com/academy/how-to-view-page-break-preview-in-wps-spreadsheet-quick-tutorials-1861570/).
