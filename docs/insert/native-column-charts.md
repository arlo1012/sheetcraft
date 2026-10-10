# Ordinary native clustered-column charts

This is a bounded native I/O continuation of the existing chart feature, not a
new editor or Core model. Web already owns chart insertion/editing and Core owns
source ranges, commands, history and snapshots. No snapshot version changed.

## Supported source

- Ordinary `column`, unstacked, unrotated, without `pivotTableId` or `dataCache`.
- One same-sheet contiguous rectangle, either series direction and the existing
  eight independent `seriesBy` / `headerRow` / `headerColumn` configurations.
  At least one category, one series and one finite numeric point; at most 10,000
  source cells, using Core's normal range and drawing validation.
- Text/blank category and series-header cells. Series numeric values are finite
  numbers; zero and negatives survive. Text, blanks, booleans and formula errors
  remain missing numeric points in Core, never zero-filled. Numeric/date category
  axes remain outside this slice. Headerless 1×1 is omitted because its native
  references cannot prove the configured direction; Core is not changed.
- `showHidden=false` requires the entire source rectangle to be visible, because
  compacted visible cells cannot honestly use the same contiguous native ranges.
  `showHidden=true` retains the full source.
- Explicit title, legend, value labels and consistent worksheet numeric formats
  are retained in the bounded model. The target app supplies palette/typography,
  so native presentation is reported as omitted. WPS's implicit default “Chart
  Title” has no stored title text; it becomes an empty Core title and its default
  placeholder is not recreated on export.

Export writes the actual horizontal or vertical numeric and label references
with matching caches. Enabled headers supply their exact text, including empty
or duplicate labels. Disabled series headers use the existing Core names `1`,
`2`, … as native quoted string references; disabled category headers omit `cat`
and use native indexed categories. This was observed in a WPS-created producer
with explicitly edited series names. Unnamed native default `Series1` is not
silently renamed. Missing values omit their indexed `numCache` points while
retaining the full `ptCount`. Ordinary charts emit neither `pivotSource` nor
PivotChart field-button options, and never create a PivotTable/cache.

## Import proof and boundaries

The shared package collector classifies admitted charts explicitly as ordinary
or pivot. The existing chart-only graph, namespace, MIME, relationship, geometry
and size checks remain in place. Pictures/media, unknown chart families and
unconsumed drawing relations do not inherit admission. Ordinary chart-space
extensions are not a fallback for missing PivotChart ownership.

The ordinary reader tests the eight existing configurations against the actual
rectangular numeric references. All value spans, name references or exact generated
constants, category spans or their absence, and independently evaluated caches
must prove exactly one configuration before atomic attachment. No private source
metadata or guessed direction is used. Sparse text-cache points are allowed only
where the actual worksheet independently proves an empty label.

WPS may save nonnumeric literal text as zero in a numeric cache. Only a point with
an exact verified value reference, Core missing value, actual nonnumeric literal
string (nonempty text or a proven exact empty string), cached zero and disabled
value labels may be restored to Core
missing, with `chart-cache-normalized`. This preserves Core semantics, not native
zero-versus-gap visual fidelity. Real numeric zero, numeric-looking text,
whitespace-only strings, blank cells, booleans, errors, formulas and value-labelled
zero cannot use that exception. The original options checkpoint omitted six
disabled-header charts with WPS empty-string numeric zeros. Read-only producer
proof established that public decode preserves exact literal empty-string identity
separately from null blank cells and numeric zero. The bounded follow-up now
recovers all eight saved blank-matrix charts with normalization warnings; genuine
missing numeric points remain gaps. See the
[empty-string follow-up](../acceptance/native-column-empty-source-20261010.md).

Invalid or
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
    bun scripts/compatibility/create-native-column-chart.mts options output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts options-blanks output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts roundtrip input.xlsx output.xlsx

The seed has only `Data!A1:C4`: region/apple/pear; east 60/70; north 100/80;
south 120/90. In WPS select A1:C4 and Insert → Column → first clustered option to
create a native producer. `product` uses the existing Core drawing contract and
the compiled public XLSX API; `roundtrip` decodes/reencodes a supported ordinary
chart. The helper refuses input/output aliasing and existing outputs.

`options` creates eight named sheets `C-11` through `R-00`, with the two digits
representing the two header flags, on the same source fixture. `options-blanks`
additionally makes B1 and A2 empty strings and C3 a genuine missing numeric cell.
Both preserve the explicit existing Core configuration. The Web row-direction
checkbox captions now describe the correct category/series roles without changing
the checkbox state, command or calculation behavior.

See [the actual acceptance record](../acceptance/native-column-chart-20261010.md)
for producer inspection, double-app checks, preserved failures and remaining scope.
See [the orientation/header continuation](../acceptance/native-column-options-20261010.md)
for all eight configurations, WPS cache adaptation and retained limitations.
