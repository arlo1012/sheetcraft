# Bounded ordinary native horizontal bars

## Existing product contract

Core/Web already expose `bar`, the two series directions and independent header
flags. This slice closes native I/O for unstacked horizontal clustered bars. It
adds no direction UI, stacking semantics, snapshot version or chart model option.
Names, categories and values use the same uniquely proven single-sheet rectangular
source as the ordinary column and marker-line slices, with at most 10,000 cells.

## Proven native family

Real WPS producer: `barChart`, `barDir=bar`, `grouping=clustered`; category axis
left and value axis bottom, both `minMax`, `crosses=autoZero`, value-axis
`crossBetween=between`. The first source category is visually bottom-most and
later categories progress upward, matching the current Web horizontal category
axis. These are axis semantics, not merely a replacement of `barDir`.

The producer uses gapWidth 140/overlap -40 and bottom legend. Native applications
visually reverse the legend labels for the horizontal grouping (e.g. pear/apple),
while XML/Core series identity and order remain apple/pear. Styling, legend layout,
geometry approximation and unstored default title placeholder are not lossless;
existing presentation warnings remain explicit.

Writer and reader require finite numeric values or genuinely absent cells for
this family. Text-derived missing values, booleans/errors and cached-text zero
normalization are not inferred from the earlier column producer. Text/blank
category and title labels, absent headers with quoted generated index names and
all eight unambiguous source options retain their existing Core meanings. A
headerless one-cell source stays omitted because it cannot prove direction.

## Admission boundaries

- Only ordinary `barDir=bar` clustered charts, with unique worksheet references and
  matching caches, recover as live bar drawings.
- Reversed/misplaced axes, non-default axis crossings, `midCat`, cached missing-point
  zeros and mismatched references are safe omissions, never guessed support.
- Stacked/grouping variants, mixed families, linked bars, unknown direction or
  drawing/namespace/media/relationship payloads retain package rejection.
- The exact observed WPS solid line-style leaf remains line-only; bars do not
  inherit a broad DrawingML style allowance.
- Existing chart legend/labels/showHidden flags roundtrip when representable; hidden
  compact source rectangles remain omitted. Native formatting is not pixel parity.

## Reproduction

With the usual Core/XLSX builds and dependencies:

```sh
bun scripts/compatibility/create-native-column-chart.mts seed /tmp/bar-seed.xlsx
# Open seed in WPS, select used rectangle, Insert → Chart → Bar → Clustered Bar,
# save; delete C3 and change B3 100→111, save to a separate local producer.
bun scripts/compatibility/create-native-column-chart.mts bar-options /tmp/bar-matrix.xlsx
bun scripts/compatibility/create-native-column-chart.mts roundtrip /tmp/bar-seed.xlsx /tmp/bar-reexport.xlsx
```

The legacy helper filename is kept for continuity; `bar-product` and `bar-options`
are explicit modes. Outputs use exclusive creation and roundtrip input/output
must differ. Producer data and screenshots need not be uploaded for recovery.

See [actual acceptance](../acceptance/native-bar-chart-20261010.md).
