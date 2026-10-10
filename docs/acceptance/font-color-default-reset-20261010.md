# Direct font-color default/reset contract

2026-10-10 UTC. The user selected the target-app default/reset behavior after the
equal-to-Normal RGB boundary was reproduced in WPS.

- Core's implicit text fallback remains the fixed RGB `#20242c`, independent of
  workbook theme dark1.
- An ordinary direct `textColor` equal to that RGB (case-insensitive) restores
  default. The persisted direct color is omitted, so a table font color can take
  over. Applying it after red or an explicit theme binding clears the old override.
- Other literal colors, including pure `#000000`, remain explicit. A live
  `textColorTheme` remains explicit even if its resolved RGB cache is `#20242c`.
- Fill, borders and other formatting semantics are unchanged. Generic style
  normalization and merging remain literal-preserving for table/DXF, named-style
  definitions and conditional-format overlays. A materialized named font color is
  definition-owned unless its binding records a direct `textColor` override.
- Core has no separate row/column style maps. Its row/column-range direct
  formatting uses the same cell commands and reset rule. XLSX dimension style
  projection/ingestion remains the adapter's responsibility.

## Existing state and serialization

Current and older snapshots use the same rule when direct cell styles are loaded
or serialized. A former explicit direct `#20242c` becomes default; a style-only
cell containing only that color becomes redundant and is removed. Content, other
formatting, nondefault RGB, live theme references and definition-owned named
colors are retained. Snapshot version stays 42: no field or structure changes are
needed because omitted direct color and empty sparse-cell removal are already
supported. This is an intentional semantic migration, not preservation of the
old explicit-equal-RGB intent.

Foreign XLSX literal `#20242c` likewise follows this Core direct-style alias after
ingestion. That semantic reset is distinct from the adapter's narrow recovery of
implicit producer fonts. Foreign table/DXF, conditional and named-style
definitions retain their literal colors.

The XLSX Normal base now uses the same fixed `#20242c`, with Calibri 11, family 2
and the existing MDW 7 column-width baseline unchanged. Implicit and size-only
fonts derive from that base; other direct RGB and live theme colors stay separate.
The reader recognizes both the new base and the released black base only with
the canonical own-producer Normal/font/XF shape. This is structural recovery,
not authentication: a foreign file copying that whole shape is indistinguishable.
Other foreign black fonts are not stripped as defaults.

The former candidate F1 direct `#20242c` is now expected to inherit white on a
dark table header. Earlier evidence and rejection are recorded in
[font intent diagnosis](font-intent-diagnosis-20261010.md); they describe the
previous product contract. Implementation regressions cover direct commands,
range paths, effective table color, plain/size-only fallback, explicit theme
updates, snapshots and named-binding undo/redo. Target-app acceptance remains a
separate verification step. The combined implementation passed 2,591 Core tests,
767 XLSX tests, the forced package build, built package imports and both browser
worker smoke checks before that app verification.

## Bounded application acceptance

The fresh public-Core production case at `90279cf` passed dark to genuinely named
Light, save, full close and fresh reopen in WPS and Excel web. Default 13-point,
size-only 18-point and reset controls followed the table; nonmatching literal
black, live dark1 and red retained their intent. Matching ordinary cells and the
marker persisted. Both actual app-saved packages and 13 nonblank safe JPEGs are
retained in `font-reset-production-gui-20261010`, with hashes in the
[live checkpoint](app-checkpoint-20261010.md).

This closes the direct-color case under the selected product rule. It does not
upgrade historical strict-literal candidate evidence or establish all foreign
table-style import behavior. Reading the actual WPS save revealed a separate
schema-defaulted table-style availability/DXF import defect. The independent
`2dcf551` fix recovers the seven actual elements and their palette/tint-derived
colors, with 61 actual-saved-byte/public roundtrip checks and 780 XLSX tests.
That fix does not claim measured native pixel-RGB equivalence or live imported
DXF theme bindings; direct cell theme bindings remain live.
