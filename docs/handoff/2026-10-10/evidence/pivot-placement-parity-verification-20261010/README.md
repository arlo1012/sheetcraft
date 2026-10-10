# Pivot placement-default parity, 2026-10-10

## Scope

Offline, bounded Web creation-default alignment based on the retained independent WPS producer. Base checkpoint: `9aa114b4af0a8928732f6baa5016b7f89ee2fcbf`, branch `refactor/native-xlsx-20261009`, repository `historical-repository`. The slice is intentionally uncommitted and does not modify Core, XLSX IO, Workspace, documentation, or ribbon composition.

## Evidence

- `native-placement-evidence.json` records an actual ZIP/XML parse of `historical-artifacts/wps-insert-reference-20261010/native-pivot.xlsx`, hash `6f03fe0846ee7d1e408b185b21fa9e8f2dee68fd2d9d29899168dc9abb83d974`, 15045 bytes.
- The workbook identifies its producer as WPS Sheets. Retained native observations identify build 12.1.2.29182. The pivot-bearing worksheet is Sheet2, whose cells begin at A3; pivotTable1 location is A3:D8, cache source Table1, recordCount 6.
- This is the observed new-worksheet Table1 report placement in that build. It is not evidence that source/destination defaults are invariant across every WPS input state.
- Native PivotChart creation remains inconclusive after native control loss. This producer contains no chart parts. No GUI retry, visual acceptance, product-file reopen, or changed native chart export is claimed.

## Change and regression coverage

`usePivotActions.ts` shares an A3 anchor between new creation drafts and new-sheet confirmation. Existing destinations continue to resolve their exact addresses. Core commands and snapshots are unchanged.

`placement-default.test.ts` adds 14 scenarios covering PivotTable and PivotChart A3 creation, linked chart placement/range, field configuration, undo/redo, snapshot round-trip, real dialog new/existing destination toggles, explicit existing-sheet A1/absolute B7/unqualified E1, Cancel/reopen/stale confirm, preserved Core/V42 A1 reports, and structure-protected creation. Existing focused tests follow the report anchor or shift their output/overlay coordinates by two rows.

## Retained verification

- `placement-tests-initial.log`: first targeted run, 12/14 pass; both failures were an undefined-versus-empty-array test assertion, corrected without changing product behavior.
- `pivot-module-tests.log`: first serial module run, 274/276 pass; failures were stale grouped-output rows and overlay top expectations, corrected to match the two-row offset.
- `pivot-module-tests-final.log`: final serial PivotTable Web module run, 21 files / 276 tests passed.
- `static-checks.log`: scoped formatting, lint, and diff checks passed.
- `web-typecheck.log`: Web typecheck passed. No full-suite or heavyweight aggregate rerun was performed.
- `placement-default.patch` and `working-tree-manifest.json`: the 11 owned changed/new files, with SHA256 hashes. Concurrent chart/toolbar edits were observed at the end and excluded from this slice manifest/patch.

The existing repository document `docs/insert/table-backed-pivots.md` still describes the preceding A1 creation checkpoint. It is intentionally left untouched for the coordinator to reconcile when this isolated slice is accepted.
