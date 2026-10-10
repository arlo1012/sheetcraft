# Native linked PivotChart export

This is the initial, producer-verified export slice on `refactor/native-xlsx-20261009`.
It does not complete the insert roadmap. The subsequent bounded native import
slice is documented in [native-pivotchart-import.md](native-pivotchart-import.md).

## Contract

- Export populated, linked clustered-column charts with one row field, one column
  field, one value field, and contiguous physical report rows. No groups,
  consolidation, displayed-value transformations, blank report rows, or subtotals.
- Link to the actual emitted PivotTable owner/name, including case-insensitive
  workbook-wide name deduplication. Never link to the raw source sheet or Core ID.
- `encodeXlsx(workbook, { filename })` accepts the actual output basename.
  The default is `workbook.xlsx`. Web normal/encrypted downloads pass their exact
  names through the worker. A caller choosing another basename must pass it.
- Use cached report cells and cached pivot membership. Source edits stay stale
  until the user explicitly refreshes the PivotTable. Export never refreshes it.
- Chart numeric/category caches exclude grand totals. Formula references address
  actual report cells; series title caches agree with their header references.
- Native `rowItems`/`colItems` refer to the actual `pivotField.items` positions,
  including preserved manual order, while their emitted order follows the cached
  report. Shared-item cache identities remain unchanged. Grand totals are identified
  structurally, never by a translated caption.
- Reuse the worksheet's existing picture drawing. Allocate unique drawing object
  IDs, relationship IDs, and chart part names. Notes/VML and worksheet backgrounds
  remain independent. Pictures and charts share physical anchor conversion.

## Compatibility limits

Unsupported drawings are omitted with a `feature-omitted` warning at the individual
drawing ID. This includes ordinary charts, detached/static caches, other chart
types, stacking, rotation, missing/unexportable pivots, empty reports, unsupported
report layouts, hidden-row/column skipping, and placements beyond sheet bounds.
Invalid/unrepresentable identity text also omits the chart. No dangling chart
relationship is created in these cases.

Native palette/typography and generic drawing decoration fidelity are not complete;
an exported chart records `style-omitted` at its `.style` location. Generic drawing import remains blocked by package preflight. The subsequent
[bounded native import slice](native-pivotchart-import.md) permits only the
validated linked clustered-column package graph and records its own roundtrip
acceptance.

The WPS name check established a raw pivot identity containing `Sales O'Brien`
and separately quoted/doubled-apostrophe formula references. Other special-name
cases have not received GUI acceptance.

## Why the axis item lists matter

The first product file had valid populated chart caches and a recognized PivotChart
field pane, but its plot was empty until native Refresh. Replacing only the
PivotTable definition rendered the chart immediately. Adding only native axis item
lists to the original definition also rendered immediately. Changing chart XML,
formula quoting, source-reference bounds, drawing IDs, or frame offsets alone did
not fix it. The final code adds the bounded item lists from the cached Core result.

See Microsoft's [row item index contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.rowitems?view=openxml-3.0.1)
and [Office PivotChart identity contract](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/3a82b89e-7264-40c1-a09f-d569374fe6a9).
