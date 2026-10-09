# Independent native pivot fixture

`closedxml-all-sources.xlsx` is an unmodified copy of ClosedXML's
`ClosedXML.Tests/Resource/Other/PivotTable/Sources/PivotTable-AllSources-input.xlsx`.

- Source: https://raw.githubusercontent.com/ClosedXML/ClosedXML/develop/ClosedXML.Tests/Resource/Other/PivotTable/Sources/PivotTable-AllSources-input.xlsx
- Repository: https://github.com/ClosedXML/ClosedXML
- Retrieved: 2026-10-08
- SHA-256: `0dfd174fbe668c27db490c5dfc1e7d8df8d075211424f5bd0b393bdc0a8ed73a`

The frozen `../../fixtures/external/pivot-closedxml-clean-sources.xlsx` test input
contains the original ordinary worksheet and consolidation source/output cell
values, with their native pivot table, cache, record, and relationship XML copied
unchanged. The original fixture-building recipe was run once using ExcelJS 4.4.0
and is archived with the frozen input, its checksum, and provenance. It omits unrelated connection,
external-workbook, and scenario sources. The input to `decodeXlsx` contains no
product pivot extension and never passes through the product pivot exporter.

The ordinary fixture pivot has no configured fields; its recovered source is
configured through Core in the test. The consolidation pivot retains its two
page fields, two source ranges, and cached total of 43.21.

## Repeated-value-fields fixture

`closedxml-two-values.xlsx` is an unmodified copy of ClosedXML's
`ClosedXML.Tests/Resource/Other/PivotTable/Create/Add_one_column_and_two_values.xlsx`.

- Source: https://raw.githubusercontent.com/ClosedXML/ClosedXML/develop/ClosedXML.Tests/Resource/Other/PivotTable/Create/Add_one_column_and_two_values.xlsx
- Retrieved: 2026-10-09
- SHA-256: `9f25de4a5ee25afb0631eda0e320b065b6f1a6f9568a96c242df6000d8b46583`
- Same upstream MIT license below

Its native pivot uses `Sum of B` and `Count of B`, both referencing source field
`fld="1"`, and a Values pseudo-field (`field x="-2"`) in the column axis. Both
`rowItems` and `colItems` are absent. The raw-XML regression reads these bytes
directly; it does not normalize the fixture or pass it through the product writer.

The fixture's workbook uses namespace-prefixed sheet elements and root-level
`/pivotCache/` parts. Those are useful independent reader cases as well as
aggregation/layout evidence. See `docs/native-xlsx-pivot-interop.md` for the
distinct import-discovery issue repaired during the aggregation investigation.

## Upstream license

Source: https://github.com/ClosedXML/ClosedXML/blob/develop/LICENSE

```text
MIT License

Copyright (c) 2016 ClosedXML

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
