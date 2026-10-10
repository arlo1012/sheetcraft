# Final iterative-cache production sample: real-app verification

2026-10-10 UTC, 06:21–06:33. Native WPS desktop and Excel web in dot cloud Chrome.

## Finding

The exact public-Core production XLSX opens numerically in both apps with B3 `=(B3+1)/2`, genuine Core cache `0.99993896484375`, and no `f/@ca`. The intended source change to `=(B3+2)/2` genuinely recalculates near 2. Both apps save actual XLSX bytes and preserve the exact changed source through full document/tab closure and fresh reopening.

Two qualifications are material:
- WPS's unchanged runtime setting is iteration disabled/100/0.001. The first production load shows the numeric cache, but the actual +2 commit gives 0 while disabled. The one already-authored native WPS +1 control likewise gives 0 after genuine unchanged-source re-entry under the same disabled setting. Temporarily applying the approved checked/50/0.0001 makes the production's already-committed +2 calculate 1.999938965 without a second source commit. Original settings were restored and visibly checked after the owned test document was closed.
- Excel's first load is clean and numeric. The later editing sequence had an erroneous prefix insertion and Undo before the one intended +2 commit. This is disclosed below; it is not presented as a clean one-commit history.

This evidence is for this exact single-cell convergence case. It does not establish safe cache behavior for every arbitrary cycle.

## Immutable production provenance

Production commit: `1b498934dc9a58922a08514db8fa29f64780f86b`.
Input: `Sheetcraft-iteration-production.xlsx`, 3354 bytes.
SHA-256: `cc6307959fa20f95858b870d702f931f1165e82ee4c90d986fc760afac12029b` before and after GUI work.

The supplied generator uses the actual public Core commands and encodeXlsx, with no evaluator cache provider. The source-runtime manifest binds the compiled public-package bytes and source files. Actual input XML inspection verifies:
- B3 `<f>(B3+1)/2</f><v>0.99993896484375</v>`, no formula attributes and no cell type attribute.
- calcPr: calcMode=auto, fullCalcOnLoad=1, iterate=1, iterateCount=50, iterateDelta=0.0001.

Generator and full provenance manifest remain beside the immutable input in the production-sample folder. See input-manifest.json for the compact GUI binding.

## WPS native sequence

1. From the preserved old starred document, read Options and record unchecked/100/0.001. Cancelled without applying.
2. Opened the exact production input using WPS native file picker. Selected B3. Source `=(B3+1)/2`, display 0.999938965. Read-only Options again showed unchanged unchecked/100/0.001. This establishes numeric first-load cache display.
3. One genuine per-character native keyboard source replacement committed `=(B3+2)/2`. Selected B3 confirmed exact formula and display 0 under the disabled app environment.
4. Opened only the pre-existing accepted native WPS original +1 control, SHA-256 `31bf0302c4ee3939d95f93ef85ea28295b1bb992f7e879a22bd6d248ca3ee47e`. It displayed saved cache 0.999969482 and the same unchecked/100/0.001. F9 did not change this display, so F9 alone is not claimed as recalculation proof. Genuine unchanged-source F2/Enter re-entry changed display to 0. Closed this owned control without saving; bytes remain unchanged.
5. Returned to production's already-committed +2 source. Applied the specifically authorized temporary checked/50/0.0001. Actual display became 1.999938965. No second production source commit.
6. F12 native Save As to the separate evidence filename `wps-saved-plus2.xlsx`, Microsoft Excel Workbook (*.xlsx). Full path entered with per-character key events. Saved title became unstarred and display 1.999969482.
7. Fully closed that document. The only remaining old starred document was visible. Freshly opened the exact just-saved filename from Recent. Source remained `=(B3+2)/2`, display 1.999984741 and automatic recalculation starred it.
8. Restored iteration unchecked/100/0.001 and applied OK. Closed owned reopened test without saving its post-reopen/restoration changes. Re-read Options from the remaining old starred document, visibly confirmed restoration after closure, captured 12 and cancelled.

WPS was not restarted because restarting would endanger the preserved starred document. Reopen proof is full document close/reopen within the same running process.

## Excel web sequence and input-control caveat

1. Normal upload through Excel web's 上传文件 picker using the exact immutable input. First-load source `=(B3+1)/2`, numeric display/readout 0.9999695, saved status. Excel advanced beyond the genuine input cache, so this is actual initial calculation rather than an identical static cached value.
2. Formula-bar Control+A did not clear old source. Real pressSequentially inserted a prefix and Enter actually committed `=(B3+2)/2=(B3+1)/2`, yielding FALSE. Undo restored exact original +1 and near 1 display 0.9999847. A subsequent grid pressSequentially action failed its selector deadline without changing source.
3. Home then Shift+End visibly selected exact original source; Backspace visibly emptied edit text. Real pressSequentially entered exact `=(B3+2)/2`, checked in Editing state before Enter committed it. Selected B3 confirmed exact formula and numeric readout 1.999939. Saved status/green cloud icon confirmed.
4. Captured safe saved state, fully closed original tab 68, and freshly opened tab 69 at the same verified hosted identity. Source `=(B3+2)/2`, display 1.9999695, saved status. Hosted identity SHA-256 before/after: `62833eb900325bdb4746ba61865579ed7247308b368c9a72c8312aefd3b3c253`. Raw private URLs and account identifiers are omitted from artifacts.
5. Used OneDrive's public normal route → My Files → exact owned filename row → visible context 下载. The search index initially did not return this new file; the actual My Files list did. Used the completed download.path and copied actual bytes to `excel-saved-plus2.xlsx`. No private endpoint, guessed download URL, chrome://downloads, profile/token reads, Office Script or cache injection.

## Actual saved bytes

WPS: 7649 bytes, SHA-256 `9493985b8bef06e68c30a1e35aa13233079b03b43901cf7caa5c06977220d2a6`.
- B3 source `(B3+2)/2`, native f/@ca=1, numeric cache 1.99996948242187.
- calcPr calcId 191029, iterate 1, count 50, delta 0.0001.

Excel: 5661 bytes, SHA-256 `afd224e2306b16e80fc57b67694520b072d768b13a9ef7b923674385cfcc92db`.
- B3 source `(B3+2)/2`, Excel-produced f/@ca=1, numeric saved cache 1.99993896484375.
- calcPr calcId 191028, iterate 1, count 50, delta 1E-4, calcCompleted 0.
- Fresh-reopen UI runtime display 1.9999695 differs from the actual downloaded saved cache. Both are near 2. This report preserves that distinction instead of assigning the UI value to downloaded XML.

The apps added ca=1 when saving the edited source. The production input itself has no ca. See saved-export-inspection.json and extracted app-saved workbook/sheet XML.

## Evidence and preservation

- Twelve native PNGs and three safe Excel JPEG worksheet/ribbon crops. Every retained capture is nonblank by RGB pixel statistics; key result captures were visually inspected. No blank capture is presented as proof.
- observations.json records sequence, exact formula/results, caveats, save/reopen states, opaque identity and cleanup.
- input-manifest.json verifies unchanged production and native control inputs.
- screenshot-validation.json binds all 15 captures by dimensions, bytes, SHA-256 and RGB standard deviation.
- SHA256SUMS binds all evidence files.

All owned Excel/OneDrive tabs were closed. Final inventory contains only protected 2/5/8/9. The old `protection-print-calculation.xlsx *` document remains open, starred, and was not manually edited, saved, closed, overwritten or discarded. No production source, build, GitHub, credentials or profile operations occurred. No extra production fixture or attribute matrix was made.
