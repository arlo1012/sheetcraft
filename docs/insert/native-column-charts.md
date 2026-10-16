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
  so remaining font, color and stroke differences carry a style warning; supported
  element positions are not included in that warning. WPS's implicit default “Chart
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

## C1 ordinary native element placement

The current bounded continuation covers ordinary unstacked `column`, `bar` and
straight-marker `line` charts using the source contracts above and their respective
native-family documents. It writes and reads actual editable OOXML chart elements:

- Nonempty title above the chart or overlaying it: `c:title/c:overlay`.
- Visible legend at top, bottom, left, right or top-right, with either overlay
  mode: `c:legend/c:legendPos` and `c:overlay`.
- Enabled column/bar value labels at center, inside end, inside base or outside
  end: family-level `c:dLbls/c:dLblPos`. Positive, negative and zero numeric source
  values remain live; missing points stay missing.
- Explicit `dataTable: none`, `labelContent: value`, and `labelScope: all` are
  equivalent defaults. They do not authorize other data-table/content/scope values.

Ordinary native exports now use the Web default bottom legend. Import retains a
native right legend explicitly rather than silently changing it to bottom.
PivotChart export retains its previous right legend and does not gain the new
label-position leaf. Repeated roundtrips test effective semantics, not whether an
explicit default retains sparse property presence. Empty text with no title needs
no private preservation marker.

The capability gate validates individual leaves before image/resource reads. It
continues to block custom sources, detailed formats, presentation settings,
rectangle-series identities, filters, combo routes and other chart families.
A hidden title with retained nonempty text, any saved legend placement/overlay
while the legend is disabled, and saved column/bar label positions while labels
are disabled are blocked instead of silently dropped. Explicit line label
positions and an above/overlay title setting with empty text are also outside this
slice. Imported malformed, duplicate, conflicting or unrepresentable position
leaves omit the chart atomically with its part location. New ordinary label leaves
remain rejected for PivotCharts.

No rasterization, private OOXML extension or detached static chart is used. Font,
palette and stroke fidelity are still limited and reported at the actual chart
object/part. Source editability and package roundtrips are covered by focused tests;
three-application visual/editability acceptance must be recorded separately before
claiming Excel Online, WPS Online or WPS Desktop acceptance. The reproducible
multisheet fixture is `src/tests/charts/native-elements-fixture.ts` in XLSX I/O.

### Observed WPS per-series label normalization (C1-r2 candidate)

WPS 12.1.2.29182 moves the enabled column/bar label position from the chart
family into every series when saving this slice's synthetic 17-sheet workbook.
The reader recovers the position only when all series agree, value labels are
active, other content flags are false, and the linked number format is exactly
`General`. A conflicting explicit family position or a missing series override
is not silently discarded.

The package collector admits only the observed extension UUID
`{CE6537A1-D6FC-4f65-9D91-7224C49458BB}` under an ordinary `barChart/ser/dLbls`:
empty `c15:layout`, false `c15:showLeaderLines`, and empty `c15:leaderLines`, with
the matching false native leader-line flag. This is not a general c15 namespace
allowance. Unknown extensions, nonempty dormant layout/style, active leader
lines, line/PivotChart extensions, and inconsistent per-series label semantics
remain rejected or cause an explicitly located whole-chart omission. Active
native typography still carries the existing style-fidelity warning.

Two actual WPS saves, including a worksheet edit from 60 to 90, are regression
fixtures. Their unrelated core/custom metadata was removed; chart, drawing and
worksheet bytes were preserved. Source and label reimport/reexport tests do not
replace application acceptance. Desktop observations retain two open layout
issues: explicit overlay can overlap title/legend or axis ticks, and horizontal
bar legends display the reverse visual order in WPS while source identities,
colors and native series order stay unchanged. Excel Online and WPS Online
acceptance remains pending.

This C1 slice is not completion of the full Insert-tool compatibility task.

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
