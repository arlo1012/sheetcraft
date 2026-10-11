# Calculated columns: implementation checkpoint (2026-10-11)

Status: **WIP Core foundation**, not completion of the approved feature or GUI/native acceptance.

## Approved behavior

- A committed manual first formula in a truly empty table data column automatically fills every data member.
- Existing literals, formulas, blank-string contents and single-cell exceptions remain unchanged. A column-wide overwrite is an explicit action.
- New table rows inherit the established formula in empty new members. Paste changes its targets only.
- The product uses one reversible transaction for the original manual input plus its automatic propagation. This deliberately differs from the observed WPS two-step Undo.

## This checkpoint

- Optional `SheetTableColumn.calculatedColumnFormula` is anchored at the column's first data row. Actual worksheet contents are the member/exception state; there is no duplicate exception-value store.
- Only the `inputIntent: manual` Core command opt-in establishes the template. Ordinary single-cell/batch/clipboard commands remain target-only.
- First formula in a mixed column establishes a future-row template without replacing other contents. Subsequent manual formulas and cleared cells are exceptions and retain the template.
- Explicit `createApplyTableCalculatedColumnCommand` supplies the source and replaces data members, never headers or totals. It is structured-clone/JSON transport compatible.
- Relative A1 and sheet-qualified references are rebased. Absolute references and written qualifiers remain intact. Existing ordinary copy behavior is unchanged unless the new opt-in is selected.
- Planning precedes protection/PivotTable write checks. Generated writes reject merged/spill targets, non-scalar results, stopping validation and rejected duplicates atomically. A table-wide operation includes filtered/hidden members; ordinary fill's hidden-cell guard remains unchanged.
- Manual single-cell expansion below a table inherits only empty new calculated cells. Existing one-cell paste expansion is retained, without inferred writes outside its target.
- Explicit resize preserves overlapping column identity/template and inherits empty new members. Totals-row shifts are simulated on detached sheet state before validation, then committed with the existing transaction.
- Workbook snapshot writer emits version 45 only when a template exists, otherwise preserves 43/44. Reader accepts 1–45 and explicitly rejects template fields in older protocol versions. Cell exceptions round-trip through existing cell contents.

## Evidence and retained failures

- Initial regression: 1 pass, 5 fail, proving automatic fill/template/protocol behavior was absent.
- First foundation: 6/6 pass.
- Guard expansion: 14 pass, 1 fixture failure (`createSheet` invocation); corrected run 15/15 pass.
- Growth expansion: 18 pass, 1 failure exposed shared-map mutation in the totals simulation. Fixed by constructing detached sheets and cloned name metadata; corrected 19/19 pass.
- Added a negative totals-growth test to prove rejected simulation preserves the entire workbook/history. Focused table/serialization/protection/fill-validation group: 12 files, 156 tests pass, including 20 calculated-column tests.
- Core typecheck initially reported one unused test binding; corrected Core typecheck passes. Package builds (Core, sheet-engine, XLSX I/O) pass.
- Existing formula reference/workbook-reference group: 2 files, 16 tests pass.
- Scoped lint initially reported one unnecessary spread fallback; removed and rechecked before publishing.
- Logs are retained locally in the recovery directory; these counts do not imply a full repository suite, GUI acceptance or CI success.

## Remaining work before completion

1. Template reference/anchor handling for structural row/column edits, moves, table/column/sheet renames, header toggles, sheet copy/delete, convert-to-range and all inverses. Non-uniform external reference transformations require proof or an explicit atomic refusal.
2. Web manual-input origin, native textarea/formula-bar paste tracking, validation warning continuation and an explicit whole-column apply UI with draft/failure retention.
3. Native XLSX `calculatedColumnFormula` read/write, bounded unsupported-formula diagnostics and producer-based checks.
4. Real Sheetcraft UI and WPS/Excel acceptance. No claim of native compatibility or automatic feature availability at this checkpoint.

## Recovery

Recovered the exact `3ca30d7e7d8333d01c5ff2cce5a0e3eb8df82d71` branch tree: 2,028 files, 16,616,456 bytes, each size and Git blob hash verified, including 51 binary artifacts. The local shallow commit object and tree were reconstructed and verified against GitHub; the original source worktree was clean. Frozen Bun dependencies and baseline package builds succeeded. See `docs/handoff/2026-10-10/RESUME.md` for previous accepted capabilities, known limitations and approved restoration paths.

Only source, synthetic regression code and this text record are included. No new raw GUI workbooks, screenshots, proprietary menu artwork or authentication state are included.
