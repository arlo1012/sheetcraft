# WPS native acceptance, 2026-10-10

Application: restored official WPS Office 12.1.2.29182.AK.preread.sw on dot cloud Linux desktop. Production workbooks were copied to this isolated directory before native edits; source originals were not changed.

## Authorized startup

At 02:06 UTC, checked the existing agreement checkbox and clicked Confirm after the user explicitly approved both displayed links. The modal closed and WPS started. Accepted links:

- https://global.wps.com/privacy/policies/eula/wpsoffice?lang=zh-CN
- https://global.wps.com/privacy/policies/privacy/wpsoffice?lang=zh-CN

An optional “set WPS as default office software” prompt was dismissed via X; no default-app setting, cloud login, account creation, or further agreement was accepted.

## Data and native pivots

- Input SHA-256: d6aec64d6c168741b5490ee85659dfd60dbbfa01dd3efc97c26094bb9698877e.
- Opened without repair or format warning. Initial Ordinary Pivot West/East/Grand Total: 40/60/100.
- Sales Source East filter and collapsed outline were initially retained. Native dropdown showed East selected, West unchecked.
- Clear filter revealed all four source records, including West Amount=40, E2=200 and E7=400.
- Edited C2 from 40 to 60 through the native sheet UI. Local structured-reference E2 immediately became 300; SUM(SalesTable[Row Total]) E7 became 500.
- Refreshed ordinary native pivot using Alt+F5: West/East/Grand Total=60/60/120.
- Refreshed duplicate native aggregation pivot: grand Sum/Avg/Count=120/30/4, with West 60/60/1 and East 60/20/3. Native field-list UI retained three distinct measures.
- Reapplied East filter, hiding West and showing three East records.
- Clicked native Save toolbar, no warning. Closed workbook tab and reopened it from Recent.
- Reopened E7=500 with East filter preserved; reopened native ordinary and duplicate pivot outputs were the same. Screenshots data-duplicate-reopened.jpg and data-ordinary-reopened.jpg document this.
- Actual WPS-saved XLSX SHA-256: cf1b40d8396014e5dd004841b9070f327bb1221d1630bc9f1903fac30a832e27. ZIP CRC test passed. XML retains C2=60, E2 structured-reference formula/cache300, E7 table SUM formula/cache500, and hidden West row.
- Source-table headers render black text against a dark blue fill in WPS. This reproduces the cross-application header-color issue; this test does not establish its root cause.

## Whole-number validation

- Input SHA-256: 387af7be1e8752efc64f9fe60445c4a3d459c1724dd59154319d3bf3cd6642bc.
- Opened without repair. A2 initial value=1.
- Typing 11 and pressing Return produced a red-X “Invalid quantity / Choose a whole number” inline error and prevented committing the edit. Escape canceled the invalid edit and restored1.
- Typing10 committed successfully. Saved through the native toolbar without warnings, closed the workbook tab, and reopened from Recent.
- Reopened A2=10. A repeated11 edit was again blocked by the same error; Escape restored10. Screenshots validation-invalid11.jpg and validation-reopened-reject11.jpg document the alerts.
- Actual WPS-saved XLSX SHA-256: 2bf06537cf18df8d8a23d474f5ec949d02318bbad8cb12cbedd46ca1cdd2c0ed. ZIP CRC test passed. XML retains A2=10; whole/between1..10; showErrorMessage=1, showInputMessage=1, titles and prompt text.

## Floating and cell images

- Production input SHA-256: eaed059c6a57513864663ce4930193bc09eec41c7724fddccb4a34d266d62f8d.
- Initial native open without repair showed both the small A3 cell image and the 96×64-pixel C6 floating image.
- Entered marker B2=1, saved without a warning, closed the workbook tab, and fully reopened the saved file from Recent.
- Both images remained visible after reopening, and B2=1 remained. This does not reproduce Excel web's disappearing floating-image behavior.
- Actual saved images-drawings.xlsx SHA-256: 65fddc95ba053d56eac20f8bb69729d2e644a6d099cd0b3b6a024c805f67f302. ZIP CRC passed; drawing, media, metadata and richData retained. WPS also added cellimages.xml. Screenshots images-initial.jpg and images-reopened.jpg.

## Protection, date system, iteration and printing

- Production input SHA-256: baaa5476c2a58635103643663860de78da6eb2a2257dba08409a4572db72e6c2.
- Native open produced a Circular Reference diagnostic pointing to Date and Iteration!B3. The diagnostic list was dismissed with Escape, without changing application settings.
- B3 retained formula =(B3+1)/2 but displayed0 instead of converging to1. Date serial1 displayed1904-01-02. Cross-sheet formula initially displayed24.
- Attempted edit of locked Protected Print!A1 was rejected with a protected/read-only-cell toast. Unlocked Protected Print!B3 accepted12→14; dependent Date and Iteration!B2 recalculated24→28.
- Saved without warning, closed, reopened. Date1904-01-02, cross-sheet28, formula(B3+1)/2 and value0 persisted; the circular-reference diagnostic returned. No global iteration configuration changed.
- Actual saved protection-print-calculation.xlsx SHA-256: bb8da39b9b383778a00c2dfd2b5b6ad804db0422c711f3f33f69148778973e50. ZIP CRC passed. WPS removed iterate, iterateCount and iterateDelta from calcPr, writing only calcId191029. Workbook structure lock and print area/titles remained in XML.
- Native print preview could not open because WPS said no installed printers were found. No printer was installed and no print job submitted. Print layout is therefore not GUI-accepted in this environment.
- Screenshots iteration-circular-warning.jpg, iteration-initial-zero.jpg, protection-reject-locked.jpg and protection-date-iteration-reopened.jpg.

## Geometry and styles: focused native checks

- Geometry opened without repair. Merged title, custom wide A column, row4 hidden, columnD hidden, freeze lines after row2/columnD, two visible sheets and hidden third sheet were retained visually. Quoted-sheet formulas initially displayed42 and15.
- Edited Layout!A3 from6→9; B3 formula =A3*'Detail''s Data'!A1 recalculated42→63, B5 stayed15. Saved without a warning. Screenshots geometry-initial.jpg and geometry-recalculated.jpg.
- Styles opened without repair. Inspected each of Typography, Alignment, Number Formats, Borders and Fills once. Distinct font/underline samples, multiline alignment positions, border dash/width variants and pattern fills rendered. Number examples showed date2025-12-09, time12:00:00, red-parenthesized negative number/custom formats, percent, currency, accounting, scientific and fraction formats. This was a focused key sweep, not a complete style/control matrix.
- Screenshots styles-typography.jpg, styles-alignment.jpg, styles-number-formats.jpg and styles-borders-fills.jpg. After the four focused sheet checks, clicked the native Save toolbar without warning. The styles file changed from7509 to12701bytes (SHA-256: 54d16cbed77a394b051ff85ae5359dc1334257a265a990d75b07ed1dc606ec4e); no cell content was edited. Styles was not closed/reopened. No unrelated style redesign was performed.

Critical native WPS sweep completed at02:25 UTC. Open application-specific issues: black source-table header text; iteration settings not adopted/preserved; print preview blocked by missing installed printers. Geometry/styles were key-checked once rather than subjected to a full reopen matrix.
