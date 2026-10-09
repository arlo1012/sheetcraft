# Frozen, independently authored XLSX inputs

These 18 small input workbooks were frozen on 2026-10-09 from the fixture recipes
in the XLSX tests at baseline revision `173aa37`, using the original ExcelJS 4.4.0
browser distribution. The tests read the committed bytes directly. They do not
run ExcelJS or Sheetcraft's writer to construct these import regression inputs.

- `manifest.json` records SHA-256 digests, byte sizes, and original source files.
- `RECIPES.md` preserves the original fixture-generation source for review.
  These historical snippets are documentation, not an installed dependency or a
  runtime fixture generator.
- `data-tools-base.xlsx` contains the original six Name/Score data cells. Tests
  continue to insert their own literal OOXML filter, validation, and outline
  examples into this frozen base so malformed/unsupported cases remain explicit.
- `io-relocated-notes.xlsx` preserves the original relocated comments-part test
  input, including the absolute relationship target and multiline notes.
- `codec-invalid-font.xlsx` deliberately contains the original 81-character font
  name and 200-point size. Its existing assertions are retained, including the
  pre-existing baseline failure; freezing the input does not weaken the test.

## Independent native pivot provenance

`pivot-closedxml-clean-sources.xlsx` is the once-generated output of the original
`pivot-tables/native-import.test.ts` fixture helper. It copies the values of
`Area Source`, `Area - PT`, `Consolidate`, and `Consolidate - PT` from the existing
`../../pivot-tables/fixtures/closedxml-all-sources.xlsx` input, using ExcelJS to build
a clean workbook that excludes unrelated external, scenario, and connection
sources. Its ten pivot table, cache, cache-record, and relationship XML parts are
copied byte-for-byte from the original ClosedXML file. Their byte equality was
verified when the static fixture was created. No Sheetcraft encoder was used.

The original ClosedXML file, upstream URL, checksum, and MIT license are retained
under `../../pivot-tables/fixtures/README.md`. Its SHA-256 is
`0dfd174fbe668c27db490c5dfc1e7d8df8d075211424f5bd0b393bdc0a8ed73a`.

Do not regenerate these reference inputs with the implementation under test.
If an import scenario intentionally changes, review the independently authored
OOXML, update its provenance and checksum, and retain the relevant assertions.
