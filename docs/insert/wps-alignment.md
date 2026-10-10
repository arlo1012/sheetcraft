# WPS Insert alignment

The user approved this phase on 2026-10-10 after conditionally concluding the
native XLSX/formula acceptance phase. Work stays on `refactor/native-xlsx-20261009`.
Preserve the full ribbon and implement real workbook commands, history, editing,
cancellation, permissions and persistence. A visible button is not an acceptance
result. Native XLSX support is tracked separately from internal document support.

## Dependency order and current capability

1. **Tables → PivotTable source correctness and lifecycle.** Tables already have
   Core commands for creation, generated headers, independent filters, styles,
   totals, resizing and conversion. Native XLSX table parts/styles are supported.
   Single-cell pivot creation now binds a structured table's sheet/table identity,
   excluding totals and touching neighboring columns while retaining internal
   blank rows. Explicit multi-cell selections remain explicit. Header-disabled
   auto-selection requires the user to supply a header-bearing source. Table row
   growth is read on explicit refresh; cached output does not refresh on export.
2. **PivotTable workflow.** Creation, new/existing destinations, field pane,
   refresh, source modes, filters, grouping and styles are existing Core-backed
   features. Verify WPS defaults and interrupted/repeated flows. Native pivot
   definitions/cache are supported within their documented subset. Existing range
   sources remain fixed; new table-backed sources retain their dynamic identity.
   See [the bounded source contract](table-backed-pivots.md) for repair, cache,
   snapshot and native-source precedence rules.
3. **PivotChart and native chart infrastructure.** PivotChart is an existing
   linked internal chart, created with its pivot atomically. The initial native
   clustered-column export slice now uses the actual emitted PivotTable identity
   and cached native axis item layouts, with WPS and Excel web
   first-open/refresh/save/reopen acceptance. Pictures and charts share a worksheet drawing with collision-free
   IDs. Other drawings and unsupported chart/report configurations remain explicit
   omissions. See [the bounded export contract](native-pivotchart-export.md).
4. **Other charts, images, sparklines, hyperlinks and symbols.** Ordinary chart
   types and dashboards have real editors and Core-backed persistence, but native
   chart export is omitted. Cell/floating images have a prepared-raster export
   path; image import remains blocked. Sparklines and hyperlinks have native
   export; symbols commit as cell text. Extend WPS parity in small usable slices.
5. **Drawing and advanced insertion.** Shapes, icons, WordArt, text boxes and
   equations use the drawing editor/layer. Icons currently share shape selection.
   Screenshot inserts a floating image; document/attachment, camera, controls and
   watermark have real owners and internal persistence. Their native drawing,
   embedded object, camera/control and watermark exports remain omissions.

Table calculated-column autofill and an expanded native drawing/chart importer
are separate outstanding capabilities. Compatibility diagnostics remain internal
under the current [XLSX policy](../xlsx-io.md); this phase does not silently change
the export-warning product policy.

## First bounded closure

- Table → PivotTable/PivotChart source capture excludes a table's total row.
  The small table with data 10 and 20 and total 30 produces pivot total 30, not 60.
  Both entry points share this rule; cancellation adds no history and creation/
  field configuration are independently undoable. Snapshot reload retains it.
- Table create/settings/resize/conversion confirmations must belong to their
  captured workbook, generation, sheet, table and dialog session. Canceled or
  obsolete callbacks cannot mutate a replacement document or newer dialog.
  Busy/protected targets and rejected commands retain the draft safely.
- Pivot creation, source and move dialogs now use their own captured sessions,
  including distinct remount keys for the same report. Rejected commands retain
  the draft. An unchanged existing-report confirmation closes only after Core's
  exact plan on a disposable destination-sheet copy proves it is a no-op; that
  check changes no workbook state, activation or history. Picker navigation and
  document replacement do not transfer old callbacks to a newer session.
- Insert Table has its own Create Table entry intent with source, header and
  filter controls. The style-gallery entry retains its appearance/table modes.
  Empty source ranges default to generated headers; populated ranges retain the
  existing checked default. Numeric-header inference is not claimed. Generated
  headers extend both the table and filter range, including the last data row;
  blank creation now serializes and remains one-command undoable.
- WPS-authored ordinary source, table and pivot files were actually saved and
  parsed. The synthetic native pivot has region rows, product columns, sum(amount)
  and total 520. Table source is `Table1`, and new-sheet output starts at A3 in this
  observed build. These are concrete observations, not universal default claims.
- New-sheet Web PivotTable/PivotChart creation now uses that observed A3 placement.
  Explicit existing-sheet destinations and already-saved A1 reports keep their
  anchors. Placement is covered by 14 focused cases, including real destination
  switching, cancellation and atomic undo/redo; fresh product GUI remains pending.
- The native PivotChart producer was obtained after restoring WPS on 2026-10-10.
  Insert → PivotChart from the configured report saves a genuine clustered-column
  chart with `pivotSource` naming its workbook, owning sheet, and native pivot.
  Source 100→110 stays cached until explicit Refresh, then both chart/report update
  and persist after workbook close/reopen. See the [bounded producer evidence](../acceptance/evidence/wps-pivotchart-producer-20261010/README.md).
  The bounded product export subsequently passed first-open, explicit refresh,
  and save/reopen in both WPS and Excel web. The subsequent bounded linked
  clustered-column import now accepts those producer files, the current product
  export, and the verified WPS post-save properties/frame variant. Its stale cache,
  manual order, explicit refresh and reexport were checked in the two real apps.
  Generic drawing import and other native chart families remain outstanding; this
  is not whole-Insert parity. See the [export acceptance record](../acceptance/native-pivotchart-export-20261010.md)
  and [bounded import acceptance](../acceptance/native-pivotchart-import-20261010.md).

Focused module tests and exported product-path samples establish only their
bounded behavior. Supported native controls have recovered and the chart slice
has actual app acceptance; other GUI paths remain bound to their own evidence.
Do not substitute a mocked visual pass or repeat broad format matrices.

## Compatibility workflow and sources

For a compatibility discrepancy, create the smallest synthetic workbook in WPS
or Excel, export through the supported flow, compare actual OOXML with the product,
isolate one cause, add a focused regression, then verify the fix in the real app.
Never upload private business files or infer a permanent limitation from a guess.

- [WPS Create/Delete PivotTable](https://help.wps.com/articles/pivottable-create-delete)
  documents range selection and new/existing worksheet placement.
- [WPS PivotChart tutorial](https://www.wps.com/academy/use-pivot-chart-to-create-a-dynamic-chart/)
  describes a paired PivotTable/PivotChart and refresh. Generic tutorials do not
  establish Linux 12.1.2 dialog or export details.
- [Microsoft PivotTable guidance](https://support.microsoft.com/en-us/excel/get-started/create-a-pivottable-to-analyze-worksheet-data)
  calls for unique, nonblank headers and documents refresh and table-backed sources.
- [Microsoft PivotChart guidance](https://support.microsoft.com/en-us/excel/get-started/create-a-pivotchart)
  distinguishes direct Windows creation from PivotTable-first Mac/web creation.
- [Native PivotSource naming](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/3a82b89e-7264-40c1-a09f-d569374fe6a9)
  requires workbook/sheet/pivot identity, not a bare Core display name.
