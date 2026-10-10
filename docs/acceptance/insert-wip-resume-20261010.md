# Insert WIP resumption verification, 2026-10-10

This record closes the pending automated checks from the Git-only handoff. It
does not claim real WPS/Excel acceptance, native PivotChart support, full Web
suite success, whole-repository CI, or readiness to merge the UI branch.

## Source and recovery

- Authoritative repository: <https://github.com/arlo1012/sheetcraft>.
- Branch: `refactor/native-xlsx-20261009`.
- Starting remote commit: `05ed718435859589066e579ba8ba361fbc163365`.
- The old `drlo1012/sheetcraft` API returns a permanent redirect to repository
  ID `1411832894`; the new repository has that same ID and unchanged branch head.
- A new independent checkout was reconstructed through the authorized GitHub
  connector because CLI repository authentication was unavailable. All 1,793
  tracked blobs matched their Git blob SHA and byte size. The complete staged
  tree matched `d881dbee2394691fe0deba47816ffa93ad782c50` exactly.
- The handoff verifier passed all 60 checksummed handoff files and 22 source
  paths. This establishes byte preservation only.
- Bun `1.3.11`, Node `24.19.0`, and 398 packages were installed using the unchanged
  frozen Bun lockfile. No dependency versions or lockfile were changed.

## WIP test correction

The first complete Web typecheck found one diagnostic in
`existing-pivot-actions.test.ts`: `Workbook.protection` does not exist. Its
structure-protection scenario had assigned that unused field and therefore did
not actually enable workbook structure protection. The test now sets the
existing `Workbook.structureProtected = true` field. No production behavior was
changed in this checkpoint.

## Verified checks

- Core, sheet-engine, and XLSX package builds: passed.
- Pending reentrant `close` and `navigation` new-sheet guards: 2 passed,
  8 skipped in the focused run. The guards observe real synchronous navigation
  and captured dialog callbacks without replacing command behavior.
- Complete Web typecheck after the correction: passed, including both
  `vue-tsc -p tsconfig.app.json` and `tsc -p tsconfig.node.json`.
- Three complete files together (`insert-entrypoints`, `existing-pivot-actions`,
  `existing-pivot-workspace`): 59 tests passed, none skipped, one worker.
- Related Table/PivotTable/Chart directories plus complete Insert entrypoints:
  36 files, 467 tests passed, none skipped, one worker.
- Changed test formatting, scoped lint, and Git whitespace check: passed.

Run the related Web aggregate from `apps/web`:

```sh
bunx vitest run src/tests/modules/table-styles \
  src/tests/modules/pivot-tables src/tests/modules/charts \
  src/tests/app/SpreadsheetWorkspace/insert-entrypoints.test.ts --maxWorkers=1
```

The first guard invocation incorrectly selected the Web config from the repository
root and found no test files. It is retained as an unsuccessful invocation;
the corrected run used `apps/web` as its working directory. CLI timestamps use
the container's clock and remain unmodified.

## Remaining limits

- Architecture boundary check still fails with 125 existing diagnostics. This
  checkpoint does not alter or suppress them.
- Full Web tests, full Core/XLSX suites, worker checks, bundle checks, and aggregate
  CI were not rerun for this one-line test-only change.
- Earlier tests and GUI acceptance remain bound to their own source checkpoints
  and workbook bytes. They are not combined into a current all-green conclusion.
- Genuine WPS-authored linked PivotChart export, native `pivotSource` identity,
  refresh/save/reopen behavior, and native chart I/O remain pending. The existing
  native adapter still omits `sheet.drawings` and blocks drawing/media import.
- WPS Office was reinstalled separately; installation is not a compatibility
  acceptance result. No GUI acceptance was performed for this checkpoint.

Logs, including the initial type failure and unsuccessful guard invocation, are
in [the evidence directory](evidence/insert-wip-resume-20261010/).
