# Bounded ordinary native straight marker lines

The existing Core/Web `line` model already has live rectangular source, independent
header flags, rows/columns, legend, labels and hidden-source configuration. Web uses
visible point symbols and does not connect missing points. This I/O continuation
adds neither a new UI option nor a snapshot model/version.

Supported native slice: ordinary unstacked `lineChart`, grouping `standard`,
straight segments (`smooth=0`), visible circular markers, category-bottom/value-left
axes with nonreversed scaling, and explicit `dispBlanksAs=gap`. Other marker/smooth/
stacked/axis layouts are not guessed. Linked PivotChart lines remain blocked.

Reuse the ordinary column rectangle/name/category/value reference proof, source
limit, exact caches, hidden-source visibility and unique eight-configuration
reconstruction. Disabled labels retain exact indexed Core names. Enabled empty
labels remain empty. Headerless 1×1 direction is still unprovable and omitted.

Line data points must evaluate to finite numbers or be genuinely blank cells.
Text/empty-string/whitespace/numeric-text/boolean/error/formula-text values are
not admitted as gaps: their native treatment may create zero segments. The proven
column-only cached-text-zero exception is explicitly unavailable to line charts.
Genuine missing points remain gaps, real zero remains zero. Numeric formula values
use the existing worksheet evaluator/reference proof; richer missing formulas are
outside this slice.

Package admission remains chart-only, with the same namespaces, relationship,
MIME, orphan, geometry, size and media restrictions. WPS's observed post-save
`a:prstDash` is admitted only as inert `val="solid"` at a line-series `spPr/ln`
path, with no payload or extra attributes. It does not authorize column/picture/
arbitrary style extension admission. Unknown drawing payloads remain blocked;
known safe but unsupported line semantics omit the individual chart.

Native typography, marker styling and physical placement remain warning-bearing
presentation approximations. WPS's implicit unstored default title is not recreated
after import; no detached static data or owner identity is guessed.

After Core/XLSX build, the existing public-entry reproduction helper also supports:

    bun scripts/compatibility/create-native-column-chart.mts line-product output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts line-options output.xlsx
    bun scripts/compatibility/create-native-column-chart.mts roundtrip input.xlsx output.xlsx

`line-product` uses the small region/apple/pear fixture with genuine missing C3.
`line-options` creates all eight header/direction sheets, keeps text only in enabled
header cells, uses `row*10+column` for value cells, and leaves C3 genuinely missing.
This distinction preserves existing Core semantics rather than treating text as zero.

See [the actual producer and acceptance record](../acceptance/native-line-chart-20261010.md).
