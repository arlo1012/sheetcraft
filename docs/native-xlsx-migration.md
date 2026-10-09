# First-party formula and XLSX engine migration

## Scope

The existing UI, Ribbon, workbook commands/history, formula runtime and feature
metadata modules are preserved. `packages/xlsx-io/src/native/` owns the sparse
interchange model, OOXML reader/writer, styles, strings, drawings and comments.
The stable public `encodeXlsx`/`decodeXlsx` byte APIs and Web Worker flow remain.

ExcelJS is removed from runtime, test generation, manifests and lockfile. There
was no SheetJS spreadsheet-engine dependency to remove. Formula.js existed only
in the former compatibility lab: the product already had 240 first-party
functions in 11 categories. That runtime is preserved, not replaced. The lab
now tests public Core and XLSX APIs and shares the root workspace lock.

CFB is intentionally retained for the Office encrypted-container path, together
with established Noble crypto primitives. ZIP, XML, number-format and solver
helpers also remain. See [helper notices](third-party-xlsx.md).

## Compatibility approach

- Keep workbook semantics, feature finalizers, bounded ZIP preflight and the
  existing 200,000-cell import/export limit.
- Preserve sparse cells/axes, numeric/boolean/text/error values, shared formulas,
  explicit cached false/zero/empty strings, date systems, custom number formats,
  fills/gradients, fonts, alignment, borders, protection, merges and frozen panes.
- Preserve existing export metadata for names, filters, validation, conditional
  formats, tables, pivots, themes, page setup, notes and images through their
  existing modules. Their existence is not a claim of complete UI acceptance.
- Keep 18 frozen external-authored XLSX inputs with SHA-256 provenance, including
  unchanged native ClosedXML pivot parts. Import tests no longer synthesize inputs
  with the same implementation being tested.
- Theme/indexed colors now resolve when their palette is known. Unresolved system
  colors remain diagnosed instead of guessed. Explicit empty-string formula caches
  are counted as discarded caches on import, just like other cached results.
- Shared-formula translation preserves quoted and 3D sheet qualifiers, uses a
  linear protected-token scan, and rejects sources over 8,192 UTF-16 units or a
  workbook-wide expanded total over 32 Mi units. Invalid merge references,
  style-table indexes, numeric lexemes and non-ISO/rollover dates are rejected.
- Literal OOXML escape sequences and escaped controls are preserved in cell
  strings, cached strings, note text and authors. Worksheet titles stay literal;
  export rejects Excel-invalid, duplicate or over-31-unit titles without silently
  truncating names or changing formula references.
- Finalization restores the SpreadsheetML worksheet child order and targets only
  root-level extension lists. Combined conditional formats, tables, backgrounds
  and sparklines no longer insert worksheet metadata into a nested rule extension.

## Validation baseline

Before migration, the XLSX suite passed 348 of 349 tests. The one failure expected
font size 200 to be discarded, although the current Core contract accepts all
positive integer sizes. The expectation now preserves 200 while still requiring
the font name beyond the codec's 80-character limit to be omitted; the production size contract did
not change. Core formula baseline passed all 221 tests in 30 files.

The final verification record is in [native XLSX verification](native-xlsx-verification.md). A
passing unit suite is not proof of pixel-identical display or universal Excel
compatibility. Cross-application samples must actually open without repair and
be compared in the target application before making that claim.

## Synthetic cross-application sample

`bun scripts/create-interop-fixture.mts <output.xlsx>` generates two sheets using
only invented stationery data. It covers Unicode, a merged title, color/bold/font
styles, row/column dimensions, currency/percentage/date formats, formula caches,
a note, frozen panes, an error/boolean, wrapping and a generated checkerboard PNG.
It reads no user documents or personal data. Compare expected D8 total **57.00**,
worksheet titles, formatting and image placement in Excel and LibreOffice.

## Limits and follow-on work

Existing import blocks for unsupported drawings/media, macros and external
content are retained. Exported general chart/shape/text drawings remain reported
as omitted; XLSX image support has its existing separate path. No insertion
feature is considered accepted merely because it has a dialog or preview.
This change does not promise every Excel feature, identical fonts on machines
with different installed fonts, or pixel-identical rendering across applications.
