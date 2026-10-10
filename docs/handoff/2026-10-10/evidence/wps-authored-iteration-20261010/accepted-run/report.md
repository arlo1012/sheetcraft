# WPS native iteration sample: authorized run

Date: 2026-10-10 05:35–05:46 UTC. App: installed official Linux WPS 12.1.2.29182.

## Result

Native iterative calculation works. With iteration enabled, 50 maximum iterations and 0.0001 maximum change, a new app-created single-sheet workbook containing only B3 `=(B3+1)/2` displayed 0.999938965. A fresh close/reopen and the single-factor edit to `=(B3+2)/2` produced a near-2 result, proving actual recalculation rather than static near-1 cache display. Both stages were saved by WPS as real XLSX bytes and retained iteration settings. Original preferences were restored and verified after closing the test workbook.

This accepted run adds to the earlier cancelled scope inspection. The earlier report, observations and screenshot were not modified.

## Native sequence

1. Created a new blank native workbook, renamed its only sheet Iteration. Temporary UI input misfocus produced disposable A1/A2 content before the final formula; the sheet was cleared natively, and actual saved XML verifies only B3 contains data. No imported/generated workbook was used for authoring.
2. File → Options → Workbook Calculation showed original iteration unchecked, count 100 and change 0.001. With explicit authorization, changed only those controls to checked/50/0.0001. Automatic, multithreading and all other controls were unchanged.
3. Entered only B3 `=(B3+1)/2`. WPS displayed 0.999938965. Saved iteration-native-original.xlsx with Microsoft Excel Workbook (*.xlsx) selected. Save recalculated once more and displayed 0.999969482.
4. Completely closed that document, leaving the old starred document open. Opened the actual saved original through WPS Recent. It displayed 0.999984741 and became starred automatically on recalculation. Read-only Options inspection showed checked/50/0.0001; cancelled without applying.
5. Changed only B3 to `=(B3+2)/2`. WPS displayed 1.999938965. Used native Save As to a separate iteration-native-edited.xlsx. It displayed 1.999969482 after saving.
6. Completely closed and freshly reopened that saved edited document. It displayed 1.999984741 and became starred automatically. Saved bytes were not overwritten.
7. Restored original iteration unchecked/count100/change0.001 through Options, applied OK. Closed the current synthetic test document without saving its post-reopen automatic-cache/restoration changes. Both evidenced native saved stages remain unchanged.
8. From the remaining old starred document, opened Options read-only and verified unchecked/100/0.001 still applied after test closure. Captured screenshot 06, then Cancel. No test workbook remains open.

## Actual saved bytes

Original: iteration-native-original.xlsx, 9043 bytes.
SHA-256: 31bf0302c4ee3939d95f93ef85ea28295b1bb992f7e879a22bd6d248ca3ee47e
- calcPr: calcId="191029", iterate="1", iterateCount="50", iterateDelta="0.0001".
- B3 type attribute absent: numeric decimal cache.
- Formula: `<f ca="1">(B3+1)/2</f>`.
- Cache: `<v>0.999969482421875</v>`.

Edited: iteration-native-edited.xlsx, 9046 bytes.
SHA-256: 435aad6ec8574ffd459c08dd22332cb689c663982f320a3d69122cec5d5ff0c6
- Same exact calcPr attributes.
- B3 type attribute absent: numeric decimal cache.
- Formula: `<f ca="1">(B3+2)/2</f>`.
- Cache: `<v>1.99996948242187</v>`.

Both contain one sheet named Iteration and only B3 populated. Neither contains xl/calcChain.xml. calcMode, fullCalcOnLoad, forceFullCalc and calcOnSave are absent on native calcPr; attribute absence should not be assigned an invented value. Original/edited workbook.xml and sheet1.xml are extracted unchanged beside this report. `ca="1"` is native formula evidence, not an established requirement for exporter interoperability.

## Preservation and scope nuance

Temporary iteration affected the already-open old protection-print-calculation.xlsx runtime calculation: its B3 displayed 0 initially and 1 after enabling iteration. That old document was never manually edited, saved, closed, overwritten or discarded. It remains open and starred, including its prior unsaved work. Its runtime B3 still displays 1 after restoring preferences. This observation shows cross-open-document calculation impact of the temporary setting, without claiming every control on the page is global.

No browser tabs were navigated or closed. No production/source edits, GitHub/Library operations, uploads, Office Script execution, LibreOffice use, profile/token reads or new agreements occurred.

The native fresh reopen was a full document close/reopen within the same running WPS process. App restart was intentionally not performed because that would risk the preserved starred document. Thus this establishes saved settings retention and same-process actual recalculation, not a cold application-start independence test. It also does not by itself establish which exporter difference caused the earlier failure.

## Evidence

Six safe native screenshots were saved, each verified nonblank with image dimensions, RGB standard deviation and SHA-256 in observations.json. SHA256SUMS records both actual XLSX files and every screenshot. The restoration screenshot was taken after settings were applied and the test document was closed, not merely while unsaved fields were being edited.

WPS Save As uses its own file chooser. `historical-temp` alias/full-path attempts were rejected with local-path warnings; no successful save occurred there. Actual `historical-artifacts/.../accepted-run` folder address and a basename worked. No security or access restriction was bypassed.
