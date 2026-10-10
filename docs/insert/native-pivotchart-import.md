# Bounded native linked PivotChart import

This slice admits the current Sheetcraft clustered-column export and the three
committed WPS producer samples, plus the observed WPS post-save chart-properties
leaf and absolute one-cell frame variant. It is not generic drawing or chart import.

## Import contract

- Follow the worksheet drawing relationship to a single-owner chart part, validate
  namespaces, MIME declarations and the consumed part graph before admission.
  WPS chart style/color companions are recognized only as terminal producer parts.
- Accept linked clustered-column charts with one row, one column and one measure,
  two report header rows, contiguous leaf rows and optional structural grand totals.
  Native name/owner identity associates the chart with the imported PivotTable ID;
  the workbook basename is not used to retrieve any external document.
- Reconstruct the saved cache layout only when native field items, row/column item
  indices, cached primitive members, displayed cells and totals all agree. Preserve
  explicit manual member order. Restore valid product metadata without changing
  its existing source/ascending/descending ordering semantics.
- Read chart series names, categories and numeric caches against the saved report.
  Import and export do not refresh the source. The existing explicit PivotTable
  refresh command updates the report and linked chart together. No static chart
  cache detaches the drawing from its PivotTable.
- One-cell geometry is validated. WPS two-cell frame geometry is projected to Core
  physical sizes with `dimension-approximated`. WPS post-save absolute one-cell
  origins use that same disclosed physical projection only after validation of
  the observed inert chart-properties leaf; native decoration/palette fidelity
  reports `style-omitted`. Geometry fidelity is not an acceptance claim.

## Boundaries

Pictures, media, orphan drawing parts, unsupported chart families, unexpected
payloads/relationships/namespaces and aliased ZIP entries remain package errors.
Safe chart parts whose supported layout, owner, references, caches or geometry
cannot be proved produce a located `feature-omitted` issue without partial drawing
attachment. A valid native PivotTable can survive an unsupported cached layout.
All cache point counts, dimensions, indices and text are bounded before allocation.

No sorting UI was added. Core manual ordering is documented separately in
[pivot-manual-member-order.md](pivot-manual-member-order.md), including snapshot
versions 1–44 and the legacy writer behavior.

## Adjacent DXF correction

Real Excel opening of the WPS import/refresh/export result removed `styles.xml`
and repaired sheet/table cells. Reordering only one differential border from
`top/right/bottom/left` to `left/right/top/bottom`, keeping every other ZIP part
byte-identical, opened in the normal editing view without repair. The shared DXF
writer now emits the ordered border sequence; table-style inner borders emit
vertical before horizontal. The preserved regression covers explicit clears,
diagonal and inner borders. Microsoft's [border reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.border?view=openxml-3.0.1)
and [native example](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.borders?view=openxml-3.0.1)
show the corresponding child ordering.

See [the acceptance record](../acceptance/native-pivotchart-import-20261010.md).

## WPS post-save variant

Saving/refreshing a product-created file in real WPS added an inert leaf at
`c:chart/c:extLst/c:ext/chartProps`: namespace `https://web.wps.cn/et/2018/main`,
extension URI `{0b15fc19-7d7d-44ad-8c2d-2c3a37ce22c3}`, one GUID-shaped `chartId`,
no other attributes, text or children. It also rewrote a one-cell graphic frame
from zero relative origin to a bounded absolute physical origin. Initially this
variant was blocked, then its chart was omitted for the unproved frame transform.
Both initial failures are kept in the acceptance record.

Only this observed leaf at this exact ancestor path is admitted. Different
namespaces, URIs, IDs, extra payload/attributes, duplicate extensions or relocation
remain blocked. An unmarked, negative, mismatched-extent or out-of-bounds absolute
one-cell frame is not attached. Recognition is format validation, not proof of
producer authenticity, and does not enable any outgoing relationships or assets.
