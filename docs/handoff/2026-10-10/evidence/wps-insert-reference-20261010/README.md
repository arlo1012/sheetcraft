# WPS Insert reference, 2026-10-10

## Scope and provenance

Native WPS Sheets 12.1.2.29182, dot-cloud Linux desktop. All data below is synthetic and entered through native keyboard events in a new workbook. No model-written workbook was used as a native producer. Files were saved by WPS Save As with Microsoft Excel Workbook (*.xlsx) selected and verified as ZIP-based OOXML. The pre-existing protection/print/calculation workbook and browser tabs were not edited.

## Synthetic input

Source Sheet1!A1:D7, lowercase headers as actually typed:

| region | product | amount | qty |
|---|---|---:|---:|
| north | apple | 100 | 2 |
| north | pear | 80 | 1 |
| south | apple | 120 | 3 |
| south | pear | 90 | 2 |
| east | apple | 60 | 1 |
| east | pear | 70 | 2 |

The source amount total is 520, qty total is 11.

## Actual Insert ribbon

At the observed window width the first standalone buttons are PivotTable, PivotChart, Table. Then Pictures, Document, Shapes, WordArt, Text Box, Chart plus compact chart-type controls, Sparklines, Link, Equation, Symbol, Attachments and narrow icon controls at the right. One initial screenshot/observation with extra space also exposed Screenshot between Document and Shapes; ribbon compression later omitted it. Sparklines was disabled in the observed compatibility-mode workbook. Do not treat compressed ribbon absence as proof a command is unsupported.

Existing-pivot selection: PivotTable and Table disabled, PivotChart enabled.

## Table

Blank A1 opens Create Table with source `=$A$1`; My table has headers unchecked; Filter the table checked; OK and Cancel.

A single active A1 in the populated ordinary range auto-selects `=$A$1:$D$7` and detects the first row as headers (checked). Filter the table remains checked. Cancel did not change the blank workbook.

Created native Table1 with blue header/filter arrows and blue banded rows. Table Tools contextual ribbon includes Remove Duplicates, Convert to Range, Insert Slicer; Header Row, Total Row, First Column, Last Column, Banded Rows, Banded Columns controls; visible style gallery. Created table had Header Row and Banded Rows on, other style-option checkboxes off.

Saved producer: native-table.xlsx. Real table XML: id/name/displayName1/Table1/Table1, ref A1:D7, autoFilter A1:D7 with WPS etc:filterBottomFollowUsedRange0, totalsRowShown0, four lowercase column names, TableStylePreset3_Accent1, showFirstColumn0/showLastColumn0/showRowStripes1/showColumnStripes0.

## PivotTable

Blank source: Create PivotTable dialog, Select a range with empty input; Use multiple consolidation ranges (Select Ranges disabled until chosen); disabled Use another PivotTable. Destination default Existing worksheet with Sheet1!$A$1; New worksheet alternative. OK on empty source gives modal `Reference is not valid.` The error was dismissed and creation cancelled.

From the native Table1 selection, source auto-prefills `Table1` and destination defaults New worksheet. Switching to Existing worksheet enables an empty destination input and range picker. This test did not claim destination default is invariant across source states. Also, Table1 source was observed while the table remained selected after insertion; the separate active-single-cell-inside-table variant was not completed before native control loss.

Creating on New worksheet inserted Sheet2 before Sheet1, with PivotTable1 starting A3 and an empty placeholder instructing use of Field List. Side panel includes search, field checkboxes, and four drag areas in a two-by-two layout: Filters / Columns, Rows / Values.

Region checkbox automatically placed region in Rows. Amount checkbox automatically placed Sum of amount in Values. Product was dragged to Columns. Actual table is Sheet2!A3:D8: east60/70/130, north100/80/180, south120/90/210, Grand Total280/240/520 (apple/pear/grand).

Native input caveat: bound app coordinate clicks selected the field row without toggling the checkbox. Real Sky desktop mouse click toggled successfully; Sky drag placed Product in Columns.

Saved producer: native-pivot.xlsx. Actual parts include pivotCacheDefinition1.xml, pivotCacheRecords1.xml and pivotTable1.xml and their relationship files. Cache source is worksheetSource name Table1; recordCount6; four cache fields. Pivot definition cacheId0, location A3:D8, region axisRow, product axisCol, amount dataField, Sum of amount fld2. OOXML extracted for inspection in ooxml/native-pivot.

PivotTable Analyze contextual ribbon: PivotTable Name; Options; Active Field; Field Settings; Hide; Expand Field/Collapse Field; Group Selection/Ungroup; Insert Slicer; Filter Connections; Refresh; Change Data Source. Disabled/enabled states vary with selected field. Design contextual tab also present.

## PivotChart

Blank Insert PivotChart opens Create PivotChart, which uses the same source and destination controls as Create PivotTable and even says `Choose where you want the PivotTable report to be placed`. This establishes availability of the command in this build, not a successful producer.

From an existing configured PivotTable, Insert PivotChart skips that source/destination stage and opens Insert Chart. Column selected; top has three column subtype thumbnails. Left list: Column, Line, Pie, Bar, Area, X Y (Scatter), Stock, Radar, Combo, Templates. Default preview actually showed grouped columns, east/north/south categories and apple/pear series. The displayed heading was literally `Clustered Column - Line` despite grouped column preview. OK/Cancel at bottom.

First bound-app OK click closed the chooser but no chart was visible and the workbook did not become modified. No native chart bytes were saved. Before a real-mouse retry, every native CUA method including listWindows failed `native pipe path unavailable: No such file or directory (os error 2)`. Supported getState confirmed native apps error and empty inventories. Therefore PivotChart production is INCONCLUSIVE due to control loss, not verified as unavailable in WPS. Do not fabricate chart parts or pivotSource linkage. Saved native-pivot.xlsx has no chart parts.

## Deliverables and state

- native-source.xlsx: WPS-authored synthetic ordinary source, 9473 bytes
- native-table.xlsx: WPS-authored source plus real table, 10530 bytes
- native-pivot.xlsx: WPS-authored source table plus real pivot, 15045 bytes
- producer-manifest.json: SHA256, byte sizes, ZIP parts, empty chart-part lists
- ooxml/: extracted original OOXML contents, unmodified
- Nine safe screenshots of populated table dialog/table/ribbon, pivot source/existing destination/empty field list/finished pivot, chart chooser, and inconclusive first chart attempt

At native-control loss, native-pivot.xlsx was saved and open. It could not be closed through GUI. The old starred workbook was untouched. Closing only the saved test workbook remains pending when supported native controls resume. A native-input batch timed out once and automatically reset the REPL kernel; no intentional reset was performed.
