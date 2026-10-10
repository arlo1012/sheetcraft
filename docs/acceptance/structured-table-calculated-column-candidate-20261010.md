# Calculated-column candidate contract — observation only, 2026-10-10

Two small native WPS12.1.2.29182 workbooks were used. No ordinary app setting changed.
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

## Completely empty-column supplement after31a2

The first checkpoint deliberately reported the wholly empty-column branch as
untested. It was then tested separately rather than inferred from the mixed99
fixture. A new native table A1:C4 used the same headers/quantities2/3/4, with
C2:C4 completely blank and no former template or exception. Before entering a
formula, it was explicitly saved as XLSX. The preserved baseline is10389B,
SHA256 `66c526ef0938bdca2877b770ed996b83244052e776f423c1cb49333f31c8a771`;
local OOXML has neither calculatedColumnFormula nor C2:C4 cell contents.

- Entering C2 =B2*2 immediately filled C2:C4 with4/6/8. There was no prior
  confirmation. The subsequent auto-correction menu offered Undo Calculated Column,
  Stop Automatically Creating Calculated Columns, and Control AutoCorrect Options.
  The menu was only read; no setting was changed.
- One normal CtrlZ removed the propagated C3/C4 formulas but retained C2=4.
  A second CtrlZ removed the original C2 formula. Two Redo operations restored
  the whole calculated column. Formula entry and automatic propagation therefore
  occupied separate history steps in this observed build.
- Entering A5=d and B5=5 below the table extended it to A1:C5 and inherited
  C5=B5*2=10. After ordinary save, local OOXML confirms the template B2*2 and
  relative formulas/caches4/6/8/10. The final XLSX is10523B, SHA256
  `6728afeaf45f84e9a8f511641fdc152481b0a2255ef3e7589174767c1db4a7ca`.

The formula observations ran on the saved XLSX, while this WPS engine still
displayed Compatibility Mode. This establishes this version's empty-column branch,
not all Excel behavior or blank-string/formula-result-empty equivalence.

## Proposed bounded decision

A conservative candidate based on these observations is:

- Ordinary entry edits only the current cell in a mixed-value column.
- For a genuinely empty result column, choose explicitly whether Sheetcraft should
  automatically establish/fill a template, as observed here, or require the same
  explicit whole-column action as mixed columns. History granularity is also a
  product decision; WPS's two-step entry/propagation result is recorded above.
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
was not established as a WPS behavior. Changing a template after exceptions,
whole-column paste, deleting rows,
structured-reference variants and Excel's behavior remain untested. No automatic
overwrite, sort UI or new formula-column feature is authorized by this document.

The raw native XLSX, parsed XML and screenshots remain local. Only this synthetic
recipe, observation and proposed contract are published.
