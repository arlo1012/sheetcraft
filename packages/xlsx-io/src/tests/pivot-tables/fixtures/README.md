# Independent native pivot fixture

`closedxml-all-sources.xlsx` is an unmodified copy of ClosedXML's
`ClosedXML.Tests/Resource/Other/PivotTable/Sources/PivotTable-AllSources-input.xlsx`.

- Source: https://raw.githubusercontent.com/ClosedXML/ClosedXML/develop/ClosedXML.Tests/Resource/Other/PivotTable/Sources/PivotTable-AllSources-input.xlsx
- Repository: https://github.com/ClosedXML/ClosedXML
- Retrieved: 2026-10-08
- SHA-256: `0dfd174fbe668c27db490c5dfc1e7d8df8d075211424f5bd0b393bdc0a8ed73a`

The test builds a clean workbook containing the original ordinary worksheet and
consolidation source/output cell values, then copies their native pivot table,
cache, record, and relationship XML unchanged. It omits unrelated connection,
external-workbook, and scenario sources. The input to `decodeXlsx` contains no
product pivot extension and never passes through the product pivot exporter.

The ordinary fixture pivot has no configured fields; its recovered source is
configured through Core in the test. The consolidation pivot retains its two
page fields, two source ranges, and cached total of 43.21.

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
