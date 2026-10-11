# Calculated columns: implementation checkpoint (2026-10-11)

Status: **WIP Core foundation and structural lifecycle**, not completion of the approved feature or GUI/native acceptance.

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

1. Web manual-input origin, native textarea/formula-bar paste tracking, validation warning continuation and an explicit whole-column apply UI with draft/failure retention.
2. Native XLSX `calculatedColumnFormula` read/write, bounded unsupported-formula diagnostics and producer-based checks.
3. Real Sheetcraft UI and WPS/Excel acceptance. No claim of native compatibility or automatic feature availability at this checkpoint.

## Structural lifecycle checkpoint

- Template identity follows sheet/table/column rename, sheet copy/delete and retained physical columns on resize. Deleted anchors rebase from the first surviving data member before references transform. Existing member exceptions are never regenerated during these operations.
- Header/totals shifts, resize, whole-axis insert/delete and supported contiguous row/column moves transform both the canonical source and materialized cell formulas. A bounded per-surviving-member comparison proves that one canonical family can still represent the transformed members.
- Inserted data rows inherit empty new calculated members only, with final scalar/data-validation/duplicate/protection/Pivot checks on detached state before committing. Accepted commands have exact Undo/Redo.
- Structured this-row arithmetic produces a runtime 1×1 projection; that is admitted as a scalar cell. Larger arrays remain rejected. Conversion of a referenced table fixes full-region A1 bounds in surviving templates while this-row references remain relative.
- Compound structural table changes are planned together and committed once. A second nested shift sees updated header/member geometry. Table transactions include defined names and both ordinary/Pivot style libraries, including their defaults.
- Nested table shifts enforce the existing PivotTable full-band guard. Qualified spill references rewrite the A1 anchor and retain the `#` suffix, including in scalar aggregate templates.
- A missing/undefined template does not force snapshot 45. Empty, malformed or non-string supplied template sources reject; the older version gate remains explicit.

### Deliberate Core bounds

- Direct cell shifts through calculated table data refuse; use a table operation or whole-axis edit. Existing split-table move guards remain in place.
- A transformation whose surviving member formulas cease to form one affine family refuses before workbook/history changes.
- External multi-row relative row references during row-axis changes, and external qualified calculated-column references during axis moves, conservatively refuse. Absolute references and tested column-axis transformations remain supported. No arbitrary cross-sheet move support is inferred.
- Planning is bounded by the existing 100,000-cell/member budget. This checkpoint does not add sorting UI, general array calculated columns or native formula admission rules.

### Structural evidence and retained failures

- Lifecycle first run: 3 pass/3 fail. Two structured 1×1 projections were incorrectly rejected; header changes also retained a stale canonical source. The projection fix exposed the remaining header failure, which was then fixed without changing ordinary fill semantics.
- Structural first run: 5 pass/6 fail. Missing insertion inheritance, self-qualified inverse validation and fixtures violating the pre-existing table-edge move guard were distinguished. Corrected contiguous fixtures preserve that guard; the first structural rerun passed 11/11.
- Expanded Core lifecycle: 43 calculated-column tests passed. A wider 19-file group passed 246 tests; four subsequent protocol boundary cases brought the then-current calculated-column count to 47.
- Independent static review identified five safety issues. Synthetic regressions reproduced all five: **24 pass/5 fail** across two files. The fixes cover compound rejection atomicity, Pivot style inverse retention, defined-name forward/inverse retention, nested Pivot guards and qualified spill-anchor rewriting.
- Final calculated-column rerun: **3 files, 53/53 pass**. Final wider related group: **21 files, 281/281 pass**, run with one worker. Core typecheck passes; scoped lint and diff whitespace checks pass. Core, sheet-engine and XLSX I/O package builds pass.
- Architecture check remains failed with the same **125 pre-existing diagnostic signatures** as the previous structured-table checkpoint, with zero added/removed after ignoring shifted line numbers. It is not a green architecture check.
- Reproduction/final-check text logs are retained with this checkpoint. They do not imply full repository/XLSX suites, GUI/native compatibility or successful CI.

## Recovery

Recovered the exact `3ca30d7e7d8333d01c5ff2cce5a0e3eb8df82d71` branch tree: 2,028 files, 16,616,456 bytes, each size and Git blob hash verified, including 51 binary artifacts. The local shallow commit object and tree were reconstructed and verified against GitHub; the original source worktree was clean. Frozen Bun dependencies and baseline package builds succeeded. See `docs/handoff/2026-10-10/RESUME.md` for previous accepted capabilities, known limitations and approved restoration paths.

Only source, synthetic regression code and this text record are included. No new raw GUI workbooks, screenshots, proprietary menu artwork or authentication state are included.
