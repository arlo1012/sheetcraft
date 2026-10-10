# Calculated-column candidate contract — observation only, 2026-10-10

One small native WPS12.1.2.29182 workbook was used. No ordinary app setting changed.
The new local workbook initially used native ET/compatibility mode; the final
result was explicitly saved as Microsoft Excel Workbook XLSX and closed. Excel
calculated-column behavior was not tested. Sheetcraft implementation is unchanged.

## Reproducible native observation

Create Table1 A1:C4 with headers item/qty/calc. Data is a/2/blank, b/3/99,
c/4/blank. Headers and table filtering are enabled; totals are off.

1. Enter C2 =B2*2. C2 becomes4; C3 stays99 and C4 stays blank. WPS offers an
   explicit “Overwrite all cells in this column with this formula” action.
2. Choose that action. C2:C4 becomes4/6/8 with relative formulas. One Undo restores
   the post-entry4/99/blank state; Redo restores4/6/8. Then set C3=100: other
   formulas remain4/8, so a manual exception is retained.
3. Tab from selected C4 moves to D4 without adding a row in this build. Entering
   A5=d and B5=5 instead expands the table to A1:C5 and inherits C5=B5*2 →10,
   retaining the100 exception. This is evidence for below-table growth, not native
   Tab parity or every insertion/paste path.
4. Put77/88 in F2:F3, use ordinary native CtrlC/V to paste them into C2:C3. Only
   those two targets change; C4=8 and C5=10 remain. One Undo restores C2's formula4
   and the existing C3 literal100 exception.

Final saved XLSX is10533B, SHA256
`5cde59857d9dc41c751eb6fce1472aa0de8c15bdcfbd17ed76276a2908bd1894`.
Read-only local OOXML inspection confirms Table1 A1:C5, calc column's
calculatedColumnFormula B2*2, C2/B2*2=4, C3 literal100, C4/B4*2=8 and
C5/B5*2=10. This proves a retained template plus worksheet exception in this
producer, not a new product parser or universal template-inference rule.

## Proposed bounded decision

A conservative candidate based on these observations is:

- Ordinary entry edits only the current cell in a mixed-value column.
- A separate explicit whole-column application establishes a reusable formula
  template and makes any replacement of existing values clear. Its fill is one
  undoable transaction.
- Manual edits and paste create exceptions only at their target cells; they do
  not silently reset other members. Later new data rows inherit the chosen
  template while existing exceptions remain intact.
- Table expansion, formula-relative rebasing, exceptions, Undo/Redo, versioned
  snapshots and bounded native I/O must be specified and tested together before
  implementation. No current-cell heuristic may silently infer a template from
  an unrelated or partially populated imported column.

Whether the explicit fill should overwrite every member as the observed WPS
action does, or optionally fill only blanks, is a product choice. Blank-only fill
was not established as a WPS behavior. The default behavior of a wholly empty
column, changing a template after exceptions, whole-column paste, deleting rows,
structured-reference variants and Excel's behavior remain untested. No automatic
overwrite, sort UI or new formula-column feature is authorized by this document.

The raw native XLSX, parsed XML and screenshots remain local. Only this synthetic
recipe, observation and proposed contract are published.
