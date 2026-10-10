# Table-backed PivotTable sources

This bounded WPS Insert slice supports one table with a visible physical header
row and a stable field schema. It does not establish complete Insert parity or
real-app acceptance of the product's new files. The independent WPS producer
`packages/xlsx-io/src/tests/pivot-tables/fixtures/wps-table-source.xlsx` contains
the genuine named cache source `Table1`, six records and total 520.

## Identity and refresh

- New single-cell creation inside a table stores `(sourceSheetId, sourceTableId)`
  and shows its current name. Explicit multi-cell/A1 sources stay fixed ranges.
- Row growth/shrink, automatic appended rows, totals and rename do not change the
  displayed report or last-refresh cache. Explicit Refresh reads the current
  table, excludes totals, and updates source geometry/cache/output atomically.
- Missing or deleted tables never fall back to old cells, an old name or another
  sheet. An unchanged prefilled Create source cannot silently bind a same-name
  replacement. Reopening or explicitly selecting a different source is required.
- Unsafe column/header changes invalidate refresh rather than binding a removed
  value field to the next column. The old display/cache and field indices remain;
  `source: null` is an invalidation sentinel, not permission to re-resolve.
- Explicit Change Source can repair the current table. Cached header identities
  remap fields; missing fields are dropped. Only that operation requests
  `repairSource`; ordinary refresh/update cannot strip the stored schema guard.
- Move preserves and validates binding. Consolidation and pivot-derived source
  modes keep their existing behavior and do not acquire binding implicitly.
- A copied sheet remaps its own source table IDs; external source pairs remain
  external. Current live geometry protects the source from overlapping output.

## Persistence and native XLSX

Snapshot V43 retains optional `sourceTableId`. V1–V42 input remains supported and
never auto-binds a matching rectangle. Older-version payloads containing the new
field are rejected. The public `resolvePivotTableSource` supplies the authoritative
sheet/range/table; the workbook-free range helper describes last-refresh geometry.

Native export emits `worksheetSource name="CurrentTableName"` while preserving
last-refresh records/report and `refreshOnLoad="0"`. Import resolves the current
native table ID because table IDs are renumbered during export. Matching own
metadata preserves last-refresh geometry; native-only imports use current native
geometry. Cache-source edits take precedence over stale product metadata. A
matching own bound source cannot silently become a same-name defined-name range.

Invalid bindings warn and omit native PivotTable/cache parts while retaining the
saved worksheet report cells. Diagnostics follow the existing internal export
policy. Successful supported exports still have the existing unrelated table-part
import warning; no general table-import losslessness claim is made.

## Verification and remaining work

Focused Core/native/Web regressions cover identity, cache timing, history, repair,
copying, schema gates, metadata precedence and rejected/captured dialog sessions.
Full Core/native suites and grouped Web Table/Pivot/PivotChart tests are recorded
for their exact checkpoints; failed resource runs and stale-version assertions
are retained with the final successful runs.

Actual WPS product-file open/save/reopen is pending recovery of native controls.
Header-disabled metadata headers, automatic column identity migration and whole
table cut-follow remain follow-up capabilities. New-sheet Web creation now starts
at A3, matching the retained WPS build's observed placement. Explicit existing-sheet
destinations and older A1 reports retain their anchors; Core command defaults are
unchanged. Native PivotChart export still requires a genuine chart producer;
current drawing omission is unchanged.
