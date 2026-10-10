# Ordinary native clustered-column charts

This is a bounded native I/O continuation of the existing chart feature, not a
new editor or Core model. Web already owns chart insertion/editing and Core owns
source ranges, commands, history and snapshots. No snapshot version changed.

## Supported source

- Ordinary `column`, unstacked, unrotated, without `pivotTableId` or `dataCache`.
- One same-sheet contiguous rectangle, both header flags true, series by columns.
  At least one category, one series and one finite numeric point; at most 10,000
  source cells, using Core's normal range and drawing validation.
- Text/blank category and series-header cells. Series numeric values are finite
  numbers; zero and negatives survive. Text, blanks, booleans and formula errors
  remain missing numeric points, never zero-filled. Numeric/date category axes,
  row-oriented series and inferred/disabled headers are outside this slice.
- `showHidden=false` requires the entire source rectangle to be visible, because
  compacted visible cells cannot honestly use the same contiguous native ranges.
  `showHidden=true` retains the full source.
- Explicit title, legend, value labels and consistent worksheet numeric formats
  are retained in the bounded model. The target app supplies palette/typography,
  so native presentation is reported as omitted. WPS's implicit default “Chart
  Title” has no stored title text; it becomes an empty Core title and its default
  placeholder is not recreated on export.

Export writes header-cell, category-column and adjacent numeric-column references
with matching caches. Missing values omit their indexed `numCache` points while
retaining the full `ptCount`. Ordinary charts emit neither `pivotSource` nor
PivotChart field-button options, and never create a PivotTable/cache.

## Import proof and boundaries

The shared package collector classifies admitted charts explicitly as ordinary
or pivot. The existing chart-only graph, namespace, MIME, relationship, geometry
and size checks remain in place. Pictures/media, unknown chart families and
unconsumed drawing relations do not inherit admission. Ordinary chart-space
extensions are not a fallback for missing PivotChart ownership.

The ordinary reader reconstructs a rectangle only when every series has the same
single-column category span, one matching header cell and an adjacent numeric
column with identical data rows. Caches must agree exactly with the evaluated
worksheet, including missing values, before atomic Core attachment. Invalid or
unproven safe source/cache/presentation variants omit the individual chart with a
located warning. Reversed/custom scaling, zero-filled blanks and richer per-series
labels remain outside the supported contract. No detached static chart is guessed.

Geometry uses the shared validated one/two-cell placement. WPS physical frames
may be approximate under Core's row/column baseline and are reported accordingly.
Native styling is not a fidelity guarantee. Existing linked PivotCharts still use
their actual PivotTable identity and explicit-refresh cached semantics.

## Live ordinary semantics

Ordinary charts use their worksheet evaluator immediately after cell changes.
They do not require the PivotTable refresh command. Snapshot reload and repeated
XLSX roundtrips retain this live dependency. Tests include coexistence with a
linked report, so the two ownership/refresh contracts remain distinct.

After building Core and XLSX from the repository root:

    bun scripts/compatibility/create-native-column-chart.mts seed output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts product output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts roundtrip input.xlsx output.xlsx

The seed has only `Data!A1:C4`: region/apple/pear; east 60/70; north 100/80;
south 120/90. In WPS select A1:C4 and Insert → Column → first clustered option to
create a native producer. `product` uses the existing Core drawing contract and
the compiled public XLSX API; `roundtrip` decodes/reencodes a supported ordinary
chart. The helper refuses input/output aliasing and existing outputs.

See [the actual acceptance record](../acceptance/native-column-chart-20261010.md)
for producer inspection, double-app checks, preserved failures and remaining scope.
