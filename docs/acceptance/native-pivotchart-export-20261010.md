# Native PivotChart code checkpoint — 2026-10-10

## Actual product WPS acceptance

WPS Sheets `12.1.2.29182.AK.preread.sw` opened the final product-generated clustered
column fixture with populated bars on first load. Selecting the chart showed the
native PivotChart field list and its region/product/amount areas. The synthetic
fixture is reproducible through `native-chart-fixture.ts` and `encodeXlsx` with
the actual basename `sc-product.xlsx`; the output sheet was made active.

The six source records sum to 520. The actual GUI workflow changed source C2 from
100 to 110 and saved. Report B6 remained 100, report D8 remained 520, and the chart
remained stale. Explicit PivotTable Analyze → Refresh changed B6 to 110, D8 to
530, and the apple series cache to `[60,110,120]`; pear remained `[70,80,90]`.
After saving, closing the workbook, and reopening, both values and native chart
association persisted. ZIP CRC and the saved chart/report XML agreed with the GUI.
The chart was moved below the report only to make the entire synthetic plot visible.

Saved/refreshed/reopened working-copy SHA-256:
`c242e5ba296386088061b6e8b291a0012369d2481387e0904ba13b5d8bf58ff8`.
Reopening did not change it. Raw GUI screenshots and working XLSX files are not
included in this code checkpoint.

A subsequent native WPS rename to `Sales O'Brien` preserved the linked chart and
established its identity/formula quoting. It is separate from the hash above.
Excel web acceptance has not yet run at this checkpoint.

## Automated results

- XLSX focused: 18 files, 170 tests passed (pivots, images, native writer).
- XLSX entire package: 73 files, 876 tests passed.
- XLSX package typecheck and build passed.
- Complete Web typecheck passed after filename propagation and its test narrowing.
- Web XLSX module initially: 37 passed, 1 failed. The existing error-dialog test
  expected a footer Close button although production intentionally disables that
  footer. The test now exercises the actual titlebar close control and confirms
  no footer. No production dialog behavior changed.
- Web XLSX module after that test correction: 6 files, 38 tests passed.
- Scoped formatting, lint and source/test whitespace checks passed.

The [test logs](evidence/native-pivotchart-export-20261010/) preserve the Web failure
and subsequent result. Executor logs show its local clock; this checkpoint date
and workflow sequence use task UTC. This is not an all-repository green claim.
The earlier boundary scan still has 125 diagnostics. Earlier reentrant
close/navigation guards retain their separately reported skips. No CI result or
GUI acceptance for other native chart types/import is implied.

Scope and omission behavior are in [the export contract](../insert/native-pivotchart-export.md).
