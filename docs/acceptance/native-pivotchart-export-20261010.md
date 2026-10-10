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
Excel web acceptance had not yet run when the initial code checkpoint was
prepared. Its subsequent actual result is recorded below.

## Actual product Excel web acceptance, 16:53–16:58 UTC

The existing signed-in cloud-browser session uploaded the fresh product-generated
`sc-product.xlsx`, SHA-256
`ebc4823b59bec28595293a1d42aab11221705249e16e88e449e6dc2e043bdfbc`
(10,266 bytes). This was the product export, not a WPS-resaved workbook.

On first open, Excel web rendered both clustered-column series and native
`region`, `product`, and `Sum of amount` field buttons. Report B6 was 100 and D8
was 520. The chart had categories east/north/south, apple `[60,100,120]`, and pear
`[70,80,90]`. Selecting the report exposed native PivotTable tools and the field
pane with region in Rows, product in Columns, and Sum of amount in Values.

After editing Source C2 to 110 through actual grid keyboard input, the source
cell visibly held 110 while the report/chart remained cached at 100/520. The
explicit PivotTable **Refresh All** action changed Report B6 to 110, D8 to 530,
and the north apple bar to 110. Excel reported Saved. Returning to the Excel
homepage and opening the saved workbook from Recent created a new workbook
session; the chart, field buttons, B6=110 and D8=530 persisted.

An initial formula-bar automation attempt did not change the source value. A
later name-box fill appended to its controlled value and showed a recoverable
invalid-name dialog. Both were diagnosed through the actual UI; the final edit
used explicit keyboard selection/input and was visibly verified before refresh.
No failed input attempt is counted as a workbook behavior result.

**Evidence limit:** Download a Copy was attempted before and after the final
workflow, but the supported browser download event timed out after 20 and 50
seconds and returned no local file. A download-history inspection was blocked
because the browser permits only HTTP/HTTPS URLs; that inspection stopped and
its temporary tab was closed. No alternate route bypassed the restriction.
Therefore this is an actual GUI open/refresh/save/reopen pass, not an assertion
about downloaded Excel OOXML bytes. No screenshots, account identifiers,
document URLs, login state, or credentials are included in this record. The
signed-in Excel homepage remains available for future tests.

## Git preservation

The initial code and native-producer evidence were preserved on
`arlo1012/sheetcraft`, branch `refactor/native-xlsx-20261009`, at
[`7ccd63ae0296e1406b23c570adc9e13f317c04ea`](https://github.com/arlo1012/sheetcraft/commit/7ccd63ae0296e1406b23c570adc9e13f317c04ea).
The remote ref was read back and matched that commit. Its tree is
`85ef61c2559287f3dc30acd449b5b21dba13d63c`, parent
`6ba8c3be17e7de28f713704b3a007c3aa3175f1a`; 32 changed paths include exactly the
three approved synthetic native-producer XLSX files and parsing records.
Screenshots and authentication state are excluded. The authorized connector
used login `arlo1012`; GitHub recorded author/committer name `arlo.wang` and
verified no-reply email `75329932+arlo1012@users.noreply.github.com`. Existing
commit identities were not rewritten.

That commit had no returned status checks or PR-triggered workflow runs when
queried. This is confirmed Git preservation, not remote CI success. This later
text addendum is not part of the initial commit above.

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
The earlier boundary scan still has 125 diagnostics. The reentrant close/navigation
guards already passed 2/2 in their filtered run (the other eight tests were
unselected), then passed within the complete 59-test and 467-test aggregates,
with no skips. See [the resumption record](insert-wip-resume-20261010.md).
No CI result or
GUI acceptance for other native chart types/import is implied.

Scope and omission behavior are in [the export contract](../insert/native-pivotchart-export.md).
