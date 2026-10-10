# Ordinary clustered-column native I/O acceptance, 2026-10-10

Branch: `refactor/native-xlsx-20261009`, repository `arlo1012/sheetcraft`.
Base checkpoint: `e513272666288f9bdbf52c08a5fe6aa38d94411a`.
Scope: the existing ordinary chart model's first bounded native column slice.
This does not complete all chart types, drawing import or the full insert roadmap.

## Native producer and one meaningful difference

18:28–18:30 UTC, real cloud WPS 12.1.2.29182: opened a public-API data-only seed,
selected Data!A1:C4 and used Insert → Column → first clustered option. The data was
region/apple/pear; east 60/70; north 100/80; south 120/90. A preliminary name-box
attempt accidentally replaced A1; it was restored to `region` before chart creation
and saving. The retained producer contains the intended four-row dataset.

The actual WPS file has header formulas B1/C1, shared category formula A2:A4,
adjacent value formulas B2:B4/C2:C4 and matching three-point caches. Unlike the
linked producer it has no `pivotSource`, pivot definition/cache or field buttons.
Its default title contains typography but no explicit text. It uses a two-cell
physical drawing frame and chart style/color companions already covered by the
bounded chart graph. No broader family or drawing rule was inferred.

Changed B3 100→110: the ordinary chart updated immediately, without Refresh.
Ctrl+S, Ctrl+W and Recent-file reopening retained source/chart 110. Closed again.
Local created producer: 13,800 bytes, SHA-256
`c549ca3c8d3c3e0dc8acaa8ea100b3c217aa4b5d861d69e75686f75e27399631`.
Local edited producer: 13,803 bytes, SHA-256
`08774d5e44e398486b02dd3be5018f4f14907a17d835c98e3a951a14d8d4305e`.
Both actual files decoded through the compiled public API with ordinary A1:C4
binding and the correct 100/110 values. Presentation and geometry warnings remain.

## Actual product double-app verification

The helper generated independent fresh WPS and Excel test copies using the public
XLSX entry and existing Core drawing model. Each was initially 5,580 bytes,
SHA-256 `bacf8b34f8c0e16ef9bdf4d2077bb2e047e6c35b6b5e6b67d2c19b2c81882455`.

- 18:38 UTC, WPS: first-open showed the Sales title, east/north/south, apple
  60/100/120 and pear 70/80/90. B3 100→110 updated the bar immediately. Saved;
  dirty marker cleared; closed and reopened through Recent. Source/chart 110
  remained. Closed to Home.
- 18:39–18:41 UTC, existing authenticated Excel web cloud session: opened in
  normal editing view, Saved, without a repair prompt. Both series and title
  appeared correctly. B3 100→110 immediately updated the bar, then Saved.
  Returned to Excel Home to close the workbook view; reopened that same Recent
  item and verified source/chart 110. Closed back to Home. This is GUI reopening
  evidence; no local Excel-saved download bytes are claimed.

WPS-saved actual product: 11,425 bytes, SHA-256
`749bd0718d67f8a0f68646a39bd44ba4ad1b5f1c0b0a99872364bf257b18dcb8`.
Public API reimport/reexport retained live A1:C4 binding, title and apple 60/110/120.
Reexport: 5,791 bytes, SHA-256
`7d4c67b47b9389d6a722ab0396cdde83544430833bbbe60026ec7c99563094ec`.
18:43 UTC, this reexport also opened normally in Excel with Saved, correct 110
and no repair prompt; closed to Home. No extra edit/reopen cycle on this last file.

The original WPS-created 100 producer was separately reexported through the public
API: 5,742 bytes, SHA-256
`9593a29cdc46b1be9b6895239bdb012c12519f56b99126bf28d76e4e6ea31dcd`.
18:44 UTC, WPS opened it with both series and category order correct. Its implicit
default title placeholder was absent, as disclosed in the presentation contract.
Closed without changes. No pixel-identical presentation claim.

The final compiled code's fresh export was compared against the GUI-tested fresh
product. See `final-public-export-comparison.json`: ZIP envelope timestamps differ;
every uncompressed generated part is byte-identical. Never confuse that with equal
whole-file hashes. Reusing the output path returned EEXIST as intended.

## Checks, retained initial failures and scope

Logs are under `evidence/native-column-chart-20261010/`.

- Initial typecheck/focused run failed because one new test used the wrong Core
  formula payload. Focused result was 125 pass / 1 fail. Corrected the test setup;
  the subsequent four files / 126 tests passed. The failed tee path and missing
  first ad-hoc check script are recorded in `initial-check-findings.txt`, not
  misreported as product failures or successful commands.
- Extended focused run: 129 pass / 1 fail (130 total). Its number-format assertion
  expected `0.00%`, while existing Core normalization uses `#,##0.00%`. The initial
  full XLSX run likewise had 993 pass / 1 fail (994 total). Both logs remain. The
  assertion was corrected to the existing format contract, without product format
  changes. That first full run's diagnostic code-frame read the already corrected
  file while the original assertion was running; the expected/received mismatch
  in the retained log identifies the actual failure.
- Corrected full run: 76 files / 994 tests passed, then another full run after
  cosmetic issue-path renaming also passed 994. Final shared Core drawing validation
  and its two geometry regressions were followed by **76 files / 996 tests passed**
  (`xlsx-all-final-geometry-guard.log`), plus final focused four files / 132 tests
  (`focused-final-code.log`). Includes existing native PivotChart,
  leaf-layout, package graph, image-export coexistence and DXF regressions.
- Final XLSX types/build, scoped lint and formatting passed (`static-final.log`).
  Full Web typecheck passed, including after final code (`final-web-and-format.log`);
  no Web code changed. The reproduction script also passed standalone strict
  TypeScript, lint/format and seed/actual-saved-file roundtrip execution
  (`script-final-checks.log`). The first script compile omitted TypeScript 6's
  required `--ignoreConfig` CLI flag and failed TS5112; that log is retained.
- Architecture aggregate first had 130 findings from lexical local `location`
  symbols after extraction. Renamed owned locals to `issuePath`; final aggregate
  remains failed with 125 existing diagnostics, no additions relative to the prior 126. One prior chart-local diagnostic disappeared. Logs/comparison are retained;
  this is not all-repo/CI green. Existing Core/Web failures were not relabeled as
  chart defects or repaired outside this slice.

Coverage includes live mutation, snapshots/repeated XLSX roundtrips, text escaping,
zero/negative/missing/error points, consistent numeric formats, legend/value labels,
source visibility, geometric omission, linked/ordinary ownership distinction, exact
cache/reference proof and unsupported safe variants. Existing Web chart creation
UI was inspected, not freshly exercised here. No Core-wide suite, all-Web suite,
all-repo CI or new independent adversarial import review is claimed. The previously
stopped PivotChart review was not repeated.

## Evidence privacy and recovery

Only ordinary source, synthetic regression structure, reproduction script, text
acceptance and test logs are included in this checkpoint. These newly GUI-created
XLSX files, their raw XML and screenshots are not uploaded to Git. No browser
session, account details, credentials or cookie backup is included. The original
three previously authorized PivotChart producer files remain in the prior history.
Recreate this ordinary producer from the committed seed recipe after a reset.

Both apps ended on Home with test workbook views closed; no new browser tab was
opened. Remaining chart configurations and insert capabilities continue under the
existing roadmap, with another actual producer required before expanding support.
