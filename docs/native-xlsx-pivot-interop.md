# Native XLSX pivot aggregation interoperability

Investigated on 2026-10-09 against the native XLSX refactor acceptance workbook.

## Finding and acceptance status

The `SyntheticAggregates` report in `03-data-tables.native.xlsx` exports eleven
different aggregation functions over the same `Amount` source field. Its native
`dataFields` have the expected captions, `fld="2"`, and subtotal tokens:

`sum`, `count`, `average`, `max`, `min`, `product`, `countNums`, `stdDev`,
`stdDevp`, `var`, `varp`.

LibreOffice Calc opened the file without a repair prompt, but rendered the report
as `sum`, `varp`, and repeated `sum` columns. This is a visual acceptance failure.
The baseline and native-refactor pivot definition XML are identical, so this is
not a newly introduced aggregate-token difference between the two writers.

Primary-format evidence and a source-level trace of Calc's duplicate-value-field
import agree with this exact pattern. The diagnosis is a Calc import limitation
for repeated use of the same source field. **The product writer and aggregation
semantics remain unchanged.** Actual Excel and WPS opening of the comprehensive
workbook is still required; documentation and passing automated tests do not
establish either application's visual acceptance.

## Expected application behavior

[Microsoft's PivotTable calculation documentation](https://support.microsoft.com/en-us/excel/calculate-values-in-a-pivottable)
defines all eleven ordinary worksheet-data aggregation functions. Its
[same-field duplication instructions](https://support.microsoft.com/en-us/excel/show-different-calculations-in-pivottable-value-fields)
explicitly support adding the same Values field more than once for side-by-side
calculations.

[WPS's official PivotTable tutorial](https://www.wps.com/academy/learn-pivot-table-from-the-beginning/1861480/)
describes Values-field aggregation changes, including Count, Average, and Max.
The [WPS help article](https://help.wps.com/articles/pivottable-create-delete)
documents native row, column, page, and data areas. These establish the supported
workflow, but do not independently prove WPS can import this eleven-measure file.

## OOXML layout evidence

The official [ECMA-376 download page](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
links the [Part 4 Transitional schema archive](https://ecma-international.org/wp-content/uploads/ECMA-376-4_5th_edition_december_2016.zip).
Inspection of its nested `OfficeOpenXML-XMLSchema-Transitional.zip`, `sml.xsd`,
shows that both `rowItems` and `colItems` in `CT_pivotTableDefinition` have
`minOccurs="0"`. Their absence alone is not a schema defect. This does not claim
that every application's layout handling is equivalent.

The [OOXML data-field reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.datafield?view=openxml-3.0.1)
describes `fld` as the source field index and `subtotal` as the aggregation.
The [item reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.rowitem?view=openxml-3.0.1)
explains the separate data-field index in optional row/column items. There is no
need to change the source `fld` to distinguish multiple aggregation functions.

An independent, unmodified [ClosedXML fixture](https://raw.githubusercontent.com/ClosedXML/ClosedXML/develop/ClosedXML.Tests/Resource/Other/PivotTable/Create/Add_one_column_and_two_values.xlsx)
uses `Sum of B` and `Count of B` with identical `fld="1"`, a column Values
pseudo-field with index `-2`, and neither item-list element. The checked-in
fixture and SHA-256 are documented beside the pivot tests. This corroborates
the layout pattern; it is not a substitute for the pending viewer checks.

## Calc source-level diagnosis

The [LibreOffice OOXML pivot importer](https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/oox/pivottablebuffer.cxx)
maps all eleven subtotal tokens to their distinct Calc functions. For every
measure it fetches the field by the original source name, changes its orientation
to data, and then assigns the caption and aggregation.

In [Calc's DataPilot field implementation](https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/ui/unoobj/dapiuno.cxx),
the orientation change creates a duplicate when the original field is already
used. It counts existing occurrences by exact raw dimension name, but subsequent
access resolves the saved occurrence index by source name after removing the
duplicate suffix. Those two definitions differ once a second duplicate exists.
The saved occurrence index remains one, so later caption/function assignments
update the first duplicate instead of the newly created duplicate.

[Duplicate creation](https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/core/data/dpsave.cxx)
copies the original dimension and assigns a distinct duplicate name. Thus the
first field keeps `sum`, the first duplicate ends with the last measure's `varp`,
and remaining duplicates keep the original `sum`. This predicts the observed
column sequence. The inference is based on upstream source retrieved during the
investigation; the exact installed Calc build has not been source-matched.

Adding optional OOXML item lists cannot correct this field-identity logic.
Duplicating cache/source columns or flattening the report would change the
workbook's business semantics and is not an appropriate acceptance workaround.

## Automated checks

`multiple-aggregates.test.ts` verifies the independent ClosedXML XML and checksum.
It also checks an eleven-measure public export for the raw names, subtotal tokens,
shared source field index, and Values-axis placement. Saved worksheet numbers
are checked against a hand-calculated oracle before decoding. The product pivot
extension is removed, then public native-only import and recalculation must
preserve all eleven distinct functions and all numeric results.

The focused tests pass. No viewer pass is inferred from them.

## Separate reader caveat

The unmodified ClosedXML fixture uses prefixed workbook sheet elements. Before
the reader repair, `raw-cell-values.ts` worksheet-part discovery used regular
expressions accepting unprefixed elements only. The fixture's pivot was silently
undiscovered, without a warning identifying its pivot-table part.
This is independent of the Calc aggregation issue.

A controlled diagnostic copy with only workbook element prefixes normalized
imports both measures correctly, including the original root-level cache paths.
The immutable test fixture is unchanged. Therefore those cache paths are already
resolved by the pivot reader; `zip-preflight.ts` nevertheless produced generic
omission warnings for them because its known-part classifier relied on fixed
directory names.

The narrow repair now uses the existing XML parser and internal package
relationship resolver for prefix-independent worksheet discovery. Preflight
classifies only validated, relationship-reachable native pivot definitions,
caches, records, and their relationship parts. It retains bounded ZIP/XML
validation and rejection of external links, URIs, and escaping paths. An
unmodified-fixture public decode regression imports the two distinct measures
without false pivot omission warnings; unrelated package metadata still has its
original omission warning. Security regressions cover orphan and wrong-root
parts, root-level cache DTDs, unsafe paths, and prefixed external relationships.
This reader repair does not change the Calc aggregation finding or the writer.
