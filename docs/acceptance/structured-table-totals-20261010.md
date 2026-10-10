# Structured-table totals metadata — WIP, 2026-10-10

Parent: `b3db3eed88ecf06d9f13b9678414150390b10778`. Scope is the existing
structured-table acceptance matrix. No calculated-column overwrite/fill contract,
new chart types, UI merge, or deployment is implemented.

## Actual single-factor evidence

The earlier formal product three-table workbook and its WPS-saved copy both
opened read-only in Excel web with repair of `/xl/tables/table1.xml`. Their Sales
total cells contained five `SUBTOTAL(109,own-column-data)` formulas but lacked
matching column totals metadata. The prior failed results remain in the header
and lifecycle records.

1. A local control added only `totalsRowFunction="sum"` to those five columns.
   Every other ZIP entry's bytes were unchanged. Actual Excel opened editable,
   without repair, showing filtered Net61 and SUM121.
2. An independent WPS UI producer created a small region/units/net table. Its
   Total Row had a text label, a blank units total, and native net
   `SUBTOTAL(109,[net])=90`; only net had `totalsRowFunction="sum"`. Actual Excel
   opened editable without repair.
3. A reverse control removed only that one net attribute. Actual Excel opened
   read-only; technical details explicitly reported repair of table1. This
   disproves style/filter/cache as the isolated cause in these controls.

Microsoft's [Office table-column implementation note](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/8f4f8ebc-a085-4cef-bec9-6d6a40066513)
also requires nonzero total-row column metadata to match its total cell formula.

The WPS producer was then edited through its formula bar to `SUM(C2:C3)+1=91`
and saved as a distinct local file. WPS itself retained the prior sum metadata;
this is not evidence for correct custom-formula metadata.

## Implemented contract

The writer inspects only actual generated worksheet total rows. It never changes
the worksheet, cached values, input workbook, or creates/fills formulas.

- A non-array `SUBTOTAL(109,...)` is sum only when an A1 reference proves the
  same worksheet, own column, and entire data interval, including single-cell
  and offset-table cases.
- Other actual formulas, including non-SUM SUBTOTAL and custom formulas, retain
  their exact final worksheet formula in `totalsRowFormula` with custom metadata.
- Unresolved structured formulas also remain custom. Export qualifies structured
  names but does not prove unique workbook-wide native identity. This is a
  conservative downgrade; native structured sum-preset fidelity is not claimed.
- Actual literal text becomes totalsRowLabel using the same OOXML string escaping
  as the real worksheet cell. Numeric constants and blank cells do not become sum.
- Tables without a total row receive no total-column metadata. Snapshot version
  and Core model are unchanged; native import continues preserving actual cells.

## Formal product and checks

The new public `create-native-table-roundtrip.mts` script regenerates a distinct
XLSX via normal public decode/deserialize and encode APIs, preserving its input.
The actual UI-exported three-table JSON was used as the source; regeneration is
an API export, not a new Sheetcraft UI export or a replacement of its current page.
The first regenerated output SHA256 is
`b99007fed97033be2279a3fc8d3b853398d04bdfe210e30e02d99893b9055f78`.

Actual Excel opened this formal output editable without repair. Real keyboard
editing B2 from2 to3 produced D2=30, filtered Net71, and SUM131; cloud save completed.
Actual WPS opened the same output, retained three tables/filter/style, and the
same edit produced30/71/131. A distinct WPS save was completed. Save-close-reopen
and mixed custom target-app checks remain pending in this checkpoint.

- Full XLSX suite: **80 files, 1138 tests passed**, one worker, 70.14 seconds.
- Related totals/table/filter/structured-reference run: 4 files, 86 passed before
  the final two extra identity fixtures; those fixtures are included in full1138.
- Full XLSX test types, package build, scoped lint and whitespace: passed.
- The first typecheck caught the writer's too-narrow sheet parameter; its failure
  is preserved, then fixed to accept actual Sheet data and successfully rechecked.
- Initial totals regression: 6 failed/1 passed before implementation. A later
  identity-gate run preserved84 passes/2 obsolete sum expectations; expectations
  were corrected to explicit conservative custom behavior, then86 passed.
- Architecture boundary check remains failing with125 findings. It is retained,
  not presented as whole-repository CI success.
- Earlier interrupted Web runs (exit130) remain; subsequent serial runs passed
  complete Web types and8 table-related files/112 tests, recorded in the header
  acceptance document. Earlier close/navigation timeout logs are not overwritten.

## Remaining acceptance

Native filter-button visibility is still incorrect on the existing false option;
it remains a separate known defect, not hidden by this totals fix. Stable Medium5
UI persistence, formal native import into the product, converted-range lifecycle,
explicit advanced-filter UI rejection and bounded WPS calculated-column
observations remain open. No complete-table or full-Insert acceptance is claimed.

All new actual XLSX/JSON/XML/screenshots stay local. This checkpoint publishes only
source, reproducible code, synthetic regression structures, and textual evidence.
